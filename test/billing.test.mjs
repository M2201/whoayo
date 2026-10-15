import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { SpendGuard, billingInternals } from "../server/billing.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";

const prices = JSON.stringify({
  version: "synthetic-2026-10",
  providers: {
    openai: {
      "fixture-model": {
        inputUsdPerMillion: "2.000000",
        outputUsdPerMillion: "10.000000",
      },
    },
  },
});

const guardedEnv = (overrides = {}) => ({
  ORIGIN_EXTERNAL_AI: "1",
  ORIGIN_OPENAI_KEY: "synthetic-not-a-key",
  ORIGIN_OPENAI_MODEL: "fixture-model",
  ORIGIN_DAILY_REQUEST_LIMIT: "20",
  ORIGIN_SPEND_GUARD: "1",
  ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD: "0.05",
  ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD: "0.10",
  ORIGIN_MODEL_PRICES_JSON: prices,
  ...overrides,
});

async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    username: "billing-fixture",
    name: "Synthetic Billing Fixture",
    password: "Synthetic billing password 42!",
  });
  const project = store.create(user.id, { title: "Synthetic cost test" });
  return { store, user, project };
}

function prepare(gateway, user, project) {
  return gateway.prepare(user.id, project.id, {
    revision: project.revision,
    provider: "openai",
    threadId: project.threads[0].id,
    content: "Return a bounded synthetic answer.",
    mode: "plan",
    artifactIds: [],
    includeHistory: false,
  });
}

function approve(prepared) {
  return {
    revision: prepared.project.revision,
    approvalToken: prepared.preview.approvalToken,
    digest: prepared.preview.digest,
    approved: true,
  };
}

function success(usage = { input_tokens: 12, output_tokens: 6 }) {
  return Response.json({
    model: "fixture-model",
    output: [
      {
        type: "message",
        content: [{ type: "output_text", text: "Synthetic answer." }],
      },
    ],
    ...(usage ? { usage } : {}),
  });
}

test("money parsing and token pricing use fixed-point integers", () => {
  assert.equal(
    billingInternals.decimalToMicroUsd("12.345678", "test"),
    12_345_678,
  );
  assert.equal(billingInternals.money(12_349_999), "12.349999");
  assert.equal(billingInternals.pricedTokens(3, 333_333), 1);
  assert.throws(
    () => billingInternals.decimalToMicroUsd("1.0000001", "test"),
    /Invalid/,
  );
});

test("managed external AI fails closed without an enabled spend guard", async (t) => {
  const { store } = await fixture(t);
  assert.throws(
    () =>
      new Gateway(store, {
        env: guardedEnv({
          ORIGIN_IDENTITY_MODE: "cognito",
          ORIGIN_SPEND_GUARD: "0",
        }),
      }),
    /requires the monetary spend guard/,
  );
});

test("guarded request reserves before fetch and reconciles to an estimate", async (t) => {
  const { store, user, project } = await fixture(t);
  let calls = 0;
  const gateway = new Gateway(store, {
    env: guardedEnv(),
    fetcher: async () => {
      calls++;
      const row = store.db
        .prepare("SELECT status FROM spend_reservations")
        .get();
      assert.equal(row.status, "reserved");
      return success();
    },
  });
  const prepared = prepare(gateway, user, project);
  assert.equal(prepared.preview.spendQuote.catalogVersion, "synthetic-2026-10");
  assert.ok(Number(prepared.preview.spendQuote.maximumReservedUsd) < 0.05);
  const result = await gateway.send(user.id, project.id, approve(prepared));
  assert.equal(calls, 1);
  assert.equal(result.disclosures[0].spend.status, "estimated");
  assert.equal(result.disclosures[0].spend.estimatedUsd, "0.000084");
  assert.deepEqual(
    {
      ...store.db
        .prepare(
          "SELECT status,input_tokens,output_tokens FROM spend_reservations",
        )
        .get(),
    },
    { status: "estimated", input_tokens: 12, output_tokens: 6 },
  );
  const summary = gateway.spend.summary(user.id);
  assert.equal(summary.enabled, true);
  assert.equal(summary.account.uncertainReservations, 0);
  assert.equal(summary.note.includes("not provider invoices"), true);
});

