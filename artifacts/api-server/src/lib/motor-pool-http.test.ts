import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, test } from "node:test";
import express, { type RequestHandler } from "express";
import { eq, inArray, like } from "drizzle-orm";
import {
  db, pool, activityTable, grainMovementsTable, grainCropsTable, grainLocationsTable,
  employeesTable, payrollRegistersTable, agroFieldsTable, fieldSeasonsTable,
  fieldOperationsTable, fieldOperationProgressTable,
} from "@workspace/db";
import grainRouter from "../routes/grain";
import payrollRouter from "../routes/payroll-registers";
import { transportPay } from "./transport-pay";

after(() => pool.end());

test("ton-km salary rounds only the final sum and rejects invalid precision", () => {
  assert.equal(transportPay("ton_km", 20000, 100, { tariffPerTonKm: 2.5, rateKzt: 999999 }), "5000.00");
  assert.equal(transportPay("ton_km", 12345, 12.345, { tariffPerTonKm: 1.2345 }), "188.14");
  assert.equal(transportPay("per_trip", 20000, 100, { rateKzt: 1234.56 }), "1234.56");
  assert.throws(() => transportPay("ton_km", 20000, 0, { tariffPerTonKm: 2.5 }));
  assert.throws(() => transportPay("ton_km", 20000, 100, { tariffPerTonKm: 2.50001 }));
  assert.throws(() => transportPay("per_trip", 1, 0, { rateKzt: 1.001 }));
});

