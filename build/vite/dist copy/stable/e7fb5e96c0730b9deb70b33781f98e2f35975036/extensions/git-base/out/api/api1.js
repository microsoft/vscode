"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiImpl = void 0;
exports.registerAPICommands = registerAPICommands;
const vscode_1 = require("vscode");
const remoteSource_1 = require("../remoteSource");
class ApiImpl {
    _model;
    constructor(_model) {
        this._model = _model;
    }
    pickRemoteSource(options) {
        return (0, remoteSource_1.pickRemoteSource)(this._model, options);
    }
    getRemoteSourceActions(url) {
        return (0, remoteSource_1.getRemoteSourceActions)(this._model, url);
    }
    registerRemoteSourceProvider(provider) {
        return this._model.registerRemoteSourceProvider(provider);
    }
}
exports.ApiImpl = ApiImpl;
function registerAPICommands(extension) {
    const disposables = [];
    disposables.push(vscode_1.commands.registerCommand('git-base.api.getRemoteSources', (opts) => {
        if (!extension.model || !opts) {
            return;
        }
        return (0, remoteSource_1.pickRemoteSource)(extension.model, opts);
    }));
    return vscode_1.Disposable.from(...disposables);
}
//# sourceMappingURL=api1.js.map