// Fund the gas-drip tank with HYPE (HyperEVM) — the dripper pays HYPE drips
// from this address. Deployer sends; guarded by MAINNET_OK=1.
const hre = require("hardhat");

const TANK = "0x2f19f0b9604aeca69F4662b92fcB918Ce8E73546";
const SEND = process.env.MAINNET_OK === "1";

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  if (Number(net.chainId) !== 999) throw new Error(`chainId ${net.chainId} != 999`);
  const [d] = await ethers.getSigners();
  const amount = ethers.parseEther(process.env.AMOUNT || "0.01");
  const balBefore = await ethers.provider.getBalance(TANK);
  console.log(`tank before: ${ethers.formatEther(balBefore)} HYPE · sending ${ethers.formatEther(amount)} from ${d.address}`);
  if (!SEND) { console.log("DRY — MAINNET_OK=1 to send"); return; }
  const tx = await d.sendTransaction({ to: TANK, value: amount });
  await tx.wait();
  console.log(`tx ${tx.hash}`);
  console.log(`tank after: ${ethers.formatEther(await ethers.provider.getBalance(TANK))} HYPE`);
}
main().catch((e) => { console.error("fund_tank failed:", e.message || e); process.exit(1); });
