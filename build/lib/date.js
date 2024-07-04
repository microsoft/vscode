"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.date = void 0;
let dateObj;
if (process.env.VSCODE_BUILD_DATE) {
    dateObj = new Date(process.env.VSCODE_BUILD_DATE);
}
else {
    dateObj = new Date();
}
/**
 * If running in Azure CI, will return the date the build was started.
 * Falls back to current date otherwise.
 */
exports.date = dateObj;
//# sourceMappingURL=date.js.map