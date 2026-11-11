/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { AccountClient } from '../../../../platform/github/common/account/accountClient.js';
import { AnonymousClient } from '../../../../platform/github/common/anonymous/anonymousClient.js';
import { ApiRequest, ApiResponse, IApiRequestProvider } from '../../../../platform/github/common/client/request.js';
import { parse } from '../../../../platform/github/common/client/schema.js';
import { GitHubAuthorizationContext, GitHubRequestError } from '../../../../platform/github/common/githubTypes.js';
import { NullLogService } from '../../../../platform/log/common/log.js';
import { MainThreadGitHub } from '../../browser/mainThreadGitHub.js';
import { IAuthenticationAccessService } from '../../../services/authentication/browser/authenticationAccessService.js';
import { AuthenticationSession, IAuthenticationService } from '../../../services/authentication/common/authentication.js';
import { IWorkbenchGitHubService } from '../../../services/github/common/githubService.js';
import { nullExtensionDescription } from '../../../services/extensions/common/extensions.js';
import { createInternalGitHubModule, ExtHostGitHub } from '../../common/extHostGitHub.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';

const extensionId = 'vscode.configuration-editing';
const scopes = ['gist', 'user:email'];

function session(id: string, label: string): AuthenticationSession {
	return { id, accessToken: `secret-token-${id}`, account: { id: `account-${label}`, label }, scopes };
}

function gistResponse(id: string, files: Record<string, { content: string; truncated?: boolean }>) {
	return {
		id, node_id: `G_${id}`, url: `https://api.github.com/gists/${id}`, html_url: `https://gist.github.com/${id}`,
		git_pull_url: `https://gist.github.com/${id}.git`, git_push_url: `https://gist.github.com/${id}.git`,
		forks_url: `https://api.github.com/gists/${id}/forks`, commits_url: `https://api.github.com/gists/${id}/commits`,
		comments_url: `https://api.github.com/gists/${id}/comments`, public: false, description: null,
		files: Object.fromEntries(Object.entries(files).map(([filename, file]) => [filename, {
			filename, type: 'application/json', language: 'JSON', raw_url: `https://gist.githubusercontent.com/raw/${id}/${filename}`,
			size: file.content.length, truncated: file.truncated ?? false, content: file.content, encoding: 'utf-8',
		}])),
		truncated: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', comments: 0,
	};
}

function repositoryResponse() {
	return {
		id: 1, node_id: 'R_1', name: 'r', full_name: 'o/r', private: true,
		owner: { id: 2, node_id: 'U_2', login: 'o', avatar_url: '', html_url: 'https://github.com/o', type: 'User' },
		html_url: 'https://github.com/o/r', url: 'https://api.github.com/repos/o/r', description: null, fork: false,
		default_branch: 'main', clone_url: 'https://github.com/o/r.git', ssh_url: 'git@github.com:o/r.git',
		archived: false, disabled: false, language: null, stargazers_count: 7,
	};
}

function pullRequestResponse() {
	const branch = { label: 'o:main', ref: 'main', sha: 'a'.repeat(40), repo: repositoryResponse() };
	return {
		id: 3, node_id: 'PR_3', number: 42, html_url: 'https://github.com/o/r/pull/42', url: 'https://api.github.com/repos/o/r/pulls/42',
		title: 'Change', body: 'Description', state: 'open', draft: false, user: null, head: branch, base: branch,
		labels: [], milestone: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
		closed_at: null, merged_at: null, merge_commit_sha: null, merged: false, mergeable: null, mergeable_state: 'unknown',
		maintainer_can_modify: true, merged_by: null, commits: 1, changed_files: 1, additions: 1, deletions: 0,
		comments: 0, review_comments: 0, auto_merge: null,
	};
}

