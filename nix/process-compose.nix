{ inputs, ... }:
let
  databasePort = 44110;
  environment = "DATABASE_URL=postgres://127.0.0.1:${toString databasePort}/cfnfyi ARCHIVE_DIRECTORY=$PWD/.data/archive";
in
{
  imports = [ inputs.process-compose-flake.flakeModule ];
  perSystem = {
    process-compose.dev = {
      imports = [ inputs.services-flake.processComposeModules.default ];
      services.postgres.database = {
        enable = true;
        port = databasePort;
        dataDir = "./.data/postgres";
        initialDatabases = [ { name = "cfnfyi"; } ];
      };
      settings.processes.npm-ci = {
        command = "npm ci --include dev";
      };
      settings.processes.migrate = {
        command = "${environment} npm run db:migrate --workspace @cfnfyi/site";
        depends_on.npm-ci.condition = "process_completed_successfully";
        depends_on.database.condition = "process_healthy";
      };
      settings.processes.synchronize = {
        command = "${environment} npm run synchronize --workspace @cfnfyi/site &&${environment} npm run rebuild --workspace @cfnfyi/site";
        depends_on.migrate.condition = "process_completed_successfully";
      };
      settings.processes.site = {
        command = "${environment} npm run hmr --workspace @cfnfyi/site";
        depends_on.migrate.condition = "process_completed_successfully";
      };
    };
  };
}
