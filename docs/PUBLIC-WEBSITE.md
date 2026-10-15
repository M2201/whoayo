# WHOAYO Website Presentation

Implemented October 6, 2026. This public-facing design is served by the existing loopback app; it has not been published or made available for hosted customer sign-up.

## Current Visual Direction

Rebranded October 12, 2026 from Origin Studio to **WHOAYO**. The design retains
the established near-black full-width sections, oversized sans-serif headings,
cyan italic serif emphasis, fine technical rules and restrained detail. The
original fingerprint-inspired artwork still fills the hero behind real HTML
text. Its recognizable ridges remain static and legible while a faint duplicate
layer drifts by less than one percent and a sparse set of tiny points twinkles on
long, staggered cycles. This gives the fingerprint a slow cosmic character
without a visible spin, flash or layout movement.

The animation is compositor-only CSS: no canvas, animation-frame loop, new
network asset or external library. Desktop uses 12 small twinkles; viewports at
700 pixels and below use six. `prefers-reduced-motion: reduce` stops the drift
and twinkles while retaining a quiet static fingerprint. The proof example
remains prominent without changing what it establishes, and a static three-step
band connects the starting point, evidence of existence and development
history. A light section displays the actual synthetic-workspace screenshot.

`signal-story.css` scopes the presentation and cosmic fingerprint treatment to
the public welcome page. The earlier `scroll-story.css` remains preserved in
source but is no longer imported. `ScrollText.jsx` still provides the bounded
one-time entrances described below. No seed, 3D library, canvas loop, external
font, analytics or tracking request was added. Forms and controls stay still;
critical action, password guidance, error and recovery-dialog contrast remains
covered by synthetic browser QA. Private records, account logic and evidence
remain unchanged.

## Audience And Experience

The website introduces WHOAYO to researchers, no-code builders and low-code developers. It starts with the product name, the owner's positioning "Your ideas should be yours", and a concrete description of preserving original contributions while developing with AI.

The first viewport and evidence section feature **WHOAYO's origin concept,
timestamped under the former Origin Studio name**, with earliest attested block
time **October 5, 2026 at 04:52:27 UTC**. On October 9, the preserved private
package was inspected: it explicitly names Origin Studio and describes the
concept of recording ideas, developing them with AI and preserving the evolving
evidence. Its package integrity, original fingerprint payload, completed proof
and retained explorer cross-check all match. The October 12 rebrand does not
change the preserved package or imply that the WHOAYO name itself existed by the
attested time. No new public verification or local Bitcoin node check was
performed.

This preserves the established concept/version mapping while stating the name
history plainly. The story says that before becoming WHOAYO, the product used
the Origin Studio name to preserve this exact concept. The covered version is
preserved concept package revision 2, not the later brand name, every later
feature or the whole codebase. It does not imply the concept was recorded before
all development or AI conversations, that this was the first idea worldwide, or
that an NFT was minted. The private workspace's compact reference uses the same
safe metadata. The public page never queries the vault or submits a fingerprint.
Private records, original pending receipt and completed proof remain unchanged
and separate.

`src/concept-evidence.json` contains only the reviewed title, version label, attested time, check dates/method, opaque payload/proof hashes and block heights. `scripts/check-concept-link.mjs` accepts explicit private paths and reproduces the integrity/linkage checks without network access or printing private content. The public summary is inspectable but is not itself a downloadable independently verifiable proof package.

Visitors can explore three synthetic audience examples and three workflow stages, expand the evidence details and FAQ, and navigate directly to registration or sign-in. The illustrative examples remain labeled **Not timestamped**. Exploration does not save records or make model calls. The separate signed-receipt/pre-AI gate exists; live authority access remains disabled. The completed OTS example does not unlock that gate. Model-family text describes adapters, not active entitlements or guaranteed availability.

## Text-Only Scroll Story

Updated October 7, 2026 at the owner's request. The spinning seed, its reserved
spaces, canvas, motion button, reading bar and pulsing fingerprint icons have been
removed. The six connected sections and their content remain. Introductory text
and the evidence date slide 18 pixels right and 24 pixels up into their resting
position as they enter the viewport. Each entrance lasts at most 600 milliseconds
and runs once per page visit; nothing keeps moving while the visitor reads.

`ScrollText.jsx` uses IntersectionObserver and CSS transitions, with no animation
frame loop or 3D dependency. Text already in view is immediately readable. Reduced
motion, unsupported observers and keyboard focus reveal text without sliding.
Buttons, forms, interactive examples, disclosure controls and the actual product
screenshot stay still. Native scrolling is not intercepted. Layout gaps reserved
for the seed are gone, and evidence uses a two-column desktop layout and a stacked
phone layout. The first viewport still reveals the following section.

The supplied proof date remains readable HTML, with no new evidence claims.
Query parameters cannot change the claim. Disclosures retain the no-local-node
limitation, preserved original receipt, exact covered concept version, and absence of
ownership or originality guarantees. The former Three.js chunk and seed image are
no longer built or served. Historical art and scene source remain in ignored
`output/superseded-art/seed-animation/` for reference, not in the release manifest.

The existing auth form retains validation, masked password fields and recovery guidance. Its email field is not a verified recovery channel. The call to action opens this local form, not a public waitlist or hosted service. There is no marketing email collection, analytics, payment, external font or third-party asset request.

