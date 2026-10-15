import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { Payments } from "../server/payments.mjs";
import { Gateway } from "../server/gateway.mjs";
import { ProviderTestGateway } from "./provider-gateway.mjs";
import { createServer } from "../server/http.mjs";
import { once } from "node:events";
import { hash } from "../server/crypto.mjs";

const now = Date.now();
const nowSeconds = Math.floor(now / 1000);
const webhookSecret = "whsec_" + "synthetic_fixture_secret_123456";
const priceCatalog = JSON.stringify({
  version: "synthetic-2026-10",
  tiers: {
    builder: {
      priceId: "price_builder_synthetic_123456",
      monthlyAiBudgetUsd: "20.00",
    },
    studio: {
      priceId: "price_studio_synthetic_123456",
      monthlyAiBudgetUsd: "80.00",
    },
  },
});
const paymentEnv = (overrides = {}) => ({
  ORIGIN_PAYMENTS_MODE: "stripe-test",
  ORIGIN_REQUIRE_PAID_ENTITLEMENT: "1",
  ORIGIN_PUBLIC_ORIGIN: "https://whoayo.example",
  ORIGIN_STRIPE_SECRET_KEY: "sk_test_" + "synthetic_fixture_secret_123456",
  ORIGIN_STRIPE_WEBHOOK_SECRET: webhookSecret,
  ORIGIN_STRIPE_API_VERSION: "2026-09-30.synthetic",
  ORIGIN_STRIPE_PRICE_MAP_JSON: priceCatalog,
  ...overrides,
});

function managed(store, suffix = "one") {
  const identity = {
    issuer: "https://issuer.example/payments",
    subject: `payment-subject-${suffix}`,
    email: `${suffix}@example.invalid`,
    emailVerified: true,
    name: `Synthetic ${suffix}`,
  };
  identity.identityKey = hash(`${identity.issuer}\0${identity.subject}`);
  return store.managedAccount(identity);
}

function sign(body, timestamp = nowSeconds) {
  const digest = createHmac("sha256", webhookSecret)
    .update(`${timestamp}.`)
    .update(body)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

function subscription({
  uid,
  id = "sub_synthetic_123456",
  customer = "cus_synthetic_123456",
  price = "price_builder_synthetic_123456",
  status = "active",
  periodEnd = nowSeconds + 30 * 86400,
} = {}) {
  return {
    id,
    object: "subscription",
    livemode: false,
    customer,
    status,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    metadata: { whoayo_user_id: uid },
    items: {
      data: [
        {
          quantity: 1,
          price: { id: price },
          current_period_end: periodEnd,
        },
      ],
    },
  };
}

function event(type, object, overrides = {}) {
  return {
    id: overrides.id || "evt_synthetic_123456",
    object: "event",
    api_version: "2026-09-30.synthetic",
    created: overrides.created || nowSeconds,
    livemode: false,
    type,
    data: { object },
  };
}

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("payment configuration is default-off and rejects live mode until acceptance is implemented", () => {
  const off = new Payments(null, { env: {} });
  assert.deepEqual(off.catalog(), {
    enabled: false,
    requiredForHostedAi: false,
    mode: "off",
    version: null,
    tiers: [],
  });
  assert.throws(
    () =>
      new Payments(null, {
        env: paymentEnv({
          ORIGIN_PAYMENTS_MODE: "stripe-live",
          ORIGIN_STRIPE_SECRET_KEY:
            "sk_live_" + "synthetic_fixture_secret_123456",
        }),
      }),
    /Live billing acceptance is incomplete/,
  );
  assert.throws(
    () =>
      new Payments(null, {
        env: { ORIGIN_REQUIRE_PAID_ENTITLEMENT: "1" },
      }),
    /requires payments/,
  );
});

test("Checkout uses only the server allowlist and does not grant entitlement", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  const calls = [];
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async (url, request) => {
      calls.push({ url, request });
      if (url.endsWith("/customers"))
        return responseJson({
          id: "cus_synthetic_123456",
          object: "customer",
          livemode: false,
        });
      if (url.endsWith("/checkout/sessions")) {
        const form = new URLSearchParams(request.body);
        assert.equal(
          form.get("line_items[0][price]"),
          "price_builder_synthetic_123456",
        );
        assert.equal(form.get("line_items[0][quantity]"), "1");
        assert.equal(form.get("client_reference_id"), user.id);
        assert.equal(form.get("customer"), "cus_synthetic_123456");
        assert.equal(form.get("mode"), "subscription");
        return responseJson({
          id: "cs_test_synthetic_123456",
          object: "checkout.session",
          livemode: false,
          mode: "subscription",
          customer: "cus_synthetic_123456",
          client_reference_id: user.id,
          status: "open",
          expires_at: nowSeconds + 3600,
          url: "https://checkout.stripe.com/c/pay/synthetic",
        });
      }
      throw new Error("unexpected synthetic request");
    },
  });
  const result = await payments.createCheckout(user.id, "builder");
  assert.equal(result.redirect, "https://checkout.stripe.com/c/pay/synthetic");
  assert.equal(result.state, "checkout-created-not-entitled");
  assert.equal(payments.entitlement(user.id)?.entitled, false);
  assert.equal(calls.length, 2);
  await assert.rejects(
    () => payments.createCheckout(user.id, "price_studio_synthetic_123456"),
    /Choose an available plan/,
  );
  assert.equal(calls.length, 2);
});

