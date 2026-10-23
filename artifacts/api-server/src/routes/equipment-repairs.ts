import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateEngineeringRepairBody, CreateRepairPlanBatchBody, UpdateEngineeringRepairBody,
  CreateFleetEquipmentBody, UpdateFleetEquipmentBody, CreateRepairExpenseBody, UpdateRepairExpenseBody,
  ListEngineeringRepairsQueryParams, ListRepairExpensesQueryParams,
  ListEngineeringRepairsResponse, type PlanInput, type RepairEntry, type RepairInput,
} from "@workspace/api-zod";
import { activityTable, db, equipmentRepairsTable, fleetEquipmentTable, repairExpensesTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { calculateRepair, repairBusinessDate, summarizeRepairs, validRepairDate, validateRepairInput } from "../lib/repair-calculations";
import { ledgerTotals, registrationKey } from "../lib/repair-ledger";

const router: IRouter = Router();
const protect: RequestHandler = (_req, res, next) => {
  const role = (res.locals.access as RoleAccess).role;
  if (!["engineer", "chief_engineer", "general_director"].includes(role ?? "")) {
    res.status(403).json({ error: "Раздел доступен только инженерной службе и генеральному директору." });
    return;
  }
  next();
};
for (const path of ["/engineering/repairs", "/engineering/expenses", "/engineering/repair-plan"]) {
  router.use(path, requireApprovedRole, protect);
}
router.use("/engineering/fleet", requireApprovedRole);
const fleetReaders = new Set([
  "engineer", "chief_engineer", "general_director",
  "agronomist", "chief_agronomist", "farm_director", "economist",
]);
const canReadFleet: RequestHandler = (_req, res, next) => {
  if (!fleetReaders.has((res.locals.access as RoleAccess).role ?? "")) {
    res.status(403).json({ error: "Нет доступа к справочнику техники." });
    return;
  }
  next();
};
const chiefOnly: RequestHandler = (_req, res, next) => {
  if (!["chief_engineer", "general_director"].includes(res.locals.access.role)) {
    res.status(403).json({ error: "Справочник техники ведёт главный инженер или генеральный директор." }); return;
  }
  next();
};
const directorOnly: RequestHandler = (_req, res, next) => {
  if (res.locals.access.role !== "general_director") {
    res.status(403).json({ error: "Удаление доступно только генеральному директору." }); return;
  }
  next();
};
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
const positiveId = (value: unknown) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function activity(tx: Tx, action: string, name: string, by: string) {
  await tx.insert(activityTable).values({ action, templateName: name, userName: by });
}
// Translate only expected constraint failures; let the central error handler log unexpected failures.
const safe = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (err) {
    const error = err as { code?: string; cause?: { code?: string } };
    const code = error.code ?? error.cause?.code;
    if (code === "23505") { res.status(409).json({ error: "Такой госномер уже есть в справочнике или техника уже добавлена в план." }); return; }
    if (code === "23503") { res.status(409).json({ error: "Техника используется в плане или расходах. Сначала проверьте связанные записи." }); return; }
    next(err);
  }
};
function fleetJson(row: typeof fleetEquipmentTable.$inferSelect) {
  const { registrationKey: _key, ...rest } = row;
  return { ...rest, updatedAt: row.updatedAt.toISOString() };
}
const expenseJson = (row: typeof repairExpensesTable.$inferSelect) => ({
  ...row, amount: Number(row.amount), updatedAt: row.updatedAt.toISOString(),
});

