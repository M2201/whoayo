# Local Recovery And Session Security

This is local tooling, not a hosted backup service or an independent security certification. Automated tests use disposable accounts, databases and keys. Private operational recovery records, device details and key-custody locations are excluded from public source.

## Operator Acceptance Requirement

Every deployment must complete and privately record an off-device encrypted backup and restore to a NEW offline directory. Verify database integrity, decryption, exact evidence, application sign-in and restored-session invalidation without modifying the original vault. Record counts, booleans, elapsed time and archive fingerprints rather than plaintext records.

A programmatic recovery alone is not an end-user sign-in exercise or a full site disaster drill. Provider credentials are excluded. A restored copy must stay offline until cutover, external-cost reconciliation and credential decisions are explicitly approved. Recovery does not independently verify blockchain evidence.

Keep the recovery key independent of the archive and protected against loss of the primary machine. Use separately encrypted storage or an approved password manager, verify recovery access, and establish a schedule, off-site copy, retention policy and failure alerts. The application cannot establish these operational controls on an operator's behalf.

## Scope

The encrypted archive includes one consistent SQLite snapshot and its matching master key. AES-256-GCM protects the whole archive, including metadata that is not encrypted within SQLite. It uses a separate randomly generated 32-byte binary recovery key. The SQLite backup API captures committed WAL data; it does not copy only the main database file. Integrity, account decryption, project receipts, immutable snapshot lineage, and stored timestamp-receipt hashes are checked before success is reported.

Stored evidence and timestamp receipt bytes are included in the database. Loose exported files, downloaded proof bundles, source code, installed dependencies, `.env.local`, provider credentials, local model weights, and private files outside that database are NOT included. Retain those separately under reviewed controls. This tool does not submit, upgrade, or independently verify blockchain proof.

Database snapshots are limited to 64 MiB; encrypted archives to 120 MiB. Unsupported table layouts fail closed and require a reviewed migration with the matching application version. This intentionally bounded implementation is not a large-database backup system.

## Operator Procedure

Use a dedicated trusted machine and owner-only directories (0700). Files are created owner-only (0600). Recovery keys and input archives must be regular files, not links. All paths are explicit; the tool never defaults to the real vault. The recovery key must be outside both the data directory and the archive directory, and must not be the master key.

1. Choose an independent encrypted archive destination and a separately protected recovery-key destination. Different folders on the same Mac are not independent recovery or external key custody. Keep an offline recovery-key copy with controlled access. Losing it makes the archive unusable; possessing it and the archive gives access to every backed-up account's data.
2. Generate the key once. Never pass its value on the command line or paste it into chat. Existing files are never overwritten.
3. Take an archive using the exact matching master-key file. If the deployment uses `ORIGIN_MASTER_KEY`, arrange a secure operator-controlled binary key file first; do not assume an old `master.key` matches. The live source is opened read-only. For busy or large vaults, schedule a quiet backup window and treat any interrupted operation as failed until verified.
4. Restore only into a NEW destination, with the original vault preserved. A wrong key, failed authentication, invalid database, or failed evidence check must not be bypassed.
5. Inspect the success receipt, sign in to the restored copy in an isolated browser profile, and verify expected projects and exact evidence. Start offline with both external AI and local review disabled; do not import provider credentials as a side effect. Record the archive hash, test date, result, operator, and restore duration outside the backed-up system. Test the off-device copy, not just the local source.

Examples below are placeholders, not commands executed against the owner's records:

```sh
node scripts/recovery.mjs keygen --recovery-key /private/key-folder/recovery.key
node scripts/recovery.mjs backup --data /private/data-folder --master-key /private/data-folder/master.key --recovery-key /private/key-folder/recovery.key --archive /private/archive-folder/backup.enc
node scripts/recovery.mjs restore --archive /private/archive-folder/backup.enc --recovery-key /private/key-folder/recovery.key --destination /private/restore-parent/NEW-directory
```

The CLI prints a content-free success summary and archive SHA-256, never key values. Failure returns a nonzero status. Do not mistake file existence for successful completion. A crash may leave a partial archive or a new restore directory marked `.restore-incomplete`; the normal server refuses that directory. Keep the original archive, inspect the failure, and retry to a fresh destination. Do not remove the marker to bypass the gate.

Temporary snapshot files have encrypted project content but readable SQLite metadata; they are created in a private temporary directory and removed on normal completion/failure. Host crashes may leave temporary files. Removal is not guaranteed secure erasure on SSDs, and JavaScript does not guarantee erasure of every in-memory key/plaintext copy. Use encrypted disks and an approved retention/cleanup procedure.

## Restored Authority And Evidence

