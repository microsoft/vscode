"use strict";
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.RepositoryCache = void 0;
const vscode_1 = require("vscode");
const cache_1 = require("./cache");
const util_1 = require("./util");
function isRepositoryCacheInfo(obj) {
    if (!obj || typeof obj !== 'object') {
        return false;
    }
    const rec = obj;
    return typeof rec.workspacePath === 'string' && typeof rec.repositoryPath === 'string' &&
        (rec.lastTouchedTime === undefined || typeof rec.lastTouchedTime === 'number');
}
class RepositoryCache {
    _globalState;
    _logger;
    static STORAGE_KEY = 'git.repositoryCache';
    static MAX_REPO_ENTRIES = 30; // Max repositories tracked
    static MAX_FOLDER_ENTRIES = 10; // Max folders per repository
    normalizeRepoUrl(url) {
        try {
            const trimmed = url.trim();
            return trimmed.replace(/(?:\.git)?\/*$/i, '');
        }
        catch {
            return url;
        }
    }
    // Outer LRU: repoUrl -> inner LRU (folderPathOrWorkspaceFile -> RepositoryCacheInfo).
    lru = new cache_1.LRUCache(RepositoryCache.MAX_REPO_ENTRIES);
    _recentRepositories;
    get recentRepositories() {
        if (!this._recentRepositories) {
            this._recentRepositories = new Map();
            for (const [_, inner] of this.lru) {
                for (const [, repositoryDetails] of inner) {
                    if (!repositoryDetails.repositoryPath || !repositoryDetails.lastTouchedTime) {
                        continue;
                    }
                    // Check whether the repository exists with a more recent access time
                    const repositoryLastAccessTime = this._recentRepositories.get(repositoryDetails.repositoryPath);
                    if (repositoryLastAccessTime && repositoryDetails.lastTouchedTime <= repositoryLastAccessTime) {
                        continue;
                    }
                    this._recentRepositories.set(repositoryDetails.repositoryPath, repositoryDetails.lastTouchedTime);
                }
            }
        }
        return Array.from(this._recentRepositories.entries()).map(([rootPath, lastAccessTime]) => ({ rootUri: vscode_1.Uri.file(rootPath), lastAccessTime }));
    }
    constructor(_globalState, _logger) {
        this._globalState = _globalState;
        this._logger = _logger;
        this.load();
    }
    // Exposed for testing
    get _workspaceFile() {
        return vscode_1.workspace.workspaceFile;
    }
    // Exposed for testing
    get _workspaceFolders() {
        return vscode_1.workspace.workspaceFolders;
    }
    /**
     * Associate a repository remote URL with a local workspace folder or workspace file.
     * Re-associating bumps recency and persists the updated LRU state.
     * @param repoUrl Remote repository URL (e.g. https://github.com/owner/repo.git)
     * @param rootPath Root path of the local repo clone.
     */
    set(repoUrl, rootPath) {
        const key = this.normalizeRepoUrl(repoUrl);
        let foldersLru = this.lru.get(key);
        if (!foldersLru) {
            foldersLru = new cache_1.LRUCache(RepositoryCache.MAX_FOLDER_ENTRIES);
        }
        const folderPathOrWorkspaceFile = this._findWorkspaceForRepo(rootPath);
        if (!folderPathOrWorkspaceFile) {
            return;
        }
        foldersLru.set(folderPathOrWorkspaceFile, {
            repositoryPath: rootPath,
            workspacePath: folderPathOrWorkspaceFile,
            lastTouchedTime: Date.now()
        }); // touch entry
        this.lru.set(key, foldersLru);
        this.save();
    }
    _findWorkspaceForRepo(rootPath) {
        // If the current workspace is a workspace file, use that. Otherwise, find the workspace folder that contains the rootUri
        let folderPathOrWorkspaceFile;
        try {
            if (this._workspaceFile && this._workspaceFile.scheme === 'file') {
                folderPathOrWorkspaceFile = this._workspaceFile.fsPath;
            }
            else if (this._workspaceFolders && this._workspaceFolders.length) {
                const sorted = [...this._workspaceFolders].sort((a, b) => b.uri.fsPath.length - a.uri.fsPath.length);
                for (const folder of sorted) {
                    const folderPath = folder.uri.fsPath;
                    if ((0, util_1.isDescendant)(folderPath, rootPath) || (0, util_1.isDescendant)(rootPath, folderPath)) {
                        folderPathOrWorkspaceFile = folderPath;
                        break;
                    }
                }
            }
            return folderPathOrWorkspaceFile;
        }
        catch {
            return;
        }
    }
    update(addedRemotes, removedRemotes, rootPath) {
        for (const remote of removedRemotes) {
            const url = remote.fetchUrl;
            if (!url) {
                continue;
            }
            const relatedWorkspace = this._findWorkspaceForRepo(rootPath);
            if (relatedWorkspace) {
                this.delete(url, relatedWorkspace);
            }
        }
        for (const remote of addedRemotes) {
            const url = remote.fetchUrl;
            if (!url) {
                continue;
            }
            this.set(url, rootPath);
        }
    }
    /**
     * We should possibly support converting between ssh remotes and http remotes.
     */
    get(repoUrl) {
        const key = this.normalizeRepoUrl(repoUrl);
        const inner = this.lru.get(key);
        return inner ? Array.from(inner.values()) : undefined;
    }
    delete(repoUrl, folderPathOrWorkspaceFile) {
        const key = this.normalizeRepoUrl(repoUrl);
        const inner = this.lru.get(key);
        if (!inner) {
            return;
        }
        if (!inner.remove(folderPathOrWorkspaceFile)) {
            return;
        }
        if (inner.size === 0) {
            this.lru.remove(key);
        }
        else {
            // Re-set to bump outer LRU recency after modification
            this.lru.set(key, inner);
        }
        this.save();
    }
    load() {
        try {
            const raw = this._globalState.get(RepositoryCache.STORAGE_KEY);
            if (!Array.isArray(raw)) {
                return;
            }
            for (const [repo, storedFolders] of raw) {
                if (typeof repo !== 'string' || !Array.isArray(storedFolders)) {
                    continue;
                }
                const inner = new cache_1.LRUCache(RepositoryCache.MAX_FOLDER_ENTRIES);
                for (const entry of storedFolders) {
                    if (!Array.isArray(entry) || entry.length !== 2) {
                        continue;
                    }
                    const [folderPath, info] = entry;
                    if (typeof folderPath !== 'string' || !isRepositoryCacheInfo(info)) {
                        continue;
                    }
                    inner.set(folderPath, info);
                }
                if (inner.size) {
                    this.lru.set(repo, inner);
                }
            }
        }
        catch {
            this._logger.warn('[CachedRepositories][load] Failed to load cached repositories from global state.');
        }
    }
    save() {
        // Serialize as [repoUrl, [folderPathOrWorkspaceFile, RepositoryCacheInfo][]] preserving outer LRU order.
        const serialized = [];
        for (const [repo, inner] of this.lru) {
            const folders = [];
            for (const [folder, info] of inner) {
                folders.push([folder, info]);
            }
            serialized.push([repo, folders]);
        }
        void this._globalState.update(RepositoryCache.STORAGE_KEY, serialized);
        // Invalidate recent repositories map
        this._recentRepositories?.clear();
        this._recentRepositories = undefined;
    }
}
exports.RepositoryCache = RepositoryCache;
//# sourceMappingURL=repositoryCache.js.map