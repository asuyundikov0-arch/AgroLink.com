import { Router, type IRouter, type RequestHandler } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  CreateGrainCropBody, CreateGrainLocationBody, CreateGrainMovementBody, ReviewGrainMovementBody, VoidGrainMovementBody,
  CreateGrainMovementResponse, GetGrainDashboardResponse, GetGrainTransportTripsResponse,
  UpdateGrainTransportRateBody, UpdateGrainTransportRateParams, UpdateGrainTransportRateResponse, type GrainMovementInput,
} from "@workspace/api-zod";
import { activityTable, db, employeesTable, grainCropsTable, grainLocationsTable, grainMovementsTable } from "@workspace/db";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { calculateGrainLedger, grainBusinessDate, grainNameKey, toGrainKg, validGrainDate } from "../lib/grain-ledger";
import { processingWeights } from "../lib/grain-processing";
import { grainTripWasSubmitted, lockPayrollSources } from "../lib/payroll-source-guard";

const router: IRouter = Router();
const readers = ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"];
const writers = ["weigher", "general_director"];
const reviewers = ["grain_manager", "general_director"];
const transportOperations = new Set(["receipt", "transfer", "drying", "cleaning"]);
function roles(allowed: string[]): RequestHandler {
  return (_req, res, next) => {
    if (!allowed.includes(res.locals.access.role)) { res.status(403).json({ error: "Недостаточно прав для работы с балансом зерна." }); return; }
    next();
  };
}
router.use("/agro/grain", requireApprovedRole);
const management = roles(["chief_agronomist", "general_director"]);
const write = roles(writers);
const review = roles(reviewers);
const actor = (access: RoleAccess) => `${access.displayName} · ${access.role}`;
const validId = (id: unknown) => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const cropJson = ({ id, name }: typeof grainCropsTable.$inferSelect) => ({ id, name });
const locationJson = ({ id, name, unit, kind }: typeof grainLocationsTable.$inferSelect) => ({ id, name, unit, kind });
const movementJson = (row: typeof grainMovementsTable.$inferSelect) => {
  const { quantityKg, outputKg, deadWasteKg, grainWasteKg, moistureLossKg, transportRate, createdByUserId: _user, ...rest } = row;
  return CreateGrainMovementResponse.parse({
    ...rest, quantityTons: quantityKg / 1000, outputTons: outputKg / 1000, deadWasteTons: deadWasteKg / 1000,
    grainWasteTons: grainWasteKg / 1000, moistureLossTons: moistureLossKg / 1000,
    transportRate: transportRate === null ? null : Number(transportRate),
    transportRateSetAt: row.transportRateSetAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), voidedAt: row.voidedAt?.toISOString() ?? null,
  });
};
async function transportTrips() {
  const [movements, crops, locations] = await Promise.all([
    db.select().from(grainMovementsTable).orderBy(desc(grainMovementsTable.occurredOn), desc(grainMovementsTable.id)),
    db.select().from(grainCropsTable),
    db.select().from(grainLocationsTable),
  ]);
  const cropById = new Map(crops.map((crop) => [crop.id, crop.name]));
  const locationById = new Map(locations.map((location) => [location.id, location.name]));
  return movements.filter((row) => transportOperations.has(row.operation) && !row.voidedAt).map((row) => ({
    id: row.id,
    unit: row.unit,
    operation: row.operation as "receipt" | "transfer" | "drying" | "cleaning",
    cropName: cropById.get(row.cropId) ?? "—",
    occurredOn: row.occurredOn,
    quantityTons: row.quantityKg / 1000,
    fromLocationName: row.fromLocationId === null ? null : locationById.get(row.fromLocationId) ?? null,
    toLocationName: row.toLocationId === null ? null : locationById.get(row.toLocationId) ?? null,
    fieldName: row.fieldName,
    truckNumber: row.truckNumber,
    driverName: row.driverName,
    driverEmployeeId: row.driverEmployeeId,
    approvalStatus: row.approvalStatus as "pending" | "approved" | "returned",
    rateKzt: row.transportRate === null ? null : Number(row.transportRate),
    rateSetBy: row.transportRateSetBy,
    rateSetAt: row.transportRateSetAt?.toISOString() ?? null,
    createdBy: row.createdBy,
  }));
}
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
router.get("/agro/grain", roles(readers), safe(async (_req, res) => {
  const access = res.locals.access as RoleAccess;
  // A repeatable snapshot prevents mixing balances and a concurrently changed journal.
  const snapshot = await db.transaction(async (tx) => {
    const crops = await tx.select().from(grainCropsTable).orderBy(grainCropsTable.id);
    const locations = await tx.select().from(grainLocationsTable).orderBy(grainLocationsTable.id);
    const movements = await tx.select().from(grainMovementsTable)
      .orderBy(desc(grainMovementsTable.occurredOn), desc(grainMovementsTable.id));
    const stock = calculateGrainLedger(movements);
    const visibleMovements = movements.filter((row) => {
      if (access.role === "general_director" || access.role === "grain_manager") return true;
      if (access.role === "weigher" && row.createdByUserId === access.userId) return true;
      return row.approvalStatus === "approved";
    });
    return {
      crops: crops.map(cropJson), locations: locations.map(locationJson), movements: visibleMovements.map(movementJson),
      balances: stock.balances.map(({ quantityKg, ...rest }) => ({ ...rest, quantityTons: quantityKg / 1000 })),
      summary: {
        totalTons: stock.summary.totalKg / 1000, openingTons: stock.summary.openingKg / 1000,
        receivedTons: stock.summary.receivedKg / 1000, soldTons: stock.summary.soldKg / 1000,
        transferredTons: stock.summary.transferredKg / 1000,
        grainWasteTons: stock.summary.grainWasteKg / 1000, deadWasteTons: stock.summary.deadWasteKg / 1000,
        moistureLossTons: stock.summary.moistureLossKg / 1000, processedTons: stock.summary.processedKg / 1000,
      },
      asOfDate: grainBusinessDate(),
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetGrainDashboardResponse.parse(snapshot));
}));
router.get("/agro/grain/transport-trips", roles(["dispatcher", "general_director"]), safe(async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(GetGrainTransportTripsResponse.parse(await transportTrips()));
}));
router.patch("/agro/grain/transport-trips/:id/rate", roles(["dispatcher", "general_director"]), safe(async (req, res) => {
  const params = UpdateGrainTransportRateParams.safeParse(req.params);
  const input = UpdateGrainTransportRateBody.safeParse(req.body);
  if (!params.success || !input.success || !validId(params.data.id)) {
    res.status(400).json({ error: "Укажите корректную сумму оплаты за рейс." }); return;
  }
  const access = res.locals.access as RoleAccess;
  const result = await db.transaction(async (tx) => {
    await lockPayrollSources(tx);
    const [row] = await tx.select().from(grainMovementsTable)
      .where(eq(grainMovementsTable.id, params.data.id)).for("update");
    if (!row) return { error: "Рейс не найден.", status: 404 } as const;
    if (!transportOperations.has(row.operation) || row.voidedAt) {
      return { error: "Расценку можно внести только для действующего рейса по зерну.", status: 409 } as const;
    }
    if (await grainTripWasSubmitted(tx, row.id)) {
      return { error: "Начисление за рейс уже включено в отправленный наряд. Изменять расценку нельзя.", status: 409 } as const;
    }
    const rateSetAt = new Date();
    const [updated] = await tx.update(grainMovementsTable).set({
      transportRate: input.data.rateKzt.toFixed(2),
      transportRateSetBy: `${access.displayName} · ${access.role}`,
      transportRateSetAt: rateSetAt,
    }).where(eq(grainMovementsTable.id, row.id)).returning();
    await tx.insert(activityTable).values({
      action: "Внесена расценка за перевозку зерна",
      templateName: `Рейс №${row.id} · КамАЗ ${row.truckNumber} · ${input.data.rateKzt.toLocaleString("ru-RU")} ₸`,
      userName: `${access.displayName} · ${access.role}`,
    });
    return { row: updated };
  });
  if ("error" in result) { res.status(result.status ?? 500).json({ error: result.error }); return; }
  const trip = (await transportTrips()).find((item) => item.id === result.row.id);
  if (!trip) { res.status(500).json({ error: "Расценка сохранена, но запись рейса не найдена." }); return; }
  res.json(UpdateGrainTransportRateResponse.parse(trip));
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
  if (!validId(input.cropId) || [input.fromLocationId, input.toLocationId, input.wasteToLocationId].some((id) => id != null && !validId(id))) return "Выберите продукцию и корректные места хранения.";
  if (toGrainKg(input.quantityTons) === null) return "Укажите положительный вес в тоннах с точностью до 0,001 т, не более 1 000 000 т за операцию.";
  if (!validGrainDate(input.occurredOn) || input.occurredOn > grainBusinessDate()) return "Укажите корректную дату, не позднее сегодняшней.";
  if (transportOperations.has(input.operation) && (!input.truckNumber?.trim() || !validId(input.driverEmployeeId ?? 0))) return "Укажите номер КамАЗа и выберите водителя из справочника сотрудников.";
  if ((input.truckNumber?.length ?? 0) > 40 || (input.driverName?.length ?? 0) > 200) return "Проверьте длину номера КамАЗа и имени водителя.";
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
  if ((input.operation === "drying" || input.operation === "cleaning") && typeof req.body.outputTons !== "number") {
    res.status(400).json({ error: "Для переработки укажите фактический выход зерна; 0 допустим только при полной потере." }); return;
  }
  const error = validateInput(input);
  if (error) { res.status(400).json({ error }); return; }
  const weights = processingWeights(input);
  if (weights.error) { res.status(400).json({ error: weights.error }); return; }
  const access = res.locals.access as RoleAccess;
  const result = await db.transaction(async (tx) => {
    // One lock serializes balance-sensitive writes including backdated entries/cancellations.
    await tx.execute(sql`select pg_advisory_xact_lock(718392005)`);
    const [existing] = await tx.select().from(grainMovementsTable).where(eq(grainMovementsTable.requestId, input.requestId));
    const [driver] = transportOperations.has(input.operation)
      ? await tx.select().from(employeesTable).where(eq(employeesTable.id, input.driverEmployeeId!))
      : [];
    if (transportOperations.has(input.operation) && (!driver || (!driver.isActive && !existing))) {
      return { status: 400, error: "Выберите действующего водителя из справочника сотрудников." };
    }
    const values = {
      requestId: input.requestId, unit: input.unit, operation: input.operation, cropId: input.cropId,
      occurredOn: input.occurredOn, quantityKg: toGrainKg(input.quantityTons)!,
      stockKind: input.stockKind ?? "grain", outputKg: weights.outputKg, deadWasteKg: weights.deadWasteKg,
      grainWasteKg: weights.grainWasteKg, moistureLossKg: weights.moistureLossKg,
      wasteToLocationId: input.wasteToLocationId ?? null,
      fromLocationId: input.fromLocationId, toLocationId: input.toLocationId,
      fieldName: input.fieldName.trim(), counterparty: input.counterparty.trim(), notes: input.notes.trim(),
      truckNumber: input.truckNumber?.trim() ?? "", driverName: driver?.fullName ?? "",
      driverEmployeeId: driver?.id ?? null,
    };
    if (existing) {
      const same = existing.createdByUserId === access.userId && Object.entries(values).every(([key, value]) => existing[key as keyof typeof existing] === value);
      return same ? { row: existing } : { status: 409, error: "Идентификатор уже использован для другой операции. Создайте новую операцию." };
    }
    const [crop] = await tx.select().from(grainCropsTable).where(eq(grainCropsTable.id, input.cropId));
    if (!crop) return { status: 400, error: "Продукция не найдена в справочнике." };
    const locations = await tx.select().from(grainLocationsTable).where(eq(grainLocationsTable.unit, input.unit));
    for (const id of [input.fromLocationId, input.toLocationId, input.wasteToLocationId ?? null]) {
      if (id !== null && !locations.some((location) => location.id === id)) return { status: 400, error: "Места хранения должны относиться к выбранному хозяйству." };
    }
    const source = locations.find((place) => place.id === input.fromLocationId);
    const target = locations.find((place) => place.id === input.toLocationId);
    const wasteTarget = locations.find((place) => place.id === input.wasteToLocationId);
    const isProcessor = (place: typeof source) => place?.kind === "dryer" || place?.kind === "cleaner";
    if (input.operation === "drying" || input.operation === "cleaning") {
      if (source?.kind !== (input.operation === "drying" ? "dryer" : "cleaner") || isProcessor(target) || isProcessor(wasteTarget)) {
        return { status: 400, error: "Выберите соответствующую сушилку или очистку, а для готового зерна и зерновых отходов — склад, площадку или элеватор." };
      }
    } else if (values.stockKind === "grain_waste" && (isProcessor(source) || isProcessor(target))) {
      return { status: 400, error: "Зерновые отходы размещаются на складе, площадке или элеваторе, не в установке переработки." };
    }
    const rows = await tx.select().from(grainMovementsTable).where(and(eq(grainMovementsTable.unit, input.unit), eq(grainMovementsTable.cropId, input.cropId)));
    const approvalStatus = access.role === "weigher" ? "pending" : "approved";
    const stock = approvalStatus === "approved"
      ? calculateGrainLedger([...rows, { ...values, id: Number.MAX_SAFE_INTEGER, voidedAt: null, approvalStatus }])
      : null;
    if (stock?.issue) {
      const location = locations.find((place) => place.id === stock.issue!.locationId);
      return { status: 409, error: `Недостаточно ${stock.issue.stockKind === "grain_waste" ? "зерновых отходов" : "зерна"}: ${location?.name ?? "место хранения"}, ${stock.issue.occurredOn}. Не хватает ${(stock.issue.shortageKg / 1000).toLocaleString("ru-RU")} т. Проверьте также даты предыдущих операций.` };
    }
    const [created] = await tx.insert(grainMovementsTable).values({
      ...values, approvalStatus, reviewComment: "", reviewedBy: approvalStatus === "approved" ? actor(access) : "",
      reviewedAt: approvalStatus === "approved" ? new Date() : null,
      createdBy: actor(access), createdByUserId: access.userId,
    }).returning();
    await tx.insert(activityTable).values({
      action: approvalStatus === "pending" ? "Операция зерна направлена на согласование" : "Проведена операция баланса зерна",
      templateName: `${crop.name} · ${input.quantityTons} т · ${input.operation}`, userName: actor(access),
    });
    return { row: created };
  });
  if (!result.row) { res.status(result.status!).json({ error: result.error }); return; }
  res.status(201).json(movementJson(result.row));
}));
router.patch("/agro/grain/movements/:id/review", review, safe(async (req, res) => {
  const parsed = ReviewGrainMovementBody.safeParse(req.body);
  const id = Number(req.params.id);
  if (!validId(id) || !parsed.success
    || (parsed.data.decision === "returned" && parsed.data.reviewComment.trim().length < 3)) {
    res.status(400).json({ error: "Укажите решение и причину возврата (не менее 3 символов)." }); return;
  }
  const access = res.locals.access as RoleAccess;
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(718392005)`);
    const [row] = await tx.select().from(grainMovementsTable).where(eq(grainMovementsTable.id, id));
    if (!row) return { status: 404, error: "Операция не найдена." };
    if (row.approvalStatus !== "pending" || row.voidedAt) {
      return { status: 409, error: "Операция уже рассмотрена или отменена." };
    }
    if (parsed.data.decision === "approved") {
      const rows = await tx.select().from(grainMovementsTable)
        .where(and(eq(grainMovementsTable.unit, row.unit), eq(grainMovementsTable.cropId, row.cropId)));
      const stock = calculateGrainLedger(rows.map((item) => item.id === row.id
        ? { ...item, approvalStatus: "approved" }
        : item));
      if (stock.issue) {
        const places = await tx.select().from(grainLocationsTable).where(eq(grainLocationsTable.unit, row.unit));
        const location = places.find((place) => place.id === stock.issue!.locationId);
        return { status: 409, error: `Нельзя согласовать: не хватает ${stock.issue.stockKind === "grain_waste" ? "зерновых отходов" : "зерна"} в месте «${location?.name ?? "хранение"}» на дату ${stock.issue.occurredOn}.` };
      }
    }
    const [updated] = await tx.update(grainMovementsTable).set({
      approvalStatus: parsed.data.decision,
      reviewComment: parsed.data.reviewComment.trim(),
      reviewedBy: actor(access),
      reviewedAt: new Date(),
    }).where(and(eq(grainMovementsTable.id, id), eq(grainMovementsTable.approvalStatus, "pending"))).returning();
    if (!updated) return { status: 409, error: "Операцию уже рассмотрели. Обновите список." };
    await tx.insert(activityTable).values({
      action: parsed.data.decision === "approved" ? "Согласована операция зерна" : "Операция зерна возвращена на проверку",
      templateName: `Операция ${id}${parsed.data.reviewComment.trim() ? ` · ${parsed.data.reviewComment.trim()}` : ""}`,
      userName: actor(access),
    });
    return { row: updated };
  });
  if (!result.row) { res.status(result.status!).json({ error: result.error }); return; }
  res.json(movementJson(result.row));
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
    await lockPayrollSources(tx);
    if (await grainTripWasSubmitted(tx, row.id)) return { status: 409, error: "Начисление за рейс уже включено в отправленный наряд. Отмена недоступна." };
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
