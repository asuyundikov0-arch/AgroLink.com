import { and, eq, isNull, sql } from "drizzle-orm";
import { db, equipmentRepairsTable, fleetEquipmentTable, repairExpensesTable } from "@workspace/db";
import type { RepairInput } from "@workspace/api-zod";

export function registrationKey(value: string): string {
  return value.normalize("NFKC").toUpperCase().replace(/[\s\-–—]/g, "");
}

export type LedgerAmount = { category: string; amount: number | string };
export function ledgerTotals(entries: LedgerAmount[]): Pick<RepairInput, "capitalCost" | "currentCost" | "tiresCost" | "oilsCost" | "serviceCost"> {
  if (!entries.length) return { capitalCost: null, currentCost: null, tiresCost: null, oilsCost: null, serviceCost: null };
  const sum = (categories: string[]) => entries.reduce((total, e) =>
    total + (categories.includes(e.category) ? Math.round(Number(e.amount) * 100) : 0), 0) / 100;
  return {
    capitalCost: sum(["capital"]), currentCost: sum(["current", "tires", "oils", "service"]),
    tiresCost: sum(["tires"]), oilsCost: sum(["oils"]), serviceCost: sum(["service"]),
  };
}

export function legacyExpenseAmounts(row: Pick<RepairInput, "capitalCost" | "currentCost" | "tiresCost" | "oilsCost" | "serviceCost">): LedgerAmount[] {
  const minor = (value: number | null) => Math.round((value ?? 0) * 100);
  const detail = minor(row.tiresCost) + minor(row.oilsCost) + minor(row.serviceCost);
  const result: LedgerAmount[] = [];
  if (row.capitalCost !== null) result.push({ category: "capital", amount: row.capitalCost });
  if (row.currentCost !== null) result.push({ category: "current", amount: (minor(row.currentCost) - detail) / 100 });
  if (row.tiresCost !== null) result.push({ category: "tires", amount: row.tiresCost });
  if (row.oilsCost !== null) result.push({ category: "oils", amount: row.oilsCost });
  if (row.serviceCost !== null) result.push({ category: "service", amount: row.serviceCost });
  return result;
}

// Additive, idempotent migration: never remove the original row or financial columns.
// Unknown registration numbers and expense dates remain unknown, not invented.
export async function migrateLegacyRepairs() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(718392004)`);
    const rows = await tx.select().from(equipmentRepairsTable).where(isNull(equipmentRepairsTable.fleetId));
    for (const row of rows) {
      const [fleet] = await tx.insert(fleetEquipmentTable).values({
        kind: row.equipment, registrationNumber: null, registrationKey: null,
        unit: row.unit, updatedBy: row.updatedBy,
      }).returning();
      const values = legacyExpenseAmounts({
        capitalCost: row.capitalCost === null ? null : Number(row.capitalCost),
        currentCost: row.currentCost === null ? null : Number(row.currentCost),
        tiresCost: row.tiresCost === null ? null : Number(row.tiresCost),
        oilsCost: row.oilsCost === null ? null : Number(row.oilsCost),
        serviceCost: row.serviceCost === null ? null : Number(row.serviceCost),
      });
      if (values.length) await tx.insert(repairExpensesTable).values(values.map((value) => ({
        fleetId: fleet.id, category: value.category, amount: Number(value.amount).toFixed(2),
        incurredOn: null, source: "legacy", description: "Перенесено из ранее заполненного отчёта. Дата расхода не указана.",
        updatedBy: row.updatedBy,
      })));
      await tx.update(equipmentRepairsTable).set({ fleetId: fleet.id })
        .where(and(eq(equipmentRepairsTable.id, row.id), isNull(equipmentRepairsTable.fleetId)));
    }
  });
}
