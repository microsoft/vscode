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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var GitHubFileSystemProvider_1;
import { Emitter } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileSystemProviderErrorCode, FileType, createFileSystemProviderError } from '../../../../platform/files/common/files.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { GITHUB_REMOTE_FILE_SCHEME } from '../../sessions/common/sessionData.js';
/**
 * Derives a display name from a github-remote-file URI.
 * Returns "repo (branch)" or just "repo" when on HEAD.
 */
export function getGitHubRemoteFileDisplayName(uri) {
    if (uri.scheme !== GITHUB_REMOTE_FILE_SCHEME) {
        return undefined;
    }
    const parts = uri.path.split('/').filter(Boolean);
    // path = /{owner}/{repo}/{ref}/...
    if (parts.length >= 3) {
        const [, repo, ref] = parts;
        const decodedRepo = decodeURIComponent(repo);
        const decodedRef = decodeURIComponent(ref);
        if (decodedRef === 'HEAD') {
            return decodedRepo;
        }
        return `${decodedRepo} (${decodedRef})`;
    }
    return undefined;
}
/**
 * A readonly virtual filesystem provider backed by the GitHub REST API.
 *
 * URI format: github-remote-file://github/{owner}/{repo}/{ref}/{path...}
 *
 * For example: github-remote-file://github/microsoft/vscode/main/src/vs/base/common/uri.ts
 *
 * This provider fetches the full recursive tree from the GitHub Trees API on first
 * access and caches it. Individual file contents are fetched on demand via the
 * Blobs API.
 */
