#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: apply.sh <environment-name> <infra-component>"
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

# shellcheck disable=SC1090
[[ -f infra/${INFRA_COMPONENT}/.env ]] && source "infra/${INFRA_COMPONENT}/.env"
# shellcheck disable=SC1090
[[ -f infra/${INFRA_COMPONENT}/.env.${ENVIRONMENT_NAME} ]] && source "infra/${INFRA_COMPONENT}/.env.${ENVIRONMENT_NAME}"

STACK_NAME="${APPLICATION_NAME}-${ENVIRONMENT_NAME}-${INFRA_COMPONENT}"
CHANGE_SET_PATH="artifacts/changesets/${ENVIRONMENT_NAME}-${INFRA_COMPONENT}.changeset.json"

if [[ -f "${CHANGE_SET_PATH}" && $(jq .Status -r "${CHANGE_SET_PATH}") != "FAILED" ]]; then

  CHANGE_SET_ID=$(jq .ChangeSetId -r "${CHANGE_SET_PATH}")

  echo "[${STACK_NAME}] executing changeset [${CHANGE_SET_ID}]..."
  aws cloudformation execute-change-set \
    --change-set-name "${CHANGE_SET_ID}"

  npx cfn-event-tailer "${STACK_NAME}"
fi

echo "[${STACK_NAME}] stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query "sort_by(Stacks[0].Outputs, &OutputKey)[].[OutputKey, OutputValue]" \
  --output text | column -t -s $'\t' | sed 's/^/  /'
