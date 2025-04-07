"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const zx_1 = require("zx");
function printBanner(title) {
    console.log('#'.repeat(65));
    console.log(`# ${title.padEnd(61)} #`);
    console.log('#'.repeat(65));
}
function sign(folder, glob) {
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${process.env['AGENT_ROOTDIRECTORY']}/_tasks/EsrpCodeSigning_*/*/net6.0/esrpcli.dll sign-pgp ${folder} '${glob}'`;
}
async function main() {
    const codesignTasks = [
        {
            banner: 'Codesign Debian package',
            processPromise: sign('.build/linux/deb', '*.deb')
        },
        {
            banner: 'Codesign RPM package',
            processPromise: sign('.build/linux/rpm', '*.rpm')
        }
    ];
    // Wait for processes to finish and stream their output
    for (const { banner, processPromise } of codesignTasks) {
        printBanner(banner);
        await processPromise.pipe(process.stdout);
    }
}
main();
//# sourceMappingURL=codesign.js.map