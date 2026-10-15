import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import {
  canonical,
  hash,
  seal,
  unseal,
  verifyReceipt,
} from "../server/crypto.mjs";
import { secretFindings } from "../server/gateway.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";
import { Monitor } from "../server/monitor.mjs";
import { createServer } from "../server/http.mjs";
import { verifyPackage } from "../scripts/verify-package.mjs";
import { setTimeout as delay } from "node:timers/promises";

async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const u = await store.register({
    username: "researcher",
    name: "Synthetic Researcher",
    password: "Synthetic test password 42!",
  });
  const p = store.create(u.id, {
    title: "Synthetic private concept",
    description: "Tenant boundary test",
  });
  return { store, u, p };
}
const env = {
  ORIGIN_EXTERNAL_AI: "1",
  ORIGIN_OPENAI_KEY: "synthetic-not-a-key",
  ORIGIN_OPENAI_MODEL: "fixture-model",
  ORIGIN_DAILY_REQUEST_LIMIT: "3",
};
function prepare(g, u, p, extra = {}) {
  return g.prepare(u.id, p.id, {
    revision: p.revision,
    provider: "openai",
    threadId: p.threads[0].id,
    content: "Design an offline notebook.",
    mode: "plan",
    artifactIds: [],
    includeHistory: false,
    ...extra,
  });
}
const approve = (r) => ({
  revision: r.project.revision,
  approvalToken: r.preview.approvalToken,
  digest: r.preview.digest,
  approved: true,
});
const success = () =>
  new Response(
    JSON.stringify({
      model: "fixture-model-version",
      output: [
        {
          type: "message",
          content: [
            { type: "output_text", text: "A synthetic provider response." },
          ],
        },
      ],
      usage: { input_tokens: 12, output_tokens: 6 },
    }),
  );

