# Social copy kit — paste-ready bios, first posts, cadence

Companion to `SOCIAL_SETUP_RUNBOOK.md` (handles + setup steps + assets live there).
Everything here is **paste-ready**: nothing goes out until every link resolves and you approve.
Voice: dry, honest, anti-hype. The product's personality is "boring is the point".

---

## 1. Bios (character-counted)

**X (≤160)** — 153:
```
Self-custodial yield on public blockchains. Deposit USDC → blue-chip lending. No trading, no custody. Daily on-chain attestations. pyd.fi
```

**Instagram (≤150)** — 140:
```
Self-custodial yield on public blockchains
Deposit USDC · earn from blue-chip lending
Non-custodial · Withdraw anytime
Every number verified ↓
```

**LinkedIn tagline (≤120)** — 106:
```
Self-custodial yield on public blockchains — deposit USDC, earn from verified lending venues.
```

**LinkedIn About** (paste as-is) — same as runbook; keep one home:
> Pro Yield is a non-custodial yield product on public blockchains...

**Threads / Bluesky / wherever a one-liner is requested:**
```
USDC yield from blue-chip lending. No trading, no custody, daily on-chain attestations.
```

**Telegram channel description (≤255):**
```
Pro Yield — self-custodial USDC yield on public blockchains. Daily on-chain attestations, honest numbers (failed reads say so), community audit open. pyd.fi · Not investment advice.
```

**Discord server description:**
```
Self-custodial yield on public blockchains. Announcements, daily transparency numbers, support. pyd.fi
```

**Reddit profile description:**
```
Building ProYield — self-custodial USDC yield on HyperEVM. Numbers: pyd.fi/transparency · Open community audit: github.com/ProYield-fi/pro-yield-fi/issues/1
```

---

## 2. First posts

### X — pinned intro
```
Pro Yield is live — a guarded, capped beta.

You deposit USDC. It's lent to blue-chip borrowers (Aave · Sky · Morpho). The interest is yours.
No trading. No leverage. No custody — the keys stay in your wallet, withdraw anytime.

Every number published & attested daily → pyd.fi
```

### X — daily transparency template (rotate details)
```
Day N of publishing everything.

Vault TVL: $___
Deposits: ___ wallets · Share price: $___
Fees taken: $0 — none until the audit closes

Attestation (raw): pyd.fi/attestations/latest.md
Community audit: github.com/ProYield-fi/pro-yield-fi
```
Rule: post the real numbers, gaps included ("a read failed today — page says so"). Never round up, never skip a bad day.

### X — how-it-earns explainer (thread opener)
```
Where does the yield actually come from?

Not trading. Not points. Not "strategies".

Borrowers pay interest to borrow stablecoins. That interest is the yield.

Which venues, what rates, what sources: pyd.fi/transparency
```

### LinkedIn — launch post (founder voice, long-form)
```
We're building Pro Yield, and the pitch is deliberately boring: a non-custodial vault that lends stablecoins to blue-chip venues and publishes every number.

Three decisions worth explaining:

1) Non-custodial, always. Users hold their own keys; the vault contract moves funds only on their signature. We can't withdraw anything — by design.

2) No trading. The previous version of this product traded. Trading didn't survive contact with real costs, so we shut it down instead of marketing it. Yield now comes from lending — Aave, Sky, Morpho — plus a capped, opt-in fixed-rate sleeve.

3) Verification over trust. Daily on-chain attestations publish vault TVL, share price and fee destinations with named sources. If a read fails, the report says so. The community audit runs in public: github.com/ProYield-fi/pro-yield-fi.

The beta is capped small in code on purpose — capacity raises as the audit closes findings.

Not investment advice; DeFi carries real risk (contract exploits, depegs). Read more: pyd.fi
```
Hashtags (pick 3): #DeFi #stablecoins #fintech #selfcustody

### Instagram — first post caption
```
Boring is the point. 🧱

Pro Yield lends your USDC to blue-chip protocols — the ones that have handled billions — and publishes every number on-chain, daily.

No trading. No custody. Withdraw anytime.

Beta caps are small on purpose. Community audit is open. Link in bio.
#defi #stablecoins #selfcustody #yield
```

