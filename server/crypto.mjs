import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(",")}}`;
  return JSON.stringify(value);
};
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const token = () => randomBytes(32).toString("hex");
export function seal(key, value, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([
    cipher.update(canonical(value), "utf8"),
    cipher.final(),
  ]);
  return JSON.stringify({
    v: 1,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    data: ciphertext.toString("base64"),
  });
}
export function unseal(key, value, context) {
  const box = JSON.parse(value);
  if (box.v !== 1) throw new Error("Unsupported encryption version");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(box.iv, "base64"),
  );
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(box.tag, "base64"));
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(box.data, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
export function receipt({
  projectId,
  recordId,
  content,
  origin,
  previous = null,
  actor,
}) {
  const nonce = randomBytes(32);
  const manifest = {
    schema: "origin-record/1",
    projectId,
    recordId,
    origin,
    actor,
    createdAt: new Date().toISOString(),
    contentHash: hash(content),
    previous,
  };
  const commitment = hash(
    Buffer.concat([
      Buffer.from("origin-record-v1\0"),
      nonce,
      Buffer.from(canonical(manifest)),
    ]),
  );
  return {
    manifest,
    nonce: nonce.toString("hex"),
    commitment,
    anchoring: "local-only",
    clock: "operator-clock",
  };
}
export function verifyReceipt(record, content) {
  if (
    record.manifest.contentHash !== hash(content) ||
    !/^[0-9a-f]{64}$/.test(record.nonce)
  )
    return false;
  return (
    record.commitment ===
    hash(
      Buffer.concat([
        Buffer.from("origin-record-v1\0"),
        Buffer.from(record.nonce, "hex"),
        Buffer.from(canonical(record.manifest)),
      ]),
    )
  );
}
