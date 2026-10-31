import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { activityTable, db, fleetEquipmentTable, pool, repairExpensesTable, sparePartMovementsTable, sparePartsTable } from "@workspace/db";
import router from "../routes/equipment-repairs";
import { repairBusinessDate } from "./repair-calculations";

after(() => pool.end());

test("spare parts receipts and issues preserve stock and repair costs under retries", async () => {
  const key = `spares-${randomUUID()}`;
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { userId: key, displayName: key, email: "", department: "", role: req.headers["x-test-role"] };
    next();
  });
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  for (const layer of (router as unknown as { stack: Layer[] }).stack) {
    const route = layer.route;
    if (route?.methods.post && route.path.startsWith("/engineering/spare-parts/"))
      app.post(route.path, ...route.stack.map(s => s.handle));
  }
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
    res.status(500).json({ error: err.message }));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.on("listening", resolve));
  const address = server.address() as { port: number };
  const call = async (path: string, body: unknown, expected = 201, role = "storekeeper") => {
    const response = await fetch(`http://127.0.0.1:${address.port}/engineering/spare-parts/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-test-role": role }, body: JSON.stringify(body),
    });
    const result = await response.json() as { id: number; sparePartId: number; error?: string };
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  let fleetId: number | undefined;
  try {
    const [fleet] = await db.insert(fleetEquipmentTable).values({
      kind: key, registrationNumber: key, registrationKey: key, unit: key, updatedBy: key,
    }).returning();
    fleetId = fleet.id;
    const receipt = {
      requestId: randomUUID(), name: key, articleNumber: key, unit: "шт", quantity: 4, unitPrice: 1250,
      occurredOn: repairBusinessDate(), invoiceNumber: key, invoiceDate: repairBusinessDate(), supplier: key, description: "",
    };
    await call("receipts", receipt, 403, "engineer");
    const received = await call("receipts", receipt);
    assert.equal((await call("receipts", receipt)).id, received.id);
    const issue = {
      requestId: randomUUID(), sparePartId: received.sparePartId, fleetId, quantity: 1,
      category: "capital", occurredOn: repairBusinessDate(), description: "",
    };
    await call("issues", issue, 403, "engineer");
    const issued = await call("issues", issue);
    assert.equal((await call("issues", issue)).id, issued.id);
    let [part] = await db.select().from(sparePartsTable).where(eq(sparePartsTable.id, received.sparePartId));
    assert.equal(Number(part.quantity), 3);
    const expenses = await db.select().from(repairExpensesTable).where(eq(repairExpensesTable.fleetId, fleetId));
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].category, "capital");
    assert.equal(Number(expenses[0].amount), 1250);
    await call("issues", { ...issue, requestId: randomUUID(), quantity: 4 }, 409);
    // Reusing an old form token with changed data must not silently report success.
    await call("receipts", { ...receipt, unitPrice: 1500 }, 409);
    await call("issues", { ...issue, quantity: 2 }, 409);
    await call("receipts", { ...receipt, requestId: issue.requestId }, 409);
    const anotherReceipt = { ...receipt, requestId: randomUUID() };
    const receipts = await Promise.all([call("receipts", anotherReceipt), call("receipts", anotherReceipt)]);
    assert.equal(receipts[0].id, receipts[1].id);
    const anotherIssue = { ...issue, requestId: randomUUID() };
    const issues = await Promise.all([call("issues", anotherIssue), call("issues", anotherIssue)]);
    assert.equal(issues[0].id, issues[1].id);
    [part] = await db.select().from(sparePartsTable).where(eq(sparePartsTable.id, received.sparePartId));
    assert.equal(Number(part.quantity), 6);
    assert.equal((await db.select().from(repairExpensesTable).where(eq(repairExpensesTable.fleetId, fleetId))).length, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (fleetId) await db.delete(repairExpensesTable).where(eq(repairExpensesTable.fleetId, fleetId));
    const parts = await db.select().from(sparePartsTable).where(eq(sparePartsTable.nameKey, key));
    for (const part of parts) {
      await db.delete(sparePartMovementsTable).where(eq(sparePartMovementsTable.sparePartId, part.id));
      await db.delete(sparePartsTable).where(eq(sparePartsTable.id, part.id));
    }
    if (fleetId) await db.delete(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, fleetId));
    await db.delete(activityTable).where(eq(activityTable.userName, `${key} · storekeeper`));
  }
});
