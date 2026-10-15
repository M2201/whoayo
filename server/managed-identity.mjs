import * as oidc from "openid-client";
import { createHash, randomBytes } from "node:crypto";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const fail = () => {
  throw new Error(
    "Managed sign-in failed. Start again; no account was changed.",
  );
};

export function identityConfiguration(env = {}) {
  const mode = env.ORIGIN_IDENTITY_MODE || "off";
  if (mode === "off") return null;
  if (mode !== "cognito") throw new Error("Unsupported identity mode.");
  const region = env.ORIGIN_COGNITO_REGION;
  const pool = env.ORIGIN_COGNITO_POOL_ID;
  const prefix = env.ORIGIN_COGNITO_DOMAIN_PREFIX;
  const clientId = env.ORIGIN_COGNITO_CLIENT_ID;
  const origin = env.ORIGIN_PUBLIC_ORIGIN;
  if (
    !/^(us|eu|ap|ca|sa|me|af|il)-(?:[a-z]+-)+\d$/.test(region || "") ||
    typeof pool !== "string" ||
    !pool.startsWith(`${region}_`) ||
    !/^[a-z0-9-]+_[A-Za-z0-9]+$/.test(pool) ||
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(prefix || "") ||
    !/^[a-z0-9]{1,128}$/.test(clientId || "")
  )
    throw new Error("Incomplete or invalid Cognito configuration.");
  let publicUrl;
  try {
    publicUrl = new URL(origin);
  } catch {
    throw new Error("A public HTTPS origin is required.");
  }
  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.origin !== origin ||
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.port ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(publicUrl.hostname) ||
    publicUrl.hostname.endsWith(".localhost")
  )
    throw new Error(
      "Use a reviewed public HTTPS origin without paths, ports or credentials.",
    );
  return Object.freeze({
    issuer: `https://cognito-idp.${region}.amazonaws.com/${pool}`,
    domain: `https://${prefix}.auth.${region}.amazoncognito.com`,
    clientId,
    callback: `${origin}/api/identity/callback`,
    publicOrigin: origin,
  });
}

// Prepared adapter only: the loopback HTTP app does not enable this automatically.
// A hosted controller must bind browserToken to a Secure/HttpOnly/SameSite=Lax cookie.
// Account linkage must use issuer + subject, never email or a client-supplied user ID.
export class ManagedIdentity {
  #config;
  #settings;
  #pending = new Map();
  #now;
  constructor(env = {}, { fetcher = fetch, now = Date.now } = {}) {
    this.#now = now;
    this.#settings = identityConfiguration(env);
    if (!this.#settings) return;
    const { issuer, domain, clientId } = this.#settings;
    const tokenEndpoint = `${domain}/oauth2/token`;
    const jwks = `${issuer}/.well-known/jwks.json`;
    this.#config = new oidc.Configuration(
      {
        issuer,
        authorization_endpoint: `${domain}/oauth2/authorize`,
        token_endpoint: tokenEndpoint,
        jwks_uri: jwks,
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["none"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: ["S256"],
      },
      clientId,
      { id_token_signed_response_alg: "RS256" },
      oidc.None(),
    );
    this.#config.timeout = 10;
    oidc.enableNonRepudiationChecks(this.#config);
    this.#config[oidc.customFetch] = async (url, options) => {
      if (![tokenEndpoint, jwks].includes(String(url))) fail();
      const response = await fetcher(url, {
        ...options,
        redirect: "error",
        signal: options?.signal
          ? AbortSignal.any([options.signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
      if (response.status >= 300 && response.status < 400) fail();
      // Bound token/JWKS bodies before handing them to the protocol library.
      const reader = response.body?.getReader();
      if (!reader) fail();
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 128 * 1024) {
            await reader.cancel();
            fail();
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      const headers = new Headers(response.headers);
      headers.delete("content-encoding");
      headers.delete("content-length");
      return new Response(Buffer.concat(chunks), {
        status: response.status,
        headers,
      });
    };
  }
  get enabled() {
    return Boolean(this.#config);
  }
  get publicOrigin() {
    return this.#settings?.publicOrigin || null;
  }
  logoutUrl() {
    if (!this.#settings) return null;
    const url = new URL("/logout", this.#settings.domain);
    url.searchParams.set("client_id", this.#settings.clientId);
    url.searchParams.set("logout_uri", this.#settings.publicOrigin);
    return url.href;
  }
  async begin() {
    if (!this.#config) throw new Error("Managed sign-in is not enabled.");
    const now = this.#now();
    for (const [key, value] of this.#pending)
      if (value.expires <= now) this.#pending.delete(key);
    if (this.#pending.size >= 100)
      throw new Error("Sign-in is busy. Try again shortly.");
    const browserToken = randomBytes(32).toString("base64url");
    const verifier = oidc.randomPKCECodeVerifier();
    const state = oidc.randomState();
    const nonce = oidc.randomNonce();
    const challenge = await oidc.calculatePKCECodeChallenge(verifier);
    // Recheck after the async digest so parallel begins cannot exceed the cap.
    if (this.#pending.size >= 100)
      throw new Error("Sign-in is busy. Try again shortly.");
    this.#pending.set(digest(browserToken), {
      verifier,
      state,
      nonce,
      expires: now + 300000,
    });
    const url = oidc.buildAuthorizationUrl(this.#config, {
      response_type: "code",
      redirect_uri: this.#settings.callback,
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return { url: url.href, browserToken, expiresIn: 300 };
  }
  async complete(callback, browserToken) {
    if (!this.#config) throw new Error("Managed sign-in is not enabled.");
    try {
      if (
        typeof browserToken !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(browserToken)
      )
        fail();
      const key = digest(browserToken);
      const pending = this.#pending.get(key);
      this.#pending.delete(key);
      if (!pending || pending.expires <= this.#now()) fail();
      const url = new URL(callback);
      if (
        `${url.origin}${url.pathname}` !== this.#settings.callback ||
        url.hash ||
        url.username ||
        url.password ||
        url.searchParams.getAll("state").length !== 1 ||
        url.searchParams.get("state") !== pending.state ||
        url.searchParams.getAll("code").length !== 1 ||
        !url.searchParams.get("code")
      )
        fail();
      const tokens = await oidc.authorizationCodeGrant(this.#config, url, {
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        pkceCodeVerifier: pending.verifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (
        !claims ||
        claims.token_use !== "id" ||
        claims.email_verified !== true ||
        typeof claims.sub !== "string" ||
        !claims.sub ||
        claims.sub.length > 128 ||
        typeof claims.email !== "string" ||
        claims.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)
      )
        fail();
      // No provider token leaves this boundary. Authentication is not app enrollment.
      return Object.freeze({
        issuer: this.#settings.issuer,
        subject: claims.sub,
        email: claims.email,
        emailVerified: true,
        name: typeof claims.name === "string" ? claims.name.slice(0, 100) : "",
        identityKey: digest(`${this.#settings.issuer}\0${claims.sub}`),
      });
    } catch {
      fail();
    }
  }
}
