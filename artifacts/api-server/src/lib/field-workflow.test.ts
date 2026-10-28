import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  db, pool, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, fieldOperationProgressTable,
  employeesTable, fleetEquipmentTable, chemicalInvoicesTable, chemicalBatchesTable, chemicalRequestsTable,
} from "@workspace/db";
import type { RoleAccess } from "../middlewares/auth";
import { startOrChangeFieldWork, transitionFieldWork, validateChemicalPlan } from "./field-workflow";

after(() => pool.end());
const agronomist: RoleAccess = { userId: "field-workflow-test-agro", role: "agronomist", displayName: "Тест агроном", email: "", department: "" };
const chief: RoleAccess = { ...agronomist, userId: "field-workflow-test-chief", role: "chief_agronomist" };
const dispatcher: RoleAccess = { ...agronomist, userId: "field-workflow-test-dispatch", role: "dispatcher" };

test("chief approval -> agronomist start/assignment changes -> dispatcher finish -> agronomist history", async () => {
  const rollback = new Error("rollback-field-workflow");
  await assert.rejects(db.transaction(async tx => {
    const key = randomUUID();
    const [field] = await tx.insert(agroFieldsTable).values({
      unit: "АПК Арыстан Grain", number: key, numberKey: key, areaAres: 10000, updatedBy: "test",
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: 2026, cropName: "Пшеница", areaAres: 10000, updatedBy: "test",
    }).returning();
    const [employee, other] = await tx.insert(employeesTable).values([
      { fullName: `${key}-1`, createdBy: "test", updatedBy: "test" },
      { fullName: `${key}-2`, createdBy: "test", updatedBy: "test" },
    ]).returning();
    const [machine] = await tx.insert(fleetEquipmentTable).values({
      kind: "Трактор", registrationNumber: key, registrationKey: key, unit: field.unit, updatedBy: "test",
    }).returning();
    const [op] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, name: "Культивация", nameKey: key, isUnplanned: true, approvalStatus: "pending",
      plannedStart: "2026-02-10", plannedEnd: "2026-02-10", plannedAreaAres: 0,
      actualAreaLimitAres: 10000, updatedBy: "test",
    }).returning();
    const actual = {
      version: op.version, actualStart: "2026-02-10", actualEnd: null, actualAreaHa: 0,
      actualOperationName: op.name, actualMechanic: employee.fullName, actualMechanicEmployeeId: employee.id,
      actualEquipment: `${machine.kind} · ${machine.registrationNumber}`, actualImplement: "Культиватор", actualNotes: "",
    };
    await assert.rejects(startOrChangeFieldWork(tx, op, actual, agronomist), /сначала согласовывает/);
    await assert.rejects(transitionFieldWork(tx, op, { version: 1, action: "approve_unplanned" }, agronomist), e => (e as { status: number }).status === 403);
    const approved = await transitionFieldWork(tx, op, { version: 1, action: "approve_unplanned" }, chief);
    assert.equal(approved.actualStart, null);
    assert.equal(approved.approvalStatus, "approved");
    await assert.rejects(startOrChangeFieldWork(tx, approved, actual, dispatcher), e => (e as { status: number }).status === 403);
    await assert.rejects(startOrChangeFieldWork(tx, approved, { ...actual, actualAreaHa: 10 }, agronomist), /только диспетчер/);
    await assert.rejects(startOrChangeFieldWork(tx, approved, { ...actual, actualOperationName: "Посев" }, agronomist), /вид операции/);
    let started = await startOrChangeFieldWork(tx, approved, actual, agronomist);
    assert.equal(started.actualStart, actual.actualStart);
    assert.equal(started.startedByUserId, agronomist.userId);
    await tx.insert(fieldOperationProgressTable).values({
      operationId: op.id, reportDate: "2026-02-10", cumulativeAreaAres: 1000,
      actualMechanic: employee.fullName, actualMechanicEmployeeId: employee.id,
      actualEquipment: actual.actualEquipment, actualImplement: actual.actualImplement, updatedBy: "test",
    });
    [started] = await tx.update(fieldOperationsTable).set({ actualAreaAres: 1000 }).where(eq(fieldOperationsTable.id, op.id)).returning();
    const changed = await startOrChangeFieldWork(tx, started, {
      ...actual, actualAreaHa: 10, actualMechanicEmployeeId: other.id, actualMechanic: other.fullName, actualImplement: "Другой агрегат",
    }, agronomist);
    assert.equal(changed.actualMechanicEmployeeId, other.id);
    const [past] = await tx.select().from(fieldOperationProgressTable).where(eq(fieldOperationProgressTable.operationId, op.id));
    assert.equal(past.actualMechanicEmployeeId, employee.id);
    assert.equal(past.actualImplement, actual.actualImplement);
    await assert.rejects(transitionFieldWork(tx, changed, { version: changed.version, action: "request_completion", date: "2026-02-10" }, agronomist),
      e => (e as { status: number }).status === 403);
    let pending = await transitionFieldWork(tx, changed, { version: changed.version, action: "request_completion", date: "2026-02-10" }, dispatcher);
    assert.equal(pending.actualEnd, null);
    assert.equal(pending.completionRequestedOn, "2026-02-10");
    await assert.rejects(transitionFieldWork(tx, pending, { version: pending.version, action: "approve_completion" }, chief),
      e => (e as { status: number }).status === 403);
    const returned = await transitionFieldWork(tx, pending, { version: pending.version, action: "reject_completion", note: "Продолжить" }, agronomist);
    assert.equal(returned.completionRequestedOn, null);
    assert.equal(returned.actualEnd, null);
    pending = await transitionFieldWork(tx, returned, { version: returned.version, action: "request_completion", date: "2026-02-10" }, dispatcher);
    const finished = await transitionFieldWork(tx, pending, { version: pending.version, action: "approve_completion" }, agronomist);
    assert.equal(finished.actualEnd, "2026-02-10");
    await assert.rejects(startOrChangeFieldWork(tx, finished, { ...actual, actualAreaHa: 10 }, agronomist), /завершена/);
    throw rollback;
  }), e => e === rollback);
});

