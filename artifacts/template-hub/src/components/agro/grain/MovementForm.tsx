import { useMemo, useState } from "react";
import { useCreateGrainMovement, type GrainCrop, type GrainLocation, type GrainMovement } from "@workspace/api-client-react";
import { Drawer, ErrorBox, Field, KIND_LABEL, OP_LABEL, UNITS, type Unit, errorInfo, kg, tonsKg, useInvalidateGrain } from "./shared";

type Op = GrainMovement["operation"];
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-req`);

export default function MovementForm({ crops, locations, stock, asOfDate, defaultUnit, onClose }: { crops: GrainCrop[]; locations: GrainLocation[]; stock: (unit: string, crop: number, loc: number) => number; asOfDate: string; defaultUnit: Unit; onClose: () => void }) {
  const [requestId] = useState(uuid);
  const [f, setF] = useState({ unit: defaultUnit as Unit, operation: "receipt" as Op, cropId: "", occurredOn: asOfDate, qty: "", from: "", to: "", fieldName: "", counterparty: "", notes: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [srvErr, setSrvErr] = useState("");
  const create = useCreateGrainMovement();
  const invalidate = useInvalidateGrain();
  const close = () => { if (!create.isPending) onClose(); };
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const locs = useMemo(() => locations.filter((l) => l.unit === f.unit), [locations, f.unit]);
  const needFrom = f.operation === "transfer" || f.operation === "sale";
  const needTo = f.operation !== "sale";
  const avail = needFrom && f.cropId && f.from ? stock(f.unit, Number(f.cropId), Number(f.from)) : null;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.cropId) e.cropId = "Выберите культуру";
    if (!f.occurredOn) e.occurredOn = "Укажите дату"; else if (f.occurredOn > asOfDate) e.occurredOn = `Дата не может быть позже ${asOfDate}`;
    const q = Number(f.qty.replace(",", "."));
    if (!f.qty || !Number.isFinite(q) || q <= 0) e.qty = "Положительное число тонн"; else if (q > 1e6) e.qty = "Не более 1 000 000 т"; else if (Number(q.toFixed(3)) !== q) e.qty = "Точность до 0,001 т (кг)";
    if (needFrom && !f.from) e.from = "Выберите источник";
    if (needTo && !f.to) e.to = "Выберите место размещения";
    if (f.operation === "transfer" && f.from && f.from === f.to) e.to = "Источник и получатель должны различаться";
    if (f.operation === "receipt" && !f.fieldName.trim()) e.fieldName = "Укажите поле";
    if (avail !== null && !e.qty && kg(q) > avail) e.qty = `Больше доступного остатка (${tonsKg(avail)})`;
    setErrs(e); setSrvErr("");
    if (Object.keys(e).length) return;
    create.mutate({ data: {
      requestId, unit: f.unit, operation: f.operation, cropId: Number(f.cropId), occurredOn: f.occurredOn, quantityTons: Math.round(q * 1000) / 1000,
      fromLocationId: needFrom ? Number(f.from) : null, toLocationId: needTo ? Number(f.to) : null,
      fieldName: f.operation === "receipt" ? f.fieldName.trim() : "", counterparty: f.operation === "sale" ? f.counterparty.trim() : "", notes: f.notes.trim(),
    } }, { onSuccess: () => { invalidate(); onClose(); }, onError: (err) => setSrvErr(errorInfo(err).message) });
  };

  const locSelect = (k: "from" | "to", testId: string) => (
    <select id={`grain-${k}`} className="text-input" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={testId} aria-invalid={!!errs[k]}>
      <option value="">{locs.length ? "Выберите место" : "Нет мест хранения в хозяйстве"}</option>
      {locs.map((l) => <option key={l.id} value={l.id}>{l.name} — {KIND_LABEL[l.kind]}</option>)}
    </select>
  );

  return (
    <Drawer title="Новая операция с зерном" eyebrow="Журнал движения" onClose={close} testId="form-grain-movement"
      footer={<><button type="button" className="button button-secondary" onClick={close} disabled={create.isPending} data-testid="button-movement-cancel">Отмена</button>
        <button type="button" className="button button-primary" onClick={submit} disabled={create.isPending} data-testid="button-movement-submit">{create.isPending ? "Проводим..." : "Провести"}</button></>}>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5 sm:grid-cols-4" role="group" aria-label="Операция">
        {(Object.keys(OP_LABEL) as Op[]).map((o) => (
          <button key={o} type="button" aria-pressed={f.operation === o} onClick={() => set("operation", o)} data-testid={`button-op-${o}`}
            className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${f.operation === o ? "bg-[hsl(203_87%_33%)] text-white" : "text-muted-foreground"}`}>{OP_LABEL[o]}</button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Хозяйство" htmlFor="grain-unit"><select id="grain-unit" className="text-input" value={f.unit} onChange={(e) => setF((p) => ({ ...p, unit: e.target.value as Unit, from: "", to: "" }))} data-testid="select-movement-unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Культура" htmlFor="grain-crop" error={errs.cropId}><select id="grain-crop" className="text-input" value={f.cropId} onChange={(e) => set("cropId", e.target.value)} data-testid="select-movement-crop"><option value="">Выберите культуру</option>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Дата" htmlFor="grain-date" error={errs.occurredOn}><input id="grain-date" type="date" max={asOfDate} className="text-input" value={f.occurredOn} onChange={(e) => set("occurredOn", e.target.value)} data-testid="input-movement-date" /></Field>
        <Field label="Количество, т" htmlFor="grain-qty" error={errs.qty} hint="до 3 знаков после запятой (кг)"><input id="grain-qty" inputMode="decimal" className="text-input font-mono" value={f.qty} onChange={(e) => set("qty", e.target.value)} placeholder="0,000" data-testid="input-movement-qty" /></Field>
        {needFrom && <Field label="Откуда" htmlFor="grain-from" error={errs.from} hint={avail !== null ? <span data-testid="text-available-stock">Доступно сейчас: <b className="font-mono">{tonsKg(avail)}</b></span> : "Выберите культуру и источник, чтобы увидеть остаток"}>{locSelect("from", "select-movement-from")}</Field>}
        {needTo && <Field label={f.operation === "transfer" ? "Куда" : "Место размещения"} htmlFor="grain-to" error={errs.to}>{locSelect("to", "select-movement-to")}</Field>}
        {f.operation === "receipt" && <Field label="Поле" htmlFor="grain-field" error={errs.fieldName}><input id="grain-field" maxLength={200} className="text-input" value={f.fieldName} onChange={(e) => set("fieldName", e.target.value)} data-testid="input-movement-field" /></Field>}
        {f.operation === "sale" && <Field label="Покупатель (необязательно)" htmlFor="grain-cp"><input id="grain-cp" maxLength={200} className="text-input" value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} data-testid="input-movement-counterparty" /></Field>}
        <Field label="Примечание" htmlFor="grain-notes" wide><textarea id="grain-notes" maxLength={3000} rows={3} className="text-input" value={f.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-movement-notes" /></Field>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">Перемещение не меняет общий остаток; продажа уменьшает. Элеватор — собственное зерно хозяйства. Проведённые записи не редактируются: ошибку исправляет генеральный директор отменой с причиной, затем вносится новая запись.</p>
      <ErrorBox message={srvErr} testId="error-movement-submit" />
    </Drawer>
  );
}
