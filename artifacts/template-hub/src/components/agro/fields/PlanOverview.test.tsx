import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { EMPTY_FILTERS, PlanOverview, filterPlanRows } from "./PlanOverview";
import { PlanOperationCard, opKind } from "./PlanOperationCard";

const f1 = { id: 1, number: "12", unit: "АПК Арыстан Grain", areaHa: 450, isActive: true } as AgroField;
const f2 = { ...f1, id: 2, number: "5", areaHa: 320 };
const f3 = { ...f1, id: 3, number: "8", areaHa: 600 };
const f4 = { ...f1, id: 4, number: "9", areaHa: 50, isActive: false };
const s1 = { id: 10, fieldId: 1, year: 2026, cropName: "Пшеница", areaHa: 450, variety: "" } as FieldSeason;
const s2 = { ...s1, id: 11, fieldId: 2, cropName: "Рапс", areaHa: 320 };
const base = { status: "planned", isUnplanned: false, plannedAreaHa: 450, plannedRatePerHa: 12000, plannedPayAmount: 5400000, plannedFuelCost: 1800000,
  responsible: "", plannedEquipment: "", plannedImplement: "", supportingWorks: [], requiresChemicals: false, chemicalPlan: [], notes: "" };
const sow = { ...base, id: 1, seasonId: 10, name: "Посев", plannedStart: "2026-04-01", plannedEnd: "2026-04-10",
  plannedAssignments: [
    { equipmentId: 1, employeeId: 1, equipmentName: "John Deere 8370R", employeeName: "Ахметов", implement: "Сеялка SeedHawk" },
    { equipmentId: 2, employeeId: 2, equipmentName: "К-700", employeeName: "Иванов", implement: "Сеялка 2" }],
  seeds: { name: "Пшеница элита", quantity: 90, unit: "ton", unitPrice: 200000 } } as unknown as FieldOperation;
const chem = { ...base, id: 2, seasonId: 11, name: "Химпрополка", plannedStart: "2026-04-28", plannedEnd: "2026-05-05", plannedAreaHa: 320,
  requiresChemicals: true, chemicalPlan: [{ batchId: 7, ratePerHa: 1.5 }], plannedEquipment: "John Deere 6155R", responsible: "Петров", plannedImplement: "AVAGRO",
  seeds: { name: "не для химии", quantity: 1, unit: "kg", unitPrice: 1 } } as unknown as FieldOperation;
const cancelled = { ...sow, id: 3, status: "cancelled" } as FieldOperation;
const unplanned = { ...sow, id: 4, isUnplanned: true } as FieldOperation;
const ops = [chem, sow, cancelled, unplanned];
const fields = [f1, f2, f3, f4];
const noop = () => {};
const render = (manage = true, filters = EMPTY_FILTERS) => renderToStaticMarkup(<PlanOverview year={2026} fields={fields} yearSeasons={[s1, s2]} ops={ops} manage={manage}
  onEdit={noop} onHistory={noop} onOpenField={noop} onAddSeason={noop} initialFilters={filters} />);

test("operation kinds map to colour families", () => {
  assert.equal(opKind("Посев"), "sowing"); assert.equal(opKind("Внесение удобрений"), "fertilizing"); assert.equal(opKind("Химпрополка"), "chemical");
  assert.equal(opKind("Фунгицидная обработка"), "fungicide"); assert.equal(opKind("Культивация"), "cultivation"); assert.equal(opKind("Уборка"), "harvest");
  assert.equal(opKind("Вывоз урожая"), "hauling"); assert.equal(opKind("Снегозадержание"), "cultivation"); assert.equal(opKind("Что-то"), "other");
});

test("filters by field, crop, kind and search; source plans preserved and sorted", () => {
  const all = filterPlanRows(fields, [s1, s2], ops, EMPTY_FILTERS);
  assert.deepEqual(all.map((r) => r.op.id), [1, 2]);
  assert.deepEqual(filterPlanRows(fields, [s1, s2], ops, { ...EMPTY_FILTERS, fieldId: "2" }).map((r) => r.op.id), [2]);
  assert.deepEqual(filterPlanRows(fields, [s1, s2], ops, { ...EMPTY_FILTERS, crop: "Пшеница" }).map((r) => r.op.id), [1]);
  assert.deepEqual(filterPlanRows(fields, [s1, s2], ops, { ...EMPTY_FILTERS, kind: "chemical" }).map((r) => r.op.id), [2]);
  assert.deepEqual(filterPlanRows(fields, [s1, s2], ops, { ...EMPTY_FILTERS, q: "иванов" }).map((r) => r.op.id), [1]);
  assert.deepEqual(filterPlanRows(fields, [s1, s2], ops, { ...EMPTY_FILTERS, q: "поле 5" }).map((r) => r.op.id), [2]);
  assert.equal(all[0].op, sow);
  const html = render(true, { ...EMPTY_FILTERS, crop: "Овёс" });
  assert.match(html, /status-plan-ops-empty/); assert.match(html, /Сбросить фильтры/);
});

test("overview cards show all machines and real totals; no-season fields gated by role/archive", () => {
  const html = render();
  for (const t of ["John Deere 8370R", "К-700", "Ахметов", "Иванов", "Сеялка SeedHawk", "Сеялка 2", "Поле 12", "Пшеница", "01.04.2026"]) assert.ok(html.includes(t), t);
  assert.match(html, /12\s000\s₸\/га/); assert.match(html, /5\s400\s000\s₸/); assert.match(html, /1\s800\s000\s₸/);
  assert.match(html, /button-plan-edit-op-1/); assert.match(html, /section-plan-no-season/);
  assert.match(html, /button-plan-noseason-add-3/); assert.ok(!html.includes("button-plan-noseason-add-4"));
  assert.match(html, /button-plan-noseason-open-4/);
  const ro = render(false);
  assert.ok(!ro.includes("button-plan-edit-op-")); assert.ok(!ro.includes("button-plan-noseason-add-")); assert.match(ro, /button-plan-history-op-1/);
});

test("details panel lists chemicals with norm × area totals and seeds only for sowing", () => {
  const batches = new Map([[7, { name: "Гербицид Х", unit: "л", unitPrice: 4000 }]]);
  const html = renderToStaticMarkup(<PlanOperationCard op={chem} field={f2} season={s2} manage chemBatches={batches} defaultOpen onEdit={noop} />);
  assert.match(html, /химия 1/); assert.match(html, /Гербицид Х/); assert.match(html, /= 480 л/); assert.match(html, /1\s920\s000 ₸/);
  assert.ok(!html.includes("не для химии")); assert.ok(!html.includes("text-season-seeds-2"));
  const sowHtml = renderToStaticMarkup(<PlanOperationCard op={sow} field={f1} season={s1} manage={false} defaultOpen onEdit={noop} />);
  assert.match(sowHtml, /Пшеница элита/); assert.match(sowHtml, /data-kind="sowing"/); assert.ok(!sowHtml.includes("button-plan-edit-op-1"));
});
