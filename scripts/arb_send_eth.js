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
const RPCS = ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"];

(async () => {
  if (!KEY_FILE || !fs.existsSync(KEY_FILE)) throw new Error(`no key file: ${KEY_FILE}`);
  if (!/^0x[0-9a-fA-F]{40}$/.test(TO)) throw new Error("bad TO address");
  const key = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")).private_key;
  const w = new ethers.Wallet(key);

  let provider = null;
  for (const u of RPCS) {
    try {
      // Static chain id: skips live network detection (dead hosts otherwise
      // retry-forever); a block-number probe proves the RPC actually answers.
      const p = new ethers.JsonRpcProvider(u, 42161);
      await p.getBlockNumber();
      provider = p;
      break;
    } catch (_) {
      /* try next */
    }
  }
  if (!provider) throw new Error("no usable Arbitrum RPC");
  const signer = w.connect(provider);

  const bal = await provider.getBalance(w.address);
  const value = ethers.parseEther(AMOUNT);
  console.log(`from ${w.address} (${ethers.formatEther(bal)} ETH) → ${TO}  ${AMOUNT} ETH`);
  if (bal < value + ethers.parseEther("0.00005")) throw new Error("insufficient balance");
  if (!RUN) {
    console.log("dry run — RUN=1 to send");
    return;
  }
  const tx = await signer.sendTransaction({ to: TO, value });
  console.log("tx:", tx.hash);
  try {
    const rc = await tx.wait(1);
    console.log("status:", rc.status, "| block:", rc.blockNumber);
  } catch (e) {
    console.error("receipt check failed (tx may still confirm):", String(e.message).slice(0, 140));
  }
  console.log("new balance:", ethers.formatEther(await provider.getBalance(w.address)));
})().catch((e) => {
  console.error("error:", e.message);
  process.exit(1);
});
