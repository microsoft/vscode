/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { PaginationLimitError } from '../../../../../platform/github/common/client/pagination.js';
import { CoreClient } from '../../../../../platform/github/common/core/coreClient.js';
import { PullRequestsClient } from '../../../../../platform/github/common/core/pullRequestsClient.js';
import { createTestPullRequestResponse, FixtureApiRequestProvider } from '../../../../../platform/github/test/common/githubClientTestUtils.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubPRCIFetcher, computeOverallCIStatus } from '../../browser/fetchers/githubPRCIFetcher.js';
import { GitHubPRFetcher, computeMergeability } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPullRequestContextFetcher } from '../../browser/fetchers/githubPullRequestContextFetcher.js';
import { GitHubPullRequestsFetcher } from '../../browser/fetchers/githubPullRequestsFetcher.js';
import { GitHubRecentUserWorkFetcher } from '../../browser/fetchers/githubRecentUserWorkFetcher.js';
import { GitHubRepositoryFetcher } from '../../browser/fetchers/githubRepositoryFetcher.js';
import { GitHubApiClient } from '../../browser/githubApiClient.js';
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubPullRequest, IGitHubPullRequestReview, MergeBlockerKind } from '../../common/types.js';

class MockApiClient extends mock<GitHubApiClient>() {
	override readonly onDidChange = Event.None;
	override get generation() { return 0; }

	private _nextResponse: unknown;
	private _responses: unknown[] = [];
	private _nextError: Error | undefined;
	readonly calls: { method: string; args: readonly unknown[] }[] = [];
	readonly tokens: CancellationToken[] = [];
	private readonly account = upcastPartial<IGitHubAccountClient>({
		repositories: upcastPartial<IGitHubAccountClient['repositories']>({
			get: (repository, _signal) => this.respond('repositories.get', repository),
			listForAuthenticatedUser: (_signal, options) => this.respond('repositories.listForAuthenticatedUser', options),
		}),
		users: upcastPartial<IGitHubAccountClient['users']>({
			getAuthenticated: () => this.respond('users.getAuthenticated'),
		}),
		organizations: upcastPartial<IGitHubAccountClient['organizations']>({
			listForAuthenticatedUser: (_signal, options) => this.respond('organizations.listForAuthenticatedUser', options),
		}),
		search: upcastPartial<IGitHubAccountClient['search']>({
			repositories: (query, _signal, options) => this.respond('search.repositories', query, options),
			issues: (query, _signal, options) => this.respond('search.issues', query, options),
			pullRequests: (query, _signal, options) => this.respond('search.pullRequests', query, options),
		}),
		pullRequests: upcastPartial<IGitHubAccountClient['pullRequests']>({
			get: (repository, number) => this.respond('pullRequests.get', repository, number),
			listConnection: (repository, _signal, options) => this.respond('pullRequests.listConnection', repository, options),
			listFiles: (repository, number, _signal, options) => this.respond('pullRequests.listFiles', repository, number, options),
		}),
		reviews: upcastPartial<IGitHubAccountClient['reviews']>({
			list: (repository, number, _signal, options) => this.respond('reviews.list', repository, number, options),
			listComments: (repository, number, _signal, options) => this.respond('reviews.listComments', repository, number, options),
			listThreads: (id, _signal, options) => this.respond('reviews.listThreads', id, options),
			listThreadSummaries: (id, _signal, options) => this.respond('reviews.listThreadSummaries', id, options),
			listThreadComments: (id, _signal, options) => this.respond('reviews.listThreadComments', id, options),
			create: (repository, number, request) => this.respond('reviews.create', repository, number, request),
			createThread: request => this.respond('reviews.createThread', request),
			resolveThread: id => this.respond('reviews.resolveThread', id),
		}),
		issues: upcastPartial<IGitHubAccountClient['issues']>({
			listComments: (repository, number, _signal, options) => this.respond('issues.listComments', repository, number, options),
			getClosingPullRequestCounts: (repository, numbers) => this.respond('issues.getClosingPullRequestCounts', repository, numbers),
		}),
		checks: upcastPartial<IGitHubAccountClient['checks']>({
			listRuns: (repository, ref, _signal, options) => this.respond('checks.listRuns', repository, ref, options),
			getRun: (repository, id) => this.respond('checks.getRun', repository, id),
			listAnnotations: (repository, id, _signal, options) => this.respond('checks.listAnnotations', repository, id, options),
		}),
		actions: upcastPartial<IGitHubAccountClient['actions']>({
			rerunFailedJobs: (repository, id) => this.respond('actions.rerunFailedJobs', repository, id),
		}),
	});

	setNextResponse(data: unknown): void {
		this._nextResponse = data;
		this._responses = [];
		this._nextError = undefined;
	}

	setResponses(...data: unknown[]): void {
		this._responses = [...data];
		this._nextResponse = undefined;
		this._nextError = undefined;
	}

	setNextError(error: Error): void {
		this._nextError = error;
		this._nextResponse = undefined;
	}

	private async respond<T>(method: string, ...args: readonly unknown[]): Promise<T> {
		this.calls.push({ method, args });
		if (this._nextError) {
			throw this._nextError;
		}
		const response = this._responses.length > 0 ? this._responses.shift() : this._nextResponse;
		if (response instanceof Error) {
			throw response;
		}
		return response as T;
	}

