#!/usr/bin/env bash

set -euo pipefail

ENVIRONMENT_NAME=${1:-}
if [[ -z "${ENVIRONMENT_NAME}" ]]; then
  echo "usage: load-config.sh <environment-name>"
  exit 1
fi

# load environment
set -a
# shellcheck disable=SC1091
[[ -f infra/.env ]] && source infra/.env
# shellcheck disable=SC1090
[[ -f infra/.env.${ENVIRONMENT_NAME} ]] && source "infra/.env.${ENVIRONMENT_NAME}"
set +a
