"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReferenceItem = exports.FileItem = exports.ReferencesModel = exports.ReferencesTreeInput = void 0;
const vscode = require("vscode");
const utils_1 = require("../utils");
class ReferencesTreeInput {
    constructor(title, location, _command, _result) {
        this.title = title;
        this.location = location;
        this._command = _command;
        this._result = _result;
        this.contextValue = _command;
    }
    async resolve() {
        let model;
        if (this._result) {
            model = new ReferencesModel(this._result);
        }
        else {
            const resut = await Promise.resolve(vscode.commands.executeCommand(this._command, this.location.uri, this.location.range.start));
            model = new ReferencesModel(resut ?? []);
        }
        if (model.items.length === 0) {
            return;
        }
        const provider = new ReferencesTreeDataProvider(model);
        return {
            provider,
            get message() { return model.message; },
            navigation: model,
            highlights: model,
            dnd: model,
            dispose() {
                provider.dispose();
            }
        };
    }
    with(location) {
        return new ReferencesTreeInput(this.title, location, this._command);
    }
}
exports.ReferencesTreeInput = ReferencesTreeInput;
class ReferencesModel {
    constructor(locations) {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
        this.items = [];
        let last;
        for (const item of locations.sort(ReferencesModel._compareLocations)) {
            const loc = item instanceof vscode.Location
                ? item
                : new vscode.Location(item.targetUri, item.targetRange);
            if (!last || ReferencesModel._compareUriIgnoreFragment(last.uri, loc.uri) !== 0) {
                last = new FileItem(loc.uri.with({ fragment: '' }), [], this);
                this.items.push(last);
            }
            last.references.push(new ReferenceItem(loc, last));
        }
    }
    static _compareUriIgnoreFragment(a, b) {
        const aStr = a.with({ fragment: '' }).toString();
        const bStr = b.with({ fragment: '' }).toString();
        if (aStr < bStr) {
            return -1;
        }
        else if (aStr > bStr) {
            return 1;
        }
        return 0;
    }
    static _compareLocations(a, b) {
        const aUri = a instanceof vscode.Location ? a.uri : a.targetUri;
        const bUri = b instanceof vscode.Location ? b.uri : b.targetUri;
        if (aUri.toString() < bUri.toString()) {
            return -1;
        }
        else if (aUri.toString() > bUri.toString()) {
            return 1;
        }
        const aRange = a instanceof vscode.Location ? a.range : a.targetRange;
        const bRange = b instanceof vscode.Location ? b.range : b.targetRange;
        if (aRange.start.isBefore(bRange.start)) {
            return -1;
        }
        else if (aRange.start.isAfter(bRange.start)) {
            return 1;
        }
        else {
            return 0;
        }
    }
    // --- adapter
    get message() {
        if (this.items.length === 0) {
            return vscode.l10n.t('No results.');
        }
        const total = this.items.reduce((prev, cur) => prev + cur.references.length, 0);
        const files = this.items.length;
        if (total === 1 && files === 1) {
            return vscode.l10n.t('{0} result in {1} file', total, files);
        }
        else if (total === 1) {
            return vscode.l10n.t('{0} result in {1} files', total, files);
        }
        else if (files === 1) {
            return vscode.l10n.t('{0} results in {1} file', total, files);
        }
        else {
            return vscode.l10n.t('{0} results in {1} files', total, files);
        }
    }
    location(item) {
        return item instanceof ReferenceItem
            ? item.location
            : new vscode.Location(item.uri, item.references[0]?.location.range ?? new vscode.Position(0, 0));
    }
    nearest(uri, position) {
        if (this.items.length === 0) {
            return;
        }
        // NOTE: this.items is sorted by location (uri/range)
        for (const item of this.items) {
            if (item.uri.toString() === uri.toString()) {
                // (1) pick the item at the request position
                for (const ref of item.references) {
                    if (ref.location.range.contains(position)) {
                        return ref;
                    }
                }
                // (2) pick the first item after or last before the request position
                let lastBefore;
                for (const ref of item.references) {
                    if (ref.location.range.end.isAfter(position)) {
                        return ref;
                    }
                    lastBefore = ref;
                }
                if (lastBefore) {
                    return lastBefore;
                }
                break;
            }
        }
        // (3) pick the file with the longest common prefix
        let best = 0;
        const bestValue = ReferencesModel._prefixLen(this.items[best].toString(), uri.toString());
        for (let i = 1; i < this.items.length; i++) {
            const value = ReferencesModel._prefixLen(this.items[i].uri.toString(), uri.toString());
            if (value > bestValue) {
                best = i;
            }
        }
        return this.items[best].references[0];
    }
    static _prefixLen(a, b) {
        let pos = 0;
        while (pos < a.length && pos < b.length && a.charCodeAt(pos) === b.charCodeAt(pos)) {
            pos += 1;
        }
        return pos;
    }
    next(item) {
        return this._move(item, true) ?? item;
    }
    previous(item) {
        return this._move(item, false) ?? item;
    }
    _move(item, fwd) {
        const delta = fwd ? +1 : -1;
        const _move = (item) => {
            const idx = (this.items.indexOf(item) + delta + this.items.length) % this.items.length;
            return this.items[idx];
        };
        if (item instanceof FileItem) {
            if (fwd) {
                return _move(item).references[0];
            }
            else {
                return (0, utils_1.tail)(_move(item).references);
            }
        }
        if (item instanceof ReferenceItem) {
            const idx = item.file.references.indexOf(item) + delta;
            if (idx < 0) {
                return (0, utils_1.tail)(_move(item.file).references);
            }
            else if (idx >= item.file.references.length) {
                return _move(item.file).references[0];
            }
            else {
                return item.file.references[idx];
            }
        }
    }
    getEditorHighlights(_item, uri) {
        const file = this.items.find(file => file.uri.toString() === uri.toString());
        return file?.references.map(ref => ref.location.range);
    }
    remove(item) {
        if (item instanceof FileItem) {
            (0, utils_1.del)(this.items, item);
            this._onDidChange.fire(undefined);
        }
        else {
            (0, utils_1.del)(item.file.references, item);
            if (item.file.references.length === 0) {
                (0, utils_1.del)(this.items, item.file);
                this._onDidChange.fire(undefined);
            }
            else {
                this._onDidChange.fire(item.file);
            }
        }
    }
    async asCopyText() {
        let result = '';
        for (const item of this.items) {
            result += `${await item.asCopyText()}\n`;
        }
        return result;
    }
    getDragUri(item) {
        if (item instanceof FileItem) {
            return item.uri;
        }
        else {
            return (0, utils_1.asResourceUrl)(item.file.uri, item.location.range);
        }
    }
}
exports.ReferencesModel = ReferencesModel;
class ReferencesTreeDataProvider {
    constructor(_model) {
        this._model = _model;
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
        this._listener = _model.onDidChangeTreeData(() => this._onDidChange.fire(undefined));
    }
    dispose() {
        this._onDidChange.dispose();
        this._listener.dispose();
    }
    async getTreeItem(element) {
        if (element instanceof FileItem) {
            // files
            const result = new vscode.TreeItem(element.uri);
            result.contextValue = 'file-item';
            result.description = true;
            result.iconPath = vscode.ThemeIcon.File;
            result.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
            return result;
        }
        else {
            // references
            const { range } = element.location;
            const doc = await element.getDocument(true);
            const { before, inside, after } = (0, utils_1.getPreviewChunks)(doc, range);
            const label = {
                label: before + inside + after,
                highlights: [[before.length, before.length + inside.length]]
            };
            const result = new vscode.TreeItem(label);
            result.collapsibleState = vscode.TreeItemCollapsibleState.None;
            result.contextValue = 'reference-item';
            result.command = {
                command: 'vscode.open',
                title: vscode.l10n.t('Open Reference'),
                arguments: [
                    element.location.uri,
                    { selection: range.with({ end: range.start }) }
                ]
            };
            return result;
        }
    }
    async getChildren(element) {
        if (!element) {
            return this._model.items;
        }
        if (element instanceof FileItem) {
            return element.references;
        }
        return undefined;
    }
    getParent(element) {
        return element instanceof ReferenceItem ? element.file : undefined;
    }
}
class FileItem {
    constructor(uri, references, model) {
        this.uri = uri;
        this.references = references;
        this.model = model;
    }
    // --- adapter
    remove() {
        this.model.remove(this);
    }
    async asCopyText() {
        let result = `${vscode.workspace.asRelativePath(this.uri)}\n`;
        for (const ref of this.references) {
            result += `  ${await ref.asCopyText()}\n`;
        }
        return result;
    }
}
exports.FileItem = FileItem;
class ReferenceItem {
    constructor(location, file) {
        this.location = location;
        this.file = file;
    }
    async getDocument(warmUpNext) {
        if (!this._document) {
            this._document = vscode.workspace.openTextDocument(this.location.uri);
        }
        if (warmUpNext) {
            // load next document once this document has been loaded
            const next = this.file.model.next(this.file);
            if (next instanceof FileItem && next !== this.file) {
                vscode.workspace.openTextDocument(next.uri);
            }
            else if (next instanceof ReferenceItem) {
                vscode.workspace.openTextDocument(next.location.uri);
            }
        }
        return this._document;
    }
    // --- adapter
    remove() {
        this.file.model.remove(this);
    }
    async asCopyText() {
        const doc = await this.getDocument();
        const chunks = (0, utils_1.getPreviewChunks)(doc, this.location.range, 21, false);
        return `${this.location.range.start.line + 1}, ${this.location.range.start.character + 1}: ${chunks.before + chunks.inside + chunks.after}`;
    }
}
exports.ReferenceItem = ReferenceItem;
//# sourceMappingURL=model.js.map