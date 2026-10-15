# Operating WHOAYO

This runbook separates the current local product from a future managed service. Passing local tests does not authorize hosted customer traffic.

## Kill switches

- Set `ORIGIN_EXTERNAL_AI=0` and restart to stop new provider requests.
- Set an individual provider's `_ENABLED=0` and restart to remove it from selection.
- Disable the public ingress/load balancer to stop all hosted access.
- Disable invitations in the identity provider to stop new enrollment.
- Pause checkout/payment links to stop new sales; do not cancel existing subscriptions without the approved policy.

Disabling a service cannot recall a request already sent or undo a payment already processed.

## Daily operator check

1. Confirm HTTP health, TLS expiry window and error rate.
2. Review provider failures, `outcome-unknown` disclosures and monetary reservations.
3. Confirm external-AI and provider settings match the approved catalog.
4. Review spend against account and platform ceilings; compare provider dashboards for anomalies.
5. Review security/monitor findings without opening private customer content unnecessarily.
6. Check backup completion and age. A job exit code alone is not restore evidence.
7. Triage support and security reports using the published response targets.

## Weekly business review

Run:

```sh
npm run check:business
```

Replace planning allowances with actual direct cost data before reporting margin. Review recognized recurring revenue, gross profit, trailing four-week gross margin, activation, four-week retention, paid conversion, P90 COGS per tier, uncertain reservations, restore status and trust guardrails. Keep one owner for each corrective action and a due date.

## Monthly control review

- Reconcile provider invoices, payment fees, variable hosting/storage, timestamps and direct support.
- Review every enabled model's current price, region, retention and account terms.
- Rotate or revoke credentials under the approved key policy; never paste them into issues or chat.
- Perform a restore to a new isolated location and verify sign-in, evidence, spend ledger, session invalidation and application version compatibility.
- Review dormant accounts, support access, identity roles and incident contacts.
- Test the external-AI kill switch and one provider-specific disable switch with synthetic data.
- Update dependencies in a review branch; run source, test and build gates before merge.

## Incident priorities

| Priority | Example                                                                                    | Initial response target | Immediate action                                                           |
| -------- | ------------------------------------------------------------------------------------------ | ----------------------: | -------------------------------------------------------------------------- |
| P0       | cross-tenant exposure, credential leak, uncontrolled provider spend, evidence corruption   |              15 minutes | stop affected traffic, preserve logs/evidence, revoke access, notify owner |
| P1       | sign-in outage, repeated provider ambiguity, failed restore, checkout entitlement mismatch |                  1 hour | contain affected path, communicate status, begin reconciliation            |
| P2       | isolated feature failure with safe workaround                                              |          1 business day | document scope, queue tested repair                                        |

Do not alter historical evidence to “clean up” an incident. Preserve the original state, record remediation separately, and use qualified legal/security advice for notification duties.

## Production observability required

Before launch, create privacy-minimized aggregate telemetry for availability, latency, request outcomes, reservation outcomes, webhook processing and restore freshness. Exclude idea text, prompts, artifacts, receipt nonces, credentials and exact evidence packages. Access to operational metadata should be role-limited and audited.

Minimum alerts:

- provider spend at 50%, 75%, 90% and 100% of the platform limit;
- any hosted provider call without a monetary reservation;
- elevated `outcome-unknown` rate;
- repeated failed identity callbacks or cross-tenant authorization denials;
- backup age beyond policy or failed restore drill;
- payment webhook backlog/duplicate conflict;
- certificate expiry and sustained service error rate.

## Release procedure

1. Freeze the exact candidate commit.
2. Verify source allowlist, staged bytes, full tests, production build and unit economics.
3. Review the diff for private paths, secrets, customer data, evidence packages and unsupported claims.
4. Deploy to an isolated staging environment with synthetic accounts/data.
5. Run identity, timestamp, model, billing, recovery and tenant-isolation acceptance.
6. Record the artifact digest and approval.
7. Deploy the same artifact to production; do not rebuild from a different tree.
8. Verify health and a synthetic user journey; keep rollback available.

Public source release and hosted deployment are separate approvals.
