/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentCreateSessionConfig, IAgentService, IAgentSessionMetadata, IAuthenticateParams, IAuthenticateResult } from '../../common/agentService.js';
import { IListSessionsResult, IResourceReadResult } from '../../common/state/protocol/commands.js';
import { ActionType, type ISessionAction } from '../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../common/state/sessionCapabilities.js';
import { isJsonRpcNotification, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, ProtocolError, type IAhpNotification, type IInitializeResult, type IProtocolMessage, type IReconnectResult, type IResourceListResult, type IResourceWriteParams, type IResourceWriteResult, type IStateSnapshot } from '../../common/state/sessionProtocol.js';
import { SessionStatus, type ISessionSummary } from '../../common/state/sessionState.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostFileSystemProvider } from '../../common/agentHostFileSystemProvider.js';

// ---- Mock helpers -----------------------------------------------------------

class MockProtocolTransport implements IProtocolTransport {
	private readonly _onMessage = new Emitter<IProtocolMessage>();
	readonly onMessage = this._onMessage.event;
	private readonly _onDidSend = new Emitter<IProtocolMessage>();
	readonly onDidSend = this._onDidSend.event;
	private readonly _onClose = new Emitter<void>();
	readonly onClose = this._onClose.event;

	readonly sent: IProtocolMessage[] = [];

	send(message: IProtocolMessage): void {
		this.sent.push(message);
		this._onDidSend.fire(message);
	}

	simulateMessage(msg: IProtocolMessage): void {
		this._onMessage.fire(msg);
	}

	simulateClose(): void {
		this._onClose.fire();
	}

	dispose(): void {
		this._onMessage.dispose();
		this._onDidSend.dispose();
		this._onClose.dispose();
	}
}

class MockProtocolServer implements IProtocolServer {
	private readonly _onConnection = new Emitter<IProtocolTransport>();
	readonly onConnection = this._onConnection.event;
	readonly address = 'mock://test';

	simulateConnection(transport: IProtocolTransport): void {
		this._onConnection.fire(transport);
	}

	dispose(): void {
		this._onConnection.dispose();
	}
}

class MockAgentService implements IAgentService {
	declare readonly _serviceBrand: undefined;
	readonly handledActions: ISessionAction[] = [];
	readonly browsedUris: URI[] = [];
	readonly browseErrors = new Map<string, Error>();
	readonly listedSessions: IAgentSessionMetadata[] = [];

	private readonly _onDidAction = new Emitter<import('../../common/state/sessionActions.js').IActionEnvelope>();
	readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<import('../../common/state/sessionActions.js').INotification>();
	readonly onDidNotification = this._onDidNotification.event;

	private _stateManager!: AgentHostStateManager;

	/** Connect to the state manager so dispatchAction works correctly. */
	setStateManager(sm: AgentHostStateManager): void {
		this._stateManager = sm;
	}

	dispatchAction(action: ISessionAction, clientId: string, clientSeq: number): void {
		this.handledActions.push(action);
		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(action, origin);
	}
	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		const session = config?.session ?? URI.parse('copilot:///new-session');
		this._stateManager.createSession({
			resource: session.toString(),
			provider: config?.provider ?? 'copilot',
			title: 'New Session',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
			workingDirectory: config?.workingDirectory?.toString(),
		});
		return session;
	}
	async disposeSession(_session: URI): Promise<void> { }
	async listSessions(): Promise<IAgentSessionMetadata[]> { return this.listedSessions; }
	async subscribe(resource: URI): Promise<IStateSnapshot> {
		const snapshot = this._stateManager.getSnapshot(resource.toString());
		if (!snapshot) {
			throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
		}
		return snapshot;
	}
	unsubscribe(_resource: URI): void { }
	async shutdown(): Promise<void> { }
	async authenticate(_params: IAuthenticateParams): Promise<IAuthenticateResult> { return { authenticated: true }; }
	async resourceWrite(_params: IResourceWriteParams): Promise<IResourceWriteResult> { return {}; }
	async resourceList(uri: URI): Promise<IResourceListResult> {
		this.browsedUris.push(uri);
		const error = this.browseErrors.get(uri.toString());
		if (error) {
			throw error;
		}
		return {
			entries: [
				{ name: 'src', type: 'directory' },
				{ name: 'README.md', type: 'file' },
			],
		};
	}
	async resourceRead(_uri: URI): Promise<IResourceReadResult> {
		throw new Error('Not implemented');
	}
	async resourceCopy(): Promise<{}> { return {}; }
	async resourceDelete(): Promise<{}> { return {}; }
	async resourceMove(): Promise<{}> { return {}; }
	async createTerminal(): Promise<void> { }
	async disposeTerminal(): Promise<void> { }

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
	}
}

