"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitBaseApi = void 0;
const vscode_1 = require("vscode");
class GitBaseApi {
    static _gitBaseApi;
    static getAPI() {
        if (!this._gitBaseApi) {
            const gitBaseExtension = vscode_1.extensions.getExtension('vscode.git-base').exports;
            const onDidChangeGitBaseExtensionEnablement = (enabled) => {
                this._gitBaseApi = enabled ? gitBaseExtension.getAPI(1) : undefined;
            };
            gitBaseExtension.onDidChangeEnablement(onDidChangeGitBaseExtensionEnablement);
            onDidChangeGitBaseExtensionEnablement(gitBaseExtension.enabled);
            if (!this._gitBaseApi) {
                throw new Error('vscode.git-base extension is not enabled.');
            }
        }
        return this._gitBaseApi;
    }
}
exports.GitBaseApi = GitBaseApi;
//# sourceMappingURL=git-base.js.map