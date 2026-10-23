import { date, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { fleetEquipmentTable } from "./fleet-equipment";
import { sparePartMovementsTable } from "./spare-parts";

export const repairExpensesTable = pgTable("repair_expenses", {
  id: serial("id").primaryKey(),
  fleetId: integer("fleet_id").notNull().references(() => fleetEquipmentTable.id, { onDelete: "restrict" }),
  incurredOn: date("incurred_on", { mode: "string" }),
  category: text("category").notNull(),
  amount: numeric("amount", { precision: 16, scale: 2 }).notNull(),
  description: text("description").notNull().default(""),
  source: text("source").notNull().default("manual"),
  sparePartMovementId: integer("spare_part_movement_id").references(() => sparePartMovementsTable.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
