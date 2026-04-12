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
exports.GitFileSystemProvider = void 0;
const vscode_1 = require("vscode");
const decorators_1 = require("./decorators");
const uri_1 = require("./uri");
const util_1 = require("./util");
const THREE_MINUTES = 1000 * 60 * 3;
const FIVE_MINUTES = 1000 * 60 * 5;
function sanitizeRef(ref, path, submoduleOf, repository) {
    if (ref === '~') {
        const fileUri = vscode_1.Uri.file(path);
        const uriString = fileUri.toString();
        const [indexStatus] = repository.indexGroup.resourceStates.filter(r => r.resourceUri.toString() === uriString);
        return indexStatus ? '' : 'HEAD';
    }
    if (/^~\d$/.test(ref)) {
        return `:${ref[1]}`;
    }
    // Submodule HEAD
    if (submoduleOf && (ref === 'index' || ref === 'wt')) {
        return 'HEAD';
    }
    return ref;
}
class GitFileSystemProvider {
    model;
    logger;
    _onDidChangeFile = new vscode_1.EventEmitter();
    onDidChangeFile = this._onDidChangeFile.event;
    changedRepositoryRoots = new Set();
    cache = new Map();
    mtime = new Date().getTime();
    disposables = [];
    constructor(model, logger) {
        this.model = model;
        this.logger = logger;
        this.disposables.push(model.onDidChangeRepository(this.onDidChangeRepository, this), model.onDidChangeOriginalResource(this.onDidChangeOriginalResource, this), vscode_1.workspace.registerFileSystemProvider('git', this, { isReadonly: true, isCaseSensitive: true }));
        setInterval(() => this.cleanup(), FIVE_MINUTES);
    }
    onDidChangeRepository({ repository }) {
        this.changedRepositoryRoots.add(repository.root);
        this.eventuallyFireChangeEvents();
    }
    onDidChangeOriginalResource({ uri }) {
        if (uri.scheme !== 'file') {
            return;
        }
        const diffOriginalResourceUri = (0, uri_1.toGitUri)(uri, '~');
        const quickDiffOriginalResourceUri = (0, uri_1.toGitUri)(uri, '', { replaceFileExtension: true });
        this.mtime = new Date().getTime();
        this._onDidChangeFile.fire([
            { type: vscode_1.FileChangeType.Changed, uri: diffOriginalResourceUri },
            { type: vscode_1.FileChangeType.Changed, uri: quickDiffOriginalResourceUri }
        ]);
    }
    eventuallyFireChangeEvents() {
        this.fireChangeEvents();
    }
    async fireChangeEvents() {
        if (!vscode_1.window.state.focused) {
            const onDidFocusWindow = (0, util_1.filterEvent)(vscode_1.window.onDidChangeWindowState, e => e.focused);
            await (0, util_1.eventToPromise)(onDidFocusWindow);
        }
        const events = [];
        for (const { uri } of this.cache.values()) {
            const fsPath = uri.fsPath;
            for (const root of this.changedRepositoryRoots) {
                if ((0, util_1.isDescendant)(root, fsPath)) {
                    events.push({ type: vscode_1.FileChangeType.Changed, uri });
                    break;
                }
            }
        }
        if (events.length > 0) {
            this.mtime = new Date().getTime();
            this._onDidChangeFile.fire(events);
        }
        this.changedRepositoryRoots.clear();
    }
    cleanup() {
        const now = new Date().getTime();
        const cache = new Map();
        for (const row of this.cache.values()) {
            const { path } = (0, uri_1.fromGitUri)(row.uri);
            const isOpen = vscode_1.workspace.textDocuments
                .filter(d => d.uri.scheme === 'file')
                .some(d => (0, util_1.pathEquals)(d.uri.fsPath, path));
            if (isOpen || now - row.timestamp < THREE_MINUTES) {
                cache.set(row.uri.toString(), row);
            }
            else {
                // TODO: should fire delete events?
            }
        }
        this.cache = cache;
    }
    async getOrOpenRepository(uri) {
        let repository = this.model.getRepository(uri);
        if (repository) {
            return repository;
        }
        // In case of the empty window, or the agent sessions window, no repositories are open
        // so we need to explicitly open a repository before we can serve git content for the
        // given git resource.
        if (vscode_1.workspace.workspaceFolders === undefined || vscode_1.workspace.isAgentSessionsWorkspace) {
            const fsPath = typeof uri === 'string' ? uri : (0, uri_1.fromGitUri)(uri).path;
            this.logger.info(`[GitFileSystemProvider][getOrOpenRepository] Opening repository for ${fsPath}`);
            await this.model.openRepository(fsPath, true, true);
            repository = this.model.getRepository(uri);
        }
        return repository;
    }
    watch() {
        return util_1.EmptyDisposable;
    }
    async stat(uri) {
        await this.model.isInitialized;
        const { submoduleOf, path, ref } = (0, uri_1.fromGitUri)(uri);
        const repository = submoduleOf
            ? await this.getOrOpenRepository(submoduleOf)
            : await this.getOrOpenRepository(uri);
        if (!repository) {
            this.logger.warn(`[GitFileSystemProvider][stat] Repository not found - ${uri.toString()}`);
            throw vscode_1.FileSystemError.FileNotFound();
        }
        try {
            const details = await repository.getObjectDetails(sanitizeRef(ref, path, submoduleOf, repository), path);
            return { type: vscode_1.FileType.File, size: details.size, mtime: this.mtime, ctime: 0 };
        }
        catch {
            // Empty tree
            if (ref === await repository.getEmptyTree()) {
                this.logger.warn(`[GitFileSystemProvider][stat] Empty tree - ${uri.toString()}`);
                return { type: vscode_1.FileType.File, size: 0, mtime: this.mtime, ctime: 0 };
            }
            // File does not exist in git. This could be because the file is untracked or ignored
            this.logger.warn(`[GitFileSystemProvider][stat] File not found - ${uri.toString()}`);
            throw vscode_1.FileSystemError.FileNotFound();
        }
    }
    readDirectory() {
        throw new Error('Method not implemented.');
    }
    createDirectory() {
        throw new Error('Method not implemented.');
    }
    async readFile(uri) {
        await this.model.isInitialized;
        const { path, ref, submoduleOf } = (0, uri_1.fromGitUri)(uri);
        if (submoduleOf) {
            const repository = await this.getOrOpenRepository(submoduleOf);
            if (!repository) {
                throw vscode_1.FileSystemError.FileNotFound();
            }
            const encoder = new TextEncoder();
            if (ref === 'index') {
                return encoder.encode(await repository.diffIndexWithHEAD(path));
            }
            else {
                return encoder.encode(await repository.diffWithHEAD(path));
            }
        }
        const repository = await this.getOrOpenRepository(uri);
        if (!repository) {
            this.logger.warn(`[GitFileSystemProvider][readFile] Repository not found - ${uri.toString()}`);
            throw vscode_1.FileSystemError.FileNotFound();
        }
        const timestamp = new Date().getTime();
        const cacheValue = { uri, timestamp };
        this.cache.set(uri.toString(), cacheValue);
        try {
            return await repository.buffer(sanitizeRef(ref, path, submoduleOf, repository), path);
        }
        catch {
            // Empty tree
            if (ref === await repository.getEmptyTree()) {
                this.logger.warn(`[GitFileSystemProvider][readFile] Empty tree - ${uri.toString()}`);
                return new Uint8Array(0);
            }
            // File does not exist in git. This could be because the file is untracked or ignored
            this.logger.warn(`[GitFileSystemProvider][readFile] File not found - ${uri.toString()}`);
            throw vscode_1.FileSystemError.FileNotFound();
        }
    }
    writeFile() {
        throw new Error('Method not implemented.');
    }
    delete() {
        throw new Error('Method not implemented.');
    }
    rename() {
        throw new Error('Method not implemented.');
    }
    dispose() {
        this.disposables.forEach(d => d.dispose());
    }
}
exports.GitFileSystemProvider = GitFileSystemProvider;
__decorate([
    (0, decorators_1.debounce)(1100)
], GitFileSystemProvider.prototype, "eventuallyFireChangeEvents", null);
__decorate([
    decorators_1.throttle
], GitFileSystemProvider.prototype, "fireChangeEvents", null);
//# sourceMappingURL=fileSystemProvider.js.map