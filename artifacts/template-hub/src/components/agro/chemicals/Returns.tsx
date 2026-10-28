import { type FormEvent, useState } from "react";
import { PackageCheck } from "lucide-react";
import { type ChemicalCustody, type ChemicalWork, type ChemicalWorkflow, useCreateChemicalContainerReturn } from "@workspace/api-client-react";
import { Drawer, Field, cx, dateFmt, errorInfo } from "../grain/shared";
import { businessToday } from "../../engineering/repairs/shared";
import { ChemError, cqty, useChemicalWorkflow, useInvalidateChemicals } from "./Workflow";

export const milli = (v: number) => Math.round(v * 1000);
/** Remaining in custody minus already accepted but unconfirmed empty containers. */
export const freeQty = (c: ChemicalCustody) => Math.max(0, milli(c.remaining) - milli(c.pendingReturnQuantity ?? 0)) / 1000;
export const maxContainers = (c: ChemicalCustody) => c.containerVolume ? Math.floor(milli(freeQty(c)) / milli(c.containerVolume)) : 0;
const opLabel = (o?: ChemicalWork) => o ? `Поле ${o.fieldNumber} · ${o.year} · ${o.name}` : "Операция";
const INT_RE = /^\d+$/;

const blank = (issueId: number) => ({ requestId: crypto.randomUUID(), issueId, reportDate: businessToday(), returnedOn: businessToday(), count: "", notes: "" });

/** Warehouse (grain_manager / GD): accept empty containers from agronomist custody. */
export function ContainerReturnDrawer({ custody, op, onClose, onDone }: { custody: ChemicalCustody; op?: ChemicalWork; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState(() => blank(custody.issueId));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [subErr, setSubErr] = useState("");
  const m = useCreateChemicalContainerReturn();
  const invalidate = useInvalidateChemicals();
  const today = businessToday();
  const issued = custody.occurredOn.slice(0, 10);
  const vol = custody.containerVolume ?? null;
  const max = maxContainers(custody);
  const count = INT_RE.test(f.count.trim()) ? Number(f.count) : 0;
  const quantity = vol ? (milli(vol) * count) / 1000 : 0;
  const day = op?.days.find((d) => d.date.slice(0, 10) === f.reportDate && d.dailyAreaHa > 0);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!vol) return;
    const e: Record<string, string> = {};
    if (!f.reportDate) e.reportDate = "Укажите рабочий день";
    else if (f.reportDate < issued) e.reportDate = `Не раньше выдачи ${dateFmt(issued)}`;
    else if (f.reportDate > today) e.reportDate = "Не позже сегодняшней даты";
    if (!f.returnedOn) e.returnedOn = "Укажите дату сдачи";
    else if (f.returnedOn < f.reportDate) e.returnedOn = "Не раньше рабочего дня";
    else if (f.returnedOn > today) e.returnedOn = "Не позже сегодняшней даты";
    if (!INT_RE.test(f.count.trim()) || count < 1) e.count = "Целое число больше 0";
    else if (count > max) e.count = `Не больше ${max} шт. по остатку на подотчёте`;
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, issueId: custody.issueId, reportDate: f.reportDate, returnedOn: f.returnedOn, containerCount: count, notes: f.notes.trim() } }, {
      onSuccess: () => { void invalidate(); onDone(`Принято ${count} пуст. тары по ${cqty(vol)} ${custody.unit} «${custody.name}» = ${cqty(quantity)} ${custody.unit}. Ожидает подтверждения диспетчером.`); },
      onError: (x) => setSubErr(errorInfo(x).message),
    });
  };

  return <Drawer title="Приём пустой тары" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-return" footer={<div className="flex justify-end gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-return-form" className="button button-primary" disabled={m.isPending || !vol || max < 1} data-testid="button-chem-return-submit">{m.isPending ? "Принимаем..." : "Принять тару"}</button></div>}>
    <form id="chem-return-form" onSubmit={submit} noValidate className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5" data-testid="text-chem-return-summary">
        <div className="font-bold">{custody.requesterName} · {custody.name}</div>
        <div>{opLabel(op)}{op ? ` · ${op.farm}` : ""} · выдано {dateFmt(issued)}</div>
        <div className="font-mono">На подотчёте {cqty(custody.remaining)} {custody.unit}{(custody.pendingReturnQuantity ?? 0) > 0 && ` · уже сдано тарой ${cqty(custody.pendingReturnQuantity ?? 0)} ${custody.unit} (${custody.pendingReturnCount ?? 0} шт.)`}</div>
        {vol && <div className="font-mono">Тара {cqty(vol)} {custody.unit} · можно принять до {max} шт.</div>}
      </div>
      {!vol ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] font-semibold text-destructive" role="alert" data-testid="status-chem-return-no-volume">Объём тары партии неизвестен. Укажите фасовку партии во вкладке «Остатки» (кнопка «Указать тару»), затем примите тару.</div> : <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Рабочий день (факт)" error={errs.reportDate} htmlFor="cr-report"><input id="cr-report" type="date" min={issued} max={today} className="text-input" value={f.reportDate} onChange={(e) => setF({ ...f, reportDate: e.target.value })} data-testid="input-chem-return-report-date" /></Field>
          <Field label="Дата сдачи тары" error={errs.returnedOn} htmlFor="cr-returned"><input id="cr-returned" type="date" min={f.reportDate || issued} max={today} className="text-input" value={f.returnedOn} onChange={(e) => setF({ ...f, returnedOn: e.target.value })} data-testid="input-chem-return-returned-on" /></Field>
        </div>
        <p className="text-[10.5px] text-muted-foreground" data-testid="text-chem-return-day">{day ? `По дню есть факт: ${cqty(day.dailyAreaHa)} га.` : "Дневного факта по операции за этот день пока нет. Тару можно принять, диспетчер подтвердит после внесения факта."}</p>
        <Field label="Пустых ёмкостей, шт." error={errs.count} htmlFor="cr-count"><input id="cr-count" inputMode="numeric" className="text-input font-mono" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} data-testid="input-chem-return-count" /></Field>
        <div className="rounded-lg border border-border px-3 py-2 font-mono text-xs" data-testid="text-chem-return-qty">{count} шт. × {cqty(vol)} {custody.unit} = <b>{cqty(quantity)} {custody.unit}</b></div>
        <Field label="Примечание" htmlFor="cr-notes"><textarea id="cr-notes" className="text-input min-h-16" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-chem-return-notes" /></Field>
      </>}
      <ChemError msg={subErr} />
    </form>
  </Drawer>;
}

