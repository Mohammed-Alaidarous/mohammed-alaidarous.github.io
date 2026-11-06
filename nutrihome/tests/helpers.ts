import pg from 'pg';
import request from 'supertest';
import { createApp } from '../src/server/app.js';
import { createPool, type Db } from '../src/server/db/pool.js';
import { migrate } from '../src/server/db/migrate.js';

export const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5433/nutrihome_test';
export const APP_ROLE = 'nutrihome_app';
export const APP_PASSWORD = process.env.TEST_APP_DB_PASSWORD ?? 'devpass';
export const APP_URL = (() => {
  const u = new URL(ADMIN_URL);
  u.username = APP_ROLE;
  u.password = APP_PASSWORD;
  return u.toString();
})();

/** Drops and recreates the test database schema, then applies all migrations. */
export async function resetDatabase(): Promise<void> {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query('drop schema public cascade; create schema public;');
  await c.end();
  await migrate({ adminUrl: ADMIN_URL, appRole: APP_ROLE, appPassword: APP_PASSWORD, log: () => {} });
}

export function makeApp(db: Db) {
  return createApp(db, { production: false, webDir: null, registerLimitPerHour: 10_000 });
}

export const appPool = () => createPool(APP_URL);
export const adminPool = () => createPool(ADMIN_URL);

/** A logged-in API client: keeps the session cookie and sends the CSRF header. */
export function client(app: ReturnType<typeof makeApp>) {
  const agent = request.agent(app);
  const h = (r: request.Test) => r.set('x-nutrihome', '1');
  return {
    agent,
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => h(agent.post(url)).send(body ?? {}),
    put: (url: string, body?: object) => h(agent.put(url)).send(body ?? {}),
    del: (url: string) => h(agent.delete(url)),
  };
}

let n = 0;
export const uniqueEmail = (p = 'user') => `${p}${Date.now()}${n++}@example.com`;

export const PROFILE = {
  sex: 'male',
  birth_date: '1997-03-15',
  height_cm: 178,
  weight_kg: 85,
  activity_level: 'moderate',
  goal_rate_kg_week: -0.5,
  protein_g_per_kg: 2,
  fat_pct: 25,
  targets_mode: 'auto',
} as const;

/** Values copied from a real product label for testing (per 100 g). */
export const LABEL_FOOD = {
  name: 'زبادي يوناني',
  brand: 'اختبار',
  basis: 'per_100g',
  kcal: 59,
  protein_g: 10.3,
  carbs_g: 3.6,
  fat_g: 0.4,
  fiber_g: 0,
  source: 'label',
  servings: [{ label: 'علبة', amount: 170 }],
} as const;
