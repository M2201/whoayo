# Product Contract And Delivery Map

Current operational workstream: [Hosted launch](HOSTED-LAUNCH.md), October 9, 2026. That document distinguishes implemented, locally tested, prepared and live work. Earlier "not implemented" timestamp requirements below describe the original specification: the signed-first server gate is now locally tested but its live authority remains disabled; Bitcoin-first customer prompting is not live. The platform's own concept proof is now linked, as described below.

## Originator Direction

Mandle Rousseau requested a trusted workspace for developers and researchers that records ideas before disclosure, controls AI access, preserves human and AI contribution evidence, and puts cybersecurity at the forefront. The interface should be intuitive and polished, with relevant development/research capabilities and a clean reference/storage system. Agents should monitor safety and operational issues. This is an AI-assisted interpretation of the October 4, 2026 instructions, not a replacement or amendment of the earlier frozen concept receipts.

## Primary User Journey

1. Start with the idea record: preserve exact source and declared human/AI contribution before a model request.
2. The preserved idea becomes its own private project; optionally organize it into a folder later without moving or rewriting historical evidence.
3. Let the user choose the timestamp path for the idea, then obtain and verify the required independent receipt for that exact version before enabling external AI prompting. Local recording or a pending submission is not sufficient. This is a required workflow, not implemented enforcement in the current release.
4. Import relevant files and add sources. New idea content must be preserved and timestamped as a new version before it is disclosed as part of that idea.
5. Choose a built-in prompt skill or work in Plan, Build, or Research mode. Explicitly select any recorded idea or files needed as context.
6. Review the exact disclosure and provider limitations.
7. Receive an attributed AI response and save useful work as versioned artifacts.
8. Verify/export evidence, review monitoring findings, and continue the project.

The system must never claim to retroactively prevent content already entered into a hosted chat from being processed by that platform. It must distinguish training restrictions from broader restrictions on provider reuse, retention, human access, and independent creation of similar products. Monitoring similarity is not proof of copying.

