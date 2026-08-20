/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { Minimatch } from 'minimatch';
import { createSha256Hash } from '../../../util/common/crypto';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { DeferredPromise, Limiter, raceCancellationError, timeout } from '../../../util/vs/base/common/async';
import { CancellationToken } from '../../../util/vs/base/common/cancellation';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { ResourceMap } from '../../../util/vs/base/common/map';
import { URI } from '../../../util/vs/base/common/uri';
import { IAuthenticationService } from '../../authentication/common/authentication';
import { ICAPIClientService } from '../../endpoint/common/capiClient';
import { IFileSystemService } from '../../filesystem/common/fileSystemService';
import { readFileFromTextBufferOrFS } from '../../filesystem/node/fileSystemServiceImpl';
import { IGitService, RepoContext, normalizeFetchUrl } from '../../git/common/gitService';
import { ILogService } from '../../log/common/logService';
import { IRequestLogger } from '../../requestLogger/common/requestLogger';
import { IWorkspaceService } from '../../workspace/common/workspaceService';
import { composeFetchMiddleware } from '../../../shared-fetch-utils/common/advancedFetcher';
import { FetchBlockedError, type HttpFetchFn, type HttpResponse } from '../../../shared-fetch-utils/common/fetchTypes';
import { authBlockedMiddleware } from '../../../shared-fetch-utils/common/middleware/authBlockedMiddleware';
import { rateLimitBackoffMiddleware } from '../../../shared-fetch-utils/common/middleware/rateLimitBackoffMiddleware';
import { serverErrorBackoffMiddleware } from '../../../shared-fetch-utils/common/middleware/serverErrorBackoffMiddleware';

type ContentExclusionRule = {
	paths: string[];
	ifNoneMatch?: string[];
	ifAnyMatch?: string[];
	source: { name: string; type: 'Repository' | 'Organization' };
};

type ContentExclusionResponse = {
	rules: ContentExclusionRule[];
	last_updated_at: number;
};

type RepoMetadata = { repoRootPath: string; fetchUrls: string[] };

/** Rules for a single repo, along with when they were fetched so they can expire individually. */
type CachedRules = {
	patterns: string[];
	ifAnyMatch: RegExp[];
	ifNoneMatch: RegExp[];
	fetchedAt: number;
};

/**
 * A memoised {@link RemoteContentExclusion.isIgnored} result, tagged with the rule generation it
 * was computed against so it can be discarded when the rules behind it change.
 */
type CachedVerdict = { verdict: boolean; generation: number };

/** A repo awaiting rules, shared by every caller that asks for it while the fetch is outstanding. */
type PendingFetch = { readonly deferred: DeferredPromise<void>; dispatched: boolean };

const NON_GIT_FILE_KEY = 'non-git-file';

const MINIMATCH_OPTIONS = {
	nocase: true,
	matchBase: true,
	nonegate: true,
	dot: true
};

/** Max repos the content exclusion endpoint accepts in a single request. */
const REPOS_PER_REQUEST = 10;
/** How many batches may be in flight at once. */
const MAX_CONCURRENT_BATCHES = 5;
/** Window used to collect repos before dispatching, so bursts collapse into full batches. */
const BATCH_WINDOW_MS = 50;
/** How long fetched rules stay valid before they are refreshed on next use. */
const RULE_TTL_MS = 30 * 60 * 1000;

/**
 * Fetches content exclusion policies from GH remotes.
 *
 * The rules endpoint lives on api.github.com, so it shares the caller's regular REST rate limit
 * budget. Requests are therefore coalesced per repo, batched, and backed off on failure.
 */
