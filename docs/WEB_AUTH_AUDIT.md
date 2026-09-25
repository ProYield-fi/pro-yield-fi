# Web Auth & Session Security Audit — pyd.fi

Date: 2026-09-24 · Scope: authentication/session flow of the ProYield website
(`~/websites/pro-yield-web`): Privy login → session cookie → gated APIs, the
wallet-link/portfolio endpoints, the on-ramp mint endpoint, and the new
starter-gas drip.

Method: static review of every `functions/api/**` route that touches identity,
plus live verification against **pyd.fi** (production) with a real signed-in
Privy session in the Hermes pane (sign-in, wallet link by EIP-191 signature,
portfolio reads). Tests: `npx vitest run` → 17/17.

## Findings & fixes (all fixed this pass unless noted)

| # | Sev | Finding | Status |
|---|-----|---------|--------|
| 1 | **High** | `auth/session.js` **failed open**: when `PRIVY_APP_ID` was unset for an environment, JWT verification was *skipped* and any ≥16-char token minted a session (user id taken from client input). | **Fixed** — endpoint now fails closed with `501 auth_not_configured`. Deployed previews/production set the app id, so no user impact. |
| 2 | Low | `auth/session.js` echoed internal error text (`reason: e.message`) to clients on 401/400 — unnecessary detail leak. | **Fixed** — generic `auth_failed` / `bad_request`; detail goes to server logs. |
| 3 | Med | No **Origin enforcement** on `POST auth/session` and `POST auth/logout` — CORS advertised an allowlist but didn't enforce it. | **Fixed** — 403 `forbidden_origin` for non-allowlisted browser origins (preview `*.pro-yield*.pages.dev` regex allowed; non-browser callers without Origin unaffected). |
| 4 | **Med** | `GET /api/data` gated on **cookie presence** (`/pyd_session=/` regex), not verification — any cookie value passed. The served layer is platform-truth (zeros) + public rates, but the gate itself was unsound. | **Fixed** — strict `getVerifiedSessionUser()` (JWKS-verified JWT) → 401 otherwise. Client hook switched to the self-healing `authFetch` (401 → token refresh → retry). |
| 5 | Info ✓ | Cookie hygiene: `HttpOnly; Secure; SameSite=Lax; Path=/`, 30-day max-age. | OK. Cookie max-age > token TTL (~1 h) by design — access token inside is short-lived; client refreshes via `POST /api/auth/session` on 401 (verified live). |
| 6 | Info ✓ | Wallet bind: `challenge` (one-time nonce, 15-min TTL, KV) → `link` verifies **EIP-191 signature in-process** (viem), binds `user_id ↔ address` **read-only**, refuses mismatches; verify order cheap→expensive. | OK — proven end-to-end in the pane with a real signature. |
| 7 | Info ✓ | Rate limits present: session 20/h/IP; wallet challenge 30/h; link 30/h; Coinbase mint 30/h; gas drip 1/user + daily/total caps. | OK. |
| 8 | Note | `POST /api/coinbase-session` mints on-ramp sessions for addresses supplied by the caller (now typically the signed-in account's own wallet). A mint grants **no authority** — it only lets Coinbase send funds *to* that address; single-use token, ~5 min TTL. | Accepted; rate-limited. Revisit if abused. |
| 9 | Note | `functions/api/withdraw.js` (testnet demo flow) signs with the Privy embedded wallet **server-side**. | Out of scope today — revisit at vault launch (mainnet vault is audit-gated anyway). |
| 10 | Note | Legacy `base44Client` still references a localStorage `pyd_token`; it no longer gates anything (server verifies the cookie). | Cleanup queued. |
| 11 | Note | `logout` clears the cookie; the JWT itself remains valid until expiry (stateless tokens, no revocation list). | Accepted for 1-h access tokens. |

## Starter-gas drip (new surface, audited with the rest)

`POST /api/gas/request` — strict session; requires a linked wallet; **one
request per user, ever**; global daily cap 20 / total cap 400; idempotent
(repeat calls return existing status). Queue rows in D1 `gas_requests`;
executed by the box-side dripper (`~/hypervault/scripts/gas_dripper.js`) from a
small Arbitrum gas tank. Failure modes: tank empty → skips silently; receipt
check failure after send → marks `sent_unconfirmed` (never re-sends).

## Live verification

- All gated endpoints return **401 without a session** (live curl).
- Signed-in pane flow verified: sign-in → link `0x8377…` by signature → live
  portfolio panel (30 s poll), sources labeled, failed reads shown as `—`.
- Deployed with commit `1b1b1cc` (runs `35943680132`).

## Residual / next

- Revisit #9 at vault launch; #10 cleanup; consider token-revocation list if
  logout-semantics become a requirement.
- Consider promoting the wallet-link + portfolio endpoints into the external
  audit scope when the vault ships (same trust surface).
