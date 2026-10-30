import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetFieldCostsQueryKey, type AgroField, type FieldCosts, type FieldOperation, type FieldSeason } from "@workspace/api-client-react";
import { FieldWorkBoard } from "./FieldWorkBoard";

const field = { id: 1, number: "1", unit: "АПК Арыстан Grain", areaHa: 100, isActive: true } as AgroField;
const season = { id: 10, fieldId: 1, year: 2026, cropName: "Пшеница", areaHa: 100 } as FieldSeason;
const assignment = [
  { equipmentId: 1, employeeId: 1, equipmentName: "Трактор А", employeeName: "Механизатор А", implement: "Сеялка А" },
  { equipmentId: 2, employeeId: 2, equipmentName: "Трактор Б", employeeName: "Механизатор Б", implement: "Сеялка Б" },
];
const base = {
  id: 20, seasonId: 10, name: "Посев", status: "in_progress", isUnplanned: false,
  approvalStatus: "approved", approvalNote: "", plannedStart: "2026-05-01", plannedEnd: "2026-05-10",
  plannedAreaHa: 100, actualAreaHa: 30, actualAreaLimitHa: 100, progressPercent: 30,
  actualStart: "2026-05-01", actualEnd: null, completionRequestedOn: null,
  actualOperationName: "Посев", responsible: "Механизатор А", plannedEquipment: "Трактор А", plannedImplement: "Сеялка А",
  actualMechanic: "Механизатор А", actualMechanicEmployeeId: 1, actualEquipment: "Трактор А", actualImplement: "Сеялка А",
  plannedAssignments: assignment, actualAssignments: assignment, plannedRatePerHa: 1100, plannedPayAmount: 110000,
  actualRatePerHa: null, actualPayAmount: 35000, plannedFuelCost: 9999,
  supportingWorks: [], actualSupportingWorks: [], progressReports: [], actualNotes: "", notes: "",
  chemicalPlan: [], requiresChemicals: false,
} as unknown as FieldOperation;
const ops: FieldOperation[] = [
  base,
  { ...base, id: 21, actualStart: null, actualAreaHa: 0, status: "planned" },
  { ...base, id: 22, completionRequestedOn: "2026-05-05", completionRequestedBy: "Диспетчер" },
  { ...base, id: 23, actualStart: null, isUnplanned: true, approvalStatus: "pending", status: "planned" },
  { ...base, id: 24, actualStart: null, isUnplanned: true, approvalStatus: "approved", status: "planned" },
  { ...base, id: 25, status: "completed", actualEnd: "2026-05-05" },
];
const noop = () => {};
function render(role = "agronomist", input = field) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
  const totals = { chemicalCost: 0, seedCost: 0, fuelCost: 12345, fuelLiters: 100, salaryCost: 22000, totalCost: 34345 };
  const costs: FieldCosts = {
    ...totals, fieldId: 1, seasonId: 10, unallocatedChemicalCost: 0, unallocatedSeedCost: 0,
    operations: [{ ...totals, operationId: 20, name: "Посев", fuels: [], chemicals: [], salaries: [], seedIssues: [] }],
  };
  client.setQueryData(getGetFieldCostsQueryKey(10), costs);
  const html = renderToStaticMarkup(<QueryClientProvider client={client}>
    <FieldWorkBoard field={input} season={season} year={2026} ops={ops} role={role} planFact={<span>30%</span>}
      onBack={noop} onHistory={noop} onUnplanned={noop} onWork={noop} onLifecycle={noop} onVoid={noop} />
  </QueryClientProvider>);
  client.clear(); return html;
}

test("actual rows retain every machine and real fuel/HR salary costs below resources", () => {
  const html = render();
  for (const a of assignment) for (const value of [a.employeeName, a.equipmentName, a.implement]) assert.ok(html.includes(value));
  assert.match(html, /section-op-cost-20/);
  assert.match(html, /12 345 ₸/); assert.match(html, /22 000 ₸/);
  assert.ok(html.indexOf("section-op-cost-20") > html.indexOf("Сеялка Б"));
  assert.match(html, /button-daily-toggle-20/);
  for (const block of ["block-active", "block-completion-requests", "block-plan", "block-completed"]) assert.ok(html.includes(block));
});

test("agronomist retains start, resources and completion approval, but not chief-only approval or director void", () => {
  const html = render();
  for (const id of ["button-fact-start-21", "button-fact-resources-20", "button-completion-22-approve", "button-facts-unplanned-1"])
    assert.ok(html.includes(id), id);
  assert.ok(!html.includes("button-unplanned-review-23-approve"));
  assert.ok(!html.includes("button-fact-void-20"));
});

test("chief and read-only roles do not gain actual-work editing", () => {
  const chief = render("chief_agronomist");
  assert.ok(chief.includes("button-unplanned-review-23-approve"));
  for (const id of ["button-fact-start-21", "button-fact-resources-20", "button-completion-22-approve"])
    assert.ok(!chief.includes(id), id);
  const readOnly = render("grain_manager");
  for (const id of ["button-fact-start-21", "button-fact-resources-20", "button-unplanned-review-23-approve", "button-completion-22-approve"])
    assert.ok(!readOnly.includes(id), id);
  const archived = render("agronomist", { ...field, isActive: false });
  assert.ok(!archived.includes("button-fact-start-21"));
  assert.ok(!archived.includes("button-fact-resources-20"));
});
