import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getListFleetEquipmentQueryKey, type GetGpsWorkArea200 } from "@workspace/api-client-react";
import GpsWorkArea, { ResultCard } from "./GpsWorkArea";

const result: GetGpsWorkArea200 = {
  status: "not_connected", areaHa: null, source: "autograph", message: "АвтоГРАФ пока не подключён",
  equipmentId: 7, implement: "Сеялка", startsAt: "2026-10-31T03:00:00Z", endsAt: "2026-10-31T13:00:00Z",
};

test("GPS results distinguish disconnected, missing telemetry and valid zero hectares", () => {
  const disconnected = renderToStaticMarkup(<ResultCard result={result} machineName="Трактор" />);
  assert.match(disconnected, /gps-result-not-connected/);
  assert.doesNotMatch(disconnected, /text-gps-area/);
  const missing = renderToStaticMarkup(<ResultCard result={{ ...result, status: "no_data" }} machineName="Трактор" />);
  assert.match(missing, /gps-result-no-data/);
  assert.doesNotMatch(missing, /text-gps-area/);
  const zero = renderToStaticMarkup(<ResultCard result={{ ...result, status: "available", areaHa: 0 }} machineName="Трактор" />);
  assert.match(zero, /text-gps-area/);
  assert.match(zero, /не влияет на начисления/);
  const real = renderToStaticMarkup(<ResultCard result={{ ...result, status: "available", areaHa: 123.5 }} machineName="Трактор" />);
  assert.match(real, /123,5/);
});

test("GPS form renders actual fleet records and manual implement input without inventing production", () => {
  const client = new QueryClient();
  client.setQueryData(getListFleetEquipmentQueryKey(), [{
    id: 7, kind: "John Deere", registrationNumber: "123ABC", unit: "АПК Арыстан Grain",
    version: 1, updatedAt: "2026-10-31T03:00:00Z", updatedBy: "",
  }]);
  try {
    const html = renderToStaticMarkup(<QueryClientProvider client={client}>
      <GpsWorkArea fields={{ data: [], isLoading: false, isFetching: false, isError: false, error: null, refetch: () => {} }} />
    </QueryClientProvider>);
    assert.match(html, /123ABC/);
    assert.match(html, /input-gps-implement/);
    assert.match(html, /input-gps-start/);
    assert.match(html, /input-gps-end/);
    assert.match(html, /gps-result-idle/);
    assert.doesNotMatch(html, /text-gps-area/);
  } finally { client.clear(); }
});
