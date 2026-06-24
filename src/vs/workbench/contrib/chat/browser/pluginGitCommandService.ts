/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { getComparisonKey } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRequestService } from '../../../../platform/request/common/request.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IPluginGitService } from '../common/plugins/pluginGitService.js';
import {
	GitHubAuthRequiredError,
	GitHubRateLimitError,
	IGitHubRepoRef,
	fetchAndExtractGitHubRepo,
	parseGitHubCloneUrl,
	resolveGitHubRefToSha,
} from './githubRepoFetcher.js';

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

/**
 * Browser implementation of {@link IPluginGitService}.
 *
 * `git` is not available in the browser, so plugin contents are reconstructed
 * from the GitHub REST API: `/git/trees/{sha}?recursive=1` for the listing and
 * `/git/blobs/{blob_sha}` for each file's bytes. Both live on `api.github.com`,
 * which is the only GitHub host that handles CORS with auth headers — the
 * `/tarball/` endpoint redirects to `codeload.github.com` (no CORS) and
 * `raw.githubusercontent.com` rejects the OPTIONS preflight forced by
 * `Authorization: Bearer`.
 *
 * Only HTTPS GitHub clone URLs are supported; everything else throws an
 * actionable localized error pointing at desktop or a remote agent host.
 *
 * Per-target metadata is persisted via {@link IStorageService} so `revParse`
 * answers locally, `pull()` skips the re-download when the upstream SHA has
 * not moved, and the persisted SHA feeds `CustomizationRef.nonce` for AHP
 * dedupe.
 */
export class BrowserPluginGitCommandService implements IPluginGitService {
	declare readonly _serviceBrand: undefined;

	private _cache: Map<string, IBrowserPluginCacheEntry> | undefined;

	constructor(
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
		@IRequestService private readonly _requestService: IRequestService,
		@IStorageService private readonly _storageService: IStorageService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) { }

	async cloneRepository(cloneUrl: string, targetDir: URI, ref?: string, token?: CancellationToken): Promise<void> {
		const repo = this._parseOrThrow(cloneUrl);
		const cancel = token ?? CancellationToken.None;
		const cloneWithToken = async (authToken: string | undefined): Promise<void> => {
			const sha = await resolveGitHubRefToSha(this._requestService, repo, ref, authToken, cancel);
			await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, sha, targetDir, authToken, cancel);
			this._setCacheEntry(targetDir, { owner: repo.owner, repo: repo.repo, ref, sha, fetchedAt: Date.now() });
		};

		// Auth ladder: signed-in token → anonymous → freshly-requested repo session.
		// Each rung only runs when the previous one failed with a 401/403 (the
		// `GitHubAuthRequiredError`); other errors propagate immediately.
		const initialAuthToken = await this._lookupGitHubToken();
		const attempts: Array<() => Promise<string | undefined>> = [
			async () => initialAuthToken,
		];
		if (initialAuthToken) {
			attempts.push(async () => undefined);
		}
		attempts.push(() => this._requestGitHubToken(repo));

		let lastErr: unknown;
		for (const getToken of attempts) {
			if (cancel.isCancellationRequested) {
				throw new CancellationError();
			}
			try {
				await cloneWithToken(await getToken());
				return;
			} catch (err) {
				lastErr = err;
				this._maybeLogTransientError(err, repo);
				if (!(err instanceof GitHubAuthRequiredError)) {
					throw err;
				}
			}
		}

