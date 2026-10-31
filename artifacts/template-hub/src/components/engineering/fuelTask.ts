import type { SupportingTask } from "@workspace/api-client-react";

/** Fuel-service tasks in execution for the farm, date year and selected machine. */
export function eligibleFuelTasks(tasks: SupportingTask[], farm: string, date: string, fleetId: number | ""): SupportingTask[] {
  const year = Number(date.slice(0, 4));
  if (!fleetId || !year) return [];
  return tasks.filter((t) => t.status === "sent"
    && t.deliveries.some((d) => d.service === "fuel" && d.status === "accepted")
    && t.farm === farm && t.year === year && (t.equipmentId === null || t.equipmentId === fleetId))
    .sort((a, b) => b.id - a.id);
}

export function fuelTaskFields(tasks: SupportingTask[]) {
  return [...new Map(tasks.map((t) => [t.fieldId, { id: t.fieldId, number: t.fieldNumber }])).values()]
    .sort((a, b) => a.number.localeCompare(b.number, "ru", { numeric: true }));
}

/** Returns the task only if it is still valid for the current selection (prevents stale saves). */
export function pickValidTask(tasks: SupportingTask[], fieldId: number | "", taskId: number | "") {
  return tasks.find((t) => t.id === taskId && t.fieldId === fieldId) ?? null;
}