test("weigher -> approved grain trip -> motor-pool tariff -> separate HR orders without duplicate wages", async () => {
  const key = `motor-test-${randomUUID()}`;
  const unit = "АПК Арыстан Grain";
  const date = "2019-02-13";
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    const role = String(req.headers["x-test-role"] ?? "");
    res.locals.access = { userId: `${key}-${role}`, role, displayName: key, email: "", department: "" };
    next();
  });
  type Layer = { route?: { path: string; methods: Record<string, boolean>; stack: { handle: RequestHandler }[] } };
  // Test-only authentication shim; retain the production controllers and route-level role checks.
  for (const router of [grainRouter, payrollRouter]) {
    for (const layer of (router as unknown as { stack: Layer[] }).stack) {
      if (!layer.route) continue;
      for (const method of ["get", "post", "patch"] as const) {
        if (layer.route.methods[method]) app[method](layer.route.path, ...layer.route.stack.map(s => s.handle));
      }
    }
  }
  app.use(((err, _req, res, _next) => res.status(500).json({ error: String(err) })) as express.ErrorRequestHandler);
  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  async function call(role: string, method: string, path: string, data?: unknown, status = 200) {
    const response = await fetch(`${base}${path}`, {
      method, headers: { "x-test-role": role, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    const text = await response.text();
    assert.ok(response.headers.get("content-type")?.includes("json"), `${method} ${path}: ${response.status} ${text.slice(0, 120)}`);
    const json = JSON.parse(text) as any;
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(json)}`);
    return json;
  }
  let employeeId = 0, cropId = 0, fieldId = 0, seasonId = 0, operationId = 0;
  let locationIds: number[] = [];
  try {
    const [employee] = await db.insert(employeesTable).values({ fullName: key, createdBy: key, updatedBy: key }).returning();
    employeeId = employee.id;
    const [crop] = await db.insert(grainCropsTable).values({ name: key, nameKey: key }).returning();
    cropId = crop.id;
    const locations = await db.insert(grainLocationsTable).values(["warehouse", "elevator"].map((kind, n) => ({
      name: `${key}-${n}`, nameKey: `${key}-${n}`, unit, kind,
    }))).returning();
    locationIds = locations.map(row => row.id);
    const movement = {
      requestId: randomUUID(), unit, operation: "opening", cropId, occurredOn: date, quantityTons: 100,
      fromLocationId: null, toLocationId: locations[0].id, fieldName: "", counterparty: "", notes: key,
    };
    await call("general_director", "POST", "/agro/grain/movements", movement, 201);
    const transfer = {
      ...movement, requestId: randomUUID(), operation: "transfer", quantityTons: 20,
      fromLocationId: locations[0].id, toLocationId: locations[1].id,
      truckNumber: key.slice(0, 35), driverEmployeeId: employeeId, transportPayBasis: "ton_km", distanceKm: 100,
    };
    await call("weigher", "POST", "/agro/grain/movements", { ...transfer, distanceKm: 0 }, 400);
    const trip = await call("weigher", "POST", "/agro/grain/movements", transfer, 201);
    assert.equal((await call("weigher", "POST", "/agro/grain/movements", transfer, 201)).id, trip.id);
    await call("motor_pool_manager", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { version: 1, tariffPerTonKm: 2.5 }, 409);
    await call("dispatcher", "GET", "/agro/grain/transport-trips", undefined, 403);
    await call("dispatcher", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { rateKzt: 5000 }, 403);
    await call("grain_manager", "PATCH", `/agro/grain/movements/${trip.id}/review`, { decision: "approved", reviewComment: "" });
    await call("motor_pool_manager", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { version: 1, tariffPerTonKm: 1.00001 }, 400);
    const rated = await call("motor_pool_manager", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { version: 1, tariffPerTonKm: 2.5, rateKzt: 999999 });
    assert.equal(rated.rateKzt, 5000);
    assert.equal(rated.tonKm, 2000);
    assert.equal(rated.distanceKm, 100);
    await call("motor_pool_manager", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { version: 1, tariffPerTonKm: 3 }, 409);
    const [field] = await db.insert(agroFieldsTable).values({ unit, number: key, numberKey: key, areaAres: 1000, updatedBy: key }).returning();
    fieldId = field.id;
    const [season] = await db.insert(fieldSeasonsTable).values({ fieldId, year: 2019, cropName: key, areaAres: 1000, updatedBy: key }).returning();
    seasonId = season.id;
    const [operation] = await db.insert(fieldOperationsTable).values({
      seasonId, name: key, nameKey: key, plannedStart: date, plannedEnd: date,
      plannedAreaAres: 1000, actualStart: date, actualOperationName: key, actualAreaAres: 1000,
      actualMechanic: key, actualMechanicEmployeeId: employeeId, updatedBy: key,
    }).returning();
    operationId = operation.id;
    await db.insert(fieldOperationProgressTable).values({
      operationId, reportDate: date, cumulativeAreaAres: 1000, actualRatePerHa: "100.00",
      actualMechanic: key, actualMechanicEmployeeId: employeeId, updatedBy: key,
    });
    const motorDays = await call("motor_pool_manager", "GET", "/economic/payroll-accruals?sourceGroup=motor_pool");
    const brigadeDays = await call("dispatcher", "GET", "/economic/payroll-accruals?sourceGroup=brigade");
    await call("dispatcher", "GET", "/economic/payroll-accruals?sourceGroup=motor_pool", undefined, 403);
    await call("motor_pool_manager", "GET", "/economic/payroll-registers?sourceGroup=brigade", undefined, 403);
    const motorDay = motorDays.find((day: any) => day.workDate === date && day.unit === unit);
    const brigadeDay = brigadeDays.find((day: any) => day.workDate === date && day.unit === unit);
    // Never submit a work order containing another user's real source data.
    assert.ok(motorDay.entries.every((entry: any) => entry.employeeId === employeeId));
    assert.ok(brigadeDay.entries.every((entry: any) => entry.employeeId === employeeId));
    assert.equal(motorDay.totalAmount, 5000);
    assert.equal(brigadeDay.totalAmount, 1000);
    await call("dispatcher", "POST", "/economic/payroll-registers/send-daily", { ...motorDay, sourceGroup: "motor_pool" }, 403);
    const motorOrder = await call("motor_pool_manager", "POST", "/economic/payroll-registers/send-daily", { ...motorDay, sourceGroup: "motor_pool" }, 201);
    const fieldOrder = await call("dispatcher", "POST", "/economic/payroll-registers/send-daily", { ...brigadeDay, sourceGroup: "brigade" }, 201);
    assert.equal(motorOrder.sourceGroup, "motor_pool");
    assert.equal(fieldOrder.sourceGroup, "brigade");
    assert.equal(motorOrder.status, "pending_hr");
    assert.equal(fieldOrder.status, "pending_hr");
    await call("motor_pool_manager", "PATCH", `/agro/grain/transport-trips/${trip.id}/rate`, { version: rated.version, tariffPerTonKm: 3 }, 409);
    await call("motor_pool_manager", "POST", `/economic/payroll-registers/${motorOrder.id}/approve-hr`, { version: motorOrder.version }, 403);
    const confirmed = await call("hr", "POST", `/economic/payroll-registers/${motorOrder.id}/approve-hr`, { version: motorOrder.version });
    assert.equal(confirmed.status, "sent_to_economist");
    const ownRegisters = await call("motor_pool_manager", "GET", "/economic/payroll-registers");
    assert.ok(!ownRegisters.some((row: any) => row.id === fieldOrder.id));
    const remaining = await call("motor_pool_manager", "GET", "/economic/payroll-accruals");
    assert.ok(!remaining.some((day: any) => day.entries.some((entry: any) => entry.sourceId === trip.id && entry.sourceType === "grain_trip")));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    await db.delete(payrollRegistersTable).where(like(payrollRegistersTable.createdByUserId, `${key}%`));
    if (operationId) await db.delete(fieldOperationProgressTable).where(eq(fieldOperationProgressTable.operationId, operationId));
    if (operationId) await db.delete(fieldOperationsTable).where(eq(fieldOperationsTable.id, operationId));
    if (seasonId) await db.delete(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, seasonId));
    if (fieldId) await db.delete(agroFieldsTable).where(eq(agroFieldsTable.id, fieldId));
    if (cropId) await db.delete(grainMovementsTable).where(eq(grainMovementsTable.cropId, cropId));
    if (locationIds.length) await db.delete(grainLocationsTable).where(inArray(grainLocationsTable.id, locationIds));
    if (cropId) await db.delete(grainCropsTable).where(eq(grainCropsTable.id, cropId));
    if (employeeId) await db.delete(employeesTable).where(eq(employeesTable.id, employeeId));
    await db.delete(activityTable).where(like(activityTable.userName, `${key}%`));
  }
});
