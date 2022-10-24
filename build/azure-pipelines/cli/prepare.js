"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const getVersion_1 = require("../../lib/getVersion");
const fs = require("fs");
const path = require("path");
const packageJson = require("../../../package.json");
const root = path.dirname(path.dirname(path.dirname(__dirname)));
const readJSON = (path) => JSON.parse(fs.readFileSync(path, 'utf8'));
let productJsonPath;
const isOSS = process.env.VSCODE_QUALITY === 'oss' || !process.env.VSCODE_QUALITY;
if (isOSS) {
    productJsonPath = path.join(root, 'product.json');
}
else {
    productJsonPath = path.join(root, 'quality', process.env.VSCODE_QUALITY, 'product.json');
}
console.log('Loading product.json from', productJsonPath);
const product = readJSON(productJsonPath);
const allProductsAndQualities = isOSS ? [product] : fs.readdirSync(path.join(root, 'quality'))
    .map(quality => ({ quality, json: readJSON(path.join(root, 'quality', quality, 'product.json')) }));
const commit = (0, getVersion_1.getVersion)(root);
const makeQualityMap = (m) => {
    const output = {};
    for (const { quality, json } of allProductsAndQualities) {
        output[quality] = m(json, quality);
    }
    return output;
};
/**
 * Sets build environment variables for the CLI for current contextual info.
 */
const setLauncherEnvironmentVars = () => {
    const vars = new Map([
        ['VSCODE_CLI_REMOTE_LICENSE_TEXT', product.serverLicense?.join('\\n')],
        ['VSCODE_CLI_REMOTE_LICENSE_PROMPT', product.serverLicensePrompt],
        ['VSCODE_CLI_AI_KEY', product.aiConfig?.cliKey],
        ['VSCODE_CLI_AI_ENDPOINT', product.aiConfig?.cliEndpoint],
        ['VSCODE_CLI_VERSION', packageJson.version],
        ['VSCODE_CLI_UPDATE_ENDPOINT', product.updateUrl],
        ['VSCODE_CLI_QUALITY', product.quality],
        ['VSCODE_CLI_COMMIT', commit],
        [
            'VSCODE_CLI_WIN32_APP_IDS',
            !isOSS && JSON.stringify(makeQualityMap(json => Object.entries(json)
                .filter(([key]) => /^win32.*AppId$/.test(key))
                .map(([, value]) => String(value).replace(/[{}]/g, '')))),
        ],
        [
            'VSCODE_CLI_QUALITY_DOWNLOAD_URIS',
            !isOSS && JSON.stringify(makeQualityMap(json => json.downloadUrl)),
        ],
    ]);
    console.log(JSON.stringify([...vars].reduce((obj, kv) => ({ ...obj, [kv[0]]: kv[1] }), {})));
    for (const [key, value] of vars) {
        if (value) {
            console.log(`##vso[task.setvariable variable=${key}]${value}`);
        }
    }
};
if (require.main === module) {
    setLauncherEnvironmentVars();
}
