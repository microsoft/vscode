#!/usr/bin/env bash
set -e

echo "Installing remote dependencies"
(cd remote && yarn remove keytar && yarn)

echo "Installing distro remote dependencies"
node build/azure-pipelines/common/installDistroDependencies.js remote
