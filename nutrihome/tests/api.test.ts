import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { Db } from '../src/server/db/pool.js';
import { assertRlsEnforced } from '../src/server/db/pool.js';
import { appPool, client, LABEL_FOOD, makeApp, PROFILE, resetDatabase, uniqueEmail } from './helpers.js';

let db: Db;
let app: ReturnType<typeof makeApp>;

beforeAll(async () => {
  await resetDatabase();
  db = appPool();
  await assertRlsEnforced(db); // the app role must not bypass RLS
  app = makeApp(db);
});
afterAll(async () => {
  await db.end();
});

async function register(opts: { household: object; name?: string; email?: string; password?: string }) {
  const c = client(app);
  const res = await c.post('/api/auth/register', {
    email: opts.email ?? uniqueEmail(),
    password: opts.password ?? 'correct horse battery',
    displayName: opts.name ?? 'مستخدم',
    household: opts.household,
  });
  return { c, res };
}

async function inviteCodeOf(c: ReturnType<typeof client>) {
  return (await c.get('/api/household')).body.inviteCode as string;
}

describe('authentication', () => {
  it('requires a session for protected endpoints', async () => {
    expect((await request(app).get('/api/profile')).status).toBe(401);
    expect((await request(app).get('/api/log?date=2025-11-06')).status).toBe(401);
    expect((await request(app).get('/api/foods')).status).toBe(401);
  });

  it('rejects state-changing requests without the CSRF header or from another origin', async () => {
    const r1 = await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' });
    expect(r1.status).toBe(403);
    const r2 = await request(app)
      .post('/api/auth/login')
      .set('x-nutrihome', '1')
      .set('origin', 'https://evil.example')
      .send({ email: 'a@b.co', password: 'x' });
    expect(r2.status).toBe(403);
  });

  it('registers, sets an httpOnly cookie, and reports the household', async () => {
    const { res } = await register({ household: { mode: 'create', name: 'بيت الاختبار' }, name: 'محمد' });
    expect(res.status).toBe(201);
    expect(res.body.displayName).toBe('محمد');
    expect(res.body.household.name).toBe('بيت الاختبار');
    expect(res.body.hasProfile).toBe(false);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/nh_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('validates registration input', async () => {
    const { res } = await register({ household: { mode: 'create', name: 'x' }, email: 'not-an-email' });
    expect(res.status).toBe(400);
    const short = await register({ household: { mode: 'create', name: 'x' }, password: 'short' });
    expect(short.res.status).toBe(400);
  });

  it('rejects duplicate emails case-insensitively', async () => {
    const email = uniqueEmail('dup');
    await register({ household: { mode: 'create', name: 'x' }, email });
    const { res } = await register({ household: { mode: 'create', name: 'y' }, email: email.toUpperCase() });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email_taken');
  });

  it('logs in and out; wrong passwords are rejected with a generic error', async () => {
    const email = uniqueEmail('login');
    await register({ household: { mode: 'create', name: 'x' }, email, password: 'right password 1' });
    const c = client(app);
    const bad = await c.post('/api/auth/login', { email, password: 'wrong password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('invalid_credentials');
    const unknown = await c.post('/api/auth/login', { email: uniqueEmail('nobody'), password: 'whatever1' });
    expect(unknown.body.error).toBe('invalid_credentials');
    const ok = await c.post('/api/auth/login', { email: email.toUpperCase(), password: 'right password 1' });
    expect(ok.status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(200);
    expect((await c.post('/api/auth/logout')).status).toBe(204);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('rate-limits repeated failed logins', async () => {
    const email = uniqueEmail('rl');
    const c = client(app);
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await c.post('/api/auth/login', { email, password: 'nope-nope' })).status;
    expect(last).toBe(429);
  });
});

describe('registration limit', () => {
  it('throttles bursts of sign-ups from one address', async () => {
    const limited = createApp(db, { production: false, webDir: null, registerLimitPerHour: 2 });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await client(limited).post('/api/auth/register', {
        email: uniqueEmail('burst'), password: 'long enough 1', displayName: 'x', household: { mode: 'create', name: 'x' },
      });
      codes.push(r.status);
    }
    expect(codes).toEqual([201, 201, 429]);
  });
});

describe('households', () => {
  it('lets a second member join by invite code and caps the household at two', async () => {
    const a = await register({ household: { mode: 'create', name: 'بيتنا' }, name: 'أ' });
    const code = await inviteCodeOf(a.c);
    expect(code).toMatch(/^[A-Z2-9]{8}$/);
    const b = await register({ household: { mode: 'join', inviteCode: code.toLowerCase() }, name: 'ب' });
    expect(b.res.status).toBe(201);
    expect(b.res.body.household.id).toBe(a.res.body.household.id);
    const third = await register({ household: { mode: 'join', inviteCode: code } });
    expect(third.res.status).toBe(409);
    expect(third.res.body.error).toBe('household_full');
    const h = (await a.c.get('/api/household')).body;
    expect(h.members.map((m: { displayName: string }) => m.displayName)).toEqual(['أ', 'ب']);
    expect(JSON.stringify(h)).not.toMatch(/@/); // no emails exposed to the other member
  });

  it('rejects unknown invite codes', async () => {
    const { res } = await register({ household: { mode: 'join', inviteCode: 'ZZZZZZZZ' } });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('invalid_invite');
  });
});

describe('profile and targets', () => {
  it('returns no profile until saved, then computes targets on the server', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    expect((await c.get('/api/profile')).body).toEqual({ profile: null, targets: null });
    const res = await c.put('/api/profile', PROFILE);
    expect(res.status).toBe(200);
    expect(res.body.profile.weight_kg).toBe(85);
    expect(res.body.targets.protein_g).toBe(170);
    const atDate = (await c.get('/api/profile?date=2025-11-06')).body.targets;
    expect(atDate).toMatchObject({ kcal: 2280, protein_g: 170, fat_g: 63, carbs_g: 258 });
    expect((await c.get('/api/auth/me')).body.hasProfile).toBe(true);
  });

  it('rejects out-of-range values and incomplete manual targets', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    expect((await c.put('/api/profile', { ...PROFILE, height_cm: 400 })).status).toBe(400);
    expect((await c.put('/api/profile', { ...PROFILE, birth_date: '2024-01-01' })).status).toBe(400);
    expect((await c.put('/api/profile', { ...PROFILE, birth_date: '1990-02-30' })).status).toBe(400);
    const manual = await c.put('/api/profile', { ...PROFILE, targets_mode: 'manual', manual_kcal: 2000 });
    expect(manual.status).toBe(400);
    const ok = await c.put('/api/profile', {
      ...PROFILE, targets_mode: 'manual', manual_kcal: 2000, manual_protein_g: 150, manual_carbs_g: 200, manual_fat_g: 67,
    });
    expect(ok.body.targets).toMatchObject({ mode: 'manual', kcal: 2000, protein_g: 150 });
  });
});

describe('foods', () => {
  it('creates, searches (Arabic-normalised), updates and archives foods', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    const created = await c.post('/api/foods', LABEL_FOOD);
    expect(created.status).toBe(201);
    expect(created.body.servings).toEqual([{ id: expect.any(String), label: 'علبة', amount: 170 }]);
    expect(created.body.created_by_me).toBe(true);
    // "يونانى" (alef maqsura) must match "يوناني"
    const found = await c.get(`/api/foods?q=${encodeURIComponent('يونانى')}`);
    expect(found.body.foods).toHaveLength(1);
    const upd = await c.put(`/api/foods/${created.body.id}`, { ...LABEL_FOOD, kcal: 60 });
    expect(upd.body.kcal).toBe(60);
    expect((await c.del(`/api/foods/${created.body.id}`)).status).toBe(204);
    expect((await c.get('/api/foods')).body.foods).toHaveLength(0);
  });

  it('rejects impossible nutrition values', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    const over = await c.post('/api/foods', { ...LABEL_FOOD, protein_g: 60, carbs_g: 50 });
    expect(over.status).toBe(400);
    expect(over.body.issues[0].message).toBe('macros_exceed_100g');
    expect((await c.post('/api/foods', { ...LABEL_FOOD, kcal: 950 })).status).toBe(400);
    expect((await c.post('/api/foods', { ...LABEL_FOOD, protein_g: -1 })).status).toBe(400);
    expect((await c.post('/api/foods', { ...LABEL_FOOD, sugar_g: 10 })).status).toBe(400);
    expect((await c.post('/api/foods', { ...LABEL_FOOD, basis: 'per_serving', servings: [] })).status).toBe(400); // needs serving_label
    expect((await c.post('/api/foods', { ...LABEL_FOOD, source: 'usda' })).status).toBe(400); // not user-settable yet
  });
});

describe('food log', () => {
  it('logs by grams, by named serving, per-serving foods and quick entries, with exact totals', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    await c.put('/api/profile', PROFILE);
    const yogurt = (await c.post('/api/foods', LABEL_FOOD)).body;
    const bar = (
      await c.post('/api/foods', {
        name: 'بروتين بار', basis: 'per_serving', serving_label: 'حبة', kcal: 210, protein_g: 20, carbs_g: 22, fat_g: 7, source: 'label',
      })
    ).body;
    const date = '2025-11-06';

    const g = await c.post('/api/log', { type: 'food', date, meal: 'breakfast', food_id: yogurt.id, quantity: 150, unit: 'g' });
    expect(g.status).toBe(201);
    expect(g.body).toMatchObject({ kcal: 88.5, protein_g: 15.45, carbs_g: 5.4, fat_g: 0.6, quantity: 150, unit: 'g' });

    const s = await c.post('/api/log', {
      type: 'food', date, meal: 'snack', food_id: yogurt.id, quantity: 1, unit: 'serving', serving_id: yogurt.servings[0].id,
    });
    expect(s.body).toMatchObject({ kcal: 100.3, serving_label: 'علبة', serving_amount: 170 });

    const p = await c.post('/api/log', { type: 'food', date, meal: 'snack', food_id: bar.id, quantity: 2, unit: 'serving' });
    expect(p.body).toMatchObject({ kcal: 420, protein_g: 40, serving_label: 'حبة' });

    const q = await c.post('/api/log', { type: 'quick', date, meal: 'lunch', name: 'غداء مطعم', kcal: 750, protein_g: 40, carbs_g: 80, fat_g: 25 });
    expect(q.status).toBe(201);

    const day = (await c.get(`/api/log?date=${date}`)).body;
    expect(day.entries).toHaveLength(4);
    expect(day.totals.kcal).toBeCloseTo(88.5 + 100.3 + 420 + 750, 6);
    expect(day.totals.protein_g).toBeCloseTo(15.45 + 17.51 + 40 + 40, 6);
    expect(day.targets.kcal).toBe(2280);
    expect((await c.get('/api/log?date=2025-11-07')).body.entries).toHaveLength(0);
  });

  it('rejects wrong units, unknown servings and invalid dates', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    const yogurt = (await c.post('/api/foods', LABEL_FOOD)).body;
    const base = { type: 'food', date: '2025-11-06', meal: 'lunch', food_id: yogurt.id };
    expect((await c.post('/api/log', { ...base, quantity: 100, unit: 'ml' })).body.error).toBe('invalid_unit');
    expect((await c.post('/api/log', { ...base, quantity: 1, unit: 'serving' })).body.error).toBe('serving_not_found');
    expect((await c.post('/api/log', { ...base, quantity: 0, unit: 'g' })).status).toBe(400);
    expect((await c.post('/api/log', { ...base, date: '2025-02-30', quantity: 10, unit: 'g' })).status).toBe(400);
    expect((await c.get('/api/log?date=bad')).status).toBe(400);
  });

  it('edits recompute from the snapshot, and editing a food does not rewrite history', async () => {
    const { c } = await register({ household: { mode: 'create', name: 'x' } });
    const yogurt = (await c.post('/api/foods', LABEL_FOOD)).body;
    const e = (await c.post('/api/log', { type: 'food', date: '2025-11-06', meal: 'lunch', food_id: yogurt.id, quantity: 100, unit: 'g' })).body;
    await c.put(`/api/foods/${yogurt.id}`, { ...LABEL_FOOD, kcal: 120 });
    const upd = await c.put(`/api/log/${e.id}`, { quantity: 200, meal: 'dinner' });
    expect(upd.body).toMatchObject({ kcal: 118, meal: 'dinner', quantity: 200 }); // 59 × 2, not 120 × 2
    const toServing = await c.put(`/api/log/${e.id}`, { quantity: 1, unit: 'serving', serving_id: yogurt.servings[0].id });
    expect(toServing.body.kcal).toBe(100.3);
    // archived foods: existing entries still editable from their snapshot
    await c.del(`/api/foods/${yogurt.id}`);
    expect((await c.put(`/api/log/${e.id}`, { quantity: 2 })).body.kcal).toBe(200.6);
    expect((await c.del(`/api/log/${e.id}`)).status).toBe(204);
    expect((await c.del(`/api/log/${e.id}`)).status).toBe(404);
  });
});

