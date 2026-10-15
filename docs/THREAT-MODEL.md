# Initial Threat Model

Scope: local development release on one Mac. This document is a design review, not an independent security assessment.

## Assets And Trust Boundaries

- Private concepts, source files, references, prompts, responses, and contribution history.
- Master encryption key, wrapped per-project keys, account password verifiers, session hashes, and provider credentials.
- Browser -> loopback application -> encrypted SQLite vault.
- Application -> four fixed HTTPS model-provider endpoints, only after verified timestamp evidence, spend reservation when enabled, and approved disclosure.
- Application -> plaintext user-requested export on the local device.
- No shell, repository, public-chain, crawler, email, or autonomous deployment boundary is active.

## Threats And Controls

| Threat                                              | Implemented control                                                                                                                 | Residual exposure                                                                               |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Another app user reads a project                    | Owner-scoped queries before decrypt/read/write/export                                                                               | Not a production multitenant infrastructure review                                              |
| Stolen database copy                                | Per-project AES-GCM; separate wrapped keys; restrictive directory permissions                                                       | Master key and DB on same host; metadata remains readable                                       |
| Compromised host/application or privileged operator | Minimized logs, explicit process boundaries, no agent shell                                                                         | Operator can decrypt; independent key custody is required for stronger claims                   |
| Browser-origin attack                               | Exact Host/Origin checks, SameSite HttpOnly cookie, CSRF token, CSP, no remote embedded content                                     | Same-origin XSS or compromised frontend dependency can act as the user                          |
| Credential leakage through a prompt                 | Known-pattern scanner before request approval                                                                                       | Not complete DLP; novel or obfuscated secrets may bypass patterns                               |
| Unapproved model context                            | Explicit file selection, history opt-in, exact payload approval                                                                     | Approved excerpts can reveal the idea; provider receives plaintext                              |
| Modified/replayed approval                          | Digest, revision, short expiry, one-use consumption                                                                                 | Local operator controls server code and storage                                                 |
| Provider uncertainty                                | Deadline, bounded concurrency, size cap, no automatic retries, unresolved outcome records                                           | Network failure cannot prove nonreceipt or nonbilling                                           |
| Evidence tampering                                  | Immutable application versions, AEAD, hash-chain verification, receipts and exports                                                 | Full-store rewrite/truncation needs an external witness to detect reliably                      |
| Prompt injection                                    | Model has no execution tools; source material labeled untrusted; output escaped                                                     | Model may still produce bad advice or unsafe proposed code                                      |
| Excess spending                                     | Daily attempt cap, output/concurrency bounds, atomic account/platform reservations before provider access, ambiguous costs retained | Catalog drift, invoice differences and rollback require provider hard limits and reconciliation |
| Overclaiming monitoring                             | Checks named and scoped in UI; no automated remediation                                                                             | Local monitor does not observe host intrusion, all leaks, or provider behavior                  |
| Loss of storage or keys                             | Consistent encrypted backup/restore CLI; separate recovery key; fail-closed new-destination restore                                 | Independent copies, scheduling, real restore drills and key rotation remain outstanding         |
| Stolen session                                      | Reauthenticated, CSRF-protected account-scoped revocation; restored sessions invalidated                                            | Compromised passwords permit new sign-ins; already sent requests cannot be recalled             |

## Tests Required Before A Hosted Pilot

Independent review must include account lifecycle and MFA recovery, tenant boundary attacks, database and key access, cloud IAM, audit log integrity, backup/restore, file parser and sandbox escape paths, egress controls, repository permissions, dependency provenance, secret handling, and provider-retention/account verification. Add evidence of detection and response, not just preventive controls.

Use production services only after this product has its own reviewed deployment boundary. No other project's approvals or compliance status transfer here, and no SOC 2 report or compliance certification is asserted. The current release gates and residual recovery risks are listed in [Security and recovery](SECURITY-RECOVERY.md).
