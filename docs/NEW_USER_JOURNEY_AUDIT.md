# New-user journey — test & audit ledger

*The path a brand-new user takes, end to end. Started 2026-09-23 with a real
CA$30 + CA$5 purchase. Each segment is marked tested / in-progress / queued.*

| # | Segment | Status | Evidence / notes |
|---|---|---|---|
| 1 | On-ramp buy via our widget (`pyd.fi/api/coinbase-session`, prod endpoint) | **TESTED ✓ 2026-09-23** | CA$30 → 21.274912 USDC on Arbitrum, zero fees, landed <2 min. UX finding: desktop passkey prompt dead-ends (“passkey not available on this device”) → “Try another way” → SMS code works. That is one extra step a user must discover — consider a hint in our funding UI (“no passkey? choose *Try another way*”). |
| 2 | Funds reach the user's own wallet (fresh address, its own key) | **TESTED ✓** | Arbitrum USDC + ETH at the test wallet; on-ramp session network is locked to Arbitrum by the token request. |
| 3 | Deposit to the venue (Hyperliquid Bridge2, Arbitrum) | **TESTED ✓** | `tx 0x0f54f788…`; credited to HyperCore in ~1 min; 21.274912 USDC. Min deposit 5 USDC. Needs a little ETH for Arbitrum gas. |
| 4 | First product trade (delta-neutral: spot + perp short) | **TESTED ✓** | 0.0039 UETH spot + 0.0039 ETH perp short @ 2685.1; net delta −0.000003 UETH; referral code attached on the fresh account (`set_referrer` once-ever call). Receipt: `~/.proyield/mainnet_trade_receipt.json`. |
| 5 | **Site login → see MY stats / deposits / history** | **VERIFIED END-TO-END IN THE PANE 2026-09-24** | Ask (owner, 2026-09-23): “login somehow to the website and be able to see my stats and deposits”. Shipped: sign-in surface (Privy email/wallet, modal verified on live), logged-out dashboard states fixed, public venue rates, **auto-forward to the dashboard after login** (owner feedback), and **phase 2: wallet binding + live portfolio** — `/api/wallet{,/challenge,/link}` (verified-session gated; EIP-191 signature proof; one-time nonce; `wallet_links` in D1) + `/api/portfolio` (live HyperCore + Arbitrum reads), link UI + Connected Wallet panel on the dashboard, self-healing session fetch (401 → refresh token → retry). Tests: 17/17 incl. a real signature round-trip. Deploy runs `35937152970`, `35939317778` ✓. E2E in the pane: challenge issued for account `did:privy:…skpdudn` → signed with the box test key (`0x8377…`) → link stored → panel read live: **est. $21.26** (HyperCore $9.27 · 1.54 USDC + 0.003897 UETH spot · ETH perp −0.0039 @ 2,685.1, liq $4,961). Deploy `35941062680` (`e80f367`) + Arb-RPC failover after a public-RPC 429. Remaining: **auth/session security audit**; on-ramp minted for the account wallet (no test-key workaround) in the finished flow. |
| 6 | Withdraw back out (vault/venue → wallet → off-ramp/CEX) | QUEUED | HL withdraw path already scripted and proven on testnet; mainnet-withdraw test to run after funds have been in place a while. Off-ramp rails exist via the same CDP token endpoint. |

## UX findings to fix in our surfaces

1. **Passkey dead-end hint** (segment 1) — add one line to the funding flow.
2. The widget's own copy does not explain the network lock; our funding page should say “your purchase lands on [chain]”.
3. **(done 09-24)** After a successful login the site parked on a “click here” card — shipped an auto-forward to the dashboard; the owner flagged this and it should never have been a manual step.
5. **(fixed 09-24)** The first surface that needed *authenticated + live data* rendered a dormant `ReferenceError` (PortfolioHero `todayCycles`/`roi`) — crashed the dashboard for the first signed-in user with live data and looked like "the site is broken" in the pane. Found by deploying an instrumented error boundary to prod. Gate for this bug class: `npx tsc --noEmit | grep "Cannot find name"` must be empty (it was 4; now 0).
4. Redeploys while a page is open can strand old chunk hashes — the app error boundary may flash “Something went wrong”; Refresh recovers (seen in the Hermes pane during deploy `7a73bfa`; expected during deploys, no action needed beyond refresh).

