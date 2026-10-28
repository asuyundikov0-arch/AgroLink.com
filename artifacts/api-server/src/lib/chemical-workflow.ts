import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db, chemicalRequestsTable as requests, chemicalIssuesTable as issues,
  chemicalConsumptionsTable as consumptions, chemicalContainerReturnsTable as containerReturns, chemicalBatchesTable as batches,
  chemicalInvoicesTable as invoices, fieldOperationsTable as operations,
  fieldOperationProgressTable as progress, fieldSeasonsTable as seasons,
  agroFieldsTable as fields, activityTable,
} from "@workspace/db";
import type { ChemicalRequestInput, ChemicalIssueInput, ChemicalConsumptionInput } from "@workspace/api-zod";
import { GetChemicalWorkflowResponse } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { chemicalCheck as check, scaledChemical, chemicalIssueValue } from "./chemical-stock";
import { grainBusinessDate, validGrainDate } from "./grain-ledger";

export type ChemicalTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
export function isChemicalOperation(op: { name: string; requiresChemicals?: boolean }) {
  return !!op.requiresChemicals || /хим|гербицид|сзр|десикац|фунгицид|инсектицид|протрав|пестицид/iu.test(op.name);
}
export async function lockChemicalWorkflow(tx: ChemicalTx) {
  // Match the field mutation order; no operation fact can change during confirmation.
  await tx.execute(sql`select pg_advisory_xact_lock(718392006)`);
  await tx.execute(sql`select pg_advisory_xact_lock(718392009)`);
}
const actor = (a: RoleAccess) => `${a.displayName} · ${a.role}`;
function quantity(value: number) {
  const result = scaledChemical(value, 1000, "количество — до 3 знаков");
  check(result > 0 && result <= 1_000_000_000, "Укажите положительное количество не более 1 000 000.");
  return result;
}
function identifier(value: number) { check(Number.isSafeInteger(value) && value > 0, "Некорректный идентификатор."); }
function validDay(value: string) {
  check(validGrainDate(value) && value <= grainBusinessDate(), "Укажите корректную дату не позднее сегодняшней.");
}
async function operationContext(tx: ChemicalTx, operationId: number) {
  const [row] = await tx.select({ op: operations, season: seasons, field: fields }).from(operations)
    .innerJoin(seasons, eq(operations.seasonId, seasons.id)).innerJoin(fields, eq(seasons.fieldId, fields.id))
    .where(eq(operations.id, operationId));
  check(row && !row.op.voidedAt && row.field.isActive, "Операция или поле недоступны.", 409);
  return row;
}
export async function requestChemical(tx: ChemicalTx, input: ChemicalRequestInput, access: RoleAccess) {
  check(access.role === "agronomist" || access.role === "general_director", "Заявку на химию подаёт агроном хозяйства.", 403);
  identifier(input.operationId); identifier(input.batchId);
  const millis = quantity(input.quantity);
  await lockChemicalWorkflow(tx);
  const [existing] = await tx.select().from(requests).where(eq(requests.requestId, input.requestId));
  if (existing) {
    check(existing.requesterUserId === access.userId, "Эта заявка принадлежит другому пользователю.", 403);
    return { id: existing.id };
  }
  const context = await operationContext(tx, input.operationId);
  check(!context.op.isUnplanned && !context.op.actualEnd && isChemicalOperation(context.op),
    "Заявка оформляется для незавершённой плановой операции с химией.", 409);
  const [batch] = await tx.select({ batch: batches, invoice: invoices }).from(batches)
    .innerJoin(invoices, eq(batches.invoiceId, invoices.id)).where(eq(batches.id, input.batchId));
  check(batch, "Партия химии не найдена.", 404);
  check(batch.invoice.farm === context.field.unit, "Химия и поле должны относиться к одному хозяйству.");
  const [row] = await tx.insert(requests).values({
    requestId: input.requestId, operationId: context.op.id, batchId: input.batchId,
    quantityMillis: millis, requesterUserId: access.userId, requesterName: access.displayName,
    notes: input.notes.trim(),
  }).returning();
  await tx.insert(activityTable).values({ action: "Агроном запросил химию",
    templateName: `${batch.batch.name} · поле ${context.field.number} · заявка №${row.id}`, userName: actor(access) });
  return { id: row.id };
}

