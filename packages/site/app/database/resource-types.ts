import { column as c, type TableRow, table } from 'remix/data-table';
import { statuses } from '#app/data/comparison.ts';
import { DatabaseConnection, retryOnConflict } from './connection.ts';

export const resourceTypes = table({
  name: 'resource_types',
  primaryKey: 'resource_type',
  columns: {
    resource_type: c.text(),
    latest_version: c.text(),
    latest_status: c.enum(statuses),
  },
});

export type ResourceType = TableRow<typeof resourceTypes>;

const batchRows = 2000;

export class ResourceTypesTable {
  static list() {
    return DatabaseConnection.database.query(resourceTypes).orderBy('resource_type', 'asc').all();
  }

  static async apply(upserts: ResourceType[], removals: string[]) {
    const operations = [...upserts.map((row) => ({ row })), ...removals.map((resource_type) => ({ resource_type }))];
    for (let index = 0; index < operations.length; index += batchRows) {
      const batch = operations.slice(index, index + batchRows);
      await retryOnConflict(() =>
        DatabaseConnection.database.transaction(async (transaction) => {
          for (const operation of batch) {
            if ('row' in operation) {
              await transaction.query(resourceTypes).upsert(operation.row, { conflictTarget: ['resource_type'] });
            } else {
              await transaction.delete(resourceTypes, operation.resource_type);
            }
          }
        }),
      );
    }
  }
}
