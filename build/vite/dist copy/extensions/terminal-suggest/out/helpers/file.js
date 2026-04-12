"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeAnyFileExtension = removeAnyFileExtension;
function removeAnyFileExtension(label) {
    return label.replace(/\.[a-zA-Z0-9!#\$%&'\(\)\-@\^_`{}~\+,;=\[\]]+$/, '');
}
//# sourceMappingURL=file.js.map