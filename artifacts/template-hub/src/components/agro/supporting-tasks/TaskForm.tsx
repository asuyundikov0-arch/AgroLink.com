import { useMemo, useState } from "react";
import { Check, RefreshCw, Save, X } from "lucide-react";
import {
  type FieldOperation, type SupportingService, type SupportingTask, type SupportingTaskInput,
  getListEmployeesQueryKey, getListFleetEquipmentQueryKey, useCreateSupportingTask, useListEmployees, useListFleetEquipment, useUpdateSupportingTask,
} from "@workspace/api-client-react";
import { Drawer, cx } from "../fields/shared";
import { NOT_EXPENSE_TEXT, SERVICES, amountStr, dt, isIsoDate, money, parseAmount, taskErr, useInvalidateTasks } from "./shared";

export type OpContext = { op: FieldOperation; fieldNumber: string; farm: string; year: number };

type Props = { candidates: OpContext[]; task?: SupportingTask; defaultOpId?: number; onClose: () => void; onSaved: (t: SupportingTask, msg: string) => void };

export function TaskForm({ candidates, task, defaultOpId, onClose, onSaved }: Props) {
  const editing = !!task;
  const [requestId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `st-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`));
  const [opId, setOpId] = useState<number>(task?.operationId ?? defaultOpId ?? candidates[0]?.op.id ?? 0);
  const ctx = candidates.find((c) => c.op.id === opId);
  const [sourceIndex, setSourceIndex] = useState<number>(task?.sourceIndex ?? 0);
  const init = (o: FieldOperation | undefined, i: number) => {
    const w = o?.supportingWorks?.[i];
    return {
      title: w?.name ?? "", startDate: o?.plannedStart?.slice(0, 10) ?? "", endDate: o?.plannedEnd?.slice(0, 10) ?? "",
      equipmentId: w?.equipmentId ?? null, employeeIds: w?.employeeIds ?? [], salary: w ? amountStr(w.salaryCost) : "0", fuel: w ? amountStr(w.fuelCost) : "0",
    };
  };
  const [f, setF] = useState(() => task ? {
    title: task.title, startDate: task.startDate, endDate: task.endDate, equipmentId: task.equipmentId, employeeIds: task.employeeIds,
    salary: amountStr(task.salaryBudget), fuel: amountStr(task.fuelBudget),
  } : init(ctx?.op, 0));
  const [quantity, setQuantity] = useState(task ? amountStr(task.quantity) : "0");
  const [quantityUnit, setQuantityUnit] = useState(task?.quantityUnit ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [services, setServices] = useState<SupportingService[]>(task?.services ?? []);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);
  const [touched, setTouched] = useState(false);

  const farm = ctx?.farm ?? task?.farm ?? "";
  const fleetQ = useListFleetEquipment({ query: { queryKey: getListFleetEquipmentQueryKey() } });
  const empQ = useListEmployees({ query: { queryKey: getListEmployeesQueryKey() } });
  const fleet = useMemo(() => (fleetQ.data ?? []).filter((e) => e.unit === farm), [fleetQ.data, farm]);
  const staff = useMemo(() => (empQ.data ?? []).filter((e) => e.isActive || f.employeeIds.includes(e.id)).sort((a, b) => a.fullName.localeCompare(b.fullName, "ru")), [empQ.data, f.employeeIds]);
  const invalidate = useInvalidateTasks();
  const create = useCreateSupportingTask();
  const update = useUpdateSupportingTask();
  const pending = create.isPending || update.isPending;
  const works = ctx?.op.supportingWorks ?? [];
  const source = editing ? task!.sourceSnapshot : works[sourceIndex];

  const pickOp = (id: number) => { setOpId(id); setSourceIndex(0); setF(init(candidates.find((c) => c.op.id === id)?.op, 0)); };
  const pickSource = (i: number) => { setSourceIndex(i); setF(init(ctx?.op, i)); };

  const salary = parseAmount(f.salary, 1e9);
  const fuel = parseAmount(f.fuel, 1e9);
  const qty = parseAmount(quantity || "0", 1e6, 3);
  const errors: string[] = [];
  if (!opId || (!editing && !ctx)) errors.push("Выберите плановую операцию с сопутствующими работами.");
  if (!source) errors.push("Выберите строку сопутствующей работы.");
  if (!f.title.trim()) errors.push("Название не может быть пустым.");
  if (f.title.length > 150) errors.push("Название — не более 150 символов.");
  if (!isIsoDate(f.startDate) || !isIsoDate(f.endDate)) errors.push("Даты в формате ГГГГ-ММ-ДД.");
  else if (f.endDate < f.startDate) errors.push("Дата окончания раньше начала.");
  if (salary === null) errors.push("Бюджет зарплаты: от 0 до 1 000 000 000, не более 2 знаков после запятой.");
  if (fuel === null) errors.push("Бюджет топлива: от 0 до 1 000 000 000, не более 2 знаков после запятой.");
  if (qty === null) errors.push("Объём: от 0 до 1 000 000.");
  if (quantityUnit.length > 40) errors.push("Единица объёма — до 40 символов.");
  if (notes.length > 3000) errors.push("Примечание — до 3000 символов.");
  if (services.length === 0) errors.push("Выберите хотя бы одну службу.");
  if (new Set(f.employeeIds).size !== f.employeeIds.length) errors.push("Сотрудники не должны повторяться.");
  if (f.employeeIds.length > 30) errors.push("Не более 30 сотрудников.");

  const save = () => {
    setTouched(true); setError(null);
    if (errors.length) return;
    const payload: SupportingTaskInput = {
      operationId: editing ? task!.operationId : opId, sourceIndex: editing ? task!.sourceIndex : sourceIndex,
      title: f.title.trim(), startDate: f.startDate, endDate: f.endDate, equipmentId: f.equipmentId, employeeIds: [...new Set(f.employeeIds)],
      salaryBudget: salary!, fuelBudget: fuel!, quantity: qty!, quantityUnit: quantityUnit.trim(), notes: notes.trim(),
      services: SERVICES.map((s) => s.id).filter((s) => services.includes(s)),
    };
    const onError = (e: unknown) => setError(taskErr(e));
    if (editing) update.mutate({ id: task!.id, data: { ...payload, version: task!.version } }, { onSuccess: (t) => { void invalidate(); onSaved(t, `Черновик № ${t.id} сохранён.`); }, onError });
    else create.mutate({ data: { ...payload, requestId } }, { onSuccess: (t) => { void invalidate(); onSaved(t, `Черновик № ${t.id} создан. Проверьте и отправьте службам.`); }, onError });
  };

  const toggleEmp = (id: number) => setF({ ...f, employeeIds: f.employeeIds.includes(id) ? f.employeeIds.filter((x) => x !== id) : [...f.employeeIds, id] });
  const lbl = "mb-1 block text-[10.5px] font-bold uppercase tracking-[.1em] text-muted-foreground";

  return <Drawer title={editing ? `Черновик задания № ${task!.id}` : "Новое задание службам"} eyebrow={ctx ? `Поле № ${ctx.fieldNumber} · ${ctx.farm} · ${ctx.year}` : task ? `Поле № ${task.fieldNumber} · ${task.farm} · ${task.year}` : "Задания службам"} onClose={onClose} testId="drawer-supporting-task"
    footer={<div className="flex flex-wrap items-center justify-end gap-2">
      <button type="button" className="button button-ghost" onClick={onClose} data-testid="button-task-cancel"><X size={14} />Закрыть</button>
      <button type="button" className="button button-primary" disabled={pending || (touched && errors.length > 0)} onClick={save} data-testid="button-task-save">{pending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}{editing ? "Сохранить черновик" : "Сохранить как черновик"}</button>
    </div>}>
    <div className="space-y-4 text-xs">
      <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold" data-testid="text-task-not-expense">{NOT_EXPENSE_TEXT}. Бюджеты — только предложение; план главного агронома не меняется.</p>

      <div>
        <label className={lbl}>Основная операция</label>
        {editing ? <p className="font-semibold" data-testid="text-task-operation-fixed">{task!.operationName} · строка {task!.sourceIndex + 1}</p> :
          <select className="text-input" value={opId} onChange={(e) => pickOp(Number(e.target.value))} data-testid="select-task-operation">
            {candidates.map((c) => <option key={c.op.id} value={c.op.id}>Поле № {c.fieldNumber} · {c.op.name} · {dt(c.op.plannedStart)}–{dt(c.op.plannedEnd)}</option>)}
          </select>}
      </div>

      {!editing && works.length > 0 && <div>
        <label className={lbl}>Сопутствующая работа из плана</label>
        <div className="grid gap-1.5">{works.map((w, i) => <button key={i} type="button" onClick={() => pickSource(i)} className={cx("rounded-md border px-2.5 py-1.5 text-left", i === sourceIndex ? "border-foreground bg-foreground/5" : "border-border hover:border-foreground/40")} data-testid={`button-task-source-${i}`}>
          <span className="font-semibold">{i + 1}. {w.name}</span><span className="ml-2 font-mono text-[10.5px] text-muted-foreground">ЗП {money(w.salaryCost)} · ГСМ {money(w.fuelCost)}</span>
        </button>)}</div>
      </div>}

      {source && <div className="rounded-md border border-dashed border-border px-3 py-2 text-[11px]" data-testid="text-task-source-snapshot">
        <p className="font-bold">По плану: {source.name}</p>
        <p className="text-muted-foreground">Техника: {source.equipmentName || "—"} · сотрудники: {(source.employeeNames ?? []).join(", ") || "—"} · ЗП {money(source.salaryCost)} · ГСМ {money(source.fuelCost)}</p>
      </div>}

      <div><label className={lbl} htmlFor="st-title">Название задания</label><input id="st-title" className="text-input" maxLength={150} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} data-testid="input-task-title" /></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="st-start">Начало</label><input id="st-start" type="date" className="text-input font-mono" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} data-testid="input-task-start" /></div>
        <div><label className={lbl} htmlFor="st-end">Окончание</label><input id="st-end" type="date" className="text-input font-mono" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} data-testid="input-task-end" /></div>
      </div>

      <div>
        <label className={lbl} htmlFor="st-eq">Техника ({farm || "хозяйство"})</label>
        {fleetQ.isError ? <button type="button" className="button button-secondary" onClick={() => { void fleetQ.refetch(); }} data-testid="button-task-fleet-retry">Не удалось загрузить технику · повторить</button> :
          <select id="st-eq" className="text-input" disabled={fleetQ.isLoading} value={f.equipmentId ?? ""} onChange={(e) => setF({ ...f, equipmentId: e.target.value ? Number(e.target.value) : null })} data-testid="select-task-equipment">
            <option value="">{fleetQ.isLoading ? "Загрузка…" : "Без техники"}</option>
            {fleet.map((e) => <option key={e.id} value={e.id}>{e.kind}{e.registrationNumber ? ` · ${e.registrationNumber}` : ""}</option>)}
            {f.equipmentId && !fleet.some((e) => e.id === f.equipmentId) && <option value={f.equipmentId}>Техника №{f.equipmentId}</option>}
          </select>}
      </div>

      <div>
        <label className={lbl}>Сотрудники · выбрано {f.employeeIds.length}</label>
        {empQ.isLoading ? <div className="skeleton h-24 rounded-md" /> : empQ.isError ? <button type="button" className="button button-secondary" onClick={() => { void empQ.refetch(); }} data-testid="button-task-employees-retry">Не удалось загрузить сотрудников · повторить</button> :
          <div className="max-h-44 overflow-y-auto rounded-md border border-border p-1" data-testid="list-task-employees">
            {staff.length === 0 ? <p className="p-2 text-muted-foreground">Активных сотрудников нет.</p> : staff.map((e) => {
              const on = f.employeeIds.includes(e.id);
              return <button key={e.id} type="button" onClick={() => toggleEmp(e.id)} className={cx("flex w-full items-center gap-2 rounded px-2 py-1 text-left", on ? "bg-foreground/10 font-semibold" : "hover:bg-muted/40")} data-testid={`button-task-employee-${e.id}`}>
                <span className={cx("flex h-3.5 w-3.5 items-center justify-center rounded-sm border", on ? "border-foreground bg-foreground text-background" : "border-border")}>{on && <Check size={10} />}</span>
                {e.fullName}<span className="ml-auto text-[10px] text-muted-foreground">{e.position}{!e.isActive ? " · неактивен" : ""}</span>
              </button>;
            })}
          </div>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className={lbl} htmlFor="st-sal">Предлагаемый бюджет ЗП, ₸</label><input id="st-sal" inputMode="decimal" className="text-input font-mono" value={f.salary} onChange={(e) => setF({ ...f, salary: e.target.value })} data-testid="input-task-salary" /></div>
        <div><label className={lbl} htmlFor="st-fuel">Предлагаемый бюджет ГСМ, ₸</label><input id="st-fuel" inputMode="decimal" className="text-input font-mono" value={f.fuel} onChange={(e) => setF({ ...f, fuel: e.target.value })} data-testid="input-task-fuel" /></div>
        <div><label className={lbl} htmlFor="st-qty">Объём (необязательно)</label><input id="st-qty" inputMode="decimal" className="text-input font-mono" value={quantity} onChange={(e) => setQuantity(e.target.value)} data-testid="input-task-quantity" /></div>
        <div><label className={lbl} htmlFor="st-unit">Единица</label><input id="st-unit" className="text-input" maxLength={40} placeholder="т, рейс, л…" value={quantityUnit} onChange={(e) => setQuantityUnit(e.target.value)} data-testid="input-task-unit" /></div>
      </div>
      <div><label className={lbl} htmlFor="st-notes">Примечание</label><textarea id="st-notes" className="text-input min-h-[70px]" maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-task-notes" /></div>

      <div>
        <label className={lbl}>Службы-получатели</label>
        <div className="flex flex-wrap gap-1.5">{SERVICES.map((s) => { const on = services.includes(s.id); return <button key={s.id} type="button" aria-pressed={on} onClick={() => setServices(on ? services.filter((x) => x !== s.id) : [...services, s.id])} className={cx("rounded-full border px-3 py-1 text-[11px] font-bold", on ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground")} data-testid={`button-task-service-${s.id}`}>{s.label}</button>; })}</div>
      </div>

      {touched && errors.length > 0 && <ul className="list-disc space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 py-2 pl-6 pr-3 text-[11px] text-destructive" data-testid="text-task-validation">{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-[11px] font-semibold text-destructive" role="alert" data-testid="text-task-save-error">{error.message}
        {error.conflict && <button type="button" className="button button-secondary mt-2 !min-h-[30px] text-foreground" onClick={() => { void invalidate(); onClose(); }} data-testid="button-task-conflict-reload"><RefreshCw size={12} />Обновить и закрыть</button>}</div>}
    </div>
  </Drawer>;
}
