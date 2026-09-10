/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { GitHubPRFetcher, computeMergeability } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPullRequestContextFetcher } from '../../browser/fetchers/githubPullRequestContextFetcher.js';
import { GitHubPullRequestsFetcher } from '../../browser/fetchers/githubPullRequestsFetcher.js';
import { GitHubPRCIFetcher, computeOverallCIStatus } from '../../browser/fetchers/githubPRCIFetcher.js';
import { GitHubRecentUserWorkFetcher } from '../../browser/fetchers/githubRecentUserWorkFetcher.js';
import { GitHubRepositoryFetcher } from '../../browser/fetchers/githubRepositoryFetcher.js';
import { GitHubApiClient, GitHubApiError, IGitHubApiRequestOptions } from '../../browser/githubApiClient.js';
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, GitHubPullRequestState, IGitHubPullRequestReview, IGitHubPullRequest, MergeBlockerKind } from '../../common/types.js';

class MockApiClient {

	private _nextResponse: unknown;
	private _responses: unknown[] = [];
	private _nextError: Error | undefined;
	readonly requestCalls: { method: string; path: string; body?: unknown }[] = [];
	readonly graphqlCalls: { query: string; variables?: Record<string, unknown>; options?: Pick<IGitHubApiRequestOptions, 'token' | 'createAuthenticationSession'> }[] = [];

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

	async request<T>(_method: string, _path: string, _callSite: string, _options?: IGitHubApiRequestOptions): Promise<{ data: T | undefined; statusCode: number; etag?: string }> {
		this.requestCalls.push({ method: _method, path: _path, body: _options?.data });
		if (this._nextError) {
			throw this._nextError;
		}
		return { data: (this._responses.length > 0 ? this._responses.shift() : this._nextResponse) as T, statusCode: 200 };
	}

	async graphql<T>(query: string, _callSite: string, variables?: Record<string, unknown>, options?: Pick<IGitHubApiRequestOptions, 'token' | 'createAuthenticationSession'>): Promise<T> {
		this.graphqlCalls.push({ query, variables, options });
		if (this._nextError) {
			throw this._nextError;
		}
		return this._nextResponse as T;
	}
}

