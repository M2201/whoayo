# Security Policy

WHOAYO handles private ideas and disclosure evidence. Please do not open a public issue for a suspected vulnerability, private concept, credential, customer record, receipt package or exploit detail.

## Reporting

Use GitHub's [private vulnerability report](https://github.com/M2201/whoayo/security/advisories/new). Do not use public issues for vulnerabilities. Private reporting is not a secure vault: submit only a minimal synthetic reproduction, never private evidence or credentials. A separate paid-service support address has not yet been approved.

Include only the minimum needed to reproduce the issue with synthetic data: affected commit/version, component, impact, safe reproduction steps and proposed mitigation. Never include a live API key, password, vault, nonce, private idea text or customer identifier.

## Supported versions

No stable public release exists yet. Security fixes target the current `main` branch until the first tagged release defines a support window.

## Response targets

The planned targets are acknowledgement within two business days and an initial severity assessment within five business days. These are targets, not a contractual service-level agreement. Active cross-tenant exposure, credential leakage, evidence corruption or uncontrolled spend is treated as critical.

## Scope and boundaries

The current supported deployment is loopback-only local use. Reverse-proxying or tunneling it to the public internet is outside the supported boundary. A hash or timestamp is evidence about bytes and time under its verifier; it is not proof of ownership, originality, patentability or legal priority.

See `docs/THREAT-MODEL.md`, `docs/SECURITY-RECOVERY.md` and `docs/MONETARY-CONTROLS.md`.
