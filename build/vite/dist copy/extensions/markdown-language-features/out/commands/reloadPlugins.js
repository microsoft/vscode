"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReloadPlugins = void 0;
class ReloadPlugins {
    id = 'markdown.api.reloadPlugins';
    #webviewManager;
    #engine;
    constructor(webviewManager, engine) {
        this.#webviewManager = webviewManager;
        this.#engine = engine;
    }
    execute() {
        this.#engine.reloadPlugins();
        this.#engine.cleanCache();
        this.#webviewManager.refresh();
    }
}
exports.ReloadPlugins = ReloadPlugins;
//# sourceMappingURL=reloadPlugins.js.map