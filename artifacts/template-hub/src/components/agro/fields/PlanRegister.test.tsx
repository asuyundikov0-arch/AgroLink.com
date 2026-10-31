import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { cropHue, cropStyle, machinesOf, PlanFieldsList, PlanFieldSchedule, predecessorOf } from "./PlanRegister";

const field = { id: 1, number: "1", unit: "АПК Арыстан Grain", areaHa: 100, isActive: true } as AgroField;
const season = { id: 10, fieldId: 1, year: 2026, cropName: "Пшеница", areaHa: 100 } as FieldSeason;
const prior = { ...season, id: 11, year: 2025, cropName: "Рапс" };
const op = {
  id: 20, seasonId: 10, name: "Посев", status: "planned", isUnplanned: false,
  plannedStart: "2026-05-01", plannedEnd: "2026-05-10", plannedAreaHa: 100,
  plannedRatePerHa: 1100, plannedPayAmount: 110000, plannedFuelCost: 45000,
  responsible: "Первый", plannedEquipment: "Трактор 1", plannedImplement: "Сеялка 1",
  plannedAssignments: [
    { equipmentId: 1, employeeId: 1, equipmentName: "Трактор 1", employeeName: "Первый", implement: "Сеялка 1" },
    { equipmentId: 2, employeeId: 2, equipmentName: "Трактор 2", employeeName: "Второй", implement: "Сеялка 2" },
  ], supportingWorks: [], requiresChemicals: false, chemicalPlan: [],
} as unknown as FieldOperation;
const noop = () => {};
const scheduleProps = {
  field, season, predecessor: prior, year: 2026, ops: [op], manage: true,
  onBack: noop, onHistory: noop, onAddOp: noop, onAddSeason: noop, onEditOp: noop,
  noSeason: <p>Нет сезона</p>, noOps: <p>Нет операций</p>,
};
const renderSchedule = (props = scheduleProps) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><PlanFieldSchedule {...props} /></QueryClientProvider>);
  client.clear(); return html;
};

test("crop colours are stable and predecessor comes only from an earlier season of the same field", () => {
  assert.equal(predecessorOf([season, { ...prior, year: 2024 }, prior,
    { ...prior, fieldId: 2, year: 2025 }, { ...prior, year: 2027 }], 1, 2026)?.id, 11);
  assert.equal(predecessorOf([season], 1, 2026), undefined);
  assert.notEqual(cropHue("Пшеница"), cropHue("Рапс"));
  assert.equal(cropHue("Лён"), cropHue("Лен"));
  assert.equal(cropHue("Сорго"), cropHue("Сорго"));
  assert.match(cropStyle("Пшеница").row.background, /\/ \.12/);
});

test("vertical field register preserves identities, neutral unassigned fields and per-field plan navigation", () => {
  const html = renderToStaticMarkup(<PlanFieldsList year={2026} unitAll fields={[field, { ...field, id: 2, number: "2" }]}
    yearSeasons={[season]} seasons={[season, prior]} ops={[op, { ...op, id: 21, isUnplanned: true }, { ...op, id: 22, status: "cancelled" }]}
    onOpen={noop} header={<h2>Поля</h2>} empty={<p>Нет полей</p>} />);
  assert.match(html, /row-plan-field-1/); assert.match(html, /button-plan-open-field-2/);
  assert.match(html, /Рапс/); assert.match(html, /2025/);
  assert.match(html, /Севооборот не задан/); assert.match(html, /Нет данных/);
  assert.ok(html.indexOf("row-plan-field-1") < html.indexOf("row-plan-field-2"));
});

test("schedule renders one colour-coded card per operation with every machine and total budgets", () => {
  const html = renderSchedule();
  assert.match(html, /row-plan-op-20/); assert.match(html, /data-kind="sowing"/);
  for (const text of ["Первый", "Второй", "Трактор 1", "Трактор 2", "Сеялка 1", "Сеялка 2"]) assert.ok(html.includes(text));
  assert.match(html, /row-plan-machine-20-1/);
  assert.ok(html.indexOf("text-plan-costs-20") > html.indexOf("Сеялка 2"));
  assert.match(html, /1\s100\s₸\/га/); assert.match(html, /110\s000\s₸/); assert.match(html, /45\s000\s₸/);
  assert.match(html, /ГСМ \(стоимость\)/); assert.ok(!/45\s000\s₸\/га/.test(html));
  assert.match(html, /button-plan-details-20/);
  assert.match(html, /button-plan-edit-op-20/); assert.match(html, /button-plan-add-op-1/);
  assert.equal(machinesOf({ ...op, plannedAssignments: [] })[0].employee, "Первый");
});

test("read-only, archived and no-season states retain original action permissions", () => {
  const readOnly = renderSchedule({ ...scheduleProps, manage: false });
  assert.ok(!readOnly.includes("button-plan-edit-op-20")); assert.ok(!readOnly.includes("button-plan-add-op-1"));
  assert.match(readOnly, /button-plan-history-field-1/);
  const archived = renderSchedule({ ...scheduleProps, field: { ...field, isActive: false } });
  assert.ok(!archived.includes("button-plan-add-op-1"));
  const noSeason = renderSchedule({ ...scheduleProps, season: undefined as unknown as FieldSeason });
  assert.match(noSeason, /button-plan-add-season-1/); assert.match(noSeason, /Нет сезона/);
});
