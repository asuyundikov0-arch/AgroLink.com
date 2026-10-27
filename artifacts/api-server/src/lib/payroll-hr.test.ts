import assert from "node:assert/strict";
import { after, test } from "node:test";
import { appRoles, db, employeesTable, payrollRegisterItemsTable, payrollRegistersTable, pool } from "@workspace/db";
import { CreateRoleRequestBody, GetMyRoleRequestResponse } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { approveDailyOrder } from "./payroll-hr";

after(() => pool.end());
const access: RoleAccess = { userId: "test-hr", role: "hr", displayName: "Отдел кадров", email: "", department: "" };
test("every canonical role is accepted both at signup and in the current-user response", () => {
  assert.equal(GetMyRoleRequestResponse.safeParse(null).success, true);
  for (const role of appRoles) {
    assert.equal(CreateRoleRequestBody.safeParse({ requestedRole: role, department: "Хозяйство" }).success, true, role);
    assert.equal(GetMyRoleRequestResponse.safeParse({
      id: 1, userId: "test", email: "test@example.com", displayName: "Тест", department: "Хозяйство",
      requestedRole: role, status: "approved", reviewComment: "", reviewedByName: "Директор",
      requestedAt: new Date().toISOString(), reviewedAt: null,
    }).success, true, role);
  }
});
test("only HR confirmation releases a snapshot; version, duplicate and legacy checks preserve totals", async () => {
  const rollback = new Error("rollback-hr-test");
  await assert.rejects(db.transaction(async (tx) => {
    const [employee] = await tx.insert(employeesTable).values({ fullName: "Тест наряда", createdBy: "test", updatedBy: "test" }).returning();
    const [order] = await tx.insert(payrollRegistersTable).values({
      unit: "test-hr-unit", workDate: "2026-10-27", status: "pending_hr", totalAmount: "300.00",
      createdByUserId: "test-dispatcher", createdByName: "Диспетчер", submittedByName: "Диспетчер", submittedAt: new Date(),
    }).returning();
    await tx.insert(payrollRegisterItemsTable).values([
      { registerId: order.id, employeeId: employee.id, employeeName: employee.fullName, workType: "Перевозка", amountKzt: "100.00" },
      { registerId: order.id, employeeId: employee.id, employeeName: employee.fullName, workType: "Посев", amountKzt: "200.00" },
    ]);
    assert.equal((await approveDailyOrder(tx, order.id, 1, { ...access, role: "dispatcher" })).status, 403);
    assert.equal((await approveDailyOrder(tx, order.id, 1, { ...access, role: "economist" })).status, 403);
    assert.equal((await approveDailyOrder(tx, order.id, 9, access)).status, 409);
    const confirmed = await approveDailyOrder(tx, order.id, 1, access);
    assert.ok(confirmed.register);
    assert.equal(confirmed.register.status, "sent_to_economist");
    assert.equal(confirmed.register.hrApprovedByUserId, access.userId);
    assert.ok(confirmed.register.hrApprovedAt);
    assert.equal(confirmed.register.totalAmount, "300.00");
    assert.equal(confirmed.register.version, 2);
    assert.equal(confirmed.items.length, 2);
    assert.equal((await approveDailyOrder(tx, order.id, 2, access)).status, 409);
    const [legacy] = await tx.insert(payrollRegistersTable).values({
      unit: "legacy", workDate: "2026-10-26", status: "sent_to_economist", totalAmount: "100.00",
      createdByUserId: "test", createdByName: "test",
    }).returning();
    assert.equal((await approveDailyOrder(tx, legacy.id, 1, access)).status, 409);
    throw rollback;
  }), (error) => error === rollback);
});
