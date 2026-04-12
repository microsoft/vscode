"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitBlameController = void 0;
const vscode_1 = require("vscode");
const util_1 = require("./util");
const decorators_1 = require("./decorators");
const uri_1 = require("./uri");
const emoji_1 = require("./emoji");
const staging_1 = require("./staging");
const historyItemDetailsProvider_1 = require("./historyItemDetailsProvider");
const cache_1 = require("./cache");
const hover_1 = require("./hover");
function lineRangesContainLine(changes, lineNumber) {
    return changes.some(c => c.modified.startLineNumber <= lineNumber && lineNumber < c.modified.endLineNumberExclusive);
}
function lineRangeLength(startLineNumber, endLineNumberExclusive) {
    return endLineNumberExclusive - startLineNumber;
}
function mapModifiedLineNumberToOriginalLineNumber(lineNumber, changes) {
    if (changes.length === 0) {
        return lineNumber;
    }
    for (const change of changes) {
        // Do not process changes after the line number
        if (lineNumber < change.modified.startLineNumber) {
            break;
        }
        // Map line number to the original line number
        if (change.kind === vscode_1.TextEditorChangeKind.Addition) {
            // Addition
            lineNumber = lineNumber - lineRangeLength(change.modified.startLineNumber, change.modified.endLineNumberExclusive);
        }
        else if (change.kind === vscode_1.TextEditorChangeKind.Deletion) {
            // Deletion
            lineNumber = lineNumber + lineRangeLength(change.original.startLineNumber, change.original.endLineNumberExclusive);
        }
        else if (change.kind === vscode_1.TextEditorChangeKind.Modification) {
            // Modification
            const originalRangeLength = lineRangeLength(change.original.startLineNumber, change.original.endLineNumberExclusive);
            const modifiedRangeLength = lineRangeLength(change.modified.startLineNumber, change.modified.endLineNumberExclusive);
            if (originalRangeLength !== modifiedRangeLength) {
                lineNumber = lineNumber - (modifiedRangeLength - originalRangeLength);
            }
        }
        else {
            throw new Error('Unexpected change kind');
        }
    }
    return lineNumber;
}
function getEditorDecorationRange(lineNumber) {
    const position = new vscode_1.Position(lineNumber, Number.MAX_SAFE_INTEGER);
    return new vscode_1.Range(position, position);
}
function isResourceSchemeSupported(uri) {
    return uri.scheme === 'file' || (0, uri_1.isGitUri)(uri);
}
function isResourceBlameInformationEqual(a, b) {
    if (a === b) {
        return true;
    }
    if (!a || !b ||
        a.resource.toString() !== b.resource.toString() ||
        a.blameInformation.length !== b.blameInformation.length) {
        return false;
    }
    for (let index = 0; index < a.blameInformation.length; index++) {
        if (a.blameInformation[index].lineNumber !== b.blameInformation[index].lineNumber) {
            return false;
        }
        const aBlameInformation = a.blameInformation[index].blameInformation;
        const bBlameInformation = b.blameInformation[index].blameInformation;
        if (typeof aBlameInformation === 'string' && typeof bBlameInformation === 'string') {
            if (aBlameInformation !== bBlameInformation) {
                return false;
            }
        }
        else if (typeof aBlameInformation !== 'string' && typeof bBlameInformation !== 'string') {
            if (aBlameInformation.hash !== bBlameInformation.hash) {
                return false;
            }
        }
        else {
            return false;
        }
    }
    return true;
}
class GitBlameInformationCache {
    _cache = new Map();
    clear() {
        this._cache.clear();
    }
    delete(repository) {
        return this._cache.delete(repository);
    }
    get(repository, resource, commit) {
        const key = this._getCacheKey(resource, commit);
        return this._cache.get(repository)?.get(key);
    }
    set(repository, resource, commit, blameInformation) {
        if (!this._cache.has(repository)) {
            this._cache.set(repository, new cache_1.LRUCache(100));
        }
        const key = this._getCacheKey(resource, commit);
        this._cache.get(repository).set(key, blameInformation);
    }
    _getCacheKey(resource, commit) {
        return (0, uri_1.toGitUri)(resource, commit).toString();
    }
}
class GitBlameController {
    _model;
    _subjectMaxLength = 50;
    _onDidChangeBlameInformation = new vscode_1.EventEmitter();
    onDidChangeBlameInformation = this._onDidChangeBlameInformation.event;
    _textEditorBlameInformation;
    get textEditorBlameInformation() {
        return this._textEditorBlameInformation;
    }
    set textEditorBlameInformation(blameInformation) {
        if (isResourceBlameInformationEqual(this._textEditorBlameInformation, blameInformation)) {
            return;
        }
        this._textEditorBlameInformation = blameInformation;
        this._onDidChangeBlameInformation.fire();
    }
    _HEAD;
    _commitInformationCache = new cache_1.LRUCache(100);
    _repositoryBlameCache = new GitBlameInformationCache();
    _editorDecoration;
    _statusBarItem;
    _repositoryDisposables = new Map();
    _enablementDisposables = [];
    _disposables = [];
    constructor(_model) {
        this._model = _model;
        vscode_1.workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
        this._onDidChangeConfiguration();
    }
    formatBlameInformationMessage(documentUri, template, blameInformation) {
        const templateTokens = {
            hash: blameInformation.hash,
            hashShort: (0, util_1.getCommitShortHash)(documentUri, blameInformation.hash),
            subject: (0, emoji_1.emojify)((0, util_1.truncate)(blameInformation.subject ?? '', this._subjectMaxLength)),
            authorName: blameInformation.authorName ?? '',
            authorEmail: blameInformation.authorEmail ?? '',
            authorDate: new Date(blameInformation.authorDate ?? new Date()).toLocaleString(),
            authorDateAgo: (0, util_1.fromNow)(blameInformation.authorDate ?? new Date(), true, true)
        };
        return template.replace(/\$\{(.+?)\}/g, (_, token) => {
            return templateTokens.hasOwnProperty(token)
                ? templateTokens[token]
                : `\${${token}}`;
        });
    }
    async getBlameInformationHover(documentUri, blameInformation) {
        const remoteHoverCommands = [];
        let commitAvatar;
        let commitInformation;
        let commitMessageWithLinks;
        const repository = this._model.getRepository(documentUri);
        if (repository) {
            try {
                // Commit details
                commitInformation = this._commitInformationCache.get(blameInformation.hash);
                if (!commitInformation) {
                    commitInformation = await repository.getCommit(blameInformation.hash);
                    this._commitInformationCache.set(blameInformation.hash, commitInformation);
                }
                // Avatar
                const avatarQuery = {
                    commits: [{
                            hash: blameInformation.hash,
                            authorName: blameInformation.authorName,
                            authorEmail: blameInformation.authorEmail
                        }],
                    size: hover_1.AVATAR_SIZE
                };
                const avatarResult = await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemAvatar)(this._model, repository, avatarQuery);
                commitAvatar = avatarResult?.get(blameInformation.hash);
            }
            catch { }
            // Remote hover commands
            const unpublishedCommits = await repository.getUnpublishedCommits();
            if (!unpublishedCommits.has(blameInformation.hash)) {
                remoteHoverCommands.push(...await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemHoverCommands)(this._model, repository) ?? []);
            }
            // Message links
            commitMessageWithLinks = await (0, historyItemDetailsProvider_1.provideSourceControlHistoryItemMessageLinks)(this._model, repository, commitInformation?.message ?? blameInformation.subject ?? '');
        }
        const hash = commitInformation?.hash ?? blameInformation.hash;
        const authorName = commitInformation?.authorName ?? blameInformation.authorName;
        const authorEmail = commitInformation?.authorEmail ?? blameInformation.authorEmail;
        const authorDate = commitInformation?.authorDate ?? blameInformation.authorDate;
        const message = commitMessageWithLinks ?? commitInformation?.message ?? blameInformation.subject ?? '';
        // Commands
        const commands = [
            (0, hover_1.getHoverCommitHashCommands)(documentUri, hash),
            (0, hover_1.processHoverRemoteCommands)(remoteHoverCommands, hash)
        ];
        commands.push([{
                title: `$(gear)`,
                tooltip: vscode_1.l10n.t('Open Settings'),
                command: 'workbench.action.openSettings',
                arguments: ['git.blame']
            }]);
        return (0, hover_1.getCommitHover)(commitAvatar, authorName, authorEmail, authorDate, message, commitInformation?.shortStat, commands, commitInformation?.coAuthors);
    }
    _onDidChangeConfiguration(e) {
        if (e &&
            !e.affectsConfiguration('git.blame.ignoreWhitespace') &&
            !e.affectsConfiguration('git.blame.editorDecoration.enabled') &&
            !e.affectsConfiguration('git.blame.statusBarItem.enabled')) {
            return;
        }
        // Clear cache when ignoreWhitespace setting changes
        if (e && e.affectsConfiguration('git.blame.ignoreWhitespace')) {
            this._repositoryBlameCache.clear();
            this._updateTextEditorBlameInformation(vscode_1.window.activeTextEditor);
            return;
        }
        const config = vscode_1.workspace.getConfiguration('git');
        const editorDecorationEnabled = config.get('blame.editorDecoration.enabled') === true;
        const statusBarItemEnabled = config.get('blame.statusBarItem.enabled') === true;
        // Editor decoration
        if (editorDecorationEnabled) {
            if (!this._editorDecoration) {
                this._editorDecoration = new GitBlameEditorDecoration(this);
            }
        }
        else {
            this._editorDecoration?.dispose();
            this._editorDecoration = undefined;
        }
        // StatusBar item
        if (statusBarItemEnabled) {
            if (!this._statusBarItem) {
                this._statusBarItem = new GitBlameStatusBarItem(this);
            }
        }
        else {
            this._statusBarItem?.dispose();
            this._statusBarItem = undefined;
        }
        // Listeners
        if (editorDecorationEnabled || statusBarItemEnabled) {
            if (this._enablementDisposables.length === 0) {
                this._model.onDidOpenRepository(this._onDidOpenRepository, this, this._enablementDisposables);
                this._model.onDidCloseRepository(this._onDidCloseRepository, this, this._enablementDisposables);
                for (const repository of this._model.repositories) {
                    this._onDidOpenRepository(repository);
                }
                vscode_1.window.onDidChangeActiveTextEditor(e => this._updateTextEditorBlameInformation(e), this, this._enablementDisposables);
                vscode_1.window.onDidChangeTextEditorSelection(e => this._updateTextEditorBlameInformation(e.textEditor, 'selection'), this, this._enablementDisposables);
                vscode_1.window.onDidChangeTextEditorDiffInformation(e => this._updateTextEditorBlameInformation(e.textEditor), this, this._enablementDisposables);
            }
        }
        else {
            this._enablementDisposables = (0, util_1.dispose)(this._enablementDisposables);
        }
        this._updateTextEditorBlameInformation(vscode_1.window.activeTextEditor);
    }
    _onDidOpenRepository(repository) {
        const repositoryDisposables = [];
        repository.onDidRunGitStatus(() => this._onDidRunGitStatus(repository), this, repositoryDisposables);
        this._repositoryDisposables.set(repository, repositoryDisposables);
    }
    _onDidCloseRepository(repository) {
        const disposables = this._repositoryDisposables.get(repository);
        if (disposables) {
            (0, util_1.dispose)(disposables);
        }
        this._repositoryDisposables.delete(repository);
        this._repositoryBlameCache.delete(repository);
    }
    _onDidRunGitStatus(repository) {
        if (!repository.HEAD?.commit || this._HEAD === repository.HEAD.commit) {
            return;
        }
        this._HEAD = repository.HEAD.commit;
        this._updateTextEditorBlameInformation(vscode_1.window.activeTextEditor);
    }
    async _getBlameInformation(resource, commit) {
        const repository = this._model.getRepository(resource);
        if (!repository) {
            return undefined;
        }
        const resourceBlameInformation = this._repositoryBlameCache.get(repository, resource, commit);
        if (resourceBlameInformation) {
            return resourceBlameInformation;
        }
        // Ensure that the emojis are loaded as we will need
        // access to them when formatting the blame information.
        await (0, emoji_1.ensureEmojis)();
        // Get blame information for the resource and cache it
        const blameInformation = await repository.blame2(resource.fsPath, commit) ?? [];
        this._repositoryBlameCache.set(repository, resource, commit, blameInformation);
        return blameInformation;
    }
    async _updateTextEditorBlameInformation(textEditor, reason) {
        if (textEditor) {
            if (!textEditor.diffInformation || textEditor !== vscode_1.window.activeTextEditor) {
                return;
            }
        }
        else {
            this.textEditorBlameInformation = undefined;
            return;
        }
        const repository = this._model.getRepository(textEditor.document.uri);
        if (!repository || !repository.HEAD?.commit) {
            return;
        }
        // Only support resources with `file` and `git` schemes
        if (!isResourceSchemeSupported(textEditor.document.uri)) {
            this.textEditorBlameInformation = undefined;
            return;
        }
        // Do not show blame information when there is a single selection and it is at the beginning
        // of the file [0, 0, 0, 0] unless the user explicitly navigates the cursor there. We do this
        // to avoid showing blame information when the editor is not focused.
        if (reason !== 'selection' && textEditor.selections.length === 1 &&
            textEditor.selections[0].start.line === 0 && textEditor.selections[0].start.character === 0 &&
            textEditor.selections[0].end.line === 0 && textEditor.selections[0].end.character === 0) {
            this.textEditorBlameInformation = undefined;
            return;
        }
        let allChanges;
        let workingTreeChanges;
        let workingTreeAndIndexChanges;
        if ((0, uri_1.isGitUri)(textEditor.document.uri)) {
            const { ref } = (0, uri_1.fromGitUri)(textEditor.document.uri);
            // For the following scenarios we can discard the diff information
            // 1) Commit - Resource in the multi-file diff editor when viewing the details of a commit.
            // 2) HEAD   - Resource on the left-hand side of the diff editor when viewing a resource from the index.
            // 3) ~      - Resource on the left-hand side of the diff editor when viewing a resource from the working tree.
            if (/^[0-9a-f]{40}$/i.test(ref) || ref === 'HEAD' || ref === '~') {
                workingTreeChanges = allChanges = [];
                workingTreeAndIndexChanges = undefined;
            }
            else if (ref === '') {
                // Resource on the right-hand side of the diff editor when viewing a resource from the index.
                const diffInformationWorkingTreeAndIndex = (0, staging_1.getWorkingTreeAndIndexDiffInformation)(textEditor);
                // Working tree + index diff information is present and it is stale. Diff information
                // may be stale when the selection changes because of a content change and the diff
                // information is not yet updated.
                if (diffInformationWorkingTreeAndIndex && diffInformationWorkingTreeAndIndex.isStale) {
                    this.textEditorBlameInformation = undefined;
                    return;
                }
                workingTreeChanges = [];
                workingTreeAndIndexChanges = allChanges = diffInformationWorkingTreeAndIndex?.changes ?? [];
            }
            else {
                throw new Error(`Unexpected ref: ${ref}`);
            }
        }
        else {
            // Working tree diff information. Diff Editor (Working Tree) -> Text Editor
            const diffInformationWorkingTree = (0, staging_1.getWorkingTreeDiffInformation)(textEditor);
            // Working tree diff information is not present or it is stale. Diff information
            // may be stale when the selection changes because of a content change and the diff
            // information is not yet updated.
            if (!diffInformationWorkingTree || diffInformationWorkingTree.isStale) {
                this.textEditorBlameInformation = undefined;
                return;
            }
            // Working tree + index diff information
            const diffInformationWorkingTreeAndIndex = (0, staging_1.getWorkingTreeAndIndexDiffInformation)(textEditor);
            // Working tree + index diff information is present and it is stale. Diff information
            // may be stale when the selection changes because of a content change and the diff
            // information is not yet updated.
            if (diffInformationWorkingTreeAndIndex && diffInformationWorkingTreeAndIndex.isStale) {
                this.textEditorBlameInformation = undefined;
                return;
            }
            workingTreeChanges = diffInformationWorkingTree.changes;
            workingTreeAndIndexChanges = diffInformationWorkingTreeAndIndex?.changes;
            // For staged resources, we provide an additional "original resource" so that the editor
            // diff information contains both the changes that are in the working tree and the changes
            // that are in the working tree + index.
            allChanges = workingTreeAndIndexChanges ?? workingTreeChanges;
        }
        let commit;
        if (!(0, uri_1.isGitUri)(textEditor.document.uri)) {
            // Resource with the `file` scheme
            commit = repository.HEAD.commit;
        }
        else {
            // Resource with the `git` scheme
            const { ref } = (0, uri_1.fromGitUri)(textEditor.document.uri);
            commit = /^[0-9a-f]{40}$/i.test(ref) ? ref : repository.HEAD.commit;
        }
        // Git blame information
        const resourceBlameInformation = await this._getBlameInformation(textEditor.document.uri, commit);
        if (!resourceBlameInformation) {
            return;
        }
        const lineBlameInformation = [];
        for (const lineNumber of new Set(textEditor.selections.map(s => s.active.line))) {
            // Check if the line is contained in the working tree diff information
            if (lineRangesContainLine(workingTreeChanges, lineNumber + 1)) {
                if (reason === 'selection') {
                    // Only show the `Not Committed Yet` message upon selection change due to navigation
                    lineBlameInformation.push({ lineNumber, blameInformation: vscode_1.l10n.t('Not Committed Yet') });
                }
                continue;
            }
            // Check if the line is contained in the working tree + index diff information
            if (lineRangesContainLine(workingTreeAndIndexChanges ?? [], lineNumber + 1)) {
                lineBlameInformation.push({ lineNumber, blameInformation: vscode_1.l10n.t('Not Committed Yet (Staged)') });
                continue;
            }
            // Map the line number to the git blame ranges using the diff information
            const lineNumberWithDiff = mapModifiedLineNumberToOriginalLineNumber(lineNumber + 1, allChanges);
            const blameInformation = resourceBlameInformation.find(blameInformation => {
                return blameInformation.ranges.find(range => {
                    return lineNumberWithDiff >= range.startLineNumber && lineNumberWithDiff <= range.endLineNumber;
                });
            });
            if (blameInformation) {
                lineBlameInformation.push({ lineNumber, blameInformation });
            }
        }
        this.textEditorBlameInformation = {
            resource: textEditor.document.uri,
            blameInformation: lineBlameInformation
        };
    }
    dispose() {
        for (const disposables of this._repositoryDisposables.values()) {
            (0, util_1.dispose)(disposables);
        }
        this._repositoryDisposables.clear();
        this._disposables = (0, util_1.dispose)(this._disposables);
    }
}
exports.GitBlameController = GitBlameController;
__decorate([
    decorators_1.throttle
], GitBlameController.prototype, "_updateTextEditorBlameInformation", null);
class GitBlameEditorDecoration {
    _controller;
    _template = '';
    _decoration;
    _hoverDisposable;
    _disposables = [];
    constructor(_controller) {
        this._controller = _controller;
        this._decoration = vscode_1.window.createTextEditorDecorationType({
            after: {
                color: new vscode_1.ThemeColor('git.blame.editorDecorationForeground')
            }
        });
        this._disposables.push(this._decoration);
        vscode_1.workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
        vscode_1.window.onDidChangeActiveTextEditor(this._onDidChangeActiveTextEditor, this, this._disposables);
        this._controller.onDidChangeBlameInformation(() => this._onDidChangeBlameInformation(), this, this._disposables);
        this._onDidChangeConfiguration();
    }
    async provideHover(document, position, token) {
        if (token.isCancellationRequested) {
            return undefined;
        }
        const textEditor = vscode_1.window.activeTextEditor;
        if (!textEditor) {
            return undefined;
        }
        // Position must be at the end of the line
        if (position.character !== document.lineAt(position.line).range.end.character) {
            return undefined;
        }
        // Get blame information
        const blameInformation = this._controller.textEditorBlameInformation?.blameInformation;
        const lineBlameInformation = blameInformation?.find(blame => blame.lineNumber === position.line);
        if (!lineBlameInformation || typeof lineBlameInformation.blameInformation === 'string') {
            return undefined;
        }
        const contents = await this._controller.getBlameInformationHover(textEditor.document.uri, lineBlameInformation.blameInformation);
        if (!contents || token.isCancellationRequested) {
            return undefined;
        }
        return { range: getEditorDecorationRange(position.line), contents: [contents] };
    }
    _onDidChangeConfiguration(e) {
        if (e &&
            !e.affectsConfiguration('git.commitShortHashLength') &&
            !e.affectsConfiguration('git.blame.editorDecoration.template') &&
            !e.affectsConfiguration('git.blame.editorDecoration.disableHover')) {
            return;
        }
        // Cache the decoration template
        const config = vscode_1.workspace.getConfiguration('git');
        this._template = config.get('blame.editorDecoration.template', '${subject}, ${authorName} (${authorDateAgo})');
        this._registerHoverProvider();
        this._onDidChangeBlameInformation();
    }
    _onDidChangeActiveTextEditor() {
        // Clear decorations
        for (const editor of vscode_1.window.visibleTextEditors) {
            if (editor !== vscode_1.window.activeTextEditor) {
                editor.setDecorations(this._decoration, []);
            }
        }
        // Register hover provider
        this._registerHoverProvider();
    }
    _onDidChangeBlameInformation() {
        const textEditor = vscode_1.window.activeTextEditor;
        if (!textEditor) {
            return;
        }
        // Get blame information
        const blameInformation = this._controller.textEditorBlameInformation?.blameInformation;
        if (!blameInformation || blameInformation.length === 0) {
            textEditor.setDecorations(this._decoration, []);
            return;
        }
        // Set decorations for the editor
        const decorations = blameInformation.map(blame => {
            const contentText = typeof blame.blameInformation !== 'string'
                ? this._controller.formatBlameInformationMessage(textEditor.document.uri, this._template, blame.blameInformation)
                : blame.blameInformation;
            return this._createDecoration(blame.lineNumber, contentText);
        });
        textEditor.setDecorations(this._decoration, decorations);
    }
    _createDecoration(lineNumber, contentText) {
        return {
            range: getEditorDecorationRange(lineNumber),
            renderOptions: {
                after: {
                    contentText,
                    margin: '0 0 0 50px'
                }
            },
        };
    }
    _registerHoverProvider() {
        this._hoverDisposable?.dispose();
        const config = vscode_1.workspace.getConfiguration('git');
        const disableHover = config.get('blame.editorDecoration.disableHover', false);
        if (!disableHover && vscode_1.window.activeTextEditor && isResourceSchemeSupported(vscode_1.window.activeTextEditor.document.uri)) {
            this._hoverDisposable = vscode_1.languages.registerHoverProvider({
                pattern: vscode_1.window.activeTextEditor.document.uri.fsPath
            }, this);
        }
    }
    dispose() {
        this._hoverDisposable?.dispose();
        this._hoverDisposable = undefined;
        this._disposables = (0, util_1.dispose)(this._disposables);
    }
}
class GitBlameStatusBarItem {
    _controller;
    _template = '';
    _statusBarItem;
    _disposables = [];
    constructor(_controller) {
        this._controller = _controller;
        this._statusBarItem = vscode_1.window.createStatusBarItem('git.blame', vscode_1.StatusBarAlignment.Right, 200);
        this._statusBarItem.name = vscode_1.l10n.t('Git Blame Information');
        this._disposables.push(this._statusBarItem);
        vscode_1.workspace.onDidChangeConfiguration(this._onDidChangeConfiguration, this, this._disposables);
        this._controller.onDidChangeBlameInformation(() => this._onDidChangeBlameInformation(), this, this._disposables);
        this._onDidChangeConfiguration();
    }
    _onDidChangeConfiguration(e) {
        if (e &&
            !e.affectsConfiguration('git.commitShortHashLength') &&
            !e.affectsConfiguration('git.blame.statusBarItem.template')) {
            return;
        }
        // Cache the decoration template
        const config = vscode_1.workspace.getConfiguration('git');
        this._template = config.get('blame.statusBarItem.template', '${authorName} (${authorDateAgo})');
        this._onDidChangeBlameInformation();
    }
    async _onDidChangeBlameInformation() {
        if (!vscode_1.window.activeTextEditor) {
            this._statusBarItem.hide();
            return;
        }
        const blameInformation = this._controller.textEditorBlameInformation?.blameInformation;
        if (!blameInformation || blameInformation.length === 0) {
            this._statusBarItem.hide();
            return;
        }
        if (typeof blameInformation[0].blameInformation === 'string') {
            this._statusBarItem.text = `$(git-commit) ${blameInformation[0].blameInformation}`;
            this._statusBarItem.tooltip = vscode_1.l10n.t('Git Blame Information');
            this._statusBarItem.command = undefined;
        }
        else {
            this._statusBarItem.text = `$(git-commit) ${this._controller.formatBlameInformationMessage(vscode_1.window.activeTextEditor.document.uri, this._template, blameInformation[0].blameInformation)}`;
            this._statusBarItem.tooltip2 = (cancellationToken) => {
                return this._provideTooltip(vscode_1.window.activeTextEditor.document.uri, blameInformation[0].blameInformation, cancellationToken);
            };
            const uri = vscode_1.window.activeTextEditor.document.uri;
            const hash = blameInformation[0].blameInformation.hash;
            this._statusBarItem.command = {
                title: vscode_1.l10n.t('Open Commit'),
                command: 'git.viewCommit',
                arguments: [uri, hash, uri]
            };
        }
        this._statusBarItem.show();
    }
    async _provideTooltip(uri, blameInformation, cancellationToken) {
        if (cancellationToken.isCancellationRequested) {
            return undefined;
        }
        const tooltip = await this._controller.getBlameInformationHover(uri, blameInformation);
        return cancellationToken.isCancellationRequested ? undefined : tooltip;
    }
    dispose() {
        this._disposables = (0, util_1.dispose)(this._disposables);
    }
}
//# sourceMappingURL=blame.js.map