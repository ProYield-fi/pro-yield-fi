/**
 * Mainnet deploy — DNCoreStrategy (HyperEVM 999). DRY BY DEFAULT; sending
 * requires MAINNET_OK=1.
 *
 * The strategy is the vault's delta-neutral engine: bridges USDC to Core,
 * class-transfers to perp, opens the HYPE short, and (HIGH-2) buys/holds the
 * spot hedge leg + reads spot balances through the read precompiles.
 *
 * Run 1 (deployer as owner) configures everything, then hands the OWNER role
 * to the treasury Safe (2-of-3) — the keeper stays the ops EOA (hot, but
 * cannot change policy).
 *
 *   npx hardhat run scripts/deploy_dn_mainnet.js --network hyperMainnet
 *
 * Env:
 *   MAINNET_OK=1   required to send (otherwise read-only plan + estimates)
 *   DRY=1          explicit dry run
 *   PERP_ASSET     default 159 (HYPE perp on mainnet — verified against a live
 *                  order rejection earlier: "asset=159")
 *   SPOT_PAIR      default 107 (HYPE/USDC spot pair — @107, verified live)
 *   MAX_ACTION_USD default 25 ($25 per-action cap)
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const SAFE = "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB"; // treasury Safe (2/3)
const EXPECTED_DEPLOYER = process.env.EXPECTED_DEPLOYER || "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.mainnet.json");

const SEND = process.env.MAINNET_OK === "1" && process.env.DRY !== "1";
const PERP_ASSET = Number(process.env.PERP_ASSET || 159);
const SPOT_PAIR = Number(process.env.SPOT_PAIR || 107);
const MAX_ACTION_USD6 = BigInt(process.env.MAX_ACTION_USD || "25") * 1_000_000n;

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
  console.log(`deployer: ${deployer.address} (Safe owner #1)`);
  console.log(`owner after handoff: ${SAFE} (treasury Safe 2/3)`);
  console.log(`perp asset: ${PERP_ASSET} · spot pair: @${SPOT_PAIR} · maxAction: $${MAX_ACTION_USD6 / 1_000_000n}`);

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (manifest.dn_core_strategy && process.env.FORCE !== "1") {
    fail(`manifest already has dn_core_strategy=${manifest.dn_core_strategy} — FORCE=1 to overwrite`);
  }

  if (!SEND) {
    console.log("\nDRY — would deploy DNCoreStrategy(USDC, deployer, perpAsset, maxActionUsd6);");
    console.log("then: setSpotConfig(107), setKeeper(deployer), transferOwnership(SAFE), verify.");
    console.log("Re-run with MAINNET_OK=1 to send.");
    return;
  }

  const Strategy = await ethers.getContractFactory("DNCoreStrategy");
  // Explicit gasLimit: this build needs ~2.98M (code deposit dominates) and
  // gas_guard.js widens estimates 3× for anvil safety — the widened number
  // trips hardhat's block-limit check (HyperEVM block gas limit = 3,000,000).
  // Bounded here; the estimate below still gates the send.
  // Raw provider for the estimate: gas_guard.js widens the hardhat provider's
  // estimates 3× (anvil safety); the RAW number is the one the chain charges.
  const raw = new ethers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");
  const est = await raw.estimateGas(
    await Strategy.getDeployTransaction(USDC, deployer.address, PERP_ASSET, MAX_ACTION_USD6)
  );
  console.log(`deploy estimate: ${est} (limit 3,000,000 — headroom ${3_000_000n - est})`);
  if (est >= 2_990_000n) fail(`deploy estimate ${est} leaves <10k headroom — refusing`);
  const strategy = await Strategy.deploy(USDC, deployer.address, PERP_ASSET, MAX_ACTION_USD6, {
    gasLimit: 2_990_000n,
  });
  await strategy.waitForDeployment();
  const addr = await strategy.getAddress();
  console.log(`DNCoreStrategy deployed: ${addr} (tx ${strategy.deploymentTransaction().hash})`);

  // Spot hedge config — derived OFF-chain from the live 0x80b/0x80c reads
  // (pair 107 → token 150, szDecimals 2 → pxScale 1e8, verified against the
  // live mainnet precompiles); the contract sanity-checks the values.
  const spotToken = BigInt(process.env.SPOT_TOKEN || "150");
  const spotScale = BigInt(process.env.SPOT_PX_SCALE || String(10 ** 8));
  const spotTx = await strategy.setSpotConfig(SPOT_PAIR, spotToken, spotScale);
  await spotTx.wait();
  console.log(`setSpotConfig(${SPOT_PAIR}, ${spotToken}, ${spotScale}) tx ${spotTx.hash}`);
  console.log(`  spotAsset=${await strategy.spotAsset()} spotTokenIndex=${await strategy.spotTokenIndex()} pxScale=${await strategy.spotPxScale()}`);

  const keepTx = await strategy.setKeeper(deployer.address);
  await keepTx.wait();
  console.log(`setKeeper(${deployer.address}) tx ${keepTx.hash}`);

  const ownTx = await strategy.transferOwnership(SAFE);
  await ownTx.wait();
  console.log(`transferOwnership(${SAFE}) tx ${ownTx.hash}`);

  // Verify final state.
  const owner = await strategy.owner();
  const keeper = await strategy.keeper();
  const perpAsset = await strategy.perpAsset();
  console.log("\nverify:");
  console.log(`  owner     = ${owner} ${owner.toLowerCase() === SAFE.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  keeper    = ${keeper} ${keeper.toLowerCase() === deployer.address.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  perpAsset = ${perpAsset} ${Number(perpAsset) === PERP_ASSET ? "✓" : "✗ MISMATCH"}`);
  console.log(`  spotAsset = ${await strategy.spotAsset()} ${Number(await strategy.spotAsset()) === 10000 + SPOT_PAIR ? "✓" : "✗ MISMATCH"}`);
  if (owner.toLowerCase() !== SAFE.toLowerCase()) fail("ownership handoff failed");

  manifest.dn_core_strategy = addr;
  manifest.dn_core_strategy_meta = {
    deployed_utc: new Date().toISOString(),
    perp_asset: PERP_ASSET,
    spot_pair: SPOT_PAIR,
    spot_asset: 10000 + SPOT_PAIR,
    max_action_usd6: String(MAX_ACTION_USD6),
    keeper: deployer.address,
    owner: SAFE,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n");
  console.log(`\nmanifest updated: dn_core_strategy=${addr}`);
}

main().catch((e) => {
  console.error("deploy failed:", e.message || e);
  process.exit(1);
});
