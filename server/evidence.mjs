import { randomBytes, randomUUID } from "node:crypto";
import { canonical, hash, verifyReceipt } from "./crypto.mjs";

const hex = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const commitment = (manifest, nonce) =>
  hash(
    Buffer.concat([
      Buffer.from("origin-preservation-v1\0"),
      Buffer.from(nonce, "hex"),
      Buffer.from(canonical(manifest)),
    ]),
  );

export function createSnapshot(pkg, previous = null) {
  verifyPackage(pkg);
  const manifest = {
    schema: "origin-preservation-manifest/1",
    id: randomUUID(),
    projectId: pkg.project.id,
    revision: pkg.project.revision,
    createdAt: new Date().toISOString(),
    packageHash: hash(canonical(pkg)),
    previous,
  };
  const nonce = randomBytes(32).toString("hex");
  return {
    schema: "origin-preservation/1",
    manifest,
    nonce,
    commitment: commitment(manifest, nonce),
    package: pkg,
  };
}

export function timestampPayload(snapshot) {
  verifySnapshot(snapshot);
  // Only this opaque, salted commitment is intended for the external stamper.
  return `origin-studio-evidence-v1:${snapshot.commitment}\n`;
}

export function verifySnapshot(snapshot) {
  const { manifest, nonce } = snapshot;
  if (
    snapshot.schema !== "origin-preservation/1" ||
    manifest?.schema !== "origin-preservation-manifest/1" ||
    !hex(nonce) ||
    !hex(snapshot.commitment) ||
    !(manifest.previous === null || hex(manifest.previous)) ||
    !Number.isSafeInteger(manifest.revision) ||
    manifest.revision < 1 ||
    manifest.projectId !== snapshot.package?.project?.id ||
    manifest.revision !== snapshot.package?.project?.revision ||
    manifest.packageHash !== hash(canonical(snapshot.package)) ||
    snapshot.commitment !== commitment(manifest, nonce)
  )
    throw new Error("Preserved package integrity failed");
  return {
    ...verifyPackage(snapshot.package),
    preservedPackage: "verified",
    commitment: snapshot.commitment,
  };
}

export function verifyPackage(pkg) {
  if (pkg?.schema === "origin-preservation/1") return verifySnapshot(pkg);
  if (pkg?.schema !== "origin-export/1")
    throw new Error("Unsupported package schema");
  const p = pkg.project;
  const groups = [
    p.ideas,
    ...p.artifacts.map((a) => a.versions),
    ...p.threads.map((t) => t.messages.filter((m) => m.receipt)),
  ];
  let records = 0;
  const ids = new Set();
  for (const group of groups)
    for (const r of group) {
      if (
        !verifyReceipt(r.receipt, r.content) ||
        r.receipt.manifest.projectId !== p.id ||
        r.receipt.manifest.recordId !== r.id ||
        ids.has(r.id)
      )
        throw new Error("Content receipt verification failed");
      ids.add(r.id);
      records++;
    }
  for (const group of [p.ideas, ...p.artifacts.map((a) => a.versions)]) {
    let previous = null;
    for (const r of group) {
      if (r.receipt.manifest.previous !== previous)
        throw new Error("Version lineage mismatch");
      previous = r.receipt.commitment;
    }
  }
  for (const d of p.disclosures)
    if (hash(canonical(d.request)) !== d.digest)
      throw new Error("Disclosure request mismatch");
  return {
    contentReceipts: "verified",
    records,
    disclosures: p.disclosures.length,
    externalTimestamp: "not-verified",
    identity: "self-declared",
    eventChain: "requires-encrypted-store-or-external-witness",
    ownership: "not-assessed",
  };
}
