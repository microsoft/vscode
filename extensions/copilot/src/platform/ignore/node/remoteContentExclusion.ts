/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RequestType } from '@vscode/copilot-api';
import { minimatch } from 'minimatch';
import { createSha256Hash } from '../../../util/common/crypto';
import { coalesce } from '../../../util/vs/base/common/arrays';
import { Limiter, raceCancellationError } from '../../../util/vs/base/common/async';
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
import { Response } from '../../networking/common/fetcherService';
import { IRequestLogger } from '../../requestLogger/node/requestLogger';
import { IWorkspaceService } from '../../workspace/common/workspaceService';

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

const NON_GIT_FILE_KEY = 'non-git-file';

/**
 * Fetches content exclusion policies from GH remotes
 */
export class RemoteContentExclusion implements IDisposable {
	// The cache which maps remote fetch url to the minimatch patterns, order of patterns matters here
	private _contentExclusionCache: Map<string, { patterns: string[]; ifAnyMatch: RegExp[]; ifNoneMatch: RegExp[] }> = new Map();
	private _contentExclusionFetchPromise: Promise<void> | null = null;
	// This caches the ignore results as they can be expensive to compute and a single render can request results 100s of times
	private _ignoreGlobResultCache: ResourceMap<boolean> = new ResourceMap();
	// Map of the hash of file contents to the result of the regex check
	private _ignoreRegexResultCache: Map<string, boolean> = new Map();
	private _lastRuleFetch = 0;
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
		private readonly _requestLogger: IRequestLogger
	) {
		// This is a specialized entry to store the global rules that apply to files outside of any git repository
		// The other option was to maintain a separate cache for non git files but that would be redundant
		this._contentExclusionCache.set(NON_GIT_FILE_KEY, { patterns: [], ifAnyMatch: [], ifNoneMatch: [] });
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
		}));

		this._fileReadLimiter = new Limiter<string | Uint8Array>(10);
		this._disposables.push(this._fileReadLimiter);
	}

	public async isIgnored(file: URI, token: CancellationToken = CancellationToken.None): Promise<boolean> {
		// 1. If glob is not ignored, but there is no regex we can return false as the URI will not change
		// 2. If glob is not ignored, but there are regex we need to read file content which will happen lower in the regex code.
		// 3. If glob is ignored, it will return true despite regex since the most restrictive exclusion takes the cake
		if ((this._ignoreGlobResultCache.has(file) && !this.isRegexContextExclusionsEnabled) || this._ignoreGlobResultCache.get(file)) {
			return this._ignoreGlobResultCache.get(file) ?? false;
		}
		// Any pending requests that may be in flight should be awaited before returning a result
		if (this._contentExclusionFetchPromise) {
			await raceCancellationError(this._contentExclusionFetchPromise, token);
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

		// We're missing entries for this repository in the cache, so we fetch it.
		// Or it has been more than 30 minutes so the current rules are stale
		if (this.shouldFetchContentExclusionRules(repoMetadata) || (Date.now() - this._lastRuleFetch > 30 * 60 * 1000)) {
			this._logService.trace(`Fetching content exclusions, due to ${this.shouldFetchContentExclusionRules(repoMetadata) ? 'repository change' : 'stale cache'}.`);
			this._lastRuleFetch = Date.now();
			await raceCancellationError(this.makeContentExclusionRequest(), token);
		}

		const minimatchConfig = {
			nocase: true,
			matchBase: true,
			nonegate: true,
			dot: true
		};

		for (const { patterns } of this._contentExclusionCache.values()) {
			for (const rule of patterns) {
				const matchesPattern = minimatch(fileName, rule, minimatchConfig) || minimatch(file.path, rule, minimatchConfig);
				if (matchesPattern) {
					this._logService.debug(`File ${file.path} is ignored by content exclusion rule ${rule}`);
					this._ignoreGlobResultCache.set(file, true);
					return true;
				}
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
						if (this._ignoreRegexResultCache.has(fileContentHash)) {
							return this._ignoreRegexResultCache.get(fileContentHash) ?? false;
						}
					} catch {
						// We failed to read the file, so it should just be ignored as we have no idea what the contents are or if it exists
						return true;
					}
				}
			}
			if (ifAnyMatch.length > 0 && fileContents && ifAnyMatch.some(pattern => pattern.test(fileContents))) {
				this._logService.debug(`File ${file.path} is ignored by content exclusion rule ifAnyMatch`);
				this._ignoreRegexResultCache.set(fileContentHash, true);
				return true;
			}
			if (ifNoneMatch.length > 0 && fileContents && !ifNoneMatch.some(pattern => pattern.test(fileContents))) {
				this._logService.debug(`File ${file.path} is ignored by content exclusion rule ifNoneMatch`);
				this._ignoreRegexResultCache.set(fileContentHash, true);
				return true;
			}
		}

		this._ignoreGlobResultCache.set(file, false);
		this._ignoreRegexResultCache.set(fileContentHash, false);
		return false;
	}

	/**
	 * Returns whether or not there are regex context exclusions.
	 */
	public get isRegexContextExclusionsEnabled(): boolean {
		return [...this._contentExclusionCache.values()].some(({ ifAnyMatch, ifNoneMatch }: { ifAnyMatch: RegExp[]; ifNoneMatch: RegExp[] }) => ifAnyMatch.length > 0 || ifNoneMatch.length > 0);
	}
	/**
	 * Loads the content exclusion rules for the given repositories. Primarily used to load a bunch of repos at once prior to a search for example.
	 * @param repoUris The list of repository URIs to load the content exclusion rules for
	 */
	public async loadRepos(repoUris: URI[]) {
		const repos = await Promise.all(repoUris.map(uri => this._gitService.getRepositoryFetchUrls(uri)));
		const repoInfos = repos.map(repo => {
			const repoInfo = this.getRepositoryInfo(repo);
			// Populate the repo root cache for future lookups
			if (repoInfo) {
				this._repoRootCache.set(repoInfo.repoRootPath, repoInfo);
			}
			return this.shouldFetchContentExclusionRules(repoInfo);
		});
		if (repoInfos.some(info => info)) {
			this._lastRuleFetch = Date.now();
			await this.makeContentExclusionRequest();
		}
	}

	public async asMinimatchPatterns() {
		await this._contentExclusionFetchPromise;
		const patterns: string[] = Array.from(this._contentExclusionCache.values()).flatMap(({ patterns }) => patterns);
		return patterns;
	}

	public dispose() {
		this._disposables.forEach(d => d.dispose());
		this._disposables = [];
		this._contentExclusionCache.clear();
	}

	private shouldFetchContentExclusionRules(repoInfo: RepoMetadata | undefined): boolean {
		if (!repoInfo) {
			return false;
		}
		let shouldFetch = false;
		for (const remoteRepoUrl of repoInfo?.fetchUrls ?? []) {
			if (!this._contentExclusionCache.has(remoteRepoUrl)) {
				shouldFetch = true;
				this._contentExclusionCache.set(remoteRepoUrl, { patterns: [], ifAnyMatch: [], ifNoneMatch: [] });
			}
		}
		return shouldFetch;
	}

	/**
	 * A wrapper around the actual request
	 * TODO @lramos15 add cancellation to cancel the old request in flight
	 * @returns The promise which resolves when the request is complete
	 */
	private async makeContentExclusionRequest(): Promise<void> {
		if (this._contentExclusionFetchPromise) {
			await this._contentExclusionFetchPromise;
		}
		try {
			this._contentExclusionFetchPromise = this._contentExclusionRequest();
			await this._contentExclusionFetchPromise;
			this._contentExclusionFetchPromise = null;
		} catch {
			this._contentExclusionFetchPromise = null;
		}
	}


	/**
	 * The actual function that fetches the content exclusion rules from the GH API.
	 * Not recommended to call directly and instead use {@link makeContentExclusionRequest} as that ensures only one call is pending at any time
	 */
	private async _contentExclusionRequest(): Promise<void> {
		// Clear the result cache as new rules will come and therefore it is no longer valid
		this._ignoreGlobResultCache.clear();
		const startTime = Date.now();
		const capiClientService = this._capiClientService;
		const ghToken = (await this._authService.getGitHubSession('any', { silent: true }))?.accessToken;
		const remoteFetchUrls = Array.from(this._contentExclusionCache.keys());
		const updateRulesForRepos = async (reposToFetch: string[]) => {

			const response = await capiClientService.makeRequest<Response>({
				headers: {
					'Authorization': `token ${ghToken}`
				},
			}, { type: RequestType.ContentExclusion, repos: reposToFetch });

			if (!response.ok) {
				this._logService.error(`Failed to fetch content exclusion rules: ${response?.statusText}`);
				return;
			}
			const data: ContentExclusionResponse[] = await response.json();
			for (let j = 0; j < data.length; j++) {
				const patterns = data[j].rules.map(rule => rule.paths).flat();
				const ifAnyMatch = coalesce(data[j].rules.map(rule => rule.ifAnyMatch).flat()).map(pattern => stringToRegex(pattern));
				const ifNoneMatch = coalesce(data[j].rules.map(rule => rule.ifNoneMatch).flat()).map(pattern => stringToRegex(pattern));
				const repo = reposToFetch[j];
				const rulesForRepo = { patterns, ifAnyMatch, ifNoneMatch };
				this._contentExclusionCache.set(repo, rulesForRepo);
				this._logService.trace(`Fetched content exclusion rules for ${repo}: ${JSON.stringify(rulesForRepo)}`);
			}
		};

		// This is needed to fetch the global rules that could apply to non git files
		if (remoteFetchUrls.length === 0) {
			await updateRulesForRepos([]);
		}

		// Process in batches of 10 as that's the max content exclusion rules we can fetch at a time
		for (let i = 0; i < remoteFetchUrls.length; i += 10) {
			const batch = remoteFetchUrls.slice(i, i + 10);
			await updateRulesForRepos(batch);
		}
		this._lastRuleFetch = Date.now();
		this._logService.info(`Fetched content exclusion rules in ${Date.now() - startTime}ms`);

		// Log the fetched rules to the request logger for debugging visibility
		const repos = Array.from(this._contentExclusionCache.keys());
		const rules = repos.map(repo => {
			const entry = this._contentExclusionCache.get(repo)!;
			return {
				patterns: entry.patterns,
				ifAnyMatch: entry.ifAnyMatch.map(r => r.toString()),
				ifNoneMatch: entry.ifNoneMatch.map(r => r.toString())
			};
		});
		this._requestLogger.logContentExclusionRules(repos, rules, Date.now() - startTime);
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

/**
 * Convert a given string /pattern/flags to a RegExp object
 */
function stringToRegex(str: string): RegExp {
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
