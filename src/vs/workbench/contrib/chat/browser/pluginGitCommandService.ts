/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../base/common/errors.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { RepositoryRef } from '../../../../platform/github/common/client/types.js';
import { IContentClient } from '../../../../platform/github/common/content/content.js';
import { GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';
import { fetchAndExtractGitHubRepo, parseGitHubCloneUrl } from './githubRepoFetcher.js';
import { getExistingGitHubAuthenticationSession } from './pluginGitHubAuthentication.js';

/** Storage key for the per-target metadata index used by this service. */
const BROWSER_CACHE_STORAGE_KEY = 'chat.plugins.browserCache.v1';

/**
 * Per-target metadata persisted via {@link IStorageService}. Keyed by the
 * `targetDir.toString()` of the cloned repository so we can answer
 * `revParse('HEAD')` and detect "is the cached snapshot still current?" on
 * `pull()` without an extra GitHub round-trip.
 */
interface IBrowserPluginCacheEntry {
	readonly owner: string;
	readonly repo: string;
	readonly ref?: string;
	readonly sha: string;
	readonly fetchedAt: number;
}

type IStoredBrowserPluginCache = Record<string, IBrowserPluginCacheEntry>;

/** Materializes GitHub trees and blobs through typed clients, retaining per-target SHAs for updates and pinned checkouts. */
export class BrowserPluginGitCommandService implements IPluginGitService {
	declare readonly _serviceBrand: undefined;

	private _cache: Map<string, IBrowserPluginCacheEntry> | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IWorkbenchGitHubService private readonly _gitHubService: IWorkbenchGitHubService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) { }

	async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string, token?: CancellationToken): Promise<void> {
		const repo = this._parseOrThrow(cloneUrl);
		const cancel = token ?? CancellationToken.None;
		const clone = async (content: IContentClient, signal: AbortSignal): Promise<void> => {
			const sha = await content.resolveRef(repo, ref || 'HEAD', signal, { caller: 'pluginGit.resolveSha' });
			await fetchAndExtractGitHubRepo(content, this._fileService, this._logService, repo, sha, targetDir, signal);
			this._setCacheEntry(targetDir, { ...repo, ref, sha, fetchedAt: Date.now() });
		};

		const initialSession = await getExistingGitHubAuthenticationSession(this._authenticationService, this._logService);
		const attempts: Array<() => Promise<AuthenticationSession | undefined>> = [
			async () => initialSession,
		];
		if (initialSession) {
			attempts.push(async () => undefined);
		}
		attempts.push(() => this._requestGitHubSession(repo));

		for (const getSession of attempts) {
			if (cancel.isCancellationRequested) {
				throw new CancellationError();
			}
			try {
				await this._withContentClient(repo, await getSession(), cancel, clone);
				return;
			} catch (err) {
				if (!isGitHubAuthenticationError(err)) {
					throw err;
				}
			}
		}

		throw new Error(localize(
			'pluginsBrowserGitHubAccessRequired',
			"GitHub authentication is required to install '{0}'. Sign in with an account that has access to this repository, then try again.",
			`${repo.owner}/${repo.repo}`,
		));
	}

	async pull(repoDir: URI, token?: CancellationToken): Promise<boolean> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot pull plugin: no cached metadata for ${repoDir.toString()}`);
		}
		const cancel = token ?? CancellationToken.None;
		const session = await getExistingGitHubAuthenticationSession(this._authenticationService, this._logService);
		return this._withContentClient(entry, session, cancel, async (content, signal) => {
			const newSha = await content.resolveRef(entry, entry.ref || 'HEAD', signal, { caller: 'pluginGit.resolveSha' });
			if (newSha === entry.sha) {
				return false;
			}
			await fetchAndExtractGitHubRepo(content, this._fileService, this._logService, entry, newSha, repoDir, signal);
			this._setCacheEntry(repoDir, { ...entry, sha: newSha, fetchedAt: Date.now() });
			return true;
		});
	}

	async checkout(repoDir: URI, treeish: string, _detached?: boolean, token?: CancellationToken): Promise<void> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot checkout plugin: no cached metadata for ${repoDir.toString()}`);
		}

		const cancel = token ?? CancellationToken.None;
		const session = await getExistingGitHubAuthenticationSession(this._authenticationService, this._logService);
		const requestedRef = treeish.trim();

		// 40-hex SHA refs skip the resolveSha round-trip (clone pins to the SHA already).
		const isFullSha = /^[0-9a-f]{40}$/i.test(requestedRef);
		if (isFullSha && requestedRef.toLowerCase() === entry.sha.toLowerCase()) {
			return;
		}
		await this._withContentClient(entry, session, cancel, async (content, signal) => {
			const requestedSha = isFullSha
				? requestedRef.toLowerCase()
				: await content.resolveRef(entry, requestedRef || 'HEAD', signal, { caller: 'pluginGit.resolveSha' });
			await this._materializeCommit(content, repoDir, entry, requestedSha, isFullSha ? entry.ref : requestedRef, signal);
		});
	}

	async checkoutCommit(repoDir: URI, commit: string, token?: CancellationToken): Promise<void> {
		const expectedCommit = commit.trim().toLowerCase();
		if (!/^[0-9a-f]{40}$/.test(expectedCommit)) {
			throw new Error(localize('pluginsInvalidPinnedCommit', "Pinned plugin commit '{0}' is not a full SHA-1 hash.", commit));
		}

		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot checkout plugin: no cached metadata for ${repoDir.toString()}`);
		}
		if (entry.sha.toLowerCase() === expectedCommit) {
			return;
		}

		const cancel = token ?? CancellationToken.None;
		const session = await getExistingGitHubAuthenticationSession(this._authenticationService, this._logService);
		await this._withContentClient(entry, session, cancel, async (content, signal) => {
			const resolvedCommit = (await content.resolveRef(entry, expectedCommit, signal, { caller: 'pluginGit.resolveSha' })).toLowerCase();
			if (resolvedCommit !== expectedCommit) {
				throw new Error(localize('pluginsPinnedCommitResolutionMismatch', "Pinned plugin commit '{0}' resolved to a different commit '{1}'.", commit, resolvedCommit));
			}
			await this._materializeCommit(content, repoDir, entry, resolvedCommit, entry.ref, signal);
		});
		const checkedOutCommit = (await this.revParse(repoDir, 'HEAD')).toLowerCase();
		if (checkedOutCommit !== expectedCommit) {
			throw new Error(localize('pluginsPinnedCommitCheckoutMismatch', "Pinned plugin commit '{0}' was not checked out. The repository is at commit '{1}'.", commit, checkedOutCommit));
		}
	}

	async revParse(repoDir: URI, ref: string): Promise<string> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot resolve ref: no cached metadata for ${repoDir.toString()}`);
		}
		// Reject unrelated SHAs so callers notice they got a cache hit instead of `git rev-parse`.
		const trimmed = ref.trim();
		const isFullSha = /^[0-9a-f]{40}$/i.test(trimmed);
		if (isFullSha && trimmed.toLowerCase() !== entry.sha.toLowerCase()) {
			throw new Error(`Cannot resolve ref '${ref}' in tree-cached plugin: only HEAD/${entry.sha} is materialised`);
		}
		return entry.sha;
	}

	async fetch(_repoDir: URI, _token?: CancellationToken): Promise<void> {
		// No-op: there is no local git database. `pull()` re-fetches when needed.
	}

	async fetchRepository(_repoDir: URI, _token?: CancellationToken): Promise<void> {
		// No-op for the same reason as `fetch()`.
	}

	async revListCount(_repoDir: URI, _fromRef: string, _toRef: string): Promise<number> {
		// No commit history available in the cache; 0 means "up to date" to
		// the silent-fetch caller in `AgentPluginRepositoryService.fetchRepository`.
		return 0;
	}

	// -- helpers --------------------------------------------------------------

	private async _materializeCommit(content: IContentClient, repoDir: URI, entry: IBrowserPluginCacheEntry, commit: string, ref: string | undefined, signal: AbortSignal): Promise<void> {
		if (commit === entry.sha.toLowerCase()) {
			return;
		}

		await fetchAndExtractGitHubRepo(content, this._fileService, this._logService, entry, commit, repoDir, signal);
		this._setCacheEntry(repoDir, { ...entry, ref, sha: commit, fetchedAt: Date.now() });
	}

	private async _withContentClient<T>(repo: RepositoryRef, session: AuthenticationSession | undefined, token: CancellationToken, operation: (content: IContentClient, signal: AbortSignal) => Promise<T>): Promise<T> {
		const lifetime = new DisposableStore();
		const controller = new AbortController();
		const signal = AbortSignal.any([CancellationToken.toAbortSignal(token, lifetime), controller.signal]);
		try {
			let content: IContentClient;
			if (session) {
				const client = lifetime.add(await this._gitHubService.acquireAccountApiClient({
					providerId: 'github', sessionId: session.id, accountId: session.account.id, scopes: session.scopes,
					...(session.authorizationServer ? { authorizationServer: session.authorizationServer.toString() } : {}),
				}, signal));
				lifetime.add(client.onDidInvalidate(() => controller.abort(new CancellationError())));
				content = client.content;
			} else {
				content = lifetime.add(await this._gitHubService.acquireAnonymousApiClient(signal)).content;
			}
			signal.throwIfAborted();
			return await operation(content, signal);
		} catch (error) {
			signal.throwIfAborted();
			this._maybeLogTransientError(error, repo);
			throw error;
		} finally {
			lifetime.dispose();
		}
	}

	private _parseOrThrow(cloneUrl: string): RepositoryRef {
		const parsed = parseGitHubCloneUrl(cloneUrl);
		if (!parsed) {
			throw new Error(localize(
				'pluginsBrowserUnsupportedHost',
				"Agent plugins in the browser can only be installed from GitHub HTTPS URLs. To install '{0}', use the desktop application or connect to a remote agent host.",
				cloneUrl,
			));
		}
		return parsed;
	}

	private _maybeLogTransientError(err: unknown, repo: RepositoryRef): void {
		if (isCancellationError(err)) {
			return;
		}
		if (isGitHubAuthenticationError(err)) {
			this._logService.warn(`[BrowserPluginGitCommandService] GitHub auth required for ${repo.owner}/${repo.repo}: ${err.message}`);
		} else if (err instanceof GitHubRequestError && err.kind === 'rateLimit') {
			this._logService.warn(`[BrowserPluginGitCommandService] GitHub rate limit hit for ${repo.owner}/${repo.repo}: ${err.message}`);
		} else if (err instanceof Error) {
			// Surface the URL + cause so opaque `TypeError: Failed to fetch` errors
			// (CORS, DNS, offline) don't reach the user without context.
			const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : '';
			this._logService.error(`[BrowserPluginGitCommandService] Clone failed for ${repo.owner}/${repo.repo}: ${err.message}${cause}`);
		}
	}

	private async _requestGitHubSession(repo: RepositoryRef): Promise<AuthenticationSession> {
		try {
			return await this._authenticationService.createSession('github', ['repo'], { activateImmediate: true });
		} catch (err) {
			this._logService.trace('[BrowserPluginGitCommandService] GitHub session request failed:', err);
			throw new Error(localize(
				'pluginsBrowserGitHubSignInRequired',
				"Sign in to GitHub with an account that has access to '{0}' to install this plugin.",
				`${repo.owner}/${repo.repo}`,
			));
		}
	}

	// -- metadata cache (IStorageService) -------------------------------------

	private _cacheKey(targetDir: URI): string {
		// Normalise trailing slashes / percent-encoding case so semantically-equivalent URIs hit the same entry.
		return getComparisonKey(targetDir, true);
	}

	private async _pruneStaleEntries(cache: Map<string, IBrowserPluginCacheEntry>, knownDirs: ReadonlyMap<string, URI>): Promise<void> {
		// Best-effort background sweep of cache entries whose target dir no
		// longer exists; the next read for a removed key would re-clone anyway.
		const removed: string[] = [];
		await Promise.all(Array.from(knownDirs, async ([key, uri]) => {
			try {
				if (!(await this._fileService.exists(uri))) {
					removed.push(key);
				}
			} catch {
				// ignore -- treat as still-present rather than risk a false-positive removal
			}
		}));
		if (removed.length === 0) {
			return;
		}
		for (const key of removed) {
			cache.delete(key);
		}
		this._logService.trace(`[BrowserPluginGitCommandService] Pruned ${removed.length} stale cache entries`);
		this._persistCache();
	}

	private _ensureCacheLoaded(): Map<string, IBrowserPluginCacheEntry> {
		if (this._cache) {
			return this._cache;
		}
		const cache = new Map<string, IBrowserPluginCacheEntry>();
		const stored = this._storageService.getObject<IStoredBrowserPluginCache>(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
		const knownDirs = new Map<string, URI>();
		if (stored) {
			for (const [key, entry] of Object.entries(stored)) {
				if (entry && typeof entry.sha === 'string' && typeof entry.owner === 'string' && typeof entry.repo === 'string') {
					cache.set(key, {
						owner: entry.owner,
						repo: entry.repo,
						ref: typeof entry.ref === 'string' ? entry.ref : undefined,
						sha: entry.sha,
						fetchedAt: typeof entry.fetchedAt === 'number' ? entry.fetchedAt : 0,
					});
					try {
						knownDirs.set(key, URI.parse(key));
					} catch {
						// invalid stored key -- drop it on the floor at next persist
						cache.delete(key);
					}
				}
			}
		}

		this._cache = cache;
		// Fire-and-forget prune of dirs that no longer exist on disk.
		if (knownDirs.size > 0) {
			this._pruneStaleEntries(cache, knownDirs).catch(err => {
				this._logService.trace('[BrowserPluginGitCommandService] Cache prune failed:', err);
			});
		}

		return cache;
	}

	private _getCacheEntry(targetDir: URI): IBrowserPluginCacheEntry | undefined {
		return this._ensureCacheLoaded().get(this._cacheKey(targetDir));
	}

	private _setCacheEntry(targetDir: URI, entry: IBrowserPluginCacheEntry): void {
		const cache = this._ensureCacheLoaded();
		cache.set(this._cacheKey(targetDir), entry);
		this._persistCache();
	}

	private _persistCache(): void {
		if (!this._cache) {
			return;
		}
		const serialized: IStoredBrowserPluginCache = {};
		for (const [key, entry] of this._cache) {
			serialized[key] = entry;
		}
		if (Object.keys(serialized).length === 0) {
			this._storageService.remove(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
			return;
		}
		this._storageService.store(BROWSER_CACHE_STORAGE_KEY, JSON.stringify(serialized), StorageScope.APPLICATION, StorageTarget.MACHINE);
	}
}

function isGitHubAuthenticationError(error: unknown): error is GitHubRequestError {
	return error instanceof GitHubRequestError && (error.kind === 'authentication' || error.kind === 'authorization');
}
