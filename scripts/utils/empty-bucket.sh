#!/usr/bin/env bash

set -euo pipefail

usage() {
  echo "usage: empty-bucket.sh <bucket-name>"
  exit 1
}

BUCKET_NAME=${1:-}
if [[ -z "${BUCKET_NAME}" ]]; then
  usage
fi

echo "[${BUCKET_NAME}] deleting every object version..."
while true; do
  OBJECTS=$(aws s3api list-object-versions \
    --bucket "${BUCKET_NAME}" \
    --max-items 1000 \
    --output json |
    jq -c '{Objects: ([.Versions[]?, .DeleteMarkers[]?] | map({Key, VersionId})), Quiet: true}')
  if [[ $(jq '.Objects | length' <<<"${OBJECTS}") -eq 0 ]]; then
    break
  fi
  aws s3api delete-objects --bucket "${BUCKET_NAME}" --delete "${OBJECTS}" >/dev/null
done
