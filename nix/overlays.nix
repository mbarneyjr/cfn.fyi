{ inputs, ... }:
{
  perSystem =
    { system, ... }:
    {
      _module.args.pkgs = import inputs.nixpkgs {
        inherit system;
        overlays = [
          (final: prev: {
            aws-sam-cli = prev.aws-sam-cli.overrideAttrs (old: {
              version = "1.168.0";
              src = prev.fetchFromGitHub {
                owner = "aws";
                repo = "aws-sam-cli";
                tag = "v1.168.0";
                hash = "sha256-MYzOJskAGzwFx3zIXshBfsTpuQAf4alCoQfJRsEAn9w=";
              };
              disabledTests = old.disabledTests or [ ] ++ [
                "test_lint_sam_resource_types"
                "test_samconfig"
              ];
            });
            pythonPackagesExtensions = prev.pythonPackagesExtensions ++ [
              (pyfinal: pyprev: {
                cfn-lint = pyprev.cfn-lint.overridePythonAttrs (old: {
                  version = "1.57.2";
                  src = prev.fetchFromGitHub {
                    owner = "aws-cloudformation";
                    repo = "cfn-lint";
                    tag = "v1.57.2";
                    hash = "sha256-ncvEMFoeaQzz8lGfnO4CBUax3H3N5mVMLnsQF0wRuv8=";
                  };
                  doCheck = false;
                });
              })
            ];
          })
        ];
      };
    };
}
