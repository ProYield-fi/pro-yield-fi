# Pro Yield — Dashboard UX Audit & v2 Direction

**Date:** 24 Sep 2026 · **Status:** P0 fixes **SHIPPED & verified in production** 24 Sep (commit `58ed23c`, deploy run 36011374804 — no ribbon overflow at 641–1280px; signed-in CTA/Live cleanup live). v2 concept pending owner review; P1 items below remain open.
**Inputs:** live site `pyd.fi/dashboard` (signed-in, linked wallet) · dashboard source (`src/components/dashboard/*`, 18 files) · DOM geometry probes at 9 viewports (320–1280px) · vision-reviewed screenshots · competitor research (fintech + DeFi savings apps) · `MONEY_FLOW_UX.md` spec · `NEW_USER_JOURNEY_AUDIT.md`
**Companion mockup:** `docs/mockups/dashboard-v2.html` (open in browser; toggle the 3 preview states)

---

## TL;DR

1. **5 confirmed defects** worth fixing now — one is a measured layout bug (the money-flow ribbon overflows its card by up to **61px** between 641–720px viewports and forces a page-level horizontal scroll below ~700px).
2. **The dashboard is written for the author, not the depositor.** It currently carries trading-era vestiges, repeats the same words and numbers on 3–4 surfaces, and buries the one number a saver cares about ($17.82, sitting in their wallet) in a side panel while the main money surfaces read "$0.00".
3. **v2 direction** (mockup attached): one number, one CTA, three metrics, one growth chart, one allocation donut, plain-words explainer — everything technical behind progressive disclosure. Header gets the linked wallet + the single live status (your idea — adopted).

---

## 1. What's wrong today (verified, evidence attached)

### 1.1 Confirmed defects

| # | Issue | Evidence | Priority |
|---|-------|----------|----------|
| D1 | **Money-flow ribbon overflows its card.** The rightmost "Interest → you" tile bleeds past the ribbon's right edge — up to **61px** at 660px viewport; the page gets horizontal scroll below ~700px. Bug band: 641–720px. | DOM probe: at vw=660, tile right edge = 697px vs ribbon edge = 636px; `scrollWidth 697 > 660`. Vision-verified on screenshot (tile "completely crosses over" the border). `MoneyFlowRibbon.tsx` (`sm:flex-nowrap` + fixed min-widths). | **P0** |
| D2 | **"Get Early Access" shown while signed in.** At least 3 instances: dashboard banner button, platform-status "Get access →", deposit card CTA. A signed-in user with a linked wallet is asked to "get access" three times. | Live page (signed-in pane) + component source. | **P0** |
| D3 | **"Live" is everywhere and means nothing.** Used for ≥4 different indicators (ribbon nodes, platform bar, wallet panel, badges); 13 occurrences in dashboard code. When everything is "Live", nothing is. | Source grep + live page. | **P0** |
| D4 | **Money shown in 4 places, none agreeing.** Vault-only zeros fill the money area ("Deposited $0.00", "Earned —") while the user's actual money — $17.82 in the linked wallet — lives only in the wallet panel. That's exactly the "$0.00 for money that lives elsewhere" pattern `MONEY_FLOW_UX.md` bans (§2–3). | Live page + `DashboardStats.tsx`, `PortfolioHero.tsx`. | **P0** |
| D5 | **The same sentence twice.** "Venue rates verified … Model blend target: 8.16%." appears in both the Market Update panel *and* the Market Context card — identical text, two sections apart. | Live page; `MarketSentiment.tsx` + narrative source in `functions/api/data.js`. | **P1** |
| D6 | **Trading-era vestiges.** "Signal Scores" / "Coin Sentiment" modules still render when data exists; the top "Market Update" panel narrates venue-rate internals (DefiLlama source strings, blend targets) at the highest level of the page. For a lending product this is noise at best, confusing at worst. | Source (`DashboardStats.tsx` region, `NarrativePanel.tsx`, `MarketSentiment.tsx`). | **P1** |
| D7 | **Density without hierarchy.** ~17 sections before the footer, nearly all at the same visual weight; the hero (the point of the page) sits below a status banner; no single focal number; $17.82 repeats on 4 surfaces. It reads as a control room, not a savings account. | Full-page screenshot (780×4649); section inventory. | **P1** |

