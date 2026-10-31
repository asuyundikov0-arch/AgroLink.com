import type { FieldOperation, SupportingTask } from "@workspace/api-client-react";

export type SeedSeasonRef = { id: number; fieldId: number; year: number };

/** Tok tasks in execution (sent + tok delivery accepted) for the same field/year, linked to an active sowing op of that season. */
export function eligibleSeedTasks(tasks: SupportingTask[], season: SeedSeasonRef | undefined, sowingOps: Pick<FieldOperation, "id" | "seasonId" | "status">[]): SupportingTask[] {
  if (!season) return [];
  const active = new Set(sowingOps.filter((o) => o.seasonId === season.id && o.status !== "completed" && o.status !== "cancelled").map((o) => o.id));
  return tasks.filter((t) => t.status === "sent"
    && t.deliveries.some((d) => d.service === "tok" && d.status === "accepted")
    && t.fieldId === season.fieldId && t.year === season.year && active.has(t.operationId))
    .sort((a, b) => b.id - a.id);
}

export type TransportDraft = { truckNumber: string; driverEmployeeId: string; basis: "per_trip" | "ton_km"; distanceKm: string };

/** Validates trip inputs. Required when a task is linked; otherwise all-or-nothing. */
export function validateSeedTransport(t: TransportDraft, taskLinked: boolean): { errors: Record<string, string>; payload: null | { truckNumber: string; driverEmployeeId: number; transportPayBasis: "per_trip" | "ton_km"; distanceKm?: number } } {
  const errors: Record<string, string> = {};
  const truck = t.truckNumber.trim();
  const driver = Number(t.driverEmployeeId) || 0;
  const any = !!truck || !!driver;
  if (!taskLinked && !any) return { errors, payload: null };
  if (!truck) errors.truckNumber = taskLinked ? "Для задания укажите машину" : "Укажите машину или очистите водителя";
  else if (truck.length > 50) errors.truckNumber = "Не более 50 символов";
  if (!driver) errors.driverEmployeeId = taskLinked ? "Для задания выберите водителя" : "Выберите водителя или очистите машину";
  let distanceKm: number | undefined;
  if (t.basis === "ton_km") {
    const n = Number(t.distanceKm.trim().replace(",", "."));
    if (!t.distanceKm.trim() || !Number.isFinite(n) || n <= 0 || n > 100000) errors.distanceKm = "Укажите расстояние, км";
    else if (Math.abs(n * 1000 - Math.round(n * 1000)) > 0.00001) errors.distanceKm = "Не более трёх знаков после запятой";
    else distanceKm = n;
  }
  if (Object.keys(errors).length) return { errors, payload: null };
  return { errors, payload: { truckNumber: truck, driverEmployeeId: driver, transportPayBasis: t.basis, ...(distanceKm !== undefined ? { distanceKm } : {}) } };
}

/** Splits operation salary into field wages vs motor-pool seed delivery. transportSalaryCost is a subset of salaryCost. */
export function splitSalary(salaryCost: number, transportSalaryCost?: number) {
  const transport = Math.min(Math.max(transportSalaryCost ?? 0, 0), salaryCost);
  return { field: Math.round((salaryCost - transport) * 100) / 100, transport };
}
