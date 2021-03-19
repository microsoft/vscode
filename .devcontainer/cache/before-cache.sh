#!/bin/bash

# This file establishes a basline for the reposuitory before any steps in the "prepare.sh"
# are run. Its just a find command that filters out a few things we don't need to watch.

set -e

SCRIPT_PATH="$(cd "$(dirname $0)" && pwd)"
SOURCE_FOLDER="${1:-"."}"

cd "${SOURCE_FOLDER}"
echo "[$(date)] Generating ""before"" manifest..."
find -L . -not -path "*/.git/*" -and -not -path "${SCRIPT_PATH}/*.manifest" -type f >  "${SCRIPT_PATH}/before.manifest"
echo "[$(date)] Done!"