	override async withClient<T>(task: (client: IGitHubAccountClient, signal: AbortSignal) => Promise<T>, token = CancellationToken.None): Promise<T> {
		if (token.isCancellationRequested) {
			throw new CancellationError();
		}
		this.tokens.push(token);
		return task(this.account, new AbortController().signal);
	}
}

suite('GitHubRecentUserWorkFetcher', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('queries assigned issue summaries independently', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			items: [
				{ number: 1, title: 'First issue', html_url: 'https://github.com/o/r/issues/1', updated_at: '2026-08-07T10:00:00Z' },
				{ number: 2, title: 'Second issue', html_url: 'https://github.com/o/r/issues/2', updated_at: '2026-08-07T11:00:00Z' },
			]
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi);

		assert.deepStrictEqual({
			issues: await fetcher.getRecentAssignedIssues('o', 'r', CancellationToken.None),
			calls: mockApi.calls,
		}, {
			issues: [
				{ number: 1, title: 'First issue', url: 'https://github.com/o/r/issues/1', updatedAt: '2026-08-07T10:00:00Z' },
				{ number: 2, title: 'Second issue', url: 'https://github.com/o/r/issues/2', updatedAt: '2026-08-07T11:00:00Z' },
			],
			calls: [{ method: 'search.issues', args: ['repo:o/r is:open assignee:@me', { query: { per_page: 5, sort: 'updated', order: 'desc' } }] }],
		});
	});

	test('queries pull request summaries without review threads', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			nodes: [{
				__typename: 'PullRequest',
				number: 3,
				title: 'Fix CI',
				url: 'https://github.com/o/r/pull/3',
				updatedAt: '2026-08-07T12:00:00Z',
				mergeable: 'CONFLICTING',
				commits: { nodes: [{ commit: { committedDate: '2026-08-07T09:00:00Z', statusCheckRollup: { state: 'FAILURE' } } }] },
			}],
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi);

		assert.deepStrictEqual({
			pullRequests: await fetcher.getRecentAuthoredPullRequests('o', 'r', CancellationToken.None),
			calls: mockApi.calls,
		}, {
			pullRequests: [{
				number: 3,
				title: 'Fix CI',
				url: 'https://github.com/o/r/pull/3',
				updatedAt: '2026-08-07T12:00:00Z',
				hasMergeConflicts: true,
				statusCheckRollupState: 'FAILURE',
				latestCommitAt: '2026-08-07T09:00:00Z',
			}],
			calls: [{ method: 'search.pullRequests', args: ['repo:o/r is:open author:@me sort:updated-desc', { query: { first: 5 } }] }],
		});
	});

	test('queries review threads for one pull request independently', async () => {
		const mockApi = new MockApiClient();
		mockApi.setResponses({ node_id: 'PR_3' }, {
			nodes: [{ isResolved: false, comments: { nodes: [{ createdAt: '2026-08-07T10:00:00Z' }] } }],
			pageInfo: { endCursor: null, hasNextPage: false },
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi);

		assert.deepStrictEqual({
			reviewThreads: await fetcher.getPullRequestReviewThreads('o', 'r', 3, CancellationToken.None),
			calls: mockApi.calls,
		}, {
			reviewThreads: [{ isResolved: false, latestCommentAt: '2026-08-07T10:00:00Z' }],
			calls: [
				{ method: 'pullRequests.get', args: [{ owner: 'o', name: 'r' }, 3] },
				{ method: 'reviews.listThreadSummaries', args: ['PR_3', { query: { first: 100 }, maxPages: 100 }] },
			],
		});
	});

	test('rejects unavailable review thread summaries rather than reporting an empty result', async () => {
		const mockApi = new MockApiClient();
		mockApi.setResponses({ node_id: 'PR_3' }, null);
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi);

		await assert.rejects(fetcher.getPullRequestReviewThreads('o', 'r', 3, CancellationToken.None), /GitHub resource was not returned/);
	});

	test('checks pull request linkage for issue summaries in one request', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({ 1: 1, 2: 0 });
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi);

		assert.deepStrictEqual({
			linkedIssues: [...await fetcher.getIssuesWithLinkedPullRequests('o', 'r', [1, 2], CancellationToken.None)],
			calls: mockApi.calls,
		}, {
			linkedIssues: [1],
			calls: [{ method: 'issues.getClosingPullRequestCounts', args: [{ owner: 'o', name: 'r' }, [1, 2]] }],
		});
	});
});

