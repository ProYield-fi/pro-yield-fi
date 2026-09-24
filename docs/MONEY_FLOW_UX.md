# Money-flow UX + honest growth — design spec

Owner ask (2026-09-24): *"make it simpler for the user to understand where the money is going
and what is coming back, even with a simple flow chart… think about the gamify → putting money
in and watching it grow!"* Plus the standing pin: the dashboard must never confuse layers (the
"$0.00 deposited vs $24.61 wallet" whiplash).

This spec answers it in two pieces: a **money-flow ribbon** (orientation) and a **growth card**
(motivation). Both are drawn ONLY from real, sourced numbers; this is design, not a numbers
mockup.

---

## 1. The money-flow ribbon ("where your money is, right now")

One horizontal ribbon at the top of the dashboard. Every node = a real place money can be,
with a live number and a state chip. The active node carries the *next action*.

```
┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
│ ① Card / │ → │ ② On-ramp │ → │ ③ Your    │ → │ ④ Vault   │ → │ ⑤ How it  │ → │ ⑥ Interest│
│   bank   │   │  (Coinbase│   │  wallet   │   │  deposit  │   │  earns    │   │  back to  │
│          │   │  delivers)│   │           │   │           │   │ core + DN │   │  you      │
└──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘   └──────────┘
   done ✓        done ✓          $24.61        opens with      lending +      +$0.0x/day
                                ACTIVE         early access    DN sleeve      (when live)
```

Node contract (states: `done` · `active` · `ahead` · `locked`):

| Node | Live number | Source | State today |
|---|---|---|---|
| ① Card/bank | — (action node) | on-ramp flow | done if any on-ramp purchase |
| ② On-ramp | USDC delivered | Arbitrum USDC balance | done when > 0 |
| ③ Your wallet | wallet total | /api/portfolio (HyperCore + spot + Arb) | active (money sits here) |
| ④ Vault deposit | vault share balance | /api/portfolio → vault read | `opens with early access` chip until mainnet-at-audit; testnet demo separate |
| ⑤ How it earns | core lending mix + rates; DN sleeve when funded | rates.json + vault reads (sourced) | ahead |
| ⑥ Interest back to you | daily accrual | vault share-price series | ahead |

Rules:
- **One active node only.** Its CTA is the single primary button on the page ("Move to vault",
  "Buy USDC", etc.). Everything else is informational.
- **No dead ends:** a node that isn't open yet shows WHY in one honest line ("vault deposits
  open with early access — your money stays in your wallet until then"), never a red error.
- **The $0.00 fix:** the ribbon replaces the standalone "Your Deposit $0.00" hero. Money that is
  real shows on node ③; the vault node shows a state chip, not a fake zero balance.
- Numbers update on the existing 30 s poll; failed reads → `—` + named source (standing rule).

### Taxonomy — DN is a sleeve, NOT "lending" (owner check 2026-09-24)

"Blue-chip lending" means exactly that: being a lender to borrowers on Aave/Sky/Morpho-style
venues. The **delta-neutral (DN) sleeve is not lending** — it harvests funding rates via spot +
an offsetting perp short on Hyperliquid: market-neutral, but derivatives, with venue/execution
risk of its own. The product separates them on purpose:

- the core promise "no trading, no leverage" stays literally true **for the principal**;
- the DN sleeve is a capped, separately-labeled module, funded at launch per the attack-surface
  plan ("last thing added, first thing unwound") — never folded into the lending number;
- UI rule: wherever DN appears it appears under its own name ("market-neutral funding sleeve"),
  with "not lending" stated wherever there is room.

### CTA rules — state-derived, never a fixed "next step"

The ribbon's CTA is computed from account state; a hardcoded CTA line is a bug:

| State | CTA |
|---|---|
| Anonymous | "Sign in to start" |
| Signed in, no linked wallet | "Link your wallet (read-only) to light this up" |
| Linked, empty wallet | "Buy USDC — one purchase covers gas" (on-ramp) |
| Linked, funded, vault closed | "Your money is live" + "Get Early Access" |
| Linked, funded, vault open | "Move to vault" (the single primary action) |

## 2. The growth card ("watch it grow")

A savings-app growth module under the ribbon, built on the **real series** the attestation job
already writes daily (`/attestations/series.json`, vault-level) and the user's own balance
history (per-user snapshots, below).

Elements (all derived, none cosmetic):
1. **Growth line** — vault share price (or user balance once deposits open) over time, from the
   daily series. Honest empty state: *"Your growth line starts the day your first deposit
   lands."*
2. **Today ticker** — `+$0.02 today` computed from the latest two snapshots; shows `—` when flat.
3. **Streak** — "earning N days" counted from real accrual days only (days with a positive
   change). Milestones at 7/30/90 days.
4. **Milestones** (one-time, real events only): first purchase · first deposit · first $1
   earned · first month. Small, quiet, verifiable chips — no confetti currency, no points.
5. **Compare-to-nothing honesty:** no invented "projected earnings" curves. If asked "what will
   I earn", show the sourced current venue rate and say it moves with the market.

Gamification guardrails (hard rules):
- No timers, no streaks-at-risk pressure, no losses/lives, no push-notification nagging.
- Every milestone maps to a real money event; every number opens to its source on hover/click.
- Tone: calm savings-app ("watch it grow"), never casino.

## 3. Data plumbing

| Need | Have | Add |
|---|---|---|
| Wallet/vault balances | /api/portfolio ✓ | vault node reads (testnet demo first) |
| Vault daily series | attestation `series.jsonl` ✓ (live) | — |
| Per-user daily series | — | daily snapshot: reuse the gas-drip cron pattern; store one row/day/user in D1 (`portfolio_snapshots`), written from the same read path as /api/portfolio |
| Rates | rates.json ✓ | — |

## 4. Build phases

- **Phase A (next):** `MoneyFlowRibbon` on the dashboard — nodes ①–③ live today, ④–⑥ as honest
  `ahead` chips. Replaces the confusing deposit hero.
- **Phase B:** growth card per-user line once snapshot job exists (works on testnet demo
  balance first).
- **Phase C:** flip ④–⑥ to `active` at mainnet vault launch (audit gate).

## 5. Acceptance checks (when built)

- A brand-new user can point at the ribbon and say where their money is within 5 seconds.
- Nothing shows $0.00 as a *balance* for money that simply lives elsewhere.
- Every number on both modules resolves to a named source; failures read `—`, never 0.
- No dark patterns in code review (grep for timers/notifications in the section).
