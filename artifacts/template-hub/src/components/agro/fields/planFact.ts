import type { FieldOperation } from "@workspace/api-client-react";

export type PlanFact = { plannedHa: number; doneHa: number; unplannedHa: number; percent: number | null };

const r2 = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;

/**
 * Plan-vs-actual over a set of operations. Only non-cancelled planned rows count toward the plan;
 * each planned row contributes its latest actualAreaHa (already cumulative) capped at its plan.
 * Unplanned rows are reported separately and never improve plan adherence.
 */
export function planFactSummary(ops: FieldOperation[]): PlanFact {
  const live = ops.filter((o) => o.status !== "cancelled" && !o.voidedAt);
  const planned = live.filter((o) => !o.isUnplanned);
  const plannedHa = r2(planned.map((o) => o.plannedAreaHa));
  const doneHa = r2(planned.map((o) => Math.min(o.actualAreaHa, o.plannedAreaHa)));
  const unplannedHa = r2(live.filter((o) => o.isUnplanned).map((o) => o.actualAreaHa));
  return { plannedHa, doneHa, unplannedHa, percent: plannedHa > 0 ? (doneHa / plannedHa) * 100 : null };
}

/** Per-season grouping helper: seasonId -> summary */
export function planFactBySeason(ops: FieldOperation[]): Map<number, PlanFact> {
  const g = new Map<number, FieldOperation[]>();
  for (const o of ops) g.set(o.seasonId, [...(g.get(o.seasonId) ?? []), o]);
  return new Map([...g].map(([k, v]) => [k, planFactSummary(v)]));
}
