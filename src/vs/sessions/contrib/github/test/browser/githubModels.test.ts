/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';
import { GitHubPullRequestCIModel, GitHubPullRequestCIModelReferenceCollection, parseWorkflowRunId } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubRepositoryModel } from '../../browser/models/githubRepositoryModel.js';
import { GitHubPRFetcher } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from '../../browser/fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryFetcher } from '../../browser/fetchers/githubRepositoryFetcher.js';
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPRComment, IGitHubPullRequestReview, IGitHubPullRequest, IGitHubRepository, IGitHubPullRequestReviewThread } from '../../common/types.js';

//#region Mock Fetchers

class MockRepositoryFetcher {
	nextResult: IGitHubRepository | undefined;
	getRepositoryCalls = 0;
	getRepositoryGate: DeferredPromise<void> | undefined;

	async getRepository(_owner: string, _repo: string, _etag?: string): Promise<{ data: IGitHubRepository | undefined; statusCode: number; etag?: string }> {
		this.getRepositoryCalls++;
		await this.getRepositoryGate?.p;
		if (!this.nextResult) {
			throw new Error('No mock result');
		}
		return { data: this.nextResult, statusCode: 200 };
	}
}

class MockPRFetcher {
	nextPR: IGitHubPullRequest | undefined;
	nextReviews: IGitHubPullRequestReview[] = [];
	nextThreads: IGitHubPullRequestReviewThread[] = [];
	getPullRequestCalls = 0;
	getReviewsCalls = 0;
	getReviewThreadsCalls = 0;
	getPullRequestGate: DeferredPromise<void> | undefined;
	getReviewThreadsGate: DeferredPromise<void> | undefined;
	postReviewCommentCalls: { body: string; inReplyTo: number }[] = [];
	postIssueCommentCalls: { body: string }[] = [];
	resolveThreadCalls: { threadId: string }[] = [];

	async getPullRequest(_owner: string, _repo: string, _prNumber: number, _etag?: string): Promise<{ data: IGitHubPullRequest | undefined; statusCode: number; etag?: string }> {
		this.getPullRequestCalls++;
		await this.getPullRequestGate?.p;
		if (!this.nextPR) {
			throw new Error('No mock PR');
		}
		return { data: this.nextPR, statusCode: 200 };
	}

	async getReviews(_owner: string, _repo: string, _prNumber: number, _etag?: string): Promise<{ data: readonly IGitHubPullRequestReview[] | undefined; statusCode: number; etag?: string }> {
		this.getReviewsCalls++;
		return { data: this.nextReviews, statusCode: 200 };
	}

	async getReviewThreads(_owner: string, _repo: string, _prNumber: number): Promise<IGitHubPullRequestReviewThread[]> {
		this.getReviewThreadsCalls++;
		const result = this.nextThreads;
		await this.getReviewThreadsGate?.p;
		return result;
	}

	async postReviewComment(_owner: string, _repo: string, _prNumber: number, body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		this.postReviewCommentCalls.push({ body, inReplyTo });
		return makeComment(999, body);
	}

	async postIssueComment(_owner: string, _repo: string, _prNumber: number, body: string): Promise<IGitHubPRComment> {
		this.postIssueCommentCalls.push({ body });
		return makeComment(998, body);
	}

	async resolveThread(_owner: string, _repo: string, threadId: string): Promise<void> {
		this.resolveThreadCalls.push({ threadId });
	}
}

class MockCIFetcher {
	nextChecks: IGitHubCICheck[] = [];
	getCheckRunsCalls = 0;
	getCheckRunsGate: DeferredPromise<void> | undefined;

	async getCheckRuns(_owner: string, _repo: string, _ref: string, _etag?: string): Promise<{ data: readonly IGitHubCICheck[] | undefined; statusCode: number; etag?: string }> {
		this.getCheckRunsCalls++;
		const result = this.nextChecks;
		await this.getCheckRunsGate?.p;
		return { data: result, statusCode: 200 };
	}

	async rerunFailedJobs(_owner: string, _repo: string, _runId: number): Promise<void> { }

	async getCheckRunAnnotations(_owner: string, _repo: string, _checkRunId: number): Promise<string> {
		return 'mock annotations';
	}
}

