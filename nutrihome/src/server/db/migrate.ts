import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, 'migrations');

export interface MigrateOptions {
  adminUrl: string;
  appRole: string;
  appPassword: string;
  log?: (msg: string) => void;
}

/** Applies pending SQL migrations as the owner role, then creates/updates and grants the app role. */
export async function migrate({ adminUrl, appRole, appPassword, log = console.log }: MigrateOptions): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(appRole)) throw new Error('invalid app role name');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(
      'create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())',
    );
    const done = new Set((await client.query<{ name: string }>('select name from schema_migrations')).rows.map((r) => r.name));
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      log(`applying ${f}`);
      await client.query('begin');
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'));
        await client.query('insert into schema_migrations (name) values ($1)', [f]);
        await client.query('commit');
      } catch (e) {
        await client.query('rollback');
        throw e;
      }
    }

    const exists = (await client.query('select 1 from pg_roles where rolname = $1', [appRole])).rowCount;
    const pw = appPassword.replace(/'/g, "''");
    const verb = exists ? 'alter' : 'create';
    await client.query(`${verb} role ${appRole} login password '${pw}' nosuperuser nobypassrls`);
    const dbName = (await client.query<{ db: string }>('select current_database() as db')).rows[0]!.db;
    await client.query(`grant connect on database "${dbName.replace(/"/g, '""')}" to ${appRole}`);
    await client.query(`grant usage on schema public to ${appRole}`);
    await client.query(`grant select, insert, update, delete on all tables in schema public to ${appRole}`);
    await client.query(`revoke all on schema_migrations from ${appRole}`);
    await client.query(`grant execute on all functions in schema public to ${appRole}`);
    log('migrations up to date');
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const adminUrl = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!adminUrl || !appUrl || !appPassword) {
    console.error('MIGRATION_DATABASE_URL, DATABASE_URL and APP_DB_PASSWORD are required');
    process.exit(1);
  }
  const appRole = decodeURIComponent(new URL(appUrl).username);
  migrate({ adminUrl, appRole, appPassword }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
