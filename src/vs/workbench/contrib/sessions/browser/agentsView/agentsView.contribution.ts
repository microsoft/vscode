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
import { IFocusedSessionHostService, ISessionHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
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
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { EditorWindowSessionsProvidersService } from './editorWindowSessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { ISessionAttentionService } from '../../common/sessionAttentionService.js';
import { ISessionComparisonService } from '../../common/sessionComparison.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { AgentsViewAgentFeedbackService, AgentsViewAquariumService, AgentsViewAutomationService, AgentsViewCodeReviewService, AgentsViewCustomViewService, AgentsViewPinnedCanvasService } from './agentsViewNullServices.js';
import { AgentsChatPartService, IAgentsChatPartService } from './agentsChatPart.js';
import { AgentsViewFolderLocationService, IAgentsViewFolderLocationService } from './agentsViewFolderLocation.js';
import { AgentsChatPartFrame, IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { EditorWindowSessionsService } from './editorWindowSessionsService.js';
import { EditorWindowMainSessionHost } from './editorWindowMainSessionHost.js';
import { ISessionsService } from '../sessionsService.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { DefaultChatViewFactory } from '../chat/defaultChatViewFactory.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../chat/chatViewStateService.js';
import { ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../chatBackgroundService.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../chat/newChatVoice.js';
import { ISessionChatPillsDebugService, SessionChatPillsDebugService } from '../chat/sessionChatInputToolbarDebug.js';
import { INewSessionComposerService, NewSessionComposerService } from '../newSessionComposerService.js';
import { ISessionArchiveNudgeService, SessionArchiveNudgeService } from '../chat/sessionArchiveNudge.js';
import { IWorktreeSuggestionService, WorktreeSuggestionService } from '../worktreeSuggestion/worktreeSuggestionService.js';
import { IAgentFeedbackService } from '../agentFeedback.js';
import { IAquariumService } from '../aquarium.js';
import { ICodeReviewService } from '../codeReviewService.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../common/sessionActivityBarActivityService.js';
import { ISessionChangesService, SessionChangesService } from '../../../sessionChanges/browser/sessionChangesService.js';
import { ChangesViewService } from '../../../sessionChanges/browser/changesViewService.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import { IDiffEditorOptionsService } from '../../../../services/editor/common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../../../services/editor/browser/diffEditorOptionsService.js';
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
registerSingleton(ISessionsNavigationHost, EditorWindowSessionsNavigationHost, InstantiationType.Delayed);
registerSingleton(ISessionsHostLayoutService, EditorWindowSessionsHostLayout, InstantiationType.Delayed);
registerSingleton(ISessionsProvidersService, EditorWindowSessionsProvidersService, InstantiationType.Delayed);
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
registerSingleton(IAgentFeedbackService, AgentsViewAgentFeedbackService, InstantiationType.Delayed);
registerSingleton(IAquariumService, AgentsViewAquariumService, InstantiationType.Delayed);
registerSingleton(ICodeReviewService, AgentsViewCodeReviewService, InstantiationType.Delayed);

// The chat part, and the chats it shows
registerSingleton(IAgentsChatPartFrame, AgentsChatPartFrame, InstantiationType.Delayed);
registerSingleton(IAgentsChatPartService, AgentsChatPartService, InstantiationType.Delayed);
registerSingleton(IAgentsViewFolderLocationService, AgentsViewFolderLocationService, InstantiationType.Delayed);
// Not delayed: hosts are compared by identity, which a delayed proxy would not keep
registerSingleton(ISessionHost, EditorWindowMainSessionHost, InstantiationType.Eager);
registerSingleton(ISessionsService, EditorWindowSessionsService, InstantiationType.Delayed);
// As the Agents window's, so that its chats show over the chat background the user picked
registerSingleton(IChatViewFactory, DefaultChatViewFactory, InstantiationType.Delayed);
registerSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);
registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
registerSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
registerSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Delayed);
registerSingleton(IWorktreeSuggestionService, WorktreeSuggestionService, InstantiationType.Delayed);
registerSingleton(ISessionActivityBarActivityService, SessionActivityBarActivityService, InstantiationType.Delayed);
registerSingleton(ISessionChangesService, SessionChangesService, InstantiationType.Delayed);
registerSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);
registerSingleton(IDiffEditorOptionsService, DiffEditorOptionsService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentsViewGate.ID, AgentsViewGate, WorkbenchPhase.BlockStartup);
