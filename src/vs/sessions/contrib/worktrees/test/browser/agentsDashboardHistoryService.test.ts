/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { InMemoryStorageService } from '../../../../../platform/storage/common/storage.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { ChatRequestOriginKind } from '../../../../../workbench/contrib/chat/common/chatRequestOrigin.js';
import { IChatService } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { IChatChangeEvent, IChatModel, IChatRequestModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { ChatInteractivity, ChatModelSource, IChat, ISession, SessionStatus } from '../../../../services/sessions/common/session.js';
import { ISendRequestSentEvent, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { AgentsDashboardHistoryService } from '../../browser/agentsDashboardHistoryService.js';
import { AgentsDashboardHistoryEventType, getAgentsDashboardChatId } from '../../common/agentsDashboardHistory.js';
import { IWorktreeDashboardEntry, IWorktreeDashboardService, WorktreeEntryStatus } from '../../common/worktreeDashboard.js';

suite('AgentsDashboardHistoryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('records deltas and restores bounded numeric history', async () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const onDidSendRequest = disposables.add(new Emitter<ISendRequestSentEvent>());
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidSendRequest = onDidSendRequest.event;
			override getSessions(): ISession[] { return []; }
		}();
		const worktreeDashboardService = new class extends mock<IWorktreeDashboardService>() {
			override readonly entries = constObservable<IWorktreeDashboardEntry[]>([]);
			override readonly hasRefreshed = constObservable(false);
		}();
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidCreateModel = Event.None;
			override readonly chatModels = constObservable([]);
			override getSession() { return undefined; }
		}();
		const service = disposables.add(new AgentsDashboardHistoryService(storageService, sessionsManagementService, worktreeDashboardService, chatService));
		const status = observableValue('status', SessionStatus.InProgress);
		const lastTurnEnd = observableValue<Date | undefined>('lastTurnEnd', undefined);
		const now = Date.now();
		const chatResource = URI.parse('test-chat:///main');
		const chat: IChat = {
			resource: chatResource,
			createdAt: new Date(now),
			title: constObservable('Main chat'),
			updatedAt: constObservable(new Date(now)),
			status,
			changes: constObservable([]),
			checkpoints: constObservable(undefined),
			modelId: constObservable(undefined),
			modelSource: constObservable(ChatModelSource.Chosen),
			mode: constObservable(undefined),
			isArchived: constObservable(false),
			isRead: constObservable(true),
			interactivity: constObservable(ChatInteractivity.Full),
			description: constObservable(undefined),
			lastTurnEnd,
		};
		const session = new class extends mock<ISession>() {
			override readonly sessionId = 'session';
			override readonly resource = URI.parse('test-session:///session');
			override readonly createdAt = new Date(now);
			override readonly title = constObservable('Session');
			override readonly status = status;
			override readonly updatedAt = constObservable(new Date(now));
			override readonly workspace = constObservable(undefined);
			override readonly lastTurnEnd = lastTurnEnd;
			override readonly chats = constObservable([chat]);
			override readonly mainChat = constObservable(chat);
		}();
		const worktree: IWorktreeDashboardEntry = {
			repositoryRoot: URI.file('/repo'),
			worktreePath: URI.file('/repo.worktrees/session'),
			name: 'session',
			branchName: 'agents/session',
			status: WorktreeEntryStatus.SessionActive,
			session,
			hasUncommittedChanges: false,
			sizeBytes: 1024,
		};

		service.record([session], [worktree]);
		onDidSendRequest.fire({
			session,
			chat,
			isNewSession: false,
			isNewChat: false,
			options: { query: 'not persisted' },
		});
		status.set(SessionStatus.Completed, undefined);
		lastTurnEnd.set(new Date(), undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);
		status.set(SessionStatus.InProgress, undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);
		status.set(SessionStatus.Completed, undefined);
		service.record([session], [{ ...worktree, sizeBytes: 2048 }]);

		assert.deepStrictEqual(service.events.get().map(event => event.type), [
			AgentsDashboardHistoryEventType.SessionStarted,
			AgentsDashboardHistoryEventType.ChatCreated,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.DiskUsage,
			AgentsDashboardHistoryEventType.ChatInteraction,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.SessionDone,
			AgentsDashboardHistoryEventType.DiskUsage,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
		]);

		await timeout(250);
		const restored = disposables.add(new AgentsDashboardHistoryService(storageService, sessionsManagementService, worktreeDashboardService, chatService));
		assert.deepStrictEqual(restored.events.get().map(event => event.type), [
			AgentsDashboardHistoryEventType.SessionStarted,
			AgentsDashboardHistoryEventType.ChatCreated,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.DiskUsage,
			AgentsDashboardHistoryEventType.ChatInteraction,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.SessionDone,
			AgentsDashboardHistoryEventType.DiskUsage,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
			AgentsDashboardHistoryEventType.ChatStatusChanged,
		]);
	});

	test('records delegated requests between peer chats', () => {
		const storageService = disposables.add(new InMemoryStorageService());
		const now = Date.now();
		const sessionResource = URI.parse('test-session:///session');
		const mainChat = new class extends mock<IChat>() {
			override readonly resource = sessionResource;
			override readonly createdAt = new Date(now - 2);
			override readonly title = constObservable('Main');
			override readonly status = constObservable(SessionStatus.InProgress);
			override readonly updatedAt = constObservable(new Date(now));
		}();
		const peerChat = new class extends mock<IChat>() {
			override readonly resource = sessionResource.with({ fragment: 'peer' });
			override readonly createdAt = new Date(now - 1);
			override readonly title = constObservable('Peer');
			override readonly status = constObservable(SessionStatus.InProgress);
			override readonly updatedAt = constObservable(new Date(now));
		}();
		const session = new class extends mock<ISession>() {
			override readonly sessionId = 'session';
			override readonly resource = sessionResource;
			override readonly createdAt = new Date(now - 2);
			override readonly title = constObservable('Session');
			override readonly status = constObservable(SessionStatus.InProgress);
			override readonly updatedAt = constObservable(new Date(now));
			override readonly workspace = constObservable(undefined);
			override readonly lastTurnEnd = constObservable(undefined);
			override readonly chats = constObservable([mainChat, peerChat]);
			override readonly mainChat = constObservable(mainChat);
		}();
		const request = new class extends mock<IChatRequestModel>() {
			override readonly id = 'delegated-request';
			override readonly timestamp = now;
			override readonly requestTimestamp = now;
			override readonly origin = {
				kind: ChatRequestOriginKind.Delegation,
				sourceSessionResource: URI.parse(buildOpenSessionLinkUri(URI.parse('test-session:///session'))),
				delegationScope: 'chat' as const,
			};
		}();
		const modelChanged = disposables.add(new Emitter<IChatChangeEvent>());
		const model = new class extends mock<IChatModel>() {
			override readonly sessionResource = peerChat.resource;
			override readonly onDidChange = modelChanged.event;
			override readonly onDidDispose = Event.None;
			override getRequests() { return [request]; }
		}();
		const sessionsManagementService = new class extends mock<ISessionsManagementService>() {
			override readonly onDidChangeSessions = Event.None;
			override readonly onDidSendRequest = Event.None;
			override getSessions(): ISession[] { return [session]; }
			override getSessionForChatResource(resource: URI) {
				return resource.toString() === peerChat.resource.toString() ? { session, chat: peerChat } : undefined;
			}
		}();
		const worktreeDashboardService = new class extends mock<IWorktreeDashboardService>() {
			override readonly entries = constObservable<IWorktreeDashboardEntry[]>([]);
			override readonly hasRefreshed = constObservable(false);
		}();
		const chatService = new class extends mock<IChatService>() {
			override readonly onDidCreateModel = Event.None;
			override readonly chatModels = constObservable<Iterable<IChatModel>>([model]);
			override getSession(resource: URI) { return resource.toString() === peerChat.resource.toString() ? model : undefined; }
		}();

		const service = disposables.add(new AgentsDashboardHistoryService(storageService, sessionsManagementService, worktreeDashboardService, chatService));

		assert.deepStrictEqual(service.events.get().filter(event => event.type === AgentsDashboardHistoryEventType.ChatDelegatedRequest), [{
			id: 'session:chat-delegation:delegated-request',
			type: AgentsDashboardHistoryEventType.ChatDelegatedRequest,
			timestamp: now,
			sessionId: 'session',
			sourceChatId: getAgentsDashboardChatId(mainChat.resource),
			targetChatId: getAgentsDashboardChatId(peerChat.resource),
		}]);
	});
});
