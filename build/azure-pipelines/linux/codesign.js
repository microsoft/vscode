"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
const publish_1 = require("../common/publish");
function printBanner(title) {
    title = `${title} (${new Date().toISOString()})`;
    console.log('\n');
    console.log('#'.repeat(75));
    console.log(`# ${title.padEnd(71)} #`);
    console.log('#'.repeat(75));
    console.log('\n');
}
async function handleProcessPromise(name, promise) {
    const result = await promise.pipe(process.stdout);
    if (!result.ok) {
        throw new Error(`${name} failed: ${result.stderr}`);
    }
}
function sign(esrpCliDLLPath, type, folder, glob) {
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
}
async function main() {
    const esrpCliDLLPath = (0, publish_1.e)('EsrpCliDllPath');
    // Start the code sign processes in parallel
    // 1. Codesign deb package
    // 2. Codesign rpm package
    const codesignTask1 = sign(esrpCliDLLPath, 'sign-pgp', '.build/linux/deb', '*.deb');
    const codesignTask2 = sign(esrpCliDLLPath, 'sign-pgp', '.build/linux/rpm', '*.rpm');
    // Codesign deb package
    printBanner('Codesign deb package');
    await handleProcessPromise('Codesign deb package', codesignTask1);
    // Codesign rpm package
    printBanner('Codesign rpm package');
    await handleProcessPromise('Codesign rpm package', codesignTask2);
}
main().then(() => {
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=codesign.js.map