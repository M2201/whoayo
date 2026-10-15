import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { syntheticAuthority } from "./timestamp-authority.mjs";
import {
  TimestampVerifier,
  authorityFromEnv,
} from "../server/timestamp-verifier.mjs";
import { Timestamps } from "../server/timestamps.mjs";
import { Store } from "../server/store.mjs";
import { Gateway } from "../server/gateway.mjs";
import { createServer } from "../server/http.mjs";
import { hash } from "../server/crypto.mjs";

const env = {
  ORIGIN_EXTERNAL_AI: "1",
  ORIGIN_OPENAI_KEY: "synthetic-fixture-not-a-key",
  ORIGIN_OPENAI_MODEL: "OFFLINE-FIXTURE",
};
async function setup(t, options = {}) {
  const authority = syntheticAuthority();
  t.after(() => authority.close());
  const verifier = new TimestampVerifier(authority.profile);
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    name: "Synthetic owner",
    username: "ts-owner",
    password: "Synthetic-ts-password-42!",
  });
  const project = store.createFromIdea(user.id, {
    title: "Synthetic water trial",
    content:
      "Private invented mechanism. Never disclose this text to a timestamp authority.",
    origin: "human",
  });
  const counts = { timestamps: 0, models: 0 };
  const timestamps = new Timestamps(store, {
    verifier,
    timeoutMs: 30,
    ...options,
    fetcher:
      options.fetcher ||
      (async (url, input) => {
        counts.timestamps++;
        assert.equal(url, authority.profile.endpoint);
        assert.ok(!input.body.includes(Buffer.from(project.ideas[0].content)));
        return new Response(authority.respond(input.body), {
          headers: { "Content-Type": "application/timestamp-reply" },
        });
      }),
  });
  const gateway = new Gateway(store, {
    env,
    timestamps,
    fetcher: async () => {
      counts.models++;
      return new Response(
        JSON.stringify({
          model: "OFFLINE-FIXTURE",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "SYNTHETIC RESPONSE" }],
            },
          ],
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
      );
    },
  });
  return {
    authority,
    verifier,
    store,
    user,
    project,
    counts,
    timestamps,
    gateway,
  };
}
function prepareTimestamp(f) {
  const p = f.store.project(f.user.id, f.project.id);
  return f.timestamps.prepare(f.user.id, p.id, {
    revision: p.revision,
    ideaId: p.ideas.at(-1).id,
    path: "signed-first",
  });
}
async function stamp(f) {
  const { approval: a, project: p } = prepareTimestamp(f);
  return f.timestamps.submit(f.user.id, p.id, {
    id: a.id,
    approvalToken: a.approvalToken,
    payloadSha256: a.payloadSha256,
    approved: true,
    revision: p.revision,
  });
}
function modelInput(p, extra = {}) {
  return {
    revision: p.revision,
    threadId: p.threads[0].id,
    content: "Plan a test",
    mode: "plan",
    provider: "openai",
    model: "OFFLINE-FIXTURE",
    artifactIds: [],
    includeHistory: false,
    ...extra,
  };
}

