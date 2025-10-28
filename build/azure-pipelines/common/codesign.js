"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.printBanner = printBanner;
exports.streamProcessOutputAndCheckResult = streamProcessOutputAndCheckResult;
exports.spawnCodesignProcess = spawnCodesignProcess;
const zx_1 = require("zx");
function printBanner(title) {
    title = `${title} (${new Date().toISOString()})`;
    console.log('\n');
    console.log('#'.repeat(75));
    console.log(`# ${title.padEnd(71)} #`);
    console.log('#'.repeat(75));
    console.log('\n');
}
async function streamProcessOutputAndCheckResult(name, promise) {
    const result = await promise.pipe(process.stdout);
    if (result.ok) {
        console.log(`\n${name} completed successfully. Duration: ${result.duration} ms`);
        return;
    }
    throw new Error(`${name} failed: ${result.stderr}`);
}
function spawnCodesignProcess(esrpCliDLLPath, type, folder, glob) {
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
}
//# sourceMappingURL=codesign.js.map