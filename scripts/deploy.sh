#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT_NAME=${1:-$(whoami)}

source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

./scripts/utils/build.sh
./scripts/utils/package-lambda.sh "${ENVIRONMENT_NAME}"
./scripts/utils/package-icon.sh "${ENVIRONMENT_NAME}"
./scripts/utils/plan.sh "${ENVIRONMENT_NAME}" site
./scripts/utils/apply.sh "${ENVIRONMENT_NAME}" site
./scripts/utils/migrate.sh "${ENVIRONMENT_NAME}"
./scripts/utils/invalidate.sh "${ENVIRONMENT_NAME}"
