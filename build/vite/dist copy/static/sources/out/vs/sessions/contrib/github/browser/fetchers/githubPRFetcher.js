/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
//#endregion
const GET_REVIEW_THREADS_QUERY = [
    'query GetReviewThreads($owner: String!, $repo: String!, $prNumber: Int!) {',
    '  repository(owner: $owner, name: $repo) {',
    '    pullRequest(number: $prNumber) {',
    '      reviewThreads(first: 100) {',
    '        nodes {',
    '          id',
    '          isResolved',
    '          path',
    '          line',
    '          comments(first: 100) {',
    '            nodes {',
    '              databaseId',
    '              body',
    '              createdAt',
    '              updatedAt',
    '              path',
    '              line',
    '              originalLine',
    '              replyTo {',
    '                databaseId',
    '              }',
    '              author {',
    '                login',
    '                avatarUrl',
    '              }',
    '            }',
    '          }',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
].join('\n');
const RESOLVE_REVIEW_THREAD_MUTATION = [
    'mutation ResolveReviewThread($threadId: ID!) {',
    '  resolveReviewThread(input: { threadId: $threadId }) {',
    '    thread {',
    '      isResolved',
    '    }',
    '  }',
    '}',
].join('\n');
/**
 * Stateless fetcher for GitHub pull request data.
 * Handles all PR-related REST API calls including reviews, comments, and mergeability.
 */
