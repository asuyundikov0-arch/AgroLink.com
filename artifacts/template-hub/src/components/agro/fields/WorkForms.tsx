import { type FormEvent, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Lock, RotateCcw } from "lucide-react";
import {
  type FieldLifecycleInputAction,
  type FieldOperation,
  type FieldProgressReport,
  type FleetEquipment,
  getGetChemicalWarehouseQueryKey,
  getGetChemicalWorkflowQueryKey,
  getGetDailySeedingReportQueryKey,
  getGetFieldDashboardQueryKey,
  getGetFieldDispatchQueueQueryKey,
  getListPayrollAccrualsQueryKey,
  useCreateFieldOperationProgress,
  useTransitionFieldOperation,
  useUpdateFieldOperationActual,
  useUpdateFieldOperationProgress,
} from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";
import { ActualFuelField, ActualRateField, AgronomyActualFuelField } from "./ActualCostFields";
import { SupportingWorksEditor, SupportingWorksSummary, type SupportRow, supportPlanOf, supportRowsFrom } from "./SupportingWorksEditor";
import { SeedPlanSummary, isSowing, seedTotal } from "./SeedPlanEditor";
import { Drawer, Field, SaveError, dateFmt, ha, handleSaveError, haStr, parseHa } from "./shared";
import { useChemicalWorkflow } from "../chemicals/Workflow";

/** Latest date (YYYY-MM-DD) with confirmed chemical consumption for the operation. */
export function latestChemDate(cons: { operationId: number; reportDate: string }[], opId: number): string | null {
  let m: string | null = null;
  for (const c of cons) if (c.operationId === opId) { const d = c.reportDate.slice(0, 10); if (!m || d > m) m = d; }
  return m;
}

export const eqLabel = (x: FleetEquipment) => `${x.kind} · ${x.registrationNumber || "без госномера"}`;
export const limitOf = (op: FieldOperation) => (op.actualAreaLimitHa > 0 ? op.actualAreaLimitHa : op.plannedAreaHa);
export const approvalOf = (op: FieldOperation) => op.approvalStatus ?? "approved";
export const isPendingCompletion = (op: FieldOperation) => op.status === "in_progress" && !!op.completionRequestedOn;
export const isPendingUnplanned = (op: FieldOperation) => op.isUnplanned && !op.actualStart && approvalOf(op) === "pending" && op.status !== "cancelled";
export const chemNormsMissing = (op: FieldOperation) => !!op.requiresChemicals && !(op.chemicalPlan?.length);

/** Invalidate every query a field lifecycle change can touch. */
export function useInvalidateWork() {
  const qc = useQueryClient();
  return () => Promise.all([
    getGetFieldDashboardQueryKey(), getGetFieldDispatchQueueQueryKey(), getGetDailySeedingReportQueryKey(),
    getGetChemicalWorkflowQueryKey(), getGetChemicalWarehouseQueryKey(), getListPayrollAccrualsQueryKey(),
  ].map((queryKey) => qc.invalidateQueries({ queryKey })));
}

function useErr() {
  const [msg, setMsg] = useState("");
  const [conflict, setConflict] = useState(false);
  return { msg, conflict, set: (m: string, c: boolean) => { setMsg(m); setConflict(c); }, clear: () => setMsg("") };
}

function Foot({ pending, disabled, onCancel, label, prefix }: { pending: boolean; disabled?: boolean; onCancel: () => void; label: string; prefix: string }) {
  return <>
    <button type="button" className="button button-ghost" onClick={onCancel} disabled={pending} data-testid={`button-cancel-${prefix}`}>Отмена</button>
    <button type="submit" className="button button-primary" disabled={pending || disabled} data-testid={`button-save-${prefix}`}>{pending ? "Сохраняем..." : label}</button>
  </>;
}

