#!/usr/bin/env node
/**
 * Process the starter-gas drip queue (gas_requests in D1, filled by
 * POST /api/gas/request) — sends a tiny amount of ETH on Arbitrum One from the
 * box-held dripper key to each pending address so users never need a second
 * fiat purchase just for gas.
 *
 * Usage:
 *   node scripts/gas_dripper.js            # dry run (default) — lists what it would send
 *   RUN=1 node scripts/gas_dripper.js      # actually send (max 5 per run)
 *
 * Guards: Arbitrum chain check, tank-balance check with margin, per-run cap.
 * The queue lives in D1; reads/writes go through the authenticated wrangler CLI.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { ethers } = require("ethers");

const DRIP_ETH = process.env.DRIP_ETH || "0.0003";
const MAX_PER_RUN = Number(process.env.MAX_PER_RUN || 5);
const RUN = process.env.RUN === "1";
const KEY_FILE =
  process.env.DRIP_KEY_FILE || path.join(os.homedir(), ".hermes", "vault_keys", "gas_dripper.json");
const RPCS = ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"];
const DB = process.env.D1_DB || "pro-yield-db";
const SITE_DIR = path.join(os.homedir(), "websites", "pro-yield-web");

/** Run one D1 statement remotely via wrangler; returns result rows. */
function d1(sql) {
  const out = execFileSync(
    "npx",
    ["wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
    { encoding: "utf8", cwd: SITE_DIR, timeout: 90000 }
  );
  // wrangler may print banner lines before the JSON payload — scan for the first
  // '[' that parses as JSON.
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

async function main() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error(`no dripper key at ${KEY_FILE} — create + fund it first`);
    process.exit(1);
  }
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")).private_key;
  const wallet = new ethers.Wallet(key);

  let provider = null;
  for (const url of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      const net = await p.getNetwork();
      if (Number(net.chainId) === 42161) {
        provider = p;
        break;
      }
      console.error(`rpc ${url} is chain ${net.chainId}, not Arbitrum — skipping`);
    } catch (e) {
      console.error(`rpc ${url} failed: ${e.message}`);
    }
  }
  if (!provider) {
    console.error("no usable Arbitrum RPC");
    process.exit(1);
  }

  const pending = d1(
    `SELECT id, address FROM gas_requests WHERE status='pending' ORDER BY id LIMIT ${MAX_PER_RUN}`
  );
  console.log(`pending drips: ${pending.length}`);
  const bal = await provider.getBalance(wallet.address);
  console.log(`tank ${wallet.address}: ${ethers.formatEther(bal)} ETH`);

  const amount = ethers.parseEther(DRIP_ETH);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice || ethers.parseUnits("0.1", "gwei");
  const perDripCost = amount + 21000n * gasPrice;
  const margin = ethers.parseEther("0.0001");

  let sent = 0;
  for (const row of pending) {
    if (bal < perDripCost + margin) {
      console.error("tank too low for the next drip — stopping");
      break;
    }
    console.log(`${RUN ? "SENDING" : "DRY RUN"}: ${DRIP_ETH} ETH → ${row.address} (id ${row.id})`);
    if (!RUN) continue;
    try {
      const tx = await wallet.sendTransaction({
        to: row.address,
        value: amount,
        gasLimit: 21000,
        gasPrice,
      });
      console.log(`  tx ${tx.hash}`);
      const rc = await tx.wait(1);
      if (rc && rc.status === 1) {
        d1(
          `UPDATE gas_requests SET status='done', tx_hash='${tx.hash}', ` +
            `processed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=${row.id}`
        );
        console.log("  confirmed ✓");
        sent++;
      } else {
        console.error("  tx not successful");
      }
    } catch (e) {
      console.error(`  send failed: ${e.message}`);
    }
  }
  console.log(RUN ? `sent: ${sent}` : "dry run complete — RUN=1 to send");
}

main().catch((e) => {
  console.error("dripper error:", e.message || e);
  process.exit(1);
});
