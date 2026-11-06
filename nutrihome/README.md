# NutriHome — تغذية البيت

Arabic-first (RTL), mobile-first web app for a two-person household: each member has a private profile and food diary; the household shares a food list (and, in later phases, the meal plan, pantry and shopping list).

**Status: Phase 1 complete** — authentication, households (2 members), profiles and nutrition targets, PostgreSQL with row-level security, daily dashboard, manual food logging. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and the phase plan.

## Stack

| Layer | Choice |
|---|---|
| Frontend | React 19 + TypeScript, Vite 7, plain CSS (RTL, light/dark) |
| Backend | Node 22, Express 5, Zod 4 validation |
| Database | PostgreSQL 16 (`pg`), SQL migrations, row-level security |
| Auth | Email + password (scrypt), opaque session token in an httpOnly SameSite=Lax cookie, CSRF header check |
| Tests | Vitest + Supertest against a real Postgres test database; Playwright end-to-end |

Shared nutrition maths lives in `src/shared/nutrition.ts` and is used by both the server (source of truth when saving) and the browser (live previews).

## Run locally

Requires Node ≥ 22 and PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env            # edit passwords / URLs
createdb nutrihome
set -a; . ./.env; set +a
npm run migrate                 # creates tables, RLS policies and the non-superuser app role
npm run dev                     # API on :3000, web on :5173 (proxied)
```

Production: `npm run build && npm run migrate:prod && NODE_ENV=production npm start` behind HTTPS (set `TRUST_PROXY=1` behind a reverse proxy). The server refuses to start if its database role is a superuser or can bypass RLS.

## Tests

```bash
# unit + API + database security tests (needs a test database the admin URL can reset)
createdb nutrihome_test
TEST_ADMIN_DATABASE_URL=postgres://postgres@127.0.0.1:5432/nutrihome_test npm test

# end-to-end in a phone-sized browser against a running server
BASE_URL=http://127.0.0.1:3000 SHOTS=./test-results npm run test:e2e
```

## Nutrition data policy

The app ships **no** built-in nutrition values. Every food is entered by a household member from its label (or another source they name), stored with its source, and checked for impossible values (e.g. more than 100 g of macros per 100 g, sugar above carbs). Log entries keep a snapshot of the food's values, so editing or deleting a food never rewrites past days.
