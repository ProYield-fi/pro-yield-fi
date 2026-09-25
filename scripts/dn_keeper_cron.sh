#!/usr/bin/env bash
# dn_keeper_cron.sh — MAINNET DN funding-sleeve cycle (delta-neutral).
#
# Per run: syncCore → decide (OPEN/HOLD/UNWIND/REBALANCE/profit-bridge) → act,
# then vault.harvest() sweeps any bridged-back profit into the vault. HOLD runs
# cost one syncCore tx and no money movement.
#
# Sizing: DN_TARGET_USD pins the demo notional. The policy target
# (vault totalAssets × DN weight) only clears HL's $10 order minimum once TVL
# ≥ $67 — drop the pin (or raise it) when real vault TVL exceeds that.
#
# Exit codes from dn_keeper: 0 ok · 3 mismatch (alerted) · 4 margin/allocate
# blocked. Logs via crontab redirect: ~/.hermes/logs/dn_keeper.log
set -uo pipefail

cd /home/user/hypervault

export MAINNET_OK=1
export DN_ALLOW_MAINNET=1
export DN_EXECUTE=1
export DN_STRATEGY="${DN_STRATEGY:-$(python3 -c "import json;print(json.load(open('deployed_addresses.mainnet.json'))['dn_core_strategy'])")}"
export DN_TARGET_USD="${DN_TARGET_USD:-10.15}"
export DN_MARGIN_UTIL_BPS="${DN_MARGIN_UTIL_BPS:-2050}"

echo "=== $(date -u +%FT%TZ) dn_keeper mainnet (strategy ${DN_STRATEGY}) ==="
npx hardhat run scripts/dn_keeper.js --network hyperMainnet
keeper_rc=$?
echo "keeper exit=$keeper_rc"

# Close the loop: sweep any profit the keeper bridged back (no-op when none).
npx hardhat run scripts/harvest_vault_mainnet.js --network hyperMainnet
harvest_rc=$?

exit $keeper_rc
