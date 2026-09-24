#!/usr/bin/env node
/**
 * Send ETH on Arbitrum One from a local key file. Dry-run by default.
 * Usage:
 *   FROM_KEY_FILE=~/.proyield/onramp_usertest.json TO=0x… AMOUNT_ETH=0.0004 \
 *     [RUN=1] node scripts/arb_send_eth.js
 * Prints only addresses/hashes/balances — never key material.
 */
const fs = require("fs");
const os = require("os");
const { ethers } = require("ethers");

const KEY_FILE = (process.env.FROM_KEY_FILE || "").replace(/^~/, os.homedir());
const TO = process.env.TO || "";
const AMOUNT = process.env.AMOUNT_ETH || "0.0004";
const RUN = process.env.RUN === "1";
const RPCS = ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"];

(async () => {
  if (!KEY_FILE || !fs.existsSync(KEY_FILE)) throw new Error(`no key file: ${KEY_FILE}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(TO)) throw new Error("bad TO address");
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")).private_key;
  const w = new ethers.Wallet(key);

  let provider = null;
  for (const u of RPCS) {
    try {
      const p = new ethers.JsonRpcProvider(u);
      if (Number((await p.getNetwork()).chainId) === 42161) {
        provider = p;
        break;
      }
    } catch (_) {
      /* try next */
    }
  }
  if (!provider) throw new Error("no usable Arbitrum RPC");

  const bal = await provider.getBalance(w.address);
  const value = ethers.parseEther(AMOUNT);
  console.log(`from ${w.address} (${ethers.formatEther(bal)} ETH) → ${TO}  ${AMOUNT} ETH`);
  if (bal < value + ethers.parseEther("0.00005")) throw new Error("insufficient balance");
  if (!RUN) {
    console.log("dry run — RUN=1 to send");
    return;
  }
  const tx = await w.sendTransaction({ to: TO, value, gasLimit: 21000 });
  console.log("tx:", tx.hash);
  const rc = await tx.wait(1);
  console.log("status:", rc.status, "| block:", rc.blockNumber);
  console.log("new balance:", ethers.formatEther(await provider.getBalance(w.address)));
})().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});
