/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import assert from 'assert';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { AccountClient } from '../../common/account/accountClient.js';
import { ApiRequest, ApiRequestOptions, ApiResponse, IApiRequestProvider, PaginationOptions } from '../../common/client/request.js';
import { parse } from '../../common/client/schema.js';


suite('GitHub account client', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const authorization = { providerId: 'github', sessionId: 'selected', scopes: ['repo'] };
	const cancellationToken = () => CancellationToken.None;

	test('composes the full facade over one provider and owns its lease', async () => {
		const requests: ApiRequest[] = [];
		let disposed = false;
		const provider: IApiRequestProvider = {
			request: async <T>(request: ApiRequest, _signal: CancellationToken, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> => {
				requests.push(request);
				const data = request.responseBody === 'none' ? undefined : parser?.({ total_count: 0, workflow_runs: [] });
				return { data, status: request.method === 'POST' ? 202 : 200 };
			},
		};
		const client = store.add(new AccountClient(authorization, { rest: provider, graphql: provider }, toDisposable(() => { disposed = true; })));
		const options = { caller: 'test.account', deadline: Date.now() + 10_000 };
		const runs = await client.actions.listRuns({ owner: 'o', repo: 'r' }, cancellationToken(), { ...options, query: { per_page: 10, event: 'push' } });
		const cancelled = await client.actions.cancel({ owner: 'o', repo: 'r' }, 42, cancellationToken(), options);
		client.dispose();
		assert.deepStrictEqual({
			authorization: client.authorization,
			domains: Object.keys(client).filter(key => !key.startsWith('_')).sort(),
			runs, cancelled, requests, disposed,
		}, {
			authorization,
			domains: [
				'actions', 'authorization', 'automations', 'checks', 'connectors', 'content', 'environments', 'gist', 'issues', 'missionControlModels', 'notifications',
				'onDidChangeCredentials', 'onDidInvalidate', 'organizations', 'pullRequests', 'repositories', 'reviews', 'search', 'tasks', 'users',
			],
			runs: { total_count: 0, workflow_runs: [] },
			cancelled: undefined,
			requests: [
				{ domain: 'actions', method: 'GET', path: '/repos/o/r/actions/runs?per_page=10&event=push', authentication: 'optional', expectedStatus: 200, options },
				{ domain: 'actions', method: 'POST', path: '/repos/o/r/actions/runs/42/cancel', authentication: 'required', expectedStatus: 202, responseBody: 'none', options },
			],
			disposed: true,
		});
	});

	test('attributes every API domain without replacing the caller or scheduling priority', async () => {
		const requests: ApiRequest[] = [];
		const dispatched = new Error('Request reached the provider');
		const provider: IApiRequestProvider = {
			request: async (request: ApiRequest) => {
				requests.push(request);
				throw dispatched;
			},
		};
		const client = store.add(new AccountClient(authorization, {
			rest: provider, graphql: provider, rawContent: provider, missionControl: provider, connectors: provider,
		}, toDisposable(() => { })));
		const repository = { owner: 'o', repo: 'r' };
		const options: ApiRequestOptions = { caller: 'same.caller', priority: 'background' };
		const operations = [
			{ domain: 'actions', run: () => client.actions.listRuns(repository, cancellationToken(), options) },
			{ domain: 'checks', run: () => client.checks.listRuns(repository, 'main', cancellationToken(), options) },
			{ domain: 'connectors', run: () => client.connectors.getCatalog(cancellationToken(), options) },
			{ domain: 'content', run: () => client.content.resolveRef(repository, 'main', cancellationToken(), options) },
			{ domain: 'gists', run: () => client.gist.get('gist', cancellationToken(), options) },
			{ domain: 'issues', run: () => client.issues.get(repository, 1, cancellationToken(), options) },
			{ domain: 'notifications', run: () => client.notifications.list(cancellationToken(), options) },
			{ domain: 'organizations', run: () => client.organizations.get('o', cancellationToken(), options) },
			{ domain: 'pullRequests', run: () => client.pullRequests.list(repository, cancellationToken(), options) },
			{ domain: 'repositories', run: () => client.repositories.listForAuthenticatedUser(cancellationToken(), options) },
			{ domain: 'reviews', run: () => client.reviews.list(repository, 1, cancellationToken(), options) },
			{ domain: 'search', run: () => client.search.repositories('query', cancellationToken(), options) },
			{ domain: 'users', run: () => client.users.getAuthenticated(cancellationToken(), options) },
			{ domain: 'automations', run: () => client.automations.list(repository, cancellationToken(), options) },
			{ domain: 'environments', run: () => client.environments.list(cancellationToken(), options) },
			{ domain: 'models', run: () => client.missionControlModels.list(cancellationToken(), options) },
			{ domain: 'tasks', run: () => client.tasks.list(cancellationToken(), options) },
			{ domain: 'reviews', run: () => client.reviews.listThreadSummaries('PR_1', cancellationToken(), options) },
			{ domain: 'content', run: () => client.content.getRawFile(repository, 'a'.repeat(40), 'README.md', cancellationToken(), options) },
		];
		for (const operation of operations) {
			await assert.rejects(operation.run, dispatched);
		}
		assert.deepStrictEqual(requests.map(request => ({
			domain: request.domain, caller: request.options?.caller, priority: request.options?.priority,
		})), operations.map(operation => ({ domain: operation.domain, caller: 'same.caller', priority: 'background' })));
	});

	test('separates query and operation arguments from request options', async () => {
		const requests: ApiRequest[] = [];
		const dispatched = new Error('Request reached the provider');
		const provider: IApiRequestProvider = {
			request: async (request: ApiRequest) => {
				requests.push(request);
				throw dispatched;
			},
		};
		const client = store.add(new AccountClient(authorization, { rest: provider, graphql: provider, rawContent: provider, missionControl: provider }, toDisposable(() => { })));
		const repository = { owner: 'o', repo: 'r' };
		const options: ApiRequestOptions = { caller: 'test.options', deadline: Date.now() + 10_000, priority: 'background' };
		await assert.rejects(client.content.getContent(repository, 'folder/file name.json', cancellationToken(), { ...options, query: { ref: 'feature/branch' } }), dispatched);
		await assert.rejects(client.content.getTree(repository, 'main', cancellationToken(), { ...options, query: { recursive: true } }), dispatched);
		await assert.rejects(client.content.getBlob(repository, 'blob-sha', cancellationToken(), options), dispatched);
		await assert.rejects(client.content.resolveRef(repository, 'feature/branch', cancellationToken(), options), dispatched);
		await assert.rejects(client.content.getRawFile(repository, 'a'.repeat(40), 'folder/file name.json', cancellationToken(), options), dispatched);
		await assert.rejects(client.actions.getRun(repository, 42, cancellationToken(), { ...options, attempt: 2 }), dispatched);
		await assert.rejects(client.actions.rerunFailedJobs(repository, 42, cancellationToken(), { ...options, enableDebugLogging: true }), dispatched);
		await assert.rejects(client.pullRequests.updateBranch(repository, 1, cancellationToken(), { ...options, expectedHeadSha: 'head-sha' }), dispatched);
		await assert.rejects(client.reviews.replyToThread('thread', 'reply', cancellationToken(), { ...options, pullRequestReviewId: 'review' }), dispatched);
		await assert.rejects(client.reviews.listThreads('PR_1', cancellationToken(), { ...options, query: { first: 2, commentsFirst: 1 } }), dispatched);
		await assert.rejects(client.search.pullRequests('repo:o/r assignee:@me', cancellationToken(), { ...options, query: { first: 2, after: 'next' } }), dispatched);
		await assert.rejects(client.issues.getClosingPullRequestCounts(repository, [7], cancellationToken(), options), dispatched);
		await assert.rejects(client.tasks.list(cancellationToken(), { ...options, query: { page: 2, q: 'work', artifact_state: ['open', 'draft'] } }), dispatched);
		await assert.rejects(client.environments.reconnect('environment', 'client', cancellationToken(), { ...options, query: { session_id: 'session' } }), dispatched);
		await assert.rejects(client.issues.createLabel(repository, { name: 'label' }, cancellationToken(), options), dispatched);
		const parseVariables = parse.object({ variables: parse.jsonObject });
		assert.deepStrictEqual(requests.map(request => ({
			path: request.path,
			body: request.path === '/' ? parseVariables(request.body).variables : request.body,
			options: request.options,
		})), [
			{ path: '/repos/o/r/contents/folder/file%20name.json?ref=feature%2Fbranch', body: undefined, options },
			{ path: '/repos/o/r/git/trees/main?recursive=1', body: undefined, options },
			{ path: '/repos/o/r/git/blobs/blob-sha', body: undefined, options },
			{ path: '/repos/o/r/commits/feature%2Fbranch', body: undefined, options },
			{ path: `/o/r/${'a'.repeat(40)}/folder/file%20name.json`, body: undefined, options },
			{ path: '/repos/o/r/actions/runs/42/attempts/2', body: undefined, options },
			{ path: '/repos/o/r/actions/runs/42/rerun-failed-jobs', body: { enable_debug_logging: true }, options },
			{ path: '/repos/o/r/pulls/1/update-branch', body: { expected_head_sha: 'head-sha' }, options },
			{ path: '/', body: { input: { pullRequestReviewThreadId: 'thread', body: 'reply', pullRequestReviewId: 'review' } }, options },
			{ path: '/', body: { pullRequestId: 'PR_1', first: 2, commentsFirst: 1 }, options },
			{ path: '/', body: { first: 2, after: 'next', query: 'is:pr repo:o/r assignee:@me' }, options },
			{ path: '/', body: { owner: 'o', repo: 'r' }, options },
			{ path: '/tasks?page=2&q=work&artifact_state=open&artifact_state=draft', body: undefined, options },
			{ path: '/environments/environment/reconnect?session_id=session&client_id=client', body: undefined, options },
			{ path: '/repos/o/r/labels', body: { name: 'label' }, options },
		]);
	});

	test('single-page REST, GraphQL, and Mission Control reads preserve results and request options', async () => {
		const connection = { nodes: [null], pageInfo: { endCursor: null, hasNextPage: false } };
		const requestOptions: ApiRequestOptions = { caller: 'test.single-page', deadline: Date.now() + 10_000, priority: 'background' };
		for (const maxPages of [undefined, 1]) {
			const requests: ApiRequest[] = [];
			const provider: IApiRequestProvider = {
				request: async <T>(request: ApiRequest, _signal: CancellationToken, parser?: parse.Parser<T>): Promise<ApiResponse<T | void>> => {
					requests.push(request);
					const data = request.path === '/' ? { data: { node: { reviewThreads: connection } } }
						: request.path === '/tasks' ? '{"tasks":[]}' : [];
					return { data: parser?.(data), status: 200 };
				},
			};
			const client = store.add(new AccountClient(authorization, { rest: provider, graphql: provider, missionControl: provider }, toDisposable(() => { })));
			const options = { ...requestOptions, maxPages };
			const results = [
				await client.users.listEmails(cancellationToken(), options),
				await client.reviews.listThreadSummaries('PR_1', cancellationToken(), options),
				await client.tasks.list(cancellationToken(), options),
			];
			assert.deepStrictEqual({ results, requests: requests.map(request => ({ path: request.path, domain: request.domain, options: request.options })) }, {
				results: [[], connection, { data: { tasks: [] }, nextLink: undefined, serverDate: undefined }],
				requests: [
					{ path: '/user/emails', domain: 'users', options: requestOptions },
					{ path: '/', domain: 'reviews', options: requestOptions },
					{ path: '/tasks', domain: 'tasks', options: requestOptions },
				],
			});
		}
	});

	test('validates limit behavior only when maxPages is supplied', async () => {
		const dispatched = new Error('Request reached the provider');
		const provider: IApiRequestProvider = { request: async () => { throw dispatched; } };
		const client = store.add(new AccountClient(authorization, { rest: provider, graphql: provider, missionControl: provider }, toDisposable(() => { })));
		for (const maxPages of [undefined, 1, 2]) {
			const options: PaginationOptions = { maxPages };
			Object.assign(options, { pageLimitBehavior: 'invalid' });
			const expected = maxPages === undefined ? dispatched : { kind: 'validation' };
			await assert.rejects(client.users.listEmails(cancellationToken(), options), expected);
			await assert.rejects(client.reviews.listThreadSummaries('PR_1', cancellationToken(), options), expected);
			await assert.rejects(client.tasks.list(cancellationToken(), options), expected);
		}
	});
});
