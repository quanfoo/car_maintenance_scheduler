FROM node:24-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS build
WORKDIR /app
COPY . .
# Keep dependency-heavy filesystem layers few: cloud Docker uses the vfs driver.
# The trusted CA is ephemeral; npm's reusable cache is outside the image layers.
RUN --mount=type=secret,id=npm_ca --mount=type=cache,target=/root/.npm \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci && npm run build && npm prune --omit=dev \
    && mkdir /runtime \
    && mv node_modules dist migrations prisma prisma.config.ts package.json package-lock.json /runtime/

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