async function repairEntries(tx: Tx | typeof db = db): Promise<RepairEntry[]> {
  const rows = await tx.select({ plan: equipmentRepairsTable, fleet: fleetEquipmentTable })
    .from(equipmentRepairsTable).innerJoin(fleetEquipmentTable, eq(equipmentRepairsTable.fleetId, fleetEquipmentTable.id))
    .orderBy(desc(equipmentRepairsTable.updatedAt), desc(equipmentRepairsTable.id));
  const expenses = await tx.select().from(repairExpensesTable);
  const today = repairBusinessDate();
  return rows.map(({ plan, fleet }) => {
    const input: RepairInput = {
      equipment: fleet.kind, responsible: plan.responsible, unit: fleet.unit as RepairInput["unit"],
      plannedStart: plan.plannedStart, plannedEnd: plan.plannedEnd,
      actualStart: plan.actualStart, actualEnd: plan.actualEnd,
      readiness: plan.readiness === null ? null : Number(plan.readiness), notes: plan.notes,
      ...ledgerTotals(expenses.filter((expense) => expense.fleetId === fleet.id)),
    };
    return { ...input, ...calculateRepair(input, today),
      id: plan.id, fleetId: fleet.id, registrationNumber: fleet.registrationNumber,
      version: plan.version, createdBy: plan.createdBy, updatedBy: plan.updatedBy,
      updatedAt: plan.updatedAt.toISOString(),
    };
  });
}
function planError(input: PlanInput) {
  if (!positiveId(input.fleetId)) return "Выберите технику из справочника.";
  return validateRepairInput({
    ...input, equipment: "Выбрана из справочника", unit: "АПК Арыстан Grain",
    capitalCost: null, currentCost: null, tiresCost: null, oilsCost: null, serviceCost: null,
  });
}
async function planValues(input: PlanInput, tx: Tx, by: string) {
  const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, input.fleetId));
  if (!fleet) return null;
  return {
    fleetId: fleet.id, equipment: fleet.kind, unit: fleet.unit,
    responsible: input.responsible.trim(), plannedStart: input.plannedStart, plannedEnd: input.plannedEnd,
    actualStart: input.actualStart, actualEnd: input.actualEnd,
    readiness: input.actualEnd ? "100.00" : input.readiness?.toFixed(2) ?? null,
    notes: input.notes.trim(), updatedBy: by,
  };
}

router.get("/engineering/fleet", canReadFleet, safe(async (_req, res) => {
  const rows = await db.select().from(fleetEquipmentTable).orderBy(fleetEquipmentTable.kind, fleetEquipmentTable.id);
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(fleetJson));
}));
router.post("/engineering/fleet", protect, chiefOnly, safe(async (req, res) => {
  const parsed = CreateFleetEquipmentBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.kind.trim() || !registrationKey(parsed.data.registrationNumber)) {
    res.status(400).json({ error: "Укажите вид техники, госномер и хозяйство." }); return;
  }
  const by = actor(res.locals.access);
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(fleetEquipmentTable).values({
      ...parsed.data, kind: parsed.data.kind.trim(), registrationNumber: parsed.data.registrationNumber.trim().toUpperCase(),
      registrationKey: registrationKey(parsed.data.registrationNumber), updatedBy: by,
    }).returning();
    await activity(tx, "Добавлена техника", created.kind, by);
    return created;
  });
  res.status(201).json(fleetJson(row));
}));
router.put("/engineering/fleet/:id", protect, chiefOnly, safe(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = UpdateFleetEquipmentBody.safeParse(req.body);
  if (!id || !parsed.success || !positiveId(parsed.data.version) || !parsed.data.kind.trim() || !registrationKey(parsed.data.registrationNumber)) {
    res.status(400).json({ error: "Проверьте вид техники, госномер, хозяйство и версию." }); return;
  }
  const by = actor(res.locals.access);
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(fleetEquipmentTable).set({
      kind: parsed.data.kind.trim(), registrationNumber: parsed.data.registrationNumber.trim().toUpperCase(),
      registrationKey: registrationKey(parsed.data.registrationNumber), unit: parsed.data.unit,
      version: parsed.data.version + 1, updatedBy: by, updatedAt: new Date(),
    }).where(and(eq(fleetEquipmentTable.id, id), eq(fleetEquipmentTable.version, parsed.data.version))).returning();
    if (updated) await activity(tx, "Обновлена техника", updated.kind, by);
    return updated;
  });
  if (!row) { res.status(409).json({ error: "Запись изменена или удалена. Загрузите актуальный справочник." }); return; }
  res.json(fleetJson(row));
}));
router.delete("/engineering/fleet/:id", protect, directorOnly, safe(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) { res.status(400).json({ error: "Некорректная техника." }); return; }
  const row = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, id)).returning();
    if (deleted) await activity(tx, "Удалена техника", deleted.kind, actor(res.locals.access));
    return deleted;
  });
  if (!row) { res.status(404).json({ error: "Техника не найдена." }); return; }
  res.status(204).send();
}));