test("planned chemical start atomically creates package-rounded warehouse demand; rejects missing norms", async () => {
  const rollback = new Error("rollback-field-chemical-plan");
  await assert.rejects(db.transaction(async tx => {
    const key = randomUUID();
    const [field] = await tx.insert(agroFieldsTable).values({
      unit: "АПК Арыстан Grain", number: key, numberKey: key, areaAres: 10000, updatedBy: "test",
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: 2026, cropName: "Пшеница", areaAres: 10000, updatedBy: "test",
    }).returning();
    const [employee] = await tx.insert(employeesTable).values({ fullName: key, createdBy: "test", updatedBy: "test" }).returning();
    const [machine] = await tx.insert(fleetEquipmentTable).values({
      kind: "Опрыскиватель", registrationNumber: key, registrationKey: key, unit: field.unit, updatedBy: "test",
    }).returning();
    const [invoice] = await tx.insert(chemicalInvoicesTable).values({
      requestId: key, number: key, occurredOn: "2026-02-01", supplier: "test", farm: field.unit, createdBy: "test",
    }).returning();
    const [batch] = await tx.insert(chemicalBatchesTable).values({
      invoiceId: invoice.id, name: key, unit: "л", receivedMillis: 200000, remainingMillis: 200000,
      containerVolumeMillis: 20000, containerCount: 10,
      unitPriceCents: "150000", receivedCents: "30000000", remainingCents: "30000000",
    }).returning();
    await assert.rejects(validateChemicalPlan(tx, [], field.unit, true), /препарат и норму/);
    await assert.rejects(validateChemicalPlan(tx, [{ batchId: batch.id, ratePerHa: 0.0001 }], field.unit, true), /точность/);
    const chemicalPlan = await validateChemicalPlan(tx, [{ batchId: batch.id, ratePerHa: 0.35 }], field.unit, true);
    const [op] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, name: "Обработка СЗР", nameKey: key, requiresChemicals: true, chemicalPlan,
      plannedStart: "2026-02-10", plannedEnd: "2026-02-11", plannedAreaAres: 10000, updatedBy: "test",
    }).returning();
    const started = await startOrChangeFieldWork(tx, op, {
      version: 1, actualStart: "2026-02-10", actualEnd: null, actualAreaHa: 0,
      actualOperationName: op.name, actualMechanic: employee.fullName, actualMechanicEmployeeId: employee.id,
      actualEquipment: `${machine.kind} · ${machine.registrationNumber}`, actualImplement: "Штанга", actualNotes: "",
    }, agronomist);
    const requested = await tx.select().from(chemicalRequestsTable).where(eq(chemicalRequestsTable.operationId, op.id));
    assert.equal(requested.length, 1);
    assert.equal(requested[0].quantityMillis, 40000); // 35 L demand -> two sealed 20 L containers.
    assert.equal(requested[0].requesterUserId, agronomist.userId);
    assert.equal(started.actualAreaAres, 0);
    assert.equal((await tx.select().from(chemicalBatchesTable).where(eq(chemicalBatchesTable.id, batch.id)))[0].remainingMillis, 200000);
    throw rollback;
  }), e => e === rollback);
});