//#endregion

suite('GitHubRepositoryModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockRepositoryFetcher;
	const logService = new NullLogService();

	setup(() => {
		mockFetcher = new MockRepositoryFetcher();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state is undefined', () => {
		const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher as unknown as GitHubRepositoryFetcher, logService));
		assert.strictEqual(model.repository.get(), undefined);
	});

	test('refresh populates repository observable', async () => {
		const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher as unknown as GitHubRepositoryFetcher, logService));
		mockFetcher.nextResult = {
			owner: 'owner',
			name: 'repo',
			fullName: 'owner/repo',
			defaultBranch: 'main',
			isPrivate: false,
			description: 'test',
		};

		await model.refresh();
		assert.deepStrictEqual(model.repository.get(), mockFetcher.nextResult);
	});

	test('refresh shares an in-progress request', async () => {
		const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher as unknown as GitHubRepositoryFetcher, logService));
		mockFetcher.nextResult = makeRepository();
		mockFetcher.getRepositoryGate = new DeferredPromise<void>();

		const firstRefresh = model.refresh();
		const secondRefresh = model.refresh();

		try {
			assert.deepStrictEqual({
				samePromise: firstRefresh === secondRefresh,
				getRepositoryCalls: mockFetcher.getRepositoryCalls,
			}, {
				samePromise: true,
				getRepositoryCalls: 1,
			});
		} finally {
			await mockFetcher.getRepositoryGate.complete(undefined);
		}

		await firstRefresh;
		assert.deepStrictEqual({
			repository: model.repository.get(),
			getRepositoryCalls: mockFetcher.getRepositoryCalls,
		}, {
			repository: mockFetcher.nextResult,
			getRepositoryCalls: 1,
		});
	});

	test('refresh handles errors gracefully', async () => {
		const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher as unknown as GitHubRepositoryFetcher, logService));
		// No nextResult set, will throw
		await model.refresh();
		assert.strictEqual(model.repository.get(), undefined);
	});
});

suite('GitHubPullRequestModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockPRFetcher;
	const logService = new NullLogService();

	setup(() => {
		mockFetcher = new MockPRFetcher();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state has empty observables', () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		assert.strictEqual(model.pullRequest.get(), undefined);
		assert.strictEqual(model.mergeability.get(), undefined);
	});

	test('refresh populates pull request and mergeability without fetching review threads', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextPR = makePR();
		mockFetcher.nextReviews = [];
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];

		await model.refresh();

		assert.deepStrictEqual({
			prNumber: model.pullRequest.get()?.number,
			canMerge: model.mergeability.get()?.canMerge,
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
		}, {
			prNumber: 1,
			canMerge: true,
			getPullRequestCalls: 1,
			getReviewsCalls: 1,
			getReviewThreadsCalls: 0,
		});
	});

	test('refresh shares an in-progress request', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextPR = makePR();
		mockFetcher.nextReviews = [];
		mockFetcher.getPullRequestGate = new DeferredPromise<void>();

		const firstRefresh = model.refresh();
		const secondRefresh = model.refresh();

		try {
			assert.deepStrictEqual({
				samePromise: firstRefresh === secondRefresh,
				getPullRequestCalls: mockFetcher.getPullRequestCalls,
				getReviewsCalls: mockFetcher.getReviewsCalls,
			}, {
				samePromise: true,
				getPullRequestCalls: 1,
				getReviewsCalls: 1,
			});
		} finally {
			await mockFetcher.getPullRequestGate.complete(undefined);
		}

		await firstRefresh;
		assert.deepStrictEqual({
			prNumber: model.pullRequest.get()?.number,
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
		}, {
			prNumber: 1,
			getPullRequestCalls: 1,
			getReviewsCalls: 1,
		});
	});

	test('postIssueComment calls fetcher', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));

		const comment = await model.postIssueComment('Great work!');
		assert.strictEqual(comment.body, 'Great work!');
		assert.strictEqual(mockFetcher.postIssueCommentCalls.length, 1);
	});

	test('polling can be started and stopped', () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		// Just ensure no errors; actual polling behavior is timer-based
		const polling = model.startPolling(60_000);
		polling.dispose();
		polling.dispose();
	});

	test('polling stops when the last client stops polling', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextPR = makePR();
		mockFetcher.nextReviews = [];
		mockFetcher.getPullRequestGate = new DeferredPromise<void>();

		const firstPolling = model.startPolling(10);
		const secondPolling = model.startPolling(1_000);
		firstPolling.dispose();

		await timeout(10);
		assert.deepStrictEqual({
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
		}, {
			getPullRequestCalls: 1,
			getReviewsCalls: 1,
		});

		await mockFetcher.getPullRequestGate.complete(undefined);
		await timeout(0);
		await timeout(60_000);
		assert.deepStrictEqual({
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
		}, {
			getPullRequestCalls: 2,
			getReviewsCalls: 2,
		});

		secondPolling.dispose();
		await timeout(60_000);

		assert.deepStrictEqual({
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
		}, {
			getPullRequestCalls: 2,
			getReviewsCalls: 2,
		});
	}));
});

suite('GitHubPullRequestReviewThreadsModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockPRFetcher;
	const logService = new NullLogService();

	setup(() => {
		mockFetcher = new MockPRFetcher();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state is empty', () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		assert.deepStrictEqual(model.reviewThreads.get(), []);
	});

	test('refresh updates only review threads', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts'), makeThread('thread-200', 'src/b.ts')];

		await model.refresh();

		assert.deepStrictEqual({
			threads: model.reviewThreads.get().map(thread => thread.id),
			getPullRequestCalls: mockFetcher.getPullRequestCalls,
			getReviewsCalls: mockFetcher.getReviewsCalls,
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
		}, {
			threads: ['thread-100', 'thread-200'],
			getPullRequestCalls: 0,
			getReviewsCalls: 0,
			getReviewThreadsCalls: 1,
		});
	});

	test('refresh shares an in-progress request', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];
		mockFetcher.getReviewThreadsGate = new DeferredPromise<void>();

		const firstRefresh = model.refresh();
		const secondRefresh = model.refresh();

		try {
			assert.deepStrictEqual({
				samePromise: firstRefresh === secondRefresh,
				getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
			}, {
				samePromise: true,
				getReviewThreadsCalls: 1,
			});
		} finally {
			await mockFetcher.getReviewThreadsGate.complete(undefined);
		}

		await firstRefresh;
		assert.deepStrictEqual({
			threads: model.reviewThreads.get().map(thread => thread.id),
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
		}, {
			threads: ['thread-100'],
			getReviewThreadsCalls: 1,
		});
	});

	test('postReviewComment calls fetcher and refreshes threads', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];

		const comment = await model.postReviewComment('LGTM', 100);

		assert.deepStrictEqual({
			commentBody: comment.body,
			postReviewCommentCalls: mockFetcher.postReviewCommentCalls,
			threads: model.reviewThreads.get().map(thread => thread.id),
		}, {
			commentBody: 'LGTM',
			postReviewCommentCalls: [{ body: 'LGTM', inReplyTo: 100 }],
			threads: ['thread-100'],
		});
	});

	test('postReviewComment refreshes after an in-progress refresh completes', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];
		mockFetcher.getReviewThreadsGate = new DeferredPromise<void>();

		const inProgressRefresh = model.refresh();
		mockFetcher.nextThreads = [makeThread('thread-200', 'src/b.ts')];
		const comment = model.postReviewComment('LGTM', 100);

		await mockFetcher.getReviewThreadsGate.complete(undefined);
		await inProgressRefresh;
		await comment;

		assert.deepStrictEqual({
			postReviewCommentCalls: mockFetcher.postReviewCommentCalls,
			threads: model.reviewThreads.get().map(thread => thread.id),
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
		}, {
			postReviewCommentCalls: [{ body: 'LGTM', inReplyTo: 100 }],
			threads: ['thread-200'],
			getReviewThreadsCalls: 2,
		});
	});

	test('resolveThread calls fetcher and refreshes threads', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [];

		await model.resolveThread('thread-100');

		assert.deepStrictEqual({
			resolveThreadCalls: mockFetcher.resolveThreadCalls,
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
			threads: model.reviewThreads.get(),
		}, {
			resolveThreadCalls: [{ threadId: 'thread-100' }],
			getReviewThreadsCalls: 1,
			threads: [],
		});
	});

	test('resolveThread refreshes after an in-progress refresh completes', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];
		mockFetcher.getReviewThreadsGate = new DeferredPromise<void>();

		const inProgressRefresh = model.refresh();
		mockFetcher.nextThreads = [];
		const resolveThread = model.resolveThread('thread-100');

		await mockFetcher.getReviewThreadsGate.complete(undefined);
		await inProgressRefresh;
		await resolveThread;

		assert.deepStrictEqual({
			resolveThreadCalls: mockFetcher.resolveThreadCalls,
			threads: model.reviewThreads.get().map(thread => thread.id),
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
		}, {
			resolveThreadCalls: [{ threadId: 'thread-100' }],
			threads: [],
			getReviewThreadsCalls: 2,
		});
	});

	test('polling can be started and stopped', () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		const polling = model.startPolling(60_000);
		polling.dispose();
		polling.dispose();
	});

	test('polling stops when the last client stops polling', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];
		mockFetcher.getReviewThreadsGate = new DeferredPromise<void>();

		const firstPolling = model.startPolling(10);
		const secondPolling = model.startPolling(1_000);
		firstPolling.dispose();

		await timeout(10);
		assert.strictEqual(mockFetcher.getReviewThreadsCalls, 1);

		await mockFetcher.getReviewThreadsGate.complete(undefined);
		await timeout(0);
		await timeout(60_000);
		assert.strictEqual(mockFetcher.getReviewThreadsCalls, 2);

		secondPolling.dispose();
		await timeout(60_000);

		assert.strictEqual(mockFetcher.getReviewThreadsCalls, 2);
	}));
});

