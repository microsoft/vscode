/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, IReference } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AgentHostConnectionsService } from '../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { IAgentConnection, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { buildOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { AgentSubscriptionManager, IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ActionType } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { IStateSnapshot } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, ChatState, ComponentToState, createChatState, createSessionState, MessageKind, ResponsePartKind, SessionLifecycle, SessionState, SessionStatus, StateComponents, TurnState } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { GetRemoteSessionTool } from '../../browser/getRemoteSessionTool.js';
import { RemoteSessionInspector } from '../../browser/remoteSessionInspector.js';
import { readRemoteSessionState } from '../../browser/remoteSessionSource.js';

const backendSession = URI.parse('copilotcli:/same-id');
const defaultChat = buildDefaultChatUri(backendSession);
const peerChat = buildChatUri(backendSession, 'peer');

class InspectionConnection extends mock<IAgentHostService>() {
	override readonly clientId = 'window-client';
	override readonly onAgentHostStart = Event.None;
	override readonly onAgentHostExit = Event.None;
	readonly manager: AgentSubscriptionManager;
	readonly snapshots = new Map<string, IStateSnapshot | Promise<IStateSnapshot>>();
	readonly subscribed: string[] = [];
	readonly unsubscribed: string[] = [];
	readonly didSubscribe = new DeferredPromise<void>();
	dispatches = 0;
	private clientSeq = 0;

	constructor(store: Pick<DisposableStore, 'add'>, label: string) {
		super();
		const summary = {
			resource: backendSession.toString(), provider: 'copilotcli', title: label, status: SessionStatus.Idle,
			createdAt: '2026-01-01T00:00:00.000Z', modifiedAt: '2026-01-01T00:00:00.000Z',
		};
		const chats = [defaultChat, peerChat].map(resource => ({
			resource, title: `${label} ${resource === defaultChat ? 'default' : 'peer'}`,
			status: SessionStatus.Idle, modifiedAt: summary.modifiedAt,
		}));
		this.setState(backendSession.toString(), {
			...createSessionState(summary), lifecycle: SessionLifecycle.Ready, defaultChat, chats,
		});
		for (const chat of chats) {
			this.setState(chat.resource, {
				...createChatState(chat),
				turns: [{
					id: 'turn-1', message: { text: 'Task', origin: { kind: MessageKind.Agent } },
					responseParts: [{ kind: ResponsePartKind.Markdown, id: 'reply', content: chat.title }],
					state: TurnState.Complete, usage: undefined,
				}],
			});
		}
		this.manager = store.add(new AgentSubscriptionManager(this.clientId, () => ++this.clientSeq, () => { }, async resource => {
			this.subscribed.push(resource.toString());
			void this.didSubscribe.complete();
			const snapshot = this.snapshots.get(resource.toString());
			if (!snapshot) {
				throw new Error('Session not found');
			}
			return snapshot;
		}, resource => this.unsubscribed.push(resource.toString())));
		this.manager.handleRootSnapshot({ agents: [] }, 0);
	}

	setState(resource: string, state: SessionState | ChatState): void {
		this.snapshots.set(resource, { resource, state, fromSeq: 0 });
	}

	override get rootState() { return this.manager.rootState; }

	override getSubscription<T extends StateComponents>(kind: T, resource: URI, owner: string): IReference<IAgentSubscription<ComponentToState[T]>> {
		return this.manager.getSubscription(kind, resource, owner);
	}

	override dispatch(): void {
		this.dispatches++;
		throw new Error('Inspection must not dispatch');
	}
}

