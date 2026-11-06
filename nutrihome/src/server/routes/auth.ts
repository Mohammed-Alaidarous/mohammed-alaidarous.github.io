import { randomInt } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import type { Me } from '../../shared/api-types.js';
import { dummyHash, hashPassword, verifyPassword } from '../auth/password.js';
import { createSession, deleteSession, SESSION_COOKIE, SESSION_DAYS } from '../auth/sessions.js';
import { withTx, withUser, type Db } from '../db/pool.js';
import { conflict, HttpError, notFound, unauthorized } from '../errors.js';
import { AttemptLimiter, currentUser, requireUser } from '../middleware.js';
import { loginSchema, registerSchema } from '../validation.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newInviteCode = () => Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');

export function authRoutes(db: Db, opts: { secureCookies: boolean; registerLimitPerHour?: number }) {
  const r = Router();
  const loginLimiter = new AttemptLimiter(10, 15 * 60_000);
  const registerLimiter = new AttemptLimiter(opts.registerLimitPerHour ?? 20, 60 * 60_000);

  const setCookie = (res: Response, token: string) =>
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.secureCookies,
      path: '/',
      maxAge: SESSION_DAYS * 86_400_000,
    });

  r.post('/register', async (req: Request, res: Response) => {
    const ip = req.ip ?? 'unknown';
    if (!registerLimiter.check(ip)) throw new HttpError(429, 'too_many_attempts');
    registerLimiter.record(ip);
    const body = registerSchema.parse(req.body);
    const passwordHash = await hashPassword(body.password);

    const { userId, token } = await withTx(db, async (tx) => {
      const taken = await tx.query('select 1 from users where lower(email) = $1', [body.email]);
      if (taken.rowCount) throw conflict('email_taken');

      let householdId: string;
      if (body.household.mode === 'create') {
        const { rows } = await tx.query<{ id: string }>(
          'insert into households (name, invite_code) values ($1, $2) returning id',
          [body.household.name, newInviteCode()],
        );
        householdId = rows[0]!.id;
      } else {
        const { rows } = await tx.query<{ id: string; max_members: number }>(
          'select id, max_members from households where invite_code = $1 for update',
          [body.household.inviteCode],
        );
        const h = rows[0];
        if (!h) throw notFound('invalid_invite');
        const count = (await tx.query<{ n: number }>('select count(*)::int as n from users where household_id = $1', [h.id])).rows[0]!.n;
        if (count >= h.max_members) throw conflict('household_full');
        householdId = h.id;
      }

      const { rows } = await tx.query<{ id: string }>(
        'insert into users (household_id, email, password_hash, display_name) values ($1, $2, $3, $4) returning id',
        [householdId, body.email, passwordHash, body.displayName],
      );
      const userId = rows[0]!.id;
      const token = await createSession(tx, userId, req.get('user-agent'));
      return { userId, token };
    }).catch((e: { code?: string }) => {
      if (e?.code === '23505') throw conflict('email_taken');
      throw e;
    });

    setCookie(res, token);
    res.status(201).json(await loadMe(db, userId));
  });

  r.post('/login', async (req: Request, res: Response) => {
    const body = loginSchema.parse(req.body);
    const key = `${req.ip}|${body.email}`;
    if (!loginLimiter.check(key)) throw new HttpError(429, 'too_many_attempts');

    const { rows } = await db.query<{ id: string; password_hash: string }>(
      'select id, password_hash from users where lower(email) = $1',
      [body.email],
    );
    const user = rows[0];
    const ok = await verifyPassword(body.password, user?.password_hash ?? (await dummyHash()));
    if (!user || !ok) {
      loginLimiter.record(key);
      throw unauthorized('invalid_credentials');
    }
    loginLimiter.reset(key);
    const token = await createSession(db, user.id, req.get('user-agent'));
    setCookie(res, token);
    res.json(await loadMe(db, user.id));
  });

  r.post('/logout', async (req: Request, res: Response) => {
    if (req.sessionToken) await deleteSession(db, req.sessionToken);
    res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: opts.secureCookies });
    res.status(204).end();
  });

  r.get('/me', requireUser, async (req: Request, res: Response) => {
    res.json(await loadMe(db, currentUser(req).id));
  });

  return r;
}

async function loadMe(db: Db, userId: string): Promise<Me> {
  const { rows } = await db.query<{ id: string; email: string; display_name: string; hid: string; hname: string }>(
    `select u.id, u.email, u.display_name, h.id as hid, h.name as hname
       from users u join households h on h.id = u.household_id where u.id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u) throw unauthorized();
  // profiles is protected by RLS, so check it inside the user's own context.
  const hasProfile = await withUser(db, userId, async (tx) => !!(await tx.query('select 1 from profiles where user_id = $1', [userId])).rowCount);
  return { id: u.id, email: u.email, displayName: u.display_name, household: { id: u.hid, name: u.hname }, hasProfile };
}
