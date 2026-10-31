import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgroField, FieldBoundary, FieldCosts, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { FieldSeasonView, mapFactOps, mapPlanOps } from "./FieldHistoryPanel";
import { ActualOperationCard } from "../fields/ActualOperationCard";

const field = { id: 1, number: "7", unit: "Отделение 1", areaHa: 100, isActive: true } as unknown as AgroField;
const boundary = { fieldId: 1, fieldNumber: "7", unit: "Отделение 1", areaHa: 100, contourAreaHa: 103.5, geometry: { type: "Polygon", coordinates: [] } } as unknown as FieldBoundary;
const s26 = { id: 10, fieldId: 1, year: 2026, cropName: "Пшеница", variety: "Шортандинская", areaHa: 100 } as FieldSeason;
const s25 = { id: 9, fieldId: 1, year: 2025, cropName: "Рапс", areaHa: 100 } as FieldSeason;
const asg = [
  { equipmentId: 1, employeeId: 1, equipmentName: "К-701", employeeName: "Ахметов Б.", implement: "Сеялка СЗС" },
  { equipmentId: 2, employeeId: 2, equipmentName: "МТЗ-82", employeeName: "Ким Д.", implement: "Борона БЗСС" },
];
const base = {
  id: 20, seasonId: 10, name: "Посев", status: "in_progress", isUnplanned: false, approvalStatus: "approved", approvalNote: "",
  plannedStart: "2026-05-01", plannedEnd: "2026-05-10", plannedAreaHa: 100, actualAreaHa: 30, actualAreaLimitHa: 100, progressPercent: 30,
  actualStart: "2026-05-02", actualEnd: null, completionRequestedOn: null, actualOperationName: "Посев", responsible: "", plannedEquipment: "", plannedImplement: "",
  actualMechanic: "", actualEquipment: "", actualImplement: "", plannedAssignments: asg, actualAssignments: asg,
  plannedRatePerHa: 1100, plannedPayAmount: 110000, actualRatePerHa: null, actualPayAmount: 35000, plannedFuelCost: 9999,
  supportingWorks: [], actualSupportingWorks: [], progressReports: [], actualNotes: "", notes: "", chemicalPlan: [], requiresChemicals: false, voidedAt: null,
} as unknown as FieldOperation;
const ops: FieldOperation[] = [
  base,
  { ...base, id: 21, actualStart: null, actualAreaHa: 0, status: "planned", name: "Культивация" },
  { ...base, id: 22, status: "completed", actualEnd: "2026-05-06" },
  { ...base, id: 23, actualStart: null, status: "cancelled" },
  { ...base, id: 24, actualStart: null, status: "planned", voidedAt: "2026-05-01" },
  { ...base, id: 25, seasonId: 99, actualStart: null, status: "planned" },
  { ...base, id: 26, seasonId: 99 },
  { ...base, id: 27, actualStart: null, status: "planned", isUnplanned: true, approvalStatus: "pending" },
];
const totals = { chemicalCost: 0, seedCost: 42000, fuelCost: 12345, fuelLiters: 100, salaryCost: 22000, totalCost: 76345 };
const costs: FieldCosts = { ...totals, fieldId: 1, seasonId: 10, unallocatedChemicalCost: 0, unallocatedSeedCost: 0,
  operations: [{ ...totals, operationId: 20, name: "Посев", fuels: [], chemicals: [], salaries: [], seedIssues: [] }] };
const noop = () => {};

function wrap(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  const html = renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>); client.clear(); return html;
}
function view(o: Partial<{ tab: "plan" | "fact"; seasons: FieldSeason[]; season?: FieldSeason; costs: { data?: FieldCosts; isLoading: boolean; isError: boolean } }> = {}) {
  const seasons = o.seasons ?? [s26, s25];
  return wrap(<FieldSeasonView role="agronomist" boundary={boundary} field={field} seasons={seasons} operations={ops} defaultYear={2026} onClose={noop}
    fieldSeasons={seasons} season={"season" in o ? o.season : s26} onSeason={noop} initialTab={o.tab ?? "fact"}
    costs={{ ...(o.costs ?? { data: costs, isLoading: false, isError: false }), onRetry: noop }} />);
}

test("plan/fact segregation is per selected season, excludes void/cancelled/other fields", () => {
  assert.deepEqual(mapPlanOps(ops, 10).map((o) => o.id), [20, 21, 22]);
  assert.deepEqual(mapFactOps(ops, 10).map((o) => o.id).sort(), [20, 22]);
  assert.deepEqual(mapFactOps(ops, 99).map((o) => o.id), [26]);
  assert.deepEqual(mapFactOps([{ ...base, actualStart: null, status: "planned", progressReports: [{ id: 9 }] as FieldOperation["progressReports"] }], 10).map(o => o.id), [20]);
});

test("fact tab reuses actual card with machines, seeds, fuel and HR; no mutations", () => {
  const html = view();
  for (const a of asg) for (const v of [a.equipmentName, a.employeeName, a.implement]) assert.ok(html.includes(v));
  assert.match(html, /row-fact-machine-20-1/);
  assert.match(html, /text-fact-seeds-20">42\s000 ₸/);
  assert.match(html, /text-fact-fuel-20">12\s345 ₸/);
  assert.match(html, /text-fact-hr-20">22\s000 ₸/);
  assert.ok(!/9\s999/.test(html), "planned fuel never shown as actual");
  assert.ok(!html.includes("row-map-op-21") && !html.includes("row-map-op-26"));
  assert.ok(!/button-support-task-create|button-fact-start|button-fact-void|button-fact-resources|button-plan-edit/.test(html));
  assert.match(html, /Рапс \(2025\)/);
  assert.match(html, /text-map-area-mismatch/);
});

test("plan tab reuses PlanOperationCard without edit", () => {
  const html = view({ tab: "plan" });
  assert.match(html, /row-plan-op-21/);
  assert.match(html, /row-plan-machine-21-1/);
  assert.match(html, /text-plan-costs-21/);
  assert.match(html, /row-plan-op-20/, "started work remains in the seasonal plan");
  assert.match(html, /row-plan-op-22/, "completed work remains in the seasonal plan");
  assert.ok(!html.includes("button-plan-edit-op") && !html.includes("row-plan-op-27"));
});

test("costs error shows error, never zeros", () => {
  const html = view({ costs: { isLoading: false, isError: true } });
  assert.match(html, /status-field-costs-error/);
  assert.match(html, /text-fact-fuel-20">нет данных/);
  assert.match(html, /text-fact-hr-20">нет данных/);
  assert.ok(!/text-fact-seeds-20">0 ₸/.test(html));
});

test("no season shows genuine empty state", () => {
  const html = view({ seasons: [], season: undefined });
  assert.match(html, /status-map-no-seasons/);
  assert.ok(!html.includes("section-map-fact"));
});

test("shared actual card: readOnly hides task creation, default keeps it", () => {
  const card = (readOnly?: boolean) => wrap(<ActualOperationCard op={base} field={field} crop="Пшеница" year={2026} role="agronomist" costsReady={false}
    readOnly={readOnly} testId="c" actions={<button type="button" data-testid="button-x">x</button>} />);
  const def = card(); const ro = card(true);
  assert.match(def, /button-x/);
  assert.match(def, /button-support-task-create-20/);
  assert.ok(!ro.includes("button-x") && !ro.includes("button-support-task-create"));
});