/** History of accepted empty containers: waiting dispatcher vs confirmed. */
export function ContainerReturnHistory({ data, mineOnly }: { data: ChemicalWorkflow; mineOnly?: boolean }) {
  const ops = new Map(data.operations.map((o) => [o.id, o]));
  const cust = new Map(data.custody.map((c) => [c.issueId, c]));
  const rows = [...(data.containerReturns ?? [])].filter((r) => !mineOnly || cust.get(r.issueId)?.isMine).sort((a, b) => b.returnedOn.localeCompare(a.returnedOn) || b.id - a.id);
  if (rows.length === 0) return <div className="px-4 py-8 text-center text-xs text-muted-foreground" data-testid="table-chem-returns-empty">Пустую тару ещё не сдавали.</div>;
  return <div className="overflow-x-auto" data-testid="table-chem-returns"><table className="w-full min-w-[820px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><th className="px-3 py-2.5">Сдано / день</th><th className="px-3">Агроном · препарат</th><th className="px-3">Поле · операция</th><th className="px-3 text-right">Тара</th><th className="px-3">Принял</th><th className="px-3">Статус</th></tr></thead>
    <tbody className="divide-y divide-border/70">{rows.map((r) => { const c = cust.get(r.issueId); return <tr key={r.id} data-testid={`row-chem-return-${r.id}`}>
      <td className="px-3 py-2.5 font-mono">{dateFmt(r.returnedOn)}<div className="text-[10px] text-muted-foreground">за {dateFmt(r.reportDate)}</div></td>
      <td className="px-3"><div className="font-semibold">{c?.requesterName ?? "—"}</div><div className="text-[10px] text-muted-foreground">{c?.name ?? ""}</div></td>
      <td className="px-3">{opLabel(ops.get(r.operationId))}</td>
      <td className="px-3 text-right font-mono">{r.containerCount} × {cqty(r.containerVolume)} = <b>{cqty(r.quantity)} {c?.unit ?? ""}</b></td>
      <td className="px-3">{r.acceptedBy}{r.notes && <div className="text-[10px] text-muted-foreground">{r.notes}</div>}</td>
      <td className="px-3"><span className={cx("rounded-full px-2 py-0.5 text-[10px] font-bold", r.consumptionId == null ? "bg-[hsl(38_90%_90%)] text-[hsl(30_70%_30%)]" : "bg-[hsl(157_45%_92%)] text-[hsl(161_45%_26%)]")} data-testid={`status-chem-return-${r.id}`}>{r.consumptionId == null ? "Ждёт диспетчера" : "Подтверждено"}</span></td>
    </tr>; })}</tbody></table></div>;
}

