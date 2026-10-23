import { date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fieldOperationsTable } from "./field-operations";

export const fieldOperationProgressTable = pgTable("field_operation_progress", {
  id: serial("id").primaryKey(),
  operationId: integer("operation_id").notNull().references(() => fieldOperationsTable.id, { onDelete: "cascade" }),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  cumulativeAreaAres: integer("cumulative_area_ares").notNull(),
  actualMechanic: text("actual_mechanic").notNull().default(""),
  actualEquipment: text("actual_equipment").notNull().default(""),
  actualImplement: text("actual_implement").notNull().default(""),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("field_operation_progress_day_unique").on(table.operationId, table.reportDate),
]);

export type FieldOperationProgress = typeof fieldOperationProgressTable.$inferSelect;
