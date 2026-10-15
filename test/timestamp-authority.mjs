import { execFileSync } from "node:child_process";
import { X509Certificate, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Ephemeral, offline test PKI. These certificates must never be trusted by a live service.
export function syntheticAuthority() {
  const dir = mkdtempSync(join(tmpdir(), "origin-synthetic-tsa-"));
  const openssl = process.env.ORIGIN_OPENSSL_PATH || "openssl";
  const path = (name) => join(dir, name);
  const write = (name, value) =>
    writeFileSync(path(name), value, { mode: 0o600 });
  const run = (args) =>
    execFileSync(openssl, args, {
      timeout: 10000,
      maxBuffer: 524288,
      stdio: ["ignore", "pipe", "pipe"],
    });
  try {
    run([
      "req",
      "-x509",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
      "-nodes",
      "-keyout",
      path("root.key"),
      "-out",
      path("root.pem"),
      "-subj",
      `/CN=Origin Synthetic Root ${randomUUID()}`,
      "-days",
      "2",
      "-addext",
      "basicConstraints=critical,CA:TRUE",
      "-addext",
      "keyUsage=critical,keyCertSign,cRLSign",
    ]);
    run([
      "req",
      "-new",
      "-newkey",
      "ec",
      "-pkeyopt",
      "ec_paramgen_curve:P-256",
      "-nodes",
      "-keyout",
      path("signer.key"),
      "-out",
      path("signer.csr"),
      "-subj",
      "/CN=Synthetic Timestamp Authority",
    ]);
    write(
      "signer.ext",
      "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,timeStamping\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid:always\n",
    );
    run([
      "x509",
      "-req",
      "-in",
      path("signer.csr"),
      "-CA",
      path("root.pem"),
      "-CAkey",
      path("root.key"),
      "-CAcreateserial",
      "-out",
      path("signer.pem"),
      "-days",
      "1",
      "-sha256",
      "-extfile",
      path("signer.ext"),
    ]);
    write("index", "");
    write("serial", "01\n");
    write("crlnumber", "01\n");
    write(
      "ca.cnf",
      `[ca]\ndefault_ca=authority\n[authority]\ndatabase=${path("index")}\nserial=${path("serial")}\ncrlnumber=${path("crlnumber")}\ncertificate=${path("root.pem")}\nprivate_key=${path("root.key")}\ndefault_md=sha256\ndefault_crl_days=1\n`,
    );
    run(["ca", "-gencrl", "-config", path("ca.cnf"), "-out", path("crl.pem")]);
    write("tsa-serial", "01\n");
    write(
      "tsa.cnf",
      `[tsa]\ndefault_tsa=authority\n[authority]\nserial=${path("tsa-serial")}\ncrypto_device=builtin\nsigner_cert=${path("signer.pem")}\ncerts=${path("root.pem")}\nsigner_key=${path("signer.key")}\nsigner_digest=sha256\ndefault_policy=1.2.3.4.1\ndigests=sha256\naccuracy=secs:1\nclock_precision_digits=0\nordering=yes\ntsa_name=yes\ness_cert_id_chain=no\ness_cert_id_alg=sha256\n`,
    );
    const read = (name) => readFileSync(path(name), "utf8");
    const root = read("root.pem"),
      signer = read("signer.pem");
    const pin = (pem) =>
      new X509Certificate(pem).fingerprint256.replaceAll(":", "").toLowerCase();
    return {
      profile: {
        name: "SYNTHETIC OFFLINE AUTHORITY",
        endpoint: "https://synthetic.invalid/tsr",
        feeUsd: 0,
        root,
        signer,
        crl: read("crl.pem"),
        rootPin: pin(root),
        signerPin: pin(signer),
        policy: "1.2.3.4.1",
        openssl,
        synthetic: true,
      },
      respond(query) {
        write("request.tsq", query);
        run([
          "ts",
          "-reply",
          "-config",
          path("tsa.cnf"),
          "-queryfile",
          path("request.tsq"),
          "-out",
          path("response.tsr"),
        ]);
        return readFileSync(path("response.tsr"));
      },
      revoke() {
        run(["ca", "-config", path("ca.cnf"), "-revoke", path("signer.pem")]);
        run([
          "ca",
          "-gencrl",
          "-config",
          path("ca.cnf"),
          "-out",
          path("crl.pem"),
        ]);
        return read("crl.pem");
      },
      close() {
        rmSync(dir, { recursive: true, force: true });
      },
    };
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
