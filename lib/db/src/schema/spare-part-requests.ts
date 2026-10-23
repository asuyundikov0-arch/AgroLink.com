import { createInsertSchema } from "drizzle-zod";
import { integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { fleetEquipmentTable } from "./fleet-equipment";

export const sparePartRequestsTable = pgTable("spare_part_requests", {
  id: serial("id").primaryKey(),
  requestId: text("request_id").notNull(),
  requesterUserId: text("requester_user_id").notNull(),
  requesterName: text("requester_name").notNull(),
  department: text("department").notNull(),
  status: text("status").notNull().default("chief_review"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("spare_part_requests_request_id_unique").on(table.requestId),
]);

export const sparePartRequestItemsTable = pgTable("spare_part_request_items", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => sparePartRequestsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  articleNumber: text("article_number").notNull().default(""),
  unit: text("unit").notNull().default("шт."),
  quantity: numeric("quantity", { precision: 16, scale: 3 }).notNull(),
  fleetId: integer("fleet_id").notNull().references(() => fleetEquipmentTable.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("chief_review"),
  unitPrice: numeric("unit_price", { precision: 16, scale: 2 }),
  chiefComment: text("chief_comment").notNull().default(""),
  directorComment: text("director_comment").notNull().default(""),
  receivedQuantity: numeric("received_quantity", { precision: 16, scale: 3 }).notNull().default("0"),
  chiefReviewedByName: text("chief_reviewed_by_name").notNull().default(""),
  chiefReviewedAt: timestamp("chief_reviewed_at", { withTimezone: true }),
  directorReviewedByName: text("director_reviewed_by_name").notNull().default(""),
  directorReviewedAt: timestamp("director_reviewed_at", { withTimezone: true }),
  receivedByName: text("received_by_name").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSparePartRequestSchema = createInsertSchema(sparePartRequestsTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export const insertSparePartRequestItemSchema = createInsertSchema(sparePartRequestItemsTable)
  .omit({ id: true, updatedAt: true });

export type InsertSparePartRequest = z.infer<typeof insertSparePartRequestSchema>;
export type SparePartRequest = typeof sparePartRequestsTable.$inferSelect;
export type InsertSparePartRequestItem = z.infer<typeof insertSparePartRequestItemSchema>;
export type SparePartRequestItem = typeof sparePartRequestItemsTable.$inferSelect;
