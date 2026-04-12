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
exports.CallItem = exports.CallsTreeInput = void 0;
const vscode = __importStar(require("vscode"));
const utils_1 = require("../utils");
class CallsTreeInput {
    location;
    direction;
    title;
    contextValue = 'callHierarchy';
    constructor(location, direction) {
        this.location = location;
        this.direction = direction;
        this.title = direction === 0 /* CallsDirection.Incoming */
            ? vscode.l10n.t('Callers Of')
            : vscode.l10n.t('Calls From');
    }
    async resolve() {
        const items = await Promise.resolve(vscode.commands.executeCommand('vscode.prepareCallHierarchy', this.location.uri, this.location.range.start));
        const model = new CallsModel(this.direction, items ?? []);
        const provider = new CallItemDataProvider(model);
        if (model.roots.length === 0) {
            return;
        }
        return {
            provider,
            get message() { return model.roots.length === 0 ? vscode.l10n.t('No results.') : undefined; },
            navigation: model,
            highlights: model,
            dnd: model,
            dispose() {
                provider.dispose();
            }
        };
    }
    with(location) {
        return new CallsTreeInput(location, this.direction);
    }
}
exports.CallsTreeInput = CallsTreeInput;
class CallItem {
    model;
    item;
    parent;
    locations;
    children;
    constructor(model, item, parent, locations) {
        this.model = model;
        this.item = item;
        this.parent = parent;
        this.locations = locations;
    }
    remove() {
        this.model.remove(this);
    }
}
exports.CallItem = CallItem;
class CallsModel {
    direction;
    roots = [];
    _onDidChange = new vscode.EventEmitter();
    onDidChange = this._onDidChange.event;
    constructor(direction, items) {
        this.direction = direction;
        this.roots = items.map(item => new CallItem(this, item, undefined, undefined));
    }
    async _resolveCalls(call) {
        if (this.direction === 0 /* CallsDirection.Incoming */) {
            const calls = await vscode.commands.executeCommand('vscode.provideIncomingCalls', call.item);
            return calls ? calls.map(item => new CallItem(this, item.from, call, item.fromRanges.map(range => new vscode.Location(item.from.uri, range)))) : [];
        }
        else {
            const calls = await vscode.commands.executeCommand('vscode.provideOutgoingCalls', call.item);
            return calls ? calls.map(item => new CallItem(this, item.to, call, item.fromRanges.map(range => new vscode.Location(call.item.uri, range)))) : [];
        }
    }
    async getCallChildren(call) {
        if (!call.children) {
            call.children = await this._resolveCalls(call);
        }
        return call.children;
    }
    // -- navigation
    location(item) {
        return new vscode.Location(item.item.uri, item.item.range);
    }
    nearest(uri, _position) {
        return this.roots.find(item => item.item.uri.toString() === uri.toString()) ?? this.roots[0];
    }
    next(from) {
        return this._move(from, true) ?? from;
    }
    previous(from) {
        return this._move(from, false) ?? from;
    }
    _move(item, fwd) {
        if (item.children?.length) {
            return fwd ? item.children[0] : (0, utils_1.tail)(item.children);
        }
        const array = this.roots.includes(item) ? this.roots : item.parent?.children;
        if (array?.length) {
            const idx = array.indexOf(item);
            const delta = fwd ? 1 : -1;
            return array[idx + delta + array.length % array.length];
        }
    }
    // --- dnd
    getDragUri(item) {
        return (0, utils_1.asResourceUrl)(item.item.uri, item.item.range);
    }
    // --- highlights
    getEditorHighlights(item, uri) {
        if (!item.locations) {
            return item.item.uri.toString() === uri.toString() ? [item.item.selectionRange] : undefined;
        }
        return item.locations
            .filter(loc => loc.uri.toString() === uri.toString())
            .map(loc => loc.range);
    }
    remove(item) {
        const isInRoot = this.roots.includes(item);
        const siblings = isInRoot ? this.roots : item.parent?.children;
        if (siblings) {
            (0, utils_1.del)(siblings, item);
            this._onDidChange.fire(this);
        }
    }
}
class CallItemDataProvider {
    _model;
    _emitter = new vscode.EventEmitter();
    onDidChangeTreeData = this._emitter.event;
    _modelListener;
    constructor(_model) {
        this._model = _model;
        this._modelListener = _model.onDidChange(e => this._emitter.fire(e instanceof CallItem ? e : undefined));
    }
    dispose() {
        this._emitter.dispose();
        this._modelListener.dispose();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.item.name);
        item.description = element.item.detail;
        item.tooltip = item.label && element.item.detail ? `${item.label} - ${element.item.detail}` : item.label ? `${item.label}` : element.item.detail;
        item.contextValue = 'call-item';
        item.iconPath = (0, utils_1.getThemeIcon)(element.item.kind);
        let openArgs;
        if (element.model.direction === 1 /* CallsDirection.Outgoing */) {
            openArgs = [element.item.uri, { selection: element.item.selectionRange.with({ end: element.item.selectionRange.start }) }];
        }
        else {
            // incoming call -> reveal first call instead of caller
            let firstLoctionStart;
            if (element.locations) {
                for (const loc of element.locations) {
                    if (loc.uri.toString() === element.item.uri.toString()) {
                        firstLoctionStart = firstLoctionStart?.isBefore(loc.range.start) ? firstLoctionStart : loc.range.start;
                    }
                }
            }
            if (!firstLoctionStart) {
                firstLoctionStart = element.item.selectionRange.start;
            }
            openArgs = [element.item.uri, { selection: new vscode.Range(firstLoctionStart, firstLoctionStart) }];
        }
        item.command = {
            command: 'vscode.open',
            title: vscode.l10n.t('Open Call'),
            arguments: openArgs
        };
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }
    getChildren(element) {
        return element
            ? this._model.getCallChildren(element)
            : this._model.roots;
    }
    getParent(element) {
        return element.parent;
    }
}
//# sourceMappingURL=model.js.map