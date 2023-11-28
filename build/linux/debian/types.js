"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDebianArchString = void 0;
function isDebianArchString(s) {
    return ['amd64', 'armhf', 'arm64'].includes(s);
}
exports.isDebianArchString = isDebianArchString;
//# sourceMappingURL=types.js.map