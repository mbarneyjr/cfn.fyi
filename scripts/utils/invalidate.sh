#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: invalidate.sh <environment-name>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

STACK_NAME="${APPLICATION_NAME}-${ENVIRONMENT_NAME}-site"

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "Stacks[0].Outputs[?OutputKey=='DistributionId'].OutputValue" \
  --output text)

echo "[${STACK_NAME}] invalidating cloudfront distribution [${DISTRIBUTION_ID}]..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "${DISTRIBUTION_ID}" \
  --paths '/*' \
  --query Invalidation.Id \
  --output text)

aws cloudfront wait invalidation-completed \
  --distribution-id "${DISTRIBUTION_ID}" \
  --id "${INVALIDATION_ID}"
echo "[${STACK_NAME}] invalidation [${INVALIDATION_ID}] completed"
