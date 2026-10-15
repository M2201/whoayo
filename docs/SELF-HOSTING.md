# Self-Hosting

WHOAYO currently supports a single-machine, loopback-only local deployment for evaluation and personal use. It is not a hardened multi-tenant internet deployment.

## Local quickstart

Requirements: Node.js 24.13 or later, npm, and a supported operating system with `node:sqlite`.

```sh
npm ci
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4360`. The server intentionally binds to loopback and rejects other host/origin values.

Data is stored under `.local-data` by default. Keep that directory, `.env.local`, provider keys, exported evidence and recovery archives outside Git. Back up with the documented recovery CLI and keep the recovery key separately protected.

## Optional model access

External AI is default-off. Use dedicated API accounts and exact reviewed model allowlists. Consumer ChatGPT/Claude subscriptions are not API credentials. Review `MODEL-ACCESS.md` and `MONETARY-CONTROLS.md` before enabling a provider.

Local mode can operate without the monetary guard, but live usage should still have provider-side limits. A shared or hosted deployment must enable the application guard and complete every gate in `HOSTED-LAUNCH.md`.

## What not to do

- Do not expose the loopback server through a tunnel or reverse proxy as a shortcut to hosting.
- Do not reuse another application's provider keys, vault, identity pool or recovery key.
- Do not put private ideas or completed evidence packages in the repository.
- Do not represent local commitments as ownership, originality, patent or completed blockchain proof.
- Do not use real customer data in tests or issue reports.

The public repository will be an inspectable foundation, not a warranty of fitness for a particular security or legal purpose.