### 1.2 What's already good (keep it)

- The **money-flow concept** (Card → wallet → vault → earning → you) is genuinely differentiated — keep, fix, slim.
- **Transparency depth** (venues, rates, attestations, fees) — rare in this space; it just belongs one level down, not up top.
- Dark palette + monospace numerals read "fintech serious", not "crypto casino". Keep the tokens.
- Navbar is already auth-aware; fee honesty copy ("10% of profits, nothing else") is strong.
- Language is mostly plain already — it's the *structure* that isn't, yet.

### 1.3 What comparable products do (research synthesis)

**Fintech dashboards (Wise, Mercury, Stripe, Ramp; design-guide consensus):**
- **One hero number.** Balance/savings apps (Marcus, Ally, Wealthfront) show exactly 3 things up top: how much, what it's earning, and how to move money. Everything else is one tap away.
- **"What changed since last visit."** The best dashboards answer a question before it's asked — a delta since last login beats a wall of totals.
- **Progressive disclosure.** Details live behind "show me more", not on the main screen. Density should be *earned by curiosity*, not inflicted by default (role-density-action principle).
- **Honest empty states.** "Nothing yet" with the next action beats any placeholder number.
- **Graph-first for growth products.** A tiny line going up-right does more emotional work than any stat tile.

**DeFi yield apps done well (Aave, Ethena, Sky ecosystem front ends):**
- One balance + one rate + one chart; protocol detail ("supplied on…") exactly one level down.
- Non-crypto users don't need venue names, chains, or TVL up top — they need "your money is here, it's earning, you can leave anytime". Venue proof belongs in a transparency section (we have an excellent one already).

**The six questions a Pro Yield visitor actually has, in order:**
1. How much is in? → 2. What did it earn (total + today)? → 3. What's the rate, in plain words? → 4. Is it safe — where is it, can I leave? → 5. Show me it growing. → 6. How do I add/withdraw?

The mockup answers all six above the fold, in that order. PnL/unrealized etc. are there too — as *pro figures*, one toggle away, because the curious subset of users will look for them and the rest will be scared by them.

---

## 2. Proposed v2 — what the mockup demonstrates

`docs/mockups/dashboard-v2.html` — interactive, three preview states (Signed out / Linked — no deposit yet / Earning), sample figures clearly labeled.

**Structure (top → bottom):**
| Zone | Content | Notes |
|------|---------|-------|
| Header | Wallet chip (`0x8377…67a9 · read-only`) + **one** `● Live · updated 8s ago` status + account | Your suggestion, adopted. `Not signed in` + Sign in when signed out |
| Hero | **One number** (wallet + vault total) + status line + **one primary CTA** (state-driven) | Signed out: "—" + Sign in. Earning: `$1,017.82` + Add money / Withdraw |
| Money-flow ribbon | Same 5-step concept, slimmer copy; wraps gracefully; arrows auto-hide when wrapped; **no bleed at any width** | Keeps the owner-mandated ribbon; fixes D1 by design |
| Metrics | 3 tiles: Deposited · Total earned (marked *unrealized*) · Earned today + **"Show pro figures"** reveals Target rate, Withdrawn, Total PnL | All dashes with helper text when not earning; neutral color, never green |
| Growth | "Your earnings" line chart + range tabs; empty state = "your growth line starts at your first deposit" | Generates itself once deposits open |
| Where it sits / How it earns | Allocation **donut** (80/10/10, plain-language labels, distinct colors) + 3-step "in plain words" explainer | Donut dims + relabels to "target allocation" when nothing deposited |
| Activity | 3 recent rows | Empty state, no fake data |
| Details (collapsed) | Venues & live rates table · Wallet breakdown · Fees · Protection | Everything technical lives here; "sourced" lines stay one click away |