export class RemoteContentExclusion implements IDisposable {
	// Rules keyed by remote fetch url. Only ever holds successfully fetched rules, so a failed
	// request can never be mistaken for "this repo has no exclusions".
	private readonly _contentExclusionCache: Map<string, CachedRules> = new Map();
	// Repos waiting to be fetched, along with the promise every caller for that repo shares. Entries
	// stay registered until their request settles, so a lookup arriving mid-flight joins it.
	private readonly _pendingRepos: Map<string, PendingFetch> = new Map();
	private readonly _batchLimiter: Limiter<void>;
	private _scheduledDrain: Promise<void> | undefined;
	private _disposed = false;
	// Flattened, precompiled view of every glob rule so isIgnored does not recompile per call.
	private _compiledGlobs: Minimatch[] = [];
	private _regexRuleCount = 0;
	// Bumped whenever the rules change, which retires every verdict memoised against them.
	private _rulesGeneration = 0;
	// When the soonest expiring rule set goes stale. Memoised verdicts are only trusted before this.
	private _earliestRuleExpiry = 0;
	// This caches the ignore results as they can be expensive to compute and a single render can request results 100s of times
	private _ignoreGlobResultCache: ResourceMap<CachedVerdict> = new ResourceMap();
	// Map of the hash of file contents to the result of the regex check
	private _ignoreRegexResultCache: Map<string, CachedVerdict> = new Map();
	// Requests go through the shared middleware stack so rate limit and server error backoff are
	// handled the same way as every other cached CAPI-client value.
	private readonly _fetchExclusionRules: HttpFetchFn;
	private _disposables: IDisposable[] = [];
	private readonly _fileReadLimiter: Limiter<string | Uint8Array>;
	// Cache of repository root paths to their metadata to avoid calling getRepositoryFetchUrls for every file
	// This is critical for performance when there are many files in a workspace
	private readonly _repoRootCache: Map<string, RepoMetadata> = new Map();

	constructor(
		private readonly _gitService: IGitService,
		private readonly _logService: ILogService,
		private readonly _authService: IAuthenticationService,
		private readonly _capiClientService: ICAPIClientService,
		private readonly _fileSystemService: IFileSystemService,
		private readonly _workspaceService: IWorkspaceService,
		private readonly _requestLogger: IRequestLogger,
		// Injectable so tests can exercise rule expiry and backoff without waiting on the wall clock.
		private readonly _now: () => number = Date.now
	) {
		this._disposables.push(this._gitService.onDidCloseRepository((r) => {
			const repoInfo = this.getRepositoryInfo(r);
			if (!repoInfo) {
				return;
			}
			// Remove from repo root cache
			this._repoRootCache.delete(repoInfo.repoRootPath);
			for (const url of repoInfo.fetchUrls) {
				this._contentExclusionCache.delete(url);
			}
			this.rebuildCompiledRules();
			// Dropping a repo's rules can flip verdicts that were memoised while they applied.
			this.invalidateVerdicts();
		}));

		this._fileReadLimiter = new Limiter<string | Uint8Array>(10);
		this._disposables.push(this._fileReadLimiter);
		this._batchLimiter = new Limiter<void>(MAX_CONCURRENT_BATCHES);
		this._disposables.push(this._batchLimiter);

		this._fetchExclusionRules = composeFetchMiddleware(
			// Order matters: the rate limit check sits inside the auth check so that a quota
			// exhausted 403 is recognised by its headers and waits for the reset, instead of being
			// misread as an auth failure and blocking the token for an hour.
			authBlockedMiddleware(),
			rateLimitBackoffMiddleware({ now: this._now }),
			serverErrorBackoffMiddleware(),
		)(request => this._capiClientService.makeRequest<HttpResponse>(
			{ headers: request.headers },
			{ type: RequestType.ContentExclusion, repos: (request.state?.repos ?? []) as string[] }
		));
	}

