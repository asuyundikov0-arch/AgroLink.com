import { useMemo, useState } from "react";
import { useCreateGrainMovement, type GrainCrop, type GrainLocation, type GrainMovement } from "@workspace/api-client-react";
import { Drawer, ErrorBox, Field, KIND_LABEL, OP_LABEL, STOCK_LABEL, type StockKind, UNITS, type Unit, errorInfo, isProcessor, kg, pct, tonsKg, useInvalidateGrain } from "./shared";

type Op = GrainMovement["operation"];
const uuid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-req`);

/** parse tons string into integer kg; null = invalid; allowZero for processing parts */
function parseKg(v: string, allowZero: boolean): { kg: number | null; err?: string } {
  const t = v.trim().replace(",", ".");
  if (!t) return allowZero ? { kg: 0 } : { kg: null, err: "Положительное число тонн" };
  const q = Number(t);
  if (!Number.isFinite(q) || q < 0 || (!allowZero && q === 0)) return { kg: null, err: allowZero ? "Число тонн, не меньше 0" : "Положительное число тонн" };
  if (q > 1e6) return { kg: null, err: "Не более 1 000 000 т" };
  if (Number(q.toFixed(3)) !== q) return { kg: null, err: "Точность до 0,001 т (кг)" };
  return { kg: Math.round(q * 1000) };
}

export default function MovementForm({ role, crops, locations, stock, asOfDate, defaultUnit, onClose, onDone }: { role: string; crops: GrainCrop[]; locations: GrainLocation[]; stock: (unit: string, crop: number, loc: number, kind: StockKind) => number; asOfDate: string; defaultUnit: Unit; onClose: () => void; onDone: (message: string) => void }) {
  const [requestId] = useState(uuid);
  const [f, setF] = useState({ unit: defaultUnit as Unit, operation: "receipt" as Op, stockKind: "grain" as StockKind, cropId: "", occurredOn: asOfDate, qty: "", out: "", dead: "", gw: "", wasteTo: "", from: "", to: "", fieldName: "", truckNumber: "", driverName: "", counterparty: "", notes: "" });
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [srvErr, setSrvErr] = useState("");
  const create = useCreateGrainMovement();
  const invalidate = useInvalidateGrain();
  const close = () => { if (!create.isPending) onClose(); };
  const set = (k: keyof typeof f, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrs({}); setSrvErr("");
  };
  const setOp = (o: Op) => {
    setF((p) => ({ ...p, operation: o, from: "", to: "", wasteTo: "", stockKind: o === "receipt" || o === "drying" || o === "cleaning" ? "grain" : p.stockKind }));
    setErrs({}); setSrvErr("");
  };
  const isProc = f.operation === "drying" || f.operation === "cleaning";
  const procKind = f.operation === "drying" ? "dryer" : "cleaner";
  const kindSelectable = f.operation === "opening" || f.operation === "transfer" || f.operation === "sale";
  const sk: StockKind = isProc || f.operation === "receipt" ? "grain" : f.stockKind;
  const locs = useMemo(() => locations.filter((l) => l.unit === f.unit), [locations, f.unit]);
  const ordinary = locs.filter((l) => !isProcessor(l.kind));
  const fromOpts = isProc ? locs.filter((l) => l.kind === procKind) : sk === "grain_waste" ? ordinary : locs;
  const toOpts = isProc || sk === "grain_waste" ? ordinary : locs;
  const needFrom = f.operation === "transfer" || f.operation === "sale" || isProc;
  const needTo = f.operation !== "sale";
  const needsTransport = ["receipt", "transfer", "drying", "cleaning"].includes(f.operation);
  const avail = needFrom && f.cropId && f.from ? stock(f.unit, Number(f.cropId), Number(f.from), sk) : null;
  const toLoc = locs.find((l) => String(l.id) === f.to);
  const sendingToProc = f.operation === "transfer" && toLoc && isProcessor(toLoc.kind);

  const pin = parseKg(f.qty, false), pout = parseKg(f.out, true), pdead = parseKg(f.dead, true), pgw = parseKg(f.gw, true);
  const calc = isProc && pin.kg !== null && pout.kg !== null && pdead.kg !== null && pgw.kg !== null ? { input: pin.kg, out: pout.kg, dead: pdead.kg, gw: pgw.kg, rest: pin.kg - pout.kg - pdead.kg - pgw.kg } : null;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!f.cropId) e.cropId = "Выберите культуру";
    if (!f.occurredOn) e.occurredOn = "Укажите дату"; else if (f.occurredOn > asOfDate) e.occurredOn = `Дата не может быть позже ${asOfDate}`;
    if (pin.err) e.qty = pin.err;
    if (needFrom && !f.from) e.from = isProc ? `Выберите ${f.operation === "drying" ? "сушилку" : "очистку"}` : "Выберите источник";
    if (needTo && !f.to) e.to = "Выберите место размещения";
    if (f.operation === "transfer" && f.from && f.from === f.to) e.to = "Источник и получатель должны различаться";
    if (sendingToProc && sk !== "grain") e.to = "На сушку и очистку передаётся только зерно";
    if (f.operation === "receipt" && !f.fieldName.trim()) e.fieldName = "Укажите поле";
    if (needsTransport && !f.truckNumber.trim()) e.truckNumber = "Укажите номер КамАЗа";
    if (needsTransport && !f.driverName.trim()) e.driverName = "Укажите имя водителя";
    if (avail !== null && pin.kg !== null && pin.kg > avail) e.qty = `Больше доступного остатка (${tonsKg(avail)})`;
    if (isProc) {
      if (!f.out.trim()) e.out = "Укажите фактический выход зерна; 0 — только при полной потере";
      if (pout.err) e.out = pout.err;
      if (pdead.err) e.dead = pdead.err;
      if (pgw.err) e.gw = pgw.err;
      if (calc) {
        if (calc.rest < 0) e.out = "Выход + сор + отходы больше поданного";
        else if (f.operation === "cleaning" && calc.rest !== 0) e.out = `При очистке вход должен разложиться полностью: не распределено ${tonsKg(calc.rest)}`;
        if (calc.gw > 0 && !f.wasteTo) e.wasteTo = "Укажите, куда положены зерновые отходы";
      }
    }
    setErrs(e); setSrvErr("");
    if (Object.keys(e).length || pin.kg === null) return;
    const gwKg = isProc ? calc?.gw ?? 0 : 0;
    create.mutate({ data: {
      requestId, unit: f.unit, operation: f.operation, stockKind: sk, cropId: Number(f.cropId), occurredOn: f.occurredOn, quantityTons: pin.kg / 1000,
      outputTons: isProc ? (calc?.out ?? 0) / 1000 : 0, deadWasteTons: isProc ? (calc?.dead ?? 0) / 1000 : 0, grainWasteTons: gwKg / 1000,
      wasteToLocationId: gwKg > 0 ? Number(f.wasteTo) : null,
      fromLocationId: needFrom ? Number(f.from) : null, toLocationId: needTo ? Number(f.to) : null,
      fieldName: f.operation === "receipt" ? f.fieldName.trim() : "",
      truckNumber: needsTransport ? f.truckNumber.trim() : "",
      driverName: needsTransport ? f.driverName.trim() : "",
      counterparty: f.operation === "sale" ? f.counterparty.trim() : "", notes: f.notes.trim(),
    } }, { onSuccess: () => {
      invalidate();
      onDone(role === "weigher"
        ? "Запись отправлена заведующему током; рейс уже отображается диспетчеру."
        : "Операция внесена в баланс зерна. Рейс и водитель появились в очереди диспетчера.");
      onClose();
    }, onError: (err) => setSrvErr(errorInfo(err).message) });
  };

  const locSelect = (k: "from" | "to" | "wasteTo", opts: GrainLocation[], testId: string) => (
    <select id={`grain-${k}`} className="text-input" value={f[k]} onChange={(e) => set(k, e.target.value)} data-testid={testId} aria-invalid={!!errs[k]}>
      <option value="">{opts.length ? "Выберите место" : isProc && k === "from" ? `Нет ${f.operation === "drying" ? "сушилок" : "очисток"} в хозяйстве — добавьте в справочнике` : "Нет подходящих мест в хозяйстве"}</option>
      {opts.map((l) => <option key={l.id} value={l.id}>{l.name} — {KIND_LABEL[l.kind]}</option>)}
    </select>
  );
  const kgInput = (k: "out" | "dead" | "gw", label: string, testId: string, hint: string) => (
    <Field label={label} htmlFor={`grain-${k}`} error={errs[k]} hint={hint}><input id={`grain-${k}`} inputMode="decimal" className="text-input font-mono" value={f[k]} onChange={(e) => set(k, e.target.value)} placeholder="0,000" data-testid={testId} /></Field>
  );

  return (
    <Drawer title="Новая операция с зерном" eyebrow="Журнал движения" onClose={close} testId="form-grain-movement"
      footer={<><button type="button" className="button button-secondary" onClick={close} disabled={create.isPending} data-testid="button-movement-cancel">Отмена</button>
        <button type="button" className="button button-primary" onClick={submit} disabled={create.isPending} data-testid="button-movement-submit">{create.isPending ? "Отправляем..." : role === "weigher" ? "Отправить на согласование" : "Провести"}</button></>}>
      <div className="grid grid-cols-3 gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Операция">
        {(Object.keys(OP_LABEL) as Op[]).map((o) => (
          <button key={o} type="button" aria-pressed={f.operation === o} onClick={() => setOp(o)} data-testid={`button-op-${o}`}
            className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${f.operation === o ? "bg-[hsl(203_87%_33%)] text-white" : "text-muted-foreground"}`}>{OP_LABEL[o]}</button>
        ))}
      </div>
      {kindSelectable && (
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-border p-0.5" role="group" aria-label="Вид материала">
          {(["grain", "grain_waste"] as StockKind[]).map((k) => (
            <button key={k} type="button" aria-pressed={f.stockKind === k} onClick={() => setF((p) => ({ ...p, stockKind: k, from: "", to: "" }))} data-testid={`button-stock-kind-${k}`}
              className={`rounded-md px-2 py-1.5 text-[11px] font-bold ${f.stockKind === k ? "bg-foreground text-background" : "text-muted-foreground"}`}>{STOCK_LABEL[k]}</button>
          ))}
        </div>
      )}
      {f.operation === "transfer" && sk === "grain" && <p className="rounded-lg border border-[hsl(203_87%_33%/.25)] bg-[hsl(203_87%_33%/.06)] p-2.5 text-[11px] leading-5" data-testid="text-processing-guidance">Отправка на сушку или очистку — это перемещение с получателем «Сушилка» или «Очистка». Общий остаток не меняется: зерно числится «в обработке». Результат (выход, сор, отходы) вносится операцией «Сушка» или «Очистка» — можно частями.</p>}
      {isProc && <p className="rounded-lg border border-[hsl(39_100%_52%/.4)] bg-[hsl(39_100%_52%/.08)] p-2.5 text-[11px] leading-5" data-testid="text-processing-hint">Укажите, сколько зерна обработано в этой записи (можно часть остатка на {f.operation === "drying" ? "сушилке" : "очистке"}). {f.operation === "drying" ? "Усушка рассчитывается автоматически: подано − выход − мёртвый сор − зерновые отходы." : "При очистке подано = выход + мёртвый сор + зерновые отходы, без нераспределённого остатка."}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Хозяйство" htmlFor="grain-unit"><select id="grain-unit" className="text-input" value={f.unit} onChange={(e) => setF((p) => ({ ...p, unit: e.target.value as Unit, from: "", to: "", wasteTo: "" }))} data-testid="select-movement-unit">{UNITS.map((u) => <option key={u}>{u}</option>)}</select></Field>
        <Field label="Культура" htmlFor="grain-crop" error={errs.cropId}><select id="grain-crop" className="text-input" value={f.cropId} onChange={(e) => set("cropId", e.target.value)} data-testid="select-movement-crop"><option value="">Выберите культуру</option>{crops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Дата" htmlFor="grain-date" error={errs.occurredOn}><input id="grain-date" type="date" max={asOfDate} className="text-input" value={f.occurredOn} onChange={(e) => set("occurredOn", e.target.value)} data-testid="input-movement-date" /></Field>
        <Field label={isProc ? "Подано на обработку, т" : `Количество (${STOCK_LABEL[sk].toLowerCase()}), т`} htmlFor="grain-qty" error={errs.qty} hint="до 3 знаков после запятой (кг)"><input id="grain-qty" inputMode="decimal" className="text-input font-mono" value={f.qty} onChange={(e) => set("qty", e.target.value)} placeholder="0,000" data-testid="input-movement-qty" /></Field>
        {needFrom && <Field label={isProc ? (f.operation === "drying" ? "Сушилка" : "Очистка") : "Откуда"} htmlFor="grain-from" error={errs.from} hint={avail !== null ? <span data-testid="text-available-stock">Доступно сейчас ({STOCK_LABEL[sk].toLowerCase()}): <b className="font-mono">{tonsKg(avail)}</b></span> : "Выберите культуру и источник, чтобы увидеть остаток"}>{locSelect("from", fromOpts, "select-movement-from")}</Field>}
        {needTo && <Field label={isProc ? "Куда выход зерна" : f.operation === "transfer" ? "Куда" : "Место размещения"} htmlFor="grain-to" error={errs.to}>{locSelect("to", toOpts, "select-movement-to")}</Field>}
        {isProc && <>
          {kgInput("out", "Выход зерна, т", "input-movement-output", "0 допустим — полная потеря")}
          {kgInput("dead", "Мёртвый сор, т", "input-movement-dead-waste", "списывается")}
          {kgInput("gw", "Зерновые отходы, т", "input-movement-grain-waste", "остаются на учёте отдельно")}
          {calc && calc.gw > 0 ? <Field label="Куда зерновые отходы" htmlFor="grain-wasteTo" error={errs.wasteTo}>{locSelect("wasteTo", ordinary, "select-movement-waste-to")}</Field> : <div />}
          <div className="rounded-lg bg-muted/60 p-3 text-[11px] sm:col-span-2" data-testid="panel-processing-calc">
            {calc && calc.input > 0 ? <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono">
              <span>Подано</span><b className="text-right">{tonsKg(calc.input)}</b>
              <span>Выход</span><b className="text-right">{tonsKg(calc.out)} · {pct(calc.out, calc.input)}</b>
              <span>Разница зерна</span><b className="text-right" data-testid="text-calc-diff">{tonsKg(calc.input - calc.out)} · {pct(calc.input - calc.out, calc.input)}</b>
              <span>{f.operation === "drying" ? "Усушка (авто)" : "Не распределено"}</span><b className={`text-right ${calc.rest < 0 || (f.operation === "cleaning" && calc.rest !== 0) ? "text-destructive" : ""}`} data-testid="text-calc-moisture">{tonsKg(calc.rest)} · {pct(calc.rest, calc.input)}</b>
              <span>Безвозвратная убыль</span><b className="text-right" data-testid="text-calc-loss">{tonsKg(calc.dead + Math.max(0, f.operation === "drying" ? calc.rest : 0))} · {pct(calc.dead + Math.max(0, f.operation === "drying" ? calc.rest : 0), calc.input)}</b>
            </div> : <span className="text-muted-foreground">Введите поданное количество и разложение, чтобы увидеть расчёт.</span>}
          </div>
        </>}
        {f.operation === "receipt" && <Field label="Поле" htmlFor="grain-field" error={errs.fieldName}><input id="grain-field" maxLength={200} className="text-input" value={f.fieldName} onChange={(e) => set("fieldName", e.target.value)} data-testid="input-movement-field" /></Field>}
        {needsTransport && <>
          <Field label="Номер КамАЗа *" htmlFor="grain-truck" error={errs.truckNumber}><input id="grain-truck" maxLength={40} className="text-input" value={f.truckNumber} onChange={(e) => set("truckNumber", e.target.value)} placeholder="Например, 123 ABC 01" data-testid="input-movement-truck" /></Field>
          <Field label="Водитель *" htmlFor="grain-driver" error={errs.driverName}><input id="grain-driver" maxLength={200} className="text-input" value={f.driverName} onChange={(e) => set("driverName", e.target.value)} data-testid="input-movement-driver" /></Field>
        </>}
        {f.operation === "sale" && <Field label="Покупатель (необязательно)" htmlFor="grain-cp"><input id="grain-cp" maxLength={200} className="text-input" value={f.counterparty} onChange={(e) => set("counterparty", e.target.value)} data-testid="input-movement-counterparty" /></Field>}
        <Field label="Примечание" htmlFor="grain-notes" wide><textarea id="grain-notes" maxLength={3000} rows={3} className="text-input" value={f.notes} onChange={(e) => set("notes", e.target.value)} data-testid="input-movement-notes" /></Field>
      </div>
      <p className="text-[11px] leading-5 text-muted-foreground">{role === "weigher" ? "После отправки запись проверит заведующий током. До согласования она не меняет остаток. Возвращённую запись исправьте и отправьте заново." : "Перемещение не меняет общий остаток; продажа уменьшает. Зерновые отходы учитываются отдельно от зерна. Элеватор — собственное зерно хозяйства. Ошибочную проведённую запись генеральный директор отменяет с причиной."}</p>
      <ErrorBox message={srvErr} testId="error-movement-submit" />
    </Drawer>
  );
}