test("account budget blocks before a provider call and rolls back reservation", async (t) => {
  const { store, user, project } = await fixture(t);
  let calls = 0;
  const gateway = new Gateway(store, {
    env: guardedEnv({
      ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD: "0.01",
      ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD: "0.10",
    }),
    fetcher: async () => {
      calls++;
      return success();
    },
  });
  const prepared = prepare(gateway, user, project);
  await assert.rejects(
    () => gateway.send(user.id, project.id, approve(prepared)),
    /Monthly account AI budget reached/,
  );
  assert.equal(calls, 0);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS count FROM spend_reservations").get()
      .count,
    0,
  );
});

test("ambiguous provider outcome keeps its reservation and blocks overspend", async (t) => {
  const { store, user, project } = await fixture(t);
  let calls = 0;
  const gateway = new Gateway(store, {
    env: guardedEnv(),
    fetcher: async () => {
      calls++;
      throw new DOMException("synthetic timeout", "TimeoutError");
    },
  });
  const first = prepare(gateway, user, project);
  await assert.rejects(
    () => gateway.send(user.id, project.id, approve(first)),
    /No automatic retry/,
  );
  assert.equal(
    store.db.prepare("SELECT status FROM spend_reservations").get().status,
    "outcome-unknown",
  );
  const state = store.project(user.id, project.id);
  const second = prepare(gateway, user, state);
  await assert.rejects(
    () => gateway.send(user.id, project.id, approve(second)),
    /Monthly account AI budget reached/,
  );
  assert.equal(calls, 1);
  assert.equal(gateway.spend.summary(user.id).account.uncertainReservations, 1);
});

test("successful response without usage stays conservatively reserved", async (t) => {
  const { store, user, project } = await fixture(t);
  const gateway = new Gateway(store, {
    env: guardedEnv(),
    fetcher: async () => success(null),
  });
  const prepared = prepare(gateway, user, project);
  const result = await gateway.send(user.id, project.id, approve(prepared));
  assert.equal(result.disclosures[0].status, "completed");
  assert.equal(result.disclosures[0].spend.status, "outcome-unknown");
  assert.equal(
    store.db.prepare("SELECT status FROM spend_reservations").get().status,
    "outcome-unknown",
  );
});

test("enabled providers require a reviewed price entry", async (t) => {
  const { store } = await fixture(t);
  const badCatalog = JSON.stringify({
    version: "synthetic",
    providers: {
      openai: {
        "different-model": {
          inputUsdPerMillion: "1.00",
          outputUsdPerMillion: "1.00",
        },
      },
    },
  });
  assert.throws(
    () =>
      new SpendGuard(
        store,
        guardedEnv({ ORIGIN_MODEL_PRICES_JSON: badCatalog }),
        [{ id: "openai", enabled: true, models: ["fixture-model"] }],
      ),
    /Missing reviewed price/,
  );
});

test("restart reconciliation keeps every unsettled reservation counted", async (t) => {
  const { store, user, project } = await fixture(t);
  store.reserveSpend(
    {
      id: "synthetic-interrupted-reservation",
      uid: user.id,
      projectId: project.id,
      period: new Date().toISOString().slice(0, 7),
      provider: "openai",
      model: "fixture-model",
      catalogVersion: "synthetic-2026-10",
      reservedMicroUsd: 12_345,
    },
    50_000,
    100_000,
  );
  assert.equal(store.reconcileInterruptedSpend(), 1);
  assert.equal(
    store.db.prepare("SELECT status FROM spend_reservations").get().status,
    "outcome-unknown",
  );
  assert.equal(store.reconcileInterruptedSpend(), 0);
});
