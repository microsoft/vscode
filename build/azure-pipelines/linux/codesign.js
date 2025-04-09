"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
const esrpCliDLLPath = process.env['EsrpCliDllPath'];
function printBanner(title) {
    title = `${title} (${new Date().toISOString()})`;
    console.log('\n\n');
    console.log('#'.repeat(75));
    console.log(`# ${title.padEnd(71)} #`);
    console.log('#'.repeat(75));
    console.log('\n\n');
}
function sign(type, folder, glob) {
    console.log('Signing request:');
    console.log(`  * Type: ${type}`);
    console.log(`  * Folder: ${folder}`);
    console.log(`  * Glob: ${glob}`);
    console.log(`  * ESRP CLI DLL Path: ${esrpCliDLLPath}`);
    console.log('----------------------------------------');
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} ${glob}`;
}
async function main() {
    // Start the code sign processes in parallel
    // 1. Codesign deb package
    // 2. Codesign rpm package
    const codesignTask1 = sign('sign-pgp', '.build/linux/deb', '*.deb');
    // const codesignTask2 = sign('sign-pgp', '.build/linux/rpm', '*.rpm');
    // Codesign deb package
    printBanner('Codesign deb package');
    await codesignTask1.pipe(process.stdout);
    // Codesign rpm package
    // printBanner('Codesign rpm package');
    // await codesignTask2.pipe(process.stdout);
}
main();
//# sourceMappingURL=codesign.js.map