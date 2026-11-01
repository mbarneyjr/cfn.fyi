{
  description = "cfn.fyi";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake";
    services-flake.url = "github:juspay/services-flake";
  };
  outputs =
    inputs@{ flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
        "x86_64-darwin"
      ];
      imports = [
        ./nix/overlays.nix
        ./nix/process-compose.nix
        ./nix/lambda.nix
      ];

      perSystem =
        { pkgs, ... }:
        {
          devShells.default = pkgs.mkShell {
            packages = [
              pkgs.nodejs_24
              pkgs.awscli2
              pkgs.python3Packages.cfn-lint
              pkgs.aws-sam-cli
              pkgs.jq
              pkgs.yq
              pkgs.shellcheck
              pkgs.zip
            ];
          };
        };
    };
}
