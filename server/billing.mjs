import { randomUUID } from "node:crypto";
import { canonical } from "./crypto.mjs";
import { ensure } from "./store.mjs";

const PERIOD = /^\d{4}-\d{2}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const MAX_MICRO_USD = 9_000_000_000_000_000;

const periodNow = () => new Date().toISOString().slice(0, 7);

function exactKeys(value, allowed) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function decimalToMicroUsd(value, label, { allowZero = false } = {}) {
  ensure(
    typeof value === "string" && /^\d{1,9}(?:\.\d{1,6})?$/.test(value),
    `Invalid ${label}.`,
  );
  const [whole, fraction = ""] = value.split(".");
  const result =
    Number(whole) * 1_000_000 + Number((fraction + "000000").slice(0, 6));
  ensure(
    Number.isSafeInteger(result) &&
      result <= MAX_MICRO_USD &&
      (allowZero ? result >= 0 : result > 0),
    `Invalid ${label}.`,
  );
  return result;
}

function money(microUsd) {
  ensure(
    Number.isSafeInteger(microUsd) && microUsd >= 0,
    "Invalid spend amount.",
  );
  const whole = Math.floor(microUsd / 1_000_000);
  let fraction = String(microUsd % 1_000_000).padStart(6, "0");
  while (fraction.length > 2 && fraction.endsWith("0"))
    fraction = fraction.slice(0, -1);
  return `${whole}.${fraction}`;
}

function pricedTokens(tokens, rateMicroUsdPerMillion) {
  ensure(
    Number.isSafeInteger(tokens) && tokens >= 0,
    "Invalid token estimate.",
  );
  const numerator = BigInt(tokens) * BigInt(rateMicroUsdPerMillion);
  const value = (numerator + 999_999n) / 1_000_000n;
  ensure(
    value <= BigInt(Number.MAX_SAFE_INTEGER),
    "Spend estimate exceeds safe limits.",
  );
  return Number(value);
}

function parseCatalog(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid model price catalog JSON.");
  }
  ensure(
    exactKeys(value, ["version", "providers"]) &&
      typeof value.version === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value.version) &&
      exactKeys(value.providers, Object.keys(value.providers || {})),
    "Invalid model price catalog.",
  );
  const prices = new Map();
  const providerEntries = Object.entries(value.providers);
  ensure(
    providerEntries.length > 0 && providerEntries.length <= 16,
    "Invalid model price catalog.",
  );
  for (const [provider, models] of providerEntries) {
    ensure(
      IDENTIFIER.test(provider) &&
        models &&
        typeof models === "object" &&
        !Array.isArray(models),
      "Invalid model price catalog.",
    );
    const modelEntries = Object.entries(models);
    ensure(
      modelEntries.length > 0 && modelEntries.length <= 128,
      "Invalid model price catalog.",
    );
    for (const [model, price] of modelEntries) {
      ensure(
        IDENTIFIER.test(model) &&
          exactKeys(price, ["inputUsdPerMillion", "outputUsdPerMillion"]),
        "Invalid model price catalog.",
      );
      prices.set(`${provider}\0${model}`, {
        input: decimalToMicroUsd(
          price.inputUsdPerMillion,
          "input model price",
          { allowZero: true },
        ),
        output: decimalToMicroUsd(
          price.outputUsdPerMillion,
          "output model price",
          { allowZero: true },
        ),
      });
    }
  }
  return { version: value.version, prices };
}

function requestOutputLimit(request) {
  const limit =
    request.max_output_tokens ??
    request.max_tokens ??
    request.max_completion_tokens;
  ensure(
    Number.isSafeInteger(limit) && limit > 0 && limit <= 100_000,
    "Invalid provider output limit.",
  );
  return limit;
}

export class SpendGuard {
  constructor(store, env = process.env, providers = []) {
    this.store = store;
    this.enabled = env.ORIGIN_SPEND_GUARD === "1";
    this.period = periodNow;
    if (!this.enabled) {
      this.version = null;
      this.prices = new Map();
      this.accountLimit = null;
      this.platformLimit = null;
      ensure(
        env.ORIGIN_IDENTITY_MODE !== "cognito" ||
          !providers.some((provider) => provider.enabled),
        "Managed external AI requires the monetary spend guard.",
      );
      return;
    }
    const catalog = parseCatalog(env.ORIGIN_MODEL_PRICES_JSON || "");
    this.version = catalog.version;
    this.prices = catalog.prices;
    this.accountLimit = decimalToMicroUsd(
      env.ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD || "",
      "account monthly AI budget",
    );
    this.platformLimit = decimalToMicroUsd(
      env.ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD || "",
      "platform monthly AI budget",
    );
    ensure(
      this.platformLimit >= this.accountLimit,
      "Platform AI budget must cover at least one account budget.",
    );
    for (const provider of providers.filter((item) => item.enabled))
      for (const model of provider.models)
        ensure(
          this.prices.has(`${provider.id}\0${model}`),
          `Missing reviewed price for ${provider.id}/${model}.`,
        );
  }

