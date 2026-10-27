import { Router, type IRouter, type RequestHandler } from "express";
import { and, asc, desc, eq, gt, isNotNull, isNull, lt, sql } from "drizzle-orm";
import {
  CreateAgroFieldBody, UpdateAgroFieldBody, CreateFieldSeasonBody, UpdateFieldSeasonBody,
  CreateFieldOperationBody, UpdateFieldOperationBody, UpdateFieldOperationActualBody, CreateFieldOperationProgressBody, UpdateFieldOperationProgressBody, VoidFieldOperationBody,
  GetFieldDashboardResponse, GetFieldDispatchQueueResponse, UpdateFieldDispatchRateBody, UpdateFieldDispatchRateParams, UpdateFieldDispatchRateResponse,
  CreateAgroFieldResponse, CreateFieldSeasonResponse, CreateFieldOperationResponse,
  type FieldProgressReport, type FieldOperationInput,
} from "@workspace/api-zod";
import { activityTable, agroFieldsTable, employeesTable, fleetEquipmentTable, fieldSeasonsTable, fieldOperationsTable, fieldOperationProgressTable, grainCropsTable, db } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { grainBusinessDate, validGrainDate } from "../lib/grain-ledger";
import { fieldNumberKey, fieldOperationState, progressDeltaAres, toAreaAres, validateFieldActual, validateFieldPlan, validateFieldProgress } from "../lib/field-planning";
import { fieldPayrollWasSubmitted, lockPayrollSources } from "../lib/payroll-source-guard";
import { fieldOperationSuggestions } from "../lib/field-operation-catalog";

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
    if (err instanceof FieldError) { res.status(err.status).json({ error: err.message }); return; }
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
      dailyAreaHa: dailyAres / 100, actualMechanic: row.actualMechanic, actualMechanicEmployeeId: row.actualMechanicEmployeeId, actualEquipment: row.actualEquipment,
      actualImplement: row.actualImplement, notes: row.notes, version: row.version, updatedBy: row.updatedBy,
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}
function operationJson(row: typeof fieldOperationsTable.$inferSelect, today = grainBusinessDate(), progressReports: FieldProgressReport[] = []) {
  const { nameKey: _key, plannedAreaAres, actualAreaAres, plannedRatePerHa, actualRatePerHa, actualRateSetAt, ...rest } = row;
  const plannedAreaHa = plannedAreaAres / 100;
  const actualAreaHa = actualAreaAres / 100;
  const plannedRate = Number(plannedRatePerHa);
  const actualRate = actualRatePerHa === null ? null : Number(actualRatePerHa);
  return CreateFieldOperationResponse.parse({
    ...rest, ...fieldOperationState(row, today), plannedAreaHa, actualAreaHa,
    plannedRatePerHa: plannedRate,
    plannedPayAmount: Math.round((plannedAreaHa * plannedRate + Number.EPSILON) * 100) / 100,
    actualRatePerHa: actualRate,
    actualPayAmount: actualRate === null ? null : Math.round((actualAreaHa * actualRate + Number.EPSILON) * 100) / 100,
    actualRateSetAt: actualRateSetAt?.toISOString() ?? null,
    progressReports,
    voidedAt: row.voidedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
  });
}
async function fieldDispatchRows() {
  const rows = await db.select({ operation: fieldOperationsTable, season: fieldSeasonsTable, field: agroFieldsTable })
    .from(fieldOperationsTable)
    .innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
    .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id))
    .where(and(isNotNull(fieldOperationsTable.actualEnd), isNull(fieldOperationsTable.voidedAt)))
    .orderBy(desc(fieldOperationsTable.actualEnd), desc(fieldOperationsTable.id));
  return GetFieldDispatchQueueResponse.parse(rows.map(({ operation, season, field }) => {
    const actualAreaHa = operation.actualAreaAres / 100;
    const actualRatePerHa = operation.actualRatePerHa === null ? null : Number(operation.actualRatePerHa);
    return {
      id: operation.id,
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
    const [created] = await tx.insert(fieldOperationsTable).values({
      seasonId: season.id, ...resources, plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd, plannedAreaAres: toAreaAres(input.plannedAreaHa)!, plannedRatePerHa: input.plannedRatePerHa.toFixed(2),
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
    requireValue(!old.voidedAt, "Отменённую операцию нельзя редактировать.", 409);
    const season = await getSeason(tx, input.seasonId);
    requireValue(input.plannedRatePerHa > 0 && input.plannedRatePerHa <= 1_000_000_000, "Укажите положительную плановую расценку за гектар.");
    const error = validateFieldPlan(input, season.areaAres); requireValue(!error, error ?? "");
    requireValue(!old.actualStart || (old.seasonId === input.seasonId && old.nameKey === fieldNumberKey(input.name)), "После начала работ нельзя переносить операцию на другое поле или менять её вид.", 409);
    if (input.seasonId !== old.seasonId) requireValue((await getField(tx, season.fieldId)).isActive, "Нельзя переносить работу на архивное поле.", 409);
    requireValue(toAreaAres(input.plannedAreaHa)! >= old.actualAreaAres, "Плановая площадь меньше уже выполненной.", 409);
    const resources = await plannedResources(tx, input, (await getField(tx, season.fieldId)).unit, old);
    const [updated] = await tx.update(fieldOperationsTable).set({
      seasonId: season.id, ...resources, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
      plannedAreaAres: toAreaAres(input.plannedAreaHa)!,
      plannedRatePerHa: input.plannedRatePerHa.toFixed(2),
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
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже отправлены экономисту. Изменять их исходные данные нельзя.", 409);
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
    requireValue(!old.voidedAt, "Отменённая операция недоступна для внесения факта.", 409);
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже отправлены экономисту. Изменять факт нельзя.", 409);
    const mechanic = input.actualStart ? await selectedMechanic(tx, input.actualMechanicEmployeeId) : null;
    const progressRows = await tx.select().from(fieldOperationProgressTable)
      .where(eq(fieldOperationProgressTable.operationId, old.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
    const latestProgress = progressRows.at(-1);
    const error = validateFieldActual(input, old.plannedAreaAres, today, old.actualStart !== null); requireValue(!error, error ?? "");
    requireValue(!old.actualStart || input.actualStart !== null || res.locals.access.role === "general_director", "Сбросить уже внесённый факт может только генеральный директор.", 403);
    if (input.actualEnd) {
      const areaAres = toAreaAres(input.actualAreaHa, true)!;
      requireValue(!latestProgress || input.actualEnd >= latestProgress.reportDate, "Дата завершения не может быть раньше последнего дневного отчёта.", 409);
      const previous = progressRows.filter((item) => item.reportDate < input.actualEnd!).at(-1);
      const progressError = validateFieldProgress(areaAres, old.plannedAreaAres, previous?.cumulativeAreaAres ?? null, null);
      requireValue(!progressError, progressError ?? "");
    }
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualStart: input.actualStart, actualEnd: input.actualEnd, actualAreaAres: toAreaAres(input.actualAreaHa, true)!,
      actualOperationName: input.actualOperationName.trim(), actualMechanic: mechanic?.fullName ?? "",
      actualMechanicEmployeeId: mechanic?.id ?? null,
      actualEquipment: input.actualEquipment.trim(), actualImplement: input.actualImplement.trim(),
      actualNotes: input.actualNotes.trim(), ...stamp(by, old.version),
    }).where(eq(fieldOperationsTable.id, old.id)).returning();
    if (input.actualEnd) {
      const areaAres = toAreaAres(input.actualAreaHa, true)!;
      const onFinishDate = progressRows.find((item) => item.reportDate === input.actualEnd);
      const finalProgress = {
        cumulativeAreaAres: areaAres, actualMechanic: mechanic!.fullName,
        actualMechanicEmployeeId: mechanic!.id,
        actualEquipment: input.actualEquipment.trim(), actualImplement: input.actualImplement.trim(),
        notes: input.actualNotes.trim(), updatedBy: by, updatedAt: new Date(),
      };
      if (onFinishDate) {
        await tx.update(fieldOperationProgressTable).set({ ...finalProgress, version: onFinishDate.version + 1 })
          .where(eq(fieldOperationProgressTable.id, onFinishDate.id));
      } else {
        await tx.insert(fieldOperationProgressTable).values({
          operationId: old.id, reportDate: input.actualEnd, ...finalProgress, version: 1,
        });
      }
    }
    return updated;
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.json(operationJson(row, today, progressReportsJson(progress)));
}));
router.post("/agro/fields/operations/:id/progress", roles(actualWriters), safe(async (req, res) => {
  const input = body(CreateFieldOperationProgressBody, req.body);
  const operationId = Number(req.params.id);
  requireValue(positiveId(operationId), "Выберите корректную операцию.");
  const by = actor(res.locals.access);
  const today = grainBusinessDate();
  const row = await mutate("Добавлен дневной отчёт по полевой операции", by, async (tx) => {
    const old = await getOperation(tx, operationId);
    revision(old, input.operationVersion);
    requireValue(!old.voidedAt && !old.actualEnd, "Отчёт недоступен для отменённой или завершённой операции.", 409);
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже отправлены экономисту. Изменять дневные отчёты нельзя.", 409);
    requireValue(old.actualStart !== null, "Сначала зафиксируйте начало операции.", 409);
    requireValue(validGrainDate(input.reportDate) && input.reportDate >= old.actualStart && input.reportDate <= today, "Дата отчёта должна быть между началом операции и сегодняшним днём.");
    requireValue(input.actualMechanic.trim() && input.actualEquipment.trim() && input.actualImplement.trim(), "Укажите механизатора, технику и агрегат.");
    const mechanic = await selectedMechanic(tx, input.actualMechanicEmployeeId);
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
    const progressError = validateFieldProgress(areaAres!, old.plannedAreaAres, previous?.cumulativeAreaAres ?? null, next?.cumulativeAreaAres ?? null);
    requireValue(!progressError, progressError ?? "");
    await tx.insert(fieldOperationProgressTable).values({
      operationId: old.id, reportDate: input.reportDate, cumulativeAreaAres: areaAres!,
      actualMechanic: mechanic.fullName, actualMechanicEmployeeId: mechanic.id, actualEquipment: input.actualEquipment.trim(),
      actualImplement: input.actualImplement.trim(), notes: input.notes.trim(), updatedBy: by,
    });
    const reports = await tx.select().from(fieldOperationProgressTable)
      .where(eq(fieldOperationProgressTable.operationId, old.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
    const latest = reports.at(-1)!;
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualAreaAres: latest.cumulativeAreaAres, actualMechanic: latest.actualMechanic, actualMechanicEmployeeId: latest.actualMechanicEmployeeId,
      actualEquipment: latest.actualEquipment, actualImplement: latest.actualImplement,
      actualNotes: latest.notes, ...stamp(by, old.version),
    }).where(and(eq(fieldOperationsTable.id, old.id), eq(fieldOperationsTable.version, old.version))).returning();
    requireValue(updated, "Операция была изменена. Обновите страницу и повторите.", 409);
    return updated;
  });
  const progress = await db.select().from(fieldOperationProgressTable)
    .where(eq(fieldOperationProgressTable.operationId, row.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
  res.status(201).json(operationJson(row, today, progressReportsJson(progress)));
}));
router.patch("/agro/fields/operations/:id/progress/:progressId", roles(actualWriters), safe(async (req, res) => {
  const input = body(UpdateFieldOperationProgressBody, req.body);
  const operationId = Number(req.params.id);
  const progressId = Number(req.params.progressId);
  requireValue(positiveId(operationId) && positiveId(progressId), "Выберите корректный дневной отчёт.");
  const by = actor(res.locals.access);
  const today = grainBusinessDate();
  const row = await mutate("Исправлен дневной отчёт по полевой операции", by, async (tx) => {
    const old = await getOperation(tx, operationId);
    revision(old, input.operationVersion);
    requireValue(!old.voidedAt && !old.actualEnd, "Отчёт недоступен для отменённой или завершённой операции.", 409);
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже отправлены экономисту. Изменять дневные отчёты нельзя.", 409);
    const [report] = await tx.select().from(fieldOperationProgressTable).where(and(
      eq(fieldOperationProgressTable.id, progressId),
      eq(fieldOperationProgressTable.operationId, old.id),
    ));
    requireValue(report, "Дневной отчёт не найден.", 404);
    revision(report, input.version);
    requireValue(input.reportDate === report.reportDate, "Дату существующего отчёта нельзя менять. Создайте запись за нужную дату.", 409);
    requireValue(validGrainDate(input.reportDate) && input.reportDate >= (old.actualStart ?? "") && input.reportDate <= today, "Дата отчёта должна быть между началом операции и сегодняшним днём.");
    requireValue(input.actualMechanic.trim() && input.actualEquipment.trim() && input.actualImplement.trim(), "Укажите механизатора, технику и агрегат.");
    const mechanic = await selectedMechanic(tx, input.actualMechanicEmployeeId);
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
    const progressError = validateFieldProgress(areaAres!, old.plannedAreaAres, previous?.cumulativeAreaAres ?? null, next?.cumulativeAreaAres ?? null);
    requireValue(!progressError, progressError ?? "");
    await tx.update(fieldOperationProgressTable).set({
      cumulativeAreaAres: areaAres!, actualMechanic: mechanic.fullName, actualMechanicEmployeeId: mechanic.id,
      actualEquipment: input.actualEquipment.trim(), actualImplement: input.actualImplement.trim(),
      notes: input.notes.trim(), ...stamp(by, report.version),
    }).where(and(eq(fieldOperationProgressTable.id, report.id), eq(fieldOperationProgressTable.version, report.version)));
    const reports = await tx.select().from(fieldOperationProgressTable)
      .where(eq(fieldOperationProgressTable.operationId, old.id)).orderBy(asc(fieldOperationProgressTable.reportDate));
    const latest = reports.at(-1)!;
    const [updated] = await tx.update(fieldOperationsTable).set({
      actualAreaAres: latest.cumulativeAreaAres, actualMechanic: latest.actualMechanic, actualMechanicEmployeeId: latest.actualMechanicEmployeeId,
      actualEquipment: latest.actualEquipment, actualImplement: latest.actualImplement,
      actualNotes: latest.notes, ...stamp(by, old.version),
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
    requireValue(!await fieldPayrollWasSubmitted(tx, old.id), "Начисления по операции уже отправлены экономисту. Отмена недоступна.", 409);
    const [updated] = await tx.update(fieldOperationsTable).set({
      voidedAt: new Date(), voidReason: input.reason.trim(), voidedBy: by, ...stamp(by, old.version),
    }).where(and(eq(fieldOperationsTable.id, old.id), eq(fieldOperationsTable.version, old.version))).returning();
    return updated;
  });
  res.json(operationJson(row));
}));
export default router;
