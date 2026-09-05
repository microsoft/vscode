/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash, randomUUID } from 'crypto';
import { AuthenticationSession, Disposable, Event, EventEmitter, Uri, env, l10n, workspace } from 'vscode';
import { RemoteSourceProvider, RemoteSource, RemoteSourceAction } from './typings/git-base.js';
import { getExistingSession, getOctokit, getSession } from './auth.js';
import { Octokit } from '@octokit/rest';
import { getRepositoryFromQuery, getRepositoryFromUrl } from './util.js';
import { getBranchLink, getVscodeDevHost } from './links.js';

export type RemoteSourceResponse = {
	readonly full_name: string;
	readonly description: string | null;
	readonly stargazers_count: number;
	readonly clone_url: string;
	readonly ssh_url: string;
};

export type OwnedRepositoriesCache = {
	readonly version: 3;
	readonly accountId: string;
	readonly owner: string;
	readonly refreshedAt: number;
	readonly validatedAt: number;
	readonly firstPageEtag?: string;
	readonly repositories: string[];
};

export interface OwnedRepositoriesCacheStorage {
	get(accountId: string): Promise<OwnedRepositoriesCache | undefined>;
	update(cache: OwnedRepositoriesCache): Promise<void>;
	delete(accountId: string): Promise<void>;
}

type QueryCacheEntry = {
	readonly createdAt: number;
	readonly results: RemoteSourceResponse[];
};

const ownedRepositoriesValidationTtl = 60 * 60 * 1000;
const ownedRepositoriesRefreshTtl = 24 * 60 * 60 * 1000;
const ownedRepositoriesRefreshRetryDelays = [60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000];
const queryCacheTtl = 5 * 60 * 1000;
const publicSearchMinQueryLength = 3;
const publicSearchDelay = 300;
const maxRemoteSources = 100;
const maxQueryCacheEntries = 20;

export class FileOwnedRepositoriesCacheStorage implements OwnedRepositoriesCacheStorage {
	private operationPromise = Promise.resolve();

	constructor(
		private readonly storageUri: Uri,
		private readonly fileSystem: Pick<typeof workspace.fs, 'createDirectory' | 'delete' | 'readFile' | 'rename' | 'writeFile'> = workspace.fs,
		private readonly createTemporarySuffix: () => string = randomUUID
	) { }

	async get(accountId: string): Promise<OwnedRepositoriesCache | undefined> {
		await this.operationPromise;
		try {
			const contents = await this.fileSystem.readFile(this.getCacheUri(accountId));
			return JSON.parse(new TextDecoder().decode(contents));
		} catch {
			return undefined;
		}
	}

	update(cache: OwnedRepositoriesCache): Promise<void> {
		return this.queueOperation(async () => {
			await this.fileSystem.createDirectory(this.storageUri);
			const cacheUri = this.getCacheUri(cache.accountId);
			const temporaryUri = Uri.joinPath(this.storageUri, `${cacheUri.path.split('/').pop()}.${this.createTemporarySuffix()}.tmp`);
			try {
				await this.fileSystem.writeFile(temporaryUri, new TextEncoder().encode(JSON.stringify(cache)));
				await this.fileSystem.rename(temporaryUri, cacheUri, { overwrite: true });
			} finally {
				try {
					await this.fileSystem.delete(temporaryUri);
				} catch {
					// The rename removes the temporary file after a successful update.
				}
			}
		});
	}

	delete(accountId: string): Promise<void> {
		return this.queueOperation(async () => {
			try {
				await this.fileSystem.delete(this.getCacheUri(accountId));
			} catch {
				// The cache may not have been created yet.
			}
		});
	}

	private getCacheUri(accountId: string): Uri {
		const accountHash = createHash('sha256').update(accountId).digest('hex').slice(0, 16);
		return Uri.joinPath(this.storageUri, `owned-repositories-v3-${accountHash}.json`);
	}

	private queueOperation(operation: () => Promise<void>): Promise<void> {
		const result = this.operationPromise.then(operation, operation);
		this.operationPromise = result.then(() => undefined, () => undefined);
		return result;
	}
}

