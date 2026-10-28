import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgroField, FieldOperation, FieldSeason } from "@workspace/api-client-react";
import { FieldDirectory } from "./FieldDirectory";

const fields = [406, 1000, 1000, 500, 600].map((areaHa, index) => ({
  id: index + 1, number: String(index + 1), unit: "АПК Арыстан Grain",
  areaHa, notes: "", isActive: true,
})) as AgroField[];
const seasons = [{ id: 10, fieldId: 1 }, { id: 20, fieldId: 1 }] as FieldSeason[];
const operations = [
  { id: 100, seasonId: 10, status: "completed", actualStart: "2025-05-01", isUnplanned: false },
  { id: 200, seasonId: 20, status: "planned", actualStart: null, isUnplanned: false },
  { id: 300, seasonId: 20, status: "cancelled", actualStart: null, isUnplanned: false },
] as FieldOperation[];
const noop = () => {};
const base = { fields, seasons, operations, canManage: false, generalDirector: false, onAdd: noop, onEdit: noop, onHistory: noop };

test("field directory uses the same field identities and links work across seasons", () => {
  const html = renderToStaticMarkup(<FieldDirectory {...base} />);
  for (const field of fields) {
    assert.ok(html.includes(`row-directory-field-${field.id}`));
    assert.ok(html.includes(`button-directory-history-${field.id}`));
    assert.ok(html.includes(`Поле № ${field.number}`));
  }
  assert.ok(html.includes("3 506 га"), "Total includes all directory fields, including those without a season");
  const firstRow = html.slice(html.indexOf('data-testid="row-directory-field-1"'), html.indexOf('data-testid="row-directory-field-2"'));
  assert.ok(firstRow.includes("сезонов: 2"));
  assert.ok(firstRow.includes("Планов: 2 · фактических работ: 1"));
  assert.ok(!html.includes("button-directory-add-field"));
  assert.ok(!html.includes("button-directory-edit-"));
});

test("directory keeps existing field-management and archive permissions", () => {
  const archived = fields.map((field) => field.id === 5 ? { ...field, isActive: false } : field);
  const manager = renderToStaticMarkup(<FieldDirectory {...base} fields={archived} canManage />);
  assert.ok(manager.includes("button-directory-add-field"));
  assert.ok(manager.includes("button-directory-edit-1"));
  assert.ok(!manager.includes("button-directory-edit-5"));
  const director = renderToStaticMarkup(<FieldDirectory {...base} fields={archived} canManage generalDirector />);
  assert.ok(director.includes("button-directory-edit-5"));
  assert.ok(director.includes("Архивное"));
});
