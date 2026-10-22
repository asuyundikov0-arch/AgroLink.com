import { pgTable, serial, text, uniqueIndex } from "drizzle-orm/pg-core";

export const grainLocationsTable = pgTable("grain_locations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull(),
  kind: text("kind").notNull(),
  unit: text("unit").notNull(),
}, (table) => [uniqueIndex("grain_location_unit_name_idx").on(table.unit, table.nameKey)]);
