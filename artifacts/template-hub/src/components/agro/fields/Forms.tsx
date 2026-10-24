import { type FormEvent, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  type AgroField,
  type FleetEquipment,
  type FieldOperation,
  type FieldSeason,
  useCreateAgroField,
  useCreateFieldOperation,
  useCreateFieldOperationProgress,
  useCreateFieldSeason,
  useUpdateAgroField,
  useUpdateFieldOperation,
  useUpdateFieldOperationActual,
  useUpdateFieldOperationProgress,
  useUpdateFieldSeason,
  useVoidFieldOperation,
} from "@workspace/api-client-react";
import EmployeeSelect from "../../employees/EmployeeSelect";
import { Drawer, Field, OP_SUGGESTIONS, SaveError, UNITS, type Unit, dateFmt, errorInfo, ha, handleSaveError, haStr, isGD, parseHa, useInvalidateFields } from "./shared";

type Done = (msg: string) => void;
const MAX_AREA = 1_000_000;

function Footer({ pending, conflict, onCancel, prefix, label = "Сохранить" }: { pending: boolean; conflict: boolean; onCancel: () => void; prefix: string; label?: string }) {
  return <>
    <button type="button" className="button button-ghost" onClick={onCancel} disabled={pending} data-testid={`button-cancel-${prefix}`}>Отмена</button>
    <button type="submit" className="button button-primary" disabled={pending || conflict} data-testid={`button-save-${prefix}`}>{pending ? "Сохраняем..." : label}</button>
  </>;
}

function EquipmentSelect({ value, fleet, loading, failed, onRetry, onChange, id, testId }: {
  value: string;
  fleet: FleetEquipment[];
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  onChange: (value: string) => void;
  id: string;
  testId: string;
}) {
  const labelOf = (item: FleetEquipment) => `${item.kind} · ${item.registrationNumber || "без госномера"}`;
  const selectedExists = fleet.some((item) => labelOf(item) === value);
  return (
    <div className="space-y-1.5">
      {failed && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-[10px] leading-4 text-destructive" role="alert">
          Не удалось загрузить справочник техники.
          <button type="button" className="ml-2 underline" onClick={onRetry} data-testid={`${testId}-retry`}>Повторить</button>
        </div>
      )}
      {!loading && !failed && fleet.length === 0 && <p className="text-[10px] text-muted-foreground">Справочник пуст. Добавьте технику в разделе инженерии.</p>}
      {value && !selectedExists && (
        <p className="text-[10px] text-amber-700">Сохранено ранее; этой записи нет в текущем справочнике.</p>
      )}
      <select id={id} className="text-input" value={value} onChange={(event) => onChange(event.target.value)} disabled={loading || failed} data-testid={testId}>
        <option value="">{loading ? "Загрузка справочника…" : "Выберите технику из справочника"}</option>
        {value && !selectedExists && <option value={value}>{value} · сохранено ранее</option>}
        {fleet.map((item) => {
          const label = labelOf(item);
          return <option key={item.id} value={label}>{label} — {item.unit}</option>;
        })}
      </select>
    </div>
  );
}

function useErr() {
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  return { saveError, conflict, set: (m: string, c: boolean) => { setSaveError(m); setConflict(c); }, clear: () => { setSaveError(""); } };
}

/* ---------------- Field (directory) ---------------- */
type Row = { number: string; area: string; notes: string };
const emptyRow = (): Row => ({ number: "", area: "", notes: "" });

