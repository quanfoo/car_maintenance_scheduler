#!/bin/sh
# Managed cloud refresh. Uses the existing isolated checkout and never resets Git/data.
set -eu
cd "$(dirname "$0")/.."
export XDG_CACHE_HOME="${CLOUD_CACHE_DIR:-/workspace/.cache}"
export npm_config_cache="${CLOUD_CACHE_DIR:-/workspace/.cache}/npm"
export npm_config_update_notifier=false
export BUILDX_CONFIG="${CLOUD_CACHE_DIR:-/workspace/.cache}/buildx"
npm ci
if [ -n "${NODE_EXTRA_CA_CERTS:-}" ] && [ -f "$NODE_EXTRA_CA_CERTS" ]; then
  BUILD_CA_FILE="$NODE_EXTRA_CA_CERTS" docker compose -f compose.yaml -f compose.proxy.yaml build
else
  docker compose build
fi
docker compose up -d --wait
docker compose run --rm migrate node dist/db/cli.js seed
npm run check
npm run demo
