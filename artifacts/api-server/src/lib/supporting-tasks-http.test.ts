import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, pool, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, supportingTasksTable } from "@workspace/db";
import router from "../routes/supporting-tasks";
import type { SupportingTask } from "@workspace/api-zod";

after(() => pool.end());
test("supporting tasks: immutable plan, editable owned drafts, durable multi-service dispatch and isolated acceptance", async () => {
  const key = `support-${randomUUID()}`;
  const app = express(); app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { userId: String(req.headers["x-test-user"] ?? key), role: String(req.headers["x-test-role"]), displayName: key, email: "", department: "" };
    next();
  });
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    if (!layer.route) continue;
    const r = layer.route;
    for (const method of ["get", "post", "patch"] as const) if (r.methods[method])
      app[method](r.path, ...r.stack.map((s) => s.handle));
  }
  app.use((err: Error & { status?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(err.status ?? 500).json({ error: err.message }));
  const server = createServer(app);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async <T = SupportingTask>(role: string, method: string, path: string, body?: unknown, expected = 200, user = key) => {
    const response = await fetch(url + path, { method, headers: { "Content-Type": "application/json", "x-test-role": role, "x-test-user": user },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json() as T;
    assert.equal(response.status, expected, JSON.stringify(result)); return result;
  };
  let fieldId: number | undefined, seasonId: number | undefined, operationId: number | undefined;
  try {
    const [field] = await db.insert(agroFieldsTable).values({ unit: "АПК Арыстан Grain", number: key, numberKey: key, areaAres: 10000, updatedBy: key }).returning();
    fieldId = field.id;
    const [season] = await db.insert(fieldSeasonsTable).values({ fieldId, year: 2026, cropName: "Пшеница", areaAres: 10000, updatedBy: key }).returning();
    seasonId = season.id;
    const source = { name: "Доставка семян", equipmentId: null, employeeIds: [], salaryCost: 5000, fuelCost: 3000,
      seedName: "", seedQuantity: 0, seedUnit: "kg" as const, seedPrice: 0 };
    const [op] = await db.insert(fieldOperationsTable).values({
      seasonId, name: "Посев", nameKey: key, plannedStart: "2026-05-01", plannedEnd: "2026-05-31", plannedAreaAres: 10000,
      supportingWorks: [source], updatedBy: key,
    }).returning();
    operationId = op.id;
    const body = { operationId, sourceIndex: 0, title: "Доставка семян утром", startDate: "2026-05-02", endDate: "2026-05-03",
      equipmentId: null, employeeIds: [], salaryBudget: 1000, fuelBudget: 2000, quantity: 10, quantityUnit: "т",
      notes: "Для посева", services: ["tok", "motor_pool", "fuel"], requestId: randomUUID() };
    const base = "/agro/supporting-tasks";
    await call("chief_agronomist", "POST", base, body, 403);
    await call("motor_pool_manager", "POST", base, body, 403);
    await call("agronomist", "POST", base, { ...body, sourceIndex: 1 }, 409);
    await call("agronomist", "POST", base, { ...body, startDate: "2026-02-30" }, 400);
    await call("agronomist", "POST", base, { ...body, salaryBudget: 1.001 }, 400);
    await call("agronomist", "POST", base, { ...body, services: ["tok", "tok"] }, 400);
    let task = await call("agronomist", "POST", base, body, 201);
    assert.equal(task.fieldId, fieldId); assert.equal(task.fieldNumber, key);
    assert.equal(task.sourceSnapshot.salaryCost, 5000); assert.equal(task.salaryBudget, 1000);
    const repeat = await call("agronomist", "POST", base, body, 201);
    assert.equal(repeat.id, task.id);
    await call("agronomist", "POST", base, { ...body, title: "Другой запрос" }, 409);
    assert.ok((await call<SupportingTask[]>("grain_manager", "GET", base + "?service=tok")).every((t) => t.id !== task.id));
    await call("agronomist", "PATCH", `${base}/${task.id}`, { ...body, version: task.version }, 403, key + "-other");
    task = await call("agronomist", "PATCH", `${base}/${task.id}`, { ...body, salaryBudget: 1500, version: task.version });
    assert.equal(task.salaryBudget, 1500); assert.equal(task.sourceSnapshot.salaryCost, 5000);
    await call("agronomist", "PATCH", `${base}/${task.id}`, { ...body, version: 1 }, 409);
    await call("agronomist", "PATCH", `${base}/${task.id}`, { ...body, sourceIndex: 1, version: task.version }, 400);
    task = await call("agronomist", "POST", `${base}/${task.id}/send`, { version: task.version });
    assert.equal(task.status, "sent"); assert.equal(task.deliveries.length, 3);
    const sentVersion = task.version;
    const resent = await call("agronomist", "POST", `${base}/${task.id}/send`, { version: 1 });
    assert.equal(resent.version, sentVersion); assert.equal(resent.deliveries.length, 3);
    await call("agronomist", "PATCH", `${base}/${task.id}`, { ...body, version: task.version }, 409);
    for (const [role, service] of [["grain_manager", "tok"], ["motor_pool_manager", "motor_pool"], ["fuel_manager", "fuel"]]) {
      const inbox = await call<SupportingTask[]>(role, "GET", `${base}?service=${service}`);
      assert.ok(inbox.some((t: { id: number }) => t.id === task.id));
    }
    await call("fuel_manager", "GET", base + "?service=tok", undefined, 403);
    await call("weigher", "POST", `${base}/${task.id}/accept`, { version: task.version, service: "tok" }, 403);
    await call("grain_manager", "POST", `${base}/${task.id}/accept`, { version: task.version, service: "motor_pool" }, 403);
    task = await call("grain_manager", "POST", `${base}/${task.id}/accept`, { version: task.version, service: "tok" });
    assert.equal(task.deliveries.filter((d: { status: string }) => d.status === "accepted").length, 1);
    await call("motor_pool_manager", "POST", `${base}/${task.id}/accept`, { version: sentVersion, service: "motor_pool" }, 409);
    task = await call("motor_pool_manager", "POST", `${base}/${task.id}/accept`, { version: task.version, service: "motor_pool" });
    task = await call("fuel_manager", "POST", `${base}/${task.id}/accept`, { version: task.version, service: "fuel" });
    assert.ok(task.deliveries.every((d: { status: string }) => d.status === "accepted"));
    const [unchanged] = await db.select().from(fieldOperationsTable).where(eq(fieldOperationsTable.id, operationId));
    assert.deepEqual(unchanged.supportingWorks, [source]); assert.equal(unchanged.version, op.version);
    assert.deepEqual(unchanged.actualSupportingWorks, []);
    assert.ok((await call<SupportingTask[]>("chief_agronomist", "GET", base)).some((t) => t.id === task.id));
    assert.ok((await call<SupportingTask[]>("agronomist", "GET", base, undefined, 200, key + "-other")).every((t) => t.id !== task.id));
    console.log("Created, edited, dispatched, accepted by three services; no change to chief plan or actual expenses.");
  } finally {
    if (operationId) {
      await db.delete(supportingTasksTable).where(eq(supportingTasksTable.operationId, operationId));
      await db.delete(fieldOperationsTable).where(eq(fieldOperationsTable.id, operationId));
    }
    if (seasonId) await db.delete(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId));
    if (fieldId) await db.delete(agroFieldsTable).where(eq(agroFieldsTable.id, fieldId));
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
