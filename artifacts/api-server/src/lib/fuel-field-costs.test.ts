import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import {
  agroFieldsTable, chemicalBatchesTable, chemicalConsumptionsTable, chemicalContainerReturnsTable,
  chemicalInvoicesTable, chemicalIssuesTable, chemicalRequestsTable, db, employeesTable,
  fieldOperationProgressTable, fieldOperationsTable, fieldSeasonsTable, fleetEquipmentTable,
  fuelMovementsTable, payrollRegisterItemsTable, payrollRegistersTable, pool,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { fieldCosts } from "./field-costs";
import { assignmentMatches, equipmentLabel, fuelAssignments, fuelBalance, fuelRatio, postFuelMovement } from "./fuel-ledger";
import { approveDailyOrder } from "./payroll-hr";
import { grainBusinessDate } from "./grain-ledger";
import type { RoleAccess } from "../middlewares/auth";

after(() => pool.end());
const access: RoleAccess = { userId: "fuel-cost-test", role: "fuel_manager", displayName: "Тест нефтебазы", email: "", department: "" };

test("weighted fuel stock, vehicle/field links, accepted chemicals and only HR-confirmed pay form exact field costs", async () => {
  const rollback = new Error("rollback-fuel-cost-fixture");
  await assert.rejects(db.transaction(async (tx) => {
    const key = randomUUID();
    const farm = "АПК Арыстан Grain" as const;
    const day = grainBusinessDate();
    const [field] = await tx.insert(agroFieldsTable).values({
      unit: farm, number: key, numberKey: key, areaAres: 10000, updatedBy: "test",
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: Number(day.slice(0, 4)), cropName: "Пшеница", areaAres: 10000, updatedBy: "test",
    }).returning();
    const [otherSeason] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: Number(day.slice(0, 4)) - 1, cropName: "Лён", areaAres: 10000, updatedBy: "test",
    }).returning();
    const [employee] = await tx.insert(employeesTable).values({
      fullName: key, createdBy: "test", updatedBy: "test",
    }).returning();
    const [fleet] = await tx.insert(fleetEquipmentTable).values({
      kind: "Трактор", registrationNumber: key, registrationKey: key, unit: farm, updatedBy: "test",
    }).returning();
    const [operation] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, name: "Химическая обработка", nameKey: key, plannedAreaAres: 10000,
      plannedStart: day, plannedEnd: day, responsible: employee.fullName,
      actualAreaAres: 10000, actualStart: day, actualEquipment: equipmentLabel(fleet),
      actualMechanic: employee.fullName, actualMechanicEmployeeId: employee.id, updatedBy: "test",
    }).returning();
    const [progress] = await tx.insert(fieldOperationProgressTable).values({
      operationId: operation.id, reportDate: day, cumulativeAreaAres: 10000,
      actualMechanic: employee.fullName, actualMechanicEmployeeId: employee.id,
      actualEquipment: equipmentLabel(fleet), actualImplement: "Опрыскиватель", updatedBy: "test",
    }).returning();
    const base = { farm, fuelType: `Дизель ${key}`, occurredOn: day, notes: "" };
    const receipt = { ...base, requestId: randomUUID(), liters: 1000, pricePerLiter: 300,
      invoiceNumber: "test-1", supplier: "Тест" };
    await postFuelMovement(tx, "receipt", receipt, access);
    await postFuelMovement(tx, "receipt", { ...receipt, requestId: randomUUID(), liters: 500, pricePerLiter: 360 }, access);
    await assert.rejects(postFuelMovement(tx, "receipt", { ...receipt, pricePerLiter: 301 }, access), /другими данными/);
    await assert.rejects(postFuelMovement(tx, "receipt", { ...receipt, requestId: randomUUID() },
      { ...access, role: "engineer" }), /заведующий нефтебазой/);
    const issue = { ...base, requestId: randomUUID(), liters: 150, fleetId: fleet.id, operationId: operation.id };
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, forFieldWork: true, operationId: null }, access), /Выберите поле/);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, forFieldWork: false }, access), /без полевых работ/);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, operationId: null }, access), /Выберите полевую операцию/);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, liters: 1600 }, access), /Недостаточно топлива/);
    const issued = await postFuelMovement(tx, "issue", issue, access);
    assert.equal(Number(issued.amountCents), 4_800_000);
    assert.equal(Number(issued.pricePerLiterCents), 32_000);
    assert.equal((await postFuelMovement(tx, "issue", issue, access)).id, issued.id);
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, liters: 151 }, access), /другими данными/);
    const rows = await tx.select().from(fuelMovementsTable).where(eq(fuelMovementsTable.fuelType, issued.fuelType));
    assert.equal(rows.length, 3);
    assert.deepEqual(fuelBalance(rows), { millis: 1_350_000, cents: 43_200_000 });
    await assert.rejects(postFuelMovement(tx, "issue", { ...issue, requestId: randomUUID(),
      occurredOn: `${day.slice(0, 4)}-01-01` }, access), /хронологическом/);
    const [invoice] = await tx.insert(chemicalInvoicesTable).values({
      requestId: randomUUID(), number: key, occurredOn: day, supplier: "Тест", farm, createdBy: "test",
    }).returning();
    const [batch] = await tx.insert(chemicalBatchesTable).values({
      invoiceId: invoice.id, name: "Препарат", unit: "л", receivedMillis: 100000, remainingMillis: 60000,
      unitPriceCents: "150000", receivedCents: "15000000", remainingCents: "9000000",
      containerVolumeMillis: 20000, containerCount: 5,
    }).returning();
    const [request] = await tx.insert(chemicalRequestsTable).values({
      requestId: randomUUID(), operationId: operation.id, batchId: batch.id, quantityMillis: 40000,
      requesterUserId: "test", requesterName: "test",
    }).returning();
    const [chemicalIssue] = await tx.insert(chemicalIssuesTable).values({
      requestId: randomUUID(), batchId: batch.id, seasonId: season.id, employeeId: employee.id,
      employeeName: employee.fullName, chemicalRequestId: request.id, quantityMillis: 40000,
      amountCents: "6000000", occurredOn: day, createdBy: "test",
    }).returning();
    // An issued but unconfirmed chemical amount is not an expense.
    assert.equal((await fieldCosts(tx, season.id))!.chemicalCost, 0);
    const [tare] = await tx.insert(chemicalContainerReturnsTable).values({
      requestId: randomUUID(), issueId: chemicalIssue.id, operationId: operation.id, reportDate: day,
      returnedOn: day, containerCount: 2, containerVolumeMillis: 20000, quantityMillis: 40000,
      acceptedBy: "test",
    }).returning();
    await tx.insert(chemicalConsumptionsTable).values({
      requestId: randomUUID(), issueId: chemicalIssue.id, operationId: operation.id, reportDate: day,
      quantityMillis: 40000, amountCents: "6000000", dailyAreaAres: 10000, confirmedBy: "test",
      containerReturnId: tare.id,
    });
    const [order] = await tx.insert(payrollRegistersTable).values({
      unit: farm, workDate: day, status: "pending_hr", totalAmount: "51000.00",
      createdByUserId: "test", createdByName: "test",
    }).returning();
    await tx.insert(payrollRegisterItemsTable).values([
      { registerId: order.id, employeeId: employee.id, employeeName: employee.fullName,
        workType: "Обработка", amountKzt: "50000", sourceType: "field_progress", sourceId: progress.id },
      { registerId: order.id, employeeId: employee.id, employeeName: employee.fullName,
        workType: "Иная работа", amountKzt: "1000", sourceType: "manual" },
    ]);
    let costs = (await fieldCosts(tx, season.id))!;
    assert.equal(costs.chemicalCost, 60000);
    assert.equal(costs.fuelCost, 48000);
    assert.equal(costs.fuelLiters, 150);
    assert.equal(costs.salaryCost, 0);
    const approved = await approveDailyOrder(tx, order.id, 1, { ...access, role: "hr" });
    assert.ok(approved.register);
    costs = (await fieldCosts(tx, season.id))!;
    assert.equal(costs.salaryCost, 50000);
    assert.equal(costs.totalCost, 158000);
    assert.equal(costs.operations[0].salaries.length, 1);
    assert.equal(costs.operations[0].chemicals[0].quantity, 40);
    assert.equal(costs.operations[0].fuels[0].liters, 150);
    assert.equal((await fieldCosts(tx, otherSeason.id))!.totalCost, 0);
    assert.equal((await approveDailyOrder(tx, order.id, 1, { ...access, role: "hr" })).status, 409);
    assert.equal((await fieldCosts(tx, season.id))!.totalCost, 158000);
    const ordinaryInput = { ...issue, requestId: randomUUID(), forFieldWork: false, operationId: null, liters: 10 };
    const ordinary = await postFuelMovement(tx, "issue", ordinaryInput, access);
    assert.equal(ordinary.operationId, null, "Non-field refuelling is explicitly unallocated even for assigned equipment");
    assert.equal(Number(ordinary.amountCents), 320000);
    assert.equal((await postFuelMovement(tx, "issue", ordinaryInput, access)).id, ordinary.id);
    assert.equal((await fieldCosts(tx, season.id))!.totalCost, 158000, "Ordinary refuelling must not add field costs");
    const [replacementFleet] = await tx.insert(fleetEquipmentTable).values({
      kind: "Трактор замены", registrationNumber: "", registrationKey: `${key}-replacement`,
      unit: farm, updatedBy: "test",
    }).returning();
    await tx.update(fieldOperationsTable).set({ actualEquipment: equipmentLabel(replacementFleet) })
      .where(eq(fieldOperationsTable.id, operation.id));
    const changedWork = (await fuelAssignments(tx)).find((work) => work.operationId === operation.id)!;
    assert.equal(assignmentMatches(changedWork, fleet, day), true, "Past daily vehicle must remain attributable");
    assert.equal(assignmentMatches(changedWork, replacementFleet, day), true, "New current vehicle is eligible immediately");
    const full = await postFuelMovement(tx, "issue", { ...issue, requestId: randomUUID(), forFieldWork: true, liters: 1340 }, access);
    assert.equal(Number(full.amountCents), 42_880_000);
    const finalRows = await tx.select().from(fuelMovementsTable).where(eq(fuelMovementsTable.fuelType, issued.fuelType));
    assert.deepEqual(fuelBalance(finalRows), { millis: 0, cents: 0 });
    assert.equal(fuelRatio(101, 1, 3), 34);
    throw rollback;
  }), (error) => error === rollback);
});