test("real RFC3161 cryptography validates nonce, exact imprint, signer, chain and current CRL", (t) => {
  const a = syntheticAuthority();
  t.after(() => a.close());
  const v = new TimestampVerifier(a.profile),
    digest = hash("synthetic fingerprint"),
    query = v.query(digest),
    proof = a.respond(query);
  const input = {
    digest,
    queryBase64: query.toString("base64"),
    proofBase64: proof.toString("base64"),
    requestedAt: new Date().toISOString(),
  };
  const result = v.verify(input);
  assert.equal(result.synthetic, true);
  assert.equal(result.bitcoinVerified, false);
  assert.throws(() =>
    v.verify({ ...input, digest: hash("different content") }),
  );
  assert.throws(() =>
    v.verify({ ...input, queryBase64: v.query(digest).toString("base64") }),
  );
  assert.throws(() =>
    v.verify({
      ...input,
      proofBase64: Buffer.from("malformed").toString("base64"),
    }),
  );
  assert.throws(() =>
    v.verify({ ...input, requestedAt: "2000-01-01T00:00:00Z" }),
  );
  assert.throws(
    () => new TimestampVerifier({ ...a.profile, signerPin: "0".repeat(64) }),
  );
  assert.throws(() => new TimestampVerifier({ ...a.profile, crl: a.revoke() }));
  assert.equal(authorityFromEnv({}), null);
});
test("missing timestamp blocks model preparation, direct send, omitted idea and skills with zero calls or budget", async (t) => {
  const f = await setup(t),
    p = f.project;
  for (const extra of [
    {},
    { ideaId: p.ideas[0].id },
    { skillId: "plan-build", mode: "build" },
  ])
    assert.throws(
      () => f.gateway.prepare(f.user.id, p.id, modelInput(p, extra)),
      /timestamp/i,
    );
  await assert.rejects(
    f.gateway.send(f.user.id, p.id, { approved: true }),
    /approval/i,
  );
  assert.deepEqual(f.counts, { timestamps: 0, models: 0 });
  assert.equal(f.store.usage(f.user.id), 0);
});
test("approved fingerprint produces a downloadable verified signed receipt, unlocks same version only", async (t) => {
  const f = await setup(t),
    original = f.project.ideas[0];
  await stamp(f);
  const state = f.timestamps.status(f.user.id, f.project.id);
  assert.equal(state.ready, true);
  assert.equal(state.proof.synthetic, true);
  const bundle = f.timestamps.receipt(
    f.user.id,
    f.project.id,
    state.proof.receiptId,
  );
  assert.equal(
    bundle.currentVerification.proofSha256,
    hash(Buffer.from(bundle.proofBase64, "base64")),
  );
  assert.equal(bundle.bitcoinVerified, undefined);
  assert.equal(bundle.verification.bitcoinVerified, false);
  const p = f.store.project(f.user.id, f.project.id);
  assert.deepEqual(p.ideas[0], original);
  const prepared = f.gateway.prepare(f.user.id, p.id, modelInput(p));
  assert.equal(prepared.preview.timestamp.ideaId, original.id);
  assert.equal(f.counts.models, 0);
  const newer = f.store.action(f.user.id, p.id, {
    action: "idea.record",
    title: "Changed",
    content: "A different mechanism requiring new proof.",
    origin: "human",
    revision: prepared.project.revision,
  });
  assert.equal(f.timestamps.status(f.user.id, p.id).ready, false);
  assert.throws(
    () => f.gateway.prepare(f.user.id, p.id, modelInput(newer)),
    /timestamp/i,
  );
  await assert.rejects(
    f.gateway.send(f.user.id, p.id, {
      approved: true,
      revision: newer.revision,
      approvalToken: prepared.preview.approvalToken,
      digest: prepared.preview.digest,
    }),
    /timestamp/i,
  );
  assert.equal(f.counts.models, 0);
  assert.equal(f.store.usage(f.user.id), 0);
});
test("choice change clears stale AI approval; unavailable Bitcoin and unknown paths cannot downgrade", async (t) => {
  const f = await setup(t);
  await stamp(f);
  const p = f.store.project(f.user.id, f.project.id);
  for (const path of ["bitcoin-first", "skip", "unknown"])
    assert.throws(
      () =>
        f.timestamps.prepare(f.user.id, p.id, {
          revision: p.revision,
          ideaId: p.ideas[0].id,
          path,
        }),
      /unavailable/,
    );
  const prepared = f.gateway.prepare(f.user.id, p.id, modelInput(p));
  prepareTimestamp(f);
  await assert.rejects(
    f.gateway.send(f.user.id, p.id, {
      approved: true,
      revision: prepared.project.revision,
      approvalToken: prepared.preview.approvalToken,
      digest: prepared.preview.digest,
    }),
    /approval/,
  );
  assert.equal(f.counts.models, 0);
});
test("wrong owner, stale revision, replay and client verified flags cannot authorize a receipt", async (t) => {
  const f = await setup(t),
    other = await f.store.register({
      name: "Other",
      username: "other-ts",
      password: "Another-synthetic-pass-42!",
    });
  assert.throws(() => f.timestamps.status(other.id, f.project.id));
  const { approval: a, project: p } = prepareTimestamp(f);
  await assert.rejects(
    f.timestamps.submit(other.id, p.id, {
      ...a,
      approved: true,
      revision: p.revision,
    }),
  );
  await assert.rejects(
    f.timestamps.submit(f.user.id, p.id, {
      ...a,
      approved: true,
      revision: p.revision - 1,
    }),
  );
  assert.equal(f.counts.timestamps, 0);
  await f.timestamps.submit(f.user.id, p.id, {
    ...a,
    approved: true,
    revision: p.revision,
    status: "verified-bitcoin",
    bitcoinVerified: true,
  });
  assert.equal(
    f.timestamps.status(f.user.id, p.id).proof.bitcoinVerified,
    false,
  );
  await assert.rejects(
    f.timestamps.submit(f.user.id, p.id, {
      ...a,
      approved: true,
      revision: f.store.project(f.user.id, p.id).revision,
    }),
  );
  assert.equal(f.counts.timestamps, 1);
});
for (const fault of ["malformed", "rate-limit", "outage", "timeout"])
  test(`${fault} preserves idea and records failure without model access or automatic retry`, async (t) => {
    let calls = 0;
    const f = await setup(t, {
      fetcher: async (url, request) => {
        calls++;
        if (fault === "outage") throw Error("offline");
        if (fault === "timeout")
          return new Promise((resolve, reject) =>
            request.signal.addEventListener(
              "abort",
              () => reject(request.signal.reason),
              { once: true },
            ),
          );
        return new Response("invalid", {
          status: fault === "rate-limit" ? 429 : 200,
        });
      },
    });
    // Keep the process alive while exercising AbortSignal.timeout's unref timer.
    const keepAlive = setTimeout(() => {}, 1000);
    t.after(() => clearTimeout(keepAlive));
    await assert.rejects(stamp(f), /could not be verified/);
    const status = f.timestamps.status(f.user.id, f.project.id);
    assert.equal(status.ready, false);
    assert.equal(status.lastAttempt.status, "unverified");
    assert.deepEqual(
      f.store.project(f.user.id, f.project.id).ideas,
      f.project.ideas,
    );
    assert.equal(calls, 1);
    assert.equal(f.counts.models, 0);
  });
