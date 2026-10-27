import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCheck, FlaskConical } from "lucide-react";
import { getGetFieldDispatchQueueQueryKey, useCreateChemicalConsumption } from "@workspace/api-client-react";
import { cx, dateFmt, errorInfo } from "../grain/shared";
import { ChemError, cmoney, cqty, parseQty, useChemicalWorkflow, useInvalidateChemicals, validQty } from "./Workflow";

const blank = () => ({ requestId: crypto.randomUUID(), issueId: "", reportDate: "", quantity: "", notes: "" });
const ha = (v: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(v)} га`;

/** Dispatcher: confirm actual daily chemical consumption from custody against real daily field facts. */
export default function ChemicalConsumptionSection({ onSaved }: { onSaved: (msg: string) => void }) {
  const flow = useChemicalWorkflow();
  const m = useCreateChemicalConsumption();
  const invalidate = useInvalidateChemicals();
  const qc = useQueryClient();
  const [f, setF] = useState(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [subErr, setSubErr] = useState("");
  const data = flow.data;
  const ops = useMemo(() => new Map((data?.operations ?? []).map((o) => [o.id, o])), [data]);
  const custody = useMemo(() => (data?.custody ?? []).filter((c) => c.remaining > 0), [data]);
  const sel = custody.find((c) => String(c.issueId) === f.issueId);
  const op = sel ? ops.get(sel.operationId) : undefined;
  const used = useMemo(() => new Set((data?.consumptions ?? []).filter((c) => String(c.issueId) === f.issueId).map((c) => c.reportDate.slice(0, 10))), [data, f.issueId]);
  const days = (op?.days ?? []).filter((d) => d.dailyAreaHa > 0);
  const day = days.find((d) => d.date.slice(0, 10) === f.reportDate);
  const amount = sel && validQty(f.quantity) && sel.remaining > 0 ? Math.round(sel.remainingAmount * 100 * parseQty(f.quantity) / sel.remaining) / 100 : 0;
  const recent = useMemo(() => [...(data?.consumptions ?? [])].sort((a, b) => b.reportDate.localeCompare(a.reportDate) || b.id - a.id).slice(0, 30), [data]);

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!sel) e.issueId = "Выберите выдачу на подотчёте";
    if (!day) e.reportDate = "Выберите день с фактической площадью";
    else if (used.has(f.reportDate)) e.reportDate = "За этот день расход по выдаче уже подтверждён";
    if (!validQty(f.quantity)) e.quantity = "Больше 0, до 3 знаков";
    else if (sel && parseQty(f.quantity) > sel.remaining) e.quantity = `На подотчёте ${cqty(sel.remaining)} ${sel.unit}`;
    setErrs(e); setSubErr("");
    if (Object.keys(e).length) return;
    m.mutate({ data: { requestId: f.requestId, issueId: Number(f.issueId), reportDate: f.reportDate, quantity: parseQty(f.quantity), notes: f.notes.trim() } }, {
      onSuccess: () => {
        const msg = `Расход ${cqty(parseQty(f.quantity))} ${sel!.unit} «${sel!.name}» за ${dateFmt(f.reportDate)} подтверждён и списан на поле.`;
        setF(blank()); void invalidate(); void qc.invalidateQueries({ queryKey: getGetFieldDispatchQueueQueryKey() }); onSaved(msg);
      },
      onError: (x) => { const i = errorInfo(x); setSubErr(i.status === 409 ? "Расход по этой выдаче за этот день уже подтверждён." : i.message); },
    });
  };

  return <section className="surface-card p-4 sm:p-5" data-testid="section-dispatch-chemicals">
    <header><p className="eyebrow">Ежедневный факт химобработки</p><h2 className="mt-1 text-lg font-bold">Подтверждение расхода химии с подотчёта</h2><p className="mt-1 max-w-3xl text-xs text-muted-foreground">Выберите выдачу агроному и фактический день работы из отчётов поля. Подтверждённое количество списывается с подотчёта на затраты поля; излишек остаётся у агронома.</p></header>
    {flow.isLoading ? <div className="skeleton mt-4 h-40 rounded-xl" /> : flow.isError ? <div className="py-8 text-center text-xs text-destructive" role="alert">{errorInfo(flow.error).message} <button type="button" className="font-bold underline" onClick={() => void flow.refetch()}>Повторить</button></div> : <>
      {custody.length === 0 ? <div className="mt-4 flex flex-col items-center py-8 text-center" data-testid="dispatch-chem-empty"><FlaskConical size={22} className="text-muted-foreground" /><p className="mt-2 text-sm font-semibold">Химии на подотчёте нет</p><p className="mt-1 text-xs text-muted-foreground">Выдачи по заявкам агрономов появятся здесь.</p></div> :
        <form onSubmit={submit} noValidate className="mt-4 grid gap-3 rounded-lg border border-border p-3 lg:grid-cols-2">
          <label className="form-label lg:col-span-2">Выдача на подотчёте
            <select className={cx("text-input mt-1", errs.issueId && "border-destructive")} value={f.issueId} onChange={(e) => setF({ ...f, issueId: e.target.value, reportDate: "" })} data-testid="select-dispatch-chem-issue">
              <option value="">Выберите выдачу</option>
              {custody.map((c) => { const o = ops.get(c.operationId); return <option key={c.issueId} value={c.issueId}>{c.requesterName} · {c.name} · ост. {cqty(c.remaining)} {c.unit} · {o ? `поле ${o.fieldNumber} · ${o.name}` : ""}</option>; })}
            </select>
            {errs.issueId && <span className="text-[10px] text-destructive">{errs.issueId}</span>}
          </label>
          <label className="form-label">Фактический день работы
            <select className={cx("text-input mt-1", errs.reportDate && "border-destructive")} value={f.reportDate} disabled={!sel} onChange={(e) => setF({ ...f, reportDate: e.target.value })} data-testid="select-dispatch-chem-day">
              <option value="">{!sel ? "Сначала выберите выдачу" : days.length ? "Выберите день" : "По операции нет дневных фактов"}</option>
              {days.map((d) => { const k = d.date.slice(0, 10); return <option key={k} value={k} disabled={used.has(k)}>{dateFmt(k)} · {ha(d.dailyAreaHa)}{used.has(k) ? " · уже подтверждено" : ""}</option>; })}
            </select>
            {errs.reportDate && <span className="text-[10px] text-destructive">{errs.reportDate}</span>}
          </label>
          <label className="form-label">Фактический расход{sel ? `, ${sel.unit}` : ""}
            <input className={cx("text-input mt-1 font-mono", errs.quantity && "border-destructive")} inputMode="decimal" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} data-testid="input-dispatch-chem-qty" />
            <span className="text-[10px] text-muted-foreground">{errs.quantity ? <span className="text-destructive">{errs.quantity}</span> : day && validQty(f.quantity) ? `${cqty(parseQty(f.quantity) / day.dailyAreaHa)} ${sel?.unit}/га · ${cmoney(amount)}` : "Только фактически внесённое за день"}</span>
          </label>
          <input className="text-input lg:col-span-2" maxLength={1000} placeholder="Примечание" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-dispatch-chem-notes" />
          <div className="lg:col-span-2"><ChemError msg={subErr} /></div>
          <div className="flex justify-end lg:col-span-2"><button type="submit" className="button button-primary text-xs" disabled={m.isPending} data-testid="button-dispatch-chem-confirm"><CheckCheck size={14} />{m.isPending ? "Подтверждаем..." : "Подтвердить расход"}</button></div>
        </form>}
      <h3 className="mt-5 text-xs font-bold">Подтверждённый расход</h3>
      {recent.length === 0 ? <p className="py-3 text-[11px] text-muted-foreground">Подтверждений пока нет.</p> : <ul className="mt-2 divide-y divide-border" data-testid="list-dispatch-chem-consumptions">{recent.map((c) => { const o = ops.get(c.operationId); return <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs" data-testid={`row-dispatch-chem-consumption-${c.id}`}>
        <span><b>{dateFmt(c.reportDate)}</b> · {o ? `поле ${o.fieldNumber} · ${o.name}` : ""} · {c.name}<span className="block text-[10px] text-muted-foreground">подтвердил {c.confirmedBy}{c.notes ? ` · ${c.notes}` : ""}</span></span>
        <span className="font-mono">{cqty(c.quantity)} {c.unit} · {ha(c.dailyAreaHa)} · <b>{cmoney(c.amount)}</b></span>
      </li>; })}</ul>}
    </>}
  </section>;
}
