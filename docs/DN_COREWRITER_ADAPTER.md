# DN CoreWriter Adapter — Design (kicked off 2026-09-20)

**Goal:** convert the delta-neutral sleeve from simulated funding accounting
(`DeltaNeutralStrategy.sol` + `MockFundingOracle`/`MockFundingSource`) into a
real position: short perp hedge on HyperCore, funded and accounted by the
vault on HyperEVM — fully non-custodial, no off-chain signatures.

## Why CoreWriter

HyperCore perps are not EVM contracts. Historically a strategy would need a
keeper with an agent wallet signing `/exchange` orders (custody-adjacent).
Since the CoreWriter system contract (`0x3333...3333`, `sendRawAction(bytes)`),
an EVM contract can send HyperCore actions **as its own address** — the
contract IS the HyperCore actor. That means:

- The hedge position is held by the strategy/adapter contract's Core account.
- No agent wallet, no order signing, no custody of principal by a keeper.
- Keeper's only job: poke contract functions + verify outcomes (liveness, not trust).

## Architecture

```
┌─────────────────────────── HyperEVM (chain 999) ───────────────────────────┐
│  ProYieldVault ──> DNCoreAdapter ──(USDC approve/deposit)──> CoreDepositWallet
│                        │                                            │
│                        │ sendRawAction(bytes)                       │ EVM→Core
│                        ▼                                            ▼
│                 CoreWriter 0x3333...3333 ═══════════> HyperCore (spot USDC)
│                        ▲                                    │ usdClassTransfer
│  reads (precompiles):  │                                    ▼
│  0x813 position · 0x80f margin · 0x803 withdrawable      perp USDC
│  0x80a szDecimals · 0x807 oraclePx · 0x810 userExists       │ limitOrder (short)
│                        │                                    ▼
│  dn_keeper.js ──(verify + poke)──────────────────────> BTC/ETH short position
└────────────────────────────────────────────────────────────────────────────┘
```

## Money flow (staged — sequencing is mandatory)

1. **Bridge in** — `bridgeUsdcToCore(evmAmount)`: approves USDC to the
   CoreDepositWallet (`0x6B9E...0A24` mainnet) and calls `deposit(amount, SPOT_DEX)`.
   USDC lands in the contract's Core **spot** balance.
2. **Class transfer** — `moveUsdcToPerp(ntl)`: action 7, spot → perp wallet.
3. **Hedge** — `openShort(asset, limitPx, sz, tif)`: action 1, IOC or tight GTC.
4. **Unwind** — `closeShort(...)` (reduceOnly buy) → `moveUsdcToSpot` →
   `bridgeBackToEvm(wei)` (action 13 `sendAsset` to the USDC system address
   `0x2000...0000`). **Requires HYPE on Core for transfer gas.**

### Critical sequencing rule (learned from Chainstack docs)

The contract's HyperCore account must **exist before the EVM block is built**
that carries the action — a bridge-in *in the same block* does NOT initialize
in time and the action is silently dropped. Keeper must therefore:

```
tx1: bridgeUsdcToCore()            // initializes Core account
wait ≥1 block
tx2: moveUsdcToPerp()              // + openShort()
```

The adapter enforces `coreAccountRequired` (via `0x810 coreUserExists`) on every
action so a pre-init call **reverts loudly** instead of dropping silently.

## Silent-drop rules (all enforced or verified)

CoreWriter is fire-and-forget: `sendRawAction` succeeds whether or not
HyperCore accepts the action. Drop causes and our mitigation:

| Cause | Mitigation |
|---|---|
| Core account not initialized | `coreAccountRequired` modifier (reads 0x810) |
| Funds on wrong side (spot vs perp) | staged flow; keeper verifies spot/perp balances between steps |
| Size violates `szDecimals` | keeper reads `0x80a` before sizing; adapter checks notional only |
| Order below $10 min notional | adapter reverts below `MIN_ORDER_USD6` |
| Checked too early (few-seconds action delay) | keeper waits ≥1 block + re-reads before concluding |
| Malformed encoding | unit tests assert exact bytes vs known vectors |

## Addresses (mainnet / testnet)

| Item | Mainnet | Testnet (998) |
|---|---|---|
| CoreWriter | `0x3333...3333` | same |
| USDC (EVM) | `0xb88339CB7199b77E23DB6E890353E22632Ba630f` | `0x2B3370eE501B4a559b57D449569354196457D8Ab` |
| CoreDepositWallet | `0x6B9E773128f453f5c2C60935Ee2DE2CBc5390A24` | `0x0B80659a4076E9E93C7DbE0f10675A16a3e5C206` |
| USDC system addr | `0x2000...0000` (base + token index 0) | same |
| HYPE system addr | `0x2222...2222` | same |

Read precompiles: 0x800 position (legacy), **0x813 position2** (current),
0x803 withdrawable, 0x806 markPx, 0x807 oraclePx, 0x80a perpAssetInfo,
0x80f accountMarginSummary, 0x810 coreUserExists.

## Actions used