suite('GitHubRepositoryFetcher', () => {

	const store = new DisposableStore();
	let mockApi: MockApiClient;
	let fetcher: GitHubRepositoryFetcher;

	setup(() => {
		mockApi = new MockApiClient();
		fetcher = new GitHubRepositoryFetcher(mockApi);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getRepository returns mapped data', async () => {
		mockApi.setNextResponse({
			name: 'vscode',
			full_name: 'microsoft/vscode',
			owner: { login: 'microsoft' },
			default_branch: 'main',
			private: false,
			description: 'Visual Studio Code',
		});

		const repo = await fetcher.getRepository('microsoft', 'vscode');
		assert.deepStrictEqual(repo, {
			owner: 'microsoft',
			name: 'vscode',
			fullName: 'microsoft/vscode',
			defaultBranch: 'main',
			isPrivate: false,
			description: 'Visual Studio Code',
		});
		assert.deepStrictEqual(mockApi.calls, [{ method: 'repositories.get', args: [{ owner: 'microsoft', name: 'vscode' }] }]);
	});

	test('getRepository handles null description', async () => {
		mockApi.setNextResponse({
			name: 'test',
			full_name: 'owner/test',
			owner: { login: 'owner' },
			default_branch: 'main',
			private: true,
			description: null,
		});

		const repo = await fetcher.getRepository('owner', 'test');
		assert.strictEqual(repo.description, '');
	});

	test('getRepository propagates API errors', async () => {
		mockApi.setNextError(new GitHubRequestError('Not found', 'notFound', 404));
		await assert.rejects(
			() => fetcher.getRepository('owner', 'nonexistent'),
			{ kind: 'notFound', statusCode: 404 },
		);
	});

	test('lists accessible repositories in server-provided recent order without prompting', async () => {
		const token = store.add(new CancellationTokenSource()).token;
		mockApi.setNextResponse([
			{ name: 'recent', full_name: 'owner/recent', owner: { login: 'owner' }, default_branch: 'main', private: true, description: null },
			{ name: 'older', full_name: 'owner/older', owner: { login: 'owner' }, default_branch: 'main', private: false, description: 'Older repository' },
		]);

		assert.deepStrictEqual({
			repositories: await fetcher.getRepositories('', token),
			calls: mockApi.calls,
			tokens: mockApi.tokens,
		}, {
			repositories: [
				{ owner: 'owner', name: 'recent', fullName: 'owner/recent', defaultBranch: 'main', isPrivate: true, description: '' },
				{ owner: 'owner', name: 'older', fullName: 'owner/older', defaultBranch: 'main', isPrivate: false, description: 'Older repository' },
			],
			calls: [{ method: 'repositories.listForAuthenticatedUser', args: [{ query: { per_page: 100, sort: 'updated', affiliation: 'owner,collaborator,organization_member' } }] }],
			tokens: [token],
		});
	});

	test('scopes repository searches to the user and organizations, including private repositories and forks', async () => {
		const token = store.add(new CancellationTokenSource()).token;
		mockApi.setResponses(
			{ login: 'owner' },
			[{ login: 'microsoft' }],
			{ items: [{ name: 'repo', full_name: 'owner/repo', owner: { login: 'owner' }, default_branch: 'main', private: true, description: null }] },
		);

		assert.deepStrictEqual({
			repositories: await fetcher.getRepositories(' repo language:TypeScript ', token),
			calls: mockApi.calls,
			tokens: mockApi.tokens,
		}, {
			repositories: [{ owner: 'owner', name: 'repo', fullName: 'owner/repo', defaultBranch: 'main', isPrivate: true, description: '' }],
			calls: [
				{ method: 'users.getAuthenticated', args: [] },
				{ method: 'organizations.listForAuthenticatedUser', args: [{ query: { per_page: 100 } }] },
				{ method: 'search.repositories', args: ['repo language:TypeScript in:name fork:true user:owner org:microsoft', { query: { sort: 'updated', per_page: 100 } }] },
			],
			tokens: [token],
		});
	});

	test('does not fall back to an unscoped search when account information is missing', async () => {
		mockApi.setNextError(new GitHubRequestError('GitHub did not return an account', 'authentication'));

		await assert.rejects(fetcher.getRepositories('vscode', CancellationToken.None), /GitHub did not return an account/);
		assert.deepStrictEqual(mockApi.calls.map(call => call.method), ['users.getAuthenticated', 'organizations.listForAuthenticatedUser']);
	});

	test('uses the repository full name when search omits the owner object', async () => {
		mockApi.setResponses(
			{ login: 'viewer' },
			[],
			{ items: [{ name: 'repo', full_name: 'owner/repo', owner: null, default_branch: 'main', private: true, description: null }] },
		);

		assert.deepStrictEqual(await fetcher.getRepositories('repo', CancellationToken.None), [
			{ owner: 'owner', name: 'repo', fullName: 'owner/repo', defaultBranch: 'main', isPrivate: true, description: '' },
		]);
	});
});

suite('GitHubPullRequestContextFetcher', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns details, patch, and issue/review comments as one snapshot', async () => {
		const mockApi = new MockApiClient();
		mockApi.setResponses(
			{
				number: 42,
				html_url: 'https://github.com/owner/repo/pull/42',
				title: 'Improve sessions',
				body: 'Description',
				user: { login: 'author' },
				draft: false,
				base: { ref: 'main' },
				head: { ref: 'feature' },
				updated_at: '2026-01-01T00:00:00Z',
			},
			[{ filename: 'src/a.ts', status: 'modified', additions: 2, deletions: 1, patch: '@@ -1 +1 @@' }],
			[{ body: 'General comment', user: { login: 'commenter' }, created_at: '2026-01-02T00:00:00Z', updated_at: '2026-01-02T00:00:00Z' }],
			[{ body: 'Inline comment', user: { login: 'reviewer' }, created_at: '2026-01-03T00:00:00Z', updated_at: '2026-01-03T00:00:00Z', path: 'src/a.ts', line: 7, original_line: null }],
		);
		const fetcher = new GitHubPullRequestContextFetcher(mockApi);

		const context = await fetcher.getPullRequestContext('owner', 'repo', 42);

		assert.deepStrictEqual({
			context,
			calls: mockApi.calls,
		}, {
			context: {
				owner: 'owner',
				repo: 'repo',
				number: 42,
				url: 'https://github.com/owner/repo/pull/42',
				title: 'Improve sessions',
				description: 'Description',
				author: 'author',
				isDraft: false,
				baseRef: 'main',
				branchName: 'feature',
				headRef: 'feature',
				updatedAt: '2026-01-01T00:00:00Z',
				patch: 'diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@',
				comments: [{
					kind: 'issue',
					author: 'commenter',
					body: 'General comment',
					createdAt: '2026-01-02T00:00:00Z',
					updatedAt: '2026-01-02T00:00:00Z',
				}, {
					kind: 'review',
					author: 'reviewer',
					body: 'Inline comment',
					createdAt: '2026-01-03T00:00:00Z',
					updatedAt: '2026-01-03T00:00:00Z',
					path: 'src/a.ts',
					line: 7,
				}],
			},
			calls: [
				{ method: 'pullRequests.get', args: [{ owner: 'owner', name: 'repo' }, 42] },
				...['pullRequests.listFiles', 'issues.listComments', 'reviews.listComments'].map(method => ({
					method, args: [{ owner: 'owner', name: 'repo' }, 42, { query: { page: 1, per_page: 100 }, maxPages: 100 }],
				})),
			],
		});
	});
});