/** Agronomist / GD: start approved work, or change CURRENT mechanic / equipment / implement of active work. */
export function WorkResourcesForm({ op, unit, title, fieldLabel, today, fleet, fleetLoading, fleetError, onRetry, onClose, onDone }: {
  op: FieldOperation; unit: string; title: string; fieldLabel: string; today: string; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean;
  onRetry: () => void; onClose: () => void; onDone: (msg: string) => void;
}) {
  const mut = useUpdateFieldOperationActual();
  const invalidate = useInvalidateWork();
  const e = useErr();
  const starting = !op.actualStart;
  const useActual = !!op.actualMechanic || op.actualMechanicEmployeeId != null || !starting;
  const [f, setF] = useState({
    start: today,
    mechanicId: (useActual ? op.actualMechanicEmployeeId : op.plannedMechanicEmployeeId) ?? null as number | null,
    mechanic: useActual ? op.actualMechanic : op.responsible,
    equipment: (useActual ? op.actualEquipment : "") || op.plannedEquipment,
    implement: (useActual ? op.actualImplement : "") || op.plannedImplement,
    notes: op.actualNotes ?? "",
  });
  const initialSupport = starting ? op.supportingWorks : op.actualSupportingWorks;
  const [supportOn, setSupportOn] = useState(!!initialSupport?.length);
  const [supportRows, setSupportRows] = useState<SupportRow[]>(() => supportRowsFrom(initialSupport));
  const [supportErrs, setSupportErrs] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const unitFleet = useMemo(() => fleet.filter((x) => x.unit === unit), [fleet, unit]);
  const known = unitFleet.some((x) => eqLabel(x) === f.equipment);
  const blocked = (starting && (approvalOf(op) !== "approved" || chemNormsMissing(op))) || (!starting && !!op.completionRequestedOn);
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict || blocked) return;
    const er: Record<string, string> = {};
    if (starting) { if (!f.start) er.start = "Укажите дату начала"; else if (f.start > today) er.start = "Не позже сегодняшней даты"; }
    if (!f.mechanicId) er.mechanic = "Выберите механизатора из справочника";
    if (!f.equipment) er.equipment = "Выберите технику хозяйства";
    if (!f.implement.trim()) er.implement = "Укажите агрегат"; else if (f.implement.length > 200) er.implement = "Не более 200 символов";
    const support = supportPlanOf(supportOn ? supportRows : []);
    if (supportOn && !supportRows.length) support.errors.general = "Добавьте хотя бы одну работу или снимите отметку";
    if (Object.keys(support.errors).length) er.support = "Проверьте сопутствующие работы";
    setSupportErrs(support.errors);
    setErrs(er); e.clear();
    if (Object.keys(er).length) return;
    try {
      await mut.mutateAsync({ id: op.id, data: {
        actualSupportingWorks: supportOn ? support.works : [],
        version: op.version, actualStart: starting ? f.start : op.actualStart, actualEnd: null, actualAreaHa: op.actualAreaHa,
        actualOperationName: op.actualOperationName || op.name, actualMechanic: f.mechanic.trim(), actualMechanicEmployeeId: f.mechanicId,
        actualEquipment: f.equipment, actualImplement: f.implement.trim(), actualNotes: starting ? f.notes : op.actualNotes ?? "",
      } });
      await invalidate();
      onDone(starting
        ? `Работа «${op.name}» начата ${dateFmt(f.start)} и видна диспетчеру.${op.requiresChemicals ? " Склад химии получил заявку на плановую потребность — отдельную заявку подавать не нужно." : ""}`
        : `Сведения о работе «${op.name}» обновлены. Новые ресурсы попадут в следующие дневные записи; прошлые записи не меняются.`);
    } catch (err) { handleSaveError(err, true, e.set); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={starting ? "Начать работу" : "Изменить сведения о выполняемой работе"} eyebrow={`${title} · версия ${op.version}`} onClose={close} testId="form-work-resources"
        footer={<Foot pending={pending} disabled={e.conflict || blocked} onCancel={close} prefix="work-resources" label={starting ? "Начать работу" : "Сохранить сведения"} />}>
        <SaveError message={e.msg} conflict={e.conflict} testId="text-work-resources-error" />
        {starting && approvalOf(op) !== "approved" && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900" data-testid="text-start-not-approved">Внеплановая работа ещё не согласована главным агрономом. Начать её нельзя.</p>}
        {starting && chemNormsMissing(op) && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] font-semibold leading-5 text-destructive" data-testid="text-start-chem-norms-missing">Работа требует химии, но нормы на гектар не заданы. Попросите главного агронома заполнить нормы в плане операции.</p>}
        <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-5" data-testid="text-work-plan">
          {op.isUnplanned ? <>Внеплановая · допустимо до {ha(limitOf(op))}</> : <>План: {dateFmt(op.plannedStart)} – {dateFmt(op.plannedEnd)} · {ha(op.plannedAreaHa)}</>}
          <br />Операция: {op.name}{starting ? "" : ` · начата ${dateFmt(op.actualStart)} · выполнено ${ha(op.actualAreaHa)}`}
          {op.requiresChemicals && !!op.chemicalPlan?.length && <><br />Химия по норме: {op.chemicalPlan.length} препарат(ов)</>}
        </div>
        {!starting && <p className="rounded-lg border border-border bg-card p-3 text-[11px] leading-5 text-muted-foreground">Гектары за день вносит диспетчер. Здесь меняются только текущие механизатор, техника и агрегат — они применяются к следующим дневным записям.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Поле" hint="Закреплено за работой. Изменение недоступно." htmlFor="wr-field" wide><input id="wr-field" className="text-input" readOnly value={fieldLabel} data-testid="input-work-field" /></Field>
          <Field label="Фактическая площадь, га" hint="Выполненные гектары вносит и корректирует диспетчер в ежедневных работах." htmlFor="wr-area"><input id="wr-area" className="text-input font-mono" readOnly value={haStr(op.actualAreaHa)} data-testid="input-work-actual-area" /></Field>
          <Field label="Операция" hint="Из выбранного плана или согласованной внеплановой заявки." htmlFor="wr-operation"><input id="wr-operation" className="text-input" readOnly value={op.actualOperationName || op.name} data-testid="input-work-operation" /></Field>
          <Field label="Сотрудник *" error={errs.mechanic} htmlFor="wr-mechanic"><EmployeeSelect id="wr-mechanic" value={{ id: f.mechanicId, name: f.mechanic }} onChange={(v) => setF({ ...f, mechanicId: v.id, mechanic: v.name })} invalid={Boolean(errs.mechanic)} testId="input-work-mechanic" /></Field>
          <Field label="Техника *" error={errs.equipment} hint={`Справочник техники · ${unit}`} htmlFor="wr-equipment">
            <div className="space-y-1.5">
              {fleetError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[10px] text-destructive" role="alert">Не удалось загрузить справочник техники.<button type="button" className="ml-2 underline" onClick={onRetry} data-testid="button-work-fleet-retry">Повторить</button></div>}
              <select id="wr-equipment" className="text-input" disabled={fleetLoading || fleetError} value={f.equipment} onChange={(ev) => setF({ ...f, equipment: ev.target.value })} data-testid="select-work-equipment">
                <option value="">{fleetLoading ? "Загрузка справочника…" : "Выберите технику"}</option>
                {f.equipment && !known && <option value={f.equipment}>{f.equipment} · сохранено ранее</option>}
                {unitFleet.map((x) => <option key={x.id} value={eqLabel(x)}>{eqLabel(x)}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Агрегат *" error={errs.implement} htmlFor="wr-implement"><input id="wr-implement" className="text-input" maxLength={200} value={f.implement} onChange={(ev) => setF({ ...f, implement: ev.target.value })} data-testid="input-work-implement" /></Field>
          <ActualRateField rate={op.actualRatePerHa} prefix="work" />
          <AgronomyActualFuelField op={op} />
          {starting && <Field label="Дата начала *" error={errs.start} htmlFor="wr-start"><input id="wr-start" type="date" max={today} className="text-input" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} data-testid="input-work-start" /></Field>}
          <SupportingWorksEditor enabled={supportOn} onToggle={setSupportOn} rows={supportRows} onChange={setSupportRows} fleet={fleet} fleetLoading={fleetLoading} fleetError={fleetError} onRetry={onRetry} unit={unit} errors={supportErrs} disabled={pending || blocked} testId="work-support"
            mainBudget={op.isUnplanned ? null : { pay: op.plannedAreaHa * op.plannedRatePerHa, fuel: op.plannedFuelCost, seeds: op.seeds && isSowing(op.name) ? seedTotal(op.seeds) : undefined }} />
          {op.seeds && isSowing(op.name) && <div className="sm:col-span-2"><SeedPlanSummary seeds={op.seeds} opName={op.name} testId="text-work-seeds" /></div>}
          {!!op.supportingWorks?.length && <div className="sm:col-span-2"><SupportingWorksSummary works={op.supportingWorks} title="По плану (не меняется)" testId="text-work-support-plan" /></div>}
          <Field label="Примечание" hint={starting ? undefined : "Только просмотр"} htmlFor="wr-notes" wide><textarea id="wr-notes" className="text-input min-h-[64px]" maxLength={3000} readOnly={!starting} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} data-testid="input-work-notes" /></Field>
        </div>
      </Drawer>
    </form>
  );
}

const LIFECYCLE: Record<FieldLifecycleInputAction, { title: string; label: string; needDate?: boolean; needNote?: boolean; done: string; danger?: boolean }> = {
  approve_unplanned: { title: "Согласовать внеплановую работу", label: "Согласовать", done: "Внеплановая работа согласована. Агроном может её начать." },
  reject_unplanned: { title: "Отклонить внеплановую работу", label: "Отклонить", needNote: true, danger: true, done: "Заявка на внеплановую работу отклонена. Агроном видит причину." },
  request_completion: { title: "Запросить завершение работы", label: "Отправить агроному", needDate: true, done: "Запрос на завершение отправлен агроному. Дневные записи по работе приостановлены до решения." },
  approve_completion: { title: "Подтвердить завершение", label: "Подтвердить завершение", done: "Работа завершена и перенесена в историю. Диспетчер внесёт фактическую расценку." },
  reject_completion: { title: "Вернуть работу в выполнение", label: "Вернуть с замечанием", needNote: true, danger: true, done: "Работа возвращена в выполнение. Диспетчер увидит замечание." },
};

/** Generic lifecycle transition dialog with optional date / note. */
export function LifecycleDialog({ op, action, title, today, onClose, onDone }: { op: FieldOperation; action: FieldLifecycleInputAction; title: string; today: string; onClose: () => void; onDone: (msg: string) => void }) {
  const cfg = LIFECYCLE[action];
  const mut = useTransitionFieldOperation();
  const invalidate = useInvalidateWork();
  const e = useErr();
  const lastReport = [...op.progressReports].sort((a, b) => a.reportDate.localeCompare(b.reportDate)).at(-1);
  const [date, setDate] = useState(lastReport?.reportDate.slice(0, 10) ?? today);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<Record<string, string>>({});
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const er: Record<string, string> = {};
    if (cfg.needDate) {
      if (!date) er.date = "Укажите дату завершения";
      else if (date > today) er.date = "Не позже сегодняшней даты";
      else if (op.actualStart && date < op.actualStart.slice(0, 10)) er.date = "Не раньше начала работы";
      else if (lastReport && date < lastReport.reportDate.slice(0, 10)) er.date = `Не раньше последней дневной записи (${dateFmt(lastReport.reportDate)})`;
      if (!(op.actualAreaHa > 0)) er.date = "Нет ни одной дневной записи с площадью — завершать нечего.";
    }
    if (cfg.needNote && note.trim().length < 3) er.note = "Укажите причину (от 3 символов)";
    setErr(er); e.clear();
    if (Object.keys(er).length) return;
    try {
      await mut.mutateAsync({ id: op.id, data: { version: op.version, action, ...(cfg.needDate ? { date } : {}), ...(note.trim() ? { note: note.trim() } : {}) } });
      await invalidate();
      onDone(cfg.done);
    } catch (x) { handleSaveError(x, true, e.set); }
  };
  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={cfg.title} eyebrow={title} onClose={close} testId={`dialog-lifecycle-${action}`}
        footer={<><button type="button" className="button button-ghost" onClick={close} disabled={pending} data-testid="button-cancel-lifecycle">Отмена</button>
          <button type="submit" className={cfg.danger ? "button button-danger border" : "button button-primary"} disabled={pending || e.conflict} data-testid={`button-confirm-${action}`}>{pending ? "Сохраняем..." : cfg.label}</button></>}>
        <SaveError message={e.msg} conflict={e.conflict} testId="text-lifecycle-error" />
        <OpSummary op={op} />
        {action === "approve_completion" && op.completionRequestedOn && <p className="rounded-lg border border-[hsl(157_45%_70%)] bg-[hsl(157_45%_94%)] p-3 text-[11px] leading-5 text-[hsl(161_45%_26%)]">Диспетчер {op.completionRequestedBy || ""} указал дату завершения {dateFmt(op.completionRequestedOn)}. Итог: {ha(op.actualAreaHa)}.</p>}
        {op.approvalNote && action.endsWith("_unplanned") && <p className="text-[11px] text-muted-foreground">Комментарий: {op.approvalNote}</p>}
        {cfg.needDate && <Field label="Дата завершения *" error={err.date} hint="Обычно — дата последней дневной записи" htmlFor="lc-date"><input id="lc-date" type="date" max={today} className="text-input" value={date} onChange={(ev) => setDate(ev.target.value)} data-testid="input-lifecycle-date" /></Field>}
        {(cfg.needNote || action === "approve_unplanned" || action === "request_completion") && <Field label={cfg.needNote ? "Причина *" : "Комментарий"} error={err.note} htmlFor="lc-note"><textarea id="lc-note" className="text-input min-h-[72px]" maxLength={1000} value={note} onChange={(ev) => setNote(ev.target.value)} data-testid="input-lifecycle-note" /></Field>}
      </Drawer>
    </form>
  );
}

