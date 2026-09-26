/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { themeColorFromId, ThemeIcon } from '../../base/common/themables.js';

export type ChatPullRequestState = 'open' | 'closed' | 'merged' | 'draft';

/**
 * Additional live status used to refine the icon of an open pull request.
 */
export interface IPullRequestIconStatus {
	/** Whether the pull request has merge conflicts. */
	readonly hasMergeConflicts?: boolean;
	/** Whether the pull request has at least one failing CI check. */
	readonly hasFailingChecks?: boolean;
	/** Whether the pull request has at least one unresolved review comment thread. */
	readonly hasUnresolvedComments?: boolean;
}

/**
 * Computes the shared pull request glyph and state color used by chat/session pills.
 */
export function computePullRequestIcon(state: ChatPullRequestState, status?: IPullRequestIconStatus): ThemeIcon {
	switch (state) {
		case 'merged':
			return { ...Codicon.gitPullRequestDone, color: themeColorFromId('charts.purple') };
		case 'closed':
			return { ...Codicon.gitPullRequestClosed, color: themeColorFromId('charts.red') };
		case 'draft':
			return { ...Codicon.gitPullRequestDraft, color: themeColorFromId('descriptionForeground') };
		case 'open':
			if (status?.hasMergeConflicts || status?.hasFailingChecks) {
				return { ...Codicon.gitPullRequestError, color: themeColorFromId('charts.orange') };
			}
			if (status?.hasUnresolvedComments) {
				return { ...Codicon.gitPullRequestComment, color: themeColorFromId('charts.green') };
			}
			return { ...Codicon.gitPullRequest, color: themeColorFromId('charts.green') };
	}
}

const pullRequestIconPriority = new Map<string, number>([
	[Codicon.gitPullRequestError.id, 6],
	[Codicon.gitPullRequestComment.id, 5],
	[Codicon.gitPullRequest.id, 4],
	[Codicon.gitPullRequestDraft.id, 3],
	[Codicon.gitPullRequestDone.id, 2],
	[Codicon.gitPullRequestClosed.id, 1],
]);

/** Returns the most important status icon across a set of pull requests. */
export function getHighestPriorityPullRequestIcon(icons: readonly (ThemeIcon | undefined)[]): ThemeIcon | undefined {
	let result: ThemeIcon | undefined;
	let resultPriority = -1;
	for (const icon of icons) {
		if (!icon) {
			continue;
		}
		const priority = pullRequestIconPriority.get(icon.id) ?? 0;
		if (priority > resultPriority) {
			result = icon;
			resultPriority = priority;
		}
	}
	return result;
}
