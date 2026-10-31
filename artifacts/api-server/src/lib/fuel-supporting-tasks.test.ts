import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable,
  fleetEquipmentTable, supportingTasksTable, fuelMovementsTable } from "@workspace/db";
import type { RoleAccess } from "../middlewares/auth";
import { postFuelMovement, equipmentLabel } from "./fuel-ledger";
import { fieldCosts } from "./field-costs";
import { fuelWarehouse } from "../routes/fuel";
import { grainBusinessDate } from "./grain-ledger";

after(() => pool.end());
test("fuel execution task authorizes supporting vehicle, preserves field attribution and charges once", async () => {
  const rollback = new Error("rollback fuel supporting fixtures");
  await assert.rejects(db.transaction(async tx => {
    const key = `fuel-task-${randomUUID()}`, day = grainBusinessDate(), farm = "АПК Арыстан Grain" as const;
    const access = { role: "fuel_manager", userId: key, displayName: key } as RoleAccess;
    const [field] = await tx.insert(agroFieldsTable).values({
      unit: farm, number: key, numberKey: key, areaAres: 10000, updatedBy: key,
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({ fieldId: field.id,
      year: +day.slice(0, 4), cropName: "Пшеница", areaAres: 10000, updatedBy: key }).returning();
    const [fleet] = await tx.insert(fleetEquipmentTable).values({ kind: "КамАЗ",
      registrationNumber: key, registrationKey: key, unit: farm, updatedBy: key }).returning();
    const [operation] = await tx.insert(fieldOperationsTable).values({ seasonId: season.id,
      name: "Посев", nameKey: key, plannedStart: day, plannedEnd: day, plannedAreaAres: 10000,
      updatedBy: key }).returning();
    const [task] = await tx.insert(supportingTasksTable).values({ operationId: operation.id,
      status: "sent", requestId: randomUUID(), createFingerprint: key, createdByUserId: key, createdBy: key,
      context: { fieldId: field.id, fieldNumber: field.number, farm, year: season.year, operationName: operation.name },
      details: { title: "Заправка машины доставки", startDate: day, endDate: day,
        equipmentId: fleet.id, equipmentName: equipmentLabel(fleet), employeeIds: [], employeeNames: [],
        salaryBudget: 0, fuelBudget: 999999, quantity: 100, quantityUnit: "л", notes: "", services: ["fuel"] },
      deliveries: [{ service: "fuel", status: "sent", acceptedBy: "", acceptedAt: null }],
    }).returning();
    const common = { farm, fuelType: key, occurredOn: day, notes: "" };
    await postFuelMovement(tx, "receipt", { ...common, requestId: randomUUID(), liters: 1000,
      pricePerLiter: 300, invoiceNumber: key, supplier: key }, access);
    const issue = { ...common, requestId: randomUUID(), liters: 20, fleetId: fleet.id,
      forFieldWork: true, operationId: operation.id, supportingTaskId: task.id };
    await assert.rejects(postFuelMovement(tx, "issue", issue, access), /принять/);
    await tx.update(supportingTasksTable).set({ deliveries: [{ service: "fuel", status: "accepted",
      acceptedBy: key, acceptedAt: new Date().toISOString() }] }).where(eq(supportingTasksTable.id, task.id));
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, forFieldWork: false }, access), /без полевых/);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, operationId: operation.id + 1000000 }, access), /выбранного поля/);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, supportingTaskId: null }, access), /не назначена/);
    await tx.update(supportingTasksTable).set({ details: { ...task.details, equipmentId: fleet.id + 1000000 } })
      .where(eq(supportingTasksTable.id, task.id));
    await assert.rejects(postFuelMovement(tx, "issue", issue, access), /другая техника/);
    await tx.update(supportingTasksTable).set({ details: task.details }).where(eq(supportingTasksTable.id, task.id));
    const movement = await postFuelMovement(tx, "issue", issue, access);
    assert.equal(movement.supportingTaskId, task.id);
    assert.equal(Number(movement.amountCents), 600000);
    assert.equal((await postFuelMovement(tx, "issue", issue, access)).id, movement.id);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, supportingTaskId: null }, access), /другими данными/);
    await postFuelMovement(tx, "issue", { ...issue, requestId: randomUUID(), liters: 10 }, access);
    const dto = (await fuelWarehouse(tx)).movements.find(m => m.id === movement.id)!;
    assert.equal(dto.fieldNumber, field.number, "Task issue labels exist even before main operation starts");
    assert.equal(dto.supportingTaskId, task.id);
    await tx.update(fieldOperationsTable).set({ actualStart: day, actualEquipment: equipmentLabel(fleet) })
      .where(eq(fieldOperationsTable.id, operation.id));
    await postFuelMovement(tx, "issue", { ...issue, requestId: randomUUID(), liters: 5, supportingTaskId: null }, access);
    const costs = (await fieldCosts(tx, season.id))!;
    assert.equal(costs.fuelCost, 10500);
    assert.equal(costs.totalCost, 10500, "Task budget is not included and issue is not doubled");
    assert.equal(costs.operations[0].fuels.length, 2, "Same fuel keeps separate task and ordinary lines");
    const taskFuel = costs.operations[0].fuels.find(f => f.supportingTaskId === task.id)!;
    assert.equal(taskFuel.liters, 30);
    assert.equal(taskFuel.amount, 9000);
    await tx.update(fieldOperationsTable).set({ actualEnd: day }).where(eq(fieldOperationsTable.id, operation.id));
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, requestId: randomUUID() }, access), /действующей операции/);
    assert.equal((await tx.select().from(fuelMovementsTable).where(eq(fuelMovementsTable.requestId, issue.requestId))).length, 1);
    throw rollback;
  }), error => error === rollback);
});
