import { setTimeout } from 'node:timers/promises';
import { DsqlSigner } from '@aws-sdk/dsql-signer';
import pg from 'pg';
import type { Database } from 'remix/data-table';
import { createPostgresDatabase } from 'remix/data-table/postgres';
import { Config } from '#app/config.ts';

function poolConfig(): pg.PoolConfig {
  const { endpoint, url, user, region } = Config.database();
  if (!endpoint) return { connectionString: url, max: 4 };
  const signer = new DsqlSigner({ hostname: endpoint, region });
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

export function createPool() {
  const pool = new pg.Pool(poolConfig());
  pool.on('error', (error) => console.error('database pool error', error));
  return pool;
}

const conflictAttempts = 5;
const conflictBaseDelay = 100;

function isConflict(error: unknown) {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return (code ?? cause?.code) === '40001';
}

export async function retryOnConflict<Result>(run: () => Promise<Result>) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= conflictAttempts || !isConflict(error)) throw error;
      await setTimeout(conflictBaseDelay * 2 ** (attempt - 1) + Math.random() * conflictBaseDelay);
    }
  }
}

export class DatabaseConnection {
  static #pool?: pg.Pool;
  static #database?: Database;

  static get database(): Database {
    if (!DatabaseConnection.#database) {
      DatabaseConnection.#pool = createPool();
      DatabaseConnection.#database = createPostgresDatabase(DatabaseConnection.#pool);
    }
    return DatabaseConnection.#database;
  }

  static use(database: Database) {
    DatabaseConnection.#database = database;
  }

  static async close() {
    await DatabaseConnection.#pool?.end();
    DatabaseConnection.#pool = undefined;
    DatabaseConnection.#database = undefined;
  }
}