suite('GitHubRecentUserWorkFetcher', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('queries assigned issue summaries independently', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			search: {
				nodes: [
					null,
					{ __typename: 'Issue', number: 1, title: 'First issue', url: 'https://github.com/o/r/issues/1', updatedAt: '2026-08-07T10:00:00Z' },
					{ __typename: 'Issue', number: 2, title: 'Second issue', url: 'https://github.com/o/r/issues/2', updatedAt: '2026-08-07T11:00:00Z' },
				],
			}
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi as unknown as GitHubApiClient);

		assert.deepStrictEqual({
			issues: await fetcher.getRecentAssignedIssues('o', 'r', CancellationToken.None),
			variables: mockApi.graphqlCalls[0].variables,
			createAuthenticationSession: mockApi.graphqlCalls[0].options?.createAuthenticationSession,
		}, {
			issues: [
				{ number: 1, title: 'First issue', url: 'https://github.com/o/r/issues/1', updatedAt: '2026-08-07T10:00:00Z' },
				{ number: 2, title: 'Second issue', url: 'https://github.com/o/r/issues/2', updatedAt: '2026-08-07T11:00:00Z' },
			],
			variables: { query: 'repo:o/r is:issue is:open assignee:@me sort:updated-desc' },
			createAuthenticationSession: false,
		});
	});

	test('queries pull request summaries without review threads', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			search: {
				nodes: [{
					__typename: 'PullRequest',
					number: 3,
					title: 'Fix CI',
					url: 'https://github.com/o/r/pull/3',
					updatedAt: '2026-08-07T12:00:00Z',
					mergeable: 'CONFLICTING',
					commits: { nodes: [{ commit: { committedDate: '2026-08-07T09:00:00Z', statusCheckRollup: { state: 'FAILURE' } } }] },
				}],
			},
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi as unknown as GitHubApiClient);

		assert.deepStrictEqual({
			pullRequests: await fetcher.getRecentAuthoredPullRequests('o', 'r', CancellationToken.None),
			variables: mockApi.graphqlCalls[0].variables,
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
			variables: { query: 'repo:o/r is:pr is:open author:@me sort:updated-desc' },
		});
	});

	test('queries review threads for one pull request independently', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			repository: {
				pullRequest: {
					reviewThreads: {
						nodes: [{
							isResolved: false,
							comments: { nodes: [{ createdAt: '2026-08-07T10:00:00Z' }] },
						}],
					},
				},
			},
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi as unknown as GitHubApiClient);

		assert.deepStrictEqual({
			reviewThreads: await fetcher.getPullRequestReviewThreads('o', 'r', 3, CancellationToken.None),
			variables: mockApi.graphqlCalls[0].variables,
		}, {
			reviewThreads: [{ isResolved: false, latestCommentAt: '2026-08-07T10:00:00Z' }],
			variables: { owner: 'o', repo: 'r', pullRequestNumber: 3 },
		});
	});

	test('checks pull request linkage for issue summaries in one request', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			repository: {
				issue0: { closedByPullRequestsReferences: { totalCount: 1 } },
				issue1: { closedByPullRequestsReferences: { totalCount: 0 } },
			},
		});
		const fetcher = new GitHubRecentUserWorkFetcher(mockApi as unknown as GitHubApiClient);

		assert.deepStrictEqual({
			linkedIssues: [...await fetcher.getIssuesWithLinkedPullRequests('o', 'r', [1, 2], CancellationToken.None)],
			variables: mockApi.graphqlCalls[0].variables,
		}, {
			linkedIssues: [1],
			variables: { owner: 'o', repo: 'r', issue0: 1, issue1: 2 },
		});
	});
});

