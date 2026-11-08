#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT_NAME=${1:-$(whoami)}

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

output() {
  ./scripts/utils/stack-output.sh "${ENVIRONMENT_NAME}" "$1"
}

echo "[${APPLICATION_NAME}-${ENVIRONMENT_NAME}-site] archiving every source version..."
ARCHIVE_BUCKET=$(output ArchiveBucketName) \
  DATABASE_ENDPOINT=$(output DatabaseEndpoint) \
  DATABASE_USER=admin \
  npm run synchronize --workspace @cfnfyi/site

echo "[${APPLICATION_NAME}-${ENVIRONMENT_NAME}-site] starting the rebuild..."
aws lambda invoke \
  --function-name "$(output RebuildChangesFunctionName)" \
  --invocation-type Event \
  /dev/null >/dev/null