router.get("/engineering/repairs", safe(async (req, res) => {
  const query = ListEngineeringRepairsQueryParams.safeParse(req.query);
  if (!query.success) { res.status(400).json({ error: "Выберите корректное хозяйство." }); return; }
  const items = (await repairEntries()).filter((item) => !query.data.unit || item.unit === query.data.unit);
  res.setHeader("Cache-Control", "no-store");
  res.json(ListEngineeringRepairsResponse.parse({
    items, summary: summarizeRepairs(items), asOfDate: repairBusinessDate(), currency: "KZT",
  }));
}));
async function createPlans(inputs: PlanInput[], by: string) {
  return db.transaction(async (tx) => {
    const values = [];
    for (const input of inputs) {
      const value = await planValues(input, tx, by);
      if (!value) return null;
      values.push({ ...value, createdBy: by });
    }
    const created = await tx.insert(equipmentRepairsTable).values(values).returning();
    await activity(tx, "Техника добавлена в общий план ремонта", `${values.length} ед.`, by);
    const ids = new Set(created.map((row) => row.id));
    return (await repairEntries(tx)).filter((row) => ids.has(row.id));
  });
}
router.post("/engineering/repairs", safe(async (req, res) => {
  const parsed = CreateEngineeringRepairBody.safeParse(req.body);
  const error = parsed.success ? planError(parsed.data) : "Проверьте поля плана.";
  if (!parsed.success || error) { res.status(400).json({ error }); return; }
  const rows = await createPlans([parsed.data], actor(res.locals.access));
  if (!rows) { res.status(404).json({ error: "Выбранная техника не найдена." }); return; }
  res.status(201).json(rows[0]);
}));
router.post("/engineering/repair-plan/batch", safe(async (req, res) => {
  const parsed = CreateRepairPlanBatchBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Добавьте от 1 до 100 корректно заполненных строк." }); return; }
  const error = parsed.data.items.map(planError).find(Boolean);
  if (error || new Set(parsed.data.items.map((item) => item.fleetId)).size !== parsed.data.items.length) {
    res.status(400).json({ error: error ?? "Одна техника не должна повторяться в плане." }); return;
  }
  const rows = await createPlans(parsed.data.items, actor(res.locals.access));
  if (!rows) { res.status(404).json({ error: "Одна из выбранных машин уже удалена. Обновите справочник." }); return; }
  res.status(201).json(rows);
}));
router.put("/engineering/repairs/:id", safe(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = UpdateEngineeringRepairBody.safeParse(req.body);
  if (!id || !parsed.success || !positiveId(parsed.data.version)) { res.status(400).json({ error: "Проверьте поля плана и версию." }); return; }
  const error = planError(parsed.data);
  if (error) { res.status(400).json({ error }); return; }
  const updated = await db.transaction(async (tx) => {
    const values = await planValues(parsed.data, tx, actor(res.locals.access));
    if (!values) return null;
    const [row] = await tx.update(equipmentRepairsTable).set({
      ...values, version: parsed.data.version + 1, updatedAt: new Date(),
    }).where(and(eq(equipmentRepairsTable.id, id), eq(equipmentRepairsTable.version, parsed.data.version),
      eq(equipmentRepairsTable.fleetId, parsed.data.fleetId))).returning();
    if (row) await activity(tx, "Обновлён план / факт ремонта", row.equipment, actor(res.locals.access));
    return row ? (await repairEntries(tx)).find((item) => item.id === row.id) : null;
  });
  if (!updated) { res.status(409).json({ error: "Запись изменена или удалена. Обновите план; выбранную технику менять нельзя." }); return; }
  res.json(updated);
}));
router.delete("/engineering/repairs/:id", directorOnly, safe(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) { res.status(400).json({ error: "Некорректная строка плана." }); return; }
  const row = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(equipmentRepairsTable).where(eq(equipmentRepairsTable.id, id)).returning();
    if (deleted) await activity(tx, "Техника исключена из плана (расходы сохранены)", deleted.equipment, actor(res.locals.access));
    return deleted;
  });
  if (!row) { res.status(404).json({ error: "Строка плана не найдена." }); return; }
  res.status(204).send();
}));

