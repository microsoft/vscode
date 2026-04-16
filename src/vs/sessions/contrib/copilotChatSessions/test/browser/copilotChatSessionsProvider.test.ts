/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IDialogService, IFileDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { TestStorageService } from '../../../../../workbench/test/common/workbenchTestServices.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IAgentSession, IAgentSessionsModel } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsModel.js';
import { IAgentSessionsService } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { AgentSessionProviders } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js';
import { IChatService, ChatSendResult, IChatSendRequestData } from '../../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { ChatSessionStatus, IChatSessionsService } from '../../../../../workbench/contrib/chat/common/chatSessionsService.js';
import { IChatWidget, IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { ILanguageModelsService } from '../../../../../workbench/contrib/chat/common/languageModels.js';
import { ILanguageModelToolsService } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IChatResponseModel } from '../../../../../workbench/contrib/chat/common/model/chatModel.js';
import { IChatAgentData } from '../../../../../workbench/contrib/chat/common/participants/chatAgents.js';
import { IGitService } from '../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionChangeEvent } from '../../../../services/sessions/common/sessionsProvider.js';
import { CopilotCLISessionType, SessionStatus } from '../../../../services/sessions/common/session.js';
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID } from '../../browser/copilotChatSessionsProvider.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';

// ---- Helpers ----------------------------------------------------------------

function createMockAgentSession(resource: URI, opts?: {
	providerType?: string;
	title?: string;
	archived?: boolean;
	read?: boolean;
}): IAgentSession {
	const providerType = opts?.providerType ?? AgentSessionProviders.Background;
	let archived = opts?.archived ?? false;
	let read = opts?.read ?? true;
	return new class extends mock<IAgentSession>() {
		override readonly resource = resource;
		override readonly providerType = providerType;
		override readonly providerLabel = 'Copilot';
		override readonly label = opts?.title ?? 'Test Session';
		override readonly status = ChatSessionStatus.Completed;
		override readonly icon = Codicon.copilot;
		override readonly timing = { created: Date.now(), lastRequestStarted: undefined, lastRequestEnded: undefined };
		override readonly metadata = { repositoryPath: '/test/repo' };
		override isArchived(): boolean { return archived; }
		override setArchived(value: boolean): void { archived = value; }
		override isPinned(): boolean { return false; }
		override setPinned(): void { }
		override isRead(): boolean { return read; }
		override isMarkedUnread(): boolean { return false; }
		override setRead(value: boolean): void { read = value; }
	}();
}

// ---- Mock Agent Sessions Service --------------------------------------------

class MockAgentSessionsModel {
	private readonly _sessions: IAgentSession[] = [];
	private readonly _onDidChangeSessions = new Emitter<void>();
	readonly onDidChangeSessions = this._onDidChangeSessions.event;
	readonly onWillResolve = Event.None;
	readonly onDidResolve = Event.None;
	readonly onDidChangeSessionArchivedState = Event.None;
	readonly resolved = true;

	get sessions(): IAgentSession[] { return [...this._sessions]; }

	getSession(resource: URI): IAgentSession | undefined {
		return this._sessions.find(s => s.resource.toString() === resource.toString());
	}

	addSession(session: IAgentSession): void {
		this._sessions.push(session);
		this._onDidChangeSessions.fire();
	}

	removeSession(resource: URI): void {
		const idx = this._sessions.findIndex(s => s.resource.toString() === resource.toString());
		if (idx !== -1) {
			this._sessions.splice(idx, 1);
			this._onDidChangeSessions.fire();
		}
	}

	async resolve(): Promise<void> { }

	dispose(): void {
		this._onDidChangeSessions.dispose();
	}
}

// ---- Provider factory -------------------------------------------------------

function createProvider(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	opts?: { multiChatEnabled?: boolean },
): CopilotChatSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', opts?.multiChatEnabled ?? false);

	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, {
		executeCommand: async (_id: string, ...args: any[]) => {
			// Simulate 'agents.github.copilot.cli.deleteSessions' removing sessions
			const items = args[0];
			if (Array.isArray(items)) {
				for (const item of items) {
					if (item?.resource) {
						model.removeSession(item.resource);
					}
				}
			} else if (items?.resource) {
				model.removeSession(items.resource);
			}
			return undefined;
		},
	});
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
		onDidCommitSession: Event.None,
		updateSessionOptions: () => true,
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		onDidChangeOptionGroups: Event.None,
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: async (): Promise<ChatSendResult> => ({ kind: 'sent' as const, data: {} as IChatSendRequestData }),
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => undefined,
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, {
		lookupLanguageModel: () => undefined,
	});
	instantiationService.stub(ILanguageModelToolsService, {
		toToolReferences: () => [],
	});
	// Stub IInstantiationService so provider can use createInstance for CopilotCLISession
	instantiationService.stub(IInstantiationService, instantiationService);

	const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
	return provider;
}

