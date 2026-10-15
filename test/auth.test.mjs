import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { Store, InputError } from "../server/store.mjs";
import { Gateway } from "../server/gateway.mjs";
import { createServer } from "../server/http.mjs";

const account = {
  name: "Synthetic owner",
  username: "owner",
  password: "Synthetic-login-only-42!",
};
function fixture(t) {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  return store;
}
test("existing username syntax and case normalization remain compatible", async (t) => {
  const store = fixture(t);
  const user = await store.register({
    ...account,
    username: " Owner_One.2-test ",
  });
  assert.equal(user.username, "owner_one.2-test");
  assert.equal(
    (await store.login({ ...account, username: "OWNER_ONE.2-TEST" })).id,
    user.id,
  );
});
test("email login names retain plus tags and dots without asserting verified identity", async (t) => {
  const store = fixture(t);
  const email = "Origin.QA+One@example.invalid";
  const user = await store.register({ ...account, username: email });
  assert.equal(user.username, email.toLowerCase());
  assert.equal(
    (await store.login({ ...account, username: ` ${email} ` })).id,
    user.id,
  );
  const other = await store.register({
    ...account,
    username: "origin.qa@example.invalid",
  });
  assert.notEqual(other.id, user.id);
  assert.equal(user.emailVerified, undefined);
});
test("long email identifiers work up to the 254 character boundary", async (t) => {
  const store = fixture(t);
  const email = `${"a".repeat(64)}@${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(61)}`;
  assert.equal(email.length, 254);
  const user = await store.register({ ...account, username: email });
  assert.equal(
    (await store.login({ ...account, username: email })).id,
    user.id,
  );
  await assert.rejects(
    () => store.register({ ...account, username: `${email}e` }),
    { field: "username" },
  );
});
test("registration rejects malformed identifiers with username-specific errors", async (t) => {
  const store = fixture(t);
  for (const username of [
    null,
    "",
    "ab",
    "a".repeat(61),
    "two words",
    "a@@example.invalid",
    "a@example",
    ".a@example.invalid",
    "a..b@example.invalid",
    "a@-example.invalid",
    "a@exam_ple.invalid",
    "a".repeat(65) + "@example.invalid",
  ]) {
    await assert.rejects(
      () => store.register({ ...account, username }),
      (error) => error instanceof InputError && error.field === "username",
    );
  }
  assert.equal(store.db.prepare("SELECT count(*) AS n FROM users").get().n, 0);
});
test("name and password errors are distinct; passwords are not trimmed or given composition rules", async (t) => {
  const store = fixture(t);
  await assert.rejects(() => store.register({ ...account, name: " " }), {
    field: "name",
  });
  for (const password of [null, "", "a".repeat(11), "a".repeat(257)])
    await assert.rejects(() => store.register({ ...account, password }), {
      field: "password",
    });
  const password = " twelvecharacters ";
  await store.register({ ...account, password });
  await store.login({ ...account, password });
  await assert.rejects(
    () => store.login({ ...account, password: password.trim() }),
    { status: 401 },
  );
});
test("duplicate registration cannot reset a password or change existing evidence or sessions", async (t) => {
  const store = fixture(t);
  const user = await store.register({
    ...account,
    username: "owner@example.invalid",
  });
  const session = store.session(user.id);
  const project = store.create(user.id, {
    title: "Synthetic evidence",
    description: "Unchanged",
  });
  const evidenceRows = () =>
    ["projects", "events", "snapshots", "timestamp_submissions"].map((table) =>
      store.db.prepare(`SELECT * FROM ${table}`).all(),
    );
  const before = evidenceRows();
  const credentialsBefore = store.db
    .prepare("SELECT salt,password FROM users WHERE id=?")
    .get(user.id);
  await assert.rejects(
    () =>
      store.register({
        ...account,
        username: "OWNER@example.invalid",
        password: "Different-synthetic-password",
      }),
    { status: 409, field: "username" },
  );
  assert.deepEqual(evidenceRows(), before);
  assert.equal(store.verify(user.id, project.id).ok, true);
  assert.deepEqual(
    store.db.prepare("SELECT salt,password FROM users WHERE id=?").get(user.id),
    credentialsBefore,
  );
  assert.equal(store.auth(session.raw).user.id, user.id);
  assert.equal(
    (await store.login({ ...account, username: user.username })).id,
    user.id,
  );
});
test("unknown-account and wrong-password sign-in failures are indistinguishable", async (t) => {
  const store = fixture(t);
  await store.register(account);
  const errors = [];
  for (const username of [account.username, "unknown@example.invalid"]) {
    try {
      await store.login({ username, password: "Wrong-synthetic-password" });
    } catch (e) {
      errors.push({ message: e.message, status: e.status, field: e.field });
    }
  }
  assert.equal(errors.length, 2);
  assert.deepEqual(errors[0], errors[1]);
  assert.equal(errors[0].field, undefined);
});
test("HTTP auth identifies invalid fields, preserves cookie protections and exposes no reset bypass", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
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
  const post = (path, body, origin = base) =>
    fetch(`${base}/api${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  let response = await post("/register", { ...account, username: "not valid" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).field, "username");
  response = await post("/register", { ...account, password: "short" });
  assert.equal((await response.json()).field, "password");
  response = await post("/register", {
    ...account,
    username: "owner@example.invalid",
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  for (const flag of ["HttpOnly", "SameSite=Strict", "Max-Age=28800"])
    assert.ok(cookie.includes(flag));
  response = await post("/login", {
    ...account,
    username: "owner@example.invalid",
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.username, "owner@example.invalid");
  assert.equal(body.user.password, undefined);
  assert.equal(
    (await post("/login", account, "https://example.invalid")).status,
    403,
  );
  assert.equal(
    (
      await post("/reset-password", {
        username: "owner@example.invalid",
        password: "New-password-42!",
      })
    ).status,
    401,
  );
  assert.equal(
    (await store.login({ ...account, username: "owner@example.invalid" })).id,
    body.user.id,
  );
});
