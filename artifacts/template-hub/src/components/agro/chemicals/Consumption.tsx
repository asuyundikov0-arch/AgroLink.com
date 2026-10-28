import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FlaskConical } from "lucide-react";
import { type ChemicalContainerReturn, getGetFieldDispatchQueueQueryKey, useCreateChemicalConsumption } from "@workspace/api-client-react";
import { dateFmt, errorInfo } from "../grain/shared";
import { ChemError, cmoney, cqty, useChemicalWorkflow, useInvalidateChemicals } from "./Workflow";

const ha = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v)} га`;

/** Pending (not yet confirmed) empty container receipts; used for the dispatcher tab badge. */
export function usePendingContainerReturns(enabled = true) {
  const flow = useChemicalWorkflow(enabled);
  return (flow.data?.containerReturns ?? []).filter((r) => r.consumptionId == null).length;
}

/** Dispatcher: confirm chemical consumption only from empty containers accepted by the warehouse. */
export default function ChemicalConsumptionSection({ onSaved }: { onSaved: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const data = flow.data;
  const ops = useMemo(() => new Map((data?.operations ?? []).map((o) => [o.id, o])), [data]);
  const cust = useMemo(() => new Map((data?.custody ?? []).map((c) => [c.issueId, c])), [data]);
  const pending = useMemo(() => (data?.containerReturns ?? []).filter((r) => r.consumptionId == null).sort((a, b) => a.reportDate.localeCompare(b.reportDate) || a.id - b.id), [data]);
  const returns = useMemo(() => new Map((data?.containerReturns ?? []).map((r) => [r.id, r])), [data]);
  const recent = useMemo(() => [...(data?.consumptions ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.id - a.id).slice(0, 30), [data]);

  return <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-chemicals">
    <header><p className="eyebrow">Ежедневный факт химобработки</p><h2 className="mt-1 text-lg font-bold">Подтверждение расхода по пустой таре</h2><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Склад принимает от агронома пустую тару. Расход = число ёмкостей × объём тары, подтверждается целиком. Подтверждение возможно, когда по этому дню операции внесена фактическая площадь; после него химия списывается с подотчёта на затраты поля.</p></header>
    {flow.isLoading ? <div className="skeleton mt-4 h-40 rounded-xl" /> : flow.isError ? <div className="py-8 text-center text-xs text-destructive" role="alert">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div> : <>
      <h3 className="mt-4 text-xs font-bold" data-testid="text-dispatch-chem-pending-count">Тара от склада, ждёт подтверждения ({pending.length})</h3>
      {pending.length === 0 ? <div className="mt-2 flex flex-col items-center rounded-lg border border-dashed border-border py-8 text-center" data-testid="dispatch-chem-empty"><FlaskConical size={22} className="text-muted-foreground" /><p className="mt-2 text-sm font-semibold">Новой сданной тары нет</p><p className="mt-1 text-xs text-muted-foreground">Когда склад примет пустую тару от агронома, она появится здесь.</p></div> :
        <ul className="mt-2 space-y-2" data-testid="list-dispatch-chem-pending">{pending.map((r) => { const o = ops.get(r.operationId); const day = o?.days.find((d) => d.date.slice(0, 10) === r.reportDate.slice(0, 10) && d.dailyAreaHa > 0); return <PendingRow key={r.id} r={r} opLabel={o ? `Поле ${o.fieldNumber} · ${o.farm} · ${o.name}` : "Операция"} dayHa={day?.dailyAreaHa ?? null} name={cust.get(r.issueId)?.name ?? ""} unit={cust.get(r.issueId)?.unit ?? ""} agronomist={cust.get(r.issueId)?.requesterName ?? ""} onSaved={onSaved} />; })}</ul>}
      <h3 className="mt-5 text-xs font-bold">Подтверждённый расход</h3>
      {recent.length === 0 ? <p className="py-3 text-[11px] text-muted-foreground">Подтверждений пока нет.</p> : <ul className="mt-2 divide-y divide-border" data-testid="list-dispatch-chem-consumptions">{recent.map((c) => { const o = ops.get(c.operationId); const r = c.containerReturnId != null ? returns.get(c.containerReturnId) : undefined; return <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs" data-testid={`row-dispatch-chem-consumption-${c.id}`}>
        <span><b>{dateFmt(c.reportDate)}</b> · {o ? `поле ${o.fieldNumber} · ${o.name}` : ""} · {c.name}<span className="block text-[10px] text-muted-foreground">{c.containerReturnId == null ? "прежняя запись · без тары" : r ? `тара ${r.containerCount} × ${cqty(r.containerVolume)} ${c.unit} · принял ${r.acceptedBy} ${dateFmt(r.returnedOn)}` : "по сданной таре"} · подтвердил {c.confirmedBy}{c.notes ? ` · ${c.notes}` : ""}</span></span>
        <span className="font-mono">{cqty(c.quantity)} {c.unit} · {ha(c.dailyAreaHa)} · <b>{cmoney(c.amount)}</b></span>
      </li>; })}</ul>}
    </>}
  </section>;
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
        onSaved(`Расход ${cqty(r.quantity)} ${unit} «${name}» за ${dateFmt(r.reportDate)} подтверждён и списан на поле.`);
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
      <button type="button" className="button button-primary text-xs" disabled={m.isPending || dayHa == null} onClick={confirm} title={dayHa == null ? "Сначала внесите фактическую площадь за этот день" : undefined} data-testid={`button-dispatch-chem-confirm-${r.id}`}><CheckCheck size={14} />{m.isPending ? "Подтверждаем..." : err ? "Повторить" : "Подтвердить расход"}</button>
    </div>
    {dayHa == null && <p className="mt-1 text-[10.5px] text-muted-foreground">Подтверждение станет доступно после внесения дневного факта по операции за {dateFmt(r.reportDate)}.</p>}
    {err && <div className="mt-2"><ChemError msg={err} /></div>}
  </li>;
}
