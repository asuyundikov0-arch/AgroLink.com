import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
  activityTable, agroFieldsTable, db, fieldOperationProgressTable, fieldOperationsTable,
  fieldSeasonsTable, fleetEquipmentTable, fuelMovementsTable, supportingTasksTable,
} from "@workspace/db";
import type { FuelIssueInput, FuelReceiptInput } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { grainBusinessDate, grainNameKey, grainUnits, validGrainDate } from "./grain-ledger";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Movement = typeof fuelMovementsTable.$inferSelect;
export class FuelError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function fuelCheck(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new FuelError(message, status);
}
const fuelTypeKey = (value: string) => {
  const key = grainNameKey(value);
  return key.slice(0, 1).toLocaleUpperCase("ru") + key.slice(1);
};
export const equipmentLabel = (equipment: typeof fleetEquipmentTable.$inferSelect) =>
  `${equipment.kind} · ${equipment.registrationNumber || "без госномера"}`;
const scaled = (value: number, multiplier: number, max: number) => {
  const result = Math.round(value * multiplier);
  fuelCheck(Number.isFinite(value) && result > 0 && value <= max &&
    Math.abs(value * multiplier - result) < 0.00001, "Проверьте объём (до 3 знаков) и цену (до 2 знаков после запятой).");
  return result;
};
export function fuelRatio(value: number, quantity: number, total: number) {
  const product = BigInt(value) * BigInt(quantity);
  return Number((product * 2n + BigInt(total)) / (2n * BigInt(total)));
}
export function fuelBalance(rows: Movement[]) {
  return rows.reduce((sum, row) => ({
    millis: sum.millis + (row.kind === "receipt" ? row.quantityMillis : -row.quantityMillis),
    cents: sum.cents + (row.kind === "receipt" ? Number(row.amountCents) : -Number(row.amountCents)),
  }), { millis: 0, cents: 0 });
}
export async function fuelAssignments(tx: Tx) {
  const rows = await tx.select({
    operation: fieldOperationsTable, season: fieldSeasonsTable, field: agroFieldsTable,
  }).from(fieldOperationsTable)
    .innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
    .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id))
    .where(isNull(fieldOperationsTable.voidedAt));
  const progress = await tx.select().from(fieldOperationProgressTable)
    .orderBy(asc(fieldOperationProgressTable.reportDate), asc(fieldOperationProgressTable.id));
  return rows.filter(({ operation }) => operation.actualStart !== null).map(({ operation, field }) => ({
    operationId: operation.id, fieldId: field.id, fieldNumber: field.number, farm: field.unit,
    operationName: operation.actualOperationName || operation.name, startDate: operation.actualStart!,
    endDate: operation.actualEnd, equipment: operation.actualEquipment,
    assignments: progress.filter((p) => p.operationId === operation.id)
      .map((p) => ({ date: p.reportDate, equipment: p.actualEquipment })),
  }));
}
export function assignmentMatches(
  assignment: Awaited<ReturnType<typeof fuelAssignments>>[number],
  fleet: typeof fleetEquipmentTable.$inferSelect, date: string,
) {
  if (assignment.farm !== fleet.unit || assignment.startDate > date ||
    (assignment.endDate !== null && assignment.endDate < date)) return false;
  const daily = assignment.assignments.filter((p) => p.date === date);
  const labels = daily.length ? daily.map((p) => p.equipment) : [assignment.equipment];
  // Resource changes made today apply immediately, even before the next daily report.
  if (date === grainBusinessDate() && assignment.endDate === null) labels.push(assignment.equipment);
  return labels.some((label) => grainNameKey(label) === grainNameKey(equipmentLabel(fleet)));
}

async function validateFuelTask(tx: Tx, input: FuelIssueInput) {
  fuelCheck(input.forFieldWork === true && input.operationId !== null,
    "Для исполнения задания отметьте полевую заправку и выберите операцию.");
  fuelCheck(Number.isSafeInteger(input.supportingTaskId) && Number(input.supportingTaskId) > 0, "Выберите корректное задание.");
  const [task] = await tx.select().from(supportingTasksTable)
    .where(eq(supportingTasksTable.id, input.supportingTaskId!)).for("share");
  fuelCheck(task && task.status === "sent" && task.details.services.includes("fuel") &&
    task.deliveries.some(d => d.service === "fuel" && d.status === "accepted"),
  "Нефтебаза должна сначала принять это задание к исполнению.", 409);
  const [operation] = await tx.select().from(fieldOperationsTable).where(eq(fieldOperationsTable.id, task.operationId)).for("share");
  const [season] = operation ? await tx.select().from(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, operation.seasonId)) : [];
  const [field] = season ? await tx.select().from(agroFieldsTable).where(eq(agroFieldsTable.id, season.fieldId)) : [];
  fuelCheck(operation && !operation.voidedAt && !operation.actualEnd && operation.approvalStatus === "approved" &&
    operation.id === input.operationId && season && season.year === Number(input.occurredOn.slice(0, 4)) &&
    season.year === task.context.year && field?.isActive && field.unit === input.farm &&
    task.context.farm === input.farm && task.context.fieldId === field.id,
  "Задание не относится к действующей операции выбранного поля, хозяйства и сезона.", 409);
  fuelCheck(task.details.equipmentId === null || task.details.equipmentId === input.fleetId,
    "В задании указана другая техника. Выберите технику задания.", 409);
}

