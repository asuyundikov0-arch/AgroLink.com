import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { type ChemicalContainerReturn, getGetFieldDispatchQueueQueryKey, useCreateChemicalConsumption } from "@workspace/api-client-react";
import { dateFmt, errorInfo } from "../grain/shared";
import { ChemError, cmoney, cqty, useChemicalWorkflow, useInvalidateChemicals } from "./Workflow";
import { ExpectationsTable } from "./Expectations";

const ha = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v)} га`;

/** Legacy receipts accepted before immediate consumption; finalized by warehouse only. */
export function usePendingContainerReturns(enabled = true) {
  const flow = useChemicalWorkflow(enabled);
  return (flow.data?.containerReturns ?? []).filter((r) => r.consumptionId == null).length;
}

/** Dispatcher: read-only daily chemical expectations and confirmed consumption history. */
export default function ChemicalConsumptionSection(_props: { onSaved: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const data = flow.data;
  return <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-chemicals">
    <header><p className="eyebrow">Химия по дням · просмотр</p><h2 className="mt-1 text-lg font-bold">Расчёт расхода по вашей площади</h2><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Ожидаемый расход = площадь за день × норма. Склад принимает пустую тару и сразу списывает химию с подотчёта агронома на затраты поля. Подтверждать расход не нужно.</p></header>
    {flow.isLoading ? <div className="skeleton mt-4 h-40 rounded-xl" /> : flow.isError ? <div className="py-8 text-center text-xs text-destructive" role="alert">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div> : <>
      <div className="mt-4 rounded-lg border border-border"><ExpectationsTable data={data!} testId="table-dispatch-chem-expectations" /></div>
      <h3 className="mt-5 text-xs font-bold">Списанный расход</h3>
      <ConsumptionHistory data={data!} />
    </>}
  </section>;
}

function ConsumptionHistory({ data }: { data: NonNullable<ReturnType<typeof useChemicalWorkflow>["data"]> }) {
  const ops = new Map(data.operations.map((o) => [o.id, o]));
  const returns = new Map((data.containerReturns ?? []).map((r) => [r.id, r]));
  const recent = [...data.consumptions].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.id - a.id).slice(0, 40);
  if (recent.length === 0) return <p className="py-3 text-[11px] text-muted-foreground">Списаний пока нет.</p>;
  return <ul className="mt-2 divide-y divide-border" data-testid="list-dispatch-chem-consumptions">{recent.map((c) => { const o = ops.get(c.operationId); const r = c.containerReturnId != null ? returns.get(c.containerReturnId) : undefined; return <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs" data-testid={`row-dispatch-chem-consumption-${c.id}`}>
    <span><b>{dateFmt(c.reportDate)}</b> · {o ? `поле ${o.fieldNumber} · ${o.name}` : ""} · {c.name}<span className="block text-[10px] text-muted-foreground">{c.containerReturnId == null ? "прежняя запись · без тары" : r ? `тара ${r.containerCount} × ${cqty(r.containerVolume)} ${c.unit} · принял ${r.acceptedBy} ${dateFmt(r.returnedOn)}` : "по сданной таре"} · {c.confirmedBy}{c.notes ? ` · ${c.notes}` : ""}</span></span>
    <span className="font-mono">{cqty(c.quantity)} {c.unit} · {ha(c.dailyAreaHa)} · <b>{cmoney(c.amount)}</b></span>
  </li>; })}</ul>;
}

/** Warehouse (grain_manager / GD): finalize legacy receipts accepted before immediate write-off. */
export function LegacyReceipts({ onSaved }: { onSaved: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const data = flow.data;
  const ops = useMemo(() => new Map((data?.operations ?? []).map((o) => [o.id, o])), [data]);
  const cust = useMemo(() => new Map((data?.custody ?? []).map((c) => [c.issueId, c])), [data]);
  const pending = useMemo(() => (data?.containerReturns ?? []).filter((r) => r.consumptionId == null).sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.id - b.id), [data]);
  if (pending.length === 0) return null;
  return <div className="surface-card p-4" data-testid="section-chem-legacy-receipts">
    <h3 className="text-xs font-bold">Тара, принятая до автосписания ({pending.length})</h3>
    <p className="mt-0.5 text-[11px] text-muted-foreground">Старые приёмы тары без списания. Завершите их — химия спишется с подотчёта на поле.</p>
    <ul className="mt-2 space-y-2">{pending.map((r) => { const o = ops.get(r.operationId); const day = o?.days.find((d) => d.date.slice(0, 10) === r.reportDate.slice(0, 10) && d.dailyAreaHa > 0); return <PendingRow key={r.id} r={r} opLabel={o ? `Поле ${o.fieldNumber} · ${o.farm} · ${o.name}` : "Операция"} dayHa={day?.dailyAreaHa ?? null} name={cust.get(r.issueId)?.name ?? ""} unit={cust.get(r.issueId)?.unit ?? ""} agronomist={cust.get(r.issueId)?.requesterName ?? ""} onSaved={onSaved} />; })}</ul>
  </div>;
}

function PendingRow({ r, opLabel, dayHa, name, unit, agronomist, onSaved }: { r: ChemicalContainerReturn; opLabel: string; dayHa: number | null; name: string; unit: string; agronomist: string; onSaved: (msg: string) => void }) {
  const m = useCreateChemicalConsumption();
  const invalidate = useInvalidateChemicals();
  const qc = useQueryClient();
  // Stable UUID per receipt: retries after errors reuse it until the server accepts.
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const confirm = () => {
    setErr("");
    m.mutate({ data: { requestId, containerReturnId: r.id, notes: notes.trim() } }, {
      onSuccess: () => {
        setRequestId(crypto.randomUUID());
        void invalidate(); void qc.invalidateQueries({ queryKey: getGetFieldDispatchQueueQueryKey() });
        onSaved(`Расход ${cqty(r.quantity)} ${unit} «${name}» за ${dateFmt(r.reportDate)} списан на поле.`);
      },
      onError: (x) => { const i = errorInfo(x); setErr(i.status === 409 ? "Эта тара уже подтверждена или данные изменились. Список обновлён." : i.message); if (i.status === 409) void invalidate(); },
    });
  };
  return <li className="rounded-lg border border-border p-3 text-xs" data-testid={`row-dispatch-chem-return-${r.id}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-bold">{opLabel}</div>
        <div className="mt-0.5">{dateFmt(r.reportDate)} · {dayHa != null ? <span className="font-mono">{ha(dayHa)}</span> : <span className="font-semibold text-destructive">нет дневного факта</span>} · {name} · агроном {agronomist}</div>
        <div className="mt-0.5 text-[10.5px] text-muted-foreground">Тару принял {r.acceptedBy} {dateFmt(r.returnedOn)}{r.notes ? ` · ${r.notes}` : ""}</div>
      </div>
      <div className="text-right font-mono"><div>{r.containerCount} шт. × {cqty(r.containerVolume)} {unit}</div><div className="text-sm font-bold" data-testid={`text-dispatch-chem-return-qty-${r.id}`}>{cqty(r.quantity)} {unit}</div>{dayHa ? <div className="text-[10px] text-muted-foreground">{cqty(r.quantity / dayHa)} {unit}/га</div> : null}</div>
    </div>
    <div className="mt-2 flex flex-wrap gap-2">
      <input className="text-input !min-h-[32px] flex-1" maxLength={1000} placeholder="Примечание" value={notes} onChange={(e) => setNotes(e.target.value)} data-testid={`input-dispatch-chem-notes-${r.id}`} />
      <button type="button" className="button button-primary text-xs" disabled={m.isPending || dayHa == null} onClick={confirm} title={dayHa == null ? "Нужна площадь за этот день от диспетчера" : undefined} data-testid={`button-dispatch-chem-confirm-${r.id}`}><CheckCheck size={14} />{m.isPending ? "Списываем..." : err ? "Повторить" : "Списать на поле"}</button>
    </div>
    {dayHa == null && <p className="mt-1 text-[10.5px] text-muted-foreground">Списание станет доступно после внесения диспетчером площади по операции за {dateFmt(r.reportDate)}.</p>}
    {err && <div className="mt-2"><ChemError msg={err} /></div>}
  </li>;
}
