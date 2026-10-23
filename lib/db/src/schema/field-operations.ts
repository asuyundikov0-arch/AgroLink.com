import { date, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { fieldSeasonsTable } from "./field-seasons";

export const fieldOperationsTable = pgTable("field_operations", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => fieldSeasonsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  plannedStart: date("planned_start", { mode: "string" }).notNull(),
  plannedEnd: date("planned_end", { mode: "string" }).notNull(),
  plannedAreaAres: integer("planned_area_ares").notNull(),
  responsible: text("responsible").notNull().default(""),
  plannedEquipment: text("planned_equipment").notNull().default(""),
  plannedImplement: text("planned_implement").notNull().default(""),
  notes: text("notes").notNull().default(""),
  actualStart: date("actual_start", { mode: "string" }),
  actualEnd: date("actual_end", { mode: "string" }),
  actualAreaAres: integer("actual_area_ares").notNull().default(0),
  actualOperationName: text("actual_operation_name").notNull().default(""),
  actualMechanic: text("actual_mechanic").notNull().default(""),
  actualEquipment: text("actual_equipment").notNull().default(""),
  actualImplement: text("actual_implement").notNull().default(""),
  actualNotes: text("actual_notes").notNull().default(""),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason").notNull().default(""),
  voidedBy: text("voided_by").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("field_operation_active_pass_unique").on(table.seasonId, table.nameKey, table.plannedStart, table.plannedEnd).where(sql`${table.voidedAt} is null`)]);
