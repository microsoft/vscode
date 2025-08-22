"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const publish_1 = require("./publish");
const retry_1 = require("./retry");
async function getPipelineArtifacts() {
    const result = await (0, publish_1.requestAZDOAPI)('artifacts');
    return result.value.filter(a => !/sbom$/.test(a.name));
}
async function main([variableName, artifactName]) {
    if (!variableName || !artifactName) {
        throw new Error(`Usage: node checkForArtifact.js <variableName> <artifactName>`);
    }
    try {
        const artifacts = await (0, retry_1.retry)(() => getPipelineArtifacts());
        const artifact = artifacts.find(a => a.name === artifactName);
        console.log(`##vso[task.setvariable variable=${variableName}]${artifact ? 'true' : 'false'}`);
    }
    catch (err) {
        console.error(`ERROR: Failed to get pipeline artifacts: ${err}`);
        console.log(`##vso[task.setvariable variable=${variableName}]false`);
    }
}
main(process.argv.slice(2))
    .then(() => {
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=checkForArtifact.js.map