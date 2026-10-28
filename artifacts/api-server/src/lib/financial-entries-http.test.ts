import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db, pool, financialEntriesTable, activityTable, fleetEquipmentTable, sparePartRequestsTable, sparePartRequestItemsTable } from "@workspace/db";
import financialRouter, { financialAccessGuard } from "../routes/financial-entries";
import spareRouter from "../routes/spare-part-requests";
import { grainBusinessDate } from "./grain-ledger";

after(() => pool.end());
test("financial books: roles, cent precision, retries, locking, confirmation, voiding and approved-payment projection", async () => {
  const key = `finance-http-${randomUUID()}`;
  const today = grainBusinessDate();
  const year = Number(today.slice(0, 4));
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { userId: key, role: String(req.headers["x-test-role"]), displayName: key, email: "", department: key };
    next();
  });
  app.use("/economic/financial-entries", financialAccessGuard);
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  // Ephemeral loopback authentication only. Keep production validation and action guards.
  for (const router of [financialRouter, spareRouter]) {
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      const route = layer.route;
      if (!route) continue;
      for (const method of ["get", "post", "patch"] as const) if (route.methods[method]) {
        app[method](route.path, ...route.stack.map((handler) => handler.handle));
      }
    }
  }
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(role: string, method: string, path: string, body?: unknown, status = 200): Promise<any> {
    const response = await fetch(`${base}${path}`, { method: method.toUpperCase(), headers: { "Content-Type": "application/json", "x-test-role": role }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const input = (overrides: Record<string, unknown> = {}) => ({
    book: "budget", basis: "plan", direction: "expense", date: today, unit: key, category: "Топливо",
    counterparty: "Поставщик", description: "Тест", amountKzt: 100.01, clientRequestId: randomUUID(), ...overrides,
  });
  const path = "/economic/financial-entries";
  let fleetId = 0, requestId = 0;
  try {
    await call("hr", "get", `${path}?year=${year}`, undefined, 403);
    await call("engineer", "post", path, input(), 403);
    await call("economist", "get", `${path}?year=2026.5`, undefined, 400);
    await call("economist", "post", path, input({ amountKzt: 1.001 }), 400);
    await call("economist", "post", path, input({ date: "2026-02-30" }), 400);
    await call("economist", "post", path, input({ direction: "income" }), 400);
    await call("economist", "post", path, input({ unit: "  " }), 400);
    await call("economist", "post", path, input({ basis: "actual", date: "2100-01-01" }), 400);
    const payload = input();
    const [plan, retry] = await Promise.all([
      call("economist", "post", path, payload, 201), call("economist", "post", path, payload, 201),
    ]);
    assert.equal(plan.id, retry.id);
    assert.equal(plan.status, "recorded");
    await call("economist", "post", path, { ...payload, amountKzt: 200 }, 409);
    await call("economist", "post", `${path}/${plan.id}/complete`, { version: 1 }, 409);
    const changed = await call("economist", "patch", `${path}/${plan.id}`, { ...payload, version: 1, amountKzt: 110.02 });
    assert.equal(changed.version, 2);
    await call("economist", "patch", `${path}/${plan.id}`, { ...payload, version: 1 }, 409);
    await call("economist", "patch", `${path}/${plan.id}`, { ...payload, version: 2, book: "cash_flow" }, 400);
    const actualCost = await call("economist", "post", path, input({ basis: "actual", amountKzt: 50.55 }), 201);
    assert.equal(actualCost.status, "recorded");
    const payment = await call("economist", "post", path, input({ book: "cash_flow", basis: "actual", amountKzt: 20.2 }), 201);
    assert.equal(payment.status, "pending");
    const completed = await call("economist", "post", `${path}/${payment.id}/complete`, { version: 1 });
    assert.equal(completed.status, "completed");
    assert.equal(completed.amountKzt, 20.2);
    assert.equal(completed.completedBy, key);
    await call("economist", "post", `${path}/${payment.id}/complete`, { version: 1 }, 409);
    await call("economist", "patch", `${path}/${payment.id}`, { ...input({ book: "cash_flow", basis: "actual" }), version: 2 }, 409);
    const receipt = await call("economist", "post", path, input({ book: "cash_flow", basis: "actual", direction: "income", amountKzt: 1000 }), 201);
    assert.equal((await call("general_director", "post", `${path}/${receipt.id}/complete`, { version: 1 })).status, "completed");
    await call("economist", "post", `${path}/${payment.id}/void`, { version: 2, reason: "Ошибка ввода" }, 403);
    const voided = await call("general_director", "post", `${path}/${payment.id}/void`, { version: 2, reason: "Ошибка ввода" });
    assert.equal(voided.status, "voided");
    assert.equal(voided.amountKzt, 20.2);
    assert.equal(voided.voidReason, "Ошибка ввода");
    await call("general_director", "post", `${path}/${payment.id}/void`, { version: 3, reason: "Повтор" }, 409);
    const [fleet] = await db.insert(fleetEquipmentTable).values({ kind: "Трактор", registrationNumber: key, registrationKey: key, unit: key, updatedBy: key }).returning();
    fleetId = fleet.id;
    const [request] = await db.insert(sparePartRequestsTable).values({ requestId: key, requesterUserId: key, requesterName: key, department: key, status: "awaiting_payment" }).returning();
    requestId = request.id;
    const [part] = await db.insert(sparePartRequestItemsTable).values({ requestId, fleetId, name: "Фильтр", quantity: "2", unitPrice: "22", status: "awaiting_payment", paymentStatus: "pending", directorReviewedByName: "Директор", directorReviewedAt: new Date() }).returning();
    const [unapproved] = await db.insert(sparePartRequestItemsTable).values({ requestId, fleetId, name: "Не согласовано", quantity: "1", unitPrice: "5" }).returning();
    await call("economist", "post", `/economic/payment-register/${unapproved.id}/pay`, {}, 409);
    await call("hr", "post", `/economic/payment-register/${part.id}/pay`, {}, 403);
    await call("economist", "post", `/economic/payment-register/${part.id}/pay`, {});
    await call("economist", "post", `/economic/payment-register/${part.id}/pay`, {}, 409);
    const list = await call("economist", "get", `${path}?year=${year}`);
    const source = list.filter((row: any) => row.id === -part.id);
    assert.equal(source.length, 1);
    assert.equal(source[0].amountKzt, 44);
    assert.equal(source[0].source, "spare_part");
    assert.equal(source[0].status, "completed");
    assert.equal(source[0].book, "cash_flow");
    await call("economist", "post", `${path}/${-part.id}/complete`, { version: 0 }, 400);
    const reload = await call("general_director", "get", `${path}?year=${year}`);
    assert.equal(reload.find((row: any) => row.id === actualCost.id).amountKzt, 50.55);
    assert.equal(reload.find((row: any) => row.id === plan.id).amountKzt, 110.02);
    assert.equal(reload.find((row: any) => row.id === payment.id).status, "voided");
  } finally {
    await db.delete(financialEntriesTable).where(eq(financialEntriesTable.unit, key));
    if (requestId) {
      await db.delete(sparePartRequestItemsTable).where(eq(sparePartRequestItemsTable.requestId, requestId));
      await db.delete(sparePartRequestsTable).where(eq(sparePartRequestsTable.id, requestId));
    }
    if (fleetId) await db.delete(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, fleetId));
    await db.delete(activityTable).where(eq(activityTable.userName, key));
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