export class GitHubPRFetcher {
    constructor(_apiClient) {
        this._apiClient = _apiClient;
    }
    async getPullRequest(owner, repo, prNumber) {
        const data = await this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}`, 'githubApi.getPullRequest');
        return mapPullRequest(data);
    }
    async getMergeability(owner, repo, prNumber) {
        const [pr, reviews] = await Promise.all([
            this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}`, 'githubApi.getMergeability.pr'),
            this._apiClient.request('GET', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}/reviews`, 'githubApi.getMergeability.reviews'),
        ]);
        const blockers = [];
        // Draft
        if (pr.draft) {
            blockers.push({ kind: "draft" /* MergeBlockerKind.Draft */, description: 'Pull request is a draft' });
        }
        // Merge conflicts
        if (pr.mergeable === false) {
            blockers.push({ kind: "conflicts" /* MergeBlockerKind.Conflicts */, description: 'Pull request has merge conflicts' });
        }
        // Changes requested — check most recent review per reviewer
        const latestReviewByUser = new Map();
        for (const review of reviews) {
            if (review.state === 'APPROVED' || review.state === 'CHANGES_REQUESTED' || review.state === 'DISMISSED') {
                latestReviewByUser.set(review.user.login, review.state);
            }
        }
        const hasChangesRequested = [...latestReviewByUser.values()].some(s => s === 'CHANGES_REQUESTED');
        if (hasChangesRequested) {
            blockers.push({ kind: "changesRequested" /* MergeBlockerKind.ChangesRequested */, description: 'Changes have been requested' });
        }
        // Approval needed — check mergeable_state
        if (pr.mergeable_state === 'blocked') {
            const hasApproval = [...latestReviewByUser.values()].some(s => s === 'APPROVED');
            if (!hasApproval) {
                blockers.push({ kind: "approvalNeeded" /* MergeBlockerKind.ApprovalNeeded */, description: 'Approval is required' });
            }
        }
        // CI failures — mergeable_state 'unstable' indicates check failures
        if (pr.mergeable_state === 'unstable') {
            blockers.push({ kind: "ciFailed" /* MergeBlockerKind.CIFailed */, description: 'CI checks have failed' });
        }
        return {
            canMerge: blockers.length === 0 && pr.mergeable !== false && pr.state === 'open',
            blockers,
        };
    }
    async getReviewThreads(owner, repo, prNumber) {
        const data = await this._apiClient.graphql(GET_REVIEW_THREADS_QUERY, 'githubApi.getReviewThreads', { owner, repo, prNumber });
        const reviewThreads = data.repository?.pullRequest?.reviewThreads.nodes;
        if (!reviewThreads) {
            throw new Error(`Pull request not found: ${owner}/${repo}#${prNumber}`);
        }
        return reviewThreads.map(mapReviewThread);
    }
    async postReviewComment(owner, repo, prNumber, body, inReplyTo) {
        const data = await this._apiClient.request('POST', `/repos/${e(owner)}/${e(repo)}/pulls/${prNumber}/comments`, 'githubApi.postReviewComment', { body, in_reply_to: inReplyTo });
        return mapReviewComment(data);
    }
    async postIssueComment(owner, repo, prNumber, body) {
        const data = await this._apiClient.request('POST', `/repos/${e(owner)}/${e(repo)}/issues/${prNumber}/comments`, 'githubApi.postIssueComment', { body });
        return {
            id: data.id,
            body: data.body ?? '',
            author: mapUser(data.user),
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            path: undefined,
            line: undefined,
            threadId: String(data.id),
            inReplyToId: undefined,
        };
    }
    async resolveThread(_owner, _repo, threadId) {
        const data = await this._apiClient.graphql(RESOLVE_REVIEW_THREAD_MUTATION, 'githubApi.resolveThread', { threadId });
        if (!data.resolveReviewThread?.thread?.isResolved) {
            throw new Error(`Failed to resolve review thread ${threadId}`);
        }
    }
}
//#region Helpers
function e(value) {
    return encodeURIComponent(value);
}
function mapUser(user) {
    return { login: user.login, avatarUrl: user.avatar_url };
}
function mapPullRequest(data) {
    let state;
    if (data.merged) {
        state = "merged" /* GitHubPullRequestState.Merged */;
    }
    else if (data.state === 'closed') {
        state = "closed" /* GitHubPullRequestState.Closed */;
    }
    else {
        state = "open" /* GitHubPullRequestState.Open */;
    }
    return {
        number: data.number,
        title: data.title,
        body: data.body ?? '',
        state,
        author: mapUser(data.user),
        headRef: data.head.ref,
        headSha: data.head.sha,
        baseRef: data.base.ref,
        isDraft: data.draft,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        mergedAt: data.merged_at ?? undefined,
        mergeable: data.mergeable ?? undefined,
        mergeableState: data.mergeable_state,
    };
}
function mapReviewComment(data) {
    return {
        id: data.id,
        body: data.body,
        author: mapUser(data.user),
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        path: data.path,
        line: data.line ?? data.original_line ?? undefined,
        threadId: String(data.in_reply_to_id ?? data.id),
        inReplyToId: data.in_reply_to_id,
    };
}
function mapReviewThread(thread) {
    return {
        id: thread.id,
        isResolved: thread.isResolved,
        path: thread.path,
        line: thread.line ?? undefined,
        comments: thread.comments.nodes.flatMap(comment => mapGraphQLReviewComment(comment, thread)),
    };
}
function mapGraphQLReviewComment(comment, thread) {
    if (comment.databaseId === null || comment.author === null) {
        return [];
    }
    return [{
            id: comment.databaseId,
            body: comment.body,
            author: { login: comment.author.login, avatarUrl: comment.author.avatarUrl },
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            path: comment.path ?? thread.path,
            line: comment.line ?? comment.originalLine ?? thread.line ?? undefined,
            threadId: thread.id,
            inReplyToId: comment.replyTo?.databaseId ?? undefined,
        }];
}
//#endregion
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2l0aHViUFJGZXRjaGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvc2Vzc2lvbnMvY29udHJpYi9naXRodWIvYnJvd3Nlci9mZXRjaGVycy9naXRodWJQUkZldGNoZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFvR2hHLFlBQVk7QUFFWixNQUFNLHdCQUF3QixHQUFHO0lBQ2hDLDRFQUE0RTtJQUM1RSw0Q0FBNEM7SUFDNUMsc0NBQXNDO0lBQ3RDLG1DQUFtQztJQUNuQyxpQkFBaUI7SUFDakIsY0FBYztJQUNkLHNCQUFzQjtJQUN0QixnQkFBZ0I7SUFDaEIsZ0JBQWdCO0lBQ2hCLGtDQUFrQztJQUNsQyxxQkFBcUI7SUFDckIsMEJBQTBCO0lBQzFCLG9CQUFvQjtJQUNwQix5QkFBeUI7SUFDekIseUJBQXlCO0lBQ3pCLG9CQUFvQjtJQUNwQixvQkFBb0I7SUFDcEIsNEJBQTRCO0lBQzVCLHlCQUF5QjtJQUN6Qiw0QkFBNEI7SUFDNUIsaUJBQWlCO0lBQ2pCLHdCQUF3QjtJQUN4Qix1QkFBdUI7SUFDdkIsMkJBQTJCO0lBQzNCLGlCQUFpQjtJQUNqQixlQUFlO0lBQ2YsYUFBYTtJQUNiLFdBQVc7SUFDWCxTQUFTO0lBQ1QsT0FBTztJQUNQLEtBQUs7SUFDTCxHQUFHO0NBQ0gsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFFYixNQUFNLDhCQUE4QixHQUFHO0lBQ3RDLGdEQUFnRDtJQUNoRCx5REFBeUQ7SUFDekQsY0FBYztJQUNkLGtCQUFrQjtJQUNsQixPQUFPO0lBQ1AsS0FBSztJQUNMLEdBQUc7Q0FDSCxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUViOzs7R0FHRztBQUNILE1BQU0sT0FBTyxlQUFlO0lBRTNCLFlBQ2tCLFVBQTJCO1FBQTNCLGVBQVUsR0FBVixVQUFVLENBQWlCO0lBQ3pDLENBQUM7SUFF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