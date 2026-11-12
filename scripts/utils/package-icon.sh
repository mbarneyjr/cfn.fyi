#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: package-icon.sh <environment-name>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

ICON_PATH="infra/site/slack-icon.png"
PARAMS_PATH="artifacts/icon.env"
ICON_KEY="${APPLICATION_NAME}/assets/icon/$(sha256sum "${ICON_PATH}" | cut -d' ' -f1).png"

if aws s3api head-object --bucket "${ARTIFACT_BUCKET}" --key "${ICON_KEY}" >/dev/null 2>&1; then
  echo "[package] icon already exists at s3://${ARTIFACT_BUCKET}/${ICON_KEY}"
else
  echo "[package] uploading icon to s3://${ARTIFACT_BUCKET}/${ICON_KEY}..."
  aws s3api put-object \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${ICON_KEY}" \
    --body "${ICON_PATH}" \
    --content-type image/png \
    --if-none-match '*' >/dev/null
fi

mkdir -p artifacts
echo "CFN_PARAM_SlackIconUri=s3://${ARTIFACT_BUCKET}/${ICON_KEY}" >"${PARAMS_PATH}"
