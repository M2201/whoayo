import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import {
  LocalDescriptionReviewer,
  checklistReview,
  validateModelReview,
  criteria,
} from "../server/description-review.mjs";
import { Store } from "../server/store.mjs";
import { createServer } from "../server/http.mjs";

const model = "synthetic:local",
  digest = "a".repeat(64);
const env = {
  ORIGIN_LOCAL_REVIEW: "1",
  ORIGIN_LOCAL_REVIEW_OFFLINE_CONFIRMED: "1",
  ORIGIN_LOCAL_REVIEW_MODEL: model,
  ORIGIN_LOCAL_REVIEW_DIGEST: digest,
};
const draft = {
  title: "Synthetic research record",
  content:
    "Researchers have a problem. Inputs become outputs. Unlike alternatives, this is private. For example, a test fails. A prototype is an assumption. Human authored; AI assistance disclosed.",
  consent: true,
};
const valid = () => ({
  checks: criteria.map((c) => ({
    id: c.id,
    status: "needs-detail",
    quote: "Researchers have a problem.",
  })),
});
const inventory = () => ({
  models: [{ name: model, digest, size: 1234, details: { format: "gguf" } }],
});
const response = (body) => new Response(JSON.stringify(body));
function adapter(overrides = {}) {
  const calls = [];
  const reviewer = new LocalDescriptionReviewer({
    env,
    fetcher: async (url, opts) => {
      calls.push({ url, opts });
      return url.endsWith("tags")
        ? response(inventory())
        : response({
            model,
            done: true,
            message: { content: JSON.stringify(valid()) },
          });
    },
    ...overrides,
  });
  return { reviewer, calls };
}

test("checklist is deterministic, explicitly not AI, and never a legal score", () => {
  const result = checklistReview(draft);
  assert.equal(result.method, "local-rules-not-ai");
  assert.equal(result.checks.length, 6);
  assert.ok(result.checks.every((c) => c.status === "mention-found"));
  assert.equal(result.score, undefined);
  assert.match(result.scope, /No originality/);
  assert.notEqual(
    checklistReview({ ...draft, content: draft.content + "!" }).draftSha256,
    result.draftSha256,
  );
  assert.ok(
    checklistReview({ title: "Brief", content: "A thing." }).checks.every(
      (c) => c.status === "check-needed",
    ),
  );
  assert.throws(() => checklistReview({ title: "", content: "x" }));
});

test("disabled, unconfirmed, cloud, and unpinned models make zero requests", async () => {
  for (const config of [
    {},
    { ...env, ORIGIN_LOCAL_REVIEW_OFFLINE_CONFIRMED: "0" },
    { ...env, ORIGIN_LOCAL_REVIEW_MODEL: "model:cloud" },
    { ...env, ORIGIN_LOCAL_REVIEW_DIGEST: "" },
  ]) {
    const { reviewer, calls } = adapter({ env: config });
    assert.equal(reviewer.catalog().configured, false);
    await assert.rejects(reviewer.review(draft), /not configured/);
    assert.equal(calls.length, 0);
  }
});

test("local review requires consent, exact pinned weights, bounded draft, and no redirects or tools", async () => {
  const { reviewer, calls } = adapter();
  await assert.rejects(
    reviewer.review({ ...draft, consent: false }),
    /Confirm/,
  );
  await assert.rejects(
    reviewer.review({ ...draft, content: "x".repeat(12001) }),
    /12,000/,
  );
  assert.equal(calls.length, 0);
  const result = await reviewer.review(draft);
  assert.equal(result.method, "local-model-advisory");
  assert.equal(result.modelDigest, digest);
  assert.equal(calls.length, 2);
  assert.ok(
    calls.every(
      (c) =>
        c.url.startsWith("http://127.0.0.1:11434/api/") &&
        c.opts.redirect === "error",
    ),
  );
  const sent = JSON.parse(calls[1].opts.body);
  assert.equal(sent.stream, false);
  assert.equal(sent.tools, undefined);
  assert.match(sent.messages[0].content, /untrusted evidence/);
  assert.deepEqual(JSON.parse(sent.messages[1].content), {
    untrustedDescription: draft.content,
  });
});

test("changed weights or remote models fail before transmitting private content", async () => {
  for (const changes of [
    { digest: "b".repeat(64) },
    { remote_host: "https://example.com" },
    { size: 0 },
    { details: { format: "remote" } },
  ]) {
    const calls = [];
    const { reviewer } = adapter({
      fetcher: async (url, opts) => {
        calls.push({ url, opts });
        const data = inventory();
        Object.assign(data.models[0], changes);
        return response(data);
      },
    });
    await assert.rejects(reviewer.review(draft), /No description was sent/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].opts.body, undefined);
  }
});

