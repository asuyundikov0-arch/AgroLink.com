import type { FieldSeedPlan } from "@workspace/api-zod";
import { isSeedingOperation } from "./daily-seeding";
import { chemicalCheck as check } from "./chemical-stock";

/** Planned seed budgets belong to sowing itself, never supporting works or actual stock expenses. */
export function validateFieldSeeds(name: string, seeds: FieldSeedPlan | null | undefined) {
  if (!seeds) return null;
  check(isSeedingOperation(name), "Семена указываются только для операции посева.");
  check(seeds.name.trim().length > 0, "Укажите наименование семян.");
  check(Number.isFinite(seeds.quantity) && seeds.quantity >= 0 && seeds.quantity <= 1e6 &&
    Math.abs(seeds.quantity * 1000 - Math.round(seeds.quantity * 1000)) < 0.0001,
  "Количество семян — до трёх знаков после запятой.");
  check(Number.isFinite(seeds.unitPrice) && seeds.unitPrice >= 0 && seeds.unitPrice <= 1e9 &&
    Math.abs(seeds.unitPrice * 100 - Math.round(seeds.unitPrice * 100)) < 0.0001,
  "Цена семян — до двух знаков после запятой.");
  check(seeds.unit === "kg" || seeds.unit === "ton", "Выберите единицу измерения семян.");
  check(seeds.quantity * seeds.unitPrice <= 1e12, "Стоимость семян слишком велика.");
  return { ...seeds, name: seeds.name.trim() };
}
