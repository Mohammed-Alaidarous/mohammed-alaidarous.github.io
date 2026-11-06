/**
 * Database-level checks: even if application code had a bug (a missing WHERE clause),
 * PostgreSQL row-level security must keep one member's private rows away from the other.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withUser, type Db } from '../src/server/db/pool.js';
import { adminPool, appPool, resetDatabase } from './helpers.js';

let admin: Db;
let app: Db;
let userA: string;
let userB: string;
let userC: string; // another household

beforeAll(async () => {
  await resetDatabase();
  admin = adminPool();
  app = appPool();
  const h1 = (await admin.query<{ id: string }>("insert into households (name, invite_code) values ('h1','AAAAAAAA') returning id")).rows[0]!.id;
  const h2 = (await admin.query<{ id: string }>("insert into households (name, invite_code) values ('h2','BBBBBBBB') returning id")).rows[0]!.id;
  const mk = async (h: string, e: string) =>
    (await admin.query<{ id: string }>("insert into users (household_id, email, password_hash, display_name) values ($1,$2,'x','n') returning id", [h, e])).rows[0]!.id;
  userA = await mk(h1, 'a@x.co');
  userB = await mk(h1, 'b@x.co');
  userC = await mk(h2, 'c@x.co');
  await admin.query(
    `insert into profiles (user_id, sex, birth_date, height_cm, weight_kg, activity_level) values ($1,'male','1990-01-01',180,80,'light')`,
    [userA],
  );
  await admin.query(
    `insert into food_log_entries (user_id, log_date, meal, entry_type, name, kcal, protein_g, carbs_g, fat_g)
     values ($1, '2025-11-06', 'lunch', 'quick', 'A lunch', 500, 30, 50, 20)`,
    [userA],
  );
  await admin.query(
    `insert into foods (household_id, created_by, name, basis, kcal, protein_g, carbs_g, fat_g, source)
     values ($1, $2, 'shared food', 'per_100g', 100, 10, 10, 2, 'label')`,
    [h1, userA],
  );
});
afterAll(async () => {
  await admin.end();
  await app.end();
});

const count = (db: Db, user: string, sql: string) => withUser(db, user, async (tx) => (await tx.query(sql)).rowCount);

describe('row-level security', () => {
  it('without a user context the app role sees no private or household rows', async () => {
    expect((await app.query('select * from profiles')).rowCount).toBe(0);
    expect((await app.query('select * from food_log_entries')).rowCount).toBe(0);
    expect((await app.query('select * from foods')).rowCount).toBe(0);
  });

  it('a user sees only their own profile and diary even with unfiltered queries', async () => {
    expect(await count(app, userA, 'select * from profiles')).toBe(1);
    expect(await count(app, userA, 'select * from food_log_entries')).toBe(1);
    expect(await count(app, userB, 'select * from profiles')).toBe(0);
    expect(await count(app, userB, 'select * from food_log_entries')).toBe(0);
  });

  it('updates and deletes of another user’s rows affect nothing', async () => {
    expect(await count(app, userB, "update food_log_entries set name = 'hacked'")).toBe(0);
    expect(await count(app, userB, 'delete from food_log_entries')).toBe(0);
    expect(await count(app, userB, 'delete from profiles')).toBe(0);
    expect((await admin.query("select name from food_log_entries")).rows[0]!.name).toBe('A lunch');
  });

  it('a user cannot insert rows owned by someone else', async () => {
    await expect(
      withUser(app, userB, (tx) =>
        tx.query(
          `insert into food_log_entries (user_id, log_date, meal, entry_type, name, kcal, protein_g, carbs_g, fat_g)
           values ($1, '2025-11-06', 'lunch', 'quick', 'forged', 1, 0, 0, 0)`,
          [userA],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('foods are shared inside a household only', async () => {
    expect(await count(app, userA, 'select * from foods')).toBe(1);
    expect(await count(app, userB, 'select * from foods')).toBe(1);
    expect(await count(app, userC, 'select * from foods')).toBe(0);
    expect(await count(app, userC, "update foods set name = 'x'")).toBe(0);
  });

  it('the app role cannot read migration bookkeeping', async () => {
    await expect(app.query('select * from schema_migrations')).rejects.toThrow(/permission denied/);
  });
});
