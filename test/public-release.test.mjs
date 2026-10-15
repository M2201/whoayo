import test from "node:test";
import assert from "node:assert/strict";
import { publicReleaseReadiness } from "../scripts/check-public-release.mjs";

const approved = {
  project: "origin-studio",
  publicationApproved: true,
  approvedVisibility: "public",
  approvedRemote: "https://github.com/example/whoayo.git",
  approvedLicense: "AGPL-3.0-only",
};

test("public release check requires every recorded owner gate", () => {
  const ready = publicReleaseReadiness({
    manifest: approved,
    licenseExists: true,
    originRemote: approved.approvedRemote,
    issueConfiguration:
      "url: https://github.com/example/whoayo/security/policy",
  });
  assert.equal(ready.ready, true);
  for (const key of Object.keys(ready.checks)) {
    const manifest = { ...approved };
    const input = {
      manifest,
      licenseExists: true,
      originRemote: approved.approvedRemote,
      issueConfiguration:
        "url: https://github.com/example/whoayo/security/policy",
    };
    if (key === "publicationApproved") manifest.publicationApproved = false;
    if (key === "publicVisibility") manifest.approvedVisibility = "private";
    if (key === "exactGithubRemote") input.originRemote = null;
    if (key === "licenseRecorded") manifest.approvedLicense = null;
    if (key === "licenseFilePresent") input.licenseExists = false;
    if (key === "issueLinksFinal")
      input.issueConfiguration = "url: https://github.com/OWNER/REPOSITORY";
    assert.equal(publicReleaseReadiness(input).ready, false, key);
  }
});

test("push destination must match the approved origin even when origin is correct", () => {
  const input = {
    manifest: approved,
    licenseExists: true,
    originRemote: approved.approvedRemote,
    issueConfiguration:
      "url: https://github.com/example/whoayo/security/policy",
  };
  assert.equal(
    publicReleaseReadiness({ ...input, pushRemote: approved.approvedRemote })
      .ready,
    true,
  );
  for (const pushRemote of [
    "https://github.com/other/whoayo.git",
    "git@github.com:example/whoayo.git",
    "",
    "/tmp/unapproved.git",
  ]) {
    const result = publicReleaseReadiness({ ...input, pushRemote });
    assert.equal(result.ready, false);
    assert.equal(result.checks.exactGithubRemote, false);
  }
});
