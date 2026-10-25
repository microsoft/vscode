/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { IGitHubAccountClient } from '../../../../../platform/github/common/account/account.js';
import { ApiRequestOptions } from '../../../../../platform/github/common/client/request.js';
import { RequestPriority } from '../../../../../platform/github/common/types.js';
import { Issue } from '../../../../../platform/github/common/core/issues.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestReviewThreadsModel } from '../../browser/models/githubPullRequestReviewThreadsModel.js';
import { GitHubPullRequestCIModel, GitHubPullRequestCIModelReferenceCollection, parseWorkflowRunId } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubIssueModelReferenceCollection, MIN_REFRESH_INTERVAL_MS } from '../../browser/models/githubIssueModel.js';
import { GitHubApiClient } from '../../browser/githubApiClient.js';
import { GitHubPRFetcher } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from '../../browser/fetchers/githubPRCIFetcher.js';
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubIssueState, GitHubPullRequestState, IGitHubCICheck, IGitHubPRComment, IGitHubPullRequestReview, IGitHubPullRequest, IGitHubPullRequestReviewThread } from '../../common/types.js';
import { getHighestPriorityPullRequestIcon } from '../../../../services/sessions/common/session.js';
import { PullRequestIconCache } from '../../browser/pullRequestIconCache.js';

//#region Mock Fetchers

class MockPRFetcher extends mock<GitHubPRFetcher>() {
	override readonly client = upcastPartial<GitHubApiClient>({ onDidChange: Event.None, generation: 0 });
	readonly priorities: RequestPriority[] = [];
	nextPR: IGitHubPullRequest | undefined;
	nextReviews: IGitHubPullRequestReview[] = [];
	nextThreads: IGitHubPullRequestReviewThread[] = [];
	getPullRequestCalls = 0;
	getReviewsCalls = 0;
	getReviewThreadsCalls = 0;
	getPullRequestGate: DeferredPromise<void> | undefined;
	getReviewThreadsGate: DeferredPromise<void> | undefined;
	postReviewCommentCalls: { body: string; inReplyTo: number }[] = [];
	postPullRequestReviewCommentCalls: { body: string; commitId: string; path: string; startLine: number | undefined; line: number; pendingReview: Pick<IGitHubPullRequestReview, 'id' | 'nodeId'> | undefined }[] = [];
	postIssueCommentCalls: { body: string }[] = [];
	resolveThreadCalls: { threadId: string }[] = [];

	override async getPullRequest(_owner: string, _repo: string, _prNumber: number, _token?: CancellationToken, options?: ApiRequestOptions): Promise<IGitHubPullRequest> {
		this.getPullRequestCalls++;
		this.priorities.push(options?.priority ?? 'interactive');
		const result = this.nextPR;
		await this.getPullRequestGate?.p;
		if (!result) {
			throw new Error('No mock PR');
		}
		return result;
	}

	override async getReviews(_owner: string, _repo: string, _prNumber: number, _token?: CancellationToken, options?: ApiRequestOptions): Promise<readonly IGitHubPullRequestReview[]> {
		this.getReviewsCalls++;
		this.priorities.push(options?.priority ?? 'interactive');
		return this.nextReviews;
	}

	override async getReviewThreads(_owner: string, _repo: string, _prNumber: number, _token?: CancellationToken, options?: ApiRequestOptions): Promise<IGitHubPullRequestReviewThread[]> {
		this.getReviewThreadsCalls++;
		this.priorities.push(options?.priority ?? 'interactive');
		const result = this.nextThreads;
		await this.getReviewThreadsGate?.p;
		return result;
	}

	override async postReviewComment(_owner: string, _repo: string, _prNumber: number, body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		this.postReviewCommentCalls.push({ body, inReplyTo });
		return makeComment(999, body);
	}

	override async postPullRequestReviewComment(_owner: string, _repo: string, _prNumber: number, body: string, commitId: string, path: string, line: number, startLine: number | undefined, pendingReview?: Pick<IGitHubPullRequestReview, 'id' | 'nodeId'>): Promise<void> {
		this.postPullRequestReviewCommentCalls.push({ body, commitId, path, startLine, line, pendingReview });
	}

