"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.Navigation = void 0;
const vscode = require("vscode");
const utils_1 = require("./utils");
class Navigation {
    constructor(_view) {
        this._view = _view;
        this._disposables = [];
        this._ctxCanNavigate = new utils_1.ContextKey('references-view.canNavigate');
        this._disposables.push(vscode.commands.registerCommand('references-view.next', () => this.next(false)), vscode.commands.registerCommand('references-view.prev', () => this.previous(false)), _view.onDidChangeSelection(() => this._ensureSelectedElementIsVisible()));
    }
    dispose() {
        vscode.Disposable.from(...this._disposables).dispose();
    }
    update(delegate) {
        this._delegate = delegate;
        this._ctxCanNavigate.set(Boolean(this._delegate));
    }
    _ensureSelectedElementIsVisible() {
        if (this._view.selection.length === 0) {
            return;
        }
        const [item] = this._view.selection;
        const location = this._delegate?.location(item);
        if (!location) {
            return;
        }
        if (vscode.window.activeTextEditor?.document.uri.toString() !== location.uri.toString()) {
            this._open(location, true);
        }
    }
    _anchor() {
        if (!this._delegate) {
            return undefined;
        }
        const [sel] = this._view.selection;
        if (sel) {
            return sel;
        }
        if (!vscode.window.activeTextEditor) {
            return undefined;
        }
        return this._delegate.nearest(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active);
    }
    _open(loc, preserveFocus) {
        vscode.commands.executeCommand('vscode.open', loc.uri, {
            selection: new vscode.Selection(loc.range.start, loc.range.start),
            preserveFocus
        });
    }
    previous(preserveFocus) {
        if (!this._delegate) {
            return;
        }
        const item = this._anchor();
        if (!item) {
            return;
        }
        const newItem = this._delegate.previous(item);
        const newLocation = this._delegate.location(newItem);
        if (newLocation) {
            this._view.reveal(newItem, { select: true, focus: true });
            this._open(newLocation, preserveFocus);
        }
    }
    next(preserveFocus) {
        if (!this._delegate) {
            return;
        }
        const item = this._anchor();
        if (!item) {
            return;
        }
        const newItem = this._delegate.next(item);
        const newLocation = this._delegate.location(newItem);
        if (newLocation) {
            this._view.reveal(newItem, { select: true, focus: true });
            this._open(newLocation, preserveFocus);
        }
    }
}
exports.Navigation = Navigation;
//# sourceMappingURL=navigation.js.map