"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.areUrisEqual = areUrisEqual;
function areUrisEqual(uri1, uri2) {
    if (uri1.scheme !== uri2.scheme) {
        return false;
    }
    if (uri1.authority !== uri2.authority) {
        return false;
    }
    if (uri1.scheme === 'file') {
        if (process.platform === 'win32' || process.platform === 'darwin') {
            return uri1.fsPath.toLowerCase() === uri2.fsPath.toLowerCase();
        }
        return uri1.fsPath === uri2.fsPath;
    }
    return uri1.toString() === uri2.toString();
}
//# sourceMappingURL=resources.js.map