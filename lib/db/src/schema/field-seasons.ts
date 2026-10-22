import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { agroFieldsTable } from "./agro-fields";

export const fieldSeasonsTable = pgTable("field_seasons", {
  id: serial("id").primaryKey(),
  fieldId: integer("field_id").notNull().references(() => agroFieldsTable.id, { onDelete: "restrict" }),
  year: integer("year").notNull(),
  cropName: text("crop_name").notNull(),
  variety: text("variety").notNull().default(""),
  areaAres: integer("area_ares").notNull(),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("field_season_field_year_unique").on(table.fieldId, table.year)]);
