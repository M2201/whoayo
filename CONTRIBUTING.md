# Contributing to WHOAYO

WHOAYO is licensed AGPL-3.0-only. This first release accepts **issues only**: bug reports, feature requests and discussion of reproducible synthetic examples. Please wait to submit outside code until the owner publishes inbound contribution terms. Maintainer changes still use reviewed pull requests.

## Before opening anything

- Use synthetic examples only. Never include a private idea, prompt, artifact, account, receipt package, nonce, credential, private path or customer data.
- Search existing issues and the roadmap.
- For a vulnerability, follow `SECURITY.md` instead of filing a public issue.
- Keep claims precise: a timestamp does not prove ownership or originality.

## Development

Requires Node.js 24.13 or later.

```sh
npm ci
npm run check:source
npm test
npm run build
npm run check:business
```

Every tracked file must be reviewed and listed in `source-manifest.json`. Tests must not call paid/live providers or depend on an existing local vault. Preserve append-only evidence behavior and add a regression test for behavior changes.

## Pull requests

- Keep one focused change per pull request.
- Explain the user problem, security/privacy effect, verification and rollback.
- Update public documentation for user-visible behavior.
- Disclose material AI assistance in the pull-request template. The human submitter remains responsible for understanding and validating the change.
- Do not add telemetry, external calls, dependencies, model IDs, prices or legal/security claims without explicit review.

No contributor agreement or commercial relicensing grant is implied by opening an issue. Outside code acceptance remains closed pending a separate contribution policy.
