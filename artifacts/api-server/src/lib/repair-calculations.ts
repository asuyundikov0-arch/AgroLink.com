import type { RepairEntry, RepairInput, RepairSummary } from "@workspace/api-zod";

export const repairCostFields = ["capitalCost", "currentCost", "tiresCost", "oilsCost", "serviceCost"] as const;
const dayMilliseconds = 86_400_000;

// All date arithmetic is on calendar dates, not local instants or DST offsets.
export function dayDifference(end: string, start: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / dayMilliseconds);
}

export function repairBusinessDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "2200-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const cents = (value: number | null) => Math.round((value ?? 0) * 100);

export function validateRepairInput(input: RepairInput, today = repairBusinessDate()): string | null {
  if (!input.equipment.trim() || !input.responsible.trim()) return "Укажите технику и ответственного за ремонт.";
  for (const field of ["plannedStart", "plannedEnd", "actualStart", "actualEnd"] as const) {
    if (input[field] !== null && !validDate(input[field])) return "Укажите корректные даты в формате ГГГГ-ММ-ДД.";
  }
  if (input.plannedStart && input.plannedEnd && input.plannedEnd < input.plannedStart) {
    return "Плановое окончание не может быть раньше планового начала ремонта.";
  }
  if (input.actualEnd && !input.actualStart) return "Для завершённого ремонта укажите фактическое начало.";
  if (input.actualStart && input.actualEnd && input.actualEnd < input.actualStart) {
    return "Фактическое окончание не может быть раньше фактического начала ремонта.";
  }
  if ((input.actualStart && input.actualStart > today) || (input.actualEnd && input.actualEnd > today)) {
    return "Фактические даты не могут находиться в будущем. Для планирования используйте плановые даты.";
  }
  for (const field of [...repairCostFields, "readiness"] as const) {
    const value = input[field];
    if (value !== null && (!Number.isFinite(value) || Math.abs(value * 100 - Math.round(value * 100)) > 0.01)) {
      return "Укажите конечные числовые значения с точностью не более двух знаков после запятой.";
    }
  }
  const detail = cents(input.tiresCost) + cents(input.oilsCost) + cents(input.serviceCost);
  if (detail > cents(input.currentCost)) {
    return "Резина, масла и сервис входят в текущий ремонт: их сумма не должна превышать затраты на текущий ремонт.";
  }
  return null;
}

export function calculateRepair(input: RepairInput, today: string) {
  const deviationDays = input.plannedEnd && input.actualEnd
    ? dayDifference(input.actualEnd, input.plannedEnd) : null;
  const deviationPercent = input.plannedStart && input.plannedEnd && input.actualStart && input.actualEnd
    ? (dayDifference(input.actualEnd, input.actualStart) - dayDifference(input.plannedEnd, input.plannedStart))
      / Math.max(1, dayDifference(input.plannedEnd, input.plannedStart)) * 100
    : null;
  const overdueDays = !input.actualEnd && input.plannedEnd && today > input.plannedEnd
    ? dayDifference(today, input.plannedEnd) : 0;
  const status = input.actualEnd ? "completed" as const
    : overdueDays > 0 ? "overdue" as const
      : input.actualStart || (input.readiness ?? 0) > 0 ? "in_progress" as const : "planned" as const;
  return {
    status,
    readiness: input.actualEnd ? 100 : input.readiness,
    totalCost: input.capitalCost === null && input.currentCost === null
      ? null : (cents(input.capitalCost) + cents(input.currentCost)) / 100,
    deviationDays,
    deviationPercent,
    overdueDays,
  };
}

export function summarizeRepairs(items: RepairEntry[]): RepairSummary {
  const sum = (key: (typeof repairCostFields)[number] | "totalCost") =>
    items.reduce((total, item) => total + cents(item[key]), 0) / 100;
  const readinessValues = items.map((item) => item.readiness).filter((value): value is number => value !== null);
  return {
    total: items.length,
    planned: items.filter((item) => item.status === "planned").length,
    inProgress: items.filter((item) => item.status === "in_progress").length,
    overdue: items.filter((item) => item.status === "overdue").length,
    completed: items.filter((item) => item.status === "completed").length,
    totalCost: sum("totalCost"),
    capitalCost: sum("capitalCost"),
    currentCost: sum("currentCost"),
    tiresCost: sum("tiresCost"),
    oilsCost: sum("oilsCost"),
    serviceCost: sum("serviceCost"),
    unpricedCount: items.filter((item) => item.capitalCost === null || item.currentCost === null).length,
    averageReadiness: readinessValues.length
      ? readinessValues.reduce((total, value) => total + value, 0) / readinessValues.length : null,
  };
}
