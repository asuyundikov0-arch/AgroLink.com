import { date, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { grainCropsTable } from "./grain-crops";
import { grainLocationsTable } from "./grain-locations";

export const grainMovementsTable = pgTable("grain_movements", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  unit: text("unit").notNull(),
  operation: text("operation").notNull(),
  cropId: integer("crop_id").notNull().references(() => grainCropsTable.id, { onDelete: "restrict" }),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  quantityKg: integer("quantity_kg").notNull(),
  stockKind: text("stock_kind").notNull().default("grain"),
  outputKg: integer("output_kg").notNull().default(0),
  deadWasteKg: integer("dead_waste_kg").notNull().default(0),
  grainWasteKg: integer("grain_waste_kg").notNull().default(0),
  moistureLossKg: integer("moisture_loss_kg").notNull().default(0),
  wasteToLocationId: integer("waste_to_location_id").references(() => grainLocationsTable.id, { onDelete: "restrict" }),
  fromLocationId: integer("from_location_id").references(() => grainLocationsTable.id, { onDelete: "restrict" }),
  toLocationId: integer("to_location_id").references(() => grainLocationsTable.id, { onDelete: "restrict" }),
  fieldName: text("field_name").notNull().default(""),
  counterparty: text("counterparty").notNull().default(""),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: text("voided_by").notNull().default(""),
  voidReason: text("void_reason").notNull().default(""),
});
