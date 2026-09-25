# ProYield Site — V2 Blueprint (whole site, top to bottom)

**Status:** greenlit by owner 2026-09-24. P0 dashboard pass shipped same day (commit `58ed23c`, prod-verified). This doc = scope + design system + page plan + build order for the full-site V2.
**Local-only** until we decide to publish (like the other docs in this folder).

## 0. Owner directives (2026-09-24)

- V2 of the **whole site top to bottom**
- **Keep referral earnings** surfaces
- **Keep the scrolling animations**
- **A splash more colour** overall
- **Zero redundant info**
- Include **everything else we'd need** (don't drop features in the redesign)
- **Tier system** displayed + explained to users (discounts etc.)
- Non-crypto-user friendly: the "how much is in / how much it earns / why" story; graphs; pro figures (total & unrealized PnL) behind progressive disclosure

## 1. Design system V2

### Colour — "a splash more, tastefully"

Base stays deep navy (`--background: 222 47% 11%`). Add:

| Token | Value (HSL) | Role |
|---|---|---|
| `--brand-2` | `267 85% 66%` (violet) | depth accent: gradients, chart series, secondary chips |
| `--brand-3` | `166 72% 47%` (emerald) | money/positive: earnings, success, donut "earning" segment |
| `--warn` | `43 74% 66%` (amber) | caution chips, "under review" honesty |
| tier colours | Base gray · Bronze `25 60% 55%` · Silver `220 12% 75%` · Gold `45 80% 55%` · Platinum `270 60% 70%` | tier badges only |

Usage rules: colour lives on numbers, chips, icons, gradients, charts, and subtle section backdrops — never on body text below AA contrast. Landing sections get a soft radial tint rotating cyan → violet → emerald; hero + final CTA get the gradient glow.

### Motion (keep + codify)

- Keep framer-motion scroll reveals exactly as restored (elements start visible at 0.85, never invisible — per `index.css` note).
- Spec: section headers fade/rise in once; card grids stagger ~60ms; count-up numbers only on first load per session; `MotionConfig reducedMotion="user"` stays global; single "Live" pulse is the only loop.

### New/upgraded primitives

`StatusChip` (one Live status, variants live/syncing/offline) · `MetricTile` (+ "Show pro figures" toggle pairing) · `MoneyDonut` (allocation; centre = earning %) · `DetailsAccordion` (transparency blocks) · `TierBadge` (two visually distinct families: strategy tiers vs $PYD tiers) · `EmptyState` (honest) · auth-state CTA helper.

## 2. Redundancy rules ("zero redundant info" contract)

1. A number appears **once per view** (hero owns "your money"; tiles derive, never duplicate).
2. **"Live" appears once** (header chip).
3. **One CTA per state per view** (signed-out: Sign in; linked: one Get Early Access; earning: Add money / Withdraw).
4. Explanatory copy has **one home**: landing explains "how it works"; dashboard shows a 3-line "how it earns"; deep details live on Transparency / Risks / Security (no repeats).
5. Venue rates: one component, max two placements (landing strip + dashboard details) — same component, no fork.

## 3. Page-by-page plan (KEEP lists = do not drop)

### Landing (/)
11 section components. **KEEP all**: Hero, HowItWorks, SixWaysToEarn, LiveStats, VaultCapacity, SecuritySection, ComparisonTable, TrustBadges, Testimonial, FAQ, CTASection.
**V2:** hero gradient + colour; LiveStats → single tidy strip (one Live); dedupe FAQ vs Risks/Security overlap; keep scroll reveals; add **strategy-tier explainer strip** (Conservative→Maximum) near SixWays/HowItWorks; keep **referral program** block.

### Dashboard (/dashboard)
Implement the approved mockup: merged wallet+vault hero, metric tiles + pro toggle, MoneyDonut, "how it earns" 3-liner, details accordion (venues / fees / protection / market context / **referral**), simplified activity.
**KEEP:** ReferralCard earnings, attestation link, protection status, fee transparency, market context.

### Token (/token)
**KEEP:** tier tables (Base→Platinum rebates), "under review" honesty, fee model. **V2:** tier colour badges, design-system alignment; cross-link staking tiers ↔ dashboard membership badge (ship badge only when utility ships).

### Vault / Account (/account)
The "just sign up → deposit → withdraw" surface. **V2:** one-purchase simplification (owner flagged multi-token gas friction), clearer deposit/withdraw states, status chips. Privy flows unchanged.

### Transparency / Performance / History
**V2:** colour-coded charts, unified table styling, one Live, honest empty states. Content unchanged.

### About / Risks / Security / FAQ* / Terms / Privacy
*FAQ may live only in landing — verify. **V2:** shared section patterns, typography alignment, copy dedupe (Risks owns risk language). Content kept.

### Join / Auth / 404
Consistency pass only. 404 gets a real page with brand art instead of a bare fallback.

## 4. Build order & gates

