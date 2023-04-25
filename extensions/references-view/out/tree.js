"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.SymbolsTree = void 0;
const vscode = require("vscode");
const highlights_1 = require("./highlights");
const navigation_1 = require("./navigation");
const utils_1 = require("./utils");
class SymbolsTree {
    constructor() {
        this.viewId = 'references-view.tree';
        this._ctxIsActive = new utils_1.ContextKey('reference-list.isActive');
        this._ctxHasResult = new utils_1.ContextKey('reference-list.hasResult');
        this._ctxInputSource = new utils_1.ContextKey('reference-list.source');
        this._history = new TreeInputHistory(this);
        this._provider = new TreeDataProviderDelegate();
        this._dnd = new TreeDndDelegate();
        this._tree = vscode.window.createTreeView(this.viewId, {
            treeDataProvider: this._provider,
            showCollapseAll: true,
            dragAndDropController: this._dnd
        });
        this._navigation = new navigation_1.Navigation(this._tree);
    }
    dispose() {
        this._history.dispose();
        this._tree.dispose();
        this._sessionDisposable?.dispose();
    }
    getInput() {
        return this._input;
    }
    async setInput(input) {
        if (!await (0, utils_1.isValidRequestPosition)(input.location.uri, input.location.range.start)) {
            this.clearInput();
            return;
        }
        this._ctxInputSource.set(input.contextValue);
        this._ctxIsActive.set(true);
        this._ctxHasResult.set(true);
        vscode.commands.executeCommand(`${this.viewId}.focus`);
        const newInputKind = !this._input || Object.getPrototypeOf(this._input) !== Object.getPrototypeOf(input);
        this._input = input;
        this._sessionDisposable?.dispose();
        this._tree.title = input.title;
        this._tree.message = newInputKind ? undefined : this._tree.message;
        const modelPromise = Promise.resolve(input.resolve());
        // set promise to tree data provider to trigger tree loading UI
        this._provider.update(modelPromise.then(model => model?.provider ?? this._history));
        this._dnd.update(modelPromise.then(model => model?.dnd));
        const model = await modelPromise;
        if (this._input !== input) {
            return;
        }
        if (!model) {
            this.clearInput();
            return;
        }
        this._history.add(input);
        this._tree.message = model.message;
        // navigation
        this._navigation.update(model.navigation);
        // reveal & select
        const selection = model.navigation?.nearest(input.location.uri, input.location.range.start);
        if (selection && this._tree.visible) {
            await this._tree.reveal(selection, { select: true, focus: true, expand: true });
        }
        const disposables = [];
        // editor highlights
        let highlights;
        if (model.highlights) {
            highlights = new highlights_1.EditorHighlights(this._tree, model.highlights);
            disposables.push(highlights);
        }
        // listener
        if (model.provider.onDidChangeTreeData) {
            disposables.push(model.provider.onDidChangeTreeData(() => {
                this._tree.title = input.title;
                this._tree.message = model.message;
                highlights?.update();
            }));
        }
        if (typeof model.dispose === 'function') {
            disposables.push(new vscode.Disposable(() => model.dispose()));
        }
        this._sessionDisposable = vscode.Disposable.from(...disposables);
    }
    clearInput() {
        this._sessionDisposable?.dispose();
        this._input = undefined;
        this._ctxHasResult.set(false);
        this._ctxInputSource.reset();
        this._tree.title = vscode.l10n.t('References');
        this._tree.message = this._history.size === 0
            ? vscode.l10n.t('No results.')
            : vscode.l10n.t('No results. Try running a previous search again:');
        this._provider.update(Promise.resolve(this._history));
    }
}
exports.SymbolsTree = SymbolsTree;
class TreeDataProviderDelegate {
    constructor() {
        this._onDidChange = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChange.event;
    }
    update(provider) {
        this._sessionDispoables?.dispose();
        this._sessionDispoables = undefined;
        this._onDidChange.fire(undefined);
        this.provider = provider;
        provider.then(value => {
            if (this.provider === provider && value.onDidChangeTreeData) {
                this._sessionDispoables = value.onDidChangeTreeData(this._onDidChange.fire, this._onDidChange);
            }
        }).catch(err => {
            this.provider = undefined;
            console.error(err);
        });
    }
    async getTreeItem(element) {
        this._assertProvider();
        return (await this.provider).getTreeItem(element);
    }
    async getChildren(parent) {
        this._assertProvider();
        return (await this.provider).getChildren(parent);
    }
    async getParent(element) {
        this._assertProvider();
        const provider = await this.provider;
        return provider.getParent ? provider.getParent(element) : undefined;
    }
    _assertProvider() {
        if (!this.provider) {
            throw new Error('MISSING provider');
        }
    }
}
// --- tree dnd
class TreeDndDelegate {
    constructor() {
        this.dropMimeTypes = [];
        this.dragMimeTypes = ['text/uri-list'];
    }
    update(delegate) {
        this._delegate = undefined;
        delegate.then(value => this._delegate = value);
    }
    handleDrag(source, data) {
        if (this._delegate) {
            const urls = [];
            for (const item of source) {
                const uri = this._delegate.getDragUri(item);
                if (uri) {
                    urls.push(uri.toString());
                }
            }
            if (urls.length > 0) {
                data.set('text/uri-list', new vscode.DataTransferItem(urls.join('\r\n')));
            }
        }
    }
    handleDrop() {
        throw new Error('Method not implemented.');
    }
}
// --- history
class HistoryItem {
    constructor(key, word, anchor, input) {
        this.key = key;
        this.word = word;
        this.anchor = anchor;
        this.input = input;
        this.description = `${vscode.workspace.asRelativePath(input.location.uri)} • ${input.title.toLocaleLowerCase()}`;
    }
}
class TreeInputHistory {
    constructor(_tree) {
        this._tree = _tree;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this._disposables = [];
        this._ctxHasHistory = new utils_1.ContextKey('reference-list.hasHistory');
        this._inputs = new Map();
        this._disposables.push(vscode.commands.registerCommand('references-view.clear', () => _tree.clearInput()), vscode.commands.registerCommand('references-view.clearHistory', () => {
            this.clear();
            _tree.clearInput();
        }), vscode.commands.registerCommand('references-view.refind', (item) => {
            if (item instanceof HistoryItem) {
                this._reRunHistoryItem(item);
            }
        }), vscode.commands.registerCommand('references-view.refresh', () => {
            const item = Array.from(this._inputs.values()).pop();
            if (item) {
                this._reRunHistoryItem(item);
            }
        }), vscode.commands.registerCommand('_references-view.showHistoryItem', async (item) => {
            if (item instanceof HistoryItem) {
                const position = item.anchor.guessedTrackedPosition() ?? item.input.location.range.start;
                await vscode.commands.executeCommand('vscode.open', item.input.location.uri, { selection: new vscode.Range(position, position) });
            }
        }), vscode.commands.registerCommand('references-view.pickFromHistory', async () => {
            const entries = await this.getChildren();
            const picks = entries.map(item => ({
                label: item.word,
                description: item.description,
                item
            }));
            const pick = await vscode.window.showQuickPick(picks, { placeHolder: vscode.l10n.t('Select previous reference search') });
            if (pick) {
                this._reRunHistoryItem(pick.item);
            }
        }));
    }
    dispose() {
        vscode.Disposable.from(...this._disposables).dispose();
        this._onDidChangeTreeData.dispose();
    }
    _reRunHistoryItem(item) {
        this._inputs.delete(item.key);
        const newPosition = item.anchor.guessedTrackedPosition();
        let newInput = item.input;
        // create a new input when having a tracked position which is
        // different than the original position.
        if (newPosition && !item.input.location.range.start.isEqual(newPosition)) {
            newInput = item.input.with(new vscode.Location(item.input.location.uri, newPosition));
        }
        this._tree.setInput(newInput);
    }
    async add(input) {
        const doc = await vscode.workspace.openTextDocument(input.location.uri);
        const anchor = new utils_1.WordAnchor(doc, input.location.range.start);
        const range = doc.getWordRangeAtPosition(input.location.range.start) ?? doc.getWordRangeAtPosition(input.location.range.start, /[^\s]+/);
        const word = range ? doc.getText(range) : '???';
        const item = new HistoryItem(JSON.stringify([range?.start ?? input.location.range.start, input.location.uri, input.title]), word, anchor, input);
        // use filo-ordering of native maps
        this._inputs.delete(item.key);
        this._inputs.set(item.key, item);
        this._ctxHasHistory.set(true);
    }
    clear() {
        this._inputs.clear();
        this._ctxHasHistory.set(false);
        this._onDidChangeTreeData.fire(undefined);
    }
    get size() {
        return this._inputs.size;
    }
    // --- tree data provider
    getTreeItem(item) {
        const result = new vscode.TreeItem(item.word);
        result.description = item.description;
        result.command = { command: '_references-view.showHistoryItem', arguments: [item], title: vscode.l10n.t('Rerun') };
        result.collapsibleState = vscode.TreeItemCollapsibleState.None;
        result.contextValue = 'history-item';
        return result;
    }
    getChildren() {
        return Promise.all([...this._inputs.values()].reverse());
    }
    getParent() {
        return undefined;
    }
}
//# sourceMappingURL=tree.js.map