suite('GitHubRepositoryFetcher', () => {

	const store = new DisposableStore();
	let mockApi: MockApiClient;
	let fetcher: GitHubRepositoryFetcher;

	setup(() => {
		mockApi = new MockApiClient();
		fetcher = new GitHubRepositoryFetcher(mockApi as unknown as GitHubApiClient);
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
		assert.deepStrictEqual(repo.data, {
			owner: 'microsoft',
			name: 'vscode',
			fullName: 'microsoft/vscode',
			defaultBranch: 'main',
			isPrivate: false,
			description: 'Visual Studio Code',
		});
		assert.strictEqual(mockApi.requestCalls[0].path, '/repos/microsoft/vscode');
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
		assert.strictEqual(repo.data?.description, '');
	});

	test('getRepository propagates API errors', async () => {
		mockApi.setNextError(new GitHubApiError('Not found', 404, undefined));
		await assert.rejects(
			() => fetcher.getRepository('owner', 'nonexistent'),
			(err: Error) => err instanceof GitHubApiError && (err as GitHubApiError).statusCode === 404,
		);
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
		const fetcher = new GitHubPullRequestContextFetcher(mockApi as unknown as GitHubApiClient);

		const context = await fetcher.getPullRequestContext('owner', 'repo', 42);

		assert.deepStrictEqual({
			context,
			paths: mockApi.requestCalls.map(call => call.path),
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
			paths: [
				'/repos/owner/repo/pulls/42',
				'/repos/owner/repo/pulls/42/files?per_page=100&page=1',
				'/repos/owner/repo/issues/42/comments?per_page=100&page=1',
				'/repos/owner/repo/pulls/42/comments?per_page=100&page=1',
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
		fetcher = new GitHubPRFetcher(mockApi as unknown as GitHubApiClient);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('getPullRequest maps open PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'open', merged: false, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.data?.state, GitHubPullRequestState.Open);
		assert.strictEqual(pr.data?.isDraft, false);
		assert.strictEqual(pr.data?.number, 1);
		assert.strictEqual(pr.data?.title, 'Test PR');
	});

	test('getPullRequest maps merged PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: true, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.data?.state, GitHubPullRequestState.Merged);
		assert.ok(pr.data?.mergedAt);
	});

	test('getPullRequest maps closed PR', async () => {
		mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: false, draft: false }));

		const pr = await fetcher.getPullRequest('owner', 'repo', 1);
		assert.strictEqual(pr.data?.state, GitHubPullRequestState.Closed);
	});

	test('getReviewThreads returns GraphQL thread metadata', async () => {
		mockApi.setNextResponse(makeGraphQLReviewThreadsResponse([
			makeGraphQLReviewThread({
				id: 'thread-a',
				path: 'src/a.ts',
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
		assert.strictEqual(thread1.line, 10);
		assert.strictEqual(thread1.comments[0].threadId, 'thread-a');

		const thread2 = threads.find(t => t.id === 'thread-b')!;
		assert.ok(thread2);
		assert.strictEqual(thread2.comments.length, 1);
		assert.strictEqual(thread2.path, 'src/b.ts');
		assert.strictEqual(thread2.isResolved, true);
	});

	test('resolveThread uses GraphQL mutation', async () => {
		mockApi.setNextResponse({
			resolveReviewThread: {
				thread: {
					isResolved: true,
				},
			},
		});

		await fetcher.resolveThread('owner', 'repo', 'thread-a');
		assert.strictEqual(mockApi.graphqlCalls.length, 1);
		assert.deepStrictEqual(mockApi.graphqlCalls[0].variables, { threadId: 'thread-a' });
	});

	test('getReviews maps API response', async () => {
		mockApi.setNextResponse([
			{ id: 1, user: { login: 'reviewer', avatar_url: '' }, state: 'APPROVED', submitted_at: '2024-01-01T00:00:00Z' },
			{ id: 2, user: { login: 'other', avatar_url: '' }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-02T00:00:00Z' },
		]);

		const reviews = await fetcher.getReviews('owner', 'repo', 1);
		assert.deepStrictEqual(reviews.data, [
			{ id: 1, author: { login: 'reviewer', avatarUrl: '' }, state: 'APPROVED', submittedAt: '2024-01-01T00:00:00Z' },
			{ id: 2, author: { login: 'other', avatarUrl: '' }, state: 'CHANGES_REQUESTED', submittedAt: '2024-01-02T00:00:00Z' },
		]);
		assert.strictEqual(mockApi.requestCalls.length, 1);
		assert.strictEqual(mockApi.requestCalls[0].path, '/repos/owner/repo/pulls/1/reviews');
	});

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
			{ id: 1, author: { login: 'reviewer', avatarUrl: '' }, state: 'CHANGES_REQUESTED', submittedAt: '2024-01-01T00:00:00Z' },
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
			repository: {
				pullRequests: {
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
				},
			},
		});
		const fetcher = new GitHubPullRequestsFetcher(mockApi as unknown as GitHubApiClient);

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
		assert.deepStrictEqual(mockApi.graphqlCalls[0].variables, { owner: 'microsoft', repo: 'vscode', cursor: null });
	});

	test('loads viewer review and assignment membership with independent small queries', async () => {
		const mockApi = new MockApiClient();
		mockApi.setNextResponse({
			search: { nodes: [makePullRequestSearchNode(7), null, makePullRequestSearchNode(9)] },
		});
		const fetcher = new GitHubPullRequestsFetcher(mockApi as unknown as GitHubApiClient);

		const reviewRequested = await fetcher.getPullRequestsWaitingForReview('microsoft', 'vscode');
		mockApi.setNextResponse({
			search: { nodes: [makePullRequestSearchNode(8), makePullRequestSearchNode(9)] },
		});
		const assigned = await fetcher.getPullRequestsAssignedToViewer('microsoft', 'vscode');

		assert.deepStrictEqual({
			reviewRequested: reviewRequested.map(pullRequest => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
			assigned: assigned.map(pullRequest => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
			variables: mockApi.graphqlCalls.map(call => call.variables),
			usesNestedFields: mockApi.graphqlCalls.some(call => call.query.includes('reviewRequests(') || call.query.includes('assignees(')),
		}, {
			reviewRequested: [
				{ number: 7, reviewRequestedFromViewer: true, assignedToViewer: false },
				{ number: 9, reviewRequestedFromViewer: true, assignedToViewer: false },
			],
			assigned: [
				{ number: 8, reviewRequestedFromViewer: false, assignedToViewer: true },
				{ number: 9, reviewRequestedFromViewer: false, assignedToViewer: true },
			],
			variables: [
				{ query: 'repo:microsoft/vscode is:pr is:open review-requested:@me sort:updated-desc' },
				{ query: 'repo:microsoft/vscode is:pr is:open assignee:@me sort:updated-desc' },
			],
			usesNestedFields: false,
		});
	});
});

suite('GitHubPRCIFetcher', () => {

	const store = new DisposableStore();
	let mockApi: MockApiClient;
	let fetcher: GitHubPRCIFetcher;

	setup(() => {
		mockApi = new MockApiClient();
		fetcher = new GitHubPRCIFetcher(mockApi as unknown as GitHubApiClient);
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
		assert.strictEqual(checks.data?.length, 2);
		assert.deepStrictEqual(checks.data?.[0], {
			id: 1,
			name: 'build',
			status: GitHubCheckStatus.Completed,
			conclusion: GitHubCheckConclusion.Success,
			startedAt: '2024-01-01T00:00:00Z',
			completedAt: '2024-01-01T00:10:00Z',
			detailsUrl: 'https://example.com/1',
		});
		assert.strictEqual(checks.data?.[1].conclusion, undefined);
	});

	test('getCheckRunAnnotations returns formatted annotations', async () => {
		mockApi.setNextResponse([
			{ path: 'src/a.ts', start_line: 10, end_line: 10, annotation_level: 'failure', message: 'type error', title: 'TS2345' },
			{ path: 'src/b.ts', start_line: 5, end_line: 8, annotation_level: 'warning', message: 'unused var', title: null },
		]);

		const result = await fetcher.getCheckRunAnnotations('owner', 'repo', 1);
		assert.ok(result.includes('[failure] src/a.ts:10'));
		assert.ok(result.includes('(TS2345)'));
		assert.ok(result.includes('[warning] src/b.ts:5-8'));
	});

	test('rerunFailedJobs sends POST to correct endpoint', async () => {
		mockApi.setNextResponse(undefined);

		await fetcher.rerunFailedJobs('myOwner', 'myRepo', 12345);

		assert.strictEqual(mockApi.requestCalls.length, 1);
		assert.deepStrictEqual(mockApi.requestCalls[0], {
			method: 'POST',
			path: '/repos/myOwner/myRepo/actions/runs/12345/rerun-failed-jobs',
			body: undefined,
		});
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
		mergeable: overrides.mergeable ?? true,
		mergeable_state: overrides.mergeable_state ?? 'clean',
		merged: overrides.merged,
	};
}

function makeGraphQLReviewThreadsResponse(threads: readonly ReturnType<typeof makeGraphQLReviewThread>[]): unknown {
	return {
		repository: {
			pullRequest: {
				reviewThreads: {
					nodes: threads,
				},
			},
		},
	};
}

function makeGraphQLReviewThread(overrides: Partial<{
	id: string;
	isResolved: boolean;
	path: string;
	line: number;
	comments: readonly ReturnType<typeof makeGraphQLReviewComment>[];
}> = {}): unknown {
	return {
		id: overrides.id ?? 'thread-1',
		isResolved: overrides.isResolved ?? false,
		path: overrides.path ?? 'src/a.ts',
		line: overrides.line ?? 10,
		comments: {
			nodes: overrides.comments ?? [makeGraphQLReviewComment()],
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
