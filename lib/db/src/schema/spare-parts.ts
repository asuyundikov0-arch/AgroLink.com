import { date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fleetEquipmentTable } from "./fleet-equipment";

export const sparePartsTable = pgTable("spare_parts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  articleNumber: text("article_number").notNull().default(""),
  articleKey: text("article_key").notNull().default(""),
  unit: text("unit").notNull(),
  unitKey: text("unit_key").notNull(),
  quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull().default("0"),
  averageUnitCost: numeric("average_unit_cost", { precision: 16, scale: 2 }).notNull().default("0"),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("spare_parts_name_article_unit_unique").on(table.nameKey, table.articleKey, table.unitKey),
]);

export const sparePartMovementsTable = pgTable("spare_part_movements", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  sparePartId: integer("spare_part_id").notNull().references(() => sparePartsTable.id, { onDelete: "restrict" }),
  movementKind: text("movement_kind").notNull(),
  quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
  unitPrice: numeric("unit_price", { precision: 16, scale: 2 }).notNull(),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  invoiceNumber: text("invoice_number").notNull().default(""),
  invoiceDate: date("invoice_date", { mode: "string" }),
  supplier: text("supplier").notNull().default(""),
  fleetId: integer("fleet_id").references(() => fleetEquipmentTable.id, { onDelete: "restrict" }),
  description: text("description").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
