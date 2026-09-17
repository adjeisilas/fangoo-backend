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

# Production dependencies, reinstalled from the lockfile out of the npm cache the
# `deps` stage just filled. `--offline` means nothing is downloaded twice, and a
# package missing from the cache fails the build at once instead of stalling.
#
# Not `npm prune --omit=dev`: prune re-resolves the tree against the registry,
# fetching package metadata one request at a time and running a security audit.
# On a slow connection that step ran for over twenty minutes.
FROM deps AS prod-deps
RUN npm ci --omit=dev --offline --ignore-scripts --no-audit --no-fund

FROM node:24-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules

# Generate before copying the rest of the source. `prisma generate` downloads the
# schema engine, which is slow; doing it from the schema alone keeps that layer
# cached across every code and documentation change.
#
# tsconfig.json has to be here too. Without it the generator cannot tell that this
# project compiles to JavaScript, so it writes `.ts` import paths into the client.
# Those files never exist after `nest build`, and the API dies at startup with
# ERR_MODULE_NOT_FOUND on dist/generated/prisma/internal/class.ts.
COPY package.json prisma7.config.ts tsconfig.json ./
COPY prisma ./prisma
# `prisma7.config.ts` reads DATABASE_URL, and generating fails if it is absent.
# Nothing connects during generation — this value is never used, and the real
# one is supplied at run time.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
# Where `prisma generate` downloads the schema engine from. The default is
# Prisma's own server; override it only where that download keeps failing, e.g.
#   docker build --build-arg PRISMA_ENGINES_MIRROR=http://host.docker.internal:8099 .
ARG PRISMA_ENGINES_MIRROR=https://binaries.prisma.sh
RUN npx prisma generate

# `src/generated` is in .dockerignore, so this cannot overwrite the client above.
COPY . .
RUN npm run build

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Never run as root. The node image ships an unprivileged `node` user.
USER node

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
# The schema engine `prisma generate` downloaded above. The container runs
# `prisma migrate deploy` on start, and without this it would download the
# engine again on every fresh container.
COPY --from=build --chown=node:node /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
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