The signed-in `/?view=welcome` route shows a workspace-return link instead of another account form and skips loading the private project list. Registration from that route clears the welcome query and opens the normal workspace. Existing workspace behavior and private evidence remain separate.

## Assets

- `public/origin-evidence-field.jpg`: original generated fingerprint-inspired stippled artwork used as the current full-bleed hero and its faint moving overlay. The bytes are unchanged. Decorative only, not biometric data, an actual receipt or a product screenshot. SHA-256: `7f437053f507d6cab25663eeab03dbc74479d67b9a1e69d8235513d70e188dda`.
- Archived only: the graphite seed, photographic seed and rejected room artwork are preserved in ignored `output/superseded-art/`, not served or requested by the website. Their source PNGs are retained outside the served assets.
- `public/origin-research-studio.jpg`: earlier conceptual editorial artwork, retained but no longer used by the hero. Generated using the built-in image tool and converted to JPEG for local serving. It is not a photograph of the product or an evidence receipt.
- `public/origin-workspace-preview.jpg`: reviewed screenshot of the actual local application containing only the earlier synthetic greenhouse QA example. The visible local date is part of that illustrative screenshot, not Origin Studio's timestamp claim. The caption identifies the synthetic data.
- All served assets are pinned by SHA-256 in the reviewed source manifest. No private account content or secret is included.

### Hero Generation Prompts

Current artwork generation brief: original digital editorial fingerprint engraving on matte near-black, formed from fine white and cyan dots and broken ridges on the right two-thirds. Keep the left side as negative space for HTML text, with tiny coral accents. No rendered text, dates, logos, UI, real biometrics, glow, orbs or gradients. Generated with the built-in image tool and converted to a locally served JPEG; the source PNG is retained separately.

Archived translucent sketch edit prompt: Use case: style-transfer. Edit this exact botanical pencil sketch of a single maple samara. Keep exactly the same silhouette, diagonal lower-left pod to upper-right wing, crop, orientation and relative geometry. Make the papery wing highly translucent: remove the opaque white/gray fill between pencil marks so the background is truly transparent through the wing. Use delicate, sparse, dark graphite strokes, a clear hand-sketched perimeter, fine branching vein lines and very sparse hatching; NO chalky white backing. The small lower-left seed pod stays more solid with darker graphite cross-hatching. This is a pencil linework texture to be applied to a three-dimensional animated seed. Only change translucency and simplify dense hatching; no additional objects, no motion trails, no labels, no frame, no paper, no shadows, no second wing. Genuine transparent alpha background and translucent/transparent spaces between the wing veins. Preserve the original diagonal view; the code will handle its side-view rotation.

Archived photographic seed prompt: Use case: product-mockup. Asset type: a single transparent botanical cutout used as the moving central subject of Origin Studio's scroll-driven website. Subject: exactly ONE single-winged maple samara, the helicopter seed, NOT a pair. A small dark olive seed pod at the lower-left base, one long slender asymmetrical papery wing sweeping to the upper right, visible branching veins from pod to tip, subtly curled edge. Graceful organic silhouette, wide elongated wing, botanical precision. Rich fresh chartreuse and pale yellow-green translucent membrane, deeper forest-green pod and fine ribs. A premium macro photograph meets delicate botanical illustration: tactile fine fiber detail, softly backlit, crisp focus over entire object. Whole seed visible, diagonally centered, takes up about 85 percent of the square canvas. Genuine transparent background, no ground, no cast shadow, no text, no people, no room, no coins, no emblems, no extra leaves, no separate foliage, no orbs or particles, no frame. Keep the subject natural, refined, and weightless, not a plastic toy or metallic propeller.

Earlier unused editorial artwork prompt:

Use case: ads-marketing. Asset type: a full-width website hero background for Origin Studio, a research and AI development workspace centered on preserving exact idea records. Create a premium editorial still-life photograph, very wide 3:2 landscape. A charcoal graphite work surface with tactile off-white sheets of research notes, a single architectural paper model, a clear glass plate with an engraved fingerprint and fine circuit traces, a cobalt blue pencil and a small vivid coral index tab. Objects form a sweeping low composition across the LOWER THIRD and rightmost quarter only. The TOP TWO THIRDS and LEFT TWO THIRDS must remain a clean, uniform near-black #161918 work surface to receive real HTML headings without an overlay or a card. Crisp, realistic glass refraction and cut paper, strong natural directional light, inviting maker studio rather than science-fiction. Restrained mint-cyan reflections, cobalt and coral accents; no purple, no beige, no brown palette. No people, no rendered UI, no legible words, no dates, no logos, no timestamps, no certificates, no stamps, no blockchain coins, no glowing orbs, no bokeh, no gradients. This is conceptual research-workspace artwork, not a screenshot of the application. Keep every object sharp and make the composition refined and spacious.

## Release Boundary

The development section separates current model-assisted drafting/file history from planned sandbox agents, testing/previews, reviewed publishing, authorized scheduled Drive/storage copies and enrollment plus recurring usage plans. No price, payment, backup success, sandbox execution or active API entitlement is implied. Slow swirl/twinkle animation was deferred at the owner's request.

Before public enrollment: complete hosted authentication and recovery, private hosting/key custody/operations, live validation of the signed-timestamp service and pre-AI gate, and the remaining customer release checks. Publishing the website and accepting customer data are distinct approvals. The WHOAYO rebrand and cosmic fingerprint treatment change presentation only; no provider setting, account, receipt or private record was changed.
