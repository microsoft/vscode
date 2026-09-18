/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IReference, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { AgentHostConnectionsService } from '../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { readAgentMessageDelegationMeta } from '../../../../../platform/agentHost/common/meta/agentMessageDelegationMeta.js';
import { withRemoteSessionOrigin } from '../../../../../platform/agentHost/common/meta/agentRemoteSessionMeta.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionEnvelope, ActionType, ChatPendingMessageSetAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ChatInteractivity as ProtocolChatInteractivity } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { chatReducer } from '../../../../../platform/agentHost/common/state/sessionReducers.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChatState, ComponentToState, MessageKind, parseChatUri, PendingMessageKind, RootState, SessionState, SessionStatus, StateComponents, withSessionSpawnDepth } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { messageToRequestOrigin } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/stateToProgressAdapter.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IToolInvocation } from '../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { ChatInteractivity, IChat, ISession } from '../../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { maxRemoteMessageLength, parseSendRemoteMessageOptions, RemoteSessionMessageRouter } from '../../browser/remoteSessionMessageRouter.js';
import { SendRemoteMessageTool } from '../../browser/sendRemoteMessageTool.js';
import { resolveRemoteSessionSource } from '../../browser/remoteSessionSource.js';
import { IRemoteSessionChatService } from '../../browser/remoteSessionChatService.js';

class TestSubscription<T> implements IAgentSubscription<T> {
	value: T | Error | undefined;
	readonly onDidChange: Event<T>;
	readonly onDidError = Event.None;
	readonly onWillApplyAction = Event.None;
	readonly onDidApplyAction = Event.None;
	private readonly changed: Emitter<T>;

	constructor(value: T, store: Pick<DisposableStore, 'add'>) {
		this.value = value;
		this.changed = store.add(new Emitter<T>());
		this.onDidChange = this.changed.event;
	}

	get verifiedValue(): T | undefined { return this.value instanceof Error ? undefined : this.value; }

	set(value: T): void {
		this.value = value;
		this.changed.fire(value);
	}
}

class TestConnection extends mock<IAgentHostService>() {
	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	override readonly clientId = 'window-client';
	override readonly onDidAction: Event<ActionEnvelope>;
	override readonly rootState: TestSubscription<RootState>;
	readonly sessionState: TestSubscription<SessionState>;
	readonly chatStates = new Map<string, TestSubscription<ChatState>>();
	readonly dispatched: { channel: string; action: ChatPendingMessageSetAction }[] = [];
	readonly started: string[] = [];
	readonly didDispatch = new DeferredPromise<void>();
	readonly didSubscribe = new DeferredPromise<void>();
	readonly subscriptions: { [K in StateComponents]?: (resource: URI) => IAgentSubscription<ComponentToState[K]> };
	connected = true;
	acknowledge = true;
	readonly blockedChannels = new Set<string>();
	afterAcknowledged: (() => void) | undefined;
	rejectionReason: string | undefined;
	references = 0;
	private readonly actions: Emitter<ActionEnvelope>;

	constructor(readonly backendSession: URI, store: Pick<DisposableStore, 'add'>) {
		super();
		this.actions = store.add(new Emitter<ActionEnvelope>());
		this.onDidAction = this.actions.event;
		this.rootState = new TestSubscription<RootState>({ agents: [] }, store);
		const chats = ['default', 'original-chat', 'other-chat'].map(id => ({
			resource: buildChatUri(backendSession, id),
			title: id,
			status: SessionStatus.Idle,
			modifiedAt: new Date(0).toISOString(),
		}));
		this.sessionState = new TestSubscription(upcastPartial<SessionState>({ chats, defaultChat: chats[0].resource }), store);
		for (const summary of chats) {
			this.chatStates.set(summary.resource, new TestSubscription<ChatState>({ ...summary, turns: [] }, store));
		}
		this.subscriptions = {
			[StateComponents.Session]: () => this.sessionState,
			[StateComponents.Chat]: resource => {
				const state = this.chatStates.get(resource.toString());
				assert.ok(state);
				return state;
			},
		};
	}

	override getSubscription<T extends StateComponents>(kind: T, resource: URI): IReference<IAgentSubscription<ComponentToState[T]>> {
		const get = this.subscriptions[kind];
		assert.ok(get);
		this.references++;
		if (!this.didSubscribe.isSettled) {
			void this.didSubscribe.complete();
		}
		return { object: get(resource), dispose: () => this.references-- };
	}

