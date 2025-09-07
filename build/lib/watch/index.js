"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
const watch = process.platform === 'win32' ? require('./watch-win32') : require('vscode-gulp-watch');
module.exports = function () {
    return watch.apply(null, arguments);
};
//# sourceMappingURL=index.js.map