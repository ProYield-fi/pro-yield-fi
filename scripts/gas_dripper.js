#!/usr/bin/env node
/**
 * Process the starter-gas drip queues — TWO legs:
 *   1. ~0.0003 ETH on Arbitrum One  (gas_requests)  — for the bridge step
 *   2. ~0.001 HYPE on HyperEVM      (hype_drips)    — for vault deposit txs
 * to each pending address, so users never need a second fiat purchase just
 * for gas. Both queues are filled by POST /api/gas/request (D1).
 *
 * Usage:
 *   node scripts/gas_dripper.js            # dry run (default) — lists what it would send
 *   RUN=1 node scripts/gas_dripper.js      # actually send (max 5 per leg per run)
 *
 * Guards: chain checks (Arbitrum 42161 / HyperEVM 999), tank-balance check
 * with margin, per-run cap. The queue lives in D1; reads/writes go through
 * the authenticated wrangler CLI.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers");

const DRIP_ETH = process.env.DRIP_ETH || "0.0003";
const DRIP_HYPE = process.env.DRIP_HYPE || "0.0004";
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 5);
const RUN = process.env.RUN === "1";
const KEY_FILE =
  process.env.DRIP_KEY_FILE || path.join(os.homedir(), ".hermes", "vault_keys", "gas_dripper.json");
const ARB_RPCS = ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"];
const HYPE_RPCS = ["https://rpc.hyperliquid.xyz/evm"];
const DB = process.env.D1_DB || "pro-yield-db";
const SITE_DIR = path.join(os.homedir(), "websites", "pro-yield-web");

/** Run one D1 statement remotely via wrangler; returns result rows.
 *  Retries once on CLI hiccups (transient wrangler/network failures have
 *  silently delayed drips before) and surfaces stderr on failure. */
function d1(sql, attempts = 2) {
  let lastDetail = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const out = execFileSync(
        "npx",
        ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        { encoding: "utf8", cwd: SITE_DIR, timeout: 90000 }
      );
      // wrangler may print banner lines before the JSON payload — scan for the
      // first '[' that parses as JSON.
      for (let i = out.indexOf("["); i !== -1; i = out.indexOf("[", i + 1)) {
        try {
          const parsed = JSON.parse(out.slice(i));
          return parsed?.[0]?.results || [];
        } catch (_) {
          /* keep scanning */
        }
      }
      throw new Error(`could not parse wrangler JSON output: ${out.slice(0, 200)}`);
    } catch (e) {
      const stderr = (e.stderr || "").toString().trim();
      lastDetail = (stderr || e.message || String(e)).slice(0, 300);
      if (attempt < attempts) {
        console.error(`d1 attempt ${attempt}/${attempts} failed (${lastDetail}) — retrying in 3s`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
      }
    }
  }
  throw new Error(`d1 failed after ${attempts} attempts: ${lastDetail}`);
}

async function pickProvider(rpcs, chainId, label) {
  for (const url of rpcs) {
    try {
      // Static chain id + block-number probe (see arb_send_eth.js for why).
      const p = new ethers.JsonRpcProvider(url, chainId);
      await p.getBlockNumber();
      return p;
    } catch (e) {
      console.error(`${label} rpc ${url} failed: ${String(e.message).slice(0, 100)}`);
    }
  }
  return null;
}

/** One queue leg: read pending rows, send `amount` per row, mark done. */
async function sendLeg({ wallet, provider, table, label, amount, amountLabel }) {
  const signer = wallet.connect(provider);
  let pending;
  try {
    pending = d1(
      `SELECT id, address FROM ${table} WHERE status='pending' ORDER BY id LIMIT ${MAX_PER_RUN}`
    );
  } catch (e) {
    console.error(`[${label}] queue read failed — ${String(e.message).slice(0, 160)}`);
    return;
  }
  console.log(`[${label}] pending drips: ${pending.length}`);
  const bal = await provider.getBalance(wallet.address);
  console.log(`[${label}] tank ${wallet.address}: ${ethers.formatEther(bal)}`);
  if (pending.length === 0) return;

  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
  const perDripCost = amount + 30000n * gasPrice;
  const margin = ethers.parseEther("0.00005");

  let sent = 0;
  for (const row of pending) {
    if (bal < perDripCost + margin) {
      console.error(`[${label}] tank too low for the next drip — stopping`);
      break;
    }
    console.log(`[${label}] ${RUN ? "SENDING" : "DRY RUN"}: ${amountLabel} → ${row.address} (id ${row.id})`);
    if (!RUN) continue;
    try {
      const tx = await signer.sendTransaction({
        to: row.address,
        value: amount,
      });
      console.log(`  tx ${tx.hash}`);
      let ok = false;
      try {
        const rc = await tx.wait(1);
        ok = rc?.status === 1;
      } catch (e) {
        console.error(`  receipt check failed: ${String(e.message).slice(0, 120)}`);
      }
      // Never leave a SENT drip as 'pending' (it would re-send next run) —
      // record 'sent_unconfirmed' for manual follow-up instead.
      const status = ok ? "done" : "sent_unconfirmed";
      d1(
        `UPDATE ${table} SET status='${status}', tx_hash='${tx.hash}', ` +
          `processed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${row.id}`
      );
      console.log(`  marked ${status}`);
      if (ok) sent++;
    } catch (e) {
      console.error(`  send failed: ${e.message}`);
    }
  }
  console.log(`[${label}] ${RUN ? `sent: ${sent}` : "dry run complete — RUN=1 to send"}`);
}

async function main() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`no dripper key at ${KEY_FILE} — create + fund it first`);
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")).private_key;
  const wallet = new ethers.Wallet(key);

  // ── Leg 1: Arbitrum ETH (bridge gas) ──────────────────────────────────────
  const arb = await pickProvider(ARB_RPCS, 42161, "arbitrum");
  if (arb) {
    await sendLeg({
      wallet,
      provider: arb,
      table: "gas_requests",
      label: "arb-eth",
      amount: ethers.parseEther(DRIP_ETH),
      amountLabel: `${DRIP_ETH} ETH`,
    });
  } else {
    console.error("no usable Arbitrum RPC — skipping leg 1");
  }

  // ── Leg 2: HyperEVM HYPE (vault-deposit gas) ──────────────────────────────
  const hype = await pickProvider(HYPE_RPCS, 999, "hyperevm");
  if (hype) {
    let exists = true;
    try {
      d1(`SELECT COUNT(*) AS n FROM hype_drips`);
    } catch (e) {
      if (/no such table/i.test(String(e.message))) exists = false;
      else console.error(`hype_drips probe: ${String(e.message).slice(0, 160)}`);
    }
    if (exists) {
      await sendLeg({
        wallet,
        provider: hype,
        table: "hype_drips",
        label: "hype-evm",
        amount: ethers.parseEther(DRIP_HYPE),
        amountLabel: `${DRIP_HYPE} HYPE`,
      });
    } else {
      console.log("[hype-evm] queue table not created yet — skipped");
    }
  } else {
    console.error("no usable HyperEVM RPC — skipping leg 2");
  }
}

main().catch((e) => {
  console.error("dripper error:", e.message || e);
  process.exit(1);
});