	override dispatch(channel: string, action: Parameters<IAgentConnection['dispatch']>[1]): void {
		assert.strictEqual(action.type, ActionType.ChatPendingMessageSet);
		if (action.type !== ActionType.ChatPendingMessageSet) {
			return;
		}
		this.dispatched.push({ channel, action });
		void this.didDispatch.complete();
		if (!this.acknowledge || this.blockedChannels.has(channel)) {
			return;
		}
		const subscription = this.chatStates.get(channel)!;
		if (!this.rejectionReason) {
			subscription.set(chatReducer(subscription.verifiedValue!, action));
		}
		this.actions.fire({ channel, action, serverSeq: 1, origin: undefined, rejectionReason: this.rejectionReason });
		this.afterAcknowledged?.();
		if (!this.rejectionReason) {
			this.drain(channel);
		}
	}

	drain(channel: string): void {
		const subscription = this.chatStates.get(channel)!;
		const state = subscription.verifiedValue!;
		const next = state.queuedMessages?.[0];
		if (!next || state.activeTurn || state.steeringMessage) {
			return;
		}
		const action = {
			type: ActionType.ChatTurnStarted as const,
			turnId: `turn-${this.started.length}`,
			startedAt: new Date(0).toISOString(),
			message: next.message,
			queuedMessageId: next.id,
		};
		subscription.set(chatReducer(state, action));
		this.started.push(next.message.text);
		this.actions.fire({ channel, action, serverSeq: 2, origin: undefined });
	}
}

