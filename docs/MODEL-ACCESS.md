# Multi-Model Workspace

Local implementation, October 6, 2026. Not a hosted release or evidence of live access to every model. The requested direction is browser-based model choice for customers without requiring local model installation. Existing private records, accounts, keys and timestamp receipts remain separate from the initiative's ledger.

## Supported Scope

The text-only chat gateway supports OpenAI Responses, Anthropic Messages, Google Gemini's OpenAI-compatible chat endpoint, and Kimi/Moonshot Chat Completions. Each provider has a server-controlled allowlist of exact model IDs. Model discovery is not automatic; no request is made simply to populate the catalog. A configured ID is not proof of account access, model capability, privacy terms or response quality.

Consumer subscriptions do not establish API entitlement. This release does not embed the consumer ChatGPT, Claude, Gemini or Kimi applications, and does not offer image/audio/video generation, tools, autonomous execution, search, provider comparison fan-out or private hosted inference. Additional API providers require reviewed adapters, not an arbitrary endpoint field.

## Customer Journey

The workbench starts in Private note mode. The model selector lists configured models grouped by provider; unavailable choices remain disabled. Selecting a model or opening Model connections does not contact a provider. Switching models and opening/closing the connections dialog retain the current draft. If a save finishes after the user begins a different draft, it clears only the submitted text, not the new draft.

Review disclosure shows recipient, exact model, endpoint, context count, policy limitations, request bytes and digest. Explicit approval remains single-use, revision-bound and expiring. The selected model is checked again before transmission. An unavailable or removed model fails closed without choosing a replacement. Earlier conversation is opt-in; there is no automatic vault upload. A request failure retains recorded input, has an uncertain-outcome receipt and never automatically retries. Returned model version and token usage are recorded separately from the requested model. Output-limit truncation is labeled.

## Server Configuration

For each prefix `ORIGIN_OPENAI`, `ORIGIN_ANTHROPIC`, `ORIGIN_GEMINI`, `ORIGIN_KIMI`:

| Suffix     | Meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `_KEY`     | Dedicated server-side credential, never a browser/VITE variable |
| `_MODELS`  | JSON array of reviewed text-model IDs, maximum 64 per provider  |
| `_MODEL`   | Backward-compatible single model when `_MODELS` is absent       |
| `_ENABLED` | `0` disables this provider; does not override global off        |

`_MODELS` is authoritative when present, including `[]`. Invalid configuration disables that provider and does not echo its raw value. Do not paste keys into model fields. Duplicate IDs are removed. Blank/invalid IDs, excessive lists and recognizable credential prefixes fail closed. No model IDs are invented or installed by the code.

`ORIGIN_EXTERNAL_AI=1` is also required; its default remains off. Gemini and Kimi additionally require `ORIGIN_GEMINI_POLICY_REVIEWED=1` / `ORIGIN_KIMI_POLICY_REVIEWED=1`. These are operator acknowledgments after reviewing the actual account's terms and billing, not automated privacy attestations. Google's unpaid terms restrict submitting confidential information; applicable terms differ by account and location. Do not enable an unsuitable account for private customer work. Other providers' retention and account agreements also need review.

Configuration changes require a restart. No real environment file was changed for this release. Disable all external requests using `ORIGIN_EXTERNAL_AI=0`, or one provider using its `_ENABLED=0`, then restart. Existing history and receipts remain intact. Disabling cannot recall a request already sent.

## Boundaries And Live Acceptance

Preserved controls: tenant-scoped requests, authenticated/CSRF-protected endpoints, exact-payload credential scanning, fixed TLS endpoints, redirect refusal, 45-second deadline, two concurrent requests globally / one per account, 160 KB request and 1 MiB response limits, 4,096 requested output-token cap, and persistent daily attempt counts. An optional fixed-point ledger now atomically reserves a conservative maximum against account/platform monthly limits before provider access; managed hosted AI fails closed without it. Valid usage becomes an estimate and ambiguous outcomes keep the reservation. This is not provider invoice reconciliation, and provider-side hard limits remain required. See [Monetary controls](MONETARY-CONTROLS.md).

Before enabling a model for customers:

1. Review a dedicated account's API entitlement, available exact IDs, data handling, region implications and billing limits. No credentials from unrelated projects.
2. Configure approved models and an explicit small synthetic-evaluation budget. Do not automatically repeat the earlier OpenAI paid test.
3. Make separately authorized synthetic calls; verify authentication, selected/returned model, output cap behavior, latency, token usage, failure handling and estimated versus billed cost. Compatibility can vary by model; names in a list are not validation.
4. Complete hosted identity/MFA, tenant isolation, external key custody, scheduled independent recovery and alert-delivery gates. Keep the current local server loopback-only.

## Offline Verification

`npm test` includes catalog parsing, exact-model selection, all-provider disable/missing-key behavior, policy gates, immutable disclosures, account isolation, removed-model rejection, malformed/error/timeout responses, no retries/fallback, usage validation and truncation labels. These mock provider responses; they do not measure real model quality.

For isolated UI checks, start `ORIGIN_QA_MULTI_MODELS=1 node test/ui-fixture.mjs`, then run `ORIGIN_QA_URL=http://127.0.0.1:4362 node scripts/qa-model-selection.mjs` with the approved Playwright runtime. The server uses in-memory synthetic data and a mocked fetcher, never real credentials. The browser uses a fresh profile and blocks non-loopback page requests. Screenshots and result receipts are gitignored in `output/playwright/models-*`. Stop the fixture after testing. It is not a customer service or a place to retain real ideas.

## Official Contract References

- [OpenAI Responses](https://developers.openai.com/api/reference/resources/responses/methods/create): existing adapter retained.
- [Anthropic Messages](https://platform.claude.com/docs/en/api/messages/create): existing adapter retained.
- [Google Gemini OpenAI compatibility](https://ai.google.dev/gemini-api/docs/openai): fixed chat endpoint and Bearer authorization; no SDK or consumer-login dependency.
- [Google API terms](https://ai.google.dev/gemini-api/terms): review paid/unpaid and account-specific data handling before enabling.
- [Kimi Chat Completions](https://platform.kimi.ai/docs/api/chat): endpoint, authentication, bounded completion request and usage/response fields.
- [Kimi model terms](https://platform.kimi.ai/docs/agreement/modeluse): policy review destination.

Documentation checked October 6, 2026. Recheck before live enablement; no pricing or model availability is implied by this implementation.