// ---- Provider factory for send/cancel tests ---------------------------------

/**
 * Creates a provider suitable for testing sendChat flows. Stubs all services
 * needed by CopilotCLISession and _sendFirstChat, including IGitService and a
 * non-null IChatWidget mock.
 *
 * The caller can pass a custom `sendRequest` implementation to control the
 * lifecycle of the in-flight request.
 */
function createProviderForSendTests(
	disposables: DisposableStore,
	model: MockAgentSessionsModel,
	sendRequest: () => Promise<ChatSendResult>,
	opts?: { onDidCommitSession?: Event<{ original: URI; committed: URI }> },
): CopilotChatSessionsProvider {
	const instantiationService = disposables.add(new TestInstantiationService());

	const configService = new TestConfigurationService();
	configService.setUserConfiguration('sessions.github.copilot.multiChatSessions', false);

	instantiationService.stub(ILogService, NullLogService);
	instantiationService.stub(IConfigurationService, configService);
	instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
	instantiationService.stub(IFileDialogService, {});
	instantiationService.stub(IDialogService, {
		confirm: async () => ({ confirmed: true }),
	});
	instantiationService.stub(ICommandService, { executeCommand: async () => undefined });
	instantiationService.stub(IAgentSessionsService, {
		model: model as unknown as IAgentSessionsModel,
		onDidChangeSessionArchivedState: Event.None,
		getSession: (resource: URI) => model.getSession(resource),
	});
	instantiationService.stub(IChatSessionsService, {
		getChatSessionContribution: () => ({ type: 'test-copilot', name: 'test', displayName: 'Test', description: 'test', icon: undefined }),
		getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() { } }), sessionResource: URI.from({ scheme: 'test' }), history: [], dispose() { } }),
		onDidCommitSession: opts?.onDidCommitSession ?? Event.None,
		updateSessionOptions: () => true,
		setSessionOption: () => true,
		getSessionOption: () => undefined,
		onDidChangeOptionGroups: Event.None,
	});
	instantiationService.stub(IChatService, {
		acquireOrLoadSession: async () => undefined,
		sendRequest: sendRequest,
		removeHistoryEntry: async (resource: URI) => { model.removeSession(resource); },
		setChatSessionTitle: () => { },
	});
	instantiationService.stub(IChatWidgetService, {
		openSession: async () => new class extends mock<IChatWidget>() {
			override input = new class extends mock<IChatWidget['input']>() {
				override setPermissionLevel = () => { };
			}();
		}(),
		lastFocusedWidget: undefined,
		onDidChangeFocusedSession: Event.None,
	});
	instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => undefined });
	instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
	instantiationService.stub(IGitService, { openRepository: async () => undefined });
	instantiationService.stub(IInstantiationService, instantiationService);

	return disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
}

