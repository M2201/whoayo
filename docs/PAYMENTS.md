# Payments And Entitlements

Status: **implemented for isolated Stripe test mode; live mode is rejected**. The adapter, HTTP routes, account billing view, persistent event ledger and AI entitlement enforcement have synthetic tests. No real Stripe account, price, webhook or tax setting was created. Remaining live acceptance is listed below.

## Implemented configuration and routes

`ORIGIN_PAYMENTS_MODE=off` is the default. `stripe-test` requires an exact HTTPS `ORIGIN_PUBLIC_ORIGIN`, server-only `ORIGIN_STRIPE_SECRET_KEY` and `ORIGIN_STRIPE_WEBHOOK_SECRET`, a pinned `ORIGIN_STRIPE_API_VERSION`, and `ORIGIN_STRIPE_PRICE_MAP_JSON`. The test secret must use the `sk_test_` prefix. Live credentials and `stripe-live` are rejected. The API-version string must match the configured snapshot webhook endpoint; a syntactically valid version is not evidence of provider acceptance.

The price map contains a reviewed `version` and `tiers`, each with one exact `priceId` and `monthlyAiBudgetUsd`. The budget is an internal provider-cost ceiling per UTC calendar month, not a refundable credit balance or a customer invoice. Set `ORIGIN_REQUIRE_PAID_ENTITLEMENT=1` with the spend guard before managed external AI. Local development with both billing flags off keeps its existing behavior.

- `GET /api/payments`: account-scoped status and tier names; no customer/subscription IDs or secrets.
- `POST /api/payments/checkout`: managed session, same-origin and CSRF required; accepts only a tier name. A durable attempt precedes outbound requests. Reopening an open session reuses its current provider URL. An ambiguous outcome blocks another checkout pending reconciliation.
- `POST /api/payments/portal`: same protections; the server chooses the mapped customer and fixed return URL.
- `POST /api/payments/webhook`: no session or CSRF required; raw body capped at 256 KiB, HMAC verified before JSON parsing with a five-minute signature tolerance. Wrong mode/version and connected-account events are rejected. No raw billing payload is retained.

Subscription create/update/delete, Checkout completion, `invoice.paid`, payment success and payment failure events retrieve the **current** subscription from Stripe. Only a matching immutable account/customer, reviewed price, single quantity-one item, active/trialing state and unexpired period can grant test access. Event IDs deduplicate atomically with state updates. Same-second IDs are not assumed to be chronological. One reconciliation runs at a time; overlap returns 503 for provider redelivery. This adapter supports a single application process, not a distributed worker fleet. Unsupported events receive a recorded, unapplied receipt.

Known multiple active subscriptions, unknown prices, expired periods and catalog mismatch deny model access. Prepare and send both check entitlement; a changed plan or allowance requires a new disclosure review. Local accounts cannot bypass a hosted payment requirement. Inactive billing never removes saved projects or export access.

Billing customer IDs, subscription metadata, checkout attempts and keyed event hashes are operational SQLite metadata, not encrypted project content. Whole recovery archives encrypt them. Restore retains those records but invalidates their access authority until a fresh provider reconciliation. A duplicate event already recorded in an old archive is insufficient; operator reconciliation or a new valid event is required. Evidence history is unaffected.

## Recommended first integration

Use Stripe-hosted Checkout for subscription purchase and Stripe's customer portal for payment-method, invoice and cancellation self-service. Keep all secret API calls server-side. The application accepts only server-configured price IDs; the browser never supplies an amount, allowance or entitlement.

The managed-product plans remain proposals in `COMMERCIAL-PLAN.md`. Do not create live Price objects until the owner approves customer-facing prices, currency, interval, included usage, refunds, cancellations, trials, taxes and legal terms.

## Data model and remaining scope

Maintain billing state outside encrypted project content:

- one Stripe customer mapped to the immutable managed WHOAYO account/organization ID;
- one active subscription policy per billable organization;
- exact price ID, internal tier version and currency;
- subscription status, current period, cancellation state and last authoritative event;
- a persistent webhook receipt/deduplication table keyed by Stripe event ID;
- entitlement version and effective/expiry timestamps;
- provider-spend allowance distinct from billed revenue and Stripe credit concepts.

Do not link accounts by email alone. Do not store card details. Do not put private ideas, prompts or evidence identifiers in Stripe metadata.

## State changes

1. An authenticated, verified user requests Checkout for one allowlisted tier.
2. The server creates or retrieves the mapped Customer and creates a subscription Checkout Session with an internal account reference.
3. A success redirect displays “processing” until a signed webhook updates local state; the redirect is not payment proof.
4. The webhook endpoint verifies raw bytes, bounds request size/time, rejects a mismatched API version, retrieves current provider state and commits the event ID and state together.
5. Duplicate delivery returns success without repeating side effects. Out-of-order delivery is reconciled by retrieving the current Stripe subscription server-side.
6. Entitlement is granted only for explicitly approved paid/trial states. `past_due`, `unpaid`, `paused`, `incomplete`, cancellation and refund behavior must match the published policy.
7. Subscription tier selects an internal monetary allowance; every model request still passes the provider-spend reservation guard.

## Remaining before live billing

Run an actual Stripe test-account journey with the pinned API version. Add policy-backed refund, credit-note, dispute and fraud handling; tax configuration; durable out-of-band reconciliation and alerts; customer-facing cancellation/trial/upgrade terms; and support tooling for unknown checkout outcomes. Test complete Checkout, portal cancellation, renewal, failed payment, refund, out-of-order delivery, webhook outage and restore reconciliation against Stripe. The current adapter does not provide these live acceptance results. A source flag cannot activate live billing.

Use Stripe test mode and synthetic accounts first. Live mode requires separate keys/endpoints, a small authorized transaction/refund test, readback from the Dashboard and accounting reconciliation.

## Tax and legal gates

Payment collection does not determine where registration, collection or filing is required. The owner and qualified tax/legal advisors must establish the merchant identity, nexus/tax treatment, invoice requirements, privacy notice, terms, cancellation/refund policy and dispute process. Automatic tax must be configured deliberately; a zero tax result is not proof that no obligation exists.

## Operational controls

- Alert on webhook backlog, verification failures, unknown prices and entitlement/payment disagreement.
- Reconcile Stripe balance transactions, fees, refunds, disputes and taxes to accounting monthly.
- Never reactivate model access only because a customer returns from Checkout.
- Keep a support path for billing correction without editing evidence history.
- Pause checkout if entitlement processing is unhealthy.

Official references checked October 14, 2026:

- [Stripe Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe webhook handling](https://docs.stripe.com/webhooks)
- [Stripe subscription API](https://docs.stripe.com/api/subscriptions)
- [Stripe Tax](https://docs.stripe.com/tax)
- [Stripe pricing](https://stripe.com/pricing)