| ID | Action | Use |
|---|---|---|
| 1 | Limit order | short open/close (IOC or tight GTC) |
| 3 | Token delegate | HYPE staking (fee-discount path, see below) |
| 4 | Staking deposit | ditto |
| 5 | Staking withdraw | ditto |
| 7 | USD class transfer | spot ↔ perp USDC |
| 11 | Cancel by cloid | stale order cleanup |
| 13 | Send asset | Core → EVM USDC return |

## Fee-discount path (bonus finding)

Staking actions (3/4/5) are available through CoreWriter, so the **contract
itself can stake HYPE** and its own trading fees earn the HL staking discount
(>10 HYPE = 5%, >100 = 10%, >1,000 = 15% …). No EOA/agent needed. Sequence:
HYPE (native) bridged to Core → `stakeHype(wei)` → `delegateHype(validator, wei)`.
Decision pending owner sign-off on size + validator.

## Roles & limits

- `owner` — policy: keeper, caps, pause, perp asset selection (flat-position guard), staking.
- `keeper` — operational: bridge, class transfers, orders, cancels. Cannot change policy.
- `maxActionUsd6` cap per action; `MIN_ORDER_USD6 = 10e6` ($10, HL minimum);
  `perpAsset` single-asset restriction; `paused` kill switch.

## Vault wiring — DNCoreStrategy (2026-09-20)

`contracts/DNCoreStrategy.sol` is the vault-integrated version of the adapter
pattern (`is BaseStrategy`). The standalone `DNCoreAdapter.sol` remains the
byte-exact-encoding reference; **consolidate both into a shared execution base
before the audit**.

### Accounting model (honest-yield discipline)

| Field | Meaning |
|---|---|
| `corePrincipal6` | net USDC sent to Core — **never counted as yield** |
| `coreEquity6` | Core account value, refreshed by `syncCore()` (0x80f read) |
| `profitRealized` | profit **bridged back** to EVM (amount above remaining principal at bridge-back time) |
| `profitSwept` | profit already sent to the vault |
| `bufferBps` | liquidity buffer (default 1500 = 15% of assets stays idle on EVM) |

- Profit on Core = `equity − principal`. `bridgeBackToEvm(amount)` syncs first,
  then splits: principal first, excess = profit. **Losses realize nothing** —
  no fake profit paths (mirrors the Sky/Morpho audit fixes).
- `harvest()` by the **vault** sweeps `min(harvestable, idle − buffer)` as real
  USDC to the vault (performance fee + share price handled by the vault).
  By the **keeper** it only syncs (settle, no movement).

### Async recall design

CoreWriter actions are fire-and-forget + delayed seconds, so the strategy
cannot unwind synchronously inside a vault withdrawal:

1. **Buffer** (15%) covers ordinary recalls instantly — `BaseStrategy.recall`
   (vault-only) transfers idle balance.
2. **Larger recalls**: keeper unwinds first (`closeShort` → `moveUsdcToSpot` →
   `bridgeBackToEvm`), waits ≥1 block + action delay, verifies via `coreState()`,
   then the vault can recall. If idle is insufficient, the vault withdrawal
   reverts (correct — cannot pay assets that don't exist).

### Keeper duties (dn_keeper.js)

`syncCore` → funding read → `BRIDGE_PROFIT` (bridge back profit portion) →
`vault.harvest()` (permissionless) → verify every action after the delay.
Open/rebalance sizing still needs the allocation-policy hookup (TODO).

## Test strategy

- **Now (this repo, anvil 8545):** unit tests with mocked CoreWriter + read
  precompiles via `anvil_setCode` at the fixed addresses — asserts exact action
  bytes, role gates, caps, staged flow, drop-prevention. `scripts/dn_adapter_tests.js`.
- **Next:** `hyper-evm-lib` ships a Foundry engine that simulates HyperCore
  locally — adopt for integration-level tests before testnet.
- **Then:** testnet journey (funded contract → bridge → hedge → unwind),
  then the paper-gate replay, then audit, then mainnet.

## Open questions (before production)

1. Hedge asset: BTC (index 0) vs ETH (index 1) — pick by funding APR + OI depth.
2. Sizing: per-sleeve target notional vs vault NAV; rebalance band (±X%).
3. Margin management: top-up policy when the short runs against us; liquidation distance monitoring.
4. Negative funding policy: unwind threshold vs ride-through buffer.
5. L1 block / big-block requirements for contract deploys (30M gas big blocks opt-in via `evmUserModify`).
6. HYPE-on-Core gas balance for `sendAsset` returns (small buffer, refill policy).
7. Adopt full `hyper-evm-lib` (audited helper set) vs vendored subset before audit.

## References

- Chainstack: Write to HyperCore from a contract with CoreWriter (action table, prerequisites, timing)
- Hyperliquid docs: Interacting with HyperCore (precompiles, CoreWriter encoding)
- `hyperliquid-dev/hyper-evm-lib` (MIT): CoreWriterLib, PrecompileLib, HLConstants, HLConversions
