import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { isSowing, seedPlanOf, seedRowFrom, seedTotal, SeedPlanSummary } from "./SeedPlanEditor";
import { workTotal, supportRowsFrom, supportPlanOf, SupportingWorksSummary } from "./SupportingWorksEditor";

test("seeds are a separate sowing budget, not a supporting-work cost", () => {
  for (const name of ["Посев", " Сев пшеницы ", "Посев: рапс"]) assert.equal(isSowing(name), true);
  for (const name of ["Предпосевная культивация", "Опрыскивание", "Уборка"]) assert.equal(isSowing(name), false);
  const seeds = { name: "Пшеница", quantity: 2.5, unit: "ton" as const, unitPrice: 100000 };
  assert.equal(seedTotal(seeds), 250000);
  assert.deepEqual(seedPlanOf(seedRowFrom(seeds)), { plan: seeds, errors: {} });
  assert.equal(seedPlanOf({ ...seedRowFrom(seeds), quantity: "0.0001" }).plan, null);
  const support = {
    name: "Подвоз", equipmentId: null, employeeIds: [], salaryCost: 5000, fuelCost: 3000,
    seedName: "Старые семена", seedQuantity: 100, seedUnit: "ton" as const, seedPrice: 99999,
  };
  assert.equal(workTotal(support), 8000, "Historical supporting seeds never increase the budget");
  assert.deepEqual(supportPlanOf(supportRowsFrom([support])).works[0], {
    ...support, equipmentName: "", employeeNames: [],
  }, "Editing wage/fuel fields does not silently erase historical data");
  const supportingHtml = renderToStaticMarkup(<SupportingWorksSummary works={[support]} title="Сопутствующие" testId="support" />);
  assert.doesNotMatch(supportingHtml, /Старые семена|99999/);
  assert.match(supportingHtml, /8.000/);
  assert.equal(renderToStaticMarkup(<SeedPlanSummary seeds={seeds} opName="Культивация" testId="seeds" />), "");
  assert.match(renderToStaticMarkup(<SeedPlanSummary seeds={seeds} opName="Посев" testId="seeds" />), /Пшеница/);
});