		if (lastErr instanceof GitHubAuthRequiredError) {
			throw new Error(localize(
				'pluginsBrowserGitHubAccessRequired',
				"GitHub authentication is required to install '{0}'. Sign in with an account that has access to this repository, then try again.",
				`${repo.owner}/${repo.repo}`,
			));
		}
		throw lastErr;
	}

	async pull(repoDir: URI, token?: CancellationToken): Promise<boolean> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot pull plugin: no cached metadata for ${repoDir.toString()}`);
		}
		const cancel = token ?? CancellationToken.None;
		const authToken = await this._lookupGitHubToken();
		const repo: IGitHubRepoRef = { owner: entry.owner, repo: entry.repo };
		try {
			const newSha = await resolveGitHubRefToSha(this._requestService, repo, entry.ref, authToken, cancel);
			if (newSha === entry.sha) {
				return false;
			}
			await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, newSha, repoDir, authToken, cancel);
			this._setCacheEntry(repoDir, { ...entry, sha: newSha, fetchedAt: Date.now() });
			return true;
		} catch (err) {
			this._maybeLogTransientError(err, repo);
			throw err;
		}
	}

	async checkout(repoDir: URI, treeish: string, _detached?: boolean, token?: CancellationToken): Promise<void> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot checkout plugin: no cached metadata for ${repoDir.toString()}`);
		}

		const cancel = token ?? CancellationToken.None;
		const authToken = await this._lookupGitHubToken();
		const repo: IGitHubRepoRef = { owner: entry.owner, repo: entry.repo };
		const requestedRef = treeish.trim();

		// 40-hex SHA refs skip the resolveSha round-trip (clone pins to the SHA already).
		const isFullSha = /^[0-9a-f]{40}$/i.test(requestedRef);
		const requestedSha = isFullSha
			? requestedRef.toLowerCase()
			: await resolveGitHubRefToSha(this._requestService, repo, requestedRef, authToken, cancel);

		if (requestedSha === entry.sha.toLowerCase()) {
			return;
		}

		try {
			await fetchAndExtractGitHubRepo(this._requestService, this._fileService, this._logService, repo, requestedSha, repoDir, authToken, cancel);
			this._setCacheEntry(repoDir, {
				...entry,
				ref: isFullSha ? entry.ref : requestedRef,
				sha: requestedSha,
				fetchedAt: Date.now(),
			});
		} catch (err) {
			this._maybeLogTransientError(err, repo);
			throw err;
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

	private _parseOrThrow(cloneUrl: string): IGitHubRepoRef {
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

	private _maybeLogTransientError(err: unknown, repo: IGitHubRepoRef): void {
		if (err instanceof GitHubAuthRequiredError) {
			this._logService.warn(`[BrowserPluginGitCommandService] GitHub auth required for ${repo.owner}/${repo.repo}: ${err.message}`);
		} else if (err instanceof GitHubRateLimitError) {
			const wait = err.retryAfterSeconds !== undefined ? ` (retry after ${err.retryAfterSeconds}s)` : '';
			this._logService.warn(`[BrowserPluginGitCommandService] GitHub rate limit hit for ${repo.owner}/${repo.repo}${wait}: ${err.message}`);
		} else if (err instanceof Error) {
			// Surface the URL + cause so opaque `TypeError: Failed to fetch` errors
			// (CORS, DNS, offline) don't reach the user without context.
			const cause = err.cause instanceof Error ? ` (cause: ${err.cause.name}: ${err.cause.message})` : '';
			this._logService.error(`[BrowserPluginGitCommandService] Clone failed for ${repo.owner}/${repo.repo}: ${err.message}${cause}`);
		}
	}

	/**
	 * Best-effort silent lookup of an existing GitHub session token. Returns
	 * `undefined` when no session is available; callers fall back to anonymous,
	 * which still works for public repos. Prefers a `repo`-scoped session when
	 * multiple are present (e.g. EMU + personal).
	 */
	private async _lookupGitHubToken(): Promise<string | undefined> {
		try {
			const sessions = await this._authenticationService.getSessions('github', [], { silent: true });
			if (sessions.length === 0) {
				return undefined;
			}
			const repoScopeSession = sessions.find(session => session.scopes.includes('repo'));
			return repoScopeSession?.accessToken ?? sessions[0].accessToken;
		} catch (err) {
			this._logService.trace('[BrowserPluginGitCommandService] Silent GitHub session lookup failed:', err);
			return undefined;
		}
	}

	private async _requestGitHubToken(repo: IGitHubRepoRef): Promise<string> {
		try {
			const session = await this._authenticationService.createSession('github', ['repo'], { activateImmediate: true });
			return session.accessToken;
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
