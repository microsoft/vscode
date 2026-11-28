/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { AccessibleContentProvider, AccessibleViewProviderId, AccessibleViewType } from '../../../../platform/accessibility/browser/accessibleView.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope } from '../../../../platform/storage/common/storage.js';
import { AccessibilityVerbositySettingId } from '../../../../workbench/contrib/accessibility/browser/accessibilityConfiguration.js';
import { IAutomationService } from '../../../../workbench/contrib/chat/common/automations/automationService.js';
import { CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING } from '../../../../workbench/contrib/chat/common/automations/automationsEnabled.js';
import { getShowSharedAutomationsByOthers, SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY } from '../../../../workbench/contrib/chat/common/automations/automationViewState.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { SESSIONS_SEND_LATER_ENABLED_SETTING } from '../../../../workbench/contrib/sessions/common/sessionConfig.js';
import { ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';
import { IWorkbenchLayoutService } from '../../../../workbench/services/layout/browser/layoutService.js';
import { AutomationsCustomViewFocusContext } from '../../../common/agentsWindowContextKeys.js';
import { createAutomationsFocusRestorer, getAccessibleAutomationRuns, getAccessibleRunLines } from '../../sessions/browser/views/automationAccessibleContent.js';
import { describeAutomationSchedule, getAutomationsViewContent, hasOtherSharedSchedules } from '../../sessions/browser/views/automationCataloguePresentation.js';
import { getAutomationsCatalogueMessage, getAutomationsHistoryMessage } from './mobileAutomationsView.js';

export class MobileAutomationsAccessibilityHelp implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.Help;
	readonly priority = 106;
	readonly name = 'sessions-automations-help';
	readonly when = AutomationsCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: AccessibleViewType.Help },
			() => localize('automationsHelp', "Your schedules appear first. Open a schedule for its available actions or details. Use Filter to show or hide schedules when available. New Automation appears when you can create a schedule. Start from scratch or choose a template. Create or Save confirms the form; Cancel discards the draft. Open a recent run to read its chat without starting another run. If loading fails, choose Retry. Use Tab to move between controls, Enter to activate one, and Escape to go back."),
			createAutomationsFocusRestorer(accessor.get(IWorkbenchLayoutService)),
			AccessibilityVerbositySettingId.Automations,
		);
	}
}

export class MobileAutomationsAccessibleView implements IAccessibleViewImplementation {
	readonly type = AccessibleViewType.View;
	readonly priority = 106;
	readonly name = 'sessions-automations-view';
	readonly when = AutomationsCustomViewFocusContext;

	getProvider(accessor: ServicesAccessor): AccessibleContentProvider {
		const automationService = accessor.get(IAutomationService);
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const chatService = accessor.get(IChatService);
		const configurationService = accessor.get(IConfigurationService);
		const storageService = accessor.get(IStorageService);
		const restoreFocus = createAutomationsFocusRestorer(accessor.get(IWorkbenchLayoutService));
		return new AccessibleContentProvider(
			AccessibleViewProviderId.Automations,
			{ type: AccessibleViewType.View },
			() => {
				const allAutomations = automationService.automations.get();
				const sendLater = configurationService.getValue<boolean>(SESSIONS_SEND_LATER_ENABLED_SETTING) === true;
				const { automations, runs } = getAutomationsViewContent(allAutomations, automationService.runs.get(), getShowSharedAutomationsByOthers(storageService), sendLater);
				const { historyRuns, startingAutomationIds } = getAccessibleAutomationRuns(runs, automationService, sessionsManagementService);
				const catalogueState = automationService.catalogueState.get();
				const historyState = automationService.historyState?.get();
				const showDisabled = storageService.getBoolean(SHOW_DISABLED_AUTOMATIONS_STORAGE_KEY, StorageScope.PROFILE, true);
				const visible = automations.filter(item => showDisabled || item.enabled);
				const canFilter = automations.some(item => !item.enabled) ||
					(configurationService.getValue<boolean>(CHAT_CLOUD_AUTOMATIONS_ENABLED_SETTING) && hasOtherSharedSchedules(allAutomations, sendLater));
				const catalogueMessage = getAutomationsCatalogueMessage(catalogueState, automationService.unavailableProviders.get(), visible.length > 0, canFilter);
				const historyMessage = getAutomationsHistoryMessage(startingAutomationIds.size > 0, automations.length > 0 && historyState === 'unavailable' && catalogueState !== 'unavailable', historyRuns.length === 0 && runs.length > 0);
				const lines = [localize('automationsTitle', "Automations")];
				for (const item of visible) {
					lines.push(item.enabled ? localize('automationEnabled', "{0}, enabled", item.name) : localize('automationDisabled', "{0}, disabled", item.name));
					if (item.ownership === 'repository') {
						lines.push(localize('sharedSchedule', "Shared schedule"));
					}
					lines.push(describeAutomationSchedule(item), item.prompt);
					if (item.targetDisplay) {
						lines.push(item.targetDisplay.label);
					}
				}
				if (catalogueMessage) {
					lines.push(catalogueMessage);
				}
				if (catalogueState === 'error' || historyState === 'error') {
					lines.push(localize('retry', "Choose Retry to refresh schedules and recent runs."));
				}
				if (historyRuns.length || historyMessage) {
					lines.push(localize('recentRuns', "Recent runs"));
					if (historyMessage) {
						lines.push(historyMessage);
					}
					lines.push(...getAccessibleRunLines(automations, historyRuns, chatService.chatModels.get(), id => automationService.getAutomationHistoryName?.(id), id => automationService.getAutomationHistoryState?.(id), id => automationService.canDeleteAutomationHistory?.(id) === true));
				}
				return lines.join('\n');
			},
			restoreFocus,
			AccessibilityVerbositySettingId.Automations,
		);
	}
}
