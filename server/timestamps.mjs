import { randomUUID } from "node:crypto";
import { canonical, hash, token } from "./crypto.mjs";
import { timestampPayload } from "./evidence.mjs";
import { ensure, InputError } from "./store.mjs";
import { authorityFromEnv } from "./timestamp-verifier.mjs";

export class Timestamps {
  constructor(
    store,
    {
      env = process.env,
      verifier = authorityFromEnv(env),
      fetcher = fetch,
      timeoutMs = 15000,
    } = {},
  ) {
    this.store = store;
    this.verifier = verifier;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.inflight = new Set();
  }
  catalog() {
    return [
      {
        id: "signed-first",
        name: "Signed timestamp first",
        available: !!this.verifier,
        authority: this.verifier?.profile.name || "Authority not configured",
        destination: this.verifier?.profile.endpoint || null,
        costUsd: this.verifier ? 0 : null,
        synthetic: !!this.verifier?.profile.synthetic,
        explanation:
          "Verify an independent signed receipt before AI. Bitcoin anchoring is a separate, unfinished step; this does not provide a Bitcoin receipt.",
        reason: this.verifier
          ? null
          : "A reviewed authority, pinned certificates and a current revocation list are required.",
      },
      {
        id: "bitcoin-first",
        name: "Bitcoin verification first",
        available: false,
        costUsd: null,
        explanation:
          "Wait for independently verified Bitcoin evidence before AI. Confirmation may take hours.",
        reason:
          "Bitcoin proof retrieval and independent verification are not connected.",
      },
    ];
  }
  binding(p) {
    const idea = p.ideas.at(-1);
    ensure(idea, "Record your idea before using an external model.", 409);
    return {
      ideaId: idea.id,
      ideaCommitment: idea.receipt.commitment,
      ideaVersion: p.ideas.length,
    };
  }
  prepare(uid, id, input) {
    this.store.verify(uid, id);
    const p = this.store.project(uid, id),
      binding = this.binding(p);
    ensure(
      !p.archived && p.revision === input.revision,
      "Project changed or archived. Reopen timestamp setup.",
      409,
    );
    ensure(
      this.catalog().find((x) => x.id === input.path)?.available,
      "This timestamp path is unavailable. No data was sent.",
      409,
    );
    ensure(
      input.ideaId === binding.ideaId,
      "Select the current idea version.",
      409,
    );
    const snapshot = this.store.preserve(uid, id, p.revision),
      payload = timestampPayload(snapshot);
    const approval = {
      id: randomUUID(),
      approvalToken: token(),
      expires: Date.now() + 10 * 60000,
      ...binding,
      path: input.path,
      snapshotId: snapshot.manifest.id,
      payload,
      payloadSha256: hash(payload),
      trustId: this.verifier.trustId,
      destination: this.verifier.profile.endpoint,
      feeUsd: 0,
      queryBase64: this.verifier.query(hash(payload)).toString("base64"),
    };
    const project = this.store.mutate(
      uid,
      id,
      p.revision,
      "timestamp.prepared",
      { ideaId: binding.ideaId, path: input.path },
      (state) => {
        state.timestampApproval = approval;
        state.timestampSelection = {
          ...binding,
          path: input.path,
          trustId: approval.trustId,
        };
        state.pending = null;
      },
    );
    return { project, approval };
  }
  async submit(uid, id, input, signal) {
    this.store.verify(uid, id);
    const p = this.store.project(uid, id),
      a = p.timestampApproval;
    ensure(this.verifier, "Timestamp service is not configured.", 409);
    ensure(
      input.approved === true &&
        a &&
        a.expires > Date.now() &&
        a.id === input.id &&
        a.approvalToken === input.approvalToken &&
        input.payloadSha256 === a.payloadSha256,
      "Timestamp approval expired or changed. Review again.",
      409,
    );
    ensure(
      p.revision === input.revision &&
        !p.archived &&
        this.binding(p).ideaId === a.ideaId &&
        a.trustId === this.verifier.trustId &&
        a.destination === this.verifier.profile.endpoint,
      "Project or authority changed. Review again.",
      409,
    );
    ensure(
      !this.inflight.has(uid) && this.inflight.size < 2,
      "Another timestamp request is in progress.",
      429,
    );
    const day = new Date().toISOString().slice(0, 10);
    const attempts = this.store
      .list(uid)
      .flatMap((x) => this.store.project(uid, x.id).timestampAttempts || []);
    ensure(
      attempts.filter((x) => x.requestedAt?.startsWith(day)).length < 6,
      "Daily timestamp attempt limit reached. No request was sent.",
      429,
    );
    this.inflight.add(uid);
    const attempt = {
      ...a,
      id: randomUUID(),
      requestedAt: new Date().toISOString(),
      status: "submitted",
    };
    delete attempt.approvalToken;
    delete attempt.expires;
    try {
      this.store.mutate(
        uid,
        id,
        p.revision,
        "timestamp.submitted",
        { id: attempt.id, ideaId: a.ideaId },
        (state) => {
          state.timestampApproval = null;
          state.pending = null;
          state.timestampAttempts = [
            ...(state.timestampAttempts || []),
            attempt,
          ];
        },
      );
      const response = await this.fetcher(a.destination, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/timestamp-query",
          Accept: "application/timestamp-reply",
        },
        body: Buffer.from(a.queryBase64, "base64"),
        signal: AbortSignal.any([
          AbortSignal.timeout(this.timeoutMs),
          ...(signal ? [signal] : []),
        ]),
      });
      ensure(
        response.ok,
        "Timestamp authority did not complete the request.",
        502,
      );
      const chunks = [];
      let size = 0;
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 131072) {
          await reader.cancel();
          throw Error("Oversized timestamp");
        }
        chunks.push(Buffer.from(value));
      }
      const proofBase64 = Buffer.concat(chunks).toString("base64");
      const verified = this.verifier.verify({
        digest: a.payloadSha256,
        queryBase64: a.queryBase64,
        proofBase64,
        requestedAt: attempt.requestedAt,
      });
      const result = {
        ...attempt,
        proofBase64,
        verification: verified,
        status: "verified-signed",
      };
      const latest = this.store.project(uid, id);
      return this.store.mutate(
        uid,
        id,
        latest.revision,
        "timestamp.verified",
        { id: attempt.id, ideaId: a.ideaId, proofSha256: verified.proofSha256 },
        (state) => {
          state.timestampResults = [...(state.timestampResults || []), result];
        },
      );
    } catch {
      const latest = this.store.project(uid, id);
      if ((latest.timestampAttempts || []).some((x) => x.id === attempt.id))
        this.store.mutate(
          uid,
          id,
          latest.revision,
          "timestamp.failed",
          { id: attempt.id },
          (state) => {
            state.timestampResults = [
              ...(state.timestampResults || []),
              {
                id: attempt.id,
                ideaId: a.ideaId,
                status: "unverified",
                reason:
                  "No valid receipt was saved. The request may have reached the authority. No automatic retry was made.",
              },
            ];
          },
        );
      throw new InputError(
        "Timestamp could not be verified and saved. AI remains blocked; your idea and draft are unchanged. No automatic retry was made.",
        502,
      );
    } finally {
      this.inflight.delete(uid);
    }
  }
  requireReady(uid, id) {
    const p = this.store.project(uid, id),
      binding = this.binding(p),
      selection = p.timestampSelection;
    ensure(
      this.verifier,
      "Timestamp authority is unavailable. AI remains blocked; private notes remain available.",
      409,
    );
    ensure(
      !p.archived &&
        selection &&
        canonical({
          ...binding,
          path: "signed-first",
          trustId: this.verifier?.trustId,
        }) === canonical(selection),
      "A verified timestamp for the current idea version is required before external AI. Open Timestamp setup.",
      409,
    );
    const result = (p.timestampResults || [])
      .filter(
        (x) =>
          x.status === "verified-signed" &&
          x.ideaId === binding.ideaId &&
          x.ideaCommitment === binding.ideaCommitment &&
          x.trustId === this.verifier.trustId,
      )
      .at(-1);
    ensure(
      result,
      "Timestamp verification is incomplete. Your private notes and edits are still available.",
      409,
    );
    const snapshot = this.store.readSnapshot(uid, id, result.snapshotId);
    ensure(
      snapshot.package.project.ideas.at(-1)?.id === binding.ideaId &&
        snapshot.package.project.ideas.at(-1)?.receipt.commitment ===
          binding.ideaCommitment,
      "Timestamp covers a different idea version.",
      409,
    );
    let verified;
    try {
      verified = this.verifier.verify({
        digest: hash(timestampPayload(snapshot)),
        queryBase64: result.queryBase64,
        proofBase64: result.proofBase64,
        requestedAt: result.requestedAt,
      });
    } catch {
      throw new InputError(
        "Timestamp proof or authority trust could not be verified. AI remains blocked.",
        409,
      );
    }
    return {
      ...binding,
      path: selection.path,
      receiptId: result.id,
      snapshotId: result.snapshotId,
      ...verified,
    };
  }
  status(uid, id) {
    const p = this.store.project(uid, id);
    let proof = null,
      reason = "";
    try {
      proof = this.requireReady(uid, id);
    } catch (e) {
      reason = e.message;
    }
    const idea = p.ideas.at(-1),
      last = (p.timestampAttempts || [])
        .filter((x) => x.ideaId === idea?.id)
        .at(-1);
    const result = (p.timestampResults || []).findLast(
      (x) => x.id === last?.id,
    );
    return {
      ready: !!proof,
      proof,
      reason,
      ideaId: idea?.id || null,
      ideaVersion: p.ideas.length,
      selection: p.timestampSelection || null,
      paths: this.catalog(),
      lastAttempt: last
        ? {
            id: last.id,
            status: result?.status || "unresolved",
            requestedAt: last.requestedAt,
            reason:
              result?.reason ||
              "No completed receipt is recorded. Check before retrying.",
          }
        : null,
    };
  }
  receipt(uid, id, receiptId) {
    const p = this.store.project(uid, id),
      result = (p.timestampResults || []).find(
        (x) => x.id === receiptId && x.status === "verified-signed",
      );
    ensure(result, "Receipt not found.", 404);
    const snapshot = this.store.readSnapshot(uid, id, result.snapshotId);
    let checked;
    try {
      checked = this.verifier?.verify({
        digest: hash(timestampPayload(snapshot)),
        queryBase64: result.queryBase64,
        proofBase64: result.proofBase64,
        requestedAt: result.requestedAt,
      });
    } catch {
      throw new InputError(
        "Receipt cannot currently be reverified. Its preserved proof has not been changed.",
        409,
      );
    }
    ensure(
      checked,
      "Authority is unavailable; no current verification can be claimed.",
      409,
    );
    return {
      schema: "origin-signed-timestamp/1",
      ...result,
      currentVerification: checked,
      payload: timestampPayload(snapshot),
      rootCertificate: this.verifier.profile.root,
      signerCertificate: this.verifier.profile.signer,
      revocationList: this.verifier.profile.crl,
      limits:
        "Signed authority time, not Bitcoin confirmation or proof of ownership. Retain the matching private preserved package separately. New content is not covered by this receipt.",
    };
  }
}