| Wave | Scope |
|---|---|
| 1 | Design tokens + primitives + CTA/status patterns (global, low-risk) |
| 2 | **Dashboard V2** (mockup implementation — the centerpiece) |
| 3 | Landing V2 (colour splash + section discipline) |
| 4 | Token + Transparency + Vault |
| 5 | Remaining pages |
| 6 | Cross-site redundancy + state audit + mobile pass |

Gates per wave: `npx vitest run` + `npm run lint` + `npx vite build`; deploy via push to main; production verify with DOM probes + pane screenshots (pattern established in the P0 pass).

## 5. Completeness checklist ("everything we'd need")

- [ ] Referral earnings kept (dashboard + landing + token)
- [ ] Tier systems displayed: strategy tiers explainer + $PYD membership badges — separate, never conflated
- [ ] Scroll animations retained + consistent
- [ ] Colour pass (tokens + section tints + charts + tier badges)
- [ ] Zero-redundancy audit per page (numbers / Live / CTAs / copy)
- [ ] Mobile + responsive pass (esp. ribbon at 400–720px; venue table inner-scroll at ≤400px)
- [x] Per-page SEO titles/descriptions (react-helmet) — DONE 2026-09-25: all 14 routes carry the `SEO` component; Auth + Join were the last two (added with `noIndex` — login and redirect pages must not be indexed).
- [x] Loading / error / empty states — data pages audited + `/history` rewired to the one money source (2026-09-25)
- [ ] Social links wired when accounts go live (per SOCIAL_SETUP_RUNBOOK)
- [ ] Accessibility: contrast, focus rings, reduced-motion honoured
- [ ] Performance: lazy routes stay; keep an eye on the Privy chunk
- [ ] Insurance/coverage display (policy C: honest "not yet funded" until fees activate)

## 6. Open questions (non-blocking)

1. Colour intensity: tasteful splash (planned) — or bolder?
2. Any landing section you never want? (trim candidates: Testimonial, TrustBadges, ComparisonTable — all kept unless told otherwise.)
3. Referral block on landing: keep current copy or show earnings examples?

## 7. Immediate next actions

1. ~~Mock the two tier blocks into `docs/mockups/dashboard-v2.html`~~ **DONE 2026-09-24** — "V2 preview — tier displays" section added (strategy tiers with live-rate estimates + $PYD membership chips); screenshot `docs/mockups/dashboard-v2-tiers.png`; vision-verified at 920px, wraps cleanly at 420px (cards will stack 1-col <480px in the real build).
2. ~~Wave 1 (tokens + primitives) then Wave 2 (Dashboard V2) on the live site.~~ **V2 DASHBOARD SHIPPED 2026-09-24** — commits `9c9bbe5` + `8888cb4` (pro-yield-web), deploy run `36077759431`, live bundle `Dashboard-nnyJzwfv.js` marker-verified; accent tokens (violet/emerald/warm) live in `index.css` + `tailwind.config.js`. Local verification: 20/20 DOM assertions (signed-out), signed-in pane check, 0px overflow at 1280/430.
3. **WAVES 3–6 SHIPPED 2026-09-24 (same day)** — commit `bb3b631`: Landing V2 (new TierStrip section; TrustBadges rewritten as "What we'll never do" to dedupe SecuritySection; hero/CTA violet+emerald glows; VaultCapacity copy updated to the live guarded beta). Global `AuthCta` primitive (auth-aware signup CTA) swapped into Hero/VaultCapacity/CTASection/About/Token/History. Token: 5-tier card arrays fixed (Crown icon + violet Platinum ring; a 4-icon array had left the 5th tier undefined), membership chips aligned to the on-chain PYDFeeDiscount terms (Bronze 5 / Silver 10 / Gold 15 / Platinum 20). Real 404 page. **Site-wide sweep** (28 route×width combos, signed-out): zero overflow at 390/1280, zero render errors; `~/\.hermes/cache/scratch/pyd-ux/sweep-v2.js`.
4. **Remaining:** social links for LinkedIn / Instagram / Reddit once the handles are claimed (user phone step; X + Telegram + GitHub wired; dead Discord invite removed from index.html structured data 2026-09-25); IG/LI automated posting = phase 2. **CLOSED 2026-09-25:** per-page SEO (all 14 routes incl. Auth/Join); loading/error states (History rewired to /api/portfolio activity — trading-era P&L UI removed; data pages audited); **Privy chunk deferred** (loads only on auth routes / first user intent / returning signed-in hint; queued sign-in clicks open the modal once ready) — fresh landing 1,045,773 B → 411,395 B (−61% incl. the auth.privy.io iframe no longer loading for anonymous visitors), verified live.

*(Companion docs: `DASHBOARD_UX_AUDIT.md` — defect evidence + P0 record; `MONEY_FLOW_UX.md` — money-flow spec; `NEW_USER_JOURNEY_AUDIT.md` — journey audit.)*
