
const hre = require("hardhat");
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const V = await hre.ethers.getContractFactory("ProYieldVault");
  const v = V.attach("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512");
  console.log("totalAssets", hre.ethers.formatUnits(await v.totalAssets(), 18), "USDC");
  try {
    const h = await v.harvest();
    await h.wait();
    console.log("harvest tx", h.hash);
  } catch (e) {
    console.log("harvest skipped:", (e.reason || e.message).slice(0, 120));
  }
  try {
    const a = await v.allocate();
    await a.wait();
    console.log("allocate tx", a.hash);
  } catch (e) {
    console.log("allocate skipped:", (e.reason || e.message).slice(0, 120));
  }
  console.log("totalAssets_after", hre.ethers.formatUnits(await v.totalAssets(), 18), "USDC");
}
main().catch(e => { console.error(e); process.exit(1); });
