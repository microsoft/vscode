"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleBrowserManager = void 0;
const simpleBrowserView_1 = require("./simpleBrowserView");
class SimpleBrowserManager {
    extensionUri;
    _activeView;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    dispose() {
        this._activeView?.dispose();
        this._activeView = undefined;
    }
    show(inputUri, options) {
        const url = typeof inputUri === 'string' ? inputUri : inputUri.toString(true);
        if (this._activeView) {
            this._activeView.show(url, options);
        }
        else {
            const view = simpleBrowserView_1.SimpleBrowserView.create(this.extensionUri, url, options);
            this.registerWebviewListeners(view);
            this._activeView = view;
        }
    }
    restore(panel, state) {
        const url = state?.url ?? '';
        const view = simpleBrowserView_1.SimpleBrowserView.restore(this.extensionUri, url, panel);
        this.registerWebviewListeners(view);
        this._activeView ??= view;
    }
    registerWebviewListeners(view) {
        view.onDispose(() => {
            if (this._activeView === view) {
                this._activeView = undefined;
            }
        });
    }
}
exports.SimpleBrowserManager = SimpleBrowserManager;
//# sourceMappingURL=simpleBrowserManager.js.map