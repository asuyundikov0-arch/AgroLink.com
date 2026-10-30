import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, agroFieldsTable, fieldOperationsTable, fieldSeasonsTable, supportingTasksTable, type SupportingService, type SupportingTaskDetails } from "@workspace/db";
import { CreateSupportingTaskBody, UpdateSupportingTaskBody, SendSupportingTaskBody, AcceptSupportingTaskBody, type SupportingTaskInput } from "@workspace/api-zod";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { validateSupportingWorks } from "../lib/field-supporting-works";
import { validGrainDate } from "../lib/grain-ledger";

const router: IRouter = Router();
const readers = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "motor_pool_manager", "fuel_manager", "general_director"];
const serviceOf: Record<string, SupportingService> = { grain_manager: "tok", weigher: "tok", motor_pool_manager: "motor_pool", fuel_manager: "fuel" };
const services: SupportingService[] = ["tok", "motor_pool", "fuel"];
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof supportingTasksTable.$inferSelect;
class TaskError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
function check(value: unknown, message: string, status = 400): asserts value {
  if (!value) throw new TaskError(message, status);
}
const editable = (a: RoleAccess, row?: Row) => a.role === "general_director" || (a.role === "agronomist" && (!row || row.createdByUserId === a.userId));
const serialize = (r: Row) => ({
  id: r.id, operationId: r.operationId, sourceIndex: r.sourceIndex, ...r.details, ...r.context,
  sourceSnapshot: r.sourceSnapshot, version: r.version, status: r.status, requestId: r.requestId,
  createdBy: r.createdBy, createdByUserId: r.createdByUserId, createdAt: r.createdAt.toISOString(),
  sentAt: r.sentAt?.toISOString() ?? null, deliveries: r.deliveries,
});
const idOf = (raw: unknown) => {
  const id = Number(raw);
  check(Number.isSafeInteger(id) && id > 0, "Некорректный номер задания.");
  return id;
};
async function context(tx: Tx, operationId: number, lock = false) {
  if (lock) await tx.execute(sql`select id from field_operations where id = ${operationId} for update`);
  const [r] = await tx.select({ op: fieldOperationsTable, season: fieldSeasonsTable, field: agroFieldsTable })
    .from(fieldOperationsTable).innerJoin(fieldSeasonsTable, eq(fieldOperationsTable.seasonId, fieldSeasonsTable.id))
    .innerJoin(agroFieldsTable, eq(fieldSeasonsTable.fieldId, agroFieldsTable.id)).where(eq(fieldOperationsTable.id, operationId));
  check(r, "Плановая операция не найдена.", 404);
  check(r.field.isActive && !r.op.isUnplanned && r.op.approvalStatus === "approved" &&
    !r.op.actualEnd && !r.op.voidedAt, "Задания доступны только для действующей плановой операции.", 409);
  return r;
}
async function details(tx: Tx, input: SupportingTaskInput, farm: string): Promise<SupportingTaskDetails> {
  check(Number.isSafeInteger(input.operationId) && Number.isSafeInteger(input.sourceIndex), "Некорректная ссылка на план.");
  check(validGrainDate(input.startDate) && validGrainDate(input.endDate) && input.startDate <= input.endDate, "Укажите корректные даты начала и окончания задания.");
  check(input.title.trim(), "Введите название задания.");
  check(input.services.length > 0 && new Set(input.services).size === input.services.length &&
    input.services.every((s) => services.includes(s)), "Выберите службы без повторений.");
  check(input.quantity === 0 || input.quantityUnit.trim(), "Укажите единицу объёма задания.");
  check(Math.abs(input.quantity * 1000 - Math.round(input.quantity * 1000)) < .00001, "Объём указывается до трёх знаков после запятой.");
  const [work] = await validateSupportingWorks(tx, [{
    name: input.title, equipmentId: input.equipmentId, employeeIds: input.employeeIds,
    salaryCost: input.salaryBudget, fuelCost: input.fuelBudget, seedName: "", seedQuantity: 0, seedUnit: "kg", seedPrice: 0,
  }], farm);
  return {
    title: work.name, startDate: input.startDate, endDate: input.endDate, equipmentId: work.equipmentId,
    equipmentName: work.equipmentName ?? "", employeeIds: work.employeeIds, employeeNames: work.employeeNames ?? [],
    salaryBudget: work.salaryCost, fuelBudget: work.fuelCost, quantity: input.quantity,
    quantityUnit: input.quantityUnit.trim(), notes: input.notes.trim(), services: input.services,
  };
}
function fingerprint(input: SupportingTaskInput) {
  const { operationId, sourceIndex, title, startDate, endDate, equipmentId, employeeIds, salaryBudget, fuelBudget, quantity, quantityUnit, notes, services: selected } = input;
  return createHash("sha256").update(JSON.stringify({ operationId, sourceIndex, title, startDate, endDate, equipmentId,
    employeeIds: [...employeeIds].sort((a, b) => a - b), salaryBudget, fuelBudget, quantity, quantityUnit, notes,
    services: [...selected].sort() })).digest("hex");
}
async function locked(tx: Tx, id: number) {
  const [r] = await tx.select().from(supportingTasksTable).where(eq(supportingTasksTable.id, id)).for("update");
  check(r, "Задание не найдено.", 404);
  return r;
}
router.use("/agro/supporting-tasks", requireApprovedRole, (_req, res, next) => {
  if (!readers.includes(res.locals.access.role)) { res.status(403).json({ error: "Нет доступа к заданиям службам." }); return; }
  next();
});
router.get("/agro/supporting-tasks", async (req, res, next) => {
  try {
    const access = res.locals.access as RoleAccess;
    const ownService = serviceOf[access.role ?? ""];
    const requestedService = req.query.service === undefined ? undefined : String(req.query.service) as SupportingService;
    check(!requestedService || services.includes(requestedService), "Неизвестная служба.");
    check(!ownService || !requestedService || ownService === requestedService, "Нет доступа к заданиям другой службы.", 403);
    const filters = [];
    if (req.query.operationId !== undefined) filters.push(eq(supportingTasksTable.operationId, idOf(req.query.operationId)));
    if (access.role === "agronomist") filters.push(eq(supportingTasksTable.createdByUserId, access.userId));
    const inbox = ownService ?? requestedService;
    if (inbox) {
      filters.push(eq(supportingTasksTable.status, "sent"));
      filters.push(sql`${supportingTasksTable.details}->'services' @> ${JSON.stringify([inbox])}::jsonb`);
    }
    const rows = await db.select().from(supportingTasksTable).where(and(...filters)).orderBy(desc(supportingTasksTable.id));
    res.json(rows.map(serialize));
  } catch (err) { next(err); }
});
router.post("/agro/supporting-tasks", async (req, res, next) => {
  try {
    const access = res.locals.access as RoleAccess;
    check(editable(access), "Создавать задания может агроном хозяйства.", 403);
    const parsed = CreateSupportingTaskBody.safeParse(req.body);
    check(parsed.success, "Проверьте обязательные поля задания.");
    const input = parsed.data!;
    const result = await db.transaction(async (tx) => {
      // Serialize retries for a single creator/request without imposing a global task lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${access.userId + ":" + input.requestId}))`);
      const [existing] = await tx.select().from(supportingTasksTable).where(and(eq(supportingTasksTable.createdByUserId, access.userId), eq(supportingTasksTable.requestId, input.requestId)));
      if (existing) {
        check(existing.createFingerprint === fingerprint(input), "Этот запрос уже использован для другого задания.", 409);
        return existing;
      }
      const r = await context(tx, input.operationId, true);
      check(Number.isSafeInteger(input.sourceIndex), "Выберите сопутствующую работу из плана.");
      const source = r.op.supportingWorks[input.sourceIndex];
      check(source, "Сопутствующая работа отсутствует в плане. Обновите список.", 409);
      const resolved = await details(tx, input, r.field.unit);
      const [created] = await tx.insert(supportingTasksTable).values({
        operationId: r.op.id, sourceIndex: input.sourceIndex, sourceSnapshot: source,
        context: { fieldId: r.field.id, fieldNumber: r.field.number, farm: r.field.unit, year: r.season.year, operationName: r.op.name },
        details: resolved, requestId: input.requestId, createFingerprint: fingerprint(input),
        createdByUserId: access.userId, createdBy: access.displayName,
      }).returning();
      return created;
    });
    res.status(201).json(serialize(result));
  } catch (err) { next(err); }
});
router.patch("/agro/supporting-tasks/:id", async (req, res, next) => {
  try {
    const access = res.locals.access as RoleAccess;
    const parsed = UpdateSupportingTaskBody.safeParse(req.body);
    check(parsed.success, "Проверьте поля и версию задания.");
    const input = parsed.data!;
    const result = await db.transaction(async (tx) => {
      const row = await locked(tx, idOf(req.params.id));
      check(editable(access, row), "Нельзя изменять чужое задание.", 403);
      check(row.status === "draft", "Отправленное задание изменять нельзя.", 409);
      check(row.version === input.version, "Задание изменилось. Обновите страницу.", 409);
      check(input.operationId === row.operationId && input.sourceIndex === row.sourceIndex, "Поле, операция и источник задания не изменяются.");
      await context(tx, row.operationId, true);
      const resolved = await details(tx, input, row.context.farm);
      const [updated] = await tx.update(supportingTasksTable).set({ details: resolved, version: row.version + 1 }).where(eq(supportingTasksTable.id, row.id)).returning();
      return updated;
    });
    res.json(serialize(result));
  } catch (err) { next(err); }
});
router.post("/agro/supporting-tasks/:id/send", async (req, res, next) => {
  try {
    const access = res.locals.access as RoleAccess;
    const parsed = SendSupportingTaskBody.safeParse(req.body);
    check(parsed.success && Number.isSafeInteger(parsed.data.version), "Обновите версию задания.");
    const result = await db.transaction(async (tx) => {
      const row = await locked(tx, idOf(req.params.id));
      check(editable(access, row), "Отправлять задания может их автор.", 403);
      if (row.status === "sent") return row; // Idempotent retry: deliveries are never re-created.
      check(row.version === parsed.data!.version, "Задание изменилось. Обновите страницу.", 409);
      await context(tx, row.operationId, true);
      // Recheck active directory resources before dispatch, without changing the immutable plan snapshot.
      await details(tx, { operationId: row.operationId, sourceIndex: row.sourceIndex, ...row.details }, row.context.farm);
      const [updated] = await tx.update(supportingTasksTable).set({
        status: "sent", sentAt: new Date(), version: row.version + 1,
        deliveries: row.details.services.map((service) => ({ service, status: "sent" as const, acceptedBy: "", acceptedAt: null })),
      }).where(eq(supportingTasksTable.id, row.id)).returning();
      return updated;
    });
    res.json(serialize(result));
  } catch (err) { next(err); }
});
router.post("/agro/supporting-tasks/:id/accept", async (req, res, next) => {
  try {
    const access = res.locals.access as RoleAccess;
    const parsed = AcceptSupportingTaskBody.safeParse(req.body);
    check(parsed.success && Number.isSafeInteger(parsed.data.version), "Выберите службу и версию задания.");
    const { service, version } = parsed.data!;
    check(access.role === "general_director" || (access.role !== "weigher" && serviceOf[access.role ?? ""] === service), "Принять задание может руководитель соответствующей службы.", 403);
    const result = await db.transaction(async (tx) => {
      const row = await locked(tx, idOf(req.params.id));
      check(row.status === "sent" && row.details.services.includes(service), "Задание не направлено выбранной службе.", 403);
      const delivery = row.deliveries.find((d) => d.service === service);
      check(delivery, "Получатель задания не найден.", 409);
      if (delivery.status === "accepted") return row;
      check(row.version === version, "Статус задания изменился. Обновите список.", 409);
      const [updated] = await tx.update(supportingTasksTable).set({
        version: row.version + 1,
        deliveries: row.deliveries.map((d) => d.service === service ? { ...d, status: "accepted" as const, acceptedBy: access.displayName, acceptedAt: new Date().toISOString() } : d),
      }).where(eq(supportingTasksTable.id, row.id)).returning();
      return updated;
    });
    res.json(serialize(result));
  } catch (err) { next(err); }
});
router.use("/agro/supporting-tasks", (err: unknown, _req: unknown, res: import("express").Response, next: import("express").NextFunction) => {
  if (err instanceof TaskError || (err instanceof Error && "status" in err)) {
    const status = Number((err as { status: unknown }).status);
    res.status(status >= 400 && status < 600 ? status : 400).json({ error: (err as Error).message });
  } else next(err);
});
export default router;
