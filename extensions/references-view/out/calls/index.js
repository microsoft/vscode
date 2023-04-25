"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = void 0;
const vscode = require("vscode");
const utils_1 = require("../utils");
const model_1 = require("./model");
function register(tree, context) {
    const direction = new RichCallsDirection(context.workspaceState, 0 /* CallsDirection.Incoming */);
    function showCallHierarchy() {
        if (vscode.window.activeTextEditor) {
            const input = new model_1.CallsTreeInput(new vscode.Location(vscode.window.activeTextEditor.document.uri, vscode.window.activeTextEditor.selection.active), direction.value);
            tree.setInput(input);
        }
    }
    function setCallsDirection(value, anchor) {
        direction.value = value;
        let newInput;
        const oldInput = tree.getInput();
        if (anchor instanceof model_1.CallItem) {
            newInput = new model_1.CallsTreeInput(new vscode.Location(anchor.item.uri, anchor.item.selectionRange.start), direction.value);
        }
        else if (oldInput instanceof model_1.CallsTreeInput) {
            newInput = new model_1.CallsTreeInput(oldInput.location, direction.value);
        }
        if (newInput) {
            tree.setInput(newInput);
        }
    }
    context.subscriptions.push(vscode.commands.registerCommand('references-view.showCallHierarchy', showCallHierarchy), vscode.commands.registerCommand('references-view.showOutgoingCalls', (item) => setCallsDirection(1 /* CallsDirection.Outgoing */, item)), vscode.commands.registerCommand('references-view.showIncomingCalls', (item) => setCallsDirection(0 /* CallsDirection.Incoming */, item)), vscode.commands.registerCommand('references-view.removeCallItem', removeCallItem));
}
exports.register = register;
function removeCallItem(item) {
    if (item instanceof model_1.CallItem) {
        item.remove();
    }
}
class RichCallsDirection {
    constructor(_mem, _value = 1 /* CallsDirection.Outgoing */) {
        this._mem = _mem;
        this._value = _value;
        this._ctxMode = new utils_1.ContextKey('references-view.callHierarchyMode');
        const raw = _mem.get(RichCallsDirection._key);
        if (typeof raw === 'number' && raw >= 0 && raw <= 1) {
            this.value = raw;
        }
        else {
            this.value = _value;
        }
    }
    get value() {
        return this._value;
    }
    set value(value) {
        this._value = value;
        this._ctxMode.set(this._value === 0 /* CallsDirection.Incoming */ ? 'showIncoming' : 'showOutgoing');
        this._mem.update(RichCallsDirection._key, value);
    }
}
RichCallsDirection._key = 'references-view.callHierarchyMode';
//# sourceMappingURL=index.js.map