test("current proof must be revalidated at send time before AI budget or network use", async (t) => {
  const f = await setup(t);
  await stamp(f);
  const p = f.store.project(f.user.id, f.project.id),
    prepared = f.gateway.prepare(f.user.id, p.id, modelInput(p));
  f.timestamps.verifier = null;
  await assert.rejects(
    f.gateway.send(f.user.id, p.id, {
      revision: prepared.project.revision,
      approvalToken: prepared.preview.approvalToken,
      digest: prepared.preview.digest,
      approved: true,
    }),
    /timestamp/i,
  );
  assert.equal(f.store.usage(f.user.id), 0);
  assert.equal(f.counts.models, 0);
});
test("HTTP timestamp methods enforce owner, CSRF, method and do not accept uploaded verification flags", async (t) => {
  const f = await setup(t),
    s = f.store.session(f.user.id),
    server = createServer({ store: f.store, gateway: f.gateway });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((r) => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`,
    url = `${base}/api/projects/${f.project.id}/timestamp-prepare`;
  const body = JSON.stringify({
    revision: f.project.revision,
    ideaId: f.project.ideas[0].id,
    path: "signed-first",
    verified: true,
  });
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body,
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: `origin_session=${s.raw}`,
          "Content-Type": "application/json",
        },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(url, { headers: { Cookie: `origin_session=${s.raw}` } }))
      .status,
    405,
  );
  assert.equal(f.counts.timestamps, 0);
});

test("verified receipt survives service recreation and permits exactly one approved model call", async (t) => {
  const f = await setup(t);
  await stamp(f);
  const restarted = new Timestamps(f.store, {
    verifier: new TimestampVerifier(f.authority.profile),
    fetcher: () => {
      throw Error("Unexpected repeat request");
    },
  });
  assert.equal(restarted.status(f.user.id, f.project.id).ready, true);
  f.gateway.timestamps = restarted;
  const p = f.store.project(f.user.id, f.project.id),
    prepared = f.gateway.prepare(f.user.id, p.id, modelInput(p));
  const input = {
    revision: prepared.project.revision,
    approvalToken: prepared.preview.approvalToken,
    digest: prepared.preview.digest,
    approved: true,
  };
  const completed = await f.gateway.send(f.user.id, p.id, input);
  assert.match(
    completed.threads[0].messages.at(-1).content,
    /SYNTHETIC RESPONSE/,
  );
  assert.equal(completed.disclosures.at(-1).timestamp.ideaId, p.ideas[0].id);
  await assert.rejects(f.gateway.send(f.user.id, p.id, input));
  assert.deepEqual(f.counts, { timestamps: 1, models: 1 });
});

test("proof corruption and a Bitcoin-only choice cannot reuse a signed receipt", async (t) => {
  const f = await setup(t);
  await stamp(f);
  let p = f.store.project(f.user.id, f.project.id);
  p = f.store.mutate(
    f.user.id,
    p.id,
    p.revision,
    "test.bitcoin",
    {},
    (state) => {
      state.timestampSelection.path = "bitcoin-first";
    },
  );
  assert.equal(f.timestamps.status(f.user.id, p.id).ready, false);
  p = f.store.mutate(
    f.user.id,
    p.id,
    p.revision,
    "test.corrupt",
    {},
    (state) => {
      state.timestampSelection.path = "signed-first";
      const bytes = Buffer.from(
        state.timestampResults[0].proofBase64,
        "base64",
      );
      bytes[bytes.length - 10] ^= 1;
      state.timestampResults[0].proofBase64 = bytes.toString("base64");
    },
  );
  assert.equal(f.timestamps.status(f.user.id, p.id).ready, false);
  assert.throws(
    () => f.timestamps.receipt(f.user.id, p.id, p.timestampResults[0].id),
    /reverified/,
  );
  assert.equal(f.counts.models, 0);
});

test("failure to durably save a valid proof cannot unlock AI", async (t) => {
  const f = await setup(t),
    mutate = f.store.mutate.bind(f.store);
  f.store.mutate = (uid, id, revision, type, ...rest) => {
    if (type === "timestamp.verified") throw Error("Synthetic disk failure");
    return mutate(uid, id, revision, type, ...rest);
  };
  await assert.rejects(stamp(f), /could not be verified and saved/);
  assert.equal(f.timestamps.status(f.user.id, f.project.id).ready, false);
  assert.equal(
    f.timestamps.status(f.user.id, f.project.id).lastAttempt.status,
    "unverified",
  );
  assert.deepEqual(f.counts, { timestamps: 1, models: 0 });
});

test("concurrent and daily excess submissions are blocked before network", async (t) => {
  const f = await setup(t),
    { approval: a, project: p } = prepareTimestamp(f);
  const input = { ...a, approved: true, revision: p.revision };
  f.timestamps.inflight.add(f.user.id);
  await assert.rejects(
    f.timestamps.submit(f.user.id, p.id, input),
    /in progress/,
  );
  f.timestamps.inflight.clear();
  const changed = f.store.mutate(
    f.user.id,
    p.id,
    p.revision,
    "test.daily",
    {},
    (state) => {
      state.timestampAttempts = Array.from({ length: 6 }, () => ({
        requestedAt: new Date().toISOString(),
      }));
    },
  );
  await assert.rejects(
    f.timestamps.submit(f.user.id, p.id, {
      ...input,
      revision: changed.revision,
    }),
    /Daily timestamp/,
  );
  assert.equal(f.counts.timestamps, 0);
});
