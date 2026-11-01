#!/usr/bin/env bash

set -euo pipefail

mkdir -p artifacts

echo "[build] building lambda zip..."
nix build .#packages.aarch64-linux.zip

install -m 644 ./result/lambda.zip artifacts/lambda.zip