  price(provider, model) {
    const price = this.prices.get(`${provider}\0${model}`);
    ensure(price, "No reviewed model price is configured.", 409);
    return price;
  }

  quote(provider, model, request) {
    if (!this.enabled) return null;
    const price = this.price(provider, model);
    const inputUpperBoundTokens = Buffer.byteLength(canonical(request));
    const outputUpperBoundTokens = requestOutputLimit(request);
    const reservedMicroUsd =
      pricedTokens(inputUpperBoundTokens, price.input) +
      pricedTokens(outputUpperBoundTokens, price.output);
    ensure(reservedMicroUsd > 0, "Configured model price reserves no spend.");
    return {
      catalogVersion: this.version,
      maximumReservedUsd: money(reservedMicroUsd),
      inputUpperBoundTokens,
      outputUpperBoundTokens,
      basis:
        "Conservative application reservation; final amount is an estimate, not a provider invoice.",
    };
  }

  reserve(
    uid,
    projectId,
    provider,
    model,
    request,
    accountLimitOverride = null,
  ) {
    if (!this.enabled) return null;
    const price = this.price(provider, model);
    // One UTF-8 byte per input token is deliberately conservative for reservation.
    const inputUpperBoundTokens = Buffer.byteLength(canonical(request));
    const outputUpperBoundTokens = requestOutputLimit(request);
    const reservedMicroUsd =
      pricedTokens(inputUpperBoundTokens, price.input) +
      pricedTokens(outputUpperBoundTokens, price.output);
    ensure(reservedMicroUsd > 0, "Configured model price reserves no spend.");
    const reservation = {
      id: randomUUID(),
      uid,
      projectId,
      period: this.period(),
      provider,
      model,
      catalogVersion: this.version,
      reservedMicroUsd,
      inputUpperBoundTokens,
      outputUpperBoundTokens,
    };
    const accountLimit = accountLimitOverride ?? this.accountLimit;
    ensure(
      Number.isSafeInteger(accountLimit) &&
        accountLimit > 0 &&
        accountLimit <= this.platformLimit,
      "Plan AI budget is not compatible with the platform budget.",
      409,
    );
    this.store.reserveSpend(reservation, accountLimit, this.platformLimit);
    return reservation;
  }

  complete(reservation, usage) {
    if (!reservation) return null;
    if (
      !Number.isSafeInteger(usage?.inputTokens) ||
      usage.inputTokens < 0 ||
      !Number.isSafeInteger(usage?.outputTokens) ||
      usage.outputTokens < 0
    ) {
      this.store.markSpendUnknown(reservation.id, reservation.uid);
      return {
        ...this.publicReservation(reservation),
        status: "outcome-unknown",
        estimatedUsd: null,
      };
    }
    const price = this.price(reservation.provider, reservation.model);
    const estimatedMicroUsd =
      pricedTokens(usage.inputTokens, price.input) +
      pricedTokens(usage.outputTokens, price.output);
    this.store.completeSpend(
      reservation.id,
      reservation.uid,
      estimatedMicroUsd,
      usage.inputTokens,
      usage.outputTokens,
    );
    return {
      ...this.publicReservation(reservation),
      status: "estimated",
      estimatedUsd: money(estimatedMicroUsd),
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    };
  }

  unknown(reservation) {
    if (!reservation) return null;
    this.store.markSpendUnknown(reservation.id, reservation.uid);
    return {
      ...this.publicReservation(reservation),
      status: "outcome-unknown",
      estimatedUsd: null,
    };
  }

  release(reservation) {
    if (reservation) this.store.releaseSpend(reservation.id, reservation.uid);
  }

  summary(uid, accountLimitOverride = null) {
    if (!this.enabled)
      return {
        enabled: false,
        enforcement: "request-count-only",
      };
    const usage = this.store.spendUsage(uid, this.period());
    const accountLimit = accountLimitOverride ?? this.accountLimit;
    return {
      enabled: true,
      enforcement: "reserved-before-provider-call",
      period: this.period(),
      catalogVersion: this.version,
      account: {
        countedUsd: money(usage.accountMicroUsd),
        limitUsd: money(accountLimit),
        uncertainReservations: usage.accountUncertain,
      },
      platform: {
        enforced: true,
        details: "operator-only",
      },
      note: "Amounts are application estimates or conservative reservations, not provider invoices.",
    };
  }

  publicReservation(reservation) {
    if (!reservation) return null;
    return {
      id: reservation.id,
      period: reservation.period,
      provider: reservation.provider,
      model: reservation.model,
      catalogVersion: reservation.catalogVersion,
      status: "reserved",
      reservedUsd: money(reservation.reservedMicroUsd),
      inputUpperBoundTokens: reservation.inputUpperBoundTokens,
      outputUpperBoundTokens: reservation.outputUpperBoundTokens,
    };
  }
}

export const billingInternals = Object.freeze({
  decimalToMicroUsd,
  money,
  parseCatalog,
  pricedTokens,
});
