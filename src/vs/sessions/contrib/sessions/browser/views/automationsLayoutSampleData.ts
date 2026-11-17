/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * Prototype only. Sample automations for the experimental Automations layouts, shown while
 * `chat.automations.sampleData` is on. Nothing here is real, and nothing outside the layouts reads it.
 */

import { observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import type { AutomationRunTrigger, IAutomationSchedule } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { automationTriggerSummary } from '../../../../../workbench/contrib/chat/common/automations/automationTriggers.js';
import { SessionArtifactKind } from '../../../../../workbench/services/sessions/common/session.js';
import { getUnavailableAutomationsReasons } from './automationCataloguePresentation.js';
import { AutomationGroupId, AutomationRunState, CLOUD_AUTOMATION_HOST, getThisMachineLabel, IAutomationLayoutArtifact, IAutomationLayoutRow, IAutomationLayoutRun, IAutomationLayoutWarning, LOCAL_AUTOMATION_HOST } from './automationsLayoutModel.js';
import { describeAutomationSchedule, IAutomationScheduleDescription } from './automationsLayoutSchedule.js';

/** Sample runs marked as read, shared by every open layout until the window reloads. */
export const sampleAutomationRunsRead = observableValue<ReadonlySet<string>>('sampleAutomationRunsRead', new Set());

export interface IAutomationsSampleData {
	readonly rows: readonly IAutomationLayoutRow[];
	readonly runs: readonly IAutomationLayoutRun[];
	readonly warnings: readonly IAutomationLayoutWarning[];
}

interface ISampleAutomation {
	readonly id: string;
	readonly name: string;
	readonly prompt: string;
	readonly group: AutomationGroupId;
	readonly schedule: IAutomationSchedule | 'pullRequestOpened';
	readonly hostKey: string;
	readonly hostLabel: string;
	readonly workspace?: string;
	readonly enabled?: boolean;
}

interface ISampleRun {
	readonly id: string;
	readonly automationId: string;
	readonly state: AutomationRunState;
	readonly time: number;
	readonly trigger: AutomationRunTrigger;
	readonly unread?: boolean;
	/** Why the run failed. */
	readonly outcome?: string;
	readonly summary?: string;
	readonly artifacts?: readonly IAutomationLayoutArtifact[];
}

const DEVBOX1 = 'sample:devbox1';
const CLOUD_REPOSITORY = 'microsoft/vscode';

function daily(hour: number, minute = 0): IAutomationSchedule {
	return { interval: 'daily', scheduleDay: 0, scheduleHour: hour, scheduleMinute: minute };
}

function weekdays(hour: number, minute = 0): IAutomationSchedule {
	return { interval: 'weekdays', scheduleDay: 0, scheduleHour: hour, scheduleMinute: minute };
}

function getSampleAutomations(): readonly ISampleAutomation[] {
	// The machine's own label, the same one real automations on this machine show.
	const thisMachine = getThisMachineLabel();
	const cloud = localize('automationsSample.cloud', "Cloud");
	return [
		{ id: 'sample.inboxTriage', name: localize('automationsSample.inboxTriage', "Morning inbox triage"), prompt: localize('automationsSample.inboxTriage.prompt', "Sort this morning's notifications into needs a reply, FYI and ignore, and draft short replies."), group: 'personal', schedule: weekdays(8, 30), hostKey: LOCAL_AUTOMATION_HOST, hostLabel: thisMachine },
		{ id: 'sample.variationLab', name: localize('automationsSample.variationLab', "Nightly variation lab"), prompt: localize('automationsSample.variationLab.prompt', "Build tonight's design variations, check them at every size, and post the contact sheets."), group: 'personal', schedule: daily(1), hostKey: DEVBOX1, hostLabel: 'DevBox1' },
		{ id: 'sample.prReviewSummary', name: localize('automationsSample.prReviewSummary', "PR review summary"), prompt: localize('automationsSample.prReviewSummary.prompt', "Summarize the new pull request and point out the files that need a careful review."), group: 'cloud', schedule: 'pullRequestOpened', hostKey: CLOUD_AUTOMATION_HOST, hostLabel: cloud, workspace: CLOUD_REPOSITORY },
	];
}

function getSampleRuns(now: number): readonly ISampleRun[] {
	const date = new Date(now);
	const startOfToday = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const minute = 60_000;
	const hour = 60 * minute;
	const day = 24 * hour;
	const today = (minutesAgo: number) => Math.max(startOfToday + minute, now - minutesAgo * minute);
	const yesterday = (hours: number, minutes = 0) => startOfToday - day + hours * hour + minutes * minute;
	const replies = localize('automationsSample.result.replies', "Replies to review.md");
	return [
		{
			id: 'sample.run.inboxTriage', automationId: 'sample.inboxTriage', state: 'completed', time: today(180), trigger: 'schedule', unread: true,
			summary: localize('automationsSample.result.inboxTriage', "Sorted 14 notifications: 3 need a reply, 6 are FYI and 5 can be ignored. Drafted the 3 replies."),
			artifacts: [{ kind: SessionArtifactKind.File, label: replies }],
		},
		{
			id: 'sample.run.prReviewSummary', automationId: 'sample.prReviewSummary', state: 'completed', time: now - 13 * hour, trigger: 'external', unread: true,
			summary: localize('automationsSample.result.prReviewSummary', "2 of 9 changed files need a careful review: the layout widget and its styles."),
			artifacts: [{ kind: SessionArtifactKind.PullRequest, label: localize('automationsSample.result.pullRequest', "#214 Add run details to Automations") }],
		},
		{
			id: 'sample.run.variationLab', automationId: 'sample.variationLab', state: 'failed', time: yesterday(1), trigger: 'schedule',
			outcome: localize('automationsSample.result.variationLabFailed', "Lost the connection to DevBox1 before the contact sheets were posted."),
		},
		{
			id: 'sample.run.inboxTriageYesterday', automationId: 'sample.inboxTriage', state: 'completed', time: yesterday(8, 30), trigger: 'schedule',
			summary: localize('automationsSample.result.inboxTriageYesterday', "Sorted 9 notifications: 1 needs a reply, 5 are FYI and 3 can be ignored. Drafted the reply."),
			artifacts: [{ kind: SessionArtifactKind.File, label: replies }],
		},
		{
			id: 'sample.run.variationLabEarlier', automationId: 'sample.variationLab', state: 'completed', time: yesterday(1) - day, trigger: 'schedule',
			summary: localize('automationsSample.result.variationLab', "Built 6 variations and checked each at 4 sizes. 2 need spacing fixes."),
			artifacts: [{ kind: SessionArtifactKind.Website, label: localize('automationsSample.result.contactSheets', "Contact sheets for 6 variations") }],
		},
	];
}

function describeSampleSchedule(schedule: ISampleAutomation['schedule']): IAutomationScheduleDescription {
	if (schedule === 'pullRequestOpened') {
		return { label: automationTriggerSummary({ pull_request_opened: { types: ['opened'] } }) ?? '' };
	}
	return describeAutomationSchedule(schedule);
}

export function getAutomationsSampleData(now: number, readRuns: ReadonlySet<string>): IAutomationsSampleData {
	const automations = getSampleAutomations();
	const sampleRuns = getSampleRuns(now);
	const rows = automations.map((automation): IAutomationLayoutRow => {
		const latest = sampleRuns.filter(run => run.automationId === automation.id).sort((a, b) => b.time - a.time)[0];
		return {
			id: automation.id,
			automation: undefined,
			isSample: true,
			group: automation.group,
			name: automation.name,
			prompt: automation.prompt,
			enabled: automation.enabled !== false,
			schedule: describeSampleSchedule(automation.schedule),
			eventTriggered: automation.schedule === 'pullRequestOpened',
			hostKey: automation.hostKey,
			hostLabel: automation.hostLabel,
			workspace: automation.workspace,
			lastRun: latest ? { time: latest.time, state: latest.state } : undefined,
			canRun: true,
			canUpdate: true,
		};
	});
	const names = new Map(automations.map(automation => [automation.id, automation.name]));
	const runs = sampleRuns.map((run): IAutomationLayoutRun => ({
		id: run.id,
		automationId: run.automationId,
		automationName: names.get(run.automationId) ?? '',
		title: names.get(run.automationId) ?? '',
		state: run.state,
		time: run.time,
		startTime: run.time,
		trigger: run.trigger,
		outcome: run.outcome,
		result: { summary: run.summary, artifacts: run.artifacts ?? [] },
		unread: !!run.unread && !readRuns.has(run.id),
		isSample: true,
		sessionResource: undefined,
		externalResource: undefined,
	}));
	const [disconnected] = getUnavailableAutomationsReasons([{ id: DEVBOX1, label: 'DevBox1', unavailableReasonCode: 'disconnected' }]);
	return { rows, runs, warnings: [{ group: 'personal', reason: disconnected, disconnected: true }] };
}
