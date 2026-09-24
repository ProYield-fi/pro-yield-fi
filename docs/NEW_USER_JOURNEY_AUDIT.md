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
