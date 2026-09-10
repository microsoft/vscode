/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../base/browser/dom.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { localize } from '../../../../nls.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { formatCopilotCreditsLabel } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { Parts } from '../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { AgentsDashboardCustomViewFocusContext } from '../../../common/contextkeys.js';
import { SessionStatus } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { AgentsDashboardHistoryEvent, buildAgentsDashboardHistoryBuckets, IAgentsDashboardHistoryBucket, IAgentsDashboardHistoryService } from '../common/agentsDashboardHistory.js';
import { buildAgentsDashboardSummary, buildSessionRows } from '../common/agentsDashboardModel.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService } from '../common/worktreeDashboard.js';

class AgentsDashboardAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 106;
	readonly name = 'sessions-agents-dashboard-help';
	readonly when = AgentsDashboardCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		const content = [
			localize('agentsDashboard.help.overview', "You are in the Agents Dashboard. It contains historical statistics and a Sessions table with working directories, worktree size, credits, and status."),
			localize('agentsDashboard.help.tabs', "Use the Statistics and Sessions tabs to switch between historical graphs and the session table. Use Left Arrow and Right Arrow while a tab is focused."),
			localize('agentsDashboard.help.range', "The Statistics tab can show Today, 7 days, or 30 days. Use Tab to reach the range buttons and press Enter or Space to select a range."),
			localize('agentsDashboard.help.tables', "Use Up Arrow and Down Arrow to navigate a table. Press Enter to open a session."),
			localize('agentsDashboard.help.sessionActions', "Session actions appear when a row is hovered or focused. Each session can be archived or unarchived, and deleted when its provider supports deletion. Deletion asks for confirmation."),
			localize('agentsDashboard.help.refresh', "Use the Refresh action beside the command center to rescan worktrees and disk usage."),
			localize('agentsDashboard.help.accessibleView', "Use Open Accessible View to read the current dashboard as text."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AgentsDashboard,
			{ type: AccessibleViewType.Help },
			() => content,
			restoreFocus,
			AccessibilityVerbositySettingId.AgentsDashboard,
		);
	}
}

class AgentsDashboardAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 106;
	readonly name = 'sessions-agents-dashboard-view';
	readonly when = AgentsDashboardCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const sessions = accessor.get(ISessionsManagementService).getSessions();
		const worktrees = accessor.get(IWorktreeDashboardService).entries.get();
		const history = accessor.get(IAgentsDashboardHistoryService).events.get();
		const restoreFocus = createFocusRestorer(accessor.get(IAgentWorkbenchLayoutService));
		return new AccessibleContentProvider(
			AccessibleViewProviderId.AgentsDashboard,
			{ type: AccessibleViewType.View },
			() => buildAgentsDashboardAccessibleContent(sessions, worktrees, history),
			restoreFocus,
			AccessibilityVerbositySettingId.AgentsDashboard,
		);
	}
}

function createFocusRestorer(layoutService: IAgentWorkbenchLayoutService): () => void {
	const focusedElement = getActiveElement();
	return () => {
		if (isHTMLElement(focusedElement) && focusedElement.isConnected) {
			focusedElement.focus();
		} else {
			layoutService.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
		}
	};
}

