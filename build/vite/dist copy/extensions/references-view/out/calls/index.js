"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = register;
const vscode = __importStar(require("vscode"));
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
function removeCallItem(item) {
    if (item instanceof model_1.CallItem) {
        item.remove();
    }
}
class RichCallsDirection {
    _mem;
    _value;
    static _key = 'references-view.callHierarchyMode';
    _ctxMode = new utils_1.ContextKey('references-view.callHierarchyMode');
    constructor(_mem, _value = 1 /* CallsDirection.Outgoing */) {
        this._mem = _mem;
        this._value = _value;
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
//# sourceMappingURL=index.js.map