The October 6 UI direction uses **Your ideas should be yours.** as an aspirational statement, supported by the concrete description **Create evidence before you build with AI. Preserve your words, track revisions and keep AI contributions distinct.** The promise is a usable contribution/evidence history, not proven ownership or deterrence of a named company. A local receipt is not verified blockchain time. The [OpenTimestamps explanation](https://opentimestamps.org/#how-it-works) describes proof that data existed before a time; the [U.S. Copyright Office](https://www.copyright.gov/help/faq/faq-protect.html) distinguishes an idea from its protected expression. Neither supports a claim that recording alone prevents copying or awards rights.

## Timestamp Before AI: Required, Not Yet Implemented

On October 6, 2026, Mandle clarified that independent timestamp evidence is the prerequisite for moving from a recorded idea into AI prompting, not an optional export step. The intended statement is: **This exact recorded version existed by the verified time shown on its receipt.** This does not assert the moment of invention, first disclosure worldwide, copying by a later registrant, or priority over independently created work. A contributor's name, location and claimed creation time remain self-declared unless separately verified.

Required behavior:

- Freeze the exact approved idea and attribution, create its private salted commitment, and preserve a recoverable package. Send only the approved commitment to the approved timestamp service, never the private description, attachments or contributor identity.
- Keep `recorded locally`, `submitted / pending`, `independently verified`, and `failed / unavailable` distinct. A service response or block height alone cannot establish verified time.
- Verify the receipt against the exact commitment, approved trust source and proof rules. Preserve the proof and verification metadata before unlocking external AI, and expose a private downloadable receipt with the covered version, time, authority or network, verification status and evidence limits.
- Enforce the prerequisite on the server at both request preparation and outbound send, not only on a disabled UI button. Omitting the idea-context checkbox, choosing a skill, changing providers, or calling the API directly must not bypass it.
- Keep drafts, private notes, local editing and exports available while verification is pending or unavailable. An error must not cause silent AI fallback or falsely label a record as timestamped.
- Bind prompting authorization to the covered idea version. Edits create a new version and require new proof; an older receipt cannot date a later revision. Preserve all earlier versions and receipts.
- Keep independently timestamped idea evidence distinct from subsequent AI prompts and responses. A receipt for the starting idea does not automatically cover a new invention introduced later in a prompt; do not promise automatic detection of every conceptual change. A future automatic pre-send evidence checkpoint must preserve and timestamp the exact new disclosure before sending it if the product promises coverage for every prompt.
- Timestamp verification does not replace authorization to disclose private data or spend money. Simplifying repeated AI consent prompts is a separate, scoped policy change.

### User-Selected Timestamp Path

On October 6, 2026, Mandle decided to leave this choice to each end user, rather than select one mandatory path for everyone. This resolves the product-policy question; it does not select or activate a service.

| User choice                | Requirement before external AI prompting                                                                                                | Later work                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed timestamp first     | A verified independent RFC 3161 timestamp covering the exact recorded version, with its receipt durably saved and available to the user | Add Bitcoin proof for the same preserved package; show its separate pending, failed or verified status without claiming it was complete when AI started |
| Bitcoin verification first | Verified Bitcoin proof covering the exact recorded version, with its receipt durably saved and available to the user                    | Start AI only after verification; a pending calendar receipt or a signed timestamp alone does not satisfy this selected path                            |

Present these as two radio options with clear wait, trust, disclosure and cost information before confirmation. Do not silently select a weaker path, promise instant service, call either option proof of originality, or provide a skip-timestamp option. Unconfigured or unavailable paths must be visibly unavailable, not selectable promises. Service availability must come from operator-reviewed configuration, not from a user's choice alone.

Store the confirmed choice with the account/project/idea version and retain it in the disclosure audit trail. An optional remembered preference may prefill a future choice, but never authorizes a submission, undisclosed cost or provider change by itself. Other users' choices are independent. Switching paths must be an explicit user action, invalidate pending AI approvals and re-evaluate the required proof; it must not rewrite or backdate evidence or retroactively change what was verified before an earlier disclosure. A later failure to obtain the additional Bitcoin proof in the signed-first path must remain visible without invalidating or relabeling a still-valid signed receipt.

[OpenTimestamps' official client documentation](https://github.com/opentimestamps/opentimestamps-client#usage) says confirmation can take hours. Its immediate pending receipt must not be relabeled as proof of that earlier submission time. [RFC 3161](https://www.rfc-editor.org/rfc/rfc3161) provides a signed timestamp protocol; using it still requires a reviewed authority, trust chain, policy, nonce/imprint/signature validation, certificate-status handling, service terms, cost and availability assessment. It is not itself a Bitcoin receipt. The current timestamp path has neither a verified Bitcoin implementation nor a configured timestamp authority.

No authority, account, purchase, public submission or transmission of real evidence is authorized by this design update. Before service activation, confirm the exact destination, payload, cost and trust policy. Existing pending proofs and original evidence must remain unchanged.

### Required Acceptance Tests

- Missing, pending, malformed, mismatched, untrusted and unverifiable receipts cause zero external AI calls and no AI budget consumption.
- A verified receipt for the exact owner/project/idea version unlocks the intended workflow; another owner's receipt, another version and client-supplied `verified` fields do not.
- Both user-selected paths are tested independently: a valid signed receipt can unlock signed-first but cannot unlock Bitcoin-first. Pending Bitcoin confirmation unlocks neither path without the separately required verified proof. Missing or unknown path values cannot unlock prompting.
- Choices are account- and version-scoped, persist across restart and appear accurately in the receipt/disclosure history. Explicit switching invalidates stale AI approvals; a remembered preference or service outage cannot silently change the chosen requirement. Unavailable paths and any known costs are presented accurately before consent.
- Changing a covered version or invalidating the trusted proof after request preparation blocks outbound send. An old pending approval cannot bypass the new gate.
- Receipt persistence failure, timestamp timeout and provider outage retain the user's draft and prevent AI transmission. Any retry behavior is bounded and cannot duplicate charges silently.
- Exported private evidence and its receipt can be checked independently, with no rewrite or backdating of existing records. Verification failures survive restart as failures, not success.
- Browser tests show local, pending, verified and failure states clearly on desktop and mobile; only a genuinely verified state enables AI sending. Synthetic proofs are visibly test-only and cannot establish live readiness.

These are acceptance requirements, not reported test results. Current gateway tests do not establish this gate because independent timestamp enforcement is still absent.

## Delivery Map

### Origin Studio's Own Front-Page Evidence

The owner requested a visual reference to Origin Studio's own concept timestamp on the front page. Once independently verified and approved for public use, the intended statement is **Origin Studio's concept has been timestamped**, accompanied by the exact covered version, verified UTC time, authority/network and an actionable proof reference. Show the verification time separately from local recording/submission times; a shortened fingerprint alone is not verification. The link must open a public-safe proof view or receipt, never the private concept package or a customer's record.

The October 9 read-only reconciliation established that the preserved package explicitly names Origin Studio and describes its concept. Exact package/payload/proof checks match the completed proof and retained explorer report. Both welcome and workspace references now identify preserved concept package revision 2 and October 5, 2026 at 04:52:27 UTC as the earliest attested time. The original package and proofs are unchanged. The public reference is safe metadata, not private content or a downloadable standalone proof. No local-node verification or coverage for later work is claimed.

The page may state that Origin Studio was used to preserve its own concept. It must not claim recording preceded all development or AI use, that an NFT was minted, or that originality/ownership was established. This exact-version statement is separate from customer timestamp-before-AI enforcement and hosted customer access.

| Capability                                  | Current release                                                                                                                                                                           | Required next step                                                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Projects, chat organization, project search | Idea-first creation and owner-scoped folder labels working locally                                                                                                                        | Nested folders, global content search, persisted navigation, collaborative workspaces                                                                            |
| Skills                                      | Eight versioned, reviewable prompt skills with opt-in idea and business context and exact disclosure approval                                                                             | Imported/custom skills, signature/provenance checks, permissions and sandboxed execution require a separate design; no third-party executable skills are enabled |
| Business development records                | Project-scoped profile; classified assumptions, experiments, metrics, decisions, actions and milestones; deterministic financial scenarios; attributed versions and preservation receipts | Evaluated quality benchmarks, live research tools, market data, marketplace workflows and external integrations require separate designs and evidence            |
| Idea versions and evidence                  | Local receipts, encrypted automatic snapshots, stable private downloads, signed-proof verification and exact-version timestamp-before-AI enforcement                                   | Provision/validate a live authority or supported Bitcoin path; add signed contributor identity and external witness storage                                      |
| Model workspace                             | Four text-chat adapters, multi-model chooser, exact disclosure approval and optional pre-call monetary reservations                                                                       | Dedicated account/model live validation, provider-invoice reconciliation, streaming and provider policy/account verification                                     |
| Source files and editing                    | Text import/editor, history, preview, download                                                                                                                                            | Directory import, Monaco/CodeMirror, diffs, patch review, binary/PDF support                                                                                     |
| Assisted coding                             | Draft code in conversation; save artifacts                                                                                                                                                | Sandboxed execution, test runner, logs, terminal, preview server, cancellation and resource isolation                                                            |
| Git collaboration                           | Not connected                                                                                                                                                                             | Scoped GitHub/GitLab authorization, branches, diff review, commits and PRs, isolated worktrees                                                                   |
| Research                                    | Private reference library and user notes                                                                                                                                                  | Approved searches, citations/page receipts, patent and literature connectors, retrieval verification                                                             |
| Agent monitoring                            | Rule-based local evidence/credential/request checks                                                                                                                                       | Isolated monitoring workers, anomaly detection, alert delivery, incident playbooks, evaluated AI triage                                                          |
| Account security                            | Local password sessions plus default-off invited OIDC routes, encrypted issuer/subject mapping and managed-session revocation; synthetic-tested only                                      | Provisioned MFA/recovery, real lifecycle and cross-device tests, role separation, invitations, shared login-transaction storage and session/device management    |
| Data security                               | Per-project encryption with local server-managed keys                                                                                                                                     | Cloud KMS/HSM, key rotation, tenant isolation testing, deletion and retention, tested backups                                                                    |
| Disclosure policy                           | One-use exact request approval; fixed API endpoints                                                                                                                                       | Versioned contractual controls, per-project provider allowlists, zero-retention verification, private model option                                               |
| Billing and operations                      | Persistent request-count cap; account/platform monthly reservations and estimated usage ledger                                                                                            | Customer payments/entitlements, provider-invoice reconciliation, organization quotas, production observability and incident response                             |
| Full product launch                         | Not ready                                                                                                                                                                                 | Independent architecture review, penetration test, restore exercise, hosted release verification                                                                 |

## Next Implementation Order

1. Provision and independently validate one supported live timestamp path, preserving truthful pending/failure behavior. Unsupported paths remain visibly unavailable. The implemented local gate does not establish live service readiness.
2. Validate dedicated development API accounts and disclosure/response/cost records using synthetic data behind the timestamp and monetary gates. Do not repurpose production credentials silently.
3. Provision and validate the prepared invited identity path, external key management, customer payments/entitlements, shared login-transaction storage and real recovery. These are prerequisites to accepting managed customers.
4. Add isolated execution and Git patch workflows before describing the product as a full developer build environment. Use a proven sandbox/container service, strict outbound network policy, no host filesystem mount, bounded compute, and human approval of external changes.
5. Add researcher workflows and policy-reviewed connectors with actual retrieval evidence and query disclosure controls.
6. Complete security/operations validation and ten design-partner journeys, then a limited hosted pilot. No composite score substitutes for passing critical boundaries.

## Scope For Later Maturity

- God's Eye View: coarse aggregate platform adoption, no private idea data or precise location, then separately governed information layers.
- Similarity research and public registries: evidence retrieval and human review, no ownership or infringement verdicts.
- Licensing and value sharing: explicit contributor agreement and dispute process.
- Customer-controlled inference and confidential computing: independently evaluated privacy claims and trust boundaries.
- AI-assisted remediation: agents may propose patches and test them in isolation; production changes retain human authorization.

## Acceptance Evidence

Product usability must be shown by completing real workflows, not inferred from screenshots. Security claims must identify the exact boundary tested. Provider failures, cancelled requests, failed tests, and unresolved results remain in the evidence trail. No fabricated model outputs, successful builds, timestamps, or legal status may appear as real activity.
