import { type FormEvent, useState } from "react";
import { FlaskConical, Send, UserRound } from "lucide-react";
import { type ChemicalRequest, type ChemicalWork, getGetChemicalWarehouseQueryKey, useCreateChemicalIssue, useGetChemicalWarehouse } from "@workspace/api-client-react";
import { Drawer, Field, POLL_MS, cx, dateFmt, errorInfo } from "../grain/shared";
import { ContainerReturnHistory, freeQty, milli } from "./Returns";
import { businessToday } from "../../engineering/repairs/shared";
import { ChemError, cmoney, cqty, parseQty, useChemicalWorkflow, useInvalidateChemicals, validQty } from "./Workflow";

const opLabel = (o?: ChemicalWork) => o ? `Поле ${o.fieldNumber} · ${o.year} · ${o.name}` : "Операция";

/** Warehouse: open agronomist requests awaiting issue; grain_manager / GD fulfil them. */
export function WarehouseRequests({ canEdit, onDone }: { canEdit: boolean; onDone: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const [target, setTarget] = useState<ChemicalRequest | null>(null);
  if (flow.isLoading) return <div className="skeleton h-40 rounded-xl" />;
  if (flow.isError) return <div className="surface-card p-6 text-center text-xs text-destructive">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div>;
  const ops = new Map(flow.data!.operations.map((o) => [o.id, o]));
  const open = flow.data!.requests.filter((r) => r.issuedQuantity < r.quantity).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return <div className="surface-card overflow-x-auto" data-testid="table-chem-requests">
    <div className="border-b border-border px-4 py-2.5 text-[11px] text-muted-foreground">Выдача только по заявке агронома на плановую химобработку. Выданное числится за агрономом до подтверждения диспетчером дневного расхода; затраты поля возникают только после подтверждения.</div>
    {open.length === 0 ? <div className="empty-state px-4 py-10"><div className="empty-icon"><FlaskConical size={18} /></div><h3 className="mt-3 text-sm font-bold">Открытых заявок нет</h3><p className="mt-1 max-w-sm text-center text-xs text-muted-foreground">Агроном создаёт заявку в фактических работах по плановой химобработке поля.</p></div> :
      <table className="w-full min-w-[820px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><th className="px-3 py-2.5">Дата заявки</th><th className="px-3">Агроном</th><th className="px-3">Операция</th><th className="px-3">Препарат</th><th className="px-3 text-right">Заявлено / выдано</th>{canEdit && <th />}</tr></thead>
        <tbody className="divide-y divide-border/70">{open.map((r) => <tr key={r.id} data-testid={`row-chem-request-${r.id}`}>
          <td className="px-3 py-2.5 font-mono">{dateFmt(r.createdAt)}</td>
          <td className="px-3 font-semibold">{r.requesterName}</td>
          <td className="px-3">{opLabel(ops.get(r.operationId))}{r.notes && <div className="text-[10px] text-muted-foreground">{r.notes}</div>}</td>
          <td className="px-3 font-bold">{r.name}</td>
          <td className="px-3 text-right font-mono">{cqty(r.quantity)} / {cqty(r.issuedQuantity)} {r.unit}</td>
          {canEdit && <td className="px-3 text-right"><button type="button" className="button button-ghost !min-h-[30px] !px-2 text-[11px]" onClick={() => setTarget(r)} data-testid={`button-chem-fulfil-${r.id}`}><Send size={12} />Выдать</button></td>}
        </tr>)}</tbody></table>}
    {canEdit && target && <FulfilDrawer req={target} op={ops.get(target.operationId)} onClose={() => setTarget(null)} onDone={() => { setTarget(null); onDone(`Выдано агроному ${target.requesterName}. Остаток склада уменьшен, химия числится на подотчёте.`); }} />}
  </div>;
}

const newIssue = (rest: number) => ({ requestId: crypto.randomUUID(), quantity: rest > 0 ? String(rest) : "", occurredOn: businessToday(), notes: "" });

function FulfilDrawer({ req, op, onClose, onDone }: { req: ChemicalRequest; op?: ChemicalWork; onClose: () => void; onDone: () => void }) {
  const rest = Math.round((req.quantity - req.issuedQuantity) * 1000) / 1000;
  const [f, setF] = useState(() => newIssue(rest));
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [subErr, setSubErr] = useState("");
  const m = useCreateChemicalIssue();
  const invalidate = useInvalidateChemicals();
  const today = businessToday();
  const wh = useGetChemicalWarehouse({ query: { queryKey: getGetChemicalWarehouseQueryKey(), refetchInterval: POLL_MS } });
  const vol = wh.data?.batches.find((b) => b.id === req.batchId)?.containerVolume ?? null;
  const volM = vol ? milli(vol) : 0;
  const qM = validQty(f.quantity) ? milli(parseQty(f.quantity)) : 0;
  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!validQty(f.quantity)) e.quantity = "Больше 0, до 3 знаков";
    else if (parseQty(f.quantity) > rest) e.quantity = `По заявке осталось выдать ${cqty(rest)} ${req.unit}`;
    else if (volM && qM % volM !== 0) e.quantity = `Только целыми ёмкостями по ${cqty(vol!)} ${req.unit}`;
    if (!f.occurredOn) e.occurredOn = "Укажите дату"; else if (f.occurredOn > today) e.occurredOn = "Не позже сегодняшней даты";
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, chemicalRequestId: req.id, quantity: parseQty(f.quantity), occurredOn: f.occurredOn, notes: f.notes.trim() } }, {
      onSuccess: () => { setF(newIssue(0)); void invalidate(); onDone(); },
      onError: (x) => setSubErr(errorInfo(x).message),
    });
  };
  return <Drawer title="Выдача по заявке" eyebrow="Склад химии" onClose={onClose} testId="drawer-chem-fulfil" footer={<div className="flex justify-end gap-2"><button type="button" className="button button-ghost" onClick={onClose}>Отмена</button><button type="submit" form="chem-fulfil-form" className="button button-primary" disabled={m.isPending} data-testid="button-chem-fulfil-submit">{m.isPending ? "Выдаём..." : "Выдать агроному"}</button></div>}>
    <form id="chem-fulfil-form" onSubmit={submit} noValidate className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5" data-testid="text-chem-fulfil-summary">
        <div className="flex items-center gap-1.5 font-bold"><UserRound size={13} />Получатель: {req.requesterName}</div>
        <div>{opLabel(op)}{op ? ` · ${op.farm}` : ""}</div>
        <div className="font-mono">{req.name} · заявлено {cqty(req.quantity)} {req.unit} · выдано {cqty(req.issuedQuantity)}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={`Количество, ${req.unit}`} error={errs.quantity} htmlFor="cf-qty"><input id="cf-qty" className="text-input font-mono" inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} data-testid="input-chem-fulfil-qty" />
          <span className="text-[10px] text-muted-foreground" data-testid="text-chem-fulfil-containers">{vol ? (qM && qM % volM === 0 ? `${qM / volM} шт. × ${cqty(vol)} ${req.unit}` : `Кратно таре ${cqty(vol)} ${req.unit}`) : "Фасовка партии не указана"}</span></Field>
        <Field label="Дата выдачи" error={errs.occurredOn} htmlFor="cf-date"><input id="cf-date" type="date" max={today} className="text-input" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} data-testid="input-chem-fulfil-date" /></Field>
      </div>
      <Field label="Примечание" htmlFor="cf-notes"><textarea id="cf-notes" className="text-input min-h-20" maxLength={1000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-chem-fulfil-notes" /></Field>
      <ChemError msg={subErr} />
    </form>
  </Drawer>;
}

