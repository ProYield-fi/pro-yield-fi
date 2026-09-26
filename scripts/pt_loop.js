/**
 * PT sleeve ops — cross-chain loop driver (HyperEVM strategy ↔ Arbitrum executor).
 * DRY BY DEFAULT: nothing sends without PT_OK=1.
 *
 *   STAGE=status          (read-only, both chains)
 *   STAGE=confirm-return  (ARB) confirm/lock executor.strategyReturn = strategy
 *   STAGE=seed            (HE)  deployer EOA → strategy USDC (ops seed), PT_AMOUNT6
 *   STAGE=deploy          (HE)  strategy.deployToArb(PT_AMOUNT6, PT_MAX_FEE6)  [keeper]
 *   STAGE=ack             (HE)  strategy.ackArrival(PT_AMOUNT6)                [keeper]
 *   STAGE=buy             (ARB) executor.buyPT(PT_AMOUNT6, PT_MIN_PT_OUT)      [ops]
 *   STAGE=sync            (HE)  strategy.syncArbValue(PT_VALUE6)               [keeper]
 *   STAGE=sell            (ARB) executor.sellPT(PT_AMOUNT18, PT_MIN_USDC_OUT)  [ops]
 *   STAGE=return          (ARB) executor.bridgeBack(PT_AMOUNT6, PT_MAX_FEE6)   [ops]
 *   STAGE=complete        (HE)  strategy.completeInbound with PT_TX attestation
 *
 *   PT_OK=1 PT_AMOUNT6=2500000 STAGE=deploy npx hardhat run scripts/pt_loop.js --network hyperMainnet
 *
 * HE gas uses an explicit price (PT_GAS_PRICE_WEI, default 0.15 gwei) because
 * the ops EOA's HYPE balance is thin; Arb txs use ethers defaults.
 */
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const USDC_HE = "0xb88339cb7199b77e23db6e890353e22632ba630f";
const USDC_ARB = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const HE_RPC = "https://rpc.hyperliquid.xyz/evm";
const ARB_RPC = "https://arb1.arbitrum.io/rpc";
const MANIFEST_HE = path.join(__dirname, "..", "deployed_addresses.mainnet.json");
const MANIFEST_ARB = path.join(__dirname, "..", "deployed_addresses.arbitrum.json");

const STRAT_ABI = [
  "function deployToArb(uint256 amount, uint256 maxFee)",
  "function ackArrival(uint256 amount)",
  "function syncArbValue(uint256 value6)",
  "function completeInbound(bytes message, bytes attestation) returns (uint256)",
  "function pushIdle(uint256 amount)",
  "function sentFace6() view returns (uint256)",
  "function retFace6() view returns (uint256)",
  "function inFlight6() view returns (uint256)",
  "function arbValue6() view returns (uint256)",
  "function arbPrincipal6() view returns (uint256)",
  "function pendingRecall6() view returns (uint256)",
  "function minBridgeUsd6() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function isActive() view returns (bool)",
  "function keeper() view returns (address)",
  "function owner() view returns (address)",
];
const EXEC_ABI = [
  "function buyPT(uint256 usdcAmount, uint256 minUsdaiOut, uint256 minPtOut) returns (uint256)",
  "function sellPT(uint256 ptAmount, uint256 minUsdaiOut, uint256 minUsdcOut) returns (uint256)",
  "function bridgeBack(uint256 amount, uint256 maxFee)",
  "function confirmStrategyReturn(address _strategy)",
  "function ownerRescue(address token, address to, uint256 amount)",
  "function strategyReturn() view returns (bytes32)",
  "function returnConfirmed() view returns (bool)",
  "function ptBalance() view returns (uint256)",
  "function usdcBalance() view returns (uint256)",
  "function buyCount() view returns (uint256)",
  "function sellCount() view returns (uint256)",
  "function bridgeBackCount() view returns (uint256)",
  "function market() view returns (address)",
  "function pt() view returns (address)",
  "function owner() view returns (address)",
  "function ops() view returns (address)",
];
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)", "function approve(address,uint256) returns (bool)"];

const SEND = process.env.PT_OK === "1" && process.env.DRY !== "1";
const STAGE = process.env.STAGE || "status";
const AMOUNT6 = process.env.PT_AMOUNT6 ? BigInt(process.env.PT_AMOUNT6) : 0n;
const PRICE18 = process.env.PT_PRICE18 ? BigInt(process.env.PT_PRICE18) : 995000000000000000n; // 0.995

function fail(msg) { console.error(`REFUSING: ${msg}`); process.exit(3); }
function need(cond, msg) { if (!cond) fail(msg); }

