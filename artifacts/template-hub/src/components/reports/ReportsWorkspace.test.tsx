import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReportsWorkspace, { canViewReports } from "./ReportsWorkspace";
import AgroWorkspace from "../agro/AgroWorkspace";

test("reports catalog is available to the original agronomy report readers only", () => {
  for (const role of ["agronomist", "chief_agronomist", "grain_manager", "weigher", "general_director"]) {
    assert.equal(canViewReports(role), true);
    const html = renderToStaticMarkup(<ReportsWorkspace role={role} />);
    assert.match(html, /button-reports-agro/);
    assert.match(html, /Агро отчёты/);
    assert.match(html, /Ежедневный отчёт по посеву/);
  }
  for (const role of ["engineer", "chief_engineer", "dispatcher", "economist", "hr", "unknown"]) {
    assert.equal(canViewReports(role), false);
    const html = renderToStaticMarkup(<ReportsWorkspace role={role} />);
    assert.match(html, /status-reports-forbidden/);
    assert.doesNotMatch(html, /button-reports-agro/);
  }
});

test("agro navigation no longer contains daily reports and preserves operational sections", () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  const html = renderToStaticMarkup(<QueryClientProvider client={client}><AgroWorkspace role="general_director" /></QueryClientProvider>);
  assert.doesNotMatch(html, /tab-agro-report|Ежедневный отчёт/);
  for (const tab of ["grain", "fields", "chemicals", "tok-payroll", "tok-orders", "dispatch"]) {
    assert.match(html, new RegExp(`tab-agro-${tab}`));
  }
  client.clear();
});
