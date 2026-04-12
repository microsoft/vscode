/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { GitHubPRFetcher } from '../../browser/fetchers/githubPRFetcher.js';
import { GitHubPRCIFetcher, computeOverallCIStatus } from '../../browser/fetchers/githubPRCIFetcher.js';
import { GitHubRepositoryFetcher } from '../../browser/fetchers/githubRepositoryFetcher.js';
import { GitHubApiError } from '../../browser/githubApiClient.js';
class MockApiClient {
    constructor() {
        this.requestCalls = [];
        this.graphqlCalls = [];
    }
    setNextResponse(data) {
        this._nextResponse = data;
        this._nextError = undefined;
    }
    setNextError(error) {
        this._nextError = error;
        this._nextResponse = undefined;
    }
    async request(_method, _path, _callSite, _body) {
        this.requestCalls.push({ method: _method, path: _path, body: _body });
        if (this._nextError) {
            throw this._nextError;
        }
        return this._nextResponse;
    }
    async graphql(query, _callSite, variables) {
        this.graphqlCalls.push({ query, variables });
        if (this._nextError) {
            throw this._nextError;
        }
        return this._nextResponse;
    }
}
suite('GitHubRepositoryFetcher', () => {
    const store = new DisposableStore();
    let mockApi;
    let fetcher;
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
        assert.strictEqual(repo.description, '');
    });
    test('getRepository propagates API errors', async () => {
        mockApi.setNextError(new GitHubApiError('Not found', 404, undefined));
        await assert.rejects(() => fetcher.getRepository('owner', 'nonexistent'), (err) => err instanceof GitHubApiError && err.statusCode === 404);
    });
});
suite('GitHubPRFetcher', () => {
    const store = new DisposableStore();
    let mockApi;
    let fetcher;
    setup(() => {
        mockApi = new MockApiClient();
        fetcher = new GitHubPRFetcher(mockApi);
    });
    teardown(() => store.clear());
    ensureNoDisposablesAreLeakedInTestSuite();
    test('getPullRequest maps open PR', async () => {
        mockApi.setNextResponse(makePRResponse({ state: 'open', merged: false, draft: false }));
        const pr = await fetcher.getPullRequest('owner', 'repo', 1);
        assert.strictEqual(pr.state, "open" /* GitHubPullRequestState.Open */);
        assert.strictEqual(pr.isDraft, false);
        assert.strictEqual(pr.number, 1);
        assert.strictEqual(pr.title, 'Test PR');
    });
    test('getPullRequest maps merged PR', async () => {
        mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: true, draft: false }));
        const pr = await fetcher.getPullRequest('owner', 'repo', 1);
        assert.strictEqual(pr.state, "merged" /* GitHubPullRequestState.Merged */);
        assert.ok(pr.mergedAt);
    });
    test('getPullRequest maps closed PR', async () => {
        mockApi.setNextResponse(makePRResponse({ state: 'closed', merged: false, draft: false }));
        const pr = await fetcher.getPullRequest('owner', 'repo', 1);
        assert.strictEqual(pr.state, "closed" /* GitHubPullRequestState.Closed */);
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
        const thread1 = threads.find(t => t.id === 'thread-a');
        assert.ok(thread1);
        assert.strictEqual(thread1.comments.length, 2);
        assert.strictEqual(thread1.path, 'src/a.ts');
        assert.strictEqual(thread1.line, 10);
        assert.strictEqual(thread1.comments[0].threadId, 'thread-a');
        const thread2 = threads.find(t => t.id === 'thread-b');
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
    test('getMergeability detects draft blocker', async () => {
        // getMergeability makes two requests (PR then reviews)
        // Use a counter to return different responses
        let callCount = 0;
        const originalRequest = mockApi.request.bind(mockApi);
        mockApi.request = async function (_method, _path, _body) {
            if (callCount++ === 0) {
                return makePRResponse({ state: 'open', merged: false, draft: true, mergeable: true, mergeable_state: 'clean' });
            }
            return [];
        };
        const result = await fetcher.getMergeability('owner', 'repo', 1);
        assert.strictEqual(result.canMerge, false);
        assert.ok(result.blockers.some(b => b.kind === "draft" /* MergeBlockerKind.Draft */));
        // Restore
        mockApi.request = originalRequest;
    });
    test('getMergeability detects conflicts blocker', async () => {
        let callCount = 0;
        const originalRequest = mockApi.request.bind(mockApi);
        mockApi.request = async function () {
            if (callCount++ === 0) {
                return makePRResponse({ state: 'open', merged: false, draft: false, mergeable: false, mergeable_state: 'dirty' });
            }
            return [];
        };
        const result = await fetcher.getMergeability('owner', 'repo', 1);
        assert.strictEqual(result.canMerge, false);
        assert.ok(result.blockers.some(b => b.kind === "conflicts" /* MergeBlockerKind.Conflicts */));
        mockApi.request = originalRequest;
    });
    test('getMergeability detects changes requested blocker', async () => {
        let callCount = 0;
        const originalRequest = mockApi.request.bind(mockApi);
        mockApi.request = async function () {
            if (callCount++ === 0) {
                return makePRResponse({ state: 'open', merged: false, draft: false, mergeable: true, mergeable_state: 'clean' });
            }
            return [
                { id: 1, user: { login: 'reviewer', avatar_url: '' }, state: 'CHANGES_REQUESTED', submitted_at: '2024-01-01T00:00:00Z' },
            ];
        };
        const result = await fetcher.getMergeability('owner', 'repo', 1);
        assert.strictEqual(result.canMerge, false);
        assert.ok(result.blockers.some(b => b.kind === "changesRequested" /* MergeBlockerKind.ChangesRequested */));
        mockApi.request = originalRequest;
    });
});
suite('GitHubPRCIFetcher', () => {
    const store = new DisposableStore();
    let mockApi;
    let fetcher;
    setup(() => {
        mockApi = new MockApiClient();
        fetcher = new GitHubPRCIFetcher(mockApi);
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
        assert.strictEqual(checks.length, 2);
        assert.deepStrictEqual(checks[0], {
            id: 1,
            name: 'build',
            status: "completed" /* GitHubCheckStatus.Completed */,
            conclusion: "success" /* GitHubCheckConclusion.Success */,
            startedAt: '2024-01-01T00:00:00Z',
            completedAt: '2024-01-01T00:10:00Z',
            detailsUrl: 'https://example.com/1',
        });
        assert.strictEqual(checks[1].conclusion, undefined);
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
        assert.strictEqual(computeOverallCIStatus([]), "neutral" /* GitHubCIOverallStatus.Neutral */);
    });
    test('returns success when all completed successfully', () => {
        const checks = [
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "success" /* GitHubCheckConclusion.Success */ }),
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "neutral" /* GitHubCheckConclusion.Neutral */ }),
        ];
        assert.strictEqual(computeOverallCIStatus(checks), "success" /* GitHubCIOverallStatus.Success */);
    });
    test('returns failure when any check failed', () => {
        const checks = [
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "success" /* GitHubCheckConclusion.Success */ }),
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "failure" /* GitHubCheckConclusion.Failure */ }),
        ];
        assert.strictEqual(computeOverallCIStatus(checks), "failure" /* GitHubCIOverallStatus.Failure */);
    });
    test('returns pending when any check is in progress', () => {
        const checks = [
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "success" /* GitHubCheckConclusion.Success */ }),
            makeCheck({ status: "in_progress" /* GitHubCheckStatus.InProgress */, conclusion: undefined }),
        ];
        assert.strictEqual(computeOverallCIStatus(checks), "pending" /* GitHubCIOverallStatus.Pending */);
    });
    test('failure takes precedence over pending', () => {
        const checks = [
            makeCheck({ status: "completed" /* GitHubCheckStatus.Completed */, conclusion: "failure" /* GitHubCheckConclusion.Failure */ }),
            makeCheck({ status: "in_progress" /* GitHubCheckStatus.InProgress */, conclusion: undefined }),
        ];
        assert.strictEqual(computeOverallCIStatus(checks), "failure" /* GitHubCIOverallStatus.Failure */);
    });
});
//#region Test Helpers
function makePRResponse(overrides) {
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
function makeGraphQLReviewThreadsResponse(threads) {
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
function makeGraphQLReviewThread(overrides = {}) {
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
function makeGraphQLReviewComment(overrides = {}) {
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
function makeCheck(overrides) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViRmV0Y2hlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL3Rlc3QvYnJvd3Nlci9naXRodWJGZXRjaGVycy50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQztBQUM1QixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUNuRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxzQkFBc0IsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hHLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQzVGLE9BQU8sRUFBbUIsY0FBYyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFHbkYsTUFBTSxhQUFhO0lBQW5CO1FBSVUsaUJBQVksR0FBdUQsRUFBRSxDQUFDO1FBQ3RFLGlCQUFZLEdBQTZELEVBQUUsQ0FBQztJQTJCdEYsQ0FBQztJQXpCQSxlQUFlLENBQUMsSUFBYTtRQUM1QixJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksQ0FBQztRQUMxQixJQUFJLENBQUMsVUFBVSxHQUFHLFNBQVMsQ0FBQztJQUM3QixDQUFDO0lBRUQsWUFBWSxDQUFDLEtBQVk7UUFDeEIsSUFBSSxDQUFDLFVBQVUsR0FBRyxLQUFLLENBQUM7UUFDeEIsSUFBSSxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUM7SUFDaEMsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUksT0FBZSxFQUFFLEtBQWEsRUFBRSxTQUFpQixFQUFFLEtBQWU7UUFDbEYsSUFBSSxDQUFDLFlBQVks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