test("signed webhook grants exact-plan access once; bad signatures mutate nothing", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let retrievals = 0;
  let current = subscription({ uid: user.id });
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async (url, request) => {
      retrievals++;
      assert.equal(
        url,
        "https://api.stripe.com/v1/subscriptions/sub_synthetic_123456",
      );
      assert.equal(request.method, "GET");
      return responseJson(current);
    },
  });
  const body = Buffer.from(
    JSON.stringify(event("customer.subscription.updated", current)),
  );
  await assert.rejects(() => payments.webhook(body, "t=1,v1=00"), /signature/);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM billing_events").get().n,
    0,
  );
  const first = await payments.webhook(body, sign(body));
  assert.deepEqual(first, { received: true, duplicate: false, applied: true });
  const entitlement = payments.requireEntitlement(user.id);
  assert.equal(entitlement.tier, "builder");
  assert.equal(entitlement.monthlyAiBudgetMicroUsd, 20_000_000);
  const duplicate = await payments.webhook(body, sign(body));
  assert.deepEqual(duplicate, {
    received: true,
    duplicate: true,
    applied: true,
  });
  assert.equal(retrievals, 1);

  current = subscription({ uid: user.id, status: "canceled" });
  const canceledEvent = event("customer.subscription.updated", current, {
    id: "evt_synthetic_cancel_123456",
    created: nowSeconds + 2,
  });
  const canceledBody = Buffer.from(JSON.stringify(canceledEvent));
  await payments.webhook(canceledBody, sign(canceledBody));
  assert.equal(payments.entitlement(user.id).entitled, false);
  assert.throws(() => payments.requireEntitlement(user.id), /active paid plan/);
});

test("portal is bound to the mapped customer and accepts only the exact Stripe HTTPS host", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let result = {
    id: "bps_synthetic_123456",
    object: "billing_portal.session",
    livemode: false,
    customer: "cus_synthetic_123456",
    url: "https://billing.stripe.com/p/session/synthetic",
  };
  const payments = new Payments(store, {
    env: paymentEnv(),
    fetcher: async (url, request) => {
      assert.equal(url, "https://api.stripe.com/v1/billing_portal/sessions");
      const body = new URLSearchParams(request.body);
      assert.equal(body.get("customer"), "cus_synthetic_123456");
      assert.equal(
        body.get("return_url"),
        "https://whoayo.example/?billing=returned",
      );
      return responseJson(result);
    },
  });
  assert.equal((await payments.createPortal(user.id)).redirect, result.url);
  const valid = { ...result };
  for (const change of [
    { customer: "cus_other_synthetic" },
    { livemode: true },
    { url: "https://billing.stripe.com.example.invalid/session" },
    { url: "http://billing.stripe.com/session" },
    { url: "https://user@billing.stripe.com/session" },
    { url: "https://billing.stripe.com:444/session" },
  ]) {
    result = { ...valid, ...change };
    await assert.rejects(() => payments.createPortal(user.id), /invalid/);
  }
});

