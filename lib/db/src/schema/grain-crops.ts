import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const grainCropsTable = pgTable("grain_crops", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameKey: text("name_key").notNull().unique(),
});
