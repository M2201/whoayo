import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { billingInternals } from "./billing.mjs";
import { ensure, InputError } from "./store.mjs";

const STRIPE_API = "https://api.stripe.com/v1";
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const USER_ID = /^[a-f0-9-]{36}$/;
const ENTITLED = new Set(["active", "trialing"]);
const SUBSCRIPTION_EVENTS = new Set([
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.paid",
  "invoice.payment_failed",
  "checkout.session.completed",
]);

function exactKeys(value, allowed) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => allowed.includes(key))
  );
}

function parseCatalog(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid payment tier catalog JSON.");
  }
  ensure(
    exactKeys(value, ["version", "tiers"]) &&
      IDENTIFIER.test(value.version || "") &&
      value.tiers &&
      typeof value.tiers === "object" &&
      !Array.isArray(value.tiers),
    "Invalid payment tier catalog.",
  );
  const tiers = new Map();
  const prices = new Map();
  const entries = Object.entries(value.tiers);
  ensure(
    entries.length > 0 && entries.length <= 12,
    "Invalid payment tier catalog.",
  );
  for (const [tier, config] of entries) {
    ensure(
      IDENTIFIER.test(tier) &&
        exactKeys(config, ["priceId", "monthlyAiBudgetUsd"]) &&
        /^price_[A-Za-z0-9_]{6,200}$/.test(config.priceId || "") &&
        !prices.has(config.priceId),
      "Invalid payment tier catalog.",
    );
    const monthlyAiBudgetMicroUsd = billingInternals.decimalToMicroUsd(
      config.monthlyAiBudgetUsd,
      "tier monthly AI budget",
    );
    const normalized = {
      tier,
      priceId: config.priceId,
      monthlyAiBudgetMicroUsd,
    };
    tiers.set(tier, normalized);
    prices.set(config.priceId, normalized);
  }
  return { version: value.version, tiers, prices };
}

function formBody(entries) {
  const body = new URLSearchParams();
  for (const [key, value] of entries)
    if (value !== undefined && value !== null) body.set(key, String(value));
  return body.toString();
}

async function boundedJson(response) {
  const reader = response.body?.getReader();
  ensure(reader, "Payment provider returned an empty response.", 502);
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 256 * 1024) {
      await reader.cancel();
      throw new InputError("Payment provider response was too large.", 502);
    }
    chunks.push(Buffer.from(value));
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Payment provider returned an invalid response.", 502);
  }
  ensure(
    data && typeof data === "object" && !Array.isArray(data),
    "Payment provider returned an invalid response.",
    502,
  );
  return data;
}

function safeRedirect(value, host) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new InputError("Payment provider returned an invalid redirect.", 502);
  }
  ensure(
    url.protocol === "https:" &&
      url.host === host &&
      !url.username &&
      !url.password,
    "Payment provider returned an invalid redirect.",
    502,
  );
  return url.href;
}

function invoiceSubscription(object) {
  const value =
    object?.subscription || object?.parent?.subscription_details?.subscription;
  return typeof value === "string" ? value : value?.id;
}

function eventSignature(raw, header, secret, nowSeconds) {
  ensure(
    Buffer.isBuffer(raw) && raw.length > 0 && raw.length <= 256 * 1024,
    "Invalid payment webhook body.",
    400,
  );
  ensure(
    typeof header === "string" && header.length <= 2048,
    "Invalid payment webhook signature.",
    400,
  );
  const values = header.split(",").reduce(
    (result, part) => {
      const index = part.indexOf("=");
      if (index > 0) {
        const key = part.slice(0, index).trim();
        const value = part.slice(index + 1).trim();
        if (key === "t") result.timestamps.push(value);
        if (key === "v1") result.signatures.push(value);
      }
      return result;
    },
    { timestamps: [], signatures: [] },
  );
  ensure(
    values.timestamps.length === 1 &&
      /^\d{10,12}$/.test(values.timestamps[0]) &&
      values.signatures.length > 0 &&
      values.signatures.length <= 8,
    "Invalid payment webhook signature.",
    400,
  );
  const timestamp = Number(values.timestamps[0]);
  ensure(
    Number.isSafeInteger(timestamp) && Math.abs(nowSeconds - timestamp) <= 300,
    "Payment webhook signature expired.",
    400,
  );
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest();
  const valid = values.signatures.some((candidate) => {
    if (!/^[a-f0-9]{64}$/.test(candidate)) return false;
    const bytes = Buffer.from(candidate, "hex");
    return bytes.length === expected.length && timingSafeEqual(bytes, expected);
  });
  ensure(valid, "Invalid payment webhook signature.", 400);
  return timestamp;
}