suite('MainThreadGitHub', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ISetupOptions {
		readonly sessions?: readonly AuthenticationSession[];
		readonly lookupSessions?: () => Promise<readonly AuthenticationSession[]>;
		/** Sessions of the `github-enterprise` provider, which the proposal must never bind. */
		readonly enterpriseSessions?: readonly AuthenticationSession[];
		readonly respond?: (request: ApiRequest, signal: AbortSignal) => Promise<unknown>;
		readonly acquisitionGate?: () => Promise<void>;
	}

	function setup(options: ISetupOptions = {}) {
		const requests: ApiRequest[] = [];
		const acquisitions: GitHubAuthorizationContext[] = [];
		const released: string[] = [];
		const queriedProviders: string[] = [];
		const access = new Map<string, boolean | undefined>();
		const onDidInvalidate = store.add(new Emitter<void>());
		const onDidChangeAccess = store.add(new Emitter<{ providerId: string; accountName: string }>());
		const onDidUnregisterProvider = store.add(new Emitter<{ id: string; label: string }>());
		const provider: IApiRequestProvider = {
			request: async <T>(request: ApiRequest, signal: AbortSignal, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> => {
				requests.push(request);
				const data = await (options.respond ?? (async () => gistResponse('gist-id', { 'profile.json': { content: '{}' } })))(request, signal);
				return { data: parser?.(data), status: typeof request.expectedStatus === 'number' ? request.expectedStatus : 200 };
			},
		};
		const gitHubService = upcastPartial<IWorkbenchGitHubService>({
			acquireAccountApiClient: async authorization => {
				acquisitions.push(authorization);
				await options.acquisitionGate?.();
				return new AccountClient(authorization, { rest: provider, graphql: provider, onDidInvalidate: onDidInvalidate.event }, toDisposable(() => released.push(authorization.sessionId)));
			},
			acquireAnonymousApiClient: async () => {
				await options.acquisitionGate?.();
				return new AnonymousClient(provider, undefined, toDisposable(() => released.push('anonymous')));
			},
		});
		const authenticationService = upcastPartial<IAuthenticationService>({
			onDidUnregisterAuthenticationProvider: onDidUnregisterProvider.event,
			getSessions: async (providerId: string) => {
				queriedProviders.push(providerId);
				return providerId === 'github' ? options.lookupSessions?.() ?? options.sessions ?? [] : providerId === 'github-enterprise' ? options.enterpriseSessions ?? [] : [];
			},
		});
		const accessService = upcastPartial<IAuthenticationAccessService>({
			onDidChangeExtensionSessionAccess: onDidChangeAccess.event,
			isAccessAllowed: (providerId: string, accountName: string, extension: string) => access.get(`${providerId}/${accountName}/${extension}`),
		});
		const mainThread = store.add(new MainThreadGitHub(SingleProxyRPCProtocol(null), gitHubService, authenticationService, accessService, new NullLogService()));
		const allow = (accountName: string, allowed: boolean | undefined = true, extension = extensionId, providerId = 'github') => access.set(`${providerId}/${accountName}/${extension}`, allowed);
		return { mainThread, requests, acquisitions, released, queriedProviders, allow, onDidInvalidate, onDidChangeAccess, onDidUnregisterProvider };
	}

	test('routes the GitHub extension operations through typed clients with its bound account and caller', async () => {
		const graphql: { operation: string; variables: object }[] = [];
		const user = { id: 'U_1', login: 'o', name: null, email: '', avatarUrl: 'https://avatars.githubusercontent.com/u/1' };
		const ruleset = { name: 'Protected', target: 'BRANCH', enforcement: 'ACTIVE', rules: { totalCount: 1 }, conditions: { refName: { include: ['~DEFAULT_BRANCH'], exclude: [] } } };
		const { mainThread, requests, acquisitions, allow } = setup({
			sessions: [{ ...session('selected', 'alice'), scopes: ['repo', 'workflow', 'read:user', 'user:email'] }],
			respond: async request => {
				const url = new URL(request.path, 'https://api.github.com');
				if (url.pathname === '/') {
					const body = parse.object({ query: parse.string, variables: parse.jsonObject })(JSON.parse(JSON.stringify(request.body)));
					const operation = /^query (?<name>\w+)/.exec(body.query)?.groups?.name;
					if (!operation) {
						return assert.fail('Expected a named GraphQL query');
					}
					graphql.push({ operation, variables: body.variables });
					switch (operation) {
						case 'RepositoryViewerInfo':
							return { data: { repository: { viewerPermission: 'WRITE', defaultBranchRef: { name: 'main' } } } };
						case 'RepositoryRulesets':
							return {
								data: {
									repository: {
										rulesets: {
											nodes: body.variables.after ? [ruleset] : [null],
											pageInfo: { hasNextPage: !body.variables.after, endCursor: body.variables.after ? null : 'next' },
										}
									}
								}
							};
						case 'RepositoryAssignableUsers':
							return { data: { repository: { assignableUsers: { nodes: [null, user], pageInfo: { hasNextPage: false, endCursor: null } } } } };
						case 'RepositoryCommitAuthor':
							return { data: { repository: { object: { author: { name: 'Author', email: 'author@example.test', avatarUrl: user.avatarUrl, user: { id: user.id, login: user.login } } } } } };
						default:
							return assert.fail(`Unexpected query ${operation}`);
					}
				}
				if (url.pathname === '/user') {
					return { ...repositoryResponse().owner, name: null, email: null, bio: null, location: null };
				}
				if (url.pathname === '/search/repositories') {
					return { total_count: 1, incomplete_results: false, items: [{ ...repositoryResponse(), score: 1 }] };
				}
				if (url.pathname.endsWith('/branches')) {
					return [{ name: 'main', commit: { sha: 'a'.repeat(40), url: 'https://api.github.com/commits/main' }, protected: false }];
				}
				if (url.pathname.endsWith('/pulls')) {
					return request.method === 'GET' ? [pullRequestResponse()] : pullRequestResponse();
				}
				return request.method === 'GET' && url.pathname === '/user/repos' ? [repositoryResponse()] : repositoryResponse();
			},
		});
		allow('alice', true, 'vscode.github');
		const api = createInternalGitHubModule({ ...nullExtensionDescription, identifier: new ExtensionIdentifier('vscode.github'), isBuiltin: true }, new ExtHostGitHub(mainThread));
		const client = store.add(await api.getClient('selected'));
		const repository = { owner: 'o', repo: 'r' };
		const currentUser = await client.users.getAuthenticated();
		const fetched = await client.repositories.get(repository);
		const listed = await client.repositories.listForAuthenticatedUser({ sort: 'updated', per_page: 100 });
		const searched = await client.search.repositories('o/r fork:true');
		const branchQuery = { page: 2, per_page: 100, unexpected: 'ignored' };
		const branches = await client.repositories.listBranches(repository, branchQuery);
		const request = { name: 'r', private: true, caller: 'forged', accessToken: 'do-not-forward' };
		await client.repositories.create(request);
		await client.repositories.fork(repository);
		const pulls = await client.pullRequests.list(repository, { head: 'o:feature', state: 'all' });
		const created = await client.pullRequests.create(repository, { title: 'Change', body: 'Description', head: 'o:feature', base: 'main' });
		const viewer = await client.repositories.getViewerInfo(repository);
		const rulesets = await client.repositories.listRulesetConnection(repository, { maxPages: 1000 });
		const assignable = await client.repositories.listAssignableUsers(repository);
		const author = await client.repositories.getCommitAuthor(repository, 'HEAD');

		assert.deepStrictEqual({
			login: currentUser.login, name: fetched.full_name, listed: listed.length, clone: searched[0].clone_url,
			branches: branches.map(branch => branch.name), pulls: pulls.map(pull => pull.number), created: created.number,
			viewer, rulesets: rulesets?.nodes, users: assignable?.nodes, author: author?.user,
			caller: [...new Set(requests.map(request => request.options?.caller))],
			identity: acquisitions.map(authorization => [authorization.sessionId, authorization.accountId]),
			rest: requests.filter(request => request.path !== '/').map(request => [request.method, request.path, request.expectedStatus]),
			createdBody: requests.find(request => request.method === 'POST' && request.path === '/user/repos')?.body,
			graphql,
		}, {
			login: 'o', name: 'o/r', listed: 1, clone: 'https://github.com/o/r.git', branches: ['main'], pulls: [42], created: 42,
			viewer: { viewerPermission: 'WRITE', defaultBranchRef: { name: 'main' } }, rulesets: [null, ruleset], users: [null, user],
			author: { id: user.id, login: user.login }, caller: ['extension.vscode.github'], identity: [['selected', 'account-alice']],
			rest: [
				['GET', '/user', 200], ['GET', '/repos/o/r', 200], ['GET', '/user/repos?per_page=100&sort=updated', 200],
				['GET', '/search/repositories?sort=stars&q=o%2Fr+fork%3Atrue', 200], ['GET', '/repos/o/r/branches?page=2&per_page=100', 200],
				['POST', '/user/repos', 201], ['POST', '/repos/o/r/forks', 202],
				['GET', '/repos/o/r/pulls?head=o%3Afeature&state=all', 200], ['POST', '/repos/o/r/pulls', 201],
			],
			createdBody: { name: 'r', private: true },
			graphql: [
				{ operation: 'RepositoryViewerInfo', variables: { owner: 'o', name: 'r' } },
				{ operation: 'RepositoryRulesets', variables: { owner: 'o', name: 'r', first: 100 } },
				{ operation: 'RepositoryRulesets', variables: { owner: 'o', name: 'r', first: 100, after: 'next' } },
				{ operation: 'RepositoryAssignableUsers', variables: { owner: 'o', name: 'r', first: 100 } },
				{ operation: 'RepositoryCommitAuthor', variables: { owner: 'o', name: 'r', expression: 'HEAD' } },
			],
		});
	});

	test('preserves nullable ruleset fields alongside valid rules and an unavailable connection', async () => {
		const ruleset = { name: 'Protected', target: 'BRANCH', enforcement: 'ACTIVE', rules: { totalCount: 1 }, conditions: null };
		const connection = {
			nodes: [ruleset, { ...ruleset, target: null }, { ...ruleset, rules: null }],
			pageInfo: { hasNextPage: false, endCursor: null },
		};
		let unavailable = false;
		const { mainThread, allow } = setup({
			sessions: [session('selected', 'alice')],
			respond: async () => ({ data: { repository: { rulesets: unavailable ? null : connection } } }),
		});
		allow('alice', true, 'vscode.github');
		await mainThread.$getClient(0, 'vscode.github', 'selected', CancellationToken.None);
		const availableResult = await mainThread.$listGitHubRulesetConnection(0, { owner: 'o', repo: 'r' }, undefined, 1000, CancellationToken.None);
		unavailable = true;
		const unavailableResult = await mainThread.$listGitHubRulesetConnection(0, { owner: 'o', repo: 'r' }, undefined, 1000, CancellationToken.None);
		mainThread.$releaseClient(0);
		assert.deepStrictEqual([availableResult, unavailableResult], [
			{ kind: 'ok', value: connection },
			{ kind: 'ok', value: null },
		]);
	});

	test('collects up to 1000 ruleset pages and rejects further continuation without returning partial results', async () => {
		const outcomes: object[] = [];
		for (const exceedsLimit of [false, true]) {
			let pages = 0;
			const { mainThread, allow } = setup({
				sessions: [session('selected', 'alice')],
				respond: async () => {
					pages++;
					const hasNextPage = exceedsLimit || pages < 1000;
					return {
						data: {
							repository: {
								rulesets: {
									nodes: [{ name: `Ruleset ${pages}`, target: 'BRANCH', enforcement: 'ACTIVE', rules: { totalCount: 1 }, conditions: null }],
									pageInfo: { hasNextPage, endCursor: hasNextPage ? `cursor-${pages}` : null },
								}
							}
						}
					};
				},
			});
			allow('alice', true, 'vscode.github');
			await mainThread.$getClient(0, 'vscode.github', 'selected', CancellationToken.None);
			const result = await mainThread.$listGitHubRulesetConnection(0, { owner: 'o', repo: 'r' }, undefined, 1000, CancellationToken.None);
			mainThread.$releaseClient(0);
			outcomes.push({ pages, result: result.kind === 'ok' ? result.value?.nodes?.length : result });
		}
		assert.deepStrictEqual(outcomes, [
			{ pages: 1000, result: 1000 },
			{ pages: 1000, result: { kind: 'error', error: { code: 'invalidResponse', message: 'GitHub pagination exceeded the limit of 1000 pages.' } } },
		]);
	});

	test('rejects anonymous and invalid repository operations and invalidates revoked client leases', async () => {
		const { mainThread, requests, allow, onDidChangeAccess } = setup({
			sessions: [session('selected', 'alice')],
			respond: async () => repositoryResponse(),
		});
		allow('alice', true, 'vscode.github');
		const api = createInternalGitHubModule({ ...nullExtensionDescription, identifier: new ExtensionIdentifier('vscode.github'), isBuiltin: true }, new ExtHostGitHub(mainThread));
		const client = store.add(await api.getClient('selected'));
		store.add(await api.getAnonymousClient());
		const repository = { owner: 'o', repo: 'r' };
		const anonymous = await mainThread.$createGitHubRepository(1, { name: 'r' }, CancellationToken.None);
		const failures = [
			await mainThread.$getGitHubRepository(0, { owner: '', repo: 'r' }, CancellationToken.None),
			await mainThread.$listGitHubBranches(0, repository, { per_page: 101 }, CancellationToken.None),
			await mainThread.$listGitHubBranches(0, repository, { per_page: 1.5 }, CancellationToken.None),
			await mainThread.$listGitHubRepositories(0, { page: 0 }, CancellationToken.None),
			await mainThread.$getGitHubRepositoryViewerInfo(0, { owner: '', repo: 'r' }, CancellationToken.None),
			await mainThread.$createGitHubRepository(0, { name: '' }, CancellationToken.None),
		];
		let invalidated = 0;
		store.add(client.onDidInvalidate(() => { invalidated++; client.dispose(); }));
		allow('alice', false, 'vscode.github');
		onDidChangeAccess.fire({ providerId: 'github', accountName: 'alice' });
		await assert.rejects(async () => client.repositories.get(repository), { name: 'GitHubError', code: 'authentication' });
		assert.deepStrictEqual({
			anonymous: anonymous.kind === 'error' && anonymous.error.code,
			failures: failures.map(result => result.kind === 'error' && result.error.code), invalidated, requests,
		}, { anonymous: 'authentication', failures: Array(6).fill('validation'), invalidated: 1, requests: [] });
	});

	test('preserves unavailable GraphQL data and reports malformed repository responses', async () => {
		let malformed = false;
		const { mainThread, allow } = setup({
			sessions: [session('selected', 'alice')],
			respond: async () => ({ data: { repository: malformed ? { viewerPermission: 42, defaultBranchRef: null } : null } }),
		});
		allow('alice', true, 'vscode.github');
		const api = createInternalGitHubModule({ ...nullExtensionDescription, identifier: new ExtensionIdentifier('vscode.github'), isBuiltin: true }, new ExtHostGitHub(mainThread));
		const client = store.add(await api.getClient('selected'));
		const repository = { owner: 'o', repo: 'r' };
		const unavailable = await Promise.all([
			client.repositories.getViewerInfo(repository),
			client.repositories.listRulesetConnection(repository),
			client.repositories.listAssignableUsers(repository),
			client.repositories.getCommitAuthor(repository, 'HEAD'),
		]);
		malformed = true;
		await assert.rejects(async () => client.repositories.getViewerInfo(repository), { name: 'GitHubError', code: 'invalidResponse' });
		assert.deepStrictEqual(unavailable, [null, null, null, null]);
	});

	test('binds exactly the selected session and creates a secret gist without exposing credentials', async () => {
		const { mainThread, requests, acquisitions, released, allow } = setup({
			sessions: [session('alice-session', 'alice'), session('bob-session', 'bob')],
			respond: async () => gistResponse('new-gist', { 'My Profile': { content: 'profile' } }),
		});
		allow('alice');
		allow('bob');

		const acquired = await mainThread.$getClient(1, extensionId, 'bob-session', CancellationToken.None);
		const request = { extra: 'unused', files: { 'My Profile': { content: 'profile', extra: 'unused' } } };
		const created = await mainThread.$createGist(1, request, CancellationToken.None);
		mainThread.$releaseClient(1);
		mainThread.$releaseClient(1);

		assert.deepStrictEqual({ acquired, created, acquisitions, requests, released, leaksToken: JSON.stringify([acquired, created]).includes('secret-token') }, {
			acquired: { kind: 'ok', value: undefined },
			created: {
				kind: 'ok', value: {
					id: 'new-gist', htmlUrl: 'https://gist.github.com/new-gist',
					files: [{ content: 'profile', isBinary: false, truncated: false }],
				},
			},
			acquisitions: [{ providerId: 'github', sessionId: 'bob-session', accountId: 'account-bob', scopes, authorizationServer: undefined }],
			requests: [{
				domain: 'gists', method: 'POST', path: '/gists', authentication: 'required', expectedStatus: 201,
				body: { public: false, files: { 'My Profile': { content: 'profile' } } },
				options: { caller: `extension.${extensionId}` },
			}],
			released: ['bob-session'],
			leaksToken: false,
		});
	});

	test('rejects unknown, stale, inaccessible and Enterprise-only sessions identically without acquiring', async () => {
		const { mainThread, acquisitions, queriedProviders, allow } = setup({
			sessions: [session('alice-session', 'alice'), session('bob-session', 'bob'), session('carol-session', 'carol')],
			enterpriseSessions: [session('enterprise-session', 'dave')],
		});
		allow('alice', true, 'other.extension');
		allow('bob', false);
		allow('dave', true, extensionId, 'github-enterprise');

		const results = [
			await mainThread.$getClient(1, extensionId, 'missing-session', CancellationToken.None),
			await mainThread.$getClient(2, extensionId, 'alice-session', CancellationToken.None),
			await mainThread.$getClient(3, extensionId, 'bob-session', CancellationToken.None),
			await mainThread.$getClient(4, extensionId, 'carol-session', CancellationToken.None),
			await mainThread.$getClient(5, extensionId, 'enterprise-session', CancellationToken.None),
			await mainThread.$getClient(6, extensionId, '', CancellationToken.None),
		];
		const afterwards = await mainThread.$getGist(2, 'gist-id', CancellationToken.None);

		const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
		assert.deepStrictEqual({ results, acquisitions, queriedProviders: [...new Set(queriedProviders)], afterwards }, {
			results: [unavailable, unavailable, unavailable, unavailable, unavailable, unavailable],
			acquisitions: [],
			queriedProviders: ['github'],
			afterwards: { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } },
		});
	});

	test('anonymous clients read gists in file order without credentials and cannot create gists', async () => {
		const { mainThread, requests, acquisitions, released } = setup({
			respond: async () => gistResponse('shared', { 'b.json': { content: 'first' }, 'a.json': { content: 'cut', truncated: true } }),
		});

		const acquired = await mainThread.$getAnonymousClient(1, extensionId, CancellationToken.None);
		const read = await mainThread.$getGist(1, 'shared', CancellationToken.None);
		const create = await mainThread.$createGist(1, { files: { 'a.json': { content: '{}' } } }, CancellationToken.None);
		mainThread.$releaseClient(1);

		assert.deepStrictEqual({ acquired, read, create, acquisitions, requests, released }, {
			acquired: { kind: 'ok', value: undefined },
			read: {
				kind: 'ok', value: {
					id: 'shared', htmlUrl: 'https://gist.github.com/shared',
					files: [
						{ content: 'first', isBinary: false, truncated: false },
						{ content: 'cut', isBinary: false, truncated: true },
					],
				},
			},
			create: { kind: 'error', error: { code: 'authentication', message: 'This operation requires a client bound to a GitHub session.' } },
			acquisitions: [],
			requests: [{ domain: 'gists', method: 'GET', path: '/gists/shared', expectedStatus: 200, options: { caller: `extension.${extensionId}` } }],
			released: ['anonymous'],
		});
	});

	test('maps request failures to typed errors without response bodies and validates gist input', async () => {
		const failures = [
			new GitHubRequestError('Not Found', 'notFound', 404, 'secret response body'),
			new GitHubRequestError('Malformed', 'schema'),
			new GitHubRequestError('Busy', 'overloaded'),
			new Error('boom'),
		];
		const { mainThread, requests, allow } = setup({
			sessions: [session('alice-session', 'alice')],
			respond: async () => { throw failures.shift(); },
		});
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);

		const results = [
			await mainThread.$getGist(1, 'missing', CancellationToken.None),
			await mainThread.$getGist(1, 'malformed', CancellationToken.None),
			await mainThread.$getGist(1, 'busy', CancellationToken.None),
			await mainThread.$getGist(1, 'unexpected', CancellationToken.None),
			await mainThread.$getGist(1, '', CancellationToken.None),
			await mainThread.$createGist(1, { files: {} }, CancellationToken.None),
			await mainThread.$createGist(1, { files: { 'dir/name': { content: '' } } }, CancellationToken.None),
			await mainThread.$createGist(1, { files: { name: { content: 42 as unknown as string } } }, CancellationToken.None),
		];

		assert.deepStrictEqual({ results, requestCount: requests.length }, {
			results: [
				{ kind: 'error', error: { code: 'notFound', message: 'Not Found', status: 404 } },
				{ kind: 'error', error: { code: 'invalidResponse', message: 'Malformed', status: undefined } },
				{ kind: 'error', error: { code: 'rateLimit', message: 'Busy', status: undefined } },
				{ kind: 'error', error: { code: 'unknown', message: 'The GitHub request failed.' } },
				{ kind: 'error', error: { code: 'validation', message: 'A gist identifier is required.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": A gist must contain at least one file with non-empty names and no path separators.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": A gist must contain at least one file with non-empty names and no path separators.' } },
				{ kind: 'error', error: { code: 'validation', message: 'Invalid gist request: Invalid value at key "files": Invalid value at key "name": Invalid value at key "content": Expected a string' } },
			],
			requestCount: 4,
		});
	});

	test('cancels requests, and disposes clients whose acquisition was released or cancelled', async () => {
		const gate = new DeferredPromise<void>();
		const arrived = new DeferredPromise<void>();
		let arrivals = 0;
		let observedAbort = false;
		const { mainThread, released, allow } = setup({
			sessions: [session('alice-session', 'alice')],
			acquisitionGate: () => {
				if (++arrivals === 3) {
					arrived.complete();
				}
				return gate.p;
			},
			respond: (_request, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => {
				observedAbort = true;
				reject(signal.reason);
			})),
		});
		allow('alice');

		const releasedDuringAcquisition = mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		const cancellation = store.add(new CancellationTokenSource());
		const cancelledAcquisition = mainThread.$getAnonymousClient(2, extensionId, cancellation.token);
		const active = mainThread.$getClient(3, extensionId, 'alice-session', CancellationToken.None);
		await arrived.p;
		mainThread.$releaseClient(1);
		cancellation.cancel();
		gate.complete();
		const acquisitionResults = [await releasedDuringAcquisition, await cancelledAcquisition, await active];

		const requestCancellation = store.add(new CancellationTokenSource());
		const cancelledRequest = mainThread.$getGist(3, 'slow', requestCancellation.token);
		requestCancellation.cancel();
		const releasedRequest = mainThread.$getGist(3, 'slow', CancellationToken.None);
		await Promise.resolve();
		mainThread.$releaseClient(3);

		assert.deepStrictEqual({
			acquisitionResults,
			requestResults: [await cancelledRequest, await releasedRequest],
			observedAbort,
			afterRelease: await mainThread.$getGist(1, 'gist-id', CancellationToken.None),
			released: released.sort(),
		}, {
			acquisitionResults: [{ kind: 'canceled' }, { kind: 'canceled' }, { kind: 'ok', value: undefined }],
			requestResults: [{ kind: 'canceled' }, { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } }],
			observedAbort: true,
			afterRelease: { kind: 'error', error: { code: 'disposed', message: 'The GitHub client has been disposed.' } },
			released: ['alice-session', 'alice-session', 'anonymous'],
		});
	});

	test('invalidates clients when the session is revoked or the extension loses account access', async () => {
		const { mainThread, released, allow, onDidInvalidate, onDidChangeAccess } = setup({ sessions: [session('alice-session', 'alice'), session('bob-session', 'bob')] });
		allow('alice');
		allow('bob');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);

		onDidInvalidate.fire();
		const revoked = await mainThread.$getGist(1, 'gist-id', CancellationToken.None);

		await mainThread.$getClient(3, extensionId, 'bob-session', CancellationToken.None);
		onDidChangeAccess.fire({ providerId: 'github', accountName: 'alice' });
		const unaffected = await mainThread.$getGist(3, 'gist-id', CancellationToken.None);
		allow('bob', false);
		onDidChangeAccess.fire({ providerId: 'github', accountName: 'bob' });
		const accessRemoved = await mainThread.$getGist(3, 'gist-id', CancellationToken.None);
		allow('bob');
		await mainThread.$getClient(4, extensionId, 'bob-session', CancellationToken.None);
		allow('bob', false);
		const accessChangedWithoutEvent = await mainThread.$getGist(4, 'gist-id', CancellationToken.None);
		const anonymous = await mainThread.$getGist(2, 'gist-id', CancellationToken.None);

		const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
		assert.deepStrictEqual({ revoked, unaffected: unaffected.kind, accessRemoved, accessChangedWithoutEvent, anonymous: anonymous.kind, released: [...released] }, {
			revoked: unavailable,
			unaffected: 'ok',
			accessRemoved: unavailable,
			accessChangedWithoutEvent: unavailable,
			anonymous: 'ok',
			released: ['alice-session', 'bob-session', 'bob-session'],
		});
	});

	test('rechecks account access after pending acquisition', async () => {
		const gate = new DeferredPromise<void>();
		const started = new DeferredPromise<void>();
		const { mainThread, allow, released, requests } = setup({
			sessions: [session('alice-session', 'alice')],
			acquisitionGate: () => { started.complete(); return gate.p; },
		});
		allow('alice');
		const pending = mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await started.p;
		allow('alice', false);
		gate.complete();
		assert.deepStrictEqual({ result: await pending, released, requests }, {
			result: { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } },
			released: ['alice-session'],
			requests: [],
		});
	});

	test('cancels initial session lookups and invalidates clients on provider removal', async () => {
		const sessions = [session('alice-session', 'alice')];
		const lookup = new DeferredPromise<readonly AuthenticationSession[]>();
		let pendingLookup = false;
		const { mainThread, allow, acquisitions, released, onDidUnregisterProvider } = setup({
			lookupSessions: () => pendingLookup ? lookup.p : Promise.resolve(sessions),
		});
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);
		pendingLookup = true;
		try {
			const cancellation = store.add(new CancellationTokenSource());
			const cancelledLookup = mainThread.$getClient(3, extensionId, 'alice-session', cancellation.token);
			cancellation.cancel();
			const cancelled = await cancelledLookup;
			const pending = mainThread.$getClient(4, extensionId, 'alice-session', CancellationToken.None);
			onDidUnregisterProvider.fire({ id: 'github', label: 'GitHub' });
			const unavailable = { kind: 'error', error: { code: 'authentication', message: 'The selected GitHub session is not available to this extension.' } };
			assert.deepStrictEqual({
				cancelled,
				pending: await pending,
				active: await mainThread.$getGist(1, 'gist-id', CancellationToken.None),
				anonymous: (await mainThread.$getGist(2, 'gist-id', CancellationToken.None)).kind,
				acquisitions: acquisitions.length,
				released,
			}, {
				cancelled: { kind: 'canceled' },
				pending: unavailable,
				active: unavailable,
				anonymous: 'ok',
				acquisitions: 1,
				released: ['alice-session'],
			});
		} finally {
			lookup.complete(sessions);
		}
	});

	test('releases every client when the extension host connection is disposed', async () => {
		const { mainThread, released, allow } = setup({ sessions: [session('alice-session', 'alice')] });
		allow('alice');
		await mainThread.$getClient(1, extensionId, 'alice-session', CancellationToken.None);
		await mainThread.$getAnonymousClient(2, extensionId, CancellationToken.None);

		mainThread.dispose();

		assert.deepStrictEqual({
			released: released.sort(),
			afterDispose: await mainThread.$getAnonymousClient(3, extensionId, CancellationToken.None),
		}, {
			released: ['alice-session', 'anonymous'],
			afterDispose: { kind: 'error', error: { code: 'unknown', message: 'The GitHub client could not be created.' } },
		});
	});
});
