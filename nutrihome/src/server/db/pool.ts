import pg from 'pg';

// NUMERIC → number (values stored here are small and well within double precision).
pg.types.setTypeParser(1700, (v) => Number(v));
// DATE → keep the plain 'YYYY-MM-DD' string (avoids time-zone shifts).
pg.types.setTypeParser(1082, (v) => v);

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString: string): Db {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
}

/** Refuses to run with a role that would silently bypass row-level security. */
export async function assertRlsEnforced(db: Db): Promise<void> {
  const { rows } = await db.query<{ rolsuper: boolean; rolbypassrls: boolean; rolname: string }>(
    'select rolname, rolsuper, rolbypassrls from pg_roles where rolname = current_user',
  );
  const r = rows[0];
  if (!r || r.rolsuper || r.rolbypassrls) {
    throw new Error(`Database role "${r?.rolname}" bypasses row-level security. Connect as the app role (see .env.example).`);
  }
}

async function inTx<T>(db: Db, userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('begin');
    if (userId) await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (e) {
    await client.query('rollback').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/** Runs `fn` in a transaction where row-level security sees `userId` as the current user. */
export const withUser = <T>(db: Db, userId: string, fn: (tx: Tx) => Promise<T>) => inTx(db, userId, fn);

/** Transaction without a user context (auth flows on tables that have no RLS). */
export const withTx = <T>(db: Db, fn: (tx: Tx) => Promise<T>) => inTx(db, null, fn);