suite('GitHubPRFetcher', () => {

	const store = new DisposableStore();
	let mockApi: MockApiClient;
	let fetcher: GitHubPRFetcher;

	setup(() => {
		mockApi = new MockApiClient();
		fetcher = new GitHubPRFetcher(mockApi);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const merged of [false, true]) {
		test(`getPullRequest preserves closed state through real schema validation with default auto-merge text (merged=${merged})`, async () => {
			const provider = new FixtureApiRequestProvider(createTestPullRequestResponse({
				merged,
				merged_at: merged ? '2026-10-02T00:00:00Z' : null,
				auto_merge: {
					enabled_by: { id: 2, node_id: 'U_2', login: 'reviewer', avatar_url: '', html_url: 'https://github.com/reviewer', type: 'User' },
					merge_method: 'squash', commit_title: null, commit_message: null,
				},
			}));
			const accountClient = upcastPartial<IGitHubAccountClient>({
				pullRequests: new PullRequestsClient(new CoreClient(provider, provider)),
			});
			const api = new class extends mock<GitHubApiClient>() {
				override withClient<T>(task: (client: IGitHubAccountClient, signal: AbortSignal) => Promise<T>): Promise<T> {
					return task(accountClient, new AbortController().signal);
				}
			}();
			const result = await new GitHubPRFetcher(api).getPullRequest('owner', 'repo', 1);
			assert.deepStrictEqual({ state: result.state, draft: result.isDraft }, {
				state: merged ? GitHubPullRequestState.Merged : GitHubPullRequestState.Closed, draft: false,
			});
		});
	}

	test('getPullRequest maps open PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'open', merged: false, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.state, GitHubPullRequestState.Open);
		assert.strictEqual(pr.isDraft, false);
		assert.strictEqual(pr.number, 1);
		assert.strictEqual(pr.title, 'Test PR');
	});

	test('getPullRequest maps merged PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: true, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.state, GitHubPullRequestState.Merged);
		assert.ok(pr.mergedAt);
	});

	test('getPullRequest maps closed PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: false, draft: false, closed_at: '2024-03-04T00:00:00Z' }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.state, GitHubPullRequestState.Closed);
		assert.strictEqual(pr.closedAt, '2024-03-04T00:00:00Z');
	});

	test('getPullRequest omits closedAt for an open PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'open', merged: false, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.closedAt, undefined);
	});

	test('getReviewThreads returns GraphQL thread metadata', async () => {
		mockApi.setResponses({ node_id: 'PR_1' }, makeGraphQLReviewThreadsResponse([
			makeGraphQLReviewThread({
				id: 'thread-a',
				path: 'src/a.ts',
				startLine: 8,
				line: 10,
				isResolved: false,
				comments: [
					makeGraphQLReviewComment({ databaseId: 100, path: 'src/a.ts', line: 10 }),
					makeGraphQLReviewComment({ databaseId: 101, path: 'src/a.ts', line: 10, replyToDatabaseId: 100 }),
				],
			}),
			makeGraphQLReviewThread({
				id: 'thread-b',
				path: 'src/b.ts',
				line: 20,
				isResolved: true,
				comments: [makeGraphQLReviewComment({ databaseId: 200, path: 'src/b.ts', line: 20 })],
			}),
		]));

		const threads = await fetcher.getReviewThreads('owner', 'repo', 1);
		assert.strictEqual(threads.length, 2);

		const thread1 = threads.find(t => t.id === 'thread-a')!;
		assert.ok(thread1);
		assert.strictEqual(thread1.comments.length, 2);
		assert.strictEqual(thread1.path, 'src/a.ts');
		assert.strictEqual(thread1.startLine, 8);
		assert.strictEqual(thread1.line, 10);
		assert.strictEqual(thread1.comments[0].threadId, 'thread-a');

		const thread2 = threads.find(t => t.id === 'thread-b')!;
		assert.ok(thread2);
		assert.strictEqual(thread2.comments.length, 1);
		assert.strictEqual(thread2.path, 'src/b.ts');
		assert.strictEqual(thread2.isResolved, true);
	});

	test('getReviewThreads reuses embedded comments and collects only the remaining pages', async () => {
		mockApi.setResponses({ node_id: 'PR_1' }, makeGraphQLReviewThreadsResponse([
			null,
			makeGraphQLReviewThread({
				id: 'thread-a',
				comments: [makeGraphQLReviewComment({ databaseId: 100 }), null],
				commentsPageInfo: { endCursor: 'comment-100', hasNextPage: true },
			}),
			makeGraphQLReviewThread({
				id: 'thread-b',
				comments: [makeGraphQLReviewComment({ databaseId: 200 })],
			}),
		]), {
			nodes: [
				makeGraphQLReviewComment({ databaseId: 101, replyToDatabaseId: 100 }),
				null,
				makeGraphQLReviewComment({ databaseId: 102, replyToDatabaseId: 100 }),
			],
			pageInfo: { endCursor: 'comment-102', hasNextPage: false },
		});

		const threads = await fetcher.getReviewThreads('owner', 'repo', 1);

		assert.deepStrictEqual({
			threads: threads.map(thread => ({ id: thread.id, comments: thread.comments.map(comment => ({ id: comment.id, inReplyToId: comment.inReplyToId })) })),
			calls: mockApi.calls,
		}, {
			threads: [
				{ id: 'thread-a', comments: [{ id: 100, inReplyToId: undefined }, { id: 101, inReplyToId: 100 }, { id: 102, inReplyToId: 100 }] },
				{ id: 'thread-b', comments: [{ id: 200, inReplyToId: undefined }] },
			],
			calls: [
				{ method: 'pullRequests.get', args: [{ owner: 'owner', name: 'repo' }, 1] },
				{ method: 'reviews.listThreads', args: ['PR_1', { query: { first: 100, commentsFirst: 100 }, maxPages: 100 }] },
				{ method: 'reviews.listThreadComments', args: ['thread-a', { query: { first: 100, after: 'comment-100' }, maxPages: 99 }] },
			],
		});
	});

	test('getReviewThreads rejects an unavailable pull request', async () => {
		mockApi.setResponses({ node_id: 'PR_1' }, null);

		await assert.rejects(fetcher.getReviewThreads('owner', 'repo', 1), /GitHub resource was not returned/);
	});

	test('getReviewThreads rejects a missing embedded continuation instead of rereading comments', async () => {
		mockApi.setResponses({ node_id: 'PR_1' }, makeGraphQLReviewThreadsResponse([
			makeGraphQLReviewThread({ commentsPageInfo: { endCursor: null, hasNextPage: true } }),
		]));

		await assert.rejects(fetcher.getReviewThreads('owner', 'repo', 1), /Invalid GitHub pagination cursor/);
		assert.deepStrictEqual(mockApi.calls.map(call => call.method), ['pullRequests.get', 'reviews.listThreads']);
	});

	test('getReviewThreads rejects unavailable remaining comments', async () => {
		mockApi.setResponses({ node_id: 'PR_1' }, makeGraphQLReviewThreadsResponse([
			makeGraphQLReviewThread({ commentsPageInfo: { endCursor: 'comment-100', hasNextPage: true } }),
		]), null);

		await assert.rejects(fetcher.getReviewThreads('owner', 'repo', 1), /GitHub resource was not returned/);
	});

	test('getReviewThreads rejects remaining-page failures instead of returning embedded comments', async () => {
		const error = new PaginationLimitError(99);
		mockApi.setResponses({ node_id: 'PR_1' }, makeGraphQLReviewThreadsResponse([
			makeGraphQLReviewThread({ commentsPageInfo: { endCursor: 'comment-100', hasNextPage: true } }),
		]), error);

		await assert.rejects(fetcher.getReviewThreads('owner', 'repo', 1), candidate => candidate === error);
	});

	test('resolveThread uses GraphQL mutation', async () => {
		mockApi.setNextResponse({ id: 'thread-a', isResolved: true });

		await fetcher.resolveThread('owner', 'repo', 'thread-a');
		assert.deepStrictEqual(mockApi.calls, [{ method: 'reviews.resolveThread', args: ['thread-a'] }]);
	});

	test('postPullRequestReviewComment sends a line comment against the head commit', async () => {
		mockApi.setNextResponse({
			id: 1,
			node_id: 'PRR_review',
			user: { login: 'reviewer', avatar_url: '' },
			state: 'COMMENTED',
			submitted_at: '2024-01-01T00:00:00Z',
		});

		await fetcher.postPullRequestReviewComment('owner', 'repo', 1, 'Please update this.', 'abc123', 'src/a.ts', 12, 10);

		assert.deepStrictEqual(mockApi.calls, [{
			method: 'reviews.create',
			args: [{ owner: 'owner', name: 'repo' }, 1, {
				commit_id: 'abc123',
				comments: [{
					body: 'Please update this.',
					path: 'src/a.ts',
					line: 12,
					side: 'RIGHT',
					start_line: 10,
					start_side: 'RIGHT',
				}],
			}],
		}]);
	});

	test('postPullRequestReviewComment adds to an existing pending review without submitting it', async () => {
		mockApi.setNextResponse({ id: 'thread-a' });

		await fetcher.postPullRequestReviewComment(
			'owner',
			'repo',
			1,
			'Please update this.',
			'abc123',
			'src/a.ts',
			12,
			10,
			{ id: 42, nodeId: 'PRR_pending' },
		);

		assert.deepStrictEqual(mockApi.calls, [{
			method: 'reviews.createThread',
			args: [{
				pullRequestReviewId: 'PRR_pending',
				body: 'Please update this.',
				path: 'src/a.ts',
				line: 12,
				side: 'RIGHT',
				startLine: 10,
				startSide: 'RIGHT',
			}],
		}]);
	});

	test('getReviews maps API response', async () => {
		mockApi.setNextResponse([
			{ id: 1, node_id: 'PRR_1', user: { login: 'reviewer', avatar_url: '' }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
			{ id: 2, node_id: 'PRR_2', user: { login: 'other', avatar_url: '' }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-02T00:00:00Z' },
		]);

		const reviews = await fetcher.getReviews('owner', 'repo', 1);
		assert.deepStrictEqual(reviews, [
			{ id: 1, nodeId: 'PRR_1', author: { login: 'reviewer', avatarUrl: '' }, state: 'APPROVED', submittedAt: '2024-01-01T00:00:00Z' },
			{ id: 2, nodeId: 'PRR_2', author: { login: 'other', avatarUrl: '' }, state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T00:00:00Z' },
		]);
		assert.deepStrictEqual(mockApi.calls, [{
			method: 'reviews.list', args: [{ owner: 'owner', name: 'repo' }, 1, { query: { page: 1, per_page: 100 }, maxPages: 100 }],
		}]);
	});

	test('getReviews delegates page collection and maps pending reviews beyond the first page', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			id: index + 1,
			node_id: `PRR_${index + 1}`,
			user: { login: 'reviewer', avatar_url: '' },
			state: 'COMMENTED',
			submitted_at: '2024-01-01T00:00:00Z',
		}));
		mockApi.setNextResponse([...firstPage, {
			id: 101,
			node_id: 'PRR_pending',
			user: { login: 'reviewer', avatar_url: '' },
			state: 'PENDING',
			submitted_at: null,
		}]);

		const reviews = await fetcher.getReviews('owner', 'repo', 1);

		assert.deepStrictEqual({
			count: reviews.length,
			pending: reviews.find(review => review.state === 'PENDING'),
			calls: mockApi.calls,
		}, {
			count: 101,
			pending: {
				id: 101,
				nodeId: 'PRR_pending',
				author: { login: 'reviewer', avatarUrl: '' },
				state: 'PENDING',
				submittedAt: undefined,
			},
			calls: [{
				method: 'reviews.list', args: [{ owner: 'owner', name: 'repo' }, 1, { query: { page: 1, per_page: 100 }, maxPages: 100 }],
			}],
		});
	});

	test('getChangedFiles delegates page collection and maps files beyond the first page', async () => {
		const firstPage = Array.from({ length: 100 }, (_, index) => ({
			filename: `src/file-${index}.ts`,
			status: 'modified',
			additions: 1,
			deletions: 1,
		}));
		mockApi.setNextResponse([...firstPage, {
			filename: 'src/target.ts',
			previous_filename: 'src/old-target.ts',
			status: 'renamed',
			additions: 2,
			deletions: 1,
			patch: '@@ -1 +1 @@\n-old\n+new',
		}]);

		const files = await fetcher.getChangedFiles('owner', 'repo', 1);

		assert.deepStrictEqual({
			count: files.length,
			target: files.at(-1),
			calls: mockApi.calls,
		}, {
			count: 101,
			target: {
				filename: 'src/target.ts',
				previous_filename: 'src/old-target.ts',
				status: 'renamed',
				additions: 2,
				deletions: 1,
				patch: '@@ -1 +1 @@\n-old\n+new',
			},
			calls: [{
				method: 'pullRequests.listFiles', args: [{ owner: 'owner', name: 'repo' }, 1, { query: { page: 1, per_page: 100 }, maxPages: 100 }],
			}],
		});
	});

	for (const method of ['getReviews', 'getChangedFiles'] as const) {
		test(`${method} rejects collection overflow`, async () => {
			const error = new PaginationLimitError(100);
			mockApi.setNextError(error);

			await assert.rejects(fetcher[method]('owner', 'repo', 1), candidate => candidate === error);
		});
	}

	test('computeMergeability detects draft blocker', () => {
		const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: true, mergeable: true, mergeableState: 'clean' });
		const result = computeMergeability(pr, []);
		assert.strictEqual(result.canMerge, false);
		assert.ok(result.blockers.some(b => b.kind === MergeBlockerKind.Draft));
	});

	test('computeMergeability detects conflicts blocker', () => {
		const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: false, mergeableState: 'dirty' });
		const result = computeMergeability(pr, []);
		assert.strictEqual(result.canMerge, false);
		assert.ok(result.blockers.some(b => b.kind === MergeBlockerKind.Conflicts));
	});

	test('computeMergeability detects changes requested blocker', () => {
		const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: 'clean' });
		const reviews: IGitHubPullRequestReview[] = [
			{ id: 1, nodeId: 'PRR_1', author: { login: 'reviewer', avatarUrl: '' }, state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T00:00:00Z' },
		];
		const result = computeMergeability(pr, reviews);
		assert.strictEqual(result.canMerge, false);
		assert.ok(result.blockers.some(b => b.kind === MergeBlockerKind.ChangesRequested));
	});

	test('computeMergeability returns canMerge for clean open PR', () => {
		const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: 'clean' });
		const result = computeMergeability(pr, []);
		assert.strictEqual(result.canMerge, true);
		assert.strictEqual(result.blockers.length, 0);
	});
});

