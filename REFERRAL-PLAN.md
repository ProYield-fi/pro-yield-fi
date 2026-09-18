# Pro Yield — Referral Revenue Plan (Actionable Now)

## What We Can Build NOW (no dependencies)

### 1. Referral Code Generation System
- Unique codes per user (e.g., PYD-X7K2M format)
- Generated at signup/deposit time
- Stored in users table (add referral_code column)

### 2. Referral Tracking
- Add `referral TEXT DEFAULT ''` to deposits table
- Track which user referred which depositor
- Store referral code on each deposit record

### 3. Reward Calculation
- Define commission rate (suggestion: 10-20% of first deposit or yield share)
- Proportional: referrer earns % of referred depositor's yield
- Track accumulated rewards per referrer

### 4. Dashboard Integration
- Add referral code field to deposit form (web frontend)
- Pass referral through deposit metadata

### 5. Referral Dashboard (basic)
- Show your referral code
- Show referrals count and earned rewards
- Show pending vs claimed rewards

## What Needs You

### 6. HL Partner Enrollment (DONE ✅)
- ✅ Registered — partner code **PROYIELD** confirmed
- ✅ Wired into deposit form — auto-attached on every deposit
- ✅ Build verified — PROYIELD inlined into production bundle
- Partner account active, awaiting rebate data

## Database Schema Changes Needed

```sql
-- Add referral_code to users
ALTER TABLE users ADD COLUMN referral_code TEXT DEFAULT '';
CREATE INDEX idx_users_referral ON users(referral_code);

-- Add referral to deposits (already exists in waitlist but NOT in deposits)
ALTER TABLE deposits ADD COLUMN referral TEXT DEFAULT '';

-- Add referrer rewards tracking
CREATE TABLE IF NOT EXISTS referral_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_id TEXT NOT NULL,
  referred_id TEXT NOT NULL,
  deposit_id INTEGER,
  reward_usdc REAL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','claimed')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY (referrer_id) REFERENCES users(id),
  FOREIGN KEY (referred_id) REFERENCES users(id),
  FOREIGN KEY (deposit_id) REFERENCES deposits(id)
);
```

## Revenue Math

| Scenario | Referral Rate | Deposits | Revenue |
|---|---|---|---|
| HL partner (1% bonus) | 1% of deposit | 100 × $1K | $1,000/mo |
| HL partner (2% bonus) | 2% of deposit | 100 × $1K | $2,000/mo |
| Our own referral (10% yield share) | 10% of yield | 100 × $1K × 5% | $500/mo |
| Combined | Both | 100 × $1K | $1,500-2,500/mo |

## Priority Order

1. **HL partner enrollment** (user) — without this, no HL referral revenue
2. **Database migration** (I build) — add referral columns
3. **Code generation system** (I build) — unique codes per user
4. **Vault integration** (I build) — referral field in deposit flow
5. **Reward calculation** (I build) — track and distribute
6. **Referral dashboard** (I build) — basic stats page

## What to Tell You After Deposit

Once you deposit ($20-$200):
- Test referral tracking with real deposit
- Connect fee_distributor.py to HL rebate address
- [x] Test fee-to-insurance flow — implemented (insurance_fund.py)

All of this can start immediately — no waiting for mainnet or audit.
