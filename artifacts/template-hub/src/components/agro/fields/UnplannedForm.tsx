import { type FormEvent, useMemo, useState } from "react";
import { type AgroField, type FieldSeason, type FleetEquipment, useCreateUnplannedFieldOperation } from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";
import { Drawer, Field, SaveError, ha, handleSaveError, parseHa, useInvalidateFields } from "./shared";

export function UnplannedForm({ field, season, today, fleet, fleetLoading, fleetError, onRetry, operationSuggestions, onClose, onDone }: {
  field: AgroField; season: FieldSeason; today: string; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean; onRetry: () => void;
  operationSuggestions: string[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const mut = useCreateUnplannedFieldOperation();
  const invalidate = useInvalidateFields();
  const [saveError, setSaveError] = useState("");
  const [f, setF] = useState({ name: "", date: today, area: "", completed: false, employeeId: null as number | null, employee: "", equipmentId: "", implement: "", notes: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const unitFleet = useMemo(() => fleet.filter((x) => x.unit === field.unit), [fleet, field.unit]);
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending) return;
    const er: Record<string, string> = {};
    if (!f.name) er.name = "Выберите операцию";
    if (!f.date) er.date = "Укажите дату"; else if (f.date > today) er.date = "Дата не может быть позже сегодняшней";
    const area = f.area.trim() ? parseHa(f.area) : 0;
    if (area === null) er.area = "Число с точностью до 0,01 га";
    else if (area > season.areaHa) er.area = `Не больше площади сезона (${ha(season.areaHa)})`;
    else if (f.completed && !(area > 0)) er.area = "Для завершения укажите площадь больше нуля";
    if (!f.employeeId) er.employee = "Выберите механизатора из справочника";
    if (!f.equipmentId) er.equipment = "Выберите технику хозяйства";
    if (!f.implement.trim()) er.implement = "Укажите агрегат"; else if (f.implement.length > 200) er.implement = "Не более 200 символов";
    setErrs(er); setSaveError("");
    if (Object.keys(er).length) return;
    try {
      await mut.mutateAsync({ data: { seasonId: season.id, name: f.name, occurredOn: f.date, areaHa: area!, completed: f.completed, employeeId: f.employeeId!, equipmentId: Number(f.equipmentId), implement: f.implement.trim(), notes: f.notes } });
      await invalidate();
      onDone(`Внеплановая операция «${f.name}» на поле № ${field.number} записана${f.completed ? " и завершена" : ""}: ${ha(area!)}.`);
    } catch (err) { handleSaveError(err, false, (m) => setSaveError(m)); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title="Внеплановая операция" eyebrow={`Поле № ${field.number} · ${season.year} · ${season.cropName} · ${ha(season.areaHa)}`} onClose={close} testId="form-unplanned"
        footer={<>
          <button type="button" className="button button-ghost" onClick={close} disabled={pending} data-testid="button-cancel-unplanned">Отмена</button>
          <button type="submit" className="button button-primary" disabled={pending} data-testid="button-save-unplanned">{pending ? "Сохраняем..." : "Записать факт"}</button>
        </>}>
        <SaveError message={saveError} conflict={false} testId="text-unplanned-error" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Работа выполнена без сезонного плана. Она попадёт в факт и ежедневный отчёт, но не увеличит процент выполнения плана.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Операция *" error={errs.name} htmlFor="un-name" wide>
            <select id="un-name" className="text-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="select-unplanned-name">
              <option value="">Выберите операцию</option>{operationSuggestions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Дата *" error={errs.date} htmlFor="un-date"><input id="un-date" type="date" max={today} className="text-input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="input-unplanned-date" /></Field>
          <Field label="Выполнено, га" error={errs.area} hint={`0 – начало без площади; до ${ha(season.areaHa)}`} htmlFor="un-area"><input id="un-area" className="text-input font-mono" inputMode="decimal" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} data-testid="input-unplanned-area" /></Field>
          <Field label="Механизатор *" error={errs.employee} htmlFor="un-emp"><EmployeeSelect id="un-emp" value={{ id: f.employeeId, name: f.employee }} onChange={(v) => setF({ ...f, employeeId: v.id, employee: v.name })} invalid={Boolean(errs.employee)} testId="input-unplanned-employee" /></Field>
          <Field label="Техника *" error={errs.equipment} htmlFor="un-eq">
            <div className="space-y-1.5">
              {fleetError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[10px] text-destructive" role="alert">Не удалось загрузить справочник техники.<button type="button" className="ml-2 underline" onClick={onRetry} data-testid="button-unplanned-fleet-retry">Повторить</button></div>}
              {!fleetLoading && !fleetError && unitFleet.length === 0 && <p className="text-[10px] text-muted-foreground">Нет техники хозяйства {field.unit}.</p>}
              <select id="un-eq" className="text-input" disabled={fleetLoading || fleetError} value={f.equipmentId} onChange={(e) => setF({ ...f, equipmentId: e.target.value })} data-testid="select-unplanned-equipment">
                <option value="">{fleetLoading ? "Загрузка справочника…" : "Выберите технику"}</option>
                {unitFleet.map((x) => <option key={x.id} value={x.id}>{x.kind} · {x.registrationNumber || "без госномера"}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Агрегат *" error={errs.implement} htmlFor="un-impl"><input id="un-impl" className="text-input" maxLength={200} value={f.implement} onChange={(e) => setF({ ...f, implement: e.target.value })} data-testid="input-unplanned-implement" /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-xs font-semibold" htmlFor="un-done"><input id="un-done" type="checkbox" checked={f.completed} onChange={(e) => setF({ ...f, completed: e.target.checked })} data-testid="checkbox-unplanned-completed" />Операция завершена</label>
          <Field label="Примечания" htmlFor="un-notes" wide><textarea id="un-notes" className="text-input min-h-[72px]" maxLength={3000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-unplanned-notes" /></Field>
        </div>
      </Drawer>
    </form>
  );
}