export async function postFuelMovement(
  tx: Tx, kind: "receipt" | "issue", input: FuelReceiptInput | FuelIssueInput, access: RoleAccess,
) {
  fuelCheck(access.role === "fuel_manager" || access.role === "general_director",
    "Приход и расход топлива оформляет заведующий нефтебазой.", 403);
  fuelCheck(grainUnits.includes(input.farm as typeof grainUnits[number]), "Выберите хозяйство.");
  fuelCheck(validGrainDate(input.occurredOn) && input.occurredOn <= grainBusinessDate(),
    "Укажите корректную дату не позднее сегодняшней.");
  const quantityMillis = scaled(input.liters, 1000, 1000000);
  const fuelType = fuelTypeKey(input.fuelType);
  fuelCheck(fuelType.length > 0 && fuelType.length <= 80, "Укажите вид топлива.");
  const receipt = kind === "receipt" ? input as FuelReceiptInput : null;
  const issue = kind === "issue" ? input as FuelIssueInput : null;
  if (issue?.forFieldWork === true) {
    fuelCheck(issue.operationId != null, "Выберите поле и полевую операцию для выдачи топлива.");
  }
  if (issue?.forFieldWork === false) {
    fuelCheck(issue.operationId === null, "Для заправки без полевых работ поле и операция не указываются.");
  }
  const price = receipt ? scaled(receipt.pricePerLiter, 100, 1000000) : null;
  fuelCheck(!receipt || receipt.invoiceNumber.trim(), "Укажите номер накладной.");
  // Same order as field mutations. Do not acquire the field lock after the fuel lock.
  await tx.execute(sql`select pg_advisory_xact_lock(718392006)`);
  await tx.execute(sql`select pg_advisory_xact_lock(718392010)`);
  const [existing] = await tx.select().from(fuelMovementsTable)
    .where(eq(fuelMovementsTable.requestId, input.requestId));
  if (existing) {
    fuelCheck(existing.kind === kind && existing.farm === input.farm && existing.fuelType === fuelType &&
      existing.occurredOn === input.occurredOn && existing.quantityMillis === quantityMillis &&
      existing.notes === input.notes.trim() &&
      (receipt ? Number(existing.pricePerLiterCents) === price &&
        existing.invoiceNumber === receipt.invoiceNumber.trim() && existing.supplier === receipt.supplier.trim()
        : existing.fleetId === issue!.fleetId && existing.operationId === issue!.operationId &&
          (existing.supportingTaskId ?? null) === (issue!.supportingTaskId ?? null)),
    "Этот запрос уже проведён с другими данными. Обновите форму.", 409);
    return existing;
  }
  const rows = await tx.select().from(fuelMovementsTable).where(and(
    eq(fuelMovementsTable.farm, input.farm), eq(fuelMovementsTable.fuelType, fuelType),
  ));
  fuelCheck(rows.every((r) => r.occurredOn <= input.occurredOn),
    "Вносите движения по этому топливу и хозяйству в хронологическом порядке.", 409);
  const balance = fuelBalance(rows);
  let amountCents: number;
  let pricePerLiterCents: number;
  if (receipt) {
    amountCents = fuelRatio(price!, quantityMillis, 1000);
    pricePerLiterCents = price!;
  } else {
    const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, issue!.fleetId));
    fuelCheck(fleet && fleet.unit === input.farm, "Выберите технику из справочника этого хозяйства.");
    const matching = (await fuelAssignments(tx)).filter((a) => assignmentMatches(a, fleet, input.occurredOn));
    if (issue!.supportingTaskId != null) {
      await validateFuelTask(tx, issue!);
    } else if (issue!.operationId !== null) {
      fuelCheck(matching.some((a) => a.operationId === issue!.operationId),
        "Техника не назначена на эту полевую работу в выбранную дату.", 409);
    } else if (issue!.forFieldWork !== false) {
      fuelCheck(matching.length === 0,
        "Техника работает в поле. Выберите полевую операцию для отнесения затрат.", 409);
    }
    fuelCheck(balance.millis >= quantityMillis, "Недостаточно топлива на нефтебазе.", 409);
    amountCents = quantityMillis === balance.millis ? balance.cents :
      fuelRatio(balance.cents, quantityMillis, balance.millis);
    pricePerLiterCents = fuelRatio(balance.cents, 1000, balance.millis);
  }
  fuelCheck(Number.isSafeInteger(amountCents) && Number.isSafeInteger(balance.cents + amountCents) &&
    balance.cents + amountCents < 9_000_000_000_000_000, "Сумма выходит за допустимый диапазон.");
  const [created] = await tx.insert(fuelMovementsTable).values({
    requestId: input.requestId, kind, farm: input.farm, fuelType, occurredOn: input.occurredOn,
    quantityMillis, amountCents: String(amountCents), pricePerLiterCents: String(pricePerLiterCents),
    fleetId: issue?.fleetId ?? null, operationId: issue?.operationId ?? null,
    supportingTaskId: issue?.supportingTaskId ?? null,
    invoiceNumber: receipt?.invoiceNumber.trim() ?? "", supplier: receipt?.supplier.trim() ?? "",
    notes: input.notes.trim(), createdBy: `${access.displayName} · ${access.role}`,
  }).returning();
  await tx.insert(activityTable).values({
    action: kind === "receipt" ? "Приход топлива на нефтебазу" : "Расход топлива на технику",
    templateName: `${input.farm} · ${fuelType} · ${input.liters} л`, userName: created.createdBy,
  });
  return created;
}
