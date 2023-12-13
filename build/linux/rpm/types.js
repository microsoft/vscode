"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRpmArchString = void 0;
function isRpmArchString(s) {
    return ['x86_64', 'armv7hl', 'aarch64'].includes(s);
}
exports.isRpmArchString = isRpmArchString;
//# sourceMappingURL=types.js.map