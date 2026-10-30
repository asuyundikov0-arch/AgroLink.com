import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { FactsView } from "./FieldsWorkspace";

const noop = () => {};
test("actual field list matches plan register with crop colours, predecessor, progress and pending badges", () => {
  const field = { id: 1, number: "1", unit: "АПК Арыстан Grain", areaHa: 100, isActive: true } as AgroField;
  const season = { id: 10, fieldId: 1, year: 2026, cropName: "Пшеница", areaHa: 100 } as FieldSeason;
  const previous = { ...season, id: 9, year: 2025, cropName: "Рапс" };
  const ops = [
    { id: 20, seasonId: 10, status: "in_progress", completionRequestedOn: "2026-05-01" },
    { id: 21, seasonId: 10, status: "planned", isUnplanned: true, actualStart: null, approvalStatus: "pending" },
  ] as FieldOperation[];
  const html = renderToStaticMarkup(<FactsView year={2026} unitAll scopeFields={[field, { ...field, id: 2, number: "2" }]}
    yearSeasons={[season]} seasons={[season, previous, { ...previous, year: 2027, cropName: "Не предшественник" }]} ops={ops}
    pfBySeason={new Map([[10, { plannedHa: 100, doneHa: 30, unplannedHa: 0, percent: 30 }]])}
    role="agronomist" fieldId={null} onPick={noop} onHistory={noop} onWork={noop} onLifecycle={noop} onVoid={noop} onUnplanned={noop} />);
  for (const id of ["row-facts-field-1", "row-facts-field-2", "button-facts-open-field-1", "text-facts-predecessor-1",
    "text-facts-planfact-1", "badge-facts-completion-1", "badge-facts-unplanned-1"]) assert.ok(html.includes(id), id);
  assert.match(html, /Рапс/); assert.match(html, /2025/);
  assert.ok(!html.includes("Не предшественник"));
  assert.ok(html.indexOf("row-facts-field-1") < html.indexOf("row-facts-field-2"));
  assert.match(html, /hsl\(38 55% 45% \/ \.12\)/);
});
