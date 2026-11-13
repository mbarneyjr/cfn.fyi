import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type pg from 'pg';
import { loadMigrations } from 'remix/data-table/migrations/node';
import { createPostgresDatabase } from 'remix/data-table/postgres';
import { createPool } from '#app/database/connection.ts';

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

const {
  positionals: [direction = 'up'],
  values,
} = parseArgs({
  allowPositionals: true,
  options: { step: { type: 'string' }, to: { type: 'string' }, 'dry-run': { type: 'boolean' } },
});
if (direction !== 'up' && direction !== 'down') throw new Error(`Unknown direction: ${direction}`);
if (values.to && values.step) throw new Error('Use either --to or --step, not both');
if (direction === 'down' && !values.to && !values.step) throw new Error('down requires --to or --step');
const bounds = values.to ? { to: values.to } : values.step ? { step: Number(values.step) } : {};

const pool = createPool();
if (process.env.DATABASE_ENDPOINT) bypassMigrationLock(pool);
try {
  const migrations = await loadMigrations(fileURLToPath(new URL('./migrations', import.meta.url)));
  const { applied, reverted } = await createPostgresDatabase(pool).migrate(migrations, {
    ...bounds,
    direction,
    dryRun: values['dry-run'],
  });
  console.log(`applied ${applied.length} migrations, reverted ${reverted.length}`);
  if (direction === 'up' && !values['dry-run']) {
    const { SITE_FUNCTION_ROLE_ARN, EVENT_FUNCTION_ROLE_ARN } = process.env;
    if (SITE_FUNCTION_ROLE_ARN) {
      await grantRole(pool, 'cfnfyi_reader', SITE_FUNCTION_ROLE_ARN, ['select']);
      await pool.query('grant insert, update, delete on slack_installations to cfnfyi_reader');
      await pool.query('grant insert, update, delete on email_subscribers to cfnfyi_reader');
    }
    if (EVENT_FUNCTION_ROLE_ARN)
      await grantRole(pool, 'cfnfyi_writer', EVENT_FUNCTION_ROLE_ARN, ['select', 'insert', 'update', 'delete']);
  }
} finally {
  await pool.end();
}