export async function issueRequestedChemical(tx: ChemicalTx, input: ChemicalIssueInput, access: RoleAccess) {
  check(access.role === "grain_manager" || access.role === "general_director", "Выдачу оформляет заведующий током.", 403);
  identifier(input.chemicalRequestId); validDay(input.occurredOn);
  const millis = quantity(input.quantity);
  await lockChemicalWorkflow(tx);
  const [existing] = await tx.select().from(issues).where(eq(issues.requestId, input.requestId));
  if (existing) return { id: existing.id };
  const [request] = await tx.select().from(requests).where(eq(requests.id, input.chemicalRequestId));
  check(request, "Для выдачи необходима заявка агронома.", 404);
  const context = await operationContext(tx, request.operationId);
  check(!context.op.actualEnd, "Нельзя выдавать химию на завершённую операцию.", 409);
  const issued = await tx.select().from(issues).where(eq(issues.chemicalRequestId, request.id));
  const issuedMillis = issued.reduce((sum, row) => sum + row.quantityMillis, 0);
  check(millis <= request.quantityMillis - issuedMillis, "Количество превышает невыданный остаток заявки.", 409);
  const [batch] = await tx.select({ batch: batches, invoice: invoices }).from(batches)
    .innerJoin(invoices, eq(batches.invoiceId, invoices.id)).where(eq(batches.id, request.batchId)).for("update");
  check(batch && batch.invoice.farm === context.field.unit, "Партия не соответствует хозяйству поля.", 409);
  check(input.occurredOn >= batch.invoice.occurredOn, "Дата выдачи раньше накладной.");
  check(Number(input.occurredOn.slice(0, 4)) === context.season.year, "Дата выдачи должна относиться к сезону поля.");
  check(!batch.batch.containerVolumeMillis || millis % batch.batch.containerVolumeMillis === 0,
    "Для этой партии выдача оформляется целыми упаковками указанного объёма.", 409);
  const cents = chemicalIssueValue(millis, batch.batch.remainingMillis, Number(batch.batch.remainingCents));
  const [row] = await tx.insert(issues).values({
    requestId: input.requestId, chemicalRequestId: request.id, batchId: request.batchId,
    seasonId: context.season.id, employeeId: null, employeeName: request.requesterName,
    quantityMillis: millis, amountCents: String(cents), occurredOn: input.occurredOn,
    notes: input.notes.trim(), createdBy: actor(access),
  }).returning();
  await tx.update(batches).set({
    remainingMillis: batch.batch.remainingMillis - millis,
    remainingCents: String(Number(batch.batch.remainingCents) - cents),
  }).where(eq(batches.id, request.batchId));
  await tx.insert(activityTable).values({ action: "Химия выдана на баланс агронома",
    templateName: `${batch.batch.name} · ${request.requesterName} · поле ${context.field.number}`, userName: actor(access) });
  return { id: row.id };
}

