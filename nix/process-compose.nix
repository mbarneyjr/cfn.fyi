{ inputs, ... }:
let
  databasePort = 44110;
  environment = {
    DATABASE_URL = "postgres://127.0.0.1:${toString databasePort}/cfnfyi";
    ARCHIVE_DIRECTORY = "\${PWD}/.data/archive";
  };
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
        command = "npm run db:migrate --workspace @cfnfyi/site";
        inherit environment;
        depends_on.npm-ci.condition = "process_completed_successfully";
        depends_on.database.condition = "process_healthy";
      };
      settings.processes.synchronize = {
        command = "npm run synchronize --workspace @cfnfyi/site && npm run rebuild --workspace @cfnfyi/site";
        inherit environment;
        depends_on.migrate.condition = "process_completed_successfully";
      };
      settings.processes.site = {
        command = "npm run hmr --workspace @cfnfyi/site";
        inherit environment;
        depends_on.migrate.condition = "process_completed_successfully";
      };
    };
  };
}
