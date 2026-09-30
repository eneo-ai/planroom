# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY . .
RUN mkdir -p public && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim@sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c AS runner
WORKDIR /app
LABEL org.opencontainers.image.title="Planroom" \
      org.opencontainers.image.description="Shared HTML planning with version history, REST and MCP" \
      org.opencontainers.image.source="https://github.com/eneo-ai/planroom" \
      org.opencontainers.image.vendor="Sundsvalls kommun" \
      org.opencontainers.image.licenses="MIT"
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=768
RUN groupadd --gid 1001 planroom && useradd --uid 1001 --gid planroom --no-create-home planroom
COPY --from=production-dependencies --chown=planroom:planroom /app/node_modules ./node_modules
COPY --from=builder --chown=planroom:planroom /app/.next/standalone ./
COPY --from=builder --chown=planroom:planroom /app/.next/static ./.next/static
COPY --from=builder --chown=planroom:planroom /app/public ./public
COPY --from=builder --chown=planroom:planroom /app/scripts ./scripts
COPY --from=builder --chown=planroom:planroom /app/src/server ./src/server
COPY --from=builder --chown=planroom:planroom /app/src/contracts.ts ./src/contracts.ts
COPY --from=builder --chown=planroom:planroom /app/migrations ./migrations
COPY --from=builder --chown=planroom:planroom /app/examples ./examples
COPY --from=builder --chown=planroom:planroom /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=planroom:planroom /app/LICENSE ./LICENSE
RUN chmod 755 scripts/entrypoint.sh && mkdir -p .next/cache && chown planroom:planroom .next/cache
USER planroom
EXPOSE 3000
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "server.js"]
