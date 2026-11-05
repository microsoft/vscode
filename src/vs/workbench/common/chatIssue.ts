/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { themeColorFromId, ThemeIcon } from '../../base/common/themables.js';
import type { GitHubIssue } from '../../platform/github/common/githubQueryService.js';

/** Computes the shared issue glyph and state color used by chat/session pills. */
export function computeIssueIcon(state: GitHubIssue['state'], stateReason: GitHubIssue['stateReason']): ThemeIcon {
	if (state === 'open') {
		return { ...Codicon.issueOpened, color: themeColorFromId('charts.green') };
	}
	if (stateReason === 'not_planned' || stateReason === 'duplicate') {
		return { ...Codicon.issueClosed, color: themeColorFromId('descriptionForeground') };
	}
	return { ...Codicon.issueClosed, color: themeColorFromId('charts.purple') };
}

/** Open or unresolved issues take priority over completed issues, then discarded issues. */
export function computeAggregateIssueIcon(issues: readonly (Pick<GitHubIssue, 'state' | 'stateReason'> | undefined)[]): ThemeIcon {
	if (issues.length === 0 || issues.some(issue => !issue || issue.state === 'open')) {
		return computeIssueIcon('open', undefined);
	}
	const allDiscarded = issues.every(issue => issue?.stateReason === 'not_planned' || issue?.stateReason === 'duplicate');
	return computeIssueIcon('closed', allDiscarded ? 'not_planned' : 'completed');
}
