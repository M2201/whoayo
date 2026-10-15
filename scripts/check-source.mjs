import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const patterns = [
  ["private key", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
  ["provider secret", /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{30,}\b/],
  [
    "payment secret",
    /\b(?:(?:sk|rk)_(?:live|test)_[A-Za-z0-9_]{24,}|whsec_[A-Za-z0-9_]{24,})\b/,
  ],
  [
    "GitHub token",
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/,
  ],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/],
  ["AWS key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["private home path", /(?:\/Users\/|\/home\/)[A-Za-z0-9_.-]+\//],
];

export function inspectSource(file, bytes, manifest) {
  if (!manifest.files.includes(file))
    return ["not on reviewed source allowlist"];
  if (bytes.length > 2 * 1024 * 1024) return ["file exceeds review limit"];
  if (manifest.reviewedBinaries?.[file]) {
    return createHash("sha256").update(bytes).digest("hex") ===
      manifest.reviewedBinaries[file]
      ? []
      : ["reviewed binary changed"];
  }
  const source = bytes.toString("utf8");
  const failures = source.includes("\0") ? ["unexpected binary content"] : [];
  for (const [rule, pattern] of patterns)
    if (pattern.test(source)) failures.push(rule);
  return failures;
}

export function checkSource(directory, staged = false) {
  const git = (args) =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: 4 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  if (
    realpathSync(git(["rev-parse", "--show-toplevel"]).trim()) !==
    realpathSync(directory)
  )
    throw Error("Wrong repository root.");
  const read = (file) =>
    staged
      ? Buffer.from(git(["show", `:${file}`]))
      : readFileSync(resolve(directory, file));
  const manifest = JSON.parse(read("source-manifest.json"));
  if (
    manifest.project !== "origin-studio" ||
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.files) ||
    manifest.files.some(
      (f) =>
        typeof f !== "string" ||
        f.startsWith("/") ||
        f.split("/").some((p) => p === ".." || p === "."),
    ) ||
    new Set(manifest.files).size !== manifest.files.length ||
    JSON.parse(read("package.json")).name !== "origin-studio"
  )
    throw Error("Invalid Origin Studio source manifest.");
  const entries = git(["ls-files", "--stage", "-z"])
    .split("\0")
    .filter(Boolean);
  const indexed = new Map(
    entries.map((entry) => {
      const [metadata, file] = entry.split("\t");
      return [file, metadata.split(" ")];
    }),
  );
  const files = staged
    ? [...indexed.keys()]
    : [
        ...new Set([
          ...indexed.keys(),
          ...git(["ls-files", "--others", "--exclude-standard", "-z"])
            .split("\0")
            .filter(Boolean),
        ]),
      ];
  const findings = [];
  for (const file of files) {
    const report = (rule) => findings.push({ file, rule });
    if (!manifest.files.includes(file)) {
      report("not on reviewed source allowlist");
      continue;
    }
    if (
      indexed.has(file) &&
      (!/^100(?:644|755)$/.test(indexed.get(file)[0]) ||
        indexed.get(file)[2] !== "0")
    ) {
      report("unsafe index entry");
      continue;
    }
    if (!staged && !lstatSync(resolve(directory, file)).isFile()) {
      report("not a regular source file");
      continue;
    }
    // Binary index blobs must not be transcoded through UTF-8.
    const bytes = staged
      ? execFileSync("git", ["show", `:${file}`], {
          cwd: directory,
          maxBuffer: 3 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        })
      : read(file);
    for (const rule of inspectSource(file, bytes, manifest)) report(rule);
  }
  for (const file of manifest.files)
    if (!files.includes(file))
      findings.push({ file, rule: "reviewed source missing" });
  return { files: files.length, findings };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = checkSource(root, process.argv.includes("--staged"));
    console.log(JSON.stringify(result, null, 2));
    if (result.findings.length) process.exitCode = 1;
  } catch {
    console.error(
      "Source check failed. Verify repository, manifest, regular files and index. Contents withheld.",
    );
    process.exitCode = 1;
  }
}
