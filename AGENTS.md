# Origin Studio

This is the private development-workspace component of the AI Initiative by MR. Rousseau. It is a separate repository with separate accounts, keys, records and approvals. The surrounding directory name is historical, not project identity or permission to change a different application.

Before edits, confirm `git rev-parse --show-toplevel`, `git status --short --branch`, and `npm run check:source`. Read `README.md`, `docs/SECURITY-RECOVERY.md`, and the latest checkpoint in `docs/RELEASE-STATUS.md`. Preserve existing work.

Keep private vaults, keys, environment credentials, exact evidence, exports, recovery reports and operational artifacts outside Git. The explicit `source-manifest.json` allows reviewed source files only. When adding source, review the file before updating that manifest. Checks report filenames/rules, never matched secrets. Tests must use synthetic fixtures. Do not repeat the separately approved paid live test.

Automatic recognition is not consent to retain, transmit, timestamp, publish or spend. Preserve exact source and attribution separately from AI summaries. Do not rewrite evidence, equate pending receipts with verified blockchain time, or claim originality/ownership from hashes.

Run `npm test`, `npm run build` and `npm run check:source`. Before a commit inspect the working and staged diffs and run `node scripts/check-source.mjs --staged`. Local hooks check commits and block all pushes until a specific remote, visibility and licensing decision is authorized. Do not bypass these hooks. A local commit is not publication or independent backup.

On October 14, 2026, the owner authorized public publication at `M2201/whoayo` under AGPL-3.0-only, with issues-only contributions initially. The approved remote is `https://github.com/M2201/whoayo.git`. The source release is authorized; hosted infrastructure, live payments and new paid model requests still require their dedicated configuration and acceptance. Use explicit paths for recovery, never overwrite a vault, and keep its recovery key away from the archive. A restored copy must remain offline until separately authorized.
