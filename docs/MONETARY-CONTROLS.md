# Monetary Controls

Implemented October 14, 2026. This control estimates and limits application spend; it is not a provider invoice, customer billing system or promise that the estimate equals the final charge.

## What is enforced

When `ORIGIN_SPEND_GUARD=1`, every configured provider/model must have an exact entry in a versioned price catalog. Before an outbound request, the server reserves a deliberately conservative maximum based on one input token per UTF-8 request byte plus the provider request's full output-token limit. A single SQLite transaction rejects the request if either the account's monthly allowance or the platform's monthly ceiling would be exceeded. The provider receives nothing when reservation fails.

If the provider returns valid input/output usage, the reservation becomes a token-based application estimate. If usage is missing, the request times out, the server restarts with an unsettled reservation, or the outcome is otherwise ambiguous, the full reservation remains counted as `outcome-unknown`. It is not silently released or retried. The Security screen exposes the signed-in account's totals, limit and uncertain-reservation count without exposing credentials or platform-wide customer activity; aggregate details remain operator-only.

Managed hosted identity plus enabled external AI fails closed unless this guard is enabled. Local development can leave it off; the existing persistent daily request-attempt limit remains active in either mode.

## Configuration

```text
ORIGIN_SPEND_GUARD=1
ORIGIN_ACCOUNT_MONTHLY_AI_BUDGET_USD=20.00
ORIGIN_PLATFORM_MONTHLY_AI_BUDGET_USD=200.00
ORIGIN_MODEL_PRICES_JSON={"version":"operator-reviewed-YYYY-MM-DD","providers":{"openai":{"exact-model-id":{"inputUsdPerMillion":"2.00","outputUsdPerMillion":"10.00"}}}}
```

Use decimal strings, not floating-point numbers. Prices support six decimal places. The model ID must exactly match the server allowlist. Configuration is validated at startup and every enabled model must be priced. Restart after a reviewed change.

The example is a schema demonstration, not a current price quote. Review the exact provider account, processing tier, region, caching/tool charges and current official rate before changing the catalog. OpenAI notes that tokens and some tools are billed separately and that eligible regional processing can add an uplift; Anthropic also publishes model-specific token rates. Do not infer total task cost from a headline token price alone.

## Reconciliation procedure

Daily:

1. Review `outcome-unknown` reservations before considering any manual release.
2. Match the disclosure digest, provider, model and attempt time to provider usage logs.
3. Do not retry an ambiguous request merely to obtain a cleaner receipt.
4. Disable `ORIGIN_EXTERNAL_AI` and restart if unexplained spend or catalog drift appears.

Monthly:

1. Export provider invoices/usage from each dedicated API account.
2. Compare provider totals with WHOAYO's application estimates by catalog version.
3. Record adjustments outside the private idea vault in the accounting system.
4. Update the unit-economics model from reconciled direct costs.
5. Review budget ceilings before the next cycle; never raise them only to clear an alert.

## Known boundary

The database records reservations and estimates, not authoritative invoice line items. A rollback restores the ledger to an earlier point, so external provider hard limits and post-restore reconciliation are still required. The hosted billing service must maintain customer entitlements and payment status independently from this provider-spend guard.

References checked October 14, 2026:

- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [Anthropic Claude Sonnet pricing](https://www.anthropic.com/claude/sonnet)
