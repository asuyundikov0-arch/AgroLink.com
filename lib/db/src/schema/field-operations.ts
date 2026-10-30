import { boolean, date, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { fieldSeasonsTable } from "./field-seasons";
import { employeesTable } from "./employees";
import { fleetEquipmentTable } from "./fleet-equipment";

export type FieldSupportingWorkRecord = {
  name: string; equipmentId: number | null; equipmentName?: string;
  employeeIds: number[]; employeeNames?: string[];
  salaryCost: number; fuelCost: number;
  seedName: string; seedQuantity: number; seedUnit: "kg" | "ton"; seedPrice: number;
};

export const fieldOperationsTable = pgTable("field_operations", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull().references(() => fieldSeasonsTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  isUnplanned: boolean("is_unplanned").notNull().default(false),
  requiresChemicals: boolean("requires_chemicals").notNull().default(false),
  chemicalModeExplicit: boolean("chemical_mode_explicit").notNull().default(false),
  chemicalPlan: jsonb("chemical_plan").$type<{ batchId: number; ratePerHa: number }[]>().notNull().default([]),
  supportingWorks: jsonb("supporting_works").$type<FieldSupportingWorkRecord[]>().notNull().default([]),
  seeds: jsonb("seeds").$type<{ name: string; quantity: number; unit: "kg" | "ton"; unitPrice: number }>(),
  actualSupportingWorks: jsonb("actual_supporting_works").$type<FieldSupportingWorkRecord[]>().notNull().default([]),
  approvalStatus: text("approval_status").notNull().default("approved"),
  approvalNote: text("approval_note").notNull().default(""),
  startedByUserId: text("started_by_user_id"),
  completionRequestedOn: date("completion_requested_on", { mode: "string" }),
  completionRequestedBy: text("completion_requested_by").notNull().default(""),
  actualAreaLimitAres: integer("actual_area_limit_ares"),
  plannedStart: date("planned_start", { mode: "string" }).notNull(),
  plannedEnd: date("planned_end", { mode: "string" }).notNull(),
  plannedAreaAres: integer("planned_area_ares").notNull(),
  plannedRatePerHa: numeric("planned_rate_per_ha", { precision: 14, scale: 2 }).notNull().default("0"),
  plannedFuelCost: numeric("planned_fuel_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  responsible: text("responsible").notNull().default(""),
  plannedMechanicEmployeeId: integer("planned_mechanic_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  plannedEquipmentId: integer("planned_equipment_id").references(() => fleetEquipmentTable.id, { onDelete: "set null" }),
  plannedEquipment: text("planned_equipment").notNull().default(""),
  plannedImplement: text("planned_implement").notNull().default(""),
  notes: text("notes").notNull().default(""),
  actualStart: date("actual_start", { mode: "string" }),
  actualEnd: date("actual_end", { mode: "string" }),
  actualAreaAres: integer("actual_area_ares").notNull().default(0),
  actualRatePerHa: numeric("actual_rate_per_ha", { precision: 14, scale: 2 }),
  actualRateSetBy: text("actual_rate_set_by").notNull().default(""),
  actualRateSetAt: timestamp("actual_rate_set_at", { withTimezone: true }),
  actualOperationName: text("actual_operation_name").notNull().default(""),
  actualMechanic: text("actual_mechanic").notNull().default(""),
  actualMechanicEmployeeId: integer("actual_mechanic_employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  actualEquipment: text("actual_equipment").notNull().default(""),
  actualImplement: text("actual_implement").notNull().default(""),
  actualNotes: text("actual_notes").notNull().default(""),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason").notNull().default(""),
  voidedBy: text("voided_by").notNull().default(""),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("field_operation_planned_pass_unique").on(table.seasonId, table.nameKey, table.plannedStart, table.plannedEnd).where(sql`${table.voidedAt} is null and ${table.isUnplanned} = false`)]);
