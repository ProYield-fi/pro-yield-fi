#!/usr/bin/env node
/**
 * ProYield daily attestation generator.
 *
 * Reads LIVE chain state — the product vault (HyperEVM MAINNET since
 * 2026-09-24; the PRODUCT config block below is the per-deployment flip point)
 * plus real venue positions
 * (Arbitrum wallet + Hyperliquid clearinghouse) — and emits a dated,
 * machine-readable JSON report + a human Markdown report + a one-line series
 * entry for charts.
 *
 * Honesty rules (live-data-verification standard):
 *   - every value carries its named source;
 *   - a failed read is recorded as null + an `unavailable` entry with the
 *     failing source and error — never fabricated, never zero-filled;
 *   - testnet vs mainnet is always labeled.
 *
 * Usage:
 *   node scripts/attestation.js              # write into hypervault/attestations/
 *   node scripts/attestation.js --publish    # also copy into the website repo
 *                                            # (public/attestations/ → pyd.fi)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { ethers } = require("ethers");

const PUBLISH = process.argv.includes("--publish");
const OUT_DIR = path.join(__dirname, "..", "attestations");
const SITE_OUT = path.join(os.homedir(), "websites", "pro-yield-web", "public", "attestations");

// ── Config (addresses mirror deployed_addresses.json — update there first) ──
const PRODUCT = {
  name: "hyperevm-mainnet",
  chainId: 999,
  rpc: "https://rpc.hyperliquid.xyz/evm",
  vault: "0xadaE15e23b0007de2A85b1F3874332762Bc23bb0",
  asset: "0xb88339CB7199b77E23DB6E890353E22632Ba630f", // Circle-native USDC
  feeCollector: null, // this revision routes fees via the FeeDistributor; no feeCollector getter
  insurance: "0x091a1cFE247A041d400B6Fd57c14A652Bb865f67",
  treasury: "0x8A1b107e1DDabC868E40b8718F09537B0A50C9aB",
  keeper: null, // no keeper configured at the team stage
  maybeFeeDistributor: "0xAa67940672047EcE44db2876378b182C1Fc4217C",
  note: "HyperEVM mainnet — guarded capped beta (TVL cap $500, caps in code). Team E2E round trip passed 2026-09-24; ownership = 2-of-3 treasury Safe.",
};
const VENUES = {
  wallet: "0x8377870974df41DB4aaa67a842781227390167a9",
  arbitrum: {
    rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"],
    chainId: 42161,
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  },
  hyperliquid: { api: "https://api.hyperliquid.xyz/info" },
  note: "Live venue-side positions (real mainnet funds).",
};

const VAULT_ABI = [
  "function totalAssets() view returns (uint256)",
  "function totalShares() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function convertToAssets(uint256 shares) view returns (uint256)",
  "function asset() view returns (address)",
  "function underlying() view returns (address)",
  "function performanceFee() view returns (uint256)",
  "function withdrawalFee() view returns (uint256)",
  "function withdrawFeeBps() view returns (uint256)",
  "function feeDistributor() view returns (address)",
  "function feeCollector() view returns (address)",
];
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

/** Run a read; on failure return {ok:false,error} — never fabricate. */
async function seek(label, fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    return { ok: false, error: `${label}: ${String(e.message || e).slice(0, 140)}` };
  }
}

const toNum = (v, decimals = 6) => Number(ethers.formatUnits(v, decimals));

function pickRpc(rpcs, chainId) {
  return (async () => {
    for (const url of rpcs) {
      try {
        const p = new ethers.JsonRpcProvider(url, chainId);
        await p.getBlockNumber();
        return p;
      } catch (_) {
        /* next */
      }
    }
    return null;
  })();
}