test("reopening an existing checkout reuses it and a matching subscription closes only that attempt", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let creates = 0;
  const session = {
    id: "cs_test_reused_123456",
    object: "checkout.session",
    livemode: false,
    mode: "subscription",
    customer: "cus_synthetic_123456",
    client_reference_id: user.id,
    status: "open",
    expires_at: nowSeconds + 3600,
    url: "https://checkout.stripe.com/c/pay/synthetic",
  };
  let current;
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async (url, request) => {
      if (url.endsWith("/checkout/sessions")) {
        creates++;
        return responseJson(session);
      }
      assert.equal(request.method, "GET");
      if (url.endsWith("/checkout/sessions/" + session.id))
        return responseJson(session);
      if (url.endsWith("/subscriptions/sub_synthetic_123456"))
        return responseJson(current);
      throw Error("Unexpected request");
    },
  });
  await payments.createCheckout(user.id, "builder");
  assert.equal(
    (await payments.createCheckout(user.id, "builder")).redirect,
    session.url,
  );
  assert.equal(creates, 1);
  current = subscription({ uid: user.id });
  current.metadata.whoayo_checkout_request_id = store.checkout(
    user.id,
  ).request_id;
  const raw = Buffer.from(
    JSON.stringify(event("customer.subscription.created", current)),
  );
  await payments.webhook(raw, sign(raw));
  assert.equal(store.checkout(user.id).status, "closed");
  await assert.rejects(
    () => payments.createCheckout(user.id, "builder"),
    /already has a subscription/,
  );
  assert.equal(creates, 1);
});

test("delayed events use current provider state and multiple active subscriptions deny access", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  const active = subscription({ uid: user.id });
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => responseJson(active),
  });
  const newer = event("customer.subscription.updated", active, {
    id: "evt_synthetic_newer_123456",
    created: nowSeconds + 4,
  });
  let body = Buffer.from(JSON.stringify(newer));
  await payments.webhook(body, sign(body));
  const deleted = subscription({ uid: user.id, status: "canceled" });
  const stale = event("customer.subscription.deleted", deleted, {
    id: "evt_synthetic_stale_123456",
    created: nowSeconds + 1,
  });
  body = Buffer.from(JSON.stringify(stale));
  assert.deepEqual(await payments.webhook(body, sign(body)), {
    received: true,
    duplicate: false,
    applied: true,
  });
  assert.equal(payments.entitlement(user.id).entitled, true);

  const unknown = subscription({
    uid: user.id,
    id: "sub_unknown_123456",
    price: "price_unknown_synthetic_123456",
  });
  const unknownPayments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => responseJson(unknown),
  });
  const unknownEvent = event("customer.subscription.updated", unknown, {
    id: "evt_synthetic_unknown_123456",
    created: nowSeconds + 5,
  });
  body = Buffer.from(JSON.stringify(unknownEvent));
  await unknownPayments.webhook(body, sign(body));
  assert.equal(unknownPayments.entitlement(user.id).entitled, false);
  assert.equal(unknownPayments.entitlement(user.id).conflict, true);
});

test("mismatched immutable account reference is rejected before event storage", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store, "owner");
  const other = managed(store, "other");
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  const wrong = subscription({ uid: other.id });
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => responseJson(wrong),
  });
  const body = Buffer.from(
    JSON.stringify(event("customer.subscription.updated", wrong)),
  );
  await assert.rejects(
    () => payments.webhook(body, sign(body)),
    /does not match/,
  );
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM billing_events").get().n,
    0,
  );
});

