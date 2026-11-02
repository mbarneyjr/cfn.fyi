#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: migrate.sh <environment-name>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

output() {
  ./scripts/utils/stack-output.sh "${ENVIRONMENT_NAME}" "$1"
}

echo "[${APPLICATION_NAME}-${ENVIRONMENT_NAME}-site] migrating database..."
DATABASE_ENDPOINT=$(output DatabaseEndpoint) \
  DATABASE_USER=admin \
  READER_ROLE_ARN=$(output SiteFunctionRoleArn) \
  WRITER_ROLE_ARN=$(output EventFunctionRoleArn) \
  npm run db:migrate --workspace @cfnfyi/site
