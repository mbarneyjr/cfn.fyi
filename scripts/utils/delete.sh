#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: delete.sh <environment-name> <infra-component>"
  exit 1
}

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  usage
fi
INFRA_COMPONENT=${2:-}
if [[ -z "${INFRA_COMPONENT}" ]]; then
  usage
fi

# shellcheck disable=SC1091
source ./scripts/utils/load-config.sh "${ENVIRONMENT_NAME}"

STACK_NAME="${APPLICATION_NAME}-${ENVIRONMENT_NAME}-${INFRA_COMPONENT}"

echo "[${STACK_NAME}] deleting stack"
aws cloudformation delete-stack \
  --stack-name "${STACK_NAME}"

npx cfn-event-tailer "${STACK_NAME}"
