/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import type { Octokit } from '@octokit/rest';
import { AuthenticationSession, EventEmitter, Uri, workspace } from 'vscode';
import { FileOwnedRepositoriesCacheStorage, GithubRemoteSourceProvider, OwnedRepositoriesCache, OwnedRepositoriesCacheStorage, RepositorySearchIndex } from '../remoteSourceProvider.js';

suite('GithubRemoteSourceProvider', function () {

	function apiRepository(fullName: string, description: string | null = null) {
		return {
			full_name: fullName,
			description,
			stargazers_count: 0,
			clone_url: `https://github.com/${fullName}.git`,
			ssh_url: `git@github.com:${fullName}.git`
		};
	}

	function session(accountId = 'owner'): AuthenticationSession {
		return {
			id: `session-${accountId}`,
			accessToken: 'token',
			account: { id: accountId, label: accountId },
			scopes: []
		};
	}

	function cacheStorage(initial?: OwnedRepositoriesCache): OwnedRepositoriesCacheStorage & { value: OwnedRepositoriesCache | undefined } {
		return {
			value: initial,
			async get(accountId) { return this.value?.accountId === accountId ? this.value : undefined; },
			async update(cache) { this.value = cache; },
			async delete(accountId) {
				if (this.value?.accountId === accountId) {
					this.value = undefined;
				}
			}
		};
	}

	function createProvider(octokit: Octokit, storage?: OwnedRepositoriesCacheStorage, now: () => number = Date.now, sessionChanges?: EventEmitter<void>, existingSessionProvider?: () => Promise<AuthenticationSession | undefined>) {
		return new GithubRemoteSourceProvider(
			async () => octokit,
			async () => session(),
			storage,
			now,
			sessionChanges?.event,
			existingSessionProvider,
			0
		);
	}

	async function flushAsyncWork(): Promise<void> {
		await new Promise(resolve => setTimeout(resolve, 0));
		await Promise.resolve();
	}

	function inMemoryFileSystem() {
		const files = new Map<string, Uint8Array>();
		const key = (uri: Uri) => uri.toString();
		const fileSystem: Pick<typeof workspace.fs, 'createDirectory' | 'delete' | 'readFile' | 'rename' | 'writeFile'> = {
			createDirectory: async () => undefined,
			delete: async uri => {
				if (!files.delete(key(uri))) {
					throw new Error('File not found');
				}
			},
			readFile: async uri => {
				const contents = files.get(key(uri));
				if (!contents) {
					throw new Error('File not found');
				}
				return contents;
			},
			rename: async (source, target) => {
				const contents = files.get(key(source));
				if (!contents) {
					throw new Error('File not found');
				}
				files.set(key(target), contents);
				files.delete(key(source));
			},
			writeFile: async (uri, contents) => { files.set(key(uri), contents); }
		};
		return { files, fileSystem };
	}

	test('ranks exact, prefix, and substring matches', function () {
		const index = new RepositorySearchIndex([
			apiRepository('owner/my-life'),
			apiRepository('owner/lifetime'),
			apiRepository('owner/life')
		]);

		assert.deepStrictEqual(index.search('life', undefined, 100).map(result => result.full_name), [
			'owner/life',
			'owner/lifetime',
			'owner/my-life'
		]);
	});

	test('places owned repositories before other exact matches', function () {
		const index = new RepositorySearchIndex([
			apiRepository('organization/transactions'),
			apiRepository('owner/my-transactions'),
			apiRepository('owner/transactions-archive'),
			apiRepository('owner/transactions')
		]);

		assert.deepStrictEqual(index.search('transactions', 'owner', 100).map(result => result.full_name), [
			'owner/transactions',
			'owner/transactions-archive',
			'owner/my-transactions',
			'organization/transactions'
		]);
	});

	test('normalizes separators and deduplicates case-insensitively', function () {
		const index = new RepositorySearchIndex([
			apiRepository('owner/llm-eval-workbench', 'preferred'),
			apiRepository('OWNER/LLM-EVAL-WORKBENCH', 'duplicate'),
			apiRepository('owner/my_transaction.service')
		]);

		assert.deepStrictEqual(index.search('  LLM EVAL  ', undefined, 100).map(result => result.description), ['preferred']);
		assert.deepStrictEqual(index.search('transaction service', undefined, 100).map(result => result.full_name), ['owner/my_transaction.service']);
	});

	test('searches a large repository cache in one pass', function () {
		const repositories = Array.from({ length: 50_000 }, (_, index) => apiRepository(`organization/repository-${index}`));
		repositories.splice(25_000, 0, apiRepository('owner/transactions'));
		const index = new RepositorySearchIndex(repositories);

		assert.deepStrictEqual(index.search('transactions', 'owner', 100).map(result => result.full_name), ['owner/transactions']);
	});

	test('stores minimal account-specific caches using atomic writes', async function () {
		const { files, fileSystem } = inMemoryFileSystem();
		const storageUri = Uri.file('/cache');
		const firstWindow = new FileOwnedRepositoriesCacheStorage(storageUri, fileSystem, () => 'window-a');
		const secondWindow = new FileOwnedRepositoriesCacheStorage(storageUri, fileSystem, () => 'window-b');
		const firstCache: OwnedRepositoriesCache = {
			version: 3,
			accountId: 'account-a',
			owner: 'account-a',
			refreshedAt: 1,
			validatedAt: 1,
			repositories: ['account-a/private']
		};
		const secondCache = { ...firstCache, accountId: 'account-b', owner: 'account-b', repositories: ['account-b/private'] };

		await Promise.all([firstWindow.update(firstCache), secondWindow.update(secondCache)]);

		assert.deepStrictEqual(await firstWindow.get('account-a'), firstCache);
		assert.deepStrictEqual(await secondWindow.get('account-b'), secondCache);
		assert.strictEqual(files.size, 2);
		assert.strictEqual([...files.keys()].some(path => path.endsWith('.tmp')), false);
	});

	test('fetches and persists only repositories owned by the authenticated user', async function () {
		const firstPage = Array.from({ length: 100 }, (_, index) => apiRepository(`owner/repository-${index}`));
		let listOptions: unknown;
		let paginateOptions: unknown;
		const storage = cacheStorage();
		const octokit = {
			users: { getAuthenticated: async () => ({ data: { login: 'owner' } }) },
			repos: {
				listForAuthenticatedUser: async (options: unknown) => {
					listOptions = options;
					return { data: firstPage, headers: { etag: 'etag' } };
				}
			},
			paginate: async (_method: unknown, options: unknown) => {
				paginateOptions = options;
				return [apiRepository('owner/transactions')];
			},
			search: { repos: async () => ({ data: { items: [] } }) }
		} as unknown as Octokit;
		const provider = createProvider(octokit, storage, () => 1000);

		await provider.getRemoteSources();
		await flushAsyncWork();

		assert.strictEqual((listOptions as { affiliation: string }).affiliation, 'owner');
		assert.strictEqual((paginateOptions as { affiliation: string }).affiliation, 'owner');
		assert.deepStrictEqual(storage.value?.repositories.at(-1), 'owner/transactions');
		assert.strictEqual(typeof storage.value?.repositories[0], 'string');
	});

	test('serves a fresh disk cache synchronously after initialization', async function () {
		const storage = cacheStorage({
			version: 3,
			accountId: 'owner',
			owner: 'owner',
			refreshedAt: 1000,
			validatedAt: 1000,
			repositories: ['owner/life', 'owner/transactions']
		});
		let repositoryRequestCount = 0;
		const octokit = {
			repos: { listForAuthenticatedUser: async () => { repositoryRequestCount++; return { data: [], headers: {} }; } },
			search: { repos: async () => ({ data: { items: [] } }) }
		} as unknown as Octokit;
		const provider = createProvider(octokit, storage, () => 1001);

		await provider.getRemoteSources();
		const life = provider.getRemoteSources('life');
		const transactions = provider.getRemoteSources('transactions');

		assert.ok(Array.isArray(life));
		assert.ok(Array.isArray(transactions));
		assert.deepStrictEqual(life.map(result => result.name), ['$(github) owner/life']);
		assert.deepStrictEqual(transactions.map(result => result.name), ['$(github) owner/transactions']);
		assert.strictEqual(repositoryRequestCount, 0);
	});

	test('uses a conditional request to validate an hourly cache', async function () {
		const hour = 60 * 60 * 1000;
		const storage = cacheStorage({
			version: 3,
			accountId: 'owner',
			owner: 'owner',
			refreshedAt: hour,
			validatedAt: 0,
			firstPageEtag: 'etag',
			repositories: ['owner/transactions']
		});
		let requestHeaders: unknown;
		const octokit = {
			repos: {
				listForAuthenticatedUser: async (options: { request: { headers: unknown } }) => {
					requestHeaders = options.request.headers;
					throw Object.assign(new Error('Not modified'), { status: 304 });
				}
			},
			search: { repos: async () => ({ data: { items: [] } }) }
		} as unknown as Octokit;
		const provider = createProvider(octokit, storage, () => hour + 1);

		const results = await provider.getRemoteSources('transactions');
		await flushAsyncWork();

		assert.deepStrictEqual(results.map(result => result.name), ['$(github) owner/transactions']);
		assert.deepStrictEqual(requestHeaders, { 'if-none-match': 'etag' });
		assert.strictEqual(storage.value?.validatedAt, hour + 1);
	});

	test('keeps matching search results while a query is narrowed', async function () {
		const octokit = {
			users: { getAuthenticated: async () => ({ data: { login: 'owner' } }) },
			repos: { listForAuthenticatedUser: async () => ({ data: [apiRepository('owner/transactions')], headers: {} }) },
			paginate: async () => [],
			search: { repos: async () => ({ data: { items: [apiRepository('public/transactional')] } }) }
		} as unknown as Octokit;
		const provider = createProvider(octokit);

		await provider.getRemoteSources('transact');
		await flushAsyncWork();
		const initialResults = await provider.getRemoteSources('transact');
		const narrowedResults = await provider.getRemoteSources('transactio');

		assert.deepStrictEqual(initialResults.map(result => result.name), [
			'$(github) owner/transactions',
			'$(github) public/transactional'
		]);
		assert.deepStrictEqual(narrowedResults.map(result => result.name), [
			'$(github) owner/transactions',
			'$(github) public/transactional'
		]);
	});

	test('publishes completed search results and prioritizes the owner', async function () {
		let resolveSearch: ((value: { data: { items: ReturnType<typeof apiRepository>[] } }) => void) | undefined;
		const octokit = {
			users: { getAuthenticated: async () => ({ data: { login: 'owner' } }) },
			repos: { listForAuthenticatedUser: async () => ({ data: [], headers: {} }) },
			paginate: async () => [],
			search: {
				repos: async () => new Promise<{ data: { items: ReturnType<typeof apiRepository>[] } }>(resolve => resolveSearch = resolve)
			}
		} as unknown as Octokit;
		const provider = createProvider(octokit);
		let changeCount = 0;
		provider.onDidChangeRemoteSources(() => changeCount++);

		await provider.getRemoteSources('transaction');
		await flushAsyncWork();
		resolveSearch?.({ data: { items: [apiRepository('public/transaction'), apiRepository('owner/my-transaction')] } });
		await flushAsyncWork();
		const results = await provider.getRemoteSources('transaction');

		assert.ok(changeCount >= 1);
		assert.deepStrictEqual(results.map(result => result.name), [
			'$(github) owner/my-transaction',
			'$(github) public/transaction'
		]);
	});

	test('cancels obsolete repository searches', async function () {
		const signals: AbortSignal[] = [];
		const octokit = {
			users: { getAuthenticated: async () => ({ data: { login: 'owner' } }) },
			repos: { listForAuthenticatedUser: async () => ({ data: [], headers: {} }) },
			paginate: async () => [],
			search: {
				repos: async (options: { request: { signal: AbortSignal } }) => {
					signals.push(options.request.signal);
					return new Promise<never>(() => undefined);
				}
			}
		} as unknown as Octokit;
		const provider = createProvider(octokit);

		await provider.getRemoteSources('transaction');
		await flushAsyncWork();
		await provider.getRemoteSources('transactions');
		await flushAsyncWork();

		assert.strictEqual(signals.length, 2);
		assert.strictEqual(signals[0].aborted, true);
		assert.strictEqual(signals[1].aborted, false);
		provider.dispose();
		assert.strictEqual(signals[1].aborted, true);
	});

	test('deletes the cache after sign-out', async function () {
		const sessionChanges = new EventEmitter<void>();
		const storage = cacheStorage({
			version: 3,
			accountId: 'owner',
			owner: 'owner',
			refreshedAt: 1,
			validatedAt: 1,
			repositories: ['owner/private']
		});
		const octokit = { search: { repos: async () => ({ data: { items: [] } }) } } as unknown as Octokit;
		const provider = createProvider(octokit, storage, () => 1, sessionChanges, async () => undefined);

		await provider.getRemoteSources();
		sessionChanges.fire();
		await flushAsyncWork();

		assert.strictEqual(storage.value, undefined);
		assert.deepStrictEqual(provider.getRemoteSources(), []);
		provider.dispose();
		sessionChanges.dispose();
	});
});
