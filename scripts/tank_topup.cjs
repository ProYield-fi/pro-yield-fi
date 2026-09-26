#!/usr/bin/env node
/**
 * Top up the dripper gas tank (0x2f19…3546) with HYPE from the deployer key.
 * The tank funds starter-gas drips; when it runs low the dripper stops
 * ("tank too low for the next drip") and queued users are stranded.
 *
 * Usage: node scripts/tank_topup.cjs [amount=0.0009]
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { JsonRpcProvider, Wallet, parseEther, formatEther } = require("ethers");

const AMOUNT = process.argv[2] || "0.0009";
const TANK = "0x2f19f0b9604aeca69F4662b92fcB918Ce8E73546";
const KEYFILE = path.join(os.homedir(), ".hermes", "vault_keys", "hyperevm_testnet.deployer");

(async () => {
  const provider = new JsonRpcProvider("https://rpc.hyperliquid.xyz/evm", 999);
  const gp = await provider.getFeeData();
  const gasPrice = (gp.gasPrice ?? 100000000n) * 2n;
  const pk = fs.readFileSync(KEYFILE, "utf8").trim();
  const w = new Wallet(pk, provider);
  const bal = await provider.getBalance(w.address);
  const tankBefore = await provider.getBalance(TANK);
  console.log(`deployer ${w.address}  bal ${formatEther(bal)}`);
  console.log(`tank     ${TANK}  bal ${formatEther(tankBefore)}`);
  const need = parseEther(AMOUNT) + gasPrice * 21000n;
  if (bal < need) {
    console.error(`insufficient — need ${formatEther(need)}`);
    process.exit(1);
  }
  if (process.env.SEND_OK !== "1") {
    console.log(`DRY — would send ${AMOUNT} HYPE (set SEND_OK=1 to send)`);
    return;
  }
  const tx = await w.sendTransaction({ to: TANK, value: parseEther(AMOUNT), gasPrice });
  console.log("sent:", tx.hash);
  await tx.wait();
  const tankAfter = await provider.getBalance(TANK);
  console.log(`tank after: ${formatEther(tankAfter)}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
