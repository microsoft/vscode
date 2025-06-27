"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const codesign_1 = require("../common/codesign");
const publish_1 = require("../common/publish");
async function main() {
    const arch = (0, publish_1.e)('VSCODE_ARCH');
    const esrpCliDLLPath = (0, publish_1.e)('EsrpCliDllPath');
    const pipelineWorkspace = (0, publish_1.e)('PIPELINE_WORKSPACE');
    const folder = `${pipelineWorkspace}/unsigned_vscode_client_darwin_${arch}_archive`;
    const glob = `VSCode-darwin-${arch}.zip`;
    // Codesign
    (0, codesign_1.printBanner)('Codesign');
    const codeSignTask = (0, codesign_1.spawnCodesignProcess)(esrpCliDLLPath, 'sign-darwin', folder, glob);
    await (0, codesign_1.streamProcessOutputAndCheckResult)('Codesign', codeSignTask);
    // Notarize
    (0, codesign_1.printBanner)('Notarize');
    const notarizeTask = (0, codesign_1.spawnCodesignProcess)(esrpCliDLLPath, 'notarize-darwin', folder, glob);
    await (0, codesign_1.streamProcessOutputAndCheckResult)('Notarize', notarizeTask);
}
main().then(() => {
    process.exit(0);
}, err => {
    console.error(`ERROR: ${err}`);
    process.exit(1);
});
//# sourceMappingURL=codesign.js.map