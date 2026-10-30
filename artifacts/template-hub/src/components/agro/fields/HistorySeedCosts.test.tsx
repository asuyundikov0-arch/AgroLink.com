import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetFieldCostsQueryKey, type FieldCosts } from "@workspace/api-client-react";
import { HistorySeedCosts } from "./HistorySeedCosts";

test("history displays approved seed issues without requiring a planned seed budget or started operation", () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity, retry: false } } });
  const totals = { chemicalCost: 0, fuelCost: 0, salaryCost: 0, seedCost: 800000, totalCost: 800000, fuelLiters: 0 };
  const costs: FieldCosts = {
    ...totals, fieldId: 1, seasonId: 2, unallocatedChemicalCost: 0, unallocatedSeedCost: 0,
    operations: [{ ...totals, operationId: 3, name: "Посев", chemicals: [], fuels: [], salaries: [],
      seedIssues: [{ movementId: 4, cropName: "Пшеница", occurredOn: "2026-05-01", quantityTons: 7, amount: 800000 }] }],
  };
  client.setQueryData(getGetFieldCostsQueryKey(2), costs);
  const html = renderToStaticMarkup(<QueryClientProvider client={client}>
    <HistorySeedCosts seasonId={2} />
    <HistorySeedCosts seasonId={2} operationId={3} />
  </QueryClientProvider>);
  assert.match(html, /history-seed-cost-season-2/);
  assert.match(html, /history-seed-cost-operation-3/);
  assert.match(html, /800.000/);
  assert.match(html, /Пшеница/);
  assert.match(html, /7 т/);
  assert.match(html, /Плановый бюджет не включён/);
  client.clear();
});
