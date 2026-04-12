"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickRemoteSource = pickRemoteSource;
exports.getRemoteSourceActions = getRemoteSourceActions;
const git_base_1 = require("./git-base");
async function pickRemoteSource(options = {}) {
    return git_base_1.GitBaseApi.getAPI().pickRemoteSource(options);
}
async function getRemoteSourceActions(url) {
    return git_base_1.GitBaseApi.getAPI().getRemoteSourceActions(url);
}
//# sourceMappingURL=remoteSource.js.map