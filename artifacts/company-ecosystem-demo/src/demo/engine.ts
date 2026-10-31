// Pure demo engine. No React, no storage, no network.
// Balances are always derived: initial balances + immutable movement journal.

export type Role = 'director' | 'storekeeper' | 'employee';
export type Tracking = 'reusable' | 'consumable';
export type MovementType = 'receipt' | 'issue' | 'return' | 'transfer' | 'writeoff';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'fulfilled';
export type RequestType = 'supply' | 'writeoff';

export interface Department { id: string; name: string }
export interface Employee { id: string; name: string; departmentId: string; position: string }
export interface Warehouse { id: string; name: string }
export interface Location { id: string; name: string; departmentId?: string }
export interface Item {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  tracking: Tracking;
  unitCostKzt: number;
  initialBalances: Record<string, number>;
}
export interface Movement {
  id: string;
  itemId: string;
  quantity: number;
  fromHolder: string | null;
  toHolder: string | null;
  type: MovementType;
  date: string;
  reference: string;
  note: string;
  actor: Role;
  unitCostKzt?: number;
  requestId?: string;
}
export interface DemoRequest {
  id: string;
  itemId: string;
  quantity: number;
  employeeId: string;
  departmentId: string;
  reason: string;
  status: RequestStatus;
  type: RequestType;
  sourceHolderId?: string;
  createdAt: string;
  decidedAt?: string;
  decisionNote?: string;
  movementId?: string;
}
export interface DemoState {
  schema: 'agrolink.company-ecosystem-demo';
  version: 1;
  departments: Department[];
  employees: Employee[];
  warehouses: Warehouse[];
  locations: Location[];
  items: Item[];
  movements: Movement[];
  requests: DemoRequest[];
  seq: number;
}

export type Result = { ok: true; state: DemoState; message: string } | { ok: false; error: string };

const fail = (error: string): Result => ({ ok: false, error });

export const ROLE_LABEL: Record<Role, string> = {
  director: 'Директор',
  storekeeper: 'Кладовщик АХО',
  employee: 'Сотрудник',
};

// ---------- holders ----------
export const whHolder = (id: string) => `wh:${id}`;
export const locHolder = (id: string) => `loc:${id}`;
export const empHolder = (id: string) => `emp:${id}`;
export type HolderKind = 'warehouse' | 'location' | 'employee';

export function holderKind(h: string): HolderKind | null {
  if (h.startsWith('wh:')) return 'warehouse';
  if (h.startsWith('loc:')) return 'location';
  if (h.startsWith('emp:')) return 'employee';
  return null;
}
export function holderRef(h: string): string {
  return h.slice(h.indexOf(':') + 1);
}
export function holderExists(s: DemoState, h: string): boolean {
  const k = holderKind(h);
  const id = holderRef(h);
  if (k === 'warehouse') return s.warehouses.some((w) => w.id === id);
  if (k === 'location') return s.locations.some((l) => l.id === id);
  if (k === 'employee') return s.employees.some((e) => e.id === id);
  return false;
}
export function holderName(s: DemoState, h: string | null): string {
  if (!h) return '—';
  const k = holderKind(h);
  const id = holderRef(h);
  if (k === 'warehouse') return s.warehouses.find((w) => w.id === id)?.name ?? h;
  if (k === 'location') return s.locations.find((l) => l.id === id)?.name ?? h;
  if (k === 'employee') return s.employees.find((e) => e.id === id)?.name ?? h;
  return h;
}
export function allHolders(s: DemoState): string[] {
  return [
    ...s.warehouses.map((w) => whHolder(w.id)),
    ...s.locations.map((l) => locHolder(l.id)),
    ...s.employees.map((e) => empHolder(e.id)),
  ];
}

// ---------- validation helpers ----------
export function isValidQty(q: unknown): q is number {
  return typeof q === 'number' && Number.isFinite(q) && Number.isInteger(q) && q > 0;
}
export function isValidPrice(p: unknown): p is number {
  return typeof p === 'number' && Number.isFinite(p) && p > 0 && p < 1e11;
}
const QTY_ERR = 'Количество должно быть целым положительным числом';

function nextId(s: DemoState, prefix: string): [string, number] {
  const n = s.seq + 1;
  return [`${prefix}-${String(n).padStart(4, '0')}`, n];
}

// ---------- derived balances ----------
export type Balances = Map<string, Map<string, number>>;