test("model output rejects hallucinated quotes, duplicate criteria, invented verdicts, and malformed status", () => {
  for (const modify of [
    (v) => (v.checks[0].quote = "invented quotation"),
    (v) => (v.checks[1].id = v.checks[0].id),
    (v) => (v.verdict = "legally protected"),
    (v) => (v.checks[0].status = "defensible"),
    (v) => (v.checks[0].status = "not-found"),
  ]) {
    const value = valid();
    modify(value);
    assert.throws(() => validateModelReview(value, draft.content));
  }
  const absent = {
    checks: criteria.map((c) => ({ id: c.id, status: "not-found", quote: "" })),
  };
  assert.equal(validateModelReview(absent, draft.content).length, 6);
});

test("outage and malformed responses do not retry or expose response bodies", async () => {
  for (const fail of [
    () => {
      throw new Error("private backend details");
    },
    () => new Response("secret error", { status: 503 }),
    () => new Response("malformed"),
  ]) {
    let calls = 0;
    const { reviewer } = adapter({
      fetcher: async () => {
        calls++;
        return fail();
      },
    });
    await assert.rejects(
      reviewer.review(draft),
      (error) => !/secret|private backend/.test(error.message),
    );
    assert.equal(calls, 1);
    assert.equal(reviewer.active, false);
  }
});

test("timeout cancels the request and concurrent reviews are bounded", async () => {
  let calls = 0;
  const { reviewer } = adapter({
    timeoutMs: 20,
    fetcher: (url, opts) => {
      calls++;
      return new Promise((resolve, reject) => {
        const abort = () => reject(new Error("aborted"));
        if (opts.signal.aborted) abort();
        else opts.signal.addEventListener("abort", abort, { once: true });
      });
    },
  });
  const pending = reviewer.review(draft);
  await assert.rejects(reviewer.review(draft), (e) => e.status === 429);
  await assert.rejects(pending, (e) => e.status === 504);
  assert.equal(calls, 1);
  assert.equal(reviewer.active, false);
});

test("oversized, incomplete, wrong-model, and tool-call outputs fail closed", async () => {
  for (const output of [
    "x".repeat(262145),
    { done: false },
    { model: "other", done: true },
    { model, done: true, message: { tool_calls: [{}] } },
    { model, done: true, done_reason: "length" },
  ]) {
    const { reviewer } = adapter({
      fetcher: async (url) =>
        url.endsWith("tags")
          ? response(inventory())
          : typeof output === "string"
            ? new Response(output)
            : response(output),
    });
    await assert.rejects(reviewer.review(draft));
    assert.equal(reviewer.active, false);
  }
});

test("review HTTP enforces account, CSRF, revision and method without changing records", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  const user = await store.register({
    username: "review-test",
    name: "Synthetic",
    password: "Synthetic-password-123!",
  });
  const project = store.create(user.id, { title: "Synthetic project" });
  const original = store.export(user.id, project.id);
  const { reviewer, calls } = adapter();
  const server = createServer({ store, reviewer });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    server.closeAllConnections();
    store.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = `${origin}/api/projects/${project.id}/description-review`;
  const session = store.session(user.id);
  const headers = {
    Cookie: `origin_session=${session.raw}`,
    Origin: origin,
    "Content-Type": "application/json",
    "X-CSRF-Token": session.csrf,
  };
  const body = JSON.stringify({
    ...draft,
    revision: project.revision,
    mode: "checklist",
  });
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers })).status, 405);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: { ...headers, "X-CSRF-Token": "bad" },
        body,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...draft, revision: -1, mode: "model" }),
      })
    ).status,
    409,
  );
  const other = await store.register({
    username: "other-review",
    name: "Other",
    password: "Synthetic-password-123!",
  });
  const otherSession = store.session(other.id);
  assert.equal(
    (
      await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          Cookie: `origin_session=${otherSession.raw}`,
          "X-CSRF-Token": otherSession.csrf,
        },
        body,
      })
    ).status,
    404,
  );
  const result = await fetch(url, { method: "POST", headers, body });
  assert.equal(result.status, 200);
  assert.equal((await result.json()).method, "local-rules-not-ai");
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(calls.length, 0);
  const after = store.export(user.id, project.id);
  assert.deepEqual(after.project, original.project);
  assert.deepEqual(after.events, original.events);
  assert.equal(after.integrity.head, original.integrity.head);
  assert.equal(
    (await fetch(origin + "/api/local-review", { headers })).status,
    200,
  );
});
