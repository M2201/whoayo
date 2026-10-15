import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSource, inspectSource } from "../scripts/check-source.mjs";

test("source checks reject unlisted data and known credentials without echoing content", () => {
  const manifest = { files: ["server/example.mjs"], reviewedBinaries: {} };
  const secret = "sk-" + "a".repeat(40);
  assert.deepEqual(
    inspectSource("server/example.mjs", Buffer.from(secret), manifest),
    ["provider secret"],
  );
  assert.deepEqual(inspectSource(".env.local", Buffer.from(secret), manifest), [
    "not on reviewed source allowlist",
  ]);
  for (const prefix of ["sk_test_", "sk_live_", "rk_live_", "whsec_"]) {
    assert.deepEqual(
      inspectSource(
        "server/example.mjs",
        Buffer.from(prefix + "a".repeat(32)),
        manifest,
      ),
      ["payment secret"],
    );
  }
  assert.deepEqual(
    inspectSource("server/example.mjs", Buffer.from("safe source"), manifest),
    [],
  );
});

test("binary changes require review", () => {
  assert.deepEqual(
    inspectSource("public/image.png", Buffer.from("changed"), {
      files: ["public/image.png"],
      reviewedBinaries: { "public/image.png": "0".repeat(64) },
    }),
    ["reviewed binary changed"],
  );
});

test("staged scan checks index bytes even if working copy was sanitized", (t) => {
  const root = mkdtempSync(join(tmpdir(), "origin-source-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd: root, stdio: "pipe" });
  git("init", "-b", "main");
  const manifest = {
    project: "origin-studio",
    schemaVersion: 1,
    files: ["source-manifest.json", "package.json", "example.mjs"],
  };
  writeFileSync(join(root, "source-manifest.json"), JSON.stringify(manifest));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "origin-studio" }),
  );
  writeFileSync(join(root, "example.mjs"), "sk-" + "a".repeat(40));
  git("add", "source-manifest.json", "package.json", "example.mjs");
  writeFileSync(join(root, "example.mjs"), "// now safe");
  assert.equal(checkSource(root).findings.length, 0);
  assert.deepEqual(checkSource(root, true).findings, [
    { file: "example.mjs", rule: "provider secret" },
  ]);
  git("add", "example.mjs");
  assert.equal(checkSource(root, true).findings.length, 0);
  rmSync(join(root, "example.mjs"));
  symlinkSync("package.json", join(root, "example.mjs"));
  assert.deepEqual(checkSource(root).findings, [
    { file: "example.mjs", rule: "not a regular source file" },
  ]);
  git("add", "example.mjs");
  assert.deepEqual(checkSource(root, true).findings, [
    { file: "example.mjs", rule: "unsafe index entry" },
  ]);
});
