/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileType, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat, createFileSystemProviderError, IFileChange } from '../../../../platform/files/common/files.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IAuthenticationService } from '../../../../workbench/services/authentication/common/authentication.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export const GITHUB_REMOTE_FILE_SCHEME = 'github-remote-file';

/**
 * Derives a display name from a github-remote-file URI.
 * Returns "repo (branch)" or just "repo" when on HEAD.
 */
export function getGitHubRemoteFileDisplayName(uri: URI): string | undefined {
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
 * GitHub REST API response for the Trees endpoint.
 * GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1
 */
interface IGitHubTreeResponse {
	readonly sha: string;
	readonly url: string;
	readonly truncated: boolean;
	readonly tree: readonly IGitHubTreeEntry[];
}

interface IGitHubTreeEntry {
	readonly path: string;
	readonly mode: string;
	readonly type: 'blob' | 'tree';
	readonly sha: string;
	readonly size?: number;
	readonly url: string;
}

interface ITreeCacheEntry {
	/** Map from path → entry metadata */
	readonly entries: Map<string, { type: FileType; size: number; sha: string }>;
	readonly fetchedAt: number;
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
export class GitHubFileSystemProvider extends Disposable implements IFileSystemProviderWithFileReadWriteCapability {

	private readonly _onDidChangeCapabilities = this._register(new Emitter<void>());
	readonly onDidChangeCapabilities: Event<void> = this._onDidChangeCapabilities.event;

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.Readonly |
		FileSystemProviderCapabilities.FileReadWrite |
		FileSystemProviderCapabilities.PathCaseSensitive;

	private readonly _onDidChangeFile = this._register(new Emitter<readonly IFileChange[]>());
	readonly onDidChangeFile: Event<readonly IFileChange[]> = this._onDidChangeFile.event;

	/** Cache keyed by "owner/repo/ref" */
	private readonly treeCache = new Map<string, ITreeCacheEntry>();

	/** Negative cache for refs that returned 404, keyed by "owner/repo/ref" */
	private readonly notFoundCache = new Map<string, number>();

	/** In-flight fetch promises keyed by "owner/repo/ref" to deduplicate concurrent requests */
	private readonly pendingFetches = new Map<string, Promise<ITreeCacheEntry>>();

	/** Cache TTL - 5 minutes */
	private static readonly CACHE_TTL_MS = 5 * 60 * 1000;

	/** Negative cache TTL - 1 minute */
	private static readonly NOT_FOUND_CACHE_TTL_MS = 60 * 1000;

	constructor(
		@IRequestService private readonly requestService: IRequestService,
		@IAuthenticationService private readonly authenticationService: IAuthenticationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	// --- URI parsing

	/**
	 * Parse a github-remote-file URI into its components.
	 * Format: github-remote-file://github/{owner}/{repo}/{ref}/{path...}
	 */
	private parseUri(resource: URI): { owner: string; repo: string; ref: string; path: string } {
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

	private getCacheKey(owner: string, repo: string, ref: string): string {
		return `${owner}/${repo}/${ref}`;
	}

	// --- GitHub API

	private async getAuthToken(): Promise<string> {
		const sessions = await this.authenticationService.getSessions('github', ['repo'], { silent: true }) ?? await this.authenticationService.getSessions('github', ['repo'], { createIfNone: true });
		return sessions[0].accessToken ?? '';
	}

	private fetchTree(owner: string, repo: string, ref: string): Promise<ITreeCacheEntry> {
		const cacheKey = this.getCacheKey(owner, repo, ref);

		// Check positive cache
		const cached = this.treeCache.get(cacheKey);
		if (cached && (Date.now() - cached.fetchedAt) < GitHubFileSystemProvider.CACHE_TTL_MS) {
			return Promise.resolve(cached);
		}

		// Check negative cache (recently returned 404)
		const notFoundAt = this.notFoundCache.get(cacheKey);
		if (notFoundAt !== undefined && (Date.now() - notFoundAt) < GitHubFileSystemProvider.NOT_FOUND_CACHE_TTL_MS) {
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

	private async doFetchTree(owner: string, repo: string, ref: string, cacheKey: string): Promise<ITreeCacheEntry> {
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
		}, CancellationToken.None);

		// Cache 404s so we don't keep re-fetching missing trees
		if (response.res.statusCode === 404) {
			this.notFoundCache.set(cacheKey, Date.now());
			throw createFileSystemProviderError(`Tree not found for ${owner}/${repo}@${ref}`, FileSystemProviderErrorCode.FileNotFound);
		}

		const data = await asJson<IGitHubTreeResponse>(response);

		if (!data) {
			throw createFileSystemProviderError(`Failed to fetch tree for ${owner}/${repo}@${ref}`, FileSystemProviderErrorCode.Unavailable);
		}

		const entries = new Map<string, { type: FileType; size: number; sha: string }>();

		// Add root directory entry
		entries.set('', { type: FileType.Directory, size: 0, sha: data.sha });

		// Track directories implicitly from paths
		const dirs = new Set<string>();

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

		const cacheEntry: ITreeCacheEntry = { entries, fetchedAt: Date.now() };
		this.treeCache.set(cacheKey, cacheEntry);
		return cacheEntry;
	}

	// --- IFileSystemProvider

	async stat(resource: URI): Promise<IStat> {
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

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const { owner, repo, ref, path } = this.parseUri(resource);
		const tree = await this.fetchTree(owner, repo, ref);

		const prefix = path ? path + '/' : '';
		const result: [string, FileType][] = [];

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

	async readFile(resource: URI): Promise<Uint8Array> {
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
		}, CancellationToken.None);

		const data = await asJson<{ content: string; encoding: string }>(response);
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

	watch(): IDisposable {
		return Disposable.None;
	}

	async writeFile(_resource: URI, _content: Uint8Array, _opts: IFileWriteOptions): Promise<void> {
		throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async mkdir(_resource: URI): Promise<void> {
		throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async delete(_resource: URI, _opts: IFileDeleteOptions): Promise<void> {
		throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	async rename(_from: URI, _to: URI, _opts: IFileOverwriteOptions): Promise<void> {
		throw createFileSystemProviderError('Operation not supported', FileSystemProviderErrorCode.NoPermissions);
	}

	// --- Cache management

	invalidateCache(owner: string, repo: string, ref: string): void {
		const cacheKey = this.getCacheKey(owner, repo, ref);
		this.treeCache.delete(cacheKey);
		this.notFoundCache.delete(cacheKey);
	}

	override dispose(): void {
		this.treeCache.clear();
		this.notFoundCache.clear();
		this.pendingFetches.clear();
		super.dispose();
	}
}
