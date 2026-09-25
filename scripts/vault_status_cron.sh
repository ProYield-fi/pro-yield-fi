#!/usr/bin/env bash
# vault_status_cron.sh — refresh the public vault feed from LIVE MAINNET state
# (web/public/vault_status.json), commit + push so the site redeploys.
#
# The feed is what /transparency + the ecosystem audit read as the live vault
# heartbeat (threshold: <= 24h). Runs every 6h from crontab. The writer carries
# its own chain-identity guard and REFUSES to publish a mislabelled feed.
#
# Logs to ~/.hermes/logs/vault_status.log (crontab redirect).
set -euo pipefail

cd /home/user/hypervault
# stay in sync first — the public audit repo receives commits from elsewhere
git pull --rebase -q || echo "WARN: hypervault pull failed; continuing"

DEPLOY_MANIFEST=deployed_addresses.mainnet.json \
  npx hardhat run scripts/write_vault_status.js --network hyperMainnet

cd /home/user/websites/pro-yield-web
git pull --rebase -q || echo "WARN: web pull failed; continuing"
if ! git diff --quiet -- public/vault_status.json; then
  git add public/vault_status.json
  git commit -q -m "vault_status: refresh $(date -u +%FT%TZ)"
  git push -q
fi

# Publish: this Pages project has NO Git->Cloudflare integration (every
# deployment in its history is a direct upload), so a push alone never goes
# live. The writer already refreshed dist/vault_status.json; deploy the
# existing build output (wrangler diffs and uploads only the change).
if [ -d dist ]; then
  npx wrangler pages deploy dist --project-name pro-yield --branch main
  echo "$(date -u +%FT%TZ) vault_status published + deployed"
else
  echo "WARN: no dist/ — feed updated in git but NOT deployed; run a build"
fi