	public async isIgnored(file: URI, token: CancellationToken = CancellationToken.None): Promise<boolean> {
		const memoised = this.memoisedVerdict(file);
		if (memoised !== undefined) {
			return memoised;
		}

		// Try to find the repository from the cache first to avoid expensive git extension calls
		// This is critical for performance when there are many files in a workspace
		let repoMetadata = this.findCachedRepoMetadataForFile(file);

		// If not in cache, query the git extension (this is expensive for many files)
		if (!repoMetadata) {
			const repo = await raceCancellationError(this._gitService.getRepositoryFetchUrls(file), token);
			repoMetadata = this.getRepositoryInfo(repo);
			// Cache the result for future lookups
			if (repoMetadata) {
				this._repoRootCache.set(repoMetadata.repoRootPath, repoMetadata);
			}
		}

		// No repository is associated with this file, so we set it to the 'virtual' non-git file repo / key
		// This way when we go to lookup rules for this file it will pull the non git file rules
		if (!repoMetadata) {
			repoMetadata = { repoRootPath: '', fetchUrls: [NON_GIT_FILE_KEY] };
		}

		const fileName = file.path.toLowerCase().replace(repoMetadata.repoRootPath.toLowerCase(), '');

		// Only waits on the repos this file actually belongs to, so an unrelated in-flight batch
		// cannot block this lookup.
		const rulesLoaded = await raceCancellationError(this.ensureRulesLoaded(repoMetadata.fetchUrls), token);
		// Captured up front so that a refresh landing while this verdict is being computed retires
		// it, rather than it being stored as if it reflected the newer rules.
		const generation = this._rulesGeneration;

		for (const glob of this._compiledGlobs) {
			if (glob.match(fileName) || glob.match(file.path)) {
				this._logService.debug(`File ${file.path} is ignored by content exclusion rule ${glob.pattern}`);
				this._ignoreGlobResultCache.set(file, { verdict: true, generation });
				return true;
			}
		}
		let fileContents: string = '';
		let fileContentHash: string = '';
		for (const fetchUrl of repoMetadata.fetchUrls) {
			const { ifAnyMatch, ifNoneMatch } = this._contentExclusionCache.get(fetchUrl) ?? { ifAnyMatch: [], ifNoneMatch: [] };
			// We only want to read the file if we absolutely must as it can be expensive
			if (ifAnyMatch.length > 0 || ifNoneMatch.length > 0) {
				if (!fileContents) {
					try {
						// Read the file contents and hash it so we can cache the result - Only reads up to 1KB of the file, as reading too much can be expensive and regex exclusions are normally header based
						// Note: This feature is internal only so we can adapt the implementation as needed without breaking clients.
						const fileContentOrBuffer = await this._fileReadLimiter.queue(() => readFileFromTextBufferOrFS(this._fileSystemService, this._workspaceService, file, 1024));
						fileContents = typeof fileContentOrBuffer === 'string' ? fileContentOrBuffer : new TextDecoder().decode(fileContentOrBuffer);
						fileContentHash = await createSha256Hash(fileContents);
						// Cache hit for these file contents, no need to run the regex patterns
						const cachedRegexVerdict = this._ignoreRegexResultCache.get(fileContentHash);
						if (cachedRegexVerdict && cachedRegexVerdict.generation === generation) {
							return cachedRegexVerdict.verdict;
						}
					} catch {
						// We failed to read the file, so it should just be ignored as we have no idea what the contents are or if it exists
						return true;
					}
				}
			}
			if (ifAnyMatch.length > 0 && fileContents && ifAnyMatch.some(pattern => pattern.test(fileContents))) {
				this._logService.debug(`File ${file.path} is ignored by content exclusion rule ifAnyMatch`);
				this._ignoreRegexResultCache.set(fileContentHash, { verdict: true, generation });
				return true;
			}
			if (ifNoneMatch.length > 0 && fileContents && !ifNoneMatch.some(pattern => pattern.test(fileContents))) {
				this._logService.debug(`File ${file.path} is ignored by content exclusion rule ifNoneMatch`);
				this._ignoreRegexResultCache.set(fileContentHash, { verdict: true, generation });
				return true;
			}
		}

		// Only memoise a negative verdict once every relevant rule set has actually loaded. Caching it
		// after a failed fetch would leave the file permanently allowed.
		if (rulesLoaded) {
			this._ignoreGlobResultCache.set(file, { verdict: false, generation });
			// Only meaningful when regex rules forced us to read (and hash) the file.
			if (fileContentHash) {
				this._ignoreRegexResultCache.set(fileContentHash, { verdict: false, generation });
			}
		}
		return false;
	}

	/**
	 * Returns a memoised verdict when it can still be trusted.
	 *
	 * A verdict is only reusable while the rules behind it are both unchanged and unexpired,
	 * otherwise the file has to be re-evaluated so that policy changes are picked up. Skipping the
	 * expiry check here would pin a file to its first answer forever, since a cached verdict
	 * short-circuits the refresh that would notice new rules.
	 */
	private memoisedVerdict(file: URI): boolean | undefined {
		const cached = this._ignoreGlobResultCache.get(file);
		if (!cached || cached.generation !== this._rulesGeneration || this._now() >= this._earliestRuleExpiry) {
			return undefined;
		}
		// An exclusion is the most restrictive answer, so a positive verdict stands on its own. A
		// negative one is only final when no regex rule could still exclude the file on content.
		return cached.verdict || !this.isRegexContextExclusionsEnabled ? cached.verdict : undefined;
	}

