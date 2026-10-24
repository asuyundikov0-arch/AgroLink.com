import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  db, pool, employeesTable, agroFieldsTable, fieldSeasonsTable,
  fieldOperationsTable, fieldOperationProgressTable, grainCropsTable,
  grainMovementsTable, payrollRegistersTable, payrollRegisterItemsTable,
} from "@workspace/db";
import { calculateAutomaticAccruals } from "../routes/payroll-registers";
import { fieldPayrollWasSubmitted, grainTripWasSubmitted } from "./payroll-source-guard";

after(() => pool.end());

test("automatic payroll uses daily deltas, employee IDs, snapshots and late accruals without duplication", async () => {
  const rollback = new Error("rollback-test-fixtures");
  await assert.rejects(db.transaction(async (tx) => {
    const suffix = randomUUID();
    const unit = `test-payroll-${suffix}`;
    const [alice, bob] = await tx.insert(employeesTable).values([
      { fullName: `Сотрудник А ${suffix}`, createdBy: "test", updatedBy: "test" },
      { fullName: `Сотрудник Б ${suffix}`, createdBy: "test", updatedBy: "test" },
    ]).returning();
    const [crop] = await tx.insert(grainCropsTable).values({ name: suffix, nameKey: suffix }).returning();
    const [field] = await tx.insert(agroFieldsTable).values({
      unit, number: suffix, numberKey: suffix, areaAres: 10000, updatedBy: "test",
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: 2026, cropName: "Пшеница", areaAres: 10000, updatedBy: "test",
    }).returning();
    const operationValues = {
      seasonId: season.id, name: "Посев", nameKey: "посев", plannedStart: "2026-09-01",
      plannedEnd: "2026-09-02", plannedAreaAres: 10000, actualStart: "2026-09-01",
      actualEnd: "2026-09-02", actualAreaAres: 2500, actualRatePerHa: "1100.00",
      actualMechanic: bob.fullName, actualMechanicEmployeeId: bob.id, updatedBy: "test",
    };
    const [operation] = await tx.insert(fieldOperationsTable).values(operationValues).returning();
    const reports = await tx.insert(fieldOperationProgressTable).values([
      { operationId: operation.id, reportDate: "2026-09-01", cumulativeAreaAres: 1000, actualMechanic: alice.fullName, actualMechanicEmployeeId: alice.id, updatedBy: "test" },
      { operationId: operation.id, reportDate: "2026-09-02", cumulativeAreaAres: 2500, actualMechanic: bob.fullName, actualMechanicEmployeeId: bob.id, updatedBy: "test" },
    ]).returning();
    const movementValues = {
      unit, operation: "receipt", cropId: crop.id, occurredOn: "2026-09-02",
      quantityKg: 1000, driverName: alice.fullName, driverEmployeeId: alice.id,
      createdBy: "test", createdByUserId: "test", approvalStatus: "approved", transportRate: "3500.00",
    };
    const [trip] = await tx.insert(grainMovementsTable).values([
      { ...movementValues, requestId: randomUUID() },
      { ...movementValues, requestId: randomUUID(), approvalStatus: "pending", transportRate: "9999.00" },
      { ...movementValues, requestId: randomUUID(), transportRate: null },
      { ...movementValues, requestId: randomUUID(), voidedAt: new Date(), transportRate: "9000.00" },
    ]).returning();
    await tx.insert(fieldOperationsTable).values({
      ...operationValues, name: "Боронование", nameKey: "боронование",
      actualEnd: "2026-09-03", actualAreaAres: 100, actualRatePerHa: "100.00",
      actualMechanic: `  ${alice.fullName.toLowerCase()}  `, actualMechanicEmployeeId: null,
    });
    const days = (await calculateAutomaticAccruals(tx)).filter((day) => day.unit === unit);
    const first = days.find((day) => day.workDate === "2026-09-01")!;
    const second = days.find((day) => day.workDate === "2026-09-02")!;
    const legacy = days.find((day) => day.workDate === "2026-09-03")!;
    assert.equal(first.totalAmount, 11000);
    assert.equal(first.entries[0].employeeId, alice.id);
    assert.equal(second.totalAmount, 20000);
    assert.equal(second.entries.length, 2);
    assert.equal(second.entries.find((entry) => entry.employeeId === bob.id)!.amountKzt, 16500);
    assert.equal(legacy.totalAmount, 100);
    assert.equal(legacy.entries[0].employeeId, alice.id);
    const again = (await calculateAutomaticAccruals(tx)).find((day) => day.unit === unit && day.workDate === second.workDate)!;
    assert.equal(again.sourceHash, second.sourceHash);
    await tx.update(grainMovementsTable).set({ transportRate: "3600.00" }).where(eq(grainMovementsTable.id, trip.id));
    const changed = (await calculateAutomaticAccruals(tx)).find((day) => day.unit === unit && day.workDate === second.workDate)!;
    assert.notEqual(changed.sourceHash, second.sourceHash);
    await tx.update(grainMovementsTable).set({ transportRate: "3500.00" }).where(eq(grainMovementsTable.id, trip.id));
    const [register] = await tx.insert(payrollRegistersTable).values({
      unit, workDate: second.workDate, status: "sent_to_economist", totalAmount: "20000.00",
      createdByUserId: "test", createdByName: "test",
    }).returning();
    await tx.insert(payrollRegisterItemsTable).values(second.entries.map((entry) => ({
      ...entry, registerId: register.id, amountKzt: entry.amountKzt.toFixed(2),
    })));
    assert.equal((await calculateAutomaticAccruals(tx)).some((day) => day.unit === unit && day.workDate === second.workDate), false);
    assert.equal(await fieldPayrollWasSubmitted(tx, operation.id), true);
    assert.equal(await grainTripWasSubmitted(tx, trip.id), true);
    assert.equal(reports.length, 2);
    await tx.insert(grainMovementsTable).values({ ...movementValues, requestId: randomUUID(), transportRate: "500.00" });
    const late = (await calculateAutomaticAccruals(tx)).find((day) => day.unit === unit && day.workDate === second.workDate)!;
    assert.equal(late.totalAmount, 500);
    assert.equal(late.entries.length, 1);
    await tx.insert(employeesTable).values({ fullName: alice.fullName, createdBy: "test", updatedBy: "test" });
    const ambiguous = (await calculateAutomaticAccruals(tx)).find((day) => day.unit === unit && day.workDate === legacy.workDate)!;
    assert.equal(ambiguous.unassignedCount, 1);
    assert.equal(ambiguous.entries.length, 0);
    throw rollback;
  }), (error) => error === rollback);
});
