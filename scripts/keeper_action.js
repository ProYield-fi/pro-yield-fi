
const hre = require("hardhat");
async function main() {
  const [owner] = await hre.ethers.getSigners();
  const V = await hre.ethers.getContractFactory("ProYieldVault");
  const v = V.attach("0xf6eF0bf814254003A38f6dE513037D6108989b09");
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
  // 4626 state: real share price for the dashboard
  const fs = require("fs");
  const deployed = JSON.parse(fs.readFileSync("/home/user/hypervault/deployed_addresses.json", "utf8"));
  if (deployed.fee_distributor) {
    try {
      const FD = await hre.ethers.getContractFactory("FeeDistributor");
      const fd = FD.attach(deployed.fee_distributor);
      const r = await fd.receiveFees();
      await r.wait();
      console.log("fdFeesReceived", hre.ethers.formatUnits(await fd.totalFeesReceived(), 18), "USDC");
    } catch (e) {
      console.log("FD reconcile skipped:", (e.reason || e.message || "").slice(0, 100));
    }
  }
  const ta = await v.totalAssets();
  const tsh = await v.totalShares();
  console.log("totalShares", hre.ethers.formatUnits(tsh, 18), "shares");
  console.log("sharePrice", hre.ethers.formatUnits((ta * 10n ** 18n) / tsh, 18), "USDC");
  console.log("totalAssets_after", hre.ethers.formatUnits(ta, 18), "USDC");
}
main().catch(e => { console.error(e); process.exit(1); });
