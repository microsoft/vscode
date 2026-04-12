"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshPreviewCommand = void 0;
class RefreshPreviewCommand {
    id = 'markdown.preview.refresh';
    #webviewManager;
    #engine;
    constructor(webviewManager, engine) {
        this.#webviewManager = webviewManager;
        this.#engine = engine;
    }
    execute() {
        this.#engine.cleanCache();
        this.#webviewManager.refresh();
    }
}
exports.RefreshPreviewCommand = RefreshPreviewCommand;
//# sourceMappingURL=refreshPreview.js.map