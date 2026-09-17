/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { themeColorFromId, ThemeIcon } from '../../base/common/themables.js';
import type { GitHubIssueState, GitHubIssueStateReason } from '../../platform/github/common/githubQueryService.js';

/** Uses the shared GitHub issue glyph and historical state color. */
export function computeIssueIcon(state: GitHubIssueState, stateReason: GitHubIssueStateReason | undefined): ThemeIcon {
	if (state === 'open') {
		return { ...Codicon.issueOpened, color: themeColorFromId('charts.green') };
	}
	if (stateReason === 'not_planned' || stateReason === 'duplicate') {
		return { ...Codicon.issueClosed, color: themeColorFromId('descriptionForeground') };
	}
	return { ...Codicon.issueClosed, color: themeColorFromId('charts.purple') };
}
