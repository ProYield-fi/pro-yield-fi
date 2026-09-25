# Raising customer APY — the honest lever list

Owner question (2026-09-24): *"Thinking outside the box of blue-chip lending, could we provide a
higher APY by offering different/more products, or by changing the portfolio balance?"*

Short answer: **yes, there are real levers — but almost every extra point of yield is bought
with additional risk, capacity limits, or contract surface.** Our job is to take the *cheap*
levers first, make the *expensive* ones explicit and opt-in, and never hide risk inside a
headline number. This doc ranks the levers under the standing constraints: lending-first
mandate, non-custodial only, no leverage beyond the delta-neutral funding sleeve, and the
owner's minimize-attack-surface rule.

**Blended-yield math to keep in view** (illustration, current observed rates): core lending
~5.3% at 85% weight + funding sleeve ~11% at 15% weight ≈ **6.2% blended** vs 5.3% pure core.
The levers below move either the weights or the per-venue rates.

---

## L1 — More venues within the lending whitelist (cheap, first)

Same product, more supply: more audited lending markets on *already-used* protocols (e.g.
additional Aave/Morpho/Sky markets — USDT pairs and newer collateral often price +0.5–2% over
USDC-core), plus whitelisted expansions per chain as we add chains (Arbitrum, Base).
- **Bar stays the same**: audited, non-custodial, TVL ≥ $50M, named sources.
- **Effort**: config + whitelist + allocation balancer — *no new contracts*.
- **Effect**: typically +0.5–1.5% blended. Lowest risk-adjusted cost on the list.

## L2 — Allocation policy & user-level profiles (product lever)

Today's structure: core lending 80% · fixed-rate (Pendle PT) 10% · satellites 10% (hard caps,
in code). Options:
- **Raise caps** — a policy/risk decision, not a code trick. Cheap to do, changes the product's
  risk story; only with the risk-disclosure copy updated in the same breath.
- **Risk-profile tiers (recommended shape)**: *Core* (pure 90%+ lending) · *Balanced* (default,
  current policy) · *Boost* (user opt-in: satellite cap raised toward the DN sleeve + PT
  slots). Every tier shows its own live blended rate before opting in.
- **Effect**: opt-in dependent; Boost users see the funding-sleeve rate at fuller weight.

## L3 — Multi-venue funding harvest (the DN sleeve, widened)

The delta-neutral pattern (spot + offsetting perp short) is venue-portable: Hyperliquid
(today — deepest ETH/BTC funding ≈ 11%), dYdX v4, Drift (Solana), Vertex (Arbitrum), plus
newer books (Aevo, Paradex, Lighter) whose rates are often *higher but capacity-tiny*.
- **Effort**: each venue = new adapter + keeper wiring + reconciliation — directly contrary to
  the minimize-contracts rule; add **one at a time, after the sleeve outgrows HL's depth**.
- **Honest caveats**: funding is two-sided (it can pay *us* or *cost*); smaller venues carry
  venue/oracle/withdrawal risk; cross-venue harvesting invites execution complexity.
- **Effect at scale**: +0–3% on the sleeve, mostly as *diversification*, not free yield.

## L4 — Productized basis vehicles as a satellite (wrap, don't build)

Instead of running the trade ourselves everywhere, a **capped satellite** could hold an
established basis product (e.g. sUSDe-style tokens) — one ERC-20, no new perp infrastructure.
- **Trade-off**: you inherit someone else's execution + custodian model (their hedge lives on
  CEXes). It is *not* the same trust profile as our non-custodial DN sleeve — treat as a
  satellite with its own disclosure, never as "lending".

## L5 — Fee-recycling amplification (already live, keep squeezing)

60% of realized fees recycle to depositors; maker rebates and protocol-side rewards add a
little on top. Modest, but it compounds goodwill and effective APY without new risk.

## L6 — Points/airdrops as a sweetener (already tracked)

The airdrop-radar job tracks drops across the venues we use. This is a *bonus channel*, not
APY — never pitch it as yield.

## What we deliberately do NOT do

- No leverage beyond the delta-neutral sleeve; no directional trading; no "safe 12%" lending
  venue that is actually a token emission paying itself.
- No custody (rules out CEX perp books for the sleeve — the trade must remain on-chain).
- No raising caps silently: any policy change ships with updated risk copy + disclosure.

## Recommended sequence

1. **L1 now** — widen the lending whitelist on existing protocols (no new contracts).
2. **L2 tiers** — design the Boost opt-in tier ahead of vault launch; ship with disclosure.
3. **L3** — rehearse a second funding venue in testnet; wire it only when HL depth caps us.
4. **L4** — evaluate one productized-basis satellite post-launch, capped, separately labeled.

Every step of this keeps the public story literally true: *principal in blue-chip lending; the
funding sleeve capped and labeled; nothing paid for with hidden risk.*
