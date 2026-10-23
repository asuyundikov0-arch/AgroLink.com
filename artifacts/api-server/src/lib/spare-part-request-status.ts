import { eq } from "drizzle-orm";
import { db, sparePartRequestItemsTable, sparePartRequestsTable } from "@workspace/db";

export type SparePartRequestStatus =
  | "chief_review"
  | "director_review"
  | "awaiting_delivery"
  | "returned_to_engineer"
  | "completed"
  | "rejected";

export function aggregateSparePartRequestStatus(statuses: readonly string[]): SparePartRequestStatus {
  if (statuses.length === 0) return "rejected";
  if (statuses.every((status) => status === "received" || status === "rejected")) {
    return statuses.some((status) => status === "received") ? "completed" : "rejected";
  }
  if (statuses.includes("director_review")) return "director_review";
  if (statuses.includes("awaiting_delivery")) return "awaiting_delivery";
  if (statuses.includes("chief_review")) return "chief_review";
  if (statuses.includes("returned_to_engineer")) return "returned_to_engineer";
  return "chief_review";
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function refreshSparePartRequestStatus(tx: Tx, requestId: number): Promise<SparePartRequestStatus> {
  const items = await tx.select({ status: sparePartRequestItemsTable.status })
    .from(sparePartRequestItemsTable)
    .where(eq(sparePartRequestItemsTable.requestId, requestId));
  const status = aggregateSparePartRequestStatus(items.map((item) => item.status));
  await tx.update(sparePartRequestsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(sparePartRequestsTable.id, requestId));
  return status;
}