export function FieldForm({ role, field, fields, defaultUnit, onClose, onDone }: { role: string; field: AgroField | null; fields: AgroField[]; defaultUnit: Unit; onClose: () => void; onDone: Done }) {
  const create = useCreateAgroField();
  const update = useUpdateAgroField();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const [unit, setUnit] = useState<Unit>(field ? (field.unit as Unit) : defaultUnit);
  const [rows, setRows] = useState<Row[]>(field ? [{ number: field.number, area: haStr(field.areaHa), notes: field.notes }] : [emptyRow()]);
  const [active, setActive] = useState(field ? field.isActive : true);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pending = busy || create.isPending || update.isPending;
  const gd = isGD(role);
  const lockedArchived = !!field && !field.isActive && !gd;
  const close = () => { if (!pending) onClose(); };
  const setRow = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict || lockedArchived) return;
    const er: Record<string, string> = {};
    const seen = new Set<string>();
    rows.forEach((r, i) => {
      const n = r.number.trim();
      if (!n) er[`number-${i}`] = "Укажите № поля"; else if (n.length > 80) er[`number-${i}`] = "Не более 80 символов";
      const key = n.toUpperCase();
      if (n && seen.has(key)) er[`number-${i}`] = "Повтор в списке";
      if (n && fields.some((f) => f.id !== field?.id && f.unit === unit && f.number.trim().toUpperCase() === key)) er[`number-${i}`] = "Уже есть в этом хозяйстве";
      seen.add(key);
      const a = parseHa(r.area);
      if (a === null || a < 0.01 || a > MAX_AREA) er[`area-${i}`] = "Площадь от 0,01 до 1 000 000 га, до 2 знаков";
      if (r.notes.length > 3000) er[`notes-${i}`] = "Не более 3000 символов";
    });
    setErrs(er); e.clear();
    if (Object.keys(er).length) return;
    setBusy(true);
    try {
      if (field) {
        const r = rows[0];
        await update.mutateAsync({ id: field.id, data: { unit, number: r.number.trim(), areaHa: parseHa(r.area)!, notes: r.notes, isActive: gd ? active : field.isActive, version: field.version } });
        await invalidate();
        onDone(`Поле № ${r.number.trim()} обновлено.`);
      } else {
        let saved = 0;
        try {
          for (const r of rows) {
            await create.mutateAsync({ data: { unit, number: r.number.trim(), areaHa: parseHa(r.area)!, notes: r.notes, isActive: true } });
            saved += 1;
          }
        } finally {
          if (saved) { setRows((rs) => rs.slice(saved)); await invalidate(); }
        }
        onDone(`В справочник добавлено полей: ${saved}.`);
      }
    } catch (err) {
      if (!field && rows.length > 1) { const info = errorInfo(err); e.set(`${info.message} Сохранённые строки убраны из формы; исправьте оставшиеся.`, false); }
      else handleSaveError(err, !!field, e.set);
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={field ? `Поле № ${field.number}` : "Новые поля"} eyebrow={field ? `Справочник · версия ${field.version}` : "Справочник полей"} onClose={close} testId="form-agro-field"
        footer={<Footer pending={pending} conflict={e.conflict || lockedArchived} onCancel={close} prefix="agro-field" label={field ? "Сохранить" : `Добавить${rows.length > 1 ? ` (${rows.length})` : ""}`} />}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-agro-field-error" />
        {lockedArchived && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900" data-testid="text-field-archived-locked">Поле в архиве. Изменять и восстанавливать его может только генеральный директор.</p>}
        <Field label="Хозяйство" htmlFor="af-unit">
          <select id="af-unit" className="text-input" value={unit} onChange={(ev) => setUnit(ev.target.value as Unit)} disabled={pending} data-testid="select-agro-field-unit">{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        </Field>
        <div className="space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 rounded-lg border border-border p-3" data-testid={`row-agro-field-input-${i}`}>
              <Field label="№ поля *" error={errs[`number-${i}`]} htmlFor={`af-n-${i}`}><input id={`af-n-${i}`} className="text-input font-mono" maxLength={80} value={r.number} placeholder="12А" onChange={(ev) => setRow(i, "number", ev.target.value)} data-testid={`input-agro-field-number-${i}`} /></Field>
              <Field label="Площадь, га *" error={errs[`area-${i}`]} htmlFor={`af-a-${i}`}><input id={`af-a-${i}`} className="text-input font-mono" inputMode="decimal" value={r.area} placeholder="245,6" onChange={(ev) => setRow(i, "area", ev.target.value)} data-testid={`input-agro-field-area-${i}`} /></Field>
              <div className="self-end pb-0.5">{!field && rows.length > 1 && <button type="button" className="icon-button" aria-label="Убрать строку" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} disabled={pending} data-testid={`button-remove-agro-field-row-${i}`}><Trash2 size={14} /></button>}</div>
              <div className="col-span-3"><Field label="Примечание" error={errs[`notes-${i}`]} htmlFor={`af-notes-${i}`}><input id={`af-notes-${i}`} className="text-input" maxLength={3000} value={r.notes} onChange={(ev) => setRow(i, "notes", ev.target.value)} data-testid={`input-agro-field-notes-${i}`} /></Field></div>
            </div>
          ))}
          {!field && <button type="button" className="button button-secondary" onClick={() => setRows((rs) => [...rs, emptyRow()])} disabled={pending || rows.length >= 50} data-testid="button-add-agro-field-row"><Plus size={14} />Ещё поле</button>}
        </div>
        {field && gd && (
          <label className="flex items-center gap-2 text-xs font-semibold" htmlFor="af-active">
            <input id="af-active" type="checkbox" checked={active} onChange={(ev) => setActive(ev.target.checked)} disabled={pending} data-testid="checkbox-agro-field-active" />
            Поле в работе (снимите отметку, чтобы отправить в архив; история сохранится)
          </label>
        )}
      </Drawer>
    </form>
  );
}