export function computeBalances(s: DemoState): Balances {
  const b: Balances = new Map();
  const add = (itemId: string, h: string, q: number) => {
    let m = b.get(itemId);
    if (!m) { m = new Map(); b.set(itemId, m); }
    m.set(h, (m.get(h) ?? 0) + q);
  };
  for (const it of s.items) {
    b.set(it.id, new Map());
    for (const [h, q] of Object.entries(it.initialBalances)) add(it.id, h, q);
  }
  for (const mv of s.movements) {
    if (mv.fromHolder) add(mv.itemId, mv.fromHolder, -mv.quantity);
    if (mv.toHolder) add(mv.itemId, mv.toHolder, mv.quantity);
  }
  return b;
}
export function balanceOf(s: DemoState, itemId: string, h: string): number {
  return computeBalances(s).get(itemId)?.get(h) ?? 0;
}
export function itemTotal(b: Balances, itemId: string): number {
  let t = 0;
  for (const q of b.get(itemId)?.values() ?? []) t += q;
  return t;
}

/** Weighted average book cost: initial stock at seed price + all receipts at invoice price. */
export function avgCost(s: DemoState, itemId: string): number {
  const it = s.items.find((i) => i.id === itemId);
  if (!it) return 0;
  let qty = 0;
  for (const q of Object.values(it.initialBalances)) qty += q;
  let sum = qty * it.unitCostKzt;
  for (const mv of s.movements) {
    if (mv.itemId === itemId && mv.type === 'receipt') {
      qty += mv.quantity;
      sum += mv.quantity * (mv.unitCostKzt ?? it.unitCostKzt);
    }
  }
  if (qty === 0) return it.unitCostKzt;
  return Math.round((sum / qty) * 100) / 100;
}

export interface Metrics {
  assetValue: number;      // company-held value: warehouses + locations + reusable custody
  warehouseValue: number;
  locationValue: number;
  custodyValue: number;    // reusable items on employees (custody, not expense)
  consumedValue: number;   // consumables issued to employees (expensed at issue)
  purchasesValue: number;  // sum of receipt invoices
  writeoffValue: number;
  pending: number;
  awaitingFulfil: number;
  employeesWithCustody: number;
  lowStock: { itemId: string; qty: number }[];
}

export function computeMetrics(s: DemoState): Metrics {
  const b = computeBalances(s);
  const m: Metrics = {
    assetValue: 0, warehouseValue: 0, locationValue: 0, custodyValue: 0, consumedValue: 0,
    purchasesValue: 0, writeoffValue: 0, pending: 0, awaitingFulfil: 0, employeesWithCustody: 0, lowStock: [],
  };
  const custodians = new Set<string>();
  for (const it of s.items) {
    const c = avgCost(s, it.id);
    let whQty = 0;
    for (const [h, q] of b.get(it.id) ?? []) {
      if (q <= 0) continue;
      const v = q * c;
      const k = holderKind(h);
      if (k === 'warehouse') { m.warehouseValue += v; whQty += q; }
      else if (k === 'location') m.locationValue += v;
      else if (k === 'employee') {
        if (it.tracking === 'reusable') { m.custodyValue += v; custodians.add(h); }
        else m.consumedValue += v;
      }
    }
    const threshold = it.tracking === 'consumable' ? 20 : 2;
    if (whQty <= threshold) m.lowStock.push({ itemId: it.id, qty: whQty });
  }
  for (const mv of s.movements) {
    if (mv.type === 'receipt') m.purchasesValue += mv.quantity * (mv.unitCostKzt ?? 0);
    if (mv.type === 'writeoff') m.writeoffValue += mv.quantity * avgCost(s, mv.itemId);
  }
  m.assetValue = m.warehouseValue + m.locationValue + m.custodyValue;
  m.pending = s.requests.filter((r) => r.status === 'pending').length;
  m.awaitingFulfil = s.requests.filter((r) => r.status === 'approved').length;
  m.employeesWithCustody = custodians.size;
  return m;
}

/** Total quantity across company holders per item (used by tests: transfers must not change it). */
export function companyValue(s: DemoState): number {
  const b = computeBalances(s);
  let v = 0;
  for (const it of s.items) v += itemTotal(b, it.id) * avgCost(s, it.id);
  return Math.round(v * 100) / 100;
}

