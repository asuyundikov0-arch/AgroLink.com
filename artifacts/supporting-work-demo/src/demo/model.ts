// Pure model of the DEMO supporting-work flow. No I/O, no React. All figures are demo data.

export type StageId = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const STAGE_IDS: StageId[] = [1, 2, 3, 4, 5, 6, 7];

export const IDS = {
  plan: "SP-DEMO-0001",
  work: "SW-DEMO-0001",
  mainWork: "MW-DEMO-SOW-0100",
  trip: "TRIP-DEMO-0417",
  tokLoader: "TOK-LD-DEMO-0417",
  motor: "MP-DEMO-0417",
  fuel: "FUEL-DEMO-0417",
  hrDriver: "HR-DRV-DEMO-0417",
  hrLoader: "HR-LD-DEMO-0417",
} as const;

export interface Drafts {
  plan: { driver: string; diesel: string; loader: string; plannedHa: string };
  start: { note: string };
  tok: { tons: string; truck: string; driver: string; km: string; hours: string; rate: string; warehouseOk: boolean };
  motor: { tariff: string };
  fuel: { liters: string; price: string };
  hr: { driver: boolean; loader: boolean };
  finish: { actualHa: string; ack: boolean };
}

export interface PlanRec { id: string; workId: string; mainWorkId: string; field: string; driver: number; diesel: number; loader: number; plannedHa: number; at: string }
export interface StartRec { at: string; note: string }
export interface TokRec { tripId: string; loaderId: string; tons: number; truck: string; driver: string; km: number; hours: number; rate: number; at: string }
export interface MotorRec { id: string; tripId: string; tariff: number; wage: number; at: string }
export interface FuelRec { id: string; tripId: string; truck: string; liters: number; price: number; cost: number; at: string }
export interface HrRec { driverId: string; loaderId: string; driver: number; loader: number; at: string }
export interface FinishRec { actualHa: number; at: string }

export interface DemoState {
  v: 1;
  drafts: Drafts;
  records: { plan?: PlanRec; start?: StartRec; tok?: TokRec; motor?: MotorRec; fuel?: FuelRec; hr?: HrRec; finish?: FinishRec };
  custom: boolean; // true when user made manual edits/submits
}

export const DEFAULT_DRAFTS: Drafts = {
  plan: { driver: "8000", diesel: "6000", loader: "2000", plannedHa: "100" },
  start: { note: "Посев пшеницы, поле 1, 100 га. Нужна доставка семян с Тока." },
  tok: { tons: "10", truck: "KAMAZ 001 ABC", driver: "Водитель Демо", km: "30", hours: "2", rate: "900", warehouseOk: true },
  motor: { tariff: "28" },
  fuel: { liters: "20", price: "280" },
  hr: { driver: true, loader: true },
  finish: { actualHa: "100", ack: true },
};

export function initialState(): DemoState {
  return { v: 1, drafts: structuredClone(DEFAULT_DRAFTS), records: {}, custom: false };
}

export interface StageMeta { id: StageId; role: string; short: string; title: string; inputs: string; effect: string }
export const STAGES: StageMeta[] = [
  { id: 1, role: "Главный агроном", short: "План", title: "План и бюджет сопутствующей работы", inputs: "Плановые суммы: водитель, дизель, грузчик Тока. Привязка к основному посеву поля 1.", effect: "Появляется плановый итог 16 000 KZT. Фактических затрат ещё нет." },
  { id: 2, role: "Агроном", short: "Старт", title: "Запуск доставки семян", inputs: "Только контекст: какой посев обслуживает доставка. Сумм агроном не вводит.", effect: "Работа переходит в статус «в работе». Затраты не меняются." },
  { id: 3, role: "Заведующий Током", short: "Ток", title: "Взвешивание и отправка семян", inputs: "Тоннаж, машина, водитель, расстояние, часы грузчика и ставка. Создаётся один рейс.", effect: "Добавляется грузчик 2 × 900 = 1 800 KZT (ожидает ОК). Семена — отдельный учёт." },
  { id: 4, role: "Автопарк", short: "Автопарк", title: "Проверка рейса и тариф водителя", inputs: "Тариф за т·км для того же рейса. Расчёт: тонны × км × тариф.", effect: "Добавляется оплата водителя 10 × 30 × 28 = 8 400 KZT, отправлена в ОК." },
  { id: 5, role: "Топливный склад", short: "ГСМ", title: "Выдача дизеля на рейс", inputs: "Литры и цена. Выдача связана с той же работой, полем и машиной.", effect: "Добавляется дизель 20 × 280 = 5 600 KZT. Это подтверждённый складской расход." },
  { id: 6, role: "Отдел кадров", short: "ОК", title: "Утверждение начислений", inputs: "Два отдельных начисления: водитель и грузчик. Утверждается каждое.", effect: "Только теперь оплата труда считается подтверждённой затратой." },
  { id: 7, role: "Агроном", short: "Приёмка", title: "Приёмка доставки и закрытие работы", inputs: "Подтверждение получения семян. Гектары берутся из факта диспетчера, а не из рейса.", effect: "Сопутствующая работа закрыта. Основной посев остаётся открытым." },
];