suite('GitHubPullRequestsFetcher', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('maps a lightweight page with pagination and diff stats', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			nodes: [{
				number: 7,
				title: 'Improve sessions',
				author: { login: 'author', avatarUrl: 'avatar' },
				headRefName: 'feature',
				isCrossRepository: false,
				isDraft: true,
				updatedAt: '2026-07-30T12:00:00Z',
				additions: 12,
				deletions: 3,
			}],
			pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
		});
		const fetcher = new GitHubPullRequestsFetcher(mockApi);

		const page = await fetcher.getPullRequests('microsoft', 'vscode');

		assert.deepStrictEqual(page, {
			pullRequests: [{
				number: 7,
				title: 'Improve sessions',
				author: { login: 'author', avatarUrl: 'avatar' },
				headRef: 'feature',
				checkoutRef: 'refs/pull/7/head',
				isCrossRepository: false,
				isDraft: true,
				updatedAt: '2026-07-30T12:00:00Z',
				additions: 12,
				deletions: 3,
				reviewRequestedFromViewer: false,
				assignedToViewer: false,
			}],
			cursor: 'cursor-1',
			hasNextPage: true,
		});
		assert.deepStrictEqual(mockApi.calls, [{
			method: 'pullRequests.listConnection', args: [{ owner: 'microsoft', name: 'vscode' }, { query: { first: 100, after: undefined } }],
		}]);
	});

	test('loads viewer review and assignment membership with independent small queries', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({ nodes: [makePullRequestSearchNode(7), null, makePullRequestSearchNode(9)] });
		const fetcher = new GitHubPullRequestsFetcher(mockApi);

		const reviewRequested = await fetcher.getPullRequestsWaitingForReview('microsoft', 'vscode');
		mockApi.setNextResponse({ nodes: [makePullRequestSearchNode(8), makePullRequestSearchNode(9)] });
		const assigned = await fetcher.getPullRequestsAssignedToViewer('microsoft', 'vscode');

		assert.deepStrictEqual({
			reviewRequested: reviewRequested.map(pullRequest => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
			assigned: assigned.map(pullRequest => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
			calls: mockApi.calls,
		}, {
			reviewRequested: [
				{ number: 7, reviewRequestedFromViewer: true, assignedToViewer: false },
				{ number: 9, reviewRequestedFromViewer: true, assignedToViewer: false },
			],
			assigned: [
				{ number: 8, reviewRequestedFromViewer: false, assignedToViewer: true },
				{ number: 9, reviewRequestedFromViewer: false, assignedToViewer: true },
			],
			calls: [
				{ method: 'search.pullRequests', args: ['repo:microsoft/vscode is:open review-requested:@me sort:updated-desc', { query: { first: 100 } }] },
				{ method: 'search.pullRequests', args: ['repo:microsoft/vscode is:open assignee:@me sort:updated-desc', { query: { first: 100 } }] },
			],
		});
	});
});

