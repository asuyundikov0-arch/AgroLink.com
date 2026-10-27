import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, employeesTable, fleetEquipmentTable } from "@workspace/db";
import type { FieldOperationInput } from "@workspace/api-zod";
import { plannedResources } from "../routes/agro-fields";

after(() => pool.end());
test("season plans resolve real directory identities and reject missing or wrong-farm resources", async () => {
  const rollback = new Error("rollback-test-fixtures");
  await assert.rejects(db.transaction(async (tx) => {
    const unit = `test-plan-${randomUUID()}`;
    const [employee] = await tx.insert(employeesTable).values({
      fullName: "Тестовый механизатор", createdBy: "test", updatedBy: "test",
    }).returning();
    const [equipment] = await tx.insert(fleetEquipmentTable).values({
      unit, kind: "Трактор", registrationNumber: randomUUID(), updatedBy: "test",
    }).returning();
    const input: FieldOperationInput = {
      seasonId: 1, name: "посев", plannedStart: "2026-05-01", plannedEnd: "2026-05-02",
      plannedAreaHa: 10, plannedRatePerHa: 1100, responsible: "Подмена имени",
      plannedEquipment: "Подмена техники", plannedImplement: "", notes: "",
      plannedMechanicEmployeeId: employee.id, plannedEquipmentId: equipment.id,
    };
    const resolved = await plannedResources(tx, input, unit);
    assert.equal(resolved.name, "Посев");
    assert.equal(resolved.responsible, employee.fullName);
    assert.equal(resolved.plannedMechanicEmployeeId, employee.id);
    assert.equal(resolved.plannedEquipmentId, equipment.id);
    assert.equal(resolved.plannedEquipment, `Трактор · ${equipment.registrationNumber}`);
    await assert.rejects(plannedResources(tx, { ...input, plannedMechanicEmployeeId: null }, unit), /Выберите механизатора/);
    await assert.rejects(plannedResources(tx, { ...input, plannedEquipmentId: null }, unit), /Выберите технику/);
    await assert.rejects(plannedResources(tx, input, `${unit}-other`), /нужного хозяйства/);
    await assert.rejects(plannedResources(tx, { ...input, name: randomUUID() }, unit), /подготовленного списка/);
    await tx.update(employeesTable).set({ isActive: false }).where(eq(employeesTable.id, employee.id));
    await assert.rejects(plannedResources(tx, input, unit), /действующего сотрудника/);
    throw rollback;
  }), (error) => error === rollback);
});
