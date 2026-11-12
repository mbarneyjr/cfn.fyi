import { and, column as c, eq, isNull, lt, or, type TableRow, table } from 'remix/data-table';
import { DatabaseConnection, retryOnConflict } from './connection.ts';

export const slackInstallations = table({
  name: 'slack_installations',
  primaryKey: 'team_id',
  columns: {
    team_id: c.text(),
    team_name: c.text(),
    app_id: c.text(),
    bot_user_id: c.text().nullable(),
    access_token: c.text(),
    scope: c.text(),
    channel_id: c.text().nullable(),
    webhook_url: c.text().nullable(),
    installed_at: c.timestamp({ withTimezone: true }),
    notified_ordinal: c.integer().nullable(),
  },
});

export type SlackInstallation = TableRow<typeof slackInstallations>;

export type SlackInstallationGrant = Omit<SlackInstallation, 'notified_ordinal'>;

export class SlackInstallationsTable {
  static async listTeamIds() {
    const rows = await DatabaseConnection.database
      .query(slackInstallations)
      .select({ team_id: slackInstallations.team_id })
      .all();
    return rows.map((row) => row.team_id);
  }

  static find(teamId: string) {
    return DatabaseConnection.database.find(slackInstallations, teamId);
  }

  static async upsert(grant: SlackInstallationGrant) {
    await DatabaseConnection.database.query(slackInstallations).upsert(grant, { conflictTarget: ['team_id'] });
  }

  static async claimNotification(teamId: string, ordinal: number) {
    const { affectedRows } = await retryOnConflict(() =>
      DatabaseConnection.database.updateMany(
        slackInstallations,
        { notified_ordinal: ordinal },
        {
          where: and(eq('team_id', teamId), or(isNull('notified_ordinal'), lt('notified_ordinal', ordinal))),
        },
      ),
    );
    return affectedRows > 0;
  }

  static async delete(teamId: string) {
    await DatabaseConnection.database.deleteMany(slackInstallations, { where: eq('team_id', teamId) });
  }
}