// ---------- actions ----------
function requireRole(role: Role, allowed: Role[], what: string): string | null {
  return allowed.includes(role) ? null : `Действие «${what}» недоступно для роли «${ROLE_LABEL[role]}»`;
}
function pushMovement(s: DemoState, mv: Omit<Movement, 'id'>): { state: DemoState; id: string } {
  const [id, seq] = nextId(s, 'MV');
  return { state: { ...s, seq, movements: [...s.movements, { ...mv, id }] }, id };
}
function checkStock(s: DemoState, itemId: string, from: string, qty: number): string | null {
  const have = balanceOf(s, itemId, from);
  if (qty > have) return `Недостаточно остатка у держателя «${holderName(s, from)}»: доступно ${have}, требуется ${qty}`;
  return null;
}

export interface ReceiptInput {
  itemId?: string;
  newItem?: { sku: string; name: string; category: string; unit: string; tracking: Tracking };
  quantity: number;
  unitCostKzt: number;
  reference: string;
  toHolder: string;
  date: string;
  note?: string;
}
export function receive(s: DemoState, role: Role, i: ReceiptInput): Result {
  const r = requireRole(role, ['storekeeper'], 'Приход'); if (r) return fail(r);
  if (!i.reference || !i.reference.trim()) return fail('Укажите номер счёта / накладной — без основания приход не принимается');
  if (!isValidQty(i.quantity)) return fail(QTY_ERR);
  if (!isValidPrice(i.unitCostKzt)) return fail('Цена за единицу должна быть положительным числом, ₸');
  if (holderKind(i.toHolder) !== 'warehouse' || !holderExists(s, i.toHolder)) return fail('Приход принимается только на склад');
  let state = s;
  let itemId = i.itemId;
  if (i.newItem) {
    const n = i.newItem;
    if (!n.name.trim() || !n.sku.trim() || !n.unit.trim() || !n.category.trim()) return fail('Для новой позиции заполните артикул, наименование, категорию и единицу');
    if (s.items.some((x) => x.sku.toLowerCase() === n.sku.trim().toLowerCase())) return fail(`Артикул ${n.sku.trim()} уже есть в реестре — выберите существующую позицию`);
    const [id, seq] = nextId(s, 'ITM');
    itemId = id;
    state = { ...s, seq, items: [...s.items, { id, sku: n.sku.trim(), name: n.name.trim(), category: n.category.trim(), unit: n.unit.trim(), tracking: n.tracking, unitCostKzt: i.unitCostKzt, initialBalances: {} }] };
  } else if (!itemId || !s.items.some((x) => x.id === itemId)) {
    return fail('Позиция не найдена — обновите выбор');
  }
  const res = pushMovement(state, {
    itemId: itemId!, quantity: i.quantity, fromHolder: null, toHolder: i.toHolder, type: 'receipt',
    date: i.date, reference: i.reference.trim(), note: i.note?.trim() ?? '', actor: role, unitCostKzt: i.unitCostKzt,
  });
  return { ok: true, state: res.state, message: `Приход ${res.id} проведён` };
}

export interface IssueInput { itemId: string; quantity: number; fromHolder: string; employeeId: string; date: string; reference?: string; note?: string; requestId?: string }
export function issue(s: DemoState, role: Role, i: IssueInput): Result {
  const r = requireRole(role, ['storekeeper'], 'Выдача'); if (r) return fail(r);
  if (!s.items.some((x) => x.id === i.itemId)) return fail('Позиция не найдена — обновите выбор');
  if (!isValidQty(i.quantity)) return fail(QTY_ERR);
  const k = holderKind(i.fromHolder);
  if ((k !== 'warehouse' && k !== 'location') || !holderExists(s, i.fromHolder)) return fail('Выдача возможна со склада или локации');
  const to = empHolder(i.employeeId);
  if (!holderExists(s, to)) return fail('Сотрудник не найден');
  const st = checkStock(s, i.itemId, i.fromHolder, i.quantity); if (st) return fail(st);
  const res = pushMovement(s, {
    itemId: i.itemId, quantity: i.quantity, fromHolder: i.fromHolder, toHolder: to, type: 'issue', date: i.date,
    reference: i.reference?.trim() || 'Выдача в подотчёт', note: i.note?.trim() ?? '', actor: role, requestId: i.requestId,
  });
  return { ok: true, state: res.state, message: `Выдача ${res.id} проведена` };
}

