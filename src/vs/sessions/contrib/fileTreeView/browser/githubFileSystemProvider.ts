/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../base/common/buffer.js';
import { getErrorMessage, isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { ByteSize, createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderError, FileSystemProviderErrorCode, FileType, IFileChange, IFileDeleteOptions, IFileOverwriteOptions, IFileSystemProviderWithFileReadWriteCapability, IFileWriteOptions, IStat } from '../../../../platform/files/common/files.js';
import { RepositoryRef } from '../../../../platform/github/common/client/types.js';
import { GitTree, IContentClient } from '../../../../platform/github/common/content/content.js';
import { GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { GitHubApiClient } from '../../github/browser/githubApiClient.js';

interface ITreeCacheEntry {
	/** Map from path → entry metadata */
	readonly entries: Map<string, { type: FileType; size: number; sha: string }>;
	/** Map from directory path → its direct children, in tree order */
	readonly children: Map<string, [string, FileType][]>;
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

	private readonly client: GitHubApiClient;

	readonly onDidChangeCapabilities: Event<void> = Event.None;

	readonly capabilities: FileSystemProviderCapabilities =
		FileSystemProviderCapabilities.Readonly |
		FileSystemProviderCapabilities.FileReadWrite |
		FileSystemProviderCapabilities.PathCaseSensitive;

	readonly onDidChangeFile: Event<readonly IFileChange[]> = Event.None;

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

	private static readonly MAX_FILE_SIZE_BYTES = 10 * ByteSize.MB;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.client = this._register(instantiationService.createInstance(GitHubApiClient));
		this._register(this.client.onDidChange(() => this.clearCaches()));
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

	// --- GitHub API

	private async withContentClient<T>(task: (client: IContentClient, signal: AbortSignal) => Promise<T>): Promise<T> {
		try {
			return await this.client.withClient((client, signal) => {
				if (client.authorization.providerId !== 'github') {
					throw createFileSystemProviderError(localize('githubFileSystem.accountRequired', "Select a GitHub.com account to read this repository."), FileSystemProviderErrorCode.NoPermissions);
				}
				return task(client.content, signal);
			});
		} catch (error) {
			if (isCancellationError(error) || error instanceof FileSystemProviderError) {
				throw error;
			}
			this.logService.warn('[SessionRepoFS] GitHub filesystem read failed', error);
			const kind = error instanceof GitHubRequestError ? error.kind : undefined;
			if (kind === 'responseTooLarge') {
				throw createFileSystemProviderError(localize('githubFileSystem.responseTooLarge', "The GitHub response exceeds the download limit. Clone the repository to open larger files locally."), FileSystemProviderErrorCode.FileTooLarge);
			}
			const code = kind === 'notFound'
				? FileSystemProviderErrorCode.FileNotFound
				: kind === 'authentication' || kind === 'authorization'
					? FileSystemProviderErrorCode.NoPermissions
					: FileSystemProviderErrorCode.Unavailable;
			throw createFileSystemProviderError(getErrorMessage(error), code);
		}
	}

	private fetchTree(client: IContentClient, repository: RepositoryRef, ref: string, signal: AbortSignal): Promise<ITreeCacheEntry> {
		const { owner, repo } = repository;
		const cacheKey = `${owner}/${repo}/${ref}`;

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

		const promise = this.doFetchTree(client, repository, ref, cacheKey, signal).finally(() => {
			if (this.pendingFetches.get(cacheKey) === promise) {
				this.pendingFetches.delete(cacheKey);
			}
		});
		this.pendingFetches.set(cacheKey, promise);
		return promise;
	}

	private async doFetchTree(client: IContentClient, repository: RepositoryRef, ref: string, cacheKey: string, signal: AbortSignal): Promise<ITreeCacheEntry> {
		const { owner, repo } = repository;
		this.logService.info(`[SessionRepoFS] Fetching tree for ${owner}/${repo}@${ref}`);
		let data: GitTree;
		try {
			data = await client.getTree(repository, ref, signal, {
				query: { recursive: true },
				caller: 'githubFileSystemProvider.fetchTree',
			});
		} catch (error) {
			signal.throwIfAborted();
			if (error instanceof GitHubRequestError && error.kind === 'notFound') {
				this.notFoundCache.set(cacheKey, Date.now());
			}
			throw error;
		}
		signal.throwIfAborted();
		if (data.truncated) {
			throw createFileSystemProviderError(localize('githubFileSystem.truncatedTree', "The repository tree for {0}/{1}@{2} is incomplete and cannot be displayed.", owner, repo, ref), FileSystemProviderErrorCode.Unavailable);
		}

		const entries = new Map<string, { type: FileType; size: number; sha: string }>();

		// Add root directory entry
		entries.set('', { type: FileType.Directory, size: 0, sha: data.sha });

		for (const entry of data.tree) {
			const fileType = entry.type === 'tree' ? FileType.Directory : FileType.File;
			entries.set(entry.path, { type: fileType, size: entry.size ?? 0, sha: entry.sha });

			// Ensure parent directories are tracked
			const pathParts = entry.path.split('/');
			for (let i = 1; i < pathParts.length; i++) {
				const parentPath = pathParts.slice(0, i).join('/');
				if (!entries.has(parentPath)) {
					entries.set(parentPath, { type: FileType.Directory, size: 0, sha: '' });
				}
			}
		}

		const children = new Map<string, [string, FileType][]>();
		for (const [entryPath, entry] of entries) {
			if (!entryPath) {
				continue;
			}
			const separator = entryPath.lastIndexOf('/');
			const parentPath = separator === -1 ? '' : entryPath.slice(0, separator);
			let siblings = children.get(parentPath);
			if (!siblings) {
				siblings = [];
				children.set(parentPath, siblings);
			}
			siblings.push([entryPath.slice(separator + 1), entry.type]);
		}

		const cacheEntry: ITreeCacheEntry = { entries, children, fetchedAt: Date.now() };
		this.treeCache.set(cacheKey, cacheEntry);
		return cacheEntry;
	}

	// --- IFileSystemProvider

	async stat(resource: URI): Promise<IStat> {
		const repository = this.parseUri(resource);
		const { ref, path } = repository;
		return this.withContentClient(async (client, signal) => {
			const tree = await this.fetchTree(client, repository, ref, signal);
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
		});
	}

	async readdir(resource: URI): Promise<[string, FileType][]> {
		const repository = this.parseUri(resource);
		const { ref, path } = repository;
		return this.withContentClient(async (client, signal) => {
			const tree = await this.fetchTree(client, repository, ref, signal);
			return [...(tree.children.get(path) ?? [])];
		});
	}

	async readFile(resource: URI): Promise<Uint8Array> {
		const repository = this.parseUri(resource);
		const { ref, path } = repository;
		return this.withContentClient(async (client, signal) => {
			const tree = await this.fetchTree(client, repository, ref, signal);
			const entry = tree.entries.get(path);

			if (!entry || entry.type === FileType.Directory) {
				throw createFileSystemProviderError('File not found', FileSystemProviderErrorCode.FileNotFound);
			}

			this.checkFileSize(entry.size);
			const data = await client.getBlob(repository, entry.sha, signal, { caller: 'githubFileSystemProvider.readFile' });
			const bytes = decodeBase64(data.content.replace(/\s/g, '')).buffer;
			this.checkFileSize(bytes.byteLength);
			return bytes;
		});
	}

	private checkFileSize(size: number): void {
		if (size > GitHubFileSystemProvider.MAX_FILE_SIZE_BYTES) {
			throw createFileSystemProviderError(localize('githubFileSystem.fileTooLarge', "This file exceeds the {0} MiB limit for GitHub repository files. Clone the repository to open it locally.", GitHubFileSystemProvider.MAX_FILE_SIZE_BYTES / ByteSize.MB), FileSystemProviderErrorCode.FileTooLarge);
		}
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

	private clearCaches(): void {
		this.treeCache.clear();
		this.notFoundCache.clear();
		this.pendingFetches.clear();
	}

	override dispose(): void {
		this.clearCaches();
		super.dispose();
	}
}
