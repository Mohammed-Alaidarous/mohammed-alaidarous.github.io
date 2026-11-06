export interface Config {
  databaseUrl: string;
  port: number;
  production: boolean;
  trustProxy: boolean;
  allowRlsBypass: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  return {
    databaseUrl,
    port: Number(env.PORT || 3000),
    production: env.NODE_ENV === 'production',
    trustProxy: env.TRUST_PROXY === '1',
    allowRlsBypass: env.ALLOW_RLS_BYPASS === '1',
  };
}
