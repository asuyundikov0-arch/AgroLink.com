import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { fieldOperationsTable, type FieldSupportingWorkRecord } from "./field-operations";

export type SupportingService = "tok" | "motor_pool" | "fuel";
export type SupportingTaskDetails = {
  title: string; startDate: string; endDate: string; equipmentId: number | null;
  equipmentName: string; employeeIds: number[]; employeeNames: string[];
  salaryBudget: number; fuelBudget: number; quantity: number; quantityUnit: string;
  notes: string; services: SupportingService[];
};
export type SupportingDelivery = {
  service: SupportingService; status: "sent" | "accepted";
  acceptedBy: string; acceptedAt: string | null;
};
export const supportingTasksTable = pgTable("supporting_tasks", {
  id: serial("id").primaryKey(),
  operationId: integer("operation_id").notNull().references(() => fieldOperationsTable.id, { onDelete: "restrict" }),
  sourceIndex: integer("source_index").notNull(),
  sourceSnapshot: jsonb("source_snapshot").$type<FieldSupportingWorkRecord>().notNull(),
  context: jsonb("context").$type<{ fieldId: number; fieldNumber: string; farm: string; year: number; operationName: string }>().notNull(),
  details: jsonb("details").$type<SupportingTaskDetails>().notNull(),
  status: text("status").$type<"draft" | "sent">().notNull().default("draft"),
  deliveries: jsonb("deliveries").$type<SupportingDelivery[]>().notNull().default([]),
  version: integer("version").notNull().default(1),
  requestId: text("request_id").notNull(),
  createFingerprint: text("create_fingerprint").notNull(),
  createdByUserId: text("created_by_user_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
}, (t) => [uniqueIndex("supporting_task_creator_request_unique").on(t.createdByUserId, t.requestId)]);
