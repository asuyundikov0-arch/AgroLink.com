import type { Employee, PayrollRegister } from "@workspace/api-client-react";
import { normalizeEmployeeName } from "../economic/payrollCumulative";

export const PAYROLL_GROUPS = [
  ["brigade", "Бригада"], ["motor_pool", "Автобаза"], ["grain_floor", "Ток"],
  ["workshop", "МТМ"], ["machinery_yard", "Машдвор"],
] as const;
export type PayrollGroup = typeof PAYROLL_GROUPS[number][0];
export type GroupFilter = PayrollGroup | "unassigned";
export const groupOf = (employee?: Employee): GroupFilter => PAYROLL_GROUPS.some(([key]) => key === employee?.payrollGroup)
  ? employee!.payrollGroup as PayrollGroup : "unassigned";
export const groupLabel = (key: GroupFilter) => PAYROLL_GROUPS.find(([id]) => id === key)?.[1] ?? "Без группы";

export type HRLine = PayrollRegister["entries"][number] & { registerId: number; workDate: string; unit: string };
export type HRRow = {
  key: string; employee?: Employee; name: string; group: GroupFilter;
  confirmed: number; pending: number; lines: HRLine[]; pendingRegisterIds: number[];
};

/** Work source determines field/transport payroll; directory groups remain for other work. */
export function buildHRRoster(employees: Employee[], registers: PayrollRegister[], month = ""): HRRow[] {
  const aliases = new Map<string, Set<number>>();
  const alias = (name: string, id: number) => {
    const key = normalizeEmployeeName(name);
    const ids = aliases.get(key) ?? new Set<number>();
    ids.add(id); aliases.set(key, ids);
  };
  employees.forEach((employee) => alias(employee.fullName, employee.id));
  registers.forEach((register) => register.entries.forEach((entry) => {
    if (entry.employeeId !== null) alias(entry.employeeName, entry.employeeId);
  }));
  const directory = new Map(employees.map((employee) => [employee.id, employee]));
  const rows = new Map<string, HRRow>();
  const getRow = (id: number | null, name: string, sourceGroup?: PayrollGroup) => {
    const employee = id !== null ? directory.get(id) : undefined;
    const group = sourceGroup ?? groupOf(employee);
    const key = `${id !== null ? `id-${id}` : `name-${normalizeEmployeeName(name)}`}|${group}`;
    let row = rows.get(key);
    if (!row) {
      row = { key, employee, name: employee?.fullName ?? name, group, confirmed: 0, pending: 0, lines: [], pendingRegisterIds: [] };
      rows.set(key, row);
    }
    return row;
  };
  for (const register of registers) {
    if (!["pending_hr", "sent_to_economist"].includes(register.status) || (month && register.workDate.slice(0, 7) !== month)) continue;
    for (const entry of register.entries) {
      const candidates = aliases.get(normalizeEmployeeName(entry.employeeName));
      const id = entry.employeeId ?? (candidates?.size === 1 ? [...candidates][0] : null);
      const sourceGroup = ["grain_trip", "seed_trip"].includes(entry.sourceType) ? "motor_pool" : entry.sourceType === "tok_work" ? "grain_floor"
        : ["field_progress", "field_operation"].includes(entry.sourceType) ? "brigade" : undefined;
      const row = getRow(id, entry.employeeName, sourceGroup);
      if (register.status === "pending_hr") {
        row.pending = Math.round((row.pending + entry.amountKzt) * 100) / 100;
        if (!row.pendingRegisterIds.includes(register.id)) row.pendingRegisterIds.push(register.id);
      } else {
        row.confirmed = Math.round((row.confirmed + entry.amountKzt) * 100) / 100;
        row.lines.push({ ...entry, registerId: register.id, workDate: register.workDate, unit: register.unit });
      }
    }
  }
  employees.filter(employee => employee.isActive && ![...rows.values()].some(row => row.employee?.id === employee.id))
    .forEach(employee => getRow(employee.id, employee.fullName));
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "ru") || a.key.localeCompare(b.key));
}
