// Transfer ownership of the NEW mainnet vault + FeeDistributor to the treasury
// Safe (2-of-3) — the same posture as r0. Deployer is current owner.
// Sending requires MAINNET_OK=1; dry by default.
const hre = require("hardhat");

const fs = require("fs");
const path = require("path");
const SAFE = "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB";
// Addresses from the deploy manifest — never transcribed by hand.
const MANIFEST = JSON.parse(
  fs.readFileSync(process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.mainnet.json"), "utf8")
);
const VAULT = MANIFEST.pro_yield_vault;
const FD = MANIFEST.fee_distributor;

const SEND = process.env.MAINNET_OK === "1" && process.env.DRY !== "1";

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 999) throw new Error(`chainId ${net.chainId} != 999`);
  const [deployer] = await ethers.getSigners();

  const vault = await ethers.getContractAt("ProYieldVault", VAULT);
  const fd = await ethers.getContractAt("FeeDistributor", FD);

  for (const [name, c] of [["vault", vault], ["fd", fd]]) {
    const owner = await c.owner();
    console.log(`${name}: current owner ${owner}`);
    if (owner.toLowerCase() === SAFE.toLowerCase()) {
      console.log(`${name}: already Safe-owned — skipping`);
      continue;
    }
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      throw new Error(`${name}: deployer is not owner — cannot transfer`);
    }
    if (!SEND) {
      console.log(`${name}: WOULD transferOwnership(${SAFE})`);
      continue;
    }
    const tx = await c.transferOwnership(SAFE);
    await tx.wait();
    console.log(`${name}: transferred staged tx ${tx.hash}`);
  }

  if (SEND) {
    console.log("\nverify:");
    console.log("vault.owner:", await vault.owner());
    console.log("fd.owner:", await fd.owner());
  }
}

main().catch((e) => { console.error("transfer failed:", e.message || e); process.exit(1); });
