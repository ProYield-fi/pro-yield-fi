# Community & launch plan — draft v1 (2026-09-24)

Status of the accounts (checked from the box, 2026-09-24):

| Platform | Handle | State |
|---|---|---|
| X | `@ProYieldFi` | EXISTS — 0 followers, never used. Site link OK. |
| Telegram | `@ProYieldFi` (channel "Pro Yield") | EXISTS — 1 subscriber. Site link OK. Bot NOT yet admin → agent can't post yet. |
| LinkedIn | `company/proyield-fi` | FREE (verified) — to claim |
| Instagram | `@proyield.fi` | FREE (verified) — to claim |
| Reddit | `u/ProYieldFi` | likely free (check at signup) — to claim |
| Discord | "Pro Yield" server | not created yet — deferred (old invite was dead; link removed from site) |

**Full setup steps, paste-ready bios and the automation matrix: `docs/SOCIAL_SETUP_RUNBOOK.md`.**

## Recommendation: five surfaces before broadcast (X, TG, LinkedIn, IG, Reddit), Discord after

- **X + Telegram = the live feed.** Daily attestation posts + weekly recaps; Telegram mirrors X. Zero moderation burden.
- **LinkedIn = credibility surface** for the professional/audit audience (company page, verified info, community-audit call).
- **Instagram = presence/visual** — thin for a B2C-DeFi product, but the name should exist before noise starts (impersonation defense).
- **Reddit = the account that can engage** in relevant threads once it has age; its first real job is the community audit (issue #1).
- **Discord = after cohort 1 exists.** It costs moderator attention; re-add the site link when there are actual users asking for a chat space.
- **Name-consistency rule:** every platform either `ProYieldFi` (no dots allowed) or `proyield.fi` (dots allowed) — never variants like "proyield_official".

## The two things only you can do (phone, ~10 minutes total)

1. **Telegram (2 min):** create a dedicated bot for the project — talk to `@BotFather` → `/newbot` → name it (e.g. "ProYield Bot") — OR just add the existing alert bot. Then in the channel: *Manage → Administrators → Add → [bot username]*. That's it — posting becomes automated. (Recommended: dedicated bot, so the personal alert bot isn't the public face.)
2. **X (5-10 min):** create an app for the account at `developer.x.com` (Free tier is enough to post) with **Read + Write** permissions, then hand me the credentials through a secure channel (Hermes vault / a file on the box — never in chat). `xurl` is already installed; I wire it the moment keys exist.
3. *(Optional, same trip)* — soften the channel description: it currently says "Reserve-backed protection"; until the insurance fund is seeded from fees, that overclaims slightly. Suggest: "Insurance backstop funded by protocol fees, rolling out."

## Cohort 1 — invite mechanics (works without an existing network)

Ladder (from the unlock plan): team caps today **$500 total** → Cohort 1 **$1,000/user, $10,000 TVL** (raised via a treasury-Safe tx when you say go) → Early access $5K/$50K → Scale.

1. **Warm invites first (3–5 people, this week):** people who will actually try it and give feedback. You onboard them personally: site link → sign in → deposit → withdraw. No public post yet.
2. **Public surface (after warm invites prove the funnel):** the pitch IS the verifiability — transparency page + daily attestation + the open community-review issue (github.com/ProYield-fi/pro-yield-fi issue #1). Post the attestation daily; it compounds into a public track record. Target the HyperEVM/Hyperliquid-adjacent crowd where the non-custodial narrative lands.
3. **Mechanics that need zero network:** (a) daily attestation autopost, (b) the community-audit open call (reviewers come to *you*), (c) the transparency page as a shareable proof object. No paid promo, no spam, no fake engagement — the brand is honesty, anything else undercuts it.
4. **Where to look for early users without a network:** HL ecosystem chats/Discords where project plugs are allowed (read the rules first), crypto-Twitter reply-guying under HL/DeFi-yield threads with *data* (the daily attestation is the reply), Farcaster (later, optional).

## What I automate once the two user steps are done

- **Daily attestation post** — numbers auto-filled from the published report; if a read failed that day, the post says so (or skips) — never a fabricated number.
- **Weekly recap** — numbers + what shipped (from git history + the attestation series).
- **Milestone posts** (cap raise, audit progress, TVL milestones) — drafted for your approval at first; autonomy only after a trust burn-in.
- **Ops alerts already live:** vault sentinel (deposits/withdrawals/owner/caps/pause → Telegram every 10 min), attestation failure alerts.

## Guardrails for agent posting (standing rules)

- Every number traces to a chain read or the published attestation (live-data-verification standard). No projections, no APY promises.
- Never the word "audited" until the audit exists; audit status phrase: "community review open — the audit gates the cap-raise, it does not gate the beta."
- Nothing personally identifying about users; no wallet addresses of users in posts without their consent.
- Draft-first for anything non-routine; approval queue until trust is earned.
