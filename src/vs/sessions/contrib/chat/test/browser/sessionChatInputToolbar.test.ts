/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IBrowserViewWorkbenchService } from '../../../../../workbench/contrib/browserView/common/browserView.js';
import { ChatConfiguration } from '../../../../../workbench/contrib/chat/common/constants.js';
import { workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionChangesStatsCache } from '../../../../services/sessions/common/sessionChangesStatsCache.js';
import { ChatOriginKind, SessionStatus, type IChat, type ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { CHAT_TURN_ARTIFACT_PILL_ID, CHAT_TURN_CHANGES_PILL_ID } from '../../../../../workbench/contrib/chat/browser/widget/chatTurnPills.js';
import { VIEW_SESSION_CHANGES_COMMAND_ID } from '../../../changes/common/changes.js';
import { OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID } from '../../../github/common/types.js';
import { SessionChatPillKind } from '../../common/sessionChatPills.js';
import { getSessionChatPillKindForAction, SessionChatInputToolbar, SESSION_BROWSERS_PILL_ID, SESSION_SUBAGENTS_PILL_ID } from '../../browser/sessionChatInputToolbar.js';
import { SESSION_CUSTOMIZATIONS_PILL_ID } from '../../browser/sessionCustomizations.js';

suite('SessionChatInputToolbar', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('maps turn-status and hosted pill actions onto togglable pill kinds', () => {
		assert.deepStrictEqual([
			getSessionChatPillKindForAction(CHAT_TURN_CHANGES_PILL_ID),
			getSessionChatPillKindForAction(VIEW_SESSION_CHANGES_COMMAND_ID),
			getSessionChatPillKindForAction(CHAT_TURN_ARTIFACT_PILL_ID),
			getSessionChatPillKindForAction(SESSION_CUSTOMIZATIONS_PILL_ID),
			getSessionChatPillKindForAction(OPEN_PULL_REQUEST_ACTION_ID),
			getSessionChatPillKindForAction(OPEN_ISSUE_ACTION_ID),
			getSessionChatPillKindForAction(SESSION_BROWSERS_PILL_ID),
			getSessionChatPillKindForAction(SESSION_SUBAGENTS_PILL_ID),
		], [
			SessionChatPillKind.Changes,
			SessionChatPillKind.Changes,
			SessionChatPillKind.Artifacts,
			SessionChatPillKind.Customizations,
			SessionChatPillKind.PullRequests,
			SessionChatPillKind.Issues,
			SessionChatPillKind.Browsers,
			SessionChatPillKind.Subagents,
		]);
	});

	test('hides the pills in a subagent chat', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		(instantiationService.get(IConfigurationService) as TestConfigurationService).setUserConfiguration(ChatConfiguration.TurnStatusPills, true);
		const chat = upcastPartial<IChat>({
			resource: URI.parse('chat:main'),
			title: constObservable('Main chat'),
			status: constObservable(SessionStatus.InProgress),
			lastTurnChanges: constObservable([{
				uri: URI.file('/session-change.ts'),
				modifiedUri: URI.file('/session-change.ts'),
				insertions: 10,
				deletions: 4,
				isOutsideWorkspace: false,
			}]),
		});
		const subagentChat = upcastPartial<IChat>({
			resource: URI.parse('chat:subagent'),
			title: constObservable('Subagent'),
			status: constObservable(SessionStatus.InProgress),
			origin: { kind: ChatOriginKind.Tool, parentChat: chat.resource },
		});
		const forkedChat = upcastPartial<IChat>({
			resource: URI.parse('chat:fork'),
			title: constObservable('Fork'),
			status: constObservable(SessionStatus.InProgress),
			origin: { kind: ChatOriginKind.Fork, parentChat: chat.resource },
			lastTurnChanges: constObservable([{
				uri: URI.file('/fork-change.ts'),
				modifiedUri: URI.file('/fork-change.ts'),
				insertions: 10,
				deletions: 4,
				isOutsideWorkspace: false,
			}]),
		});
		const forkSubagentChat = upcastPartial<IChat>({
			resource: URI.parse('chat:fork-subagent'),
			title: constObservable('Fork subagent'),
			status: constObservable(SessionStatus.InProgress),
			origin: { kind: ChatOriginKind.Tool, parentChat: forkedChat.resource },
		});
		const session = upcastPartial<IActiveSession>({
			sessionId: 'provider:session',
			providerId: 'provider',
			sessionType: 'test',
			resource: URI.parse('session:1'),
			status: constObservable(SessionStatus.InProgress),
			isArchived: constObservable(false),
			isRead: constObservable(true),
			capabilities: constObservable({ supportsMultipleChats: true }),
			chats: constObservable([chat, subagentChat, forkedChat, forkSubagentChat]),
			activeChat: constObservable(chat),
			mainChat: constObservable(chat),
			visibleChatTabs: constObservable([chat]),
			workspace: constObservable(upcastPartial<ISessionWorkspace>({ folders: [] })),
			worktreePending: constObservable(false),
			changesets: constObservable([]),
			changes: constObservable([]),
			isCreated: constObservable(true),
			sticky: constObservable(false),
			shouldShowChatTabs: constObservable(false),
		});
		instantiationService.stub(IBrowserViewWorkbenchService, upcastPartial<IBrowserViewWorkbenchService>({
			onDidChangeBrowserViews: Event.None,
			getKnownBrowserViews: () => new Map(),
		}));
		instantiationService.stub(ISessionChangesStatsCache, upcastPartial<ISessionChangesStatsCache>({ get: () => undefined }));
		instantiationService.stub(ISessionsProvidersService, upcastPartial<ISessionsProvidersService>({ getProvider: () => undefined }));
		instantiationService.stub(ISessionsService, upcastPartial<ISessionsService>({
			visibleSessions: constObservable([]),
			activeSession: constObservable(undefined),
		}));
		const toolbar = store.add(instantiationService.createInstance(SessionChatInputToolbar));

		toolbar.setSession(session, chat);
		const main = toolbar.visible;
		toolbar.setSession(session, subagentChat);
		const subagent = toolbar.visible;
		toolbar.setSession(session, forkedChat);

		assert.deepStrictEqual({ main, subagent, fork: toolbar.visible }, {
			main: true,
			subagent: false,
			fork: true,
		});
	});
});