suite('RemoteSessionInspector', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const resource = URI.parse('remote-first-copilotcli:/same-id');

	function setup() {
		const local = new InspectionConnection(store, 'Local');
		const first = new InspectionConnection(store, 'First');
		const second = new InspectionConnection(store, 'Second');
		const hosts = new Map([['first', first], ['second', second]]);
		const changed = store.add(new Emitter<void>());
		const providers = ['first', 'second'].map(address => upcastPartial<IAgentHostSessionsProvider>({
			id: `agenthost-${address}`, label: address, remoteAddress: address,
			connectionStatus: observableValue<RemoteAgentHostConnectionStatus>('status', { kind: 'connected' }),
		}));
		const remoteService = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = changed.event;
			override get connections() {
				return providers.map(provider => ({
					address: provider.remoteAddress!, name: provider.label, clientId: provider.id,
					status: provider.connectionStatus!.get().kind === 'connected' ? RemoteAgentHostConnectionStatus.connected : RemoteAgentHostConnectionStatus.disconnected,
				}));
			}
			override getConnection(address: string): IAgentConnection | undefined {
				return providers.find(provider => provider.remoteAddress === address)?.connectionStatus?.get().kind === 'connected'
					? hosts.get(address) : undefined;
			}
			override getConnectionByAuthority(authority: string) { return this.getConnection(authority); }
		}();
		const connections = store.add(new AgentHostConnectionsService(local, remoteService));
		const providersService = new class extends mock<ISessionsProvidersService>() {
			override getProviders() { return providers; }
		}();
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		const warnings: string[] = [];
		const logService = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const instantiationService = store.add(new TestInstantiationService());
		instantiationService.stub(IAgentHostConnectionsService, connections);
		instantiationService.stub(ISessionsProvidersService, providersService);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ILogService, logService);
		const inspector = instantiationService.createInstance(RemoteSessionInspector);
		const tool = instantiationService.createInstance(GetRemoteSessionTool);
		const inspect = (reference = resource.toString(), token = CancellationToken.None) => inspector.inspect(reference, token);
		return { inspect, tool, first, second, local, providers, hosts, changed, configuration, warnings };
	}

	test('inspects exact session, peer-chat and open-link references without a workbench chat model', async () => {
		const { inspect, first, second, local } = setup();
		const result = await inspect();
		const peer = await inspect(resource.with({ fragment: 'peer' }).toString());
		const link = await inspect(buildOpenSessionLinkUri(resource, 'peer'));
		assert.deepStrictEqual({
			result, peerMatchesLink: peer, peerResponse: peer.status !== 'unavailable' && peer.latestTurn?.response,
			subscriptions: first.manager.getActiveSubscriptions(), dispatches: first.dispatches,
			otherHosts: [...second.subscribed, ...local.subscribed],
		}, {
			result: {
				session: resource.toString(), chat: resource.toString(),
				openLink: buildOpenSessionLinkUri(resource), host: { id: 'agenthost-first', label: 'first' },
				status: 'completed', title: 'First default', queuedMessages: 0, hasSteeringMessage: false,
				latestTurn: { id: 'turn-1', status: 'completed', response: 'First default', error: null, truncated: false },
			},
			peerMatchesLink: link,
			peerResponse: 'First peer',
			subscriptions: [], dispatches: 0, otherHosts: [],
		});
	});

	test('default-chat references normalize without selecting a peer', async () => {
		const { inspect } = setup();
		assert.deepStrictEqual(await inspect(`${buildOpenSessionLinkUri(resource)}?chat=default`), await inspect(resource.with({ fragment: 'default' }).toString()));
	});

	test('identical backend IDs on different hosts stay distinct', async () => {
		const { inspect, first, second } = setup();
		const results = await Promise.all([
			inspect(resource.toString()), inspect(resource.with({ scheme: 'remote-second-copilotcli' }).toString()),
		]);
		assert.deepStrictEqual({
			responses: results.map(result => result.status !== 'unavailable' && result.latestTurn?.response),
			references: [first, second].map(connection => connection.manager.getActiveSubscriptions()),
		}, { responses: ['First default', 'Second default'], references: [[], []] });
	});

	test('rejects unqualified, local and ambiguous references instead of guessing a target', async () => {
		const { inspect, first, second, local } = setup();
		for (const reference of [
			'origin', 'same-id', backendSession.toString(), 'agent-host-copilotcli:/same-id',
			'file:///same-id', 'remote-first-copilotcli:/', 'remote-first-copilotcli://wrong/same-id',
			`${resource.toString()}?chat=peer`,
			`${buildOpenSessionLinkUri(resource)}?chat=`,
			`${buildOpenSessionLinkUri(resource)}?chat=%E0`,
			`${buildOpenSessionLinkUri(resource)}?chat=peer&chat=other`,
			`${buildOpenSessionLinkUri(resource)}?chatId=peer`,
		]) {
			await assert.rejects(inspect(reference), Error, reference);
		}
		assert.deepStrictEqual([first, second, local].map(connection => connection.subscribed), [[], [], []]);
	});

	test('a missing peer chat is unavailable, never replaced by the default chat', async () => {
		const { inspect, first, warnings } = setup();
		const result = await inspect(resource.with({ fragment: 'missing' }).toString());
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason.includes('exact target chat'),
			subscriptions: first.subscribed, remaining: first.manager.getActiveSubscriptions(), warnings: warnings.length,
		}, { status: 'unavailable', reason: true, subscriptions: [backendSession.toString()], remaining: [], warnings: 1 });
	});

	test('does not read a foreign backend session advertised as the requested peer', async () => {
		const { inspect, first } = setup();
		first.setState(backendSession.toString(), {
			...createSessionState({ resource: backendSession.toString(), provider: 'copilotcli', title: 'Test', status: SessionStatus.Idle, createdAt: '', modifiedAt: '' }),
			chats: [{ resource: buildChatUri('copilotcli:/other', 'peer'), title: 'Other', status: SessionStatus.Idle, modifiedAt: '' }],
		});
		const result = await inspect(resource.with({ fragment: 'peer' }).toString());
		assert.deepStrictEqual({ status: result.status, subscriptions: first.subscribed }, {
			status: 'unavailable', subscriptions: [backendSession.toString()],
		});
	});

	test('rejects a mismatched chat snapshot instead of returning another chat', async () => {
		const { inspect, first } = setup();
		first.setState(defaultChat, createChatState({ resource: peerChat, title: 'Wrong chat', status: SessionStatus.Idle, modifiedAt: '' }));
		const result = await inspect();
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason.includes('identity changed'),
			remaining: first.manager.getActiveSubscriptions(),
		}, { status: 'unavailable', reason: true, remaining: [] });
	});

	test('reports disconnected hosts without returning stale state or reconnecting', async () => {
		const { inspect, first, providers } = setup();
		providers[0] = { ...providers[0], connectionStatus: observableValue('status', RemoteAgentHostConnectionStatus.disconnected) };
		const result = await inspect();
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason.includes('disconnected'),
			subscriptions: first.subscribed, dispatches: first.dispatches, hasResponse: hasKey(result, { latestTurn: true }),
		}, { status: 'unavailable', reason: true, subscriptions: [], dispatches: 0, hasResponse: false });
	});

	test('reads server-confirmed state and preserves existing subscription owners', async () => {
		const { inspect, first } = setup();
		const session = store.add(first.getSubscription(StateComponents.Session, backendSession, 'existing-owner'));
		const chat = store.add(first.getSubscription(StateComponents.Chat, URI.parse(defaultChat), 'existing-owner'));
		await readRemoteSessionState(session.object, CancellationToken.None);
		const original = await readRemoteSessionState(chat.object, CancellationToken.None);
		first.manager.dispatchOptimistic(defaultChat, {
			type: ActionType.ChatTurnStarted, turnId: 'unconfirmed', startedAt: '2026-01-01T00:01:00.000Z',
			message: { text: 'Not acknowledged yet', origin: { kind: MessageKind.User } },
		});
		const before = first.manager.getActiveSubscriptions();
		const result = await inspect();
		assert.deepStrictEqual({
			response: result.status !== 'unavailable' && result.latestTurn?.response,
			verifiedUnchanged: chat.object.verifiedValue === original,
			owners: first.manager.getActiveSubscriptions(), unsubscribed: first.unsubscribed, dispatches: first.dispatches,
		}, { response: 'First default', verifiedUnchanged: true, owners: before, unsubscribed: [], dispatches: 0 });
	});

	test('subscription errors produce explicit unavailable results and release references', async () => {
		const { inspect, first, warnings } = setup();
		first.snapshots.delete(defaultChat);
		const result = await inspect();
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason,
			remaining: first.manager.getActiveSubscriptions(), warnings: warnings.length,
		}, { status: 'unavailable', reason: 'Session not found', remaining: [], warnings: 1 });
	});

	test('disconnect during hydration does not read a replacement connection', async () => {
		const { inspect, first, second, hosts, changed } = setup();
		const pending = new DeferredPromise<IStateSnapshot>();
		first.snapshots.set(backendSession.toString(), pending.p);
		const operation = inspect();
		await first.didSubscribe.p;
		hosts.set('first', second);
		changed.fire();
		const result = await operation;
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason.includes('connection changed'),
			remaining: first.manager.getActiveSubscriptions(), replacementReads: second.subscribed,
		}, { status: 'unavailable', reason: true, remaining: [], replacementReads: [] });
	});

	test('times out an unhydrated subscription without retaining it', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { inspect, first } = setup();
		first.snapshots.set(backendSession.toString(), new DeferredPromise<IStateSnapshot>().p);
		const result = await inspect();
		assert.deepStrictEqual({
			status: result.status, reason: result.status === 'unavailable' && result.reason.includes('Timed out'),
			remaining: first.manager.getActiveSubscriptions(),
		}, { status: 'unavailable', reason: true, remaining: [] });
	}));

	test('caller cancellation is not converted into unavailable and releases the subscription', async () => {
		const { inspect, first, warnings } = setup();
		first.snapshots.set(backendSession.toString(), new DeferredPromise<IStateSnapshot>().p);
		const cancellation = store.add(new CancellationTokenSource());
		const operation = inspect(resource.toString(), cancellation.token);
		await first.didSubscribe.p;
		cancellation.cancel();
		await assert.rejects(operation, /Canceled/);
		assert.deepStrictEqual({ remaining: first.manager.getActiveSubscriptions(), warnings }, { remaining: [], warnings: [] });
	});

	test('disabled remote hosts, disabled AI and pre-cancelled calls never subscribe', async () => {
		const { inspect, first, configuration } = setup();
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(inspect(), /disabled/);
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, true);
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		await assert.rejects(inspect(), /disabled/);
		await configuration.setUserConfiguration('chat.disableAIFeatures', false);
		const cancellation = store.add(new CancellationTokenSource());
		cancellation.cancel();
		await assert.rejects(inspect(resource.toString(), cancellation.token), /Canceled/);
		assert.deepStrictEqual(first.subscribed, []);
	});

	test('disabling the feature during a read prevents returning remote content', async () => {
		const { inspect, first, configuration } = setup();
		const snapshot = first.snapshots.get(backendSession.toString());
		assert.ok(snapshot);
		const pending = new DeferredPromise<IStateSnapshot>();
		first.snapshots.set(backendSession.toString(), pending.p);
		const operation = inspect();
		await first.didSubscribe.p;
		await configuration.setUserConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await pending.complete(await snapshot);
		await assert.rejects(operation, /disabled/);
		assert.deepStrictEqual({
			subscriptions: first.subscribed, remaining: first.manager.getActiveSubscriptions(),
		}, { subscriptions: [backendSession.toString()], remaining: [] });
	});

	test('tool advertises read-only scoped inspection and does not read during preparation', async () => {
		const { tool, first } = setup();
		const data = tool.getToolData();
		const prepared = await tool.prepareToolInvocation({ parameters: { session: resource.toString() }, toolCallId: 'inspect', chatSessionResource: undefined }, CancellationToken.None);
		assert.deepStrictEqual({
			name: data.toolReferenceName, runsInWorkspace: data.runsInWorkspace,
			keys: data.when?.keys().sort(), confirmation: prepared.confirmationMessages, subscriptions: first.subscribed,
			noPolling: data.modelDescription.includes('do not sleep or poll'),
			readOnly: data.modelDescription.includes('does not open or focus'),
			noReasoning: data.modelDescription.includes('Excludes reasoning'),
			exactReference: data.modelDescription.includes('not a bare backend ID or "origin"'),
		}, {
			name: 'get_remote_session', runsInWorkspace: false,
			keys: [ChatContextKeys.enabled.key, `config.${RemoteAgentHostsEnabledSettingId}`].sort(),
			confirmation: undefined, subscriptions: [], noPolling: true, readOnly: true, noReasoning: true, exactReference: true,
		});
	});

	test('tool returns JSON and an untrusted open link, and flags unavailable reads as errors', async () => {
		const { inspect, tool, providers } = setup();
		const expected = await inspect();
		const invocation = { callId: 'inspect', toolId: tool.getToolData().id, parameters: { session: resource.toString() }, context: undefined };
		const result = await tool.invoke(invocation, async () => 0, { report: () => { } }, CancellationToken.None);
		const message = result.toolResultMessage;
		assert.ok(message && typeof message !== 'string');
		providers[0] = { ...providers[0], connectionStatus: observableValue('status', RemoteAgentHostConnectionStatus.disconnected) };
		const unavailable = await tool.invoke(invocation, async () => 0, { report: () => { } }, CancellationToken.None);
		assert.deepStrictEqual({
			content: result.content,
			link: message.value.includes(buildOpenSessionLinkUri(resource)), trusted: message.isTrusted,
			failedRead: typeof unavailable.toolResultError === 'string' && unavailable.toolResultError.includes('disconnected'),
		}, {
			content: [{ kind: 'text', value: JSON.stringify(expected, undefined, 2) }],
			link: true, trusted: false, failedRead: true,
		});
	});
});
