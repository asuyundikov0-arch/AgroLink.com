import type { GrainMovementInput } from "@workspace/api-zod";
import { toGrainKg } from "./grain-ledger";

const nonnegativeKg = (value: number) => value === 0 ? 0 : toGrainKg(value);

/** Validate one actually processed portion, not the entire processor's remaining stock. */
export function processingWeights(input: GrainMovementInput) {
  const processing = input.operation === "drying" || input.operation === "cleaning";
  const outputKg = nonnegativeKg(input.outputTons ?? 0);
  const deadWasteKg = nonnegativeKg(input.deadWasteTons ?? 0);
  const grainWasteKg = nonnegativeKg(input.grainWasteTons ?? 0);
  if (outputKg === null || deadWasteKg === null || grainWasteKg === null) {
    return { error: "Все веса должны быть неотрицательными, с точностью до 0,001 т и не более 1 000 000 т." } as const;
  }
  if (!processing) {
    if (outputKg || deadWasteKg || grainWasteKg || input.wasteToLocationId != null) {
      return { error: "Выход и отходы заполняются только для сушки или очистки." } as const;
    }
    if (input.operation === "receipt" && input.stockKind === "grain_waste") {
      return { error: "Приход с поля учитывается как зерно, не как зерновые отходы." } as const;
    }
    return { outputKg: 0, deadWasteKg: 0, grainWasteKg: 0, moistureLossKg: 0 } as const;
  }
  if (input.stockKind === "grain_waste") return { error: "Переработка выполняется только для зерна." } as const;
  if (input.fromLocationId === null || input.toLocationId === null || input.fromLocationId === input.toLocationId) {
    return { error: "Выберите установку-источник и отдельное место размещения готового зерна." } as const;
  }
  if ((grainWasteKg > 0) !== (input.wasteToLocationId != null)) {
    return { error: "Укажите место размещения зерновых отходов только при их наличии." } as const;
  }
  const inputKg = toGrainKg(input.quantityTons);
  if (inputKg === null) return { error: "Укажите фактически переработанный положительный вес с точностью до 0,001 т." } as const;
  const moistureLossKg = inputKg - outputKg - deadWasteKg - grainWasteKg;
  if (moistureLossKg < 0) return { error: "Сумма готового зерна и отходов превышает переработанный вес." } as const;
  if (input.operation === "cleaning" && moistureLossKg !== 0) {
    return { error: "При очистке весь переработанный вес должен быть распределён: готовое зерно + мёртвый сор + зерновые отходы." } as const;
  }
  return { outputKg, deadWasteKg, grainWasteKg, moistureLossKg } as const;
}
