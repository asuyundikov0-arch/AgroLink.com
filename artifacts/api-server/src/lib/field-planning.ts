import { grainBusinessDate, validGrainDate } from "./grain-ledger";
import type { FieldActualInput, FieldOperationInput } from "@workspace/api-zod";

export const fieldNumberKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ru");
export function toAreaAres(value: number, allowZero = false) {
  return Number.isFinite(value) && value >= (allowZero ? 0 : 0.01) && value <= 1000000 && Number(value.toFixed(2)) === value
    ? Math.round(value * 100) : null;
}
export function validateFieldPlan(input: FieldOperationInput, seasonAreaAres: number) {
  if (!input.name.trim()) return "Укажите название полевой операции.";
  if (!validGrainDate(input.plannedStart) || !validGrainDate(input.plannedEnd) || input.plannedEnd < input.plannedStart) return "Укажите корректные плановые даты: окончание не раньше начала.";
  const area = toAreaAres(input.plannedAreaHa);
  if (area === null || area > seasonAreaAres) return "Плановая площадь должна быть положительной, с точностью до 0,01 га, и не больше площади поля в сезоне.";
  return null;
}
export function validateFieldActual(input: FieldActualInput, plannedAreaAres: number, today = grainBusinessDate()) {
  const area = toAreaAres(input.actualAreaHa, true);
  if (area === null || area > plannedAreaAres) return "Фактическая площадь должна быть от 0 до плановой, с точностью до 0,01 га.";
  for (const date of [input.actualStart, input.actualEnd]) {
    if (date !== null && (!validGrainDate(date) || date > today)) return "Фактическая дата должна быть корректной и не позднее сегодняшней.";
  }
  if ((area > 0 || input.actualEnd !== null) && input.actualStart === null) return "Перед указанием площади или завершения внесите фактическую дату начала.";
  if (input.actualEnd !== null && input.actualStart !== null && input.actualEnd < input.actualStart) return "Фактическое завершение не может быть раньше начала.";
  if (input.actualEnd !== null && area === 0) return "Для завершённой операции укажите фактически обработанную площадь.";
  return null;
}
export function fieldOperationState(row: {
  actualStart: string | null; actualEnd: string | null; actualAreaAres: number;
  plannedAreaAres: number; plannedEnd: string; voidedAt: Date | string | null;
}, today = grainBusinessDate()) {
  const status = row.voidedAt ? "cancelled" : row.actualEnd ? "completed" : row.actualStart ? "in_progress" : "planned";
  return {
    status,
    isOverdue: status !== "cancelled" && status !== "completed" && row.plannedEnd < today,
    progressPercent: row.plannedAreaAres > 0 ? Math.round(row.actualAreaAres * 10000 / row.plannedAreaAres) / 100 : 0,
  };
}
