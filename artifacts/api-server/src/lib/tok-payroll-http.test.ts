import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express from "express";
import { eq, like } from "drizzle-orm";
import { db, pool, activityTable, employeesTable, payrollRegistersTable, tokPayrollEntriesTable } from "@workspace/db";
import tokRouter from "../routes/tok-payroll";
import payrollRouter from "../routes/payroll-registers";
import { calculateTokPay } from "./tok-payroll";

after(() => pool.end());
test("tok wages: shift/hour/ton/fixed, exact rounding and valid money limits", () => {
  assert.equal(calculateTokPay("shift", 2, 10000), "20000.00");
  assert.equal(calculateTokPay("hour", 2.5, 1000), "2500.00");
  assert.equal(calculateTokPay("ton", 0.125, 0.2), "0.03");
  assert.equal(calculateTokPay("fixed", 1, 50000), "50000.00");
  for (const args of [["fixed", 2, 1], ["ton", 0, 1], ["hour", 1.0001, 1], ["shift", 1, 0.001], ["ton", 1e6, 1e9], ["bad", 1, 1]] as const) {
    assert.throws(() => calculateTokPay(args[0], args[1], args[2]));
  }
});

test("tok entry -> edit -> stale snapshot rejection -> own HR narad -> confirmed wages; submitted sources immutable", async () => {
  const key = `tok-test-${randomUUID()}`, workDate = "2020-02-10", unit = key;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { userId: `${key}-${req.headers["x-role"]}`, role: String(req.headers["x-role"]), displayName: key };
    next();
  });
  // Use the real role guard, bypassing only Clerk authentication with the synthetic identity above.
  app.use("/agro/tok-payroll", tokRouter.stack[1].handle);
  for (const router of [tokRouter, payrollRouter]) {
    for (const layer of router.stack) {
      if (!layer.route) continue;
      const route = layer.route as any;
      for (const method of Object.keys(route.methods)) {
        (app as any)[method](route.path, ...route.stack.map((handler: any) => handler.handle));
      }
    }
  }
  app.use((error: Error, _req: unknown, res: express.Response, _next: unknown) => res.status(500).json({ error: error.message }));
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (role: string, method: string, path: string, body?: unknown, status = method === "POST" ? 201 : 200) => {
    const response = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", "x-role": role }, body: body ? JSON.stringify(body) : undefined });
    const text = await response.text();
    assert.equal(response.status, status, `${method} ${path}: ${text}`);
    return JSON.parse(text);
  };
  let employeeId: number | undefined;
  try {
    const [employee] = await db.insert(employeesTable).values({ fullName: key, position: "Рабочий тока", department: "Ток", payrollGroup: "motor_pool", createdBy: key, updatedBy: key }).returning();
    employeeId = employee.id;
    const input = { workDate, unit, employeeId, workType: "Очистка зерна", payBasis: "shift", quantity: 1, rateKzt: 10000, notes: "Ночная смена", requestId: randomUUID() };
    await call("weigher", "POST", "/agro/tok-payroll/entries", input, 403);
    await call("agronomist", "GET", "/agro/tok-payroll/entries", undefined, 403);
    const first = await call("grain_manager", "POST", "/agro/tok-payroll/entries", { ...input, amountKzt: 999999 });
    assert.equal(first.amountKzt, 10000);
    assert.equal(first.employeeName, employee.fullName);
    const replay = await call("grain_manager", "POST", "/agro/tok-payroll/entries", input);
    assert.equal(replay.id, first.id);
    await call("grain_manager", "POST", "/agro/tok-payroll/entries", { ...input, quantity: 2 }, 409);
    const second = await call("general_director", "POST", "/agro/tok-payroll/entries", { ...input, requestId: randomUUID(), payBasis: "hour", quantity: 2.5, rateKzt: 1000 });
    assert.equal(second.amountKzt, 2500);
    const days = () => call("grain_manager", "GET", "/economic/payroll-accruals?sourceGroup=tok");
    const original = (await days()).find((day: any) => day.unit === unit);
    assert.equal(original.totalAmount, 12500);
    const updated = await call("grain_manager", "PATCH", `/agro/tok-payroll/entries/${first.id}`, { ...input, version: 1, quantity: 2 });
    assert.equal(updated.amountKzt, 20000);
    await call("grain_manager", "PATCH", `/agro/tok-payroll/entries/${first.id}`, { ...input, version: 1 }, 409);
    await call("grain_manager", "POST", "/economic/payroll-registers/send-daily", { workDate, unit, sourceGroup: "tok", sourceHash: original.sourceHash }, 409);
    const latest = (await days()).find((day: any) => day.unit === unit);
    assert.equal(latest.totalAmount, 22500);
    assert.ok(latest.entries.every((entry: any) => entry.employeeId === employeeId && entry.sourceType === "tok_work"));
    await call("grain_manager", "GET", "/economic/payroll-accruals?sourceGroup=brigade", undefined, 403);
    await call("motor_pool_manager", "GET", "/economic/payroll-accruals?sourceGroup=tok", undefined, 403);
    const order = await call("grain_manager", "POST", "/economic/payroll-registers/send-daily", { workDate, unit, sourceGroup: "tok", sourceHash: latest.sourceHash });
    assert.equal(order.status, "pending_hr");
    assert.equal(order.sourceGroup, "tok");
    assert.equal(order.totalAmount, 22500);
    await call("grain_manager", "POST", `/economic/payroll-registers/${order.id}/approve-hr`, { version: order.version }, 403);
    await call("grain_manager", "PATCH", `/agro/tok-payroll/entries/${first.id}`, { ...input, version: updated.version }, 409);
    const locked = (await call("grain_manager", "GET", "/agro/tok-payroll/entries")).filter((row: any) => row.unit === unit);
    assert.equal(locked.length, 2);
    assert.ok(locked.every((row: any) => row.locked));
    const approved = await call("hr", "POST", `/economic/payroll-registers/${order.id}/approve-hr`, { version: order.version }, 200);
    assert.equal(approved.status, "sent_to_economist");
    assert.equal(approved.totalAmount, 22500);
    assert.equal((await days()).some((day: any) => day.unit === unit), false);
    await call("grain_manager", "POST", "/economic/payroll-registers/send-daily", { workDate, unit, sourceGroup: "tok", sourceHash: latest.sourceHash }, 409);
  } finally {
    await db.delete(payrollRegistersTable).where(eq(payrollRegistersTable.unit, unit));
    await db.delete(tokPayrollEntriesTable).where(eq(tokPayrollEntriesTable.unit, unit));
    if (employeeId) await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
    await db.delete(activityTable).where(like(activityTable.userName, `${key}%`));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
