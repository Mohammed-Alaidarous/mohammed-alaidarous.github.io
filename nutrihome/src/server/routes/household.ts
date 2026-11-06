import { Router, type Request, type Response } from 'express';
import type { Household } from '../../shared/api-types.js';
import type { Db } from '../db/pool.js';
import { currentUser } from '../middleware.js';

export function householdRoutes(db: Db) {
  const r = Router();

  r.get('/', async (req: Request, res: Response) => {
    const user = currentUser(req);
    const h = (
      await db.query<{ id: string; name: string; invite_code: string; max_members: number }>(
        'select id, name, invite_code, max_members from households where id = $1',
        [user.householdId],
      )
    ).rows[0]!;
    // Only names are shared between members; emails and all health data stay private.
    const members = (
      await db.query<{ id: string; display_name: string }>(
        'select id, display_name from users where household_id = $1 order by created_at',
        [user.householdId],
      )
    ).rows;
    const body: Household = {
      id: h.id,
      name: h.name,
      inviteCode: h.invite_code,
      maxMembers: h.max_members,
      members: members.map((m) => ({ displayName: m.display_name, isMe: m.id === user.id })),
    };
    res.json(body);
  });

  return r;
}