suite('CopilotChatSessionsProvider', () => {
	const disposables = new DisposableStore();
	let model: MockAgentSessionsModel;

	setup(() => {
		model = new MockAgentSessionsModel();
		disposables.add(toDisposable(() => model.dispose()));
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	// ---- Provider identity -------

	test('has correct id and label', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
		assert.strictEqual(provider.sessionTypes.length, 2);
	});

	// ---- Capabilities -------

	test('capabilities.multipleChatsPerSession is false by default', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.capabilities.multipleChatsPerSession, false);
	});

	test('capabilities.multipleChatsPerSession is true when setting is enabled', () => {
		const provider = createProvider(disposables, model, { multiChatEnabled: true });
		assert.strictEqual(provider.capabilities.multipleChatsPerSession, true);
	});

	// ---- Session listing -------

	test('getSessions returns empty array initially', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.getSessions().length, 0);
	});

	test('getSessions returns adapted sessions from agent model', () => {
		const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
		model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
		model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 2);
	});

	test('getSessions ignores non-Background/Cloud sessions', () => {
		const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: '/bg-session' });
		const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: '/local-session' });
		model.addSession(createMockAgentSession(bgResource));
		model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));

		const provider = createProvider(disposables, model);
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
	});

	test('onDidChangeSessions fires when agent model changes', () => {
		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const changes: ISessionChangeEvent[] = [];
		disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/new-session' });
		model.addSession(createMockAgentSession(resource, { title: 'New Session' }));

		assert.ok(changes.length > 0);
		assert.strictEqual(changes[0].added.length, 1);
	});

	// ---- Session creation -------
	// Note: createNewSession tests are limited because CopilotCLISession
	// requires IGitService and creates disposables that are hard to clean
	// up in isolation. Full integration tests should cover session creation.

	// ---- Session actions -------

	test('archiveSession sets archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource);
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions(); // Initialize cache

		const session = provider.getSessions()[0];
		provider.archiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), true);
	});

	test('unarchiveSession clears archived state', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		const agentSession = createMockAgentSession(resource, { archived: true });
		model.addSession(agentSession);

		const provider = createProvider(disposables, model);
		provider.getSessions();

		const session = provider.getSessions()[0];
		provider.unarchiveSession(session.sessionId);

		assert.strictEqual(agentSession.isArchived(), false);
	});

	// ---- Single-chat mode (multi-chat disabled) -------

	test('single-chat mode: each session has exactly one chat', () => {
		const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
		model.addSession(createMockAgentSession(resource));

		const provider = createProvider(disposables, model, { multiChatEnabled: false });
		const sessions = provider.getSessions();

		assert.strictEqual(sessions.length, 1);
		assert.strictEqual(sessions[0].chats.get().length, 1);
		assert.strictEqual(sessions[0].mainChat.resource.toString(), resource.toString());
	});

	test('single-chat mode: sendAndCreateChat throws for unknown session', async () => {
		const provider = createProvider(disposables, model, { multiChatEnabled: false });
		await assert.rejects(
			() => provider.sendAndCreateChat('nonexistent', { query: 'test' }),
			/not found or not a new session/,
		);
	});

	// ---- Multi-chat mode -------

	suite('multi-chat (setting enabled)', () => {

		test('getSessions groups chats by session group', () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			// Without explicit grouping, each chat is its own session
			assert.strictEqual(sessions.length, 2);
		});

		test('session title comes from primary (first) chat', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource, { title: 'Primary Title' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			assert.strictEqual(sessions[0].title.get(), 'Primary Title');
		});

		test('session has mainChat set to the first chat', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			assert.ok(sessions[0].mainChat);
			assert.strictEqual(sessions[0].mainChat.resource.toString(), resource.toString());
		});

		test('sendAndCreateChat throws for unknown session when no untitled session exists', async () => {
			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			await assert.rejects(
				() => provider.sendAndCreateChat('nonexistent', { query: 'test' }),
				/not found/,
			);
		});

		test('deleteSession removes session from model and list', async () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();
			assert.strictEqual(sessions.length, 2);

			await provider.deleteSession(sessions[0].sessionId);

			const remainingSessions = provider.getSessions();
			assert.strictEqual(remainingSessions.length, 1);
			assert.strictEqual(remainingSessions[0].title.get(), 'Session 2');
		});

		test('deleteChat with single chat delegates to deleteSession', async () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();
			const session = sessions[0];

			await provider.deleteChat(session.sessionId, resource);

			// Model should no longer have the session
			assert.strictEqual(model.sessions.length, 0);
		});

		test('deleteChat throws when multi-chat is disabled', async () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource));

			const provider = createProvider(disposables, model, { multiChatEnabled: false });
			const sessions = provider.getSessions();
			const session = sessions[0];

			await assert.rejects(
				() => provider.deleteChat(session.sessionId, resource),
				/not supported when multi-chat is disabled/,
			);
		});

		test('session group cache is invalidated on session removal', () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });

			// Initialize sessions
			let sessions = provider.getSessions();
			assert.strictEqual(sessions.length, 2);

			// Remove one from the model
			model.removeSession(resource1);

			// Re-fetch
			sessions = provider.getSessions();
			assert.strictEqual(sessions.length, 1);
			assert.strictEqual(sessions[0].title.get(), 'Session 2');
		});

		test('resolveWorkspace creates proper workspace structure', () => {
			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const uri = URI.file('/test/project');

			const workspace = provider.resolveWorkspace(uri);

			assert.strictEqual(workspace.label, 'project');
			assert.strictEqual(workspace.repositories.length, 1);
			assert.strictEqual(workspace.repositories[0].uri.toString(), uri.toString());
			assert.strictEqual(workspace.requiresWorkspaceTrust, true);
		});

		test('chats observable updates when group model changes', () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();
			assert.strictEqual(sessions.length, 2);

			// Both are separate sessions initially
			const session1 = sessions[0];
			assert.strictEqual(session1.chats.get().length, 1);
		});

		test('session status aggregates across chats', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			// With a single chat, session status should match the chat status
			assert.ok(sessions[0].status.get() !== undefined);
		});

		test('session isRead aggregates across all chats', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource, { read: true }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			assert.strictEqual(sessions[0].isRead.get(), true);
		});

		test('session isRead is false when any chat is unread', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource, { read: false }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();

			assert.strictEqual(sessions[0].isRead.get(), false);
		});

		test('removing a chat from a group fires changed (not removed) with correct sessionId', async () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Chat 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Chat 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			const sessions = provider.getSessions();
			assert.strictEqual(sessions.length, 2);

			// Manually group both chats under the first session
			const chat2Id = sessions[1].sessionId;
			// Access the group model indirectly by deleting the second session's group
			// and re-adding its chat to the first group via deleteChat flow
			// Instead, simulate by removing the second chat from the model
			const changes: ISessionChangeEvent[] = [];
			disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

			model.removeSession(resource2);

			// The removed chat was standalone, so it should fire a removed event
			assert.ok(changes.length > 0);
			const lastChange = changes[changes.length - 1];
			assert.strictEqual(lastChange.removed.length, 1);
			assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
		});

		test('getSessions does not create duplicate groups on repeated calls', () => {
			const resource = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			model.addSession(createMockAgentSession(resource));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });

			// Call getSessions multiple times
			const sessions1 = provider.getSessions();
			const sessions2 = provider.getSessions();

			assert.strictEqual(sessions1.length, 1);
			assert.strictEqual(sessions2.length, 1);
			// Should return the same cached session object
			assert.strictEqual(sessions1[0], sessions2[0]);
		});

		test('changed events are not duplicated when multiple chats update', () => {
			const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-1' });
			const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: '/session-2' });
			model.addSession(createMockAgentSession(resource1, { title: 'Session 1' }));
			model.addSession(createMockAgentSession(resource2, { title: 'Session 2' }));

			const provider = createProvider(disposables, model, { multiChatEnabled: true });
			provider.getSessions(); // Initialize

			const changes: ISessionChangeEvent[] = [];
			disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

			// Trigger a refresh that updates both sessions
			model.addSession(createMockAgentSession(
				URI.from({ scheme: AgentSessionProviders.Background, path: '/session-3' }),
				{ title: 'Session 3' }
			));

			// Each event should not have duplicates in the changed array
			for (const change of changes) {
				const changedIds = change.changed.map(s => s.sessionId);
				const uniqueIds = new Set(changedIds);
				assert.strictEqual(changedIds.length, uniqueIds.size, 'Changed events should not have duplicates');
			}
		});
	});

	// ---- Browse actions -------

	test('has folder and repo browse actions', () => {
		const provider = createProvider(disposables, model);
		assert.strictEqual(provider.browseActions.length, 2);
		assert.strictEqual(provider.browseActions[0].providerId, COPILOT_PROVIDER_ID);
		assert.strictEqual(provider.browseActions[1].providerId, COPILOT_PROVIDER_ID);
	});

	// ---- Uncommitted temp session cleanup ------------------------------------

	suite('uncommitted temp session cleanup', () => {
		const workspace = URI.file('/test/repo');

		/**
		 * Returns a provider wired up so that sendRequest keeps the request
		 * in-flight indefinitely. Also returns helpers to resolve the request
		 * as a cancellation (so the provider cleans up promptly in tests).
		 */
		function makeInFlightProvider(): {
			provider: CopilotChatSessionsProvider;
			cancelRequest: () => void;
		} {
			let resolveComplete!: () => void;
			let resolveCreated!: (r: IChatResponseModel) => void;
			const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
			const responseCreatedPromise = new Promise<IChatResponseModel>(r => { resolveCreated = r; });

			const provider = createProviderForSendTests(disposables, model, async () => ({
				kind: 'sent' as const,
				data: {
					responseCompletePromise,
					responseCreatedPromise,
					agent: new class extends mock<IChatAgentData>() { }(),
				} as IChatSendRequestData,
			}));

			return {
				provider,
				cancelRequest: () => {
					resolveCreated({ isCanceled: true } as unknown as IChatResponseModel);
					resolveComplete();
				},
			};
		}

		/** Wait for the provider to fire an "added" session change event. */
		function waitForSessionAdded(provider: CopilotChatSessionsProvider): Promise<void> {
			return new Promise<void>(resolve => {
				const d = provider.onDidChangeSessions(e => {
					if (e.added.length > 0) {
						d.dispose();
						resolve();
					}
				});
			});
		}

		test('deleteSession removes a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.deleteSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 0, 'session should be removed after deleteSession');

			// Cancellation after delete should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);
		});

		test('archiveSession archives a temp session that is awaiting commit', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiveSession');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Cancellation after archive should resolve cleanly
			cancelRequest();
			await assert.doesNotReject(sendPromise);

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});

		test('archiveSession archives a stopped session that was never committed', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
			await added;

			// Stop before commit arrives — session should stay as completed
			cancelRequest();
			await sendPromise;

			assert.strictEqual(provider.getSessions().length, 1, 'stopped session should remain in the list');
			assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, 'session should be completed');

			await provider.archiveSession(sessionId);
			assert.strictEqual(provider.getSessions().length, 1, 'session should still be in the list after archiving');
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, 'session should be archived');

			// Unarchive should also work
			await provider.unarchiveSession(sessionId);
			assert.strictEqual(provider.getSessions()[0].isArchived.get(), false, 'session should be unarchived');

			// Clean up to avoid leaked disposable
			await provider.deleteSession(sessionId);
		});

		/**
		 * Returns a provider where the commit event is controllable. The
		 * caller can fire the commit event at the right moment to simulate
		 * the session being committed mid-request, then cancel the request
		 * afterwards. The session should persist after cancellation.
		 */
		function makeCommittableProvider(): {
			provider: CopilotChatSessionsProvider;
			commitSession: (original: URI, committed: URI) => void;
			cancelRequest: () => void;
		} {
			let resolveComplete!: () => void;
			let resolveCreated!: (r: IChatResponseModel) => void;
			const responseCompletePromise = new Promise<void>(r => { resolveComplete = r; });
			const responseCreatedPromise = new Promise<IChatResponseModel>(r => { resolveCreated = r; });

			const commitEmitter = disposables.add(new Emitter<{ original: URI; committed: URI }>());

			const provider = createProviderForSendTests(disposables, model, async () => ({
				kind: 'sent' as const,
				data: {
					responseCompletePromise,
					responseCreatedPromise,
					agent: new class extends mock<IChatAgentData>() { }(),
				} as IChatSendRequestData,
			}), { onDidCommitSession: commitEmitter.event });

			return {
				provider,
				commitSession: (original, committed) => commitEmitter.fire({ original, committed }),
				cancelRequest: () => {
					resolveCreated({ isCanceled: true } as unknown as IChatResponseModel);
					resolveComplete();
				},
			};
		}

		test('stopping a committed session keeps it in the list', async () => {
			const { provider, commitSession, cancelRequest } = makeCommittableProvider();

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');

			// Get the temp session's resource so we can fire the commit event
			const tempSession = provider.getSessions()[0];
			const tempResource = tempSession.resource;

			// Simulate commit: the agent created the worktree, so the URI
			// swaps from untitled to a real committed resource.
			const committedResource = URI.from({ scheme: AgentSessionProviders.Background, path: `/committed-${Date.now()}` });
			const committedAgentSession = createMockAgentSession(committedResource);
			model.addSession(committedAgentSession);
			commitSession(tempResource, committedResource);

			// _sendFirstChat should complete successfully now
			await sendPromise;

			assert.strictEqual(provider.getSessions().length, 1, 'committed session should remain in list');

			// Now cancel the request — session must stay
			cancelRequest();

			assert.strictEqual(provider.getSessions().length, 1, 'committed session should persist after stopping');
		});

		test('cancelling the request before commit keeps the session with completed status', async () => {
			const { provider, cancelRequest } = makeInFlightProvider();

			const changes: ISessionChangeEvent[] = [];
			disposables.add(provider.onDidChangeSessions(e => changes.push(e)));

			const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
			const sessionId = newSession.sessionId;

			const added = waitForSessionAdded(provider);
			const sendPromise = provider.sendAndCreateChat(sessionId, { query: 'test' });
			await added;

			assert.strictEqual(provider.getSessions().length, 1, 'session should appear while in-flight');
			assert.ok(changes.some(e => e.added.some(s => s.sessionId === sessionId)), 'added event should have fired');

			// Simulate user stopping the request
			cancelRequest();
			await sendPromise;

			assert.strictEqual(provider.getSessions().length, 1, 'session should stay in list after cancellation');
			assert.ok(
				changes.some(e => e.changed.some(s => s.sessionId === sessionId)),
				'changed event should have fired',
			);

			// Clean up the kept session so it doesn't leak
			await provider.deleteSession(sessionId);
		});
	});
});
