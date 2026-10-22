import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  CreateEngineeringRepairBody, CreateEngineeringRepairResponse,
  DeleteEngineeringRepairParams, ListEngineeringRepairsQueryParams,
  ListEngineeringRepairsResponse, UpdateEngineeringRepairBody,
  UpdateEngineeringRepairParams, UpdateEngineeringRepairResponse,
  type RepairEntry, type RepairInput,
} from "@workspace/api-zod";
import { activityTable, db, equipmentRepairsTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { calculateRepair, repairBusinessDate, summarizeRepairs, validateRepairInput } from "../lib/repair-calculations";

const router: IRouter = Router();
const requireEngineering: RequestHandler = (_req, res, next) => {
  const access = res.locals.access as RoleAccess;
  if (!["engineer", "chief_engineer", "general_director"].includes(access.role ?? "")) {
    res.status(403).json({ error: "Реестр ремонта доступен только инженерной службе и генеральному директору." });
    return;
  }
  next();
};
router.use("/engineering/repairs", requireApprovedRole, requireEngineering);

function serializeRepair(row: typeof equipmentRepairsTable.$inferSelect, today: string): RepairEntry {
  const input: RepairInput = {
    equipment: row.equipment,
    responsible: row.responsible,
    unit: row.unit as RepairInput["unit"],
    plannedStart: row.plannedStart,
    plannedEnd: row.plannedEnd,
    actualStart: row.actualStart,
    actualEnd: row.actualEnd,
    readiness: row.readiness === null ? null : Number(row.readiness),
    capitalCost: row.capitalCost === null ? null : Number(row.capitalCost),
    currentCost: row.currentCost === null ? null : Number(row.currentCost),
    tiresCost: row.tiresCost === null ? null : Number(row.tiresCost),
    oilsCost: row.oilsCost === null ? null : Number(row.oilsCost),
    serviceCost: row.serviceCost === null ? null : Number(row.serviceCost),
    notes: row.notes,
  };
  return {
    ...input,
    ...calculateRepair(input, today),
    id: row.id,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    createdBy: row.createdBy,
  };
}

function storedInput(input: RepairInput) {
  return {
    equipment: input.equipment.trim(),
    responsible: input.responsible.trim(),
    unit: input.unit,
    plannedStart: input.plannedStart,
    plannedEnd: input.plannedEnd,
    actualStart: input.actualStart,
    actualEnd: input.actualEnd,
    readiness: input.actualEnd ? "100.00" : input.readiness?.toFixed(2) ?? null,
    capitalCost: input.capitalCost?.toFixed(2) ?? null,
    currentCost: input.currentCost?.toFixed(2) ?? null,
    tiresCost: input.tiresCost?.toFixed(2) ?? null,
    oilsCost: input.oilsCost?.toFixed(2) ?? null,
    serviceCost: input.serviceCost?.toFixed(2) ?? null,
    notes: input.notes.trim(),
  };
}

function actorName(access: RoleAccess) {
  return `${access.displayName} · ${access.role}`;
}

router.get("/engineering/repairs", async (req, res): Promise<void> => {
  const query = ListEngineeringRepairsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Выберите корректное подразделение." });
    return;
  }
  const today = repairBusinessDate();
  const rows = await db.select().from(equipmentRepairsTable)
    .where(query.data.unit ? eq(equipmentRepairsTable.unit, query.data.unit) : undefined)
    .orderBy(desc(equipmentRepairsTable.updatedAt), desc(equipmentRepairsTable.id));
  const items = rows.map((row) => serializeRepair(row, today));
  res.setHeader("Cache-Control", "no-store");
  res.json(ListEngineeringRepairsResponse.parse({
    items, summary: summarizeRepairs(items), asOfDate: today, currency: "KZT",
  }));
});

router.post("/engineering/repairs", async (req, res): Promise<void> => {
  const parsed = CreateEngineeringRepairBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Проверьте обязательные поля, готовность от 0 до 100% и неотрицательные затраты." });
    return;
  }
  const validationError = validateRepairInput(parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const access = res.locals.access as RoleAccess;
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(equipmentRepairsTable).values({
      ...storedInput(parsed.data), createdBy: actorName(access), updatedBy: actorName(access),
    }).returning();
    await tx.insert(activityTable).values({
      action: "Добавлен ремонт техники", templateName: created.equipment, userName: actorName(access),
    });
    return created;
  });
  req.log.info({ repairId: row.id, actorUserId: access.userId, contextRole: access.role }, "Equipment repair created");
  res.status(201).json(CreateEngineeringRepairResponse.parse(serializeRepair(row, repairBusinessDate())));
});

router.put("/engineering/repairs/:id", async (req, res): Promise<void> => {
  const params = UpdateEngineeringRepairParams.safeParse(req.params);
  const parsed = UpdateEngineeringRepairBody.safeParse(req.body);
  if (!params.success || !Number.isSafeInteger(params.data.id) || params.data.id < 1
    || !parsed.success || !Number.isSafeInteger(parsed.data.version)) {
    res.status(400).json({ error: "Проверьте поля ремонта и версию записи." });
    return;
  }
  const validationError = validateRepairInput(parsed.data);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }
  const access = res.locals.access as RoleAccess;
  const row = await db.transaction(async (tx) => {
    const [updated] = await tx.update(equipmentRepairsTable).set({
      ...storedInput(parsed.data), updatedBy: actorName(access), updatedAt: new Date(), version: parsed.data.version + 1,
    }).where(and(eq(equipmentRepairsTable.id, params.data.id), eq(equipmentRepairsTable.version, parsed.data.version)))
      .returning();
    if (updated) {
      await tx.insert(activityTable).values({
        action: "Обновлён ремонт техники", templateName: updated.equipment, userName: actorName(access),
      });
    }
    return updated;
  });
  if (!row) {
    const [exists] = await db.select({ id: equipmentRepairsTable.id }).from(equipmentRepairsTable)
      .where(eq(equipmentRepairsTable.id, params.data.id));
    res.status(exists ? 409 : 404).json({
      error: exists ? "Запись уже изменена другим сотрудником. Загрузите актуальную версию перед сохранением." : "Запись ремонта не найдена.",
    });
    return;
  }
  req.log.info({ repairId: row.id, actorUserId: access.userId, contextRole: access.role }, "Equipment repair updated");
  res.json(UpdateEngineeringRepairResponse.parse(serializeRepair(row, repairBusinessDate())));
});

router.delete("/engineering/repairs/:id", async (req, res): Promise<void> => {
  const access = res.locals.access as RoleAccess;
  if (access.role !== "general_director") {
    res.status(403).json({ error: "Удалять записи ремонта может только генеральный директор." });
    return;
  }
  const parsed = DeleteEngineeringRepairParams.safeParse(req.params);
  if (!parsed.success || !Number.isSafeInteger(parsed.data.id) || parsed.data.id < 1) {
    res.status(400).json({ error: "Некорректный номер записи." });
    return;
  }
  const row = await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(equipmentRepairsTable).where(eq(equipmentRepairsTable.id, parsed.data.id)).returning();
    if (deleted) {
      await tx.insert(activityTable).values({
        action: "Удалён ремонт техники", templateName: deleted.equipment, userName: actorName(access),
      });
    }
    return deleted;
  });
  if (!row) {
    res.status(404).json({ error: "Запись ремонта не найдена." });
    return;
  }
  req.log.info({ repairId: row.id, actorUserId: access.userId, contextRole: access.role }, "Equipment repair deleted");
  res.status(204).send();
});

export default router;