describe('data separation between household members', () => {
  it('keeps profiles and food logs private while sharing the food list', async () => {
    const a = await register({ household: { mode: 'create', name: 'بيت' }, name: 'أ' });
    const b = await register({ household: { mode: 'join', inviteCode: await inviteCodeOf(a.c) }, name: 'ب' });
    await a.c.put('/api/profile', PROFILE);
    const food = (await a.c.post('/api/foods', LABEL_FOOD)).body;
    const date = '2025-11-06';
    const entry = (await a.c.post('/api/log', { type: 'food', date, meal: 'lunch', food_id: food.id, quantity: 100, unit: 'g' })).body;

    // B sees the shared food but not A's profile or log
    const bFoods = (await b.c.get('/api/foods')).body.foods;
    expect(bFoods.map((f: { id: string }) => f.id)).toEqual([food.id]);
    expect(bFoods[0].created_by_me).toBe(false);
    expect(bFoods[0].last_used_at).toBeNull(); // A's usage is not visible to B
    expect((await b.c.get('/api/profile')).body.profile).toBeNull();
    const bDay = (await b.c.get(`/api/log?date=${date}`)).body;
    expect(bDay.entries).toEqual([]);
    expect(bDay.totals.kcal).toBe(0);

    // B cannot change or delete A's entry
    expect((await b.c.put(`/api/log/${entry.id}`, { quantity: 999 })).status).toBe(404);
    expect((await b.c.del(`/api/log/${entry.id}`)).status).toBe(404);
    expect((await a.c.get(`/api/log?date=${date}`)).body.entries[0].quantity).toBe(100);

    // B can log the shared food into B's own diary
    expect((await b.c.post('/api/log', { type: 'food', date, meal: 'dinner', food_id: food.id, quantity: 50, unit: 'g' })).status).toBe(201);
    expect((await a.c.get(`/api/log?date=${date}`)).body.entries).toHaveLength(1);
  });

  it('keeps foods invisible across households', async () => {
    const a = await register({ household: { mode: 'create', name: 'بيت 1' } });
    const other = await register({ household: { mode: 'create', name: 'بيت 2' } });
    const food = (await a.c.post('/api/foods', LABEL_FOOD)).body;
    expect((await other.c.get('/api/foods')).body.foods).toEqual([]);
    expect((await other.c.get(`/api/foods/${food.id}`)).status).toBe(404);
    expect((await other.c.put(`/api/foods/${food.id}`, LABEL_FOOD)).status).toBe(404);
    expect((await other.c.del(`/api/foods/${food.id}`)).status).toBe(404);
    const log = await other.c.post('/api/log', { type: 'food', date: '2025-11-06', meal: 'lunch', food_id: food.id, quantity: 100, unit: 'g' });
    expect(log.status).toBe(404);
    expect(log.body.error).toBe('food_not_found');
  });
});
