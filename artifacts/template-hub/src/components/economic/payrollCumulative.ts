import type { PayrollRegister } from "@workspace/api-client-react";

export type CumulativeLine = {
  key: string;
  registerId: number;
  workDate: string;
  unit: string;
  workType: string;
  details: string;
  amountKzt: number;
  sourceType: string;
  sourceId: number | null;
};

export type CumulativeWorkType = { workType: string; total: number; count: number; lines: CumulativeLine[] };

export type CumulativeEmployee = {
  key: string;
  employeeId: number | null;
  name: string;
  total: number;
  lineCount: number;
  registerIds: number[];
  firstDate: string;
  lastDate: string;
  workTypes: CumulativeWorkType[];
  lines: CumulativeLine[];
};

export type CumulativeFilter = { search?: string; from?: string; to?: string };

const round2 = (value: number) => Math.round(value * 100) / 100;

export function normalizeEmployeeName(name: string): string {
  return name.normalize("NFKC").replace(/ё/gi, "е").replace(/\s+/g, " ").trim().toLocaleLowerCase("ru");
}

/** Maps normalized name -> employeeId when exactly one ID uses that name across confirmed (sent) snapshots. Ambiguous names are omitted. */
export function buildEmployeeAliases(registers: PayrollRegister[]): Map<string, number> {
  const seen = new Map<string, Set<number>>();
  for (const register of registers) {
    if (register.status !== "sent_to_economist") continue;
    for (const entry of register.entries) {
      if (entry.employeeId === null) continue;
      const name = normalizeEmployeeName(entry.employeeName);
      if (!name) continue;
      const ids = seen.get(name) ?? new Set<number>();
      ids.add(entry.employeeId); seen.set(name, ids);
    }
  }
  const out = new Map<string, number>();
  for (const [name, ids] of seen) if (ids.size === 1) out.set(name, [...ids][0]);
  return out;
}

/** Aggregates ONLY sent_to_economist registers by employeeId (fallback: normalized name). */
export function aggregatePayrollByEmployee(registers: PayrollRegister[], filter: CumulativeFilter = {}): CumulativeEmployee[] {
  const search = normalizeEmployeeName(filter.search ?? "");
  const from = filter.from ? filter.from.slice(0, 10) : "";
  const to = filter.to ? filter.to.slice(0, 10) : "";
  const aliases = buildEmployeeAliases(registers);
  const map = new Map<string, CumulativeEmployee>();
  for (const register of registers) {
    if (register.status !== "sent_to_economist") continue;
    const date = register.workDate.slice(0, 10);
    if (from && date < from) continue;
    if (to && date > to) continue;
    register.entries.forEach((entry, index) => {
      const resolvedId = entry.employeeId ?? aliases.get(normalizeEmployeeName(entry.employeeName)) ?? null;
      const key = resolvedId !== null ? `id-${resolvedId}` : `name-${normalizeEmployeeName(entry.employeeName)}`;
      let group = map.get(key);
      if (!group) {
        group = { key, employeeId: resolvedId, name: entry.employeeName.trim() || "Без имени", total: 0, lineCount: 0, registerIds: [], firstDate: date, lastDate: date, workTypes: [], lines: [] };
        map.set(key, group);
      }
      const line: CumulativeLine = { key: `${register.id}-${entry.id ?? index}-${index}`, registerId: register.id, workDate: date, unit: register.unit, workType: entry.workType, details: entry.details, amountKzt: entry.amountKzt, sourceType: entry.sourceType, sourceId: entry.sourceId };
      group.lines.push(line);
      group.total = round2(group.total + entry.amountKzt);
      group.lineCount += 1;
      if (!group.registerIds.includes(register.id)) group.registerIds.push(register.id);
      if (date < group.firstDate) group.firstDate = date;
      if (date > group.lastDate) { group.lastDate = date; if (entry.employeeName.trim()) group.name = entry.employeeName.trim(); }
    });
  }
  const result = [...map.values()].filter((g) => !search || normalizeEmployeeName(g.name).includes(search));
  for (const g of result) {
    g.lines.sort((a, b) => a.workDate.localeCompare(b.workDate) || a.registerId - b.registerId);
    const byType = new Map<string, CumulativeWorkType>();
    for (const line of g.lines) {
      const t = byType.get(line.workType) ?? { workType: line.workType, total: 0, count: 0, lines: [] };
      t.total = round2(t.total + line.amountKzt); t.count += 1; t.lines.push(line);
      byType.set(line.workType, t);
    }
    g.workTypes = [...byType.values()].sort((a, b) => b.total - a.total || a.workType.localeCompare(b.workType, "ru"));
    g.registerIds.sort((a, b) => a - b);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
