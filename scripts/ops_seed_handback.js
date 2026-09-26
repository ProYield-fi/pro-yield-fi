// ops_seed_handback.js — OPTION B: hand the ops seed back to the ops wallet.
//
// Context: ~$9.2 of ops seed sits inside the DN sleeve as the HYPE spot hedge.
// The vault's books (26.39) are backed by 35.6 of real assets; the gap is ops
// money. This script returns it:
//   1. close the HYPE short (reduce-only IOC, buy back the exact size)
//   2. spot-send the seed-sized slice of the hedge to the ops wallet
//      (hedgeTransferOut — the sub-minimum unwind path; orders can't express
//      these sizes, a send can)
//   3. verify on-chain + report the final books (gap must land >= 0, tiny)
//
// The sent size is computed at execution time from FRESH reads:
//   hs_send = floor(gap6 * spotPxScale / spotPx), clamped to the full hedge,
// where gap6 = (vaultIdle + morphoTotalAssets + dnTotalAssets) - vaultBooked.
// floor() keeps the books over-backed (never under) by sub-cent dust.
//
// DRY by default; DN_EXECUTE=1 or --execute to send. Run:
//   npx hardhat run scripts/ops_seed_handback.js --network hyperMainnet
const hre = require("hardhat");

const VAULT = "0x8954a73Bb36D17e4B212137Eb7B2328A1A14D1C1";
const DN = "0xeD40C3c34e2d4D6F2e1C0F0e688a6c05c82F9Bf4";
const MORPHO = "0xBF4C5e339D63EEB393DA2797679879a0a5Af2D53";
const USDC = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";
const OPS_WALLET = process.env.DN_HEDGE_RETURN_ADDR || "0x8377870974df41DB4aaa67a842781227390167a9";
const TIF_IOC = 3;
const SLIPPAGE_BPS = 20n;

const EXECUTE = process.argv.includes("--execute") || process.env.DN_EXECUTE === "1";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function roundPxWire(wire) {
  if (wire <= 0n) return wire;
  const human = Number(wire) / 1e8;
  if (!Number.isFinite(human) || human <= 0) return wire;
  return BigInt(Math.round(Number(human.toPrecision(5)) * 1e8));
}

async function readAll(tag) {
  const usdc = await hre.ethers.getContractAt(["function balanceOf(address) view returns (uint256)"], USDC);
  const vault = await hre.ethers.getContractAt(["function totalAssets() view returns (uint256)", "function totalShares() view returns (uint256)"], VAULT);
  const morpho = await hre.ethers.getContractAt(["function totalAssets() view returns (uint256)"], MORPHO);
  const dn = await hre.ethers.getContractAt([
    "function totalAssets() view returns (uint256)",
    "function coreState() view returns (int256 equity6, uint256 principal6, int64 szi, uint256 realized, uint256 swept, uint256 syncedAt)",
    "function spotHedgeSz() view returns (uint64)",
    "function spotValue6() view returns (uint64)",
    "function spotPx() view returns (uint64)",
    "function spotPxScale() view returns (uint64)",
    "function position() view returns (tuple(int64 szi, uint64 entryNtl, int64 isolatedRawUsd, uint32 leverage, bool isIsolated))",
  ], DN);
  const out = {};
  out.idle6 = await usdc.balanceOf(VAULT);
  out.booked6 = await vault.totalAssets();
  out.morpho6 = await morpho.totalAssets();
  out.dnTa6 = await dn.totalAssets();
  out.dnIdle6 = await usdc.balanceOf(DN);
  const cs = await dn.coreState();
  out.equity6 = cs[0]; out.principal6 = cs[1]; out.coreSzi = cs[2];
  out.hedgeSz = await dn.spotHedgeSz();
  out.spotValue6 = await dn.spotValue6();
  out.spotPxRaw = await dn.spotPx();
  out.spotPxScale = await dn.spotPxScale();
  const pos = await dn.position();
  out.szi = pos.szi; // LIVE precompile read (coreState's szi is the cached sync value)
  out.gap6 = out.idle6 + out.morpho6 + out.dnTa6 - out.booked6;
  console.log(`\n── state [${tag}] ──`);
  console.log(`  vault booked=${out.booked6} idle=${out.idle6} | morpho=${out.morpho6} | dnTa=${out.dnTa6} (equity6=${out.equity6} principal6=${out.principal6})`);
  console.log(`  dn spot hedge=${out.hedgeSz} (1e8) value6=${out.spotValue6} | szi=${out.szi} liqPx=${out.liqPx} | dn idle=${out.dnIdle6}`);
  console.log(`  REAL=${out.idle6 + out.morpho6 + out.dnTa6} vs BOOKED=${out.booked6} → gap6=${out.gap6} (${Number(out.gap6) / 1e6} USD)`);
  return out;
}

