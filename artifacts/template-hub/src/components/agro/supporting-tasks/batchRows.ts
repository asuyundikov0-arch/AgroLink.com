import type { FieldOperation, SupportingService, SupportingTaskInput } from "@workspace/api-client-react";
import { SERVICES, amountStr, isIsoDate, parseAmount } from "./shared";

export type BatchRow = {
  key: string; sourceIndex: number | null; title: string; startDate: string; endDate: string;
  equipmentId: number | null; employeeIds: number[]; salary: string; fuel: string;
  quantity: string; quantityUnit: string; notes: string; services: SupportingService[];
};

let seq = 0;
const nextKey = () => `r${++seq}`;

/** Planned rows keep their zero-based plan index; copies are detached from the plan arrays. */
export function rowsFromPlan(op: FieldOperation): BatchRow[] {
  return (op.supportingWorks ?? []).map((w, i) => ({
    key: nextKey(), sourceIndex: i, title: w.name, startDate: op.plannedStart?.slice(0, 10) ?? "", endDate: op.plannedEnd?.slice(0, 10) ?? "",
    equipmentId: w.equipmentId ?? null, employeeIds: [...(w.employeeIds ?? [])], salary: amountStr(w.salaryCost), fuel: amountStr(w.fuelCost),
    quantity: "0", quantityUnit: "", notes: "", services: [],
  }));
}

export function manualRow(op: FieldOperation): BatchRow {
  const start = (op.actualStart ?? op.plannedStart ?? "").slice(0, 10);
  const end = (op.actualEnd ?? op.plannedEnd ?? op.actualStart ?? op.plannedStart ?? "").slice(0, 10);
  return { key: nextKey(), sourceIndex: null, title: "", startDate: start, endDate: end >= start ? end : start,
    equipmentId: null, employeeIds: [], salary: "0", fuel: "0", quantity: "0", quantityUnit: "", notes: "", services: [] };
}

export function initialRows(op: FieldOperation): BatchRow[] {
  const r = rowsFromPlan(op);
  return r.length ? r : [manualRow(op)];
}

export function buildItems(operationId: number, rows: BatchRow[]): { items: SupportingTaskInput[]; errors: Record<string, string[]>; general: string[] } {
  const errors: Record<string, string[]> = {};
  const general: string[] = [];
  if (rows.length === 0) general.push("Добавьте хотя бы одну работу.");
  if (rows.length > 20) general.push("Не более 20 работ за одну отправку.");
  const seen = new Set<number>();
  const items: SupportingTaskInput[] = [];
  for (const r of rows) {
    const e: string[] = [];
    if (r.sourceIndex !== null) { if (seen.has(r.sourceIndex)) e.push("Плановая строка повторяется."); seen.add(r.sourceIndex); }
    const salary = parseAmount(r.salary, 1e9), fuel = parseAmount(r.fuel, 1e9), qty = parseAmount(r.quantity || "0", 1e6, 3);
    if (!r.title.trim()) e.push("Название не может быть пустым.");
    if (r.title.length > 150) e.push("Название — не более 150 символов.");
    if (!isIsoDate(r.startDate) || !isIsoDate(r.endDate)) e.push("Даты в формате ГГГГ-ММ-ДД.");
    else if (r.endDate < r.startDate) e.push("Окончание раньше начала.");
    if (salary === null) e.push("Бюджет ЗП: 0–1 000 000 000, до 2 знаков.");
    if (fuel === null) e.push("Бюджет ГСМ: 0–1 000 000 000, до 2 знаков.");
    if (qty === null) e.push("Объём: 0–1 000 000.");
    if (r.quantityUnit.length > 40) e.push("Единица — до 40 символов.");
    if (r.notes.length > 3000) e.push("Примечание — до 3000 символов.");
    if (r.employeeIds.length > 30) e.push("Не более 30 сотрудников.");
    if (r.services.length === 0) e.push("Выберите хотя бы одну службу.");
    if (e.length) { errors[r.key] = e; continue; }
    items.push({
      operationId, sourceIndex: r.sourceIndex, title: r.title.trim(), startDate: r.startDate, endDate: r.endDate,
      equipmentId: r.equipmentId, employeeIds: [...new Set(r.employeeIds)], salaryBudget: salary!, fuelBudget: fuel!,
      quantity: qty!, quantityUnit: r.quantityUnit.trim(), notes: r.notes.trim(),
      services: SERVICES.map((s) => s.id).filter((s) => r.services.includes(s)),
    });
  }
  return { items, errors, general };
}

export const payloadHash = (sendNow: boolean, items: SupportingTaskInput[]) => JSON.stringify({ sendNow, items });

export const newRequestId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stb-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`);

/** Same payload reuses the cached id (safe retry); any change gets a fresh id. */
export function requestIdFor(cache: { hash: string; id: string } | null, hash: string) {
  return cache && cache.hash === hash ? cache : { hash, id: newRequestId() };
}
