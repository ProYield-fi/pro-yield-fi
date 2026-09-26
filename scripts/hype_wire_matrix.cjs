#!/usr/bin/env node
/** Wire-format matrix: find which payload shape /exchange accepts for sendAsset.
 *  Uses the ops key; all attempts with HYPE amount 0.004 (422s are free; a
 *  success would fail on balance — still proves the format). */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Wallet, TypedDataEncoder, Signature } = require("ethers");

const j = JSON.parse(fs.readFileSync(path.join(os.homedir(), ".proyield", "onramp_usertest.json"), "utf8"));
const w = new Wallet(j.private_key || j.privateKey || j.key);
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

async function post(label, body) {
  const res = await fetch("https://api.hyperliquid.xyz/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  console.log(`${label}: HTTP ${res.status} ${t.slice(0, 220)}`);
}

(async () => {
  const nonce = Date.now();
  const action = {
    type: "sendAsset",
    destination: "0x2000000000000000000000000000000000000000",
    sourceDex: "spot",
    destinationDex: "spot",
    token: "HYPE:0x0d01dc56dcaaca66ad901c959b4011ec",
    amount: "0.004",
    fromSubAccount: "",
    nonce,
  };
  const msg = { hyperliquidChain: "Mainnet", ...action, nonce: BigInt(nonce) };
  const sigHex = await w.signTypedData(DOMAIN, TYPES, msg);
  const s = Signature.from(sigHex);
  console.log("r:", s.r.slice(0, 12), "s:", s.s.slice(0, 12), "v:", s.v, typeof s.v);

  await post("A base {action,nonce,sig{r,s,v:num}}", { action, nonce, signature: { r: s.r, s: s.s, v: s.v } });
  await post("B v as hex string", { action, nonce, signature: { r: s.r, s: s.s, v: "0x" + s.v.toString(16) } });
  await post("C v as decimal string", { action, nonce, signature: { r: s.r, s: s.s, v: String(s.v) } });
  await post("D action.nonce as string", { action: { ...action, nonce: String(nonce) }, nonce, signature: { r: s.r, s: s.s, v: s.v } });
  await post("E top-level nonce as string", { action, nonce: String(nonce), signature: { r: s.r, s: s.s, v: s.v } });
  await post("F no top-level nonce", { action, signature: { r: s.r, s: s.s, v: s.v } });
})();
