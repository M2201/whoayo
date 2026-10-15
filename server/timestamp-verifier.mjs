import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, canonical } from "./crypto.mjs";

const hex = (v) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const fingerprint = (cert) =>
  cert.fingerprint256.replaceAll(":", "").toLowerCase();
function boundedPem(path) {
  const bytes = readFileSync(path);
  if (bytes.length > 131072) throw Error("Oversized authority material");
  return bytes.toString("utf8");
}

export function authorityFromEnv(env = process.env) {
  if (env.ORIGIN_TSA_ENABLED !== "1" || env.ORIGIN_TSA_POLICY_REVIEWED !== "1")
    return null;
  try {
    const profile = {
      name: "FreeTSA",
      endpoint: "https://freetsa.org/tsr",
      feeUsd: 0,
      root: boundedPem(env.ORIGIN_TSA_ROOT_FILE),
      signer: boundedPem(env.ORIGIN_TSA_SIGNER_FILE),
      crl: boundedPem(env.ORIGIN_TSA_CRL_FILE),
      rootPin: env.ORIGIN_TSA_ROOT_SHA256,
      signerPin: env.ORIGIN_TSA_SIGNER_SHA256,
      policy: env.ORIGIN_TSA_POLICY_OID,
      openssl: env.ORIGIN_OPENSSL_PATH,
      synthetic: false,
    };
    if (!profile.openssl?.startsWith("/")) return null;
    return new TimestampVerifier(profile);
  } catch {
    return null;
  }
}

export class TimestampVerifier {
  constructor(profile) {
    this.profile = Object.freeze({ ...profile });
    const root = new X509Certificate(profile.root),
      signer = new X509Certificate(profile.signer);
    if (
      !hex(profile.rootPin) ||
      !hex(profile.signerPin) ||
      fingerprint(root) !== profile.rootPin ||
      fingerprint(signer) !== profile.signerPin ||
      !root.ca ||
      !signer.verify(root.publicKey) ||
      !/^\d+(\.\d+)+$/.test(profile.policy) ||
      !profile.crl.includes("BEGIN X509 CRL")
    )
      throw Error("Unreviewed timestamp authority");
    this.trustId = hash(
      canonical({
        root: profile.rootPin,
        signer: profile.signerPin,
        policy: profile.policy,
        synthetic: !!profile.synthetic,
      }),
    );
    this.withFiles((dir, run) => {
      run([
        "verify",
        "-purpose",
        "timestampsign",
        "-CAfile",
        join(dir, "root.pem"),
        "-CRLfile",
        join(dir, "crl.pem"),
        "-crl_check",
        join(dir, "signer.pem"),
      ]);
    });
  }
  withFiles(fn) {
    const dir = mkdtempSync(join(tmpdir(), "origin-ts-"));
    const write = (name, data) =>
      writeFileSync(join(dir, name), data, { mode: 0o600 });
    const run = (args) =>
      execFileSync(this.profile.openssl, args, {
        timeout: 4000,
        maxBuffer: 512 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          PATH: process.env.PATH,
          LC_ALL: "C",
          OPENSSL_CONF: join(dir, "openssl.cnf"),
        },
      });
    try {
      write("openssl.cnf", "# Isolated timestamp verification configuration\n");
      write("root.pem", this.profile.root);
      write("signer.pem", this.profile.signer);
      write("crl.pem", this.profile.crl);
      write("trust.pem", this.profile.root + "\n" + this.profile.crl);
      return fn(dir, run, write);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  query(digest) {
    if (!hex(digest)) throw Error("Invalid timestamp fingerprint");
    return this.withFiles((dir, run) =>
      run([
        "ts",
        "-query",
        "-digest",
        digest,
        "-sha256",
        "-cert",
        "-tspolicy",
        this.profile.policy,
      ]),
    );
  }
  verify({ digest, queryBase64, proofBase64, requestedAt }) {
    if (!hex(digest) || !Number.isFinite(Date.parse(requestedAt)))
      throw Error("Invalid timestamp binding");
    for (const value of [queryBase64, proofBase64])
      if (
        typeof value !== "string" ||
        value.length > 180000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
      )
        throw Error("Invalid timestamp proof bytes");
    return this.withFiles((dir, run, write) => {
      write("query.tsq", Buffer.from(queryBase64, "base64"));
      write("proof.tsr", Buffer.from(proofBase64, "base64"));
      const trust = [
        "-CAfile",
        join(dir, "trust.pem"),
        "-untrusted",
        join(dir, "signer.pem"),
        "-crl_check",
      ];
      run([
        "ts",
        "-verify",
        "-in",
        join(dir, "proof.tsr"),
        "-queryfile",
        join(dir, "query.tsq"),
        ...trust,
      ]);
      run([
        "ts",
        "-verify",
        "-in",
        join(dir, "proof.tsr"),
        "-digest",
        digest,
        ...trust,
      ]);
      run([
        "ts",
        "-reply",
        "-in",
        join(dir, "proof.tsr"),
        "-token_out",
        "-out",
        join(dir, "token.der"),
      ]);
      // Pin the actual CMS signer, not merely a certificate bundled in the response.
      run([
        "cms",
        "-verify",
        "-binary",
        "-inform",
        "DER",
        "-in",
        join(dir, "token.der"),
        "-CAfile",
        join(dir, "trust.pem"),
        "-purpose",
        "timestampsign",
        "-crl_check",
        "-signer",
        join(dir, "actual.pem"),
        "-out",
        join(dir, "content.der"),
      ]);
      const actual = readFileSync(join(dir, "actual.pem"), "utf8");
      if (
        (actual.match(/BEGIN CERTIFICATE/g) || []).length !== 1 ||
        fingerprint(new X509Certificate(actual)) !== this.profile.signerPin
      )
        throw Error("Wrong timestamp signer");
      const info = run([
        "ts",
        "-reply",
        "-in",
        join(dir, "proof.tsr"),
        "-text",
      ]).toString("utf8");
      const policy = info.match(/^Policy OID: (.+)$/m)?.[1]?.trim();
      const time = Date.parse(info.match(/^Time stamp: (.+)$/m)?.[1] || "");
      if (
        policy !== this.profile.policy ||
        !Number.isFinite(time) ||
        Math.abs(time - Date.parse(requestedAt)) > 5 * 60000
      )
        throw Error("Timestamp time or policy mismatch");
      return {
        protocol: "rfc3161",
        authority: this.profile.name,
        authorityTime: new Date(time).toISOString(),
        accuracy:
          info.match(/^Accuracy: (.+)$/m)?.[1]?.trim() || "Not specified",
        policy,
        trustId: this.trustId,
        rootSha256: this.profile.rootPin,
        signerSha256: this.profile.signerPin,
        proofSha256: hash(Buffer.from(proofBase64, "base64")),
        payloadSha256: digest,
        checkedAt: new Date().toISOString(),
        synthetic: !!this.profile.synthetic,
        bitcoinVerified: false,
      };
    });
  }
}
