import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getGetGrainDashboardQueryKey, getGetSeedWarehouseQueryKey, type SeedStock } from "@workspace/api-client-react";
import GrainBalance from "../GrainBalance";
import BalanceOperationForm from "../grain/BalanceOperationForm";
import { SeedKpis, SeedStockOverview } from "./SeedOverview";

const stocks: SeedStock[] = [{ unit: "АПК Арыстан Grain", cropId: 1, cropName: "Пшеница", quantityTons: 7, pricePerTon: 100000, amount: 700000 }];
const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, staleTime: Infinity, retry: false } } });

test("initial grain balance shows seed cards and crop stocks without a separate seed tab", () => {
  const qc = client();
  qc.setQueryData(getGetGrainDashboardQueryKey(), {
    asOfDate: "2026-10-30", crops: [{ id: 1, name: "Пшеница" }], locations: [], balances: [], movements: [],
  });
  qc.setQueryData(getGetSeedWarehouseQueryKey(), { asOfDate: "2026-10-30", stocks, movements: [] });
  const html = renderToStaticMarkup(<QueryClientProvider client={qc}><GrainBalance role="weigher" /></QueryClientProvider>);
  assert.match(html, /text-seed-total-tons/);
  assert.match(html, /text-seed-total-kzt/);
  assert.match(html, /700.000/);
  assert.match(html, /Семена по культурам/);
  assert.match(html, /row-seed-stock-1/);
  assert.match(html, /button-new-movement/);
  assert.doesNotMatch(html, /tab-grain-seeds|button-new-seed-movement/);
  qc.clear();
});

test("main operation entry offers grain and seeds without changing existing grain inputs", () => {
  const qc = client();
  const common = { role: "weigher", crops: [], locations: [], asOfDate: "2026-10-30", defaultUnit: "АПК Арыстан Grain" as const, onClose() {}, onDone() {} };
  const html = renderToStaticMarkup(<QueryClientProvider client={qc}><BalanceOperationForm
    grain={{ ...common, stock: () => 0 }} seeds={{ ...common, stocks, balances: [] }} seedsReady /></QueryClientProvider>);
  assert.match(html, /button-operation-material-grain/);
  assert.match(html, /button-operation-material-seeds/);
  assert.match(html, /button-op-receipt/);
  assert.doesNotMatch(html, /button-op-seed_transfer/);
  qc.clear();
});

test("seed error is local, and grouped stocks preserve per-farm tons and money", () => {
  const html = renderToStaticMarkup(<>
    <SeedKpis stocks={[]} movements={[]} loading={false} failed onRetry={() => {}} />
    <SeedStockOverview stocks={[...stocks, { ...stocks[0], unit: "АФ Веденовка", quantityTons: 3, amount: 300000 }]} />
  </>);
  assert.match(html, /Остальные показатели доступны/);
  assert.match(html, /1.000.000/);
  assert.match(html, /10 т/);
  assert.match(html, /АФ Веденовка/);
});
