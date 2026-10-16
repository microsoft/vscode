/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Issue } from '../../../../../platform/github/common/core/issues.js';
import { GitHubIssueState, GitHubIssueStateReason, IGitHubIssue } from '../../common/types.js';
import { GitHubApiClient } from '../githubApiClient.js';

export class GitHubIssueFetcher {
	constructor(readonly client: GitHubApiClient) { }

	getIssue(owner: string, repo: string, issueNumber: number, token?: CancellationToken): Promise<IGitHubIssue> {
		return this.client.withClient(async (client, signal) => {
			const issue = await client.issues.get({ owner, name: repo }, issueNumber, signal);
			return {
				number: issue.number,
				title: issue.title,
				body: issue.body ?? '',
				state: issue.state === 'closed' ? GitHubIssueState.Closed : GitHubIssueState.Open,
				stateReason: mapStateReason(issue.state_reason),
				author: {
					login: issue.user?.login ?? 'ghost',
					avatarUrl: issue.user?.avatar_url ?? ''
				},
				createdAt: issue.created_at,
				updatedAt: issue.updated_at,
				closedAt: issue.closed_at ?? undefined,
			};
		}, token);
	}
}

function mapStateReason(value: Issue['state_reason']): GitHubIssueStateReason | undefined {
	switch (value) {
		case 'completed': return GitHubIssueStateReason.Completed;
		case 'not_planned': return GitHubIssueStateReason.NotPlanned;
		case 'duplicate': return GitHubIssueStateReason.Duplicate;
		case 'reopened': return GitHubIssueStateReason.Reopened;
		default: return undefined;
	}
}
