import { type FormEvent, useMemo, useState } from "react";
import { type FleetEquipment, useCreateRepairPlanBatch } from "@workspace/api-client-react";
import { Drawer, OverlayForm, SaveError, cx, errorInfo, fleetLabel, useInvalidateRepairs } from "./shared";

type Row = { responsible: string; plannedStart: string; plannedEnd: string };

export default function PlanBatchDrawer({ available, onClose, onDone }: { available: FleetEquipment[]; onClose: () => void; onDone: (n: number) => void }) {
  const batch = useCreateRepairPlanBatch();
  const invalidate = useInvalidateRepairs();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Map<number, Row>>(new Map());
  const [defaults, setDefaults] = useState<Row>({ responsible: "", plannedStart: "", plannedEnd: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return available.filter((f) => !t || `${f.kind} ${f.registrationNumber ?? ""} ${f.unit}`.toLowerCase().includes(t));
  }, [available, q]);
  const selected = available.filter((f) => rows.has(f.id));
  const unavailable = [...rows.keys()].filter((id) => !available.some((fleet) => fleet.id === id));

  const toggle = (id: number) => setRows((m) => { const n = new Map(m); if (n.has(id)) n.delete(id); else n.set(id, { ...defaults }); return n; });
  const setRow = (id: number, k: keyof Row, v: string) => setRows((m) => { const n = new Map(m); const r = n.get(id); if (r) n.set(id, { ...r, [k]: v }); return n; });
  const applyDefaults = () => setRows((m) => { const n = new Map(m); for (const [id, r] of n) n.set(id, { responsible: r.responsible || defaults.responsible, plannedStart: r.plannedStart || defaults.plannedStart, plannedEnd: r.plannedEnd || defaults.plannedEnd }); return n; });

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const errs: Record<string, string> = {};
    if (rows.size === 0) errs.none = "Отметьте хотя бы одну единицу техники";
    if (rows.size > 100) errs.none = "За один раз — не более 100 единиц";
    if (unavailable.length) errs.none = "Часть выбранной техники уже в плане или удалена. Уберите недоступные строки из выбора.";
    for (const [id, r] of rows) {
      if (!r.responsible.trim()) errs[`${id}-responsible`] = "Укажите ответственного";
      if (r.plannedStart && r.plannedEnd && r.plannedEnd < r.plannedStart) errs[`${id}-plannedEnd`] = "Раньше начала";
    }
    setErrors(errs); setSaveError("");
    if (Object.keys(errs).length) return;
    const items = [...rows].map(([fleetId, r]) => ({ fleetId, responsible: r.responsible.trim(), plannedStart: r.plannedStart || null, plannedEnd: r.plannedEnd || null, actualStart: null, actualEnd: null, readiness: null, notes: "" }));
    try {
      await batch.mutateAsync({ data: { items } });
      await invalidate();
      onDone(items.length);
    } catch (err) {
      const info = errorInfo(err);
      setSaveError(info.status === 409 ? `${info.message} Часть техники уже добавлена в план другим пользователем. Нажмите «Обновить данные», снимите отметку с этих машин и сохраните снова.` : info.message);
    }
  };

  return (
    <OverlayForm onSubmit={submit} noValidate>
      <Drawer wide title="Добавить технику в план" eyebrow="Общий план ремонта" onClose={() => !batch.isPending && onClose()} testId="form-plan-batch"
        footer={<><span className="mr-auto self-center text-[11px] text-muted-foreground" data-testid="text-plan-batch-count">Выбрано: {rows.size}</span>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={batch.isPending} data-testid="button-cancel-plan-batch">Отмена</button>
          <button type="submit" className="button button-primary" disabled={batch.isPending || rows.size === 0} data-testid="button-save-plan-batch">{batch.isPending ? "Сохраняем..." : `Сохранить (${rows.size})`}</button></>}>
        <SaveError message={saveError} conflict={!!saveError && saveError.includes("Обновить")} testId="text-plan-batch-error" />
        {unavailable.length > 0 && <div className="rounded-lg border border-amber-300 p-3 text-xs">
          <p className="font-semibold">Эта техника уже добавлена в план другим сотрудником или удалена из справочника. Остальные введённые строки сохранены.</p>
          {unavailable.map((id) => <div key={id} className="mt-2 flex items-center justify-between gap-2">
            <span>Техника №{id} · {rows.get(id)?.responsible}</span>
            <button type="button" className="button button-secondary" onClick={() => toggle(id)} data-testid={`button-plan-remove-unavailable-${id}`}>Убрать из выбора</button>
          </div>)}
        </div>}
        <p className="text-[11px] leading-5 text-muted-foreground">Доступна только техника из справочника, которой ещё нет в плане. Затраты в плане не вводятся — они подтягиваются из журнала затрат автоматически.</p>
        <fieldset className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-3">
          <legend className="eyebrow px-1">Значения по умолчанию для отмеченных</legend>
          <input className="text-input" placeholder="Ответственный" aria-label="Ответственный по умолчанию" value={defaults.responsible} onChange={(e) => setDefaults({ ...defaults, responsible: e.target.value })} data-testid="input-plan-default-responsible" />
          <input type="date" className="text-input" aria-label="Плановое начало по умолчанию" value={defaults.plannedStart} onChange={(e) => setDefaults({ ...defaults, plannedStart: e.target.value })} data-testid="input-plan-default-start" />
          <input type="date" className="text-input" aria-label="Плановое окончание по умолчанию" value={defaults.plannedEnd} onChange={(e) => setDefaults({ ...defaults, plannedEnd: e.target.value })} data-testid="input-plan-default-end" />
          <button type="button" className="button button-secondary sm:col-span-3" onClick={applyDefaults} disabled={rows.size === 0} data-testid="button-plan-apply-defaults">Заполнить пустые поля отмеченных</button>
        </fieldset>
        <input type="search" className="text-input" placeholder="Поиск по виду, госномеру, хозяйству" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Поиск техники" data-testid="input-plan-batch-search" />
        {errors.none && <p className="text-xs font-semibold text-destructive" role="alert">{errors.none}</p>}
        {available.length === 0 ? <p className="py-8 text-center text-xs text-muted-foreground" data-testid="status-plan-batch-empty">Вся техника справочника уже в плане. Новую технику добавляет главный инженер во вкладке «Справочник».</p> : (
          <ul className="divide-y divide-border/70 rounded-lg border border-border">
            {shown.map((f) => {
              const r = rows.get(f.id);
              return (
                <li key={f.id} className={cx("px-3 py-2.5", r && "bg-[hsl(203_55%_97%)]")} data-testid={`row-plan-batch-${f.id}`}>
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input type="checkbox" checked={!!r} onChange={() => toggle(f.id)} data-testid={`checkbox-plan-batch-${f.id}`} />
                    <span className="min-w-0 flex-1 truncate font-semibold">{fleetLabel(f)}</span>
                    <span className="text-[10.5px] text-muted-foreground">{f.unit}</span>
                  </label>
                  {r && (
                    <div className="mt-2 grid gap-2 pl-6 sm:grid-cols-3">
                      <div><input className={cx("text-input", errors[`${f.id}-responsible`] && "!border-destructive")} placeholder="Ответственный *" aria-label={`Ответственный ${fleetLabel(f)}`} maxLength={200} value={r.responsible} onChange={(e) => setRow(f.id, "responsible", e.target.value)} data-testid={`input-plan-batch-responsible-${f.id}`} />
                        {errors[`${f.id}-responsible`] && <p className="mt-1 text-[10px] font-semibold text-destructive">{errors[`${f.id}-responsible`]}</p>}</div>
                      <input type="date" className="text-input" aria-label={`Плановое начало ${fleetLabel(f)}`} value={r.plannedStart} onChange={(e) => setRow(f.id, "plannedStart", e.target.value)} data-testid={`input-plan-batch-start-${f.id}`} />
                      <div><input type="date" className={cx("text-input", errors[`${f.id}-plannedEnd`] && "!border-destructive")} aria-label={`Плановое окончание ${fleetLabel(f)}`} value={r.plannedEnd} onChange={(e) => setRow(f.id, "plannedEnd", e.target.value)} data-testid={`input-plan-batch-end-${f.id}`} />
                        {errors[`${f.id}-plannedEnd`] && <p className="mt-1 text-[10px] font-semibold text-destructive">{errors[`${f.id}-plannedEnd`]}</p>}</div>
                    </div>
                  )}
                </li>
              );
            })}
            {selected.filter((f) => !shown.includes(f)).length > 0 && <li className="px-3 py-2 text-[11px] text-muted-foreground">Ещё отмечено вне поиска: {selected.filter((f) => !shown.includes(f)).length}</li>}
          </ul>
        )}
      </Drawer>
    </OverlayForm>
  );
}
