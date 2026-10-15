import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculateUnitEconomics } from "../scripts/check-unit-economics.mjs";

const plan = JSON.parse(
  readFileSync(new URL("../operations/unit-economics.json", import.meta.url)),
);

test("proposed target mix clears weekly revenue and gross-margin floors", () => {
  const result = calculateUnitEconomics(plan);
  assert.equal(result.targetAccounts, 260);
  assert.equal(result.monthlyRevenueUsd, "43990.00");
  assert.equal(result.passesWeeklyRevenueTarget, true);
  assert.equal(result.passesGrossMarginFloor, true);
  assert.ok(result.grossMarginBasisPoints >= 5500);
});

test("unit-economics check fails a plan that misses the margin floor", () => {
  const expensive = structuredClone(plan);
  expensive.tiers[0].directCogsPerAccountCents.aiAllowance = 100_000;
  const result = calculateUnitEconomics(expensive);
  assert.equal(result.passesGrossMarginFloor, false);
});
