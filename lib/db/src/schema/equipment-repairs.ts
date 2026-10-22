import { date, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const equipmentRepairsTable = pgTable("equipment_repairs", {
  id: serial("id").primaryKey(),
  equipment: text("equipment").notNull(),
  responsible: text("responsible").notNull(),
  unit: text("unit").notNull(),
  plannedStart: date("planned_start", { mode: "string" }),
  plannedEnd: date("planned_end", { mode: "string" }),
  actualStart: date("actual_start", { mode: "string" }),
  actualEnd: date("actual_end", { mode: "string" }),
  readiness: numeric("readiness", { precision: 5, scale: 2 }),
  capitalCost: numeric("capital_cost", { precision: 16, scale: 2 }),
  currentCost: numeric("current_cost", { precision: 16, scale: 2 }),
  tiresCost: numeric("tires_cost", { precision: 16, scale: 2 }),
  oilsCost: numeric("oils_cost", { precision: 16, scale: 2 }),
  serviceCost: numeric("service_cost", { precision: 16, scale: 2 }),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
