import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function integer(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0))
    throw new Error(`Invalid ${label}.`);
  return BigInt(value);
}

function formatCents(cents) {
  const value = BigInt(cents);
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function roundedBasisPoints(numerator, denominator) {
  return denominator ? Number((numerator * 10_000n) / denominator) : 0;
}

export function calculateUnitEconomics(plan) {
  if (
    plan?.schema !== "whoayo-unit-economics/1" ||
    plan.status !== "proposed-not-live" ||
    plan.currency !== "USD" ||
    !Array.isArray(plan.tiers) ||
    plan.tiers.length < 1 ||
    plan.tiers.length > 10
  )
    throw new Error("Invalid unit-economics plan.");
  const weeklyTarget = integer(
    plan.weeklyRevenueTargetCents,
    "weekly revenue target",
    { positive: true },
  );
  const marginFloor = integer(
    plan.grossMarginFloorBasisPoints,
    "gross margin floor",
    { positive: true },
  );
  const paymentBps = integer(plan.paymentFeeBasisPoints, "payment fee");
  const paymentFlat = integer(plan.paymentFeeFlatCents, "flat payment fee");
  if (marginFloor > 10_000n || paymentBps > 10_000n)
    throw new Error("Invalid percentage.");

  let monthlyRevenue = 0n;
  let monthlyCogs = 0n;
  let accounts = 0n;
  const tiers = plan.tiers.map((tier) => {
    if (
      typeof tier.name !== "string" ||
      !tier.name.trim() ||
      !tier.directCogsPerAccountCents ||
      typeof tier.directCogsPerAccountCents !== "object" ||
      Array.isArray(tier.directCogsPerAccountCents)
    )
      throw new Error("Invalid tier.");
    const price = integer(tier.monthlyPriceCents, "monthly price", {
      positive: true,
    });
    const count = integer(tier.targetAccounts, "target accounts", {
      positive: true,
    });
    const direct = Object.values(tier.directCogsPerAccountCents).reduce(
      (sum, value) => sum + integer(value, "direct COGS"),
      0n,
    );
    const payment = (price * paymentBps + 5_000n) / 10_000n + paymentFlat;
    const revenue = price * count;
    const cogs = (direct + payment) * count;
    monthlyRevenue += revenue;
    monthlyCogs += cogs;
    accounts += count;
    return {
      name: tier.name,
      targetAccounts: Number(count),
      monthlyPriceUsd: formatCents(price),
      monthlyRevenueUsd: formatCents(revenue),
      directCogsPerAccountUsd: formatCents(direct + payment),
      grossMarginBasisPoints: roundedBasisPoints(
        price - direct - payment,
        price,
      ),
    };
  });
  const monthlyGrossProfit = monthlyRevenue - monthlyCogs;
  const weeklyRevenue = (monthlyRevenue * 12n) / 52n;
  const weeklyGrossProfit = (monthlyGrossProfit * 12n) / 52n;
  const grossMarginBasisPoints = roundedBasisPoints(
    monthlyGrossProfit,
    monthlyRevenue,
  );
  const maximumCogsAtFloor =
    (monthlyRevenue * (10_000n - marginFloor)) / 10_000n;
  const cogsBuffer = maximumCogsAtFloor - monthlyCogs;
  return {
    status: plan.status,
    currency: plan.currency,
    targetAccounts: Number(accounts),
    monthlyRevenueUsd: formatCents(monthlyRevenue),
    weeklyRevenueUsd: formatCents(weeklyRevenue),
    monthlyDirectCogsUsd: formatCents(monthlyCogs),
    monthlyGrossProfitUsd: formatCents(monthlyGrossProfit),
    weeklyGrossProfitUsd: formatCents(weeklyGrossProfit),
    grossMarginBasisPoints,
    grossMarginPercent: (grossMarginBasisPoints / 100).toFixed(2),
    cogsBufferAboveFloorUsd: formatCents(cogsBuffer),
    passesWeeklyRevenueTarget: weeklyRevenue >= weeklyTarget,
    passesGrossMarginFloor: grossMarginBasisPoints >= Number(marginFloor),
    tiers,
    caveat:
      "Planning model only. Replace allowances with reconciled provider, infrastructure, payment, timestamp and direct-support costs before selling a tier.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const plan = JSON.parse(
      readFileSync(resolve(root, "operations/unit-economics.json"), "utf8"),
    );
    const result = calculateUnitEconomics(plan);
    console.log(JSON.stringify(result, null, 2));
    if (!result.passesWeeklyRevenueTarget || !result.passesGrossMarginFloor)
      process.exitCode = 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
