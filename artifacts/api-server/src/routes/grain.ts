import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CreateGrainCropBody, CreateGrainLocationBody, CreateGrainMovementBody, VoidGrainMovementBody,
  GetGrainDashboardResponse, type GrainMovementInput,
} from "@workspace/api-zod";
import { activityTable, db, grainCropsTable, grainLocationsTable, grainMovementsTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { calculateGrainLedger, grainBusinessDate, grainNameKey, toGrainKg, validGrainDate } from "../lib/grain-ledger";

const router: IRouter = Router();
const writers = ["agronomist", "chief_agronomist", "farm_director", "general_director"];
function roles(allowed: string[]): RequestHandler {
  return (_req, res, next) => {
    if (!allowed.includes(res.locals.access.role)) { res.status(403).json({ error: "Недостаточно прав для работы с балансом зерна." }); return; }
    next();
  };
}
router.use("/agro/grain", requireApprovedRole, roles([...writers, "economist"]));
const management = roles(["chief_agronomist", "farm_director", "general_director"]);
const write = roles(writers);
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
const validId = (id: unknown) => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const cropJson = ({ id, name }: typeof grainCropsTable.$inferSelect) => ({ id, name });
const locationJson = ({ id, name, unit, kind }: typeof grainLocationsTable.$inferSelect) => ({ id, name, unit, kind });
const movementJson = (row: typeof grainMovementsTable.$inferSelect) => {
  const { quantityKg, createdByUserId: _user, ...rest } = row;
  return { ...rest, quantityTons: quantityKg / 1000, createdAt: row.createdAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null };
};
const safe = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); }
  catch (err) {
    const e = err as { code?: string; cause?: { code?: string } };
    if ((e.code ?? e.cause?.code) === "23505") {
      res.status(409).json({ error: "Такая запись уже существует. Обновите данные." }); return;
    }
    next(err);
  }
};
router.get("/agro/grain", safe(async (_req, res) => {
  // A repeatable snapshot prevents mixing balances and a concurrently changed journal.
  const snapshot = await db.transaction(async (tx) => {
    const crops = await tx.select().from(grainCropsTable).orderBy(grainCropsTable.id);
    const locations = await tx.select().from(grainLocationsTable).orderBy(grainLocationsTable.id);
    const movements = await tx.select().from(grainMovementsTable)
      .orderBy(desc(grainMovementsTable.occurredOn), desc(grainMovementsTable.id));
    const stock = calculateGrainLedger(movements);
    return {
      crops: crops.map(cropJson), locations: locations.map(locationJson), movements: movements.map(movementJson),
      balances: stock.balances.map(({ quantityKg, ...rest }) => ({ ...rest, quantityTons: quantityKg / 1000 })),
      summary: {
        totalTons: stock.summary.totalKg / 1000, openingTons: stock.summary.openingKg / 1000,
        receivedTons: stock.summary.receivedKg / 1000, soldTons: stock.summary.soldKg / 1000,
        transferredTons: stock.summary.transferredKg / 1000,
      },
      asOfDate: grainBusinessDate(),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetGrainDashboardResponse.parse(snapshot));
}));
router.post("/agro/grain/crops", management, safe(async (req, res) => {
  const parsed = CreateGrainCropBody.safeParse(req.body);
  if (!parsed.success || !grainNameKey(parsed.data.name)) { res.status(400).json({ error: "Укажите название продукции." }); return; }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(grainCropsTable).values({
      name: parsed.data.name.trim().replace(/\s+/g, " "), nameKey: grainNameKey(parsed.data.name),
    }).returning();
    await tx.insert(activityTable).values({ action: "Добавлена продукция в баланс зерна", templateName: created.name, userName: actor(res.locals.access) });
    return created;
  });
  res.status(201).json(cropJson(row));
}));
router.post("/agro/grain/locations", management, safe(async (req, res) => {
  const parsed = CreateGrainLocationBody.safeParse(req.body);
  if (!parsed.success || !grainNameKey(parsed.data.name)) { res.status(400).json({ error: "Укажите место хранения, его тип и хозяйство." }); return; }
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(grainLocationsTable).values({
      ...parsed.data, name: parsed.data.name.trim().replace(/\s+/g, " "), nameKey: grainNameKey(parsed.data.name),
    }).returning();
    await tx.insert(activityTable).values({ action: "Добавлено место хранения зерна", templateName: created.name, userName: actor(res.locals.access) });
    return created;
  });
  res.status(201).json(locationJson(row));
}));

