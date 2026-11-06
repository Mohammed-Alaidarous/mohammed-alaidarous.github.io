# NutriHome architecture

## Goals carried into every phase
- Arabic-first, full RTL, mobile-first.
- Two household members, each with **private** health data; selected things are **shared** by the household.
- Real database + authentication; no mock data; no invented nutrition values.
- Reserved stock is never counted as eaten stock (Phase 3).

## Layout
```
src/shared/      nutrition.ts (pure maths, used by server + web), api-types.ts
src/server/      app.ts, index.ts, config.ts, middleware.ts, validation.ts (zod), errors.ts
  auth/          password.ts (scrypt), sessions.ts (hashed opaque tokens)
  db/            pool.ts (withUser → sets app.user_id per transaction), migrate.ts, migrations/*.sql
  routes/        auth, profile, household, foods, log
src/web/         React app: App.tsx, api.ts, format.ts, components/ui.tsx, pages/*
tests/           nutrition.test.ts, api.test.ts, rls.test.ts, e2e/phase1.e2e.mjs
```

## Data separation (defence in depth)
1. Every API query filters by the session user (or household).
2. PostgreSQL **row-level security**: the app connects as `nutrihome_app` (no superuser, no BYPASSRLS). Each request runs in a transaction with `set_config('app.user_id', …, true)`.
   - `profiles`, `food_log_entries`: visible only where `user_id = app_current_user_id()`.
   - `foods`, `food_servings`: visible only inside the user's household.
3. Tests prove both layers: API tests (member B gets 404 on member A's entries) and direct SQL tests (unfiltered `select`/`update`/`delete` as B touch nothing of A's; forged inserts are rejected).

## Phase 1 schema
| Table | Purpose | Access |
|---|---|---|
| `households` | name, invite code, `max_members` (2) | members |
| `users` | email (unique, case-insensitive), scrypt hash, display name | self; names visible to household |
| `sessions` | sha-256 of token, expiry (30 days, sliding) | server only |
| `profiles` | sex, birth date, height, weight, activity, goal (kg/week), protein g/kg, fat %, manual targets | **private (RLS)** |
| `foods` | name, brand, basis (`per_100g` / `per_100ml` / `per_serving`), kcal + macros (+ fibre, sugar, sodium), `food_state` (as sold / raw / cooked), `source` + note, barcode, soft delete | **household (RLS)** |
| `food_servings` | named portions (e.g. علبة = 170 g) | household (RLS) |
| `food_log_entries` | date, meal, quantity + unit, chosen serving, **snapshot** of the food's values, computed kcal/macros | **private (RLS)** |

Check constraints enforce ranges at the database level too (e.g. macros ≤ 100 g per 100 g, kcal ≤ 900 per 100 g).

## Calculations
- Age from birth date on the diary date. BMR: Mifflin–St Jeor. TDEE = BMR × activity factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9).
- Target kcal = TDEE + goal × 7700 / 7, rounded to 10. Protein = g/kg × weight; fat = % of kcal ÷ 9; carbs = remainder ÷ 4.
- Warnings: below 1500 (male) / 1200 (female) kcal; protein + fat leave no carbs; manual macros don't add up.
- Entry nutrients = basis values × factor (grams/100, ml/100, servings × serving grams/100, or servings for per-serving foods). Stored to 2 decimals; rounded only for display.

## Planned phases
| Phase | Scope | Main new tables |
|---|---|---|
| 1 ✅ | Auth, households, profiles, targets, foods, diary, dashboard | (above) |
| 2 | Weekly meal plan (per member, from household foods), plan → diary, weight log & progress | `meal_plans`, `meal_plan_items`, `weight_entries` |
| 3 | Pantry inventory with movements: purchase / **reserve** (from plan) / **consume** (from diary) / adjust / discard; shopping list = plan needs − (on hand − reserved) | `products`, `inventory_items`, `inventory_movements`, `shopping_list_items` |
| 4 | Barcode scanning (camera; ZXing in-browser since iOS lacks BarcodeDetector) + Open Food Facts lookup; label photo recognition via Claude vision (server-side key) with mandatory review; net vs drained weight; raw ↔ cooked yield factors per food | `products.net_weight_g`, `drained_weight_g`, `yield_factors` |
| 5 | Plan suggestions from available stock; automatic shopping list | — |

## Open decisions (need the owner)
1. **Hosting**: needs Node + PostgreSQL (e.g. a VPS, Render/Railway/Fly, or Supabase/Neon for the database). GitHub Pages cannot run it.
2. **Repository**: currently in `nutrihome/` inside the portfolio repo; a separate repository is recommended.
3. **Food reference data**: import USDA FoodData Central (official download) and/or Open Food Facts for barcodes — both cite their source per food. Blocked from this build environment's network.
4. **Label recognition**: requires an Anthropic API key stored on the server.
5. Password reset / email verification needs an email provider.
