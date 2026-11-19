/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType } from '../../../../../platform/instantiation/common/extensions.js';
import { registerWorkbenchContribution2 } from '../../../../common/contributions.js';
import { EditorWindowWorktreeCleanup } from './editorWindowWorktreeCleanup.js';
import { registerEditorWindowSessionsSingleton } from './editorWindowSessionsServices.js';
import { ChatHostOpenerService, IChatHostOpenerService } from '../../../../services/sessions/browser/chatHostOpener.js';
import { ISessionsHostLayoutService } from '../../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ISessionSectionOrderService, SessionSectionOrderService } from '../../../../services/sessions/browser/sessionSectionOrderService.js';
import { ISessionChangesStatsCache, SessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { IAutomationService } from '../../../chat/common/automations/automationService.js';
import { AgentHostFilterService } from '../agentHostFilterService.js';
import { AgentsWindowExtensionSuggestionsService, IAgentsWindowExtensionSuggestionsService } from '../agentsWindowExtensionSuggestions.js';
import { AICustomizationMcpServerCountService, IAICustomizationMcpServerCountService } from '../customizationMcpServerCount.js';
import { ICustomViewService } from '../customView.js';
import { DefaultSessionRepositoryPicker } from '../defaultSessionRepositoryPicker.js';
import { DefaultSessionsListPresentation } from '../defaultSessionsListPresentation.js';
import { IPullRequestIconCache, PullRequestIconCache } from '../github/pullRequestIconCache.js';
import { IPinnedCanvasService } from '../pinnedCanvases.js';
import { SessionComparisonService } from '../sessionComparisonService.js';
import { ISessionGroupsService, SessionGroupsService } from '../sessionGroupsService.js';
import { ISessionOpenTelemetryService, SessionOpenTelemetryService } from '../sessionOpenTelemetryService.js';
import { ISessionRepositoryPicker } from '../sessionRepositoryPicker.js';
import { ISessionsListPresentation } from '../sessionsListPresentation.js';
import { SessionsManagementService } from '../sessionsManagementService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { EditorWindowSessionsProvidersService } from './editorWindowSessionsProvidersService.js';
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from '../sessionsRecentWorkspacesService.js';
import { IAgentHostFilterService } from '../../common/agentHostFilter.js';
import { ISessionComparisonService } from '../../common/sessionComparison.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { EditorWindowAgentFeedbackService, EditorWindowAquariumService, EditorWindowAutomationService, EditorWindowCodeReviewService, EditorWindowCustomViewService, EditorWindowPinnedCanvasService, EditorWindowSideChatPlacementService } from './editorWindowNullServices.js';
import { ISideChatPlacementService } from '../sideChatPlacement.js';
import { ISessionsChatViewStateService, SessionsChatViewStateService } from '../chat/chatViewStateService.js';
import { ISessionsChatBackgroundService, SessionsChatBackgroundService } from '../chatBackgroundService.js';
import { INewSessionComposerService, NewSessionComposerService } from '../newSessionComposerService.js';
import { IAgentFeedbackService } from '../agentFeedback.js';
import { IAquariumService } from '../aquarium.js';
import { ICodeReviewService } from '../codeReviewService.js';
import { ISessionActivityBarActivityService, SessionActivityBarActivityService } from '../../common/sessionActivityBarActivityService.js';
import { IDiffEditorOptionsService } from '../../../../services/editor/common/diffEditorOptionsService.js';
import { DiffEditorOptionsService } from '../../../../services/editor/browser/diffEditorOptionsService.js';
import { EditorWindowSessionsHostLayout } from './editorWindowSessionsHostLayout.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { GitHubService, IGitHubService } from '../github/githubService.js';
import '../sessionAttentionService.js';
import { FocusedSessionHostService, SessionHostService } from '../sessionHostService.js';
import { ISessionWorktreeCleanupService, SessionWorktreeCleanupService } from '../sessionInputBanners/sessionWorktreeCleanupService.js';
import { SessionWorktreeCleanupEditor } from '../sessionInputBanners/sessionWorktreeCleanupEditor.js';
import { ISessionsListModelService, SessionsListModelService } from '../sessionsListModelService.js';
import { ISessionDraftsService, SessionDraftsService } from '../sessionDraftsService.js';
import { IScheduledChatsService, ScheduledChatsService } from '../scheduledChatsService.js';
import { IChatWindowService } from '../../../chatWindow/browser/chatWindow.js';
import { NullChatWindowService } from '../../../chatWindow/browser/nullChatWindowService.js';
import { EditorWindowMainSessionHost, EditorWindowShownChatService, IEditorWindowShownChatService } from '../agentsView/editorWindowMainSessionHost.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { DefaultChatViewFactory } from '../chat/defaultChatViewFactory.js';
// The chat background's commands, for the chat part's chats, which show over it
import '../chatBackgroundActions.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../chat/newChatVoice.js';
import { ISessionChatPillsDebugService, SessionChatPillsDebugService } from '../chat/sessionChatInputToolbarDebug.js';
import { ISessionArchiveNudgeService, SessionArchiveNudgeService } from '../chat/sessionArchiveNudge.js';
import { IWorktreeSuggestionService, WorktreeSuggestionService } from '../worktreeSuggestion/worktreeSuggestionService.js';
import { ISessionChangesService, SessionChangesService } from '../../../sessionChanges/browser/sessionChangesService.js';
import { ChangesViewService } from '../../../sessionChanges/browser/changesViewService.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import { ISessionsService } from '../sessionsService.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import { EditorWindowSessionsService } from '../agentsView/editorWindowSessionsService.js';
import { EditorWindowSessionsNavigationHost } from '../agentsView/editorWindowSessionsNavigationHost.js';
import { EditorWindowSessionsPresenterService, IEditorWindowSessionsPresenterService } from './editorWindowSessionsPresenter.js';
import { EditorWindowSessionsRuntime, IEditorWindowSessionsRuntime } from './editorWindowSessionsRuntime.js';
import { AgentsChatPartFrame, IAgentsChatPartFrame } from '../agentsView/agentsChatPartFrame.js';
import { AgentsChatPartService, IAgentsChatPartService } from '../agentsView/agentsChatPart.js';
import { EditorWindowChatPartService, IEditorWindowChatPartService } from '../agentsView/agentsChatPartContribution.js';
import { EditorWindowComposerFoldersService, IEditorWindowComposerFoldersService } from './editorWindowComposerFolders.js';

// The sessions services of an editor window, for the sessions features it can host. Every one is created only as it is
// first used, and nothing in the window uses them until such a feature does.
registerWorkbenchContribution2(EditorWindowWorktreeCleanup.ID, EditorWindowWorktreeCleanup, { editorTypeId: SessionWorktreeCleanupEditor.ID });
registerEditorWindowSessionsSingleton(ISessionsHostLayoutService, EditorWindowSessionsHostLayout, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsProvidersService, EditorWindowSessionsProvidersService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IPullRequestIconCache, PullRequestIconCache, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ICustomViewService, EditorWindowCustomViewService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAutomationService, EditorWindowAutomationService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IPinnedCanvasService, EditorWindowPinnedCanvasService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISideChatPlacementService, EditorWindowSideChatPlacementService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAgentFeedbackService, EditorWindowAgentFeedbackService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAquariumService, EditorWindowAquariumService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ICodeReviewService, EditorWindowCodeReviewService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionActivityBarActivityService, SessionActivityBarActivityService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IDiffEditorOptionsService, DiffEditorOptionsService, InstantiationType.Delayed);

// The sessions UI that a feature hosts in an editor window, such as a sessions list or the chat part: its hosts, its
// composers' drafts and scheduled requests, and the changes of its sessions, as the Agents window has them
registerEditorWindowSessionsSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionDraftsService, SessionDraftsService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IScheduledChatsService, ScheduledChatsService, InstantiationType.Delayed);
// Editor windows open no separate chat windows: the chats' input toolbars, which inject it, find none
registerEditorWindowSessionsSingleton(IChatWindowService, NullChatWindowService, InstantiationType.Delayed);
// The chat that the window's host shows, which features bind
registerEditorWindowSessionsSingleton(IEditorWindowShownChatService, EditorWindowShownChatService, InstantiationType.Delayed);
// Not delayed: hosts are compared by identity, which a delayed proxy would not keep. It does nothing until a feature binds what it shows
registerEditorWindowSessionsSingleton(ISessionHost, EditorWindowMainSessionHost, InstantiationType.Eager);
// As the Agents window's, so that its chats show over the chat background the user picked
registerEditorWindowSessionsSingleton(IChatViewFactory, DefaultChatViewFactory, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IWorktreeSuggestionService, WorktreeSuggestionService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionChangesService, SessionChangesService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);
// Its sessions and their chats, which its presenter shows: the chat part, while a feature shows them there, or the Chat view
registerEditorWindowSessionsSingleton(ISessionsService, EditorWindowSessionsService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(ISessionsNavigationService, EditorWindowSessionsNavigationHost, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IEditorWindowSessionsPresenterService, EditorWindowSessionsPresenterService, InstantiationType.Delayed);
// Holds the sessions providers for the features that enable it, while what they show shows
registerEditorWindowSessionsSingleton(IEditorWindowSessionsRuntime, EditorWindowSessionsRuntime, InstantiationType.Delayed);

// The chat part, which shows chats of sessions in tabs beside the editor area, once a feature enables it
registerEditorWindowSessionsSingleton(IEditorWindowChatPartService, EditorWindowChatPartService, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAgentsChatPartFrame, AgentsChatPartFrame, InstantiationType.Delayed);
registerEditorWindowSessionsSingleton(IAgentsChatPartService, AgentsChatPartService, InstantiationType.Delayed);
// The folders that the window's new-session composers offer, which reading does not create the chat part for
registerEditorWindowSessionsSingleton(IEditorWindowComposerFoldersService, EditorWindowComposerFoldersService, InstantiationType.Delayed);
