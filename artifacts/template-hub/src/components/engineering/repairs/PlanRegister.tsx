import { type FormEvent, useState } from "react";
import { Activity, CalendarClock, Pencil, Plus, Trash2 } from "lucide-react";
import { type FleetEquipment, type RepairEntry, useDeleteEngineeringRepair, useUpdateEngineeringRepair } from "@workspace/api-client-react";
import PlanBatchDrawer from "./PlanBatchDrawer";
import { CONFLICT_TEXT, ConfirmDialog, Drawer, Field, OverlayForm, SaveError, cx, dateFmt, effReadiness, errorInfo, isDirector, money, num, statusMeta, useInvalidateRepairs } from "./shared";

type Mode = "plan" | "progress";
type Form = { responsible: string; plannedStart: string; plannedEnd: string; notes: string; actualStart: string; actualEnd: string; readiness: string };
const s = (v: string | number | null) => (v === null ? "" : String(v));

function ReadinessBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-xs text-muted-foreground">не указана</span>;
  return (
    <div className="flex min-w-[110px] items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
        <div className="h-full origin-left rounded-full bg-[#61A9BD] transition-transform duration-500" style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <span className="w-9 text-right font-mono text-[11px] font-bold">{num(value)}%</span>
    </div>
  );
}

export default function PlanRegister({ role, items, fleetById, available, costByFleet }: { role: string; items: RepairEntry[]; fleetById: Map<number, FleetEquipment>; available: FleetEquipment[]; costByFleet: Map<number, { total: number; capital: number; current: number }> }) {
  const canDelete = isDirector(role);
  const canEditPlan = role === "chief_engineer" || isDirector(role);
  const canEditProgress = role === "engineer" || isDirector(role);
  const invalidate = useInvalidateRepairs();
  const update = useUpdateEngineeringRepair();
  const remove = useDeleteEngineeringRepair();
  const [batchOpen, setBatchOpen] = useState(false);
  const [edit, setEdit] = useState<{ entry: RepairEntry; mode: Mode } | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [toDelete, setToDelete] = useState<RepairEntry | null>(null);
  const [delError, setDelError] = useState("");
  const [notice, setNotice] = useState("");

  const name = (e: RepairEntry) => { const f = fleetById.get(e.fleetId); return f ? f.kind : e.equipment; };
  const reg = (e: RepairEntry) => fleetById.get(e.fleetId)?.registrationNumber ?? e.registrationNumber;

  const open = (entry: RepairEntry, mode: Mode) => {
    setEdit({ entry, mode });
    setForm({ responsible: entry.responsible, plannedStart: s(entry.plannedStart), plannedEnd: s(entry.plannedEnd), notes: entry.notes, actualStart: s(entry.actualStart), actualEnd: s(entry.actualEnd), readiness: s(entry.readiness) });
    setErrors({}); setSaveError(""); setConflict(false);
  };
  const setF = (k: keyof Form, v: string) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!edit || !form || conflict) return;
    const e = edit.entry; const errs: typeof errors = {};
    let readiness: number | null = e.readiness;
    if (edit.mode === "plan") {
      if (!form.responsible.trim()) errs.responsible = "Укажите ответственного";
      if (form.plannedStart && form.plannedEnd && form.plannedEnd < form.plannedStart) errs.plannedEnd = "Раньше планового начала";
    } else {
      const t = form.readiness.replace(",", ".").trim();
      readiness = t === "" ? null : Number(t);
      if (readiness !== null && (!Number.isFinite(readiness) || readiness < 0 || readiness > 100)) errs.readiness = "Число от 0 до 100";
      if (form.actualEnd && !form.actualStart) errs.actualEnd = "Сначала укажите фактическое начало";
      if (form.actualStart && form.actualEnd && form.actualEnd < form.actualStart) errs.actualEnd = "Раньше фактического начала";
    }
    setErrors(errs); setSaveError("");
    if (Object.keys(errs).length) return;
    const plan = edit.mode === "plan";
    const data = {
      fleetId: e.fleetId, version: e.version,
      responsible: plan ? form.responsible.trim() : e.responsible,
      plannedStart: plan ? form.plannedStart || null : e.plannedStart,
      plannedEnd: plan ? form.plannedEnd || null : e.plannedEnd,
      notes: plan ? form.notes : e.notes,
      actualStart: plan ? e.actualStart : form.actualStart || null,
      actualEnd: plan ? e.actualEnd : form.actualEnd || null,
      readiness,
    };
    try {
      await update.mutateAsync({ id: e.id, data });
      await invalidate();
      setNotice(`${plan ? "План" : "Ход ремонта"} по «${name(e)}» сохранён.`); setEdit(null);
    } catch (err) {
      const info = errorInfo(err);
      if (info.status === 409) { setConflict(true); setSaveError(CONFLICT_TEXT); } else setSaveError(info.message);
    }
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDelError("");
    try { await remove.mutateAsync({ id: toDelete.id }); await invalidate(); setNotice(`«${name(toDelete)}» убрана из плана. Карточка техники и затраты сохранены.`); setToDelete(null); }
    catch (err) { setDelError(errorInfo(err).message); }
  };

  return (
    <section className="surface-card overflow-hidden" data-testid="section-plan">
      <div className="flex flex-col gap-2 border-b border-border bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div><h2 className="text-sm font-bold">Общий план ремонта</h2><p className="text-[11px] text-muted-foreground">Плановые даты — для каждой машины. Затраты считаются из журнала затрат.</p></div>
        <div className="flex items-center gap-2"><span className="meta-chip">{items.length} в плане</span>
          {canEditPlan && <button type="button" className="button button-primary" onClick={() => setBatchOpen(true)} data-testid="button-open-plan-batch"><Plus size={14} />Добавить в план</button>}</div>
      </div>
      {notice && <div className="notice-banner m-4" role="status" data-testid="text-plan-notice">{notice}</div>}
      {items.length === 0 ? (
        <div className="empty-state" data-testid="status-plan-empty"><div className="empty-icon"><CalendarClock size={20} /></div>
          <h3 className="mt-4 text-sm font-bold">В плане пока нет техники</h3>
          <p className="mt-1 max-w-sm text-center text-xs leading-5 text-muted-foreground">Отметьте сразу несколько машин из справочника и задайте каждой ответственного и плановые даты.</p>
          {canEditPlan && <button type="button" className="button button-primary mt-4" onClick={() => setBatchOpen(true)} data-testid="button-open-plan-batch-empty"><Plus size={14} />Добавить в план</button>}</div>
      ) : (
        <ul className="divide-y divide-border/70">
          {items.map((e) => {
            const c = costByFleet.get(e.fleetId); const m = statusMeta[e.status];
            return (
              <li key={e.id} className="grid gap-3 px-4 py-3.5 sm:px-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_140px_minmax(0,1fr)_auto] lg:items-center" data-testid={`row-plan-${e.id}`}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold">{name(e)}</h3>
                    <span className={cx("rounded-full px-2 py-1 text-[10px] font-bold", m.cls)} data-testid={`status-plan-${e.id}`}>{m.label}{e.status === "overdue" && e.overdueDays > 0 ? ` · ${e.overdueDays} дн.` : ""}</span></div>
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground"><span className="font-mono">{reg(e) ?? "без госномера"}</span> · {e.responsible} · {fleetById.get(e.fleetId)?.unit ?? e.unit}</p>
                </div>
                <div className="grid grid-cols-[auto_1fr] gap-x-3 font-mono text-[10.5px] leading-5">
                  <span className="text-muted-foreground">План</span><span>{dateFmt(e.plannedStart)} – {dateFmt(e.plannedEnd)}</span>
                  <span className="text-muted-foreground">Факт</span><span>{dateFmt(e.actualStart)} – {dateFmt(e.actualEnd)}</span>
                  <span className="text-muted-foreground">Откл.</span><span className={cx(e.deviationDays !== null && e.deviationDays > 0 && "text-destructive")}>{e.deviationDays === null ? "—" : `${e.deviationDays > 0 ? "+" : ""}${e.deviationDays} дн.${e.deviationPercent !== null ? ` (${num(e.deviationPercent)}%)` : ""}`}</span>
                </div>
                <ReadinessBar value={effReadiness(e)} label={`Готовность ${name(e)}`} />
                <div className="text-[11px]" data-testid={`text-plan-cost-${e.id}`}>
                  <p className="font-mono text-sm font-bold">{c ? money(c.total) : <span className="font-sans text-xs font-semibold text-muted-foreground">затрат нет</span>}</p>
                  {c && <p className="text-muted-foreground">тек. {money(c.current)} · кап. {money(c.capital)}</p>}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {canEditPlan && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5 text-[11px]" onClick={() => open(e, "plan")} aria-label={`Изменить план ${name(e)}`} data-testid={`button-edit-plan-${e.id}`}><Pencil size={13} />План</button>}
                  {canEditProgress && <button type="button" className="button button-secondary !min-h-[32px] !px-2.5 text-[11px]" onClick={() => open(e, "progress")} aria-label={`Отметить ход ремонта ${name(e)}`} data-testid={`button-edit-progress-${e.id}`}><Activity size={13} />Факт</button>}
                  {canDelete && <button type="button" className="button button-danger border !min-h-[32px] !px-2.5" onClick={() => { setDelError(""); setToDelete(e); }} aria-label={`Убрать из плана ${name(e)}`} data-testid={`button-delete-plan-${e.id}`}><Trash2 size={13} /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {batchOpen && canEditPlan && <PlanBatchDrawer available={available} onClose={() => setBatchOpen(false)} onDone={(n) => { setBatchOpen(false); setNotice(`В план добавлено единиц техники: ${n}.`); }} />}

      {edit && form && (
        <OverlayForm onSubmit={submit} noValidate>
          <Drawer title={edit.mode === "plan" ? "Плановые параметры" : "Фактический ход ремонта"} eyebrow={`${name(edit.entry)} · ${reg(edit.entry) ?? "без госномера"} · версия ${edit.entry.version}`} onClose={() => !update.isPending && setEdit(null)} testId={edit.mode === "plan" ? "form-plan-edit" : "form-plan-progress"}
            footer={<><button type="button" className="button button-ghost" onClick={() => setEdit(null)} disabled={update.isPending} data-testid="button-cancel-plan-edit">Отмена</button>
              <button type="submit" className="button button-primary" disabled={update.isPending || conflict} data-testid="button-save-plan-edit">{update.isPending ? "Сохраняем..." : "Сохранить"}</button></>}>
            <SaveError message={saveError} conflict={conflict} testId="text-plan-save-error" />
            {edit.mode === "plan" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ответственный *" error={errors.responsible} htmlFor="pl-resp" wide><input id="pl-resp" className="text-input" maxLength={200} value={form.responsible} onChange={(ev) => setF("responsible", ev.target.value)} data-testid="input-plan-responsible" /></Field>
                <Field label="Плановое начало" htmlFor="pl-ps"><input id="pl-ps" type="date" className="text-input" value={form.plannedStart} onChange={(ev) => setF("plannedStart", ev.target.value)} data-testid="input-plan-planned-start" /></Field>
                <Field label="Плановое окончание" error={errors.plannedEnd} htmlFor="pl-pe"><input id="pl-pe" type="date" className="text-input" value={form.plannedEnd} onChange={(ev) => setF("plannedEnd", ev.target.value)} data-testid="input-plan-planned-end" /></Field>
                <Field label="Примечания" htmlFor="pl-notes" wide><textarea id="pl-notes" className="text-input min-h-[80px]" maxLength={3000} value={form.notes} onChange={(ev) => setF("notes", ev.target.value)} data-testid="input-plan-notes" /></Field>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Фактическое начало" htmlFor="pl-as"><input id="pl-as" type="date" className="text-input" value={form.actualStart} onChange={(ev) => setF("actualStart", ev.target.value)} data-testid="input-plan-actual-start" /></Field>
                <Field label="Фактическое окончание" error={errors.actualEnd} htmlFor="pl-ae"><input id="pl-ae" type="date" className="text-input" value={form.actualEnd} onChange={(ev) => setF("actualEnd", ev.target.value)} data-testid="input-plan-actual-end" /></Field>
                <Field label="Готовность, %" error={errors.readiness} hint={form.actualEnd ? "С фактическим окончанием готовность считается 100%" : "Пусто — не указана"} htmlFor="pl-ready"><input id="pl-ready" className="text-input" inputMode="decimal" value={form.readiness} onChange={(ev) => setF("readiness", ev.target.value)} data-testid="input-plan-readiness" /></Field>
                <p className="self-end text-[11px] leading-5 text-muted-foreground">План: {dateFmt(edit.entry.plannedStart)} – {dateFmt(edit.entry.plannedEnd)}</p>
              </div>
            )}
          </Drawer>
        </OverlayForm>
      )}

      {toDelete && <ConfirmDialog title="Убрать технику из плана?" testId="dialog-delete-plan" error={delError} pending={remove.isPending}
        body={<>«{name(toDelete)}» будет удалена из общего плана вместе с датами и готовностью. Карточка в справочнике и все записи журнала затрат сохранятся и продолжат учитываться в итогах.</>}
        onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </section>
  );
}