test("managed hosted AI is denied before spend reservation or provider access without entitlement", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  const project = store.create(user.id, { title: "Synthetic paid gate" });
  let providerCalls = 0;
  const prices = JSON.stringify({
    version: "synthetic",
    providers: {
      openai: {
        "fixture-model": {
          inputUsdPerMillion: "1.00",
          outputUsdPerMillion: "1.00",
        },
      },
    },
  });
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => {
      throw new Error("unexpected payment request");
    },
  });
  const gateway = new Gateway(store, {
    payments,
    env: {
      ORIGIN_IDENTITY_MODE: "cognito",
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_OPENAI_KEY: "synthetic-not-a-key",
      ORIGIN_OPENAI_MODEL: "fixture-model",
      ORIGIN_SPEND_GUARD: "1",
      ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD: "1.00",
      ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD: "10.00",
      ORIGIN_MODEL_PRICES_JSON: prices,
    },
    fetcher: async () => {
      providerCalls++;
      return responseJson({});
    },
  });
  assert.throws(
    () =>
      gateway.prepare(user.id, project.id, {
        revision: project.revision,
        provider: "openai",
      }),
    /active paid plan/,
  );
  assert.equal(providerCalls, 0);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM spend_reservations").get().n,
    0,
  );
});

test("changed bytes, old/future signatures, wrong mode/version and connected-account events are rejected", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  let calls = 0;
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => {
      calls++;
      throw new Error("unexpected provider request");
    },
  });
  const original = Buffer.from(JSON.stringify(event("unsupported.event", {})));
  for (const [body, signature] of [
    [Buffer.concat([original, Buffer.from(" ")]), sign(original)],
    [original, sign(original, nowSeconds - 301)],
    [original, sign(original, nowSeconds + 301)],
    [original, `t=${nowSeconds},t=${nowSeconds},v1=${"0".repeat(64)}`],
  ])
    await assert.rejects(() => payments.webhook(body, signature), /signature/);
  for (const override of [
    { livemode: true },
    { livemode: undefined },
    { api_version: "different" },
    { account: "acct_other_synthetic" },
    { object: "subscription" },
  ]) {
    const body = Buffer.from(
      JSON.stringify({ ...event("unsupported.event", {}), ...override }),
    );
    await assert.rejects(
      () => payments.webhook(body, sign(body)),
      /Invalid payment webhook event/,
    );
  }
  assert.equal(calls, 0);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM billing_events").get().n,
    0,
  );
});

test("an ambiguous checkout is durable across adapters and cannot create a second session", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let calls = 0;
  const options = {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => {
      calls++;
      throw new DOMException("Synthetic timeout", "TimeoutError");
    },
  };
  await assert.rejects(() =>
    new Payments(store, options).createCheckout(user.id, "builder"),
  );
  assert.equal(store.checkout(user.id).status, "outcome-unknown");
  await assert.rejects(
    () => new Payments(store, options).createCheckout(user.id, "builder"),
    /checkout is already pending/,
  );
  assert.equal(calls, 1);
});

