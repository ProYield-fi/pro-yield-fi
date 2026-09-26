#!/usr/bin/env node
/**
 * Probe: why did the in-flow gas top-up (sendAsset HYPE 0.004 Core→EVM) fail?
 * Signs with the ops wallet (DN sleeve account) and submits REAL sendAsset
 * requests to Hyperliquid, escalating the amount until one succeeds. Any HYPE
 * that lands goes to the ops EVM wallet — usable gas, nothing wasted.
 *
 * Usage: node scripts/hype_send_probe.cjs
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Wallet, TypedDataEncoder, Signature } = require("ethers");

const KEY_FILE = path.join(os.homedir(), ".proyield", "onramp_usertest.json");
const j = JSON.parse(fs.readFileSync(KEY_FILE, "utf8"));
const pk = j.private_key || j.privateKey || j.key;
const w = new Wallet(pk);
console.log("ops wallet:", w.address);

const ZERO = "0x0000000000000000000000000000000000000000";
const DOMAIN = { name: "HyperliquidSignTransaction", version: "1", chainId: 421614, verifyingContract: ZERO };
const TYPES = {
  "HyperliquidTransaction:SendAsset": [
    { name: "hyperliquidChain", type: "string" },
    { name: "destination", type: "string" },
    { name: "sourceDex", type: "string" },
    { name: "destinationDex", type: "string" },
    { name: "token", type: "string" },
    { name: "amount", type: "string" },
    { name: "fromSubAccount", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

async function spotHype() {
  const r = await fetch("https://api.hyperliquid.xyz/info", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "spotClearinghouseState", user: w.address }),
  });
  const s = await r.json();
  const b = (s.balances || []).find((x) => x.coin === "HYPE");
  return b ? parseFloat(b.total) : 0;
}

async function attempt(amount) {
  const nonce = Date.now();
  const action = {
    type: "sendAsset",
    destination: "0x2000000000000000000000000000000000000000",
    sourceDex: "spot",
    destinationDex: "spot",
    token: "HYPE:0x0d01dc56dcaaca66ad901c959b4011ec",
    amount,
    fromSubAccount: "",
    nonce,
    signatureChainId: "0x66eee",
    hyperliquidChain: "Mainnet",
  };
  const msg = { hyperliquidChain: "Mainnet", ...action, nonce: BigInt(nonce) };
  const sigHex = await w.signTypedData(DOMAIN, TYPES, msg);
  const s = Signature.from(sigHex);
  const res = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, nonce, signature: { r: s.r, s: s.s, v: s.v } }),
  });
  const body = await res.text();
  console.log(`amount=${amount} → HTTP ${res.status} ${body}`);
  return body.includes('"status":"ok"');
}

(async () => {
  console.log("spot HYPE before:", await spotHype());
  for (const amt of ["0.004", "0.02", "0.1", "1"]) {
    if (await attempt(amt)) {
      console.log("SUCCESS at amount", amt);
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 2500));
  console.log("spot HYPE after:", await spotHype());
})();