	/**
	 * Returns whether or not there are regex context exclusions.
	 */
	public get isRegexContextExclusionsEnabled(): boolean {
		return this._regexRuleCount > 0;
	}

	/**
	 * Loads the content exclusion rules for the given repositories. Primarily used to load a bunch of repos at once prior to a search for example.
	 * @param repoUris The list of repository URIs to load the content exclusion rules for
	 */
	public async loadRepos(repoUris: URI[]) {
		const repos = await Promise.all(repoUris.map(uri => this._gitService.getRepositoryFetchUrls(uri)));
		const fetchUrls: string[] = [];
		for (const repo of repos) {
			const repoInfo = this.getRepositoryInfo(repo);
			// Populate the repo root cache for future lookups
			if (repoInfo) {
				this._repoRootCache.set(repoInfo.repoRootPath, repoInfo);
				fetchUrls.push(...repoInfo.fetchUrls);
			}
		}
		await this.ensureRulesLoaded(fetchUrls);
	}

	public async asMinimatchPatterns() {
		// Anything already queued must land first so callers see a complete pattern set.
		await Promise.all([...this._pendingRepos.values()].map(pending => pending.deferred.p));
		return Array.from(this._contentExclusionCache.values()).flatMap(({ patterns }) => patterns);
	}

	public dispose() {
		this._disposed = true;
		// Released before the limiter is disposed: it drops queued work without ever running it, so
		// anything still registered here would otherwise leave its callers waiting forever.
		this.settlePending([...this._pendingRepos]);
		this._pendingRepos.clear();
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
		this._contentExclusionCache.clear();
		this._compiledGlobs = [];
		this._regexRuleCount = 0;
		this._earliestRuleExpiry = 0;
	}

	/**
	 * Ensures rules for the given repos are loaded, fetching only what is missing or expired.
	 *
	 * Callers asking for the same repo share a single request, and each caller only waits on the
	 * repos it asked for, so a large background load cannot stall an individual file check.
	 *
	 * @returns whether every required rule set is now available. `false` means at least one fetch
	 * failed, and the caller must not memoise a verdict derived from the incomplete rules.
	 */
	private async ensureRulesLoaded(fetchUrls: readonly string[]): Promise<boolean> {
		// Global/org rules are keyed under the non-git pseudo repo and can apply to any file.
		const required = new Set<string>(fetchUrls);
		required.add(NON_GIT_FILE_KEY);

		const now = this._now();
		const waits: Promise<void>[] = [];
		for (const url of required) {
			const cached = this._contentExclusionCache.get(url);
			if (cached && now - cached.fetchedAt < RULE_TTL_MS) {
				continue;
			}
			waits.push(this.enqueueRepo(url));
		}

		if (waits.length > 0) {
			await Promise.all(waits);
		}

		for (const url of required) {
			if (!this._contentExclusionCache.has(url)) {
				return false;
			}
		}
		return true;
	}

	/** Registers a repo for the next batch, joining an existing fetch when one is outstanding. */
	private enqueueRepo(url: string): Promise<void> {
		const existing = this._pendingRepos.get(url);
		if (existing) {
			// Queued or already in flight; share that result rather than issuing a duplicate request.
			return existing.deferred.p;
		}
		const pending: PendingFetch = { deferred: new DeferredPromise<void>(), dispatched: false };
		if (this._disposed) {
			// Nothing will ever run, so release the caller instead of leaving it waiting.
			pending.deferred.complete(undefined);
			return pending.deferred.p;
		}
		this._pendingRepos.set(url, pending);
		this.scheduleDrain();
		return pending.deferred.p;
	}

	/**
	 * Schedules a drain shortly after the first enqueue. The window is deliberately not reset by
	 * later enqueues so that a steady stream of repos cannot starve the fetch indefinitely.
	 */
	private scheduleDrain(): void {
		if (this._scheduledDrain) {
			return;
		}
		this._scheduledDrain = (async () => {
			await timeout(BATCH_WINDOW_MS);
			this._scheduledDrain = undefined;
			this.drainPendingRepos();
		})();
	}