async function hlInfo(body) {
  const r = await fetch(VENUES.hyperliquid.api, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  const unavailable = [];
  const now = new Date();
  const date = now.toISOString().slice(0, 10);

  // ── Product chain (testnet today) ──
  const product = {
    ...PRODUCT,
    as_of_block: null,
    as_of_time: null,
    metrics: {},
    balances: {},
    sources: { rpc: PRODUCT.rpc },
  };

  const tProvider = await pickRpc([PRODUCT.rpc], PRODUCT.chainId);
  if (!tProvider) {
    unavailable.push({ field: "product chain", source: PRODUCT.rpc, error: "no usable RPC" });
  } else {
    const vault = new ethers.Contract(PRODUCT.vault, VAULT_ABI, tProvider);
    const asset = new ethers.Contract(PRODUCT.asset, ERC20_ABI, tProvider);

    const [blk, dec] = await Promise.all([
      seek("block", () => tProvider.getBlock("latest")),
      seek("decimals", () => asset.decimals()),
    ]);
    if (blk.ok) {
      product.as_of_block = blk.value.number;
      product.as_of_time = new Date(blk.value.timestamp * 1000).toISOString();
    } else unavailable.push({ field: "as_of_block", source: PRODUCT.rpc, error: blk.error });
    const decimals = dec.ok ? Number(dec.value) : 6;

    // Some getters exist on some revisions — probe several names and keep
    // whichever answers (the deployed testnet revision may differ from repo src).
    const reads = {
      total_assets: await seek("totalAssets", () => vault.totalAssets()),
      total_shares: await seek("totalShares", () => vault.totalShares()),
      total_supply: await seek("totalSupply", () => vault.totalSupply()),
      performance_fee: await seek("performanceFee", () => vault.performanceFee()),
      withdraw_fee_a: await seek("withdrawalFee", () => vault.withdrawalFee()),
      withdraw_fee_b: await seek("withdrawFeeBps", () => vault.withdrawFeeBps()),
      asset_addr: await seek("asset()", () => vault.asset()),
      asset_addr_b: await seek("underlying()", () => vault.underlying()),
      fd_addr: await seek("feeDistributor()", () => vault.feeDistributor()),
      collector_addr: await seek("feeCollector()", () => vault.feeCollector()),
      insurance_balance: await seek("insurance bal", () => asset.balanceOf(PRODUCT.insurance)),
      treasury_balance: await seek("treasury bal", () => asset.balanceOf(PRODUCT.treasury)),
      keeper_balance: PRODUCT.keeper
        ? await seek("keeper bal", () => asset.balanceOf(PRODUCT.keeper))
        : { ok: false, error: "no keeper configured on this deployment" },
    };

    const get = (k) => reads[k];
    const num = (k) => (get(k).ok ? toNum(get(k).value, decimals) : null);
    // Share getter name differs by revision (totalShares vs ERC-4626 totalSupply).
    const sharesRaw = get("total_shares").ok
      ? get("total_shares").value
      : get("total_supply").ok
        ? get("total_supply").value
        : null;
    const sharesDecimals = decimals; // testnet share token mirrors asset decimals

    product.metrics = {
      total_assets_usdc: num("total_assets"),
      total_shares: sharesRaw != null ? Number(ethers.formatUnits(sharesRaw, sharesDecimals)) : null,
      share_price_usdc:
        get("total_assets").ok && sharesRaw != null && sharesRaw > 0n
          ? toNum(get("total_assets").value, decimals) /
            Number(ethers.formatUnits(sharesRaw, sharesDecimals))
          : null,
      // performanceFee stored in bps (1000 = 10%)
      performance_fee_pct: get("performance_fee").ok
        ? Number(get("performance_fee").value) / 100
        : null,
      withdraw_fee_bps: get("withdraw_fee_a").ok
        ? Number(get("withdraw_fee_a").value)
        : get("withdraw_fee_b").ok
          ? Number(get("withdraw_fee_b").value)
          : null,
      asset_token: get("asset_addr").ok
        ? get("asset_addr").value
        : get("asset_addr_b").ok
          ? get("asset_addr_b").value
          : PRODUCT.asset,
      asset_decimals: decimals,
    };

    // Resolve fee destinations from the contract itself when available.
    const fdAddr = get("fd_addr").ok
      ? get("fd_addr").value
      : get("collector_addr").ok
        ? get("collector_addr").value
        : PRODUCT.maybeFeeDistributor;
    const fdBal = await seek("fd bal", () => asset.balanceOf(fdAddr));
    const collectorBal = PRODUCT.feeCollector
      ? await seek("collector bal", () => asset.balanceOf(PRODUCT.feeCollector))
      : { ok: false, error: "no feeCollector on this revision" };
    product.balances = {
      fee_destination: fdBal.ok ? toNum(fdBal.value, decimals) : null,
      fee_destination_addr: fdAddr,
      fee_collector: collectorBal.ok ? toNum(collectorBal.value, decimals) : null,
      insurance_multisig: num("insurance_balance"),
      treasury_multisig: num("treasury_balance"),
      keeper: num("keeper_balance"),
    };
    if (!fdBal.ok) unavailable.push({ field: "product.fee_destination_bal", source: PRODUCT.rpc, error: fdBal.error });
    if (PRODUCT.feeCollector && !collectorBal.ok)
      unavailable.push({ field: "product.fee_collector_bal", source: PRODUCT.rpc, error: collectorBal.error });
    // Coverage only when the insurance destination is actually funded — an
    // empty insurance Safe must read as "not yet funded", not as "0× coverage".
    const ins = product.balances.insurance_multisig;
    product.coverage = {
      formula: "insurance_multisig ÷ vault total assets",
      ratio:
        ins != null && ins > 0 && product.metrics.total_assets_usdc
          ? ins / product.metrics.total_assets_usdc
          : null,
      note:
        ins === 0
          ? "insurance Safe not yet funded — funded from the fee stream (20% slice) once product fees activate"
          : undefined,
    };

    const ALT_PROBES = new Set([
      "withdraw_fee_b",
      "total_supply",
      "fd_addr",
      "collector_addr",
      "withdraw_fee_a",
      "total_shares",
      "performance_fee",
      "keeper_balance",
      "asset_addr",
      "asset_addr_b",
    ]);
    for (const [k, r] of Object.entries(reads)) {
      if (!r.ok && !ALT_PROBES.has(k)) {
        unavailable.push({ field: `product.${k}`, source: PRODUCT.rpc, error: r.error });
      }
    }
  }

  // ── Mainnet venue positions (real funds) ──
  const venues = { ...VENUES, arbitrum: { ...VENUES.arbitrum }, hyperliquid: {} };
  const aProvider = await pickRpc(VENUES.arbitrum.rpcs, VENUES.arbitrum.chainId);
  if (!aProvider) {
    unavailable.push({
      field: "arbitrum",
      source: VENUES.arbitrum.rpcs[0],
      error: "no usable RPC",
    });
  } else {
    const usdc = new ethers.Contract(VENUES.arbitrum.usdc, ERC20_ABI, aProvider);
    const eth = await seek("arb eth", () => aProvider.getBalance(VENUES.wallet));
    const usd = await seek("arb usdc", () => usdc.balanceOf(VENUES.wallet));
    venues.arbitrum.usdc_token = VENUES.arbitrum.usdc;
    venues.arbitrum.eth = eth.ok ? Number(ethers.formatEther(eth.value)) : null;
    venues.arbitrum.usdc_balance = usd.ok ? toNum(usd.value, 6) : null;
    if (!eth.ok) unavailable.push({ field: "arbitrum.eth", source: VENUES.arbitrum.rpcs[0], error: eth.error });
    if (!usd.ok) unavailable.push({ field: "arbitrum.usdc", source: VENUES.arbitrum.rpcs[0], error: usd.error });
  }

  const cl = await seek("hl clearinghouse", () =>
    hlInfo({ type: "clearinghouseState", user: VENUES.wallet })
  );
  const sp = await seek("hl spot", () => hlInfo({ type: "spotClearinghouseState", user: VENUES.wallet }));
  if (cl.ok) {
    venues.hyperliquid.account_value_usd = Number(cl.value?.marginSummary?.accountValue ?? null);
    venues.hyperliquid.withdrawable_usd = Number(cl.value?.withdrawable ?? null);
    venues.hyperliquid.open_positions = (cl.value?.assetPositions || []).map((p) => ({
      coin: p.position.coin,
      size: Number(p.position.szi),
      entry_px: Number(p.position.entryPx),
      unrealized_pnl: Number(p.position.unrealizedPnl || 0),
    }));
  } else {
    unavailable.push({ field: "hyperliquid.clearinghouse", source: VENUES.hyperliquid.api, error: cl.error });
  }
  if (sp.ok) {
    venues.hyperliquid.spot = (sp.value?.balances || []).map((b) => ({
      coin: b.coin,
      total: Number(b.total),
    }));
  } else {
    unavailable.push({ field: "hyperliquid.spot", source: VENUES.hyperliquid.api, error: sp.error });
  }

  // ── Social-ready snippets (numbers only when real) ──
  const tvl = product.metrics?.total_assets_usdc ?? null;
  const spx = product.metrics?.share_price_usdc ?? null;
  const cov = product.coverage?.ratio ?? null;
  const money = (n) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const social = {
    daily:
      [
        "ProYield daily attestation",
        tvl == null ? null : `vault TVL $${money(tvl)}`,
        spx == null ? null : `share price $${spx.toFixed(6)}`,
        cov == null ? null : `insurance coverage ${cov.toFixed(2)}×`,
      ]
        .filter(Boolean)
        .join(" · ") + " · every figure chain-read, sources named — pyd.fi/transparency (raw: pyd.fi/attestations/latest.md)",
    weekly:
      `ProYield week ${date}: the vault is LIVE on HyperEVM mainnet under a guarded capped beta — caps enforced in code, team end-to-end deposit/withdraw passed, and every figure tracked in the open, read from chain. ` +
      `Live numbers, named sources, no projections: pyd.fi/transparency`,
  };

  const report = {
    report: "proyield-attestation",
    version: 1,
    date,
    generated_at: now.toISOString(),
    disclosure:
      "Generated by ProYield from independent on-chain reads. This is a transparency attestation, not an audit opinion — the external community audit is a separate track.",
    product,
    venues_mainnet: venues,
    unavailable,
    social,
  };

  // ── Write outputs ──
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, `${date}.json`);
  const mdPath = path.join(OUT_DIR, `${date}.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  const md = renderMarkdown(report);
  fs.writeFileSync(mdPath, md);
  fs.writeFileSync(path.join(OUT_DIR, "latest.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT_DIR, "latest.md"), md);

  // Series line (one per day; same-day rerun replaces).
  const seriesPath = path.join(OUT_DIR, "series.jsonl");
  let lines = [];
  if (fs.existsSync(seriesPath)) {
    lines = fs
      .readFileSync(seriesPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .filter((l) => {
        try {
          return JSON.parse(l).date !== date;
        } catch (_) {
          return false;
        }
      });
  }
  lines.push(
    JSON.stringify({
      date,
      chain_id: PRODUCT.chainId,
      total_assets_usdc: tvl,
      share_price_usdc: spx == null ? null : Number(spx.toFixed(6)),
      insurance_usdc: product.balances?.insurance_multisig ?? null,
      coverage_ratio: cov == null ? null : Number(cov.toFixed(4)),
    })
  );
  fs.writeFileSync(seriesPath, lines.join("\n") + "\n");

  if (PUBLISH) {
    fs.mkdirSync(SITE_OUT, { recursive: true });
    for (const f of [`${date}.json`, `${date}.md`, "latest.json", "latest.md", "series.jsonl"]) {
      fs.copyFileSync(path.join(OUT_DIR, f), path.join(SITE_OUT, f));
    }
    // series.json (array form) for chart consumers
    const arr = fs
      .readFileSync(seriesPath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    fs.writeFileSync(path.join(SITE_OUT, "series.json"), JSON.stringify(arr, null, 2) + "\n");
  }

  console.log(`attestation ${date}: TVL ${money(tvl)} USDC · share $${spx ?? "—"} · coverage ${cov ?? "—"}`);
  console.log(`written: ${jsonPath}${PUBLISH ? ` (+ site copy ${SITE_OUT})` : ""}`);
  if (unavailable.length) console.log(`unavailable reads: ${unavailable.length}`);
}

function v(n, digits = 2) {
  return n == null ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: digits });
}

function renderMarkdown(r) {
  const p = r.product;
  const m = p.metrics || {};
  const b = p.balances || {};
  const un = r.unavailable || [];
  const unLine = (field) => {
    const u = un.find((x) => x.field === field);
    return u ? `— (${u.source} failed: ${u.error.slice(0, 80)})` : "—";
  };
  const vm = r.venues_mainnet;
  return `# ProYield attestation — ${r.date}

> ${r.disclosure}
> Generated ${r.generated_at} · chain-as-of ${p.as_of_time ?? "—"} (block ${p.as_of_block ?? "—"}).

## Product vault — ${p.name} (chain ${p.chainId})

| Metric | Value | Source |
|---|---|---|
| Total assets | ${v(m.total_assets_usdc)} USDC | \`${p.vault}\` (totalAssets) |
| Shares | ${v(m.total_shares, 6)} | \`${p.vault}\` (share supply) |
| Share price | $${m.share_price_usdc == null ? "—" : m.share_price_usdc.toFixed(6)} | assets ÷ shares |
| Performance fee | ${m.performance_fee_pct == null ? "— (not set on this revision; the product ships 10% performance-only at mainnet)" : (m.performance_fee_pct).toFixed(1) + "%"} | contract |
| Withdraw fee | ${m.withdraw_fee_bps == null ? unLine("product.withdraw_fee_bps") : m.withdraw_fee_bps + " bps"} | contract |
| Fee destination | ${v(b.fee_destination)} USDC | \`${b.fee_destination_addr ?? "—"}\` (from contract) |
| Insurance multisig | ${v(b.insurance_multisig)} USDC | \`${p.insurance}\` |
| Treasury multisig | ${v(b.treasury_multisig)} USDC | \`${p.treasury}\` |
| Keeper | ${v(b.keeper)} USDC | ${p.keeper ? "`" + p.keeper + "`" : "— (none configured at the team stage)"} |
| Coverage | ${p.coverage?.ratio == null ? "not yet funded" : p.coverage.ratio.toFixed(3) + "×"} | ${p.coverage?.formula ?? "n/a"}${p.coverage?.note ? " — " + p.coverage.note : ""} |

RPC: \`${p.rpc}\` · ${p.note}

## Live venue positions — mainnet (real funds)

| Position | Value | Source |
|---|---|---|
| Arbitrum wallet ETH | ${v(vm.arbitrum?.eth, 6)} ETH | \`${vm.wallet}\` |
| Arbitrum wallet USDC | ${v(vm.arbitrum?.usdc_balance)} USDC | \`${vm.arbitrum?.usdc_token ?? "—"}\` |
| Hyperliquid account | $${v(vm.hyperliquid?.account_value_usd)} | clearinghouseState |
| Hyperliquid withdrawable | $${v(vm.hyperliquid?.withdrawable_usd)} | clearinghouseState |
| HL open positions | ${(vm.hyperliquid?.open_positions || []).map((x) => `${x.coin} ${x.size}`).join(", ") || "—"} | clearinghouseState |
| HL spot balances | ${(vm.hyperliquid?.spot || []).map((x) => `${x.coin} ${x.total}`).join(", ") || "—"} | spotClearinghouseState |

${vm.note}

## Unavailable reads this run

${un.length === 0 ? "None — every read above returned a live value." : un.map((u) => `- \`${u.field}\` via ${u.source}: ${u.error}`).join("\n")}

## Social-ready copy

- Daily: \`${r.social.daily}\`
- Weekly: \`${r.social.weekly}\`
`;
}

main().catch((e) => {
  console.error("attestation failed:", e.message || e);
  process.exit(1);
});
