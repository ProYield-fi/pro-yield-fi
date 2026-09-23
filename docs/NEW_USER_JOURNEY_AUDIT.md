# New-user journey — test & audit ledger

*The path a brand-new user takes, end to end. Started 2026-09-23 with a real
CA$30 + CA$5 purchase. Each segment is marked tested / in-progress / queued.*

| # | Segment | Status | Evidence / notes |
|---|---|---|---|
| 1 | On-ramp buy via our widget (`pyd.fi/api/coinbase-session`, prod endpoint) | **TESTED ✓ 2026-09-23** | CA$30 → 21.274912 USDC on Arbitrum, zero fees, landed <2 min. UX finding: desktop passkey prompt dead-ends (“passkey not available on this device”) → “Try another way” → SMS code works. That is one extra step a user must discover — consider a hint in our funding UI (“no passkey? choose *Try another way*”). |
| 2 | Funds reach the user's own wallet (fresh address, its own key) | **TESTED ✓** | Arbitrum USDC + ETH at the test wallet; on-ramp session network is locked to Arbitrum by the token request. |
| 3 | Deposit to the venue (Hyperliquid Bridge2, Arbitrum) | **TESTED ✓** | `tx 0x0f54f788…`; credited to HyperCore in ~1 min; 21.274912 USDC. Min deposit 5 USDC. Needs a little ETH for Arbitrum gas. |
| 4 | First product trade (delta-neutral: spot + perp short) | **TESTED ✓** | 0.0039 UETH spot + 0.0039 ETH perp short @ 2685.1; net delta −0.000003 UETH; referral code attached on the fresh account (`set_referrer` once-ever call). Receipt: `~/.proyield/mainnet_trade_receipt.json`. |
| 5 | **Site login → see MY stats / deposits / history** | **QUEUED — test + audit** | Ask (owner, 2026-09-23): “login somehow to the website and be able to see my stats and deposits”. Current state: site has `/api/auth/session` + `/api/auth/logout` endpoints; the dashboard shows protocol stats from the feed, not per-wallet positions. Required work: (a) functional test as a brand-new user; (b) **security audit of the session/auth flow** (cookie/expiry handling, no key material, rate limits, no account enumeration); (c) the per-user data path (needs mainnet vault reads; testnet wiring possible sooner). |
| 6 | Withdraw back out (vault/venue → wallet → off-ramp/CEX) | QUEUED | HL withdraw path already scripted and proven on testnet; mainnet-withdraw test to run after funds have been in place a while. Off-ramp rails exist via the same CDP token endpoint. |

## UX findings to fix in our surfaces

1. **Passkey dead-end hint** (segment 1) — add one line to the funding flow.
2. The widget's own copy does not explain the network lock; our funding page should say “your purchase lands on [chain]”.

## Guardrails for every real-money test here

- Test wallet only; keys 0600 on the ops box (user phone holds backup for the Safes).
- Never mainnet *product contracts* before the audit locks — venue-side money movement only (this ledger).
- Every segment ends with an independent readback (tx hash / API balance / receipt file), never a self-report.