async function main() {
  const [signer] = await hre.ethers.getSigners();
  const keeper = await hre.ethers.getContractAt([
    "function keeper() view returns (address)",
    "function perpSzDecimals() view returns (uint8)",
    "function oraclePx() view returns (uint64)",
    "function perpAsset() view returns (uint32)",
    "function closeShort(uint32 asset, uint64 limitPx, uint64 sz, uint8 tif)",
    "function hedgeTransferOut(address destination, uint64 weiAmount)",
  ], DN, signer);

  console.log(`mode: ${EXECUTE ? "EXECUTE" : "DRY"} | signer=${signer.address} | destination=${OPS_WALLET}`);
  const k = await keeper.keeper();
  if (k.toLowerCase() !== signer.address.toLowerCase()) {
    console.error(`ABORT: signer is not the strategy keeper (keeper=${k})`);
    process.exit(2);
  }
  const gas = await hre.ethers.provider.getBalance(signer.address);
  console.log(`keeper gas: ${hre.ethers.formatEther(gas)} HYPE`);
  if (gas < hre.ethers.parseEther("0.00005")) { console.error("ABORT: keeper gas too low"); process.exit(2); }

  let s = await readAll("pre");
  if (s.gap6 <= 0n) { console.log("gap <= 0 — books already clean; nothing to hand back."); return; }

  // Refresh the strategy's cached Core equity/position BEFORE sizing — the
  // cached coreEquity6 (last syncCore) can lag the live account value, and the
  // send size must come from fresh numbers.
  if (EXECUTE) {
    const keeperSync = await hre.ethers.getContractAt(["function syncCore()"], DN, signer);
    const gs = await keeperSync.syncCore.estimateGas();
    const txS = await keeperSync.syncCore({ gasLimit: (gs * 12n) / 10n });
    await txS.wait();
    await sleep(6000);
    s = await readAll("pre-synced");
  }

  // ── 1. close the short ──
  const szDec = Number(await keeper.perpSzDecimals());
  const asset = Number(await keeper.perpAsset());
  const sziAbs = s.szi < 0n ? -s.szi : s.szi;
  const szWire = BigInt(sziAbs) * 10n ** BigInt(8 - szDec); // lots → 1e8 wire
  const pxRaw = await keeper.oraclePx();
  const pxWire = BigInt(pxRaw) * 10n ** BigInt(2 + szDec); // oracle raw → 1e8 wire
  const limitPx = roundPxWire((pxWire * (10000n + SLIPPAGE_BPS)) / 10000n); // BUY → cross above
  const notional6 = (limitPx * szWire) / 10n ** 10n;
  console.log(`\nclose short: asset=${asset} sz=${szWire} @ IOC limitPx=${limitPx} (notional≈$${Number(notional6) / 1e6})`);
  if (sziAbs > 0n && notional6 < 10_000_000n) { console.error("ABORT: close notional below HL $10 minimum"); process.exit(2); }

  if (EXECUTE && sziAbs > 0n) {
    const g1 = await keeper.closeShort.estimateGas(asset, limitPx, szWire, TIF_IOC);
    const tx = await keeper.closeShort(asset, limitPx, szWire, TIF_IOC, { gasLimit: (g1 * 12n) / 10n });
    console.log(`  tx ${tx.hash} (gasLimit ${(g1 * 12n) / 10n})`);
    await tx.wait();
    for (let i = 0; i < 6; i++) {
      await sleep(10000);
      s = await readAll(`post-close #${i + 1}`);
      if (s.szi === 0n) { console.log("  ✓ short closed (szi=0)"); break; }
      console.log(`  … still szi=${s.szi}, waiting`);
    }
    if (s.szi !== 0n) { console.error("ABORT: short not flat — NOT sending the hedge (would leave it unhedged)"); process.exit(3); }
  } else if (sziAbs === 0n) {
    console.log("  (no position — nothing to close)");
  }

  // ── 2. size + send the seed slice of the hedge (FRESH reads) ──
  const hsFull = s.hedgeSz;
  if (hsFull === 0n) { console.log("\nno spot hedge to return."); return; }
  const gap6 = s.gap6 > 0n ? s.gap6 : 0n;
  let hsSend = (gap6 * BigInt(s.spotPxScale)) / BigInt(s.spotPxRaw); // value6 ≤ gap6 (floor)
  if (hsSend > hsFull) hsSend = hsFull;
  const sendValue6 = (hsSend * BigInt(s.spotPxRaw)) / BigInt(s.spotPxScale);
  console.log(`\nreturn hedge: full=${hsFull} (1e8) → sending ${hsSend} (1e8 = ${Number(hsSend) / 1e8} HYPE, ≈$${Number(sendValue6) / 1e6}) to ${OPS_WALLET}`);
  console.log(`  leaves ${Number(hsFull - hsSend) / 1e8} HYPE dust (~$${Number((hsFull - hsSend) * BigInt(s.spotPxRaw) / BigInt(s.spotPxScale)) / 1e6}) in the strategy`);

  if (EXECUTE && hsSend > 0n) {
    const g2 = await keeper.hedgeTransferOut.estimateGas(OPS_WALLET, hsSend);
    const tx = await keeper.hedgeTransferOut(OPS_WALLET, hsSend, { gasLimit: (g2 * 12n) / 10n });
    console.log(`  tx ${tx.hash} (gasLimit ${(g2 * 12n) / 10n})`);
    await tx.wait();
    for (let i = 0; i < 6; i++) {
      await sleep(10000);
      s = await readAll(`post-send #${i + 1}`);
      if (s.hedgeSz < hsFull) { console.log(`  ✓ hedge sent (${hsFull} → ${s.hedgeSz})`); break; }
      console.log("  … hedge unchanged, waiting");
    }
    if (s.hedgeSz >= hsFull) { console.error("ABORT: hedge NOT sent (action dropped?) — verify manually"); process.exit(3); }
  }

  // ── 3. final books ──
  console.log("\n════ FINAL ════");
  console.log(`  REAL=${s.idle6 + s.morpho6 + s.dnTa6} vs BOOKED=${s.booked6} → gap6=${s.gap6} ($${Number(s.gap6) / 1e6})`);
  console.log(`  dn: ta=${s.dnTa6} equity=${s.equity6} principal=${s.principal6} hedge=${s.hedgeSz} szi=${s.szi}`);
  console.log(`  sent to ops wallet: ${Number(hsSend) / 1e8} HYPE (${OPS_WALLET})`);
}
main().catch((e) => { console.error("HANDBACK ERR:", e.message || e); process.exit(1); });
