
const hre = require("hardhat");
// Explicit ABI fragments for the deployed paper-shadow generation (see note
// in update_delta_rate): current repo source has drifted from these builds.
const VAULT_ABI = [
  "function idleAssets() view returns (uint256)",
  "function harvest()",
  "function allocate()",
  "function totalAssets() view returns (uint256)",
  "function totalYield() view returns (uint256)",
  "function exchangeRate() view returns (uint256)",
  "function getStrategies() view returns (address[])"
];
const DELTA_ABI = ["function apyBps() view returns (uint256)"];
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const v = new hre.ethers.Contract("0x42237e98aD8918401F898cb453ef714B64e5B3Bf", VAULT_ABI, owner);
  const d = new hre.ethers.Contract("0xB59226930edeF5bAFA8E802B03AEd03feA726DE2", DELTA_ABI, owner);
  console.log("idle", hre.ethers.formatUnits(await v.idleAssets(), 6), "USDC");
  try {
    const h = await v.harvest();
    await h.wait();
    console.log("harvest tx", h.hash);
  } catch (e) {
    console.log("harvest skipped:", (e.reason || e.message).slice(0, 80));
  }
  try {
    const a = await v.allocate();
    await a.wait();
    console.log("allocate tx", a.hash);
  } catch (e) {
    console.log("allocate skipped:", (e.reason || e.message).slice(0, 80));
  }
  console.log("totalAssets", hre.ethers.formatUnits(await v.totalAssets(), 6), "USDC");
  console.log("totalYield", hre.ethers.formatUnits(await v.totalYield(), 6), "USDC");
  console.log("exchangeRate", (Number(await v.exchangeRate()) / 1e18).toFixed(6));
  console.log("deltaApyBps", (await d.apyBps()).toString());
  console.log("strategies", (await v.getStrategies()).length);
}
main().catch(e => { console.error(e); process.exit(1); });
