# Pro Yield — User Referral Rewards (What Users Earn)

## Two Referral Paths

### 1. Hyperliquid Partner Referral (Code PROYIELD) — Zero User Cost
This is the HL partner code auto-attached to every MoonPay deposit URL. Hyperliquid pays Pro Yield a rebate (typically 1-2% of deposit amount) for each user who deposits via our link. **The user pays nothing extra and gets no direct reward** — this is our revenue stream.

### 2. User-to-User Referral Rewards — Coming Soon (P2-3)
Users who share their unique referral code and bring new depositors earn a share of platform revenue. Design:

| Referrer Action | New User Deposits | Referrer Earns |
|---|---|---|
| Share referral link/code | $100+ deposit | ~10-20% of deposit amount in USDC |
| Share referral link/code | $1K+ deposit | ~10-20% of deposit amount in USDC |
| Share referral link/code | Ongoing deposits | Ongoing yield share from their deposits |

**Reward source**: Fee recycling pool — HL maker rebates, Polymarket rebates, and future referral commissions flow through fee_distributor.py and are partially allocated to referrers.

**Key principles**:
- No fee on user principal — rewards come from fee income only
- Proportional distribution — more referrals = bigger share
- USDC payouts — no token speculation required
- Claimable via dashboard — pending → claimed status tracking

## Current State

| Referral Path | Status | User Reward |
|---|---|---|
| HL Partner (PROYIELD) | ✅ Active | Pro Yield earns rebate (user pays nothing) |
| User → User referral | P2-3 (not built) | ~10-20% of referred deposit in USDC |
| $PYD fee share | P2 (not live) | 50% of fees to stakers |

## Revenue Flow (When Fully Live)

```
User A refers User B → User B deposits $500
                          ↓
                    HL rebate: ~$5-10 (1-2%)
                          ↓
            Fee distributor collects rebates
                          ↓
            ├─ 10-20% to User A (referral reward)
            ├─ Remainder to fee recycling pool
            └─ Recycled into higher-yield strategies
```

## Where This Is Documented

- **RevenueSharing.tsx** — 50% to stakers, rebate recycling
- **OurCommitments.tsx** — Fee Recycling commitment (rebates → higher yield → users)
- **Auth.tsx line 228** — "Earn a share of platform revenue from every user you refer"
- **ReferralCard.tsx** — HL PROYIELD status display
