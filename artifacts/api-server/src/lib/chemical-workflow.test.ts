import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import {
  db, pool, agroFieldsTable, fieldSeasonsTable, fieldOperationsTable, fieldOperationProgressTable,
  chemicalBatchesTable, chemicalInvoicesTable, chemicalIssuesTable, chemicalConsumptionsTable,
} from "@workspace/db";
import type { RoleAccess } from "../middlewares/auth";
import { requestChemical, issueRequestedChemical, consumeChemical, chemicalWorkflow, hasOwnChemicalRequest, isChemicalOperation } from "./chemical-workflow";
import { chemicalFieldCosts } from "./chemical-stock";
import { acceptChemicalContainers, chemicalPackaging, setChemicalPackaging } from "./chemical-containers";
import { CreateChemicalConsumptionBody, CreateChemicalInvoiceBody } from "@workspace/api-zod";

after(() => pool.end());
const agronomist: RoleAccess = { userId: "chemical-test-agronomist", role: "agronomist", displayName: "Тестовый агроном", email: "", department: "" };
const warehouse: RoleAccess = { ...agronomist, userId: "chemical-test-warehouse", role: "grain_manager" };
const dispatcher: RoleAccess = { ...agronomist, userId: "chemical-test-dispatcher", role: "dispatcher" };
test("chemical classification covers named legacy operations and explicit seasonal flag", () => {
  assert.equal(isChemicalOperation({ name: "Гербицидная обработка" }), true);
  assert.equal(isChemicalOperation({ name: "Внесение удобрений", requiresChemicals: true }), true);
  assert.equal(isChemicalOperation({ name: "Посев" }), false);
});
test("request -> custody -> daily confirmed partial expense; roles, idempotency, no overspend", async () => {
  const rollback = new Error("rollback-chemical-workflow");
  await assert.rejects(db.transaction(async tx => {
    const key = randomUUID();
    const [field] = await tx.insert(agroFieldsTable).values({
      unit: "АПК Арыстан Grain", number: `chem-test-${key}`, numberKey: key, areaAres: 10000, updatedBy: "test",
    }).returning();
    const [season] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: 2026, cropName: "Пшеница", areaAres: 10000, updatedBy: "test",
    }).returning();
    const [op] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, name: "Обработка СЗР", nameKey: key, requiresChemicals: true,
      plannedStart: "2026-02-10", plannedEnd: "2026-02-12", plannedAreaAres: 10000, updatedBy: "test",
    }).returning();
    const [invoice] = await tx.insert(chemicalInvoicesTable).values({
      requestId: randomUUID(), number: key, occurredOn: "2026-02-01", supplier: "test", farm: field.unit, createdBy: "test",
    }).returning();
    const [batch] = await tx.insert(chemicalBatchesTable).values({
      invoiceId: invoice.id, name: key, unit: "л", receivedMillis: 100000, remainingMillis: 100000,
      unitPriceCents: "150000", receivedCents: "15000000", remainingCents: "15000000",
    }).returning();
    assert.throws(() => chemicalPackaging({ containerVolume: 5, containerCount: 19 }, batch.receivedMillis), /Общий объём/);
    assert.throws(() => chemicalPackaging({ containerVolume: 5, containerCount: 0.5 }, batch.receivedMillis), /целым/);
    await assert.rejects(setChemicalPackaging(tx, batch.id, { containerVolume: 5, containerCount: 20 }, agronomist),
      e => (e as { status: number }).status === 403);
    const requestInput = { requestId: randomUUID(), operationId: op.id, batchId: batch.id, quantity: 40, notes: "" };
    assert.equal(await hasOwnChemicalRequest(tx, op.id, agronomist), false);
    await assert.rejects(requestChemical(tx, requestInput, warehouse), e => (e as { status: number }).status === 403);
    const request = await requestChemical(tx, requestInput, agronomist);
    assert.equal((await requestChemical(tx, requestInput, agronomist)).id, request.id);
    assert.equal(await hasOwnChemicalRequest(tx, op.id, agronomist), true);
    assert.equal(await hasOwnChemicalRequest(tx, op.id, { ...agronomist, userId: "other" }), false);
    const issueInput = { requestId: randomUUID(), chemicalRequestId: request.id, quantity: 40, occurredOn: "2026-02-10", notes: "" };
    await assert.rejects(issueRequestedChemical(tx, issueInput, agronomist), e => (e as { status: number }).status === 403);
    const issue = await issueRequestedChemical(tx, issueInput, warehouse);
    assert.equal((await issueRequestedChemical(tx, issueInput, warehouse)).id, issue.id);
    await assert.rejects(issueRequestedChemical(tx, { ...issueInput, requestId: randomUUID(), quantity: 1 }, warehouse), /остаток заявки/);
    const [remaining] = await tx.select().from(chemicalBatchesTable).where(eq(chemicalBatchesTable.id, batch.id));
    assert.equal(remaining.remainingMillis, 60000);
    const issueRows = await tx.select().from(chemicalIssuesTable).where(eq(chemicalIssuesTable.id, issue.id));
    assert.equal(chemicalFieldCosts(issueRows, []).get(season.id) ?? 0, 0);
    const before = await chemicalWorkflow(tx, agronomist);
    assert.equal(before.custody.find(i => i.issueId === issue.id)?.remaining, 40);
    assert.equal(before.custody.find(i => i.issueId === issue.id)?.isMine, true);
    assert.equal((await chemicalWorkflow(tx, warehouse)).custody.find(i => i.issueId === issue.id)?.isMine, false);
    const receiptInput = { requestId: randomUUID(), issueId: issue.id, reportDate: "2026-02-10", returnedOn: "2026-02-11", containerCount: 2, notes: "" };
    await assert.rejects(acceptChemicalContainers(tx, receiptInput, warehouse), /объём и количество упаковок/);
    await setChemicalPackaging(tx, batch.id, { containerVolume: 5, containerCount: 20 }, warehouse);
    await assert.rejects(issueRequestedChemical(tx, { ...issueInput, requestId: randomUUID(), quantity: 0.5 }, warehouse), /остаток заявки|целыми упаковками/);
    await assert.rejects(acceptChemicalContainers(tx, receiptInput, dispatcher), e => (e as { status: number }).status === 403);
    await assert.rejects(acceptChemicalContainers(tx, { ...receiptInput, containerCount: 0.5 }, warehouse), /целое/);
    const receipt = await acceptChemicalContainers(tx, receiptInput, warehouse);
    assert.equal((await acceptChemicalContainers(tx, receiptInput, warehouse)).id, receipt.id);
    const waiting = await chemicalWorkflow(tx, agronomist);
    assert.equal(waiting.custody.find(i => i.issueId === issue.id)?.remaining, 40);
    assert.equal(waiting.custody.find(i => i.issueId === issue.id)?.pendingReturnQuantity, 10);
    assert.equal(waiting.containerReturns.find(r => r.id === receipt.id)?.consumptionId, null);
    await assert.rejects(setChemicalPackaging(tx, batch.id, { containerVolume: 10, containerCount: 10 }, warehouse), /менять упаковку/);
    const consumptionInput = { requestId: randomUUID(), containerReturnId: receipt.id, notes: "" };
    await assert.rejects(consumeChemical(tx, consumptionInput, agronomist), e => (e as { status: number }).status === 403);
    await assert.rejects(consumeChemical(tx, consumptionInput, dispatcher), /Сначала внесите/);
    await tx.update(fieldOperationsTable).set({ actualStart: "2026-02-10", actualAreaAres: 2000 }).where(eq(fieldOperationsTable.id, op.id));
    await tx.insert(fieldOperationProgressTable).values([
      { operationId: op.id, reportDate: "2026-02-10", cumulativeAreaAres: 1000, updatedBy: "test" },
      { operationId: op.id, reportDate: "2026-02-11", cumulativeAreaAres: 2000, updatedBy: "test" },
    ]);
    const consumed = await consumeChemical(tx, consumptionInput, dispatcher);
    assert.equal((await consumeChemical(tx, consumptionInput, dispatcher)).id, consumed.id);
    await assert.rejects(consumeChemical(tx, { ...consumptionInput, requestId: randomUUID() }, dispatcher), /уже подтверждён/);
    const second = await acceptChemicalContainers(tx, { ...receiptInput, requestId: randomUUID(), containerCount: 1 }, warehouse);
    await assert.rejects(acceptChemicalContainers(tx, { ...receiptInput, requestId: randomUUID(), containerCount: 6 }, warehouse), /превышает остаток/);
    // Several deliveries of empty containers on the same work day are individually confirmed.
    await consumeChemical(tx, { ...consumptionInput, requestId: randomUUID(), containerReturnId: second.id }, dispatcher);
    const noFact = await acceptChemicalContainers(tx, { ...receiptInput, requestId: randomUUID(), containerCount: 1, reportDate: "2026-02-12", returnedOn: "2026-02-12" }, warehouse);
    await assert.rejects(consumeChemical(tx, { ...consumptionInput, requestId: randomUUID(), containerReturnId: noFact.id }, dispatcher), /Сначала внесите/);
    const afterWorkflow = await chemicalWorkflow(tx, agronomist);
    assert.equal(afterWorkflow.custody.find(i => i.issueId === issue.id)?.remaining, 25);
    assert.equal(afterWorkflow.custody.find(i => i.issueId === issue.id)?.remainingAmount, 37500);
    assert.equal(afterWorkflow.custody.find(i => i.issueId === issue.id)?.pendingReturnQuantity, 5);
    assert.equal(afterWorkflow.containerReturns.find(r => r.id === receipt.id)?.consumptionId, consumed.id);
    assert.equal((await tx.select().from(chemicalBatchesTable).where(eq(chemicalBatchesTable.id, batch.id)))[0].remainingMillis, 60000);
    const consumptionRows = await tx.select().from(chemicalConsumptionsTable).where(eq(chemicalConsumptionsTable.issueId, issue.id));
    assert.equal(chemicalFieldCosts(issueRows, consumptionRows).get(season.id), 2250000);
    assert.equal(afterWorkflow.consumptions.find(i => i.id === consumed.id)?.dailyAreaHa, 10);
    throw rollback;
  }), e => e === rollback);
});
test("old direct litre submission and unpackaged invoice cannot bypass empty-container accounting", () => {
  assert.equal(CreateChemicalConsumptionBody.safeParse({
    requestId: randomUUID(), issueId: 1, reportDate: "2026-02-10", quantity: 10, notes: "",
  }).success, false);
  assert.equal(CreateChemicalInvoiceBody.safeParse({
    requestId: randomUUID(), number: "test", occurredOn: "2026-02-10", supplier: "test", farm: "АПК Арыстан Grain",
    lines: [{ name: "chemical", unit: "л", quantity: 100, unitPrice: 1500 }],
  }).success, false);
});
test("legacy finalized issues are not reopened; custody is excluded from field costs", () => {
  const costs = chemicalFieldCosts([
    { id: 1, seasonId: 100, chemicalRequestId: null, amountCents: "10000" },
    { id: 2, seasonId: 100, chemicalRequestId: 5, amountCents: "30000" },
  ], [{ issueId: 2, amountCents: "5000" }]);
  assert.equal(costs.get(100), 15000);
});
