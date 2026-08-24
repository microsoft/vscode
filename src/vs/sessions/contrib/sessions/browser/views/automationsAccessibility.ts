/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibleViewRegistry, IAccessibleViewImplementation } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { AccessibilityVerbositySettingId } from '../../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { DAYS_OF_WEEK } from '../../../../../workbench/contrib/chat/common/automations/schedule.js';
import { Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { AutomationsCustomViewFocusContext } from '../../../../common/contextkeys.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';

class AutomationsCustomViewAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 106;
	readonly name = 'sessions-automations-help';
	readonly when = AutomationsCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const restoreFocus = createFocusRestorer(layoutService);
		const content = [
			localize('automationsCustomView.help.overview', "You are in the Automations view. It contains automation cards followed by run history."),
			localize('automationsCustomView.help.cards', "Tab to a card's Edit control and action buttons. Use Left Arrow and Right Arrow to move between Run now and Delete. Press Enter or Space to activate a control. Edit, or clicking anywhere else on the card, opens the automation dialog. Run now starts a session immediately. Delete asks for confirmation."),
			localize('automationsCustomView.help.history', "Run history is grouped by date. While a run is waiting for its session, a lightweight row shows the automation name with a Working... description. Once the session is available, use Up Arrow and Down Arrow to navigate the Sessions list, Enter to open, and Tab to reach Stop or Delete actions when available. Delete permanently deletes the session and removes it from run history after confirmation."),
			localize('automationsCustomView.help.read', "Completed and failed runs that have not been opened are announced as unread. Use Mark all as read to clear all available unread runs."),
			localize('automationsCustomView.help.accessibleView', "Use Open Accessible View to read the current automations and run history as text."),
		].join('\n');
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: AccessibleViewType.Help },
			() => content,
			restoreFocus,
			AccessibilityVerbositySettingId.Automations,
		);
	}
}

class AutomationsCustomViewAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 106;
	readonly name = 'sessions-automations-view';
	readonly when = AutomationsCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const automationService = accessor.get(IAutomationService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const restoreFocus = createFocusRestorer(layoutService);
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: AccessibleViewType.View },
			() => buildAutomationsAccessibleContent(
				automationService.automations.get(),
				automationService.runs.get().filter(run =>
					run.status === 'pending'
					|| run.status === 'running'
					|| (!!run.sessionResource && !!sessionsManagementService.getSession(run.sessionResource))
				),
			),
			restoreFocus,
			AccessibilityVerbositySettingId.Automations,
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

export function buildAutomationsAccessibleContent(automations: readonly IAutomationDescriptor[], runs: readonly IAutomationRun[]): string {
	const lines = [localize('automationsAccessibleView.title', "Automations")];
	if (automations.length === 0) {
		lines.push(localize('automationsAccessibleView.empty', "No automations."));
	} else {
		for (const automation of automations) {
			lines.push('');
			lines.push(automation.enabled
				? localize('automationsAccessibleView.automation', "{0}, enabled", automation.name)
				: localize('automationsAccessibleView.automationDisabled', "{0}, disabled", automation.name));
			lines.push(localize('automationsAccessibleView.schedule', "Schedule: {0}", formatSchedule(automation)));
			lines.push(localize('automationsAccessibleView.prompt', "Prompt: {0}", automation.prompt));
		}
	}

	lines.push('');
	lines.push(localize('automationsAccessibleView.history', "Run history"));
	if (runs.length === 0) {
		lines.push(localize('automationsAccessibleView.noRuns', "No runs."));
	} else {
		const automationNames = new Map(automations.map(automation => [automation.id, automation.name]));
		for (const run of runs) {
			lines.push(localize(
				'automationsAccessibleView.run',
				"{0}, {1}, started {2}",
				automationNames.get(run.automationId) ?? localize('automationsAccessibleView.unknown', "Unknown automation"),
				formatRunStatus(run),
				new Date(run.startedAt).toLocaleString(),
			));
			if (run.errorMessage) {
				lines.push(localize('automationsAccessibleView.runError', "Error: {0}", run.errorMessage));
			}
		}
	}
	return lines.join('\n');
}

function formatSchedule(automation: IAutomationDescriptor): string {
	const schedule = automation.schedule;
	switch (schedule.interval) {
		case 'manual':
			return localize('automationsAccessibleView.manual', "Manual");
		case 'hourly':
			return localize('automationsAccessibleView.hourly', "Hourly");
		case 'daily':
			return localize('automationsAccessibleView.daily', "Daily at {0}", formatTime(schedule.scheduleHour, schedule.scheduleMinute));
		case 'weekly':
			return localize(
				'automationsAccessibleView.weekly',
				"{0} at {1}",
				DAYS_OF_WEEK[((schedule.scheduleDay % 7) + 7) % 7],
				formatTime(schedule.scheduleHour, schedule.scheduleMinute),
			);
	}
}

function formatTime(hour: number, minute: number): string {
	const date = new Date(Date.UTC(2000, 0, 1, Math.max(0, Math.min(23, hour | 0)), Math.max(0, Math.min(59, minute | 0))));
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

function formatRunStatus(run: IAutomationRun): string {
	switch (run.status) {
		case 'pending':
			return localize('automationsAccessibleView.pending', "Pending");
		case 'running':
			return localize('automationsAccessibleView.running', "Running");
		case 'completed':
			return localize('automationsAccessibleView.completed', "Completed");
		case 'failed':
			return localize('automationsAccessibleView.failed', "Failed");
	}
}

AccessibleViewRegistry.register(new AutomationsCustomViewAccessibilityHelp());
AccessibleViewRegistry.register(new AutomationsCustomViewAccessibleView());