export function chemicalFactDays(op: typeof operations.$inferSelect, reports: (typeof progress.$inferSelect)[]) {
  if (!op.actualStart || op.voidedAt) return [];
  if (!reports.length) return op.actualEnd && op.actualAreaAres > 0
    ? [{ date: op.actualEnd, dailyAreaHa: op.actualAreaAres / 100 }] : [];
  let previous = 0;
  return [...reports].sort((a, b) => a.reportDate.localeCompare(b.reportDate)).map(row => {
    const delta = row.cumulativeAreaAres - previous;
    previous = row.cumulativeAreaAres;
    return { date: row.reportDate, dailyAreaHa: delta / 100 };
  }).filter(row => row.dailyAreaHa > 0);
}
export async function consumeChemical(tx: ChemicalTx, input: ChemicalConsumptionInput, access: RoleAccess) {
  check(access.role === "dispatcher" || access.role === "general_director", "Ежедневный расход подтверждает диспетчер.", 403);
  identifier(input.containerReturnId);
  await lockChemicalWorkflow(tx);
  const [existing] = await tx.select().from(consumptions).where(eq(consumptions.requestId, input.requestId));
  if (existing) {
    check(existing.containerReturnId === input.containerReturnId, "Запрос уже использован для другого подтверждения.", 409);
    return { id: existing.id };
  }
  const [receipt] = await tx.select().from(containerReturns).where(eq(containerReturns.id, input.containerReturnId));
  check(receipt, "Сначала заведующий током должен принять пустую тару и уведомить диспетчера.", 409);
  const [confirmed] = await tx.select({ id: consumptions.id }).from(consumptions).where(eq(consumptions.containerReturnId, receipt.id));
  check(!confirmed, "Расход по этой возвращённой таре уже подтверждён.", 409);
  const millis = receipt.quantityMillis;
  const [issue] = await tx.select().from(issues).where(eq(issues.id, receipt.issueId)).for("update");
  check(issue?.chemicalRequestId, "Выберите выдачу, числящуюся на балансе агронома.", 409);
  const [request] = await tx.select().from(requests).where(eq(requests.id, issue.chemicalRequestId));
  check(request, "Заявка не найдена.", 404);
  const context = await operationContext(tx, request.operationId);
  const reports = await tx.select().from(progress).where(eq(progress.operationId, request.operationId));
  check(receipt.operationId === request.operationId, "Возврат тары связан с другой операцией.", 409);
  const fact = chemicalFactDays(context.op, reports).find(row => row.date === receipt.reportDate);
  check(fact && receipt.reportDate >= issue.occurredOn, "Сначала внесите положительный факт работ за эту дату; расход не может быть раньше выдачи.", 409);
  const consumed = await tx.select().from(consumptions).where(eq(consumptions.issueId, issue.id));
  const remaining = issue.quantityMillis - consumed.reduce((sum, row) => sum + row.quantityMillis, 0);
  const remainingCents = Number(issue.amountCents) - consumed.reduce((sum, row) => sum + Number(row.amountCents), 0);
  const cents = chemicalIssueValue(millis, remaining, remainingCents);
  const [row] = await tx.insert(consumptions).values({
    requestId: input.requestId, issueId: issue.id, operationId: request.operationId,
    reportDate: receipt.reportDate, quantityMillis: millis, amountCents: String(cents), containerReturnId: receipt.id,
    dailyAreaAres: Math.round(fact.dailyAreaHa * 100), confirmedBy: actor(access), notes: input.notes.trim(),
  }).returning();
  await tx.insert(activityTable).values({ action: "Подтверждён ежедневный расход химии",
    templateName: `${receipt.reportDate} · поле ${context.field.number} · ${request.requesterName} · тара №${receipt.id}`, userName: actor(access) });
  return { id: row.id };
}

