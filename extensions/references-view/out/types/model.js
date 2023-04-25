"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.TypeItem = exports.TypesTreeInput = void 0;
const vscode = require("vscode");
const utils_1 = require("../utils");
class TypesTreeInput {
    constructor(location, direction) {
        this.location = location;
        this.direction = direction;
        this.contextValue = 'typeHierarchy';
        this.title = direction === "supertypes" /* TypeHierarchyDirection.Supertypes */
            ? vscode.l10n.t('Supertypes Of')
            : vscode.l10n.t('Subtypes Of');
    }
    async resolve() {
        const items = await Promise.resolve(vscode.commands.executeCommand('vscode.prepareTypeHierarchy', this.location.uri, this.location.range.start));
        const model = new TypesModel(this.direction, items ?? []);
        const provider = new TypeItemDataProvider(model);
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
        return new TypesTreeInput(location, this.direction);
    }
}
exports.TypesTreeInput = TypesTreeInput;
class TypeItem {
    constructor(model, item, parent) {
        this.model = model;
        this.item = item;
        this.parent = parent;
    }
    remove() {
        this.model.remove(this);
    }
}
exports.TypeItem = TypeItem;
class TypesModel {
    constructor(direction, items) {
        this.direction = direction;
        this.roots = [];
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChange = this._onDidChange.event;
        this.roots = items.map(item => new TypeItem(this, item, undefined));
    }
    async _resolveTypes(currentType) {
        if (this.direction === "supertypes" /* TypeHierarchyDirection.Supertypes */) {
            const types = await vscode.commands.executeCommand('vscode.provideSupertypes', currentType.item);
            return types ? types.map(item => new TypeItem(this, item, currentType)) : [];
        }
        else {
            const types = await vscode.commands.executeCommand('vscode.provideSubtypes', currentType.item);
            return types ? types.map(item => new TypeItem(this, item, currentType)) : [];
        }
    }
    async getTypeChildren(item) {
        if (!item.children) {
            item.children = await this._resolveTypes(item);
        }
        return item.children;
    }
    // -- dnd
    getDragUri(item) {
        return (0, utils_1.asResourceUrl)(item.item.uri, item.item.range);
    }
    // -- navigation
    location(currentType) {
        return new vscode.Location(currentType.item.uri, currentType.item.range);
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
    // --- highlights
    getEditorHighlights(currentType, uri) {
        return currentType.item.uri.toString() === uri.toString() ? [currentType.item.selectionRange] : undefined;
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
class TypeItemDataProvider {
    constructor(_model) {
        this._model = _model;
        this._emitter = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._emitter.event;
        this._modelListener = _model.onDidChange(e => this._emitter.fire(e instanceof TypeItem ? e : undefined));
    }
    dispose() {
        this._emitter.dispose();
        this._modelListener.dispose();
    }
    getTreeItem(element) {
        const item = new vscode.TreeItem(element.item.name);
        item.description = element.item.detail;
        item.contextValue = 'type-item';
        item.iconPath = (0, utils_1.getThemeIcon)(element.item.kind);
        item.command = {
            command: 'vscode.open',
            title: vscode.l10n.t('Open Type'),
            arguments: [
                element.item.uri,
                { selection: element.item.selectionRange.with({ end: element.item.selectionRange.start }) }
            ]
        };
        item.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        return item;
    }
    getChildren(element) {
        return element
            ? this._model.getTypeChildren(element)
            : this._model.roots;
    }
    getParent(element) {
        return element.parent;
    }
}
//# sourceMappingURL=model.js.map