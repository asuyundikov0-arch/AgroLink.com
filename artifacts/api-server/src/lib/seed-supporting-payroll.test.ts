import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, pool, employeesTable, grainCropsTable, agroFieldsTable, fieldSeasonsTable,
  fieldOperationsTable, supportingTasksTable, payrollRegistersTable, payrollRegisterItemsTable } from "@workspace/db";
import { submitSeedMovement, reviewSeedMovement } from "./seed-warehouse";
import { rateSeedTrip } from "./seed-transport";
import { calculateAutomaticAccruals } from "../routes/payroll-registers";
import { fieldCosts } from "./field-costs";
import { grainBusinessDate } from "./grain-ledger";
import { approveDailyOrder } from "./payroll-hr";

after(() => pool.end());

test("seed task -> transport -> motor-pool order -> HR -> field cost exactly once", async () => {
  const key = `seed-task-${randomUUID()}`, today = grainBusinessDate(), unit = "АПК Арыстан Grain" as const;
  const actor = (role: string) => ({ role, userId: key, displayName: key }) as Parameters<typeof submitSeedMovement>[2];
  const rollback = new Error("rollback test fixtures");
  await assert.rejects(db.transaction(async tx => {
    const [crop] = await tx.insert(grainCropsTable).values({ name: key, nameKey: key }).returning();
    const [employee] = await tx.insert(employeesTable).values({ fullName: key, createdBy: key, updatedBy: key }).returning();
    const [field] = await tx.insert(agroFieldsTable).values({ unit, number: key, numberKey: key, areaAres: 10000, updatedBy: key }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({ fieldId: field.id, year: +today.slice(0, 4),
      cropName: key, areaAres: 10000, updatedBy: key }).returning();
    const [operation] = await tx.insert(fieldOperationsTable).values({ seasonId: season.id,
      name: "Посев", nameKey: "посев", plannedStart: today, plannedEnd: today, plannedAreaAres: 10000, updatedBy: key }).returning();
    const [task] = await tx.insert(supportingTasksTable).values({
      operationId: operation.id, requestId: randomUUID(), createFingerprint: key, createdByUserId: key, createdBy: key,
      status: "sent", context: { fieldId: field.id, fieldNumber: field.number, farm: unit, year: season.year, operationName: "Посев" },
      details: { title: "Доставка семян", startDate: today, endDate: today, equipmentId: null, equipmentName: "",
        employeeIds: [], employeeNames: [], salaryBudget: 999999, fuelBudget: 0, quantity: 2, quantityUnit: "т",
        services: ["tok", "motor_pool"], notes: "" },
      deliveries: [{ service: "tok", status: "sent", acceptedAt: null, acceptedBy: "" },
        { service: "motor_pool", status: "sent", acceptedAt: null, acceptedBy: "" }],
    }).returning();
    await submitSeedMovement(tx, { requestId: randomUUID(), unit, cropId: crop.id, kind: "receipt",
      occurredOn: today, quantityTons: 10, pricePerTon: 100000, invoiceNumber: key, supplier: key }, actor("general_director"));
    const issue = { requestId: randomUUID(), unit, cropId: crop.id, kind: "issue" as const, occurredOn: today,
      quantityTons: 2, seasonId: season.id, operationId: operation.id, supportingTaskId: task.id,
      truckNumber: "TEST-TRUCK", driverEmployeeId: employee.id, transportPayBasis: "ton_km" as const, distanceKm: 50 };
    await assert.rejects(submitSeedMovement(tx, issue, actor("weigher")), /принял к исполнению/);
    await tx.update(supportingTasksTable).set({ deliveries: task.deliveries.map(d =>
      d.service === "tok" ? { ...d, status: "accepted", acceptedAt: new Date().toISOString(), acceptedBy: key } : d) })
      .where(eq(supportingTasksTable.id, task.id));
    await assert.rejects(submitSeedMovement(tx, { ...issue, seasonId: season.id + 1000000 }, actor("weigher")), /поле/);
    await assert.rejects(submitSeedMovement(tx, { ...issue, truckNumber: "" }, actor("weigher")), /машину/);
    const movement = await submitSeedMovement(tx, issue, actor("weigher"));
    assert.equal((await submitSeedMovement(tx, issue, actor("weigher"))).id, movement.id, "Retry cannot create another trip");
    assert.equal(movement.driverName, employee.fullName);
    assert.equal((await fieldCosts(tx, season.id))!.seedCost, 0, "Seeds are not charged before Tok approval");
    await assert.rejects(rateSeedTrip(tx, movement.id, { version: 1, tariffPerTonKm: 50 }, actor("motor_pool_manager")), /согласования/);
    await reviewSeedMovement(tx, movement.id, "approved", "", actor("grain_manager"));
    await assert.rejects(rateSeedTrip(tx, movement.id, { version: 1, tariffPerTonKm: 50 }, actor("weigher")), /автобазой/);
    await rateSeedTrip(tx, movement.id, { version: 1, tariffPerTonKm: 50 }, actor("motor_pool_manager"));
    await assert.rejects(rateSeedTrip(tx, movement.id, { version: 1, tariffPerTonKm: 50 }, actor("motor_pool_manager")), /изменена/);
    const brigade = await calculateAutomaticAccruals(tx, "brigade");
    assert.ok(!brigade.flatMap(g => g.entries).some(e => e.sourceType === "seed_trip" && e.sourceId === movement.id));
    const motor = await calculateAutomaticAccruals(tx, "motor_pool");
    const entry = motor.flatMap(g => g.entries).find(e => e.sourceType === "seed_trip" && e.sourceId === movement.id)!;
    assert.equal(entry.amountKzt, 5000, "2 tons × 50 km × 50 = 5000");
    assert.match(entry.details, new RegExp(`Задание №${task.id}`));
    let costs = (await fieldCosts(tx, season.id))!;
    assert.equal(costs.seedCost, 200000);
    assert.equal(costs.operations[0].seedIssues![0].supportingTaskId, task.id, "Seed cost carries the original task");
    assert.equal(costs.salaryCost, 0, "Rating alone is not an approved salary expense");
    const [register] = await tx.insert(payrollRegistersTable).values({
      workDate: today, unit, sourceGroup: "motor_pool", status: "pending_hr", totalAmount: "5000",
      createdByUserId: key, createdByName: key,
    }).returning();
    await tx.insert(payrollRegisterItemsTable).values({ registerId: register.id, ...entry, amountKzt: "5000" });
    assert.equal((await fieldCosts(tx, season.id))!.salaryCost, 0, "Pending HR order is not a field expense");
    await assert.rejects(rateSeedTrip(tx, movement.id, { version: 2, tariffPerTonKm: 60 }, actor("motor_pool_manager")), /наряд/);
    assert.equal((await approveDailyOrder(tx, register.id, 1, actor("motor_pool_manager"))).status, 403);
    assert.ok("register" in await approveDailyOrder(tx, register.id, 1, actor("hr")));
    assert.equal((await approveDailyOrder(tx, register.id, 1, actor("hr"))).status, 409, "Double HR confirmation is blocked");
    costs = (await fieldCosts(tx, season.id))!;
    assert.equal(costs.salaryCost, 5000);
    assert.equal(costs.operations[0].transportSalaryCost, 5000);
    assert.equal(costs.operations[0].salaries[0].supportingTaskId, task.id);
    assert.equal(costs.totalCost, 205000, "Transport is included once, not added again as a separate total");
    assert.equal((await fieldCosts(tx, season.id))!.totalCost, 205000, "Reload is idempotent");
    assert.ok(!(await calculateAutomaticAccruals(tx, "motor_pool")).flatMap(g => g.entries).some(e =>
      e.sourceType === "seed_trip" && e.sourceId === movement.id), "Submitted source is not charged twice");
    throw rollback;
  }), error => error === rollback);
});
