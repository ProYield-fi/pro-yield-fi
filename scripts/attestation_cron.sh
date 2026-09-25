#!/usr/bin/env bash
# ProYield daily attestation job — generate, publish into both repos, commit + push.
# Installed in crontab (runs under `bash -lc` so PATH/HOME come from the profile).
# Logs to ~/.hermes/logs/attestation.log. Idempotent: same-day reruns replace.
set -euo pipefail

cd /home/user/hypervault
# stay in sync with origin first — the public audit repo receives commits from elsewhere
git pull --rebase -q || echo "WARN: hypervault pull failed; continuing"
node scripts/attestation.js --publish

# Daily per-user portfolio snapshots (growth-chart backstop) — honest gaps on failure
node scripts/portfolio_snapshots.js >> "$HOME/.hermes/logs/portfolio_snapshots.log" 2>&1 || true

# hypervault: commit attestations/ only
if ! git diff --quiet -- attestations/ || [ -n "$(git ls-files --others --exclude-standard attestations/)" ]; then
  git add attestations/
  git commit -q -m "attestation: $(date -u +%F)"
  git push -q
fi

# website: commit public/attestations/ only (the push triggers the GitHub
# Actions 'Deploy to Cloudflare Pages' workflow — the daily commit IS the
# publication mechanism; don't "fix" it as deploy noise)
cd /home/user/websites/pro-yield-web
git pull --rebase -q || echo "WARN: web pull failed; continuing"
if ! git diff --quiet -- public/attestations/ || [ -n "$(git ls-files --others --exclude-standard public/attestations/)" ]; then
  git add public/attestations/
  git commit -q -m "attestation: $(date -u +%F)"
  git push -q
fi

echo "$(date -u +%FT%TZ) attestation published"
