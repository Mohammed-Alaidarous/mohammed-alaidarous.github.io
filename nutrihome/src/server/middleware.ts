import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { findSession, SESSION_COOKIE, type SessionUser } from './auth/sessions.js';
import type { Db } from './db/pool.js';
import { HttpError, unauthorized } from './errors.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser;
    sessionToken?: string;
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

export function securityHeaders(production: boolean) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; '),
    );
    if (production) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  };
}

/**
 * CSRF defence for cookie-authenticated requests: state-changing API calls must carry a custom
 * header (which a cross-site form or image cannot send) and, when present, a same-origin Origin.
 */
export function csrfGuard(req: Request, _res: Response, next: NextFunction) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-nutrihome') !== '1') return next(new HttpError(403, 'csrf'));
  const origin = req.get('origin');
  if (origin) {
    const host = req.get('host');
    try {
      if (new URL(origin).host !== host) return next(new HttpError(403, 'csrf'));
    } catch {
      return next(new HttpError(403, 'csrf'));
    }
  }
  next();
}

export function loadSession(db: Db) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      const user = await findSession(db, token);
      if (user) {
        req.user = user;
        req.sessionToken = token;
      }
    }
    next();
  };
}

export function requireUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function currentUser(req: Request): SessionUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Small in-memory limiter for login/registration attempts (per key, sliding window). */
export class AttemptLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  check(key: string): boolean {
    const now = Date.now();
    const list = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    this.hits.set(key, list);
    return list.length < this.max;
  }
  record(key: string) {
    const list = this.hits.get(key) ?? [];
    list.push(Date.now());
    this.hits.set(key, list);
  }
  reset(key: string) {
    this.hits.delete(key);
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'validation',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code });
    return;
  }
  const e = err as { type?: string; status?: number };
  if (e?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid_json' });
    return;
  }
  if (e?.type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'server_error' });
}
