# Exact-Version Timestamp Gate

This release implements a signed-timestamp path and a server-enforced gate before
external AI. Live authority service remains disabled until reviewed and validated.
The general Bitcoin-first workflow still does not automate proof upgrade or local-node
verification. A pending OpenTimestamps receipt does not unlock AI. Local preservation
time is not independent evidence.

## Preserved OpenTimestamps Completion

One owner-approved, previously pending OpenTimestamps receipt was upgraded through
the approved Alice and Bob calendars. The completed detached proof was parsed against
the exact preserved fingerprint, and both Bitcoin attestations were cross-checked
against Blockstream's public API for matching transaction confirmation, block height,
block hash, Merkle root and block time. No local Bitcoin node was available, so the
record is explicitly labeled **public explorer cross-check**, not local-node consensus
verification.

The completed proof is stored as a second encrypted append-only record. The original
pending receipt and original snapshot remain unchanged and separately downloadable.
The authenticated evidence view exposes only public-safe verification facts: the
salted fingerprint, block height/time and user-opened explorer links. It does not
expose the concept, nonce, private package, account identifier or internal file path.
The welcome page now carries an owner-approved summary of the completed proof and
its earliest attested time as a completed example. It does not expose private data
or claim that this record covers Origin Studio's own concept. That exact-version
mapping remains unestablished, so the separate platform concept reference is unchanged.

This operator-only import is evidence handling, not the general Bitcoin-first product
path and not a change to the RFC3161 AI gate. It does not establish originality,
ownership, identity or legal rights.

## User Flow

1. Record the exact idea version, creating its private preserved package.
2. Open **Timestamp setup**. Choose a configured path. Unavailable options remain
   visible and disabled; there is no skip or silent fallback.
3. Review the fingerprint, authority destination, version and fee. Preparing does
   not send anything externally. Explicitly approve the fingerprint submission.
4. The server submits an RFC3161 query containing a SHA-256 imprint of the salted
   preserved-package commitment, nonce and policy. It sends no idea text, files,
   names or account identifiers in that query. The authority still sees transport
   metadata such as the server IP and request time.
5. The server validates the response and durably saves the receipt before allowing
   external AI. The user can download the proof and matching private package.
6. Choose an enabled model, review the separate AI disclosure, and send. Both AI
   prepare and send reverify the proof against the current exact idea version.

Private notes, files and edits remain available while blocked. A new idea version
needs its own receipt. A receipt does not establish ownership, originality,
identity or legal priority. Later prompt additions are not covered by an earlier
idea receipt; users must record new concepts before disclosing them.

## Trust And Operations

The first adapter has a fixed destination, `https://freetsa.org/tsr`, not an arbitrary
user-supplied URL. Activation requires **all** of these server-side settings:

- `ORIGIN_TSA_ENABLED=1`
- `ORIGIN_TSA_POLICY_REVIEWED=1`
- `ORIGIN_TSA_ROOT_FILE`, `ORIGIN_TSA_SIGNER_FILE`, `ORIGIN_TSA_CRL_FILE`: local PEM files.
- `ORIGIN_TSA_ROOT_SHA256`, `ORIGIN_TSA_SIGNER_SHA256`: lowercase DER certificate fingerprints.
- `ORIGIN_TSA_POLICY_OID`: explicitly reviewed policy, never copied from the synthetic fixture.
- `ORIGIN_OPENSSL_PATH`: absolute path to an operator-reviewed OpenSSL installation.

Do not enable from a certificate fetched from an arbitrary URL. Review official
authority documents, root/signer fingerprints, timestamp policy, privacy and
availability terms, then validate one approved synthetic submission. Verify the
signer's chain, timestamp-only purpose, validity and CRL before activation. The
selected first adapter assumes a signer directly issued by its pinned root; it
does not trust the system CA store or silently accept alternate signers.

Verification uses OpenSSL's RFC3161 and CMS implementations for signature, nonce,
exact imprint, policy, actual signer, chain, purpose and revocation checks. Authority
time must be within five minutes of the submitted request time; host clock health
therefore matters. Proofs are rechecked against current certificate/CRL validity.
An expired CRL or certificate fails closed; no historical long-term-validation
claim is made. Operators must refresh reviewed CRLs and restart the process before
expiry. Rotation of a signer/root/policy changes trust identity and requires review.
No automated trust renewal or authority failover is included.

Request limits: 15-second network deadline, maximum 128 KiB response, two in-flight
timestamp submissions globally, one per account, six attempts per account per UTC
day, plus route rate limits. There are no automatic retries. Failed or interrupted
submissions stay unverified/unresolved; the authority may have received the request.
Proof-save failure cannot unlock AI. Restores cancel pending timestamp approvals.

The current OpenSSL operations are bounded synchronous local processes. This is
appropriate for the isolated local prototype, not a hosted throughput/security
claim. Hosted release requires worker isolation, authority/CRL health alerts,
capacity tests and operational review. Public internet exposure remains prohibited.

To disable, set `ORIGIN_TSA_ENABLED=0` and restart. This blocks external AI whose
proof can no longer be reverified, but does not delete ideas, receipts or notes.
Existing imported Bitcoin evidence remains separate from the RFC3161 path.

## Test Boundaries

`test/timestamp-authority.mjs` generates an ephemeral private root, timestamp-only
signer and CRL. It produces real signatures offline, explicitly labeled synthetic.
`test/timestamps.test.mjs` uses the real verifier and gate. No fixture key is retained.
Provider-only unit tests use `test/provider-gateway.mjs` to isolate provider schemas;
those tests are not evidence for the timestamp gate. Production never imports it.

Browser QA uses `ORIGIN_QA_TIMESTAMPS=enabled|unavailable|malformed` with the isolated
in-memory `test/ui-fixture.mjs` on port 4362, and `scripts/qa-timestamps.mjs` with the
same mode and `ORIGIN_QA_URL=http://127.0.0.1:4362`. Only synthetic content and mock
model responses are used. This does not validate a real authority or model.

## References

- [RFC3161](https://www.rfc-editor.org/rfc/rfc3161)
- [FreeTSA official service and certificate links](https://www.freetsa.org/index_en.php)
- [Official OpenTimestamps client](https://github.com/opentimestamps/opentimestamps-client)

No live signed authority is claimed in this checkpoint. The stored OpenTimestamps
completion is limited to its exact private preserved package and the verification
level described above.