suite('GitHubPullRequestCIModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockCIFetcher;
	let collection: TestCIReferenceCollection;
	const logService = new NullLogService();

	function acquireModel(owner: string = 'owner', repo: string = 'repo', prNumber: number = 1, headSha: string = 'abc'): GitHubPullRequestCIModel {
		const ref = collection.acquire(`${owner}/${repo}/${prNumber}/${headSha}`, owner, repo, prNumber, headSha);
		store.add(ref);
		return ref.object;
	}

	setup(() => {
		mockFetcher = new MockCIFetcher();
		collection = new TestCIReferenceCollection(mockFetcher as unknown as GitHubPRCIFetcher, logService);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state is empty', () => {
		const model = acquireModel();
		assert.deepStrictEqual(model.checks.get(), []);
		assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Neutral);
	});

	test('acquiring with the same key returns the same model', () => {
		const first = acquireModel();
		const second = acquireModel();
		assert.strictEqual(first, second);
	});

	test('refresh populates checks and computes overall status', async () => {
		const model = acquireModel();
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
			{ id: 2, name: 'test', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
		];

		await model.refresh();
		assert.strictEqual(model.checks.get().length, 2);
		assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Failure);
	});

	test('refresh shares an in-progress request', async () => {
		const model = acquireModel();
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
		];
		mockFetcher.getCheckRunsGate = new DeferredPromise<void>();

		const firstRefresh = model.refresh();
		const secondRefresh = model.refresh();

		try {
			assert.deepStrictEqual({
				samePromise: firstRefresh === secondRefresh,
				getCheckRunsCalls: mockFetcher.getCheckRunsCalls,
			}, {
				samePromise: true,
				getCheckRunsCalls: 1,
			});
		} finally {
			await mockFetcher.getCheckRunsGate.complete(undefined);
		}

		await firstRefresh;
		assert.deepStrictEqual({
			checks: model.checks.get().map(check => check.id),
			getCheckRunsCalls: mockFetcher.getCheckRunsCalls,
		}, {
			checks: [1],
			getCheckRunsCalls: 1,
		});
	});

	test('getCheckRunAnnotations delegates to fetcher', async () => {
		const model = acquireModel();
		const result = await model.getCheckRunAnnotations(1);
		assert.strictEqual(result, 'mock annotations');
	});

	test('rerunFailedCheck refreshes after an in-progress refresh completes', async () => {
		const model = acquireModel();
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: 'https://github.com/owner/repo/actions/runs/12345/job/67890' },
		];
		mockFetcher.getCheckRunsGate = new DeferredPromise<void>();

		const inProgressRefresh = model.refresh();
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: 'https://github.com/owner/repo/actions/runs/12345/job/67890' },
		];
		const rerun = model.rerunFailedCheck({ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: 'https://github.com/owner/repo/actions/runs/12345/job/67890' });

		await mockFetcher.getCheckRunsGate.complete(undefined);
		await inProgressRefresh;
		await rerun;

		assert.deepStrictEqual({
			checks: model.checks.get().map(check => check.conclusion),
			getCheckRunsCalls: mockFetcher.getCheckRunsCalls,
		}, {
			checks: [GitHubCheckConclusion.Success],
			getCheckRunsCalls: 2,
		});
	});

	test('polling stops when the last client stops polling', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = acquireModel();
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
		];
		mockFetcher.getCheckRunsGate = new DeferredPromise<void>();

		const firstPolling = model.startPolling(10);
		const secondPolling = model.startPolling(1_000);
		firstPolling.dispose();

		await timeout(10);
		assert.strictEqual(mockFetcher.getCheckRunsCalls, 1);

		await mockFetcher.getCheckRunsGate.complete(undefined);
		await timeout(0);
		await timeout(60_000);
		assert.strictEqual(mockFetcher.getCheckRunsCalls, 2);

		secondPolling.dispose();
		await timeout(60_000);

		assert.strictEqual(mockFetcher.getCheckRunsCalls, 2);
	}));
});

