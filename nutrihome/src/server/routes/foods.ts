import { Router, type Request, type Response } from 'express';
import type { z } from 'zod';
import type { Food } from '../../shared/api-types.js';
import { withUser, type Db, type Tx } from '../db/pool.js';
import { notFound } from '../errors.js';
import { currentUser } from '../middleware.js';
import { foodSchema, uuidParam } from '../validation.js';

const SELECT = `
  select f.id, f.name, f.brand, f.basis, f.serving_label, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
         f.fiber_g, f.sugar_g, f.sodium_mg, f.food_state, f.source, f.source_note, f.barcode, f.updated_at,
         (f.created_by = app_current_user_id()) as created_by_me,
         (select max(e.created_at) from food_log_entries e where e.food_id = f.id) as last_used_at,
         coalesce((select json_agg(json_build_object('id', s.id, 'label', s.label, 'amount', s.amount::float8)
                                  order by s.sort_order, s.label)
                     from food_servings s where s.food_id = f.id), '[]'::json) as servings
    from foods f`;

/** Loads one active food visible to the current user (RLS limits it to their household). */
export async function getFood(tx: Tx, id: string): Promise<Food | null> {
  const { rows } = await tx.query<Food>(`${SELECT} where f.id = $1 and f.archived_at is null`, [id]);
  return rows[0] ?? null;
}

type FoodInput = z.infer<typeof foodSchema>;

async function writeServings(tx: Tx, foodId: string, householdId: string, servings: FoodInput['servings']) {
  await tx.query('delete from food_servings where food_id = $1', [foodId]);
  for (const [i, s] of servings.entries()) {
    await tx.query('insert into food_servings (food_id, household_id, label, amount, sort_order) values ($1,$2,$3,$4,$5)', [
      foodId, householdId, s.label, s.amount, i,
    ]);
  }
}

const values = (f: FoodInput) => [
  f.name, f.brand, f.basis, f.basis === 'per_serving' ? f.serving_label : null, f.kcal, f.protein_g, f.carbs_g, f.fat_g,
  f.fiber_g, f.sugar_g, f.sodium_mg, f.food_state, f.source, f.source_note, f.barcode,
];

export function foodRoutes(db: Db) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
    const foods = await withUser(db, user.id, async (tx) => {
      const params: unknown[] = [];
      let where = 'where f.archived_at is null';
      if (q) {
        params.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`);
        where += ` and (ar_norm(f.name) like ar_norm($1) or ar_norm(coalesce(f.brand, '')) like ar_norm($1) or f.barcode = $${params.push(q)})`;
      }
      const { rows } = await tx.query<Food>(
        `select * from (${SELECT} ${where}) x order by x.last_used_at desc nulls last, x.name limit 200`,
        params,
      );
      return rows;
    });
    res.json({ foods });
  });

  r.get('/:id', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const food = await withUser(db, user.id, (tx) => getFood(tx, id.data));
    if (!food) throw notFound();
    res.json(food);
  });

  r.post('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const f = foodSchema.parse(req.body);
    const food = await withUser(db, user.id, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `insert into foods (household_id, created_by, name, brand, basis, serving_label, kcal, protein_g, carbs_g, fat_g,
            fiber_g, sugar_g, sodium_mg, food_state, source, source_note, barcode)
         values ($1, $2, $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning id`,
        [user.householdId, user.id, ...values(f)],
      );
      const id = rows[0]!.id;
      await writeServings(tx, id, user.householdId, f.basis === 'per_serving' ? [] : f.servings);
      return (await getFood(tx, id))!;
    });
    res.status(201).json(food);
  });

  r.put('/:id', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const f = foodSchema.parse(req.body);
    const food = await withUser(db, user.id, async (tx) => {
      // Existing log entries keep their own nutrient snapshot, so editing a food never rewrites history.
      const { rowCount } = await tx.query(
        `update foods set name=$2, brand=$3, basis=$4, serving_label=$5, kcal=$6, protein_g=$7, carbs_g=$8, fat_g=$9,
            fiber_g=$10, sugar_g=$11, sodium_mg=$12, food_state=$13, source=$14, source_note=$15, barcode=$16, updated_at=now()
          where id = $1 and archived_at is null`,
        [id.data, ...values(f)],
      );
      if (!rowCount) throw notFound();
      await writeServings(tx, id.data, user.householdId, f.basis === 'per_serving' ? [] : f.servings);
      return (await getFood(tx, id.data))!;
    });
    res.json(food);
  });

  r.delete('/:id', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const ok = await withUser(db, user.id, async (tx) =>
      (await tx.query('update foods set archived_at = now() where id = $1 and archived_at is null', [id.data])).rowCount,
    );
    if (!ok) throw notFound();
    res.status(204).end();
  });

  return r;
}