export class Payments {
  constructor(
    store,
    {
      env = process.env,
      fetcher = fetch,
      timeoutMs = 10000,
      now = () => Date.now(),
    } = {},
  ) {
    this.store = store;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.now = now;
    this.mode = env.ORIGIN_PAYMENTS_MODE || "off";
    ensure(
      ["off", "stripe-test"].includes(this.mode),
      "Only off or stripe-test is supported. Live billing acceptance is incomplete.",
    );
    this.enabled = this.mode !== "off";
    this.required = env.ORIGIN_REQUIRE_PAID_ENTITLEMENT === "1";
    if (!this.enabled) {
      ensure(!this.required, "Paid entitlement enforcement requires payments.");
      this.catalogVersion = null;
      this.tiers = new Map();
      this.prices = new Map();
      return;
    }
    ensure(store, "Payment storage is required.");
    this.live = false;
    this.webhookBusy = false;
    this.secretKey = env.ORIGIN_STRIPE_SECRET_KEY || "";
    this.webhookSecret = env.ORIGIN_STRIPE_WEBHOOK_SECRET || "";
    this.apiVersion = env.ORIGIN_STRIPE_API_VERSION || "";
    ensure(
      new RegExp(
        `^sk_${this.live ? "live" : "test"}_[A-Za-z0-9_]{8,200}$`,
      ).test(this.secretKey) &&
        /^whsec_[A-Za-z0-9_]{8,200}$/.test(this.webhookSecret),
      "Payment credentials do not match the selected mode.",
    );
    ensure(
      /^\d{4}-\d{2}-\d{2}\.[a-z][a-z0-9_]{1,31}$/.test(this.apiVersion),
      "Pin a valid Stripe API version.",
    );
    this.publicOrigin = env.ORIGIN_PUBLIC_ORIGIN || "";
    let origin;
    try {
      origin = new URL(this.publicOrigin);
    } catch {
      throw new Error("Payments require an exact public HTTPS origin.");
    }
    ensure(
      origin.protocol === "https:" &&
        origin.origin === this.publicOrigin &&
        !origin.username &&
        !origin.password &&
        origin.pathname === "/" &&
        !origin.search &&
        !origin.hash,
      "Payments require an exact public HTTPS origin.",
    );
    const catalog = parseCatalog(env.ORIGIN_STRIPE_PRICE_MAP_JSON || "");
    this.catalogVersion = catalog.version;
    this.tiers = catalog.tiers;
    this.prices = catalog.prices;
  }

  catalog() {
    return {
      enabled: this.enabled,
      requiredForHostedAi: this.required,
      mode: this.enabled ? (this.live ? "live" : "test") : "off",
      version: this.catalogVersion,
      tiers: [...this.tiers.keys()],
    };
  }

  entitlement(uid) {
    if (!uid || !this.enabled) return null;
    const customer = this.store.billingCustomer(uid);
    if (customer && customer.mode !== (this.live ? "live" : "test"))
      return { entitled: false, status: "mode-mismatch" };
    const record = this.store.billingEntitlement(uid);
    if (!record || !record.entitled) return record;
    const tier = this.tiers.get(record.tier);
    if (!tier || tier.priceId !== record.priceId)
      return { ...record, entitled: false, status: "catalog-mismatch" };
    return {
      ...record,
      catalogVersion: this.catalogVersion,
      monthlyAiBudgetMicroUsd: tier.monthlyAiBudgetMicroUsd,
    };
  }

  publicStatus(uid) {
    const record = uid ? this.entitlement(uid) : null;
    return {
      ...this.catalog(),
      account: record
        ? {
            entitled: Boolean(record.entitled),
            tier: record.tier || null,
            status: record.status,
            currentPeriodEnd: record.currentPeriodEnd || null,
            cancelAtPeriodEnd: Boolean(record.cancelAtPeriodEnd),
            conflict: Boolean(record.conflict),
            customerPortalAvailable: Boolean(record.customerId),
          }
        : null,
    };
  }