/* ---------------- Season ---------------- */
export function SeasonForm({ season, fields, seasons, cropSuggestions, defaultYear, defaultFieldId, onClose, onDone }: { season: FieldSeason | null; fields: AgroField[]; seasons: FieldSeason[]; cropSuggestions: string[]; defaultYear: number; defaultFieldId?: number; onClose: () => void; onDone: Done }) {
  const create = useCreateFieldSeason();
  const update = useUpdateFieldSeason();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const fieldOptions = useMemo(() => fields.filter((f) => f.isActive || f.id === season?.fieldId), [fields, season]);
  const initField = season?.fieldId ?? defaultFieldId ?? fieldOptions[0]?.id ?? 0;
  const [f, setF] = useState({
    fieldId: String(initField), year: String(season?.year ?? defaultYear), cropName: season?.cropName ?? "", variety: season?.variety ?? "",
    area: season ? haStr(season.areaHa) : haStr(fields.find((x) => x.id === initField)?.areaHa ?? 0).replace(/^0$/, ""), notes: season?.notes ?? "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const pending = create.isPending || update.isPending;
  const close = () => { if (!pending) onClose(); };
  const field = fields.find((x) => x.id === Number(f.fieldId));
  const crops = useMemo(() => Array.from(new Set([...cropSuggestions, "Пар"])), [cropSuggestions]);

  const pickField = (id: string) => {
    const nf = fields.find((x) => x.id === Number(id));
    setF((s) => ({ ...s, fieldId: id, area: !season && nf ? haStr(nf.areaHa) : s.area }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const er: Record<string, string> = {};
    const year = Number(f.year);
    if (!field) er.fieldId = "Выберите поле";
    if (!/^\d{4}$/.test(f.year) || year < 2000 || year > 2100) er.year = "Год от 2000 до 2100";
    const crop = f.cropName.trim();
    if (!crop) er.cropName = "Укажите культуру или «Пар»"; else if (crop.length > 100) er.cropName = "Не более 100 символов";
    if (f.variety.length > 200) er.variety = "Не более 200 символов";
    const area = parseHa(f.area);
    if (area === null || area < 0.01) er.area = "Площадь от 0,01 га, до 2 знаков";
    else if (field && area > field.areaHa && (!season || season.fieldId !== field.id || area !== season.areaHa)) er.area = `Не больше площади поля (${ha(field.areaHa)})`;
    if (field && !er.year && seasons.some((s) => s.id !== season?.id && s.fieldId === field.id && s.year === year)) er.year = `На поле № ${field.number} уже есть сезон ${year}`;
    setErrs(er); e.clear();
    if (Object.keys(er).length) return;
    const data = { fieldId: Number(f.fieldId), year, cropName: crop, variety: f.variety.trim(), areaHa: area!, notes: f.notes };
    try {
      if (season) await update.mutateAsync({ id: season.id, data: { ...data, version: season.version } });
      else await create.mutateAsync({ data });
      await invalidate();
      onDone(`Сезон ${year} · поле № ${field!.number} · ${crop} сохранён.`);
    } catch (err) { handleSaveError(err, !!season, e.set); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={season ? "Сезон поля" : "Новый сезон севооборота"} eyebrow={season ? `Версия ${season.version} · изм. ${dateFmt(season.updatedAt)} · ${season.updatedBy}` : "Севооборот"} onClose={close} testId="form-season"
        footer={<Footer pending={pending} conflict={e.conflict} onCancel={close} prefix="season" />}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-season-error" />
        {fieldOptions.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="text-season-no-fields">Нет действующих полей. Сначала добавьте поле в справочник.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Поле *" error={errs.fieldId} htmlFor="ss-field" wide>
              <select id="ss-field" className="text-input" value={f.fieldId} onChange={(ev) => pickField(ev.target.value)} data-testid="select-season-field">
                {fieldOptions.map((x) => <option key={x.id} value={x.id}>№ {x.number} · {x.unit} · {ha(x.areaHa)}{x.isActive ? "" : " (архив)"}</option>)}
              </select>
            </Field>
            <Field label="Год *" error={errs.year} htmlFor="ss-year"><input id="ss-year" className="text-input font-mono" inputMode="numeric" maxLength={4} value={f.year} onChange={(ev) => setF({ ...f, year: ev.target.value })} data-testid="input-season-year" /></Field>
            <Field label="Площадь сезона, га *" error={errs.area} hint={field ? `Площадь поля ${ha(field.areaHa)}` : undefined} htmlFor="ss-area"><input id="ss-area" className="text-input font-mono" inputMode="decimal" value={f.area} onChange={(ev) => setF({ ...f, area: ev.target.value })} data-testid="input-season-area" /></Field>
            <Field label="Культура *" error={errs.cropName} hint="Для чистого пара укажите «Пар»" htmlFor="ss-crop">
              <input id="ss-crop" className="text-input" list="ss-crop-list" maxLength={100} value={f.cropName} onChange={(ev) => setF({ ...f, cropName: ev.target.value })} data-testid="input-season-crop" />
              <datalist id="ss-crop-list">{crops.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Сорт / гибрид" error={errs.variety} htmlFor="ss-variety"><input id="ss-variety" className="text-input" maxLength={200} value={f.variety} onChange={(ev) => setF({ ...f, variety: ev.target.value })} data-testid="input-season-variety" /></Field>
            <Field label="Примечания" htmlFor="ss-notes" wide><textarea id="ss-notes" className="text-input min-h-[72px]" maxLength={3000} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} data-testid="input-season-notes" /></Field>
          </div>
        )}
      </Drawer>
    </form>
  );
}

/* ---------------- Operation plan ---------------- */
export function OperationForm({ op, seasons, fields, fleet, fleetLoading, fleetError, onRetry, defaultSeasonId, onClose, onDone }: { op: FieldOperation | null; seasons: FieldSeason[]; fields: AgroField[]; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean; onRetry: () => void; defaultSeasonId?: number; onClose: () => void; onDone: Done }) {
  const create = useCreateFieldOperation();
  const update = useUpdateFieldOperation();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const fieldById = useMemo(() => new Map(fields.map((x) => [x.id, x])), [fields]);
  const options = useMemo(() => seasons.filter((s) => s.id === op?.seasonId || fieldById.get(s.fieldId)?.isActive).sort((a, b) => b.year - a.year || (fieldById.get(a.fieldId)?.number ?? "").localeCompare(fieldById.get(b.fieldId)?.number ?? "", "ru", { numeric: true })), [seasons, op, fieldById]);
  const initSeason = op?.seasonId ?? defaultSeasonId ?? options[0]?.id ?? 0;
  const [f, setF] = useState({
    seasonId: String(initSeason), name: op?.name ?? "", plannedStart: op?.plannedStart?.slice(0, 10) ?? "", plannedEnd: op?.plannedEnd?.slice(0, 10) ?? "",
     area: op ? haStr(op.plannedAreaHa) : (() => { const s = seasons.find((x) => x.id === initSeason); return s ? haStr(s.areaHa) : ""; })(),
     plannedRate: op ? String(op.plannedRatePerHa) : "",
     responsible: op?.responsible ?? "", plannedEquipment: op?.plannedEquipment ?? "", plannedImplement: op?.plannedImplement ?? "", notes: op?.notes ?? "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const pending = create.isPending || update.isPending;
  const close = () => { if (!pending) onClose(); };
  const season = seasons.find((s) => s.id === Number(f.seasonId));
  const label = (s: FieldSeason) => `${s.year} · поле № ${fieldById.get(s.fieldId)?.number ?? s.fieldId} · ${s.cropName} · ${ha(s.areaHa)}`;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const er: Record<string, string> = {};
    if (!season) er.seasonId = "Выберите сезон";
    const name = f.name.trim();
    if (!name) er.name = "Укажите операцию"; else if (name.length > 150) er.name = "Не более 150 символов";
    if (!f.plannedStart) er.plannedStart = "Укажите дату";
    if (!f.plannedEnd) er.plannedEnd = "Укажите дату";
    else if (f.plannedStart && f.plannedEnd < f.plannedStart) er.plannedEnd = "Раньше планового начала";
    const area = parseHa(f.area);
    if (area === null || area < 0.01) er.area = "Площадь от 0,01 га, до 2 знаков";
    else if (season && area > season.areaHa) er.area = `Не больше площади сезона (${ha(season.areaHa)})`;
    else if (op && area < op.actualAreaHa) er.area = `Не меньше уже выполненного (${ha(op.actualAreaHa)})`;
    const plannedRate = f.plannedRate.trim() ? Number(f.plannedRate.trim().replace(",", ".")) : null;
    if (plannedRate === null || !Number.isFinite(plannedRate) || plannedRate <= 0 || plannedRate > 1_000_000_000) er.plannedRate = "Укажите положительную расценку за гектар";
    if (f.responsible.length > 200) er.responsible = "Не более 200 символов";
    if (f.plannedEquipment.length > 200) er.plannedEquipment = "Не более 200 символов";
    if (f.plannedImplement.length > 200) er.plannedImplement = "Не более 200 символов";
    setErrs(er); e.clear();
    if (Object.keys(er).length) return;
    const data = { seasonId: Number(f.seasonId), name, plannedStart: f.plannedStart, plannedEnd: f.plannedEnd, plannedAreaHa: area!, plannedRatePerHa: plannedRate!, responsible: f.responsible.trim(), plannedEquipment: f.plannedEquipment.trim(), plannedImplement: f.plannedImplement.trim(), notes: f.notes };
    try {
      if (op) await update.mutateAsync({ id: op.id, data: { ...data, version: op.version } });
      else await create.mutateAsync({ data });
      await invalidate();
      onDone(`План «${name}» сохранён.`);
    } catch (err) { handleSaveError(err, !!op, e.set); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={op ? "План операции" : "Новая полевая операция"} eyebrow={op ? `Версия ${op.version} · изм. ${dateFmt(op.updatedAt)} · ${op.updatedBy}` : "План работ"} onClose={close} testId="form-operation"
        footer={<Footer pending={pending} conflict={e.conflict} onCancel={close} prefix="operation" />}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-operation-error" />
        {op && op.actualAreaHa > 0 && <p className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">По операции уже есть факт ({ha(op.actualAreaHa)}). Сезон и название после начала работ сервер не изменит, план нельзя уменьшить ниже факта. Факт здесь не редактируется.</p>}
        {options.length === 0 ? <p className="text-xs text-muted-foreground" data-testid="text-operation-no-seasons">Нет сезонов на действующих полях. Сначала запланируйте севооборот.</p> : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Сезон поля *" error={errs.seasonId} htmlFor="op-season" wide>
              <select id="op-season" className="text-input" value={f.seasonId} onChange={(ev) => { const s = seasons.find((x) => x.id === Number(ev.target.value)); setF({ ...f, seasonId: ev.target.value, area: !op && s ? haStr(s.areaHa) : f.area }); }} data-testid="select-operation-season">
                {options.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}
              </select>
            </Field>
            <Field label="Операция *" error={errs.name} htmlFor="op-name" wide>
              <input id="op-name" className="text-input" list="op-name-list" maxLength={150} value={f.name} onChange={(ev) => setF({ ...f, name: ev.target.value })} placeholder="Посев" data-testid="input-operation-name" />
              <datalist id="op-name-list">{OP_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Плановое начало *" error={errs.plannedStart} htmlFor="op-ps"><input id="op-ps" type="date" className="text-input" value={f.plannedStart} onChange={(ev) => setF({ ...f, plannedStart: ev.target.value })} data-testid="input-operation-planned-start" /></Field>
            <Field label="Плановое окончание *" error={errs.plannedEnd} htmlFor="op-pe"><input id="op-pe" type="date" className="text-input" value={f.plannedEnd} onChange={(ev) => setF({ ...f, plannedEnd: ev.target.value })} data-testid="input-operation-planned-end" /></Field>
            <Field label="Плановая площадь, га *" error={errs.area} hint={season ? `Площадь сезона ${ha(season.areaHa)}` : undefined} htmlFor="op-area"><input id="op-area" className="text-input font-mono" inputMode="decimal" value={f.area} onChange={(ev) => setF({ ...f, area: ev.target.value })} data-testid="input-operation-area" /></Field>
            <Field label="Плановая расценка, ₸/га *" error={errs.plannedRate} htmlFor="op-rate"><input id="op-rate" type="number" min="0.01" step="0.01" className="text-input font-mono" inputMode="decimal" value={f.plannedRate} onChange={(ev) => setF({ ...f, plannedRate: ev.target.value })} data-testid="input-operation-planned-rate" /></Field>
            <Field label="Ответственный" error={errs.responsible} htmlFor="op-resp"><input id="op-resp" className="text-input" maxLength={200} value={f.responsible} onChange={(ev) => setF({ ...f, responsible: ev.target.value })} data-testid="input-operation-responsible" /></Field>
            <Field label="Техника по плану" error={errs.plannedEquipment} hint="Выберите из общего справочника техники" htmlFor="op-equipment"><EquipmentSelect id="op-equipment" testId="select-operation-equipment" value={f.plannedEquipment} fleet={fleet} loading={fleetLoading} failed={fleetError} onRetry={onRetry} onChange={(plannedEquipment) => setF({ ...f, plannedEquipment })} /></Field>
            <Field label="Агрегат по плану" error={errs.plannedImplement} hint="Например, сеялка СЗС-2.1" htmlFor="op-implement"><input id="op-implement" className="text-input" maxLength={200} value={f.plannedImplement} onChange={(ev) => setF({ ...f, plannedImplement: ev.target.value })} data-testid="input-operation-implement" /></Field>
            <Field label="Примечания" htmlFor="op-notes" wide><textarea id="op-notes" className="text-input min-h-[72px]" maxLength={3000} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} data-testid="input-operation-notes" /></Field>
          </div>
        )}
      </Drawer>
    </form>
  );
}

/* ---------------- Actual ---------------- */
export function ActualForm({ op, title, today, fleet, fleetLoading, fleetError, onRetry, onClose, onDone }: { op: FieldOperation; title: string; today: string; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean; onRetry: () => void; onClose: () => void; onDone: Done }) {
  const mut = useUpdateFieldOperationActual();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const starting = !op.actualStart;
  const [f, setF] = useState({
    start: op.actualStart?.slice(0, 10) ?? "", end: op.actualEnd?.slice(0, 10) ?? "",
    area: op.actualAreaHa > 0 ? haStr(op.actualAreaHa) : "", notes: op.actualNotes ?? "",
    operationName: op.actualOperationName || op.name, mechanic: op.actualMechanic ?? "", mechanicId: op.actualMechanicEmployeeId ?? null as number | null,
    equipment: op.actualEquipment || op.plannedEquipment, implement: op.actualImplement || op.plannedImplement,
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };
  const parsed = f.area.trim() === "" ? 0 : parseHa(f.area);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const er: Record<string, string> = {};
    if (starting) {
      if (!f.operationName.trim()) er.operationName = "Укажите вид операции";
      if (f.operationName.trim().length > 150) er.operationName = "Не более 150 символов";
      if (!f.mechanicId) er.mechanic = "Выберите механизатора из справочника";
      if (!f.equipment.trim()) er.equipment = "Укажите технику";
      if (!f.implement.trim()) er.implement = "Укажите агрегат";
    } else {
      if (parsed === null) er.area = "Число с точностью до 0,01 га";
      else if (parsed > op.plannedAreaHa) er.area = `Не больше плана (${ha(op.plannedAreaHa)})`;
      else if (!(parsed > 0)) er.area = "Укажите фактическую площадь";
      if (!f.end) er.end = "Укажите дату завершения";
      if (!f.mechanicId) er.mechanic = "Выберите механизатора из справочника";
      if (!f.equipment.trim()) er.equipment = "Укажите технику";
      if (!f.implement.trim()) er.implement = "Укажите агрегат";
    }
    if (f.start && f.start > today) er.start = "Дата не может быть позже сегодняшней";
    if (!f.start) er.start = "Укажите фактическую дату начала";
    if (!starting && f.end && f.end > today) er.end = "Дата не может быть позже сегодняшней";
    if (!starting && f.end && f.start && f.end < f.start) er.end = "Раньше фактического начала";
    setErrs(er); e.clear();
    if (Object.keys(er).length) return;
    try {
      await mut.mutateAsync({ id: op.id, data: {
        version: op.version, actualStart: f.start || null, actualEnd: starting ? null : f.end || null,
        actualAreaHa: starting ? 0 : parsed ?? 0, actualOperationName: f.operationName.trim(),
        actualMechanic: f.mechanic.trim(), actualMechanicEmployeeId: f.mechanicId, actualEquipment: f.equipment.trim(), actualImplement: f.implement.trim(), actualNotes: f.notes,
      } });
      await invalidate();
      onDone(starting ? `Начало операции «${f.operationName.trim()}» зафиксировано.` : `Операция «${op.name}» завершена: ${ha(parsed ?? 0)}. Данные переданы диспетчеру для ввода фактической расценки.`);
    } catch (err) { handleSaveError(err, true, e.set); }
  };

  const cov = parsed && op.plannedAreaHa > 0 ? (parsed / op.plannedAreaHa) * 100 : 0;
  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={starting ? "Начать операцию" : op.actualEnd ? "Изменить факт завершения" : "Завершить операцию"} eyebrow={`${title} · версия ${op.version}`} onClose={close} testId="form-actual"
        footer={<Footer pending={pending} conflict={e.conflict} onCancel={close} prefix="actual" label={starting ? "Зафиксировать начало" : "Завершить операцию"} />}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-actual-error" />
        <div className="rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-5" data-testid="text-actual-plan">
          План: {dateFmt(op.plannedStart)} – {dateFmt(op.plannedEnd)} · {ha(op.plannedAreaHa)}{op.responsible ? ` · ${op.responsible}` : ""}
          {op.plannedEquipment && <><br />Техника: {op.plannedEquipment}</>}{op.plannedImplement && <> · агрегат: {op.plannedImplement}</>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {starting ? <>
            <Field label="Фактическое начало *" error={errs.start} htmlFor="ac-start"><input id="ac-start" type="date" max={today} className="text-input" value={f.start} onChange={(ev) => setF({ ...f, start: ev.target.value })} data-testid="input-actual-start" /></Field>
            <Field label="Вид операции *" error={errs.operationName} htmlFor="ac-operation-name"><input id="ac-operation-name" className="text-input" maxLength={150} value={f.operationName} onChange={(ev) => setF({ ...f, operationName: ev.target.value })} data-testid="input-actual-operation-name" /></Field>
          </> : <>
            <Field label="Фактическое начало" error={errs.start} htmlFor="ac-start"><input id="ac-start" type="date" className="text-input" value={f.start} readOnly data-testid="input-actual-start" /></Field>
            <Field label="Фактическое окончание *" error={errs.end} htmlFor="ac-end"><input id="ac-end" type="date" max={today} className="text-input" value={f.end} onChange={(ev) => setF({ ...f, end: ev.target.value })} data-testid="input-actual-end" /></Field>
            <Field label="Фактическая площадь, га *" error={errs.area} hint={parsed ? `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(cov)}% от плана` : "Можно завершить меньшей площадью, чем запланировано"} htmlFor="ac-area" wide>
              <input id="ac-area" className="text-input font-mono" inputMode="decimal" value={f.area} onChange={(ev) => setF({ ...f, area: ev.target.value })} data-testid="input-actual-area" />
            </Field>
          </>}
          <Field label="Механизатор *" error={errs.mechanic} htmlFor="ac-mechanic"><EmployeeSelect id="ac-mechanic" value={{ id: f.mechanicId, name: f.mechanic }} onChange={(v) => setF({ ...f, mechanicId: v.id, mechanic: v.name })} invalid={Boolean(errs.mechanic)} testId="input-actual-mechanic" /></Field>
          <Field label="Фактическая техника *" error={errs.equipment} hint="Выберите из справочника; можно изменить относительно плана" htmlFor="ac-equipment"><EquipmentSelect id="ac-equipment" testId="select-actual-equipment" value={f.equipment} fleet={fleet} loading={fleetLoading} failed={fleetError} onRetry={onRetry} onChange={(equipment) => setF({ ...f, equipment })} /></Field>
          <Field label="Фактический агрегат *" error={errs.implement} hint="Можно изменить относительно плана" htmlFor="ac-implement"><input id="ac-implement" className="text-input" maxLength={200} value={f.implement} onChange={(ev) => setF({ ...f, implement: ev.target.value })} data-testid="input-actual-implement" /></Field>
          <Field label="Примечание к факту" htmlFor="ac-notes" wide><textarea id="ac-notes" className="text-input min-h-[72px]" maxLength={3000} value={f.notes} onChange={(ev) => setF({ ...f, notes: ev.target.value })} data-testid="input-actual-notes" /></Field>
        </div>
      </Drawer>
    </form>
  );
}

/* ---------------- Daily cumulative progress ---------------- */
export function ProgressForm({ op, title, today, fleet, fleetLoading, fleetError, onRetry, onClose, onDone }: {
  op: FieldOperation; title: string; today: string; fleet: FleetEquipment[]; fleetLoading: boolean; fleetError: boolean;
  onRetry: () => void; onClose: () => void; onDone: Done;
}) {
  const create = useCreateFieldOperationProgress();
  const update = useUpdateFieldOperationProgress();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const reports = useMemo(() => [...op.progressReports].sort((a, b) => a.reportDate.localeCompare(b.reportDate)), [op.progressReports]);
  const initialDate = today >= (op.actualStart ?? today) ? today : op.actualStart ?? today;
  const [reportDate, setReportDate] = useState(initialDate);
  const initialExisting = reports.find((report) => report.reportDate === initialDate);
  const initialPrevious = reports.filter((report) => report.reportDate < initialDate).at(-1);
  const [f, setF] = useState({
    area: haStr(initialExisting?.cumulativeAreaHa ?? initialPrevious?.cumulativeAreaHa ?? op.actualAreaHa),
    mechanic: initialExisting?.actualMechanic ?? op.actualMechanic,
    mechanicId: (initialExisting ? initialExisting.actualMechanicEmployeeId : op.actualMechanicEmployeeId) ?? null as number | null,
    equipment: initialExisting?.actualEquipment ?? op.actualEquipment,
    implement: initialExisting?.actualImplement ?? op.actualImplement,
    notes: initialExisting?.notes ?? "",
  });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const pending = create.isPending || update.isPending;
  const close = () => { if (!pending) onClose(); };
  const existing = reports.find((report) => report.reportDate === reportDate);
  const previous = reports.filter((report) => report.reportDate < reportDate).at(-1);
  const next = reports.find((report) => report.reportDate > reportDate);
  const parsed = f.area.trim() === "" ? null : parseHa(f.area);
  const dailyChange = parsed === null ? null : parsed - (previous?.cumulativeAreaHa ?? 0);

  const chooseDate = (date: string) => {
    const saved = reports.find((report) => report.reportDate === date);
    const prior = reports.filter((report) => report.reportDate < date).at(-1);
    setReportDate(date);
    setF({
      area: haStr(saved?.cumulativeAreaHa ?? prior?.cumulativeAreaHa ?? 0),
      mechanic: saved?.actualMechanic ?? op.actualMechanic,
      mechanicId: (saved ? saved.actualMechanicEmployeeId : op.actualMechanicEmployeeId) ?? null,
      equipment: saved?.actualEquipment ?? op.actualEquipment,
      implement: saved?.actualImplement ?? op.actualImplement,
      notes: saved?.notes ?? "",
    });
    setErrs({});
    e.clear();
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const er: Record<string, string> = {};
    if (!reportDate || reportDate < (op.actualStart ?? "") || reportDate > today) er.reportDate = "Дата должна быть между началом операции и сегодняшним днём.";
    if (parsed === null) er.area = "Укажите число с точностью до 0,01 га.";
    else if (parsed > op.plannedAreaHa) er.area = `Не больше плана (${ha(op.plannedAreaHa)}).`;
    else if (previous && parsed < previous.cumulativeAreaHa) er.area = `Не меньше предыдущего отчёта (${ha(previous.cumulativeAreaHa)}).`;
    else if (next && parsed > next.cumulativeAreaHa) er.area = `Не больше следующего отчёта (${ha(next.cumulativeAreaHa)}).`;
    if (!f.mechanicId) er.mechanic = "Выберите механизатора из справочника.";
    if (!f.equipment.trim()) er.equipment = "Выберите технику из справочника.";
    if (!f.implement.trim()) er.implement = "Укажите агрегат.";
    setErrs(er); e.clear();
    if (Object.keys(er).length || parsed === null) return;
    const data = {
      operationVersion: op.version, reportDate, cumulativeAreaHa: parsed,
      actualMechanic: f.mechanic.trim(), actualMechanicEmployeeId: f.mechanicId as number, actualEquipment: f.equipment.trim(),
      actualImplement: f.implement.trim(), notes: f.notes.trim(),
    };
    try {
      if (existing) await update.mutateAsync({ id: op.id, progressId: existing.id, data: { ...data, version: existing.version } });
      else await create.mutateAsync({ id: op.id, data });
      await invalidate();
      const increment = ha(Math.max(0, dailyChange ?? 0));
      onDone(`Отчёт за ${dateFmt(reportDate)} сохранён: прирост ${increment}, итого ${ha(parsed)}.`);
    } catch (err) { handleSaveError(err, true, e.set); }
  };

  return (
    <form onSubmit={submit} noValidate>
      <Drawer title={existing ? "Изменить дневной отчёт" : "Отчёт о ходе операции"} eyebrow={`${title} · план ${ha(op.plannedAreaHa)}`} onClose={close} testId="form-operation-progress"
        footer={<Footer pending={pending} conflict={e.conflict} onCancel={close} prefix="operation-progress" label={existing ? "Сохранить отчёт" : "Добавить отчёт"} />}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-operation-progress-error" />
        <p className="rounded-lg border border-border bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground">
          Введите общий итог выполненных гектаров на выбранную дату. Прирост относительно предыдущего отчёта и остаток до плана посчитаются автоматически.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Дата отчёта *" error={errs.reportDate} htmlFor="pr-date">
            <input id="pr-date" type="date" min={op.actualStart ?? undefined} max={today} className="text-input" value={reportDate} onChange={(event) => chooseDate(event.target.value)} data-testid="input-progress-date" />
          </Field>
          <Field label="Итого выполнено на дату, га *" error={errs.area} hint={dailyChange !== null ? `Прирост: ${ha(Math.max(0, dailyChange))} · осталось: ${ha(Math.max(0, op.plannedAreaHa - (parsed ?? 0)))}` : undefined} htmlFor="pr-area">
            <input id="pr-area" className="text-input font-mono" inputMode="decimal" value={f.area} onChange={(event) => setF({ ...f, area: event.target.value })} data-testid="input-progress-cumulative-area" />
          </Field>
          <Field label="Механизатор *" error={errs.mechanic} htmlFor="pr-mechanic">
            <EmployeeSelect id="pr-mechanic" value={{ id: f.mechanicId, name: f.mechanic }} onChange={(v) => setF({ ...f, mechanicId: v.id, mechanic: v.name })} invalid={Boolean(errs.mechanic)} testId="input-progress-mechanic" />
          </Field>
          <Field label="Техника *" error={errs.equipment} htmlFor="pr-equipment">
            <EquipmentSelect id="pr-equipment" testId="select-progress-equipment" value={f.equipment} fleet={fleet} loading={fleetLoading} failed={fleetError} onRetry={onRetry} onChange={(equipment) => setF({ ...f, equipment })} />
          </Field>
          <Field label="Агрегат *" error={errs.implement} htmlFor="pr-implement">
            <input id="pr-implement" className="text-input" maxLength={200} value={f.implement} onChange={(event) => setF({ ...f, implement: event.target.value })} data-testid="input-progress-implement" />
          </Field>
          <Field label="Примечание" htmlFor="pr-notes">
            <input id="pr-notes" className="text-input" maxLength={3000} value={f.notes} onChange={(event) => setF({ ...f, notes: event.target.value })} data-testid="input-progress-notes" />
          </Field>
        </div>
        <section className="rounded-lg border border-border p-3" aria-label="Предыдущие отчёты">
          <h3 className="text-xs font-bold">История дневных отчётов</h3>
          {reports.length === 0 ? <p className="mt-1 text-[10px] text-muted-foreground">Это первый отчёт по операции.</p> : (
            <ul className="mt-2 divide-y divide-border/70">
              {[...reports].reverse().map((report) => (
                <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[10.5px]" data-testid={`row-progress-report-${report.id}`}>
                  <span><strong>{dateFmt(report.reportDate)}</strong> · +{ha(report.dailyAreaHa)} · итого {ha(report.cumulativeAreaHa)}<br /><span className="text-muted-foreground">{report.actualMechanic} · {report.actualEquipment}{report.actualImplement ? ` · ${report.actualImplement}` : ""}</span></span>
                  <button type="button" className="button button-secondary !min-h-[28px] !px-2 text-[10px]" onClick={() => chooseDate(report.reportDate)} data-testid={`button-edit-progress-report-${report.id}`}>Изменить</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </Drawer>
    </form>
  );
}

/* ---------------- Void (cancel) ---------------- */
export function VoidDialog({ op, title, onClose, onDone }: { op: FieldOperation; title: string; onClose: () => void; onDone: Done }) {
  const mut = useVoidFieldOperation();
  const invalidate = useInvalidateFields();
  const e = useErr();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const pending = mut.isPending;
  const close = () => { if (!pending) onClose(); };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (pending || e.conflict) return;
    const r = reason.trim();
    if (r.length < 3 || r.length > 500) { setErr("Причина от 3 до 500 символов"); return; }
    setErr(""); e.clear();
    try { await mut.mutateAsync({ id: op.id, data: { version: op.version, reason: r } }); await invalidate(); onDone(`Операция «${op.name}» отменена. Запись сохранена в истории.`); }
    catch (x) { handleSaveError(x, true, e.set); }
  };
  return (
    <form onSubmit={submit} noValidate>
      <Drawer title="Отменить операцию?" eyebrow={title} onClose={close} testId="dialog-void-operation"
        footer={<><button type="button" className="button button-ghost" onClick={close} disabled={pending} data-testid="button-cancel-void">Не отменять</button>
          <button type="submit" className="button button-danger border" disabled={pending || e.conflict} data-testid="button-confirm-void">{pending ? "Отменяем..." : "Отменить операцию"}</button></>}>
        <SaveError message={e.saveError} conflict={e.conflict} testId="text-void-error" />
        <p className="text-xs leading-5 text-muted-foreground">Операция не удаляется: она останется в истории поля с пометкой «Отменена», причиной, автором и временем. В сводках плана и факта учитываться не будет.</p>
        <Field label="Причина *" error={err} htmlFor="void-reason"><textarea id="void-reason" className="text-input min-h-[80px]" maxLength={500} value={reason} onChange={(ev) => setReason(ev.target.value)} data-testid="input-void-reason" /></Field>
      </Drawer>
    </form>
  );
}
