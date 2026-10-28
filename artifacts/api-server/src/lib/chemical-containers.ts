import { and, eq, isNull } from "drizzle-orm";
import {
  chemicalBatchesTable as batches, chemicalIssuesTable as issues,
  chemicalRequestsTable as requests, chemicalConsumptionsTable as consumptions,
  chemicalContainerReturnsTable as returns, fieldOperationsTable as operations, activityTable,
} from "@workspace/db";
import type { ChemicalContainerReturnInput, ChemicalPackagingInput } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { chemicalCheck as check, scaledChemical } from "./chemical-stock";
import { lockChemicalWorkflow, type ChemicalTx } from "./chemical-workflow";
import { grainBusinessDate, validGrainDate } from "./grain-ledger";

function warehouse(access: RoleAccess) {
  check(access.role === "grain_manager" || access.role === "general_director",
    "Пустую тару принимает и упаковку указывает заведующий током.", 403);
}
export function chemicalPackaging(input: ChemicalPackagingInput, totalMillis: number) {
  const volume = scaledChemical(input.containerVolume, 1000, "объём одной упаковки — до 3 знаков");
  check(volume > 0 && volume <= 1_000_000_000, "Укажите положительный объём одной упаковки.");
  check(Number.isSafeInteger(input.containerCount) && input.containerCount > 0 && input.containerCount <= 1_000_000,
    "Количество упаковок должно быть целым положительным числом.");
  check(volume * input.containerCount === totalMillis,
    "Общий объём партии должен равняться объёму одной упаковки × количество упаковок.");
  return { containerVolumeMillis: volume, containerCount: input.containerCount };
}
export async function setChemicalPackaging(tx: ChemicalTx, id: number, input: ChemicalPackagingInput, access: RoleAccess) {
  warehouse(access);
  check(Number.isSafeInteger(id) && id > 0, "Некорректная партия.");
  await lockChemicalWorkflow(tx);
  const [batch] = await tx.select().from(batches).where(eq(batches.id, id));
  check(batch, "Партия не найдена.", 404);
  const prepared = chemicalPackaging(input, batch.receivedMillis);
  if (batch.containerVolumeMillis === prepared.containerVolumeMillis && batch.containerCount === prepared.containerCount) return { id };
  const [returned] = await tx.select({ id: returns.id }).from(returns)
    .innerJoin(issues, eq(returns.issueId, issues.id)).where(eq(issues.batchId, id)).limit(1);
  check(!returned, "После приёмки тары менять упаковку партии нельзя: объём подтверждён документом возврата.", 409);
  await tx.update(batches).set(prepared).where(eq(batches.id, id));
  await tx.insert(activityTable).values({ action: "Уточнена упаковка партии химии",
    templateName: `${batch.name} · ${input.containerCount} × ${input.containerVolume} ${batch.unit}`,
    userName: `${access.displayName} · ${access.role}` });
  return { id };
}
export async function acceptChemicalContainers(tx: ChemicalTx, input: ChemicalContainerReturnInput, access: RoleAccess) {
  warehouse(access);
  check(Number.isSafeInteger(input.issueId) && input.issueId > 0, "Выберите выдачу агроному.");
  check(Number.isSafeInteger(input.containerCount) && input.containerCount > 0 && input.containerCount <= 1_000_000,
    "Укажите целое положительное количество пустых упаковок.");
  check(validGrainDate(input.reportDate) && validGrainDate(input.returnedOn)
    && input.reportDate <= input.returnedOn && input.returnedOn <= grainBusinessDate(),
  "Дата возврата не раньше дня работы и не позднее сегодняшней.");
  await lockChemicalWorkflow(tx);
  const [existing] = await tx.select().from(returns).where(eq(returns.requestId, input.requestId));
  if (existing) {
    check(existing.issueId === input.issueId && existing.containerCount === input.containerCount
      && existing.reportDate === input.reportDate && existing.returnedOn === input.returnedOn,
    "Этот номер запроса уже использован для другой приёмки тары.", 409);
    return { id: existing.id };
  }
  const [issue] = await tx.select().from(issues).where(eq(issues.id, input.issueId));
  check(issue?.chemicalRequestId, "Тара принимается по выдаче на баланс агронома.", 409);
  check(input.reportDate >= issue.occurredOn, "День расхода не может быть раньше выдачи.", 409);
  const [request] = await tx.select().from(requests).where(eq(requests.id, issue.chemicalRequestId));
  check(request, "Заявка не найдена.", 404);
  const [operation] = await tx.select().from(operations).where(eq(operations.id, request.operationId));
  check(operation && !operation.voidedAt, "Операция отменена или недоступна.", 409);
  const [batch] = await tx.select().from(batches).where(eq(batches.id, issue.batchId));
  check(batch?.containerVolumeMillis && batch.containerCount, "Сначала укажите объём и количество упаковок исходной партии на складе.", 409);
  const consumed = await tx.select().from(consumptions).where(eq(consumptions.issueId, issue.id));
  const pending = await tx.select({ quantityMillis: returns.quantityMillis }).from(returns)
    .leftJoin(consumptions, eq(consumptions.containerReturnId, returns.id))
    .where(and(eq(returns.issueId, issue.id), isNull(consumptions.id)));
  const available = issue.quantityMillis - consumed.reduce((s, c) => s + c.quantityMillis, 0)
    - pending.reduce((s, r) => s + r.quantityMillis, 0);
  const quantityMillis = input.containerCount * batch.containerVolumeMillis;
  check(quantityMillis <= available,
    "Количество тары превышает остаток выдачи с учётом уже принятой тары, ожидающей диспетчера.", 409);
  const [receipt] = await tx.insert(returns).values({
    requestId: input.requestId, issueId: issue.id, operationId: request.operationId,
    reportDate: input.reportDate, returnedOn: input.returnedOn, containerCount: input.containerCount,
    containerVolumeMillis: batch.containerVolumeMillis, quantityMillis,
    acceptedBy: `${access.displayName} · ${access.role}`, notes: input.notes.trim(),
  }).returning();
  await tx.insert(activityTable).values({ action: "Принята пустая тара — ожидает подтверждения диспетчера",
    templateName: `${request.requesterName} · ${batch.name} · ${input.containerCount} × ${batch.containerVolumeMillis / 1000} ${batch.unit} · ${input.reportDate}`,
    userName: `${access.displayName} · ${access.role}` });
  // Warehouse stock and agronomist custody remain unchanged until the dispatcher confirms.
  return { id: receipt.id };
}
