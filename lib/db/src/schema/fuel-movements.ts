import { date, index, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { fleetEquipmentTable } from "./fleet-equipment";
import { fieldOperationsTable } from "./field-operations";

// Immutable receipt/issue ledger. Quantity is thousandths of a litre; value is kopecks.
export const fuelMovementsTable = pgTable("fuel_movements", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  kind: text("kind").notNull(),
  farm: text("farm").notNull(),
  fuelType: text("fuel_type").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  quantityMillis: integer("quantity_millis").notNull(),
  amountCents: numeric("amount_cents", { precision: 16, scale: 0 }).notNull(),
  pricePerLiterCents: numeric("price_per_liter_cents", { precision: 16, scale: 0 }).notNull(),
  fleetId: integer("fleet_id").references(() => fleetEquipmentTable.id, { onDelete: "restrict" }),
  operationId: integer("operation_id").references(() => fieldOperationsTable.id, { onDelete: "restrict" }),
  invoiceNumber: text("invoice_number").notNull().default(""),
  supplier: text("supplier").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("fuel_movements_farm_type_date_idx").on(table.farm, table.fuelType, table.occurredOn),
  index("fuel_movements_operation_idx").on(table.operationId),
]);
