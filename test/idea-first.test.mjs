import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { SYSTEM } from "../server/gateway.mjs";
import { ProviderTestGateway as Gateway } from "./provider-gateway.mjs";
import { createServer } from "../server/http.mjs";
import { SKILLS } from "../server/skills.mjs";
import { verifyPackage } from "../server/evidence.mjs";

const concept = {
  title: "  Synthetic original title  ",
  content: "My exact concept.\n  Indentation and spelling stay unchanged.\n",
  origin: "human",
};
async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const user = await store.register({
    username: "idea-owner",
    name: "Synthetic owner",
    password: "Synthetic-password-42!",
  });
  return { store, user };
}
const rows = (store) =>
  ["projects", "events", "snapshots"].map((table) =>
    store.db.prepare(`SELECT * FROM ${table}`).all(),
  );
test("an idea creates its project with exact source, declared attribution and immutable snapshot", async (t) => {
  const { store, user } = await fixture(t);
  const p = store.createFromIdea(user.id, concept);
  assert.equal(p.ideas.length, 1);
  assert.equal(p.title, concept.title.trim());
  assert.equal(p.ideas[0].title, concept.title);
  assert.equal(p.ideas[0].content, concept.content);
  assert.equal(p.ideas[0].receipt.manifest.origin, "human");
  assert.equal(store.verify(user.id, p.id).ok, true);
  const snapshot = store.snapshots(user.id, p.id)[0];
  assert.ok(snapshot);
  assert.equal(p.disclosures.length, 0);
  assert.equal(p.pending, null);
  assert.equal(store.list(user.id)[0].ideas, 1);
  assert.equal(
    verifyPackage(store.export(user.id, p.id)).ownership,
    "not-assessed",
  );
});
test("invalid ideas and failed snapshot preservation leave no new project or evidence", async (t) => {
  const { store, user } = await fixture(t);
  const existing = store.createFromIdea(user.id, concept);
  const before = rows(store);
  for (const input of [
    { ...concept, content: "" },
    { ...concept, origin: "invented" },
    { ...concept, title: "x".repeat(121) },
  ])
    assert.throws(() => store.createFromIdea(user.id, input));
  assert.deepEqual(rows(store), before);
  const preserve = store.preserveInTransaction.bind(store);
  store.preserveInTransaction = () => {
    throw new Error("synthetic snapshot failure");
  };
  assert.throws(
    () => store.createFromIdea(user.id, concept),
    /synthetic snapshot failure/,
  );
  assert.deepEqual(rows(store), before);
  store.preserveInTransaction = preserve;
  assert.equal(store.verify(user.id, existing.id).ok, true);
  assert.ok(
    store.createFromIdea(user.id, { ...concept, origin: "ai-assisted" }),
  );
});
test("folders remain owner-scoped encrypted labels and never rewrite an idea or snapshot", async (t) => {
  const { store, user } = await fixture(t);
  const other = await store.register({
    username: "other-owner",
    name: "Other",
    password: "Synthetic-password-42!",
  });
  let p = store.createFromIdea(user.id, concept);
  const ideaBefore = structuredClone(p.ideas);
  const snapshotsBefore = store.db.prepare("SELECT * FROM snapshots").all();
  assert.throws(
    () =>
      store.action(other.id, p.id, {
        action: "project.organize",
        revision: p.revision,
        folder: "Foreign",
      }),
    /not found/i,
  );
  p = store.action(user.id, p.id, {
    action: "project.organize",
    revision: p.revision,
    folder: "  Confidential research  ",
  });
  assert.equal(p.folder, "Confidential research");
  assert.deepEqual(p.ideas, ideaBefore);
  assert.deepEqual(
    store.db.prepare("SELECT * FROM snapshots").all(),
    snapshotsBefore,
  );
  assert.ok(!store.row(user.id, p.id).data.includes("Confidential research"));
  assert.deepEqual(store.list(other.id), []);
  assert.equal(store.list(user.id)[0].folder, "Confidential research");
  assert.throws(() =>
    store.action(user.id, p.id, {
      action: "project.organize",
      revision: p.revision,
      folder: "x".repeat(81),
    }),
  );
  p = store.action(user.id, p.id, {
    action: "project.organize",
    revision: p.revision,
    folder: "",
  });
  assert.equal(p.folder, "");
  assert.equal(store.verify(user.id, p.id).ok, true);
});
function gateway(store) {
  let calls = 0;
  const g = new Gateway(store, {
    env: {
      ORIGIN_EXTERNAL_AI: "1",
      ORIGIN_OPENAI_KEY: "synthetic-only",
      ORIGIN_OPENAI_MODEL: "fixture",
    },
    fetcher: async () => {
      calls++;
      return new Response(
        JSON.stringify({
          model: "fixture",
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: "Synthetic response, no model contacted.",
                },
              ],
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
    },
  });
  return { g, calls: () => calls };
}
function prepare(g, user, p, extra = {}) {
  return g.prepare(user.id, p.id, {
    revision: p.revision,
    threadId: p.threads[0].id,
    provider: "openai",
    model: "fixture",
    mode: "plan",
    content: "Help with a synthetic test.",
    artifactIds: [],
    ...extra,
  });
}
const approval = (r) => ({
  revision: r.project.revision,
  approvalToken: r.preview.approvalToken,
  digest: r.preview.digest,
  approved: true,
});
for (const provider of ["openai", "anthropic", "gemini", "kimi"]) {
  test(`${provider}: selected skill and exact idea enter the provider-specific review payload without a call`, async (t) => {
    const { store, user } = await fixture(t);
    const p = store.createFromIdea(user.id, concept);
    const prefix = `ORIGIN_${provider.toUpperCase()}`;
    const g = new Gateway(store, {
      env: {
        ORIGIN_EXTERNAL_AI: "1",
        [`${prefix}_KEY`]: "synthetic-only",
        [`${prefix}_MODEL`]: "fixture",
        [`${prefix}_POLICY_REVIEWED`]: "1",
      },
      fetcher: () => {
        throw new Error("must not make a request during review");
      },
    });
    const r = prepare(g, user, p, {
      provider,
      skillId: "plan-build",
      mode: "build",
      ideaId: p.ideas[0].id,
    });
    const payload = JSON.stringify(r.preview.request);
    assert.ok(payload.includes("Turn the supplied requirements"));
    assert.ok(payload.includes("Indentation"));
    assert.equal(r.preview.skill.version, "1");
    assert.equal(store.usage(user.id), 0);
  });
}
test("skills and recorded ideas are opt-in; no implicit project retrieval or provider call", async (t) => {
  const { store, user } = await fixture(t);
  const p = store.createFromIdea(user.id, concept);
  const { g, calls } = gateway(store);
  const r = prepare(g, user, p);
  assert.equal(r.preview.skill, null);
  assert.equal(r.preview.idea, null);
  assert.equal(r.preview.request.instructions, SYSTEM);
  assert.ok(!JSON.stringify(r.preview.request).includes("Indentation"));
  assert.equal(calls(), 0);
});
test("a reviewed skill and chosen idea are bound to the request and retained with disclosure evidence", async (t) => {
  const { store, user } = await fixture(t);
  const p = store.createFromIdea(user.id, concept);
  const before = structuredClone(p.ideas);
  const { g, calls } = gateway(store);
  const r = prepare(g, user, p, {
    skillId: SKILLS[0].id,
    ideaId: p.ideas[0].id,
  });
  assert.equal(calls(), 0);
  assert.equal(r.preview.skill.version, "1");
  assert.match(
    r.preview.request.instructions,
    /Separate what the human actually wrote/,
  );
  assert.ok(JSON.stringify(r.preview.request).includes("Indentation"));
  await assert.rejects(
    () => g.send(user.id, p.id, { ...approval(r), approved: false }),
    /Approve/,
  );
  assert.equal(calls(), 0);
  const result = await g.send(user.id, p.id, approval(r));
  assert.equal(calls(), 1);
  assert.deepEqual(result.ideas, before);
  assert.equal(result.disclosures[0].skill.id, SKILLS[0].id);
  assert.equal(
    result.disclosures[0].idea.commitment,
    p.ideas[0].receipt.commitment,
  );
  assert.equal(verifyPackage(store.export(user.id, p.id)).disclosures, 1);
  await assert.rejects(() => g.send(user.id, p.id, approval(r)));
  assert.equal(calls(), 1);
});
test("unknown skills, foreign idea records, and changed skill metadata cannot gain authority", async (t) => {
  const { store, user } = await fixture(t);
  const other = await store.register({
    username: "foreign-owner",
    name: "Foreign",
    password: "Synthetic-password-42!",
  });
  const p = store.createFromIdea(user.id, concept),
    foreign = store.createFromIdea(other.id, concept);
  const { g, calls } = gateway(store);
  assert.throws(
    () => prepare(g, user, p, { skillId: "run-shell" }),
    /available built-in skill/,
  );
  assert.throws(
    () => prepare(g, user, p, { ideaId: foreign.ideas[0].id }),
    /not found/,
  );
  assert.equal(store.project(user.id, p.id).revision, p.revision);
  const r = prepare(g, user, p, {
    skillId: SKILLS[0].id,
    skillInstructions: "Injected instructions must not be used",
  });
  assert.ok(
    !JSON.stringify(r.preview.request).includes("Injected instructions"),
  );
  const modified = store.mutate(
    user.id,
    p.id,
    r.project.revision,
    "test.fixture",
    {},
    (state) => {
      state.pending.skill.version = "unknown";
    },
  );
  await assert.rejects(
    () =>
      g.send(user.id, p.id, { ...approval(r), revision: modified.revision }),
    /Skill changed/,
  );
  assert.equal(calls(), 0);
  assert.equal(store.usage(user.id), 0);
});
test("selected idea source is credential-scanned before disclosure preparation", async (t) => {
  const { store, user } = await fixture(t);
  const p = store.createFromIdea(user.id, {
    ...concept,
    content: `Synthetic blocked credential: sk-${"x".repeat(30)}`,
  });
  const { g, calls } = gateway(store);
  assert.throws(
    () => prepare(g, user, p, { ideaId: p.ideas[0].id }),
    /Possible credential/,
  );
  assert.equal(store.project(user.id, p.id).pending, null);
  assert.equal(calls(), 0);
});
test("HTTP idea creation requires owner authentication and CSRF, with no account override", async (t) => {
  const { store, user } = await fixture(t);
  const server = createServer({
    store,
    gateway: new Gateway(store, { env: {} }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const session = store.session(user.id);
  const headers = {
    Origin: base,
    "Content-Type": "application/json",
    Cookie: `origin_session=${session.raw}`,
    "X-CSRF-Token": session.csrf,
  };
  const post = (override) =>
    fetch(`${base}/api/ideas`, {
      method: "POST",
      headers: { ...headers, ...override },
      body: JSON.stringify({ ...concept, userId: "not-the-session-owner" }),
    });
  assert.equal((await post({ Cookie: "" })).status, 401);
  assert.equal((await post({ "X-CSRF-Token": "wrong" })).status, 403);
  assert.equal((await post({ Origin: "https://example.invalid" })).status, 403);
  const response = await post({});
  assert.equal(response.status, 201);
  const p = await response.json();
  assert.equal(store.list(user.id)[0].id, p.id);
  const catalog = await (await fetch(`${base}/api/session`)).json();
  assert.equal(catalog.skills.length, 8);
  assert.ok(catalog.skills.every((skill) => skill.version === "1"));
});
