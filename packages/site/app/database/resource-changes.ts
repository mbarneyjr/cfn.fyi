import { column as c, gte, type TableRow, table } from 'remix/data-table';
import { statuses } from '#app/data/comparison.ts';
import { DatabaseConnection, retryOnConflict } from './connection.ts';

export const resourceChanges = table({
  name: 'resource_changes',
  primaryKey: ['resource_type', 'ordinal'],
  columns: {
    resource_type: c.text(),
    ordinal: c.integer(),
    version: c.text(),
    status: c.enum(statuses),
    diff: c.text(),
    diff_sha256: c.text(),
  },
});

export type ResourceChange = TableRow<typeof resourceChanges>;

export type ResourceChangeKey = Pick<ResourceChange, 'resource_type' | 'ordinal'>;

export type ResourceChangeOperation = { row: ResourceChange } | { key: ResourceChangeKey };

const batchRows = 2000;
const batchBytes = 8 * 1024 * 1024;

export class ResourceChangesTable {
  static listByOrdinal(ordinal: number, resourceType?: string) {
    return DatabaseConnection.database
      .query(resourceChanges)
      .where({ ordinal, ...(resourceType && { resource_type: resourceType }) })
      .orderBy('resource_type', 'asc')
      .all();
  }

  static listFromOrdinal(ordinal: number) {
    return DatabaseConnection.database.query(resourceChanges).where(gte('ordinal', ordinal)).all();
  }

  static async listOrdinals(resourceType: string) {
    const rows = await DatabaseConnection.database
      .query(resourceChanges)
      .where({ resource_type: resourceType })
      .select({ ordinal: resourceChanges.ordinal })
      .all();
    return rows.map((row) => row.ordinal);
  }

  static listDigests() {
    return DatabaseConnection.database
      .query(resourceChanges)
      .select({
        resource_type: resourceChanges.resource_type,
        ordinal: resourceChanges.ordinal,
        version: resourceChanges.version,
        diff_sha256: resourceChanges.diff_sha256,
      })
      .all();
  }

  static async apply(operations: ResourceChangeOperation[]) {
    let batch: ResourceChangeOperation[] = [];
    let bytes = 0;
    for (const operation of operations) {
      const size = 'row' in operation ? operation.row.diff.length : 0;
      if (batch.length === batchRows || (batch.length && bytes + size > batchBytes)) {
        await ResourceChangesTable.#applyBatch(batch);
        batch = [];
        bytes = 0;
      }
      batch.push(operation);
      bytes += size;
    }
    if (batch.length) await ResourceChangesTable.#applyBatch(batch);
  }

  static async #applyBatch(batch: ResourceChangeOperation[]) {
    await retryOnConflict(() =>
      DatabaseConnection.database.transaction(async (transaction) => {
        for (const operation of batch) {
          if ('row' in operation) {
            await transaction
              .query(resourceChanges)
              .upsert(operation.row, { conflictTarget: ['resource_type', 'ordinal'] });
          } else {
            await transaction.delete(resourceChanges, operation.key);
          }
        }
      }),
    );
  }
}
