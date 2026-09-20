
const hre = require("hardhat");
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const V = await hre.ethers.getContractFactory("ProYieldVault");
  const v = V.attach("0x616D54A921665BfB742f32f39FD8bb2158a3173D");
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
  // Reconcile FeeDistributor accounting with the fees it actually holds
  if (deployed.fee_distributor) {
    try {
      const FD = await hre.ethers.getContractFactory("FeeDistributor");
      const fd = FD.attach(deployed.fee_distributor);
      const r = await fd.receiveFees();
      await r.wait();
      console.log("FD fees received:", ethers.formatUnits(await fd.totalFeesReceived(), 18), "USDC");
    } catch (e) {
      console.log("FD reconcile skipped:", (e.reason || e.message || "").slice(0, 100));
    }
  }
  console.log("totalAssets_after", hre.ethers.formatUnits(await v.totalAssets(), 18), "USDC");
}
main().catch(e => { console.error(e); process.exit(1); });
