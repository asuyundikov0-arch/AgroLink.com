import type { FieldDispatchItem, FleetEquipment } from "@workspace/api-client-react";

export type ImplementSuggestion = { name: string; count: number };

/** Distinct implement names mentioned in work records (planned/actual assignments, reports, item). */
export function implementSuggestions(items: FieldDispatchItem[], equipmentId?: number | null): ImplementSuggestion[] {
  const map = new Map<string, ImplementSuggestion>();
  const add = (raw: string | null | undefined) => {
    const name = (raw ?? "").trim().replace(/\s+/g, " ");
    if (!name || name.length > 200) return;
    const key = name.toLocaleLowerCase("ru-RU");
    const cur = map.get(key);
    if (cur) cur.count += 1; else map.set(key, { name, count: 1 });
  };
  const matches = (id?: number | null) => equipmentId == null || id === equipmentId;
  for (const item of items) {
    const op = item.operation;
    if (equipmentId == null) add(item.actualImplement);
    if (op) {
      if (equipmentId == null || op.plannedEquipmentId === equipmentId) add(op.plannedImplement);
      if (equipmentId == null) add(op.actualImplement);
      for (const a of op.plannedAssignments ?? []) if (matches(a.equipmentId)) add(a.implement);
      for (const a of op.actualAssignments ?? []) if (matches(a.equipmentId)) add(a.implement);
      for (const r of op.progressReports ?? []) {
        if (equipmentId == null) add(r.actualImplement);
        for (const m of r.machineReports ?? []) if (matches(m.equipmentId)) add(m.implement);
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"));
}

export const equipmentLabel = (e: Pick<FleetEquipment, "kind" | "registrationNumber">) =>
  e.registrationNumber ? `${e.kind} · ${e.registrationNumber}` : e.kind;

export type GpsForm = { equipmentId: string; implement: string; startsAt: string; endsAt: string };
export type GpsParams = { equipmentId: number; implement: string; startsAt: string; endsAt: string };
export type GpsValidation = { ok: true; params: GpsParams } | { ok: false; errors: Partial<Record<keyof GpsForm, string>> };

/** Parse `YYYY-MM-DDTHH:mm` from datetime-local as browser-local time. */
export function parseLocalDateTime(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number);
  const date = new Date(y, mo - 1, d, h, mi, s);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d || date.getHours() !== h || date.getMinutes() !== mi) return null;
  return date;
}

/** ISO 8601 with explicit local offset, e.g. 2025-05-04T08:00:00+05:00 */
export function toIsoWithOffset(date: Date): string {
  const pad = (n: number) => String(Math.trunc(Math.abs(n))).padStart(2, "0");
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${pad(off / 60)}:${pad(off % 60)}`;
}

export function validateGpsForm(form: GpsForm, equipment: Pick<FleetEquipment, "id">[]): GpsValidation {
  const errors: Partial<Record<keyof GpsForm, string>> = {};
  const id = Number(form.equipmentId);
  if (!form.equipmentId || !Number.isInteger(id) || id < 1 || !equipment.some((e) => e.id === id)) errors.equipmentId = "Выберите технику из списка автопарка.";
  const implement = form.implement.trim();
  if (!implement) errors.implement = "Укажите агрегат.";
  else if (implement.length > 200) errors.implement = "Название агрегата не длиннее 200 символов.";
  const start = parseLocalDateTime(form.startsAt);
  const end = parseLocalDateTime(form.endsAt);
  if (!start) errors.startsAt = "Укажите корректные дату и время начала.";
  if (!end) errors.endsAt = "Укажите корректные дату и время окончания.";
  if (start && end && end.getTime() <= start.getTime()) errors.endsAt = "Окончание должно быть позже начала.";
  if (Object.keys(errors).length || !start || !end) return { ok: false, errors };
  return { ok: true, params: { equipmentId: id, implement, startsAt: toIsoWithOffset(start), endsAt: toIsoWithOffset(end) } };
}

export const paramsKey = (p: GpsParams) => JSON.stringify([p.equipmentId, p.implement, p.startsAt, p.endsAt]);