type IndexedRepository = {
	readonly repository: RemoteSourceResponse;
	readonly fullName: string;
	readonly owner: string;
	readonly repoName: string;
	readonly tokenizedFullName: string;
	readonly tokenizedRepoName: string;
};

type NormalizedQuery = {
	readonly raw: string;
	readonly tokenized: string;
};

export class RepositorySearchIndex {
	private readonly repositories: IndexedRepository[];

	constructor(repositories: readonly RemoteSourceResponse[]) {
		const uniqueRepositories = new Map<string, RemoteSourceResponse>();
		for (const repository of repositories) {
			const key = repository.full_name.toLowerCase();
			if (!uniqueRepositories.has(key)) {
				uniqueRepositories.set(key, repository);
			}
		}

		this.repositories = [...uniqueRepositories.values()].map(repository => {
			const fullName = repository.full_name.toLowerCase();
			const separatorIndex = fullName.indexOf('/');
			const repoName = separatorIndex === -1 ? fullName : fullName.slice(separatorIndex + 1);
			return {
				repository,
				fullName,
				owner: separatorIndex === -1 ? '' : fullName.slice(0, separatorIndex),
				repoName,
				tokenizedFullName: normalizeSearchText(fullName),
				tokenizedRepoName: normalizeSearchText(repoName)
			};
		});
	}

	first(limit: number): RemoteSourceResponse[] {
		return this.repositories.slice(0, limit).map(repository => repository.repository);
	}

	search(query: string, owner: string | undefined, limit: number): RemoteSourceResponse[] {
		const normalizedQuery = normalizeQuery(query);
		if (!normalizedQuery.raw || !normalizedQuery.tokenized) {
			return [];
		}

		const normalizedOwner = owner?.toLowerCase();
		const buckets: RemoteSourceResponse[][] = Array.from({ length: normalizedOwner ? 6 : 3 }, () => []);
		for (const repository of this.repositories) {
			const score = scoreIndexedRepository(repository, normalizedQuery);
			if (score === 0) {
				continue;
			}

			const ownershipOffset = normalizedOwner && repository.owner !== normalizedOwner ? 3 : 0;
			buckets[ownershipOffset + 3 - score].push(repository.repository);
		}

		const result: RemoteSourceResponse[] = [];
		for (const bucket of buckets) {
			for (const repository of bucket) {
				result.push(repository);
				if (result.length === limit) {
					return result;
				}
			}
		}
		return result;
	}
}

function asRemoteSourceResponse(raw: RemoteSourceResponse): RemoteSourceResponse {
	return {
		full_name: raw.full_name,
		description: raw.description,
		stargazers_count: raw.stargazers_count,
		clone_url: raw.clone_url,
		ssh_url: raw.ssh_url
	};
}

function asCachedRemoteSourceResponse(fullName: string): RemoteSourceResponse {
	return {
		full_name: fullName,
		description: null,
		stargazers_count: 0,
		clone_url: `https://github.com/${fullName}.git`,
		ssh_url: `git@github.com:${fullName}.git`
	};
}

function asRemoteSource(raw: RemoteSourceResponse, protocol: 'https' | 'ssh'): RemoteSource {
	return {
		name: `$(github) ${raw.full_name}`,
		description: `${raw.stargazers_count > 0 ? `$(star-full) ${raw.stargazers_count}` : ''}`,
		detail: raw.description || undefined,
		url: protocol === 'https' ? raw.clone_url : raw.ssh_url
	};
}

function asRemoteSources(repositories: RemoteSourceResponse[]): RemoteSource[] {
	const protocol = workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol', 'https');
	return repositories.map(repository => asRemoteSource(repository, protocol));
}