export interface TransferInput { itemId: string; quantity: number; fromHolder: string; toHolder: string; date: string; reference?: string; note?: string }
export function transfer(s: DemoState, role: Role, i: TransferInput): Result {
  const r = requireRole(role, ['storekeeper'], 'Перемещение'); if (r) return fail(r);
  if (!s.items.some((x) => x.id === i.itemId)) return fail('Позиция не найдена — обновите выбор');
  if (!isValidQty(i.quantity)) return fail(QTY_ERR);
  if (!holderExists(s, i.fromHolder) || !holderExists(s, i.toHolder)) return fail('Держатель не найден');
  if (i.fromHolder === i.toHolder) return fail('Источник и получатель совпадают');
  const st = checkStock(s, i.itemId, i.fromHolder, i.quantity); if (st) return fail(st);
  const res = pushMovement(s, {
    itemId: i.itemId, quantity: i.quantity, fromHolder: i.fromHolder, toHolder: i.toHolder, type: 'transfer', date: i.date,
    reference: i.reference?.trim() || 'Внутреннее перемещение', note: i.note?.trim() ?? '', actor: role,
  });
  return { ok: true, state: res.state, message: `Перемещение ${res.id} проведено` };
}

export interface ReturnInput { itemId: string; quantity: number; employeeId: string; toHolder: string; date: string; note?: string }
export function returnToWarehouse(s: DemoState, role: Role, i: ReturnInput): Result {
  const r = requireRole(role, ['storekeeper'], 'Возврат'); if (r) return fail(r);
  if (!s.items.some((x) => x.id === i.itemId)) return fail('Позиция не найдена — обновите выбор');
  if (!isValidQty(i.quantity)) return fail(QTY_ERR);
  const from = empHolder(i.employeeId);
  if (!holderExists(s, from)) return fail('Сотрудник не найден');
  if (holderKind(i.toHolder) !== 'warehouse' || !holderExists(s, i.toHolder)) return fail('Возврат принимается на склад');
  const st = checkStock(s, i.itemId, from, i.quantity); if (st) return fail(st);
  const res = pushMovement(s, {
    itemId: i.itemId, quantity: i.quantity, fromHolder: from, toHolder: i.toHolder, type: 'return', date: i.date,
    reference: 'Возврат из подотчёта', note: i.note?.trim() ?? '', actor: role,
  });
  return { ok: true, state: res.state, message: `Возврат ${res.id} принят` };
}

export interface RequestInput { type: RequestType; itemId: string; quantity: number; employeeId: string; reason: string; sourceHolderId?: string; date: string }
export function submitRequest(s: DemoState, role: Role, i: RequestInput): Result {
  const r = requireRole(role, ['employee'], 'Заявка'); if (r) return fail(r);
  const emp = s.employees.find((e) => e.id === i.employeeId);
  if (!emp) return fail('Сотрудник не найден');
  if (!s.items.some((x) => x.id === i.itemId)) return fail('Позиция не найдена — обновите выбор');
  if (!isValidQty(i.quantity)) return fail(QTY_ERR);
  if (!i.reason.trim()) return fail('Укажите причину');
  if (i.type === 'writeoff') {
    if (!i.sourceHolderId || !holderExists(s, i.sourceHolderId)) return fail('Укажите, где находится списываемое имущество');
    const st = checkStock(s, i.itemId, i.sourceHolderId, i.quantity); if (st) return fail(st);
  }
  const [id, seq] = nextId(s, 'REQ');
  const req: DemoRequest = {
    id, itemId: i.itemId, quantity: i.quantity, employeeId: emp.id, departmentId: emp.departmentId, reason: i.reason.trim(),
    status: 'pending', type: i.type, sourceHolderId: i.type === 'writeoff' ? i.sourceHolderId : undefined, createdAt: i.date,
  };
  return { ok: true, state: { ...s, seq, requests: [...s.requests, req] }, message: `Заявка ${id} отправлена директору` };
}

function patchRequest(s: DemoState, id: string, p: Partial<DemoRequest>): DemoState {
  return { ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...p } : r)) };
}

