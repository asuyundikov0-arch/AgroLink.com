import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq, like } from "drizzle-orm";
import { db, pool, grainCropsTable, grainLocationsTable, grainMovementsTable, seedMovementsTable,
  agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, activityTable } from "@workspace/db";
import seedRouter from "../routes/seeds";
import grainRouter from "../routes/grain";
import { fieldCosts } from "./field-costs";
import { calculateGrainLedger, grainBusinessDate } from "./grain-ledger";
import { seedBalances, seedIssueCost } from "./seed-ledger";

after(() => pool.end());
test("seed weighted-average cents and same-day approval order", () => {
  const seed = { unit: "farm", cropId: 1, occurredOn: "2026-01-01", approvalStatus: "approved" };
  const stock = seedBalances([
    { ...seed, id: 1, kind: "issue", quantityKg: 300, amountCents: "100" },
    { ...seed, id: 2, kind: "receipt", quantityKg: 1000, amountCents: "333" },
  ]).get(`farm\0${1}`)!;
  assert.equal(stock.quantityKg, 700);
  assert.equal(stock.cents, 233n);
  assert.equal(seedIssueCost(stock, 700).amountCents, 233n, "Full depletion clears rounding residue");
  assert.throws(() => seedIssueCost(stock, 701));
});

test("invoice -> approval -> commodity conversion -> field issue -> exact costs, permissions and concurrency", async () => {
  const key = `seed-http-${randomUUID()}`, today = grainBusinessDate(), unit = "АПК Арыстан Grain";
  const yesterday = new Date(new Date(`${today}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    res.locals.access = { role: String(req.headers["x-role"]), userId: key, displayName: key };
    next();
  });
  for (const router of [seedRouter, grainRouter]) {
    for (const layer of router.stack as { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } }[]) {
      if (!layer.route) continue;
      const r = layer.route;
      for (const method of ["get", "post", "patch"] as const) if (r.methods[method]) app[method](r.path, ...r.stack.map(h => h.handle));
    }
  }
  app.use(((error, _req, res, _next) => res.status(500).json({ error: String(error) })) as express.ErrorRequestHandler);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(role: string, method: string, path: string, body?: unknown, expected = 200) {
    const res = await fetch(`${base}${path}`, { method, headers: { "x-role": role, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = await res.json() as any;
    assert.equal(res.status, expected, `${method} ${path}: ${JSON.stringify(json)}`);
    return json;
  }
  let cropId = 0, locationId = 0, fieldId = 0, seasonId = 0;
  try {
    const [crop] = await db.insert(grainCropsTable).values({ name: key, nameKey: key }).returning(); cropId = crop.id;
    const [location] = await db.insert(grainLocationsTable).values({ name: key, nameKey: key, unit, kind: "warehouse" }).returning(); locationId = location.id;
    const [field] = await db.insert(agroFieldsTable).values({ unit, number: key, numberKey: key, areaAres: 10000, updatedBy: key }).returning(); fieldId = field.id;
    const [season] = await db.insert(fieldSeasonsTable).values({ fieldId, year: Number(today.slice(0, 4)), cropName: key, areaAres: 10000, updatedBy: key }).returning(); seasonId = season.id;
    const [operation] = await db.insert(fieldOperationsTable).values({
      seasonId, name: "Посев", nameKey: "посев", plannedStart: today, plannedEnd: today, plannedAreaAres: 10000, updatedBy: key,
    }).returning();
    const receipt = { requestId: randomUUID(), unit, cropId, kind: "receipt", occurredOn: today,
      quantityTons: 10, pricePerTon: 100000, invoiceNumber: key, supplier: "Поставщик" };
    await call("agronomist", "POST", "/agro/seeds/movements", receipt, 403);
    await call("weigher", "POST", "/agro/seeds/movements", { ...receipt, quantityTons: -1 }, 400);
    const pending = await call("weigher", "POST", "/agro/seeds/movements", receipt, 201);
    assert.equal(pending.approvalStatus, "pending");
    assert.equal((await call("weigher", "POST", "/agro/seeds/movements", receipt, 201)).id, pending.id);
    await call("weigher", "POST", "/agro/seeds/movements", { ...receipt, quantityTons: 11 }, 409);
    const ownStock = async () => (await call("grain_manager", "GET", "/agro/seeds")).stocks.find((s: any) => s.cropId === cropId);
    assert.equal(await ownStock(), undefined, "Pending invoice is not stock");
    const approve = (id: number) => call("grain_manager", "POST", `/agro/seeds/movements/${id}/review`, { decision: "approved" });
    await call("weigher", "POST", `/agro/seeds/movements/${pending.id}/review`, { decision: "approved" }, 403);
    await approve(pending.id);
    await approve(pending.id); // safe repeated review
    assert.equal((await ownStock()).amount, 1000000);
    const oldPending = await call("weigher", "POST", "/agro/seeds/movements", { ...receipt, requestId: randomUUID(), occurredOn: yesterday }, 409);
    assert.ok(oldPending.error);
    await db.insert(grainMovementsTable).values({
      requestId: randomUUID(), unit, cropId, operation: "opening", occurredOn: today,
      quantityKg: 20000, toLocationId: locationId, createdBy: key, createdByUserId: key,
    });
    const conversion = await call("weigher", "POST", "/agro/seeds/movements", {
      requestId: randomUUID(), unit, cropId, kind: "from_grain", occurredOn: today,
      quantityTons: 4, pricePerTon: 150000, fromLocationId: locationId,
    }, 201);
    let grainRows = await db.select().from(grainMovementsTable).where(eq(grainMovementsTable.cropId, cropId));
    assert.equal(calculateGrainLedger(grainRows).summary.totalKg, 20000);
    const linked = grainRows.find(r => r.operation === "seed_transfer")!;
    await call("grain_manager", "PATCH", `/agro/grain/movements/${linked.id}/review`, { decision: "approved", reviewComment: "" }, 409);
    await call("general_director", "POST", `/agro/grain/movements/${linked.id}/void`, { reason: "test cancellation" }, 409);
    await approve(conversion.id);
    grainRows = await db.select().from(grainMovementsTable).where(eq(grainMovementsTable.cropId, cropId));
    assert.equal(calculateGrainLedger(grainRows).summary.totalKg, 16000, "Not counted in both commodity and seed stock");
    assert.equal((await ownStock()).quantityTons, 14);
    assert.equal((await ownStock()).amount, 1600000);
    const issueBody = { requestId: randomUUID(), unit, cropId, kind: "issue", occurredOn: today,
      quantityTons: 7, seasonId, operationId: operation.id, pricePerTon: 1 };
    const issue = await call("weigher", "POST", "/agro/seeds/movements", issueBody, 201);
    assert.equal(issue.amount, 800000, "Client price cannot override average stock cost");
    assert.equal((await db.transaction(tx => fieldCosts(tx, seasonId)))!.seedCost, 0);
    await approve(issue.id);
    const costs = (await db.transaction(tx => fieldCosts(tx, seasonId)))!;
    assert.equal(costs.seedCost, 800000);
    assert.equal(costs.totalCost, 800000);
    assert.equal(costs.operations[0].seedIssues![0].quantityTons, 7);
    assert.equal((await ownStock()).quantityTons, 7);
    await call("weigher", "POST", "/agro/seeds/movements", { ...issueBody, requestId: randomUUID(), quantityTons: 8 }, 409);
    await call("general_director", "POST", "/agro/seeds/movements", {
      ...receipt, requestId: randomUUID(), quantityTons: 6, pricePerTon: 200000,
    }, 201);
    const [a, b] = await Promise.all([1, 2].map(() => call("weigher", "POST", "/agro/seeds/movements",
      { ...issueBody, requestId: randomUUID(), quantityTons: 8 }, 201)));
    const statuses = await Promise.all([a, b].map(item => fetch(`${base}/agro/seeds/movements/${item.id}/review`, {
      method: "POST", headers: { "x-role": "grain_manager", "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    }).then(r => r.status)));
    assert.deepEqual(statuses.sort(), [200, 409], "Concurrent approvals cannot overdraw stock");
    const leftover = (await db.select().from(seedMovementsTable).where(eq(seedMovementsTable.cropId, cropId))).find(r => r.approvalStatus === "pending")!;
    await call("grain_manager", "POST", `/agro/seeds/movements/${leftover.id}/review`, { decision: "rejected", note: "Недостаточный остаток" });
    assert.equal((await ownStock()).quantityTons, 5);
    assert.equal(Number((await ownStock()).amount.toFixed(2)), 769230.77);
    assert.equal((await db.transaction(tx => fieldCosts(tx, seasonId)))!.seedCost, 2030769.23);
  } finally {
    if (cropId) {
      await db.delete(seedMovementsTable).where(eq(seedMovementsTable.cropId, cropId));
      await db.delete(grainMovementsTable).where(eq(grainMovementsTable.cropId, cropId));
    }
    if (seasonId) { await db.delete(fieldOperationsTable).where(eq(fieldOperationsTable.seasonId, seasonId)); await db.delete(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId)); }
    if (fieldId) await db.delete(agroFieldsTable).where(eq(agroFieldsTable.id, fieldId));
    if (locationId) await db.delete(grainLocationsTable).where(eq(grainLocationsTable.id, locationId));
    if (cropId) await db.delete(grainCropsTable).where(eq(grainCropsTable.id, cropId));
    await db.delete(activityTable).where(like(activityTable.userName, `${key}%`));
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