suite('RemoteSessionMessageRouter', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const backendSession = URI.parse('copilot:/same-id');

	function setup() {
		const local = new TestConnection(backendSession, store);
		const first = new TestConnection(backendSession, store);
		const second = new TestConnection(backendSession, store);
		const changed = store.add(new Emitter<void>());
		const hosts = new Map([['first', first], ['second', second]]);
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = changed.event;
			override get connections() {
				return [...hosts].map(([address, connection]) => ({
					address, name: address, clientId: address,
					status: connection.connected ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
				}));
			}
			override getConnection(address: string): IAgentConnection | undefined {
				const connection = hosts.get(address);
				return connection?.connected ? connection : undefined;
			}
			override getConnectionByAuthority(authority: string): IAgentConnection | undefined { return this.getConnection(authority); }
		}();
		const connections = store.add(new AgentHostConnectionsService(local, remoteService));
		const sessions = ['agent-host-copilot', 'remote-first-copilot', 'remote-second-copilot'].map((scheme, index) => {
			const resource = URI.from({ scheme, path: '/same-id' });
			const chats = ['', 'original-chat', 'other-chat'].map(fragment => upcastPartial<IChat>({
				resource: resource.with({ fragment }),
				interactivity: observableValue('interactivity', ChatInteractivity.Full),
			}));
			return upcastPartial<ISession>({
				resource, providerId: index === 0 ? 'local-agent-host' : `agenthost-${index === 1 ? 'first' : 'second'}`,
				chats: observableValue('chats', chats), mainChat: constObservable(chats[0]),
				workspace: constObservable(undefined), isArchived: constObservable(false),
			});
		});
		const providers = sessions.map(session => upcastPartial<IAgentHostSessionsProvider>({
			id: session.providerId, label: session.providerId, connectionStatus: undefined,
		}));
		const providersService = new class extends mock<ISessionsProvidersService>() {
			override getProvider<T extends ISessionsProvider>(id: string): T | undefined { return providers.find(provider => provider.id === id) as T | undefined; }
		}();
		const management = new class extends mock<ISessionsManagementService>() {
			override getSession(resource: URI): ISession | undefined { return sessions.find(session => isEqual(session.resource, resource)); }
			override getSessionForChatResource(resource: URI): { session: ISession; chat: IChat } | undefined {
				for (const session of sessions) {
					const chat = session.chats.get().find(chat => isEqual(chat.resource, resource));
					if (chat) {
						return { session, chat };
					}
				}
				return undefined;
			}
		}();
		const config = new TestConfigurationService({ chat: { remoteAgentHosts: { enabled: true } } });
		config.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		const backgroundEvents: { resource: string; event: string; claim?: boolean }[] = [];
		const backgroundChats = new class extends mock<IRemoteSessionChatService>() {
			override async acquire(resource: URI, _token: CancellationToken, claim?: boolean) {
				backgroundEvents.push({ resource: resource.toString(), event: 'acquire', claim });
				return {
					dispose: () => backgroundEvents.push({ resource: resource.toString(), event: 'dispose' }),
					releaseWhenIdle: () => backgroundEvents.push({ resource: resource.toString(), event: 'releaseWhenIdle' }),
				};
			}
		}();
		const router = new RemoteSessionMessageRouter(management, providersService, connections, config, backgroundChats);
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(ISessionsManagementService, management);
		instantiationService.stub(ISessionsProvidersService, providersService);
		instantiationService.stub(IAgentHostConnectionsService, connections);
		instantiationService.stub(IConfigurationService, config);
		instantiationService.stub(IRemoteSessionChatService, backgroundChats);
		store.add(toDisposable(() => assert.deepStrictEqual([local.references, first.references, second.references], [0, 0, 0])));
		return { router, local, first, second, changed, hosts, sessions, config, providers, management, connections, backgroundEvents, tool: instantiationService.createInstance(SendRemoteMessageTool) };
	}

	test('claims and retains background client tools beyond the queue acknowledgement', async () => {
		const { router, first, sessions, backgroundEvents } = setup();
		first.afterAcknowledged = () => {
			assert.deepStrictEqual(backgroundEvents, [{ resource: sessions[1].resource.toString(), event: 'acquire', claim: true }]);
		};
		await router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Reply while the parent works' }, 'retain', CancellationToken.None);
		assert.deepStrictEqual(backgroundEvents, [
			{ resource: sessions[1].resource.toString(), event: 'acquire', claim: true },
			{ resource: sessions[1].resource.toString(), event: 'releaseWhenIdle' },
		]);
	});

	test('same backend ID on different hosts routes only to the named host and exact chat', async () => {
		const { router, first, second, sessions } = setup();
		const source = sessions[1].chats.get()[1].resource;
		const target = sessions[2].chats.get()[2].resource;
		const result = await router.send(source, { session: target.toString(), message: 'Report' }, 'send-1', CancellationToken.None);
		const delivered = second.dispatched[0];
		assert.deepStrictEqual({
			first: first.dispatched.length,
			channel: delivered.channel,
			origin: delivered.action.message.origin,
			delegation: readAgentMessageDelegationMeta(delivered.action.message),
			result,
			link: messageToRequestOrigin(backendSession, delivered.action.message, 'copilot')?.sourceSessionResource.toString(),
		}, {
			first: 0,
			channel: buildChatUri(backendSession, 'other-chat'),
			origin: { kind: MessageKind.Agent },
			delegation: { sourceSession: sessions[1].resource.toString(), sourceChat: buildChatUri(sessions[1].resource, 'original-chat') },
			result: {
				status: 'sent',
				session: sessions[2].resource.toString(), chat: target.toString(),
				openLink: buildOpenSessionLinkUri(sessions[2].resource, 'other-chat'),
				host: { id: 'agenthost-second', label: 'agenthost-second' },
			},
			link: URI.parse(buildOpenSessionLinkUri(sessions[1].resource, 'original-chat')).toString(),
		});
	});

	for (const differentHost of [false, true]) {
		test(`a stalled destination does not block an unrelated chat: differentHost=${differentHost}`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			const { router, first, sessions } = setup();
			first.blockedChannels.add(buildDefaultChatUri(backendSession));
			const cancellation = store.add(new CancellationTokenSource());
			let stalledSettled = false;
			const stalled = router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Stalled' }, 'stalled', cancellation.token);
			const rejected = assert.rejects(stalled, /delivery was not confirmed/).finally(() => { stalledSettled = true; });
			await first.didDispatch.p;
			try {
				const destination = differentHost ? sessions[2].resource : sessions[1].chats.get()[1].resource;
				const result = await router.send(sessions[0].resource, { session: destination.toString(), message: 'Independent' }, 'independent', CancellationToken.None);
				assert.deepStrictEqual({ stalledSettled, target: result.chat }, { stalledSettled: false, target: destination.toString() });
			} finally {
				cancellation.cancel();
				await rejected;
			}
		}));
	}

	test('URI and open-link aliases share one destination queue', async () => {
		const { router, first, sessions } = setup();
		first.acknowledge = false;
		const cancellation = store.add(new CancellationTokenSource());
		const firstSend = router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'First' }, 'first', cancellation.token);
		const rejected = assert.rejects(firstSend, /delivery was not confirmed/);
		await first.didDispatch.p;
		const second = router.send(sessions[0].resource, {
			session: buildOpenSessionLinkUri(sessions[1].resource), message: 'Second',
		}, 'second', CancellationToken.None);
		await router.prepareTarget(sessions[0].resource, sessions[1].resource.toString(), CancellationToken.None);
		const before = first.dispatched.map(entry => entry.action.message.text);
		first.acknowledge = true;
		cancellation.cancel();
		await rejected;
		await second;
		assert.deepStrictEqual({ before, after: first.dispatched.map(entry => entry.action.message.text) }, {
			before: ['First'], after: ['First', 'Second'],
		});
	});

	test('saved origin survives restoration and routes to a workspace-less original chat', async () => {
		const { router, local, second, sessions } = setup();
		const metadata = withRemoteSessionOrigin(undefined, {
			session: sessions[0].resource.toString(), chat: sessions[0].chats.get()[1].resource.toString(), depth: 1,
		});
		const restored: Record<string, unknown> = JSON.parse(JSON.stringify(metadata));
		second.sessionState.set({ ...second.sessionState.verifiedValue!, _meta: restored });
		const result = await router.send(sessions[2].resource, { session: 'origin', message: 'Done' }, 'origin', CancellationToken.None);
		assert.deepStrictEqual({ target: result.chat, channel: local.dispatched[0].channel, workspace: sessions[0].workspace.get() }, {
			target: sessions[0].chats.get()[1].resource.toString(), channel: buildChatUri(backendSession, 'original-chat'), workspace: undefined,
		});
	});

	test('a restored peer origin routes through its host catalog while the parent is summary-only', async () => {
		const { router, local, second, sessions, backgroundEvents } = setup();
		const parent = sessions[0];
		const peer = parent.chats.get()[1].resource;
		sessions[0] = { ...parent, chats: constObservable([parent.mainChat.get()]) };
		second.sessionState.set({
			...second.sessionState.verifiedValue!, _meta: withRemoteSessionOrigin(undefined, {
				session: parent.resource.toString(), chat: peer.toString(), depth: 1,
			})
		});
		const prepared = await router.prepareTarget(sessions[2].resource, 'origin', CancellationToken.None);
		assert.deepStrictEqual({ target: prepared.chat, backgroundEvents }, { target: peer.toString(), backgroundEvents: [] });
		const result = await router.send(sessions[2].resource, { session: 'origin', message: 'Done' }, 'restored-peer', CancellationToken.None);
		assert.deepStrictEqual({
			target: result.chat, channel: local.dispatched[0].channel,
			backgroundEvents, cachedChats: sessions[0].chats.get().map(chat => chat.resource.toString()),
		}, {
			target: peer.toString(), channel: buildChatUri(backendSession, 'original-chat'),
			backgroundEvents: [
				{ resource: peer.toString(), event: 'acquire', claim: true },
				{ resource: peer.toString(), event: 'releaseWhenIdle' },
			],
			cachedChats: [parent.mainChat.get().resource.toString()],
		});
	});

	for (const restriction of ['archived', 'readOnly', 'hidden'] as const) {
		test(`an unhydrated peer with host-side ${restriction} state is rejected before claiming tools`, async () => {
			const { router, first, sessions, backgroundEvents } = setup();
			const parent = sessions[1];
			const peer = parent.chats.get()[1].resource;
			sessions[1] = { ...parent, chats: constObservable([parent.mainChat.get()]) };
			if (restriction === 'archived') {
				first.sessionState.set({ ...first.sessionState.verifiedValue!, status: SessionStatus.Idle | SessionStatus.IsArchived });
			} else {
				const chat = first.chatStates.get(buildChatUri(backendSession, 'original-chat'))!;
				chat.set({ ...chat.verifiedValue!, interactivity: restriction === 'readOnly' ? ProtocolChatInteractivity.ReadOnly : ProtocolChatInteractivity.Hidden });
			}
			await assert.rejects(router.send(sessions[0].resource, { session: peer.toString(), message: 'No' }, restriction, CancellationToken.None), /archived or read-only/);
			assert.deepStrictEqual({ sent: first.dispatched, backgroundEvents }, { sent: [], backgroundEvents: [] });
		});
	}

	test('subagent source provenance preserves the exact source channel rather than the default chat', async () => {
		const { router, local, first, sessions } = setup();
		const session = sessions[0];
		const source = upcastPartial<IChat>({ resource: session.resource.with({ fragment: 'subagent/call-1' }) });
		sessions[0] = { ...session, chats: constObservable([...session.chats.get(), source]) };
		const state = local.sessionState.verifiedValue!;
		local.sessionState.set({ ...state, chats: [...state.chats, { ...state.chats[0], resource: buildSubagentChatUri(backendSession, 'call-1') }] });
		await router.send(source.resource, { session: sessions[1].resource.toString(), message: 'From a subagent' }, 'subagent', CancellationToken.None);
		const delegation = readAgentMessageDelegationMeta(first.dispatched[0].action.message);
		assert.ok(delegation && hasKey(delegation, { sourceSession: true }) && delegation.sourceChat);
		assert.deepStrictEqual(parseChatUri(delegation.sourceChat), { session: session.resource.toString(), chatId: 'subagent/call-1' });
	});

	test('a saved peer origin that no longer exists never falls back to the main chat', async () => {
		const { router, local, second, sessions, backgroundEvents } = setup();
		second.sessionState.set({
			...second.sessionState.verifiedValue!, _meta: withRemoteSessionOrigin(undefined, {
				session: sessions[0].resource.toString(), chat: sessions[0].resource.with({ fragment: 'deleted-chat' }).toString(), depth: 1,
			})
		});
		await assert.rejects(router.send(sessions[2].resource, { session: 'origin', message: 'Done' }, 'missing', CancellationToken.None), /exact target chat/);
		assert.deepStrictEqual({ dispatched: local.dispatched, backgroundEvents }, { dispatched: [], backgroundEvents: [] });
	});

	test('shared source resolver returns the exact chat and persisted cumulative depth without retaining state', async () => {
		const { second, sessions, management, connections } = setup();
		const origin = { session: sessions[0].resource.toString(), chat: sessions[0].chats.get()[1].resource.toString(), depth: 2 };
		second.sessionState.set({
			...second.sessionState.verifiedValue!,
			_meta: withSessionSpawnDepth(withRemoteSessionOrigin(undefined, origin), 3),
		});
		const source = await resolveRemoteSessionSource(sessions[2].chats.get()[1].resource, management, connections, CancellationToken.None);
		assert.deepStrictEqual({
			session: source.session.resource.toString(),
			chat: source.chat.resource.toString(),
			host: source.host.connectionAuthority,
			depth: source.depth,
			origin: source.origin,
			references: second.references,
			workspace: source.session.workspace.get(),
		}, {
			session: sessions[2].resource.toString(), chat: sessions[2].chats.get()[1].resource.toString(),
			host: 'second', depth: 3, origin, references: 0, workspace: undefined,
		});
	});

	test('shared source resolver rejects a stale source chat instead of falling back to the main chat', async () => {
		const { second, sessions, management, connections } = setup();
		const state = second.sessionState.verifiedValue!;
		second.sessionState.set({ ...state, chats: state.chats.filter(chat => parseChatUri(chat.resource)?.chatId !== 'original-chat') });
		await assert.rejects(resolveRemoteSessionSource(sessions[2].chats.get()[1].resource, management, connections, CancellationToken.None), /exact originating chat/);
		assert.deepStrictEqual(second.references, 0);
	});

	test('shared source resolver cancels and releases an unhydrated source subscription', async () => {
		const { second, sessions, management, connections } = setup();
		const cancellation = store.add(new CancellationTokenSource());
		second.sessionState.value = undefined;
		const result = resolveRemoteSessionSource(sessions[2].resource, management, connections, cancellation.token);
		await second.didSubscribe.p;
		cancellation.cancel();
		await assert.rejects(result, /Canceled/);
		assert.deepStrictEqual(second.references, 0);
	});

	test('shared source resolver fails explicitly if the source disconnects during hydration', async () => {
		const { second, changed, sessions, management, connections } = setup();
		second.sessionState.value = undefined;
		const result = resolveRemoteSessionSource(sessions[2].resource, management, connections, CancellationToken.None);
		await second.didSubscribe.p;
		second.connected = false;
		changed.fire();
		await assert.rejects(result, /not registered and connected/);
		assert.deepStrictEqual(second.references, 0);
	});

	test('messages queue FIFO behind active and already pending messages without awaiting responses', async () => {
		const { router, first, sessions } = setup();
		const channel = buildDefaultChatUri(backendSession);
		const state = first.chatStates.get(channel)!;
		state.set(chatReducer(state.verifiedValue!, {
			type: ActionType.ChatTurnStarted, turnId: 'busy', startedAt: new Date(0).toISOString(),
			message: { text: 'Busy', origin: { kind: MessageKind.User } },
		}));
		state.set(chatReducer(state.verifiedValue!, {
			type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Queued, id: 'existing',
			message: { text: 'Existing', origin: { kind: MessageKind.User } },
		}));
		const results = await Promise.all(['One', 'Two'].map(message => router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message }, message, CancellationToken.None)));
		assert.deepStrictEqual({
			status: results.map(result => result.status),
			queue: state.verifiedValue!.queuedMessages?.map(pending => pending.message.text),
			active: state.verifiedValue!.activeTurn?.id,
		}, { status: ['queued', 'queued'], queue: ['Existing', 'One', 'Two'], active: 'busy' });
	});

	test('steering without an active turn still queues instead of bypassing pending input', async () => {
		const { router, first, sessions } = setup();
		const channel = buildDefaultChatUri(backendSession);
		const state = first.chatStates.get(channel)!;
		state.set(chatReducer(state.verifiedValue!, {
			type: ActionType.ChatPendingMessageSet, kind: PendingMessageKind.Steering, id: 'steering',
			message: { text: 'Steer', origin: { kind: MessageKind.User } },
		}));
		const result = await router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Later' }, 'steering', CancellationToken.None);
		assert.deepStrictEqual({ status: result.status, started: first.started, queued: state.verifiedValue!.queuedMessages?.map(pending => pending.message.text) }, {
			status: 'queued', started: [], queued: ['Later'],
		});
	});

	test('host-qualified open links support known child follow-ups without remapping', async () => {
		const { router, second, sessions } = setup();
		const result = await router.send(sessions[0].resource, {
			session: buildOpenSessionLinkUri(sessions[2].resource, 'other-chat'), message: 'Follow up',
		}, 'link', CancellationToken.None);
		assert.deepStrictEqual({ chat: result.chat, channel: second.dispatched[0].channel }, {
			chat: sessions[2].chats.get()[2].resource.toString(), channel: buildChatUri(backendSession, 'other-chat'),
		});
	});

	test('rejects self messages, unqualified references, unknown origins and invalid input', async () => {
		const { router, sessions, local } = setup();
		for (const target of [sessions[0].resource.toString(), 'copilot:/same-id', 'agent-host-session://copilot/same-id', 'origin']) {
			await assert.rejects(router.send(sessions[0].resource, { session: target, message: 'No' }, target, CancellationToken.None));
		}
		for (const input of [undefined, {}, { session: 'origin', message: ' ' }, { session: 'origin', message: 'x'.repeat(maxRemoteMessageLength + 1) }, { session: 'origin', message: 'Hi', origin: 'forged' }]) {
			assert.throws(() => parseSendRemoteMessageOptions(input), /session reference/);
		}
		assert.deepStrictEqual(local.dispatched, []);
	});

	test('AI and remote host gates are enforced at invocation, not just tool visibility', async () => {
		const { router, config, sessions } = setup();
		await config.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		assert.throws(() => router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'disabled', CancellationToken.None), /disabled/);
		await config.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		await config.setUserConfiguration('chat.disableAIFeatures', true);
		assert.throws(() => router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'hidden', CancellationToken.None), /disabled/);
	});

	test('offline or unregistered targets fail explicitly without dispatch or reconnect', async () => {
		const { router, first, sessions, providers } = setup();
		first.connected = false;
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'offline', CancellationToken.None), /not registered and connected/);
		first.connected = true;
		providers.splice(1, 1);
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'unregistered', CancellationToken.None), /not registered and connected/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('disconnect while hydrating the target fails without dispatch', async () => {
		const { router, first, sessions, changed } = setup();
		first.sessionState.value = undefined;
		const request = router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'hydrating', CancellationToken.None);
		await first.didSubscribe.p;
		first.connected = false;
		changed.fire();
		await assert.rejects(request, /not registered and connected/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('an unavailable ambient source is rejected even when its connection facade is present', async () => {
		const { router, local, first, sessions } = setup();
		local.rootState.value = new Error('The ambient agent host exited');
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'ambient-exit', CancellationToken.None), /not registered and connected/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('a target catalog entry for a different backend session is never used', async () => {
		const { router, first, sessions } = setup();
		first.sessionState.set({ ...first.sessionState.verifiedValue!, defaultChat: buildDefaultChatUri('copilot:/another-session') });
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'wrong-session', CancellationToken.None), /exact target chat/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('a hydrated chat snapshot must match the requested exact channel', async () => {
		const { router, first, sessions } = setup();
		const state = first.chatStates.get(buildDefaultChatUri(backendSession))!;
		state.set({ ...state.verifiedValue!, resource: buildChatUri(backendSession, 'other-chat') });
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'wrong-chat', CancellationToken.None), /target chat identity changed/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('read-only target chats cannot receive messages', async () => {
		const { router, first, sessions } = setup();
		const old = sessions[1];
		const chat = { ...old.chats.get()[1], interactivity: constObservable(ChatInteractivity.ReadOnly) };
		sessions[1] = { ...old, chats: constObservable([old.mainChat.get(), chat]) };
		await assert.rejects(router.send(sessions[0].resource, { session: chat.resource.toString(), message: 'Hi' }, 'read-only', CancellationToken.None), /read-only/);
		assert.deepStrictEqual(first.dispatched, []);
	});

	test('disconnect before acknowledgement reports uncertain delivery and never retries on reconnect', async () => {
		const { router, first, sessions, changed, hosts } = setup();
		first.acknowledge = false;
		const options = { session: sessions[1].resource.toString(), message: 'One message' };
		const request = router.send(sessions[0].resource, options, 'request', CancellationToken.None);
		await first.didDispatch.p;
		const replacement = new TestConnection(backendSession, store);
		hosts.set('first', replacement);
		changed.fire();
		await assert.rejects(request, /not confirmed.*replacement connection/);
		await assert.rejects(router.send(sessions[0].resource, options, 'request', CancellationToken.None), /not confirmed/);
		assert.deepStrictEqual([first.dispatched.length, replacement.dispatched.length], [1, 0]);
	});

	test('host rejection is not reported as a successful send', async () => {
		const { router, first, sessions } = setup();
		first.rejectionReason = 'Target rejected the message';
		await assert.rejects(router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Hi' }, 'rejected', CancellationToken.None), /Target rejected/);
		assert.deepStrictEqual(first.started, []);
	});

	test('a disconnect after host acknowledgement does not turn confirmed delivery into an uncertain failure', async () => {
		const { router, first, sessions, changed } = setup();
		first.afterAcknowledged = () => {
			first.connected = false;
			changed.fire();
		};
		const result = await router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: 'Accepted' }, 'accepted', CancellationToken.None);
		assert.deepStrictEqual({ status: result.status, sent: first.dispatched.length }, { status: 'sent', sent: 1 });
	});

	test('cancelled sends have no side effects and repeated call IDs do not duplicate delivery', async () => {
		const { router, first, sessions } = setup();
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		const options = { session: sessions[1].resource.toString(), message: 'Once' };
		await assert.rejects(router.send(sessions[0].resource, options, 'cancelled', cancellation.token));
		await router.send(sessions[0].resource, options, 'once', CancellationToken.None);
		await router.send(sessions[0].resource, options, 'once', CancellationToken.None);
		assert.throws(() => router.send(sessions[0].resource, { ...options, message: 'Different' }, 'once', CancellationToken.None), /different arguments/);
		assert.deepStrictEqual(first.dispatched.length, 1);
	});

	test('fan-out is bounded across targets and calling chats', async () => {
		const { router, sessions } = setup();
		for (let index = 0; index < 50; index++) {
			await router.send(sessions[0].resource, { session: sessions[1].resource.toString(), message: `Message ${index}` }, `${index}`, CancellationToken.None);
		}
		assert.throws(() => router.send(sessions[2].resource, { session: sessions[1].resource.toString(), message: 'Too many' }, 'extra', CancellationToken.None), /limit reached/);
	});

	test('tool supports workspace-less calls, gates visibility, and confirms the exact target', async () => {
		const { tool, first, sessions } = setup();
		const data = tool.getToolData();
		const invocation: IToolInvocation = {
			callId: 'tool-call', toolId: data.id, context: { sessionResource: sessions[0].resource },
			parameters: { session: sessions[1].chats.get()[1].resource.toString(), message: 'Hello [not a link](https://example.com)' },
		};
		const prepared = await tool.prepareToolInvocation({
			toolCallId: invocation.callId, chatSessionResource: sessions[0].resource, parameters: invocation.parameters,
		}, CancellationToken.None);
		const confirmation = prepared.confirmationMessages?.message;
		assert.ok(confirmation && typeof confirmation !== 'string');
		const text = confirmation.value.replace(/\\/g, '');
		assert.deepStrictEqual({
			name: data.toolReferenceName, runsInWorkspace: data.runsInWorkspace, requestsApproval: data.canRequestPreApproval,
			keys: data.when?.keys().sort(), confirmedHost: text.includes('agenthost-first'),
			confirmedChat: text.includes('original-chat'), trusted: confirmation.isTrusted,
			dispatches: first.dispatched.length,
		}, {
			name: 'send_remote_message', runsInWorkspace: false, requestsApproval: true,
			keys: [ChatContextKeys.enabled.key, `config.${RemoteAgentHostsEnabledSettingId}`].sort(),
			confirmedHost: true, confirmedChat: true, trusted: false, dispatches: 0,
		});
		await tool.invoke(invocation, async () => 0, { report: () => { } }, CancellationToken.None);
		await assert.rejects(tool.invoke({ ...invocation, context: undefined }, async () => 0, { report: () => { } }, CancellationToken.None), /originating chat/);
		assert.deepStrictEqual(first.dispatched.length, 1);
	});

	test('tool guidance explains exact origins, queueing, target permissions and uncertain delivery', () => {
		const { tool } = setup();
		const description = tool.getToolData().modelDescription;
		assert.deepStrictEqual({
			exactOrigin: description.includes('exact originating chat'),
			savedOrigin: description.includes('session "origin"'),
			fifo: description.includes('FIFO queue'),
			permissions: description.includes('target chat\'s existing permissions'),
			noResponse: description.includes('never a response'),
			uncertain: description.includes('Do not retry uncertain delivery'),
			agentHostSource: description.includes('Requires an Agent Host originating chat'),
		}, { exactOrigin: true, savedOrigin: true, fifo: true, permissions: true, noResponse: true, uncertain: true, agentHostSource: true });
	});

	test('messaging rejects unsupported sources before confirmation without requiring a visible chat widget', async () => {
		const { tool, first, sessions } = setup();
		const source = URI.parse('vscode-chat-session:/extension-chat');
		const parameters = { session: sessions[1].resource.toString(), message: 'Hello' };
		await assert.rejects(tool.prepareToolInvocation({
			toolCallId: 'prepare', chatSessionResource: source, parameters,
		}, CancellationToken.None), /originating chat on an Agent Host/);
		await assert.rejects(tool.invoke({
			callId: 'send', toolId: tool.getToolData().id, parameters, context: { sessionResource: source },
		}, async () => 0, { report() { } }, CancellationToken.None), /originating chat on an Agent Host/);
		assert.deepStrictEqual({
			dispatched: first.dispatched, needsVisibleWidget: tool.getToolData().when?.keys().includes(ChatContextKeys.chatIsAgentHostSession.key),
		}, { dispatched: [], needsVisibleWidget: false });
	});
	test('tool guidance requires delegated task reports and avoids reply loops', () => {
		const { tool } = setup();
		const description = tool.getToolData().modelDescription;
		assert.deepStrictEqual({
			requiredReport: description.includes('report results or blockers before ending each delegated task, including follow-ups'),
			noReminderRequired: description.includes('even if no reply was explicitly requested'),
			noImplicitForwarding: description.includes('normal final answer is not forwarded'),
			explicitOptOut: description.includes('unless explicitly instructed not to report back'),
			honestDelivery: description.includes('Only claim delivery after "sent" or "queued"'),
			noAcknowledgementLoop: description.includes('Do not send acknowledgement-only replies'),
			yield: description.includes('continue independent work or end your turn'),
			noSleep: description.includes('Do not sleep or poll'),
		}, {
			requiredReport: true, noReminderRequired: true, noImplicitForwarding: true, explicitOptOut: true,
			honestDelivery: true, noAcknowledgementLoop: true, yield: true, noSleep: true,
		});
	});
});
