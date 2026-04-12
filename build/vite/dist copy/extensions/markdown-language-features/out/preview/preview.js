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
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamicMarkdownPreview = exports.StaticMarkdownPreview = exports.PreviewDocumentVersion = void 0;
const vscode = __importStar(require("vscode"));
const uri = __importStar(require("vscode-uri"));
const dispose_1 = require("../util/dispose");
const file_1 = require("../util/file");
const resources_1 = require("../util/resources");
const url_1 = require("../util/url");
const scrolling_1 = require("./scrolling");
const topmostLineMonitor_1 = require("./topmostLineMonitor");
class PreviewDocumentVersion {
    resource;
    #version;
    constructor(document) {
        this.resource = document.uri;
        this.#version = document.version;
    }
    equals(other) {
        return (0, resources_1.areUrisEqual)(this.resource, other.resource)
            && this.#version === other.#version;
    }
}
exports.PreviewDocumentVersion = PreviewDocumentVersion;
class MarkdownPreview extends dispose_1.Disposable {
    static #unwatchedImageSchemes = new Set(['https', 'http', 'data']);
    #disposed = false;
    #delay = 300;
    #throttleTimer;
    #resource;
    #webviewPanel;
    #line;
    #scrollToFragment;
    #firstUpdate = true;
    #currentVersion;
    #isScrolling = false;
    #scrollingTimer;
    #imageInfo = [];
    #fileWatchersBySrc = new Map();
    #onScrollEmitter = this._register(new vscode.EventEmitter());
    onScroll = this.#onScrollEmitter.event;
    #disposeCts = this._register(new vscode.CancellationTokenSource());
    #delegate;
    #contentProvider;
    #previewConfigurations;
    #logger;
    #contributionProvider;
    #opener;
    constructor(webview, resource, startingScroll, delegate, contentProvider, previewConfigurations, logger, contributionProvider, opener) {
        super();
        this.#delegate = delegate;
        this.#contentProvider = contentProvider;
        this.#previewConfigurations = previewConfigurations;
        this.#logger = logger;
        this.#contributionProvider = contributionProvider;
        this.#opener = opener;
        this.#webviewPanel = webview;
        this.#resource = resource;
        switch (startingScroll?.type) {
            case 'line':
                if (!isNaN(startingScroll.line)) {
                    this.#line = startingScroll.line;
                }
                break;
            case 'fragment':
                this.#scrollToFragment = startingScroll.fragment;
                break;
        }
        this._register(contributionProvider.onContributionsChanged(() => {
            setTimeout(() => this.refresh(true), 0);
        }));
        this._register(vscode.workspace.onDidChangeTextDocument(event => {
            if (this.isPreviewOf(event.document.uri)) {
                this.refresh();
            }
        }));
        this._register(vscode.workspace.onDidOpenTextDocument(document => {
            if (this.isPreviewOf(document.uri)) {
                this.refresh();
            }
        }));
        if (vscode.workspace.fs.isWritableFileSystem(resource.scheme)) {
            const watcher = this._register(vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(resource, '*')));
            this._register(watcher.onDidChange(uri => {
                if (this.isPreviewOf(uri)) {
                    // Only use the file system event when VS Code does not already know about the file.
                    // This is needed to avoid duplicate refreshes
                    if (!vscode.workspace.textDocuments.some(doc => (0, resources_1.areUrisEqual)(doc.uri, uri))) {
                        this.refresh();
                    }
                }
            }));
        }
        this._register(this.#webviewPanel.webview.onDidReceiveMessage((e) => {
            if (e.source !== this.#resource.toString()) {
                return;
            }
            switch (e.type) {
                case 'cacheImageSizes':
                    this.#imageInfo = e.imageData;
                    break;
                case 'revealLine':
                    this.#onDidScrollPreview(e.line);
                    break;
                case 'didClick':
                    this.#onDidClickPreview(e.line);
                    break;
                case 'openLink':
                    this.#onDidClickPreviewLink(e.href);
                    break;
                case 'showPreviewSecuritySelector':
                    vscode.commands.executeCommand('markdown.showPreviewSecuritySelector', e.source);
                    break;
                case 'previewStyleLoadError':
                    vscode.window.showWarningMessage(vscode.l10n.t("Could not load 'markdown.styles': {0}", e.unloadedStyles.join(', ')));
                    break;
            }
        }));
        this.refresh();
    }
    dispose() {
        this.#disposeCts.cancel();
        super.dispose();
        this.#disposed = true;
        clearTimeout(this.#throttleTimer);
        for (const entry of this.#fileWatchersBySrc.values()) {
            entry.dispose();
        }
        this.#fileWatchersBySrc.clear();
    }
    get resource() {
        return this.#resource;
    }
    get state() {
        return {
            resource: this.#resource.toString(),
            line: this.#line,
            fragment: this.#scrollToFragment,
            ...this.#delegate.getAdditionalState(),
        };
    }
    /**
     * The first call immediately refreshes the preview,
     * calls happening shortly thereafter are debounced.
    */
    refresh(forceUpdate = false) {
        // Schedule update if none is pending
        if (!this.#throttleTimer) {
            if (this.#firstUpdate) {
                this.#updatePreview(true);
            }
            else {
                this.#throttleTimer = setTimeout(() => this.#updatePreview(forceUpdate), this.#delay);
            }
        }
        this.#firstUpdate = false;
    }
    isPreviewOf(resource) {
        return (0, resources_1.areUrisEqual)(this.#resource, resource);
    }
    postMessage(msg) {
        if (!this.#disposed) {
            this.#webviewPanel.webview.postMessage(msg);
        }
    }
    scrollTo(topLine) {
        if (this.#disposed) {
            return;
        }
        if (this.#isScrolling) {
            this.#isScrolling = false;
            return;
        }
        this.#logger.trace('MarkdownPreview', 'updateForView', { markdownFile: this.#resource });
        this.#line = topLine;
        this.postMessage({
            type: 'updateView',
            line: topLine,
            source: this.#resource.toString()
        });
    }
    async #updatePreview(forceUpdate) {
        clearTimeout(this.#throttleTimer);
        this.#throttleTimer = undefined;
        if (this.#disposed) {
            return;
        }
        let document;
        try {
            document = await vscode.workspace.openTextDocument(this.#resource);
        }
        catch {
            if (!this.#disposed) {
                await this.#showFileNotFoundError();
            }
            return;
        }
        if (this.#disposed) {
            return;
        }
        const pendingVersion = new PreviewDocumentVersion(document);
        if (!forceUpdate && this.#currentVersion?.equals(pendingVersion)) {
            if (this.#line) {
                this.scrollTo(this.#line);
            }
            return;
        }
        const shouldReloadPage = forceUpdate || !this.#currentVersion || this.#currentVersion.resource.toString() !== pendingVersion.resource.toString() || !this.#webviewPanel.visible;
        this.#currentVersion = pendingVersion;
        let selectedLine = undefined;
        for (const editor of vscode.window.visibleTextEditors) {
            if (this.isPreviewOf(editor.document.uri)) {
                selectedLine = editor.selection.active.line;
                break;
            }
        }
        const content = await (shouldReloadPage
            ? this.#contentProvider.renderDocument(document, this, this.#previewConfigurations, this.#line, selectedLine, this.state, this.#imageInfo, this.#disposeCts.token)
            : this.#contentProvider.renderBody(document, this));
        // Another call to `doUpdate` may have happened.
        // Make sure we are still updating for the correct document
        if (this.#currentVersion?.equals(pendingVersion)) {
            this.#updateWebviewContent(content.html, shouldReloadPage);
            this.#updateImageWatchers(content.containingImages);
        }
    }
    #onDidScrollPreview(line) {
        this.#line = line;
        this.#onScrollEmitter.fire({ line: this.#line, uri: this.#resource });
        const config = this.#previewConfigurations.loadAndCacheConfiguration(this.#resource);
        if (!config.scrollEditorWithPreview) {
            return;
        }
        for (const editor of vscode.window.visibleTextEditors) {
            if (!this.isPreviewOf(editor.document.uri)) {
                continue;
            }
            this.#isScrolling = true;
            if (this.#scrollingTimer) {
                clearTimeout(this.#scrollingTimer);
            }
            this.#scrollingTimer = setTimeout(() => {
                this.#isScrolling = false;
            }, 200);
            (0, scrolling_1.scrollEditorToLine)(line, editor);
        }
    }
    async #onDidClickPreview(line) {
        // fix #82457, find currently opened but unfocused source tab
        await vscode.commands.executeCommand('markdown.showSource');
        const revealLineInEditor = (editor) => {
            const position = new vscode.Position(line, 0);
            const newSelection = new vscode.Selection(position, position);
            editor.selection = newSelection;
            editor.revealRange(newSelection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        };
        for (const visibleEditor of vscode.window.visibleTextEditors) {
            if (this.isPreviewOf(visibleEditor.document.uri)) {
                const editor = await vscode.window.showTextDocument(visibleEditor.document, visibleEditor.viewColumn);
                revealLineInEditor(editor);
                return;
            }
        }
        await vscode.workspace.openTextDocument(this.#resource)
            .then(vscode.window.showTextDocument)
            .then((editor) => {
            revealLineInEditor(editor);
        }, () => {
            vscode.window.showErrorMessage(vscode.l10n.t('Could not open {0}', this.#resource.toString()));
        });
    }
    async #showFileNotFoundError() {
        this.#webviewPanel.webview.html = this.#contentProvider.renderFileNotFoundDocument(this.#resource);
    }
    #updateWebviewContent(html, reloadPage) {
        if (this.#disposed) {
            return;
        }
        if (this.#delegate.getTitle) {
            this.#webviewPanel.title = this.#delegate.getTitle(this.#resource);
        }
        this.#webviewPanel.webview.options = this.#getWebviewOptions();
        if (reloadPage) {
            this.#webviewPanel.webview.html = html;
        }
        else {
            this.postMessage({
                type: 'updateContent',
                content: html,
                source: this.#resource.toString(),
            });
        }
    }
    #updateImageWatchers(srcs) {
        // Delete stale file watchers.
        for (const [src, watcher] of this.#fileWatchersBySrc) {
            if (!srcs.has(src)) {
                watcher.dispose();
                this.#fileWatchersBySrc.delete(src);
            }
        }
        // Create new file watchers.
        const root = vscode.Uri.joinPath(this.#resource, '../');
        for (const src of srcs) {
            const uri = (0, url_1.urlToUri)(src, root);
            if (uri && !_a.#unwatchedImageSchemes.has(uri.scheme) && !this.#fileWatchersBySrc.has(src)) {
                const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(uri, '*'));
                watcher.onDidChange(() => {
                    this.refresh(true);
                });
                this.#fileWatchersBySrc.set(src, watcher);
            }
        }
    }
    #getWebviewOptions() {
        return {
            enableScripts: true,
            enableForms: false,
            localResourceRoots: this.#getLocalResourceRoots()
        };
    }
    #getLocalResourceRoots() {
        const baseRoots = Array.from(this.#contributionProvider.contributions.previewResourceRoots);
        const folder = vscode.workspace.getWorkspaceFolder(this.#resource);
        if (folder) {
            const workspaceRoots = vscode.workspace.workspaceFolders?.map(folder => folder.uri);
            if (workspaceRoots) {
                baseRoots.push(...workspaceRoots);
            }
        }
        else {
            baseRoots.push(uri.Utils.dirname(this.#resource));
        }
        return baseRoots;
    }
    async #onDidClickPreviewLink(href) {
        const config = vscode.workspace.getConfiguration('markdown', this.resource);
        const openLinks = config.get('preview.openMarkdownLinks', 'inPreview');
        if (openLinks === 'inPreview') {
            const resolved = await this.#opener.resolveDocumentLink(href, this.resource);
            if (resolved.kind === 'file') {
                try {
                    const doc = await vscode.workspace.openTextDocument(vscode.Uri.from(resolved.uri));
                    if ((0, file_1.isMarkdownFile)(doc)) {
                        return this.#delegate.openPreviewLinkToMarkdownFile(doc.uri, resolved.fragment ? decodeURIComponent(resolved.fragment) : undefined);
                    }
                }
                catch {
                    // Noop
                }
            }
        }
        return this.#opener.openDocumentLink(href, this.resource);
    }
    //#region WebviewResourceProvider
    asWebviewUri(resource) {
        return this.#webviewPanel.webview.asWebviewUri(resource);
    }
    get cspSource() {
        return [
            this.#webviewPanel.webview.cspSource,
            // On web, we also need to allow loading of resources from contributed extensions
            ...this.#contributionProvider.contributions.previewResourceRoots
                .filter(root => root.scheme === 'http' || root.scheme === 'https')
                .map(root => {
                const dirRoot = root.path.endsWith('/') ? root : root.with({ path: root.path + '/' });
                return dirRoot.toString();
            }),
        ].join(' ');
    }
}
_a = MarkdownPreview;
class StaticMarkdownPreview extends dispose_1.Disposable {
    static customEditorViewType = 'vscode.markdown.preview.editor';
    static revive(resource, webview, contentProvider, previewConfigurations, topmostLineMonitor, logger, contributionProvider, opener, scrollLine) {
        return new StaticMarkdownPreview(webview, resource, contentProvider, previewConfigurations, topmostLineMonitor, logger, contributionProvider, opener, scrollLine);
    }
    #preview;
    #webviewPanel;
    #previewConfigurations;
    constructor(webviewPanel, resource, contentProvider, previewConfigurations, topmostLineMonitor, logger, contributionProvider, opener, scrollLine) {
        super();
        this.#webviewPanel = webviewPanel;
        this.#previewConfigurations = previewConfigurations;
        const topScrollLocation = scrollLine ? new scrolling_1.StartingScrollLine(scrollLine) : undefined;
        this.#preview = this._register(new MarkdownPreview(this.#webviewPanel, resource, topScrollLocation, {
            getAdditionalState: () => { return {}; },
            openPreviewLinkToMarkdownFile: (markdownLink, fragment) => {
                return vscode.commands.executeCommand('vscode.openWith', markdownLink.with({
                    fragment
                }), StaticMarkdownPreview.customEditorViewType, this.#webviewPanel.viewColumn);
            }
        }, contentProvider, previewConfigurations, logger, contributionProvider, opener));
        this._register(this.#webviewPanel.onDidDispose(() => {
            this.dispose();
        }));
        this._register(this.#webviewPanel.onDidChangeViewState(e => {
            this.#onDidChangeViewState.fire(e);
        }));
        this._register(this.#preview.onScroll((scrollInfo) => {
            topmostLineMonitor.setPreviousStaticEditorLine(scrollInfo);
        }));
        this._register(topmostLineMonitor.onDidChanged(event => {
            if (this.#preview.isPreviewOf(event.resource)) {
                this.#preview.scrollTo(event.line);
            }
        }));
    }
    copyImage(id) {
        this.#webviewPanel.reveal();
        this.#preview.postMessage({
            type: 'copyImage',
            source: this.resource.toString(),
            id: id
        });
    }
    #onDispose = this._register(new vscode.EventEmitter());
    onDispose = this.#onDispose.event;
    #onDidChangeViewState = this._register(new vscode.EventEmitter());
    onDidChangeViewState = this.#onDidChangeViewState.event;
    dispose() {
        this.#onDispose.fire();
        super.dispose();
    }
    matchesResource(_otherResource, _otherPosition, _otherLocked) {
        return false;
    }
    refresh() {
        this.#preview.refresh(true);
    }
    updateConfiguration() {
        if (this.#previewConfigurations.hasConfigurationChanged(this.#preview.resource)) {
            this.refresh();
        }
    }
    get resource() {
        return this.#preview.resource;
    }
    get resourceColumn() {
        return this.#webviewPanel.viewColumn || vscode.ViewColumn.One;
    }
}
exports.StaticMarkdownPreview = StaticMarkdownPreview;
class DynamicMarkdownPreview extends dispose_1.Disposable {
    static viewType = 'markdown.preview';
    #resourceColumn;
    #locked;
    #webviewPanel;
    #preview;
    static revive(input, webview, contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener) {
        webview.iconPath = contentProvider.iconPath;
        return new _b(webview, input, contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
    }
    static create(input, previewColumn, contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener) {
        const webview = vscode.window.createWebviewPanel(_b.viewType, _b.#getPreviewTitle(input.resource, input.locked), previewColumn, { enableFindWidget: true, });
        webview.iconPath = contentProvider.iconPath;
        return new _b(webview, input, contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener);
    }
    #contentProvider;
    #previewConfigurations;
    #logger;
    #topmostLineMonitor;
    #contributionProvider;
    #opener;
    constructor(webview, input, contentProvider, previewConfigurations, logger, topmostLineMonitor, contributionProvider, opener) {
        super();
        this.#contentProvider = contentProvider;
        this.#previewConfigurations = previewConfigurations;
        this.#logger = logger;
        this.#topmostLineMonitor = topmostLineMonitor;
        this.#contributionProvider = contributionProvider;
        this.#opener = opener;
        this.#webviewPanel = webview;
        this.#resourceColumn = input.resourceColumn;
        this.#locked = input.locked;
        this.#preview = this.#createPreview(input.resource, typeof input.line === 'number' ? new scrolling_1.StartingScrollLine(input.line) : undefined);
        this._register(webview.onDidDispose(() => { this.dispose(); }));
        this._register(this.#webviewPanel.onDidChangeViewState(e => {
            this.#onDidChangeViewStateEmitter.fire(e);
        }));
        this._register(this.#topmostLineMonitor.onDidChanged(event => {
            if (this.#preview.isPreviewOf(event.resource)) {
                this.#preview.scrollTo(event.line);
            }
        }));
        this._register(vscode.window.onDidChangeTextEditorSelection(event => {
            if (this.#preview.isPreviewOf(event.textEditor.document.uri)) {
                this.#preview.postMessage({
                    type: 'onDidChangeTextEditorSelection',
                    line: event.selections[0].active.line,
                    source: this.#preview.resource.toString()
                });
            }
        }));
        this._register(vscode.window.onDidChangeActiveTextEditor(editor => {
            // Only allow previewing normal text editors which have a viewColumn: See #101514
            if (typeof editor?.viewColumn === 'undefined') {
                return;
            }
            if ((0, file_1.isMarkdownFile)(editor.document) && !this.#locked && !this.#preview.isPreviewOf(editor.document.uri)) {
                const line = (0, topmostLineMonitor_1.getVisibleLine)(editor);
                this.update(editor.document.uri, line ? new scrolling_1.StartingScrollLine(line) : undefined);
            }
        }));
    }
    copyImage(id) {
        this.#webviewPanel.reveal();
        this.#preview.postMessage({
            type: 'copyImage',
            source: this.resource.toString(),
            id: id
        });
    }
    #onDisposeEmitter = this._register(new vscode.EventEmitter());
    onDispose = this.#onDisposeEmitter.event;
    #onDidChangeViewStateEmitter = this._register(new vscode.EventEmitter());
    onDidChangeViewState = this.#onDidChangeViewStateEmitter.event;
    dispose() {
        this.#preview.dispose();
        this.#webviewPanel.dispose();
        this.#onDisposeEmitter.fire();
        this.#onDisposeEmitter.dispose();
        super.dispose();
    }
    get resource() {
        return this.#preview.resource;
    }
    get resourceColumn() {
        return this.#resourceColumn;
    }
    reveal(viewColumn) {
        this.#webviewPanel.reveal(viewColumn);
    }
    refresh() {
        this.#preview.refresh(true);
    }
    updateConfiguration() {
        if (this.#previewConfigurations.hasConfigurationChanged(this.#preview.resource)) {
            this.refresh();
        }
    }
    update(newResource, scrollLocation) {
        if (this.#preview.isPreviewOf(newResource)) {
            switch (scrollLocation?.type) {
                case 'line':
                    this.#preview.scrollTo(scrollLocation.line);
                    return;
                case 'fragment':
                    // Workaround. For fragments, just reload the entire preview
                    break;
                default:
                    return;
            }
        }
        this.#preview.dispose();
        this.#preview = this.#createPreview(newResource, scrollLocation);
    }
    toggleLock() {
        this.#locked = !this.#locked;
        this.#webviewPanel.title = _b.#getPreviewTitle(this.#preview.resource, this.#locked);
    }
    static #getPreviewTitle(resource, locked) {
        const resourceLabel = uri.Utils.basename(resource);
        return locked
            ? vscode.l10n.t('[Preview] {0}', resourceLabel)
            : vscode.l10n.t('Preview {0}', resourceLabel);
    }
    get position() {
        return this.#webviewPanel.viewColumn;
    }
    matchesResource(otherResource, otherPosition, otherLocked) {
        if (this.position !== otherPosition) {
            return false;
        }
        if (this.#locked) {
            return otherLocked && this.#preview.isPreviewOf(otherResource);
        }
        else {
            return !otherLocked;
        }
    }
    matches(otherPreview) {
        return this.matchesResource(otherPreview.#preview.resource, otherPreview.position, otherPreview.#locked);
    }
    #createPreview(resource, startingScroll) {
        return new MarkdownPreview(this.#webviewPanel, resource, startingScroll, {
            getTitle: (resource) => _b.#getPreviewTitle(resource, this.#locked),
            getAdditionalState: () => {
                return {
                    resourceColumn: this.resourceColumn,
                    locked: this.#locked,
                };
            },
            openPreviewLinkToMarkdownFile: (link, fragment) => {
                this.update(link, fragment ? new scrolling_1.StartingScrollFragment(fragment) : undefined);
            }
        }, this.#contentProvider, this.#previewConfigurations, this.#logger, this.#contributionProvider, this.#opener);
    }
}
exports.DynamicMarkdownPreview = DynamicMarkdownPreview;
_b = DynamicMarkdownPreview;
//# sourceMappingURL=preview.js.map