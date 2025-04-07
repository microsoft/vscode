"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const codesign_js_1 = require("../common/codesign.js");
async function main() {
    const esrpDLLPath = `${process.env['AGENT_ROOTDIRECTORY']}/_tasks/EsrpCodeSigning_*/*/net6.0/esrpcli.dll`;
    const codesignTasks = [
        {
            title: 'Codesign Debian package',
            processPromise: (0, codesign_js_1.sign)(esrpDLLPath, 'sign-pgp', '.build/linux/deb', '*.deb')
        },
        {
            title: 'Codesign RPM package',
            processPromise: (0, codesign_js_1.sign)(esrpDLLPath, 'sign-pgp', '.build/linux/rpm', '*.rpm')
        }
    ];
    // Wait for processes to finish and stream their output
    for (const { title, processPromise } of codesignTasks) {
        (0, codesign_js_1.printTitle)(title);
        await processPromise.pipe(process.stdout);
    }
}
main();
//# sourceMappingURL=codesign.js.map