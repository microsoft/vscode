#!/usr/bin/env bash
set -e

cd $BUILD_STAGINGDIRECTORY
git clone https://github.com/microsoft/vscode-telemetry-extractor.git
cd vscode-telemetry-extractor
git checkout e749ea9c4c5d529a8cae36d14b6b972057a8d850
npm i
npm run setup-extension-repos
node ./out/cli-extract.js --sourceDir $BUILD_SOURCESDIRECTORY --excludedDirPattern extensions  --outputDir . --applyEndpoints --includeIsMeasurement --patchWebsiteEvents
node ./out/cli-extract-extensions.js --sourceDir ./src/telemetry-sources --outputDir . --applyEndpoints --includeIsMeasurement
mkdir -p $BUILD_SOURCESDIRECTORY/.build/telemetry
mv declarations-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-core.json
mv declarations-extensions-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-extensions.json