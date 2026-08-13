/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { themeColorFromId, ThemeIcon } from '../../../../base/common/themables.js';

export const enum GitHubPullRequestState {
	Open = 'open',
	Closed = 'closed',
	Merged = 'merged',
}

export interface IPullRequestIconStatus {
	readonly hasFailingChecks?: boolean;
	readonly hasUnresolvedComments?: boolean;
}

/** Computes the shared session PR icon from its state and live status. */
export function computePullRequestIcon(state: GitHubPullRequestState | 'draft', status?: IPullRequestIconStatus): ThemeIcon {
	switch (state) {
		case GitHubPullRequestState.Merged:
			return { ...Codicon.gitPullRequestDone, color: themeColorFromId('charts.purple') };
		case GitHubPullRequestState.Closed:
			return { ...Codicon.gitPullRequestClosed, color: themeColorFromId('charts.red') };
		case 'draft':
			return { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') };
		case GitHubPullRequestState.Open:
			if (status?.hasFailingChecks) {
				return { ...Codicon.gitPullRequestError, color: themeColorFromId('charts.orange') };
			}
			if (status?.hasUnresolvedComments) {
				return { ...Codicon.gitPullRequestComment, color: themeColorFromId('charts.green') };
			}
			return { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };
	}
}
