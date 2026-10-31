import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approveRequest, balanceOf, companyValue, computeBalances, fulfillRequest, issue, receive, rejectRequest,
  returnToWarehouse, submitRequest, transfer, validateState, type DemoState, type Result,
} from './engine.ts';
import { createSeed } from './seed.ts';

const D = '2025-06-01';
const WH = 'wh:WH-01';
function ok(r: Result): DemoState {
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

test('seed is valid', () => {
  assert.equal(validateState(createSeed()), null);
});

test('receipt requires reference, positive integer qty and price; supports new item', () => {
  const s = createSeed();
  assert.equal(receive(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 2, unitCostKzt: 390000, reference: ' ', toHolder: WH, date: D }).ok, false);
  for (const q of [0, -1, 1.5, NaN, Infinity]) assert.equal(receive(s, 'storekeeper', { itemId: 'ITM-0001', quantity: q, unitCostKzt: 1, reference: 'X', toHolder: WH, date: D }).ok, false);
  assert.equal(receive(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 1, unitCostKzt: -5, reference: 'X', toHolder: WH, date: D }).ok, false);
  assert.equal(receive(s, 'employee', { itemId: 'ITM-0001', quantity: 1, unitCostKzt: 5, reference: 'X', toHolder: WH, date: D }).ok, false);
  const s1 = ok(receive(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 2, unitCostKzt: 390000, reference: 'СФ-1', toHolder: WH, date: D }));
  assert.equal(balanceOf(s1, 'ITM-0001', WH), 5);
  const s2 = ok(receive(s1, 'storekeeper', { newItem: { sku: 'NEW-1', name: 'Огнетушитель', category: 'Хозтовары', unit: 'шт', tracking: 'reusable' }, quantity: 4, unitCostKzt: 12500, reference: 'СФ-2', toHolder: WH, date: D }));
  const created = s2.items.find((i) => i.sku === 'NEW-1')!;
  assert.equal(balanceOf(s2, created.id, WH), 4);
  assert.equal(receive(s2, 'storekeeper', { newItem: { sku: 'new-1', name: 'Дубль', category: 'X', unit: 'шт', tracking: 'reusable' }, quantity: 1, unitCostKzt: 1, reference: 'X', toHolder: WH, date: D }).ok, false);
});

test('partial issue, transfer and return conserve quantity and value', () => {
  const s = createSeed();
  const v0 = companyValue(s);
  const s1 = ok(issue(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 2, fromHolder: WH, employeeId: 'EMP-02', date: D }));
  assert.equal(balanceOf(s1, 'ITM-0001', WH), 1);
  assert.equal(balanceOf(s1, 'ITM-0001', 'emp:EMP-02'), 2);
  const s2 = ok(transfer(s1, 'storekeeper', { itemId: 'ITM-0001', quantity: 1, fromHolder: 'emp:EMP-02', toHolder: 'loc:LOC-03', date: D }));
  const s3 = ok(returnToWarehouse(s2, 'storekeeper', { itemId: 'ITM-0001', quantity: 1, employeeId: 'EMP-02', toHolder: WH, date: D }));
  const s4 = ok(transfer(s3, 'storekeeper', { itemId: 'ITM-0001', quantity: 1, fromHolder: 'loc:LOC-03', toHolder: WH, date: D }));
  assert.equal(balanceOf(s4, 'ITM-0001', WH), 3);
  assert.equal(balanceOf(s4, 'ITM-0001', 'emp:EMP-02'), 0);
  assert.equal(companyValue(s4), v0);
});

test('no negative balances: over-issue, over-return and same holder rejected', () => {
  const s = createSeed();
  assert.equal(issue(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 4, fromHolder: WH, employeeId: 'EMP-02', date: D }).ok, false);
  assert.equal(returnToWarehouse(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 2, employeeId: 'EMP-03', toHolder: WH, date: D }).ok, false);
  assert.equal(transfer(s, 'storekeeper', { itemId: 'ITM-0001', quantity: 1, fromHolder: WH, toHolder: WH, date: D }).ok, false);
  for (const m of computeBalances(s).values()) for (const q of m.values()) assert.ok(q >= 0);
});

test('supply request: approve then fulfil exactly once', () => {
  let s = createSeed();
  s = ok(submitRequest(s, 'employee', { type: 'supply', itemId: 'ITM-0001', quantity: 1, employeeId: 'EMP-02', reason: 'Полевые отчёты', date: D }));
  const id = s.requests[s.requests.length - 1].id;
  assert.equal(fulfillRequest(s, 'storekeeper', id, WH, D).ok, false); // not approved yet
  s = ok(approveRequest(s, 'director', id, D));
  assert.equal(approveRequest(s, 'director', id, D).ok, false);
  const before = s.movements.length;
  s = ok(fulfillRequest(s, 'storekeeper', id, WH, D));
  assert.equal(s.movements.length, before + 1);
  assert.equal(balanceOf(s, 'ITM-0001', 'emp:EMP-02'), 1);
  assert.equal(fulfillRequest(s, 'storekeeper', id, WH, D).ok, false);
  assert.equal(balanceOf(s, 'ITM-0001', WH), 2);
});

test('approved request with insufficient stock stays approved with explicit error', () => {
  const s = createSeed();
  const r = fulfillRequest(s, 'storekeeper', 'REQ-0014', WH, D);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /Недостаточно/);
  assert.equal(s.requests.find((x) => x.id === 'REQ-0014')!.status, 'approved');
});

test('writeoff approval removes exactly once; rejection leaves stock', () => {
  let s = createSeed();
  const v0 = companyValue(s);
  const rej = ok(rejectRequest(s, 'director', 'REQ-0012', D));
  assert.equal(balanceOf(rej, 'ITM-0007', 'loc:LOC-02'), 3);
  assert.equal(companyValue(rej), v0);
  assert.equal(approveRequest(rej, 'director', 'REQ-0012', D).ok, false);
  s = ok(approveRequest(s, 'director', 'REQ-0012', D));
  assert.equal(balanceOf(s, 'ITM-0007', 'loc:LOC-02'), 2);
  assert.equal(approveRequest(s, 'director', 'REQ-0012', D).ok, false);
  assert.equal(s.movements.filter((m) => m.requestId === 'REQ-0012').length, 1);
  assert.equal(companyValue(s), v0 - 38200);
  assert.equal(submitRequest(s, 'employee', { type: 'writeoff', itemId: 'ITM-0007', quantity: 9, employeeId: 'EMP-05', reason: 'x', sourceHolderId: 'loc:LOC-02', date: D }).ok, false);
});

test('corrupt state detected', () => {
  assert.notEqual(validateState({}), null);
  const s = createSeed();
  s.movements.push({ ...s.movements[0], id: 'BAD', quantity: -3 });
  assert.notEqual(validateState(s), null);
});