test("billing updates recheck access at send and enforce the exact tier allowance", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let current = subscription({ uid: user.id });
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => responseJson(current),
  });
  let seq = 0;
  const update = async (type = "customer.subscription.updated") => {
    const body = Buffer.from(
      JSON.stringify(
        event(type, current, { id: `evt_change_${++seq}_123456` }),
      ),
    );
    return payments.webhook(body, sign(body));
  };
  await update();
  let calls = 0;
  const gateway = new ProviderTestGateway(store, {
    payments,
    env: {
      ORIGIN_IDENTITY_MODE: "cognito",
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_OPENAI_KEY: "synthetic-not-a-key",
      ORIGIN_OPENAI_MODEL: "fixture-model",
      ORIGIN_SPEND_GUARD: "1",
      ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD: "0.01",
      ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD: "100.00",
      ORIGIN_MODEL_PRICES_JSON: JSON.stringify({
        version: "synthetic",
        providers: {
          openai: {
            "fixture-model": {
              inputUsdPerMillion: "1.00",
              outputUsdPerMillion: "10.00",
            },
          },
        },
      }),
    },
    fetcher: async () => {
      calls++;
      return responseJson({
        model: "fixture-model",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Synthetic paid answer" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      });
    },
  });
  let project = store.create(user.id, {
    title: "Synthetic subscription journey",
  });
  const prepare = () =>
    gateway.prepare(user.id, project.id, {
      revision: project.revision,
      provider: "openai",
      model: "fixture-model",
      threadId: project.threads[0].id,
      content: "Synthetic request",
      mode: "build",
      artifactIds: [],
      includeHistory: false,
    });
  const approve = (p) => ({
    revision: p.project.revision,
    approvalToken: p.preview.approvalToken,
    digest: p.preview.digest,
    approved: true,
  });
  let prepared = prepare();
  project = await gateway.send(user.id, project.id, approve(prepared));
  assert.equal(calls, 1); // reservation exceeded the default $0.01 but fit the $20 plan
  assert.equal(project.disclosures.at(-1).status, "completed");
  prepared = prepare();
  current.status = "past_due";
  await update(); // same second, a different event ID: no lexical ordering assumption
  await assert.rejects(
    () => gateway.send(user.id, project.id, approve(prepared)),
    /active paid plan/,
  );
  assert.equal(calls, 1);
  assert.equal(store.usage(user.id), 1);
  assert.equal(
    store.db.prepare("SELECT COUNT(*) AS n FROM spend_reservations").get().n,
    1,
  );
  current.status = "active";
  current.items.data[0].price.id = "price_unreviewed_123456";
  await update();
  assert.equal(payments.entitlement(user.id).entitled, false);
  assert.equal(payments.entitlement(user.id).status, "unknown-price");
  const local = await store.register({
    username: "local-fixture",
    name: "Local",
    password: "Synthetic password 42!",
  });
  assert.throws(() => payments.requireEntitlement(local.id), /managed account/);
});

test("concurrent webhook refreshes cannot apply stale network responses", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  let release;
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: () =>
      new Promise((resolve) => {
        release = () => resolve(responseJson(subscription({ uid: user.id })));
      }),
  });
  const body = Buffer.from(
    JSON.stringify(
      event("customer.subscription.updated", subscription({ uid: user.id })),
    ),
  );
  const first = payments.webhook(body, sign(body));
  await assert.rejects(() => payments.webhook(body, sign(body)), {
    status: 503,
  });
  release();
  await first;
  assert.equal((await payments.webhook(body, sign(body))).duplicate, true);
});

test("HTTP webhook accepts signed raw bytes without a session and checkout requires session plus CSRF", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  const user = managed(store);
  store.linkBillingCustomer(user.id, "cus_synthetic_123456", "test");
  const payments = new Payments(store, {
    env: paymentEnv(),
    now: () => now,
    fetcher: async () => responseJson(subscription({ uid: user.id })),
  });
  const server = createServer({
    store,
    gateway: new Gateway(store, { env: {}, payments }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = Buffer.from(
    JSON.stringify(
      event("customer.subscription.updated", subscription({ uid: user.id })),
      null,
      2,
    ),
  );
  const webhook = await fetch(`${base}/api/payments/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Stripe-Signature": sign(raw),
    },
    body: raw,
  });
  assert.equal(webhook.status, 200);
  assert.equal((await webhook.json()).applied, true);
  const options = {
    method: "POST",
    headers: { Origin: base, "Content-Type": "application/json" },
    body: JSON.stringify({ tier: "builder" }),
  };
  assert.equal(
    (await fetch(`${base}/api/payments/checkout`, options)).status,
    401,
  );
  const session = store.session(user.id);
  options.headers.Cookie = `origin_session=${session.raw}`;
  assert.equal(
    (await fetch(`${base}/api/payments/checkout`, options)).status,
    403,
  );
  const status = await fetch(`${base}/api/payments`, {
    headers: { Cookie: options.headers.Cookie },
  }).then((r) => r.json());
  assert.equal(status.account.entitled, true);
  for (const secret of [
    "price_builder",
    "cus_synthetic",
    "sk_test",
    "whsec_",
    "sub_synthetic",
  ])
    assert.ok(!JSON.stringify(status).includes(secret));
});
