/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { GitHubIssueState, GitHubIssueStateReason, IGitHubIssue } from '../../common/types.js';
import { GitHubApiClient, IGitHubApiResponse } from '../githubApiClient.js';

interface IGitHubIssueResponse {
	readonly number: number;
	readonly title: string;
	readonly body: string | null;
	readonly state: 'open' | 'closed';
	readonly state_reason: string | null;
	readonly user: { readonly login: string; readonly avatar_url: string };
	readonly created_at: string;
	readonly updated_at: string;
	readonly closed_at: string | null;
	/** Only set when the "issue" is actually a pull request. */
	readonly pull_request?: unknown;
}

export class GitHubIssueFetcher {

	constructor(
		private readonly _apiClient: GitHubApiClient,
	) { }

	async getIssue(owner: string, repo: string, issueNumber: number, etag?: string): Promise<IGitHubApiResponse<IGitHubIssue>> {
		const response = await this._apiClient.request<IGitHubIssueResponse>(
			'GET',
			`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}`,
			'githubApi.getIssue',
			{ etag }
		);

		return {
			...response,
			data: response.data ? mapIssue(response.data) : undefined
		};
	}
}

function mapIssue(data: IGitHubIssueResponse): IGitHubIssue {
	return {
		number: data.number,
		title: data.title,
		body: data.body ?? '',
		state: data.state === 'closed' ? GitHubIssueState.Closed : GitHubIssueState.Open,
		stateReason: mapStateReason(data.state_reason),
		author: { login: data.user.login, avatarUrl: data.user.avatar_url },
		createdAt: data.created_at,
		updatedAt: data.updated_at,
		closedAt: data.closed_at ?? undefined,
	};
}

function mapStateReason(value: string | null): GitHubIssueStateReason | undefined {
	switch (value) {
		case 'completed': return GitHubIssueStateReason.Completed;
		case 'not_planned': return GitHubIssueStateReason.NotPlanned;
		case 'duplicate': return GitHubIssueStateReason.Duplicate;
		case 'reopened': return GitHubIssueStateReason.Reopened;
		default: return undefined;
	}
}
