import { date, integer, numeric, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { fieldSeasonsTable } from "./field-seasons";
import { employeesTable } from "./employees";

export const chemicalInvoicesTable = pgTable("chemical_invoices", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  number: text("number").notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  supplier: text("supplier").notNull(),
  farm: text("farm").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chemicalBatchesTable = pgTable("chemical_batches", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => chemicalInvoicesTable.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  receivedMillis: integer("received_millis").notNull(),
  remainingMillis: integer("remaining_millis").notNull(),
  unitPriceCents: numeric("unit_price_cents", { precision: 16, scale: 0 }).notNull(),
  receivedCents: numeric("received_cents", { precision: 16, scale: 0 }).notNull(),
  remainingCents: numeric("remaining_cents", { precision: 16, scale: 0 }).notNull(),
});

export const chemicalIssuesTable = pgTable("chemical_issues", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  batchId: integer("batch_id").notNull().references(() => chemicalBatchesTable.id, { onDelete: "restrict" }),
  seasonId: integer("season_id").notNull().references(() => fieldSeasonsTable.id, { onDelete: "restrict" }),
  employeeId: integer("employee_id").notNull().references(() => employeesTable.id, { onDelete: "restrict" }),
  employeeName: text("employee_name").notNull(),
  quantityMillis: integer("quantity_millis").notNull(),
  amountCents: numeric("amount_cents", { precision: 16, scale: 0 }).notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
