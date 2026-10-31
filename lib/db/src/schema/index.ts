// Export your models here. Add one export per file
export * from "./field-boundaries";
// export * from "./posts";
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export * from "./role-applications";
export * from "./equipment-repairs";
export * from "./fleet-equipment";
export * from "./repair-expenses";
export * from "./spare-parts";
export * from "./spare-part-requests";
export * from "./grain-crops";
export * from "./grain-locations";
export * from "./grain-movements";
export * from "./agro-fields";
export * from "./field-seasons";
export * from "./field-operations";
export * from "./field-operation-progress";
export * from "./payroll-registers";
export * from "./tok-payroll";
export * from "./employees";
export * from "./financial-entries";
export * from "./chemical-warehouse";
export * from "./fuel-movements";
export * from "./seed-movements";
export * from "./supporting-tasks";

export const templatesTable = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  department: text("department").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: text("file_size").notNull(),
  fileType: text("file_type").notNull(),
  version: text("version").notNull().default("v1.0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text("updated_by").notNull().default("Администратор"),
  downloads: integer("downloads").notNull().default(0),
  accessGroup: text("access_group").notNull().default("all"),
  fileUrl: text("file_url").notNull().default(""),
  status: text("status").notNull().default("active"),
});

export const activityTable = pgTable("activity", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  templateName: text("template_name").notNull(),
  userName: text("user_name").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  unit: text("unit").notNull(),
  reportType: text("report_type").notNull().default("agronomy"),
  fileName: text("file_name").notNull(),
  fileSize: text("file_size").notNull(),
  fileUrl: text("file_url").notNull(),
  submittedBy: text("submitted_by").notNull(),
  submittedByUserId: text("submitted_by_user_id").notNull().default(""),
  recipientRole: text("recipient_role").notNull().default(""),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
  status: text("status").notNull().default("submitted"),
  reviewerComment: text("reviewer_comment").notNull().default(""),
  reviewedBy: text("reviewed_by").notNull().default(""),
  archiveSection: text("archive_section").notNull().default(""),
  archiveSubarchive: text("archive_subarchive").notNull().default(""),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  archivedBy: text("archived_by").notNull().default(""),
});

export const insertTemplateSchema = createInsertSchema(templatesTable).omit({ id: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templatesTable.$inferSelect;
export type Activity = typeof activityTable.$inferSelect;
export type Report = typeof reportsTable.$inferSelect;