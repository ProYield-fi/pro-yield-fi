# PT fixed-rate sleeve — design + build record (2026-09-26)

**Status: BUILT + UNIT/INTEGRATION-TESTED (forge 31/31 new, 100/100 suite).
NOT yet deployed. Mainnet deploy + Safe wiring + first allocation are the next
explicit gate (see bottom).**

This is R2 from `docs/APY_RECOMMENDATIONS_PLAN.md`: a capped sleeve that buys
Pendle **PT (principal token)** instruments on Arbitrum and holds them — a
FIXED-RATE, principal-safe position (PT redeems at par at maturity; bought at a
discount = locked yield). It is NOT lending and NOT delta-neutral: it is a
hold-to-roll fixed-income shape, labeled as such on the site.

## Live facts (verified 2026-09-26)

### CCTP V2 (Circle) — the bridge, both directions
| Item | Address |
|---|---|
| TokenMessengerV2 (HyperEVM + Arb) | `0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d` |
| MessageTransmitterV2 (HyperEVM + Arb) | `0x81D40F21F12A8F0E3252Bccb954D722d4c464B64` |
| Domains | HyperEVM = **19**, Arbitrum = **3** |
| USDC HyperEVM | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` |
| USDC Arbitrum (native) | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` |

**Fees (live iris-api.circle.com reads):**
- HyperEVM → Arbitrum **fast** (minFinality 1000): **0.00 USDC** — use fast out.
- Arbitrum → HyperEVM **standard** (minFinality 2000): **0.00 USDC** — use standard back (~15 min).
- Arbitrum → HyperEVM fast = 1.40 USDC — avoid.

This is the answer to the old $1-bridge complaint: the CCTP corridor is
FREE both ways (only gas), vs the legacy HyperCore flat $1.

### Pendle on Arbitrum
| Item | Address |
|---|---|
| Router v4 | `0x888888888889758F76e7103c6CbF23ABbF58F946` |
| RouterStatic | `0xAdB09F65bd90d19e3148D9ccb693F3161C6DB3E8` |
| Function selectors (4byte-verified) | buy `0xc81f847a` · sell `0x594a88cc` |

Candidate markets (live API, 2026-09-26):

| PT | Market | PT token | Implied APY | Liq | Expiry |
|---|---|---|---|---|---|
| PT-USDai-15OCT2026 | `0xa8a0dea40174cfc30fea9e3a77f182ab33f46e25` | `0xc9d24ad0bb25f34098e226a8c5192dea7bacccae` | 10.0% | $50.3M | 2026-10-15 |
| PT-sUSDai-15OCT2026 | `0xcbf629c8d396b1261f81f55175afa010e94787d8` | `0xb459db106f645d698e74027eef6019a26a0675cc` | 12.2% | $11.5M | 2026-10-15 |
| PT-sUSDai-25FEB2027 | `0xf86119a39f8654f38acbbd5488bd83f3f51983c8` | `0xe9d07c2a3588b9a25edd55664be44ecfe5f92fce` | 9.9% | $3.9M | 2027-02-25 |

Market choice is a CONFIG (executor `setMarket`), not code. Underlying = USD.ai
(credit-structured) — PT is the SENIOR tranche (paid before YT at maturity);
credit DD note (R3) still applies to how much we're willing to hold.

## Architecture

```
        HyperEVM (999)                                Arbitrum One (42161)
┌──────────────────────────────┐              ┌──────────────────────────────┐
│ ProYieldVault                │              │ PTSleeveExecutor             │
│   │ allocate()               │              │   ops: buyPT/sellPT          │
│   ▼                          │              │        bridgeBack (fixed dst)│
│ PTSleeveStrategy             │              │   owner: Safe 2/3 (market,   │
│   │ deployToArb(amt)         │              │          ops, rescue)        │
│   │  └─ CCTP burn ───────────┼── fast, $0 ──▶ executor gets USDC           │
│   │ completeInbound(attest.) │              │   └─ Pendle Router           │
│   │  ◀── standard, $0 ───────┼── burn back ─┤      swapExactTokenForPt    │
│   │ pushIdle / recall        │              │      swapExactPtForToken     │
└──────────────────────────────┘              └──────────────────────────────┘
```