export async function chemicalWorkflow(tx: ChemicalTx, access: RoleAccess) {
  const opRows = await tx.select({ op: operations, season: seasons, field: fields }).from(operations)
    .innerJoin(seasons, eq(operations.seasonId, seasons.id)).innerJoin(fields, eq(seasons.fieldId, fields.id));
  const batchRows = await tx.select().from(batches);
  const requestRows = await tx.select().from(requests);
  const issueRows = await tx.select().from(issues);
  const consumedRows = await tx.select().from(consumptions);
  const returnRows = await tx.select().from(containerReturns);
  const confirmedReturns = new Map(consumedRows.filter(c => c.containerReturnId !== null).map(c => [c.containerReturnId, c.id]));
  const reportRows = await tx.select().from(progress).orderBy(asc(progress.reportDate));
  const batchMap = new Map(batchRows.map(b => [b.id, b]));
  const requestMap = new Map(requestRows.map(r => [r.id, r]));
  const issueMap = new Map(issueRows.map(i => [i.id, i]));
  return GetChemicalWorkflowResponse.parse({
    operations: opRows.filter(({ op, field }) => !op.voidedAt && !op.isUnplanned && field.isActive && isChemicalOperation(op))
      .map(({ op, season, field }) => ({ id: op.id, seasonId: season.id, fieldNumber: field.number,
        farm: field.unit, year: season.year, name: op.name, actualStart: op.actualStart, actualEnd: op.actualEnd,
        days: chemicalFactDays(op, reportRows.filter(r => r.operationId === op.id)) })),
    requests: requestRows.map(r => ({ id: r.id, operationId: r.operationId, batchId: r.batchId,
      name: batchMap.get(r.batchId)!.name, unit: batchMap.get(r.batchId)!.unit, quantity: r.quantityMillis / 1000,
      issuedQuantity: issueRows.filter(i => i.chemicalRequestId === r.id).reduce((sum, i) => sum + i.quantityMillis, 0) / 1000,
      requesterName: r.requesterName, isMine: r.requesterUserId === access.userId,
      createdAt: r.createdAt.toISOString(), notes: r.notes })),
    custody: issueRows.filter(i => i.chemicalRequestId !== null).map(i => {
      const r = requestMap.get(i.chemicalRequestId!)!;
      const consumed = consumedRows.filter(c => c.issueId === i.id);
      const pending = returnRows.filter(r => r.issueId === i.id && !confirmedReturns.has(r.id));
      return { issueId: i.id, chemicalRequestId: r.id, operationId: r.operationId,
        name: batchMap.get(i.batchId)!.name, unit: batchMap.get(i.batchId)!.unit,
        requesterName: r.requesterName, isMine: r.requesterUserId === access.userId, quantity: i.quantityMillis / 1000,
        remaining: (i.quantityMillis - consumed.reduce((sum, c) => sum + c.quantityMillis, 0)) / 1000,
        remainingAmount: (Number(i.amountCents) - consumed.reduce((sum, c) => sum + Number(c.amountCents), 0)) / 100,
        occurredOn: i.occurredOn, containerVolume: batchMap.get(i.batchId)!.containerVolumeMillis === null
          ? null : batchMap.get(i.batchId)!.containerVolumeMillis! / 1000,
        pendingReturnQuantity: pending.reduce((s, r) => s + r.quantityMillis, 0) / 1000,
        pendingReturnCount: pending.reduce((s, r) => s + r.containerCount, 0) };
    }),
    consumptions: consumedRows.map(c => {
      const b = batchMap.get(issueMap.get(c.issueId)!.batchId)!;
      return { id: c.id, issueId: c.issueId, operationId: c.operationId, reportDate: c.reportDate,
        name: b.name, unit: b.unit, quantity: c.quantityMillis / 1000, amount: Number(c.amountCents) / 100,
        dailyAreaHa: c.dailyAreaAres / 100, confirmedBy: c.confirmedBy, notes: c.notes, containerReturnId: c.containerReturnId };
    }),
    containerReturns: returnRows.map(r => ({ id: r.id, issueId: r.issueId, operationId: r.operationId,
      reportDate: r.reportDate, returnedOn: r.returnedOn, containerCount: r.containerCount,
      containerVolume: r.containerVolumeMillis / 1000, quantity: r.quantityMillis / 1000,
      acceptedBy: r.acceptedBy, notes: r.notes, consumptionId: confirmedReturns.get(r.id) ?? null })),
  });
}

/** Preserve already confirmed daily facts, but allow later days and final completion. */
export async function lastChemicalConfirmation(tx: ChemicalTx, operationId: number) {
  const rows = await tx.select().from(consumptions).where(eq(consumptions.operationId, operationId));
  return rows.map(r => r.reportDate).sort().at(-1);
}
export async function chemicalRequestsExist(tx: ChemicalTx, operationId: number) {
  const rows = await tx.select({ id: requests.id }).from(requests).where(eq(requests.operationId, operationId)).limit(1);
  return rows.length > 0;
}
export async function chemicalIssuedForOperation(tx: ChemicalTx, operationId: number) {
  const rows = await tx.select({ id: requests.id }).from(requests).where(eq(requests.operationId, operationId));
  if (!rows.length) return false;
  const issued = await tx.select({ id: issues.id }).from(issues).where(inArray(issues.chemicalRequestId, rows.map(r => r.id))).limit(1);
  return issued.length > 0;
}
export async function hasOwnChemicalRequest(tx: ChemicalTx, operationId: number, access: RoleAccess) {
  const rows = await tx.select().from(requests).where(and(eq(requests.operationId, operationId),
    ...(access.role === "general_director" ? [] : [eq(requests.requesterUserId, access.userId)]))).limit(1);
  return rows.length > 0;
}