suite('parseWorkflowRunId', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('extracts run ID from GitHub Actions URL', () => {
		assert.strictEqual(
			parseWorkflowRunId('https://github.com/microsoft/vscode/actions/runs/12345/job/67890'),
			12345,
		);
	});

	test('extracts run ID from URL without job segment', () => {
		assert.strictEqual(
			parseWorkflowRunId('https://github.com/owner/repo/actions/runs/99999'),
			99999,
		);
	});

	test('returns undefined for non-Actions URL', () => {
		assert.strictEqual(parseWorkflowRunId('https://example.com/check/1'), undefined);
	});

	test('returns undefined for undefined input', () => {
		assert.strictEqual(parseWorkflowRunId(undefined), undefined);
	});
});


//#region Test Helpers

class TestCIReferenceCollection extends GitHubPullRequestCIModelReferenceCollection {
	constructor(
		private readonly _testFetcher: GitHubPRCIFetcher,
		logService: ILogService,
	) {
		// The base constructor instantiates a fetcher from the apiClient; pass a
		// dummy because we override createReferencedObject below to inject the
		// test fetcher instead.
		super(undefined as never, logService);
	}

	protected override createReferencedObject(_key: string, owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel {
		return new GitHubPullRequestCIModel(owner, repo, prNumber, headSha, this._testFetcher, new NullLogService());
	}
}

function makeRepository(): IGitHubRepository {
	return {
		owner: 'owner',
		name: 'repo',
		fullName: 'owner/repo',
		defaultBranch: 'main',
		isPrivate: false,
		description: 'test',
	};
}

function makePR(): IGitHubPullRequest {
	return {
		number: 1,
		title: 'Test PR',
		body: 'Test body',
		state: GitHubPullRequestState.Open,
		author: { login: 'author', avatarUrl: '' },
		headRef: 'feature',
		headSha: 'abc123',
		baseRef: 'main',
		isDraft: false,
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-02T00:00:00Z',
		mergedAt: undefined,
		mergeable: true,
		mergeableState: 'clean',
	};
}

function makeThread(id: string, path: string): IGitHubPullRequestReviewThread {
	return {
		id,
		isResolved: false,
		path,
		line: 10,
		comments: [makeComment(100, `Comment on ${path}`, id)],
	};
}

function makeComment(id: number, body: string, threadId: string = String(id)): IGitHubPRComment {
	return {
		id,
		body,
		author: { login: 'reviewer', avatarUrl: '' },
		createdAt: '2024-01-01T00:00:00Z',
		updatedAt: '2024-01-01T00:00:00Z',
		path: undefined,
		line: undefined,
		threadId,
		inReplyToId: undefined,
	};
}

//#endregion