function validateInput(input: GrainMovementInput): string | null {
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId)) return "Некорректный идентификатор операции. Откройте новую форму.";
  if (!validId(input.cropId) || (input.fromLocationId !== null && !validId(input.fromLocationId)) || (input.toLocationId !== null && !validId(input.toLocationId))) return "Выберите продукцию и корректные места хранения.";
  if (toGrainKg(input.quantityTons) === null) return "Укажите положительный вес в тоннах с точностью до 0,001 т, не более 1 000 000 т за операцию.";
  if (!validGrainDate(input.occurredOn) || input.occurredOn > grainBusinessDate()) return "Укажите корректную дату, не позднее сегодняшней.";
  if (input.operation === "opening" || input.operation === "receipt") {
    if (input.fromLocationId !== null || input.toLocationId === null) return "Для прихода выберите только место размещения.";
    if (input.operation === "receipt" && !input.fieldName.trim()) return "Укажите поле, с которого поступило зерно.";
  } else if (input.operation === "transfer") {
    if (input.fromLocationId === null || input.toLocationId === null || input.fromLocationId === input.toLocationId) return "Для перемещения выберите два разных места хранения.";
  } else if (input.operation === "sale" && (input.fromLocationId === null || input.toLocationId !== null)) return "Для продажи выберите только место отгрузки.";
  return null;
}
router.post("/agro/grain/movements", write, safe(async (req, res) => {
  const parsed = CreateGrainMovementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте обязательные поля операции и вес." }); return; }
  const input = parsed.data;
  const error = validateInput(input);
  if (error) { res.status(400).json({ error }); return; }
  const access = res.locals.access as RoleAccess;
  const result = await db.transaction(async (tx) => {
    // One lock serializes balance-sensitive writes including backdated entries/cancellations.
    await tx.execute(sql`select pg_advisory_xact_lock(718392005)`);
    const [existing] = await tx.select().from(grainMovementsTable).where(eq(grainMovementsTable.requestId, input.requestId));
    const values = {
      requestId: input.requestId, unit: input.unit, operation: input.operation, cropId: input.cropId,
      occurredOn: input.occurredOn, quantityKg: toGrainKg(input.quantityTons)!,
      fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
      fieldName: input.fieldName.trim(), counterparty: input.counterparty.trim(), notes: input.notes.trim(),
    };
    if (existing) {
      const same = existing.createdByUserId === access.userId && Object.entries(values).every(([key, value]) => existing[key as keyof typeof existing] === value);
      return same ? { row: existing } : { status: 409, error: "Идентификатор уже использован для другой операции. Создайте новую операцию." };
    }
    const [crop] = await tx.select().from(grainCropsTable).where(eq(grainCropsTable.id, input.cropId));
    if (!crop) return { status: 400, error: "Продукция не найдена в справочнике." };
    const locations = await tx.select().from(grainLocationsTable).where(eq(grainLocationsTable.unit, input.unit));
    for (const id of [input.fromLocationId, input.toLocationId]) {
      if (id !== null && !locations.some((location) => location.id === id)) return { status: 400, error: "Места хранения должны относиться к выбранному хозяйству." };
    }
    const rows = await tx.select().from(grainMovementsTable).where(and(eq(grainMovementsTable.unit, input.unit), eq(grainMovementsTable.cropId, input.cropId)));
    const stock = calculateGrainLedger([...rows, { ...values, id: Number.MAX_SAFE_INTEGER, voidedAt: null }]);
    if (stock.issue) {
      const location = locations.find((place) => place.id === stock.issue!.locationId);
      return { status: 409, error: `Недостаточно зерна: ${location?.name ?? "место хранения"}, ${stock.issue.occurredOn}. Не хватает ${(stock.issue.shortageKg / 1000).toLocaleString("ru-RU")} т. Проверьте также даты предыдущих операций.` };
    }
    const [created] = await tx.insert(grainMovementsTable).values({
      ...values, createdBy: actor(access), createdByUserId: access.userId,
    }).returning();
    await tx.insert(activityTable).values({
      action: "Проведена операция баланса зерна", templateName: `${crop.name} · ${input.quantityTons} т · ${input.operation}`, userName: actor(access),
    });
    return { row: created };
  });
  if (!result.row) { res.status(result.status!).json({ error: result.error }); return; }
  res.status(201).json(movementJson(result.row));
}));
router.post("/agro/grain/movements/:id/void", roles(["general_director"]), safe(async (req, res) => {
  const parsed = VoidGrainMovementBody.safeParse(req.body);
  const id = Number(req.params.id);
  if (!validId(id) || !parsed.success || parsed.data.reason.trim().length < 3) { res.status(400).json({ error: "Укажите причину отмены (не менее 3 символов)." }); return; }
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(718392005)`);
    const [row] = await tx.select().from(grainMovementsTable).where(eq(grainMovementsTable.id, id));
    if (!row) return { status: 404, error: "Операция не найдена." };
    if (row.voidedAt) return { row };
    const rows = await tx.select().from(grainMovementsTable).where(and(eq(grainMovementsTable.unit, row.unit), eq(grainMovementsTable.cropId, row.cropId)));
    const stock = calculateGrainLedger(rows.filter((item) => item.id !== row.id));
    if (stock.issue) return { status: 409, error: "Отмена создаст отрицательный остаток. Сначала отмените зависимые продажи или перемещения." };
    const [voided] = await tx.update(grainMovementsTable).set({
      voidedAt: new Date(), voidedBy: actor(res.locals.access), voidReason: parsed.data.reason.trim(),
    }).where(and(eq(grainMovementsTable.id, id), isNull(grainMovementsTable.voidedAt))).returning();
    await tx.insert(activityTable).values({ action: "Отменена операция баланса зерна", templateName: `Операция ${id}: ${parsed.data.reason.trim()}`, userName: actor(res.locals.access) });
    return { row: voided };
  });
  if (!result.row) { res.status(result.status!).json({ error: result.error }); return; }
  res.json(movementJson(result.row));
}));
export default router;