export type Num = { ok: true; value: number } | { ok: false; error: string };
export function parsePositive(raw: string, max = 1e9): Num {
  const t = String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return { ok: false, error: "Заполните поле" };
  if (!/^\d+(\.\d+)?$/.test(t)) return { ok: false, error: "Только положительное число" };
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "Должно быть больше нуля" };
  if (n > max) return { ok: false, error: "Слишком большое значение" };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

export function isDone(s: DemoState, id: StageId): boolean {
  const r = s.records;
  return [!!r.plan, !!r.start, !!r.tok, !!r.motor, !!r.fuel, !!r.hr, !!r.finish][id - 1];
}

/** Returns null if the stage can be submitted, otherwise a reason. */
export function blockReason(s: DemoState, id: StageId): string | null {
  if (isDone(s, id)) return "Этап уже отправлен — повторная отправка запрещена";
  if (id > 1 && !isDone(s, (id - 1) as StageId)) return `Сначала завершите этап ${id - 1}: ${STAGES[id - 2].title}`;
  return null;
}

export function nextStage(s: DemoState): StageId | null {
  return STAGE_IDS.find((id) => !isDone(s, id)) ?? null;
}

export type FieldErrors = Record<string, string>;

export function validateStage(d: Drafts, id: StageId): FieldErrors {
  const e: FieldErrors = {};
  const chk = (key: string, raw: string, max?: number) => {
    const r = parsePositive(raw, max);
    if (!r.ok) e[key] = r.error;
  };
  if (id === 1) { chk("driver", d.plan.driver); chk("diesel", d.plan.diesel); chk("loader", d.plan.loader); chk("plannedHa", d.plan.plannedHa, 100000); }
  if (id === 3) {
    chk("tons", d.tok.tons, 1000); chk("km", d.tok.km, 5000); chk("hours", d.tok.hours, 24); chk("rate", d.tok.rate);
    if (!d.tok.truck.trim()) e.truck = "Укажите машину";
    if (!d.tok.driver.trim()) e.driver = "Укажите водителя";
    if (!d.tok.warehouseOk) e.warehouseOk = "Нужно подтверждение склада (симуляция)";
  }
  if (id === 4) chk("tariff", d.motor.tariff, 10000);
  if (id === 5) { chk("liters", d.fuel.liters, 10000); chk("price", d.fuel.price, 100000); }
  if (id === 6 && (!d.hr.driver || !d.hr.loader)) e.hr = "Для перехода дальше утвердите оба начисления";
  if (id === 7) { chk("actualHa", d.finish.actualHa, 100000); if (!d.finish.ack) e.ack = "Подтвердите получение семян"; }
  return e;
}

const v = (raw: string) => (parsePositive(raw) as { value: number }).value;
const round = (n: number) => Math.round(n * 100) / 100;

export type SubmitResult = { ok: true; state: DemoState } | { ok: false; error: string; fields?: FieldErrors };

export function submitStage(s: DemoState, id: StageId, now: string, manual = false): SubmitResult {
  const block = blockReason(s, id);
  if (block) return { ok: false, error: block };
  const fields = validateStage(s.drafts, id);
  if (Object.keys(fields).length) return { ok: false, error: "Проверьте поля формы", fields };
  const d = s.drafts;
  const r = { ...s.records };
  switch (id) {
    case 1: r.plan = { id: IDS.plan, workId: IDS.work, mainWorkId: IDS.mainWork, field: "Поле 1", driver: v(d.plan.driver), diesel: v(d.plan.diesel), loader: v(d.plan.loader), plannedHa: v(d.plan.plannedHa), at: now }; break;
    case 2: r.start = { at: now, note: d.start.note.trim() }; break;
    case 3: r.tok = { tripId: IDS.trip, loaderId: IDS.tokLoader, tons: v(d.tok.tons), truck: d.tok.truck.trim(), driver: d.tok.driver.trim(), km: v(d.tok.km), hours: v(d.tok.hours), rate: v(d.tok.rate), at: now }; break;
    case 4: {
      const t = r.tok!; const tariff = v(d.motor.tariff);
      r.motor = { id: IDS.motor, tripId: t.tripId, tariff, wage: round(t.tons * t.km * tariff), at: now }; break;
    }
    case 5: {
      const liters = v(d.fuel.liters); const price = v(d.fuel.price);
      r.fuel = { id: IDS.fuel, tripId: r.tok!.tripId, truck: r.tok!.truck, liters, price, cost: round(liters * price), at: now }; break;
    }
    case 6: r.hr = { driverId: IDS.hrDriver, loaderId: IDS.hrLoader, driver: r.motor!.wage, loader: loaderPay(r.tok!), at: now }; break;
    case 7: r.finish = { actualHa: v(d.finish.actualHa), at: now }; break;
  }
  return { ok: true, state: { ...s, records: r, custom: s.custom || manual } };
}

export function loaderPay(t: TokRec) { return round(t.hours * t.rate); }

