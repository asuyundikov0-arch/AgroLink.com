import assert from "node:assert/strict";
import test from "node:test";
import { isSeedingOperation, summarizeDailySeeding } from "./daily-seeding";

const work = (id: number, cropName = "Пшеница", extra = {}) => ({
  id, cropName, name: "Посев", actualOperationName: "Посев", actualStart: "2026-05-01",
  actualEnd: null as string | null, actualAreaAres: 3000, voidedAt: null as Date | null, ...extra,
});
test("seeding names do not include pre-sowing cultivation or other operations", () => {
  for (const name of ["Посев", " посев пшеницы ", "Сев", "Посев: лён"]) assert.equal(isSeedingOperation(name), true);
  for (const name of ["Предпосевная культивация", "Уборка", "Обработка СЗР"]) assert.equal(isSeedingOperation(name), false);
});
test("daily output is the cumulative increase and season output is not the sum of cumulative reports", () => {
  const reports = [
    { operationId: 1, reportDate: "2026-05-03", cumulativeAreaAres: 3000 },
    { operationId: 1, reportDate: "2026-05-01", cumulativeAreaAres: 1000 },
    { operationId: 1, reportDate: "2026-05-02", cumulativeAreaAres: 2500 },
    { operationId: 2, reportDate: "2026-05-02", cumulativeAreaAres: 750 },
  ];
  const operations = [work(1), work(2, "Лён")];
  assert.deepEqual(summarizeDailySeeding(operations, reports, "2026-05-02"), {
    crops: [
      { cropName: "Лён", dailyAreaHa: 7.5, totalAreaHa: 7.5 },
      { cropName: "Пшеница", dailyAreaHa: 15, totalAreaHa: 25 },
    ], dailyAreaHa: 22.5, totalAreaHa: 32.5,
  });
  const nextDay = summarizeDailySeeding(operations, reports, "2026-05-04");
  assert.equal(nextDay.dailyAreaHa, 0);
  assert.equal(nextDay.totalAreaHa, 37.5);
  assert.deepEqual(Object.keys(nextDay.crops[0]).sort(), ["cropName", "dailyAreaHa", "totalAreaHa"]);
});
test("multiple fields and unplanned sowing combine by crop, excluding voided, future and non-sowing facts", () => {
  const operations = [
    work(1, "Пшеница", { actualEnd: "2026-05-02", actualAreaAres: 100 }),
    work(2, " пшеница ", { actualEnd: "2026-05-02", actualAreaAres: 250 }),
    work(3, "Пшеница", { actualEnd: "2026-05-02", voidedAt: new Date() }),
    work(4, "Пшеница", { actualOperationName: "Культивация", actualEnd: "2026-05-02" }),
    work(5, "Рапс", { actualStart: "2026-05-03", actualEnd: "2026-05-03" }),
    work(6, "Лён", { actualStart: null }),
  ];
  const result = summarizeDailySeeding(operations, [], "2026-05-02");
  assert.equal(result.crops.length, 1);
  assert.equal(result.totalAreaHa, 3.5);
  assert.equal(result.dailyAreaHa, 3.5);
});
