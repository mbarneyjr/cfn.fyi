import { fileURLToPath } from 'node:url';
import { loadMigrations } from 'remix/data-table/migrations/node';
import { createSqliteDatabase } from 'remix/data-table/sqlite';

export async function createTestDatabase() {
  const db = createSqliteDatabase({ filename: ':memory:', foreignKeys: true });
  await db.migrate(await loadMigrations(fileURLToPath(new URL('./migrations', import.meta.url))));
  return db;
}