	override async postIssueComment(_owner: string, _repo: string, _prNumber: number, body: string): Promise<IGitHubPRComment> {
		this.postIssueCommentCalls.push({ body });
		return makeComment(998, body);
	}

	override async resolveThread(_owner: string, _repo: string, threadId: string): Promise<void> {
		this.resolveThreadCalls.push({ threadId });
	}
}

class MockCIFetcher extends mock<GitHubPRCIFetcher>() {
	override readonly client = upcastPartial<GitHubApiClient>({ onDidChange: Event.None, generation: 0 });
	readonly priorities: RequestPriority[] = [];
	nextChecks: IGitHubCICheck[] = [];
	getCheckRunsCalls = 0;
	getCheckRunsGate: DeferredPromise<void> | undefined;

	override async getCheckRuns(_owner: string, _repo: string, _ref: string, _token?: CancellationToken, options?: ApiRequestOptions): Promise<readonly IGitHubCICheck[]> {
		this.getCheckRunsCalls++;
		this.priorities.push(options?.priority ?? 'interactive');
		const result = this.nextChecks;
		await this.getCheckRunsGate?.p;
		return result;
	}

	override async rerunFailedJobs(_owner: string, _repo: string, _runId: number): Promise<void> { }

	override async getCheckRunAnnotations(_owner: string, _repo: string, _checkRunId: number): Promise<string> {
		return 'mock annotations';
	}
}

//#endregion

suite('Pull Request Icons', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the highest-priority icon across pull requests', () => {
		const closed = computePullRequestIcon(GitHubPullRequestState.Closed);
		const merged = computePullRequestIcon(GitHubPullRequestState.Merged);
		const draft = computePullRequestIcon('draft');
		const open = computePullRequestIcon(GitHubPullRequestState.Open);
		const comments = computePullRequestIcon(GitHubPullRequestState.Open, { hasUnresolvedComments: true });
		const failing = computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true });

		assert.deepStrictEqual([
			getHighestPriorityPullRequestIcon([closed, merged]),
			getHighestPriorityPullRequestIcon([draft, merged, closed]),
			getHighestPriorityPullRequestIcon([open, draft]),
			getHighestPriorityPullRequestIcon([comments, open]),
			getHighestPriorityPullRequestIcon([comments, failing, open]),
			getHighestPriorityPullRequestIcon([merged, undefined]),
		], [merged, draft, open, comments, failing, merged]);
	});
});

