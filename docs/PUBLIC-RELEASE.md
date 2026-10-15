# Public Repository Release

Approved October 14, 2026: public source at [M2201/whoayo](https://github.com/M2201/whoayo), AGPL-3.0-only, issues-only contributions initially. GitHub CLI authentication was verified outside the filesystem sandbox; the earlier invalid-login result was a sandbox artifact. This is a local evaluation source release. Hosted enrollment and live billing remain unavailable.

## Release contents

The public tree is limited by `source-manifest.json`. It excludes private vaults, environment files, provider/cloud credentials, exact private evidence packages, backup archives, dependency installations, generated builds, screenshots from private sessions and operational reports. Public examples and tests use synthetic data.

The initial publication is a fresh source snapshot, not a push of private development history. The original history remains local and unchanged; its historical operational notes are not part of the public commit graph. All future public work must start from the public repository.

Community health files include the approved license, README, contribution guide, conduct policy, security policy, support boundaries, issue forms, pull-request template, CI and dependency-update configuration.

## Recorded source decision and hosted follow-up

The owner approved `M2201/whoayo`, public visibility, AGPL-3.0-only and issues-only contributions. These values are recorded in `source-manifest.json`. GitHub issues and private vulnerability reporting provide source-project contact paths. Legal operator identity and paid-service support commitments remain prerequisites for hosted enrollment.

## Final pre-publication verification

From the repository root:

```sh
npm ci
npm run check:source
npm test
npm run build
npm run check:business
git diff --check
git status --short
```

`npm run release:check` must pass with every check `true`; it does not replace a readback of actual GitHub visibility/settings.

Then review every staged byte:

```sh
git diff --cached --stat
git diff --cached
node scripts/check-source.mjs --staged
```

Do not stage `.env.local`, `.local-data`, `output`, backups, exports or timestamp packages. Do not bypass the push hook. The hook permits only the exact approved GitHub URL. Confirm the repository reports public visibility before the first push.

## GitHub settings after creation

- default branch `main`;
- require pull requests, passing CI and resolved conversations;
- block force pushes and branch deletion;
- enable private vulnerability reporting, Dependabot alerts and secret scanning where available;
- disable wiki/projects/discussions unless there is an owner for each surface;
- add reviewed topics such as `ai-provenance`, `privacy`, `human-in-the-loop`, `local-first`, `opentimestamps`, `react`, `sqlite`;
- publish a signed/tagged first release only after cloning it into a fresh directory and rerunning verification.

Public visibility is not hosted-product launch. Keep checkout, customer enrollment and public ingress disabled until `HOSTED-LAUNCH.md` passes.

The served local page intentionally remains `noindex,nofollow`. `SEO.md` contains the domain-dependent canonical, social-card, structured-data, sitemap and robots work that must be completed only after the owned HTTPS URL and public operator facts are approved.