function normalizeSearchText(value: string): string {
	return value.toLowerCase().replace(/[-_.\/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeQuery(query: string): NormalizedQuery {
	const raw = query.trim().toLowerCase();
	return { raw, tokenized: normalizeSearchText(raw) };
}

function scoreIndexedRepository(repository: IndexedRepository, query: NormalizedQuery): number {
	if (repository.repoName === query.raw || repository.fullName === query.raw || repository.tokenizedRepoName === query.tokenized || repository.tokenizedFullName === query.tokenized) {
		return 3;
	}

	if (repository.repoName.startsWith(query.raw) || repository.fullName.startsWith(query.raw) || repository.tokenizedRepoName.startsWith(query.tokenized) || repository.tokenizedFullName.startsWith(query.tokenized)) {
		return 2;
	}

	return repository.repoName.includes(query.raw) || repository.fullName.includes(query.raw) || repository.tokenizedRepoName.includes(query.tokenized) || repository.tokenizedFullName.includes(query.tokenized) ? 1 : 0;
}

function mergeRepositoryResults(preferred: readonly RemoteSourceResponse[], fallback: readonly RemoteSourceResponse[], limit: number): RemoteSourceResponse[] {
	const result = new Map<string, RemoteSourceResponse>();
	for (const repository of [...preferred, ...fallback]) {
		const key = repository.full_name.toLowerCase();
		if (!result.has(key)) {
			result.set(key, repository);
			if (result.size === limit) {
				break;
			}
		}
	}
	return [...result.values()];
}

function isOwnedRepositoriesCache(value: OwnedRepositoriesCache | undefined, accountId: string): value is OwnedRepositoriesCache {
	return value?.version === 3
		&& value.accountId === accountId
		&& typeof value.owner === 'string'
		&& typeof value.refreshedAt === 'number'
		&& typeof value.validatedAt === 'number'
		&& (value.firstPageEtag === undefined || typeof value.firstPageEtag === 'string')
		&& Array.isArray(value.repositories)
		&& value.repositories.every(repository => typeof repository === 'string');
}

function isNotModified(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as { status?: unknown }).status === 304;
}

function isAbortError(error: unknown): boolean {
	return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

export class GithubRemoteSourceProvider implements RemoteSourceProvider, Disposable {

	readonly name = 'GitHub';
	readonly icon = 'github';
	readonly supportsQuery = true;

	private readonly onDidChangeRemoteSourcesEmitter = new EventEmitter<void>();
	readonly onDidChangeRemoteSources = this.onDidChangeRemoteSourcesEmitter.event;

	private account: { id: string; octokit: Octokit } | undefined;
	private accountGeneration = 0;
	private authenticationUnavailable = false;
	private initializePromise: Promise<void> | undefined;
	private owner: string | undefined;
	private ownedRepositories: RemoteSourceResponse[] = [];
	private ownedRepositoriesIndex = new RepositorySearchIndex([]);
	private ownedRepositoriesRefreshedAt = 0;
	private ownedRepositoriesValidatedAt = 0;
	private ownedRepositoriesFirstPageEtag: string | undefined;
	private ownedRepositoriesLastRefreshAttemptAt: number | undefined;
	private ownedRepositoriesRefreshFailureCount = 0;
	private ownedRepositoriesRefreshRequest: { controller: AbortController; promise: Promise<void> } | undefined;
	private readonly queryCache = new Map<string, QueryCacheEntry>();
	private queryCacheIndex: RepositorySearchIndex | undefined;
	private queryTimer: ReturnType<typeof setTimeout> | undefined;
	private scheduledQueryCacheKey: string | undefined;
	private activeQueryRequest: { cacheKey: string; controller: AbortController } | undefined;
	private readonly authenticationChangeSubscription: Disposable | undefined;

	constructor(
		private readonly octokitProvider: () => Promise<Octokit> = getOctokit,
		private readonly sessionProvider: () => Promise<AuthenticationSession> = getSession,
		private readonly cacheStorage?: OwnedRepositoriesCacheStorage,
		private readonly now: () => number = Date.now,
		onDidChangeSessions?: Event<void>,
		private readonly existingSessionProvider: () => Promise<AuthenticationSession | undefined> = getExistingSession,
		private readonly searchDelay = publicSearchDelay
	) {
		this.authenticationChangeSubscription = onDidChangeSessions?.(() => void this.handleAuthenticationChange());
	}

	dispose(): void {
		this.cancelOwnedRepositoriesRefresh();
		this.cancelQuery();
		this.authenticationChangeSubscription?.dispose();
		this.onDidChangeRemoteSourcesEmitter.dispose();
	}

	getRemoteSources(query?: string): RemoteSource[] | Promise<RemoteSource[]> {
		if (this.authenticationUnavailable) {
			return [];
		}
		if (!this.account) {
			this.initializePromise ??= this.initializeAccount();
			return this.initializePromise.then(() => this.account ? this.getRemoteSourcesForCurrentAccount(query) : this.getRemoteSources(query));
		}
		return this.getRemoteSourcesForCurrentAccount(query);
	}

	private getRemoteSourcesForCurrentAccount(query?: string): RemoteSource[] | Promise<RemoteSource[]> {
		const normalizedQuery = query?.trim();
		if (!normalizedQuery) {
			this.cancelQuery();
			return asRemoteSources(this.ownedRepositoriesIndex.first(maxRemoteSources));
		}

		const repository = getRepositoryFromUrl(normalizedQuery);
		if (repository) {
			this.cancelQuery();
			return this.account!.octokit.repos.get(repository)
				.then(raw => [asRemoteSource(asRemoteSourceResponse(raw.data), workspace.getConfiguration('github').get<'https' | 'ssh'>('gitProtocol', 'https'))]);
		}

		if (normalizeSearchText(normalizedQuery).replace(/\s/g, '').length >= publicSearchMinQueryLength) {
			this.scheduleQuery(this.account!.octokit, normalizedQuery);
		} else {
			this.cancelQuery();
		}

		return this.getCachedRemoteSources(normalizedQuery);
	}

	private getCachedRemoteSources(query: string): RemoteSource[] {
		const ownedResults = this.ownedRepositoriesIndex.search(query, undefined, maxRemoteSources);
		const queryResults = this.getCachedQueryResults(query);
		return asRemoteSources(mergeRepositoryResults(ownedResults, queryResults, maxRemoteSources));
	}

	private async initializeAccount(): Promise<void> {
		const generation = this.accountGeneration;
		try {
			const [octokit, session] = await Promise.all([this.octokitProvider(), this.sessionProvider()]);
			if (generation !== this.accountGeneration) {
				return;
			}

			this.account = { id: session.account.id, octokit };
			const storedCache = await this.cacheStorage?.get(session.account.id);
			if (generation !== this.accountGeneration) {
				return;
			}

			if (isOwnedRepositoriesCache(storedCache, session.account.id)) {
				this.owner = storedCache.owner;
				this.setOwnedRepositories(storedCache.repositories.map(asCachedRemoteSourceResponse));
				this.ownedRepositoriesRefreshedAt = storedCache.refreshedAt;
				this.ownedRepositoriesValidatedAt = storedCache.validatedAt;
				this.ownedRepositoriesFirstPageEtag = storedCache.firstPageEtag;
				this.refreshOwnedRepositoriesIfNeeded();
				return;
			}

			await this.initializeOwnedRepositories();
		} finally {
			if (generation === this.accountGeneration) {
				this.initializePromise = undefined;
			}
		}
	}

	private async initializeOwnedRepositories(): Promise<void> {
		const account = this.account!;
		const generation = this.accountGeneration;
		const controller = new AbortController();
		const promise = (async () => {
			try {
				const [user, firstPage] = await Promise.all([
					account.octokit.users.getAuthenticated({ request: { signal: controller.signal } }),
					account.octokit.repos.listForAuthenticatedUser({ affiliation: 'owner', sort: 'updated', per_page: 100, page: 1, request: { signal: controller.signal } })
				]);
				if (!this.isCurrentAccount(account.id, generation)) {
					return;
				}

				this.owner = user.data.login;
				this.setOwnedRepositories(firstPage.data.map(asRemoteSourceResponse));
				this.onDidChangeRemoteSourcesEmitter.fire();
				void this.refreshOwnedRepositories(firstPage.data.map(asRemoteSourceResponse), firstPage.headers.etag);
			} catch (error) {
				if (!isAbortError(error) && this.isCurrentAccount(account.id, generation)) {
					console.error(error);
				}
				throw error;
			}
		})();
		this.ownedRepositoriesRefreshRequest = { controller, promise };
		await promise.finally(() => {
			if (this.ownedRepositoriesRefreshRequest?.controller === controller) {
				this.ownedRepositoriesRefreshRequest = undefined;
			}
		});
	}

	private refreshOwnedRepositoriesIfNeeded(): void {
		if (this.now() - this.ownedRepositoriesValidatedAt < ownedRepositoriesValidationTtl || !this.canRetryOwnedRepositoriesRefresh()) {
			return;
		}

		if (this.now() - this.ownedRepositoriesRefreshedAt >= ownedRepositoriesRefreshTtl) {
			void this.refreshOwnedRepositories();
		} else {
			void this.validateOwnedRepositories();
		}
	}

	private async validateOwnedRepositories(): Promise<void> {
		if (this.ownedRepositoriesRefreshRequest || !this.account) {
			return;
		}

		const account = this.account;
		const generation = this.accountGeneration;
		const controller = new AbortController();
		this.ownedRepositoriesLastRefreshAttemptAt = this.now();
		const promise = (async () => {
			try {
				const firstPage = await account.octokit.repos.listForAuthenticatedUser({
					affiliation: 'owner', sort: 'updated', per_page: 100, page: 1,
					request: {
						signal: controller.signal,
						headers: this.ownedRepositoriesFirstPageEtag ? { 'if-none-match': this.ownedRepositoriesFirstPageEtag } : undefined
					}
				});
				if (this.isCurrentAccount(account.id, generation)) {
					await this.refreshOwnedRepositories(firstPage.data.map(asRemoteSourceResponse), firstPage.headers.etag);
				}
			} catch (error) {
				if (isNotModified(error) && this.isCurrentAccount(account.id, generation)) {
					this.ownedRepositoriesValidatedAt = this.now();
					this.ownedRepositoriesRefreshFailureCount = 0;
					await this.persistOwnedRepositories();
				} else if (!isAbortError(error) && this.isCurrentAccount(account.id, generation)) {
					this.recordOwnedRepositoriesRefreshFailure(error);
				}
			}
		})();
		this.ownedRepositoriesRefreshRequest = { controller, promise };
		await promise.finally(() => {
			if (this.ownedRepositoriesRefreshRequest?.controller === controller) {
				this.ownedRepositoriesRefreshRequest = undefined;
			}
		});
	}

	private async refreshOwnedRepositories(initialPage?: RemoteSourceResponse[], firstPageEtag?: string): Promise<void> {
		if (!this.account) {
			return;
		}

		const account = this.account;
		const generation = this.accountGeneration;
		this.cancelOwnedRepositoriesRefresh();
		const controller = new AbortController();
		this.ownedRepositoriesLastRefreshAttemptAt = this.now();
		const promise = (async () => {
			try {
				let firstPage = initialPage;
				if (!firstPage) {
					const response = await account.octokit.repos.listForAuthenticatedUser({
						affiliation: 'owner', sort: 'updated', per_page: 100, page: 1, request: { signal: controller.signal }
					});
					firstPage = response.data.map(asRemoteSourceResponse);
					firstPageEtag = response.headers.etag;
				}

				const remainingRepositories = firstPage.length === 100
					? await account.octokit.paginate(account.octokit.repos.listForAuthenticatedUser, {
						affiliation: 'owner', sort: 'updated', per_page: 100, page: 2, request: { signal: controller.signal }
					})
					: [];
				if (!this.isCurrentAccount(account.id, generation)) {
					return;
				}

				this.setOwnedRepositories([...firstPage, ...remainingRepositories.map(asRemoteSourceResponse)]);
				this.ownedRepositoriesRefreshedAt = this.now();
				this.ownedRepositoriesValidatedAt = this.now();
				this.ownedRepositoriesFirstPageEtag = firstPageEtag;
				this.ownedRepositoriesRefreshFailureCount = 0;
				await this.persistOwnedRepositories();
				this.onDidChangeRemoteSourcesEmitter.fire();
			} catch (error) {
				if (!isAbortError(error) && this.isCurrentAccount(account.id, generation)) {
					this.recordOwnedRepositoriesRefreshFailure(error);
				}
			}
		})();
		this.ownedRepositoriesRefreshRequest = { controller, promise };
		await promise.finally(() => {
			if (this.ownedRepositoriesRefreshRequest?.controller === controller) {
				this.ownedRepositoriesRefreshRequest = undefined;
			}
		});
	}

	private canRetryOwnedRepositoriesRefresh(): boolean {
		if (this.ownedRepositoriesLastRefreshAttemptAt === undefined || this.ownedRepositoriesRefreshFailureCount === 0) {
			return true;
		}
		const retryDelay = ownedRepositoriesRefreshRetryDelays[Math.min(this.ownedRepositoriesRefreshFailureCount - 1, ownedRepositoriesRefreshRetryDelays.length - 1)];
		return this.now() - this.ownedRepositoriesLastRefreshAttemptAt >= retryDelay;
	}

	private recordOwnedRepositoriesRefreshFailure(error: unknown): void {
		this.ownedRepositoriesRefreshFailureCount++;
		console.error(error);
	}

	private setOwnedRepositories(repositories: RemoteSourceResponse[]): void {
		this.ownedRepositories = repositories;
		this.ownedRepositoriesIndex = new RepositorySearchIndex(repositories);
	}

	private scheduleQuery(octokit: Octokit, query: string): void {
		const cacheKey = query.toLowerCase();
		this.pruneQueryCache();
		if (this.queryCache.has(cacheKey)) {
			this.cancelQuery(cacheKey);
			return;
		}
		if (this.scheduledQueryCacheKey === cacheKey || this.activeQueryRequest?.cacheKey === cacheKey) {
			return;
		}

		this.cancelQuery();
		this.scheduledQueryCacheKey = cacheKey;
		this.queryTimer = setTimeout(() => {
			this.queryTimer = undefined;
			this.scheduledQueryCacheKey = undefined;
			this.startQuery(octokit, query, cacheKey);
		}, this.searchDelay);
	}

	private startQuery(octokit: Octokit, query: string, cacheKey: string): void {
		const repository = getRepositoryFromQuery(query);
		if (repository) {
			query = `user:${repository.owner}+${repository.repo}`;
		}

		const controller = new AbortController();
		this.activeQueryRequest = { cacheKey, controller };
		void octokit.search.repos({ q: `${query} fork:true`, sort: 'stars', request: { signal: controller.signal } }).then(
			raw => {
				if (this.activeQueryRequest?.controller !== controller) {
					return;
				}
				this.queryCache.set(cacheKey, { createdAt: this.now(), results: raw.data.items.map(asRemoteSourceResponse) });
				this.queryCacheIndex = undefined;
				this.activeQueryRequest = undefined;
				this.onDidChangeRemoteSourcesEmitter.fire();
			},
			error => {
				if (this.activeQueryRequest?.controller !== controller) {
					return;
				}
				this.activeQueryRequest = undefined;
				if (!isAbortError(error)) {
					console.error(error);
				}
			}
		);
	}

	private getCachedQueryResults(query: string): RemoteSourceResponse[] {
		this.pruneQueryCache();
		if (!this.queryCacheIndex) {
			this.queryCacheIndex = new RepositorySearchIndex([...this.queryCache.values()].flatMap(entry => entry.results));
		}
		return this.queryCacheIndex.search(query, this.owner, maxRemoteSources);
	}

	private pruneQueryCache(): void {
		for (const [cacheKey, entry] of this.queryCache) {
			if (this.now() - entry.createdAt >= queryCacheTtl) {
				this.queryCache.delete(cacheKey);
				this.queryCacheIndex = undefined;
			}
		}
		while (this.queryCache.size >= maxQueryCacheEntries) {
			const oldestCacheKey = this.queryCache.keys().next().value;
			if (oldestCacheKey === undefined) {
				break;
			}
			this.queryCache.delete(oldestCacheKey);
			this.queryCacheIndex = undefined;
		}
	}

	private cancelQuery(exceptCacheKey?: string): void {
		if (this.queryTimer && this.scheduledQueryCacheKey !== exceptCacheKey) {
			clearTimeout(this.queryTimer);
			this.queryTimer = undefined;
			this.scheduledQueryCacheKey = undefined;
		}
		if (this.activeQueryRequest && this.activeQueryRequest.cacheKey !== exceptCacheKey) {
			this.activeQueryRequest.controller.abort();
			this.activeQueryRequest = undefined;
		}
	}

	private cancelOwnedRepositoriesRefresh(): void {
		this.ownedRepositoriesRefreshRequest?.controller.abort();
		this.ownedRepositoriesRefreshRequest = undefined;
	}

	private isCurrentAccount(accountId: string, generation: number): boolean {
		return this.account?.id === accountId && this.accountGeneration === generation;
	}

	private async handleAuthenticationChange(): Promise<void> {
		const previousAccountId = this.account?.id;
		this.resetAccount();

		try {
			const session = await this.existingSessionProvider();
			this.authenticationUnavailable = !session;
			if (previousAccountId && (!session || session.account.id !== previousAccountId)) {
				await this.deleteOwnedRepositoriesCache(previousAccountId);
			}
		} catch (error) {
			console.error(error);
		} finally {
			this.onDidChangeRemoteSourcesEmitter.fire();
		}
	}

	private resetAccount(): void {
		this.cancelOwnedRepositoriesRefresh();
		this.cancelQuery();
		this.accountGeneration++;
		this.account = undefined;
		this.authenticationUnavailable = false;
		this.initializePromise = undefined;
		this.owner = undefined;
		this.setOwnedRepositories([]);
		this.ownedRepositoriesRefreshedAt = 0;
		this.ownedRepositoriesValidatedAt = 0;
		this.ownedRepositoriesFirstPageEtag = undefined;
		this.ownedRepositoriesLastRefreshAttemptAt = undefined;
		this.ownedRepositoriesRefreshFailureCount = 0;
		this.queryCache.clear();
		this.queryCacheIndex = undefined;
	}

	private async deleteOwnedRepositoriesCache(accountId: string): Promise<void> {
		try {
			await this.cacheStorage?.delete(accountId);
		} catch (error) {
			console.error(error);
		}
	}

	private async persistOwnedRepositories(): Promise<void> {
		if (!this.cacheStorage || !this.account || !this.owner) {
			return;
		}

		try {
			await this.cacheStorage.update({
				version: 3,
				accountId: this.account.id,
				owner: this.owner,
				refreshedAt: this.ownedRepositoriesRefreshedAt,
				validatedAt: this.ownedRepositoriesValidatedAt,
				firstPageEtag: this.ownedRepositoriesFirstPageEtag,
				repositories: this.ownedRepositories.map(repository => repository.full_name)
			});
		} catch (error) {
			console.error(error);
		}
	}

	async getBranches(url: string): Promise<string[]> {
		const repository = getRepositoryFromUrl(url);

		if (!repository) {
			return [];
		}

		const octokit = await getOctokit();

		const branches: string[] = [];
		let page = 1;

		while (true) {
			const res = await octokit.repos.listBranches({ ...repository, per_page: 100, page });

			if (res.data.length === 0) {
				break;
			}

			branches.push(...res.data.map(b => b.name));
			page++;
		}

		const repo = await octokit.repos.get(repository);
		const defaultBranch = repo.data.default_branch;

		return branches.sort((a, b) => a === defaultBranch ? -1 : b === defaultBranch ? 1 : 0);
	}

	async getRemoteSourceActions(url: string): Promise<RemoteSourceAction[]> {
		const repository = getRepositoryFromUrl(url);
		if (!repository) {
			return [];
		}

		return [{
			label: l10n.t('Open on GitHub'),
			icon: 'github',
			run(branch: string) {
				const link = getBranchLink(url, branch);
				env.openExternal(Uri.parse(link));
			}
		}, {
			label: l10n.t('Checkout on vscode.dev'),
			icon: 'globe',
			run(branch: string) {
				const link = getBranchLink(url, branch, getVscodeDevHost());
				env.openExternal(Uri.parse(link));
			}
		}];
	}
}
