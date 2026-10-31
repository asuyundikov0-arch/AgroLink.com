import { and, desc, eq } from "drizzle-orm";
import { db, grainCropsTable, payrollRegisterItemsTable, seedMovementsTable as seeds, activityTable } from "@workspace/db";
import { GetGrainTransportTripsResponse, type GrainTransportRateInput } from "@workspace/api-zod";
import type { RoleAccess } from "../middlewares/auth";
import { lockPayrollSources } from "./payroll-source-guard";
import { seedCheck } from "./seed-ledger";
import { transportPay } from "./transport-pay";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function seedTransportTrips() {
  const rows = await db.select({ movement: seeds, crop: grainCropsTable })
    .from(seeds).innerJoin(grainCropsTable, eq(seeds.cropId, grainCropsTable.id))
    .where(eq(seeds.kind, "issue")).orderBy(desc(seeds.occurredOn), desc(seeds.id));
  return GetGrainTransportTripsResponse.parse(rows
    .filter(({ movement: m }) => m.truckNumber && m.driverEmployeeId)
    .map(({ movement: m, crop }) => ({
      id: m.id, sourceType: "seed_trip", supportingTaskId: m.supportingTaskId,
      unit: m.unit, operation: "transfer", transportPayBasis: m.transportPayBasis,
      distanceKm: Number(m.distanceKm), tonKm: Number((m.quantityKg / 1000 * Number(m.distanceKm)).toFixed(6)),
      tariffPerTonKm: m.transportTariff === null ? null : Number(m.transportTariff),
      version: m.transportVersion, cropName: `${crop.name} (семена)`, occurredOn: m.occurredOn,
      quantityTons: m.quantityKg / 1000, fromLocationName: "Склад семян",
      toLocationName: `Поле №${m.fieldNumber}`, fieldName: m.fieldNumber,
      truckNumber: m.truckNumber, driverName: m.driverName, driverEmployeeId: m.driverEmployeeId,
      approvalStatus: m.approvalStatus === "rejected" ? "returned" : m.approvalStatus,
      rateKzt: m.transportRate === null ? null : Number(m.transportRate),
      rateSetBy: m.transportRateSetBy, rateSetAt: m.transportRateSetAt?.toISOString() ?? null,
      createdBy: m.createdBy,
    })));
}

export async function rateSeedTrip(tx: Tx, id: number, input: GrainTransportRateInput, access: RoleAccess) {
  seedCheck(["motor_pool_manager", "general_director"].includes(access.role ?? ""), "Расценку вносит заведующий автобазой.", 403);
  await lockPayrollSources(tx);
  const [row] = await tx.select().from(seeds).where(eq(seeds.id, id)).for("update");
  seedCheck(row, "Рейс с семенами не найден.", 404);
  seedCheck(row.kind === "issue" && row.truckNumber && row.driverEmployeeId && row.approvalStatus === "approved",
    "Рейс станет доступен после согласования выдачи семян заведующим током.", 409);
  seedCheck(Number.isSafeInteger(input.version) && input.version === row.transportVersion,
    "Расценка уже изменена. Обновите рейсы.", 409);
  const [submitted] = await tx.select({ id: payrollRegisterItemsTable.id }).from(payrollRegisterItemsTable)
    .where(and(eq(payrollRegisterItemsTable.sourceType, "seed_trip"), eq(payrollRegisterItemsTable.sourceId, id))).limit(1);
  seedCheck(!submitted, "Рейс уже включён в отправленный наряд. Изменять расценку нельзя.", 409);
  let amount: string;
  try { amount = transportPay(row.transportPayBasis, row.quantityKg, Number(row.distanceKm), input); }
  catch (error) { seedCheck(false, (error as Error).message); throw error; }
  await tx.update(seeds).set({
    transportRate: amount, transportTariff: row.transportPayBasis === "ton_km" ? input.tariffPerTonKm!.toFixed(4) : null,
    transportVersion: row.transportVersion + 1, transportRateSetBy: `${access.displayName} · ${access.role}`,
    transportRateSetAt: new Date(),
  }).where(eq(seeds.id, id));
  await tx.insert(activityTable).values({
    action: "Начислена зарплата за доставку семян", templateName: `Рейс семян №${id} · поле №${row.fieldNumber} · ${amount} ₸`,
    userName: `${access.displayName} · ${access.role}`,
  });
}