// ---- Helpers ----------------------------------------------------------------

function notification(method: string, params?: unknown): IProtocolMessage {
	return { jsonrpc: '2.0', method, params } as IProtocolMessage;
}

function request(id: number, method: string, params?: unknown): IProtocolMessage {
	return { jsonrpc: '2.0', id, method, params } as IProtocolMessage;
}

function findNotifications(sent: IProtocolMessage[], method: string): IAhpNotification[] {
	return sent.filter(isJsonRpcNotification) as IAhpNotification[];
}

function findResponse(sent: IProtocolMessage[], id: number): IProtocolMessage | undefined {
	return sent.find(isJsonRpcResponse) as IProtocolMessage | undefined;
}

function waitForResponse(transport: MockProtocolTransport, id: number): Promise<IProtocolMessage> {
	return Event.toPromise(Event.filter(transport.onDidSend, message => isJsonRpcResponse(message) && message.id === id));
}

// ---- Tests ------------------------------------------------------------------

suite('ProtocolServerHandler', () => {

	let disposables: DisposableStore;
	let stateManager: AgentHostStateManager;
	let server: MockProtocolServer;
	let agentService: MockAgentService;
	let handler: ProtocolServerHandler;

	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();

	function makeSessionSummary(resource?: string): ISessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: Date.now(),
			modifiedAt: Date.now(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
		};
	}

	function connectClient(clientId: string, initialSubscriptions?: readonly string[]): MockProtocolTransport {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersion: PROTOCOL_VERSION,
			clientId,
			initialSubscriptions,
		}));
		return transport;
	}

	setup(() => {
		disposables = new DisposableStore();
		stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		server = disposables.add(new MockProtocolServer());
		agentService = new MockAgentService();
		agentService.setStateManager(stateManager);
		disposables.add(agentService);
		disposables.add(handler = new ProtocolServerHandler(
			agentService,
			stateManager,
			server,
			{ defaultDirectory: URI.file('/home/testuser').toString() },
			disposables.add(new AgentHostFileSystemProvider()),
			new NullLogService(),
		));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('handshake returns initialize response', () => {
		const transport = connectClient('client-1');

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp, 'should have sent initialize response');
		const result = (resp as { result: IInitializeResult }).result;
		assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		assert.strictEqual(result.serverSeq, stateManager.serverSeq);
	});

	test('handshake with initialSubscriptions returns snapshots', () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1', [sessionUri]);

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp);
		const result = (resp as { result: IInitializeResult }).result;
		assert.strictEqual(result.snapshots.length, 1);
		assert.strictEqual(result.snapshots[0].resource.toString(), sessionUri.toString());
	});

	test('subscribe request returns snapshot', async () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 1);

		transport.simulateMessage(request(1, 'subscribe', { resource: sessionUri }));
		const resp = await responsePromise;

		assert.ok(resp, 'should have sent response');
		const result = (resp as unknown as { result: { snapshot: IStateSnapshot } }).result;
		assert.strictEqual(result.snapshot.resource.toString(), sessionUri.toString());
	});

	test('client action is dispatched and echoed', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const transport = connectClient('client-1', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateMessage(notification('dispatchAction', {
			clientSeq: 1,
			action: {
				type: ActionType.SessionTurnStarted,
				session: sessionUri,
				turnId: 'turn-1',
				userMessage: { text: 'hello' },
			},
		}));

		const actionMsgs = findNotifications(transport.sent, 'action');
		const turnStarted = actionMsgs.find(m => {
			const envelope = m.params as unknown as { action: { type: string } };
			return envelope.action.type === ActionType.SessionTurnStarted;
		});
		assert.ok(turnStarted, 'should have echoed turnStarted');
		const envelope = turnStarted!.params as unknown as { origin: { clientId: string; clientSeq: number } };
		assert.strictEqual(envelope.origin.clientId, 'client-1');
		assert.strictEqual(envelope.origin.clientSeq, 1);
	});

	test('actions are scoped to subscribed sessions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const transportA = connectClient('client-a', [sessionUri]);
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.dispatchServerAction({
			type: ActionType.SessionTitleChanged,
			session: sessionUri,
			title: 'New Title',
		});

		assert.strictEqual(findNotifications(transportA.sent, 'action').length, 1);
		assert.strictEqual(findNotifications(transportB.sent, 'action').length, 0);
	});

	test('notifications are broadcast to all clients', () => {
		const transportA = connectClient('client-a');
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.createSession(makeSessionSummary());

		assert.strictEqual(findNotifications(transportA.sent, 'notification').length, 1);
		assert.strictEqual(findNotifications(transportB.sent, 'notification').length, 1);
	});

	test('listSessions includes project metadata', async () => {
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			project: { uri: URI.file('/workspace/project'), displayName: 'Project' },
			summary: 'Session Summary',
		});

		const transport = connectClient('client-list');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: IListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => item.project), [{ uri: URI.file('/workspace/project').toString(), displayName: 'Project' }]);
	});

	test('listSessions omits project metadata when absent', async () => {
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'Session Summary',
		});

		const transport = connectClient('client-list-no-project');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: IListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => item.project), [undefined]);
	});

	test('createSession returns null and broadcasts project in sessionAdded summary', async () => {
		const transport = connectClient('client-create');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		const newSession = URI.parse('copilot:///created-session').toString();
		transport.simulateMessage(request(2, 'createSession', { session: newSession }));
		const resp = await responsePromise;

		const added = findNotifications(transport.sent, 'notification').find(message => {
			const params = message.params as { notification: { type: string } };
			return params.notification.type === 'notify/sessionAdded';
		});
		assert.deepStrictEqual({
			result: (resp as { result: null }).result,
			project: (added!.params as { notification: { summary: ISessionSummary } }).notification.summary.project,
		}, {
			result: null,
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
		});
	});

	test('reconnect replays missed actions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const transport1 = connectClient('client-r', [sessionUri]);
		const resp = findResponse(transport1.sent, 1);
		const initSeq = (resp as { result: IInitializeResult }).result.serverSeq;
		transport1.simulateClose();

		stateManager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Title A' });
		stateManager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'Title B' });

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-r',
			lastSeenServerSeq: initSeq,
			subscriptions: [sessionUri],
		}));

		const reconnectResp = findResponse(transport2.sent, 1);
		assert.ok(reconnectResp, 'should have sent reconnect response');
		const result = (reconnectResp as { result: IReconnectResult }).result;
		assert.strictEqual(result.type, 'replay');
		if (result.type === 'replay') {
			assert.strictEqual(result.actions.length, 2);
		}
	});

	test('reconnect sends fresh snapshots when gap too large', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const transport1 = connectClient('client-g', [sessionUri]);
		transport1.simulateClose();

		for (let i = 0; i < 1100; i++) {
			stateManager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: `Title ${i}` });
		}

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-g',
			lastSeenServerSeq: 0,
			subscriptions: [sessionUri],
		}));

		const reconnectResp = findResponse(transport2.sent, 1);
		assert.ok(reconnectResp, 'should have sent reconnect response');
		const result = (reconnectResp as { result: IReconnectResult }).result;
		assert.strictEqual(result.type, 'snapshot');
		if (result.type === 'snapshot') {
			assert.ok(result.snapshots.length > 0, 'should contain snapshots');
		}
	});

	test('client disconnect cleans up', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction({ type: ActionType.SessionReady, session: sessionUri });

		const transport = connectClient('client-d', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateClose();

		stateManager.dispatchServerAction({ type: ActionType.SessionTitleChanged, session: sessionUri, title: 'After Disconnect' });

		assert.strictEqual(transport.sent.length, 0);
	});

	test('handshake includes defaultDirectory from side effects', () => {
		const transport = connectClient('client-home');

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp);
		const result = (resp as { result: IInitializeResult }).result;
		assert.strictEqual(URI.parse(result.defaultDirectory!).path, '/home/testuser');
	});

	test('resourceList routes to side effect handler', async () => {
		const transport = connectClient('client-browse');
		transport.sent.length = 0;

		const dirUri = URI.file('/home/user/project').toString();
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'resourceList', { uri: dirUri }));
		const resp = await responsePromise;

		assert.strictEqual(agentService.browsedUris.length, 1);
		assert.strictEqual(agentService.browsedUris[0].path, '/home/user/project');

		assert.ok(resp);
		const result = (resp as unknown as { result: { entries: { name: string; uri: unknown; type: string }[] } }).result;
		assert.strictEqual(result.entries.length, 2);
		assert.strictEqual(result.entries[0].name, 'src');
		assert.strictEqual(result.entries[0].type, 'directory');
		assert.strictEqual(result.entries[1].name, 'README.md');
		assert.strictEqual(result.entries[1].type, 'file');
	});

	test('resourceList returns a JSON-RPC error when the target is invalid', async () => {
		const transport = connectClient('client-browse-error');
		transport.sent.length = 0;

		const dirUri = URI.file('/missing').toString();
		agentService.browseErrors.set(URI.file('/missing').toString(), new ProtocolError(JSON_RPC_INTERNAL_ERROR, `Directory not found: ${dirUri}`));
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'resourceList', { uri: dirUri }));
		const resp = await responsePromise as { error?: { code: number; message: string } };

		assert.ok(resp?.error);
		assert.strictEqual(resp.error!.code, JSON_RPC_INTERNAL_ERROR);
		assert.match(resp.error!.message, /Directory not found/);
	});

	// ---- Extension methods: auth ----------------------------------------

	test('authenticate returns result via typed request', async () => {
		const transport = connectClient('client-auth');
		transport.sent.length = 0;

		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'authenticate', { resource: 'https://api.github.com', token: 'test-token' }));
		const resp = await responsePromise as { result?: Record<string, unknown>; error?: { code: number; message: string } };

		assert.ok(!resp.error, `unexpected error: ${resp.error?.message}`);
		assert.deepStrictEqual(resp.result, {});
	});

	test('extension request preserves ProtocolError code and data', async () => {
		// Override authenticate to throw a ProtocolError with data
		const origHandler = agentService.authenticate;
		agentService.authenticate = async () => { throw new ProtocolError(-32007, 'Auth required', { hint: 'sign in' }); };

		const transport = connectClient('client-auth-error');
		transport.sent.length = 0;

		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'authenticate', { resource: 'test', token: 'bad' }));
		const resp = await responsePromise as { error?: { code: number; message: string; data?: unknown } };

		assert.ok(resp?.error);
		assert.strictEqual(resp.error!.code, -32007);
		assert.strictEqual(resp.error!.message, 'Auth required');
		assert.deepStrictEqual(resp.error!.data, { hint: 'sign in' });

		agentService.authenticate = origHandler;
	});

	// ---- Connection count event -----------------------------------------

	test('onDidChangeConnectionCount fires on connect and disconnect', () => {
		const counts: number[] = [];
		disposables.add(handler.onDidChangeConnectionCount(c => counts.push(c)));

		const transport = connectClient('client-count-1');
		connectClient('client-count-2');
		transport.simulateClose();

		assert.deepStrictEqual(counts, [1, 2, 1]);
	});

	test('onDidChangeConnectionCount is not decremented by stale reconnect close', () => {
		const counts: number[] = [];
		disposables.add(handler.onDidChangeConnectionCount(c => counts.push(c)));

		// Connect
		const transport1 = connectClient('client-rc');
		assert.deepStrictEqual(counts, [1]);

		// Reconnect with same clientId (new transport)
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-rc',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		// Count is unchanged because same clientId was overwritten
		assert.deepStrictEqual(counts, [1, 1]);

		// Old transport closes - should NOT decrement since it's stale
		transport1.simulateClose();
		assert.deepStrictEqual(counts, [1, 1]);

		// New transport closes - should decrement
		transport2.simulateClose();
		assert.deepStrictEqual(counts, [1, 1, 0]);
	});
});
