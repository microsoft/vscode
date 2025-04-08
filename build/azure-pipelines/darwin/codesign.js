"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
const arch = process.env['VSCODE_ARCH'];
const esrpCliDLLPath = process.env['EsrpCliDllPath'];
const pipelineWorkspace = process.env['PIPELINE_WORKSPACE'];
function printBanner(title) {
    title = `${title} (${new Date().toISOString()})`;
    console.log('\n\n');
    console.log('#'.repeat(75));
    console.log(`# ${title.padEnd(71)} #`);
    console.log('#'.repeat(75));
    console.log('\n\n');
}
async function handleProcessPromise(name, promise) {
    const result = await promise.pipe(process.stdout);
    if (!result.ok) {
        throw new Error(`${name} failed: ${result.stderr}`);
    }
}
function sign(type, folder, glob) {
    console.log('Sign request:');
    console.log(`  ESRP CLI DLL Path: ${esrpCliDLLPath}`);
    console.log(`  Type: ${type}`);
    console.log(`  Folder: ${folder}`);
    console.log(`  Glob: ${glob}`);
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} '${glob}'`;
}
async function main() {
    (0, zx_1.usePwsh)();
    const folder = `${pipelineWorkspace}/unsigned_vscode_client_darwin_${arch}_archive`;
    const glob = `VSCode-darwin-${arch}.zip`;
    // Codesign
    printBanner('Codesign');
    const codeSignTask = sign('sign-darwin', folder, glob);
    await handleProcessPromise('Codesign', codeSignTask);
    // Notarize
    printBanner('Notarize');
    const notarizeTask = sign('notarize-darwin', folder, glob);
    await handleProcessPromise('Notarize', notarizeTask);
}
main().then(() => {
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=codesign.js.map