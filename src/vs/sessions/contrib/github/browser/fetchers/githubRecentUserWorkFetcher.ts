/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { isDefined } from '../../../../../base/common/types.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { GitHubApiClient } from '../githubApiClient.js';

export interface IGitHubRecentIssue {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
}

export interface IGitHubRecentPullRequest {
	readonly number: number;
	readonly title: string;
	readonly url: string;
	readonly updatedAt: string;
	readonly hasMergeConflicts: boolean;
	readonly statusCheckRollupState: string | undefined;
	readonly latestCommitAt: string | undefined;
	readonly reviewThreads?: readonly IGitHubRecentPullRequestReviewThread[];
}

export interface IGitHubRecentPullRequestReviewThread {
	readonly isResolved: boolean;
	readonly latestCommentAt: string | undefined;
}

export interface IGitHubRecentUserWork {
	readonly issues: readonly IGitHubRecentIssue[];
	readonly pullRequests: readonly IGitHubRecentPullRequest[];
}

export class GitHubRecentUserWorkFetcher {
	constructor(private readonly _client: GitHubApiClient) { }

	getRecentAssignedIssues(owner: string, repo: string, token: CancellationToken): Promise<readonly IGitHubRecentIssue[]> {
		return this._client.withClient(async (client, signal) => {
			const page = await client.search.issues(`repo:${owner}/${repo} is:open assignee:@me`, signal, {
				query: { per_page: 5, sort: 'updated', order: 'desc' },
			});
			return page.items.map(issue => ({
				number: issue.number,
				title: issue.title,
				url: issue.html_url,
				updatedAt: issue.updated_at
			}));
		}, token);
	}

	getRecentAuthoredPullRequests(owner: string, repo: string, token: CancellationToken): Promise<readonly IGitHubRecentPullRequest[]> {
		return this._client.withClient(async (client, signal) => {
			const page = await client.search.pullRequests(`repo:${owner}/${repo} is:open author:@me sort:updated-desc`, signal, { query: { first: 5 } });
			return (page.nodes ?? []).filter(isDefined).map(pullRequest => {
				const latestCommit = pullRequest.commits.nodes?.find(isDefined)?.commit;
				return {
					number: pullRequest.number,
					title: pullRequest.title,
					url: pullRequest.url,
					updatedAt: pullRequest.updatedAt,
					hasMergeConflicts: pullRequest.mergeable === 'CONFLICTING',
					statusCheckRollupState: latestCommit?.statusCheckRollup?.state,
					latestCommitAt: latestCommit?.committedDate,
				};
			});
		}, token);
	}

	getPullRequestReviewThreads(owner: string, repo: string, pullRequestNumber: number, token: CancellationToken): Promise<readonly IGitHubRecentPullRequestReviewThread[]> {
		return this._client.withClient(async (client, signal) => {
			const pullRequest = await client.pullRequests.get({ owner, name: repo }, pullRequestNumber, signal);
			const threads = await client.reviews.listThreadSummaries(pullRequest.node_id, signal, {
				query: { first: 100 },
				maxPages: 100,
			});
			if (!threads) {
				throw new GitHubRequestError('GitHub resource was not returned', 'notFound');
			}
			return (threads.nodes ?? []).filter(isDefined).map(thread => ({
				isResolved: thread.isResolved,
				latestCommentAt: thread.comments.nodes?.find(isDefined)?.createdAt,
			}));
		}, token);
	}

	getIssuesWithLinkedPullRequests(owner: string, repo: string, issueNumbers: readonly number[], token: CancellationToken): Promise<ReadonlySet<number>> {
		if (issueNumbers.length === 0) {
			if (token.isCancellationRequested) {
				return Promise.reject(new CancellationError());
			}
			return Promise.resolve(new Set());
		}
		return this._client.withClient(async (client, signal) => {
			const counts = await client.issues.getClosingPullRequestCounts({ owner, name: repo }, issueNumbers, signal);
			if (counts === null) {
				throw new GitHubRequestError(`GitHub repository not found: ${owner}/${repo}`, 'notFound');
			}
			return new Set(issueNumbers.filter(number => (counts[number] ?? 0) > 0));
		}, token);
	}
}
