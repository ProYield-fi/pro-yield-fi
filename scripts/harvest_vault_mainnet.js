// harvest_vault_mainnet.js — permissionless vault profit sweep.
//
// The DN keeper cycle bridges Core profit back to the strategy's EVM idle
// balance; vault.harvest() then sweeps realized profit (> liquidity buffer)
// into the vault as REAL USDC and takes the performance fee on what landed.
// Runs from dn_keeper_cron.sh (every 6h) so the cycle closes without hands.
const hre = require("hardhat");

async function main() {
  const manifest = require("../deployed_addresses.mainnet.json");
  const vaultAddr = process.env.VAULT || manifest.pro_yield_vault;
  if (!vaultAddr) throw new Error("no vault in manifest");

  const [signer] = await hre.ethers.getSigners();
  const vault = await hre.ethers.getContractAt("ProYieldVault", vaultAddr, signer);

  try {
    const tx = await vault.harvest();
    await tx.wait();
    console.log("vault.harvest tx:", tx.hash);
  } catch (e) {
    // Cooldown / nothing-to-sweep / paused strategy — all fine for a cron.
    console.log("harvest skipped:", String(e.reason || e.shortMessage || e.message).slice(0, 160));
  }
  console.log("vault totalAssets:", hre.ethers.formatUnits(await vault.totalAssets(), 6), "USDC");
}

main().catch((e) => { console.error(e); process.exit(1); });
