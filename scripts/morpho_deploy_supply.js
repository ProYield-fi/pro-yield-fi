// Keeper one-shot: supply the strategy's idle USDC into the Morpho market.
const hre = require("hardhat");
async function main() {
  const { ethers } = hre;
  const [ops] = await ethers.getSigners();
  const s = new ethers.Contract(
    "0xBF4C5e339D63EEB393DA2797679879a0a5Af2D53",
    [
      "function deploy()",
      "function totalAssets() view returns (uint256)",
      "function positionValue() view returns (uint256)",
      "function keeper() view returns (address)",
    ],
    ops
  );
  console.log("keeper:", await s.keeper());
  const tx = await s.deploy({ gasLimit: 500000n });
  await tx.wait();
  console.log("deploy() tx", tx.hash);
  console.log("totalAssets", ethers.formatUnits(await s.totalAssets(), 6));
  console.log("positionValue", ethers.formatUnits(await s.positionValue(), 6));
}
main().catch((e) => { console.error(e); process.exit(1); });
