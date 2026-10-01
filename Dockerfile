# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-canvas-assets.mjs ./scripts/copy-canvas-assets.mjs
COPY third-party/excalidraw/LICENSE ./third-party/excalidraw/LICENSE
RUN npm ci --no-audit --no-fund

FROM dependencies AS builder
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS=--max-old-space-size=1536
COPY . .
RUN mkdir -p public && npm run build

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --no-audit --no-fund

FROM node:26-bookworm-slim@sha256:662933cf47f013bc8e4beb31a6116448427a82057ba7c42c97e4c5ba766504c2 AS runner
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
COPY --from=builder --chown=planroom:planroom /app/src/github-links.ts ./src/github-links.ts
COPY --from=builder --chown=planroom:planroom /app/src/canvas.ts ./src/canvas.ts
COPY --from=builder --chown=planroom:planroom /app/migrations ./migrations
COPY --from=builder --chown=planroom:planroom /app/examples ./examples
COPY --from=builder --chown=planroom:planroom /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=planroom:planroom /app/LICENSE ./LICENSE
RUN chmod 755 scripts/entrypoint.sh && mkdir -p .next/cache && chown planroom:planroom .next/cache
USER planroom
EXPOSE 3000
ENTRYPOINT ["/app/scripts/entrypoint.sh"]
CMD ["node", "server.js"]
