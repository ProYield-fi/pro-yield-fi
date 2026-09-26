/**
 * PYD suite mainnet deploy — HyperEVM (999). DRY BY DEFAULT; sending requires MAINNET_OK=1.
 *
 * Deploys the PYD community set (docs/VAULT_UNLOCK_PLAN.md §7 — now in scope for beta):
 *   PYDToken(100_000_000)                          fixed supply, OZ ERC20
 *                                                  (WHOLE-token convention: 100000000, never wei)
 *   PYDStaking(token)                              Synthetix-style reward streams
 *   PYDFunder(USDC, staking, owner)                USDC->PYD conversion -> streams
 *                                                  (dormant: no swapper is set, topUp reverts)
 *   PYDFeeDiscount(token, USDC, FD, vault, owner)  tiered fee rebates (real fee deltas)
 *
 * Wiring in the same run:
 *   staking.transferOwnership(funder)      the funder funds streams (OZ v5 one-step Ownable)
 *   funder.setPaused(true)                 belt & braces on top of the missing swapper
 *   token.transfer(TREASURY_SAFE, all)     full 100M supply to the treasury Safe
 *   funder.transferOwnership(TREASURY_SAFE)
 *   feeDiscount.transferOwnership(TREASURY_SAFE)
 *
 * Guards — every one must pass before a single wei moves:
 *   1. MAINNET_OK=1                    explicit human go-ahead
 *   2. provider chainId == 999         refuse any other chain outright
 *   3. deployer == EXPECTED_DEPLOYER   refuse surprise keys
 *   4. manifest absent (FORCE=1)       refuse silent redeploys
 *   5. USDC code + 6dp + symbol        Circle-native 0xb88339CB…
 *   6. FD + vault + Safe have code     the discount reads FD/vault on-chain
 *
 * Env:
 *   MAINNET_OK=1        required to send (otherwise read-only plan + estimates)
 *   DRY=1               explicit dry run (same as omitting MAINNET_OK)
 *   FORCE=1             overwrite an existing manifest
 *   DEPLOY_MANIFEST     manifest path override (fork rehearsal!)
 *   TREASURY_SAFE       default = the mainnet treasury Safe 0x8A1b107e…
 *   PYD_GAS_PRICE_WEI   explicit gas price when the RPC's suggestion is off
 *   HYPEREVM_MAINNET_RPC_URL  RPC override (anvil fork dry-runs)
 *
 *   npx hardhat run scripts/deploy_pyd_mainnet.js --network hyperMainnet
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f"; // Circle-native, 6dp
const FEE_DISTRIBUTOR = "0x18FB3e2FCd2221EeeB73E8D92ac892E38483b8E9"; // mainnet FD
const VAULT = "0x8954a73Bb36D17e4B212137Eb7B2328A1A14D1C1"; // mainnet vault (discount reads shares())
const DEFAULT_SAFE = "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB"; // treasury Safe 2/3
const EXPECTED_DEPLOYER = process.env.EXPECTED_DEPLOYER || "0xaDD8f2678De34FD06C158DD80C5253A504A5EA1D";
const MANIFEST = process.env.DEPLOY_MANIFEST || path.join(__dirname, "..", "deployed_addresses.pyd.mainnet.json");

const SEND = process.env.MAINNET_OK === "1" && process.env.DRY !== "1";
const FORCE = process.env.FORCE === "1";
const BLOCK_GAS_CAP = 2990000n;

function fail(msg) {
  console.error(`REFUSING: ${msg}`);
  process.exit(3);
}
const clamp = (x) => (x > BLOCK_GAS_CAP ? BLOCK_GAS_CAP : x);
function deployedBytes(artifactPath) {
  const a = require(artifactPath);
  return BigInt((a.deployedBytecode.length - 2) / 2);
}

async function main() {
  const { ethers } = hre;

  // ── Guard 2: chain identity ────────────────────────────────────────────────
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  console.log(`network: ${hre.network.name} · chainId ${chainId} · ${SEND ? "SEND MODE" : "DRY MODE"}`);
  if (chainId !== 999) fail(`chainId ${chainId} is not HyperEVM mainnet (999)`);

  // ── Guard 3: expected deployer ─────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  if (deployer.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    fail(`deployer ${deployer.address} != expected ops EOA ${EXPECTED_DEPLOYER}`);
  }
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log(`deployer: ${deployer.address} · gas balance ${ethers.formatEther(bal)} HYPE`);

  // ── Guard 5/6: external addresses look right ───────────────────────────────
  for (const [name, addr] of [["USDC", USDC], ["FeeDistributor", FEE_DISTRIBUTOR], ["Vault", VAULT]]) {
    const code = await ethers.provider.getCode(addr);
    if (code === "0x") fail(`no code at ${name} ${addr} on chain ${chainId}`);
  }
  const usdc = new ethers.Contract(
    USDC,
    ["function decimals() view returns (uint8)", "function symbol() view returns (string)"],
    ethers.provider
  );
  const [decimals, symbol] = await Promise.all([usdc.decimals(), usdc.symbol()]);
  console.log(`asset: USDC ${USDC} · ${symbol} · ${decimals}dp`);
  if (Number(decimals) !== 6 || symbol !== "USDC") fail(`USDC sanity failed (${symbol}/${decimals})`);

  const safe = process.env.TREASURY_SAFE || DEFAULT_SAFE;
  if (!ethers.isAddress(safe)) fail(`TREASURY_SAFE not an address: ${safe}`);
  const safeCode = await ethers.provider.getCode(safe);
  if (safeCode === "0x") fail(`no code at treasury Safe ${safe} — refusing to hand supply to an EOA`);
  console.log(`treasury Safe: ${safe}`);

  // ── Guard 4: manifest absent ───────────────────────────────────────────────
  if (fs.existsSync(MANIFEST) && !FORCE) {
    fail(`manifest already exists at ${MANIFEST} — deploy would shadow it. FORCE=1 to override.`);
  }

  // ── Parameters ─────────────────────────────────────────────────────────────
  const supplyWhole = BigInt(process.env.PYD_SUPPLY_WHOLE || "100000000"); // WHOLE tokens!
  if (supplyWhole <= 0n) fail(`PYD_SUPPLY_WHOLE must be positive (got ${supplyWhole})`);
  console.log(`supply: ${supplyWhole} PYD (whole tokens; constructor scales by 10^18)`);

  // ── Gas sizing (bytecode-based, clamped under the 3M block cap) ────────────
  const tokGas = clamp(21000n + 200n * deployedBytes("../artifacts/contracts/PYDToken.sol/PYDToken.json") + 300000n);
  const stkGas = clamp(21000n + 200n * deployedBytes("../artifacts/contracts/PYDStaking.sol/PYDStaking.json") + 400000n);
  const funGas = clamp(21000n + 200n * deployedBytes("../artifacts/contracts/PYDFunder.sol/PYDFunder.json") + 400000n);
  const disGas = clamp(21000n + 200n * deployedBytes("../artifacts/contracts/PYDFeeDiscount.sol/PYDFeeDiscount.json") + 700000n);
  const cfgGas = 300000n; // each wiring tx is small
  const txs = 4n + 5n; // deploys + (transferOwnership x2, setPaused, token transfer, staking ownership)
  const totalEst = tokGas + stkGas + funGas + disGas + cfgGas * 5n;
  const feeData = await ethers.provider.getFeeData();
  const gasPrice = process.env.PYD_GAS_PRICE_WEI ? BigInt(process.env.PYD_GAS_PRICE_WEI) : (feeData.maxFeePerGas ?? feeData.gasPrice ?? 1n);
  const cost = totalEst * gasPrice;
  console.log(
    `gas plan: token ≤${tokGas} + staking ≤${stkGas} + funder ≤${funGas} + discount ≤${disGas} + ${txs - 4n} wiring txns → ~${ethers.formatEther(cost)} HYPE at ${gasPrice} wei/gas`
  );
  if (bal < cost) {
    if (SEND) fail(`insufficient gas: have ${ethers.formatEther(bal)} HYPE, need ~${ethers.formatEther(cost)} (sized). Refill the deployer before sending.`);
    console.log(`NOTE (dry): deployer balance ${ethers.formatEther(bal)} HYPE < sized cost ~${ethers.formatEther(cost)} HYPE — refill required before SEND.`);
  }

  if (!SEND) {
    console.log("\nDRY — nothing sent. Re-run with MAINNET_OK=1 to deploy.");
    console.log(`would deploy: PYDToken(${supplyWhole}) + PYDStaking(<token>) + PYDFunder(${USDC}, <staking>, ${deployer.address}) + PYDFeeDiscount(<token>, ${USDC}, ${FEE_DISTRIBUTOR}, ${VAULT}, ${deployer.address})`);
    console.log("then wire: staking owner -> funder · funder paused=true · supply -> treasury Safe · funder+discount owner -> treasury Safe");
    return;
  }

  const overrides = { gasLimit: undefined, maxFeePerGas: process.env.PYD_GAS_PRICE_WEI ? gasPrice : undefined };
  const write = (gasLimit) => ({ gasLimit, ...(overrides.maxFeePerGas ? { maxFeePerGas: overrides.maxFeePerGas } : {}) });

  // ── Deploy ─────────────────────────────────────────────────────────────────
  console.log("\nDeploying PYDToken…");
  const token = await (await ethers.getContractFactory("PYDToken")).deploy(supplyWhole, write(tokGas));
  await token.waitForDeployment();
  const tokenReceipt = await token.deploymentTransaction().wait();
  const tokenAddr = await token.getAddress();
  console.log(`PYDToken: ${tokenAddr} (gasUsed ${tokenReceipt.gasUsed})`);

  console.log("Deploying PYDStaking…");
  const staking = await (await ethers.getContractFactory("PYDStaking")).deploy(tokenAddr, write(stkGas));
  await staking.waitForDeployment();
  const stakingReceipt = await staking.deploymentTransaction().wait();
  const stakingAddr = await staking.getAddress();
  console.log(`PYDStaking: ${stakingAddr} (gasUsed ${stakingReceipt.gasUsed})`);

  console.log("Deploying PYDFunder…");
  const funder = await (await ethers.getContractFactory("PYDFunder")).deploy(USDC, stakingAddr, deployer.address, write(funGas));
  await funder.waitForDeployment();
  const funderReceipt = await funder.deploymentTransaction().wait();
  const funderAddr = await funder.getAddress();
  console.log(`PYDFunder: ${funderAddr} (gasUsed ${funderReceipt.gasUsed})`);

  console.log("Deploying PYDFeeDiscount…");
  const discount = await (await ethers.getContractFactory("PYDFeeDiscount")).deploy(tokenAddr, USDC, FEE_DISTRIBUTOR, VAULT, deployer.address, write(disGas));
  await discount.waitForDeployment();
  const discountReceipt = await discount.deploymentTransaction().wait();
  const discountAddr = await discount.getAddress();
  console.log(`PYDFeeDiscount: ${discountAddr} (gasUsed ${discountReceipt.gasUsed})`);

  const txHashes = {
    pydToken: tokenReceipt.hash,
    pydStaking: stakingReceipt.hash,
    pydFunder: funderReceipt.hash,
    pydFeeDiscount: discountReceipt.hash,
  };

  // ── Wiring ─────────────────────────────────────────────────────────────────
  console.log("\nWiring…");
  let tx;

  tx = await staking.transferOwnership(funderAddr, write(cfgGas));
  await tx.wait();
  txHashes.stakingOwnershipToFunder = tx.hash;
  console.log("staking owner -> funder:", tx.hash);

  tx = await funder.setPaused(true, write(cfgGas));
  await tx.wait();
  txHashes.funderPaused = tx.hash;
  console.log("funder paused=true:", tx.hash);

  tx = await token.transfer(safe, supplyWhole * 10n ** 18n, write(cfgGas));
  await tx.wait();
  txHashes.tokenToTreasury = tx.hash;
  console.log(`token supply -> treasury Safe: ${tx.hash}`);

  tx = await funder.transferOwnership(safe, write(cfgGas));
  await tx.wait();
  txHashes.funderOwnershipToSafe = tx.hash;
  console.log("funder owner -> Safe:", tx.hash);

  tx = await discount.transferOwnership(safe, write(cfgGas));
  await tx.wait();
  txHashes.discountOwnershipToSafe = tx.hash;
  console.log("discount owner -> Safe:", tx.hash);

  // ── Read-backs (all must pass) ─────────────────────────────────────────────
  console.log("\nRead-back checks…");
  const checks = [];
  const total = await token.totalSupply();
  checks.push(["totalSupply == 100M*1e18", total === supplyWhole * 10n ** 18n, total.toString()]);
  checks.push(["token.name", (await token.name()) === "ProYield", await token.name()]);
  checks.push(["token.symbol", (await token.symbol()) === "PYD", await token.symbol()]);
  checks.push(["token.decimals", Number(await token.decimals()) === 18, String(await token.decimals())]);
  checks.push(["safe holds full supply", (await token.balanceOf(safe)) === supplyWhole * 10n ** 18n, (await token.balanceOf(safe)).toString()]);
  checks.push(["staking.pyd", (await staking.pyd()) === tokenAddr, await staking.pyd()]);
  checks.push(["staking.owner == funder", (await staking.owner()) === funderAddr, await staking.owner()]);
  checks.push(["funder.usdc", (await funder.usdc()) === USDC, await funder.usdc()]);
  checks.push(["funder.staking", (await funder.staking()) === stakingAddr, await funder.staking()]);
  checks.push(["funder.owner == Safe", (await funder.owner()) === safe, await funder.owner()]);
  checks.push(["funder.paused == true", (await funder.paused()) === true, String(await funder.paused())]);
  checks.push(["funder.swapper == 0x0 (dormant)", (await funder.swapper()) === ethers.ZeroAddress, await funder.swapper()]);
  checks.push(["discount.pyd", (await discount.pyd()) === tokenAddr, await discount.pyd()]);
  checks.push(["discount.usdc", (await discount.usdc()) === USDC, await discount.usdc()]);
  checks.push(["discount.feeDistributor", (await discount.feeDistributor()) === FEE_DISTRIBUTOR, await discount.feeDistributor()]);
  checks.push(["discount.vault", (await discount.vault()) === VAULT, await discount.vault()]);
  checks.push(["discount.owner == Safe", (await discount.owner()) === safe, await discount.owner()]);
  const t0 = await discount.tiers(0);
  const t3 = await discount.tiers(3);
  checks.push(["tier0 = 1000 PYD / 500bps", t0[0] === 1000n * 10n ** 18n && t0[1] === 500n, `${t0[0]}/${t0[1]}`]);
  checks.push(["tier3 = 1M PYD / 2000bps", t3[0] === 1000000n * 10n ** 18n && t3[1] === 2000n, `${t3[0]}/${t3[1]}`]);

  let allOk = true;
  for (const [name, ok, got] of checks) {
    console.log(`${ok ? "  ✓" : "  ✗"} ${name}${ok ? "" : ` — got ${got}`}`);
    if (!ok) allOk = false;
  }

  // ── Manifest ───────────────────────────────────────────────────────────────
  const manifest = {
    chainId: 999,
    network: "hyperevm-mainnet",
    deployedBy: deployer.address,
    timestamp: new Date().toISOString(),
    contracts: {
      pydToken: tokenAddr,
      pydStaking: stakingAddr,
      pydFunder: funderAddr,
      pydFeeDiscount: discountAddr,
      feeDistributor: FEE_DISTRIBUTOR,
      vault: VAULT,
      treasurySafe: safe,
    },
    supplyWholeTokens: supplyWhole.toString(),
    wiring: {
      stakingOwner: funderAddr,
      funderOwner: safe,
      discountOwner: safe,
      funderPaused: true,
      funderSwapper: null,
    },
    txHashes,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
  console.log(`\nmanifest written: ${MANIFEST}`);

  if (!allOk) {
    console.error("\nREAD-BACK FAILURES — investigate before publishing addresses anywhere.");
    process.exit(4);
  }
  console.log("\nNext steps: (1) web config — set PYD_TOKEN_ADDRESS / PYD_STAKING_ADDRESS / PYD_FEE_DIST_ADDRESS / PYD_VAULT_ADDRESS + PYD_MAINNET_ENABLED=true in CF env; (2) LP pool + swapper (separate); (3) publish on /token + /transparency.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
