#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: package-lambda.sh <environment-name>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

ZIP_PATH="artifacts/lambda.zip"
PARAMS_PATH="artifacts/lambda.env"

if [[ ! -f "${ZIP_PATH}" ]]; then
  echo "[package] ${ZIP_PATH} does not exist, run build.sh first"
  exit 1
fi

CODE_KEY="${APPLICATION_NAME}/lambda/$(sha256sum "${ZIP_PATH}" | cut -d' ' -f1).zip"

CODE_VERSION=$(aws s3api head-object \
  --bucket "${ARTIFACT_BUCKET}" \
  --key "${CODE_KEY}" \
  --query VersionId \
  --output text 2>/dev/null || true)
if [[ "${CODE_VERSION}" == "None" ]]; then
  echo "[package] s3://${ARTIFACT_BUCKET} does not have versioning enabled"
  exit 1
elif [[ -z "${CODE_VERSION}" ]]; then
  echo "[package] uploading lambda zip to s3://${ARTIFACT_BUCKET}/${CODE_KEY}..."
  CODE_VERSION=$(aws s3api put-object \
    --bucket "${ARTIFACT_BUCKET}" \
    --key "${CODE_KEY}" \
    --body "${ZIP_PATH}" \
    --if-none-match '*' \
    --query VersionId \
    --output text)
else
  echo "[package] lambda zip already exists at s3://${ARTIFACT_BUCKET}/${CODE_KEY}"
fi

cat >"${PARAMS_PATH}" <<EOF
CFN_PARAM_CodeBucket=${ARTIFACT_BUCKET}
CFN_PARAM_CodeKey=${CODE_KEY}
CFN_PARAM_CodeVersion=${CODE_VERSION}
EOF
