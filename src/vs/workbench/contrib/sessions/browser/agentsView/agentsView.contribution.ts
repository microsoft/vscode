/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../services/sessions/browser/chatHostOpener.js';
import { IFocusedSessionHostService, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionsStorageService } from '../../../../services/sessions/browser/sessionsStorageService.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IAutomationService } from '../../../chat/common/automations/automationService.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AgentHostFilterService } from '../agentHostFilterService.js';
import { AgentsWindowExtensionSuggestionsService, IAgentsWindowExtensionSuggestionsService } from '../agentsWindowExtensionSuggestions.js';
import { AICustomizationMcpServerCountService, IAICustomizationMcpServerCountService } from '../customizationMcpServerCount.js';
import { ICustomViewService } from '../customView.js';
import { DefaultSessionRepositoryPicker } from '../defaultSessionRepositoryPicker.js';
import { DefaultSessionsListPresentation } from '../defaultSessionsListPresentation.js';
import { GitHubService, IGitHubService } from '../github/githubService.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../github/pullRequestIconCache.js';
import { IPinnedCanvasService } from '../pinnedCanvases.js';
import { SessionAttentionService } from '../sessionAttentionService.js';
import { SessionComparisonService } from '../sessionComparisonService.js';
import { ISessionGroupsService, SessionGroupsService } from '../sessionGroupsService.js';
import { FocusedSessionHostService, SessionHostService } from '../sessionHostService.js';
import { ISessionWorktreeCleanupService, SessionWorktreeCleanupService } from '../sessionInputBanners/sessionWorktreeCleanupService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../sessionOpenTelemetryService.js';
import { ISessionRepositoryPicker } from '../sessionRepositoryPicker.js';
import { ISessionsListModelService, SessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsListPresentation } from '../sessionsListPresentation.js';
import { SessionsManagementService } from '../sessionsManagementService.js';
import { ISessionsNavigationHost } from '../sessionsNavigationHost.js';
import { ISessionsProvidersService, SessionsProvidersService } from '../sessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { ISessionAttentionService } from '../../common/sessionAttentionService.js';
import { ISessionComparisonService } from '../../common/sessionComparison.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { AgentsProfileSessionsStorageService } from './agentsProfileSessionsStorageService.js';
import { AgentsViewAutomationService, AgentsViewCustomViewService, AgentsViewPinnedCanvasService } from './agentsViewNullServices.js';
import { AgentsViewGate } from './agentsViewGate.js';
import { EditorWindowSessionsHostLayout } from './editorWindowSessionsHostLayout.js';
import { EditorWindowSessionsNavigationHost } from './editorWindowSessionsNavigationHost.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.AgentsViewEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			markdownDescription: localize('chat.agentsView.enabled', "Controls whether the Sessions view of the Agents window shows in the Primary Side Bar of editor windows. Requires a reload to take effect."),
		},
	},
});

// The services of the Sessions view. They are only created once the view shows, which it only does while the setting is on.
registerSingleton(ISessionsStorageService, AgentsProfileSessionsStorageService, InstantiationType.Delayed);
registerSingleton(ISessionsNavigationHost, EditorWindowSessionsNavigationHost, InstantiationType.Delayed);
registerSingleton(ISessionsHostLayoutService, EditorWindowSessionsHostLayout, InstantiationType.Delayed);
registerSingleton(ISessionsProvidersService, SessionsProvidersService, InstantiationType.Delayed);
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);
registerSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
registerSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
registerSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
registerSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
registerSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
registerSingleton(ISessionAttentionService, SessionAttentionService, InstantiationType.Delayed);
registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
registerSingleton(IPullRequestIconCache, PullRequestIconCache, InstantiationType.Delayed);
registerSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);
registerSingleton(IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService, InstantiationType.Delayed);
registerSingleton(IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService, InstantiationType.Delayed);
registerSingleton(ICustomViewService, AgentsViewCustomViewService, InstantiationType.Delayed);
registerSingleton(IAutomationService, AgentsViewAutomationService, InstantiationType.Delayed);
registerSingleton(IPinnedCanvasService, AgentsViewPinnedCanvasService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentsViewGate.ID, AgentsViewGate, WorkbenchPhase.BlockStartup);
