import { boolean, index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const employeesTable = pgTable("employees", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  department: text("department").notNull().default(""),
  payrollGroup: text("payroll_group"),
  position: text("position").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("employees_active_name_idx").on(table.isActive, table.fullName),
]);

export type Employee = typeof employeesTable.$inferSelect;
