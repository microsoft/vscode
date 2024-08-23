"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.setAMD = setAMD;
exports.isAMD = isAMD;
const path = require("path");
const fs = require("fs");
// TODO@esm remove this
const outDirectory = path.join(__dirname, '..', '..', 'out-build');
const amdMarkerFile = path.join(outDirectory, 'amd');
function setAMD(enabled) {
    const result = () => new Promise((resolve, _) => {
        if (enabled) {
            fs.mkdirSync(outDirectory, { recursive: true });
            fs.writeFileSync(amdMarkerFile, 'true', 'utf8');
            console.warn(`Setting build to AMD: true`);
        }
        else {
            console.warn(`Setting build to AMD: false`);
        }
        resolve();
    });
    result.taskName = 'set-amd';
    return result;
}
function isAMD(logWarning) {
    try {
        const res = (typeof process.env.VSCODE_BUILD_AMD === 'string' && process.env.VSCODE_BUILD_AMD.toLowerCase() === 'true') || (fs.readFileSync(amdMarkerFile, 'utf8') === 'true');
        if (res && logWarning) {
            console.warn(`[amd] ${logWarning}`);
        }
        return res;
    }
    catch (error) {
        return false;
    }
}
//# sourceMappingURL=amd.js.map