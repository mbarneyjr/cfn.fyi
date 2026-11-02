import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { loadMigrations } from 'remix/data-table/migrations/node';
import { createPostgresDatabase } from 'remix/data-table/postgres';
import { createPool } from '#app/data/database.ts';

const lockStatement = /^(set lock_timeout|select pg_advisory_(un)?lock)/;
const roleArn = /^arn:aws[\w-]*:iam::\d{12}:role\/[\w+=,.@/-]+$/;

function bypassMigrationLock(pool: pg.Pool) {
  pool.on('connect', (client) => {
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    Object.assign(client, {
      query: (text: unknown, ...rest: unknown[]) =>
        typeof text === 'string' && lockStatement.test(text)
          ? Promise.resolve({ rows: [{ released: true }], rowCount: 1 })
          : query(text, ...rest),
    });
  });
}

async function grantRole(pool: pg.Pool, role: string, arn: string, privileges: string[]) {
  if (!roleArn.test(arn)) throw new Error(`Invalid role ARN for ${role}: ${arn}`);
  if (!(await pool.query('select 1 from pg_roles where rolname = $1', [role])).rowCount) {
    await pool.query(`create role ${role} with login`);
  }
  const mapping = await pool.query('select 1 from sys.iam_pg_role_mappings where pg_role_name = $1 and arn = $2', [
    role,
    arn,
  ]);
  if (!mapping.rowCount) await pool.query(`aws iam grant ${role} to '${arn}'`);
  const missing = await pool.query(
    `select 1 from pg_tables, unnest($2::text[]) as privilege
     where schemaname = 'public' and not has_table_privilege($1, format('public.%I', tablename), privilege) limit 1`,
    [role, privileges],
  );
  if (missing.rowCount) await pool.query(`grant ${privileges.join(', ')} on all tables in schema public to ${role}`);
}

const pool = createPool();
if (process.env.DATABASE_ENDPOINT) bypassMigrationLock(pool);
try {
  const migrations = await loadMigrations(fileURLToPath(new URL('./migrations', import.meta.url)));
  const { applied } = await createPostgresDatabase(pool).migrate(migrations);
  console.log(`applied ${applied.length} migrations`);
  const { READER_ROLE_ARN, WRITER_ROLE_ARN } = process.env;
  if (READER_ROLE_ARN) await grantRole(pool, 'cfnfyi_reader', READER_ROLE_ARN, ['select']);
  if (WRITER_ROLE_ARN)
    await grantRole(pool, 'cfnfyi_writer', WRITER_ROLE_ARN, ['select', 'insert', 'update', 'delete']);
} finally {
  await pool.end();
}
