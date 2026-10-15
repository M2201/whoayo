# Public-Site SEO Readiness

Audited October 14, 2026 against the served `index.html` and public page. The site is still a loopback preview, so it intentionally uses `noindex,nofollow`. Do not make it crawlable until an owned HTTPS domain, public legal operator and hosted launch approval exist.

## Audit

| Element | Current state | Launch action |
| --- | --- | --- |
| Language | `en` | Confirm target locale before launch |
| Title | `AI Idea Provenance Workspace \| WHOAYO`, under 60 characters | Validate search-result rendering |
| Description | Truthful 155-character outcome/call-to-action | Keep unless the public offer changes |
| Theme/favicon | Brand color, reviewed PNG/ICO | Export a true 180×180 Apple icon and simple SVG favicon |
| Robots | `noindex,nofollow` because this is local-only | Change to `index,follow` only in the approved public artifact |
| Canonical | Missing; no owned public URL | Add one exact HTTPS homepage URL |
| Open Graph/Twitter | Missing; no final URL or 1200×630 asset | Add absolute URL/image tags after domain and image approval |
| JSON-LD | Missing; legal operator and public offer unresolved | Add only supported Organization, WebSite and SoftwareApplication/Product facts |
| Sitemap/robots.txt | Missing; no public host or content routes | Generate with the exact domain; list only real indexable pages |
| Images | Hero assets have explicit dimensions and local URLs | Export a dedicated compressed 1200×630 social card; verify mobile performance |
| Fonts/scripts | System fonts, local application assets; Vite client bundle | Track real-device Core Web Vitals; reduce heavy visual effects if needed |

## Approved-domain head template

Replace bracketed values only after the facts exist. Keep the current `noindex` head until then.

```html
<title>AI Idea Provenance Workspace | WHOAYO</title>
<meta name="description" content="Record ideas before AI disclosure, verify timestamps, approve exact model requests, and preserve human and AI contribution history. Explore WHOAYO." />
<link rel="canonical" href="https://[OWNED-DOMAIN]/" />
<meta name="robots" content="index,follow" />
<meta name="theme-color" content="#202822" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="WHOAYO" />
<meta property="og:title" content="AI Idea Provenance Workspace | WHOAYO" />
<meta property="og:description" content="Record ideas before AI disclosure and preserve a reviewable human/AI contribution trail." />
<meta property="og:url" content="https://[OWNED-DOMAIN]/" />
<meta property="og:image" content="https://[OWNED-DOMAIN]/whoayo-social-1200x630.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="AI Idea Provenance Workspace | WHOAYO" />
<meta name="twitter:description" content="Record ideas before AI disclosure and preserve a reviewable human/AI contribution trail." />
<meta name="twitter:image" content="https://[OWNED-DOMAIN]/whoayo-social-1200x630.png" />
```

Add one JSON-LD `@graph` only after confirming the legal organization name/public URL. Do not publish proposed prices as `Offer` data until customers can actually purchase them. Do not add reviews, ratings, social profiles or legal claims that do not exist.

## Asset exports

- Social card: 1200×630 PNG or high-quality JPEG, safe central title area, WHOAYO mark/name, short “Record before AI disclosure” message, no tiny fingerprint/proof text.
- Apple touch icon: 180×180 opaque PNG with square-safe mark and brand background.
- SVG favicon: simple vector mark that remains recognizable at 16×16; no embedded remote asset or script.
- Pin the final binaries in `source-manifest.json` and inspect actual social crops before release.

## Verification

1. Deploy the exact reviewed artifact to the owned HTTPS domain.
2. Fetch the raw HTML without JavaScript and confirm title, description, canonical, robots, Open Graph, Twitter and JSON-LD.
3. Test the URL in major social-card debuggers and Google's Rich Results Test.
4. Validate `robots.txt` and `sitemap.xml`, then submit the sitemap in Google Search Console.
5. Measure mobile Core Web Vitals on a real device/network and inspect the rendered hero.

## Highest-value content opportunities

1. A source-faithful guide: “How to document an idea before using AI,” with the timestamp/legal limits stated clearly.
2. A synthetic walkthrough: human starting point → verified timestamp → exact model disclosure → preserved AI contribution.
3. A comparison page explaining provenance/control versus ordinary chat history, timestamp-only services and generic BYOK workspaces without attacking competitors.
