{ inputs, ... }:
{
  imports = [ inputs.process-compose-flake.flakeModule ];
  perSystem = {
    process-compose.dev = {
      imports = [ inputs.services-flake.processComposeModules.default ];
      settings.processes.npm-ci = {
        command = "npm ci --include dev";
      };
      settings.processes.site = {
        command = "npm run hmr --workspace @cfnfyi/site";
        depends_on.npm-ci.condition = "process_completed";
      };
    };
  };
}