suite('GitHubPullRequestModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockPRFetcher;
	const logService = new NullLogService();
	let iconCache: PullRequestIconCache;

	setup(() => {
		mockFetcher = new MockPRFetcher();
		iconCache = new PullRequestIconCache(store.add(new TestStorageService()));
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('foreground refresh upgrades background work without publishing an older response', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService, iconCache));
		const gate = new DeferredPromise<void>();
		mockFetcher.nextPR = { ...makePR(), title: 'Older' };
		mockFetcher.getPullRequestGate = gate;
		const background = model.refresh({ priority: 'background' });
		mockFetcher.getPullRequestGate = undefined;
		mockFetcher.nextPR = { ...makePR(), title: 'Foreground' };
		const foreground = model.refresh();
		const joined = model.refresh({ priority: 'visible' });
		await foreground;
		await gate.complete();
		await background;
		assert.deepStrictEqual({ shared: joined === foreground, title: model.pullRequest.get()?.title, priorities: mockFetcher.priorities }, {
			shared: true, title: 'Foreground', priorities: ['background', 'background', 'interactive', 'interactive'],
		});
	});

	test('periodic PR refreshes use background priority', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService, iconCache));
		mockFetcher.nextPR = makePR();
		await model.refresh({ priority: 'visible' });
		store.add(model.startPolling(10));
		await timeout(10);
		assert.deepStrictEqual(mockFetcher.priorities, ['visible', 'visible', 'background', 'background']);
	}));

	test('initial state has empty observables', () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
		assert.strictEqual(model.pullRequest.get(), undefined);
		assert.strictEqual(model.mergeability.get(), undefined);
	});

	test('records successful PR state without requiring a presentation observer', async () => {
		const storage = store.add(new TestStorageService());
		const cache = new PullRequestIconCache(storage);
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService, cache));
		mockFetcher.nextPR = { ...makePR(), state: GitHubPullRequestState.Merged };
		await model.refresh();
		const restored = new PullRequestIconCache(storage);
		assert.deepStrictEqual({
			state: restored.getState('https://github.com/owner/repo/pull/1')?.state,
			icon: restored.get('https://github.com/owner/repo/pull/1'),
		}, { state: GitHubPullRequestState.Merged, icon: computePullRequestIcon(GitHubPullRequestState.Merged) });
	});

	test('does not publish an open response for an observed merged PR after restart', async () => {
		iconCache.setState('https://github.com/owner/repo/pull/1', { state: GitHubPullRequestState.Merged, isDraft: false });
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService, iconCache));
		mockFetcher.nextPR = makePR();
		await model.refresh();
		assert.deepStrictEqual({
			liveState: model.pullRequest.get(),
			cachedState: iconCache.getState('https://github.com/owner/repo/pull/1')?.state,
		}, { liveState: undefined, cachedState: GitHubPullRequestState.Merged });
	});

	test('refreshes immediately on client restoration and discards the previous account response', async () => {
		const changed = store.add(new Emitter<void>());
		let generation = 0;
		const fetcher = new class extends MockPRFetcher {
			override readonly client = upcastPartial<GitHubApiClient>({ onDidChange: changed.event, get generation() { return generation; } });
		}();
		const gate = new DeferredPromise<void>();
		fetcher.nextPR = makePR();
		fetcher.getPullRequestGate = gate;
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, fetcher, logService, iconCache));
		const previous = model.refresh({ priority: 'background' });
		fetcher.getPullRequestGate = undefined;
		fetcher.nextPR = { ...makePR(), state: GitHubPullRequestState.Merged };
		generation++;
		changed.fire();
		await model.refresh({ priority: 'background' });
		await gate.complete();
		await previous;
		assert.deepStrictEqual({
			requests: fetcher.getPullRequestCalls, state: model.pullRequest.get()?.state,
			cachedState: iconCache.getState('https://github.com/owner/repo/pull/1')?.state,
		}, { requests: 2, state: GitHubPullRequestState.Merged, cachedState: GitHubPullRequestState.Merged });
	});

	test('refresh populates pull request and mergeability without fetching review threads', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
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
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
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
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));

		const comment = await model.postIssueComment('Great work!');
		assert.strictEqual(comment.body, 'Great work!');
		assert.strictEqual(mockFetcher.postIssueCommentCalls.length, 1);
	});

	test('postReviewComment uses the pull request head and selected line', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
		mockFetcher.nextPR = makePR();
		mockFetcher.nextReviews = [];

		await model.postReviewComment('Please update this.', 'abc123', 'src/a.ts', 12, 10);

		assert.deepStrictEqual(mockFetcher.postPullRequestReviewCommentCalls, [
			{ body: 'Please update this.', commitId: 'abc123', path: 'src/a.ts', startLine: 10, line: 12, pendingReview: undefined }
		]);
	});

	test('polling can be started and stopped', () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
		// Just ensure no errors; actual polling behavior is timer-based
		const polling = model.startPolling(60_000);
		polling.dispose();
		polling.dispose();
	});

	test('polling stops when the last client stops polling', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService, iconCache));
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

	test('foreground thread refresh upgrades a poll and ignores its late response', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher, logService));
		const gate = new DeferredPromise<void>();
		mockFetcher.nextThreads = [makeThread('older', 'old.ts')];
		mockFetcher.getReviewThreadsGate = gate;
		const background = model.refresh(false, { priority: 'background' });
		mockFetcher.getReviewThreadsGate = undefined;
		mockFetcher.nextThreads = [makeThread('foreground', 'new.ts')];
		const foreground = model.refresh();
		const joined = model.refresh(false, { priority: 'visible' });
		await foreground;
		await gate.complete();
		await background;
		assert.deepStrictEqual({ shared: joined === foreground, threads: model.reviewThreads.get().map(thread => thread.id), priorities: mockFetcher.priorities }, {
			shared: true, threads: ['foreground'], priorities: ['background', 'interactive'],
		});
	});

	test('periodic thread refreshes use background priority', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher, logService));
		await model.refresh(false, { priority: 'visible' });
		store.add(model.startPolling(10));
		await timeout(10);
		assert.deepStrictEqual(mockFetcher.priorities, ['visible', 'background']);
	}));

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

		const inProgressRefresh = model.refresh(false, { priority: 'background' });
		mockFetcher.nextThreads = [makeThread('thread-200', 'src/b.ts')];
		const comment = model.postReviewComment('LGTM', 100);

		await mockFetcher.getReviewThreadsGate.complete(undefined);
		await inProgressRefresh;
		await comment;

		assert.deepStrictEqual({
			postReviewCommentCalls: mockFetcher.postReviewCommentCalls,
			threads: model.reviewThreads.get().map(thread => thread.id),
			getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
			priorities: mockFetcher.priorities,
		}, {
			postReviewCommentCalls: [{ body: 'LGTM', inReplyTo: 100 }],
			threads: ['thread-200'],
			getReviewThreadsCalls: 3,
			priorities: ['background', 'interactive', 'interactive'],
		});
	});

	test('background polling joins a forced foreground refresh', async () => {
		const model = store.add(new GitHubPullRequestReviewThreadsModel('owner', 'repo', 1, mockFetcher, logService));
		mockFetcher.nextThreads = [makeThread('fresh', 'src/a.ts')];
		mockFetcher.getReviewThreadsGate = new DeferredPromise<void>();
		const forced = model.refresh(true);
		mockFetcher.nextThreads = [];
		const poll = model.refresh(false, { priority: 'background' });
		await mockFetcher.getReviewThreadsGate.complete();
		await Promise.all([forced, poll]);
		assert.deepStrictEqual({
			shared: forced === poll,
			priorities: mockFetcher.priorities,
			threads: model.reviewThreads.get().map(thread => thread.id),
		}, {
			shared: true,
			priorities: ['interactive'],
			threads: ['fresh'],
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
	let storageService: TestStorageService;
	const logService = new NullLogService();

	function acquireModel(owner: string = 'owner', repo: string = 'repo', prNumber: number = 1, headSha: string = 'abc'): GitHubPullRequestCIModel {
		const ref = collection.acquire(`${owner}/${repo}/${prNumber}/${headSha}`, owner, repo, prNumber, headSha);
		store.add(ref);
		return ref.object;
	}

	setup(() => {
		mockFetcher = new MockCIFetcher();
		storageService = store.add(new TestStorageService());
		collection = new TestCIReferenceCollection(mockFetcher as unknown as GitHubPRCIFetcher, logService, storageService);
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('foreground CI refresh upgrades a poll and ignores its late response', async () => {
		const model = acquireModel();
		const gate = new DeferredPromise<void>();
		mockFetcher.nextChecks = [{
			id: 1, name: 'Build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure,
			startedAt: undefined, completedAt: undefined, detailsUrl: undefined,
		}];
		mockFetcher.getCheckRunsGate = gate;
		const background = model.refresh(false, { priority: 'background' });
		mockFetcher.getCheckRunsGate = undefined;
		mockFetcher.nextChecks = [];
		const foreground = model.refresh();
		const joined = model.refresh(false, { priority: 'visible' });
		await foreground;
		await gate.complete();
		await background;
		assert.deepStrictEqual({ shared: joined === foreground, checks: model.checks.get(), priorities: mockFetcher.priorities }, {
			shared: true, checks: [], priorities: ['background', 'interactive'],
		});
	});

	test('periodic CI refreshes use background priority', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const model = acquireModel();
		await model.refresh(false, { priority: 'visible' });
		store.add(model.startPolling(10));
		await timeout(10);
		assert.deepStrictEqual(mockFetcher.priorities, ['visible', 'background']);
	}));

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

	test('fixRequested is remembered per PR head commit', () => {
		const model = acquireModel('owner', 'repo', 1, 'sha-1');
		assert.strictEqual(model.fixRequested.get(), false);

		model.markFixRequested();
		assert.strictEqual(model.fixRequested.get(), true);

		// A brand-new model instance for the same PR head commit reloads the
		// remembered fix from storage (construct directly to bypass the
		// reference collection's instance cache).
		const reloadedSameCommit = store.add(new GitHubPullRequestCIModel('owner', 'repo', 1, 'sha-1', mockFetcher as unknown as GitHubPRCIFetcher, logService, storageService));
		assert.strictEqual(reloadedSameCommit.fixRequested.get(), true);

		// A new commit on the same PR: the fix should no longer be remembered.
		const newCommit = store.add(new GitHubPullRequestCIModel('owner', 'repo', 1, 'sha-2', mockFetcher as unknown as GitHubPRCIFetcher, logService, storageService));
		assert.strictEqual(newCommit.fixRequested.get(), false);
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

		const inProgressRefresh = model.refresh(false, { priority: 'background' });
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
			priorities: mockFetcher.priorities,
		}, {
			checks: [GitHubCheckConclusion.Success],
			getCheckRunsCalls: 3,
			priorities: ['background', 'interactive', 'interactive'],
		});
	});

	test('background polling joins a forced foreground refresh', async () => {
		const model = acquireModel();
		mockFetcher.getCheckRunsGate = new DeferredPromise<void>();
		const forced = model.refresh(true);
		const poll = model.refresh(false, { priority: 'background' });
		await mockFetcher.getCheckRunsGate.complete();
		await Promise.all([forced, poll]);
		assert.deepStrictEqual({ shared: forced === poll, priorities: mockFetcher.priorities }, {
			shared: true,
			priorities: ['interactive'],
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

suite('GitHubIssueModel', () => {

	const store = new DisposableStore();
	const logService = new NullLogService();

	class MockGitHubApiClient extends mock<GitHubApiClient>() {
		constructor(override readonly onDidChange = Event.None) { super(); }
		override get generation() { return 0; }
		calls = 0;
		readonly responses: Issue[] = [];
		readonly priorities: RequestPriority[] = [];
		gate: DeferredPromise<void> | undefined;
		private previous: Issue | undefined;

		override async withClient<T>(task: (client: IGitHubAccountClient, signal: AbortSignal) => Promise<T>): Promise<T> {
			const issues = upcastPartial<IGitHubAccountClient['issues']>({
				get: async (_repository, _number, _signal, options) => {
					this.calls++;
					this.priorities.push(options?.priority ?? 'interactive');
					this.previous = this.responses.shift() ?? this.previous;
					assert.ok(this.previous);
					const response = this.previous;
					await this.gate?.p;
					return response;
				},
			});
			return task(upcastPartial<IGitHubAccountClient>({ issues }), new AbortController().signal);
		}
	}

	function issueResponse(state: 'open' | 'closed', title: string) {
		return upcastPartial<Issue>({
			number: 7,
			title,
			body: 'body',
			state,
			state_reason: state === 'closed' ? 'completed' : null,
			user: null,
			created_at: '2026-01-01T00:00:00Z',
			updated_at: '2026-01-02T00:00:00Z',
			closed_at: null,
		});
	}

	function createCollection(client: MockGitHubApiClient) {
		return store.add(new GitHubIssueModelReferenceCollection(client, logService));
	}

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('foreground issue refresh upgrades background work without publishing its late response', async () => {
		const client = new MockGitHubApiClient();
		client.responses.push(issueResponse('open', 'Older'), issueResponse('closed', 'Foreground'));
		const model = store.add(createCollection(client).acquire('owner/repo/issues/7', 'owner', 'repo', 7)).object;
		const gate = client.gate = new DeferredPromise<void>();
		const background = model.refresh({ priority: 'background' });
		client.gate = undefined;
		const foreground = model.refresh();
		const joined = model.refresh({ priority: 'visible' });
		await foreground;
		await gate.complete();
		await background;
		assert.deepStrictEqual({ shared: joined === foreground, title: model.issue.get()?.title, priorities: client.priorities }, {
			shared: true, title: 'Foreground', priorities: ['background', 'interactive'],
		});
	});

	test('periodic issue refreshes use background priority', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const client = new MockGitHubApiClient();
		client.responses.push(issueResponse('open', 'Issue'));
		const model = store.add(createCollection(client).acquire('owner/repo/issues/7', 'owner', 'repo', 7)).object;
		await model.refresh({ priority: 'visible' });
		store.add(model.startPolling(10));
		await timeout(10);
		assert.deepStrictEqual(client.priorities, ['visible', 'background']);
	}));

	test('revalidates after the freshness interval and preserves unchanged display data', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const client = new MockGitHubApiClient();
		client.responses.push(issueResponse('open', 'Original'));
		const collection = createCollection(client);
		const reference = store.add(collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7));

		await reference.object.refresh();
		await timeout(MIN_REFRESH_INTERVAL_MS);
		await reference.object.refresh();

		assert.deepStrictEqual({
			calls: client.calls,
			title: reference.object.issue.get()?.title,
		}, {
			calls: 2,
			title: 'Original',
		});
	}));

	test('on-demand refreshes inside the debounce window collapse into one request', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const client = new MockGitHubApiClient();
		client.responses.push(issueResponse('open', 'Original'));
		const collection = createCollection(client);
		const reference = store.add(collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7));

		await reference.object.refresh();
		await timeout(MIN_REFRESH_INTERVAL_MS - 1);
		await reference.object.refresh();

		assert.strictEqual(client.calls, 1);
	}));

	test('a re-created model starts from the previous display state and freshness', () => runWithFakedTimers<void>({ useFakeTimers: true }, async () => {
		const client = new MockGitHubApiClient();
		client.responses.push(issueResponse('open', 'Original'));
		client.responses.push(issueResponse('closed', 'Original'));
		const collection = createCollection(client);

		const first = collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7);
		await first.object.refresh();
		first.dispose();

		const second = store.add(collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7));
		const restoredState = second.object.issue.get()?.state;
		await timeout(MIN_REFRESH_INTERVAL_MS);
		await second.object.refresh();

		assert.deepStrictEqual({
			restoredState,
			calls: client.calls,
			state: second.object.issue.get()?.state,
		}, {
			restoredState: GitHubIssueState.Open,
			calls: 2,
			state: GitHubIssueState.Closed,
		});
	}));

	test('account changes discard cached issue snapshots', async () => {
		const changed = store.add(new Emitter<void>());
		const client = new MockGitHubApiClient(changed.event);
		client.responses.push(issueResponse('open', 'Previous account'));
		const collection = createCollection(client);
		const first = collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7);
		await first.object.refresh();
		first.dispose();
		changed.fire();
		const next = store.add(collection.acquire('owner/repo/issues/7', 'owner', 'repo', 7));
		assert.strictEqual(next.object.issue.get(), undefined);
	});
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
		private readonly _testStorageService: IStorageService,
	) {
		// The base constructor instantiates a fetcher from the apiClient; pass a
		// dummy because we override createReferencedObject below to inject the
		// test fetcher instead.
		super(undefined as never, logService, _testStorageService);
	}

	protected override createReferencedObject(_key: string, owner: string, repo: string, prNumber: number, headSha: string): GitHubPullRequestCIModel {
		return new GitHubPullRequestCIModel(owner, repo, prNumber, headSha, this._testFetcher, new NullLogService(), this._testStorageService);
	}
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
		startLine: undefined,
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
