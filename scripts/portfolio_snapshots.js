#!/usr/bin/env node
/**
 * Daily per-user portfolio snapshots — the growth-chart backstop.
 *
 * For every wallet_links row, reads the same public sources the site's
 * /api/portfolio reads (Arbitrum RPC + Hyperliquid API) and INSERT OR IGNOREs
 * one row per user per day into D1 portfolio_snapshots. Runs right after the
 * daily attestation (see attestation_cron.sh, 08:10 local).
 *
 * Honesty rule: if any source fails for a user, NO row is written for that
 * user that day — a missing day is honest; a wrong figure is not.
 *
 * Usage: node scripts/portfolio_snapshots.js   (safe to re-run: one row/day)
 */
const { execFileSync } = require("child_process");
const os = require("os");
const path = require("path");

const DB = process.env.D1_DB || "pro-yield-db";
const SITE_DIR = path.join(os.homedir(), "websites", "pro-yield-web");
const ARB_RPCS = [
  "https://arb1.arbitrum.io/rpc",
  "https://arbitrum-one-rpc.publicnode.com",
  "https://arbitrum.llamarpc.com",
];
const ARB_USDC = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const HL_API = "https://api.hyperliquid.xyz/info";

/** Run one D1 statement remotely via wrangler; returns result rows. */
function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { encoding: "utf8", cwd: SITE_DIR, timeout: 90000 }
  );
  for (let i = out.indexOf("["); i !== -1; i = out.indexOf("[", i + 1)) {
    try {
      const parsed = JSON.parse(out.slice(i));
      return parsed?.[0]?.results || [];
    } catch (_) {
      /* keep scanning */
    }
  }
  throw new Error(`could not parse wrangler JSON output: ${out.slice(0, 200)}`);
}

async function rpc(method, params) {
  let lastErr = new Error("no rpc endpoints configured");
  for (const url of ARB_RPCS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(12000),
      });
      if (!r.ok) throw new Error(`rpc ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error("rpc error");
      return d.result;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function hl(type, extra = {}) {
  const r = await fetch(HL_API, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type, ...extra }),
    signal: AbortSignal.timeout(12000),
  });
  if (!r.ok) throw new Error(`hl ${r.status}`);
  return r.json();
}

/** One user's figures; throws if any source is missing. */
async function snapshotFor(address) {
  const [ethBal, usdcBal, cl, sp, mids, book] = await Promise.all([
    rpc("eth_getBalance", [address, "latest"]),
    rpc("eth_call", [
      { to: ARB_USDC, data: `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}` },
      "latest",
    ]),
    hl("clearinghouseState", { user: address }),
    hl("spotClearinghouseState", { user: address }),
    hl("allMids"),
    hl("l2Book", { coin: "@151" }).catch(() => null), // UETH/USDC book
  ]);
  if (cl?.marginSummary?.accountValue == null) throw new Error("no clearinghouseState");

  let mid = null;
  const levels = book?.levels;
  if (levels?.[0]?.length && levels?.[1]?.length) {
    mid = (Number(levels[0][0].px) + Number(levels[1][0].px)) / 2;
  } else if (mids?.ETH) {
    mid = Number(mids.ETH);
  }
  if (mid == null) throw new Error("no ETH mid");

  const eth = Number(BigInt(ethBal)) / 1e18;
  const usdc = Number(BigInt(usdcBal)) / 1e6;
  const spot = {};
  for (const b of sp?.balances || []) spot[b.coin] = Number(b.total);
  const acct = Number(cl.marginSummary.accountValue);

  const total = acct + (spot.USDC || 0) + (spot.UETH || 0) * mid + usdc + eth * mid;
  return {
    total,
    breakdown: {
      hypercore: acct,
      spot_usdc: spot.USDC ?? null,
      spot_ueth: spot.UETH ?? null,
      arbitrum_usdc: usdc,
      arbitrum_eth: eth,
      mid_eth: mid,
    },
  };
}

async function main() {
  const rows = d1("SELECT user_id, address FROM wallet_links");
  const date = new Date().toISOString().slice(0, 10);
  console.log(`${new Date().toISOString()} snapshot run — ${rows.length} linked wallet(s) → ${date}`);
  let ok = 0;
  let skipped = 0;
  for (const r of rows) {
    try {
      const { total, breakdown } = await snapshotFor(r.address);
      const uid = String(r.user_id).replace(/'/g, "''");
      const b = JSON.stringify(breakdown).replace(/'/g, "''");
      d1(
        `INSERT OR IGNORE INTO portfolio_snapshots (user_id, date, total_usd, breakdown) ` +
          `VALUES ('${uid}', '${date}', ${Number(total).toFixed(6)}, '${b}')`
      );
      console.log(`  ok  ${r.address} → $${total.toFixed(2)}`);
      ok++;
    } catch (e) {
      console.log(`  skip ${r.address}: ${e.message} — no row written (honest gap)`);
      skipped++;
    }
  }
  console.log(`done: ${ok} written, ${skipped} skipped`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
