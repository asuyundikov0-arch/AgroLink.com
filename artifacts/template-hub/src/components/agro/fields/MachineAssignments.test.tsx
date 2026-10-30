import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { collectAssignments, ExtraMachinesEditor } from "./MachineAssignments";
import { collectMachineReports, dailyMachineRows, MachineDailyEditor } from "./MachineDailyEditor";

test("each machine requires its own employee; daily hectares and money stay separate", () => {
  const first = { equipmentId: 1, employeeId: 10, employeeName: "Первый", implement: "Сеялка 1" };
  const second = { equipmentId: 2, employeeId: 20, employeeName: "Второй", implement: "Сеялка 2" };
  assert.ok(collectAssignments(first, [{ ...second, employeeId: 10 }]).error);
  assert.ok(collectAssignments(first, [{ ...second, equipmentId: 1 }]).error);
  assert.equal(collectAssignments(first, [second]).rows.length, 2);
  const rows = dailyMachineRows([first, second].map(r => ({ ...r, equipmentId: r.equipmentId!, employeeId: r.employeeId!, equipmentName: `Машина ${r.equipmentId}` })));
  assert.ok(collectMachineReports(rows).error);
  const filled = rows.map((r, i) => ({ ...r, area: i ? "20" : "10", rate: i ? "1200" : "1100" }));
  const result = collectMachineReports(filled);
  assert.equal(result.area, 30);
  assert.deepEqual(result.reports.map(r => r.dailyAreaHa * r.ratePerHa), [11000, 24000]);
  const html = renderToStaticMarkup(<MachineDailyEditor rows={filled} onChange={() => {}} areaLocked={false} />);
  assert.match(html, /daily-machine-area-1/);
  assert.match(html, /daily-machine-rate-2/);
  assert.match(html, /Первый/); assert.match(html, /Второй/);
  assert.match(renderToStaticMarkup(<ExtraMachinesEditor rows={[]} onChange={() => {}} fleet={[]} prefix="plan" />), /plan-add-machine/);
});
