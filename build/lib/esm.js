"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.setESM = setESM;
exports.isESM = isESM;
const path = require("path");
const fs = require("fs");
// TODO@esm remove this
const outDirectory = path.join(__dirname, '..', '..', 'out-build');
const esmMarkerFile = path.join(outDirectory, 'esm');
function setESM(enabled) {
    const result = () => new Promise((resolve, _) => {
        if (enabled) {
            fs.mkdirSync(outDirectory, { recursive: true });
            fs.writeFileSync(esmMarkerFile, 'true', 'utf8');
            console.warn(`Setting build to ESM: true`);
        }
        else {
            console.warn(`Setting build to ESM: false`);
        }
        resolve();
    });
    result.taskName = 'set-esm';
    return result;
}
function isESM(logWarning) {
    try {
        const res = (typeof process.env.VSCODE_BUILD_ESM === 'string' && process.env.VSCODE_BUILD_ESM.toLowerCase() === 'true') || (fs.readFileSync(esmMarkerFile, 'utf8') === 'true');
        if (res && logWarning) {
            console.warn(`[esm] ${logWarning}`);
        }
        return res;
    }
    catch (error) {
        return false;
    }
}
//# sourceMappingURL=esm.js.map