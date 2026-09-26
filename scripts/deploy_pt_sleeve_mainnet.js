/**
 * Mainnet deploy — PTSleeveStrategy (HyperEVM 999). DRY BY DEFAULT; sending
 * requires MAINNET_OK=1.
 *
 * Deploys the vault-facing side of the PT fixed-rate sleeve. The executor on
 * Arbitrum must ALREADY be deployed (`PT_EXECUTOR_ADDR`) — the strategy's
 * `arbExecutor` is immutable and only ever sends funds there.
 *
 * Run flow (mirrors the Morpho strategy deploy):
 *   deployer deploys as owner → setKeeper(deployer) → setVault(vault) →
 *   transferOwnership(treasury Safe 2/3). The vault addStrategy + allocate
 *   steps go through scripts/safe_exec_mainnet.js afterwards.
 *
 *   PT_EXECUTOR_ADDR=0x... npx hardhat run scripts/deploy_pt_sleeve_mainnet.js --network hyperMainnet
 *
 * Env:
 *   MAINNET_OK=1        required to send (otherwise read-only plan)
 *   DRY=1               explicit dry run
 *   PT_EXECUTOR_ADDR    Arbitrum executor address (required)
 *   FORCE=1             redeploy even if the manifest already has pt_sleeve_strategy
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f"; // HyperEVM USDC
const TOKEN_MESSENGER = "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d"; // CCTP V2
const MESSAGE_TRANSMITTER = "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64"; // CCTP V2
const DEST_DOMAIN = 3; // CCTP domain of Arbitrum
const SAFE = "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB"; // treasury Safe (2/3)
const EXPECTED_DEPLOYER = process.env.EXPECTED_DEPLOYER || "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.mainnet.json");

const SEND = process.env.MAINNET_OK === "1" && process.env.DRY !== "1";

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
  if (chainId !== 999) fail(`chainId ${chainId} is not HyperEVM mainnet (999)`);

  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    fail(`deployer ${deployer.address} != expected ops EOA ${EXPECTED_DEPLOYER}`);
  }

  const executor = process.env.PT_EXECUTOR_ADDR;
  if (!isAddr(executor)) fail("PT_EXECUTOR_ADDR (Arbitrum executor address) is required");

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  if (manifest.pt_sleeve_strategy && process.env.FORCE !== "1") {
    fail(`manifest already has pt_sleeve_strategy=${manifest.pt_sleeve_strategy} — FORCE=1 to overwrite`);
  }
  const vault = manifest.pro_yield_vault;
  if (!vault) fail("manifest missing pro_yield_vault");

  console.log(`deployer: ${deployer.address}`);
  console.log(`owner after handoff: ${SAFE} (treasury Safe 2/3)`);
  console.log(`vault link: ${vault}`);
  console.log(`arbExecutor: ${executor} (immutable fund destination)`);
  console.log(`cctp: messenger ${TOKEN_MESSENGER} · transmitter ${MESSAGE_TRANSMITTER} · dest domain ${DEST_DOMAIN}`);

  if (!SEND) {
    console.log("\nDRY — would deploy PTSleeveStrategy(USDC, deployer, MESSENGER, TRANSMITTER, arbExecutor, 3);");
    console.log("then: setKeeper(deployer), setVault(vault), transferOwnership(SAFE), verify.");
    console.log("Re-run with MAINNET_OK=1 to send.");
    return;
  }

  const Strategy = await ethers.getContractFactory("PTSleeveStrategy");
  // HyperEVM hard-caps a tx at 3,000,000 gas — check deploy headroom first
  // (same guard as the vault / Morpho deploys).
  const raw = new ethers.JsonRpcProvider("https://rpc.hyperliquid.xyz/evm");
  const est = await raw.estimateGas(
    await Strategy.getDeployTransaction(USDC, deployer.address, TOKEN_MESSENGER, MESSAGE_TRANSMITTER, executor, DEST_DOMAIN)
  );
  const gasPrice = BigInt(process.env.PT_GAS_PRICE_WEI || "150000000"); // 0.15 gwei
  const latest = await raw.getBlock("latest");
  console.log(`deploy estimate: ${est} (limit 3,000,000 — headroom ${3_000_000n - est})`);
  console.log(`gasPrice: ${gasPrice} wei · baseFee: ${latest.baseFeePerGas} wei`);
  if (gasPrice < latest.baseFeePerGas) fail(`gasPrice below base fee`);
  if (est >= 2_990_000n) fail(`deploy estimate ${est} leaves <10k headroom — refusing`);
  const overrides = { gasLimit: (est * 125n) / 100n, gasPrice };

  let strategy;
  if (process.env.PT_EXISTING_STRATEGY) {
    // Resume mode: attach to an already-deployed strategy (e.g. the follow-up
    // config txs need to be re-run) without deploying again.
    strategy = Strategy.attach(process.env.PT_EXISTING_STRATEGY);
    console.log(`resume: attached to existing strategy ${process.env.PT_EXISTING_STRATEGY}`);
  } else {
    strategy = await Strategy.deploy(USDC, deployer.address, TOKEN_MESSENGER, MESSAGE_TRANSMITTER, executor, DEST_DOMAIN, overrides);
    await strategy.waitForDeployment();
    console.log(`PTSleeveStrategy deployed: ${await strategy.getAddress()} (tx ${strategy.deploymentTransaction().hash})`);
  }
  const addr = await strategy.getAddress();

  const feeOverrides = { gasPrice };
  const keepTx = await strategy.setKeeper(deployer.address, feeOverrides);
  await keepTx.wait();
  console.log(`setKeeper(${deployer.address}) tx ${keepTx.hash}`);

  const vaultTx = await strategy.setVault(vault, feeOverrides);
  await vaultTx.wait();
  console.log(`setVault(${vault}) tx ${vaultTx.hash}`);

  // Optional: beta-scale bridge minimum, set during the deployer-owner window
  // (before handover) — the floor guard in setParams is $2.
  const minBridge = process.env.PT_MIN_BRIDGE_USD6;
  if (minBridge) {
    const headroom = process.env.PT_HEADROOM_BPS || 2000;
    const paramsTx = await strategy.setParams(headroom, minBridge, feeOverrides);
    await paramsTx.wait();
    console.log(`setParams(headroomBps=${headroom}, minBridgeUsd6=${minBridge}) tx ${paramsTx.hash}`);
  }

  const ownTx = await strategy.transferOwnership(SAFE, feeOverrides);
  await ownTx.wait();
  console.log(`transferOwnership(${SAFE}) tx ${ownTx.hash}`);

  // ── Verify ────────────────────────────────────────────────────────────────
  const owner = await strategy.owner();
  const keeper = await strategy.keeper();
  const vaultOnStrat = await strategy.vault();
  const arbExec = await strategy.arbExecutor();
  const domain = await strategy.destDomain();
  const minB = await strategy.minBridgeUsd6();
  const hr = await strategy.headroomBps();
  console.log("\n── verify ──");
  console.log(`  owner   = ${owner} ${owner.toLowerCase() === SAFE.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  keeper  = ${keeper} ${keeper.toLowerCase() === deployer.address.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  vault   = ${vaultOnStrat} ${vaultOnStrat.toLowerCase() === vault.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  arbExec = ${arbExec} ${arbExec.toLowerCase() === executor.toLowerCase() ? "✓" : "✗ MISMATCH"}`);
  console.log(`  domain  = ${domain} ${Number(domain) === DEST_DOMAIN ? "✓" : "✗ MISMATCH"}`);
  console.log(`  params  = headroomBps ${hr} · minBridgeUsd6 ${minB}`);
  if (owner.toLowerCase() !== SAFE.toLowerCase()) fail("ownership handoff failed");
  if (arbExec.toLowerCase() !== executor.toLowerCase()) fail("arbExecutor mismatch on-chain");

  manifest.pt_sleeve_strategy = addr;
  manifest.pt_sleeve_strategy_owner = SAFE;
  manifest.pt_sleeve_strategy_keeper = deployer.address;
  manifest.pt_sleeve_executor = executor;
  manifest.pt_sleeve_note = "PT fixed-rate sleeve (R2): CCTP V2 <-> Arbitrum executor -> Pendle PT. See docs/PT_SLEEVE_DESIGN.md";
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
  console.log(`manifest updated: pt_sleeve_strategy=${addr}`);

  console.log("\nNEXT (via scripts/safe_exec_mainnet.js, treasury Safe 2/3):");
  console.log(`  1. ACTION=addStrategy STRATEGY=${addr}  (+ activate)`);
  console.log("  2. allocate() a small first slice to the strategy (≤10% of book to start)");
  console.log("  3. keeper: strategy.deployToArb(amount, 0) → executor.buyPT (ops) → sync loop");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
