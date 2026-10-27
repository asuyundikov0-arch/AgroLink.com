import { date, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fieldSeasonsTable } from "./field-seasons";
import { employeesTable } from "./employees";
import { fieldOperationsTable } from "./field-operations";

export const chemicalRequestsTable = pgTable("chemical_requests", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  operationId: integer("operation_id").notNull().references(() => fieldOperationsTable.id, { onDelete: "restrict" }),
  batchId: integer("batch_id").notNull().references(() => chemicalBatchesTable.id, { onDelete: "restrict" }),
  quantityMillis: integer("quantity_millis").notNull(),
  requesterUserId: text("requester_user_id").notNull(),
  requesterName: text("requester_name").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  employeeId: integer("employee_id").references(() => employeesTable.id, { onDelete: "restrict" }),
  employeeName: text("employee_name").notNull(),
  chemicalRequestId: integer("chemical_request_id").references(() => chemicalRequestsTable.id, { onDelete: "restrict" }),
  quantityMillis: integer("quantity_millis").notNull(),
  amountCents: numeric("amount_cents", { precision: 16, scale: 0 }).notNull(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chemicalConsumptionsTable = pgTable("chemical_consumptions", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull().unique(),
  issueId: integer("issue_id").notNull().references(() => chemicalIssuesTable.id, { onDelete: "restrict" }),
  operationId: integer("operation_id").notNull().references(() => fieldOperationsTable.id, { onDelete: "restrict" }),
  reportDate: date("report_date", { mode: "string" }).notNull(),
  quantityMillis: integer("quantity_millis").notNull(),
  amountCents: numeric("amount_cents", { precision: 16, scale: 0 }).notNull(),
  dailyAreaAres: integer("daily_area_ares").notNull(),
  confirmedBy: text("confirmed_by").notNull(),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("chemical_consumption_issue_day_unique").on(t.issueId, t.reportDate)]);
