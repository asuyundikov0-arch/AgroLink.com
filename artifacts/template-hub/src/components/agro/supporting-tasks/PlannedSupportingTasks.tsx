import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ClipboardPlus, Plus, RefreshCw, Save, Send, Trash2, X } from "lucide-react";
import {
  type AgroField, type FieldOperation, getListEmployeesQueryKey, getListFleetEquipmentQueryKey,
  useCreateSupportingTaskBatch, useListEmployees, useListFleetEquipment,
} from "@workspace/api-client-react";
import { SupportingWorksSummary } from "../fields/SupportingWorksEditor";
import { Drawer, cx } from "../fields/shared";
import { NOT_EXPENSE_TEXT, SERVICES, canCreateTasks, dt, money, taskErr, useInvalidateTasks } from "./shared";
import { type BatchRow, buildItems, initialRows, manualRow, payloadHash, requestIdFor, rowsFromPlan } from "./batchRows";

export function canCreateFromOperation(role: string, field: AgroField, op: FieldOperation) {
  if (!canCreateTasks(role) || !field.isActive) return false;
  if (op.status === "completed" || op.status === "cancelled") return false;
  if (op.isUnplanned && (op.approvalStatus ?? "approved") !== "approved") return false;
  return true;
}

/** Planned supporting works summary (read-only list, shown for everyone). */
export function PlannedSupportingTasks({ operation }: { operation: FieldOperation; field?: AgroField; year?: number; role?: string }) {
  return <SupportingWorksSummary works={operation.supportingWorks} title="Сопутствующие работы по плану" testId={`text-support-plan-${operation.id}`} />;
}

/** The single "Создать задание" button beside the operation header; opens one batch drawer. */
export function SupportingTaskBatchButton({ operation, field, year, role }: { operation: FieldOperation; field: AgroField; year: number; role: string }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState("");
  if (!canCreateFromOperation(role, field, operation)) return null;
  return <>
    <button type="button" className="button button-secondary !min-h-[26px] !px-2 text-[10.5px]" onClick={() => { setNotice(""); setOpen(true); }} data-testid={`button-support-task-create-${operation.id}`}>
      <ClipboardPlus size={12} />Создать задание
    </button>
    {notice && <span role="status" className="text-[10.5px] font-semibold text-[hsl(161_45%_26%)]" data-testid={`text-support-task-created-${operation.id}`}>{notice}</span>}
    {open && <BatchDrawer operation={operation} field={field} year={year} onClose={() => setOpen(false)} onDone={(m) => { setOpen(false); setNotice(m); }} />}
  </>;
}

const lbl = "mb-1 block text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground";

