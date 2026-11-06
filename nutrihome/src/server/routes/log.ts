import { Router, type Request, type Response } from 'express';
import type { DayLog, FoodSnapshot, LogEntry } from '../../shared/api-types.js';
import { computeTargets, entryNutrients, QuantityError, round, sumNutrients, type Nutrients, type Unit } from '../../shared/nutrition.js';
import { withUser, type Db, type Tx } from '../db/pool.js';
import { badRequest, notFound } from '../errors.js';
import { currentUser } from '../middleware.js';
import { dateKey, logCreateSchema, logUpdateSchema, uuidParam } from '../validation.js';
import { getFood } from './foods.js';
import { getProfile } from './profile.js';

const ENTRY_COLUMNS = `id, log_date, meal, entry_type, food_id, name, quantity, unit, serving_label, serving_amount,
  food_snapshot, kcal, protein_g, carbs_g, fat_g, fiber_g, created_at`;

/** Stored values keep 2 decimals; totals are summed from those stored values. */
const stored = (n: Nutrients): Nutrients => ({
  kcal: round(n.kcal, 2),
  protein_g: round(n.protein_g, 2),
  carbs_g: round(n.carbs_g, 2),
  fat_g: round(n.fat_g, 2),
  fiber_g: n.fiber_g == null ? null : round(n.fiber_g, 2),
});

function resolveAmount(snap: FoodSnapshot, quantity: number, unit: Unit, servingId: string | null | undefined) {
  let serving: { label: string; amount: number } | null = null;
  if (unit === 'serving' && snap.basis !== 'per_serving') {
    const s = snap.servings.find((x) => x.id === servingId);
    if (!s) throw badRequest('serving_not_found');
    serving = { label: s.label, amount: s.amount };
  }
  try {
    const n = entryNutrients(snap, quantity, unit, serving?.amount);
    return {
      nutrients: stored(n),
      servingLabel: snap.basis === 'per_serving' ? snap.serving_label : serving?.label ?? null,
      servingAmount: serving?.amount ?? null,
    };
  } catch (e) {
    if (e instanceof QuantityError) throw badRequest('invalid_unit');
    throw e;
  }
}

async function getEntry(tx: Tx, id: string): Promise<LogEntry | null> {
  const { rows } = await tx.query<LogEntry>(`select ${ENTRY_COLUMNS} from food_log_entries where id = $1`, [id]);
  return rows[0] ?? null;
}

export function logRoutes(db: Db) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const date = dateKey.parse(req.query.date);
    const body = await withUser(db, user.id, async (tx): Promise<DayLog> => {
      const { rows } = await tx.query<LogEntry>(
        `select ${ENTRY_COLUMNS} from food_log_entries where user_id = $1 and log_date = $2 order by created_at, id`,
        [user.id, date],
      );
      const profile = await getProfile(tx, user.id);
      return { date, entries: rows, totals: sumNutrients(rows), targets: profile ? computeTargets(profile, date) : null };
    });
    res.json(body);
  });

  r.post('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const b = logCreateSchema.parse(req.body);
    const entry = await withUser(db, user.id, async (tx) => {
      let id: string;
      if (b.type === 'quick') {
        const { rows } = await tx.query<{ id: string }>(
          `insert into food_log_entries (user_id, log_date, meal, entry_type, name, kcal, protein_g, carbs_g, fat_g)
           values ($1,$2,$3,'quick',$4,$5,$6,$7,$8) returning id`,
          [user.id, b.date, b.meal, b.name ?? 'إضافة سريعة', round(b.kcal, 2), round(b.protein_g, 2), round(b.carbs_g, 2), round(b.fat_g, 2)],
        );
        id = rows[0]!.id;
      } else {
        const food = await getFood(tx, b.food_id); // RLS: only foods in the user's household
        if (!food) throw notFound('food_not_found');
        const snap: FoodSnapshot = {
          basis: food.basis, kcal: food.kcal, protein_g: food.protein_g, carbs_g: food.carbs_g, fat_g: food.fat_g,
          fiber_g: food.fiber_g, serving_label: food.serving_label, servings: food.servings,
          food_state: food.food_state, source: food.source,
        };
        const a = resolveAmount(snap, b.quantity, b.unit, b.serving_id);
        const { rows } = await tx.query<{ id: string }>(
          `insert into food_log_entries (user_id, log_date, meal, entry_type, food_id, name, quantity, unit, serving_label,
             serving_amount, food_snapshot, kcal, protein_g, carbs_g, fat_g, fiber_g)
           values ($1,$2,$3,'food',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
          [
            user.id, b.date, b.meal, food.id, food.brand ? `${food.name} — ${food.brand}` : food.name, b.quantity, b.unit,
            a.servingLabel, a.servingAmount, JSON.stringify(snap),
            a.nutrients.kcal, a.nutrients.protein_g, a.nutrients.carbs_g, a.nutrients.fat_g, a.nutrients.fiber_g,
          ],
        );
        id = rows[0]!.id;
      }
      return (await getEntry(tx, id))!;
    });
    res.status(201).json(entry);
  });

  r.put('/:id', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const b = logUpdateSchema.parse(req.body);
    const entry = await withUser(db, user.id, async (tx) => {
      const cur = await getEntry(tx, id.data); // RLS: another user's entry is simply not found
      if (!cur) throw notFound();
      const meal = b.meal ?? cur.meal;
      if (cur.entry_type === 'quick') {
        await tx.query(
          `update food_log_entries set meal=$2, name=$3, kcal=$4, protein_g=$5, carbs_g=$6, fat_g=$7, updated_at=now() where id=$1`,
          [
            cur.id, meal, b.name === undefined ? cur.name : b.name ?? 'إضافة سريعة',
            round(b.kcal ?? cur.kcal, 2), round(b.protein_g ?? cur.protein_g, 2),
            round(b.carbs_g ?? cur.carbs_g, 2), round(b.fat_g ?? cur.fat_g, 2),
          ],
        );
      } else {
        const snap = cur.food_snapshot!;
        const unit = b.unit ?? cur.unit!;
        const quantity = b.quantity ?? cur.quantity!;
        let servingId = b.serving_id;
        if (servingId === undefined && unit === cur.unit && unit === 'serving') {
          servingId = snap.servings.find((s) => s.label === cur.serving_label && s.amount === cur.serving_amount)?.id;
        }
        const a = resolveAmount(snap, quantity, unit, servingId);
        await tx.query(
          `update food_log_entries set meal=$2, quantity=$3, unit=$4, serving_label=$5, serving_amount=$6,
             kcal=$7, protein_g=$8, carbs_g=$9, fat_g=$10, fiber_g=$11, updated_at=now() where id=$1`,
          [cur.id, meal, quantity, unit, a.servingLabel, a.servingAmount,
            a.nutrients.kcal, a.nutrients.protein_g, a.nutrients.carbs_g, a.nutrients.fat_g, a.nutrients.fiber_g],
        );
      }
      return (await getEntry(tx, cur.id))!;
    });
    res.json(entry);
  });

  r.delete('/:id', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const id = uuidParam.safeParse(req.params.id);
    if (!id.success) throw notFound();
    const n = await withUser(db, user.id, async (tx) => (await tx.query('delete from food_log_entries where id = $1', [id.data])).rowCount);
    if (!n) throw notFound();
    res.status(204).end();
  });

  return r;
}
