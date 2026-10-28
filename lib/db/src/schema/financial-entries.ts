import { date, index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financialEntriesTable = pgTable("financial_entries", {
  id: serial("id").primaryKey(),
  book: text("book").notNull(),
  basis: text("basis").notNull(),
  direction: text("direction").notNull(),
  date: date("date", { mode: "string" }).notNull(),
  unit: text("unit").notNull(),
  category: text("category").notNull(),
  counterparty: text("counterparty").notNull().default(""),
  description: text("description").notNull().default(""),
  amountKzt: numeric("amount_kzt", { precision: 14, scale: 2 }).notNull(),
  status: text("status").notNull(),
  version: integer("version").notNull().default(1),
  clientRequestId: text("client_request_id").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  completedBy: text("completed_by").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  voidReason: text("void_reason").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("financial_entries_request_unique").on(table.clientRequestId),
  index("financial_entries_book_date_idx").on(table.book, table.date),
]);
export const insertFinancialEntrySchema = createInsertSchema(financialEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinancialEntry = z.infer<typeof insertFinancialEntrySchema>;
export type FinancialEntry = typeof financialEntriesTable.$inferSelect;
