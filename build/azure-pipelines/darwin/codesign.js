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
function sign(type, folder, glob) {
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpCliDLLPath} ${type} ${folder} '${glob}'`;
}
async function main() {
    (0, zx_1.useBash)();
    const folder = `${pipelineWorkspace}/unsigned_vscode_client_darwin_${arch}_archive`;
    const glob = `VSCode-darwin-${arch}.zip`;
    // Codesign
    const codeSignTask = sign('sign-darwin', folder, glob);
    printBanner('Codesign');
    const codeSignTaskResult = await codeSignTask.pipe(process.stdout);
    if (!codeSignTaskResult.ok) {
        throw new Error(`Codesign failed: ${codeSignTaskResult.stderr}`);
    }
    // Notarize
    const notarizeTask = sign('notarize-darwin', folder, glob);
    printBanner('Notarize');
    const notarizeTaskResult = await notarizeTask.pipe(process.stdout);
    if (!notarizeTaskResult.ok) {
        throw new Error(`Notarize failed: ${notarizeTaskResult.stderr}`);
    }
}
main().then(() => {
    process.exit(0);
}, err => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=codesign.js.map