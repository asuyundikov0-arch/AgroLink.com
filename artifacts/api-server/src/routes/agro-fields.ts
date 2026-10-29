import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  CreateAgroFieldBody, UpdateAgroFieldBody, CreateFieldSeasonBody, UpdateFieldSeasonBody,
  CreateFieldOperationBody, UpdateFieldOperationBody, UpdateFieldOperationActualBody, CreateFieldOperationProgressBody, UpdateFieldOperationProgressBody, VoidFieldOperationBody,
  GetFieldDashboardResponse, GetFieldDispatchQueueResponse, UpdateFieldDispatchRateBody, UpdateFieldDispatchRateParams, UpdateFieldDispatchRateResponse,
  CreateAgroFieldResponse, CreateFieldSeasonResponse, CreateFieldOperationResponse,
  CreateUnplannedFieldOperationBody, CreateUnplannedFieldOperationResponse, GetDailySeedingReportResponse,
  TransitionFieldOperationBody, type FieldProgressReport, type FieldOperationInput,
} from "@workspace/api-zod";
import { activityTable, agroFieldsTable, employeesTable, fleetEquipmentTable, fieldSeasonsTable, fieldOperationsTable, fieldOperationProgressTable, grainCropsTable, fuelMovementsTable, db } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { grainBusinessDate, validGrainDate } from "../lib/grain-ledger";
import { fieldNumberKey, fieldOperationState, progressDeltaAres, toAreaAres, validateFieldPlan, validateFieldProgress } from "../lib/field-planning";
import { fieldPayrollLockedThrough, fieldPayrollWasSubmitted, lockPayrollSources } from "../lib/payroll-source-guard";
import { fieldOperationSuggestions } from "../lib/field-operation-catalog";
import { summarizeDailySeeding } from "../lib/daily-seeding";
import { isChemicalOperation, chemicalRequestsExist, chemicalIssuedForOperation, lastChemicalConfirmation } from "../lib/chemical-workflow";
import { ChemicalError } from "../lib/chemical-stock";
import { startOrChangeFieldWork, transitionFieldWork, validateChemicalPlan } from "../lib/field-workflow";
import { validateSupportingWorks } from "../lib/field-supporting-works";
import { fieldCosts } from "../lib/field-costs";
import { GetFieldCostsResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const managers = ["chief_agronomist", "general_director"];
const actualWriters = ["agronomist", "general_director"];
const readers = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"];
const roles = (allowed: string[]): RequestHandler => (_req, res, next) => {
  if (!allowed.includes(res.locals.access.role)) { res.status(403).json({ error: "Недостаточно прав для работы с полями." }); return; }
  next();
};
router.use("/agro/fields", requireApprovedRole);
const manage = roles(managers);
router.get("/agro/fields/seasons/:id/costs", roles(readers), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) { res.status(400).json({ error: "Укажите корректный сезон поля." }); return; }
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`set transaction isolation level repeatable read`);
      return fieldCosts(tx, id);
    });
    if (!result) { res.status(404).json({ error: "Сезон поля не найден." }); return; }
    res.json(GetFieldCostsResponse.parse(result));
  } catch (error) { next(error); }
});
class FieldError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function requireValue(condition: unknown, message: string, status = 400): asserts condition {
  if (!condition) throw new FieldError(status, message);
}
const positiveId = (id: unknown) => Number.isSafeInteger(Number(id)) && Number(id) > 0;
function body<T>(schema: { parse: (value: unknown) => T }, input: unknown): T {
  try { return schema.parse(input); } catch { throw new FieldError(400, "Проверьте обязательные поля формы и диапазоны значений."); }
}
const safe = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (err) {
    if (err instanceof FieldError || err instanceof ChemicalError) { res.status(err.status).json({ error: err.message }); return; }
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") {
      res.status(409).json({ error: "Такая запись уже существует: проверьте номер поля, сезон или одинаковые операции с теми же сроками." }); return;
    }
    next(err);
  }
};
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function mutate<T extends { id: number }>(action: string, by: string, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Serialize parent/child edits and optimistic-version checks in one atomic operation.
    await tx.execute(sql`select pg_advisory_xact_lock(718392006)`);
    await lockPayrollSources(tx);
    const result = await fn(tx);
    await tx.insert(activityTable).values({ action, templateName: `Запись №${result.id}`, userName: by });
    return result;
  });
}
function revision(row: { version: number }, version: number) {
  requireValue(Number.isSafeInteger(version) && version === row.version, "Версия записи устарела: данные уже изменены другим пользователем. Обновите данные и повторите.", 409);
}
const stamp = (by: string, version: number) => ({ version: version + 1, updatedBy: by, updatedAt: new Date() });
function fieldJson(row: typeof agroFieldsTable.$inferSelect) {
  const { numberKey: _key, areaAres, ...rest } = row;
  return CreateAgroFieldResponse.parse({ ...rest, areaHa: areaAres / 100, updatedAt: row.updatedAt.toISOString() });
}
function seasonJson(row: typeof fieldSeasonsTable.$inferSelect) {
  const { areaAres, ...rest } = row;
  return CreateFieldSeasonResponse.parse({ ...rest, areaHa: areaAres / 100, updatedAt: row.updatedAt.toISOString() });
}
function progressReportsJson(rows: (typeof fieldOperationProgressTable.$inferSelect)[]): FieldProgressReport[] {
  let previousAres = 0;
  return rows.map((row) => {
    const dailyAres = progressDeltaAres(row.cumulativeAreaAres, previousAres);
    previousAres = row.cumulativeAreaAres;
    return {
      id: row.id, reportDate: row.reportDate, cumulativeAreaHa: row.cumulativeAreaAres / 100,
      actualRatePerHa: row.actualRatePerHa === null ? null : Number(row.actualRatePerHa),
      dailyAreaHa: dailyAres / 100, actualMechanic: row.actualMechanic, actualMechanicEmployeeId: row.actualMechanicEmployeeId, actualEquipment: row.actualEquipment,
      actualImplement: row.actualImplement, notes: row.notes, version: row.version, updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
export function operationJson(row: typeof fieldOperationsTable.$inferSelect, today = grainBusinessDate(), progressReports: FieldProgressReport[] = []) {
  const { nameKey: _key, plannedAreaAres, actualAreaAres, plannedRatePerHa, plannedFuelCost, actualRatePerHa, actualRateSetAt, ...rest } = row;
  const plannedAreaHa = plannedAreaAres / 100;
  const actualAreaHa = actualAreaAres / 100;
  const plannedRate = Number(plannedRatePerHa);
  const actualRate = actualRatePerHa === null ? null : Number(actualRatePerHa);
  return CreateFieldOperationResponse.parse({
    ...rest, ...fieldOperationState(row, today), plannedAreaHa, actualAreaHa, requiresChemicals: isChemicalOperation(row),
    actualAreaLimitHa: (row.actualAreaLimitAres ?? row.plannedAreaAres) / 100,
    isOverdue: !row.isUnplanned && fieldOperationState(row, today).isOverdue,
    plannedRatePerHa: plannedRate,
    plannedFuelCost: Number(plannedFuelCost),
    plannedPayAmount: Math.round((plannedAreaHa * plannedRate + Number.EPSILON) * 100) / 100,
    actualRatePerHa: actualRate,
    actualPayAmount: actualRate === null ? null : Math.round((actualAreaHa * actualRate + Number.EPSILON) * 100) / 100,
    actualRateSetAt: actualRateSetAt?.toISOString() ?? null,
    progressReports,
    voidedAt: row.voidedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
  });
}
async function fieldDispatchRows() {
  const fuelRows = await db.select({
    operationId: fuelMovementsTable.operationId,
    cents: sql<string>`coalesce(sum(${fuelMovementsTable.amountCents}), 0)`,
  }).from(fuelMovementsTable).where(eq(fuelMovementsTable.kind, "issue")).groupBy(fuelMovementsTable.operationId);
  const fuelByOperation = new Map(fuelRows.map((row) => [row.operationId, Number(row.cents) / 100]));
  const rows = await db.select({ operation: fieldOperationsTable, season: fieldSeasonsTable, field: agroFieldsTable })
    .from(fieldOperationsTable)
    .innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
    .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id))
    .where(and(isNotNull(fieldOperationsTable.actualStart), isNull(fieldOperationsTable.voidedAt)))
    .orderBy(desc(fieldOperationsTable.actualEnd), desc(fieldOperationsTable.id));
  const reports = await db.select().from(fieldOperationProgressTable).orderBy(asc(fieldOperationProgressTable.reportDate));
  return GetFieldDispatchQueueResponse.parse(rows.map(({ operation, season, field }) => {
    const actualAreaHa = operation.actualAreaAres / 100;
    const actualRatePerHa = operation.actualRatePerHa === null ? null : Number(operation.actualRatePerHa);
    return {
      id: operation.id,
      fuelCost: fuelByOperation.get(operation.id) ?? 0,
      farm: field.unit,
      operation: operationJson(operation, grainBusinessDate(), progressReportsJson(reports.filter(r => r.operationId === operation.id))),
      version: operation.version,
      fieldNumber: field.number,
      year: season.year,
      cropName: season.cropName,
      operationName: operation.actualOperationName || operation.name,
      plannedStart: operation.plannedStart,
      plannedEnd: operation.plannedEnd,
      actualStart: operation.actualStart,
      actualEnd: operation.actualEnd,
      actualAreaHa,
      actualMechanic: operation.actualMechanic,
      actualMechanicEmployeeId: operation.actualMechanicEmployeeId,
      actualEquipment: operation.actualEquipment,
      actualImplement: operation.actualImplement,
      plannedRatePerHa: Number(operation.plannedRatePerHa),
      actualRatePerHa,
      actualPayAmount: actualRatePerHa === null ? null : Math.round((actualAreaHa * actualRatePerHa + Number.EPSILON) * 100) / 100,
      actualRateSetBy: operation.actualRateSetBy,
      actualRateSetAt: operation.actualRateSetAt?.toISOString() ?? null,
    };
  }));
}
async function getField(tx: Tx, id: number) {
  requireValue(positiveId(id), "Выберите корректное поле.");
  const [row] = await tx.select().from(agroFieldsTable).where(eq(agroFieldsTable.id, id));
  requireValue(row, "Поле не найдено.", 404);
  return row;
}
async function selectedMechanic(tx: Tx, id: number | null | undefined) {
  requireValue(id && positiveId(id), "Выберите механизатора из справочника сотрудников.");
  const [employee] = await tx.select().from(employeesTable).where(eq(employeesTable.id, id));
  requireValue(employee?.isActive, "Выберите действующего сотрудника из справочника.");
  return employee;
}
export async function plannedResources(tx: Tx, input: FieldOperationInput, unit: string, old?: typeof fieldOperationsTable.$inferSelect) {
  const existingNames = await tx.select({ name: fieldOperationsTable.name }).from(fieldOperationsTable);
  const name = fieldOperationSuggestions(existingNames).find((candidate) => fieldNumberKey(candidate) === fieldNumberKey(input.name));
  requireValue(name, "Выберите вид операции из подготовленного списка.");
  const employeeId = input.plannedMechanicEmployeeId
    ?? (old && input.responsible.trim() === old.responsible ? old.plannedMechanicEmployeeId : null);
  const equipmentId = input.plannedEquipmentId
    ?? (old && input.plannedEquipment.trim() === old.plannedEquipment ? old.plannedEquipmentId : null);
  let responsible = old?.responsible ?? "";
  let plannedEquipment = old?.plannedEquipment ?? "";
  if (employeeId !== null) {
    requireValue(positiveId(employeeId), "Выберите механизатора из справочника.");
    const [employee] = await tx.select().from(employeesTable).where(eq(employeesTable.id, employeeId));
    requireValue(employee && (employee.isActive || old?.plannedMechanicEmployeeId === employee.id), "Выберите действующего сотрудника из справочника.");
    responsible = employee.fullName;
  } else {
    requireValue(old && input.responsible.trim() === old.responsible, "Выберите механизатора из справочника сотрудников.");
  }
  if (equipmentId !== null) {
    requireValue(positiveId(equipmentId), "Выберите технику из справочника.");
    const [equipment] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, equipmentId));
    requireValue(equipment && equipment.unit === unit, "Выберите технику нужного хозяйства из общего справочника.");
    plannedEquipment = `${equipment.kind} · ${equipment.registrationNumber || "без госномера"}`;
  } else {
    requireValue(old && input.plannedEquipment.trim() === old.plannedEquipment, "Выберите технику из общего справочника.");
  }
  return { name, nameKey: fieldNumberKey(name), responsible, plannedEquipment, plannedMechanicEmployeeId: employeeId, plannedEquipmentId: equipmentId };
}
async function getSeason(tx: Tx, id: number) {
  requireValue(positiveId(id), "Выберите корректный сезон поля.");
  const [row] = await tx.select().from(fieldSeasonsTable).where(eq(fieldSeasonsTable.id, id));
  requireValue(row, "Сезон поля не найден.", 404);
  return row;
}
async function getOperation(tx: Tx, id: number) {
  requireValue(positiveId(id), "Выберите корректную операцию.");
  const [row] = await tx.select().from(fieldOperationsTable).where(eq(fieldOperationsTable.id, id));
  requireValue(row, "Операция не найдена.", 404);
  return row;
}
router.get("/agro/fields/dispatch", roles(["dispatcher", "general_director"]), safe(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await fieldDispatchRows());
}));
router.get("/agro/fields/seeding-report", roles(readers), safe(async (req, res) => {
  const year = Number(req.query.year);
  const date = String(req.query.date ?? "");
  const unit = typeof req.query.unit === "string" && req.query.unit !== "all" ? req.query.unit : null;
  requireValue(Number.isInteger(year) && year >= 1900 && year <= 2200, "Выберите корректный сезон.");
  requireValue(validGrainDate(date) && date <= grainBusinessDate(), "Выберите дату отчёта, не позднее сегодняшней.");
  requireValue(unit === null || ["АПК Арыстан Grain", "АФ Веденовка"].includes(unit), "Выберите хозяйство из списка.");
  const report = await db.transaction(async (tx) => {
    const rows = await tx.select({ operation: fieldOperationsTable, cropName: fieldSeasonsTable.cropName })
      .from(fieldOperationsTable)
      .innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
      .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id))
      .where(and(eq(fieldSeasonsTable.year, year), isNull(fieldOperationsTable.voidedAt),
        unit ? eq(agroFieldsTable.unit, unit) : undefined));
    const progress = await tx.select().from(fieldOperationProgressTable)
      .where(sql`${fieldOperationProgressTable.operationId} in (
        select ${fieldOperationsTable.id} from ${fieldOperationsTable}
        inner join ${fieldSeasonsTable} on ${fieldOperationsTable.seasonId} = ${fieldSeasonsTable.id}
        where ${fieldSeasonsTable.year} = ${year}
      )`);
    return summarizeDailySeeding(rows.map(({ operation, cropName }) => ({ ...operation, cropName })), progress, date);
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetDailySeedingReportResponse.parse({ year, date, unit, ...report }));
}));
router.get("/agro/fields", roles(readers), safe(async (_req, res) => {
  const today = grainBusinessDate();
  const snapshot = await db.transaction(async (tx) => {
    const fields = await tx.select().from(agroFieldsTable).orderBy(agroFieldsTable.number);
    const seasons = await tx.select().from(fieldSeasonsTable).orderBy(desc(fieldSeasonsTable.year), fieldSeasonsTable.fieldId);
    const operations = await tx.select().from(fieldOperationsTable).orderBy(fieldOperationsTable.plannedStart, fieldOperationsTable.id);
    const progressRows = await tx.select().from(fieldOperationProgressTable).orderBy(asc(fieldOperationProgressTable.operationId), asc(fieldOperationProgressTable.reportDate));
    const crops = await tx.select().from(grainCropsTable);
    const progressByOperation = new Map<number, typeof progressRows>();
    for (const progress of progressRows) {
      const rows = progressByOperation.get(progress.operationId) ?? [];
      rows.push(progress);
      progressByOperation.set(progress.operationId, rows);
    }
    return {
      fields: fields.map(fieldJson), seasons: seasons.map(seasonJson),
      operations: operations.map((row) => operationJson(row, today, progressReportsJson(progressByOperation.get(row.id) ?? []))),
      cropSuggestions: [...new Set([...crops.map((crop) => crop.name), ...seasons.map((season) => season.cropName), "Пар"])],
      operationSuggestions: fieldOperationSuggestions(operations),
      asOfDate: today,
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetFieldDashboardResponse.parse(snapshot));
}));
router.post("/agro/fields", manage, safe(async (req, res) => {
  const input = body(CreateAgroFieldBody, req.body);
  requireValue(input.number.trim() && toAreaAres(input.areaHa) !== null, "Укажите номер и положительную площадь поля с точностью до 0,01 га.");
  requireValue(input.isActive || res.locals.access.role === "general_director", "Архивировать поля может только генеральный директор.", 403);
  const by = actor(res.locals.access);
  const row = await mutate("Добавлено поле", by, async (tx) => {
    const [created] = await tx.insert(agroFieldsTable).values({
      ...input, number: input.number.trim(), numberKey: fieldNumberKey(input.number), areaAres: toAreaAres(input.areaHa)!, updatedBy: by,
    }).returning();
    return created;
  });
  res.status(201).json(fieldJson(row));
}));
router.patch("/agro/fields/:id", manage, safe(async (req, res) => {
  const input = body(UpdateAgroFieldBody, req.body);
  requireValue(input.number.trim() && toAreaAres(input.areaHa) !== null, "Укажите номер и положительную площадь поля с точностью до 0,01 га.");
  const by = actor(res.locals.access);
  const row = await mutate("Изменена карточка поля", by, async (tx) => {
    const old = await getField(tx, Number(req.params.id)); revision(old, input.version);
    requireValue(old.isActive || res.locals.access.role === "general_director", "Изменять архивное поле может только генеральный директор.", 403);
    requireValue(input.isActive === old.isActive || res.locals.access.role === "general_director", "Архивировать и восстанавливать поля может только генеральный директор.", 403);
    const history = await tx.select().from(fieldSeasonsTable).where(eq(fieldSeasonsTable.fieldId, old.id));
    requireValue(!history.length || input.unit === old.unit, "Нельзя менять хозяйство поля с историей сезонов.", 409);
    const [updated] = await tx.update(agroFieldsTable).set({
      unit: input.unit, number: input.number.trim(), numberKey: fieldNumberKey(input.number), areaAres: toAreaAres(input.areaHa)!,
      notes: input.notes.trim(), isActive: input.isActive, ...stamp(by, old.version),
    }).where(eq(agroFieldsTable.id, old.id)).returning();
    return updated;
  });
  res.json(fieldJson(row));
}));
router.post("/agro/fields/seasons", manage, safe(async (req, res) => {
  const input = body(CreateFieldSeasonBody, req.body);
  requireValue(Number.isInteger(input.year) && input.cropName.trim() && toAreaAres(input.areaHa) !== null, "Укажите целый год, культуру и площадь с точностью до 0,01 га.");
  const by = actor(res.locals.access);
  const row = await mutate("Добавлен план севооборота", by, async (tx) => {
    const field = await getField(tx, input.fieldId);
    requireValue(field.isActive, "Поле в архиве. Новые сезоны для него недоступны.", 409);
    requireValue(toAreaAres(input.areaHa)! <= field.areaAres, "Площадь сезона не может превышать площадь поля.");
    const [created] = await tx.insert(fieldSeasonsTable).values({
      fieldId: field.id, year: input.year, cropName: input.cropName.trim(), variety: input.variety.trim(),
      areaAres: toAreaAres(input.areaHa)!, notes: input.notes.trim(), updatedBy: by,
    }).returning();
    return created;
  });
  res.status(201).json(seasonJson(row));
}));
router.patch("/agro/fields/seasons/:id", manage, safe(async (req, res) => {
  const input = body(UpdateFieldSeasonBody, req.body);
  requireValue(Number.isInteger(input.year) && input.cropName.trim() && toAreaAres(input.areaHa) !== null, "Укажите целый год, культуру и площадь с точностью до 0,01 га.");
  const by = actor(res.locals.access);
  const row = await mutate("Изменён план севооборота", by, async (tx) => {
    const old = await getSeason(tx, Number(req.params.id)); revision(old, input.version);
    const field = await getField(tx, input.fieldId);
    const ops = await tx.select().from(fieldOperationsTable).where(eq(fieldOperationsTable.seasonId, old.id));
    const changed = input.fieldId !== old.fieldId || input.year !== old.year || input.cropName.trim() !== old.cropName || input.variety.trim() !== old.variety || toAreaAres(input.areaHa) !== old.areaAres;
    requireValue(!changed || !ops.some((op) => op.actualStart), "После начала работ нельзя менять поле, год, культуру, сорт или площадь сезона. История должна сохраняться.", 409);
    requireValue(!changed || field.isActive, "Нельзя менять план сезона архивного поля.", 409);
    if (input.fieldId !== old.fieldId || toAreaAres(input.areaHa) !== old.areaAres) requireValue(toAreaAres(input.areaHa)! <= field.areaAres, "Площадь сезона больше площади поля.");
    requireValue(!ops.some((op) => !op.voidedAt && op.plannedAreaAres > toAreaAres(input.areaHa)!), "Площадь сезона меньше уже запланированных работ.", 409);
    const [updated] = await tx.update(fieldSeasonsTable).set({
      fieldId: field.id, year: input.year, cropName: input.cropName.trim(), variety: input.variety.trim(),
      areaAres: toAreaAres(input.areaHa)!, notes: input.notes.trim(), ...stamp(by, old.version),
    }).where(eq(fieldSeasonsTable.id, old.id)).returning();
    return updated;
  });
  res.json(seasonJson(row));
}));
router.post("/agro/fields/unplanned-operations", roles(actualWriters), safe(async (req, res) => {
  const input = body(CreateUnplannedFieldOperationBody, req.body);
  const today = grainBusinessDate();
  const by = actor(res.locals.access);
  const row = await mutate("Внеплановая работа отправлена главному агроному", by, async (tx) => {
    const season = await getSeason(tx, input.seasonId);
    const field = await getField(tx, season.fieldId);
    requireValue(field.isActive, "Для архивного поля новые фактические работы недоступны.", 409);
    requireValue(validGrainDate(input.occurredOn) && input.occurredOn <= today, "Укажите дату работы, не позднее сегодняшней.");
    const areaAres = toAreaAres(input.areaHa, true);
    requireValue(areaAres === 0 && !input.completed,
      "Внеплановая работа сначала отправляется на согласование без гектаров и завершения.", 409);
    requireValue(input.implement.trim(), "Укажите агрегат.");
    requireValue(positiveId(input.equipmentId), "Выберите корректную технику из справочника.");
    const mechanic = await selectedMechanic(tx, input.employeeId);
    const [equipment] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, input.equipmentId));
    requireValue(equipment && equipment.unit === field.unit, "Выберите технику нужного хозяйства из справочника.");
    const names = await tx.select({ name: fieldOperationsTable.name }).from(fieldOperationsTable);
    const name = fieldOperationSuggestions(names).find((candidate) => fieldNumberKey(candidate) === fieldNumberKey(input.name));
    requireValue(name, "Выберите вид операции из подготовленного списка.");
    const actualEquipment = `${equipment.kind} · ${equipment.registrationNumber || "без госномера"}`;
    const needsChemicals = !!input.requiresChemicals;
    const chemicalPlan = await validateChemicalPlan(tx, input.chemicalPlan ?? [], field.unit, needsChemicals);
    const [created] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, name, nameKey: fieldNumberKey(name), isUnplanned: true,
      approvalStatus: "pending", requiresChemicals: needsChemicals, chemicalModeExplicit: true, chemicalPlan,
      plannedStart: input.occurredOn, plannedEnd: input.occurredOn, plannedAreaAres: 0,
      actualAreaLimitAres: season.areaAres, actualStart: null,
      actualEnd: null, actualAreaAres: 0,
      actualOperationName: name, actualMechanic: mechanic.fullName, actualMechanicEmployeeId: mechanic.id,
      actualEquipment, actualImplement: input.implement.trim(), actualNotes: input.notes.trim(), updatedBy: by,
    }).returning();
    const progress = await tx.select().from(fieldOperationProgressTable).where(eq(fieldOperationProgressTable.operationId, created.id));
    return CreateUnplannedFieldOperationResponse.parse(operationJson(created, today, progressReportsJson(progress)));
  });
  res.status(201).json(row);
}));
router.post("/agro/fields/operations", manage, safe(async (req, res) => {
  const input = body(CreateFieldOperationBody, req.body);
  const by = actor(res.locals.access);
  const row = await mutate("Запланирована полевая операция", by, async (tx) => {
    const season = await getSeason(tx, input.seasonId);
    requireValue(input.plannedRatePerHa > 0 && input.plannedRatePerHa <= 1_000_000_000, "Укажите положительную плановую расценку за гектар.");
    const field = await getField(tx, season.fieldId);
    requireValue(field.isActive, "Поле в архиве. Новые работы недоступны.", 409);
    const error = validateFieldPlan(input, season.areaAres); requireValue(!error, error ?? "");
    const resources = await plannedResources(tx, input, field.unit);
    const supportingWorks = await validateSupportingWorks(tx, input.supportingWorks ?? [], field.unit);
    const chemicalPlan = await validateChemicalPlan(tx, input.chemicalPlan ?? [], field.unit, !!input.requiresChemicals);
    const [created] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, ...resources, supportingWorks, plannedStart: input.plannedStart,
      requiresChemicals: !!input.requiresChemicals, chemicalModeExplicit: true, chemicalPlan,
      plannedEnd: input.plannedEnd, plannedAreaAres: toAreaAres(input.plannedAreaHa)!, plannedRatePerHa: input.plannedRatePerHa.toFixed(2),
      plannedFuelCost: (input.plannedFuelCost ?? 0).toFixed(2),
      plannedImplement: input.plannedImplement.trim(),
      notes: input.notes.trim(), updatedBy: by,
    }).returning();
    return created;
  });
  res.status(201).json(operationJson(row));
}));
router.patch("/agro/fields/operations/:id", manage, safe(async (req, res) => {
  const input = body(UpdateFieldOperationBody, req.body);
  const by = actor(res.locals.access);
  const row = await mutate("Изменён план полевой операции", by, async (tx) => {
    const old = await getOperation(tx, Number(req.params.id)); revision(old, input.version);
    requireValue(input.seasonId === old.seasonId, "Поле закреплено за операцией и не может быть изменено.", 409);
    requireValue(!old.actualStart, "Работа уже началась. План сохраняется; агроном может менять только сведения выполнения.", 409);
    requireValue(!old.voidedAt, "Отменённую операцию нельзя редактировать.", 409);
    requireValue(!old.isUnplanned, "Внеплановая работа не является планом. Изменяйте её в фактических работах.", 409);
    if (await chemicalRequestsExist(tx, old.id)) requireValue(
      input.seasonId === old.seasonId && fieldNumberKey(input.name) === old.nameKey && input.requiresChemicals,
      "По операции уже запрошена химия: нельзя менять поле, вид операции или снимать признак химической обработки.", 409);
    const season = await getSeason(tx, input.seasonId);
    requireValue(input.plannedRatePerHa > 0 && input.plannedRatePerHa <= 1_000_000_000, "Укажите положительную плановую расценку за гектар.");
    const error = validateFieldPlan(input, season.areaAres); requireValue(!error, error ?? "");
    requireValue(!old.actualStart || (old.seasonId === input.seasonId && old.nameKey === fieldNumberKey(input.name)), "После начала работ нельзя переносить операцию на другое поле или менять её вид.", 409);
    if (input.seasonId !== old.seasonId) requireValue((await getField(tx, season.fieldId)).isActive, "Нельзя переносить работу на архивное поле.", 409);
    requireValue(toAreaAres(input.plannedAreaHa)! >= old.actualAreaAres, "Плановая площадь меньше уже выполненной.", 409);
    const resources = await plannedResources(tx, input, (await getField(tx, season.fieldId)).unit, old);
    const supportingWorks = await validateSupportingWorks(tx, input.supportingWorks ?? old.supportingWorks,
      (await getField(tx, season.fieldId)).unit);
    const chemicalPlan = await validateChemicalPlan(tx, input.chemicalPlan ?? old.chemicalPlan,
      (await getField(tx, season.fieldId)).unit, !!input.requiresChemicals);
    const [updated] = await tx.update(fieldOperationsTable).set({
      seasonId: season.id, ...resources, supportingWorks, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
      plannedAreaAres: toAreaAres(input.plannedAreaHa)!,
      requiresChemicals: !!input.requiresChemicals, chemicalModeExplicit: true, chemicalPlan,
      plannedRatePerHa: input.plannedRatePerHa.toFixed(2),
      plannedFuelCost: input.plannedFuelCost === undefined ? old.plannedFuelCost : input.plannedFuelCost.toFixed(2),
      plannedImplement: input.plannedImplement.trim(),
      notes: input.notes.trim(), ...stamp(by, old.version),
    }).where(eq(fieldOperationsTable.id, old.id)).returning();
    return updated;
  });
  res.json(operationJson(row));
}));
router.patch("/agro/fields/operations/:id/dispatch-rate", roles(["dispatcher", "general_director"]), safe(async (req, res) => {
  const params = UpdateFieldDispatchRateParams.safeParse(req.params);
  const input = body(UpdateFieldDispatchRateBody, req.body);
  requireValue(params.success && positiveId(params.data.id), "Выберите корректную операцию.");
  const by = actor(res.locals.access);
  const row = await mutate("Внесена фактическая расценка полевой операции", by, async (tx) => {
    const old = await getOperation(tx, params.data.id);
    revision(old, input.version);
    requireValue(!old.voidedAt && old.actualEnd !== null, "Расценку можно внести только по завершённой полевой операции.", 409);
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже включены в отправленный наряд. Изменять их исходные данные нельзя.", 409);
    const ratedAt = new Date();
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualRatePerHa: input.ratePerHa.toFixed(2),
      actualRateSetBy: by,
      actualRateSetAt: ratedAt,
      ...stamp(by, old.version),
    }).where(eq(fieldOperationsTable.id, old.id)).returning();
    return updated;
  });
  const updated = (await fieldDispatchRows()).find((item) => item.id === row.id);
  requireValue(updated, "Расценка сохранена, но операция не найдена в очереди диспетчера.", 500);
  res.json(UpdateFieldDispatchRateResponse.parse(updated));
}));
router.patch("/agro/fields/operations/:id/actual", roles(actualWriters), safe(async (req, res) => {
  const input = body(UpdateFieldOperationActualBody, req.body);
  const by = actor(res.locals.access);
  const today = grainBusinessDate();
  const row = await mutate("Внесён факт полевой операции", by, async (tx) => {
    const old = await getOperation(tx, Number(req.params.id)); revision(old, input.version);
    return startOrChangeFieldWork(tx, old, input, res.locals.access);
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.json(operationJson(row, today, progressReportsJson(progress)));
}));
router.post("/agro/fields/operations/:id/lifecycle", roles(["chief_agronomist", "agronomist", "dispatcher", "general_director"]), safe(async (req, res) => {
  const input = body(TransitionFieldOperationBody, req.body);
  const row = await mutate("Изменён этап полевой работы", actor(res.locals.access), async tx => {
    const old = await getOperation(tx, Number(req.params.id)); revision(old, input.version);
    return transitionFieldWork(tx, old, input, res.locals.access);
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.json(operationJson(row, grainBusinessDate(), progressReportsJson(progress)));
}));
router.post("/agro/fields/operations/:id/progress", roles(["dispatcher", "general_director"]), safe(async (req, res) => {
  const input = body(CreateFieldOperationProgressBody, req.body);
  const operationId = Number(req.params.id);
  requireValue(positiveId(operationId), "Выберите корректную операцию.");
  const by = actor(res.locals.access);
  const today = grainBusinessDate();
  const row = await mutate("Добавлен дневной отчёт по полевой операции", by, async (tx) => {
    const old = await getOperation(tx, operationId);
    revision(old, input.operationVersion);
    requireValue(!old.voidedAt && !old.actualEnd && !old.completionRequestedOn, "Отчёт недоступен: работа отменена, завершена или ожидает подтверждения завершения.", 409);
    const payrollThrough = await fieldPayrollLockedThrough(tx, old.id);
    requireValue(!payrollThrough || input.reportDate > payrollThrough,
      "За этот или последующий день уже сохранён зарплатный наряд. Можно добавить факт только за более поздний день.", 409);
    requireValue(old.actualStart !== null, "Сначала зафиксируйте начало операции.", 409);
    const confirmedThrough = await lastChemicalConfirmation(tx, old.id);
    requireValue(!confirmedThrough || input.reportDate > confirmedThrough,
      "За этот или последующий день уже подтверждён расход химии. Нельзя изменять дневной факт задним числом.", 409);
    requireValue(validGrainDate(input.reportDate) && input.reportDate >= old.actualStart && input.reportDate <= today, "Дата отчёта должна быть между началом операции и сегодняшним днём.");
    requireValue(old.actualMechanicEmployeeId && old.actualEquipment && old.actualImplement,
      "Агроном должен указать исполнителя, технику и агрегат.", 409);
    const [sameDay] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.operationId, old.id),
      eq(fieldOperationProgressTable.reportDate, input.reportDate),
    ));
    requireValue(!sameDay, "Отчёт за эту дату уже есть. Откройте его в истории и исправьте.", 409);
    const [previous] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.operationId, old.id),
      lt(fieldOperationProgressTable.reportDate, input.reportDate),
    )).orderBy(desc(fieldOperationProgressTable.reportDate)).limit(1);
    const [next] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.operationId, old.id),
      gt(fieldOperationProgressTable.reportDate, input.reportDate),
    )).orderBy(asc(fieldOperationProgressTable.reportDate)).limit(1);
    const areaAres = toAreaAres(input.cumulativeAreaHa, true);
    requireValue(areaAres !== null, "Укажите площадь с точностью до 0,01 га.");
    const progressError = validateFieldProgress(areaAres!, old.actualAreaLimitAres ?? old.plannedAreaAres, previous?.cumulativeAreaAres ?? null, next?.cumulativeAreaAres ?? null);
    requireValue(!progressError, progressError ?? "");
    await tx.insert(fieldOperationProgressTable).values({
      operationId: old.id, reportDate: input.reportDate, cumulativeAreaAres: areaAres!,
      actualRatePerHa: input.actualRatePerHa === undefined ? null : input.actualRatePerHa.toFixed(2),
      actualMechanic: old.actualMechanic, actualMechanicEmployeeId: old.actualMechanicEmployeeId, actualEquipment: old.actualEquipment,
      actualImplement: old.actualImplement, notes: input.notes.trim(), updatedBy: by,
    });
    const reports = await tx.select().from(fieldOperationProgressTable)
      .where(eq(fieldOperationProgressTable.operationId, old.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
    const latest = reports.at(-1)!;
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualAreaAres: latest.cumulativeAreaAres, ...stamp(by, old.version),
    }).where(and(eq(fieldOperationsTable.id, old.id), eq(fieldOperationsTable.version, old.version))).returning();
    requireValue(updated, "Операция была изменена. Обновите страницу и повторите.", 409);
    return updated;
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.status(201).json(operationJson(row, today, progressReportsJson(progress)));
}));
router.patch("/agro/fields/operations/:id/progress/:progressId", roles(["dispatcher", "general_director"]), safe(async (req, res) => {
  const input = body(UpdateFieldOperationProgressBody, req.body);
  const operationId = Number(req.params.id);
  const progressId = Number(req.params.progressId);
  requireValue(positiveId(operationId) && positiveId(progressId), "Выберите корректный дневной отчёт.");
  const by = actor(res.locals.access);
  const today = grainBusinessDate();
  const row = await mutate("Исправлен дневной отчёт по полевой операции", by, async (tx) => {
    const old = await getOperation(tx, operationId);
    revision(old, input.operationVersion);
    requireValue(!old.voidedAt && !old.actualEnd && !old.completionRequestedOn, "Отчёт недоступен: работа отменена, завершена или ожидает подтверждения завершения.", 409);
    const payrollThrough = await fieldPayrollLockedThrough(tx, old.id);
    requireValue(!payrollThrough || input.reportDate > payrollThrough,
      "За этот или последующий день уже сохранён зарплатный наряд. Ставка и площадь этой записи защищены от изменений.", 409);
    const [report] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.id, progressId),
      eq(fieldOperationProgressTable.operationId, old.id),
    ));
    requireValue(report, "Дневной отчёт не найден.", 404);
    revision(report, input.version);
    const confirmedThrough = await lastChemicalConfirmation(tx, old.id);
    requireValue(!confirmedThrough || report.reportDate > confirmedThrough
      || toAreaAres(input.cumulativeAreaHa, true) === report.cumulativeAreaAres,
      "По этому или последующему отчёту уже подтверждён расход химии. Площадь менять нельзя; примечание доступно.", 409);
    requireValue(input.reportDate === report.reportDate, "Дату существующего отчёта нельзя менять. Создайте запись за нужную дату.", 409);
    requireValue(validGrainDate(input.reportDate) && input.reportDate >= (old.actualStart ?? "") && input.reportDate <= today, "Дата отчёта должна быть между началом операции и сегодняшним днём.");
    const [previous] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.operationId, old.id),
      lt(fieldOperationProgressTable.reportDate, report.reportDate),
    )).orderBy(desc(fieldOperationProgressTable.reportDate)).limit(1);
    const [next] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.operationId, old.id),
      gt(fieldOperationProgressTable.reportDate, report.reportDate),
    )).orderBy(asc(fieldOperationProgressTable.reportDate)).limit(1);
    const areaAres = toAreaAres(input.cumulativeAreaHa, true);
    requireValue(areaAres !== null, "Укажите площадь с точностью до 0,01 га.");
    const progressError = validateFieldProgress(areaAres!, old.actualAreaLimitAres ?? old.plannedAreaAres, previous?.cumulativeAreaAres ?? null, next?.cumulativeAreaAres ?? null);
    requireValue(!progressError, progressError ?? "");
    await tx.update(fieldOperationProgressTable).set({
      cumulativeAreaAres: areaAres!,
      actualRatePerHa: input.actualRatePerHa === undefined ? report.actualRatePerHa : input.actualRatePerHa.toFixed(2),
      notes: input.notes.trim(), ...stamp(by, report.version),
    }).where(and(eq(fieldOperationProgressTable.id, report.id), eq(fieldOperationProgressTable.version, report.version)));
    const reports = await tx.select().from(fieldOperationProgressTable)
      .where(eq(fieldOperationProgressTable.operationId, old.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
    const latest = reports.at(-1)!;
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualAreaAres: latest.cumulativeAreaAres, ...stamp(by, old.version),
    }).where(and(eq(fieldOperationsTable.id, old.id), eq(fieldOperationsTable.version, old.version))).returning();
    requireValue(updated, "Операция была изменена. Обновите страницу и повторите.", 409);
    return updated;
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.json(operationJson(row, today, progressReportsJson(progress)));
}));
router.post("/agro/fields/operations/:id/void", roles(["general_director"]), safe(async (req, res) => {
  const input = body(VoidFieldOperationBody, req.body);
  requireValue(input.reason.trim().length >= 3, "Укажите причину отмены, не менее 3 символов.");
  const by = actor(res.locals.access);
  const row = await mutate("Отменена полевая операция", by, async (tx) => {
    const old = await getOperation(tx, Number(req.params.id)); revision(old, input.version);
    requireValue(!old.voidedAt, "Операция уже отменена.", 409);
    requireValue(!await chemicalIssuedForOperation(tx, old.id),
      "По операции выдана химия на баланс агронома. Отменять её без урегулирования выданной химии нельзя.", 409);
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже включены в отправленный наряд. Отмена недоступна.", 409);
    const [updated] = await tx.update(fieldOperationsTable).set({
      voidedAt: new Date(), voidReason: input.reason.trim(), voidedBy: by, ...stamp(by, old.version),
    }).where(and(eq(fieldOperationsTable.id, old.id), eq(fieldOperationsTable.version, old.version))).returning();
    return updated;
  });
  res.json(operationJson(row));
}));
export default router;