export function BatchDrawer({ operation: op, field, year, onClose, onDone }: { operation: FieldOperation; field: AgroField; year: number; onClose: () => void; onDone: (m: string) => void }) {
  const [rows, setRows] = useState<BatchRow[]>(() => initialRows(op));
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const reqCache = useRef<{ hash: string; id: string } | null>(null);
  const fleetQ = useListFleetEquipment({ query: { queryKey: getListFleetEquipmentQueryKey() } });
  const empQ = useListEmployees({ query: { queryKey: getListEmployeesQueryKey() } });
  const fleet = (fleetQ.data ?? []).filter((e) => e.unit === field.unit);
  const staff = (empQ.data ?? []).slice().sort((a, b) => a.fullName.localeCompare(b.fullName, "ru"));
  const batch = useCreateSupportingTaskBatch();
  const invalidate = useInvalidateTasks();
  const built = buildItems(op.id, rows);
  const hasErr = built.general.length > 0 || Object.keys(built.errors).length > 0;
  const plan = op.supportingWorks ?? [];
  const removedPlan = plan.map((_, i) => i).filter((i) => !rows.some((r) => r.sourceIndex === i));

  const patch = (key: string, p: Partial<BatchRow>) => { setError(null); setRows((rs) => rs.map((r) => r.key === key ? { ...r, ...p } : r)); };
  const submit = (sendNow: boolean) => {
    setTouched(true); setError(null);
    if (hasErr) return;
    const hash = payloadHash(sendNow, built.items);
    reqCache.current = requestIdFor(reqCache.current, hash);
    batch.mutate({ data: { requestId: reqCache.current.id, sendNow, items: built.items } }, {
      onSuccess: (tasks) => {
        void invalidate();
        const nums = tasks.map((t) => `№ ${t.id}`).join(", ");
        onDone(sendNow ? `Отправлено службам: ${tasks.length} (${nums}).` : `Сохранено черновиков: ${tasks.length} (${nums}).`);
      },
      onError: (e) => setError(taskErr(e)),
    });
  };

  if (typeof document === "undefined") return null;
  return createPortal(<Drawer title="Задания службам по операции" eyebrow={`Поле № ${field.number} · ${field.unit} · ${year}`} onClose={() => { if (!batch.isPending) onClose(); }} testId="drawer-supporting-batch"
    footer={<div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" className="button button-ghost" disabled={batch.isPending} onClick={onClose} data-testid="button-batch-cancel"><X size={14} />Закрыть</button>
      <button type="button" className="button button-secondary" disabled={batch.isPending || (touched && hasErr)} onClick={() => submit(false)} data-testid="button-batch-save-drafts"><Save size={14} />Сохранить черновики</button>
      <button type="button" className="button button-primary" disabled={batch.isPending || (touched && hasErr)} onClick={() => submit(true)} data-testid="button-batch-send">{batch.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}Отправить службам · {rows.length}</button>
    </div>}>
    <fieldset disabled={batch.isPending} aria-busy={batch.isPending} className="m-0 min-w-0 border-0 p-0 disabled:opacity-70" data-testid="fieldset-batch-editor">
    <div className="space-y-3 text-xs">
      <div className="rounded-md border border-border bg-muted/30 px-3 py-2" data-testid="text-batch-operation-fixed">
        <p className="text-[10px] font-bold uppercase tracking-[.1em] text-muted-foreground">Основная операция · не меняется</p>
        <p className="font-bold">{op.name}{op.isUnplanned && <span className="ml-2 rounded-full bg-[hsl(38_92%_50%/.14)] px-2 py-0.5 text-[10px] text-[hsl(30_80%_30%)]">Вне плана</span>}</p>
        <p className="font-mono text-[10.5px] text-muted-foreground">план {dt(op.plannedStart)} – {dt(op.plannedEnd)} · в плане сопутствующих работ: {plan.length}</p>
      </div>
      <p className="text-[10.5px] text-muted-foreground" data-testid="text-batch-not-expense">{NOT_EXPENSE_TEXT}. Каждая строка уходит только выбранным в ней службам; все строки сохраняются одной операцией.</p>
      {removedPlan.length > 0 && <p className="text-[10.5px] text-muted-foreground" data-testid="text-batch-removed">Исключены из отправки плановые строки: {removedPlan.map((i) => `${i + 1}. ${plan[i].name}`).join("; ")}</p>}

      {rows.map((r, idx) => {
        const src = r.sourceIndex !== null ? plan[r.sourceIndex] : undefined;
        const errs = touched ? built.errors[r.key] : undefined;
        return <section key={r.key} className={cx("rounded-lg border bg-card px-3 py-2.5", errs ? "border-destructive/50" : r.sourceIndex === null ? "border-dashed border-[hsl(30_80%_45%/.6)]" : "border-border")} data-testid={`row-batch-${idx}`}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              {r.sourceIndex === null
                ? <span className="rounded-full bg-[hsl(38_92%_50%/.16)] px-2 py-0.5 text-[10px] font-bold text-[hsl(30_80%_30%)]" data-testid={`badge-batch-manual-${idx}`}>Внеплановая сопутствующая работа</span>
                : <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold" data-testid={`badge-batch-source-${idx}`}>По плану · строка {r.sourceIndex + 1}</span>}
              {src && <p className="mt-1 text-[10.5px] text-muted-foreground">План: {src.name} · {src.equipmentName || "без техники"} · ЗП {money(src.salaryCost)} · ГСМ {money(src.fuelCost)}</p>}
            </div>
            <button type="button" className="button button-ghost !min-h-[26px] !px-1.5 text-[10.5px]" onClick={() => { setError(null); setRows((rs) => rs.filter((x) => x.key !== r.key)); }} data-testid={`button-batch-remove-${idx}`} aria-label="Убрать строку"><Trash2 size={12} />Убрать</button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={lbl}>Название</label><input className="text-input" maxLength={150} value={r.title} onChange={(e) => patch(r.key, { title: e.target.value })} data-testid={`input-batch-title-${idx}`} /></div>
            <div><label className={lbl}>Начало</label><input type="date" className="text-input font-mono" value={r.startDate} onChange={(e) => patch(r.key, { startDate: e.target.value })} data-testid={`input-batch-start-${idx}`} /></div>
            <div><label className={lbl}>Окончание</label><input type="date" className="text-input font-mono" value={r.endDate} onChange={(e) => patch(r.key, { endDate: e.target.value })} data-testid={`input-batch-end-${idx}`} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Техника ({field.unit})</label>
              {fleetQ.isError ? <button type="button" className="button button-secondary" onClick={() => { void fleetQ.refetch(); }} data-testid={`button-batch-fleet-retry-${idx}`}>Не удалось загрузить технику · повторить</button> :
                <select className="text-input" disabled={fleetQ.isLoading} value={r.equipmentId ?? ""} onChange={(e) => patch(r.key, { equipmentId: e.target.value ? Number(e.target.value) : null })} data-testid={`select-batch-equipment-${idx}`}>
                  <option value="">{fleetQ.isLoading ? "Загрузка…" : "Без техники"}</option>
                  {fleet.map((e) => <option key={e.id} value={e.id}>{e.kind}{e.registrationNumber ? ` · ${e.registrationNumber}` : ""}</option>)}
                  {r.equipmentId && !fleet.some((e) => e.id === r.equipmentId) && <option value={r.equipmentId}>Техника №{r.equipmentId}</option>}
                </select>}
            </div>
            <div className="sm:col-span-2"><label className={lbl}>Сотрудники · {r.employeeIds.length}{r.employeeIds.length > 0 && <button type="button" className="ml-2 normal-case underline" onClick={() => patch(r.key, { employeeIds: [] })} data-testid={`button-batch-emp-clear-${idx}`}>очистить</button>}</label>
              {empQ.isLoading ? <div className="skeleton h-16 rounded-md" /> : empQ.isError ? <button type="button" className="button button-secondary" onClick={() => { void empQ.refetch(); }} data-testid={`button-batch-emp-retry-${idx}`}>Не удалось загрузить сотрудников · повторить</button> :
                <div className="max-h-32 overflow-y-auto rounded-md border border-border p-1" data-testid={`list-batch-employees-${idx}`}>
                  {staff.filter((e) => e.isActive || r.employeeIds.includes(e.id)).map((e) => { const on = r.employeeIds.includes(e.id);
                    return <button key={e.id} type="button" onClick={() => patch(r.key, { employeeIds: on ? r.employeeIds.filter((x) => x !== e.id) : [...r.employeeIds, e.id] })} className={cx("flex w-full items-center gap-2 rounded px-2 py-0.5 text-left", on ? "bg-foreground/10 font-semibold" : "hover:bg-muted/40")} data-testid={`button-batch-employee-${idx}-${e.id}`}>
                      <span className={cx("flex h-3.5 w-3.5 items-center justify-center rounded-sm border", on ? "border-foreground bg-foreground text-background" : "border-border")}>{on && <Check size={10} />}</span>{e.fullName}<span className="ml-auto text-[10px] text-muted-foreground">{e.position}</span></button>; })}
                </div>}
            </div>
            <div><label className={lbl}>Бюджет ЗП, ₸</label><input inputMode="decimal" className="text-input font-mono" value={r.salary} onChange={(e) => patch(r.key, { salary: e.target.value })} data-testid={`input-batch-salary-${idx}`} /></div>
            <div><label className={lbl}>Бюджет ГСМ, ₸</label><input inputMode="decimal" className="text-input font-mono" value={r.fuel} onChange={(e) => patch(r.key, { fuel: e.target.value })} data-testid={`input-batch-fuel-${idx}`} /></div>
            <div><label className={lbl}>Объём</label><input inputMode="decimal" className="text-input font-mono" value={r.quantity} onChange={(e) => patch(r.key, { quantity: e.target.value })} data-testid={`input-batch-quantity-${idx}`} /></div>
            <div><label className={lbl}>Единица</label><input className="text-input" maxLength={40} placeholder="т, рейс, л" value={r.quantityUnit} onChange={(e) => patch(r.key, { quantityUnit: e.target.value })} data-testid={`input-batch-unit-${idx}`} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Примечание</label><textarea className="text-input min-h-[50px]" maxLength={3000} value={r.notes} onChange={(e) => patch(r.key, { notes: e.target.value })} data-testid={`input-batch-notes-${idx}`} /></div>
            <div className="sm:col-span-2"><label className={lbl}>Службы-получатели этой строки</label>
              <div className="flex flex-wrap gap-1.5">{SERVICES.map((s) => { const on = r.services.includes(s.id);
                return <button key={s.id} type="button" aria-pressed={on} onClick={() => patch(r.key, { services: on ? r.services.filter((x) => x !== s.id) : [...r.services, s.id] })} className={cx("rounded-full border px-3 py-1 text-[11px] font-bold", on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")} data-testid={`button-batch-service-${idx}-${s.id}`}>{s.label}</button>; })}</div>
            </div>
          </div>
          {errs && <ul className="mt-2 list-disc pl-5 text-[10.5px] text-destructive" data-testid={`text-batch-row-errors-${idx}`}>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </section>;
      })}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="button button-secondary !min-h-[30px] text-[11px]" disabled={rows.length >= 20} onClick={() => { setError(null); setRows((rs) => [...rs, manualRow(op)]); }} data-testid="button-batch-add-manual"><Plus size={13} />Добавить внеплановую работу</button>
        {removedPlan.map((i) => <button key={i} type="button" className="button button-ghost !min-h-[30px] text-[11px]" disabled={rows.length >= 20} onClick={() => setRows((rs) => [...rs, initialRowsFor(op, i)].sort((a, b) => (a.sourceIndex ?? 99) - (b.sourceIndex ?? 99)))} data-testid={`button-batch-restore-${i}`}>Вернуть строку {i + 1}</button>)}
      </div>
      {touched && built.general.length > 0 && <p className="text-[11px] font-semibold text-destructive" data-testid="text-batch-validation">{built.general.join(" ")}</p>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] font-semibold text-destructive" role="alert" data-testid="text-batch-error">{error.message}
        {error.conflict && <button type="button" className="button button-secondary mt-2 !min-h-[30px] text-foreground" onClick={() => { void invalidate(); onClose(); }} data-testid="button-batch-conflict-reload"><RefreshCw size={12} />Обновить и закрыть</button>}</div>}
    </div>
    </fieldset>
  </Drawer>, document.body);
}

function initialRowsFor(op: FieldOperation, i: number): BatchRow {
  return rowsFromPlan(op)[i];
}