- All restored sessions are deleted, across all accounts; passwords are not reset. Users must sign in again. If credentials themselves were compromised, revocation is not enough: password reset/managed recovery remains a separate requirement.
- Pending AI approvals are cleared; attempted requests become `outcome-unknown` with reason `backup-restore`. An append-only recovery event records this change. No original receipt, saved snapshot, timestamp submission, or attribution is rewritten.
- Billing records are retained but restored subscription authority is invalidated until fresh provider reconciliation. Pending checkout attempts become `outcome-unknown`; do not create replacements until their provider outcomes are resolved. Redelivering an already recorded event is not a fresh reconciliation.
- Restoring from an old backup recovers only that point in time. Events and usage after it are absent. Preserved daily counters are NOT a reliable global spending cap after rollback; reconcile provider usage and external billing controls before enabling traffic.
- The original running vault's sessions are not revoked by restoring a separate copy. Cutover, credential rotation, shutdown of the old instance, and ensuring only one active writer are separate, explicit operational steps.
- This tool does not recover unsaved browser drafts or recall previously disclosed content. Local consistency does not establish provenance truth, originality, ownership, or independent blockchain time.

## Sign Out Everywhere

### Local Sign-In And Forgotten Passwords

Registration accepts the existing 3-60 character usernames or an email-shaped identifier up to 254 characters. Identifiers are lowercased for lookup; dots and plus tags remain distinct. This is not email verification, an identity claim, or a recovery address enrollment. No existing identifier, password verifier, project key or evidence record is migrated by this change. Field-specific registration errors are distinct from generic wrong-credentials login errors.

The visible **Forgot password?** control explains that no automated password reset exists in this local release. It makes no request, sends no email, and does not change credentials or sessions. The existing password manager may hold the saved password. Do not solve forgotten credentials by creating another account, editing SQLite, deleting the vault, or treating an AWS sign-in/backup key as reset authorization. Backups preserve password verifiers; restoring one is not a password reset.

Hosted onboarding remains blocked on verified recovery: establish and verify a recovery channel, use bounded single-use expiring reset tokens with generic responses and abuse controls, test expiry/replay/account isolation, revoke appropriate sessions and pending disclosure authority, and preserve encrypted projects and immutable evidence. Account migration/linking requires proof of control, not just matching an unverified email-shaped identifier. No reset endpoint or email delivery is implemented by this UI correction.

### Session Revocation

In **Security -> Sessions**, **Sign out everywhere** requires the current password and CSRF-protected authenticated POST. It ends all current sessions for the signed-in account, including the initiating session, without affecting other accounts. Wrong passwords leave sessions intact. Password checks are rate-limited per account. The session is rechecked after password derivation and after reading request bodies, preventing stale authorization during those waits.

The endpoint is `POST /api/sessions/revoke-all`, with `{ "password": "..." }`; the target account is derived solely from the authenticated session, not a supplied user ID. No password is placed in the URL or returned. Already accepted provider requests cannot be recalled. Other browsers may still display cached content until they navigate or refresh, but protected API access is denied. Previously downloaded exports cannot be revoked.

## Confidential Hosting Gates

| Gate                    | Evidence required before accepting confidential hosted customer data                                                                                  | Current state                                                                                                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity and recovery   | Reviewed account lifecycle, mandatory staff MFA, customer authenticator option, recovery and credential-rotation tests                                | Local passwords plus default-off invited OIDC routes, encrypted issuer/subject mapping and managed-session revocation; synthetic-tested only, with no provisioned provider or live recovery exercise |
| Tenant isolation        | Independent cross-tenant API, database, object-storage, job-queue and inference tests                                                                 | Local account tests only                                                                                                                                                                             |
| Key custody             | Dedicated KMS/HSM policy, separate roles, audited access, rotation/recovery exercise                                                                  | Master key remains server-managed on the same host                                                                                                                                                   |
| Independent recovery    | Off-device encrypted backups, separate key custody, schedule/retention, alert delivery and timed restore exercise                                     | Local recovery tooling and synthetic tests; hosted operational acceptance remains open                                                                                     |
| Private inference       | Chosen region/host, licensed pinned weights, tenant-aware requests, enforced no-egress and no cloud fallback, measured synthetic quality/latency/load | Default-off local adapter; no deployed private inference                                                                                                                                             |
| Data lifecycle          | Consent, minimization, retention/deletion rules, log redaction and export safeguards                                                                  | Hosted policies/enforcement unverified                                                                                                                                                               |
| Spending and operations | Enforced monetary limits, reconciliation after rollback, security/backup alerts, named incident owner/runbook                                         | Atomic monetary reservations and test billing entitlements implemented; live invoice reconciliation and hosted alert delivery unverified                                                                                                                                                |
| Release security        | Dependency review, patch policy, external review, tested rollback/cutover and deployment approvals                                                    | Local tests are not independent approval                                                                                                                                                             |

Private review should run server-side for customers; installing a model on each customer's computer is not a launch prerequisite. Keep the current default-off adapter as a development option. Before selecting a hosted runtime, settle the initiative's own budget, region, and dedicated account, then run a bounded synthetic evaluation with blocked outbound network access. Do not silently replace unavailable private inference with an external AI provider. Do not expose the loopback server by tunnel as a shortcut.

No other project's budget, credentials, approvals, recovery targets or compliance status transfer here. No paid infrastructure, publication, model test, or timestamp operation is authorized by this document.

Implementation reference: [Node SQLite backup API](https://nodejs.org/api/sqlite.html#sqlitebackupsource-db-path-options); encryption reuses the project's existing AES-GCM module based on [Node cryptography](https://nodejs.org/api/crypto.html). Runtime verification used Node 24.13.0, where SQLite remains experimental.
