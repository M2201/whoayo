import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function publicReleaseReadiness({
  manifest,
  licenseExists,
  originRemote,
  issueConfiguration,
  pushRemote,
}) {
  const remote = manifest?.approvedRemote;
  const checks = {
    publicationApproved: manifest?.publicationApproved === true,
    publicVisibility: manifest?.approvedVisibility === "public",
    exactGithubRemote:
      typeof remote === "string" &&
      /^(?:https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/.test(
        remote,
      ) &&
      originRemote === remote &&
      (pushRemote === undefined || pushRemote === remote),
    licenseRecorded:
      typeof manifest?.approvedLicense === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9+.-]{1,63}$/.test(manifest.approvedLicense),
    licenseFilePresent: licenseExists === true,
    issueLinksFinal:
      typeof issueConfiguration === "string" &&
      !issueConfiguration.includes("OWNER/REPOSITORY"),
  };
  return {
    ready: Object.values(checks).every(Boolean),
    checks,
    note: "This checks recorded source-release approvals, not hosted-product readiness or GitHub visibility after push.",
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(
    readFileSync(resolve(root, "source-manifest.json"), "utf8"),
  );
  let originRemote = null;
  try {
    originRemote = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    // Missing origin is a normal, reportable pre-publication state.
  }
  const result = publicReleaseReadiness({
    manifest,
    licenseExists: existsSync(resolve(root, "LICENSE")),
    originRemote,
    pushRemote: process.argv[2],
    issueConfiguration: readFileSync(
      resolve(root, ".github/ISSUE_TEMPLATE/config.yml"),
      "utf8",
    ),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ready) process.exitCode = 1;
}
