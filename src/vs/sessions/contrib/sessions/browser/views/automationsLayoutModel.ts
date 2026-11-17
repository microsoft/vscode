/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { isMacintosh, isWindows } from '../../../../../base/common/platform.js';
import type { URI } from '../../../../../base/common/uri.js';
import type { AutomationRunTrigger, IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { ISessionArtifact, ISessionChangesSummary, SessionArtifactKind } from '../../../../../workbench/services/sessions/common/session.js';
import type { IAutomationScheduleDescription } from './automationsLayoutSchedule.js';
import type { IAutomationTemplate } from './automationTemplates.js';

/** Navigation items of the experimental Automations layouts, in order. */
export type AutomationsNavId = 'all' | 'personal' | 'cloud' | 'repository' | 'runs' | 'examples';
export const AUTOMATIONS_NAV_IDS: readonly AutomationsNavId[] = ['all', 'personal', 'cloud', 'repository', 'runs', 'examples'];

export type AutomationGroupId = 'personal' | 'cloud' | 'repository';
export type AutomationsSectionId = AutomationGroupId | 'disabled';
export type AutomationRunState = 'completed' | 'failed' | 'running' | 'needsInput';
export type AutomationStatusFilter = 'on' | 'off' | 'failed';

/** Filter key for automations that run on this machine. */
export const LOCAL_AUTOMATION_HOST = 'local';
/** Filter key for automations that run on GitHub. */
export const CLOUD_AUTOMATION_HOST = 'cloud';

/** How the layouts name the machine they run on, such as "This Mac" or "This PC". */
export function getThisMachineLabel(): string {
	return isMacintosh
		? localize('automationsLayout.thisMac', "This Mac")
		: isWindows ? localize('automationsLayout.thisPC', "This PC") : localize('automationsLayout.thisComputer', "This computer");
}

/** One automation as a row of the experimental layouts. */
export interface IAutomationLayoutRow {
	readonly id: string;
	/** Undefined for sample data. */
	readonly automation: IAutomationDescriptor | undefined;
	readonly isSample: boolean;
	readonly group: AutomationGroupId;
	readonly name: string;
	readonly prompt: string;
	readonly enabled: boolean;
	readonly schedule: IAutomationScheduleDescription;
	readonly eventTriggered: boolean;
	/** {@link LOCAL_AUTOMATION_HOST}, {@link CLOUD_AUTOMATION_HOST}, or the provider ID of a remote host. */
	readonly hostKey: string;
	/** Such as "This Mac", "DevBox1" or "Cloud". */
	readonly hostLabel: string;
	/** The folder an automation works in, or the repository of a cloud automation. */
	readonly workspace: string | undefined;
	readonly lastRun: { readonly time: number; readonly state: AutomationRunState | undefined } | undefined;
	readonly canRun: boolean;
	readonly canUpdate: boolean;
}

export interface IAutomationLayoutRun {
	readonly id: string;
	readonly automationId: string;
	readonly automationName: string;
	/** The run's session title, or the automation's name. */
	readonly title: string;
	readonly state: AutomationRunState;
	/** When the run last changed: its latest update while it's running, otherwise when it finished. */
	readonly time: number;
	/** When the run started, which orders an automation's runs. */
	readonly startTime: number;
	readonly trigger: AutomationRunTrigger | undefined;
	/** The provider's own words about the run: why it failed, how it ended, or what it's doing now. */
	readonly outcome: string | undefined;
	/** What the run produced. Undefined while its session isn't available, so nothing is known about it. */
	readonly result: IAutomationLayoutRunResult | undefined;
	readonly unread: boolean;
	readonly isSample: boolean;
	readonly sessionResource: URI | undefined;
	readonly externalResource: URI | undefined;
}

/** What a run produced, as far as its session reports it. */
export interface IAutomationLayoutRunResult {
	/** A short summary of what the run did. Only sample data has one; providers don't report summaries. */
	readonly summary?: string;
	/** The artifacts the run's session recorded, in the order the Agents window lists them. */
	readonly artifacts: readonly IAutomationLayoutArtifact[];
	/** The file changes the run's session reports. */
	readonly changes?: ISessionChangesSummary;
}

export interface IAutomationLayoutArtifact {
	readonly kind: SessionArtifactKind;
	readonly label: string;
}

export interface IAutomationLayoutExample {
	readonly template: IAutomationTemplate;
	readonly schedule: IAutomationScheduleDescription;
	/** "Built in", or the name of the plugin that provides it. */
	readonly source: string;
}

/** An unavailable provider, shown as a warning badge on the navigation item it affects. */
export interface IAutomationLayoutWarning {
	readonly group: 'personal' | 'cloud';
	readonly reason: string;
	/** Whether the provider is disconnected, so Manage Remotes can help. */
	readonly disconnected: boolean;
}

export interface IAutomationsLayoutFilters {
	readonly hosts: readonly string[];
	readonly statuses: readonly AutomationStatusFilter[];
	readonly workspaces: readonly string[];
}

export const EMPTY_AUTOMATIONS_LAYOUT_FILTERS: IAutomationsLayoutFilters = { hosts: [], statuses: [], workspaces: [] };

export interface IAutomationLayoutSection {
	readonly id: AutomationsSectionId;
	readonly rows: readonly IAutomationLayoutRow[];
}

export interface IAutomationLayoutRunGroup {
	readonly key: string;
	readonly label: string;
	readonly runs: readonly IAutomationLayoutRun[];
}

/** Repository-owned automations are shared; other automations that run on GitHub are Cloud; the rest are Personal. */
export function classifyAutomation(automation: IAutomationDescriptor, isCloudProvider: (providerId: string | undefined) => boolean): AutomationGroupId {
	if (automation.ownership === 'repository') {
		return 'repository';
	}
	if (automation.cloudTrigger !== undefined || automation.ownership !== undefined || isCloudProvider(automation.target.providerId)) {
		return 'cloud';
	}
	return 'personal';
}

export function getAutomationRunState(run: Pick<IAutomationRun, 'status' | 'needsInput'>): AutomationRunState {
	switch (run.status) {
		case 'completed':
			return 'completed';
		case 'failed':
			return 'failed';
		default:
			return run.needsInput ? 'needsInput' : 'running';
	}
}

/** Counts of enabled automations per group, unread runs, and examples. */
export function getAutomationNavCounts(rows: readonly IAutomationLayoutRow[], runs: readonly IAutomationLayoutRun[], examples: readonly IAutomationLayoutExample[]): Record<AutomationsNavId, number> {
	const enabled = rows.filter(row => row.enabled);
	return {
		all: enabled.length,
		personal: enabled.filter(row => row.group === 'personal').length,
		cloud: enabled.filter(row => row.group === 'cloud').length,
		repository: enabled.filter(row => row.group === 'repository').length,
		runs: runs.filter(run => run.unread).length,
		examples: examples.length,
	};
}

/** Warnings show on Personal or Cloud, and on All automations. */
export function getAutomationNavWarnings(warnings: readonly IAutomationLayoutWarning[], nav: AutomationsNavId): readonly IAutomationLayoutWarning[] {
	switch (nav) {
		case 'all':
			return warnings;
		case 'personal':
		case 'cloud':
			return warnings.filter(warning => warning.group === nav);
		default:
			return [];
	}
}

export function isAutomationsFilterActive(filters: IAutomationsLayoutFilters): boolean {
	return filters.hosts.length > 0 || filters.statuses.length > 0 || filters.workspaces.length > 0;
}

function matchesQuery(query: string, ...values: readonly string[]): boolean {
	const normalized = query.trim().toLocaleLowerCase();
	return !normalized || values.some(value => value.toLocaleLowerCase().includes(normalized));
}

function matchesStatus(row: IAutomationLayoutRow, status: AutomationStatusFilter): boolean {
	switch (status) {
		case 'on':
			return row.enabled;
		case 'off':
			return !row.enabled;
		case 'failed':
			return row.lastRun?.state === 'failed';
	}
}

/** Search matches names and prompts; each kind of filter matches any of its selected options. */
export function filterAutomationRows(rows: readonly IAutomationLayoutRow[], query: string, filters: IAutomationsLayoutFilters): IAutomationLayoutRow[] {
	return rows.filter(row => matchesQuery(query, row.name, row.prompt)
		&& (filters.hosts.length === 0 || filters.hosts.includes(row.hostKey))
		&& (filters.workspaces.length === 0 || (row.workspace !== undefined && filters.workspaces.includes(row.workspace)))
		&& (filters.statuses.length === 0 || filters.statuses.some(status => matchesStatus(row, status))));
}

export function filterAutomationRuns(runs: readonly IAutomationLayoutRun[], query: string): IAutomationLayoutRun[] {
	return runs.filter(run => matchesQuery(query, run.title, run.automationName));
}

export function filterAutomationExamples(examples: readonly IAutomationLayoutExample[], query: string): IAutomationLayoutExample[] {
	return examples.filter(example => matchesQuery(query, example.template.name, example.template.prompt));
}

/**
 * The sections of All automations or of one group, without empty ones. Disabled automations of
 * every group shown sit in the last section.
 */
export function getAutomationLayoutSections(rows: readonly IAutomationLayoutRow[], nav: 'all' | AutomationGroupId): IAutomationLayoutSection[] {
	const groups: readonly AutomationGroupId[] = nav === 'all' ? ['personal', 'cloud', 'repository'] : [nav];
	const shown = rows.filter(row => groups.includes(row.group));
	const sections: IAutomationLayoutSection[] = groups.map(id => ({ id, rows: shown.filter(row => row.group === id && row.enabled) }));
	sections.push({ id: 'disabled', rows: shown.filter(row => !row.enabled) });
	return sections.filter(section => section.rows.length > 0);
}

/** Groups runs, newest first, into Today, Yesterday, Last week and then by month. */
export function groupAutomationRunsByDay(runs: readonly IAutomationLayoutRun[], now: number): IAutomationLayoutRunGroup[] {
	const date = new Date(now);
	const today = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
	const yesterday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime();
	const lastWeek = new Date(date.getFullYear(), date.getMonth(), date.getDate() - 7).getTime();
	const groups = new Map<string, { key: string; label: string; order: number; runs: IAutomationLayoutRun[] }>();
	for (const run of [...runs].sort((a, b) => b.time - a.time)) {
		let key: string;
		let label: string;
		let order: number;
		if (run.time >= today) {
			key = 'today';
			label = localize('automationsLayout.today', "Today");
			order = 0;
		} else if (run.time >= yesterday) {
			key = 'yesterday';
			label = localize('automationsLayout.yesterday', "Yesterday");
			order = 1;
		} else if (run.time >= lastWeek) {
			key = 'week';
			label = localize('automationsLayout.lastWeek', "Last week");
			order = 2;
		} else {
			const month = new Date(run.time);
			key = `month-${month.getFullYear()}-${month.getMonth()}`;
			label = month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
			order = 30000 - (month.getFullYear() * 12 + month.getMonth());
		}
		let group = groups.get(key);
		if (!group) {
			group = { key, label, order, runs: [] };
			groups.set(key, group);
		}
		group.runs.push(run);
	}
	return [...groups.values()].sort((a, b) => a.order - b.order).map(({ key, label, runs }) => ({ key, label, runs }));
}

/** The repository named by the Repository section, when all its automations share one. */
export function getSharedRepositoryLabel(rows: readonly IAutomationLayoutRow[]): string | undefined {
	const repositories = new Set(rows.filter(row => row.group === 'repository').map(row => row.workspace));
	const [repository] = repositories;
	return repositories.size === 1 ? repository : undefined;
}

/** The order the Agents window lists a session's artifacts in. */
const ARTIFACT_KIND_ORDER: readonly SessionArtifactKind[] = [
	SessionArtifactKind.PullRequest,
	SessionArtifactKind.Issue,
	SessionArtifactKind.Commit,
	SessionArtifactKind.Website,
	SessionArtifactKind.File,
	SessionArtifactKind.Resource,
];

function getArtifactKindOrder(kind: SessionArtifactKind): number {
	const index = ARTIFACT_KIND_ORDER.indexOf(kind);
	return index === -1 ? ARTIFACT_KIND_ORDER.length : index;
}

/** What a session produced, leaving out the references it only points at, in the order the Agents window lists them. */
export function getAutomationRunArtifacts(artifacts: readonly ISessionArtifact[]): IAutomationLayoutArtifact[] {
	return artifacts
		.map((artifact, index) => ({ artifact, index }))
		.filter(({ artifact }) => artifact.isArtifact)
		.sort((a, b) => getArtifactKindOrder(a.artifact.kind) - getArtifactKindOrder(b.artifact.kind) || a.index - b.index)
		.map(({ artifact }) => ({ kind: artifact.kind, label: artifact.label }));
}

/** Whether a run has anything to show as its result: a summary, an artifact or changed files. */
export function hasAutomationRunResult(result: IAutomationLayoutRunResult | undefined): result is IAutomationLayoutRunResult {
	return !!result && (!!result.summary || result.artifacts.length > 0 || (result.changes?.files ?? 0) > 0);
}

/** Newest first: by when runs started, then by when they last changed. */
function compareRunsNewestFirst(a: IAutomationLayoutRun, b: IAutomationLayoutRun): number {
	return b.startTime - a.startTime || b.time - a.time || a.id.localeCompare(b.id);
}

/** What the details of an automation show about its runs. */
export interface IAutomationLayoutDetails {
	/** Its runs, newest first. */
	readonly runs: readonly IAutomationLayoutRun[];
	readonly latestRun: IAutomationLayoutRun | undefined;
	/**
	 * The newest successful run that has a result. When `fromLatestRun` is false, a newer run failed, is still going,
	 * or has nothing to show, so the result belongs to this earlier run and is labeled as such.
	 */
	readonly latestResult: { readonly run: IAutomationLayoutRun; readonly fromLatestRun: boolean } | undefined;
}

export function getAutomationLayoutDetails(runs: readonly IAutomationLayoutRun[], automationId: string): IAutomationLayoutDetails {
	const own = runs.filter(run => run.automationId === automationId).sort(compareRunsNewestFirst);
	const latestRun = own[0];
	const resultRun = own.find(run => run.state === 'completed' && hasAutomationRunResult(run.result));
	return {
		runs: own,
		latestRun,
		latestResult: resultRun ? { run: resultRun, fromLatestRun: resultRun === latestRun } : undefined,
	};
}

/**
 * Where opening a run goes: its own session, or its page on GitHub when only that is known, the same order
 * `AutomationsLayoutActions.openRun` uses. Otherwise nowhere, with the reason.
 */
export type AutomationRunDestination =
	| { readonly kind: 'session'; readonly resource: URI }
	| { readonly kind: 'external'; readonly resource: URI }
	| { readonly kind: 'none'; readonly reason: 'sample' | 'notLinked' | 'noSession' };

export function getAutomationRunDestination(run: IAutomationLayoutRun): AutomationRunDestination {
	if (run.isSample) {
		return { kind: 'none', reason: 'sample' };
	}
	if (run.sessionResource) {
		return { kind: 'session', resource: run.sessionResource };
	}
	if (run.externalResource) {
		return { kind: 'external', resource: run.externalResource };
	}
	// A host links a run's session only once it has created it.
	return { kind: 'none', reason: run.state === 'running' || run.state === 'needsInput' ? 'notLinked' : 'noSession' };
}