**IG grid plan (first 6 posts, phase 2 automation later):**
1. Brand card — "Boring is the point." (logo on navy)
2. How it earns — 3-step explainer (from the site's dashboard art)
3. Numbers card — screenshot of the attestation report
4. "What we'll never do" — 4 removals (trading/leverage/custody/hidden fees)
5. Behind the audit — screenshot of GitHub issue #1
6. Team/kicker — "Small first. Verified first. Then scale." + pyd.fi

### Reddit — intro post (r/defi-style, check each sub's rules first; value-first)
```
Title: We built a non-custodial USDC vault that does exactly one thing (blue-chip lending) — and we publish daily on-chain attestations. Looking for hard feedback.

Body:
The pitch: deposit USDC, it's lent on Aave/Sky/Morpho (+ an opt-in capped fixed-rate sleeve via Pendle), no trading, no leverage, keys stay yours.

The interesting part is the transparency layer:
- Daily attestations generated from independent chain reads (TVL, share price, fee destinations) — if a read fails, the report names it instead of guessing.
- A public community audit repo with the contracts, tests, and reproduction scripts: [link]
- Beta caps are small and enforced in code; the audit findings gate the cap raises.

We're not promising a rate — the dashboard shows what the market pays today and where every figure comes from.

What would you poke holes in first?
```
Rule: engage with criticisms, never delete, never shill in replies.

### Telegram — first channel message (pin)
```
Welcome to Pro Yield.

What this channel is: daily transparency numbers (auto-posted from the on-chain attestation), release notes, and audit updates. Support happens in Discord.

Rules of the road: we never promise returns. Numbers here are sourced and dated — if something fails to read, it says so. Not investment advice.

Site: pyd.fi · Audit: github.com/ProYield-fi/pro-yield-fi
```

### Discord — #welcome post (after server setup, once bot added)
```
**Welcome to Pro Yield** 🌱

- #announcements — releases & milestones
- #transparency — daily attestation bot posts (raw report link)
- #support — questions, we answer fast
- #off-topic — the fun stuff

House rules: no shilling, no price talk about $PYD (it's a utility token — nothing is promised), be kind.

Verify anything: pyd.fi/transparency
```

---

## 3. Cadence (post-claim)

| Platform | Frequency | Content | Automation |
|---|---|---|---|
| X | 3–5 / week | transparency days, product notes, audit updates | full auto via `xurl` (needs dev-app keys) |
| Telegram | daily | auto attestation post + announcements | bot (needs bot as channel admin) |
| Discord | as needed | announcements, support | bot once server exists |
| LinkedIn | 1–2 / week + milestones | long-form, build-in-public | semi-manual (I draft → you paste) |
| Instagram | 2–3 / week | visual cards (grid plan above) | semi-manual → phase 2 API |
| Reddit | opportunistic | audit-thread replies, value posts | script OAuth possible; rules-first |

Weekly rhythm: Monday — numbers recap (X + TG auto); Wednesday — explainer/education; Friday — build-in-public note (LinkedIn); weekend — quiet or community.

---

## 4. Voice rules & guardrails (non-negotiable)

1. **Never promise a return.** "What the market pays today, sourced" — always.
2. **No price talk about $PYD.** Utility only; terms "under review" until shipped.
3. **Numbers or it didn't happen.** Every figure carries a source + date, or isn't posted.
4. **Bad news gets posted too.** Failed reads, delays, findings — first, not last.
5. **No financial advice language.** Add "Not investment advice" where the platform expects it (LI/IG/Reddit/TG).
6. **No emojis in numbers posts**; light use (🧱 actually sparingly) elsewhere.
7. **Never engage scammers publicly beyond one clear correction**; report/block, don't feed.
8. **Referral program** = Hyperliquid's system; mention only where facts are published (dashboard/FAQ). No "earn passive income" framing.

---

## 5. Assets (in `~/hypervault/brand/social/`)

`avatar-400.png` (universal) · `avatar-512.png` (Discord) · `avatar-256.png` ·
`linkedin-banner-1128x191.png` · `x-header-1500x500.png`

---

## 6. When accounts are live — checklist

- [ ] Claim: LinkedIn company page → IG → Reddit (phone, ~25 min; runbook has the steps)
- [ ] X dev-app keys + TG bot admin → tell me → I wire `xurl` + bot, then *verify every handle publicly*
- [ ] I wire footer/nav/landing links in one commit (Testimonial block already links X + TG — extend with LI/IG/Reddit)
- [ ] First posts go out: X pinned intro + TG welcome + LI launch (your approval each)
- [ ] Day 1 after: first transparency post (X + TG auto)
