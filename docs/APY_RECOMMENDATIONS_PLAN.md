# APY recommendations — staged plan (2026-09-26)

Owner decision (2026-09-25/26): *"do your recommendations … if doing all this can really push
up our apy that we offer users, then maybe its a good thing as long as its calculated."*

This file is the concrete staging of that decision. Nothing here changes user-facing numbers
until the sleeves it names actually exist on-chain (honesty rule: no tier rates for venues we
don't run).

## Live inputs (2026-09-26, DefiLlama + HL reads)

| Source | Now | 30d avg | Capacity | Status |
|---|---|---|---|---|
| Morpho Blue USDC (HyperEVM) — **live** | 4.13% | — | $13.8M | lending core, live |
| HL funding ETH/BTC/HYPE — **live sleeve** | 10.95% / 9.49% / 10.95% | 10.1 / 9.3 / 9.1 | $148M / $158M / $94M | roster allows rotation |
| HL funding ZEC / ENA / TAO / NEAR | 10.95 / 48 / 40 / 3.4 | 12.4 / 15 / 19 / 18.7 | $38M / $7.5M / $4.9M / $19M | rotation candidates (roster) |
| Pendle PT fixed — sUSDAI (Arb) | 12.0% fixed | — | $11.5M | **needs sleeve build** |
| Pendle PT fixed — USDAI (Arb) | 10.2% fixed | — | $50M | needs sleeve build |
| USD.AI sUSDai (Arb) | 7.5% | 7.1% | $506M | credit-structured — **DD first** |
| accountable USDC (Monad) | ~11.7% | 6.8% | $75M | new chain — later |
| tori / unitas | 12.5 / 11.6% | — | $45M / $34M | below $50M floor — watchlist only |
| sUSDe | 4.7% | — | $1.3B | compressed; not interesting |

Scenario math (Conservative inputs 4.1% lending / 11% funding / 12% PT):
100% lending → 4.1% · 70/30 → 6.2% · 55/25/20 → 7.4% · 50/30/20 → 7.8% · 30/30/40 → 9.3%.
**10% is reachable only with ~70–75% non-lending — that is not "Conservative".**

## Recommendations → staging

### R1 — funding-sleeve cap + rotation (ALREADY PARTLY LIVE)
- Roster: 9 verified coins (BTC/ETH/SOL/XRP/HYPE/PUMP/ZEC/MON/XMR) — `scripts/dn_roster.json` ✓
- Rotation path: `scripts/dn_rotate_prep.js TARGET=<coin>` + keeper `rotationAdvice` ✓
- **Staged (not yet done): raise the DN policy weight 0.15 → 0.25.** Touches:
  1. `yield_scout` blend source for DELTA_NEUTRAL.weight (the audit checks website blend == scout blend)
  2. `hypervault/scripts/dn_keeper.js` `DEFAULT_DN_WEIGHT`
  3. Re-run `ecosystem_audit.js` (blend parity check)
  - Effect at current scale: none (sleeve dormant below HL minimums). Effect at TVL ≥ ~$40: sleeve deploys 25% instead of 15% — blended +≈0.7–1.2pp.
  - Gate: do it together with R2 so the tier preview numbers ship once, honestly.

### R2 — PT fixed-rate sleeve (BUILT 2026-09-26 — deploy pending)
- Real adapter built + forge-tested: `PTSleeveStrategy.sol` (HyperEVM) + `PTSleeveExecutor.sol`
  (Arbitrum) + `PendleTypes.sol`; 31 new forge tests (suite 100/100); battery 12/12.
  Bridge = Circle CCTP V2, **$0 both ways** (fast out / standard back) — the old $1 flat fee is gone.
  See `docs/PT_SLEEVE_DESIGN.md` for addresses, selectors (4byte-verified), flows, accounting invariants.
- Next gate (explicit): deploy executor (Arb) → strategy (HyperEVM) → Safe whitelist →
  first small allocation (~10% of book) → watch one full loop (fund → buy → sync) before
  the tier re-ladder ships.

### R3 — USD.AI class (DD FIRST, no build)
- Credit-structured (borrower default risk is the yield source). Requires: audit review, custody/structure review, venue cap ≤15%, case-by-case.
- Follow-up task: write `docs/USDAI_DD.md`; do not integrate before it passes.

### R4 — no blanket sub-$50M floor relaxation
- tori/unitas class stays watchlist; per-name carve-in only after DD (same as HyperLend carve-in precedent).

### R5 — guardrails unchanged
- Non-custodial · no directional bets · no leverage on the lending core · sleeve stays hedged & labeled.

## Tier re-ladder (SHIP ONLY WHEN R1+R2 EXIST)
- Conservative 70/30/0 → ~6.2% · Balanced 55/25/20 → ~7.4% · Growth 40/35/25 → ~8.3% · Maximum 30/40/30 → ~9.1%
- (Today's shipped ladder: Conservative 100% lending 4.1% · Balanced 85/15 5.2% · Growth 70/30 6.2% · Maximum 50/50 7.5%.)

## Ops-seed handback (DONE 2026-09-26, for the record)
- ~$9.2 of ops seed sat inside the DN sleeve as the HYPE hedge; returned to the ops wallet
  `0x8377…67a9` via `scripts/ops_seed_handback.js` (close short → spot-send the seed-sized slice).
- Books after: real 26.390087 vs booked 26.390016 (over-backed $0.00007). Sleeve left dormant at
  ~$3.22 with the keeper on policy sizing (`DN_TARGET_USD=0` — revives itself at TVL ≥ ~$67).
