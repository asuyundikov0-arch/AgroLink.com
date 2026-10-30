import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const payrollRegistersTable = pgTable("payroll_registers", {
  id: serial("id").primaryKey(),
  workDate: date("work_date", { mode: "string" }).notNull(),
  unit: text("unit").notNull(),
  sourceGroup: text("source_group"),
  status: text("status").notNull().default("draft"),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  submittedByName: text("submitted_by_name").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  hrApprovedByUserId: text("hr_approved_by_user_id").notNull().default(""),
  hrApprovedByName: text("hr_approved_by_name").notNull().default(""),
  hrApprovedAt: timestamp("hr_approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("payroll_registers_work_date_unit_idx").on(table.workDate, table.unit),
  index("payroll_registers_status_date_idx").on(table.status, table.workDate),
]);

export const payrollRegisterItemsTable = pgTable("payroll_register_items", {
  id: serial("id").primaryKey(),
  registerId: integer("register_id").notNull().references(() => payrollRegistersTable.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").references(() => employeesTable.id, { onDelete: "set null" }),
  employeeName: text("employee_name").notNull(),
  workType: text("work_type").notNull(),
  details: text("details").notNull().default(""),
  amountKzt: numeric("amount_kzt", { precision: 14, scale: 2 }).notNull(),
  sourceType: text("source_type").notNull().default("manual"),
  sourceId: integer("source_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("payroll_register_items_register_idx").on(table.registerId, table.id),
  index("payroll_register_items_employee_idx").on(table.employeeId, table.employeeName),
  uniqueIndex("payroll_register_items_source_employee_unique").on(table.sourceType, table.sourceId, table.employeeId),
]);

export type PayrollRegister = typeof payrollRegistersTable.$inferSelect;
export type PayrollRegisterItem = typeof payrollRegisterItemsTable.$inferSelect;
