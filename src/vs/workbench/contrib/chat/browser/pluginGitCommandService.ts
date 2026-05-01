/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
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
	IGitHubRepoRef,
	fetchAndExtractGitHubTarball,
	parseGitHubCloneUrl,
	resolveGitHubRefToSha,
} from './githubTarballFetcher.js';

/** Storage key for the per-target metadata index used by this service. */
const BROWSER_CACHE_STORAGE_KEY = 'chat.plugins.browserCache.v1';

/**
 * Per-target metadata persisted via {@link IStorageService}. Keyed by the
 * `targetDir.toString()` of the cloned repository so we can answer
 * `revParse('HEAD')` and detect "is the cached tarball still current?" on
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
 * Real `git` is not available in the browser, so plugin contents are
 * fetched as tarballs from the GitHub REST API
 * (`/repos/{owner}/{repo}/tarball/{sha}`), gunzipped via the platform's
 * `DecompressionStream`, and extracted file-by-file into the workbench's
 * virtual file system at `targetDir`.
 *
 * Only HTTPS GitHub clone URLs are supported. Other git hosts cannot be
 * reached without a real git binary; for those, callers should use the
 * desktop application or connect to a remote agent host that supports
 * server-side cloning.
 *
 * Per-target metadata (resolved SHA, original ref) is persisted via
 * {@link IStorageService} so that:
 *  - `revParse('HEAD')` and similar queries can be answered locally.
 *  - `pull()` only re-downloads when the upstream SHA has actually moved.
 *  - The `nonce` consumed by the agent host plugin manager naturally
 *    matches the SHA, dedupe-ing redundant uploads to the AHP server.
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
		const authToken = await this._lookupGitHubToken();
		try {
			const sha = await resolveGitHubRefToSha(this._requestService, repo, ref, authToken, cancel);
			await fetchAndExtractGitHubTarball(this._requestService, this._fileService, this._logService, repo, sha, targetDir, authToken, cancel);
			this._setCacheEntry(targetDir, { owner: repo.owner, repo: repo.repo, ref, sha, fetchedAt: Date.now() });
		} catch (err) {
			this._maybeLogAuth(err, repo);
			throw err;
		}
	}

	async pull(repoDir: URI, token?: CancellationToken): Promise<boolean> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot pull plugin: no cached metadata for ${repoDir.toString()}`);
		}
		const cancel = token ?? CancellationToken.None;
		const authToken = await this._lookupGitHubToken();
		const repo: IGitHubRepoRef = { owner: entry.owner, repo: entry.repo };
		const newSha = await resolveGitHubRefToSha(this._requestService, repo, entry.ref, authToken, cancel);
		if (newSha === entry.sha) {
			return false;
		}
		await fetchAndExtractGitHubTarball(this._requestService, this._fileService, this._logService, repo, newSha, repoDir, authToken, cancel);
		this._setCacheEntry(repoDir, { ...entry, sha: newSha, fetchedAt: Date.now() });
		return true;
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

		// SHA-pinned plugin sources call us with a 40-hex commit SHA after
		// `cloneRepository`; resolve other refs (branches, tags, short SHAs)
		// through the GitHub commits API like clone/pull do.
		const isFullSha = /^[0-9a-f]{40}$/i.test(requestedRef);
		const requestedSha = isFullSha
			? requestedRef.toLowerCase()
			: await resolveGitHubRefToSha(this._requestService, repo, requestedRef, authToken, cancel);

		if (requestedSha === entry.sha.toLowerCase()) {
			return;
		}

		try {
			await fetchAndExtractGitHubTarball(this._requestService, this._fileService, this._logService, repo, requestedSha, repoDir, authToken, cancel);
			this._setCacheEntry(repoDir, {
				...entry,
				ref: isFullSha ? entry.ref : requestedRef,
				sha: requestedSha,
				fetchedAt: Date.now(),
			});
		} catch (err) {
			this._maybeLogAuth(err, repo);
			throw err;
		}
	}

	async revParse(repoDir: URI, _ref: string): Promise<string> {
		const entry = this._getCacheEntry(repoDir);
		if (!entry) {
			throw new Error(`Cannot resolve ref: no cached metadata for ${repoDir.toString()}`);
		}
		// We only know one SHA per cached directory (the one we materialised),
		// so every ref query maps to it. Sources that need a different ref
		// reclone into a different `targetDir` (see `gitRevisionCacheSuffix`).
		return entry.sha;
	}

	async fetch(_repoDir: URI, _token?: CancellationToken): Promise<void> {
		// No-op: there is no local git database to update. `pull()` re-fetches
		// the tarball directly when needed.
	}

	async fetchRepository(_repoDir: URI, _token?: CancellationToken): Promise<void> {
		// No-op for the same reason as `fetch()`.
	}

	async revListCount(_repoDir: URI, _fromRef: string, _toRef: string): Promise<number> {
		// We do not have commit history available in the browser cache.
		// Returning 0 means "up to date" to the silent-fetch caller in
		// `AgentPluginRepositoryService.fetchRepository`, which is the
		// safe default — `pull()` is the source of truth for updates.
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

	private _maybeLogAuth(err: unknown, repo: IGitHubRepoRef): void {
		if (err instanceof GitHubAuthRequiredError) {
			this._logService.warn(`[BrowserPluginGitCommandService] GitHub auth required for ${repo.owner}/${repo.repo}: ${err.message}`);
		}
	}

	/**
	 * Best-effort silent lookup of an existing GitHub session token. Returns
	 * `undefined` when no session is available; callers fall back to the
	 * unauthenticated request, which still works for public repositories.
	 *
	 * We deliberately do not prompt the user from inside this service —
	 * that would surprise users who add a public plugin. The
	 * {@link GitHubAuthRequiredError} thrown by the helper on a 401/403 is
	 * the right place for higher layers to drive a sign-in flow.
	 */
	private async _lookupGitHubToken(): Promise<string | undefined> {
		try {
			const sessions = await this._authenticationService.getSessions('github', ['repo'], { silent: true });
			if (sessions.length === 0) {
				return undefined;
			}
			return sessions[0].accessToken;
		} catch (err) {
			this._logService.trace('[BrowserPluginGitCommandService] Silent GitHub session lookup failed:', err);
			return undefined;
		}
	}

	// -- metadata cache (IStorageService) -------------------------------------

	private _ensureCacheLoaded(): Map<string, IBrowserPluginCacheEntry> {
		if (this._cache) {
			return this._cache;
		}
		const cache = new Map<string, IBrowserPluginCacheEntry>();
		const stored = this._storageService.getObject<IStoredBrowserPluginCache>(BROWSER_CACHE_STORAGE_KEY, StorageScope.APPLICATION);
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
				}
			}
		}
		this._cache = cache;
		return cache;
	}

	private _getCacheEntry(targetDir: URI): IBrowserPluginCacheEntry | undefined {
		return this._ensureCacheLoaded().get(targetDir.toString());
	}

	private _setCacheEntry(targetDir: URI, entry: IBrowserPluginCacheEntry): void {
		const cache = this._ensureCacheLoaded();
		cache.set(targetDir.toString(), entry);
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