export function approveRequest(s: DemoState, role: Role, id: string, date: string, note = ''): Result {
  const r = requireRole(role, ['director'], 'Согласование'); if (r) return fail(r);
  const req = s.requests.find((x) => x.id === id);
  if (!req) return fail('Заявка не найдена');
  if (req.status !== 'pending') return fail(`Заявка ${id} уже обработана (статус изменился) — повторное решение не применено`);
  if (req.type === 'supply') {
    return { ok: true, state: patchRequest(s, id, { status: 'approved', decidedAt: date, decisionNote: note }), message: `Заявка ${id} согласована — передана кладовщику` };
  }
  const src = req.sourceHolderId;
  if (!src || !holderExists(s, src)) return fail('Источник списания не найден');
  const st = checkStock(s, req.itemId, src, req.quantity);
  if (st) return fail(`${st}. Заявка осталась на рассмотрении.`);
  const mv = pushMovement(s, {
    itemId: req.itemId, quantity: req.quantity, fromHolder: src, toHolder: null, type: 'writeoff', date,
    reference: `Акт списания по ${id}`, note: req.reason, actor: role, requestId: id,
  });
  return { ok: true, state: patchRequest(mv.state, id, { status: 'fulfilled', decidedAt: date, decisionNote: note, movementId: mv.id }), message: `Списание по ${id} проведено (${mv.id})` };
}

export function rejectRequest(s: DemoState, role: Role, id: string, date: string, note = ''): Result {
  const r = requireRole(role, ['director'], 'Отклонение'); if (r) return fail(r);
  const req = s.requests.find((x) => x.id === id);
  if (!req) return fail('Заявка не найдена');
  if (req.status !== 'pending') return fail(`Заявка ${id} уже обработана — повторное решение не применено`);
  return { ok: true, state: patchRequest(s, id, { status: 'rejected', decidedAt: date, decisionNote: note }), message: `Заявка ${id} отклонена, остатки не изменены` };
}

export function fulfillRequest(s: DemoState, role: Role, id: string, fromHolder: string, date: string): Result {
  const r = requireRole(role, ['storekeeper'], 'Исполнение заявки'); if (r) return fail(r);
  const req = s.requests.find((x) => x.id === id);
  if (!req) return fail('Заявка не найдена');
  if (req.type !== 'supply') return fail('Исполняются только заявки на выдачу');
  if (req.status === 'fulfilled') return fail(`Заявка ${id} уже исполнена — повторная выдача заблокирована`);
  if (req.status !== 'approved') return fail(`Заявка ${id} не согласована директором`);
  const res = issue(s, role, { itemId: req.itemId, quantity: req.quantity, fromHolder, employeeId: req.employeeId, date, reference: `Выдача по ${id}`, requestId: id });
  if (!res.ok) return fail(`${res.error}. Заявка остаётся согласованной и ждёт поступления.`);
  const mvId = res.state.movements[res.state.movements.length - 1].id;
  return { ok: true, state: patchRequest(res.state, id, { status: 'fulfilled', movementId: mvId }), message: `Заявка ${id} исполнена (${mvId})` };
}

// ---------- persistence validation ----------
export function validateState(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'Данные не являются объектом';
  const s = raw as Partial<DemoState>;
  if (s.schema !== 'agrolink.company-ecosystem-demo' || s.version !== 1) return 'Неизвестная схема или версия данных';
  const arrays: (keyof DemoState)[] = ['departments', 'employees', 'warehouses', 'locations', 'items', 'movements', 'requests'];
  for (const k of arrays) if (!Array.isArray(s[k])) return `Поле ${k} повреждено`;
  if (typeof s.seq !== 'number' || !Number.isFinite(s.seq)) return 'Счётчик идентификаторов повреждён';
  const st = s as DemoState;
  const ids = new Set(st.items.map((i) => i.id));
  for (const it of st.items) {
    if (typeof it.id !== 'string' || typeof it.name !== 'string' || !it.initialBalances || typeof it.initialBalances !== 'object') return `Позиция повреждена: ${String(it.id)}`;
    for (const q of Object.values(it.initialBalances)) if (!Number.isInteger(q) || q < 0) return `Начальный остаток повреждён: ${it.id}`;
  }
  for (const mv of st.movements) {
    if (!ids.has(mv.itemId) || !isValidQty(mv.quantity)) return `Движение повреждено: ${String(mv.id)}`;
  }
  for (const r of st.requests) if (!ids.has(r.itemId) || !isValidQty(r.quantity)) return `Заявка повреждена: ${String(r.id)}`;
  for (const [itemId, m] of computeBalances(st)) for (const [h, q] of m) if (q < 0) return `Отрицательный остаток ${itemId} у ${h}`;
  return null;
}
