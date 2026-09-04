/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';
import { ChatPillSingleEntry, type IChatDropdownPillOptions } from '../../../browser/chatDropdownPill.js';
import { computePullRequestIcon } from '../../../common/chatPullRequest.js';

/** Shared presentation of the pull requests pill. */
export const sessionPullRequestsPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionPullRequests',
	icon: computePullRequestIcon('open'),
	title: localize('sessionPullRequests.title', "Pull Requests"),
	summaryLabel: count => count === 1
		? localize('sessionPullRequests.countSingle', "1 Pull Request")
		: localize('sessionPullRequests.count', "{0} Pull Requests", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionPullRequests.showSingle', "Show 1 pull request")
		: localize('sessionPullRequests.show', "Show {0} pull requests", count),
};

/** Shared presentation of the issues pill. */
export const sessionIssuesPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionIssues',
	icon: Codicon.issues,
	title: localize('sessionIssues.title', "Issues"),
	summaryLabel: count => count === 1
		? localize('sessionIssues.countSingle', "1 Issue")
		: localize('sessionIssues.count', "{0} Issues", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionIssues.showSingle', "Show 1 issue")
		: localize('sessionIssues.show', "Show {0} issues", count),
};

/** Shared presentation of the references pill. */
export const sessionReferencesPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionReferences',
	icon: Codicon.bookmark,
	title: localize('sessionReferences.title', "References"),
	summaryLabel: count => count === 1
		? localize('sessionReferences.countSingle', "1 Reference")
		: localize('sessionReferences.count', "{0} References", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionReferences.showSingle', "Show 1 reference")
		: localize('sessionReferences.show', "Show {0} references", count),
	singleEntry: ChatPillSingleEntry.Summary,
};

/** Shared presentation of the active browsers pill. */
export const sessionBrowsersPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionBrowsers',
	icon: Codicon.globe,
	title: localize('sessionBrowsers.title', "Browsers"),
	summaryLabel: count => count === 1
		? localize('sessionBrowsers.countSingle', "1 Active Browser")
		: localize('sessionBrowsers.count', "{0} Active Browsers", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionBrowsers.showSingle', "Show 1 browser")
		: localize('sessionBrowsers.show', "Show {0} browsers", count),
};

/** Shared presentation of the customizations pill. */
export const sessionCustomizationsPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionCustomizations',
	icon: Codicon.bookmark,
	title: localize('sessionCustomizations.title', "Customizations"),
	summaryLabel: count => count === 1
		? localize('sessionCustomizations.countSingle', "1 Customization")
		: localize('sessionCustomizations.count', "{0} Customizations", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionCustomizations.showSingle', "Show 1 customization")
		: localize('sessionCustomizations.show', "Show {0} customizations", count),
	singleEntry: ChatPillSingleEntry.Summary,
};

/** Shared presentation of the subagents pill. */
export const sessionSubagentsPillOptions: IChatDropdownPillOptions = {
	widgetId: 'sessionSubagents',
	icon: Codicon.agent,
	title: localize('sessionSubagents.title', "Background Activities"),
	summaryLabel: count => count === 1
		? localize('sessionSubagents.countSingle', "1 Subagent")
		: localize('sessionSubagents.count', "{0} Subagents", count),
	summaryAriaLabel: count => count === 1
		? localize('sessionSubagents.showSingle', "Show 1 subagent")
		: localize('sessionSubagents.show', "Show {0} subagents", count),
};
