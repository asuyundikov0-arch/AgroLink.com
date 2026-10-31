import { Router, type IRouter, type RequestHandler } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, grainCropsTable, seedMovementsTable } from "@workspace/db";
import {
  CreateSeedMovementBody, CreateSeedMovementResponse, GetSeedWarehouseResponse,
  ReviewSeedMovementBody, ReviewSeedMovementParams,
  UpdateSeedTransportRateBody,
} from "@workspace/api-zod";
import { requireApprovedRole, type RoleAccess } from "../middlewares/auth";
import { SeedError, seedBalances } from "../lib/seed-ledger";
import { reviewSeedMovement, submitSeedMovement } from "../lib/seed-warehouse";
import { grainBusinessDate } from "../lib/grain-ledger";
import { rateSeedTrip, seedTransportTrips } from "../lib/seed-transport";

const router: IRouter = Router();
const roles = (allowed: string[]): RequestHandler => (_req, res, next) => {
  if (!allowed.includes(res.locals.access.role)) { res.status(403).json({ error: "Недостаточно прав для склада семян." }); return; }
  next();
};
router.use("/agro/seeds", requireApprovedRole);
const safe = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) {
    if (error instanceof SeedError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
};
function dto(row: typeof seedMovementsTable.$inferSelect, cropName: string) {
  return CreateSeedMovementResponse.parse({
    ...row, cropName, quantityTons: row.quantityKg / 1000,
    pricePerTon: Number(row.pricePerTonCents) / 100, amount: Number(row.amountCents) / 100,
  });
}
async function responseFor(row: typeof seedMovementsTable.$inferSelect) {
  const [crop] = await db.select().from(grainCropsTable).where(eq(grainCropsTable.id, row.cropId));
  return dto(row, crop.name);
}
router.patch("/agro/seeds/transport-trips/:id/rate", roles(["motor_pool_manager", "general_director"]), safe(async (req, res) => {
  const id = Number(req.params.id);
  const input = UpdateSeedTransportRateBody.safeParse(req.body);
  if (!Number.isSafeInteger(id) || id <= 0 || !input.success) {
    res.status(400).json({ error: "Укажите корректную расценку и версию рейса." }); return;
  }
  await db.transaction(tx => rateSeedTrip(tx, id, input.data, res.locals.access));
  res.json((await seedTransportTrips()).find(t => t.id === id));
}));
router.get("/agro/seeds", roles(["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"]), safe(async (_req, res) => {
  const access = res.locals.access as RoleAccess;
  const snapshot = await db.transaction(async tx => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    const rows = await tx.select().from(seedMovementsTable).orderBy(desc(seedMovementsTable.occurredOn), desc(seedMovementsTable.id));
    const crops = await tx.select().from(grainCropsTable);
    const cropName = (id: number) => crops.find(c => c.id === id)?.name ?? "";
    const reviewer = ["grain_manager", "general_director"].includes(access.role ?? "");
    return {
      asOfDate: grainBusinessDate(),
      stocks: [...seedBalances(rows).values()].map(stock => ({
        unit: stock.unit, cropId: stock.cropId, cropName: cropName(stock.cropId),
        quantityTons: stock.quantityKg / 1000, amount: Number(stock.cents) / 100,
        pricePerTon: stock.quantityKg ? Number(stock.cents) * 10 / stock.quantityKg : 0,
      })),
      movements: rows.filter(row => row.approvalStatus === "approved" || reviewer || row.createdByUserId === access.userId)
        .map(row => dto(row, cropName(row.cropId))),
    };
  });
  res.setHeader("Cache-Control", "no-store");
  res.json(GetSeedWarehouseResponse.parse(snapshot));
}));
router.post("/agro/seeds/movements", roles(["weigher", "general_director"]), safe(async (req, res) => {
  const parsed = CreateSeedMovementBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Проверьте поля движения семян." }); return; }
  const row = await db.transaction(tx => submitSeedMovement(tx, parsed.data, res.locals.access));
  res.status(201).json(await responseFor(row));
}));
router.post("/agro/seeds/movements/:id/review", roles(["grain_manager", "general_director"]), safe(async (req, res) => {
  const body = ReviewSeedMovementBody.safeParse(req.body);
  const params = ReviewSeedMovementParams.safeParse(req.params);
  if (!body.success || !params.success || !Number.isSafeInteger(params.data.id) || params.data.id <= 0) {
    res.status(400).json({ error: "Выберите движение и решение." }); return;
  }
  const row = await db.transaction(tx => reviewSeedMovement(tx, params.data.id, body.data.decision, body.data.note ?? "", res.locals.access));
  res.json(await responseFor(row));
}));
export default router;