export function buildAgentsDashboardAccessibleContent(
	sessions: Parameters<typeof buildSessionRows>[0],
	worktrees: readonly IWorktreeDashboardEntry[],
	history: readonly AgentsDashboardHistoryEvent[] = [],
): string {
	const lines = [
		localize('agentsDashboard.accessible.title', "Agents Dashboard"),
		'',
		localize('agentsDashboard.accessible.summary', "Summary"),
	];

	const sessionRows = buildSessionRows(sessions, worktrees);
	const summary = buildAgentsDashboardSummary(sessionRows);
	const now = Date.now();
	lines.push(
		localize('agentsDashboard.accessible.sessionCount', "{0} sessions, {1} active, {2} archived.", summary.sessions, summary.activeSessions, summary.archivedSessions),
		localize('agentsDashboard.accessible.done', "{0} sessions done, with {1} pull requests.", summary.doneSessions, summary.pullRequests),
		localize(
			'agentsDashboard.accessible.diskUsage',
			"Disk usage: {0} across session worktrees.",
			ByteSize.formatSize(summary.worktreeSizeBytes),
		),
		'',
		localize('agentsDashboard.accessible.statistics', "Statistics"),
		formatHistorySummary(localize('agentsDashboard.accessible.today', "Today"), buildAgentsDashboardHistoryBuckets(history, 'today', now)),
		formatHistorySummary(localize('agentsDashboard.accessible.week', "Last 7 days"), buildAgentsDashboardHistoryBuckets(history, 'week', now)),
		formatHistorySummary(localize('agentsDashboard.accessible.month', "Last 30 days"), buildAgentsDashboardHistoryBuckets(history, 'month', now)),
		'',
		localize('agentsDashboard.accessible.sessions', "Sessions"),
	);

	if (sessionRows.length === 0) {
		lines.push(localize('agentsDashboard.accessible.noSessions', "No sessions."));
	} else {
		for (const row of sessionRows) {
			const workingDirectories = row.workingDirectories.length === 0
				? localize('agentsDashboard.accessible.noWorkingDirectory', "none")
				: row.workingDirectories.map(directory => directory.isWorktree
					? localize('agentsDashboard.accessible.worktreeDirectory', "{0} (worktree)", directory.path)
					: localize('agentsDashboard.accessible.folderDirectory', "{0} (folder)", directory.path)).join(', ');
			lines.push(localize(
				'agentsDashboard.accessible.session',
				"{0}, working directories {1}, size {2}, credits {3}, status {4}.",
				row.title,
				workingDirectories,
				row.worktreeSizeBytes === undefined ? localize('agentsDashboard.accessible.sizeUnknown', "unknown") : ByteSize.formatSize(row.worktreeSizeBytes),
				row.credits === undefined ? localize('agentsDashboard.accessible.creditsUnknownValue', "unknown") : formatCopilotCreditsLabel(row.credits),
				getAccessibleSessionStatus(row),
			));
		}
	}

	return lines.join('\n');
}

function sum(values: readonly number[]): number {
	return values.reduce((total, value) => total + value, 0);
}

function formatHistorySummary(label: string, buckets: readonly IAgentsDashboardHistoryBucket[]): string {
	return localize(
		'agentsDashboard.accessible.historySummary',
		"{0}: {1} sessions started, {2} sessions done, {3} pull requests created, {4} pull requests merged, median completion time {5}, latest disk usage {6}, median session storage {7}, largest session storage {8}.",
		label,
		sum(buckets.map(bucket => bucket.sessionsStarted)),
		sum(buckets.map(bucket => bucket.sessionsDone)),
		sum(buckets.map(bucket => bucket.pullRequestsCreated)),
		sum(buckets.map(bucket => bucket.pullRequestsMerged)),
		formatMedianDuration(buckets.map(bucket => bucket.medianCompletionDurationMs)),
		ByteSize.formatSize(buckets.findLast(bucket => bucket.diskUsageBytes !== undefined)?.diskUsageBytes ?? 0),
		ByteSize.formatSize(buckets.findLast(bucket => bucket.medianSessionStorageBytes !== undefined)?.medianSessionStorageBytes ?? 0),
		ByteSize.formatSize(buckets.findLast(bucket => bucket.largestSessionStorageBytes !== undefined)?.largestSessionStorageBytes ?? 0),
	);
}

function formatMedianDuration(values: readonly (number | undefined)[]): string {
	const durations = values.filter((value): value is number => value !== undefined).sort((a, b) => a - b);
	if (durations.length === 0) {
		return localize('agentsDashboard.accessible.noDuration', "no completed sessions");
	}
	const middle = Math.floor(durations.length / 2);
	const median = durations.length % 2 === 0 ? (durations[middle - 1] + durations[middle]) / 2 : durations[middle];
	const minutes = median / 60_000;
	return minutes < 60
		? localize('agentsDashboard.accessible.durationMinutes', "{0} minutes", Math.round(minutes))
		: localize('agentsDashboard.accessible.durationHours', "{0} hours", parseFloat((minutes / 60).toFixed(1)));
}

function getAccessibleSessionStatus(row: ReturnType<typeof buildSessionRows>[number]): string {
	if (row.archived) {
		return localize('agentsDashboard.accessible.status.archived', "archived");
	}
	switch (row.status) {
		case SessionStatus.Untitled:
			return localize('agentsDashboard.accessible.status.new', "new");
		case SessionStatus.InProgress:
			return localize('agentsDashboard.accessible.status.working', "working");
		case SessionStatus.NeedsInput:
			return localize('agentsDashboard.accessible.status.inputNeeded', "input needed");
		case SessionStatus.Completed:
			return localize('agentsDashboard.accessible.status.done', "done");
		case SessionStatus.Error:
			return localize('agentsDashboard.accessible.status.failed', "failed");
	}
}

AccessibleViewRegistry.register(new AgentsDashboardAccessibilityHelp());
AccessibleViewRegistry.register(new AgentsDashboardAccessibleView());