**Copy discipline rules the mockup enforces (measured, not vibes):**
- "Live" → exactly **1** visible instance.
- "Get Early Access" → exactly **1**, and only in the state that needs it; **0** while earning.
- No fabricated number in any state — verified programmatically for all 3 states (0 forbidden strings).
- No element crosses any card border at 400 / 700 / 920 at all tested widths; no page horizontal scroll.

---

## 3. Fix list for the current code (prioritized)

**P0 — fix now (small diffs):**
1. `MoneyFlowRibbon.tsx`: allow wrap below `lg` (currently `sm:flex-nowrap` + fixed min-widths → D1), hide arrow connectors when wrapped; re-verify no h-scroll down to 320px.
2. Banner: hide the "Get Early Access" button when authenticated (banner text "Balance shown when authenticated" shown *to authenticated users* is dead weight — hide the banner entirely when signed in, per D2).
3. `VaultCapacityWidget.tsx`: hide "Get access →" when authenticated (D2).
4. Consolidate all "Live" chips into **one** status element in the dashboard header (D3).
5. De-duplicate the "Venue rates verified…" sentence — keep it in the transparency/details layer only (D5).

**P1 — v2 core (moderate diffs):**
6. Hero + stats merge: show **combined wallet+vault** as the hero number for signed-in users; vault-only figures become the "in the vault" sub-line. Kills D4's four-surface disagreement. Wallet chip + status move to header.
7. Metric strip with pro-toggle (Total PnL, unrealized, withdrawn, target rate).
8. Chart + donut + "how it earns" section per mockup; simplify activity.
9. Gate trading-era modules (Signal Scores, Coin Sentiment, Market Update narration) off the lending dashboard (D6).

**P2 — full v2 layout:** adopt the mockup structure; retire legacy sections as they're replaced.

## 4. Acceptance checklist (for when v2 ships)

- [ ] Signed out: zero fabricated numbers; exactly 1 CTA; no "Get Early Access" while signed in (0 instances).
- [ ] "Live" visible exactly once on the dashboard.
- [ ] No element crosses a card boundary at any width 320–1280; no page horizontal scroll ≥400px.
- [ ] A non-crypto user can answer "how much is in / what's it earning / how do I get it back" in <5 seconds without scrolling.
- [ ] Every visible figure is traceable to a source within one interaction (details layer).
- [ ] $0.00 is never shown for money that lives elsewhere (wallet money appears in the hero).

## Appendix — evidence

- Geometry probe: viewport 660 → "Interest → you" tile right edge 697px; ribbon container right edge 636px; page scrollWidth 697. Bug band 641–720px, spill 21–61px. (Probe script + JSON in session scratch: `pyd-ux/probe-dashboard.js`, `probe.json`.)
- Screenshots: full page 780×4649 (`pyd-dashboard-desktop.png`); mockup shots at 400/700/920 for all 3 states (session scratch `pyd-ux/mock-*.png`).
- Source touchpoints: `MoneyFlowRibbon.tsx`, `DashboardStats.tsx`, `PortfolioHero.tsx`, `ConnectedWalletPanel.tsx`, `VaultCapacityWidget.tsx`, `DepositActions.tsx`, `NarrativePanel.tsx`, `MarketSentiment.tsx`, `SentimentWidget.tsx`, `src/pages/Dashboard.tsx`, `functions/api/data.js` (portfolio shape already carries `unrealized_pnl` — v2 can use it directly).
- Spec/prior art: `MONEY_FLOW_UX.md` (§2–3 money surfaces, §5 acceptance checks), `NEW_USER_JOURNEY_AUDIT.md` (register/CTA matrix).
