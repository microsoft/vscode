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
