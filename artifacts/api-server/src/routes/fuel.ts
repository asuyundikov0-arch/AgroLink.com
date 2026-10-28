import { Router, type IRouter, type RequestHandler } from "express";
import { asc, eq, sql } from "drizzle-orm";
import { db, fleetEquipmentTable, fuelMovementsTable } from "@workspace/db";
import {
  CreateFuelIssueBody, CreateFuelReceiptBody, CreateFuelIssueResponse, CreateFuelReceiptResponse,
  GetFuelWarehouseResponse,
} from "@workspace/api-zod";
import { requireApprovedRole } from "../middlewares/auth";
import { equipmentLabel, fuelAssignments, fuelBalance, fuelCheck, FuelError, postFuelMovement } from "../lib/fuel-ledger";

const router: IRouter = Router();
const safe = (fn: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await fn(req, res, next); } catch (error) {
    if (error instanceof FuelError) { res.status(error.status).json({ error: error.message }); return; }
    next(error);
  }
};
router.use("/engineering/fuel", requireApprovedRole, (_req, res, next) => {
  if (!["fuel_manager", "engineer", "chief_engineer", "general_director"].includes(res.locals.access.role ?? "")) {
    res.status(403).json({ error: "Нет доступа к нефтебазе." }); return;
  }
  next();
});

export async function fuelWarehouse(tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const movements = await tx.select().from(fuelMovementsTable)
    .orderBy(asc(fuelMovementsTable.occurredOn), asc(fuelMovementsTable.id));
  const equipment = await tx.select().from(fleetEquipmentTable).orderBy(asc(fleetEquipmentTable.id));
  const workAssignments = await fuelAssignments(tx);
  const groups = new Map<string, typeof movements>();
  for (const row of movements) {
    const key = `${row.farm}\u0000${row.fuelType}`;
    const group = groups.get(key) ?? [];
    group.push(row); groups.set(key, group);
  }
  const stocks = [...groups.values()].map((group) => {
    const balance = fuelBalance(group);
    return { farm: group[0].farm, fuelType: group[0].fuelType, liters: balance.millis / 1000,
      amount: balance.cents / 100, averagePricePerLiter: balance.millis > 0 ?
        Math.round(balance.cents * 1000 / balance.millis) / 100 : 0 };
  });
  return GetFuelWarehouseResponse.parse({
    stocks,
    equipment: equipment.map((e) => ({ ...e, updatedAt: e.updatedAt.toISOString() })),
    workAssignments,
    movements: movements.reverse().map((row) => {
      const fleet = equipment.find((e) => e.id === row.fleetId);
      const work = workAssignments.find((o) => o.operationId === row.operationId);
      return { ...row, liters: row.quantityMillis / 1000, amount: Number(row.amountCents) / 100,
        pricePerLiter: Number(row.pricePerLiterCents) / 100, equipment: fleet ? equipmentLabel(fleet) : "",
        fieldNumber: work?.fieldNumber ?? "", operationName: work?.operationName ?? "",
        createdAt: row.createdAt.toISOString() };
    }),
  });
}
router.get("/engineering/fuel", safe(async (_req, res) => {
  res.json(await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read`);
    return fuelWarehouse(tx);
  }));
}));
for (const kind of ["receipt", "issue"] as const) {
  router.post(`/engineering/fuel/${kind === "receipt" ? "receipts" : "issues"}`, safe(async (req, res) => {
    fuelCheck(["fuel_manager", "general_director"].includes(res.locals.access.role ?? ""),
      "Приход и расход топлива оформляет заведующий нефтебазой.", 403);
    const schema = kind === "receipt" ? CreateFuelReceiptBody : CreateFuelIssueBody;
    const parsed = schema.safeParse(req.body);
    fuelCheck(parsed.success, "Проверьте обязательные поля формы.");
    const row = await db.transaction((tx) => postFuelMovement(tx, kind, parsed.data, res.locals.access));
    // Resolve display-only labels from the same read model used by the stock screen.
    const warehouse = await db.transaction(fuelWarehouse);
    const response = warehouse.movements.find((m) => m.id === row.id);
    const output = kind === "receipt" ? CreateFuelReceiptResponse : CreateFuelIssueResponse;
    res.status(201).json(output.parse(response));
  }));
}
export default router;