test("AEAD binds encrypted data to its owner and rejects wrong keys/tampering", () => {
  const key = randomBytes(32),
    box = seal(key, { secret: "private concept" }, "owner-a");
  assert.equal(unseal(key, box, "owner-a").secret, "private concept");
  assert.throws(() => unseal(key, box, "owner-b"));
  assert.throws(() => unseal(randomBytes(32), box, "owner-a"));
  const changed = JSON.parse(box);
  changed.data = Buffer.from("tampered").toString("base64");
  assert.throws(() => unseal(key, JSON.stringify(changed), "owner-a"));
});
test("project titles and content are encrypted in the database", async (t) => {
  const { store, u, p } = await fixture(t);
  store.action(u.id, p.id, {
    revision: p.revision,
    action: "idea.record",
    title: "Secret title",
    content: "Confidential battery invention",
    origin: "human",
  });
  const row = store.db.prepare("SELECT * FROM projects").get();
  assert.ok(!row.data.includes("Confidential"));
  assert.ok(!row.data.includes("Synthetic private"));
  assert.ok(!row.wrapped_key.includes("Secret"));
  assert.equal(store.verify(u.id, p.id).records, 1);
});
test("foreign accounts cannot read, mutate, export, or inspect a project", async (t) => {
  const { store, p } = await fixture(t);
  const b = await store.register({
    username: "other",
    name: "Other",
    password: "Another synthetic password",
  });
  assert.deepEqual(store.list(b.id), []);
  for (const op of [
    () => store.project(b.id, p.id),
    () => store.export(b.id, p.id),
    () => store.events(b.id, p.id),
    () =>
      store.action(b.id, p.id, {
        action: "project.archive",
        revision: p.revision,
        archived: true,
      }),
  ])
    assert.throws(op, (e) => e.status === 404);
});
test("immutable records preserve lineage and reject stale edits", async (t) => {
  let { store, u, p } = await fixture(t);
  const r = p.revision;
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "idea.record",
    title: "First",
    content: "Version one",
    origin: "human",
  });
  assert.throws(
    () =>
      store.action(u.id, p.id, {
        revision: r,
        action: "idea.record",
        title: "Stale",
        content: "bad",
        origin: "human",
      }),
    (e) => e.status === 409,
  );
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "idea.record",
    title: "Next",
    content: "Version two",
    origin: "ai-assisted",
  });
  assert.equal(
    p.ideas[1].receipt.manifest.previous,
    p.ideas[0].receipt.commitment,
  );
  assert.ok(verifyReceipt(p.ideas[0].receipt, "Version one"));
  assert.ok(!verifyReceipt(p.ideas[0].receipt, "altered"));
  assert.throws(() => store.db.prepare("UPDATE events SET at='changed'").run());
  assert.equal(verifyPackage(store.export(u.id, p.id)).records, 2);
});
test("altered ciphertext and project state are detected", async (t) => {
  const { store, u, p } = await fixture(t);
  const row = store.row(u.id, p.id);
  const state = store.decode(row);
  state.title = "tampered";
  store.db
    .prepare("UPDATE projects SET data=? WHERE id=?")
    .run(seal(store.key(row), state, `project:${p.id}:${u.id}`), p.id);
  assert.throws(() => store.verify(u.id, p.id), /integrity/);
  assert.equal(new Monitor(store).scan(u.id).findings[0].severity, "critical");
});
test("no configured provider means zero calls", async (t) => {
  const { store, u, p } = await fixture(t);
  let calls = 0;
  const g = new Gateway(store, {
    env: {},
    fetcher: () => {
      calls++;
    },
  });
  assert.throws(() => prepare(g, u, p), /Connect and enable/);
  assert.equal(calls, 0);
  assert.ok(g.catalog().every((p) => !p.enabled));
  assert.ok(g.catalog().every((p) => !("key" in p)));
});
test("prepare uses only explicitly selected context and makes no network call", async (t) => {
  let { store, u, p } = await fixture(t);
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "idea.record",
    title: "Hidden",
    content: "PRIVATE FULL CONCEPT",
    origin: "human",
  });
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "artifact.save",
    name: "selected.md",
    content: "EXPLICIT CONTEXT",
  });
  let calls = 0;
  const g = new Gateway(store, {
    env,
    fetcher: () => {
      calls++;
    },
  });
  let r = prepare(g, u, p, { artifactIds: [p.artifacts[0].id] });
  assert.ok(!canonical(r.preview.request).includes("PRIVATE FULL CONCEPT"));
  assert.ok(canonical(r.preview.request).includes("EXPLICIT CONTEXT"));
  assert.equal(calls, 0);
  assert.equal(r.preview.request.store, false);
});
test("send preserves exact approved request, receipt precedes fetch, and replay is blocked", async (t) => {
  const { store, u, p } = await fixture(t);
  let calls = 0,
    actual;
  const g = new Gateway(store, {
    env,
    fetcher: async (url, options) => {
      calls++;
      actual = JSON.parse(options.body);
      const state = store.project(u.id, p.id);
      assert.equal(state.disclosures[0].status, "attempted");
      assert.ok(state.threads[0].messages[0].receipt);
      return success();
    },
  });
  const r = prepare(g, u, p);
  const result = await g.send(u.id, p.id, approve(r));
  assert.deepEqual(actual, r.preview.request);
  assert.equal(hash(canonical(actual)), r.preview.digest);
  assert.equal(result.disclosures[0].status, "completed");
  assert.equal(result.threads[0].messages[1].receipt.manifest.origin, "ai");
  assert.equal(verifyPackage(store.export(u.id, p.id)).disclosures, 1);
  await assert.rejects(
    () => g.send(u.id, p.id, approve(r)),
    /expired or changed/,
  );
  assert.equal(calls, 1);
});
test("modified or stale disclosure approval cannot send", async (t) => {
  const { store, u, p } = await fixture(t);
  let calls = 0;
  const g = new Gateway(store, {
    env,
    fetcher: () => {
      calls++;
    },
  });
  const r = prepare(g, u, p);
  await assert.rejects(
    () => g.send(u.id, p.id, { ...approve(r), digest: "wrong" }),
    /expired or changed/,
  );
  store.action(u.id, p.id, {
    revision: r.project.revision,
    action: "thread.create",
    title: "Another thread",
  });
  await assert.rejects(() => g.send(u.id, p.id, approve(r)), /Project changed/);
  assert.equal(calls, 0);
});
test("credential detection blocks disclosure without echoing the secret", async (t) => {
  const { store, u, p } = await fixture(t);
  const g = new Gateway(store, { env });
  const secret = "sk-" + "x".repeat(30);
  assert.deepEqual(secretFindings(secret), ["api-key"]);
  assert.throws(
    () => prepare(g, u, p, { content: secret }),
    (e) => e.status === 422 && !e.message.includes(secret),
  );
  assert.equal(store.project(u.id, p.id).disclosures.length, 0);
});
test("credentials after newlines in attached files are blocked before serialization", async (t) => {
  let { store, u, p } = await fixture(t);
  const secret = "sk-" + "x".repeat(30);
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "artifact.save",
    name: "synthetic-test.txt",
    content: `Synthetic fixture\n${secret}`,
  });
  const g = new Gateway(store, { env });
  assert.throws(
    () => prepare(g, u, p, { artifactIds: [p.artifacts[0].id] }),
    (e) => e.status === 422 && !e.message.includes(secret),
  );
  assert.equal(store.project(u.id, p.id).pending, null);
});
for (const [name, fetcher] of [
  [
    "outage",
    async () => {
      throw new Error("private upstream detail");
    },
  ],
  ["malformed", async () => new Response("not json")],
  ["rate limit", async () => new Response("{}", { status: 429 })],
  ["empty output", async () => new Response("{}")],
  [
    "invalid text type",
    async () =>
      Response.json({
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: { unexpected: true } }],
          },
        ],
      }),
  ],
  [
    "timeout",
    async () => {
      throw new DOMException("timeout", "TimeoutError");
    },
  ],
])
  test(`${name} is recorded as uncertain without automatic retry`, async (t) => {
    const { store, u, p } = await fixture(t);
    let calls = 0;
    const g = new Gateway(store, {
      env,
      fetcher: async () => {
        calls++;
        return fetcher();
      },
    });
    const r = prepare(g, u, p);
    await assert.rejects(
      () => g.send(u.id, p.id, approve(r)),
      /No automatic retry/,
    );
    assert.equal(calls, 1);
    const state = store.project(u.id, p.id);
    assert.equal(state.pending, null);
    assert.equal(state.disclosures[0].status, "outcome-unknown");
    assert.equal(store.usage(u.id), 1);
  });
