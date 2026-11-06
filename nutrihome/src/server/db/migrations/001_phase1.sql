-- NutriHome — Phase 1 schema: households, users, sessions, profiles, foods, food log.
-- Private records (profiles, food_log_entries) are protected by row-level security keyed on
-- the per-transaction setting `app.user_id`. Household-shared records (foods, food_servings)
-- are protected by household membership. The app connects as a non-superuser role, so RLS
-- applies to every query it runs.

-- ---------- Helpers ----------
create or replace function app_current_user_id() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- Arabic-aware search normalisation (hamza forms, taa marbuta, alef maqsura, tashkeel, tatweel).
create or replace function ar_norm(t text) returns text
  language sql immutable parallel safe
  as $$
    select lower(
      translate(
        regexp_replace(coalesce(t, ''), '[ً-ْٰـ]', '', 'g'),
        'أإآٱةىؤئ', 'ااااهيوي'
      )
    )
  $$;

-- ---------- Households & users ----------
create table households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 80),
  invite_code  text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  max_members  smallint not null default 2 check (max_members between 1 and 10),
  created_at   timestamptz not null default now()
);

create table users (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  email          text not null check (char_length(email) between 3 and 254),
  password_hash  text not null,
  display_name   text not null check (char_length(btrim(display_name)) between 1 and 60),
  created_at     timestamptz not null default now()
);
create unique index users_email_lower_key on users (lower(email));
create index users_household_idx on users (household_id);

create or replace function app_current_household_id() returns uuid
  language sql stable security definer set search_path = public
  as $$ select household_id from users where id = app_current_user_id() $$;

create table sessions (
  token_hash  bytea primary key,
  user_id     uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expiry_idx on sessions (expires_at);

-- ---------- Profiles (private) ----------
create table profiles (
  user_id            uuid primary key references users(id) on delete cascade,
  sex                text not null check (sex in ('male', 'female')),
  birth_date         date not null check (birth_date > date '1900-01-01'),
  height_cm          numeric(5,1) not null check (height_cm between 100 and 250),
  weight_kg          numeric(5,1) not null check (weight_kg between 25 and 350),
  activity_level     text not null check (activity_level in ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal_rate_kg_week  numeric(4,2) not null default 0 check (goal_rate_kg_week between -1 and 1),
  protein_g_per_kg   numeric(3,1) not null default 1.8 check (protein_g_per_kg between 0.8 and 3.0),
  fat_pct            smallint not null default 25 check (fat_pct between 15 and 45),
  targets_mode       text not null default 'auto' check (targets_mode in ('auto', 'manual')),
  manual_kcal        integer check (manual_kcal between 800 and 6000),
  manual_protein_g   numeric(6,1) check (manual_protein_g between 0 and 600),
  manual_carbs_g     numeric(6,1) check (manual_carbs_g between 0 and 1000),
  manual_fat_g       numeric(6,1) check (manual_fat_g between 0 and 400),
  updated_at         timestamptz not null default now(),
  check (targets_mode = 'auto' or (manual_kcal is not null and manual_protein_g is not null
                                   and manual_carbs_g is not null and manual_fat_g is not null))
);

-- ---------- Foods (shared within a household) ----------
-- Nutrient values are exactly what the user entered (from a label or a cited source).
-- Nothing is pre-seeded: the app never invents nutrition values.
create table foods (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  created_by     uuid references users(id) on delete set null,
  name           text not null check (char_length(btrim(name)) between 1 and 120),
  brand          text check (char_length(brand) <= 80),
  basis          text not null check (basis in ('per_100g', 'per_100ml', 'per_serving')),
  serving_label  text check (char_length(serving_label) between 1 and 40),
  kcal           numeric(7,2) not null check (kcal >= 0),
  protein_g      numeric(7,2) not null check (protein_g >= 0),
  carbs_g        numeric(7,2) not null check (carbs_g >= 0),
  fat_g          numeric(7,2) not null check (fat_g >= 0),
  fiber_g        numeric(7,2) check (fiber_g >= 0),
  sugar_g        numeric(7,2) check (sugar_g >= 0),
  sodium_mg      numeric(8,1) check (sodium_mg >= 0),
  food_state     text not null default 'as_sold' check (food_state in ('as_sold', 'raw', 'cooked')),
  source         text not null check (source in ('label', 'manual', 'usda', 'open_food_facts')),
  source_note    text check (char_length(source_note) <= 300),
  barcode        text check (barcode ~ '^[0-9]{6,14}$'),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (basis <> 'per_serving' or serving_label is not null),
  check (basis = 'per_serving' or (kcal <= 900 and protein_g + carbs_g + fat_g <= 100.5))
);
create index foods_household_active_idx on foods (household_id) where archived_at is null;

-- Named portions for per-100 g / per-100 ml foods, e.g. "بيضة" = 50 g.
create table food_servings (
  id            uuid primary key default gen_random_uuid(),
  food_id       uuid not null references foods(id) on delete cascade,
  household_id  uuid not null references households(id) on delete cascade,
  label         text not null check (char_length(btrim(label)) between 1 and 40),
  amount        numeric(8,2) not null check (amount > 0 and amount <= 5000),
  sort_order    smallint not null default 0
);
create index food_servings_food_idx on food_servings (food_id);

-- ---------- Food log (private) ----------
create table food_log_entries (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  log_date        date not null,
  meal            text not null check (meal in ('breakfast', 'lunch', 'dinner', 'snack')),
  entry_type      text not null check (entry_type in ('food', 'quick')),
  food_id         uuid references foods(id) on delete set null,
  name            text not null check (char_length(btrim(name)) between 1 and 120),
  quantity        numeric(10,3) check (quantity > 0 and quantity <= 100000),
  unit            text check (unit in ('g', 'ml', 'serving')),
  serving_label   text,
  serving_amount  numeric(8,2),
  food_snapshot   jsonb,
  kcal            numeric(9,2) not null check (kcal >= 0),
  protein_g       numeric(8,2) not null check (protein_g >= 0),
  carbs_g         numeric(8,2) not null check (carbs_g >= 0),
  fat_g           numeric(8,2) not null check (fat_g >= 0),
  fiber_g         numeric(8,2) check (fiber_g >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (entry_type = 'quick' or (quantity is not null and unit is not null and food_snapshot is not null))
);
create index food_log_user_date_idx on food_log_entries (user_id, log_date);
create index food_log_food_idx on food_log_entries (food_id);

-- ---------- Row-level security ----------
alter table profiles enable row level security;
create policy profiles_owner on profiles
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

alter table food_log_entries enable row level security;
create policy food_log_owner on food_log_entries
  using (user_id = app_current_user_id())
  with check (user_id = app_current_user_id());

alter table foods enable row level security;
create policy foods_household on foods
  using (household_id = app_current_household_id())
  with check (household_id = app_current_household_id());

alter table food_servings enable row level security;
create policy food_servings_household on food_servings
  using (household_id = app_current_household_id())
  with check (household_id = app_current_household_id());
