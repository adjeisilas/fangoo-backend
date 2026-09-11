# Deploying Fangoo

Two applications and a PostgreSQL database:

| Service | Repo | Port | Public |
|---|---|---|---|
| API | `fangoo-backend` | 4000 | yes — the browser calls it directly |
| Web | `fangoo-frontend` | 3000 | yes |
| Database | — | 5432 | **no** |

The browser talks to the API directly, so the API needs a public hostname and a
valid TLS certificate. The database must never be reachable from the internet.

---

## Before the first deploy

### 1. Generate real secrets

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it **twice** — `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must differ.
Reusing one value means a stolen access token can be replayed as a refresh
token. The API refuses to boot if they are missing, under 32 characters, or
identical.

### 2. Switch Paystack to live keys

The API refuses to boot when `NODE_ENV=production` and `PAYSTACK_SECRET_KEY`
still starts with `sk_test_`.

### 3. Point the callback and CORS at the real domain

`PAYSTACK_CALLBACK_URL` is where Paystack returns a buyer after checkout. If it
still says `localhost`, every payment strands the customer on a dead page.

`CORS_ORIGIN` is a comma-separated allow-list, never `*` — these responses carry
credentials.

---

## Environment

### API (`fangoo-backend`)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | always | URL-encode the password if it contains `@`, `:` or `/` |
| `JWT_ACCESS_SECRET` | always | ≥32 chars, unique |
| `JWT_REFRESH_SECRET` | always | ≥32 chars, different from the access secret |
| `JWT_ACCESS_EXPIRATION` | no | defaults to `15m` |
| `JWT_REFRESH_EXPIRATION` | no | defaults to `7d` |
| `PORT` | no | defaults to `4000` |
| `CORS_ORIGIN` | **in production** | e.g. `https://fangoo.com` |
| `PAYSTACK_SECRET_KEY` | **in production** | must be `sk_live_` in production |
| `PAYSTACK_PUBLIC_KEY` | no | |
| `PAYSTACK_CURRENCY` | no | defaults to `GHS` |
| `PAYSTACK_CALLBACK_URL` | **in production** | `https://<web>/orders/payment-callback` |

Validation lives in `src/config/env.validation.ts` and runs at boot. A missing or
weak value stops the process rather than starting a subtly broken server.

### Web (`fangoo-frontend`)

| Variable | Required | Notes |
|---|---|---|
| `NUXT_PUBLIC_API_BASE` | **in production** | `https://<api>/api/v1` |
| `NUXT_PUBLIC_SITE_URL` | **in production** | `https://fangoo.com` |
| `PORT` | no | defaults to `3000` |

Both are **baked into the client bundle at build time**, so they must be present
when `npm run build` runs — not only at container start. `server/plugins/
validate-runtime-config.ts` refuses to serve in production if either is missing
or points at localhost, because that failure is otherwise invisible: the site
serves fine and every visitor's browser calls their own machine.

---

## Local production parity

`docker-compose.yml` lives in this repo and builds the web image from the
sibling `fangoo-frontend` checkout, so the two repositories must sit side by
side:

```
FANGOO/
  fangoo-backend/     <- run compose from here
  fangoo-frontend/
```

```bash
cp .env.compose.example .env      # fill in secrets
docker compose up --build
```

Migrations are applied by the `api` service on start via `prisma migrate deploy`,
which only applies committed migrations and never resets anything.

---

## Migrations

```bash
npx prisma migrate deploy         # production: apply committed migrations
npx prisma migrate dev --name x   # development only: creates a migration
```

Never run `migrate dev` against production — it can reset the database.

CI applies every migration to an empty database on each run, then checks that
`schema.prisma` matches the result. A migration that only works against a
developer's existing database fails there rather than on release day.

---

## Release checklist

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` generated, different, ≥32 chars
- [ ] `PAYSTACK_SECRET_KEY` is `sk_live_`
- [ ] `PAYSTACK_CALLBACK_URL` points at the real web domain
- [ ] `CORS_ORIGIN` lists the real web origin, no wildcard
- [ ] `NUXT_PUBLIC_API_BASE` and `NUXT_PUBLIC_SITE_URL` set **at build time**
- [ ] Database reachable only from the API, not the internet
- [ ] TLS on both public hostnames — the API sends HSTS in production
- [ ] Paystack webhook configured to `https://<api>/api/v1/payments/webhook`
- [ ] `GET https://<api>/api/v1/health` returns `database: connected`
- [ ] One test order placed and refunded end to end

---

## Verifying a deploy

```bash
curl https://<api>/api/v1/health          # {"database":"connected"}
curl -I https://<web>/                    # 200
curl https://<web>/robots.txt             # Sitemap: points at the real domain
```

If `robots.txt` advertises the wrong domain, `NUXT_PUBLIC_SITE_URL` was wrong at
build time and every canonical tag is wrong too.

---

## Known gaps

- **Paystack webhooks need a public URL.** Until the API is publicly reachable,
  payments are only confirmed when the buyer returns through the callback page.
- **Notifications are in-app only.** No email transport is wired yet; the service
  is provider-agnostic, so adding one is configuration rather than a rewrite.
- **No automated backups.** Whatever hosts PostgreSQL should take them.
- **The Docker images have not been built.** Docker was unavailable on the
  machine where they were written, so the Dockerfiles and compose file are
  unverified. Build them locally once before relying on them.
