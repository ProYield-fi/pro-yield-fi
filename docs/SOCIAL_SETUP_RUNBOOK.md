# Social setup runbook — LinkedIn / Instagram / Reddit / Discord (pre-broadcast)

Verified 2026-09-24 from the box (how: LinkedIn calibrated against a known company,
Instagram via the public `web_profile_info` API, X via syndication, Telegram via Bot API).

## Handle availability — facts

| Platform | Handle to claim | Status | Verified how |
|---|---|---|---|
| X | `@ProYieldFi` | EXISTS (0 followers, unused) | syndication API |
| Telegram | `@ProYieldFi` channel | EXISTS (1 subscriber) | Bot API getChat |
| LinkedIn | `linkedin.com/company/proyield-fi` | **FREE** (proyieldfi / pro-yield-fi also free) | 404 vs calibration (microsoft → 200) |
| Instagram | `@proyield.fi` | **FREE** (proyieldfi also free) | web_profile_info → user:null |
| Reddit | `u/ProYieldFi` | likely free — **couldn't verify logged-out** (Reddit blocks it); check at signup, fallback `ProYield_Fi` | — |
| Discord | server "Pro Yield" | does not exist yet (old invite was dead, removed from site) | — |

Claim the free ones soon — availability is now, not forever.

## What only you can do (phone; ~25 min total)

Platforms verify humans (phone/email + captchas); attempting bot-creation would
risk losing these exact names to a ban. So: you create, I operate everything after.

1. **LinkedIn (7 min)** — needs your personal account (any existing one works).
   Create company page: linkedin.com/company/setup/new → name **Pro Yield** →
   public URL `proyield-fi` → industry "Financial Services" → logo =
   `avatar-400.png` → tagline + About (copy below) → banner = `linkedin-banner-1128x191.png`.
2. **Instagram (7 min)** — new account, email `conduct@pyd.fi` (or any project email),
   username **proyield.fi** (or proyieldfi). Bio + avatar below. Keep personal: verify
   your phone when asked; do NOT link to personal accounts.
3. **Reddit (7 min)** — new account, username **ProYieldFi** (fallback: ProYield_Fi).
   Profile description below. Note: new Reddit accounts are rate-limited and can't post
   in big subs for days — that's fine, the account's job is the community-audit
   engagement + profile presence until it has age.
4. **Discord (2 min + optional)** — two paths:
   - **a. You create the server:** Discord → + → "Create My Own" → "For a club or
     community" → name **Pro Yield** → icon `avatar-512.png`. Then add a bot later
     (I give exact steps when created).
   - **b. I build it for you:** log into Discord in the browser on this machine once
     (the Hermes browser profile), tell me, and I'll create the server + set up
     channels/roles myself. (Your account, your server; I just drive the buttons.)
5. **X + Telegram (already yours, 5 min)** — X: create a developer app (Read+Write) at
   developer.x.com and stash keys so I can wire `xurl`. Telegram: add a bot as channel
   admin (BotFather → new bot "ProYield Bot" recommended → Manage → Administrators → Add).

## Paste-ready copy

**X bio (≤160):** `Self-custodial yield on public blockchains. Deposit USDC → blue-chip lending. Non-custodial. Sourced. Verifiable. Daily on-chain attestations. pyd.fi`

**Instagram bio (≤150):**
```
Self-custodial yield on public blockchains
Deposit USDC · earn from blue-chip lending
Non-custodial · Withdraw anytime
Every number verified on-chain ↓
```

**LinkedIn tagline (≤120):** `Self-custodial yield on public blockchains — deposit USDC, earn from verified lending venues.`

**LinkedIn About (paste as-is):**
```
Pro Yield is a non-custodial yield product on public blockchains. Depositors hold their own keys: funds go into a smart-contract vault and are allocated to verified blue-chip lending venues. No trading, no leverage, no custody.

Everything is verifiable: daily on-chain attestations publish vault TVL, share price and fee destinations with named sources — if a read fails, the page says so instead of guessing. The beta runs under hard caps enforced in code while the public community audit (github.com/ProYield-fi/pro-yield-fi) proceeds; the audit gates future cap raises.

Deposit USDC, withdraw anytime. Learn more at pyd.fi
```

**Reddit profile description:** `Building ProYield — self-custodial USDC yield on HyperEVM. Numbers: pyd.fi/transparency · Open community audit: github.com/ProYield-fi/pro-yield-fi/issues/1`

**Discord server name/desc:** `Pro Yield — Self-custodial yield on public blockchains. Announcements, daily transparency numbers, support. pyd.fi` (my planned channels: #welcome, #announcements, #transparency (bot), #support, #off-topic)

## Assets (ready to upload, in ~/hypervault/brand/social/)

| File | Use |
|---|---|
| `avatar-400.png` | universal avatar (X, IG, LinkedIn, Reddit) |
| `avatar-512.png` | Discord server icon, hi-res |
| `avatar-256.png` | Reddit/or wherever a 256 is requested |
| `linkedin-banner-1128x191.png` | LinkedIn company banner |
| `x-header-1500x500.png` | X profile header |

## After creation — tell me, and I do:

1. Verify every new handle publicly (curl/API checks — same as today) and wire the site
   footer/nav/landing links in one commit.
2. Automation per platform (honest matrix):
   - **X** — full posting via `xurl` (needs the developer-app keys) ✅
   - **Telegram** — full posting via bot ✅ (needs bot-as-channel-admin)
   - **Discord** — full control via bot API (channels, posts, welcome) ✅ once server exists
   - **Reddit** — posting via script-app OAuth ✅ possible; but r/ rules vary — engagement-first, ask-before-promoting in any sub
   - **Instagram** — automatable only via API-connected Business account + FB page (heavier; ~days of setup) → **phase 2**; until then I prepare posts, you paste
   - **LinkedIn** — company-page API posting needs Marketing-Platform approval (restrictive) → **semi-manual** for now (I draft, you paste)
3. First posts drafted for your approval (intro post + pinned transparency explainer), THEN we broadcast — nothing goes out before every link on the site resolves.