function expenseError(input: { fleetId: number; amount: number; incurredOn: string }) {
  if (!positiveId(input.fleetId)) return "Выберите технику из справочника.";
  if (!validRepairDate(input.incurredOn) || input.incurredOn > repairBusinessDate()) return "Укажите корректную дату расхода, не позднее сегодняшней.";
  if (!Number.isFinite(input.amount) || Number(input.amount.toFixed(2)) !== input.amount) return "Сумма должна содержать не более двух знаков после запятой.";
  return null;
}
router.get("/engineering/expenses", safe(async (req, res) => {
  const query = ListRepairExpensesQueryParams.safeParse(req.query);
  if (!query.success || (query.data.fleetId !== undefined && !positiveId(query.data.fleetId))) {
    res.status(400).json({ error: "Некорректная техника." }); return;
  }
  const rows = await db.select().from(repairExpensesTable)
    .where(query.data.fleetId ? eq(repairExpensesTable.fleetId, query.data.fleetId) : undefined)
    .orderBy(desc(repairExpensesTable.incurredOn), desc(repairExpensesTable.id));
  res.setHeader("Cache-Control", "no-store"); res.json(rows.map(expenseJson));
}));
router.post("/engineering/expenses", safe(async (req, res) => {
  const parsed = CreateRepairExpenseBody.safeParse(req.body);
  const error = parsed.success ? expenseError(parsed.data) : "Проверьте поля расхода и положительную сумму.";
  if (!parsed.success || error) { res.status(400).json({ error }); return; }
  const row = await db.transaction(async (tx) => {
    const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, parsed.data.fleetId));
    if (!fleet) return null;
    const [created] = await tx.insert(repairExpensesTable).values({
      ...parsed.data, amount: parsed.data.amount.toFixed(2), description: parsed.data.description.trim(),
      updatedBy: actor(res.locals.access),
    }).returning();
    await activity(tx, "Добавлен расход на технику", `${fleet.kind} · ${fleet.registrationNumber ?? "номер не указан"}`, actor(res.locals.access));
    return created;
  });
  if (!row) { res.status(404).json({ error: "Техника не найдена." }); return; }
  res.status(201).json(expenseJson(row));
}));
router.put("/engineering/expenses/:id", safe(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = UpdateRepairExpenseBody.safeParse(req.body);
  if (!id || !parsed.success || !positiveId(parsed.data.version)) { res.status(400).json({ error: "Проверьте поля расхода и версию." }); return; }
  const error = expenseError(parsed.data);
  if (error) { res.status(400).json({ error }); return; }
  const row = await db.transaction(async (tx) => {
    const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, parsed.data.fleetId));
    if (!fleet) return null;
    const [updated] = await tx.update(repairExpensesTable).set({
      ...parsed.data, amount: parsed.data.amount.toFixed(2), description: parsed.data.description.trim(),
      version: parsed.data.version + 1, updatedBy: actor(res.locals.access), updatedAt: new Date(),
    }).where(and(eq(repairExpensesTable.id, id), eq(repairExpensesTable.version, parsed.data.version))).returning();
    if (updated) await activity(tx, "Исправлен расход на технику", fleet.kind, actor(res.locals.access));
    return updated;
  });
  if (!row) { res.status(409).json({ error: "Расход или техника изменены / удалены. Загрузите актуальные данные перед исправлением." }); return; }
  res.json(expenseJson(row));
}));
router.delete("/engineering/expenses/:id", directorOnly, safe(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) { res.status(400).json({ error: "Некорректный расход." }); return; }
  const row = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(repairExpensesTable).where(eq(repairExpensesTable.id, id)).returning();
    if (deleted) await activity(tx, "Удалён расход на технику", `Расход ${deleted.id}`, actor(res.locals.access));
    return deleted;
  });
  if (!row) { res.status(404).json({ error: "Расход не найден." }); return; }
  res.status(204).send();
}));
export default router;
