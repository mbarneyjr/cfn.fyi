{
  perSystem =
    { self', pkgs, ... }:
    {
      packages.lambda = pkgs.buildNpmPackage {
        pname = "cfnfyi";
        version = "0.0.0";
        src = pkgs.lib.fileset.toSource {
          root = ../.;
          fileset = pkgs.lib.fileset.unions [
            ../package.json
            ../package-lock.json
            ../packages
          ];
        };
        npmDepsHash = "sha256-KRncRzXLW10fNH3nyAnylxGJij/8FfDC7URV3FiCUGE=";
        dontNpmBuild = true;
      };
      packages.zip = pkgs.runCommand "cfnfyi-zip" { nativeBuildInputs = [ pkgs.zip ]; } ''
        cp -r ${self'.packages.lambda}/lib/node_modules/cfnfyi cfnfyi
        chmod -R u+w cfnfyi
        cd cfnfyi
        find . -exec touch -h -d 1980-01-01T00:00:00Z {} +
        mkdir $out
        find . -mindepth 1 | LC_ALL=C sort | TZ=UTC zip -X -y -D $out/lambda.zip -@ >/dev/null
      '';
    };
}
