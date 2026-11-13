import { and, column as c, eq, isNull, lt, or, type TableRow, table } from 'remix/data-table';
import { DatabaseConnection, retryOnConflict } from './connection.ts';

export const emailSubscribers = table({
  name: 'email_subscribers',
  primaryKey: 'email',
  columns: {
    email: c.text(),
    token: c.text(),
    status: c.enum(['pending', 'confirmed'] as const),
    requested_at: c.timestamp({ withTimezone: true }),
    confirmed_at: c.timestamp({ withTimezone: true }).nullable(),
    notified_ordinal: c.integer().nullable(),
  },
});

export type EmailSubscriber = TableRow<typeof emailSubscribers>;

export class EmailSubscribersTable {
  static find(email: string) {
    return DatabaseConnection.database.find(emailSubscribers, email);
  }

  static findByToken(token: string) {
    return DatabaseConnection.database.findOne(emailSubscribers, { where: { token } });
  }

  static async listConfirmedEmails() {
    const rows = await DatabaseConnection.database
      .query(emailSubscribers)
      .where({ status: 'confirmed' })
      .select({ email: emailSubscribers.email })
      .all();
    return rows.map((row) => row.email);
  }

  static async create(email: string, token: string, requestedAt: string) {
    await retryOnConflict(() =>
      DatabaseConnection.database.create(emailSubscribers, {
        email,
        token,
        status: 'pending',
        requested_at: requestedAt,
      }),
    );
  }

  static async updateRequestedAt(email: string, requestedAt: string) {
    await retryOnConflict(() =>
      DatabaseConnection.database.update(emailSubscribers, email, { requested_at: requestedAt }),
    );
  }

  static async confirm(token: string, confirmedAt: string) {
    const { affectedRows } = await retryOnConflict(() =>
      DatabaseConnection.database.updateMany(
        emailSubscribers,
        { status: 'confirmed', confirmed_at: confirmedAt },
        { where: and(eq('token', token), eq('status', 'pending')) },
      ),
    );
    return affectedRows > 0;
  }

  static async claimNotification(email: string, ordinal: number) {
    const { affectedRows } = await retryOnConflict(() =>
      DatabaseConnection.database.updateMany(
        emailSubscribers,
        { notified_ordinal: ordinal },
        {
          where: and(
            eq('email', email),
            eq('status', 'confirmed'),
            or(isNull('notified_ordinal'), lt('notified_ordinal', ordinal)),
          ),
        },
      ),
    );
    return affectedRows > 0;
  }

  static async deleteByToken(token: string) {
    await DatabaseConnection.database.deleteMany(emailSubscribers, { where: eq('token', token) });
  }

  static async delete(email: string) {
    await DatabaseConnection.database.deleteMany(emailSubscribers, { where: eq('email', email) });
  }
}
