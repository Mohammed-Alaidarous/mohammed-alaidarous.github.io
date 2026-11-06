import { createApp } from './app.js';
import { purgeExpiredSessions } from './auth/sessions.js';
import { loadConfig } from './config.js';
import { assertRlsEnforced, createPool } from './db/pool.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);

if (!config.allowRlsBypass) await assertRlsEnforced(db);
await purgeExpiredSessions(db);
setInterval(() => purgeExpiredSessions(db).catch(() => {}), 6 * 3600_000).unref();

const app = createApp(db, { production: config.production, trustProxy: config.trustProxy });
const server = app.listen(config.port, () => console.log(`NutriHome listening on http://localhost:${config.port}`));

const shutdown = () => server.close(() => db.end().then(() => process.exit(0)));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