## Guardrails for every real-money test here

- Test wallet only; keys 0600 on the ops box (user phone holds backup for the Safes).
- Never mainnet *product contracts* before the audit locks — venue-side money movement only (this ledger).
- Every segment ends with an independent readback (tx hash / API balance / receipt file), never a self-report.

## Open workstreams (from owner feedback 2026-09-24)

1. **Dashboard audit + UX redesign** — section-by-section correctness pass on the live dashboard, then redesign: single "Your money" story (kills the deposit-$0-vs-wallet-$24.61 confusion), **money-flow diagram** (card → on-ramp → wallet → vault → blue-chip lending → interest back), gamified growth ("watch it grow": real accrual history snapshot job, daily earnings, streaks/milestones — savings-app tone, sourced numbers only, no casino mechanics).
   - Known findings so far: (a) signed-in venue table prefers the sparse API rows over sourced public rates → blank chain/TVL/APY + raw slugs; (b) PortfolioChart says "Connect your account" even when connected with no deposits; (c) "Market Context: no-trading / Health: N/A" jargon reads as broken.
2. **Gas drip = single-purchase on-ramp** — buy USDC only; app sends ~0.0003 ETH (≈$0.05–0.80; Arbitrum tx ≈ $0.001–0.02 at 0.02 gwei) to the user's wallet so the HL bridge + vault txs never need a second purchase. Caps: one drip per unique wallet, after first on-ramp, budget-capped. HL trading itself needs **zero** gas.
3. **On-ramp mints for the account wallet** — today's buy used the test key; finished flow mints the widget session for the signed-in account's wallet.
4. **Auth/session security audit** (queued by owner) — cookie/expiry, no key material, rate limits, no account enumeration.
   - **DONE ✓ 2026-09-24** — full report `docs/WEB_AUTH_AUDIT.md` (11 findings). Fixes shipped (deploy `35943680132`, commit `1b1b1cc`): session endpoint **fails closed** without `PRIVY_APP_ID` (was fail-open), **origin allowlist enforced** on session+logout POSTs, error detail no longer echoed, `/api/data` now **strictly JWT-verified** (was cookie-presence regex) and the client hook self-heals on 401. Live checks: gated endpoints 401 without session; signed-in pane flow re-verified.

## Status 2026-09-24 (evening) — items 1–3 above

1. **Dashboard pass SHIPPED** (deploy `35943680132`) — venue table now always renders the sourced public rates (fixes blank TVL/APY + raw slugs when signed in; live-verified), chart copy no longer says “connect” when connected (new “no vault deposits yet” state), deposit subtexts explain the vault layer (“vault deposits open with early access”), Market Context reads as lending product (“Steady lending”) and hides trading jargon. **Still open:** money-flow diagram + gamified growth design (next workstream).
2. **Gas drip BUILT & E2E VERIFIED** — `POST /api/gas/request` (strict session, one per user ever, caps 20/day · 400 total) + “request starter gas” action in the dashboard wallet panel; box dripper `~/hypervault/scripts/gas_dripper.js` reads D1 `gas_requests` via wrangler, sends 0.0003 ETH on Arbitrum, marks done (never re-sends on receipt failure — `sent_unconfirmed`). Tank `0x2f19f0b9604aeca69F4662b92fcB918Ce8E73546` seeded **0.0005 ETH** from the test wallet (`tx 0xc5f98bf9…`); first real drip `tx 0x67e8fb09…` → receipt `status=1` (0.0003 back to ops, 10-min cron installed). Pane-side request for the owner’s wallet: pending next sign-in.
3. **On-ramp for the account wallet — WIRED** — Vault page now renders a live **Coinbase card/bank button** (replaces the “coming next” placeholder): mints `/api/coinbase-session` for the **signed-in account’s own wallet** on Arbitrum, one purchase, gas covered by (2). Visible after next sign-in.
