import { integer, jsonb, numeric, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { agroFieldsTable } from "./agro-fields";

export type FieldBoundaryGeometry = { type: "Polygon"; coordinates: number[][][] };

export const fieldBoundaryImportsTable = pgTable("field_boundary_imports", {
  key: text("key").primaryKey(),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const fieldBoundariesTable = pgTable("field_boundaries", {
  fieldId: integer("field_id").primaryKey().references(() => agroFieldsTable.id, { onDelete: "cascade" }),
  geometry: jsonb("geometry").$type<FieldBoundaryGeometry>().notNull(),
  contourAreaHa: numeric("contour_area_ha", { precision: 14, scale: 2 }).notNull(),
  source: text("source").notNull().default("KML"),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});
