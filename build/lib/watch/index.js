"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = default_1;
const watch = process.platform === 'win32' ? require('./watch-win32') : require('vscode-gulp-watch');
function default_1(...args) {
    return watch.apply(null, args);
}
//# sourceMappingURL=index.js.map