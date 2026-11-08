#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: stack-output.sh <environment-name> <output-key>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
OUTPUT_KEY=${2:-}
if [[ -z "${ENVIRONMENT_NAME}" || -z "${OUTPUT_KEY}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

aws cloudformation describe-stacks \
  --stack-name "${APPLICATION_NAME}-${ENVIRONMENT_NAME}-site" \
  --query "Stacks[0].Outputs[?OutputKey=='${OUTPUT_KEY}'].OutputValue" \
  --output text