let GitHubFileSystemProvider = class GitHubFileSystemProvider extends Disposable {
    static { GitHubFileSystemProvider_1 = this; }
    /** Cache TTL - 5 minutes */
    static { this.CACHE_TTL_MS = 5 * 60 * 1000; }
    /** Negative cache TTL - 1 minute */
    static { this.NOT_FOUND_CACHE_TTL_MS = 60 * 1000; }
    constructor(requestService, authenticationService, logService) {
        super();
        this.requestService = requestService;
        this.authenticationService = authenticationService;
        this.logService = logService;
        this._onDidChangeCapabilities = this._register(new Emitter());
        this.onDidChangeCapabilities = this._onDidChangeCapabilities.event;
        this.capabilities = 2048 /* FileSystemProviderCapabilities.Readonly */ |
            2 /* FileSystemProviderCapabilities.FileReadWrite */ |
            1024 /* FileSystemProviderCapabilities.PathCaseSensitive */;
        this._onDidChangeFile = this._register(new Emitter());
        this.onDidChangeFile = this._onDidChangeFile.event;
        /** Cache keyed by "owner/repo/ref" */
        this.treeCache = new Map();
        /** Negative cache for refs that returned 404, keyed by "owner/repo/ref" */
        this.notFoundCache = new Map();
        /** In-flight fetch promises keyed by "owner/repo/ref" to deduplicate concurrent requests */
        this.pendingFetches = new Map();
    }
    // --- URI parsing
    /**
     * Parse a github-remote-file URI into its components.
     * Format: github-remote-file://github/{owner}/{repo}/{ref}/{path...}
     */
    parseUri(resource) {
        // authority = "github"
        // path = /{owner}/{repo}/{ref}/{rest...}
        const parts = resource.path.split('/').filter(Boolean);
        if (parts.length < 3) {
            throw createFileSystemProviderError('Invalid github-remote-file URI: expected /{owner}/{repo}/{ref}/...', FileSystemProviderErrorCode.FileNotFound);
        }
        const owner = decodeURIComponent(parts[0]);
        const repo = decodeURIComponent(parts[1]);
        const ref = decodeURIComponent(parts[2]);
        const path = parts.slice(3).map(decodeURIComponent).join('/');
        return { owner, repo, ref, path };
    }
    getCacheKey(owner, repo, ref) {
        return `${owner}/${repo}/${ref}`;
    }
    // --- GitHub API
    async getAuthToken() {
        let sessions = await this.authenticationService.getSessions('github', [], { silent: true });
        if (!sessions || sessions.length === 0) {
            sessions = await this.authenticationService.getSessions('github', [], { createIfNone: true });
        }
        if (!sessions || sessions.length === 0) {
            throw createFileSystemProviderError('No GitHub authentication sessions available', FileSystemProviderErrorCode.Unavailable);
        }
        return sessions[0].accessToken ?? '';
    }
    fetchTree(owner, repo, ref) {
        const cacheKey = this.getCacheKey(owner, repo, ref);
        // Check positive cache
        const cached = this.treeCache.get(cacheKey);
        if (cached && (Date.now() - cached.fetchedAt) < GitHubFileSystemProvider_1.CACHE_TTL_MS) {
            return Promise.resolve(cached);
        }
        // Check negative cache (recently returned 404)
        const notFoundAt = this.notFoundCache.get(cacheKey);
        if (notFoundAt !== undefined && (Date.now() - notFoundAt) < GitHubFileSystemProvider_1.NOT_FOUND_CACHE_TTL_MS) {
            return Promise.reject(createFileSystemProviderError(`Tree not found for ${owner}/${repo}@${ref}`, FileSystemProviderErrorCode.FileNotFound));
        }
        // Deduplicate concurrent requests for the same tree
        const pending = this.pendingFetches.get(cacheKey);
        if (pending) {
            return pending;
        }
        const promise = this.doFetchTree(owner, repo, ref, cacheKey).finally(() => {
            this.pendingFetches.delete(cacheKey);
        });
        this.pendingFetches.set(cacheKey, promise);
        return promise;
    }
    async doFetchTree(owner, repo, ref, cacheKey) {
        this.logService.info(`[SessionRepoFS] Fetching tree for ${owner}/${repo}@${ref}`);
        const token = await this.getAuthToken();
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
        const response = await this.requestService.request({
            type: 'GET',
            url,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VSCode-SessionRepoFS',
            },
            callSite: 'githubFileSystemProvider.fetchTree'
        }, CancellationToken.None);
        // Cache 404s so we don't keep re-fetching missing trees
        if (response.res.statusCode === 404) {
            this.notFoundCache.set(cacheKey, Date.now());
            throw createFileSystemProviderError(`Tree not found for ${owner}/${repo}@${ref}`, FileSystemProviderErrorCode.FileNotFound);
        }
        const data = await asJson(response);
        if (!data) {
            throw createFileSystemProviderError(`Failed to fetch tree for ${owner}/${repo}@${ref}`, FileSystemProviderErrorCode.Unavailable);
        }
        const entries = new Map();
        // Add root directory entry
        entries.set('', { type: FileType.Directory, size: 0, sha: data.sha });
        // Track directories implicitly from paths
        const dirs = new Set();
        for (const entry of data.tree) {
            const fileType = entry.type === 'tree' ? FileType.Directory : FileType.File;
            entries.set(entry.path, { type: fileType, size: entry.size ?? 0, sha: entry.sha });
            if (fileType === FileType.Directory) {
                dirs.add(entry.path);
            }
            // Ensure parent directories are tracked
            const pathParts = entry.path.split('/');
            for (let i = 1; i < pathParts.length; i++) {
                const parentPath = pathParts.slice(0, i).join('/');
                if (!dirs.has(parentPath)) {
                    dirs.add(parentPath);
                    if (!entries.has(parentPath)) {
                        entries.set(parentPath, { type: FileType.Directory, size: 0, sha: '' });
                    }
                }
            }
        }
        const cacheEntry = { entries, fetchedAt: Date.now() };
        this.treeCache.set(cacheKey, cacheEntry);
        return cacheEntry;
    }
    // --- IFileSystemProvider
    async stat(resource) {
        const { owner, repo, ref, path } = this.parseUri(resource);
        const tree = await this.fetchTree(owner, repo, ref);
        const entry = tree.entries.get(path);
        if (!entry) {
            throw createFileSystemProviderError('File not found', FileSystemProviderErrorCode.FileNotFound);
        }
        return {
            type: entry.type,
            ctime: 0,
            mtime: 0,
            size: entry.size,
        };
    }
    async readdir(resource) {
        const { owner, repo, ref, path } = this.parseUri(resource);
        const tree = await this.fetchTree(owner, repo, ref);
        const prefix = path ? path + '/' : '';
        const result = [];
        for (const [entryPath, entry] of tree.entries) {
            if (!entryPath.startsWith(prefix)) {
                continue;
            }
            const relativePath = entryPath.slice(prefix.length);
            // Only include direct children (no nested paths)
            if (relativePath && !relativePath.includes('/')) {
                result.push([relativePath, entry.type]);
            }
        }
        return result;
    }
    async readFile(resource) {
        const { owner, repo, ref, path } = this.parseUri(resource);
        const tree = await this.fetchTree(owner, repo, ref);
        const entry = tree.entries.get(path);
        if (!entry || entry.type === FileType.Directory) {
            throw createFileSystemProviderError('File not found', FileSystemProviderErrorCode.FileNotFound);
        }
        const token = await this.getAuthToken();
        // Fetch file content via the Blobs API
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${encodeURIComponent(entry.sha)}`;
        const response = await this.requestService.request({
            type: 'GET',
            url,
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'VSCode-SessionRepoFS',
            },
            callSite: 'githubFileSystemProvider.readFile'
        }, CancellationToken.None);
        const data = await asJson(response);
        if (!data) {
            throw createFileSystemProviderError(`Failed to read file ${path}`, FileSystemProviderErrorCode.Unavailable);
        }
        if (data.encoding === 'base64') {
            const binaryString = atob(data.content.replace(/\n/g, ''));
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return bytes;
        }
        return new TextEncoder().encode(data.content);
    }
    // --- Readonly stubs
    watch() {
        return Disposable.None;
    }
    async writeFile(_resource, _content, _opts) {
        throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    async mkdir(_resource) {
        throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    async delete(_resource, _opts) {
        throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    async rename(_from, _to, _opts) {
        throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
    }
    // --- Cache management
    invalidateCache(owner, repo, ref) {
        const cacheKey = this.getCacheKey(owner, repo, ref);
        this.treeCache.delete(cacheKey);
        this.notFoundCache.delete(cacheKey);
    }
    dispose() {
        this.treeCache.clear();
        this.notFoundCache.clear();
        this.pendingFetches.clear();
        super.dispose();
    }
};
GitHubFileSystemProvider = GitHubFileSystemProvider_1 = __decorate([
    __param(0, IRequestService),
    __param(1, IAuthenticationService),
    __param(2, ILogService)
], GitHubFileSystemProvider);
export { GitHubFileSystemProvider };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViRmlsZVN5c3RlbVByb3ZpZGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9maWxlVHJlZVZpZXcvYnJvd3Nlci9naXRodWJGaWxlU3lzdGVtUHJvdmlkZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsVUFBVSxFQUFlLE1BQU0sc0NBQXNDLENBQUM7QUFFL0UsT0FBTyxFQUFrQywyQkFBMkIsRUFBRSxRQUFRLEVBQXVILDZCQUE2QixFQUFlLE1BQU0sNENBQTRDLENBQUM7QUFDcFMsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN6RixPQUFPLEVBQUUsc0JBQXNCLEVBQUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNoSCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM1RSxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0sd0NBQXdDLENBQUM7QUFDckUsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFFakY7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLDhCQUE4QixDQUFDLEdBQVE7SUFDdEQsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLHlCQUF5QixFQUFFLENBQUM7UUFDOUMsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUNELE1BQU0sS0FBSyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNsRCxtQ0FBbUM7SUFDbkMsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDO1FBQ3ZC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LFFBQVEsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFFdEUsMENBQTBDO1FBQzFDLE1BQU0sSUFBSSxHQUFHLElBQUksR0FBRyxFQUFVLENBQUM7UUFFL0IsS0FBSyxNQUFNLEtBQUssSUFBSSxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7WUFDNUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLEVBQUUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDO1lBRW5GLElBQUksUUFBUSxLQUFLLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDckMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLENBQUM7WUFDdEIsQ0FBQztZQUVELHdDQUF3QztZQUN4QyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUN4QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUMzQyxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7Z0JBQ25ELElBQUksQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7b0JBQzNCLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7b0JBQ3JCLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7d0JBQzlCLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsRUFBRSxHQUFHLEVBQUUsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDekUsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLFVBQVUsR0FBb0IsRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDO1FBQ3ZFLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxVQUFVLENBQUMsQ0FBQztRQUN6QyxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0lBRUQsMEJBQTBCO0lBRTFCLEtBQUssQ0FBQyxJQUFJLENBQUMsUUFBYTtRQUN2QixNQUFNLEVBQUUsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsSUFBSSxFQUFFLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUMzRCxNQUFNLElBQUksR0FBRyxNQUFNLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQztRQUNwRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUVyQyxJQUFJLENBQUMsS0FBSyxFQUFFLENBQUM7WUFDWixNQUFNLDZCQUE2QixDQUFDLGdCQUFnQixFQUFFLDJCQUEyQixDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ2pHLENBQUM7UUFFRCxPQUFPO1lBQ04sSUFBSSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2hCLEtBQUssRUFBRSxDQUFDO1lBQ1IsS0FBSyxFQUFFLENBQUM7WUFDUixJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7U0FDaEIsQ0FBQztJQUNILENBQUM7SUFFRCxLQUFLLENBQUMsT0FBTyxDQUFDLFFBQWE7UUFDMUIsTUFBTSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDM0QsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFFcEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDdEMsTUFBTSxNQUFNLEdBQXlCLEVBQUUsQ0FBQztRQUV4QyxLQUFLLE1BQU0sQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQy9DLElBQUksQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7Z0JBQ25DLFNBQVM7WUFDVixDQUFDO1lBRUQsTUFBTSxZQUFZLEdBQUcsU0FBUyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDcEQsaURBQWlEO1lBQ2pELElBQUksWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNqRCxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO1FBRUQsT0FBTyxNQUFNLENBQUM7SUFDZixDQUFDO0lBRUQsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFhO1FBQzNCLE1BQU0sRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxJQUFJLEVBQUUsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNELE1BQU0sSUFBSSxHQUFHLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO1FBRXJDLElBQUksQ0FBQyxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxRQUFRLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDakQsTUFBTSw2QkFBNkIsQ0FBQyxnQkFBZ0IsRUFBRSwyQkFBMkIsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNqRyxDQUFDO1FBRUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFFeEMsdUNBQXVDO1FBQ3ZDLE1BQU0sR0FBRyxHQUFHLGdDQUFnQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsSUFBSSxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsY0FBYyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQztRQUMvSSxNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDO1lBQ2xELElBQUksRUFBRSxLQUFLO1lBQ1gsR0FBRztZQUNILE9BQU8sRUFBRTtnQkFDUixlQUFlLEVBQUUsU0FBUyxLQUFLLEVBQUU7Z0JBQ2pDLFFBQVEsRUFBRSxnQ0FBZ0M7Z0JBQzFDLFlBQVksRUFBRSxzQkFBc0I7YUFDcEM7WUFDRCxRQUFRLEVBQUUsbUNBQW1DO1NBQzdDLEVBQUUsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFM0IsTUFBTSxJQUFJLEdBQUcsTUFBTSxNQUFNLENBQXdDLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNYLE1BQU0sNkJBQTZCLENBQUMsdUJBQXVCLElBQUksRUFBRSxFQUFFLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxDQUFDO1FBQzdHLENBQUM7UUFFRCxJQUFJLElBQUksQ0FBQyxRQUFRLEtBQUssUUFBUSxFQUFFLENBQUM7WUFDaEMsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBQzNELE1BQU0sS0FBSyxHQUFHLElBQUksVUFBVSxDQUFDLFlBQVksQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUNsRCxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRSxDQUFDO2dCQUM5QyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsWUFBWSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUN2QyxDQUFDO1lBQ0QsT0FBTyxLQUFLLENBQUM7UUFDZCxDQUFDO1FBRUQsT0FBTyxJQUFJLFdBQVcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELHFCQUFxQjtJQUVyQixLQUFLO1FBQ0osT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDO0lBQ3hCLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLFNBQWMsRUFBRSxRQUFvQixFQUFFLEtBQXdCO1FBQzdFLE1BQU0sNkJBQTZCLENBQUMseUJBQXlCLEVBQUUsMkJBQTJCLENBQUMsYUFBYSxDQUFDLENBQUM7SUFDM0csQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFLLENBQUMsU0FBYztRQUN6QixNQUFNLDZCQUE2QixDQUFDLHlCQUF5QixFQUFFLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzNHLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLFNBQWMsRUFBRSxLQUF5QjtRQUNyRCxNQUFNLDZCQUE2QixDQUFDLHlCQUF5QixFQUFFLDJCQUEyQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0lBQzNHLENBQUM7SUFFRCxLQUFLLENBQUMsTUFBTSxDQUFDLEtBQVUsRUFBRSxHQUFRLEVBQUUsS0FBNEI7UUFDOUQsTUFBTSw2QkFBNkIsQ0FBQyx5QkFBeUIsRUFBRSwyQkFBMkIsQ0FBQyxhQUFhLENBQUMsQ0FBQztJQUMzRyxDQUFDO0lBRUQsdUJBQXVCO0lBRXZCLGVBQWUsQ0FBQyxLQUFhLEVBQUUsSUFBWSxFQUFFLEdBQVc7UUFDdkQsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxDQUFDO1FBQ3BELElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ2hDLElBQUksQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0lBQ3JDLENBQUM7SUFFUSxPQUFPO1FBQ2YsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztRQUN2QixJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxjQUFjLENBQUMsS0FBSyxFQUFFLENBQUM7UUFDNUIsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ2pCLENBQUM7O0FBMVJXLHdCQUF3QjtJQTZCbEMsV0FBQSxlQUFlLENBQUE7SUFDZixXQUFBLHNCQUFzQixDQUFBO0lBQ3RCLFdBQUEsV0FBVyxDQUFBO0dBL0JELHdCQUF3QixDQTJScEMifQ==