suite('GitHubPRCIFetcher', () => {

	const store = new DisposableStore();
	let mockApi: MockApiClient;
	let fetcher: GitHubPRCIFetcher;

	setup(() => {
		mockApi = new MockApiClient();
		fetcher = new GitHubPRCIFetcher(mockApi, new NullLogService());
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getCheckRuns maps check runs', async () => {
		mockApi.setNextResponse({
			total_count: 2,
			check_runs: [
				{ id: 1, name: 'build', status: 'completed', conclusion: 'success', started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:10:00Z', details_url: 'https://example.com/1' },
				{ id: 2, name: 'test', status: 'in_progress', conclusion: null, started_at: '2024-01-01T00:00:00Z', completed_at: null, details_url: null },
			],
		});

		const checks = await fetcher.getCheckRuns('owner', 'repo', 'abc123');
		assert.deepStrictEqual({ checks, calls: mockApi.calls }, {
			checks: [{
				id: 1,
				name: 'build',
				status: GitHubCheckStatus.Completed,
				conclusion: GitHubCheckConclusion.Success,
				startedAt: '2024-01-01T00:00:00Z',
				completedAt: '2024-01-01T00:10:00Z',
				detailsUrl: 'https://example.com/1',
			}, {
				id: 2,
				name: 'test',
				status: GitHubCheckStatus.InProgress,
				conclusion: undefined,
				startedAt: '2024-01-01T00:00:00Z',
				completedAt: undefined,
				detailsUrl: undefined,
			}],
			calls: [{
				method: 'checks.listRuns', args: [{ owner: 'owner', name: 'repo' }, 'abc123', { query: { page: 1, per_page: 100 }, maxPages: 100 }],
			}],
		});
	});

	test('getCheckRunAnnotations returns formatted annotations', async () => {
		mockApi.setResponses({ output: { title: null, summary: null, text: null } }, [
			{ path: 'src/a.ts', start_line: 10, end_line: 10, annotation_level: 'failure', message: 'type error', title: 'TS2345' },
			{ path: 'src/b.ts', start_line: 5, end_line: 8, annotation_level: 'warning', message: 'unused var', title: null },
		]);

		const result = await fetcher.getCheckRunAnnotations('owner', 'repo', 1);
		assert.deepStrictEqual({ result, calls: mockApi.calls }, {
			result: '[failure] src/a.ts:10 (TS2345) type error\n[warning] src/b.ts:5-8 unused var',
			calls: [
				{ method: 'checks.getRun', args: [{ owner: 'owner', name: 'repo' }, 1] },
				{ method: 'checks.listAnnotations', args: [{ owner: 'owner', name: 'repo' }, 1, { query: { page: 1, per_page: 100 }, maxPages: 100 }] },
			],
		});
	});

	test('rerunFailedJobs invokes the typed Actions operation', async () => {
		mockApi.setNextResponse(undefined);

		await fetcher.rerunFailedJobs('myOwner', 'myRepo', 12345);

		assert.deepStrictEqual(mockApi.calls, [{
			method: 'actions.rerunFailedJobs', args: [{ owner: 'myOwner', name: 'myRepo' }, 12345],
		}]);
	});
});

suite('computeOverallCIStatus', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns neutral for empty checks', () => {
		assert.strictEqual(computeOverallCIStatus([]), GitHubCIOverallStatus.Neutral);
	});

	test('returns success when all completed successfully', () => {
		const checks = [
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Neutral }),
		];
		assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Success);
	});

	test('returns failure when any check failed', () => {
		const checks = [
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure }),
		];
		assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
	});

	test('returns pending when any check is in progress', () => {
		const checks = [
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
			makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: undefined }),
		];
		assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Pending);
	});

	test('failure takes precedence over pending', () => {
		const checks = [
			makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure }),
			makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: undefined }),
		];
		assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
	});
});


