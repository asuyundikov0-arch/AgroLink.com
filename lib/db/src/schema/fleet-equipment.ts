import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const fleetEquipmentTable = pgTable("fleet_equipment", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull(),
  registrationNumber: text("registration_number"),
  registrationKey: text("registration_key").unique(),
  unit: text("unit").notNull(),
  version: integer("version").notNull().default(1),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