	/** Dispatches everything queued but not yet sent as batched, concurrency limited requests. */
	private drainPendingRepos(): void {
		if (this._disposed) {
			return;
		}
		const batchable = [...this._pendingRepos].filter(([, pending]) => !pending.dispatched);
		if (batchable.length === 0) {
			return;
		}
		// Entries deliberately stay in the map until their request settles, so a lookup arriving
		// while the request is slow joins it instead of queueing the same repo again.
		batchable.forEach(([, pending]) => { pending.dispatched = true; });

		for (let i = 0; i < batchable.length; i += REPOS_PER_REQUEST) {
			const batch = batchable.slice(i, i + REPOS_PER_REQUEST);
			this._batchLimiter.queue(() => this.fetchRulesForBatch(batch));
		}
	}

	/**
	 * Fetches one batch of repos. Rules are only cached on success, so a transient failure is retried
	 * later rather than being remembered as "this repo has no exclusions".
	 */
	private async fetchRulesForBatch(batch: [string, PendingFetch][]): Promise<void> {
		const repos = batch.map(([repo]) => repo);
		const startTime = this._now();
		try {
			const ghToken = (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
			const response = await this._fetchExclusionRules({
				url: `capi:${RequestType.ContentExclusion}`,
				headers: { 'Authorization': `token ${ghToken}` },
				method: 'GET',
				state: { repos }
			});

			if (response.status < 200 || response.status >= 300) {
				this._logService.error(`Failed to fetch content exclusion rules for ${repos.length} repo(s): ${response.status}`);
				return;
			}

			this.applyRules(repos, await response.json() as ContentExclusionResponse[], startTime);
		} catch (err) {
			if (err instanceof FetchBlockedError) {
				// A middleware is deliberately holding requests back. The repos stay uncached and are
				// picked up again once the block lifts.
				this._logService.warn(`Deferred content exclusion fetch for ${repos.length} repo(s): ${err.message}`);
			} else {
				this._logService.error(`Failed to fetch content exclusion rules: ${err}`);
			}
		} finally {
			// Waiters always resume. On failure the repo stays uncached so it is fetched again later.
			this.settlePending(batch);
		}
	}

	/** Releases a batch's waiters, deregistering entries that still belong to this attempt. */
	private settlePending(batch: readonly [string, PendingFetch][]): void {
		for (const [url, pending] of batch) {
			if (this._pendingRepos.get(url) === pending) {
				this._pendingRepos.delete(url);
			}
			pending.deferred.complete(undefined);
		}
	}

	private applyRules(repos: string[], data: ContentExclusionResponse[], startTime: number): void {
		const fetchedAt = this._now();
		const loggedRules: { patterns: string[]; ifAnyMatch: string[]; ifNoneMatch: string[] }[] = [];
		let rulesChanged = false;

		for (let i = 0; i < repos.length; i++) {
			// A missing entry means the server reported no rules for that repo. That is still a
			// definitive answer, so it is cached to avoid refetching the repo forever.
			const rules = data[i]?.rules ?? [];
			const patterns = rules.flatMap(rule => rule.paths);
			const ifAnyMatch = this.toRegexes(rules.flatMap(rule => rule.ifAnyMatch));
			const ifNoneMatch = this.toRegexes(rules.flatMap(rule => rule.ifNoneMatch));
			const previous = this._contentExclusionCache.get(repos[i]);
			// Compared against what was there before, because rules being *removed* changes verdicts
			// just as much as rules being added.
			rulesChanged ||= !previous || !isSameRuleSet(previous, { patterns, ifAnyMatch, ifNoneMatch });
			this._contentExclusionCache.set(repos[i], { patterns, ifAnyMatch, ifNoneMatch, fetchedAt });
			loggedRules.push({
				patterns,
				ifAnyMatch: ifAnyMatch.map(r => r.toString()),
				ifNoneMatch: ifNoneMatch.map(r => r.toString())
			});
		}

		this.rebuildCompiledRules();

		if (rulesChanged) {
			this.invalidateVerdicts();
		}

		const duration = this._now() - startTime;
		this._logService.info(`Fetched content exclusion rules for ${repos.length} repo(s) in ${duration}ms`);
		this._requestLogger.logContentExclusionRules(repos, loggedRules, duration);
	}

	/** Retires every memoised verdict, since the rules they were computed against no longer hold. */
	private invalidateVerdicts(): void {
		this._rulesGeneration++;
		this._ignoreGlobResultCache.clear();
		this._ignoreRegexResultCache.clear();
	}

	/** Rebuilds the flattened matcher list that {@link isIgnored} walks. */
	private rebuildCompiledRules(): void {
		const globs: Minimatch[] = [];
		let regexRuleCount = 0;
		let earliestExpiry = Number.POSITIVE_INFINITY;
		for (const { patterns, ifAnyMatch, ifNoneMatch, fetchedAt } of this._contentExclusionCache.values()) {
			for (const pattern of patterns) {
				try {
					globs.push(new Minimatch(pattern, MINIMATCH_OPTIONS));
				} catch (err) {
					this._logService.warn(`Skipping malformed content exclusion pattern '${pattern}': ${err}`);
				}
			}
			regexRuleCount += ifAnyMatch.length + ifNoneMatch.length;
			earliestExpiry = Math.min(earliestExpiry, fetchedAt + RULE_TTL_MS);
		}
		this._compiledGlobs = globs;
		this._regexRuleCount = regexRuleCount;
		// Zero while nothing is cached, which keeps memoised verdicts from being trusted before any
		// rules have been loaded.
		this._earliestRuleExpiry = this._contentExclusionCache.size > 0 ? earliestExpiry : 0;
	}

	/** Compiles regex rules, skipping any the server sent that cannot be parsed. */
	private toRegexes(patterns: (string | undefined)[]): RegExp[] {
		const compiled: RegExp[] = [];
		for (const pattern of coalesce(patterns)) {
			try {
				compiled.push(stringToRegex(pattern));
			} catch (err) {
				this._logService.warn(`Skipping malformed content exclusion regex '${pattern}': ${err}`);
			}
		}
		return compiled;
	}


	private getRepositoryInfo(repo: Pick<RepoContext, 'rootUri' | 'remoteFetchUrls'> | undefined): RepoMetadata | undefined {
		if (!repo || !repo.remoteFetchUrls) {
			return undefined;
		}
		const fetchUrls = coalesce(repo.remoteFetchUrls.map(url => {
			if (!url) {
				return undefined;
			}
			// This can throw when the URL is something like a local file path which is a valid git remote
			try {
				return normalizeFetchUrl(url);
			} catch {
				return undefined;
			}
		}));
		return { repoRootPath: repo.rootUri.path, fetchUrls: fetchUrls };
	}

	/**
	 * Finds cached repository metadata for a file by checking if the file path
	 * starts with any known repository root path.
	 * Returns the most specific (longest) matching repository to handle nested repos/submodules correctly.
	 * This avoids expensive calls to the git extension API for every file.
	 */
	private findCachedRepoMetadataForFile(file: URI): RepoMetadata | undefined {
		const filePath = file.path.toLowerCase();
		let bestMatch: RepoMetadata | undefined;
		let bestMatchLength = 0;

		for (const [repoRootPath, metadata] of this._repoRootCache.entries()) {
			const normalizedRepoRoot = repoRootPath.toLowerCase();
			if ((filePath.startsWith(normalizedRepoRoot + '/') || filePath === normalizedRepoRoot) &&
				normalizedRepoRoot.length > bestMatchLength) {
				bestMatch = metadata;
				bestMatchLength = normalizedRepoRoot.length;
			}
		}
		return bestMatch;
	}
}

/** Compares two rule sets by content, so an unchanged refresh does not retire memoised verdicts. */
function isSameRuleSet(a: Omit<CachedRules, 'fetchedAt'>, b: Omit<CachedRules, 'fetchedAt'>): boolean {
	return equalStrings(a.patterns, b.patterns)
		&& equalStrings(a.ifAnyMatch.map(String), b.ifAnyMatch.map(String))
		&& equalStrings(a.ifNoneMatch.map(String), b.ifNoneMatch.map(String));
}

function equalStrings(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((value, index) => value === b[index]);
}

/**
 * Convert a given string /pattern/flags to a RegExp object
 */function stringToRegex(str: string): RegExp {
	// Handle Regex format of `pattern` vs /pattern/
	if (!str.startsWith('/') && !str.endsWith('/')) {
		return new RegExp(str);
	}

	// Extracting the content between the first and last slash as the pattern
	const pattern = str.slice(1, str.lastIndexOf('/'));
	// Extracting the flags after the last slash
	const flags = str.slice(str.lastIndexOf('/') + 1);
	// Creating the RegExp object
	return new RegExp(pattern, flags);
}
