"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.printTitle = printTitle;
exports.sign = sign;
const zx_1 = require("zx");
function printTitle(title) {
    console.log('\n');
    console.log('#'.repeat(65));
    console.log(`# ${title.padEnd(61)} #`);
    console.log('#'.repeat(65));
    console.log('\n');
}
function sign(esrpDLLPath, type, folder, glob) {
    return (0, zx_1.$) `node build/azure-pipelines/common/sign ${esrpDLLPath} ${type} ${folder} '${glob}'`;
}
//# sourceMappingURL=codesign.js.map