//#region Test Helpers

function makePR(overrides: {
	state: GitHubPullRequestState;
	isDraft: boolean;
	mergeable: boolean | undefined;
	mergeableState: string;
}): IGitHubPullRequest {
	return {
		number: 1,
		title: 'Test PR',
		body: 'Test body',
		state: overrides.state,
		author: { login: 'author', avatarUrl: '' },
		headRef: 'feature',
		headSha: 'abc123',
		baseRef: 'main',
		isDraft: overrides.isDraft,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
		mergedAt: undefined,
		mergeable: overrides.mergeable,
		mergeableState: overrides.mergeableState,
	};
}

function makePullRequestSearchNode(number: number): unknown {
	return {
		number,
		title: `Pull request ${number}`,
		author: { login: 'author', avatarUrl: '' },
		headRefName: `feature-${number}`,
		isCrossRepository: false,
		isDraft: false,
		updatedAt: '2026-07-30T12:00:00Z',
		additions: number,
		deletions: 1,
	};
}

function makePRResponse(overrides: {
	state: 'open' | 'closed';
	merged: boolean;
	draft: boolean;
	mergeable?: boolean | null;
	mergeable_state?: string;
	closed_at?: string | null;
}): unknown {
	return {
		number: 1,
		title: 'Test PR',
		body: 'Test body',
		state: overrides.state,
		draft: overrides.draft,
		user: { login: 'author', avatar_url: 'https://example.com/avatar' },
		head: { ref: 'feature-branch' },
		base: { ref: 'main' },
		created_at: '2024-01-01T00:00:00Z',
		updated_at: '2024-01-02T00:00:00Z',
		merged_at: overrides.merged ? '2024-01-02T00:00:00Z' : null,
		closed_at: overrides.closed_at ?? (overrides.state === 'closed' ? '2024-01-03T00:00:00Z' : null),
		mergeable: overrides.mergeable ?? true,
		mergeable_state: overrides.mergeable_state ?? 'clean',
		merged: overrides.merged,
	};
}

