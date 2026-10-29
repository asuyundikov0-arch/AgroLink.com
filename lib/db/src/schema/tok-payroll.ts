import { pgTable, serial, text, integer, numeric, date, timestamp, index } from "drizzle-orm/pg-core";
import { employeesTable } from "./employees";

export const tokPayrollEntriesTable = pgTable("tok_payroll_entries", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  workDate: date("work_date", { mode: "string" }).notNull(),
  unit: text("unit").notNull(),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id),
  employeeName: text("employee_name").notNull(),
  workType: text("work_type").notNull(),
  payBasis: text("pay_basis").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
  rateKzt: numeric("rate_kzt", { precision: 14, scale: 2 }).notNull(),
  amountKzt: numeric("amount_kzt", { precision: 14, scale: 2 }).notNull(),
  notes: text("notes").notNull().default(""),
  version: integer("version").notNull().default(1),
  createdByUserId: text("created_by_user_id").notNull(),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("tok_payroll_date_unit_idx").on(table.workDate, table.unit)]);