async function main() {
  const { ethers } = hre;
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const manifestHE = JSON.parse(fs.readFileSync(MANIFEST_HE, "utf8"));
  const manifestARB = fs.existsSync(MANIFEST_ARB) ? JSON.parse(fs.readFileSync(MANIFEST_ARB, "utf8")) : {};
  const strategyAddr = manifestHE.pt_sleeve_strategy;
  const execAddr = manifestARB.pt_sleeve_executor || manifestHE.pt_sleeve_executor;
  need(strategyAddr && execAddr, "manifest missing pt_sleeve_strategy / pt_sleeve_executor");

  const heProvider = new ethers.JsonRpcProvider(HE_RPC);
  const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
  const strat = new ethers.Contract(strategyAddr, STRAT_ABI, heProvider);
  const exec = new ethers.Contract(execAddr, EXEC_ABI, arbProvider);
  const heUsdc = new ethers.Contract(USDC_HE, ERC20_ABI, heProvider);
  const arbUsdc = new ethers.Contract(USDC_ARB, ERC20_ABI, arbProvider);

  const [signer] = await ethers.getSigners();
  const gp = { gasPrice: BigInt(process.env.PT_GAS_PRICE_WEI || "150000000") };

  const printStatus = async () => {
    const s = {
      sentFace: await strat.sentFace6(), retFace: await strat.retFace6(), inFlight: await strat.inFlight6(),
      arbValue: await strat.arbValue6(), arbPrincipal: await strat.arbPrincipal6(),
      pendingRecall: await strat.pendingRecall6(), totalAssets: await strat.totalAssets(),
      heIdle: await heUsdc.balanceOf(strategyAddr), minBridge: await strat.minBridgeUsd6(),
      active: await strat.isActive(), keeper: await strat.keeper(), owner: await strat.owner(),
    };
    const e = {
      arbIdle: await arbUsdc.balanceOf(execAddr), ptBal: await exec.ptBalance(),
      buys: await exec.buyCount(), sells: await exec.sellCount(), returns: await exec.bridgeBackCount(),
      return: await exec.strategyReturn(), confirmed: await exec.returnConfirmed(),
      market: await exec.market(), owner: await exec.owner(), ops: await exec.ops(),
    };
    console.log("── strategy (HE) ──");
    console.log(`  totalAssets ${s.totalAssets} (idle ${s.heIdle} · inFlight ${s.inFlight} · arbValue ${s.arbValue})`);
    console.log(`  sentFace ${s.sentFace} · retFace ${s.retFace} · principal ${s.arbPrincipal} · pendingRecall ${s.pendingRecall}`);
    console.log(`  active ${s.active} · minBridge ${s.minBridge} · keeper ${s.keeper} · owner ${s.owner}`);
    console.log("── executor (ARB) ──");
    console.log(`  arbIdle ${e.arbIdle} · ptBalance ${e.ptBal} · buys ${e.buys} sells ${e.sells} returns ${e.returns}`);
    console.log(`  return ${e.return} · confirmed ${e.confirmed} · market ${e.market}`);
    console.log(`  owner ${e.owner} · ops ${e.ops}`);
    // binding cross-check
    const want = "0x" + strategyAddr.slice(2).toLowerCase().padStart(64, "0");
    console.log(`  cross-link: executor.strategyReturn == strategy ? ${e.return.toLowerCase() === want ? "YES ✓" : "NO ✗"}`);
  };

  if (STAGE === "status") { await printStatus(); return; }
  need(SEND, `STAGE=${STAGE} needs PT_OK=1`);

  if (STAGE === "confirm-return") {
    need(chainId === 42161, "run on --network arbMainnet");
    const conf = await exec.returnConfirmed();
    const want = "0x" + strategyAddr.slice(2).toLowerCase().padStart(64, "0");
    const cur = (await exec.strategyReturn()).toLowerCase();
    if (conf) { console.log(`already confirmed → locked at ${cur}. nothing to do.`); return; }
    console.log(`current return ${cur} · want ${want}`);
    const tx = await exec.connect(signer).confirmStrategyReturn(strategyAddr);
    await tx.wait();
    console.log(`confirmStrategyReturn(${strategyAddr}) tx ${tx.hash}`);
    console.log(`locked: ${await exec.strategyReturn()} · confirmed=${await exec.returnConfirmed()}`);
    return;
  }

  if (STAGE === "seed") {
    need(chainId === 999, "run on --network hyperMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const deployerUsdc = await heUsdc.balanceOf(signer.address);
    console.log(`deployer USDC ${deployerUsdc} → strategy ${strategyAddr} · ${AMOUNT6}`);
    need(deployerUsdc >= AMOUNT6, "deployer USDC below amount");
    const tx = await heUsdc.connect(signer).transfer(strategyAddr, AMOUNT6, gp);
    await tx.wait();
    console.log(`seed tx ${tx.hash} · strategy idle now ${await heUsdc.balanceOf(strategyAddr)}`);
    return;
  }

  if (STAGE === "deploy") {
    need(chainId === 999, "run on --network hyperMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const maxFee = process.env.PT_MAX_FEE6 ? BigInt(process.env.PT_MAX_FEE6) : 0n;
    console.log(`deployToArb(${AMOUNT6}, maxFee=${maxFee})`);
    const tx = await strat.connect(signer).deployToArb(AMOUNT6, maxFee, gp);
    await tx.wait();
    console.log(`deployToArb tx ${tx.hash} · inFlight ${await strat.inFlight6()}`);
    return;
  }

  if (STAGE === "receive") {
    need(process.env.PT_TX, "PT_TX=<depositForBurn tx hash on source chain> required");
    const srcDomain = process.env.PT_SRC_DOMAIN || (chainId === 42161 ? "19" : "3");
    const localProvider = chainId === 42161 ? arbProvider : heProvider;
    const localUsdc = chainId === 42161 ? arbUsdc : heUsdc;
    const balTarget = chainId === 42161 ? execAddr : strategyAddr;
    const url = `https://iris-api.circle.com/v2/messages/${srcDomain}?transactionHash=${process.env.PT_TX}`;
    console.log(`fetching attestation: ${url}`);
    const res = await fetch(url); const j = await res.json();
    const msg = (j.messages || [])[0];
    if (!msg || !msg.attestation || msg.attestation === "PENDING") {
      console.log(`not attested yet (${msg ? msg.status : "no message"}) — retry shortly.`);
      return;
    }
    console.log(`status ${msg.status} · mintRecipient ${(msg.decodedMessage && msg.decodedMessage.decodedMessageBody) ? msg.decodedMessage.decodedMessageBody.mintRecipient : "?"}`);
    const mt = new ethers.Contract(
      "0x81D40F21F12A8F0E3252Bccb954D722d4c464B64",
      ["function receiveMessage(bytes message, bytes attestation) returns (bool)"],
      localProvider
    );
    const tx = await mt.connect(signer).receiveMessage(msg.message, msg.attestation, gp);
    await tx.wait();
    console.log(`receiveMessage tx ${tx.hash} · target USDC now ${await localUsdc.balanceOf(balTarget)}`);
    return;
  }

  if (STAGE === "rescue") {
    need(chainId === 42161, "run on --network arbMainnet");
    need(process.env.PT_RESCUE_FROM, "PT_RESCUE_FROM=<old executor> required");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const to = process.env.PT_RESCUE_TO || signer.address;
    const oldExec = new ethers.Contract(process.env.PT_RESCUE_FROM, EXEC_ABI, arbProvider);
    console.log(`ownerRescue(USDC ${AMOUNT6} → ${to}) from ${process.env.PT_RESCUE_FROM}`);
    const tx = await oldExec.connect(signer).ownerRescue(USDC_ARB, to, AMOUNT6);
    await tx.wait();
    console.log(`rescue tx ${tx.hash} · recipient USDC now ${await arbUsdc.balanceOf(to)}`);
    return;
  }

  if (STAGE === "burn-he") {
    need(chainId === 42161, "run on --network arbMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const mintTo = process.env.PT_MINT_TO || signer.address;
    const messenger = new ethers.Contract(
      "0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d",
      ["function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold)"],
      arbProvider
    );
    const approve = await arbUsdc.connect(signer).approve("0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d", AMOUNT6);
    await approve.wait();
    console.log(`approve tx ${approve.hash}`);
    const tx = await messenger.connect(signer).depositForBurn(
      AMOUNT6, 19, "0x" + mintTo.slice(2).toLowerCase().padStart(64, "0"), USDC_ARB, ethers.ZeroHash, 0, 2000
    );
    await tx.wait();
    console.log(`burn Arb→HE tx ${tx.hash} · mintTo ${mintTo} · standard finality (free)`);
    console.log(`KEEP THIS HASH: PT_TX=${tx.hash} (source domain 3)`);
    return;
  }

  if (STAGE === "ack") {
    need(chainId === 999, "run on --network hyperMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const tx = await strat.connect(signer).ackArrival(AMOUNT6, gp);
    await tx.wait();
    console.log(`ackArrival(${AMOUNT6}) tx ${tx.hash} · inFlight ${await strat.inFlight6()}`);
    return;
  }

  if (STAGE === "buy") {
    need(chainId === 42161, "run on --network arbMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    // expected: USDC→USDai on Curve (~1:1 minus ~4bp) then USDai→PT at price18
    const expectedUsdai = (AMOUNT6 * 10n ** 12n * 996n) / 1000n; // -0.4% safety margin
    const expectedPt = (expectedUsdai * 10n ** 18n) / PRICE18;
    const minUsdaiOut = process.env.PT_MIN_USDAI_OUT ? BigInt(process.env.PT_MIN_USDAI_OUT) : (expectedUsdai * 995n) / 1000n; // ~99.5% of conservative est
    const minPtOut = process.env.PT_MIN_PT_OUT ? BigInt(process.env.PT_MIN_PT_OUT) : (expectedPt * 98n) / 100n;
    console.log(`buyPT(${AMOUNT6}, minUsdaiOut ${minUsdaiOut}, minPtOut ${minPtOut}) · price18 ${PRICE18}`);
    const tx = await exec.connect(signer).buyPT(AMOUNT6, minUsdaiOut, minPtOut);
    const rc = await tx.wait();
    console.log(`buyPT tx ${tx.hash} · ptBalance now ${await exec.ptBalance()}`);
    for (const log of rc.logs) {
      try { const p = exec.interface.parseLog(log); if (p) console.log(`  ev ${p.name} ${JSON.stringify(p.args.map(String))}`); } catch {}
    }
    return;
  }

  if (STAGE === "sync") {
    need(chainId === 999, "run on --network hyperMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required"); // value6 = ptBal*price + arbIdle, computed by caller
    const tx = await strat.connect(signer).syncArbValue(AMOUNT6, gp);
    await tx.wait();
    console.log(`syncArbValue(${AMOUNT6}) tx ${tx.hash} · totalAssets ${await strat.totalAssets()}`);
    return;
  }

  if (STAGE === "sell") {
    need(chainId === 42161, "run on --network arbMainnet");
    const ptAmt = process.env.PT_AMOUNT18 ? BigInt(process.env.PT_AMOUNT18) : await exec.ptBalance();
    const minUsdai = process.env.PT_MIN_USDAI_OUT ? BigInt(process.env.PT_MIN_USDAI_OUT) : 0n;
    const minOut = process.env.PT_MIN_USDC_OUT ? BigInt(process.env.PT_MIN_USDC_OUT) : 0n;
    console.log(`sellPT(${ptAmt}, minUsdaiOut ${minUsdai}, minUsdcOut ${minOut})`);
    const tx = await exec.connect(signer).sellPT(ptAmt, minUsdai, minOut);
    const rc = await tx.wait();
    console.log(`sellPT tx ${tx.hash} · arb idle now ${await arbUsdc.balanceOf(execAddr)}`);
    for (const log of rc.logs) {
      try { const p = exec.interface.parseLog(log); if (p) console.log(`  ev ${p.name} ${JSON.stringify(p.args.map(String))}`); } catch {}
    }
    return;
  }

  if (STAGE === "return") {
    need(chainId === 42161, "run on --network arbMainnet");
    need(AMOUNT6 > 0n, "PT_AMOUNT6 required");
    const maxFee = process.env.PT_MAX_FEE6 ? BigInt(process.env.PT_MAX_FEE6) : 0n;
    console.log(`bridgeBack(${AMOUNT6}, maxFee=${maxFee}) — standard finality (free)`);
    const tx = await exec.connect(signer).bridgeBack(AMOUNT6, maxFee);
    await tx.wait();
    console.log(`bridgeBack tx ${tx.hash} · bridgeBackCount ${await exec.bridgeBackCount()}`);
    console.log(`KEEP THIS HASH for STAGE=complete: PT_TX=${tx.hash}`);
    return;
  }

  if (STAGE === "complete") {
    need(chainId === 999, "run on --network hyperMainnet");
    need(process.env.PT_TX, "PT_TX=<bridgeBack tx hash> required");
    const url = `https://iris-api.circle.com/v2/messages/3?transactionHash=${process.env.PT_TX}`;
    console.log(`fetching attestation: ${url}`);
    const res = await fetch(url);
    const j = await res.json();
    const msg = (j.messages || [])[0];
    if (!msg || !msg.attestation || msg.attestation === "PENDING") {
      console.log(`not attested yet (status: ${msg ? msg.status : "no message"}) — retry in a few minutes.`);
      return;
    }
    console.log(`status ${msg.status} · message ${msg.message.slice(0, 20)}…`);
    const tx = await strat.connect(signer).completeInbound(msg.message, msg.attestation, { ...gp, gasLimit: 550000n });
    await tx.wait();
    console.log(`completeInbound tx ${tx.hash} · strategy idle now ${await heUsdc.balanceOf(strategyAddr)}`);
    console.log(`retFace ${await strat.retFace6()} · totalAssets ${await strat.totalAssets()}`);
    return;
  }

  fail(`unknown STAGE=${STAGE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
