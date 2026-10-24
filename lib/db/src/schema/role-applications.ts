import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const appRoles = [
  "agronomist",
  "chief_agronomist",
  "grain_manager",
  "weigher",
  "dispatcher",
  "engineer",
  "chief_engineer",
  "storekeeper",
  "economist",
  "lawyer",
  "farm_director",
  "general_director",
] as const;

export type AppRole = (typeof appRoles)[number];

export const roleApplicationStatuses = ["pending", "approved", "rejected"] as const;
export type RoleApplicationStatus = (typeof roleApplicationStatuses)[number];

export const roleApplicationsTable = pgTable(
  "role_applications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    department: text("department").notNull(),
    requestedRole: text("requested_role").notNull(),
    status: text("status").notNull().default("pending"),
    reviewComment: text("review_comment").notNull().default(""),
    reviewedByUserId: text("reviewed_by_user_id").notNull().default(""),
    reviewedByName: text("reviewed_by_name").notNull().default(""),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("role_applications_user_id_unique").on(table.userId)],
);