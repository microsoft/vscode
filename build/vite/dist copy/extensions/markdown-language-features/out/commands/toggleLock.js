"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ToggleLockCommand = void 0;
class ToggleLockCommand {
    id = 'markdown.preview.toggleLock';
    #previewManager;
    constructor(previewManager) {
        this.#previewManager = previewManager;
    }
    execute() {
        this.#previewManager.toggleLock();
    }
}
exports.ToggleLockCommand = ToggleLockCommand;
//# sourceMappingURL=toggleLock.js.map