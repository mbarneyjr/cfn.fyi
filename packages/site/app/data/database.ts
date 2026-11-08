import { setTimeout } from 'node:timers/promises';
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import pg from 'pg';
import type { Database } from 'remix/data-table';
import { createPostgresDatabase } from 'remix/data-table/postgres';

function poolConfig(): pg.PoolConfig {
  const endpoint = process.env.DATABASE_ENDPOINT;
  if (!endpoint) return { connectionString: process.env.DATABASE_URL, max: 4 };
  const user = process.env.DATABASE_USER ?? 'admin';
  const signer = new DsqlSigner({ hostname: endpoint, region: process.env.AWS_REGION });
  return {
    host: endpoint,
    port: 5432,
    database: 'postgres',
    user,
    ssl: true,
    max: 4,
    maxLifetimeSeconds: 3000,
    password: () => (user === 'admin' ? signer.getDbConnectAdminAuthToken() : signer.getDbConnectAuthToken()),
  };
}

export function createPool(overrides: pg.PoolConfig = {}) {
  const pool = new pg.Pool({ ...poolConfig(), ...overrides });
  pool.on('error', (error) => console.error('database pool error', error));
  return pool;
}

const conflictAttempts = 5;
const conflictBaseDelay = 100;

const isConflict = (error: unknown) => {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return (code ?? cause?.code) === '40001';
};

export async function retryOnConflict<result>(run: () => Promise<result>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= conflictAttempts || !isConflict(error)) throw error;
      await setTimeout(conflictBaseDelay * 2 ** (attempt - 1) + Math.random() * conflictBaseDelay);
    }
  }
}

export async function withDatabase<result>(run: (db: Database) => Promise<result>) {
  const pool = createPool();
  try {
    return await run(createPostgresDatabase(pool));
  } finally {
    await pool.end();
  }
}
