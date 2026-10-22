import { db, grainCropsTable, grainLocationsTable } from "@workspace/db";
import { grainNameKey, grainUnits } from "./grain-ledger";

export async function ensureGrainDefaults() {
  await db.insert(grainCropsTable).values(["Пшеница", "Лён", "Рапс"].map((name) => ({ name, nameKey: grainNameKey(name) }))).onConflictDoNothing();
  const locations = [
    { name: "Склад №1", kind: "warehouse" }, { name: "Склад №2", kind: "warehouse" },
    { name: "Зерноплощадка", kind: "yard" }, { name: "Элеватор", kind: "elevator" },
  ];
  await db.insert(grainLocationsTable).values(grainUnits.flatMap((unit) => locations.map((location) => ({
    ...location, unit, nameKey: grainNameKey(location.name),
  })))).onConflictDoNothing();
}
