import { date, integer, numeric, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { grainCropsTable } from "./grain-crops";
import { grainMovementsTable } from "./grain-movements";
import { fieldSeasonsTable } from "./field-seasons";
import { fieldOperationsTable } from "./field-operations";
import { supportingTasksTable } from "./supporting-tasks";

export const seedMovementsTable = pgTable("seed_movements", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  fingerprint: text("fingerprint").notNull(),
  unit: text("unit").notNull(),
  cropId: integer("crop_id").notNull().references(() => grainCropsTable.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  quantityKg: integer("quantity_kg").notNull(),
  pricePerTonCents: numeric("price_per_ton_cents", { precision: 22, scale: 0 }).notNull(),
  amountCents: numeric("amount_cents", { precision: 22, scale: 0 }).notNull(),
  invoiceNumber: text("invoice_number").notNull().default(""),
  supplier: text("supplier").notNull().default(""),
  fromLocationId: integer("from_location_id"),
  grainMovementId: integer("grain_movement_id").unique().references(() => grainMovementsTable.id, { onDelete: "restrict" }),
  seasonId: integer("season_id").references(() => fieldSeasonsTable.id, { onDelete: "restrict" }),
  operationId: integer("operation_id").references(() => fieldOperationsTable.id, { onDelete: "restrict" }),
  supportingTaskId: integer("supporting_task_id").references(() => supportingTasksTable.id, { onDelete: "restrict" }),
  truckNumber: text("truck_number").notNull().default(""),
  driverEmployeeId: integer("driver_employee_id"),
  driverName: text("driver_name").notNull().default(""),
  transportPayBasis: text("transport_pay_basis").notNull().default("per_trip"),
  distanceKm: numeric("distance_km", { precision: 12, scale: 3 }).notNull().default("0"),
  transportRate: numeric("transport_rate", { precision: 16, scale: 2 }),
  transportTariff: numeric("transport_tariff", { precision: 16, scale: 4 }),
  transportVersion: integer("transport_version").notNull().default(1),
  transportRateSetBy: text("transport_rate_set_by").notNull().default(""),
  transportRateSetAt: timestamp("transport_rate_set_at", { withTimezone: true }),
  fieldNumber: text("field_number").notNull().default(""),
  notes: text("notes").notNull().default(""),
  approvalStatus: text("approval_status").notNull().default("pending"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  reviewedBy: text("reviewed_by").notNull().default(""),
  reviewNote: text("review_note").notNull().default(""),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
}, table => [index("seed_stock_unit_crop_date_idx").on(table.unit, table.cropId, table.occurredOn)]);
