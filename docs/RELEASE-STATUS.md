# Local Evaluation Release 0.1.0

## Read-only Render preparation — October 15, 2026

A separate public-preview entry and server are prepared for the first hosting
acceptance stage. They do not load the private app, accept accounts or uploads,
make provider requests, or enable payments. Only the reviewed public presentation
and a content-free health response are served. A synthetic SQLite probe tests
the dedicated persistent disk; it is not a customer vault or backup.

Local verification: **183 tests passed**, both builds passed, **129 reviewed
source files / zero scan findings**, business/release checks passed. Desktop and
390-pixel browser checks found no horizontal overflow, forms or console errors.
The synthetic probe retained its identity and incremented its boot count across
a local restart. Live Render deployment, HTTPS and persistent-disk acceptance
must be checked separately. See [Render pilot](RENDER-PILOT.md).

The existing loopback app and private evidence are unchanged. Customer access,
identity/recovery, independent backups, KMS and real billing acceptance remain
closed gates. This checkpoint is not a customer-launch claim.

## Public Source Release — October 14, 2026 local / October 15 UTC

WHOAYO is a local evaluation foundation. Public source is published at
[M2201/whoayo](https://github.com/M2201/whoayo) under AGPL-3.0-only, with issues-only contributions
initially. This does not activate a hosted service, paid plan or live payment.

The public commit history starts from this reviewed source snapshot. Earlier
private development history and operational recovery notes remain preserved
locally and are not imported into the public repository. Original private ideas,
timestamp receipts, vaults, keys and provider settings are unchanged by release
preparation. Historical implementation logs are not a runtime-health claim.

### Implemented

- Idea-first projects, exact attribution, encrypted snapshots, append-only
  evidence, account-scoped exports and offline consistency verification.
- Local account/session controls and a default-off invited Cognito/OIDC
  application slice with PKCE, signed-token validation, browser-bound callbacks
  and encrypted issuer/subject mappings. Matching emails never merge accounts.
- Independent timestamp gates at both AI preparation and transmission. The
  platform's reviewed origin-concept example is not a timestamp for customers'
  ideas, a proof of ownership or coverage for later development.
- Four default-off text-provider adapters, exact disclosure approval and
  conservative atomic monetary reservations before provider access. Ambiguous
  costs remain counted; token-based estimates are not provider invoices.
- Default-off Stripe **test-only** Checkout and portal, immutable account
  binding, raw signed webhook verification, durable deduplication and retrieval
  of current subscription state. Plan access and its provider-cost allowance
  are rechecked before AI spending. Live billing is rejected.
- Durable checkout attempts prevent duplicate sessions after ambiguous results.
  Recovery preserves billing records but invalidates their access authority
  until fresh reconciliation. Evidence history remains unchanged.
- Security-screen plan status and explicit test-payment labels, responsive
  controls and a visible source-code link. Checkout redirects alone never grant
  entitlement. Saved projects and exports remain available without AI access.
- Reviewed source allowlisting, staged secret scanning (including payment
  credentials), approved-destination push guard, CI and community documentation.

### Verification

Initial public commit: `56c37bc69d4a863a35e39ada13fa9a3aede42cc1`.

- An independent clone from GitHub completed `npm ci` with zero reported dependency vulnerabilities at check time.
- `npm test`: **177 passed, zero failed/skipped**.
- `npm run build`: passed; main JavaScript 436.76 KB / 131.02 KB gzip, CSS 66.45 KB / 14.37 KB gzip.
- `npm run check:source`: **123 reviewed files, zero findings**; staged source and whitespace checks passed before commit.
- `npm run check:business`: proposed weekly-revenue and margin floors passed, not actual revenue verification.
- `npm run release:check`: every recorded source-release gate passed.
- [GitHub Linux verification](https://github.com/M2201/whoayo/actions/runs/38680170889): passed for the initial public commit.
- GitHub readback confirmed public visibility, AGPL license detection, private vulnerability reporting, dependency alerts, secret scanning and secret push protection.

These checks are not an independent security audit or hosted-customer acceptance.

Synthetic browser checks cover inactive/processing and active/cancel-at-period-end
billing displays at 1440, 390 and 320 pixels. No measured horizontal overflow or
browser console errors; screenshots were visually reviewed. Browser billing
responses were mocked for presentation QA, while API/webhook/entitlement behavior
is covered separately by automated synthetic integration tests. No real Stripe,
identity, timestamp or model request was made by these checks.

### Remaining hosted gates

An owned HTTPS domain, dedicated cloud account/region, approved itemized budget,
merchant test account, live identity/MFA/recovery acceptance, KMS separation,
scheduled off-device backups, alerts and support/legal approvals remain required.
Test-mode billing must pass the merchant's real sandbox journey; refunds, disputes,
taxes and invoice reconciliation need acceptance before a separately reviewed
live-billing release. Hosted deployment and customer enrollment are not complete.

Code drafting and file versioning are implemented; isolated execution, full
Codex/Claude coding-agent operation inside WHOAYO and customer publishing are not.
The $10,000/week and 40% gross-margin goals are planning targets, not observed
revenue or a promise of success. See [Owner handoff](OWNER-HANDOFF.md),
[Hosted launch](HOSTED-LAUNCH.md), [Payments](PAYMENTS.md) and
[Commercial plan](COMMERCIAL-PLAN.md).
