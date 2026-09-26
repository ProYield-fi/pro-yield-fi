// Demo-deposit cleanup: withdraw the platform's test deposits from the vault so
// the vault holds only genuine user money (audit-clean books).
//
// Demo shareholders (read 2026-09-25): deployer 0xaDD8… $2.72 + ops 0x8377… $0.86.
// Pays out from vault idle liquidity — run only when idle covers the withdrawal
// (e.g. after the first user deposit lands). Dry-run by default; MAINNET_OK=1 to send.
//
// Usage:
//   DEPLOY_MANIFEST=deployed_addresses.mainnet.json node scripts/vault_demo_withdraw_mainnet.js
//   MAINNET_OK=1 DEPLOY_MANIFEST=deployed_addresses.mainnet.json node scripts/vault_demo_withdraw_mainnet.js
const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const RPC = "https://rpc.hyperliquid.xyz/evm";
const VAULT_ABI = [
  "function shares(address) view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function convertToAssets(uint256) view returns (uint256)",
  "function withdrawUpTo(uint256 amount) returns (uint256 paid)",
];

function loadKeys() {
  const deployerKey = fs
    .readFileSync(path.join(process.env.HOME, ".hermes", "vault_keys", "hyperevm_testnet.deployer"), "utf8")
    .trim();
  const ops = JSON.parse(fs.readFileSync(path.join(process.env.HOME, ".proyield", "onramp_usertest.json"), "utf8"));
  const opsKey = ops.private_key || ops.privateKey || ops.key;
  if (!opsKey) throw new Error("no private key in onramp_usertest.json");
  return [
    { name: "deployer", key: deployerKey },
    { name: "ops", key: opsKey },
  ];
}

async function main() {
  const manifestPath = process.env.DEPLOY_MANIFEST || "deployed_addresses.mainnet.json";
  const deployed = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", manifestPath), "utf8"));
  const vaultAddr = deployed.pro_yield_vault;
  if (!vaultAddr) throw new Error("no pro_yield_vault in manifest");

  const provider = new ethers.JsonRpcProvider(RPC, undefined, { staticNetwork: true });
  const vault = new ethers.Contract(vaultAddr, VAULT_ABI, provider);
  const totalShares = await vault.totalShares();
  const totalAssets = await vault.totalAssets();
  console.log(`vault ${vaultAddr}`);
  console.log(`  totalShares=${ethers.formatUnits(totalShares, 6)} totalAssets=${ethers.formatUnits(totalAssets, 6)}`);

  const RUN = process.env.MAINNET_OK === "1";
  let anySent = false;
  for (const { name, key } of loadKeys()) {
    const wallet = new ethers.Wallet(key, provider);
    const shares = await vault.shares(wallet.address);
    if (shares === 0n) {
      console.log(`${name} ${wallet.address}: 0 shares — skip`);
      continue;
    }
    const amount = await vault.convertToAssets(shares);
    console.log(`${name} ${wallet.address}: shares=${ethers.formatUnits(shares, 6)} → ${ethers.formatUnits(amount, 6)} USDC`);
    if (!RUN) {
      console.log(`  DRY-RUN (set MAINNET_OK=1 to send withdrawUpTo(${ethers.formatUnits(amount, 6)}))`);
      continue;
    }
    const tx = await vault.connect(wallet).withdrawUpTo(amount);
    console.log(`  sent ${tx.hash}`);
    const rc = await tx.wait();
    console.log(`  mined in block ${rc.blockNumber} status=${rc.status}`);
    const left = await vault.shares(wallet.address);
    console.log(`  shares left: ${ethers.formatUnits(left, 6)}`);
    anySent = true;
  }
  if (!RUN) console.log("dry-run complete — nothing was sent");
  else if (!anySent) console.log("nothing to withdraw");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
