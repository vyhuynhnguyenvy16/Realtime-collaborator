# Deploying the API on Railway

The API runs as one Railway service next to a Railway PostgreSQL database.
Redis is optional: a single instance does not need it, which keeps the bill low.

## Services

| Service  | What it is                                   |
|----------|----------------------------------------------|
| `api`    | This folder (`backend/`), built by Railpack  |
| Postgres | Railway PostgreSQL template                  |

Railpack's defaults are enough: it runs `npm run build` and then `npm start`
(`prisma migrate deploy && node dist/main`). For local development use
`npm run start:dev` (watch) or `npm run start:local`.

`railway.json` (Railway is phasing this format out after 2026-12-01) also sets the build (`npm run build` = `prisma generate && nest build`),
the start command (`npm run start:prod` = `prisma migrate deploy && node dist/main`),
the `/health` check, and **App Sleeping**: the API sleeps when nobody uses it and
wakes on the next request (a few seconds of cold start).

## Variables on the `api` service

| Variable             | Value                                                  |
|----------------------|--------------------------------------------------------|
| `DATABASE_URL`       | `${{Postgres.DATABASE_URL}}`                           |
| `JWT_ACCESS_SECRET`  | random, e.g. `openssl rand -hex 32`                    |
| `JWT_REFRESH_SECRET` | random, different from the access secret               |
| `CORS_ORIGINS`       | frontend origin(s), comma-separated                    |
| `REDIS_URL`          | only when running more than one replica                |

Railway sets `PORT` itself.

## Deploy from the CLI

```bash
npm i -g @railway/cli
railway login
cd backend
railway link            # pick the project and the api service
railway up --detach     # uploads this folder and deploys it
railway logs
```

## Spending cap

```bash
railway usage limit set --target workspace --soft 5 --hard 10
railway usage limit status
```

Railway's lowest hard limit is $10. When usage reaches it, Railway stops the
services instead of charging more. The plan fee itself is always billed.
