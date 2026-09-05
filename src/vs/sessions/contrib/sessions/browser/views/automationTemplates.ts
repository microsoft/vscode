/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import type { IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';

export interface IAutomationTemplate {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly schedule: IAutomationSchedule;
}

export const AUTOMATION_TEMPLATES: readonly IAutomationTemplate[] = [
	{
		id: 'issue-triage',
		name: localize('automationTemplate.issueTriage.name', "Issue triage"),
		prompt: localize('automationTemplate.issueTriage.prompt', "Review new issues, group duplicates, and suggest labels."),
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
	},
	{
		id: 'pull-request-review',
		name: localize('automationTemplate.pullRequestReview.name', "Pull request review"),
		prompt: localize('automationTemplate.pullRequestReview.prompt', "Review recent changes for correctness, missing tests, and regressions."),
		schedule: { interval: 'daily', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 0 },
	},
	{
		id: 'dependency-audit',
		name: localize('automationTemplate.dependencyAudit.name', "Dependency audit"),
		prompt: localize('automationTemplate.dependencyAudit.prompt', "Check dependencies and summarize recommended updates."),
		schedule: { interval: 'weekly', scheduleHour: 9, scheduleMinute: 0, scheduleDay: 1 },
	},
	{
		id: 'release-notes',
		name: localize('automationTemplate.releaseNotes.name', "Release notes"),
		prompt: localize('automationTemplate.releaseNotes.prompt', "Draft release notes from the week's merged changes."),
		schedule: { interval: 'weekly', scheduleHour: 16, scheduleMinute: 0, scheduleDay: 5 },
	},
];
