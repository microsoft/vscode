/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isDefined } from '../../../../../base/common/types.js';
import { PullRequestListItem } from '../../../../../platform/github/common/core/pullRequests.js';
import { GitHubRequestError } from '../../../../../platform/github/common/githubTypes.js';
import { IGitHubPullRequestSummary, IGitHubPullRequestsPage } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubPullRequestsFetcher {
	constructor(private readonly _client: GitHubApiClient) { }

	getPullRequests(owner: string, repo: string, cursor?: string): Promise<IGitHubPullRequestsPage> {
		return this._client.withClient(async (client, signal) => {
			const connection = await client.pullRequests.listConnection({ owner, repo }, signal, { query: { first: 100, after: cursor } });
			if (!connection) {
				throw new GitHubRequestError(`GitHub repository not found: ${owner}/${repo}`, 'notFound');
			}
			return {
				pullRequests: (connection.nodes ?? []).filter(isDefined).map(pullRequest => mapPullRequest(pullRequest, false, false)),
				cursor: connection.pageInfo.endCursor ?? undefined,
				hasNextPage: connection.pageInfo.hasNextPage,
			};
		});
	}

	getPullRequestsWaitingForReview(owner: string, repo: string): Promise<readonly IGitHubPullRequestSummary[]> {
		return this._getPullRequestsByQuery(`repo:${owner}/${repo} is:open review-requested:@me sort:updated-desc`, true, false);
	}

	getPullRequestsAssignedToViewer(owner: string, repo: string): Promise<readonly IGitHubPullRequestSummary[]> {
		return this._getPullRequestsByQuery(`repo:${owner}/${repo} is:open assignee:@me sort:updated-desc`, false, true);
	}

	private _getPullRequestsByQuery(query: string, reviewRequestedFromViewer: boolean, assignedToViewer: boolean): Promise<readonly IGitHubPullRequestSummary[]> {
		return this._client.withClient(async (client, signal) => {
			const connection = await client.search.pullRequests(query, signal, { query: { first: 100 } });
			return (connection.nodes ?? []).filter(isDefined).map(pullRequest => mapPullRequest(pullRequest, reviewRequestedFromViewer, assignedToViewer));
		});
	}
}

function mapPullRequest(pullRequest: PullRequestListItem, reviewRequestedFromViewer: boolean, assignedToViewer: boolean): IGitHubPullRequestSummary {
	return {
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author ? {
			login: pullRequest.author.login,
			avatarUrl: pullRequest.author.avatarUrl
		} : {
			login: 'ghost',
			avatarUrl: ''
		},
		headRef: pullRequest.headRefName,
		checkoutRef: `refs/pull/${pullRequest.number}/head`,
		isCrossRepository: pullRequest.isCrossRepository,
		isDraft: pullRequest.isDraft,
		updatedAt: pullRequest.updatedAt,
		additions: pullRequest.additions,
		deletions: pullRequest.deletions,
		reviewRequestedFromViewer,
		assignedToViewer,
	};
}
