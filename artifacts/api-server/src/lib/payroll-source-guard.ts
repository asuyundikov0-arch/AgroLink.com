import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, fieldOperationProgressTable, payrollRegisterItemsTable } from "@workspace/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Sending a snapshot and changing its sources must never race.
export async function lockPayrollSources(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(718392008)`);
}

export async function grainTripWasSubmitted(tx: Tx, id: number) {
  const [item] = await tx.select({ id: payrollRegisterItemsTable.id })
    .from(payrollRegisterItemsTable).where(and(
      eq(payrollRegisterItemsTable.sourceType, "grain_trip"),
      eq(payrollRegisterItemsTable.sourceId, id),
    )).limit(1);
  return Boolean(item);
}

export async function fieldPayrollWasSubmitted(tx: Tx, operationId: number) {
  const progressIds = tx.select({ id: fieldOperationProgressTable.id })
    .from(fieldOperationProgressTable).where(eq(fieldOperationProgressTable.operationId, operationId));
  const [item] = await tx.select({ id: payrollRegisterItemsTable.id })
    .from(payrollRegisterItemsTable).where(or(
      and(eq(payrollRegisterItemsTable.sourceType, "field_operation"), eq(payrollRegisterItemsTable.sourceId, operationId)),
      and(eq(payrollRegisterItemsTable.sourceType, "field_progress"), inArray(payrollRegisterItemsTable.sourceId, progressIds)),
    )).limit(1);
  return Boolean(item);
}

/** Changing an earlier cumulative total would also change a later saved wage line. */
export async function fieldPayrollLockedThrough(tx: Tx, operationId: number): Promise<string | null> {
  const rows = await tx.select({
    sourceType: payrollRegisterItemsTable.sourceType,
    reportDate: fieldOperationProgressTable.reportDate,
  }).from(payrollRegisterItemsTable)
    .leftJoin(fieldOperationProgressTable, and(
      eq(payrollRegisterItemsTable.sourceType, "field_progress"),
      eq(payrollRegisterItemsTable.sourceId, fieldOperationProgressTable.id),
    )).where(or(
      and(eq(payrollRegisterItemsTable.sourceType, "field_operation"), eq(payrollRegisterItemsTable.sourceId, operationId)),
      eq(fieldOperationProgressTable.operationId, operationId),
    ));
  if (rows.some(row => row.sourceType === "field_operation")) return "9999-12-31";
  return rows.reduce<string | null>((latest, row) =>
    row.reportDate && (!latest || row.reportDate > latest) ? row.reportDate : latest, null);
}