export function OpSummary({ op }: { op: FieldOperation }) {
  return <div className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5" data-testid="text-op-summary">
    <p className="font-bold">{op.name}{op.isUnplanned ? " · внеплановая" : ""}</p>
    <p className="font-mono">{op.actualStart ? `начата ${dateFmt(op.actualStart)} · выполнено ${ha(op.actualAreaHa)} из ${ha(limitOf(op))}` : op.isUnplanned ? `предложено ${dateFmt(op.plannedStart)} · до ${ha(limitOf(op))}` : `план ${dateFmt(op.plannedStart)} – ${dateFmt(op.plannedEnd)}`}</p>
    <p>{op.actualMechanic || op.responsible || "механизатор не указан"} · {op.actualEquipment || op.plannedEquipment || "техника не указана"}{(op.actualImplement || op.plannedImplement) ? ` · ${op.actualImplement || op.plannedImplement}` : ""}</p>
    {op.actualNotes && <p className="text-muted-foreground">{op.actualNotes}</p>}
  </div>;
}

/** Read-only daily history: resources are server snapshots at the time of each record. */
export function DailyHistory({ op, onEdit, lockedThrough }: { op: FieldOperation; onEdit?: (r: FieldProgressReport) => void; lockedThrough?: string | null }) {
  const rows = [...op.progressReports].sort((a, b) => b.reportDate.localeCompare(a.reportDate));
  if (rows.length === 0) return <p className="text-[10.5px] text-muted-foreground" data-testid={`text-daily-empty-${op.id}`}>Дневных записей пока нет.</p>;
  return <ul className="divide-y divide-border/70" data-testid={`list-daily-${op.id}`}>{rows.map((r) => {
    const locked = !!lockedThrough && r.reportDate.slice(0, 10) <= lockedThrough;
    return <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-[10.5px]" data-testid={`row-daily-${r.id}`}>
      <span><b className="font-mono">{dateFmt(r.reportDate)}</b> · +{ha(r.dailyAreaHa)} · итого {ha(r.cumulativeAreaHa)}{r.actualRatePerHa != null && <span className="block font-mono">Ставка {r.actualRatePerHa.toLocaleString("ru-RU")} ₸/га · сумма {(Math.round(r.dailyAreaHa * r.actualRatePerHa * 100) / 100).toLocaleString("ru-RU")} ₸</span>}<span className="block text-muted-foreground">{r.actualMechanic} · {r.actualEquipment}{r.actualImplement ? ` · ${r.actualImplement}` : ""}{r.notes ? ` · ${r.notes}` : ""}</span></span>
      {locked && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" title="Площадь закрыта: расход химии подтверждён складом"><Lock size={11} />химия подтверждена</span>}
      {onEdit && (<button type="button" className="button button-secondary !min-h-[26px] !px-2 text-[10px]" onClick={() => onEdit(r)} data-testid={`button-daily-edit-${r.id}`}>{locked ? "Примечание" : "Изменить"}</button>)}
    </li>;
  })}</ul>;
}

/** Dispatcher / GD: daily hectares of active work. Resources are snapshot by the server from current assignments. */
export function DispatcherDailyForm({ op, report, title, fieldLabel, fuelCost, today, onClose, onDone }: { op: FieldOperation; report: FieldProgressReport | null; title: string; fieldLabel: string; fuelCost: number; today: string; onClose: () => void; onDone: (msg: string) => void }) {
  const create = useCreateFieldOperationProgress();
  const update = useUpdateFieldOperationProgress();
  const invalidate = useInvalidateWork();
  const flow = useChemicalWorkflow();
  const e = useErr();
  const reports = useMemo(() => [...op.progressReports].sort((a, b) => a.reportDate.localeCompare(b.reportDate)), [op.progressReports]);
  const [date, setDate] = useState(report?.reportDate.slice(0, 10) ?? today);
  const [daily, setDaily] = useState(report ? haStr(report.dailyAreaHa) : "");
  const [rate, setRate] = useState(String(report?.actualRatePerHa ?? op.actualRatePerHa ?? ""));
  const [notes, setNotes] = useState(report?.notes ?? "");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const existing = report ?? reports.find((r) => r.reportDate.slice(0, 10) === date) ?? null;
  const prev = reports.filter((r) => r.reportDate.slice(0, 10) < date).at(-1);
  const next = reports.find((r) => r.reportDate.slice(0, 10) > date);
  const d = daily.trim() === "" ? null : parseHa(daily);
  const actualRate = Number(rate.trim().replace(",", "."));
  const validRate = rate.trim() !== "" && Number.isFinite(actualRate) && actualRate > 0 && actualRate <= 1_000_000_000
    && Math.abs(actualRate * 100 - Math.round(actualRate * 100)) < 0.00001;
  const cumulative = d === null ? null : Math.round(((prev?.cumulativeAreaHa ?? 0) + d) * 100) / 100;
  const lastChem = latestChemDate(flow.data?.consumptions ?? [], op.id);
  const chemLocked = !!existing && !!lastChem && existing.reportDate.slice(0, 10) <= lastChem;
  const noMechanic = !existing && op.actualMechanicEmployeeId == null;
  const pending = create.isPending || update.isPending;
  const blocked = !!op.completionRequestedOn || noMechanic;
  const close = () => { if (!pending) onClose(); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict || blocked) return;
    const er: Record<string, string> = {};
    if (!date || date < (op.actualStart ?? "").slice(0, 10) || date > today) er.date = "Между началом работы и сегодняшним днём";
    if (!report && existing) er.date = "За этот день запись уже есть — измените её в истории";
    if (d === null) er.daily = "Число с точностью до 0,01 га";
    else if (cumulative !== null && cumulative > limitOf(op)) er.daily = `Итог превысит допустимую площадь (${ha(limitOf(op))})`;
    else if (cumulative !== null && next && cumulative > next.cumulativeAreaHa) er.daily = `Итог не может превышать следующую запись (${ha(next.cumulativeAreaHa)} на ${dateFmt(next.reportDate)})`;
    if (!report && lastChem && date <= lastChem) er.date = `Расход химии подтверждён по ${dateFmt(lastChem)} — новые записи только позже`;
    if (chemLocked && d !== null && existing && d !== existing.dailyAreaHa) er.daily = "Расход химии за день подтверждён — площадь не меняется";
    if (!validRate) er.rate = "Укажите ставку больше нуля с точностью до 0,01 ₸/га";
    setErrs(er); e.clear();
    if (Object.keys(er).length || cumulative === null) return;
    const base = {
      operationVersion: op.version, reportDate: date, cumulativeAreaHa: cumulative,
      actualRatePerHa: actualRate,
      actualMechanic: existing?.actualMechanic ?? op.actualMechanic, actualMechanicEmployeeId: (existing ? existing.actualMechanicEmployeeId ?? null : op.actualMechanicEmployeeId ?? null),
      actualEquipment: existing?.actualEquipment ?? op.actualEquipment, actualImplement: existing?.actualImplement ?? op.actualImplement, notes: notes.trim(),
    };
    try {
      if (existing) await update.mutateAsync({ id: op.id, progressId: existing.id, data: { ...base, version: existing.version } });
      else await create.mutateAsync({ id: op.id, data: base });
      await invalidate();
      onDone(`Запись за ${dateFmt(date)} сохранена: за день ${ha(d ?? 0)}, итого ${ha(cumulative)}.`);
    } catch (x) { handleSaveError(x, true, e.set); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={existing ? "Изменить дневную запись" : "Площадь за день"} eyebrow={title} onClose={close} testId="form-dispatch-daily"
        footer={<Foot pending={pending} disabled={e.conflict || blocked} onCancel={close} prefix="dispatch-daily" label={existing ? "Сохранить запись" : "Добавить запись"} />}>
        <SaveError message={e.msg} conflict={e.conflict} testId="text-dispatch-daily-error" />
        {noMechanic && <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-[11px] font-semibold text-destructive" data-testid="text-dispatch-daily-no-mechanic">У работы не указан механизатор из справочника. Попросите агронома заполнить «Изменить сведения о выполняемой работе», затем вносите площадь.</p>}
        {op.completionRequestedOn && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900" data-testid="text-dispatch-daily-blocked">По работе запрошено завершение. Записи недоступны, пока агроном не подтвердит или не вернёт работу.</p>}
        <OpSummary op={op} />
        <p className="text-[10.5px] text-muted-foreground">Механизатор, техника и агрегат сохраняются автоматически по текущим сведениям агронома и в старых записях не меняются.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Поле" hint="Закреплено за работой. Изменение недоступно." htmlFor="dd-field" wide><input id="dd-field" className="text-input" readOnly value={fieldLabel} data-testid="input-dispatch-daily-field" /></Field>
          <Field label="Выполнено за день, га *" error={errs.daily} hint={cumulative !== null ? `Итог на дату: ${ha(cumulative)} · осталось ${ha(Math.max(0, limitOf(op) - cumulative))}` : `Предыдущий итог: ${ha(prev?.cumulativeAreaHa ?? 0)}`} htmlFor="dd-daily">
            <input id="dd-daily" className="text-input font-mono" inputMode="decimal" value={daily} readOnly={chemLocked} onChange={(ev) => setDaily(ev.target.value)} data-testid="input-dispatch-daily-area" />
          </Field>
          <Field label="Операция" htmlFor="dd-operation"><input id="dd-operation" className="text-input" readOnly value={op.actualOperationName || op.name} /></Field>
          <Field label="Сотрудник" htmlFor="dd-employee"><input id="dd-employee" className="text-input" readOnly value={existing?.actualMechanic ?? op.actualMechanic} /></Field>
          <Field label="Техника" htmlFor="dd-equipment"><input id="dd-equipment" className="text-input" readOnly value={existing?.actualEquipment ?? op.actualEquipment} /></Field>
          <Field label="Агрегат" htmlFor="dd-implement"><input id="dd-implement" className="text-input" readOnly value={existing?.actualImplement ?? op.actualImplement} /></Field>
          <Field label="Фактическая расценка, ₸/га *" error={errs.rate} hint="Ставка сохраняется для этого дня и не меняет другие дневные записи." htmlFor="dispatch-daily-rate">
            <input id="dispatch-daily-rate" className="text-input font-mono" inputMode="decimal" value={rate} onChange={(ev) => setRate(ev.target.value)} data-testid="input-dispatch-daily-actual-rate" />
          </Field>
          <Field label="Сумма за день, ₸" htmlFor="dispatch-daily-pay">
            <input id="dispatch-daily-pay" className="text-input font-mono" readOnly value={validRate && d !== null ? (Math.round(d * actualRate * 100) / 100).toLocaleString("ru-RU") : "—"} data-testid="input-dispatch-daily-pay" />
          </Field>
          <ActualFuelField amount={fuelCost} planned={op.plannedFuelCost} prefix="dispatch-daily" />
          <Field label="Дата *" error={errs.date} htmlFor="dd-date"><input id="dd-date" type="date" min={op.actualStart?.slice(0, 10)} max={today} className="text-input" value={date} disabled={!!report} onChange={(ev) => setDate(ev.target.value)} data-testid="input-dispatch-daily-date" /></Field>
          <Field label="Примечание" htmlFor="dd-notes" wide><input id="dd-notes" className="text-input" maxLength={3000} value={notes} onChange={(ev) => setNotes(ev.target.value)} data-testid="input-dispatch-daily-notes" /></Field>
        </div>
        {chemLocked && <p className="text-[10.5px] text-muted-foreground"><Lock size={11} className="mr-1 inline" />Расход химии подтверждён складом по {dateFmt(lastChem)} включительно — площадь не меняется. Ставку и примечание можно исправить до отправки наряда.</p>}
        <section className="rounded-lg border border-border p-3"><h3 className="mb-1 text-xs font-bold">История записей</h3><DailyHistory op={op} /></section>
      </Drawer>
    </form>
  );
}

export function ReviewButtons({ onApprove, onReject, approveLabel, rejectLabel, testId }: { onApprove: () => void; onReject: () => void; approveLabel: string; rejectLabel: string; testId: string }) {
  return <div className="flex flex-wrap gap-1.5">
    <button type="button" className="button button-primary !min-h-[30px] !px-2.5 text-[11px]" onClick={onApprove} data-testid={`${testId}-approve`}><Check size={12} />{approveLabel}</button>
    <button type="button" className="button button-danger border !min-h-[30px] !px-2.5 text-[11px]" onClick={onReject} data-testid={`${testId}-reject`}><RotateCcw size={12} />{rejectLabel}</button>
  </div>;
}
