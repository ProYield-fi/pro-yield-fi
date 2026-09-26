// seed_handback_read.js — one-shot state read for the ops-seed handback.
// Read-only. Run: npx hardhat run scripts/seed_handback_read.js --network hyperMainnet
const hre = require("hardhat");

const VAULT = "0x8954a73Bb36D17e4B212137Eb7B2328A1A14D1C1";
const DN = "0xeD40C3c34e2d4D6F2e1C0F0e688a6c05c82F9Bf4";
const MORPHO = "0xBF4C5e339D63EEB393DA2797679879a0a5Af2D53";
const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const OPS_DN = "0x8377870974df41DB4aaa67a842781227390167a9";
const DEPLOYER = "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";

async function main() {
  const [s] = await hre.ethers.getSigners();
  console.log("signer:", s.address);
  const erc = ["function balanceOf(address) view returns (uint256)", "function totalAssets() view returns (uint256)", "function totalShares() view returns (uint256)", "function totalSupply() view returns (uint256)"];
  const usdc = await hre.ethers.getContractAt(erc, USDC);
  const vault = await hre.ethers.getContractAt([...erc, "function performanceFee() view returns (uint256)", "function RESERVE_BPS() view returns (uint256)"], VAULT);
  const dn = await hre.ethers.getContractAt([...erc,
    "function coreState() view returns (int256 equity6, uint256 principal6, int64 szi, uint256 realized, uint256 swept, uint256 syncedAt)",
    "function spotHedgeSz() view returns (uint64)",
    "function spotValue6() view returns (uint64)",
    "function spotPx() view returns (uint64)",
    "function spotPxScale() view returns (uint64)",
    "function keeper() view returns (address)",
    "function owner() view returns (address)",
    "function isActive() view returns (bool)",
    "function perpAsset() view returns (uint32)",
    "function maxActionUsd6() view returns (uint64)",
    "function bufferBps() view returns (uint16)",
    "function lastSync() view returns (uint256)",
  ], DN);
  const morpho = await hre.ethers.getContractAt(erc, MORPHO);

  const g = async (label, p) => { try { return await p; } catch (e) { console.log(`  ${label}: ERR ${e.message?.slice(0,80)}`); return null; } };

  console.log("\n── vault ──");
  console.log("  totalAssets:", (await g("ta", vault.totalAssets()))?.toString());
  console.log("  totalShares:", (await g("ts", vault.totalShares()))?.toString());
  console.log("  idle USDC:", (await usdc.balanceOf(VAULT)).toString());
  console.log("  perfFee:", (await vault.performanceFee()).toString());

  console.log("\n── DN strategy ──");
  const cs = await dn.coreState();
  console.log("  equity6:", cs[0].toString(), " principal6:", cs[1].toString());
  console.log("  szi:", cs[2].toString(), " realized:", cs[3].toString(), " swept:", cs[4].toString());
  console.log("  lastSync:", new Date(Number(cs[5]) * 1000).toISOString());
  console.log("  totalAssets():", (await dn.totalAssets()).toString());
  console.log("  spotHedgeSz:", (await dn.spotHedgeSz()).toString());
  console.log("  spotValue6:", (await dn.spotValue6()).toString());
  console.log("  spotPx:", (await dn.spotPx()).toString(), " pxScale:", (await dn.spotPxScale()).toString());
  console.log("  EVM idle:", (await usdc.balanceOf(DN)).toString());
  console.log("  keeper:", await dn.keeper(), " owner:", await dn.owner());
  console.log("  active:", await dn.isActive(), " perpAsset:", (await dn.perpAsset()).toString());
  console.log("  maxActionUsd6:", (await dn.maxActionUsd6()).toString(), " bufferBps:", (await dn.bufferBps()).toString());

  console.log("\n── morpho ──");
  console.log("  totalAssets:", (await morpho.totalAssets()).toString());

  console.log("\n── wallets ──");
  for (const [n, a] of [["ops_dn", OPS_DN], ["deployer", DEPLOYER]]) {
    console.log(`  ${n} ${a}: USDC=${(await usdc.balanceOf(a)).toString()}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
