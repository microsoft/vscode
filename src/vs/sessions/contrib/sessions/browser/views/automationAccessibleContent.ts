/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IAutomationDescriptor, IAutomationRun } from '../../../../../workbench/contrib/chat/common/automations/automation.js';
import { type AutomationHistoryState, IAutomationService } from '../../../../../workbench/contrib/chat/common/automations/automationService.js';
import { IChatModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ISessionsManagementService } from '../../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { formatAutomationRunStatus } from './automationCataloguePresentation.js';
import { automationRunWithLocalProgress, isLocalAutomationRunStarting } from './automationRunProgress.js';

export function createAutomationsFocusRestorer(layoutService: IWorkbenchLayoutService): () => void {
	const focusedElement = getActiveElement();
	return () => {
		if (isHTMLElement(focusedElement) && focusedElement.isConnected && focusedElement.checkVisibility()) {
			focusedElement.focus();
		} else {
			layoutService.focusPart(Parts.CUSTOM_VIEW_GRID_PART);
		}
	};
}

/**
 * Splits runs into the ones listed as run history and the automations whose local run is still starting.
 */
export function getAccessibleAutomationRuns(runs: readonly IAutomationRun[], automationService: IAutomationService, sessionsManagementService: ISessionsManagementService): { readonly historyRuns: IAutomationRun[]; readonly startingAutomationIds: ReadonlySet<string> } {
	const sessions = sessionsManagementService.getSessions();
	const hasCatalogedSession = (resource: URI) => sessions.some(session => isEqual(session.resource, resource));
	const hasSession = (resource: URI) => sessionsManagementService.getSession(resource) !== undefined;
	return {
		historyRuns: runs.filter(run => {
			const retainedHistory = automationService.getAutomationHistoryState?.(run.automationId) !== undefined;
			return retainedHistory || (
				!isLocalAutomationRunStarting(run, hasCatalogedSession, hasSession)
				&& (
					!!run.externalResource
					|| (!!run.sessionResource && hasCatalogedSession(run.sessionResource))
				)
			);
		}),
		startingAutomationIds: new Set(runs
			.filter(run => isLocalAutomationRunStarting(run, hasCatalogedSession, hasSession))
			.map(run => run.automationId)),
	};
}

export function getAccessibleRunLines(automations: readonly IAutomationDescriptor[], runs: readonly IAutomationRun[], chatModels: Iterable<IChatModel>, historyName?: (id: string) => string | undefined, retainedHistoryState?: (id: string) => AutomationHistoryState | undefined, canDeleteRetainedHistory?: (id: string) => boolean): string[] {
	const lines: string[] = [];
	const automationNames = new Map(automations.map(automation => [automation.id, automation.name]));
	const announcedHistoryOwners = new Set<string>();
	for (const historyRun of runs) {
		const run = automationRunWithLocalProgress(historyRun, chatModels);
		const name = automationNames.get(run.automationId) ?? historyName?.(run.automationId) ?? localize('automationsAccessibleView.unknown', "Unknown automation");
		lines.push(localize(
			'automationsAccessibleView.run',
			"{0}, {1}, started {2}",
			name,
			formatAutomationRunStatus(run),
			new Date(run.startedAt).toLocaleString(),
		));
		if (run.errorMessage) {
			lines.push(localize('automationsAccessibleView.runError', "Error: {0}", run.errorMessage));
		}
		if (run.externalResource) {
			lines.push(localize('automationsAccessibleView.externalRun', "Open on GitHub: {0}", run.externalResource.toString()));
		}
		const retainedState = retainedHistoryState?.(run.automationId);
		if (retainedState && !announcedHistoryOwners.has(run.automationId)) {
			announcedHistoryOwners.add(run.automationId);
			const available = canDeleteRetainedHistory?.(run.automationId) === true;
			lines.push(retainedState === 'deleting'
				? localize('automationsAccessibleView.historyDeleting', "Deleting run history for {0}.", name)
				: retainedState === 'interrupted'
					? available
						? localize('automationsAccessibleView.historyDeleteRetry', "Run history deletion for {0} was interrupted. Use the run context menu to retry.", name)
						: localize('automationsAccessibleView.historyDeleteRetryUnavailable', "Run history deletion for {0} was interrupted. Retry is currently unavailable.", name)
					: available
						? localize('automationsAccessibleView.historyRetained', "Run history for {0} is retained. Use the run context menu to delete it.", name)
						: localize('automationsAccessibleView.historyRetainedUnavailable', "Run history for {0} is retained. Deletion is currently unavailable.", name));
		}
	}
	return lines;
}
