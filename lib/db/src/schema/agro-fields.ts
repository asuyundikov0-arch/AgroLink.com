import { integer, pgTable, serial, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";

export const agroFieldsTable = pgTable("agro_fields", {
  id: serial("id").primaryKey(),
  unit: text("unit").notNull(),
  number: text("number").notNull(),
  numberKey: text("number_key").notNull(),
  areaAres: integer("area_ares").notNull(),
  notes: text("notes").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("agro_field_unit_number_unique").on(table.unit, table.numberKey)]);
