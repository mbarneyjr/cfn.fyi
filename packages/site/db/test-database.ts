import { fileURLToPath } from 'node:url';
import { loadMigrations } from 'remix/data-table/migrations/node';
import { createSqliteDatabase } from 'remix/data-table/sqlite';
import { DatabaseConnection } from '#app/database/connection.ts';

export async function createTestDatabase() {
  const db = createSqliteDatabase({ filename: ':memory:', foreignKeys: true });
  await db.migrate(await loadMigrations(fileURLToPath(new URL('./migrations', import.meta.url))));
  DatabaseConnection.use(db);
  return db;
}
