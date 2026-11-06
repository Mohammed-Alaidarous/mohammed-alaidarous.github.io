import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import type { Db } from './db/pool.js';
import { notFound } from './errors.js';
import { csrfGuard, errorHandler, loadSession, requireUser, securityHeaders } from './middleware.js';
import { authRoutes } from './routes/auth.js';
import { foodRoutes } from './routes/foods.js';
import { householdRoutes } from './routes/household.js';
import { logRoutes } from './routes/log.js';
import { profileRoutes } from './routes/profile.js';

export interface AppOptions {
  production: boolean;
  trustProxy?: boolean;
  webDir?: string | null;
  registerLimitPerHour?: number;
}

export function createApp(db: Db, opts: AppOptions) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', opts.trustProxy ?? false);
  app.use(securityHeaders(opts.production));

  const api = express.Router();
  api.use(express.json({ limit: '100kb' }));
  api.use(csrfGuard);
  api.use(loadSession(db));
  api.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  api.get('/health', async (_req: Request, res: Response) => {
    await db.query('select 1');
    res.json({ ok: true });
  });
  api.use('/auth', authRoutes(db, { secureCookies: opts.production, registerLimitPerHour: opts.registerLimitPerHour }));
  api.use('/profile', requireUser, profileRoutes(db));
  api.use('/household', requireUser, householdRoutes(db));
  api.use('/foods', requireUser, foodRoutes(db));
  api.use('/log', requireUser, logRoutes(db));
  api.use(() => {
    throw notFound();
  });
  api.use(errorHandler);
  app.use('/api', api);

  const webDir = opts.webDir === undefined ? defaultWebDir() : opts.webDir;
  if (webDir && existsSync(join(webDir, 'index.html'))) {
    app.use(express.static(webDir, { index: false, maxAge: '1h' }));
    app.get(/.*/, (_req, res) => res.sendFile(join(webDir, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}

function defaultWebDir(): string {
  // dist/server/server/app.js → dist/web ; src/server/app.ts → dist/web
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '../../web'), resolve(here, '../../dist/web')];
  return candidates.find((d) => existsSync(join(d, 'index.html'))) ?? candidates[0]!;
}
