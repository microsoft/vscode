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
//#region Mock Fetchers
class MockRepositoryFetcher {
    async getRepository(_owner, _repo) {
        if (!this.nextResult) {
            throw new Error('No mock result');
        }
        return this.nextResult;
    }
}
class MockPRFetcher {
    constructor() {
        this.nextThreads = [];
        this.postReviewCommentCalls = [];
        this.postIssueCommentCalls = [];
    }
    async getPullRequest(_owner, _repo, _prNumber) {
        if (!this.nextPR) {
            throw new Error('No mock PR');
        }
        return this.nextPR;
    }
    async getMergeability(_owner, _repo, _prNumber) {
        if (!this.nextMergeability) {
            throw new Error('No mock mergeability');
        }
        return this.nextMergeability;
    }
    async getReviewThreads(_owner, _repo, _prNumber) {
        return this.nextThreads;
    }
    async postReviewComment(_owner, _repo, _prNumber, body, inReplyTo) {
        this.postReviewCommentCalls.push({ body, inReplyTo });
        return makeComment(999, body);
    }
    async postIssueComment(_owner, _repo, _prNumber, body) {
        this.postIssueCommentCalls.push({ body });
        return makeComment(998, body);
    }
    async resolveThread() {
        throw new Error('Not implemented');
    }
}
class MockCIFetcher {
    constructor() {
        this.nextChecks = [];
    }
    async getCheckRuns(_owner, _repo, _ref) {
        return this.nextChecks;
    }
    async getCheckRunAnnotations(_owner, _repo, _checkRunId) {
        return 'mock annotations';
    }
}
//#endregion
suite('GitHubRepositoryModel', () => {
    const store = new DisposableStore();
    let mockFetcher;
    const logService = new NullLogService();
    setup(() => {
        mockFetcher = new MockRepositoryFetcher();
    });
    teardown(() => store.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('initial state is undefined', () => {
        const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher, logService));
        assert.strictEqual(model.repository.get(), undefined);
    });
    test('refresh populates repository observable', async () => {
        const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher, logService));
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
        const model = store.add(new GitHubRepositoryModel('owner', 'repo', mockFetcher, logService));
        // No nextResult set, will throw
        await model.refresh();
        assert.strictEqual(model.repository.get(), undefined);
    });
});
suite('GitHubPullRequestModel', () => {
    const store = new DisposableStore();
    let mockFetcher;
    const logService = new NullLogService();
    setup(() => {
        mockFetcher = new MockPRFetcher();
    });
    teardown(() => store.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('initial state has empty observables', () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        assert.strictEqual(model.pullRequest.get(), undefined);
        assert.strictEqual(model.mergeability.get(), undefined);
        assert.deepStrictEqual(model.reviewThreads.get(), []);
    });
    test('refresh populates all observables', async () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        mockFetcher.nextPR = makePR();
        mockFetcher.nextMergeability = { canMerge: true, blockers: [] };
        mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts')];
        await model.refresh();
        assert.strictEqual(model.pullRequest.get()?.number, 1);
        assert.strictEqual(model.mergeability.get()?.canMerge, true);
        assert.strictEqual(model.reviewThreads.get().length, 1);
    });
    test('refreshThreads only updates threads', async () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        mockFetcher.nextThreads = [makeThread('thread-100', 'src/a.ts'), makeThread('thread-200', 'src/b.ts')];
        await model.refreshThreads();
        assert.strictEqual(model.pullRequest.get(), undefined); // not refreshed
        assert.strictEqual(model.reviewThreads.get().length, 2);
    });
    test('postReviewComment calls fetcher and refreshes threads', async () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        mockFetcher.nextThreads = [];
        const comment = await model.postReviewComment('LGTM', 100);
        assert.strictEqual(comment.body, 'LGTM');
        assert.strictEqual(mockFetcher.postReviewCommentCalls.length, 1);
        assert.strictEqual(mockFetcher.postReviewCommentCalls[0].body, 'LGTM');
    });
    test('postIssueComment calls fetcher', async () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        const comment = await model.postIssueComment('Great work!');
        assert.strictEqual(comment.body, 'Great work!');
        assert.strictEqual(mockFetcher.postIssueCommentCalls.length, 1);
    });
    test('polling can be started and stopped', () => {
        const model = store.add(new GitHubPullRequestModel('owner', 'repo', 1, mockFetcher, logService));
        // Just ensure no errors; actual polling behavior is timer-based
        model.startPolling(60_000);
        model.stopPolling();
    });
});
suite('GitHubPullRequestCIModel', () => {
    const store = new DisposableStore();
    let mockFetcher;
    const logService = new NullLogService();
    setup(() => {
        mockFetcher = new MockCIFetcher();
    });
    teardown(() => store.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('initial state is empty', () => {
        const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher, logService));
        assert.deepStrictEqual(model.checks.get(), []);
        assert.strictEqual(model.overallStatus.get(), "neutral" /* GitHubCIOverallStatus.Neutral */);
    });
    test('refresh populates checks and computes overall status', async () => {
        const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher, logService));
        mockFetcher.nextChecks = [
            { id: 1, name: 'build', status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "success" /* GitHubCheckConclusion.Success */, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
            { id: 2, name: 'test', status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "failure" /* GitHubCheckConclusion.Failure */, startedAt: undefined, completedAt: undefined, detailsUrl: undefined },
        ];
        await model.refresh();
        assert.strictEqual(model.checks.get().length, 2);
        assert.strictEqual(model.overallStatus.get(), "failure" /* GitHubCIOverallStatus.Failure */);
    });
    test('getCheckRunAnnotations delegates to fetcher', async () => {
        const model = store.add(new GitHubPullRequestCIModel('owner', 'repo', 'abc', mockFetcher, logService));
        const result = await model.getCheckRunAnnotations(1);
        assert.strictEqual(result, 'mock annotations');
    });
});
suite('parseWorkflowRunId', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('extracts run ID from GitHub Actions URL', () => {
        assert.strictEqual(parseWorkflowRunId('https://github.com/microsoft/vscode/actions/runs/12345/job/67890'), 12345);
    });
    test('extracts run ID from URL without job segment', () => {
        assert.strictEqual(parseWorkflowRunId('https://github.com/owner/repo/actions/runs/99999'), 99999);
    });
    test('returns undefined for non-Actions URL', () => {
        assert.strictEqual(parseWorkflowRunId('https://example.com/check/1'), undefined);
    });
    test('returns undefined for undefined input', () => {
        assert.strictEqual(parseWorkflowRunId(undefined), undefined);
    });
});
//#region Test Helpers
function makePR() {
    return {
        number: 1,
        title: 'Test PR',
        body: 'Test body',
        state: "open" /* GitHubPullRequestState.Open */,
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
function makeThread(id, path) {
    return {
        id,
        isResolved: false,
        path,
        line: 10,
        comments: [makeComment(100, `Comment on ${path}`, id)],
    };
}
function makeComment(id, body, threadId = String(id)) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViTW9kZWxzLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi90ZXN0L2Jyb3dzZXIvZ2l0aHViTW9kZWxzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSx1Q0FBdUMsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ25HLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUMxRSxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHNCQUFzQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDeEYsT0FBTyxFQUFFLHdCQUF3QixFQUFFLGtCQUFrQixFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDaEgsT0FBTyxFQUFFLHFCQUFxQixFQUFFLE1BQU0sK0NBQStDLENBQUM7QUFNdEYsdUJBQXVCO0FBRXZCLE1BQU0scUJBQXFCO0lBRzFCLEtBQUssQ0FBQyxhQUFhLENBQUMsTUFBYyxFQUFFLEtBQWE7UUFDaEQsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUN0QixNQUFNLElBQUksS0FBSyxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDbkMsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQztJQUN4QixDQUFDO0NBQ0Q7QUFFRCxNQUFNLGFBQWE7SUFBbkI7UUFHQyxnQkFBVyxHQUE0QixFQUFFLENBQUM7UUFDMUMsMkJBQXNCLEdBQTBDLEVBQUUsQ0FBQztRQUNuRSwwQkFBcUIsR0FBdUIsRUFBRSxDQUFDO0lBaUNoRCxDQUFDO0lBL0JBLEtBQUssQ0FBQyxjQUFjLENBQUMsTUFBYyxFQUFFLEtBQWEsRUFBRSxTQUFp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