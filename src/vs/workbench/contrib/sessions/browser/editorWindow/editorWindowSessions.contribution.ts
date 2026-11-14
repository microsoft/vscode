/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
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
import { EditorWindowAgentFeedbackService, EditorWindowAquariumService, EditorWindowAutomationService, EditorWindowCodeReviewService, EditorWindowCustomViewService, EditorWindowPinnedCanvasService } from './editorWindowNullServices.js';
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
import { ISessionsListModelService, SessionsListModelService } from '../sessionsListModelService.js';
import { ISessionDraftsService, SessionDraftsService } from '../sessionDraftsService.js';
import { IScheduledChatsService, ScheduledChatsService } from '../scheduledChatsService.js';
import { IChatWindowService } from '../../../chatWindow/browser/chatWindow.js';
import { NullChatWindowService } from '../../../chatWindow/browser/nullChatWindowService.js';
import { EditorWindowMainSessionHost } from '../agentsView/editorWindowMainSessionHost.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { DefaultChatViewFactory } from '../chat/defaultChatViewFactory.js';
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
registerSingleton(ISessionsHostLayoutService, EditorWindowSessionsHostLayout, InstantiationType.Delayed);
registerSingleton(ISessionsProvidersService, EditorWindowSessionsProvidersService, InstantiationType.Delayed);
registerSingleton(ISessionsManagementService, SessionsManagementService, InstantiationType.Delayed);
registerSingleton(IChatHostOpenerService, ChatHostOpenerService, InstantiationType.Delayed);
registerSingleton(ISessionChangesStatsCache, SessionChangesStatsCache, InstantiationType.Delayed);
registerSingleton(ISessionOpenTelemetryService, SessionOpenTelemetryService, InstantiationType.Delayed);
registerSingleton(ISessionSectionOrderService, SessionSectionOrderService, InstantiationType.Delayed);
registerSingleton(ISessionGroupsService, SessionGroupsService, InstantiationType.Delayed);
registerSingleton(ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService, InstantiationType.Delayed);
registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
registerSingleton(ISessionRepositoryPicker, DefaultSessionRepositoryPicker, InstantiationType.Delayed);
registerSingleton(ISessionsListPresentation, DefaultSessionsListPresentation, InstantiationType.Delayed);
registerSingleton(IPullRequestIconCache, PullRequestIconCache, InstantiationType.Delayed);
registerSingleton(IAICustomizationMcpServerCountService, AICustomizationMcpServerCountService, InstantiationType.Delayed);
registerSingleton(IAgentsWindowExtensionSuggestionsService, AgentsWindowExtensionSuggestionsService, InstantiationType.Delayed);
registerSingleton(ICustomViewService, EditorWindowCustomViewService, InstantiationType.Delayed);
registerSingleton(IAutomationService, EditorWindowAutomationService, InstantiationType.Delayed);
registerSingleton(IPinnedCanvasService, EditorWindowPinnedCanvasService, InstantiationType.Delayed);
registerSingleton(IAgentFeedbackService, EditorWindowAgentFeedbackService, InstantiationType.Delayed);
registerSingleton(IAquariumService, EditorWindowAquariumService, InstantiationType.Delayed);
registerSingleton(ICodeReviewService, EditorWindowCodeReviewService, InstantiationType.Delayed);
registerSingleton(ISessionsChatViewStateService, SessionsChatViewStateService, InstantiationType.Delayed);
registerSingleton(ISessionsChatBackgroundService, SessionsChatBackgroundService, InstantiationType.Delayed);
registerSingleton(INewSessionComposerService, NewSessionComposerService, InstantiationType.Delayed);
registerSingleton(ISessionActivityBarActivityService, SessionActivityBarActivityService, InstantiationType.Delayed);
registerSingleton(IDiffEditorOptionsService, DiffEditorOptionsService, InstantiationType.Delayed);

// The sessions UI that a feature hosts in an editor window, such as a sessions list or the chat part: its hosts, its
// composers' drafts and scheduled requests, and the changes of its sessions, as the Agents window has them
registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
registerSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);
registerSingleton(ISessionDraftsService, SessionDraftsService, InstantiationType.Delayed);
registerSingleton(IScheduledChatsService, ScheduledChatsService, InstantiationType.Delayed);
// Editor windows open no separate chat windows: the chats' input toolbars, which inject it, find none
registerSingleton(IChatWindowService, NullChatWindowService, InstantiationType.Delayed);
// Not delayed: hosts are compared by identity, which a delayed proxy would not keep. It does nothing until a feature binds what it shows
registerSingleton(ISessionHost, EditorWindowMainSessionHost, InstantiationType.Eager);
// As the Agents window's, so that its chats show over the chat background the user picked
registerSingleton(IChatViewFactory, DefaultChatViewFactory, InstantiationType.Delayed);
registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
registerSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Delayed);
registerSingleton(IWorktreeSuggestionService, WorktreeSuggestionService, InstantiationType.Delayed);
registerSingleton(ISessionChangesService, SessionChangesService, InstantiationType.Delayed);
registerSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);
// Its sessions and their chats, which its presenter shows: the chat part, while a feature shows them there, or the Chat view
registerSingleton(ISessionsService, EditorWindowSessionsService, InstantiationType.Delayed);
registerSingleton(ISessionsNavigationService, EditorWindowSessionsNavigationHost, InstantiationType.Delayed);
registerSingleton(IEditorWindowSessionsPresenterService, EditorWindowSessionsPresenterService, InstantiationType.Delayed);
// Holds the sessions providers for the features that enable it, while what they show shows
registerSingleton(IEditorWindowSessionsRuntime, EditorWindowSessionsRuntime, InstantiationType.Delayed);

// The chat part, which shows chats of sessions in tabs beside the editor area, once a feature enables it
registerSingleton(IEditorWindowChatPartService, EditorWindowChatPartService, InstantiationType.Delayed);
registerSingleton(IAgentsChatPartFrame, AgentsChatPartFrame, InstantiationType.Delayed);
registerSingleton(IAgentsChatPartService, AgentsChatPartService, InstantiationType.Delayed);
// The folders that the window's new-session composers offer, which reading does not create the chat part for
registerSingleton(IEditorWindowComposerFoldersService, EditorWindowComposerFoldersService, InstantiationType.Delayed);
