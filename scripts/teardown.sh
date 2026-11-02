#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT_NAME=${1:-$(whoami)}

source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

if [[ "${ENVIRONMENT_NAME}" != "prod" ]]; then
  ARCHIVE_BUCKET=$(./scripts/utils/stack-output.sh "${ENVIRONMENT_NAME}" ArchiveBucketName 2>/dev/null || true)
  if [[ -n "${ARCHIVE_BUCKET}" && "${ARCHIVE_BUCKET}" != "None" ]]; then
    ./scripts/utils/empty-bucket.sh "${ARCHIVE_BUCKET}"
  fi
fi

./scripts/utils/delete.sh "${ENVIRONMENT_NAME}" site
