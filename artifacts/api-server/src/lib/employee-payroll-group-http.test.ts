import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq, like } from "drizzle-orm";
import { db, pool, employeesTable, activityTable, payrollRegistersTable, payrollRegisterItemsTable } from "@workspace/db";
import employeesRouter from "../routes/employees";

after(() => pool.end());
test("HR group assignment preserves payroll, limits permissions and rejects stale moves", async () => {
  const key = `hr-group-http-${randomUUID()}`;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { userId: key, displayName: key, role: String(req.headers["x-test-role"]), email: "", department: "" };
    next();
  });
  // Only this ephemeral harness substitutes authentication; actual action guards are retained.
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  for (const layer of (employeesRouter as unknown as { stack: Layer[] }).stack) {
    if (layer.route?.methods.patch) app.patch(layer.route.path, ...layer.route.stack.map((handler) => handler.handle));
  }
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const [employee] = await db.insert(employeesTable).values({ fullName: key, department: "Исходное хозяйство", position: "Специалист", createdBy: key, updatedBy: key }).returning();
  let registerId = 0;
  const call = async (role: string, id: number, body: unknown, status = 200) => {
    const response = await fetch(`${base}/economic/employees/${id}/payroll-group`, {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-test-role": role }, body: JSON.stringify(body),
    });
    const result = await response.json() as Record<string, unknown>;
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  };
  try {
    const [register] = await db.insert(payrollRegistersTable).values({ unit: key, workDate: "2026-10-28", status: "pending_hr", totalAmount: "125.50", createdByUserId: key, createdByName: key }).returning();
    registerId = register.id;
    await db.insert(payrollRegisterItemsTable).values({ registerId, employeeId: employee.id, employeeName: key, workType: "Работа", amountKzt: "125.50" });
    const body = { payrollGroup: "brigade", expectedGroup: "unassigned" };
    await call("dispatcher", employee.id, body, 403);
    await call("chief_engineer", employee.id, body, 403);
    await call("hr", employee.id, { ...body, payrollGroup: "invented" }, 400);
    await call("hr", 1.5, body, 400);
    const moved = await call("hr", employee.id, { ...body, fullName: "Не менять", amount: 999999 });
    assert.equal(moved.payrollGroup, "brigade");
    assert.equal(moved.fullName, key);
    assert.equal(moved.department, "Исходное хозяйство");
    await call("hr", employee.id, { payrollGroup: "motor_pool", expectedGroup: "unassigned" }, 409);
    await call("general_director", employee.id, { payrollGroup: "workshop", expectedGroup: "brigade" });
    await call("hr", employee.id, { payrollGroup: "unassigned", expectedGroup: "workshop" });
    const [item] = await db.select().from(payrollRegisterItemsTable).where(eq(payrollRegisterItemsTable.registerId, registerId));
    const [unchanged] = await db.select().from(payrollRegistersTable).where(eq(payrollRegistersTable.id, registerId));
    assert.equal(item.amountKzt, "125.50");
    assert.equal(unchanged.totalAmount, "125.50");
    assert.equal(unchanged.status, "pending_hr");
    assert.equal(unchanged.version, 1);
    await call("hr", 2147483647, body, 404);
  } finally {
    if (registerId) {
      await db.delete(payrollRegisterItemsTable).where(eq(payrollRegisterItemsTable.registerId, registerId));
      await db.delete(payrollRegistersTable).where(eq(payrollRegistersTable.id, registerId));
    }
    await db.delete(activityTable).where(like(activityTable.userName, `${key}%`));
    await db.delete(employeesTable).where(eq(employeesTable.id, employee.id));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