  requireEntitlement(uid) {
    if (!this.required) return null;
    ensure(
      this.store.user(uid).authentication === "managed",
      "Hosted model access requires a managed account.",
      403,
    );
    const entitlement = this.entitlement(uid);
    ensure(
      entitlement?.entitled,
      entitlement?.conflict
        ? "Billing needs support review before model access can continue."
        : "An active paid plan is required for hosted model access.",
      402,
    );
    return entitlement;
  }

  async api(path, entries = null, { method = "POST", idempotencyKey } = {}) {
    ensure(
      this.enabled && /^\/[A-Za-z0-9_\-/]+$/.test(path),
      "Invalid payment provider request.",
    );
    const response = await this.fetcher(`${STRIPE_API}${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(this.timeoutMs),
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Stripe-Version": this.apiVersion,
        ...(entries
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      ...(entries ? { body: formBody(entries) } : {}),
    });
    const data = await boundedJson(response);
    ensure(
      response.ok,
      response.status === 429
        ? "Payment service is busy. Wait and try again."
        : "Payment service could not complete the request.",
      502,
    );
    return data;
  }

  async customer(uid) {
    const existing = this.store.billingCustomer(uid);
    if (existing) {
      ensure(
        existing.mode === (this.live ? "live" : "test"),
        "Billing account mode does not match this server.",
        409,
      );
      return existing.customerId;
    }
    const data = await this.api(
      "/customers",
      [
        ["metadata[whoayo_user_id]", uid],
        ["metadata[whoayo_catalog]", this.catalogVersion],
      ],
      { idempotencyKey: `whoayo-customer-${uid}` },
    );
    ensure(
      data.object === "customer" &&
        /^cus_[A-Za-z0-9_]{6,200}$/.test(data.id || "") &&
        data.livemode === this.live,
      "Payment provider returned an invalid customer.",
      502,
    );
    this.store.linkBillingCustomer(uid, data.id, this.live ? "live" : "test");
    return data.id;
  }

  async createCheckout(uid, tierName, authorize = () => {}) {
    ensure(this.enabled, "Payments are not enabled.", 404);
    ensure(
      this.store.user(uid).authentication === "managed",
      "Hosted billing requires a managed account.",
      403,
    );
    const tier = this.tiers.get(tierName);
    ensure(tier, "Choose an available plan.");
    authorize();
    ensure(
      !this.store.billingHasOpenSubscription(uid),
      "This account already has a subscription. Use the billing portal.",
      409,
    );
    const prior = this.store.checkout(uid);
    if (prior?.session_id && prior.status === "open") {
      ensure(
        prior.tier === tierName,
        "Finish or expire the existing checkout before choosing another plan.",
        409,
      );
      const session = await this.api(
        `/checkout/sessions/${prior.session_id}`,
        null,
        { method: "GET" },
      );
      ensure(
        session.id === prior.session_id &&
          session.object === "checkout.session" &&
          session.mode === "subscription" &&
          session.livemode === this.live &&
          session.customer === this.store.billingCustomer(uid)?.customerId &&
          session.client_reference_id === uid,
        "Checkout response does not match this account.",
        502,
      );
      authorize();
      if (session.status === "open")
        return {
          redirect: safeRedirect(session.url, "checkout.stripe.com"),
          state: "checkout-created-not-entitled",
        };
      ensure(
        session.status === "expired",
        "Checkout is processing. Wait for billing confirmation.",
        409,
      );
      this.store.db
        .prepare(
          "UPDATE billing_checkouts SET status='closed' WHERE user_id=? AND request_id=?",
        )
        .run(uid, prior.request_id);
    }
    const requestId = randomUUID();
    // Durable before either outbound request. An ambiguous outcome requires
    // reconciliation; refreshing or double-clicking cannot create another session.
    this.store.beginCheckout(uid, requestId, tier.tier);
    try {
      const customer = await this.customer(uid);
      authorize();
      ensure(
        !this.store.billingHasOpenSubscription(uid),
        "A subscription appeared during checkout. Use the billing portal.",
        409,
      );
      const data = await this.api(
        "/checkout/sessions",
        [
          ["mode", "subscription"],
          ["customer", customer],
          ["client_reference_id", uid],
          ["line_items[0][price]", tier.priceId],
          ["line_items[0][quantity]", "1"],
          ["payment_method_collection", "always"],
          ["success_url", `${this.publicOrigin}/?billing=processing`],
          ["cancel_url", `${this.publicOrigin}/?billing=cancelled`],
          ["metadata[whoayo_user_id]", uid],
          ["metadata[whoayo_tier]", tier.tier],
          ["metadata[whoayo_request_id]", requestId],
          ["subscription_data[metadata][whoayo_user_id]", uid],
          ["subscription_data[metadata][whoayo_catalog]", this.catalogVersion],
          [
            "subscription_data[metadata][whoayo_checkout_request_id]",
            requestId,
          ],
        ],
        { idempotencyKey: `whoayo-checkout-${requestId}` },
      );
      ensure(
        data.object === "checkout.session" &&
          /^cs_(?:test|live)_[A-Za-z0-9_]{6,200}$/.test(data.id || "") &&
          data.livemode === this.live &&
          data.mode === "subscription" &&
          data.customer === customer &&
          data.client_reference_id === uid &&
          data.status === "open" &&
          Number.isSafeInteger(data.expires_at) &&
          data.expires_at > this.now() / 1000,
        "Payment provider returned an invalid Checkout session.",
        502,
      );
      const redirect = safeRedirect(data.url, "checkout.stripe.com");
      this.store.completeCheckout(uid, requestId, data.id, data.expires_at);
      authorize();
      return {
        redirect,
        state: "checkout-created-not-entitled",
      };
    } catch (error) {
      this.store.markCheckoutUnknown(uid, requestId);
      throw error;
    }
  }

  async createPortal(uid) {
    ensure(this.enabled, "Payments are not enabled.", 404);
    ensure(
      this.store.user(uid).authentication === "managed",
      "Hosted billing requires a managed account.",
      403,
    );
    const customer = this.store.billingCustomer(uid);
    ensure(customer, "No billing account exists yet.", 409);
    ensure(
      customer.mode === (this.live ? "live" : "test"),
      "Billing account mode does not match this server.",
      409,
    );
    const data = await this.api("/billing_portal/sessions", [
      ["customer", customer.customerId],
      ["return_url", `${this.publicOrigin}/?billing=returned`],
    ]);
    ensure(
      data.object === "billing_portal.session" &&
        /^bps_[A-Za-z0-9_]{6,200}$/.test(data.id || "") &&
        data.livemode === this.live &&
        data.customer === customer.customerId,
      "Payment provider returned an invalid portal session.",
      502,
    );
    return { redirect: safeRedirect(data.url, "billing.stripe.com") };
  }

  parseSubscription(object, event) {
    ensure(
      object?.object === "subscription" &&
        object.livemode === this.live &&
        /^sub_[A-Za-z0-9_]{6,200}$/.test(object.id || "") &&
        /^cus_[A-Za-z0-9_]{6,200}$/.test(object.customer || ""),
      "Invalid subscription event.",
      400,
    );
    const uid = object.metadata?.whoayo_user_id;
    ensure(
      USER_ID.test(uid || ""),
      "Subscription account reference is missing.",
      400,
    );
    const mapped = this.store.billingUserForCustomer(object.customer);
    ensure(
      mapped === uid,
      "Subscription account reference does not match.",
      409,
    );
    ensure(
      this.store.billingCustomer(uid)?.mode === (this.live ? "live" : "test"),
      "Subscription mode does not match.",
      409,
    );
    const items = object.items?.data;
    ensure(
      Array.isArray(items) &&
        items.length === 1 &&
        items[0]?.quantity === 1 &&
        object.items.has_more !== true,
      "Subscription must contain exactly one plan item.",
      409,
    );
    const priceId = items[0]?.price?.id;
    ensure(
      /^price_[A-Za-z0-9_]{6,200}$/.test(priceId || ""),
      "Subscription price is invalid.",
      409,
    );
    const tier = this.prices.get(priceId)?.tier || null;
    const status = String(object.status || "unknown");
    const currentPeriodEnd =
      object.current_period_end || items[0]?.current_period_end || null;
    ensure(
      currentPeriodEnd === null ||
        (Number.isSafeInteger(currentPeriodEnd) && currentPeriodEnd > 0),
      "Subscription period is invalid.",
      409,
    );
    return {
      subscriptionId: object.id,
      uid,
      customerId: object.customer,
      priceId,
      tier,
      status,
      entitled: Boolean(tier) && ENTITLED.has(status),
      currentPeriodEnd,
      cancelAtPeriodEnd: object.cancel_at_period_end === true,
      eventCreated: event.created,
      eventId: event.id,
      checkoutRequestId: USER_ID.test(
        object.metadata?.whoayo_checkout_request_id || "",
      )
        ? object.metadata.whoayo_checkout_request_id
        : null,
    };
  }

  async retrieveSubscription(id) {
    ensure(
      /^sub_[A-Za-z0-9_]{6,200}$/.test(id || ""),
      "Invalid subscription event.",
      400,
    );
    const subscription = await this.api(`/subscriptions/${id}`, null, {
      method: "GET",
    });
    ensure(
      subscription.id === id,
      "Subscription response does not match.",
      502,
    );
    return subscription;
  }

  async webhook(raw, signature) {
    ensure(this.enabled, "Payments are not enabled.", 404);
    eventSignature(
      raw,
      signature,
      this.webhookSecret,
      Math.floor(this.now() / 1000),
    );
    let event;
    try {
      event = JSON.parse(raw.toString("utf8"));
    } catch {
      throw new InputError("Invalid payment webhook JSON.", 400);
    }
    ensure(
      event &&
        event.object === "event" &&
        !event.account &&
        !event.context &&
        typeof event === "object" &&
        /^evt_[A-Za-z0-9_]{6,200}$/.test(event.id || "") &&
        typeof event.type === "string" &&
        event.type.length <= 120 &&
        Number.isSafeInteger(event.created) &&
        event.created > 0 &&
        event.livemode === this.live &&
        event.api_version === this.apiVersion &&
        event.data?.object,
      "Invalid payment webhook event.",
      400,
    );
    const existing = this.store.billingEvent(event.id);
    if (existing)
      return {
        received: true,
        duplicate: true,
        applied: Boolean(existing.applied),
      };
    // This release is a single-process SQLite service. Reject overlapping
    // refreshes so an older network response cannot overwrite a newer one.
    ensure(
      !this.webhookBusy,
      "Billing reconciliation is busy. Retry delivery.",
      503,
    );
    this.webhookBusy = true;
    try {
      let subscription = null;
      if (SUBSCRIPTION_EVENTS.has(event.type)) {
        const object = event.data.object;
        let subscriptionId;
        if (event.type.startsWith("customer.subscription.")) {
          subscriptionId = object.id;
          subscription = await this.retrieveSubscription(subscriptionId);
        } else if (event.type.startsWith("invoice.")) {
          subscriptionId = invoiceSubscription(object);
          ensure(
            subscriptionId,
            "Invoice subscription reference is missing.",
            400,
          );
          subscription = await this.retrieveSubscription(subscriptionId);
        } else if (event.type === "checkout.session.completed") {
          ensure(
            object.object === "checkout.session" &&
              object.mode === "subscription" &&
              USER_ID.test(object.client_reference_id || "") &&
              object.metadata?.whoayo_user_id === object.client_reference_id &&
              this.store.billingUserForCustomer(object.customer) ===
                object.client_reference_id,
            "Checkout account reference does not match.",
            409,
          );
          subscriptionId =
            typeof object.subscription === "string"
              ? object.subscription
              : object.subscription?.id;
          ensure(
            subscriptionId,
            "Checkout subscription reference is missing.",
            400,
          );
          subscription = await this.retrieveSubscription(subscriptionId);
        }
      }
      const state = subscription
        ? this.parseSubscription(subscription, event)
        : null;
      return this.store.applyBillingEvent(
        {
          id: event.id,
          created: event.created,
          type: event.type,
          dataHash: createHmac("sha256", this.webhookSecret)
            .update(raw)
            .digest("hex"),
        },
        state,
      );
    } finally {
      this.webhookBusy = false;
    }
  }
}

export const paymentInternals = Object.freeze({
  eventSignature,
  formBody,
  invoiceSubscription,
  parseCatalog,
});
