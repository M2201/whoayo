# Local Source Control

WHOAYO has an approved public source destination: `https://github.com/M2201/whoayo.git`, public, AGPL-3.0-only. The initial public repository starts from a reviewed source snapshot, without importing the private development repository's history. The original local history remains preserved separately and must not be pushed or merged into the public repository. Future public changes should be made in a clone of the public repository. Do not copy another project's Git history, credentials or release settings.

The exact reviewed source inventory is `source-manifest.json`. It excludes real accounts, private records, keys, configuration secrets, exports, timestamp proof packages, backup archives, dependency installations, generated builds and operational reports. Known-secret checks are a useful guard, not a complete data-loss-prevention system. Review new source manually too. Existing public UI assets are hash-pinned so a changed image requires review.

Install the local hooks after cloning or restoring source:

```sh
git config --local core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/pre-push
npm run check:source
```

The commit hook inspects the complete staged index, including its actual blob contents. The push hook runs `npm run release:check` against the actual push destination and blocks until the manifest records owner approval, public visibility, the exact GitHub remote and license; the matching origin exists; the license file exists; and placeholder issue links are replaced. It does not prove the remote's actual visibility, so read that back through GitHub before the first push. Hooks are local operational safeguards, not protection against an administrator deliberately bypassing them. They are not automatically enabled by a clone. Keep the private development repository without a remote; the approved public clone is the publishing checkout.

Use explicit reviewed paths when staging. Inspect `git diff`, `git diff --cached` and `git status --short` before committing. Run tests and the build. Never force-add a private file to get past an ignore rule.

A Git commit is a local history checkpoint, not a backup or blockchain timestamp. A full `git bundle create ... --all` can preserve committed history in a separate encrypted recovery package. Verify the bundle, restore to a NEW repository, and compare the checked-out commit and tree. A source-only bundle cannot restore the vault or provider credentials. The separate encrypted vault archive is described in `SECURITY-RECOVERY.md`.

Original operational notes containing private record identifiers remain in ignored owner-only storage; version-controlled release notes are sanitized. Sanitization does not alter the original evidence in the vault. Content-free restore reports and archive hashes stay in private operator storage, not public source.