/** Warehouse tab: custody rows with accept button + receipt history. */
export function WarehouseReturns({ canEdit, onDone }: { canEdit: boolean; onDone: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const [target, setTarget] = useState<ChemicalCustody | null>(null);
  if (flow.isLoading) return <div className="skeleton h-40 rounded-xl" />;
  if (flow.isError) return <div className="surface-card p-6 text-center text-xs text-destructive">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div>;
  const data = flow.data!;
  const ops = new Map(data.operations.map((o) => [o.id, o]));
  const rows = data.custody.filter((c) => c.remaining > 0).sort((a, b) => a.requesterName.localeCompare(b.requesterName, "ru"));
  return <div className="space-y-4">
    <div className="surface-card overflow-x-auto" data-testid="section-chem-return-accept">
      <div className="border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground">Расход химии подтверждается только по сданной пустой таре: количество = число ёмкостей × объём тары. Приём тары не меняет подотчёт и склад; списание на поле происходит после подтверждения диспетчером.</div>
      {rows.length === 0 ? <div className="px-4 py-8 text-center text-xs text-muted-foreground">Химии на подотчёте нет.</div> :
        <table className="w-full min-w-[820px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><th className="px-3 py-2.5">Агроном</th><th className="px-3">Поле · операция</th><th className="px-3">Препарат</th><th className="px-3 text-right">Остаток</th><th className="px-3 text-right">Сдано, ждёт</th><th className="px-3 text-right">Тара</th>{canEdit && <th />}</tr></thead>
          <tbody className="divide-y divide-border/70">{rows.map((c) => <tr key={c.issueId} data-testid={`row-chem-return-custody-${c.issueId}`}>
            <td className="px-3 py-2.5 font-bold">{c.requesterName}</td>
            <td className="px-3">{opLabel(ops.get(c.operationId))}</td>
            <td className="px-3 font-semibold">{c.name}</td>
            <td className="px-3 text-right font-mono">{cqty(c.remaining)} {c.unit}</td>
            <td className="px-3 text-right font-mono">{(c.pendingReturnQuantity ?? 0) > 0 ? `${cqty(c.pendingReturnQuantity ?? 0)} ${c.unit} · ${c.pendingReturnCount ?? 0} шт.` : "—"}</td>
            <td className="px-3 text-right font-mono">{c.containerVolume ? `${cqty(c.containerVolume)} ${c.unit} · до ${maxContainers(c)} шт.` : <span className="text-destructive">не указана</span>}</td>
            {canEdit && <td className="px-3 text-right"><button type="button" className="button button-ghost !min-h-[30px] !px-2 text-[11px]" onClick={() => setTarget(c)} data-testid={`button-chem-return-open-${c.issueId}`}><PackageCheck size={12} />Принять тару</button></td>}
          </tr>)}</tbody></table>}
    </div>
    <div className="surface-card"><div className="border-b border-border px-4 py-2.5 text-xs font-bold">Журнал сданной тары</div><ContainerReturnHistory data={data} /></div>
    {canEdit && target && <ContainerReturnDrawer custody={target} op={ops.get(target.operationId)} onClose={() => setTarget(null)} onDone={(msg) => { setTarget(null); onDone(msg); }} />}
  </div>;
}
