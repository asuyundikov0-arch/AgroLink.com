import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  CreateEngineeringRepairBody, CreateRepairPlanBatchBody, UpdateEngineeringRepairBody,
  CreateFleetEquipmentBody, UpdateFleetEquipmentBody, UpdateRepairExpenseBody,
  CreateEngineeringSparePartReceiptBody, CreateEngineeringSparePartIssueBody,
  ListEngineeringRepairsQueryParams, ListRepairExpensesQueryParams,
  ListEngineeringRepairsResponse, type PlanInput, type RepairEntry, type RepairInput,
} from "@workspace/api-zod";
import {
  activityTable, db, equipmentRepairsTable, fleetEquipmentTable, repairExpensesTable,
  sparePartMovementsTable, sparePartsTable, sparePartRequestItemsTable,
} from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { calculateRepair, repairBusinessDate, summarizeRepairs, validRepairDate, validateRepairInput } from "../lib/repair-calculations";
import { ledgerTotals, registrationKey } from "../lib/repair-ledger";
import { refreshSparePartRequestStatus } from "../lib/spare-part-request-status";

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
const warehouseProtect: RequestHandler = (_req, res, next) => {
  if (!["engineer", "chief_engineer", "general_director", "storekeeper"].includes(res.locals.access.role ?? "")) {
    res.status(403).json({ error: "Склад доступен инженерной службе, заведующему складом и генеральному директору." });
    return;
  }
  next();
};
router.use("/engineering/spare-parts", requireApprovedRole, warehouseProtect);
router.use("/engineering/fleet", requireApprovedRole);
const fleetReaders = new Set([
  "engineer", "chief_engineer", "general_director", "storekeeper",
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
    if (code === "23505") { res.status(409).json({ error: "Такая запись уже существует. Обновите данные перед повтором." }); return; }
    if (code === "23503") { res.status(409).json({ error: "Запись используется связанными данными и не может быть удалена." }); return; }
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
const sparePartJson = (row: typeof sparePartsTable.$inferSelect) => ({
  id: row.id, name: row.name, articleNumber: row.articleNumber, unit: row.unit,
  quantity: Number(row.quantity), averageUnitCost: Number(row.averageUnitCost),
  updatedBy: row.updatedBy, updatedAt: row.updatedAt.toISOString(),
});
type MovementRecord = {
  movement: typeof sparePartMovementsTable.$inferSelect;
  part: typeof sparePartsTable.$inferSelect;
};
const movementJson = ({ movement, part }: MovementRecord) => ({
  id: movement.id, sparePartId: movement.sparePartId, sparePartName: part.name,
  articleNumber: part.articleNumber, unit: part.unit, movementKind: movement.movementKind,
  repairCategory: movement.repairCategory,
  purchaseRequestItemId: movement.purchaseRequestItemId,
  quantity: Number(movement.quantity), unitPrice: Number(movement.unitPrice), amount: Number(movement.amount),
  occurredOn: movement.occurredOn, invoiceNumber: movement.invoiceNumber, invoiceDate: movement.invoiceDate,
  supplier: movement.supplier, fleetId: movement.fleetId, description: movement.description,
  createdBy: movement.createdBy, createdAt: movement.createdAt.toISOString(),
});
async function movementById(tx: Tx | typeof db, id: number) {
  const [row] = await tx.select({ movement: sparePartMovementsTable, part: sparePartsTable })
    .from(sparePartMovementsTable)
    .innerJoin(sparePartsTable, eq(sparePartMovementsTable.sparePartId, sparePartsTable.id))
    .where(eq(sparePartMovementsTable.id, id));
  return row;
}
function sparePartAmount(quantity: number, unitPrice: number) {
  return Math.round(quantity * unitPrice * 100) / 100;
}
function validQuantity(value: number) {
  return Number.isFinite(value) && value > 0 && value <= 1_000_000 && Number(value.toFixed(3)) === value;
}
function validUnitPrice(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1_000_000_000_000 && Number(value.toFixed(2)) === value;
}

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

router.get("/engineering/spare-parts", safe(async (_req, res) => {
  const rows = await db.select().from(sparePartsTable).orderBy(sparePartsTable.name, sparePartsTable.articleNumber);
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(sparePartJson));
}));
router.get("/engineering/spare-parts/movements", safe(async (_req, res) => {
  const rows = await db.select({ movement: sparePartMovementsTable, part: sparePartsTable })
    .from(sparePartMovementsTable)
    .innerJoin(sparePartsTable, eq(sparePartMovementsTable.sparePartId, sparePartsTable.id))
    .orderBy(desc(sparePartMovementsTable.createdAt), desc(sparePartMovementsTable.id));
  res.setHeader("Cache-Control", "no-store");
  res.json(rows.map(movementJson));
}));
router.post("/engineering/spare-parts/receipts", safe(async (req, res) => {
  const parsed = CreateEngineeringSparePartReceiptBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте номенклатуру, количество, цену и реквизиты накладной." }); return; }
  const input = parsed.data;
  if (!input.name.trim() || !input.unit.trim() || !input.invoiceNumber.trim()
    || !validQuantity(input.quantity) || !validUnitPrice(input.unitPrice)
    || !validRepairDate(input.occurredOn) || input.occurredOn > repairBusinessDate()
    || !validRepairDate(input.invoiceDate) || input.invoiceDate > repairBusinessDate()) {
    res.status(400).json({ error: "Укажите корректные данные прихода, количество, цену и даты не позднее сегодняшнего." }); return;
  }
  const access = res.locals.access as RoleAccess;
  if (input.requestItemId !== undefined && access.role !== "storekeeper") {
    res.status(403).json({ error: "Поступление по заявке оформляет заведующий складом." }); return;
  }
  const by = actor(res.locals.access);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(sparePartMovementsTable)
      .where(eq(sparePartMovementsTable.requestId, input.requestId));
    if (existing) return { movement: await movementById(tx, existing.id) };

    const name = input.name.trim();
    const articleNumber = input.articleNumber.trim();
    const unit = input.unit.trim();
    let requestItem: typeof sparePartRequestItemsTable.$inferSelect | null = null;
    if (input.requestItemId !== undefined) {
      const [requestedItem] = await tx.select().from(sparePartRequestItemsTable)
        .where(eq(sparePartRequestItemsTable.id, input.requestItemId)).for("update");
      if (!requestedItem || requestedItem.status !== "awaiting_delivery") {
        return { error: "Эта позиция не ожидает поступления.", status: 409 as const };
      }
      if (
        requestedItem.name.toLocaleLowerCase("ru-RU") !== name.toLocaleLowerCase("ru-RU")
        || requestedItem.articleNumber.toLocaleLowerCase("ru-RU") !== articleNumber.toLocaleLowerCase("ru-RU")
        || requestedItem.unit.toLocaleLowerCase("ru-RU") !== unit.toLocaleLowerCase("ru-RU")
      ) {
        return { error: "Наименование, каталожный номер и единица измерения должны совпадать с заявкой.", status: 400 as const };
      }
      const remaining = Number(requestedItem.quantity) - Number(requestedItem.receivedQuantity);
      if (input.quantity > remaining + 1e-9) {
        return { error: `Нельзя оприходовать больше остатка заявки: ${remaining.toLocaleString("ru-RU")} ${requestedItem.unit}.`, status: 409 as const };
      }
      requestItem = requestedItem;
    }
    const nameKey = name.toLocaleLowerCase("ru-RU");
    const articleKey = articleNumber.toLocaleLowerCase("ru-RU");
    const unitKey = unit.toLocaleLowerCase("ru-RU");
    const amount = sparePartAmount(input.quantity, input.unitPrice);
    const [part] = await tx.insert(sparePartsTable).values({
      name, nameKey, articleNumber, articleKey, unit, unitKey,
      quantity: input.quantity.toFixed(3), averageUnitCost: input.unitPrice.toFixed(2),
      updatedBy: by,
    }).onConflictDoUpdate({
      target: [sparePartsTable.nameKey, sparePartsTable.articleKey, sparePartsTable.unitKey],
      set: {
        quantity: sql`${sparePartsTable.quantity} + EXCLUDED.quantity`,
        averageUnitCost: sql`CASE WHEN ${sparePartsTable.quantity} = 0
          THEN EXCLUDED.average_unit_cost
          ELSE ((${sparePartsTable.quantity} * ${sparePartsTable.averageUnitCost})
            + (EXCLUDED.quantity * EXCLUDED.average_unit_cost))
            / (${sparePartsTable.quantity} + EXCLUDED.quantity) END`,
        updatedBy: by,
        updatedAt: new Date(),
      },
    }).returning();
    const [movement] = await tx.insert(sparePartMovementsTable).values({
      requestId: input.requestId, sparePartId: part.id, movementKind: "receipt",
      purchaseRequestItemId: requestItem?.id ?? null,
      quantity: input.quantity.toFixed(3), unitPrice: input.unitPrice.toFixed(2),
      amount: amount.toFixed(2), occurredOn: input.occurredOn, invoiceNumber: input.invoiceNumber.trim(),
      invoiceDate: input.invoiceDate, supplier: input.supplier.trim(), description: input.description.trim(), createdBy: by,
    }).returning();
    if (requestItem) {
      const receivedQuantity = Number(requestItem.receivedQuantity) + input.quantity;
      const fullyReceived = receivedQuantity + 1e-9 >= Number(requestItem.quantity);
      await tx.update(sparePartRequestItemsTable).set({
        receivedQuantity: Math.min(receivedQuantity, Number(requestItem.quantity)).toFixed(3),
        status: fullyReceived ? "received" : "awaiting_delivery",
        receivedByName: actor(access),
        receivedAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(sparePartRequestItemsTable.id, requestItem.id));
      await refreshSparePartRequestStatus(tx, requestItem.requestId);
    }
    await activity(tx, "Поступили запчасти на склад", `${name}${articleNumber ? ` · ${articleNumber}` : ""} · накладная ${input.invoiceNumber.trim()}`, by);
    return { movement: await movementById(tx, movement.id) };
  });
  if ("error" in result) { res.status(result.status ?? 409).json({ error: result.error }); return; }
  if (!result.movement) { res.status(500).json({ error: "Не удалось загрузить карточку запчасти после прихода." }); return; }
  res.status(201).json(movementJson(result.movement));
}));
router.post("/engineering/spare-parts/issues", safe(async (req, res) => {
  if ((res.locals.access as RoleAccess).role === "storekeeper") {
    res.status(403).json({ error: "Заведующий складом может принимать запчасти, но не списывать их на технику." }); return;
  }
  const parsed = CreateEngineeringSparePartIssueBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Выберите запчасть и технику, укажите количество и дату списания." }); return; }
  const input = parsed.data;
  if (!positiveId(input.sparePartId) || !positiveId(input.fleetId) || !validQuantity(input.quantity)
    || !validRepairDate(input.occurredOn) || input.occurredOn > repairBusinessDate()) {
    res.status(400).json({ error: "Укажите корректные технику, количество и дату списания не позднее сегодняшней." }); return;
  }
  const by = actor(res.locals.access);
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(sparePartMovementsTable)
      .where(eq(sparePartMovementsTable.requestId, input.requestId));
    if (existing) return { movement: await movementById(tx, existing.id) };

    const [part] = await tx.select().from(sparePartsTable)
      .where(eq(sparePartsTable.id, input.sparePartId)).for("update");
    if (!part) return { error: "Запчасть не найдена.", status: 404 as const };
    const currentQuantity = Number(part.quantity);
    if (currentQuantity + 1e-9 < input.quantity) {
      return { error: `Недостаточно остатка. Доступно: ${currentQuantity.toLocaleString("ru-RU")} ${part.unit}.`, status: 409 as const };
    }
    const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, input.fleetId));
    if (!fleet) return { error: "Техника не найдена в справочнике.", status: 404 as const };

    const unitPrice = Number(part.averageUnitCost);
    const amount = sparePartAmount(input.quantity, unitPrice);
    const [updated] = await tx.update(sparePartsTable).set({
      quantity: Math.max(0, currentQuantity - input.quantity).toFixed(3),
      updatedBy: by, updatedAt: new Date(),
    }).where(and(eq(sparePartsTable.id, part.id), sql`${sparePartsTable.quantity} >= ${input.quantity}`)).returning();
    if (!updated) return { error: "Остаток изменился другим пользователем. Обновите склад и повторите списание.", status: 409 as const };
    const [movement] = await tx.insert(sparePartMovementsTable).values({
      requestId: input.requestId, sparePartId: part.id, movementKind: "issue", repairCategory: input.category,
      quantity: input.quantity.toFixed(3), unitPrice: unitPrice.toFixed(2), amount: amount.toFixed(2),
      occurredOn: input.occurredOn, fleetId: fleet.id,
      description: input.description.trim(), createdBy: by,
    }).returning();
    await tx.insert(repairExpensesTable).values({
      fleetId: fleet.id, incurredOn: input.occurredOn, category: input.category,
      amount: amount.toFixed(2),
      description: `Списание со склада: ${part.name}${part.articleNumber ? ` · ${part.articleNumber}` : ""} — ${input.quantity.toLocaleString("ru-RU")} ${part.unit}${input.description.trim() ? ` · ${input.description.trim()}` : ""}`,
      source: "warehouse", sparePartMovementId: movement.id, updatedBy: by,
    });
    await activity(tx, "Списаны запчасти на ремонт техники", `${part.name} · ${fleet.kind} · ${fleet.registrationNumber ?? "без госномера"} · ${amount.toFixed(2)} ₸`, by);
    return { movement: await movementById(tx, movement.id) };
  });
  if ("error" in result) { res.status(result.status ?? 409).json({ error: result.error }); return; }
  if (!result.movement) { res.status(500).json({ error: "Не удалось загрузить запись списания." }); return; }
  res.status(201).json(movementJson(result.movement));
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
  res.status(409).json({ error: "Новые затраты на ремонт оформляются через списание запчастей со склада." });
}));
router.put("/engineering/expenses/:id", safe(async (req, res) => {
  const id = positiveId(req.params.id);
  const parsed = UpdateRepairExpenseBody.safeParse(req.body);
  if (!id || !parsed.success || !positiveId(parsed.data.version)) { res.status(400).json({ error: "Проверьте поля расхода и версию." }); return; }
  const error = expenseError(parsed.data);
  if (error) { res.status(400).json({ error }); return; }
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(repairExpensesTable).where(eq(repairExpensesTable.id, id));
    if (existing?.source === "warehouse") return "warehouse" as const;
    const [fleet] = await tx.select().from(fleetEquipmentTable).where(eq(fleetEquipmentTable.id, parsed.data.fleetId));
    if (!fleet) return null;
    const [updated] = await tx.update(repairExpensesTable).set({
      ...parsed.data, amount: parsed.data.amount.toFixed(2), description: parsed.data.description.trim(),
      version: parsed.data.version + 1, updatedBy: actor(res.locals.access), updatedAt: new Date(),
    }).where(and(eq(repairExpensesTable.id, id), eq(repairExpensesTable.version, parsed.data.version))).returning();
    if (updated) await activity(tx, "Исправлен расход на технику", fleet.kind, actor(res.locals.access));
    return updated;
  });
  if (row === "warehouse") { res.status(409).json({ error: "Расход со склада нельзя менять отдельно от складского движения." }); return; }
  if (!row) { res.status(409).json({ error: "Расход или техника изменены / удалены. Загрузите актуальные данные перед исправлением." }); return; }
  res.json(expenseJson(row));
}));
router.delete("/engineering/expenses/:id", directorOnly, safe(async (req, res) => {
  const id = positiveId(req.params.id);
  if (!id) { res.status(400).json({ error: "Некорректный расход." }); return; }
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(repairExpensesTable).where(eq(repairExpensesTable.id, id));
    if (existing?.source === "warehouse") return "warehouse" as const;
    const [deleted] = await tx.delete(repairExpensesTable).where(eq(repairExpensesTable.id, id)).returning();
    if (deleted) await activity(tx, "Удалён расход на технику", `Расход ${deleted.id}`, actor(res.locals.access));
    return deleted;
  });
  if (row === "warehouse") { res.status(409).json({ error: "Расход со склада нельзя удалить отдельно от складского движения." }); return; }
  if (!row) { res.status(404).json({ error: "Расход не найден." }); return; }
  res.status(204).send();
}));
export default router;
