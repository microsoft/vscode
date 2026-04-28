/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { GitHubPullRequestModel } from '../../browser/models/githubPullRequestModel.js';
import { GitHubPullRequestCIModel, parseWorkflowRunId } from '../../browser/models/githubPullRequestCIModel.js';
import { GitHubRepositoryModel } from '../../browser/models/githubRepositoryModel.js';
import { GitHubPRFetcher } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher } from '../../browser/fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryFetcher } from '../../browser/fetchers/githubRepositoryFetcher.js';
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubPullRequestState, IGitHubCICheck, IGitHubPRComment, IGitHubPullRequestReview, IGitHubPullRequest, IGitHubRepository, IGitHubPullRequestReviewThread } from '../../common/types.js';

//#region Mock Fetchers

class MockRepositoryFetcher {
	nextResult: IGitHubRepository | undefined;

	async getRepository(_owner: string, _repo: string, _etag?: string): Promise<{ data: IGitHubRepository | undefined; statusCode: number; etag?: string }> {
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
	postReviewCommentCalls: { body: string; inReplyTo: number }[] = [];
	postIssueCommentCalls: { body: string }[] = [];

	async getPullRequest(_owner: string, _repo: string, _prNumber: number, _etag?: string): Promise<{ data: IGitHubPullRequest | undefined; statusCode: number; etag?: string }> {
		if (!this.nextPR) {
			throw new Error('No mock PR');
		}
		return { data: this.nextPR, statusCode: 200 };
	}

	async getReviews(_owner: string, _repo: string, _prNumber: number, _etag?: string): Promise<{ data: readonly IGitHubPullRequestReview[] | undefined; statusCode: number; etag?: string }> {
		return { data: this.nextReviews, statusCode: 200 };
	}

	async getReviewThreads(_owner: string, _repo: string, _prNumber: number): Promise<IGitHubPullRequestReviewThread[]> {
		return this.nextThreads;
	}

	async postReviewComment(_owner: string, _repo: string, _prNumber: number, body: string, inReplyTo: number): Promise<IGitHubPRComment> {
		this.postReviewCommentCalls.push({ body, inReplyTo });
		return makeComment(999, body);
	}

	async postIssueComment(_owner: string, _repo: string, _prNumber: number, body: string): Promise<IGitHubPRComment> {
		this.postIssueCommentCalls.push({ body });
		return makeComment(998, body);
	}

	async resolveThread(): Promise<void> {
		throw new Error('Not implemented');
	}
}

class MockCIFetcher {
	nextChecks: IGitHubCICheck[] = [];

	async getCheckRuns(_owner: string, _repo: string, _ref: string, _etag?: string): Promise<{ data: readonly IGitHubCICheck[] | undefined; statusCode: number; etag?: string }> {
		return { data: this.nextChecks, statusCode: 200 };
	}

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
		assert.deepStrictEqual(model.reviewThreads.get(), []);
	});

	test('refresh populates all observables', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextPR = makePR();
		mockFetcher.nextReviews = [];
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];

		await model.refresh();
		assert.strictEqual(model.pullRequest.get()?.number, 1);
		assert.strictEqual(model.mergeability.get()?.canMerge, true);
		assert.strictEqual(model.reviewThreads.get().length, 1);
	});

	test('refreshThreads only updates threads', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts'), makeThread('thread-200', 'src/b.ts')];

		await model.refreshThreads();
		assert.strictEqual(model.pullRequest.get(), undefined); // not refreshed
		assert.strictEqual(model.reviewThreads.get().length, 2);
	});

	test('postReviewComment calls fetcher and refreshes threads', async () => {
		const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher as unknown as GitHubPRFetcher, logService));
		mockFetcher.nextThreads = [];

		const comment = await model.postReviewComment('LGTM', 100);
		assert.strictEqual(comment.body, 'LGTM');
		assert.strictEqual(mockFetcher.postReviewCommentCalls.length, 1);
		assert.strictEqual(mockFetcher.postReviewCommentCalls[0].body, 'LGTM');
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
		model.startPolling(60_000);
		model.stopPolling();
	});
});

suite('GitHubPullRequestCIModel', () => {

	const store = new DisposableStore();
	let mockFetcher: MockCIFetcher;
	const logService = new NullLogService();

	setup(() => {
		mockFetcher = new MockCIFetcher();
	});

	teardown(() => store.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initial state is empty', () => {
		const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher as unknown as GitHubPRCIFetcher, logService));
		assert.deepStrictEqual(model.checks.get(), []);
		assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Neutral);
	});

	test('refresh populates checks and computes overall status', async () => {
		const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher as unknown as GitHubPRCIFetcher, logService));
		mockFetcher.nextChecks = [
			{ id: 1, name: 'build', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
			{ id: 2, name: 'test', status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
		];

		await model.refresh();
		assert.strictEqual(model.checks.get().length, 2);
		assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Failure);
	});

	test('getCheckRunAnnotations delegates to fetcher', async () => {
		const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher as unknown as GitHubPRCIFetcher, logService));
		const result = await model.getCheckRunAnnotations(1);
		assert.strictEqual(result, 'mock annotations');
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
