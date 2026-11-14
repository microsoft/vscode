/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { IFocusedSessionHostService, ISessionHost, ISessionHostService } from '../../../../services/sessions/browser/sessionHost.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { GitHubService, IGitHubService } from '../github/githubService.js';
import '../sessionAttentionService.js';
import { FocusedSessionHostService, SessionHostService } from '../sessionHostService.js';
import { ISessionWorktreeCleanupService, SessionWorktreeCleanupService } from '../sessionInputBanners/sessionWorktreeCleanupService.js';
import { ISessionsListModelService, SessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsNavigationService } from '../sessionsNavigationService.js';
import { ISessionDraftsService, SessionDraftsService } from '../sessionDraftsService.js';
import { IScheduledChatsService, ScheduledChatsService } from '../scheduledChatsService.js';
import { IChatWindowService } from '../../../chatWindow/browser/chatWindow.js';
import { NullChatWindowService } from '../../../chatWindow/browser/nullChatWindowService.js';
import { AgentsChatPartService, IAgentsChatPartService } from './agentsChatPart.js';
import { AgentsChatPartFrame, IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { EditorWindowSessionsService } from './editorWindowSessionsService.js';
import { EditorWindowMainSessionHost } from './editorWindowMainSessionHost.js';
import { ISessionsService } from '../sessionsService.js';
import { IChatViewFactory } from '../chatViewFactory.js';
import { DefaultChatViewFactory } from '../chat/defaultChatViewFactory.js';
import { INewChatVoiceTargetService, NewChatVoiceTargetService } from '../chat/newChatVoice.js';
import { ISessionChatPillsDebugService, SessionChatPillsDebugService } from '../chat/sessionChatInputToolbarDebug.js';
import { ISessionArchiveNudgeService, SessionArchiveNudgeService } from '../chat/sessionArchiveNudge.js';
import { IWorktreeSuggestionService, WorktreeSuggestionService } from '../worktreeSuggestion/worktreeSuggestionService.js';
import { ISessionChangesService, SessionChangesService } from '../../../sessionChanges/browser/sessionChangesService.js';
import { ChangesViewService } from '../../../sessionChanges/browser/changesViewService.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import { AgentsViewGate } from './agentsViewGate.js';
import { EditorWindowSessionsNavigationHost } from './editorWindowSessionsNavigationHost.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.SessionsViewEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.sessionsView.enabled', "Controls whether the Sessions view of the Agents window shows in the Primary Side Bar of editor windows. Requires a reload to take effect."),
		},
	},
});

// The services of the Sessions view. They are only created once the view shows, which it only does while the setting is on.
registerSingleton(ISessionsNavigationService, EditorWindowSessionsNavigationHost, InstantiationType.Delayed);
registerSingleton(ISessionsListModelService, SessionsListModelService, InstantiationType.Delayed);
registerSingleton(ISessionHostService, SessionHostService, InstantiationType.Delayed);
registerSingleton(IFocusedSessionHostService, FocusedSessionHostService, InstantiationType.Delayed);
registerSingleton(IGitHubService, GitHubService, InstantiationType.Delayed);
registerSingleton(ISessionWorktreeCleanupService, SessionWorktreeCleanupService, InstantiationType.Delayed);
// The drafts and scheduled requests of the composers, which the Sessions view and the chats inject, as in the Agents window
registerSingleton(ISessionDraftsService, SessionDraftsService, InstantiationType.Delayed);
registerSingleton(IScheduledChatsService, ScheduledChatsService, InstantiationType.Delayed);
// Editor windows open no separate chat windows: the chats' input toolbars, which inject it, find none
registerSingleton(IChatWindowService, NullChatWindowService, InstantiationType.Delayed);

// The chat part, and the chats it shows
registerSingleton(IAgentsChatPartFrame, AgentsChatPartFrame, InstantiationType.Delayed);
registerSingleton(IAgentsChatPartService, AgentsChatPartService, InstantiationType.Delayed);
// Not delayed: hosts are compared by identity, which a delayed proxy would not keep
registerSingleton(ISessionHost, EditorWindowMainSessionHost, InstantiationType.Eager);
registerSingleton(ISessionsService, EditorWindowSessionsService, InstantiationType.Delayed);
// As the Agents window's, so that its chats show over the chat background the user picked
registerSingleton(IChatViewFactory, DefaultChatViewFactory, InstantiationType.Delayed);
registerSingleton(INewChatVoiceTargetService, NewChatVoiceTargetService, InstantiationType.Delayed);
registerSingleton(ISessionChatPillsDebugService, SessionChatPillsDebugService, InstantiationType.Delayed);
registerSingleton(ISessionArchiveNudgeService, SessionArchiveNudgeService, InstantiationType.Delayed);
registerSingleton(IWorktreeSuggestionService, WorktreeSuggestionService, InstantiationType.Delayed);
registerSingleton(ISessionChangesService, SessionChangesService, InstantiationType.Delayed);
registerSingleton(IChangesViewService, ChangesViewService, InstantiationType.Delayed);

registerWorkbenchContribution2(AgentsViewGate.ID, AgentsViewGate, WorkbenchPhase.BlockStartup);
