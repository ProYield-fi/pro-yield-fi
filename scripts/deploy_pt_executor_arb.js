/**
 * Mainnet deploy — PTSleeveExecutor (Arbitrum One, 42161). DRY BY DEFAULT;
 * sending requires ARB_OK=1.
 *
 * The executor holds sleeve USDC on Arbitrum and can only: buyPT / sellPT on
 * the configured Pendle market, and burn USDC back (CCTP standard) to the
 * HyperEVM strategy address. Configuration + rescue live with the owner.
 *
 * Deploy-order note (bootstrap): the strategy's `arbExecutor` is immutable, so
 * the strategy must be deployed AFTER this executor. This script takes the
 * strategy address (`PT_STRATEGY_ADDR`) as the executor's `strategyReturn` —
 * pass the FINAL strategy address when possible; if the strategy address was
 * only predicted, call `confirmStrategyReturn(final)` (owner, once, pre-activity)
 * afterwards to correct it.
 *
 *   npx hardhat run scripts/deploy_pt_executor_arb.js --network arbMainnet
 *
 * Env:
 *   ARB_OK=1            required to send (otherwise read-only plan)
 *   DRY=1               explicit dry run
 *   PT_STRATEGY_ADDR    HyperEVM strategy address (required)
 *   PT_ARB_OWNER        owner (default: deployer — hand to an Arb-safe later)
 *   PT_ARB_OPS          ops key (default: deployer)
 *   PT_MARKET / PT_TOKEN   optional: initial market config (setMarket by deployer)
 *   FORCE=1             overwrite manifest entry
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC_ARB = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"; // native USDC, Arbitrum One
const ROUTER = "0x888888888889758F76e7103c6CbF23ABbF58F946"; // Pendle Router v4
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"; // CCTP V2
const EXPECTED_DEPLOYER = process.env.EXPECTED_DEPLOYER || "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.arbitrum.json");

const SEND = process.env.ARB_OK === "1" && process.env.DRY !== "1";

function fail(msg) {
  console.error(`REFUSING: ${msg}`);
  process.exit(3);
}

function isAddr(a) {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`network: ${hre.network.name} · chainId ${chainId} · ${SEND ? "SEND MODE" : "DRY MODE"}`);
  if (chainId !== 42161) fail(`chainId ${chainId} is not Arbitrum One (42161)`);

  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    fail(`deployer ${deployer.address} != expected ops EOA ${EXPECTED_DEPLOYER}`);
  }

  const strategy = process.env.PT_STRATEGY_ADDR;
  if (!isAddr(strategy)) fail("PT_STRATEGY_ADDR (HyperEVM strategy address) is required");
  const owner = process.env.PT_ARB_OWNER || deployer.address;
  if (!isAddr(owner)) fail("PT_ARB_OWNER is not an address");
  const ops = process.env.PT_ARB_OPS || deployer.address;
  if (!isAddr(ops)) fail("PT_ARB_OPS is not an address");
  const market = process.env.PT_MARKET || "";
  const ptToken = process.env.PT_TOKEN || "";
  if ((market && !isAddr(market)) || (ptToken && !isAddr(ptToken))) fail("PT_MARKET/PT_TOKEN must be addresses");

  let manifest = {};
  if (fs.existsSync(MANIFEST)) manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (manifest.pt_sleeve_executor && process.env.FORCE !== "1") {
    fail(`manifest already has pt_sleeve_executor=${manifest.pt_sleeve_executor} — FORCE=1 to overwrite`);
  }

  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer: ${deployer.address} · Arb ETH ${ethers.formatEther(bal)}`);
  console.log(`usdc: ${USDC_ARB}`);
  console.log(`router: ${ROUTER}`);
  console.log(`messenger: ${TOKEN_MESSENGER}`);
  console.log(`strategyReturn: ${strategy}`);
  console.log(`owner: ${owner}${owner === deployer.address ? "  (deployer — hand over later!)" : ""}`);
  console.log(`ops: ${ops}`);
  if (owner !== deployer.address && (market || ptToken)) {
    console.log("NOTE: owner != deployer → initial setMarket will be SKIPPED (owner must call it).");
  }

  if (!SEND) {
    console.log("\nDRY — would deploy PTSleeveExecutor(USDC_ARB, ROUTER, MESSENGER, strategyReturn, ops, owner);");
    if (market && ptToken && owner === deployer.address) console.log(`then setMarket(${market}, ${ptToken}).`);
    console.log("Re-run with ARB_OK=1 to send.");
    return;
  }

  const Exec = await ethers.getContractFactory("PTSleeveExecutor");
  const exec = await Exec.deploy(USDC_ARB, ROUTER, TOKEN_MESSENGER, strategy, ops, owner);
  await exec.waitForDeployment();
  const addr = await exec.getAddress();
  console.log(`PTSleeveExecutor deployed: ${addr} (tx ${exec.deploymentTransaction().hash})`);

  let marketTx = null;
  if (market && ptToken && owner === deployer.address) {
    marketTx = await exec.setMarket(market, ptToken);
    await marketTx.wait();
    console.log(`setMarket(${market}, ${ptToken}) tx ${marketTx.hash}`);
  }

  // ── Verify ────────────────────────────────────────────────────────────────
  const onchain = {
    usdc: await exec.usdc(),
    router: await exec.router(),
    messenger: await exec.tokenMessenger(),
    strategyReturn: await exec.strategyReturn(),
    ops: await exec.ops(),
    owner: await exec.owner(),
  };
  const wantStrategyReturn = "0x" + strategy.slice(2).toLowerCase().padStart(64, "0");
  console.log("\n── verify ──");
  console.log(`  usdc      = ${onchain.usdc} ${onchain.usdc.toLowerCase() === USDC_ARB.toLowerCase() ? "✓" : "✗"}`);
  console.log(`  router    = ${onchain.router} ${onchain.router.toLowerCase() === ROUTER.toLowerCase() ? "✓" : "✗"}`);
  console.log(`  messenger = ${onchain.messenger} ${onchain.messenger.toLowerCase() === TOKEN_MESSENGER.toLowerCase() ? "✓" : "✗"}`);
  console.log(`  return    = ${onchain.strategyReturn} ${onchain.strategyReturn.toLowerCase() === wantStrategyReturn.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  ops       = ${onchain.ops} ${onchain.ops.toLowerCase() === ops.toLowerCase() ? "✓" : "✗"}`);
  console.log(`  owner     = ${onchain.owner} ${onchain.owner.toLowerCase() === owner.toLowerCase() ? "✓" : "✗"}`);
  if (onchain.strategyReturn.toLowerCase() !== wantStrategyReturn.toLowerCase()) fail("strategyReturn mismatch on-chain");
  if (onchain.router.toLowerCase() !== ROUTER.toLowerCase()) fail("router address mismatch");

  manifest.pt_sleeve_executor = addr;
  manifest.pt_sleeve_executor_owner = owner;
  manifest.pt_sleeve_executor_ops = ops;
  manifest.pt_sleeve_strategy_return = strategy;
  manifest.pt_sleeve_executor_market = market || null;
  manifest.pt_sleeve_executor_pt = ptToken || null;
  manifest.note = "PT fixed-rate sleeve executor — Arbitrum One. Ops can only buy/sell PT + CCTP-burn back to the HyperEVM strategy.";
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`manifest updated: pt_sleeve_executor=${addr}`);

  console.log("\nNEXT:");
  console.log("  1. If the strategy address was only PREDICTED: owner calls confirmStrategyReturn(final) BEFORE any activity.");
  console.log("  2. Deploy the strategy on HyperEVM with arbExecutor = this address:");
  console.log(`     PT_EXECUTOR_ADDR=${addr} MAINNET_OK=1 npx hardhat run scripts/deploy_pt_sleeve_mainnet.js --network hyperMainnet`);
  console.log("  3. Fund: strategy.deployToArb(amount, 0) (keeper) → watch executor.usdcBalance() on Arb.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