export function updateDrafts<K extends keyof Drafts>(s: DemoState, key: K, patch: Partial<Drafts[K]>, manual = true): DemoState {
  return { ...s, drafts: { ...s.drafts, [key]: { ...s.drafts[key], ...patch } }, custom: s.custom || manual };
}

export function completedExample(now = "2025-05-06T09:00:00.000Z"): DemoState {
  let s = initialState();
  for (const id of STAGE_IDS) {
    const res = submitStage(s, id, now);
    if (!res.ok) throw new Error(res.error);
    s = res.state;
  }
  return s;
}

export interface Totals {
  planned: number;
  driverPay: number | null; loaderPay: number | null; fuel: number | null;
  confirmed: number;      // fuel + HR-approved pay
  pendingHr: number;      // pay awaiting HR (NOT final cost)
  incurred: number;       // confirmed + pending
  isFinal: boolean;       // all approved and work completed
  variance: number | null; // planned - confirmed when final
  perHa: number | null;   // supporting cost only, per actual ha
  actualHa: number | null;
  workStatus: "нет" | "запланирована" | "в работе" | "завершена";
  costStatus: "нет затрат" | "ожидает ОК" | "подтверждено";
}

export function computeTotals(s: DemoState): Totals {
  const r = s.records;
  const planned = r.plan ? r.plan.driver + r.plan.diesel + r.plan.loader : 0;
  const driverPay = r.motor ? r.motor.wage : null;
  const lp = r.tok ? loaderPay(r.tok) : null;
  const fuel = r.fuel ? r.fuel.cost : null;
  const approved = r.hr ? r.hr.driver + r.hr.loader : 0;
  const pendingHr = r.hr ? 0 : (driverPay ?? 0) + (lp ?? 0);
  const confirmed = round((fuel ?? 0) + approved);
  const isFinal = !!r.hr && !!r.finish;
  const actualHa = r.finish ? r.finish.actualHa : null;
  return {
    planned, driverPay, loaderPay: lp, fuel, confirmed, pendingHr: round(pendingHr), incurred: round(confirmed + pendingHr), isFinal,
    variance: isFinal ? round(planned - confirmed) : null,
    perHa: isFinal && actualHa ? round(confirmed / actualHa) : null,
    actualHa,
    workStatus: r.finish ? "завершена" : r.start ? "в работе" : r.plan ? "запланирована" : "нет",
    costStatus: r.hr ? "подтверждено" : pendingHr > 0 ? "ожидает ОК" : "нет затрат",
  };
}

export interface LedgerRow { sourceId: string; source: string; kind: string; amount: number | null; status: "подтверждено" | "ожидает ОК" | "справочно" | "вне итога"; detail: string }

export function buildLedger(s: DemoState): LedgerRow[] {
  const r = s.records; const rows: LedgerRow[] = [];
  if (r.tok) {
    rows.push({ sourceId: r.tok.tripId, source: "Ток", kind: "Рейс (семена)", amount: null, status: "вне итога", detail: `${r.tok.tons} т семян, ${r.tok.truck}, ${r.tok.km} км. Отгрузка ≠ расход семян на посев` });
    rows.push({ sourceId: r.tok.loaderId, source: "Ток", kind: "Грузчик", amount: loaderPay(r.tok), status: r.hr ? "подтверждено" : "ожидает ОК", detail: `${r.tok.hours} ч × ${fmt(r.tok.rate)}` });
  }
  if (r.motor) rows.push({ sourceId: r.motor.id, source: "Автопарк", kind: "Водитель", amount: r.motor.wage, status: r.hr ? "подтверждено" : "ожидает ОК", detail: `${r.tok!.tons} т × ${r.tok!.km} км × ${fmt(r.motor.tariff)} (рейс ${r.motor.tripId})` });
  if (r.fuel) rows.push({ sourceId: r.fuel.id, source: "Топливный склад", kind: "Дизель", amount: r.fuel.cost, status: "подтверждено", detail: `${r.fuel.liters} л × ${fmt(r.fuel.price)}, ${r.fuel.truck}, рейс ${r.fuel.tripId}` });
  if (r.hr) {
    rows.push({ sourceId: r.hr.driverId, source: "ОК", kind: "Начисление водителю", amount: null, status: "справочно", detail: `${fmt(r.hr.driver)} утверждено (сумма уже в строке ${IDS.motor})` });
    rows.push({ sourceId: r.hr.loaderId, source: "ОК", kind: "Начисление грузчику", amount: null, status: "справочно", detail: `${fmt(r.hr.loader)} утверждено (сумма уже в строке ${IDS.tokLoader})` });
  }
  return rows;
}

export function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n) + " KZT";
}

export function isPristine(s: DemoState): boolean { return !s.custom; }

export function isValidState(x: unknown): x is DemoState {
  if (!x || typeof x !== "object") return false;
  const o = x as DemoState;
  return o.v === 1 && !!o.drafts && !!o.records && typeof o.custom === "boolean" && !!o.drafts.plan && !!o.drafts.tok && !!o.drafts.finish;
}
