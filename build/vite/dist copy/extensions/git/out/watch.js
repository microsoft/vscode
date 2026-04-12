"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.watch = watch;
const vscode_1 = require("vscode");
const util_1 = require("./util");
function watch(location) {
    const watcher = vscode_1.workspace.createFileSystemWatcher(new vscode_1.RelativePattern(location, '*'));
    return new class {
        event = (0, util_1.anyEvent)(watcher.onDidCreate, watcher.onDidChange, watcher.onDidDelete);
        dispose() {
            watcher.dispose();
        }
    };
}
//# sourceMappingURL=watch.js.map