/** Outstanding custody list. Warehouse shows all in red; cabinet uses mineOnly via isMine flag. */
export function CustodyList({ mineOnly, testId }: { mineOnly?: boolean; testId: string }) {
  const flow = useChemicalWorkflow();
  if (flow.isLoading) return <div className="skeleton h-32 rounded-xl" />;
  if (flow.isError) return <div className="p-4 text-center text-xs text-destructive">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div>;
  const ops = new Map(flow.data!.operations.map((o) => [o.id, o]));
  const rows = flow.data!.custody.filter((c) => c.remaining > 0 && (!mineOnly || c.isMine)).sort((a, b) => a.requesterName.localeCompare(b.requesterName, "ru") || b.occurredOn.localeCompare(a.occurredOn));
  const total = rows.reduce((a, c) => a + c.remainingAmount, 0);
  if (rows.length === 0) return <div className="px-4 py-8 text-center text-xs text-muted-foreground" data-testid={`${testId}-empty`}>{mineOnly ? "На вашем подотчёте химии нет." : "Невозвращённой и неподтверждённой химии на подотчёте нет."}</div>;
  return <div className="overflow-x-auto" data-testid={testId}>
    <table className="w-full min-w-[760px] text-xs"><thead><tr className="border-b border-border text-left text-[10px] uppercase tracking-[.1em] text-muted-foreground"><th className="px-3 py-2.5">Выдано</th>{!mineOnly && <th className="px-3">Агроном</th>}<th className="px-3">Поле · операция</th><th className="px-3">Препарат</th><th className="px-3 text-right">Выдано</th><th className="px-3 text-right">Остаток</th><th className="px-3 text-right">Сдано тарой</th><th className="px-3 text-right">Сумма</th></tr></thead>
      <tbody className="divide-y divide-border/70">{rows.map((c) => <tr key={c.issueId} className={cx(!mineOnly && "bg-destructive/5 text-destructive")} data-testid={`row-chem-custody-${c.issueId}`}>
        <td className="px-3 py-2.5 font-mono">{dateFmt(c.occurredOn)}</td>
        {!mineOnly && <td className="px-3 font-bold" data-testid={`text-chem-custody-holder-${c.issueId}`}>{c.requesterName}</td>}
        <td className="px-3">{opLabel(ops.get(c.operationId))}</td>
        <td className="px-3 font-semibold">{c.name}</td>
        <td className="px-3 text-right font-mono">{cqty(c.quantity)} {c.unit}</td>
        <td className="px-3 text-right font-mono font-bold">{cqty(c.remaining)} {c.unit}</td>
        <td className="px-3 text-right font-mono" data-testid={`text-chem-custody-pending-${c.issueId}`}>{(c.pendingReturnQuantity ?? 0) > 0 ? <>{cqty(c.pendingReturnQuantity ?? 0)} {c.unit}<div className="text-[10px] font-normal">{c.pendingReturnCount ?? 0} шт. · ждёт диспетчера · своб. {cqty(freeQty(c))}</div></> : "—"}</td>
        <td className="px-3 text-right font-mono font-bold">{cmoney(c.remainingAmount)}</td>
      </tr>)}</tbody>
      <tfoot><tr className={cx("border-t border-border font-bold", !mineOnly && "text-destructive")}><td className="px-3 py-2.5" colSpan={mineOnly ? 6 : 7}>Итого на подотчёте</td><td className="px-3 text-right font-mono" data-testid={`${testId}-total`}>{cmoney(total)}</td></tr></tfoot>
    </table>
  </div>;
}

/** Personal cabinet card: own chemical custody balance (GD sees everybody). */
export function ChemicalBalanceCard({ seeAll }: { seeAll: boolean }) {
  return <section className="surface-card mb-7 overflow-hidden" data-testid="cabinet-chem-balance">
    <div className="flex items-center gap-3 border-b border-border bg-muted/25 px-5 py-4"><div className="setting-icon"><FlaskConical size={17} /></div><div><p className="eyebrow">Подотчёт</p><h2 className="mt-1 font-display text-xl font-bold tracking-[-0.04em]">{seeAll ? "Химия на подотчёте агрономов" : "Моя химия на подотчёте"}</h2></div></div>
    <CustodyList mineOnly={!seeAll} testId="table-cabinet-chem-custody" />
    <CabinetReturns mineOnly={!seeAll} />
  </section>;
}

function CabinetReturns({ mineOnly }: { mineOnly: boolean }) {
  const flow = useChemicalWorkflow();
  if (!flow.data) return null;
  return <div className="border-t border-border"><div className="px-5 py-2.5 text-xs font-bold">Сданная пустая тара</div><ContainerReturnHistory data={flow.data} mineOnly={mineOnly} /></div>;
}