function makeGraphQLReviewThreadsResponse(threads: readonly ReturnType<typeof makeGraphQLReviewThread>[]): unknown {
	return {
		nodes: threads,
		pageInfo: { endCursor: null, hasNextPage: false },
	};
}

function makeGraphQLReviewThread(overrides: Partial<{
	id: string;
	isResolved: boolean;
	path: string;
	startLine: number;
	line: number;
	comments: readonly ReturnType<typeof makeGraphQLReviewComment>[];
	commentsPageInfo: { endCursor: string | null; hasNextPage: boolean };
}> = {}): unknown {
	return {
		id: overrides.id ?? 'thread-1',
		isResolved: overrides.isResolved ?? false,
		path: overrides.path ?? 'src/a.ts',
		startLine: overrides.startLine ?? null,
		line: overrides.line ?? 10,
		comments: {
			nodes: overrides.comments ?? [makeGraphQLReviewComment()],
			pageInfo: overrides.commentsPageInfo ?? { endCursor: null, hasNextPage: false },
		},
	};
}

function makeGraphQLReviewComment(overrides: Partial<{
	databaseId: number;
	body: string;
	path: string;
	line: number;
	replyToDatabaseId: number;
}> = {}): unknown {
	return {
		databaseId: overrides.databaseId ?? 100,
		body: overrides.body ?? 'Test comment',
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		path: overrides.path ?? 'src/a.ts',
		line: overrides.line ?? 10,
		originalLine: overrides.line ?? 10,
		replyTo: overrides.replyToDatabaseId !== undefined ? { databaseId: overrides.replyToDatabaseId } : null,
		author: {
			login: 'reviewer',
			avatarUrl: 'https://example.com/avatar',
		},
	};
}

function makeCheck(overrides: {
	status: GitHubCheckStatus;
	conclusion: GitHubCheckConclusion | undefined;
}): { id: number; name: string; status: GitHubCheckStatus; conclusion: GitHubCheckConclusion | undefined; startedAt: string | undefined; completedAt: string | undefined; detailsUrl: string | undefined } {
	return {
		id: 1,
		name: 'test-check',
		status: overrides.status,
		conclusion: overrides.conclusion,
		startedAt: undefined,
		completedAt: undefined,
		detailsUrl: undefined,
	};
}

//#endregion
