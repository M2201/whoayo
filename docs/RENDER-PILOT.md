# Render read-only pilot

This is stage one of hosting acceptance, not the customer application. It serves
WHOAYO's reviewed public introduction with no sign-up form. Every private API
route and every write method is refused. The private application's loopback
server, database, keys, identity, model adapters and payments are never loaded.
No environment toggle can unlock them in this server. Customer access requires
a separate reviewed implementation and the gates in `HOSTED-LAUNCH.md`.

## Proposed resource footprint

- One Node web service, `1c-2g` (1 CPU, 2 GB), Oregon.
- One 5 GB persistent disk mounted at `/var/data`.
- Published rates checked October 15, 2026: $25/month compute plus $1.25/month
  disk. This is a recurring $26.25/month base, not a bill ceiling. Workspace
  subscriptions, taxes, bandwidth/build overages and other providers are separate.
- No extra database, worker, custom domain, AI key, billing key or paid workspace
  is provisioned by this setup. Keep other services and their bills unchanged.
- Single instance only. Disk-backed service updates briefly interrupt service.
  Do not enable replicas or describe this as a highly available customer service.

## Exact service configuration

Use only `https://github.com/M2201/whoayo`, a reviewed main revision with passing
CI. Do not connect the private development repository or import local data.

| Field                    | Value                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Runtime                  | Node                                                                                |
| Build                    | `npm ci && npm run build:render`                                                    |
| Start                    | `npm run start:render`                                                              |
| Health check             | `/healthz`                                                                          |
| Disk                     | `/var/data`, 5 GB                                                                   |
| `WHOAYO_DEPLOYMENT_MODE` | `read-only-pilot`                                                                   |
| `WHOAYO_PILOT_DATA_DIR`  | `/var/data/whoayo-readonly-pilot`                                                   |
| `NODE_VERSION`           | `24.13.0`, matching the tested baseline; review runtime patches before customer use |

Render supplies `PORT`, `RENDER=true`, `RENDER_EXTERNAL_URL` and
`RENDER_GIT_COMMIT`. Only the exact generated HTTPS `onrender.com` address is
accepted; forwarded-host headers are not trusted. No DNS changes are needed.
Select manual deployment where available. Public-repository URL deployments do
not grant GitHub access or support ordinary automatic deploys. Do not install a
GitHub app with access to unrelated/private repositories merely to enable this.

The preview build has its own entry and output (`dist-render`); the normal
`npm start` remains loopback-only and must not be used as the Render start command.
The preview refuses recognized private application/provider settings at boot.
Its browser policy blocks network requests and form submissions. The HTTP server
serves only bounded, preloaded build assets and does not log requests or bodies.
The host may still retain platform access logs/IP addresses; do not claim this
is anonymous or zero-logging infrastructure. Search indexing is disabled for the
pilot. No confidential customer data is accepted.

## Acceptance and handoff

1. Confirm the account's existing workspace fee, exact compute/disk price and
   region before activating. Do not upgrade the workspace or add paid resources
   outside the owner's approval. Render usage charges are not a hard budget cap.
2. Confirm build/deploy success and inspect the live HTTPS public preview.
3. Check `/healthz` has `mode: read-only-pilot`, `accountsEnabled: false` and the
   expected public commit. Check account/API requests are denied and no cookies
   are set. Visually check desktop and narrow layouts and source links.
4. Read the content-free startup log. It records a synthetic random probe,
   boot count, revision, and whether the isolated SQLite probe was created or
   reopened. Never paste platform credentials into logs or reports.
5. Restart this new pilot only, then verify the SAME probe and increased boot
   count. This demonstrates the selected disk survives that restart; it is not
   proof of off-device backup or a disaster recovery drill.
6. Record live URL, deployed revision, measured checks and unresolved gates in a
   private owner handoff. Keep deployment IDs/account metadata out of public docs.

Stop/rollback: suspend this pilot from its own Render Settings if needed. Confirm
the disk's continuing billing separately; suspension is not a claim of zero
cost. Do not delete a disk as a rollback shortcut. Redeploy only an inspected
read-only revision; never substitute the local app's start command. Data is only
a synthetic probe, but validate targets and obtain approval before deletion.

Before customer data: dedicated managed identity/recovery acceptance, KMS/key
separation, scheduled independent backups and timed restore, operational alerts,
tenant tests, data policies and a separate release approval remain mandatory.
AI calls and live customer charging are not activated by paying for hosting.

Sources: [Render web services](https://render.com/docs/web-services),
[persistent disks](https://render.com/docs/disks),
[health checks](https://render.com/docs/health-checks),
[pricing](https://render.com/pricing).
