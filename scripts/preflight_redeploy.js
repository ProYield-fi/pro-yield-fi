// Preflight reads for the mainnet redeploy (read-only).
const { ethers } = require("hardhat");

async function main() {
  const OLD_VAULT = "0xadaE15e23b0007de2A85b1F3874332762Bc23bb0";
  const OLD_FD = "0xAa67940672047EcE44db2876378b182C1Fc4217C";
  const v = await ethers.getContractAt("ProYieldVault", OLD_VAULT);
  const fd = await ethers.getContractAt("FeeDistributor", OLD_FD);
  console.log("== OLD VAULT ==");
  console.log("totalAssets:", (await v.totalAssets()).toString());
  console.log("totalShares:", (await v.totalShares()).toString());
  console.log("owner:", await v.owner());
  console.log("feeDistributor:", await v.feeDistributor());
  console.log("depositsPaused:", await v.depositsPaused());
  console.log("tvlCap:", (await v.tvlCap()).toString(), "perUserCap:", (await v.perUserCap()).toString());
  console.log("== OLD FD ==");
  console.log("usdc:", await fd.usdc());
  console.log("owner:", await fd.owner().catch(() => "n/a"));
  const [d] = await ethers.getSigners();
  console.log("== DEPLOYER ==");
  console.log(d.address, "·", ethers.formatEther(await ethers.provider.getBalance(d.address)), "HYPE");
  // gas tank + ops sleeve reads
  const tank = "0x2f19f0b9604aeca69F4662b92fcB918Ce8E73546";
  console.log("gas tank:", ethers.formatEther(await ethers.provider.getBalance(tank)), "HYPE");
  const sleeve = "0x8377870974df41DB4aaa67a842781227390167a9";
  console.log("sleeve HyperEVM HYPE:", ethers.formatEther(await ethers.provider.getBalance(sleeve)));
  const usdc = new ethers.Contract("0xb88339CB7199b77E23DB6E890353E22632Ba630f", ["function balanceOf(address) view returns (uint256)"], ethers.provider);
  console.log("sleeve HyperEVM USDC:", ethers.formatUnits(await usdc.balanceOf(sleeve), 6));
}

main().catch((e) => { console.error("PREFLIGHT ERR:", e.message || e); process.exit(1); });
