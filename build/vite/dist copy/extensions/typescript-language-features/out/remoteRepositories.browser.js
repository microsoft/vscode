"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
const vscode_1 = require("vscode");
var RemoteRepositories;
(function (RemoteRepositories) {
    let remoteHub;
    function getRemoteExtension() {
        if (remoteHub !== undefined) {
            return remoteHub;
        }
        remoteHub = vscode_1.extensions.getExtension('ms-vscode.remote-repositories')
            ?? vscode_1.extensions.getExtension('GitHub.remoteHub')
            ?? vscode_1.extensions.getExtension('GitHub.remoteHub-insiders');
        if (remoteHub === undefined) {
            throw new Error(`No Remote repository extension found.`);
        }
        return remoteHub;
    }
    function getApi() {
        return getRemoteExtension().activate();
    }
    RemoteRepositories.getApi = getApi;
})(RemoteRepositories || (RemoteRepositories = {}));
exports.default = RemoteRepositories;
//# sourceMappingURL=remoteRepositories.browser.js.map