test("daily request cap remains enforced across gateway instances", async (t) => {
  const { store, u, p } = await fixture(t);
  const conf = { ...env, ORIGIN_DAILY_REQUEST_LIMIT: "1" };
  const a = new Gateway(store, { env: conf, fetcher: async () => success() });
  const r = prepare(a, u, p);
  await a.send(u.id, p.id, approve(r));
  const b = new Gateway(store, { env: conf, fetcher: async () => success() });
  const next = prepare(b, u, store.project(u.id, p.id));
  await assert.rejects(
    () => b.send(u.id, p.id, approve(next)),
    /Daily model request limit/,
  );
});
test("AI attribution persists through edits to a saved artifact", async (t) => {
  let { store, u, p } = await fixture(t);
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "artifact.save",
    name: "draft.md",
    content: "AI draft",
    origin: "ai-assisted",
  });
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "artifact.save",
    id: p.artifacts[0].id,
    name: "draft.md",
    content: "Human amended draft",
  });
  assert.equal(
    p.artifacts[0].versions[1].receipt.manifest.origin,
    "ai-assisted",
  );
});
test("reference URLs reject executable schemes and embedded credentials", async (t) => {
  const { store, u, p } = await fixture(t);
  for (const url of [
    "javascript:alert(1)",
    "https://user:password@example.com",
  ])
    assert.throws(() =>
      store.action(u.id, p.id, {
        revision: p.revision,
        action: "reference.add",
        title: "x",
        url,
        notes: "",
      }),
    );
});
test("HTTP enforces authentication, CSRF, origin, and security headers", async (t) => {
  const { store, u, p } = await fixture(t);
  const server = createServer({
    store,
    gateway: new Gateway(store, { env: {} }),
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(
    () =>
      new Promise((r) => {
        server.closeAllConnections();
        server.close(r);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const fetchApi = (path, opts = {}) => fetch(base + path, opts);
  let r = await fetchApi("/api/projects");
  assert.equal(r.status, 401);
  assert.ok(
    r.headers.get("content-security-policy").includes("frame-ancestors 'none'"),
  );
  r = await fetchApi("/api/session", {
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(r.status, 403);
  const s = store.session(u.id);
  const cookie = `origin_session=${s.raw}`;
  r = await fetchApi(`/api/projects/${p.id}/action`, {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      revision: p.revision,
      action: "project.archive",
      archived: true,
    }),
  });
  assert.equal(r.status, 403);
  r = await fetchApi(`/api/projects/${p.id}`, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).title, p.title);
  r = await fetchApi("/api/projects", {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": s.csrf,
    },
    body: JSON.stringify({ title: "Authorized project" }),
  });
  assert.equal(r.status, 201);
});

test("a real elapsed deadline aborts the network signal and releases capacity", async (t) => {
  const { store, u, p } = await fixture(t);
  let aborted = false;
  const g = new Gateway(store, {
    env,
    timeoutMs: 20,
    fetcher: async (_, options) => {
      try {
        await delay(2000, null, { signal: options.signal });
      } catch (e) {
        aborted = options.signal.aborted;
        throw e;
      }
      return success();
    },
  });
  const r = prepare(g, u, p),
    started = Date.now();
  await assert.rejects(
    () => g.send(u.id, p.id, approve(r)),
    /No automatic retry/,
  );
  assert.ok(aborted);
  assert.ok(Date.now() - started < 1500);
  assert.equal(g.inflight.size, 0);
});

test("overlapping attempts by one account cannot create duplicate disclosures", async (t) => {
  const { store, u, p } = await fixture(t);
  let release;
  const g = new Gateway(store, {
    env,
    fetcher: () =>
      new Promise((resolve) => {
        release = () => resolve(success());
      }),
  });
  const r = prepare(g, u, p);
  const first = g.send(u.id, p.id, approve(r));
  await assert.rejects(
    () => g.send(u.id, p.id, approve(r)),
    (e) => e.status === 429,
  );
  assert.equal(store.project(u.id, p.id).disclosures.length, 1);
  release();
  await first;
  assert.equal(store.usage(u.id), 1);
});

test("a provider cannot return unbounded response content", async (t) => {
  const { store, u, p } = await fixture(t);
  const g = new Gateway(store, {
    env,
    fetcher: async () => new Response("x".repeat(1024 * 1024 + 1)),
  });
  const r = prepare(g, u, p);
  await assert.rejects(
    () => g.send(u.id, p.id, approve(r)),
    /No automatic retry/,
  );
  assert.equal(
    store.project(u.id, p.id).disclosures[0].status,
    "outcome-unknown",
  );
});

test("history is opt-in and cannot select context belonging to another project", async (t) => {
  let { store, u, p } = await fixture(t);
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "note.add",
    threadId: p.threads[0].id,
    content: "DO NOT SHARE THIS HISTORY",
  });
  const g = new Gateway(store, { env });
  let r = prepare(g, u, p);
  assert.ok(
    !canonical(r.preview.request).includes("DO NOT SHARE THIS HISTORY"),
  );
  r = prepare(g, u, r.project, { includeHistory: true });
  assert.ok(canonical(r.preview.request).includes("DO NOT SHARE THIS HISTORY"));
  const other = store.create(u.id, { title: "Other project" });
  const updated = store.action(u.id, other.id, {
    revision: other.revision,
    action: "artifact.save",
    name: "secret.md",
    content: "Other project text",
  });
  assert.throws(
    () => prepare(g, u, r.project, { artifactIds: [updated.artifacts[0].id] }),
    (e) => e.status === 404,
  );
});

test("Anthropic adapter uses exact reviewed payload, no automatic tools, and records usage", async (t) => {
  const { store, u, p } = await fixture(t);
  let sent;
  const g = new Gateway(store, {
    env: {
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_ANTHROPIC_KEY: "synthetic-not-a-key",
      ORIGIN_ANTHROPIC_MODEL: "fixture-claude",
    },
    fetcher: async (url, options) => {
      assert.equal(url, "https://api.anthropic.com/v1/messages");
      assert.equal(options.headers["anthropic-version"], "2023-06-01");
      sent = JSON.parse(options.body);
      assert.ok(!sent.tools);
      assert.ok(!sent.messages.some((m) => "cache_control" in m));
      return new Response(
        JSON.stringify({
          model: "fixture-claude",
          content: [{ type: "text", text: "Synthetic Claude response" }],
          usage: { input_tokens: 10, output_tokens: 4 },
        }),
      );
    },
  });
  const r = prepare(g, u, p, { provider: "anthropic" });
  const result = await g.send(u.id, p.id, approve(r));
  assert.deepEqual(sent, r.preview.request);
  assert.equal(result.disclosures[0].usage.inputTokens, 10);
});

test("logout revokes a session and unknown passwords do not authenticate", async (t) => {
  const { store, u } = await fixture(t);
  const s = store.session(u.id);
  assert.equal(store.auth(s.raw).user.id, u.id);
  store.logout(s.raw);
  assert.equal(store.auth(s.raw), null);
  await assert.rejects(
    () => store.login({ username: u.username, password: "Incorrect password" }),
    (e) => e.status === 401,
  );
});

test("a modified export fails independent content verification", async (t) => {
  let { store, u, p } = await fixture(t);
  p = store.action(u.id, p.id, {
    revision: p.revision,
    action: "idea.record",
    title: "Source",
    content: "Original bytes",
    origin: "human",
  });
  const pkg = store.export(u.id, p.id);
  pkg.project.ideas[0].content = "Altered bytes";
  assert.throws(() => verifyPackage(pkg), /verification failed/);
});
