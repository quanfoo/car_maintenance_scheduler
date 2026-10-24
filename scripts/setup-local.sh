#!/bin/sh
# Run natively on the same machine as your IDE. Never copy container node_modules.
set -eu
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo 'Install Node.js 24 (with npm), then run npm run setup:local again.' >&2
  exit 1
fi
node -e 'if (Number(process.versions.node.split(".")[0]) < 24) { console.error("Node.js 24 or later is required. With nvm, run nvm install && nvm use."); process.exit(1); }'
npm ci
npm run prisma:generate
printf '%s\n' 'Dependencies and generated Prisma types are ready for this machine’s IDE.'
