/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import type { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';

export interface IAutomationTemplate {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
}

export const AUTOMATION_TEMPLATES: readonly IAutomationTemplate[] = [
	{
		id: 'main-updates',
		name: localize('automationTemplate.mainUpdates.name', "Catch up on main"),
		description: localize('automationTemplate.mainUpdates.description', "Pull the latest main and summarize new commits."),
		prompt: localize('automationTemplate.mainUpdates.prompt', "Pull the latest main and summarize the commits that were pulled.\n\nInspect this repository's current branch, working tree, and configured remotes. Resolve the remote for main from the repository configuration rather than assuming origin. Record HEAD, then pull that remote's main into the current checkout using --ff-only. Proceed only with a clean working tree and a fast-forward update. If the remote is ambiguous, main is missing, or the update is blocked, stop and explain why. Do not switch branches, stash or discard local changes, rebase, or force an update.\n\nCompare the starting and ending HEAD and summarize only newly pulled commits, grouped by theme. Highlight user-visible changes, bug fixes, breaking changes, and follow-up actions. Include commit links and related pull requests when available. If no commits were pulled, say so."),
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
	},
	{
		id: 'issue-triage',
		name: localize('automationTemplate.issueTriage.name', "Issue triage"),
		description: localize('automationTemplate.issueTriage.description', "Triage my GitHub repositories' issues using their precedents."),
		prompt: localize('automationTemplate.issueTriage.prompt', "Triage my GitHub repositories' issues using existing repository precedents.\n\nUse the authenticated GitHub account to find my repositories, prioritizing active repositories and new or untriaged issues. For each repository, read its contribution guidelines, issue templates, existing labels, and comparable issues with maintainer decisions. Learn each repository's conventions separately before making recommendations.\n\nProduce a report grouped by repository. Link to each issue, recommend existing labels, identify likely duplicates, and draft a reply when useful. Cite prior issues, pull requests, or maintainer comments supporting each recommendation. Flag uncertainty or missing precedent rather than inventing a rule. Do not apply labels, post comments, close issues, or make other GitHub changes. State which repositories and issues were reviewed and any access limitations."),
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
	},
	{
		id: 'find-bugs',
		name: localize('automationTemplate.findBugs.name', "Find bugs"),
		description: localize('automationTemplate.findBugs.description', "Explore the codebase and report verified, reproducible bugs."),
		prompt: localize('automationTemplate.findBugs.prompt', "Explore this codebase and find concrete, reproducible bugs.\n\nRead the repository guidance and understand the architecture before choosing a focused area to investigate, such as recent changes, complex state transitions, or error handling. Trace suspected problems through callers and existing tests. Use the smallest relevant tests or a minimal reproduction to verify behavior, and distinguish confirmed bugs from hypotheses. Avoid style-only suggestions and speculative findings.\n\nReport high-confidence, actionable bugs with severity, file and line references, a triggering scenario, expected versus actual behavior, and supporting test or reproduction results. Suggest a focused fix for each finding without modifying repository files or committing changes. State what you explored, any validation limitations, and when no confirmed bugs were found."),
		schedule: { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
	},
];
