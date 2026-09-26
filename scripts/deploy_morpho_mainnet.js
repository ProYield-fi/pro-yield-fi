/**
 * Mainnet deploy — MorphoStrategy (real Morpho Blue lending adapter, HyperEVM
 * 999). DRY BY DEFAULT; sending requires MAINNET_OK=1.
 *
 * Market: the flagship USDC market on HyperEVM Morpho Blue (loanToken = the
 * vault's exact USDC 0xb88339CB…; collateral WHYPE; lltv 0.77; the deepest +
 * most liquid USDC market on the chain — $13M+ supplied, $3M+ withdrawable).
 * marketId is asserted against the live market before anything is sent.
 *
 * Run 1 (deployer as owner) configures everything (keeper + vault link), then
 * hands the OWNER role to the treasury Safe (2-of-3) — same pattern as the DN
 * strategy. The vault addStrategy + allocate steps go through
 * safe_exec_mainnet.js afterwards.
 *
 *   npx hardhat run scripts/deploy_morpho_mainnet.js --network hyperMainnet
 *
 * Env:
 *   MAINNET_OK=1   required to send (otherwise read-only plan)
 *   DRY=1          explicit dry run
 *   FORCE=1        redeploy even if the manifest already has morpho_strategy
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const SAFE = "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB"; // treasury Safe (2/3)
const MORPHO = "0x68e37dE8d93d3496ae143F2E900490f6280C57cD"; // Morpho Blue core, HyperEVM
const COLL = "0x5555555555555555555555555555555555555555"; // WHYPE
const ORACLE = "0x194FFF37872BAC3531a41fA5C426090ff84f4f31";
const IRM = "0xD4a426F010986dCad727e8dd6eed44cA4A9b7483";
const LLTV = 770000000000000000n; // 0.77e18 as BigInt (floats overflow the ABI coder)
const EXPECTED_MARKET_ID = "0xd7d38220652d19c87099c3b23de9a70a1893620a050c635d1a94bd947c9c59a8";
const EXPECTED_DEPLOYER = process.env.EXPECTED_DEPLOYER || "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.mainnet.json");

const SEND = process.env.MAINNET_OK === "1" && process.env.DRY !== "1";

function fail(msg) {
  console.error(`REFUSING: ${msg}`);
  process.exit(3);
}

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`network: ${hre.network.name} · chainId ${chainId} · ${SEND ? "SEND MODE" : "DRY MODE"}`);
  if (chainId !== 999) fail(`chainId ${chainId} is not HyperEVM mainnet (999)`);

  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    fail(`deployer ${deployer.address} != expected ops EOA ${EXPECTED_DEPLOYER}`);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (manifest.morpho_strategy && process.env.FORCE !== "1") {
    fail(`manifest already has morpho_strategy=${manifest.morpho_strategy} — FORCE=1 to overwrite`);
  }
  const vault = manifest.pro_yield_vault;
  if (!vault) fail("manifest missing pro_yield_vault");

  // marketId must match the live flagship market before anything is sent
  const computed = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "address", "address", "uint256"],
      [USDC, COLL, ORACLE, IRM, LLTV]
    )
  );
  console.log(`marketId computed: ${computed}`);
  if (computed !== EXPECTED_MARKET_ID) fail(`marketId mismatch (expected ${EXPECTED_MARKET_ID})`);
  console.log(`marketId matches the live flagship market ✓`);

  console.log(`deployer: ${deployer.address} (Safe owner #1)`);
  console.log(`owner after handoff: ${SAFE} (treasury Safe 2/3)`);
  console.log(`vault link: ${vault} · morpho core: ${MORPHO}`);

  if (!SEND) {
    console.log("\nDRY — would deploy MorphoStrategy(USDC, deployer, MORPHO, COLL, ORACLE, IRM, 0.77e18);");
    console.log("then: setKeeper(deployer), setVault(vault), transferOwnership(SAFE), verify.");
    console.log("Re-run with MAINNET_OK=1 to send.");
    return;
  }

  const Strategy = await ethers.getContractFactory("MorphoStrategy");
  const raw = new ethers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");
  const est = await raw.estimateGas(
    await Strategy.getDeployTransaction(USDC, deployer.address, MORPHO, COLL, ORACLE, IRM, LLTV)
  );
  console.log(`deploy estimate: ${est} (limit 3,000,000 — headroom ${3_000_000n - est})`);
  if (est >= 2_990_000n) fail(`deploy estimate ${est} leaves <10k headroom — refusing`);

  const strategy = await Strategy.deploy(USDC, deployer.address, MORPHO, COLL, ORACLE, IRM, LLTV, {
    gasLimit: 2_990_000n,
  });
  await strategy.waitForDeployment();
  const addr = await strategy.getAddress();
  console.log(`MorphoStrategy deployed: ${addr} (tx ${strategy.deploymentTransaction().hash})`);

  const keepTx = await strategy.setKeeper(deployer.address);
  await keepTx.wait();
  console.log(`setKeeper(${deployer.address}) tx ${keepTx.hash}`);

  const vaultTx = await strategy.setVault(vault);
  await vaultTx.wait();
  console.log(`setVault(${vault}) tx ${vaultTx.hash}`);

  const ownTx = await strategy.transferOwnership(SAFE);
  await ownTx.wait();
  console.log(`transferOwnership(${SAFE}) tx ${ownTx.hash}`);

  // ── Verify ────────────────────────────────────────────────────────────────
  const owner = await strategy.owner();
  const keeper = await strategy.keeper();
  const vaultOnStrat = await strategy.vault();
  const mid = await strategy.marketId();
  console.log("\n── verify ──");
  console.log(`  owner   = ${owner} ${owner.toLowerCase() === SAFE.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  keeper  = ${keeper} ${keeper.toLowerCase() === deployer.address.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  vault   = ${vaultOnStrat} ${vaultOnStrat.toLowerCase() === vault.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  market  = ${mid} ${mid === EXPECTED_MARKET_ID ? "✓" : "✗ MISMATCH"}`);
  if (owner.toLowerCase() !== SAFE.toLowerCase()) fail("ownership handoff failed");
  if (mid !== EXPECTED_MARKET_ID) fail("marketId mismatch on-chain");

  manifest.morpho_strategy = addr;
  manifest.morpho_market = {
    core: MORPHO,
    market_id: EXPECTED_MARKET_ID,
    loan: USDC,
    collateral: COLL,
    oracle: ORACLE,
    irm: IRM,
    lltv: "0.77",
    note: "flagship USDC market (WHYPE collateral) — deepest + most liquid on HyperEVM",
  };
  manifest.morpho_strategy_owner = SAFE;
  manifest.morpho_strategy_keeper = deployer.address;
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`manifest updated: morpho_strategy=${addr}`);

  console.log("\nNEXT (via scripts/safe_exec_mainnet.js, treasury Safe 2/3):");
  console.log(`  1. ACTION=addStrategy STRATEGY=${addr}`);
  console.log("  2. deactivate DN, allocate(), reactivate DN  (so the full deployable goes to Morpho)");
  console.log(`  3. node -e '...strategy.deploy()'  (keeper supply — ops key)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
