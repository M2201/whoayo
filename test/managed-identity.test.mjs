import test from "node:test";
import assert from "node:assert/strict";
import {
  generateKeyPairSync,
  sign,
  createHash,
  randomBytes,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import {
  ManagedIdentity,
  identityConfiguration,
} from "../server/managed-identity.mjs";
import { Store } from "../server/store.mjs";
import { Gateway } from "../server/gateway.mjs";
import { createServer } from "../server/http.mjs";

const env = {
  ORIGIN_IDENTITY_MODE: "cognito",
  ORIGIN_COGNITO_REGION: "us-east-2",
  ORIGIN_COGNITO_POOL_ID: "us-east-2_Synthetic",
  ORIGIN_COGNITO_DOMAIN_PREFIX: "origin-synthetic",
  ORIGIN_COGNITO_CLIENT_ID: "syntheticclient",
  ORIGIN_PUBLIC_ORIGIN: "https://origin.example",
};
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const wrongKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
const encode = (v) => Buffer.from(JSON.stringify(v)).toString("base64url");
const jwt = (claims, key = privateKey) => {
  const message = `${encode({ alg: "RS256", kid: "synthetic", typ: "JWT" })}.${encode(claims)}`;
  return `${message}.${sign("RSA-SHA256", Buffer.from(message), key).toString("base64url")}`;
};
const response = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function setup(overrides = {}, options = {}) {
  const calls = [];
  let claims;
  let key = options.key || privateKey;
  const settings = identityConfiguration(env);
  const identity = new ManagedIdentity(env, {
    now: options.now,
    fetcher: async (url, opts) => {
      calls.push({ url: String(url), options: opts });
      assert.equal(opts.redirect, "error");
      assert.ok(opts.signal instanceof AbortSignal);
      if (options.error)
        throw new Error("Synthetic upstream secret must not escape");
      if (options.oversized) return new Response("x".repeat(129 * 1024));
      if (options.redirect)
        return new Response(null, {
          status: 302,
          headers: { Location: "https://attacker.example" },
        });
      if (options.malformed)
        return new Response("{bad json", {
          headers: { "Content-Type": "application/json" },
        });
      if (String(url).endsWith("/.well-known/jwks.json"))
        return response({
          keys: [
            {
              ...publicKey.export({ format: "jwk" }),
              kid: "synthetic",
              use: "sig",
              alg: "RS256",
            },
          ],
        });
      assert.equal(String(url), `${settings.domain}/oauth2/token`);
      assert.equal(opts.body.get("grant_type"), "authorization_code");
      assert.equal(opts.body.get("redirect_uri"), settings.callback);
      assert.equal(
        createHash("sha256")
          .update(opts.body.get("code_verifier"))
          .digest("base64url"),
        authorization.searchParams.get("code_challenge"),
      );
      return response({
        access_token: "synthetic-only",
        token_type: "Bearer",
        expires_in: 900,
        id_token: jwt(claims, key),
      });
    },
  });
  const start = await identity.begin();
  const authorization = new URL(start.url);
  const now = Math.floor(Date.now() / 1000);
  claims = {
    iss: settings.issuer,
    aud: env.ORIGIN_COGNITO_CLIENT_ID,
    sub: "synthetic-subject",
    iat: now,
    exp: now + 900,
    nonce: authorization.searchParams.get("nonce"),
    email: "test@example.invalid",
    email_verified: true,
    token_use: "id",
    name: "Synthetic Person",
    ...overrides,
  };
  const callback = new URL(settings.callback);
  callback.searchParams.set("code", "synthetic-code");
  callback.searchParams.set("state", authorization.searchParams.get("state"));
  return { identity, start, authorization, callback, calls };
}

test("managed identity is off by default with zero network requests", async () => {
  let calls = 0;
  const a = new ManagedIdentity(
    {},
    {
      fetcher: async () => {
        calls++;
        throw Error();
      },
    },
  );
  assert.equal(a.enabled, false);
  await assert.rejects(a.begin(), /not enabled/);
  await assert.rejects(
    a.complete("https://example.invalid", "none"),
    /not enabled/,
  );
  assert.equal(calls, 0);
});
test("managed identity rejects partial or unsafe configuration", () => {
  for (const replacement of [
    { ORIGIN_IDENTITY_MODE: "unknown" },
    { ORIGIN_COGNITO_REGION: "" },
    { ORIGIN_COGNITO_POOL_ID: "eu-west-1_Other" },
    { ORIGIN_COGNITO_DOMAIN_PREFIX: "a.example/x" },
    { ORIGIN_PUBLIC_ORIGIN: "http://origin.example" },
    { ORIGIN_PUBLIC_ORIGIN: "https://origin.example/" },
    { ORIGIN_PUBLIC_ORIGIN: "https://user@origin.example" },
    { ORIGIN_PUBLIC_ORIGIN: "https://127.0.0.1" },
  ])
    assert.throws(() => new ManagedIdentity({ ...env, ...replacement }));
});
test("PKCE code flow verifies a signed ID token and returns no provider tokens", async () => {
  const f = await setup();
  assert.equal(f.calls.length, 0);
  assert.equal(f.authorization.searchParams.get("response_type"), "code");
  assert.equal(
    f.authorization.searchParams.get("code_challenge_method"),
    "S256",
  );
  const user = await f.identity.complete(f.callback, f.start.browserToken);
  assert.equal(user.emailVerified, true);
  assert.equal(user.subject, "synthetic-subject");
  assert.match(user.identityKey, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(user).sort(), [
    "email",
    "emailVerified",
    "identityKey",
    "issuer",
    "name",
    "subject",
  ]);
  assert.equal(f.calls.length, 2);
  assert.equal(
    f.identity.logoutUrl(),
    "https://origin-synthetic.auth.us-east-2.amazoncognito.com/logout?client_id=syntheticclient&logout_uri=https%3A%2F%2Forigin.example",
  );
  await assert.rejects(
    f.identity.complete(f.callback, f.start.browserToken),
    /Managed sign-in failed/,
  );
  assert.equal(f.calls.length, 2);
});
test("callback rejects wrong browser, state, destination and duplicate parameters before network", async () => {
  for (const kind of [
    "browser",
    "state",
    "destination",
    "duplicate",
    "fragment",
  ]) {
    const f = await setup();
    let token = f.start.browserToken;
    if (kind === "browser") token = "x".repeat(43);
    if (kind === "state") f.callback.searchParams.set("state", "wrong");
    if (kind === "destination") f.callback.hostname = "attacker.example";
    if (kind === "duplicate") f.callback.searchParams.append("state", "other");
    if (kind === "fragment") f.callback.hash = "leak";
    await assert.rejects(
      f.identity.complete(f.callback, token),
      /Managed sign-in failed/,
    );
    assert.equal(f.calls.length, 0);
  }
});
test("transactions expire and restart never restores pending sign-in authority", async () => {
  let now = Date.now();
  const f = await setup({}, { now: () => now });
  now += 300001;
  await assert.rejects(f.identity.complete(f.callback, f.start.browserToken));
  assert.equal(f.calls.length, 0);
  const fresh = new ManagedIdentity(env, {
    fetcher: async () => {
      throw Error("No network allowed");
    },
  });
  await assert.rejects(fresh.complete(f.callback, f.start.browserToken));
});
test("signature, issuer, audience, nonce, expiry and verified-email requirements fail closed", async () => {
  for (const override of [
    { iss: "https://wrong.example" },
    { aud: "wrong" },
    { nonce: "wrong" },
    { exp: 1 },
    { email_verified: false },
    { email_verified: "true" },
    { email: "" },
    { token_use: "access" },
    { sub: "" },
  ]) {
    const f = await setup(override);
    await assert.rejects(
      f.identity.complete(f.callback, f.start.browserToken),
      /Managed sign-in failed/,
    );
  }
  const f = await setup({}, { key: wrongKey });
  await assert.rejects(
    f.identity.complete(f.callback, f.start.browserToken),
    /Managed sign-in failed/,
  );
});
test("outages, malformed bodies, oversized bodies and redirects have sanitized errors", async () => {
  for (const option of ["error", "malformed", "oversized", "redirect"]) {
    const f = await setup({}, { [option]: true });
    await assert.rejects(
      f.identity.complete(f.callback, f.start.browserToken),
      {
        message: "Managed sign-in failed. Start again; no account was changed.",
      },
    );
    assert.equal(f.calls.length, 1);
  }
});
test("same email does not mean same account: identity keys bind issuer and subject", async () => {
  const a = await setup({ sub: "one" });
  const b = await setup({ sub: "two" });
  const u = await a.identity.complete(a.callback, a.start.browserToken);
  const v = await b.identity.complete(b.callback, b.start.browserToken);
  assert.equal(u.email, v.email);
  assert.notEqual(u.identityKey, v.identityKey);
});
test("pending authentication concurrency is bounded", async () => {
  const a = new ManagedIdentity(env);
  const results = await Promise.allSettled(
    Array.from({ length: 110 }, () => a.begin()),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 100);
});
test("managed identity mapping is stable and never links accounts by email", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  t.after(() => store.close());
  const local = await store.register({
    username: "same@example.invalid",
    name: "Local person",
    password: "Synthetic-local-password-42!",
  });
  const first = store.managedAccount({
    issuer: "https://issuer.example/pool",
    subject: "subject-one",
    email: "same@example.invalid",
    emailVerified: true,
    name: "Managed person",
    identityKey: createHash("sha256")
      .update("https://issuer.example/pool\0subject-one")
      .digest("hex"),
  });
  const repeated = store.managedAccount({
    issuer: "https://issuer.example/pool",
    subject: "subject-one",
    email: "updated@example.invalid",
    emailVerified: true,
    name: "Updated managed person",
    identityKey: createHash("sha256")
      .update("https://issuer.example/pool\0subject-one")
      .digest("hex"),
  });
  const second = store.managedAccount({
    issuer: "https://issuer.example/pool",
    subject: "subject-two",
    email: "same@example.invalid",
    emailVerified: true,
    name: "Another managed person",
    identityKey: createHash("sha256")
      .update("https://issuer.example/pool\0subject-two")
      .digest("hex"),
  });
  assert.notEqual(first.id, local.id);
  assert.equal(repeated.id, first.id);
  assert.notEqual(second.id, first.id);
  assert.equal(repeated.username, "updated@example.invalid");
  assert.equal(repeated.authentication, "managed");
  assert.equal(local.authentication, "local");
  const stored = store.db
    .prepare("SELECT data FROM managed_identities ORDER BY identity_key")
    .all()
    .map((row) => row.data)
    .join("\n");
  assert.ok(!stored.includes("subject-one"));
  assert.ok(!stored.includes("updated@example.invalid"));
  const session = store.session(first.id);
  assert.equal(store.revokeManagedSessions(session.raw), 1);
  assert.equal(store.auth(session.raw), null);
});
test("HTTP invited sign-in uses pre-auth CSRF, secure account mapping and one-use callback state", async (t) => {
  const store = new Store(":memory:", randomBytes(32));
  const identityKey = createHash("sha256")
    .update("https://issuer.example/pool\0synthetic-subject")
    .digest("hex");
  let completes = 0;
  const identity = {
    enabled: true,
    publicOrigin: null,
    async begin() {
      return {
        url: "https://login.example/authorize?synthetic=1",
        browserToken: "b".repeat(43),
        expiresIn: 300,
      };
    },
    async complete(callback, browserToken) {
      completes++;
      assert.equal(new URL(callback).pathname, "/api/identity/callback");
      assert.equal(browserToken, "b".repeat(43));
      if (completes > 1) throw new Error("Synthetic replay rejected");
      return {
        issuer: "https://issuer.example/pool",
        subject: "synthetic-subject",
        email: "invited@example.invalid",
        emailVerified: true,
        name: "Invited synthetic person",
        identityKey,
      };
    },
    logoutUrl() {
      return "https://login.example/logout";
    },
  };
  const server = createServer({
    store,
    identity,
    secureCookies: true,
    gateway: new Gateway(store, { env: {} }),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  let response = await fetch(`${base}/api/session`);
  const initial = await response.json();
  assert.equal(initial.identity.enabled, true);
  assert.equal(initial.localRegistration, false);
  assert.equal(initial.deployment, "local-development");
  assert.match(initial.loginCsrf, /^[0-9a-f]{64}$/);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  const csrfCookie = response.headers.get("set-cookie").split(";")[0];
  response = await fetch(`${base}/api/identity/start`, {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: csrfCookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/identity/start`, {
    method: "POST",
    headers: {
      Origin: base,
      Cookie: csrfCookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": initial.loginCsrf,
    },
    body: "{}",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).redirect.startsWith("https://"), true);
  assert.match(response.headers.get("set-cookie"), /; Secure/);
  const identityCookie = response.headers.get("set-cookie").split(";")[0];
  response = await fetch(`${base}/api/identity/callback?code=synthetic`, {
    headers: {
      Cookie: identityCookie,
      "Sec-Fetch-Site": "cross-site",
    },
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  const sessionCookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("origin_session="))
    .split(";")[0];
  response = await fetch(`${base}/api/session`, {
    headers: { Cookie: sessionCookie },
  });
  const session = await response.json();
  assert.equal(session.user.authentication, "managed");
  assert.equal(session.user.username, "invited@example.invalid");
  response = await fetch(`${base}/api/register`, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: "open@example.invalid",
      name: "Not invited",
      password: "Synthetic-password-42!",
    }),
  });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/identity/callback?code=replay`, {
    headers: { Cookie: identityCookie },
    redirect: "manual",
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/?identity=failed");
});
test("identity infrastructure is invited-only, retained, email-recoverable and MFA protected", () => {
  const spec = JSON.parse(
    readFileSync(new URL("../infra/identity.cfn.json", import.meta.url)),
  );
  const pool = spec.Resources.UserPool;
  assert.equal(pool.DeletionPolicy, "Retain");
  assert.equal(pool.Properties.DeletionProtection, "ACTIVE");
  assert.equal(
    pool.Properties.AdminCreateUserConfig.AllowAdminCreateUserOnly,
    true,
  );
  assert.equal(pool.Properties.MfaConfiguration, "ON");
  assert.deepEqual(pool.Properties.EnabledMfas, ["SOFTWARE_TOKEN_MFA"]);
  assert.deepEqual(pool.Properties.AccountRecoverySetting.RecoveryMechanisms, [
    { Name: "verified_email", Priority: 1 },
  ]);
  assert.deepEqual(spec.Resources.WebClient.Properties.AllowedOAuthFlows, [
    "code",
  ]);
  assert.equal(
    spec.Resources.WebClient.Properties.PreventUserExistenceErrors,
    "ENABLED",
  );
  assert.equal(spec.Parameters.PublicOrigin.Default, undefined);
});
