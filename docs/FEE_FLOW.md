# Money flow & fees — plain English

*Written 2026-09-23. Grounded in the contracts (`ProYieldVault.sol`, `FeeDistributor.sol`,
`PYDFeeDiscount.sol`, `PYDFunder.sol`), the recycling policy, and live on-chain measurements.*

**The one-paragraph version.** Deposits earn yield from two sources: lending markets and a
delta-neutral funding trade on Hyperliquid. The vault takes a cut of **profit only** (plus, in the
newer deployed demo build, a small fee on exit) — never on deposit. That cut recycles **60/20/20**:
60% straight back to all depositors (it raises everyone's share price), 20% to treasury operations,
20% to the insurance fund — a real 2-of-3 multisig. PYD is the loyalty layer: stake it, earn a
tiered rebate of the fees. No lockups anywhere.

## 1. Where the yield comes from (money in)

| Source | What it actually is | Status |
|---|---|---|
| Lending interest | Deposits supplied to an audited lending venue | Core — launch set |
| DN funding | Spot held + perp short = earns the funding rate; price direction cancels out | Launch set; paper-rate sim live on testnet |
| Fixed / satellite tiers | Higher-yield venues | Deferred (attack-surface discipline) |

Yield appears as **share price > 1** — your shares become *worth more*, you don't get more of them.
Live right now: testnet vault share price **1.000767**.

## 2. Fees the customer pays — only on gains or exit

| Fee | Repo build (audited / launch set) | Deployed demo (testnet) | Notes |
|---|---|---|---|
| Deposit fee | **0** | **0** | Free to enter, always |
| Performance fee | **10% of profit** (1000 bps; owner-settable, can be set to 0) | 1% (100 bps) | Charged at harvest, on *gains only* |
| Withdraw / exit fee | **0** | **0.5%** (50 bps — measured on-chain) | The repo build charges none |
| Management fee | none | none | No rent-on-balance, ever |

Site copy currently says *"Platform fees: 0% during early access"* → **decision needed** (below).

## 3. Where the fees go — the 60/20/20 recycling

Worked example, $100 profit at a 10% fee → $10 fee taken at harvest → split:

| Slice | Amount | Destination | Purpose |
|---|---|---|---|
| 60% | $6 | Straight back to depositors | `vault.creditYield()` — raises every depositor's share price. Not cash to insiders. |
| 20% | $2 | Treasury | Operations, audits, bounties |
| 20% | $2 | Insurance fund | User-protection reserve — Safe multisig `0xFDF3269972DFe490E5c6DF3A0b9eeC6C3a272d88`, 2-of-3 |

Chain of custody: vault `harvest()` → performance fee → `FeeDistributor.receiveFees()` → recycler
splits per policy (`recycle_policy.json`: `depositor_boost 60 · treasury 20 · insurance 20`) and
routes with per-slice tx hashes in the ledger.

Real numbers (testnet sandbox, 4 recycled runs): **181.47 USDC** recycled → insurance slice
**36.29 USDC** → coverage **1.186 FULLY_COVERED**.

## 4. PYD — the loyalty layer

- Stake PYD → tiered rebate of fees: **≥1k = 5% · ≥10k = 10% · ≥100k = 15% · ≥1M = 20%**.
  Pro-rata and budget-bounded: `shares × feeDelta × tierBps / (totalShares × 1e4)`.
- `PYDFunder`: converts collected USDC fees → PYD reward streams to stakers ($1,000 per call,
  $25k program cap). This is the demand leg.
- Bounties and audits: paid from reputation and then revenue — **never** from PYD.

## 5. Partner money (pass-through — no markup)

- On-ramp (Coinbase CDP): the provider charges its own fee; any affiliate kickback passes through
  to users as a lower effective cost.
- Maker rebates / protocol fee shares: recycled to users before any treasury allocation.
- Hyperliquid referral: monitor-only today.

## 6. What is live where (today)

| Stack | Chain | Fees actually active | Recycling wired? |
|---|---|---|---|
| Repo build (launch set) | sandbox + testnet rehearsal | 10% perf (settable) | Yes — FD → recycler 60/20/20, ledgered |
| Deployed demo generation | HyperEVM testnet | 0.5% exit + 1% perf → collector `0xA6c93FeD…` | No — collector interface differs from the repo FD; funds accumulate |

## 7. Decisions (recorded 2026-09-23)

1. **Fee model: RESOLVED — the repo build's model ships.** Performance fee **10% of profits only**
   (charged only when the vault is up); **no deposit fee, no exit fee, no management fee**.
   Rationale: it beats the demo generation's model (1% perf + 0.5% exit) at any turnover below
   ~1.8× TVL/yr, and an exit fee would literally violate the published "never a fee on principal"
   promise for anyone who exits flat. The site's fee surfaces (dashboard Fee Transparency, landing
   FAQ, token Revenue Sharing + Our Commitments) were updated to state this concretely and
   deployed 2026-09-23.
2. The 0.5% exit fee observed on-chain is a demo-generation artifact only; the launch set (repo
   build) never charges it.
3. Fee % and the 60/20/20 split remain owner-settable — revisit at launch if desired.