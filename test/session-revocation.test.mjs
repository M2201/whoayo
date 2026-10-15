import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { Store } from "../server/store.mjs";
import { Gateway } from "../server/gateway.mjs";
import { createServer } from "../server/http.mjs";

const password = "Synthetic-session-test-only-42!";
async function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  const alice = await store.register({
    username: "alice",
    name: "Alice fixture",
    password,
  });
  const bob = await store.register({
    username: "bob",
    name: "Bob fixture",
    password,
  });
  const a = store.session(alice.id),
    a2 = store.session(alice.id),
    b = store.session(bob.id);
  const server = createServer({
    store,
    gateway: new Gateway(store, { env: {} }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = (session) => ({
    Origin: base,
    "Content-Type": "application/json",
    Cookie: `origin_session=${session.raw}`,
    "X-CSRF-Token": session.csrf,
  });
  const post = (session, body, override = {}) =>
    fetch(`${base}/api/sessions/revoke-all`, {
      method: "POST",
      headers: { ...headers(session), ...override },
      body: JSON.stringify(body),
    });
  return { store, alice, bob, a, a2, b, base, headers, post };
}
test("revoke-all requires current password and CSRF, ends only this account's sessions", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (await f.post(f.a, { password }, { "X-CSRF-Token": "wrong" })).status,
    403,
  );
  assert.equal(
    (await f.post(f.a, { password: "not-the-password" })).status,
    401,
  );
  assert.ok(f.store.auth(f.a.raw));
  assert.ok(f.store.auth(f.a2.raw));
  assert.ok(f.store.auth(f.b.raw));
  const response = await f.post(f.a, { password, userId: f.bob.id });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, revoked: 2 });
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal(f.store.auth(f.a.raw), null);
  assert.equal(f.store.auth(f.a2.raw), null);
  assert.equal(f.store.auth(f.b.raw).user.id, f.bob.id);
  assert.equal((await f.post(f.a, { password })).status, 401);
  assert.equal(
    (await fetch(`${f.base}/api/projects`, { headers: f.headers(f.a2) }))
      .status,
    401,
  );
  assert.equal(
    (await fetch(`${f.base}/api/projects`, { headers: f.headers(f.b) })).status,
    200,
  );
  const signedIn = await f.store.login({ username: "alice", password });
  assert.equal(
    f.store.auth(f.store.session(signedIn.id).raw).user.id,
    f.alice.id,
  );
});
test("revoke-all rejects anonymous, cross-origin, wrong-method and repeated password guesses", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post({ raw: "", csrf: "" }, { password })).status, 401);
  assert.equal(
    (await f.post(f.a, { password }, { Origin: "https://example.invalid" }))
      .status,
    403,
  );
  assert.equal(
    (
      await fetch(`${f.base}/api/sessions/revoke-all`, {
        headers: f.headers(f.a),
      })
    ).status,
    404,
  );
  for (let i = 0; i < 5; i++)
    assert.equal((await f.post(f.a, { password: "wrong" })).status, 401);
  assert.equal((await f.post(f.a, { password })).status, 429);
  assert.ok(f.store.auth(f.a.raw));
  assert.ok(f.store.auth(f.b.raw));
});
test("revocation rechecks the session after asynchronous password verification", async (t) => {
  const f = await fixture(t);
  const derive = f.store.credentials.bind(f.store);
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  f.store.credentials = async (...args) => {
    await gate;
    return derive(...args);
  };
  const attempt = f.store.revokeSessions(f.a.raw, password);
  const rejected = assert.rejects(attempt, /Sign in/);
  f.store.logout(f.a.raw);
  release();
  await rejected;
  assert.ok(f.store.auth(f.a2.raw));
  assert.ok(f.store.auth(f.b.raw));
});
test("a body begun before revocation cannot mutate after sessions are revoked", async (t) => {
  const f = await fixture(t);
  const request = http.request(`${f.base}/api/projects`, {
    method: "POST",
    headers: f.headers(f.a2),
  });
  const result = new Promise((resolve, reject) => {
    request.on("response", (response) => {
      response.resume();
      response.on("end", () => resolve(response.statusCode));
    });
    request.on("error", reject);
  });
  request.write('{"title":');
  await new Promise((r) => setTimeout(r, 30));
  assert.equal((await f.post(f.a, { password })).status, 200);
  request.end('"Must not be created"}');
  assert.equal(await result, 401);
  assert.equal(f.store.list(f.alice.id).length, 0);
});
