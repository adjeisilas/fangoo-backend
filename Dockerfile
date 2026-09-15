# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Fangoo API
#
# Multi-stage so the shipped image carries the compiled output and production
# dependencies only — no TypeScript, no test runner, no source.
#
# The Prisma client is generated from the schema rather than committed, so it
# must be produced here, before `nest build` compiles it into dist/.
# ---------------------------------------------------------------------------

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# `--ignore-scripts`: the postinstall hook reaches out to Prisma's skills
# service, which has nothing to do with building an image and would make the
# build depend on that service being up.
RUN npm ci --ignore-scripts --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `prisma.config.ts` reads DATABASE_URL, and generating fails if it is absent.
# Nothing connects during generation — this value is never used, and the real
# one is supplied at run time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
RUN npx prisma generate

RUN npm run build

# Drop dev dependencies in place, ready to copy into the runtime image. The
# Prisma CLI is a production dependency precisely because the container runs
# `prisma migrate deploy` on start.
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Never run as root. The node image ships an unprivileged `node` user.
USER node

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
# Migrations and schema ship with the image so a release can apply its own
# schema, and so `prisma migrate deploy` has something to read.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma7.config.ts ./prisma7.config.ts

EXPOSE 4000

# Uses the existing /health endpoint, which checks the database rather than
# just reporting that the process is alive.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so the process is PID 1 and receives SIGTERM directly — that is
# what `enableShutdownHooks()` needs in order to drain the connection pool.
CMD ["node", "dist/main.js"]
