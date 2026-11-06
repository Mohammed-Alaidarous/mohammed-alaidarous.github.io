import { Router, type Request, type Response } from 'express';
import type { Profile, ProfileResponse } from '../../shared/api-types.js';
import { computeTargets, isValidDateKey } from '../../shared/nutrition.js';
import { withUser, type Db, type Tx } from '../db/pool.js';
import { currentUser } from '../middleware.js';
import { profileSchema } from '../validation.js';

const COLUMNS = `sex, birth_date, height_cm, weight_kg, activity_level, goal_rate_kg_week, protein_g_per_kg, fat_pct,
  targets_mode, manual_kcal, manual_protein_g, manual_carbs_g, manual_fat_g, updated_at`;

export async function getProfile(tx: Tx, userId: string): Promise<Profile | null> {
  const { rows } = await tx.query<Profile>(`select ${COLUMNS} from profiles where user_id = $1`, [userId]);
  return rows[0] ?? null;
}

const todayUtc = () => new Date().toISOString().slice(0, 10);

export function profileRoutes(db: Db) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const on = typeof req.query.date === 'string' && isValidDateKey(req.query.date) ? req.query.date : todayUtc();
    const profile = await withUser(db, user.id, (tx) => getProfile(tx, user.id));
    const body: ProfileResponse = { profile, targets: profile ? computeTargets(profile, on) : null };
    res.json(body);
  });

  r.put('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const p = profileSchema.parse(req.body);
    const manual = p.targets_mode === 'manual';
    const profile = await withUser(db, user.id, async (tx) => {
      await tx.query(
        `insert into profiles (user_id, sex, birth_date, height_cm, weight_kg, activity_level, goal_rate_kg_week,
           protein_g_per_kg, fat_pct, targets_mode, manual_kcal, manual_protein_g, manual_carbs_g, manual_fat_g, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14, now())
         on conflict (user_id) do update set
           sex = excluded.sex, birth_date = excluded.birth_date, height_cm = excluded.height_cm,
           weight_kg = excluded.weight_kg, activity_level = excluded.activity_level,
           goal_rate_kg_week = excluded.goal_rate_kg_week, protein_g_per_kg = excluded.protein_g_per_kg,
           fat_pct = excluded.fat_pct, targets_mode = excluded.targets_mode, manual_kcal = excluded.manual_kcal,
           manual_protein_g = excluded.manual_protein_g, manual_carbs_g = excluded.manual_carbs_g,
           manual_fat_g = excluded.manual_fat_g, updated_at = now()`,
        [
          user.id, p.sex, p.birth_date, p.height_cm, p.weight_kg, p.activity_level, p.goal_rate_kg_week,
          p.protein_g_per_kg, p.fat_pct, p.targets_mode,
          manual ? p.manual_kcal : null, manual ? p.manual_protein_g : null,
          manual ? p.manual_carbs_g : null, manual ? p.manual_fat_g : null,
        ],
      );
      return (await getProfile(tx, user.id))!;
    });
    const body: ProfileResponse = { profile, targets: computeTargets(profile, todayUtc()) };
    res.json(body);
  });

  return r;
}
