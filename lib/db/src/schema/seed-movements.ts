import { date, integer, numeric, pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";
import { grainCropsTable } from "./grain-crops";
import { grainMovementsTable } from "./grain-movements";
import { fieldSeasonsTable } from "./field-seasons";
import { fieldOperationsTable } from "./field-operations";

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
