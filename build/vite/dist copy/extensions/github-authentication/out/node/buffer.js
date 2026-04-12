"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.base64Encode = base64Encode;
function base64Encode(text) {
    return Buffer.from(text, 'binary').toString('base64');
}
//# sourceMappingURL=buffer.js.map