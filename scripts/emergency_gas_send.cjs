#!/usr/bin/env node
/**
 * Emergency gas top-up: move small HYPE amounts from the ops + dripper-tank
 * wallets to a user's HyperEVM address so their vault deposit can execute.
 * Measured HyperEVM gas: ~0.000009 HYPE/tx — 0.00045 covers ~50 txs.
 *
 * Usage: node scripts/emergency_gas_send.cjs <to> [amount-per-wallet]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JsonRpcProvider, Wallet, parseEther, formatEther } = require("ethers");

const TO = process.argv[2];
const AMT = process.argv[3] || "0.00025";
const RPCS = ["https://rpc.hyperliquid.xyz/evm"];
const KEYFILES = [
  path.join(os.homedir(), ".proyield", "onramp_usertest.json"), // ops 0x8377
  path.join(os.homedir(), ".hermes", "vault_keys", "gas_dripper.json"), // tank 0x2f19
];

(async () => {
  const provider = new JsonRpcProvider(RPCS[0], 999);
  const gp = await provider.getFeeData();
  const gasPrice = (gp.gasPrice ?? 100000000n) * 2n;
  console.log("gasPrice:", gasPrice.toString(), "→ target", TO, "amount", AMT);

  for (const kf of KEYFILES) {
    const j = JSON.parse(fs.readFileSync(kf, "utf8"));
    const pk = j.private_key || j.privateKey || j.key;
    const w = new Wallet(pk, provider);
    const bal = await provider.getBalance(w.address);
    const need = parseEther(AMT) + gasPrice * 21000n;
    console.log(`\n${path.basename(kf)} ${w.address} bal ${formatEther(bal)}`);
    if (bal < need) {
      console.log("  skip — insufficient (needs", formatEther(need), ")");
      continue;
    }
    const tx = await w.sendTransaction({ to: TO, value: parseEther(AMT), gasPrice });
    console.log("  sent:", tx.hash);
    const rc = await tx.wait();
    console.log("  confirmed block", rc.blockNumber);
  }
  const end = await provider.getBalance(TO);
  console.log("\nFINAL target balance:", formatEther(end), "HYPE");
})();
