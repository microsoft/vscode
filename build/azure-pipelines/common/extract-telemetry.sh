#!/usr/bin/env bash
set -e

cd $BUILD_STAGINGDIRECTORY
git clone https://github.com/microsoft/vscode-telemetry-extractor.git
cd vscode-telemetry-extractor
git checkout 4e64f3de30f8fccb58ebdc0d85c4861a135d46cf
npm i
npm run compile
cd src
mkdir telemetry-sources
cd telemetry-sources
git clone --depth 1 https://github.com/Microsoft/vscode-extension-telemetry.git
git clone --depth 1 https://github.com/Microsoft/vscode-chrome-debug-core.git
git clone --depth 1 https://github.com/Microsoft/vscode-chrome-debug.git
git clone --depth 1 https://github.com/Microsoft/vscode-node-debug2.git
git clone --depth 1 https://github.com/Microsoft/vscode-node-debug.git
git clone --depth 1 https://github.com/Microsoft/vscode-docker.git
git clone --depth 1 https://github.com/Microsoft/vscode-go.git
git clone --depth 1 https://github.com/Microsoft/vscode-azure-account.git
git clone --depth 1 https://github.com/Microsoft/vscode-html-languageservice.git
git clone --depth 1 https://github.com/Microsoft/vscode-json-languageservice.git
git clone --depth 1 https://github.com/Microsoft/vscode-mono-debug.git
git clone --depth 1 https://github.com/Microsoft/TypeScript.git
cd ../../
node ./out/cli-extract.js --sourceDir $BUILD_SOURCESDIRECTORY --excludedDirPattern extensions  --outputDir . --applyEndpoints --includeIsMeasurement
node ./out/cli-extract-extensions.js --sourceDir ./src/telemetry-sources --outputDir . --applyEndpoints --includeIsMeasurement
mkdir -p $BUILD_SOURCESDIRECTORY/.build/telemetry
mv declarations-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-core.json
mv declarations-extensions-resolved.json $BUILD_SOURCESDIRECTORY/.build/telemetry/telemetry-extensions.json