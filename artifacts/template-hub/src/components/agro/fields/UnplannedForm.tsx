import { type FormEvent, useMemo, useState } from "react";
import { type AgroField, type FieldSeason, type FleetEquipment, useCreateUnplannedFieldOperation } from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";
import { Drawer, Field, SaveError, ha, handleSaveError } from "./shared";
import { useInvalidateWork } from "./WorkForms";
import { ChemicalPlanEditor, type ChemRow, chemPlanOf } from "./ChemicalPlanEditor";

/** Agronomist request for unplanned work: goes to chief agronomist for approval, not started yet. */
export function UnplannedForm({ field, season, today, fleet, fleetLoading, fleetError, onRetry, operationSuggestions, onClose, onDone }: {
  field: AgroField; season: FieldSeason; today: string; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean; onRetry: () => void;
  operationSuggestions: string[]; onClose: () => void; onDone: (msg: string) => void;
}) {
  const mut = useCreateUnplannedFieldOperation();
  const invalidate = useInvalidateWork();
  const [saveError, setSaveError] = useState("");
  const [f, setF] = useState({ name: "", date: today, employeeId: null as number | null, employee: "", equipmentId: "", implement: "", notes: "", requiresChemicals: false });
  const [chemRows, setChemRows] = useState<ChemRow[]>([]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const unitFleet = useMemo(() => fleet.filter((x) => x.unit === field.unit), [fleet, field.unit]);
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending) return;
    const er: Record<string, string> = {};
    if (!f.name) er.name = "Выберите операцию";
    if (!f.date) er.date = "Укажите предполагаемую дату";
    if (!f.employeeId) er.employee = "Выберите механизатора из справочника";
    if (!f.equipmentId) er.equipment = "Выберите технику хозяйства";
    if (!f.implement.trim()) er.implement = "Укажите агрегат"; else if (f.implement.length > 200) er.implement = "Не более 200 символов";
    const chem = chemPlanOf(f.requiresChemicals ? chemRows : []);
    if (chem.error) er.chem = chem.error;
    else if (f.requiresChemicals && !chem.plan.length) er.chem = "Укажите хотя бы один препарат и норму расхода на гектар.";
    setErrs(er); setSaveError("");
    if (Object.keys(er).length) return;
    try {
      await mut.mutateAsync({ data: {
        seasonId: season.id, name: f.name, occurredOn: f.date, areaHa: 0, completed: false, employeeId: f.employeeId!, equipmentId: Number(f.equipmentId),
        implement: f.implement.trim(), notes: f.notes, requiresChemicals: f.requiresChemicals, chemicalPlan: f.requiresChemicals ? chem.plan : [],
      } });
      await invalidate();
      onDone(`Заявка на внеплановую работу «${f.name}» по полю № ${field.number} отправлена главному агроному. Начать её можно после согласования.`);
    } catch (err) { handleSaveError(err, false, (m) => setSaveError(m)); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title="Внеплановая работа" eyebrow={`Заявка · поле № ${field.number} · ${season.year} · ${season.cropName} · ${ha(season.areaHa)}`} onClose={close} testId="form-unplanned"
        footer={<>
          <button type="button" className="button button-ghost" onClick={close} disabled={pending} data-testid="button-cancel-unplanned">Отмена</button>
          <button type="submit" className="button button-primary" disabled={pending} data-testid="button-save-unplanned">{pending ? "Отправляем..." : "Отправить на согласование"}</button>
        </>}>
        <SaveError message={saveError} conflict={false} testId="text-unplanned-error" />
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">Работы нет в сезонном плане. Заявка уйдёт главному агроному; после согласования вы сможете начать работу. Площадь по дням вносит диспетчер, до {ha(season.areaHa)}.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Операция *" error={errs.name} htmlFor="un-name" wide>
            <select id="un-name" className="text-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="select-unplanned-name">
              <option value="">Выберите операцию</option>{operationSuggestions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </Field>
          <Field label="Предполагаемая дата *" error={errs.date} htmlFor="un-date"><input id="un-date" type="date" className="text-input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} data-testid="input-unplanned-date" /></Field>
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
          <label className="flex items-start gap-2 text-xs font-semibold sm:col-span-2" htmlFor="un-chem">
            <input id="un-chem" type="checkbox" className="mt-0.5" checked={f.requiresChemicals} onChange={(e) => setF({ ...f, requiresChemicals: e.target.checked })} data-testid="checkbox-unplanned-requires-chemicals" />
            <span>Требуется химия<span className="block text-[10.5px] font-normal text-muted-foreground">Предложите нормы на гектар — главный агроном согласует их вместе с работой.</span></span>
          </label>
          {f.requiresChemicals && <div className="sm:col-span-2"><ChemicalPlanEditor farm={field.unit} areaHa={season.areaHa} rows={chemRows} onChange={setChemRows} error={errs.chem} testId="unplanned-chem-plan" /></div>}
          <Field label="Обоснование / примечания" htmlFor="un-notes" wide><textarea id="un-notes" className="text-input min-h-[72px]" maxLength={3000} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} data-testid="input-unplanned-notes" /></Field>
        </div>
      </Drawer>
    </form>
  );
}
