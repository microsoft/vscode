"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const ipcClient_1 = require("./ipc/ipcClient");
function fatal(err) {
    console.error(err);
    process.exit(1);
}
function main(argv) {
    const ipcClient = new ipcClient_1.IPCClient('git-editor');
    const commitMessagePath = argv[argv.length - 1];
    ipcClient.call({ commitMessagePath }).then(() => {
        setTimeout(() => process.exit(0), 0);
    }).catch(err => fatal(err));
}
main(process.argv);
//# sourceMappingURL=git-editor-main.js.map