// scripts/transfer_ownership_mainnet.js — hand vault + FeeDistributor ownership
// to the mainnet treasury Safe (2-of-3). DRY by default; MAINNET_OK=1 sends.
//
// Guards: chain 999 · deployer IS the current owner of both contracts · treasury
// record exists (~/.proyield/treasury_multisig_mainnet.json) · target Safe
// re-verified on-chain (code + threshold 2 + expected owners) before any send ·
// post-transfer read-back (owner() on both == Safe; refuses to report success
// otherwise).
//
//   MAINNET_OK=1 npx hardhat run scripts/transfer_ownership_mainnet.js --network hyperMainnet
const hre = require("hardhat");
const fs = require("fs");
const os = require("os");
const path = require("path");

const SEND = process.env.MAINNET_OK === "1";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.mainnet.json");
const SAFE_RECORD = path.join(os.homedir(), ".proyield", "treasury_multisig_mainnet.json");

function fail(msg) {
  console.error(`REFUSING: ${msg}`);
  process.exit(3);
}

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 999) fail(`chainId ${net.chainId} is not 999`);
  console.log(`chain 999 ✓ · ${SEND ? "SEND MODE" : "DRY MODE"}`);

  const [deployer] = await ethers.getSigners();
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (Number(m.chain_id) !== 999) fail("manifest is not a mainnet manifest");
  const vaultAddr = m.pro_yield_vault;
  const fdAddr = m.fee_distributor;

  const rec = JSON.parse(fs.readFileSync(SAFE_RECORD, "utf8"));
  const safeAddr = rec.safe;
  if (Number(rec.chain_id) !== 999 || !rec.verified_onchain) fail("treasury record is not a verified mainnet record");

  // Re-verify the target Safe on-chain RIGHT NOW (records can go stale; never
  // transfer ownership to an address based on a file alone).
  if ((await ethers.provider.getCode(safeAddr)) === "0x") fail(`no code at treasury Safe ${safeAddr}`);
  const safe = new ethers.Contract(safeAddr, [
    "function getThreshold() view returns (uint256)",
    "function getOwners() view returns (address[])",
  ], ethers.provider);
  const [threshold, owners] = [await safe.getThreshold(), await safe.getOwners()];
  console.log(`treasury Safe ${safeAddr} · threshold ${threshold} · owners ${owners.join(", ")}`);
  if (Number(threshold) !== 2) fail("treasury Safe threshold != 2");
  const expectedOwners = rec.owners.map((a) => a.toLowerCase()).sort();
  const liveOwners = owners.map((a) => a.toLowerCase()).sort();
  if (JSON.stringify(expectedOwners) !== JSON.stringify(liveOwners)) fail("treasury Safe owners differ from the record");

  const vault = new ethers.Contract(vaultAddr, [
    "function owner() view returns (address)",
    "function transferOwnership(address)",
  ], deployer);
  const fd = new ethers.Contract(fdAddr, [
    "function owner() view returns (address)",
    "function transferOwnership(address)",
  ], deployer);

  const [vaultOwner, fdOwner] = [await vault.owner(), await fd.owner()];
  console.log(`current owners — vault: ${vaultOwner} · FD: ${fdOwner}`);
  if (vaultOwner.toLowerCase() !== deployer.address.toLowerCase()) {
    if (vaultOwner.toLowerCase() === safeAddr.toLowerCase()) {
      console.log("vault already owned by the Safe — nothing to do for it");
    } else {
      fail(`vault owner ${vaultOwner} is neither the deployer nor the Safe`);
    }
  }

  if (!SEND) {
    console.log(`\nDRY — would transfer: vault → ${safeAddr}, FD → ${safeAddr}`);
    return;
  }

  if (vaultOwner.toLowerCase() !== safeAddr.toLowerCase()) {
    const t1 = await vault.transferOwnership(safeAddr);
    const r1 = await t1.wait();
    console.log(`vault.transferOwnership: ${t1.hash} (gasUsed ${r1.gasUsed})`);
  }
  if (fdOwner.toLowerCase() !== safeAddr.toLowerCase()) {
    const t2 = await fd.transferOwnership(safeAddr);
    const r2 = await t2.wait();
    console.log(`fd.transferOwnership: ${t2.hash} (gasUsed ${r2.gasUsed})`);
  }

  // Read back — success is the chain's word, not the tx status.
  const [vo2, fo2] = [await vault.owner(), await fd.owner()];
  console.log(`\nAFTER — vault.owner() = ${vo2} · fd.owner() = ${fo2}`);
  if (vo2.toLowerCase() !== safeAddr.toLowerCase() || fo2.toLowerCase() !== safeAddr.toLowerCase()) {
    fail("post-transfer read-back mismatch — investigate");
  }
  console.log("✅ ownership transferred and verified (vault + FeeDistributor → treasury Safe)");
}

main().catch((e) => { console.error("transfer_ownership_mainnet error:", (e && e.stack) || e); process.exit(4); });
