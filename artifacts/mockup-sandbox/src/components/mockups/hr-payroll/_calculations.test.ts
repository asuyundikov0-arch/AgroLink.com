import assert from "node:assert/strict";
import { test } from "node:test";
import { calcCard, cardError, type TimecardBasis } from "./_calculations";

const salary: TimecardBasis = { role: "salary", measure: "days", rate: 300000, quantity: 18, standardDays: 22 };
const hourly: TimecardBasis = { role: "general", measure: "hours", rate: 920, quantity: 156 };
const daily: TimecardBasis = { role: "general", measure: "days", rate: 8500, quantity: 18 };

test("salary uses actual days and demo monthly norm, rounded once", () => {
  assert.equal(calcCard(salary), 245454.55);
  assert.equal(calcCard({ ...salary, quantity: 22 }), 300000);
  assert.equal(calcCard({ ...salary, rate: 270000, quantity: 22 }), 270000);
  assert.equal(calcCard({ ...salary, quantity: 0.5 }), 6818.18);
});

test("hourly and daily workers use their own unit and actual time", () => {
  assert.equal(calcCard(hourly), 143520);
  assert.equal(calcCard(daily), 153000);
  assert.equal(calcCard({ ...hourly, rate: 0.1, quantity: 1.5 }), 0.15);
  assert.equal(cardError(daily), null);
});

test("invalid drafts cannot lower or inflate expected payroll totals", () => {
  const invalid = [
    { ...salary, quantity: 23 }, { ...salary, standardDays: 0 },
    { ...salary, standardDays: Number.NaN }, { ...salary, rate: Number.POSITIVE_INFINITY },
    { ...salary, rate: -1 }, { ...hourly, quantity: -10 },
    { ...hourly, quantity: Number.NaN }, { ...hourly, quantity: 745 },
    { ...daily, quantity: 32 }, { ...daily, rate: 1_000_000_001 },
  ];
  for (const card of invalid) {
    assert.ok(cardError(card));
    assert.equal(calcCard(card), 0);
  }
});