Files:
- `contracts/PTSleeveStrategy.sol` — HyperEVM, vault-facing (extends BaseStrategy).
- `contracts/arbi/PTSleeveExecutor.sol` + `contracts/arbi/PendleTypes.sol` — Arbitrum side.
- `contracts/mocks/MockCctp.sol`, `contracts/mocks/MockPendleRouterMin.sol` — test doubles.
- `test/forge/PTSleeve.t.sol` — 31 tests.

## Flows

**Out:** vault `allocate()` → strategy holds USDC → keeper `deployToArb(amount, maxFee≤$2)`
→ CCTP burn to the IMMUTABLE executor address (fast, $0) → keeper observes arrival.

**Buy:** keeper (ops key) → `executor.buyPT(usdc, minPtOut)` → PT held by the executor.
Slippage bound is caller-supplied AND router-enforced.

**Value:** keeper `syncArbValue(value6)` — attested as `PT balance × market rate + Arb idle`.
Hard bound: `value ≤ arrivedFace × (1 + headroomBps/10000)`, headroom default 20%
(hard-capped 30%). The keeper can never inflate the book beyond what left HyperEVM.

**Roll (pre-expiry, ≥3 days):** keeper `sellPT(all, minUsdcOut)` → USDC on executor →
owner (Safe) `setMarket(next)` if the maturity changed → `buyPT(next)`. Rolls happen
on-Arb: gas only (cents), no bridge fees.

**Recall:** vault `recall()` pays idle only; any shortfall is recorded in
`pendingRecall6` (the Arb leg is ~15 min by design — the vault's liquid reserve +
`_recallShortfall` covers users meanwhile). Keeper then: `sellPT` → `syncArbValue(idle-only)`
→ `bridgeBack(all, maxFee 0, standard)` → wait attestation → `completeInbound(msg, att)`
(PERMISSIONLESS — mint lands only on the strategy) → `pushIdle()` → vault made whole.

## Accounting invariants (all forge-proven)

- `totalAssets() = idle + inFlight6 + arbValue6` — never counts a dollar twice.
- `sentFace6`, `retFace6` monotonic; `arbPrincipal6 = sent − ret`.
- `inFlight6` counts face until the keeper acks arrival; ack alone transiently
  UNDER-counts (safe direction) until the next `syncArbValue`.
- `completeInbound` subtracts the received amount from `arbValue6` — the returned
  cash replaces the attested value 1:1, gains realized exactly once.
- Guards: `ack ≤ inFlight`; `sync ≤ arrivedFace × (1+headroom)`; `maxFee ≤ $2`;
  `min bridge $5`; burn recipient + return recipient IMMUTABLE; ops can only
  buy/sell/burn — config + rescue are owner (Safe) only.

## Ops runbook (keeper)

1. `deployToArb` (fund) — or skip while TVL small (min $5; policy will scale it).
2. After ~30 s: check executor USDC (Arb RPC) → `ackArrival(amount)`.
3. `buyPT(amount, minPtOut = quote × 0.995)`.
4. Daily/every-6h: `syncArbValue(pt × rate + arbIdle)`.
5. Before expiry − 3 days: sell → setMarket (if needed) → buy.
6. On `pendingRecall6`: unwind + return as in “Recall”.

## Economics at size (why the math works now)

Fixed ~10–12% + fee-free bridge. Drag = Arb gas (~$1–2/yr) + roll slippage
(~0.1% per roll, keeper-controlled mins). At $100 sleeve: net ≈ 9–11%. The old
$1-each-way bridge would have eaten ~20% of a $100 sleeve's yield — that was the
blocker; CCTP removes it.

## Deploy gates (next, explicit)

1. Deploy `PTSleeveExecutor` to Arbitrum (owner = treasury Safe `0x8A1b107e…`; ops = keeper key).
2. Deploy `PTSleeveStrategy` to HyperEVM (owner/keeper as existing strategies; `arbExecutor` = (1)).
3. Safe: whitelist/activate strategy; vault `allocate()` a SMALL first slice (e.g. 10% of book);
   run the full loop once (fund → buy → sync → observe accrual) before the tier re-ladder ships.
4. Site/feed: add the strategy to `write_vault_status.js` deployment reads when it holds value.
