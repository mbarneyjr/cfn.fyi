#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: plan.sh <environment-name> <infra-component>"
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

# Convert infra component name to uppercase for environment variable lookup
COMPONENT_ENV_VAR_NAME="$(echo "${INFRA_COMPONENT}" | tr '[:lower:]' '[:upper:]')_ENVIRONMENT_NAME"
COMPONENT_ENV_VALUE="${!COMPONENT_ENV_VAR_NAME:-${ENVIRONMENT_NAME}}"
if [[ "${COMPONENT_ENV_VALUE}" != "${ENVIRONMENT_NAME}" ]]; then
  echo "[${STACK_NAME}] skipping plan, not configured to deploy ${INFRA_COMPONENT}"
  exit 0
fi

CHANGE_SET_PATH="artifacts/changesets/${ENVIRONMENT_NAME}-${INFRA_COMPONENT}.changeset.json"

mkdir -p artifacts/changesets
rm -rf "${CHANGE_SET_PATH}"

if [[ ! -d "infra/${INFRA_COMPONENT}" ]]; then
  echo "[${STACK_NAME}] infra/${INFRA_COMPONENT} does not exist"
  exit 1
fi

# shellcheck disable=SC1090
[[ -f infra/${INFRA_COMPONENT}/.env ]] && source "infra/${INFRA_COMPONENT}/.env"
# shellcheck disable=SC1090
[[ -f infra/${INFRA_COMPONENT}/.env.${ENVIRONMENT_NAME} ]] && source "infra/${INFRA_COMPONENT}/.env.${ENVIRONMENT_NAME}"

CHANGE_SET_NAME=$(whoami)-$(date -u +"%Y%m%d%H%M%SZ")
TEMPLATE_FILE="${INFRA_COMPONENT}.yml"
# shellcheck disable=SC2034
CFN_TAG_StackName="${STACK_NAME}"

# handle parameters and tags
paramarray=()
tagarray=()
while IFS='=' read -r k v; do [[ "$k" == CFN_PARAM_* ]] && paramarray+=("ParameterKey=${k#CFN_PARAM_},ParameterValue=\"${v}\""); done < <(set | grep CFN_PARAM | sed 's/__/-/g')
while IFS='=' read -r k v; do [[ "$k" == CFN_TAG_* ]] && tagarray+=("Key=${k#CFN_TAG_},Value=${v}"); done < <(set | grep CFN_TAG | sed 's/__/-/g')

# create change set
pushd "infra/${INFRA_COMPONENT}" >/dev/null
echo "[${STACK_NAME}] packaging template for ${INFRA_COMPONENT}..."
PACKAGED_TEMPLATE_FILE="${PWD}/../../artifacts/${ENVIRONMENT_NAME}-${INFRA_COMPONENT}.packaged.yml"
aws cloudformation package \
  --template-file "${TEMPLATE_FILE}" \
  --s3-bucket "${ARTIFACT_BUCKET}" \
  --s3-prefix "mutable/${STACK_NAME}" \
  --output-template-file "${PACKAGED_TEMPLATE_FILE}" >/dev/null
STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query Stacks[0].StackStatus \
  --output text 2>/dev/null || echo "NO_STACK")
if [[ "${STACK_STATUS}" == "ROLLBACK_COMPLETE" ]]; then
  echo "[${STACK_NAME}] deleting stack in ROLLBACK_COMPLETE..."
  aws cloudformation delete-stack --stack-name "${STACK_NAME}"
  aws cloudformation wait stack-delete-complete --stack-name "${STACK_NAME}"
  STACK_STATUS=NO_STACK
fi
CHANGE_SET_TYPE=$(echo "NO_STACK,REVIEW_IN_PROGRESS" | grep -w -q "${STACK_STATUS}" && echo "CREATE" || echo "UPDATE")
echo "[${STACK_NAME}] creating changeset of type ${CHANGE_SET_TYPE} [${CHANGE_SET_NAME}]..."
aws cloudformation create-change-set \
  --template-body "file://${PACKAGED_TEMPLATE_FILE}" \
  --stack-name "${STACK_NAME}" \
  --capabilities CAPABILITY_NAMED_IAM CAPABILITY_AUTO_EXPAND \
  --change-set-name "${CHANGE_SET_NAME}" \
  --change-set-type "${CHANGE_SET_TYPE}" \
  "${paramarray[@]+--parameters}" "${paramarray[@]+"${paramarray[@]}"}" \
  "${tagarray[@]+--tags}" "${tagarray[@]+"${tagarray[@]}"}" \
  --import-existing-resources \
  --include-nested-stacks >/dev/null
popd >/dev/null

# wait for it to be created
CHANGE_SET_STATUS=None
while [[ "$CHANGE_SET_STATUS" != "CREATE_COMPLETE" && "$CHANGE_SET_STATUS" != "FAILED" ]]; do
  CHANGE_SET_STATUS=$(aws cloudformation describe-change-set \
    --stack-name "${STACK_NAME}" \
    --change-set-name "${CHANGE_SET_NAME}" \
    --output text \
    --query 'Status')
done
#
# save changeset
aws cloudformation describe-change-set \
  --stack-name "${STACK_NAME}" \
  --change-set-name "${CHANGE_SET_NAME}" >"${CHANGE_SET_PATH}"

# verify status
if [[ "$CHANGE_SET_STATUS" == "FAILED" ]]; then
  CHANGE_SET_STATUS_REASON=$(aws cloudformation describe-change-set \
    --stack-name "${STACK_NAME}" \
    --change-set-name "${CHANGE_SET_NAME}" \
    --output text \
    --query 'StatusReason')
  if [[ "$CHANGE_SET_STATUS_REASON" == "The submitted information didn't contain changes. Submit different information to create a change set." ]]; then
    echo "[${STACK_NAME}] changeset contains no changes"
    exit 0
  elif [[ "$CHANGE_SET_STATUS_REASON" == "No updates are to be performed." ]]; then
    echo "[${STACK_NAME}] changeset contains no changes"
    exit 0
  else
    echo "[${STACK_NAME}] change set failed to create"
    echo "[${STACK_NAME}] $CHANGE_SET_STATUS_REASON"
    exit 1
  fi
fi

# pretty-print change set
echo "[${STACK_NAME}] change set ${CHANGE_SET_NAME} created"
npx cfn-changeset-viewer \
  --stack-name "${STACK_NAME}" \
  --change-set-name "${CHANGE_SET_NAME}"
