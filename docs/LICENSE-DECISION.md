# License Decision

Approved October 14, 2026: **AGPL-3.0-only**, public repository **M2201/whoayo**, **issues-only** contributions initially. The unmodified [GNU license text](../LICENSE) is included. The approved source destination is `https://github.com/M2201/whoayo.git`.

## Recommended structure

For the stated goals—public adoption plus a managed-service business—the recommended starting point is:

1. **AGPL-3.0-only community edition** for the public repository.
2. A separate commercial license for customers who need to embed, redistribute or offer a modified network service without AGPL obligations.
3. A trademark policy keeping the WHOAYO name and logo distinct from the code license.
4. A lightweight contributor agreement or developer certificate of origin chosen with counsel before accepting substantial outside code, so commercial licensing rights are clear.

Why: Apache-2.0 maximizes permissive reuse but allows a third party to run a closed hosted fork. AGPL encourages public improvements to network-deployed modifications while leaving a paid commercial path. A source-available “no competing SaaS” license can protect hosting more directly, but should not be marketed as open source and generally creates more adoption friction.

This is a product recommendation, not legal advice. The copyright owner and qualified counsel should confirm ownership of all code/assets, inbound dependencies, contributor terms, patent considerations and the exact license text.

## Recorded release decision

The owner's explicit selection covers these four items:

- exact GitHub owner/repository name;
- public visibility;
- exact license identifier and version;
- whether outside contributions are accepted immediately or issues-only at first.

The manifest records this decision, and the source contains links to the public repository. The AGPL applies to the project's community code; third-party dependencies retain their own licenses. A separate commercial-license path is planned but no commercial license or price is offered yet. The WHOAYO name and logos are reserved as project branding; no trademark license or registration claim is implied.
