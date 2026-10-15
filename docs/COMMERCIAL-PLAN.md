# Commercial Plan

Status: proposed operating model, not a live offer. Prices, entitlements, taxes, refunds and legal terms are not activated in the product.

## Positioning

WHOAYO is the evidence and control layer for building with AI. A user records the human starting point before disclosure, verifies the selected timestamp, approves the exact material leaving the private workspace, and preserves what each model contributed afterward.

The differentiator is not “another AI chat.” Self-hosted multi-model workspaces already compete on BYOK access, local storage, agents and approvals. Timestamp products also compete on document proof. WHOAYO combines a pre-disclosure gate, exact-request consent, contribution lineage and exportable evidence while deliberately avoiding ownership, originality and patent claims.

Primary job to be done:

> Help a founder or R&D team use external AI without losing track of what they had first, what they disclosed, and what the AI added.

Initial ideal customers:

- solo founders and inventors preparing prototypes, pitches or partner conversations;
- agencies and consultants who must distinguish client source from AI-assisted work;
- small R&D teams that need approval and evidence before model disclosure;
- innovation programs that need a repeatable, reviewable intake workflow.

Do not initially target regulated enterprises, patent-law workflows, large shared organizations or autonomous production coding. Those require controls not yet live.

## Offer ladder

The public repository is the adoption engine: a no-charge AGPL-3.0-only local/self-hosted foundation. The proposed managed service sells convenience, governed provider access, recovery, support and operational accountability. Model usage would be purchased at provider API rates and included behind a fixed retail tier with hard internal allowances; customers are not promised unlimited usage. No special wholesale contract or provider discount is assumed.

Proposed post-gate tiers:

| Tier         | Monthly price | Proposed direct AI allowance | Intended buyer               | Must exist before sale                                                       |
| ------------ | ------------: | ---------------------------: | ---------------------------- | ---------------------------------------------------------------------------- |
| Builder      |           $99 |                          $20 | one founder/researcher       | managed identity, verified recovery, billing, cost guard, support terms      |
| Studio       |          $249 |                          $50 | high-activity founder/agency | Builder gates plus higher usage, export support and response-time commitment |
| Organization |          $799 |                         $160 | small governed team          | real organization membership, roles, shared projects and tenant tests        |

The allowance is an internal COGS ceiling, not store credit or a quoted token amount. Model mix, tools, caching, regional processing and provider price changes alter what it buys. When an allowance is exhausted, stop cleanly and offer an upgrade or separately approved add-on; do not run an uncontrolled overage tab.

An optional paid design-partner enrollment can fund onboarding and evidence review during a limited pilot, but one-time fees must be reported separately from recurring revenue. The durable target below is recurring recognized revenue.

## $10,000/week model

`operations/unit-economics.json` is the source of the proposed mix; `npm run check:business` calculates and tests it.

| Tier         | Target accounts | Monthly revenue |
| ------------ | --------------: | --------------: |
| Builder      |             175 |         $17,325 |
| Studio       |              75 |         $18,675 |
| Organization |              10 |          $7,990 |
| **Total**    |         **260** |     **$43,990** |

That equals **$10,151.53/week** using monthly revenue × 12 ÷ 52. Modeled direct COGS are $18,208.45/month, producing **58.60% gross margin**, $5,949.58 weekly gross profit and an $8,185.55 monthly buffer before the 40% floor is breached.

Direct COGS in the model include the AI allowance, variable hosting/storage, directly attributable support, timestamps/other variable services, and payment processing at a planning assumption of 2.9% + $0.30 per successful transaction. Stripe currently publishes that headline U.S. online-card rate, but actual payment-method, international, tax, dispute and refund costs can differ. Fixed product development and general overhead are tracked below gross profit, not hidden inside the margin claim.

## Margin policy

- Contractual floor: 40% gross margin measured on recognized revenue.
- Operating target: at least 55% trailing four-week gross margin.
- Warning: projected trailing margin below 50%.
- Hard response: pause promotions/high-cost routes and review pricing before projected margin falls below 45%.
- Never count a missing provider usage record as zero cost.
- Review the price catalog on every provider/model change and at least monthly.

## Go-to-market loop

### 1. Prove activation with 10 design partners

Recruit manually from founder, agency and innovation-program networks. Observe the complete activation event: record one real idea, verify a timestamp, approve one bounded AI disclosure, save one AI-derived artifact, and export evidence. Do not accept material whose handling requirements exceed the pilot architecture.

Exit criterion: at least 7 of 10 complete activation without operator rescue, zero private-data incidents, and at least 5 return in week two.

### 2. Turn proof into public education

Publish source-safe demonstrations using synthetic concepts. Lead with “know what was yours before AI” and show the exact disclosure-review moment. Create founder checklists, provenance examples and short build-with-AI case studies. Never publish a customer's idea, receipt package or identifying usage data without separate written permission.

### 3. Build the conversion path

Repository visitor → local quickstart → synthetic sample → waitlist/design-partner call → managed pilot → paid tier. Each step needs one primary action and one evidence-based success metric.

### 4. Add repeatable channels

- GitHub discovery: clear README, screenshots, issues, release notes and a one-command local start.
- Founder communities: educational demonstrations, not ownership claims.
- Partner channel: IP attorneys, incubators and product studios as referral sources, with clear non-legal positioning.
- Content/search: “document idea before AI,” “AI contribution history,” “private AI disclosure approval,” and “AI provenance workspace.”

Paid acquisition waits until activation, four-week retention and contribution margin are demonstrated.

## KPI contract

Primary outcomes:

- weekly recognized recurring revenue;
- trailing four-week gross margin using reconciled direct COGS;
- weekly gross profit.

Funnel:

- repository unique visitors → quickstart completions;
- quickstart → activated workspace;
- activated workspace → qualified managed-pilot request;
- pilot → paid conversion;
- four- and twelve-week paid retention.

Activation is one workspace completing all five steps: idea recorded, timestamp verified, exact disclosure approved, AI response preserved, evidence exported. A registration or page view is not activation.

Unit economics:

- provider cost per completed AI request and per activated workspace;
- P50/P90 direct COGS by tier;
- uncertain reservation rate;
- support minutes and infrastructure cost per paid account;
- expansion, contraction and churned monthly recurring revenue.

Trust guardrails:

- cross-tenant access incidents: target zero;
- unverified timestamp or ownership claims presented as verified: target zero;
- provider calls without a valid reservation in hosted mode: target zero;
- successful monthly restore exercise and backup-age target;
- customer disclosures sent without current exact approval: target zero.

## Decisions still owned by the founder

The founder must approve the license, exact public repository destination, final customer prices, pilot enrollment fee, refund/cancellation policy, tax treatment, legal entity/merchant account, public support contact, terms/privacy notice and production vendors. No customer should be charged before the hosted launch gates in `HOSTED-LAUNCH.md` pass.

Market and cost references checked October 14, 2026:

- [GitHub community profile requirements](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/about-community-profiles-for-public-repositories)
- [Stripe pricing](https://stripe.com/pricing)
- [OpenAI API pricing](https://developers.openai.com/api/docs/pricing)
- [Anthropic Claude Sonnet pricing](https://www.anthropic.com/claude/sonnet)
- [Orchestra: local-first multi-model workspace](https://github.com/aleksbuss/orchestra)
- [OpenSelf: local-first context and provenance](https://github.com/Open-Self/Open-Self)
- [PrivacyFence: approval gateway](https://github.com/privacyfence/privacyfence)
- [Wemux: open-source/community plus hosted split](https://github.com/wemux-ai/wemux)
