"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Schemes = void 0;
exports.isOfScheme = isOfScheme;
exports.Schemes = Object.freeze({
    http: 'http',
    https: 'https',
    file: 'file',
    untitled: 'untitled',
    mailto: 'mailto',
    vscode: 'vscode',
    'vscode-insiders': 'vscode-insiders',
    notebookCell: 'vscode-notebook-cell',
});
function isOfScheme(scheme, link) {
    return link.toLowerCase().startsWith(scheme + ':');
}
//# sourceMappingURL=schemes.js.map