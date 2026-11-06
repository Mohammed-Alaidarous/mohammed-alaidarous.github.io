import { createHash, randomBytes } from 'node:crypto';
import type { Db, Tx } from '../db/pool.js';

export const SESSION_COOKIE = 'nh_session';
export const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  householdId: string;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest();

export async function createSession(q: Tx | Db, userId: string, userAgent?: string): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await q.query(
    `insert into sessions (token_hash, user_id, expires_at, user_agent)
     values ($1, $2, now() + make_interval(days => $3), $4)`,
    [hashToken(token), userId, SESSION_DAYS, userAgent?.slice(0, 200) ?? null],
  );
  return token;
}

export async function findSession(db: Db, token: string): Promise<SessionUser | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { rows } = await db.query<{ id: string; email: string; display_name: string; household_id: string; renew: boolean }>(
    `select u.id, u.email, u.display_name, u.household_id,
            s.expires_at < now() + make_interval(days => $2 - 1) as renew
       from sessions s join users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token), SESSION_DAYS],
  );
  const r = rows[0];
  if (!r) return null;
  if (r.renew) {
    await db.query('update sessions set expires_at = now() + make_interval(days => $2) where token_hash = $1', [
      hashToken(token),
      SESSION_DAYS,
    ]);
  }
  return { id: r.id, email: r.email, displayName: r.display_name, householdId: r.household_id };
}

export async function deleteSession(db: Db, token: string): Promise<void> {
  await db.query('delete from sessions where token_hash = $1', [hashToken(token)]);
}

export async function purgeExpiredSessions(db: Db): Promise<void> {
  await db.query('delete from sessions where expires_at < now()');
}
