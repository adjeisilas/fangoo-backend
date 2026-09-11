# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Fangoo API
#
# Multi-stage so the shipped image carries the compiled output and production
# dependencies only — no TypeScript, no test runner, no source.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` needs the dev dependencies here: the build runs in the next stage.
RUN npm ci

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The Prisma client is generated, not committed, so it must be built here.
RUN npx prisma generate
RUN npm run build
# Drop dev dependencies in place, ready to copy into the runtime image.
RUN npm prune --omit=dev

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Never run as root. The node image ships an unprivileged `node` user.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# Migrations ship with the image so a release can apply its own schema.
COPY --from=build --chown=node:node /app/prisma ./prisma

EXPOSE 4000

# Uses the existing /health endpoint, which checks the database rather than
# just reporting that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process is PID 1 and receives SIGTERM directly — that is
# what `enableShutdownHooks()` needs in order to drain the connection pool.
CMD ["node", "dist/main.js"]
