/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IGitHubPullRequestSummary, IGitHubPullRequestsPage } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

interface IGitHubPullRequestsResponse {
	readonly repository: {
		readonly pullRequests: {
			readonly nodes: readonly IGitHubPullRequestNode[];
			readonly pageInfo: {
				readonly endCursor: string | null;
				readonly hasNextPage: boolean;
			};
		};
	} | null;
}

interface IGitHubPullRequestNode {
	readonly number: number;
	readonly title: string;
	readonly author: { readonly login: string; readonly avatarUrl: string } | null;
	readonly headRefName: string;
	readonly isDraft: boolean;
	readonly updatedAt: string;
	readonly additions: number;
	readonly deletions: number;
}

interface IGitHubPullRequestSearchResponse {
	readonly search: { readonly nodes: readonly (IGitHubPullRequestNode | null)[] };
}

const LIST_PULL_REQUESTS_QUERY = [
	'query ListPullRequests($owner: String!, $repo: String!, $cursor: String) {',
	'  repository(owner: $owner, name: $repo) {',
	'    pullRequests(first: 100, after: $cursor, states: OPEN, orderBy: { field: UPDATED_AT, direction: DESC }) {',
	'      nodes {',
	'        number',
	'        title',
	'        author { login avatarUrl }',
	'        headRefName',
	'        isDraft',
	'        updatedAt',
	'        additions',
	'        deletions',
	'      }',
	'      pageInfo { endCursor hasNextPage }',
	'    }',
	'  }',
	'}',
].join('\n');

const LIST_PULL_REQUEST_NUMBERS_QUERY = [
	'query ListPullRequestsByViewerGroup($query: String!) {',
	'  search(first: 100, query: $query, type: ISSUE) {',
	'    nodes {',
	'      ... on PullRequest {',
	'        number',
	'        title',
	'        author { login avatarUrl }',
	'        headRefName',
	'        isDraft',
	'        updatedAt',
	'        additions',
	'        deletions',
	'      }',
	'    }',
	'  }',
	'}',
].join('\n');

export class GitHubPullRequestsFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getPullRequests(owner: string, repo: string, cursor?: string): Promise<IGitHubPullRequestsPage> {
		const data = await this._apiClient.graphql<IGitHubPullRequestsResponse>(
			LIST_PULL_REQUESTS_QUERY,
			'githubApi.listPullRequests',
			{ owner, repo, cursor: cursor ?? null },
		);
		if (!data.repository) {
			throw new Error(`GitHub repository not found: ${owner}/${repo}`);
		}

		const connection = data.repository.pullRequests;
		return {
			pullRequests: connection.nodes.map(pullRequest => mapPullRequest(pullRequest, false, false)),
			cursor: connection.pageInfo.endCursor ?? undefined,
			hasNextPage: connection.pageInfo.hasNextPage,
		};
	}

	getPullRequestsWaitingForReview(owner: string, repo: string): Promise<readonly IGitHubPullRequestSummary[]> {
		const repositoryQuery = `repo:${owner}/${repo} is:pr is:open`;
		return this._getPullRequestsByQuery(`${repositoryQuery} review-requested:@me sort:updated-desc`, 'githubApi.listPullRequestsWaitingForReview', true, false);
	}

	getPullRequestsAssignedToViewer(owner: string, repo: string): Promise<readonly IGitHubPullRequestSummary[]> {
		const repositoryQuery = `repo:${owner}/${repo} is:pr is:open`;
		return this._getPullRequestsByQuery(`${repositoryQuery} assignee:@me sort:updated-desc`, 'githubApi.listPullRequestsAssignedToViewer', false, true);
	}

	private async _getPullRequestsByQuery(query: string, callSite: string, reviewRequestedFromViewer: boolean, assignedToViewer: boolean): Promise<readonly IGitHubPullRequestSummary[]> {
		const data = await this._apiClient.graphql<IGitHubPullRequestSearchResponse>(
			LIST_PULL_REQUEST_NUMBERS_QUERY,
			callSite,
			{ query },
		);
		return data.search.nodes.flatMap(node => node ? [mapPullRequest(node, reviewRequestedFromViewer, assignedToViewer)] : []);
	}
}

function mapPullRequest(pullRequest: IGitHubPullRequestNode, reviewRequestedFromViewer: boolean, assignedToViewer: boolean): IGitHubPullRequestSummary {
	return {
		number: pullRequest.number,
		title: pullRequest.title,
		author: pullRequest.author ?? { login: 'ghost', avatarUrl: '' },
		headRef: pullRequest.headRefName,
		checkoutRef: `refs/pull/${pullRequest.number}/head`,
		isDraft: pullRequest.isDraft,
		updatedAt: pullRequest.updatedAt,
		additions: pullRequest.additions,
		deletions: pullRequest.deletions,
		reviewRequestedFromViewer,
		assignedToViewer,
	};
}
