"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVersion = void 0;
const git = require("./git");
function getVersion(root) {
    let version = process.env['VSCODE_DISTRO_COMMIT'] || process.env['BUILD_SOURCEVERSION'];
    if (!version || !/^[0-9a-f]{40}$/i.test(version.trim())) {
        version = git.getVersion(root);
    }
    return version;
}
exports.getVersion = getVersion;
