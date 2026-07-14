/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileType } from '../../../files/common/files.js';
import { type IAgentCreateSessionConfig, type IAgentHostNetworkDiagnosticsInfo, type IAgentHostNetworkFetchResult, type IAgentResolveSessionConfigParams, type IAgentService, type IAgentSessionConfigCompletionsParams, type IAgentSessionMetadata, type AuthenticateParams, type AuthenticateResult } from '../../common/agentService.js';
import { CompletionsParams, CompletionsResult, ContentEncoding, ListSessionsResult, ResourceReadResult, ResolveSessionConfigResult, SessionConfigCompletionsResult, ResourceMkdirParams, ResourceMkdirResult, ResourceResolveParams, ResourceResolveResult, ResourceCopyParams, ResourceCopyResult } from '../../common/state/protocol/commands.js';
import { ActionType, type IRootConfigChangedAction, type SessionAction, type TerminalAction, type ClientAnnotationsAction, type ProgressParams } from '../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, ProtocolError, AhpErrorCodes, AHP_UNSUPPORTED_PROTOCOL_VERSION, AHP_SESSION_NOT_FOUND, type AhpNotification, type InitializeResult, type ProtocolMessage, type ReconnectResult, type ResourceListResult, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot } from '../../common/state/sessionProtocol.js';
import { MessageKind, ResponsePartKind, SessionStatus, ChangesetStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, type SessionSummary } from '../../common/state/sessionState.js';
import type { SessionAddedParams } from '../../common/state/protocol/notifications.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostFileSystemProvider, agentHostUri } from '../../common/agentHostFileSystemProvider.js';
import { iterateOtlpLogRecords, OtlpLogEmitter } from '../../common/otlp/otlpLogEmitter.js';

// ---- Mock helpers -----------------------------------------------------------

class MockProtocolTransport implements IProtocolTransport {
	private readonly _onMessage = new Emitter<ProtocolMessage>();
	readonly onMessage = this._onMessage.event;
	private readonly _onDidSend = new Emitter<ProtocolMessage>();
	readonly onDidSend = this._onDidSend.event;
	private readonly _onClose = new Emitter<void>();
	readonly onClose = this._onClose.event;

	readonly sent: ProtocolMessage[] = [];

	send(message: ProtocolMessage): void {
		this.sent.push(message);
		this._onDidSend.fire(message);
	}

	simulateMessage(msg: ProtocolMessage): void {
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

class CountingLogService extends NullLogService {
	errorCount = 0;

	override error(_message: string, ..._args: unknown[]): void {
		this.errorCount++;
	}
}

class MockAgentService implements IAgentService {
	declare readonly _serviceBrand: undefined;
	readonly handledActions: (SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction)[] = [];
	readonly browsedUris: URI[] = [];
	readonly browseErrors = new Map<string, Error>();
	readonly readErrors = new Map<string, Error>();
	readonly listedSessions: IAgentSessionMetadata[] = [];
	readonly createSessionConfigs: (IAgentCreateSessionConfig | undefined)[] = [];

	private readonly _onDidAction = new Emitter<import('../../common/state/sessionActions.js').ActionEnvelope>();
	readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<import('../../common/state/sessionActions.js').INotification>();
	readonly onDidNotification = this._onDidNotification.event;
	private readonly _onMcpNotification = new Emitter<import('../../common/agentService.js').IMcpNotification>();
	readonly onMcpNotification = this._onMcpNotification.event;

	private _stateManager!: AgentHostStateManager;

	/** Connect to the state manager so dispatchAction works correctly. */
	setStateManager(sm: AgentHostStateManager): void {
		this._stateManager = sm;
	}

	dispatchAction(channel: string, action: SessionAction | TerminalAction | ClientAnnotationsAction | IRootConfigChangedAction, clientId: string, clientSeq: number): void {
		this.handledActions.push(action);
		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(channel, action, origin);
	}
	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this.createSessionConfigs.push(config);
		const session = config?.session ?? URI.parse('copilot:///new-session');
		this._stateManager.createSession({
			resource: session.toString(),
			provider: config?.provider ?? 'copilot',
			title: '',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
			workingDirectory: config?.workingDirectory?.toString(),
		});
		return session;
	}

	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> { return { schema: { type: 'object', properties: {} }, values: {} }; }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> { return { items: [] }; }
	async completions(_params: CompletionsParams): Promise<CompletionsResult> { return { items: [] }; }
	async getCompletionTriggerCharacters(): Promise<readonly string[]> { return []; }
	async disposeSession(_session: URI): Promise<void> { }
	readonly createdChats: { session: string; chat: string }[] = [];
	readonly disposedChats: { session: string; chat: string }[] = [];
	async createChat(session: URI, chat: URI): Promise<void> {
		this.createdChats.push({ session: session.toString(), chat: chat.toString() });
		this._stateManager.addChat(session.toString(), chat.toString());
	}
	async disposeChat(session: URI, chat: URI): Promise<void> {
		this.disposedChats.push({ session: session.toString(), chat: chat.toString() });
		this._stateManager.removeChat(session.toString(), chat.toString());
	}
	async listSessions(): Promise<IAgentSessionMetadata[]> { return this.listedSessions; }
	async subscribe(resource: URI, _clientId: string): Promise<IStateSnapshot> {
		const snapshot = this._stateManager.getSnapshot(resource.toString());
		if (!snapshot) {
			throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
		}
		return snapshot;
	}
	addSubscriber(_resource: URI, _clientId: string): void { }
	unsubscribe(_resource: URI, _clientId: string): void { }
	async shutdown(): Promise<void> { }
	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> { return { version: 'test', os: 'test', arch: 'test', proxySettings: {}, proxyEnv: {}, endpoints: [] }; }
	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> { return { url }; }
	async authenticate(_params: AuthenticateParams): Promise<AuthenticateResult> { return { authenticated: true }; }
	getAuthToken(): string | undefined { return undefined; }
	async resourceWrite(_params: ResourceWriteParams): Promise<ResourceWriteResult> { return {}; }
	async resourceList(uri: URI): Promise<ResourceListResult> {
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
	async resourceRead(uri: URI): Promise<ResourceReadResult> {
		const error = this.readErrors.get(uri.toString());
		if (error) {
			throw error;
		}
		return { data: '', encoding: ContentEncoding.Utf8 };
	}
	async resourceCopy(_params: ResourceCopyParams): Promise<ResourceCopyResult> { return {}; }
	async resourceDelete(): Promise<{}> { return {}; }
	async resourceMove(): Promise<{}> { return {}; }
	async resourceResolve(_params: ResourceResolveParams): Promise<ResourceResolveResult> { throw new Error('Not implemented'); }
	async resourceMkdir(_params: ResourceMkdirParams): Promise<ResourceMkdirResult> { return {}; }
	readonly watchSubscribeCalls: string[] = [];
	readonly watchUnsubscribeCalls: string[] = [];
	/** Channels for which `onResourceWatchSubscribed` should return a descriptor. */
	readonly liveWatchDescriptors = new Map<string, import('../../common/state/sessionProtocol.js').ResourceWatchState>();
	async createResourceWatch(_params: import('../../common/state/sessionProtocol.js').CreateResourceWatchParams): Promise<import('../../common/state/sessionProtocol.js').CreateResourceWatchResult> {
		throw new Error('Not implemented');
	}
	onResourceWatchSubscribed(channel: string): import('../../common/state/sessionProtocol.js').ResourceWatchState | undefined {
		this.watchSubscribeCalls.push(channel);
		return this.liveWatchDescriptors.get(channel);
	}
	onResourceWatchUnsubscribed(channel: string): boolean {
		this.watchUnsubscribeCalls.push(channel);
		return this.liveWatchDescriptors.has(channel);
	}
	async createTerminal(): Promise<void> { }
	async disposeTerminal(): Promise<void> { }
	async invokeChangesetOperation(): Promise<{}> { return {}; }
	async handleMcpRequest(): Promise<unknown> { throw new Error('Method not found'); }

	dispose(): void {
		this._onDidAction.dispose();
		this._onDidNotification.dispose();
		this._onMcpNotification.dispose();
	}
}

// ---- Helpers ----------------------------------------------------------------

function notification(method: string, params?: unknown): ProtocolMessage {
	return { jsonrpc: '2.0', method, params } as ProtocolMessage;
}

function request(id: number, method: string, params?: unknown): ProtocolMessage {
	return { jsonrpc: '2.0', id, method, params } as ProtocolMessage;
}

function findNotifications(sent: ProtocolMessage[], method: string): AhpNotification[] {
	return sent.filter(isJsonRpcNotification) as AhpNotification[];
}

function findResponse(sent: ProtocolMessage[], id: number): ProtocolMessage | undefined {
	return sent.find(isJsonRpcResponse) as ProtocolMessage | undefined;
}

function waitForResponse(transport: MockProtocolTransport, id: number): Promise<ProtocolMessage> {
	return Event.toPromise(Event.filter(transport.onDidSend, message => isJsonRpcResponse(message) && message.id === id));
}

// ---- Tests ------------------------------------------------------------------

suite('ProtocolServerHandler', () => {

	let disposables: DisposableStore;
	let stateManager: AgentHostStateManager;
	let server: MockProtocolServer;
	let agentService: MockAgentService;
	let handler: ProtocolServerHandler;
	let fileSystemProvider: AgentHostFileSystemProvider;
	let logService: CountingLogService;

	const sessionUri = URI.from({ scheme: 'copilot', path: '/test-session' }).toString();
	const defaultChatUri = buildDefaultChatUri(sessionUri);

	function makeSessionSummary(resource?: string): SessionSummary {
		return {
			resource: resource ?? sessionUri,
			provider: 'copilot',
			title: 'Test',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///test-project', displayName: 'Test Project' },
		};
	}

	function connectClient(clientId: string, initialSubscriptions?: readonly string[]): MockProtocolTransport {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
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
		logService = new CountingLogService();
		disposables.add(agentService);
		disposables.add(handler = new ProtocolServerHandler(
			agentService,
			stateManager,
			server,
			{ defaultDirectory: URI.file('/home/testuser').toString() },
			disposables.add(fileSystemProvider = new AgentHostFileSystemProvider()),
			logService,
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
		const result = (resp as { result: InitializeResult }).result;
		assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		assert.strictEqual(result.serverSeq, stateManager.serverSeq);
	});

	test('handshake rejects unsupported protocol versions', () => {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		// Offer a single, deliberately-unsupported version. The server should
		// respond with -32005 and a message naming the offered/supported sets
		// instead of a result.
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: ['0.0.0'],
			clientId: 'client-incompat',
		}));

		const resp = findResponse(transport.sent, 1) as { error?: { code: number; message: string; data?: unknown } } | undefined;
		assert.ok(resp, 'should have sent error response');
		assert.strictEqual(resp.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
		assert.match(resp.error!.message, /0\.0\.0/);
		assert.match(resp.error!.message, new RegExp(PROTOCOL_VERSION.replace(/\./g, '\\.')));
		// Without the upgrade-socket env var, no _meta should be advertised.
		const data = resp.error!.data as { _meta?: { vscodeUpgradeMethod?: string } } | undefined;
		assert.strictEqual(data?._meta?.vscodeUpgradeMethod, undefined);

		transport.simulateClose();
		transport.dispose();
	});

	test('handshake leniently picks the highest compatible offered version', () => {
		// Mix an incompatible version with a compatible one — the server
		// must pick the compatible one rather than rejecting on the first
		// unknown entry.
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: ['0.0.0', PROTOCOL_VERSION, '9.9.9'],
			clientId: 'client-lenient',
		}));

		const resp = findResponse(transport.sent, 1) as { result?: InitializeResult } | undefined;
		assert.ok(resp?.result, 'should have negotiated successfully');
		assert.strictEqual(resp.result.protocolVersion, PROTOCOL_VERSION);

		transport.simulateClose();
		transport.dispose();
	});

	test('upgrade method advertised when management socket env var is set', () => {
		const originalEnv = process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
		process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = '/tmp/mock-supervisor.sock';
		try {
			const transport = new MockProtocolTransport();
			server.simulateConnection(transport);
			transport.simulateMessage(request(1, 'initialize', {
				protocolVersions: ['9.9.9'],
				clientId: 'client-incompat-with-cli',
			}));

			const resp = findResponse(transport.sent, 1) as { error?: { code: number; data?: unknown } } | undefined;
			assert.strictEqual(resp?.error?.code, AHP_UNSUPPORTED_PROTOCOL_VERSION);
			const data = resp.error!.data as { _meta?: { vscodeUpgradeMethod?: string } } | undefined;
			assert.strictEqual(data?._meta?.vscodeUpgradeMethod, '_vscodeUpgrade');

			transport.simulateClose();
			transport.dispose();
		} finally {
			if (originalEnv === undefined) {
				delete process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET;
			} else {
				process.env.VSCODE_AGENT_HOST_MANAGEMENT_SOCKET = originalEnv;
			}
		}
	});

	test('_vscodeUpgrade RPC returns MethodNotFound when no supervisor is available', async () => {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		// Note: NOT going through initialize first — the upgrade method must
		// also be callable pre-handshake.
		const responsePromise = waitForResponse(transport, 42);
		transport.simulateMessage(request(42, '_vscodeUpgrade', {}));

		const resp = await responsePromise as { error?: { code: number; message: string } };
		assert.ok(resp.error, 'should have responded with an error');
		assert.strictEqual(resp.error!.code, -32601 /* MethodNotFound */);

		transport.simulateClose();
		transport.dispose();
	});

	test('handshake with initialSubscriptions returns snapshots', () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1', [sessionUri]);

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp);
		const result = (resp as { result: InitializeResult }).result;
		assert.strictEqual(result.snapshots.length, 1);
		assert.strictEqual(result.snapshots[0].resource.toString(), sessionUri.toString());
	});

	test('ping responds before initialize', async () => {
		const transport = new MockProtocolTransport();
		disposables.add(transport);
		server.simulateConnection(transport);
		const responsePromise = waitForResponse(transport, 7);
		transport.simulateMessage(request(7, 'ping', {}));
		const resp = await responsePromise as { id: number; result: null };

		assert.strictEqual(resp.id, 7);
		assert.strictEqual(resp.result, null);
		transport.simulateClose();
	});

	test('ping responds after initialize', async () => {
		const transport = connectClient('client-1');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 9);
		transport.simulateMessage(request(9, 'ping', {}));
		const resp = await responsePromise as { id: number; result: null };

		assert.strictEqual(resp.id, 9);
		assert.strictEqual(resp.result, null);
	});

	test('subscribe request returns snapshot', async () => {
		stateManager.createSession(makeSessionSummary());

		const transport = connectClient('client-1');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 1);

		transport.simulateMessage(request(1, 'subscribe', { channel: sessionUri }));
		const resp = await responsePromise;

		assert.ok(resp, 'should have sent response');
		const result = (resp as unknown as { result: { snapshot: IStateSnapshot } }).result;
		assert.strictEqual(result.snapshot.resource.toString(), sessionUri.toString());
	});

	test('client action is dispatched and echoed', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		// Chat actions are emitted on the derived default-chat channel, so the
		// client must subscribe to it (as the real UI bridge does) to see echoes.
		const transport = connectClient('client-1', [sessionUri, defaultChatUri]);
		transport.sent.length = 0;

		transport.simulateMessage(notification('dispatchAction', {
			channel: defaultChatUri,
			clientSeq: 1,
			action: {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			},
		}));

		const actionMsgs = findNotifications(transport.sent, 'action');
		const turnStarted = actionMsgs.find(m => {
			const envelope = m.params as unknown as { action: { type: string } };
			return envelope.action.type === ActionType.ChatTurnStarted;
		});
		assert.ok(turnStarted, 'should have echoed turnStarted');
		const envelope = turnStarted!.params as unknown as { origin: { clientId: string; clientSeq: number } };
		assert.strictEqual(envelope.origin.clientId, 'client-1');
		assert.strictEqual(envelope.origin.clientSeq, 1);
	});

	test('actions are scoped to subscribed sessions', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transportA = connectClient('client-a', [sessionUri]);
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionTitleChanged,
			title: 'New Title',
		});

		assert.strictEqual(findNotifications(transportA.sent, 'action').length, 1);
		assert.strictEqual(findNotifications(transportB.sent, 'action').length, 0);
	});

	test('changeset actions are scoped to subscribed changeset URIs', () => {
		const changesetUri = `${sessionUri}/changeset/session`;
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		stateManager.registerChangeset(changesetUri);

		const transportA = connectClient('client-a-cs', [changesetUri]);
		// Session-only subscriber: must NOT receive changeset envelopes.
		const transportB = connectClient('client-b-cs', [sessionUri]);

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///test/changed.ts',
				edit: {
					after: { uri: 'file:///test/changed.ts', content: { uri: 'file:///test/changed.ts' } },
					diff: { added: 1, removed: 0 }
				}
			},
		});

		const aActions = findNotifications(transportA.sent, 'action');
		const bActions = findNotifications(transportB.sent, 'action');
		assert.strictEqual(aActions.length, 1, 'changeset subscriber should receive 1 envelope');
		assert.strictEqual(bActions.length, 0, 'session-only subscriber should receive 0 changeset envelopes');

		const params = aActions[0].params as { channel: string; action: { type: string } };
		assert.deepStrictEqual(
			{ type: params.action.type, channel: params.channel },
			{ type: ActionType.ChangesetFileSet, channel: changesetUri },
		);
	});

	test('changeset/cleared reaches changeset subscribers', () => {
		const changesetUri = `${sessionUri}/changeset/session`;
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		stateManager.registerChangeset(changesetUri);

		const transport = connectClient('client-clear', [changesetUri]);
		transport.sent.length = 0;

		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetCleared,
		});

		const actions = findNotifications(transport.sent, 'action');
		assert.strictEqual(actions.length, 1);
		const params = actions[0].params as { action: { type: string } };
		assert.strictEqual(params.action.type, ActionType.ChangesetCleared);
	});

	test('notifications are broadcast to all clients', () => {
		const transportA = connectClient('client-a');
		const transportB = connectClient('client-b');

		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.createSession(makeSessionSummary());

		assert.strictEqual(findNotifications(transportA.sent, 'root/sessionAdded').length, 1);
		assert.strictEqual(findNotifications(transportB.sent, 'root/sessionAdded').length, 1);
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

		const result = (resp as unknown as { result: ListSessionsResult }).result;
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

		const result = (resp as unknown as { result: ListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => item.project), [undefined]);
	});

	test('listSessions surfaces the changes summary from the agent', async () => {
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'Session With Changesets',
			changes: {
				additions: 5,
				deletions: 2,
				files: 3,
			},
		});

		const transport = connectClient('client-list-changesets');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: ListSessionsResult }).result;
		assert.deepStrictEqual(result.items[0].changes, {
			additions: 5,
			deletions: 2,
			files: 3,
		});
	});

	test('createSession returns null and broadcasts project in sessionAdded summary', async () => {
		const transport = connectClient('client-create');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		const newSession = URI.parse('copilot:///created-session').toString();
		transport.simulateMessage(request(2, 'createSession', { channel: newSession }));
		const resp = await responsePromise;

		const added = findNotifications(transport.sent, 'root/sessionAdded')[0];
		assert.deepStrictEqual({
			result: (resp as { result: null }).result,
			project: (added!.params as SessionAddedParams).summary.project,
		}, {
			result: null,
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
		});
	});

	suite('createChat / disposeChat', () => {
		const peerChat = buildChatUri(sessionUri, 'peer-1');

		test('createChat on the default chat URI is a no-op', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', { channel: sessionUri, chat: buildDefaultChatUri(sessionUri) }));
			const resp = await responsePromise;

			assert.deepStrictEqual({
				result: (resp as { result: null }).result,
				created: agentService.createdChats,
			}, {
				result: null,
				created: [],
			});
		});

		test('createChat for an additional chat forwards to the agent service and grows the catalog', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', { channel: sessionUri, chat: peerChat }));
			const resp = await responsePromise;

			assert.deepStrictEqual({
				result: (resp as { result: null }).result,
				created: agentService.createdChats,
				inCatalog: stateManager.getSessionState(sessionUri)?.chats.some(c => c.resource === peerChat),
			}, {
				result: null,
				created: [{ session: sessionUri, chat: peerChat }],
				inCatalog: true,
			});
		});

		test('createChat for an unknown session fails with SESSION_NOT_FOUND', async () => {
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', { channel: 'copilot:/missing', chat: buildChatUri('copilot:/missing', 'peer-1') }));
			const resp = await responsePromise as { error?: { code: number } };

			assert.strictEqual(resp.error?.code, AHP_SESSION_NOT_FOUND);
		});

		test('disposeChat forwards to the agent service and shrinks the catalog', async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.addChat(sessionUri, peerChat);
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'disposeChat', { channel: peerChat }));
			const resp = await responsePromise;

			assert.deepStrictEqual({
				result: (resp as { result: null }).result,
				disposed: agentService.disposedChats,
				inCatalog: stateManager.getSessionState(sessionUri)?.chats.some(c => c.resource === peerChat),
			}, {
				result: null,
				disposed: [{ session: sessionUri, chat: peerChat }],
				inCatalog: false,
			});
		});
	});

	test('reconnect replays missed actions', async () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transport1 = connectClient('client-r', [sessionUri]);
		const resp = findResponse(transport1.sent, 1);
		const initSeq = (resp as { result: InitializeResult }).result.serverSeq;
		transport1.simulateClose();

		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Title A' });
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Title B' });

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-r',
			lastSeenServerSeq: initSeq,
			subscriptions: [sessionUri],
		}));

		const reconnectResp = await reconnectRespPromise;
		const result = (reconnectResp as { result: ReconnectResult }).result;
		assert.strictEqual(result.type, 'replay');
		if (result.type === 'replay') {
			assert.strictEqual(result.actions.length, 2);
		}
	});

	test('reconnect replays missed changeset actions to changeset subscribers', async () => {
		const changesetUri = `${sessionUri}/changeset/session`;
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		// Register the changeset before the first connection so the initial
		// subscription succeeds.
		stateManager.registerChangeset(changesetUri);

		const transport1 = connectClient('client-rc', [changesetUri]);
		const resp = findResponse(transport1.sent, 1);
		const initSeq = (resp as { result: InitializeResult }).result.serverSeq;
		transport1.simulateClose();

		// Dispatch two changeset actions while client is disconnected.
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetFileSet,
			file: {
				id: 'file:///a.ts',
				edit: {
					after: { uri: 'file:///a.ts', content: { uri: 'file:///a.ts' } },
					diff: { added: 2, removed: 0 }
				}
			},
		});
		stateManager.dispatchServerAction(changesetUri, {
			type: ActionType.ChangesetStatusChanged,
			status: ChangesetStatus.Ready,
		});

		// Reconnect with same clientId and the changeset URI in subscriptions.
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-rc',
			lastSeenServerSeq: initSeq,
			subscriptions: [changesetUri],
		}));

		const reconnectResp = await reconnectRespPromise;
		const result = (reconnectResp as { result: ReconnectResult }).result;
		assert.strictEqual(result.type, 'replay');
		if (result.type === 'replay') {
			const replayedTypes = result.actions.map(e => e.action.type);
			assert.ok(replayedTypes.includes(ActionType.ChangesetFileSet), 'replay should include ChangesetFileSet');
			assert.ok(replayedTypes.includes(ActionType.ChangesetStatusChanged), 'replay should include ChangesetStatusChanged');
		}
	});

	test('reconnect sends fresh snapshots when gap too large', async () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transport1 = connectClient('client-g', [sessionUri]);
		transport1.simulateClose();

		for (let i = 0; i < 1100; i++) {
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: `Title ${i}` });
		}

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-g',
			lastSeenServerSeq: 0,
			subscriptions: [sessionUri],
		}));

		const reconnectResp = await reconnectRespPromise;
		const result = (reconnectResp as { result: ReconnectResult }).result;
		assert.strictEqual(result.type, 'snapshot');
		if (result.type === 'snapshot') {
			assert.ok(result.snapshots.length > 0, 'should contain snapshots');
		}
	});

	test('reconnect rehydrates server-side state that was evicted while disconnected', async () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		// MockAgentService.subscribe normally just returns the existing snapshot.
		// Override it so a missing session is restored on subscribe — this is the
		// behavior the real AgentService provides and that reconnect now relies on.
		const subscribeCalls: string[] = [];
		agentService.subscribe = async (resource, _clientId) => {
			subscribeCalls.push(resource.toString());
			let snapshot = stateManager.getSnapshot(resource.toString());
			if (!snapshot) {
				stateManager.restoreSession(makeSessionSummary(), []);
				snapshot = stateManager.getSnapshot(resource.toString())!;
			}
			return snapshot;
		};

		const transport1 = connectClient('client-e', [sessionUri]);
		const initResp = findResponse(transport1.sent, 1);
		const initSeq = (initResp as { result: InitializeResult }).result.serverSeq;
		transport1.simulateClose();

		// Simulate the AgentService evicting the idle session while the client
		// was disconnected (this is what `_maybeEvictIdleSession` does in the
		// real service).
		stateManager.removeSession(sessionUri);
		assert.strictEqual(stateManager.getSnapshot(sessionUri), undefined, 'precondition: state evicted');

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-e',
			lastSeenServerSeq: initSeq,
			subscriptions: [sessionUri],
		}));

		await reconnectRespPromise;
		assert.deepStrictEqual(subscribeCalls, [sessionUri], 'reconnect should call subscribe to restore evicted state');
		assert.ok(stateManager.getSnapshot(sessionUri), 'state should have been re-hydrated by reconnect');
	});

	test('reconnect re-registers the reverse-RPC filesystem authority', async () => {
		// The server-side filesystem provider talks back to the client via
		// reverse-RPC (e.g. `resourceList`). If the authority is not
		// re-registered on reconnect, the agent host would fail with
		// "No connection for authority: <clientId>" until the client
		// reinitialized. Verify a reverse-RPC routes through the new
		// transport after reconnect.
		const transport1 = connectClient('client-fs');
		transport1.simulateClose();

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-fs',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		await reconnectRespPromise;
		transport2.sent.length = 0;

		// Wire the test's response *before* we trigger the reverse-RPC so
		// the response is observed on the next microtask.
		disposables.add(transport2.onDidSend(msg => {
			if (isJsonRpcRequest(msg) && msg.method === 'resourceList') {
				transport2.simulateMessage({
					jsonrpc: '2.0',
					id: msg.id,
					result: { entries: [{ name: 'after-reconnect.txt', type: 'file' as const }] },
				});
			}
		}));

		const result = await fileSystemProvider.readdir(agentHostUri('client-fs', '/workspace'));
		assert.deepStrictEqual(result, [['after-reconnect.txt', FileType.File]]);
	});

	test('overlapping reconnect keeps earlier reverse-RPC requests alive until that transport closes', async () => {
		const transport1 = connectClient('client-fs-overlap');
		const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, msg => isJsonRpcRequest(msg) && msg.method === 'resourceList'));
		const readPromise = fileSystemProvider.readdir(agentHostUri('client-fs-overlap', '/workspace'));
		const reverseRequest = await reverseRequestPromise;
		assert.ok(isJsonRpcRequest(reverseRequest));

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-fs-overlap',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		await reconnectRespPromise;

		transport1.simulateMessage({
			jsonrpc: '2.0',
			id: reverseRequest.id,
			result: { entries: [{ name: 'from-original-transport.txt', type: 'file' as const }] },
		});

		const result = await readPromise;
		assert.deepStrictEqual(result, [['from-original-transport.txt', FileType.File]]);
	});

	test('closing an older overlapping transport rejects its pending reverse-RPC requests', async () => {
		const transport1 = connectClient('client-fs-overlap-close');
		const reverseRequestPromise = Event.toPromise(Event.filter(transport1.onDidSend, msg => isJsonRpcRequest(msg) && msg.method === 'resourceList'));
		const readPromise = fileSystemProvider.readdir(agentHostUri('client-fs-overlap-close', '/workspace'));
		await reverseRequestPromise;

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-fs-overlap-close',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		await reconnectRespPromise;

		transport1.simulateClose();

		await assert.rejects(readPromise, /Client client-fs-overlap-close disconnected/);
	});

	test('client disconnect cleans up', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transport = connectClient('client-d', [sessionUri]);
		transport.sent.length = 0;

		transport.simulateClose();

		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'After Disconnect' });

		assert.strictEqual(transport.sent.length, 0);
	});

	test('client disconnect retains active client during grace, then removes it and fails owned tool calls after grace period', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const transport = connectClient('client-tools', [sessionUri]);
			transport.simulateClose();

			// The active client is retained during the grace window so a quick
			// reconnect can keep its slot.
			assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map(c => c.clientId), ['client-tools']);
			let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Running);

			await new Promise(r => setTimeout(r, 30_001));

			// After the grace window the active client is removed and its
			// pending tool call is failed.
			assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
			part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
				status: part.toolCall.status,
				success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
				error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
				error: 'Client client-tools disconnected before completing Run Task',
			});
		});
	});

	test('client disconnect fails owned streaming tool calls after grace period', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});

			const transport = connectClient('client-tools', [sessionUri]);
			transport.simulateClose();

			let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

			await new Promise(r => setTimeout(r, 30_001));

			part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
				status: part.toolCall.status,
				success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
				error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
				error: 'Client client-tools disconnected before completing Run Task',
			});
		});
	});

	test('owned tool call is not failed when closing the latest overlapping transport falls back to an older one', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});

			const fallbackTransport = connectClient('client-tools', [sessionUri]);
			const latestTransport = connectClient('client-tools', [sessionUri]);

			latestTransport.simulateClose();

			let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

			await new Promise(r => setTimeout(r, 30_001));

			part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

			fallbackTransport.simulateClose();
		});
	});

	test('owned tool call is failed after the last overlapping transport closes', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});

			const fallbackTransport = connectClient('client-tools', [sessionUri]);
			const latestTransport = connectClient('client-tools', [sessionUri]);
			latestTransport.simulateClose();

			await new Promise(r => setTimeout(r, 30_001));
			let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

			fallbackTransport.simulateClose();
			await new Promise(r => setTimeout(r, 30_001));

			part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
				status: part.toolCall.status,
				success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
				error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
				error: 'Client client-tools disconnected before completing Run Task',
			});
		});
	});

	test('client reconnect without session subscription does not clear tool call disconnect timeout', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const transport = connectClient('client-tools', [sessionUri]);
			transport.simulateClose();

			const reconnectTransport = new MockProtocolTransport();
			server.simulateConnection(reconnectTransport);
			reconnectTransport.simulateMessage(request(1, 'reconnect', {
				clientId: 'client-tools',
				lastSeenServerSeq: stateManager.serverSeq,
				subscriptions: [],
			}));

			await new Promise(r => setTimeout(r, 30_001));

			const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
				status: part.toolCall.status,
				success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
			});
		});
	});

	test('client reconnect with session subscription clears tool call disconnect timeout for that session', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const transport = connectClient('client-tools', [sessionUri]);
			transport.simulateClose();

			const reconnectTransport = new MockProtocolTransport();
			server.simulateConnection(reconnectTransport);
			reconnectTransport.simulateMessage(request(1, 'reconnect', {
				clientId: 'client-tools',
				lastSeenServerSeq: stateManager.serverSeq,
				subscriptions: [sessionUri],
			}));

			await new Promise(r => setTimeout(r, 30_001));

			const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Running);
		});
	});

	test('client tool timeout tells model it may retry when replacement active client provides the tool', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-tools',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallReady,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				invocationMessage: 'Run Task',
				toolInput: '{}',
				confirmed: ToolCallConfirmationReason.NotNeeded,
			});

			const transport = connectClient('client-tools', [sessionUri]);
			transport.simulateClose();
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'client-replacement',
					tools: [{ name: 'runTask', description: 'Runs a task' }]
				},
			});

			await new Promise(r => setTimeout(r, 30_001));

			const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind, ResponsePartKind.ToolCall);
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
				status: part.toolCall.status,
				success: part.toolCall.success,
				content: part.toolCall.content,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
				content: [{ type: ToolResultContentType.Text, text: 'The client that was running Run Task disconnected, but another active client now provides Run Task. You may try calling the tool again.' }],
			});
		});
	});

	test('client tool call stamped for a never-connected client fails after the grace period', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			const chatUri = buildDefaultChatUri(sessionUri);
			stateManager.dispatchServerAction(chatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			// Tool call stamped for a clientId that never connected (e.g. a
			// stale stamp from a long-dead window). No disconnect event ever
			// fires for it; the issuance-time orphan check must arm the timeout.
			stateManager.dispatchServerAction(chatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'ghost-client' },
			});

			let part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

			await new Promise(r => setTimeout(r, 30_001));

			part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
				status: part.toolCall.status,
				success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
				error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
			} : undefined, {
				status: ToolCallStatus.Completed,
				success: false,
				error: 'Client ghost-client disconnected before completing Run Task',
			});
		});
	});

	test('orphaned client tool call timeout is cleared when the owning client connects within the window', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'late-client' },
			});

			// The owning client connects (and subscribes) within the grace
			// window — the subscribe path clears the armed timeout.
			connectClient('late-client', [sessionUri]);

			await new Promise(r => setTimeout(r, 30_001));

			const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);
		});
	});

	test('a later orphaned tool call does not extend an earlier one past the grace window', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			// First orphaned tool call (owner never connected) arms the grace timer.
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'ghost-client' },
			});

			// A second call for the same never-connected owner arrives partway
			// through the window and re-arms the (shared) timer. The grace clock
			// is pinned to the first arm, so the re-arm must NOT reset the
			// deadline — otherwise the first call could be kept alive
			// indefinitely.
			await new Promise(r => setTimeout(r, 20_000));
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-2',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'ghost-client' },
			});

			// 31s after the FIRST call: both must have failed.
			await new Promise(r => setTimeout(r, 11_000));

			const parts = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts ?? [];
			const statuses = parts
				.filter(p => p.kind === ResponsePartKind.ToolCall)
				.map(p => p.kind === ResponsePartKind.ToolCall ? p.toolCall.status : undefined);
			assert.deepStrictEqual(statuses, [ToolCallStatus.Completed, ToolCallStatus.Completed]);
		});
	});

	test('unsubscribe removes the active client and fails its owned tool calls', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
		stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionActiveClientSet,
			activeClient: {
				clientId: 'client-tools',
				tools: [{ name: 'runTask', description: 'Runs a task' }]
			},
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'run it', origin: { kind: MessageKind.User } },
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			toolName: 'runTask',
			displayName: 'Run Task',
			contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			invocationMessage: 'Run Task',
			toolInput: '{}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		const transport = connectClient('client-tools', [sessionUri]);
		transport.simulateMessage(notification('unsubscribe', { channel: sessionUri }));

		assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
		const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
		assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
			status: part.toolCall.status,
			success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
			error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
		} : undefined, {
			status: ToolCallStatus.Completed,
			success: false,
			error: 'Client client-tools disconnected before completing Run Task',
		});

		transport.simulateClose();
	});

	test('reconnect without resubscription removes the active client and fails its owned tool calls', async () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transport1 = connectClient('client-tools', [sessionUri]);
		const initSeq = (findResponse(transport1.sent, 1) as { result: InitializeResult }).result.serverSeq;

		stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionActiveClientSet,
			activeClient: {
				clientId: 'client-tools',
				tools: [{ name: 'runTask', description: 'Runs a task' }]
			},
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'run it', origin: { kind: MessageKind.User } },
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			toolName: 'runTask',
			displayName: 'Run Task',
			contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatToolCallReady,
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			invocationMessage: 'Run Task',
			toolInput: '{}',
			confirmed: ToolCallConfirmationReason.NotNeeded,
		});

		transport1.simulateClose();

		// Reconnect, but do NOT resubscribe to the session.
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-tools',
			lastSeenServerSeq: initSeq,
			subscriptions: [],
		}));
		await reconnectRespPromise;

		assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients, []);
		const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
		assert.deepStrictEqual(part?.kind === ResponsePartKind.ToolCall ? {
			status: part.toolCall.status,
			success: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.success : undefined,
			error: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.error?.message : undefined,
		} : undefined, {
			status: ToolCallStatus.Completed,
			success: false,
			error: 'Client client-tools disconnected before completing Run Task',
		});

		transport2.simulateClose();
	});

	test('reconnect with resubscription keeps the active client and its owned tool calls', async () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const transport1 = connectClient('client-tools', [sessionUri]);
		const initSeq = (findResponse(transport1.sent, 1) as { result: InitializeResult }).result.serverSeq;

		stateManager.dispatchServerAction(sessionUri, {
			type: ActionType.SessionActiveClientSet,
			activeClient: {
				clientId: 'client-tools',
				tools: [{ name: 'runTask', description: 'Runs a task' }]
			},
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'run it', origin: { kind: MessageKind.User } },
		});
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatToolCallStart,
			turnId: 'turn-1',
			toolCallId: 'tool-1',
			toolName: 'runTask',
			displayName: 'Run Task',
			contributor: { kind: ToolCallContributorKind.Client, clientId: 'client-tools' },
		});

		transport1.simulateClose();

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 1);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-tools',
			lastSeenServerSeq: initSeq,
			subscriptions: [sessionUri],
		}));
		await reconnectRespPromise;

		assert.deepStrictEqual(stateManager.getSessionState(sessionUri)?.activeClients.map(c => c.clientId), ['client-tools']);
		const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
		assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);

		transport2.simulateClose();
	});

	test('handshake includes defaultDirectory from side effects', () => {
		const transport = connectClient('client-home');

		const resp = findResponse(transport.sent, 1);
		assert.ok(resp);
		const result = (resp as { result: InitializeResult }).result;
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

	test('resourceRead does not log missing file reads', async () => {
		const transport = connectClient('client-read-missing-file');
		transport.sent.length = 0;

		const fileUri = URI.file('/missing').toString();
		agentService.readErrors.set(fileUri, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${fileUri}`));
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'resourceRead', { uri: fileUri }));
		const resp = await responsePromise as { error?: { code: number; message: string } };

		assert.deepStrictEqual({
			errorCode: resp.error?.code,
			errorCount: logService.errorCount,
		}, {
			errorCode: AhpErrorCodes.NotFound,
			errorCount: 0,
		});
	});

	test('resourceRead logs missing non-file reads', async () => {
		const transport = connectClient('client-read-missing-session-db');
		transport.sent.length = 0;

		const resource = 'session-db:/missing';
		agentService.readErrors.set(resource, new ProtocolError(AhpErrorCodes.NotFound, `Content not found: ${resource}`));
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'resourceRead', { uri: resource }));
		const resp = await responsePromise as { error?: { code: number; message: string } };

		assert.deepStrictEqual({
			errorCode: resp.error?.code,
			errorCount: logService.errorCount,
		}, {
			errorCode: AhpErrorCodes.NotFound,
			errorCount: 1,
		});
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

		// Reconnect with same clientId (new active transport)
		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		transport2.simulateMessage(request(1, 'reconnect', {
			clientId: 'client-rc',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		// Count is unchanged because the logical clientId is already connected.
		assert.deepStrictEqual(counts, [1, 1]);

		// Old transport closes - should NOT decrement because the newer
		// transport is still connected.
		transport1.simulateClose();
		assert.deepStrictEqual(counts, [1, 1]);

		// New transport closes - should decrement
		transport2.simulateClose();
		assert.deepStrictEqual(counts, [1, 1, 0]);
	});

	// ---- createSession activeClient -------------------------------------

	suite('createSession activeClient', () => {

		test('forwards activeClient to the agent service', async () => {
			const newSession = URI.parse('copilot:///eager-session').toString();

			const transport = connectClient('client-1');
			transport.sent.length = 0;

			const responsePromise = waitForResponse(transport, 2);
			transport.simulateMessage(request(2, 'createSession', {
				session: newSession,
				provider: 'copilot',
				activeClient: {
					clientId: 'client-1',
					tools: [{ name: 't1', description: 'd', inputSchema: { type: 'object' } }],
					customizations: [{ uri: 'file:///plugin-a', displayName: 'A' }],
				},
			}));
			const resp = await responsePromise as { result?: unknown; error?: unknown };

			assert.strictEqual(resp.error, undefined, 'createSession should succeed');
			const config = agentService.createSessionConfigs.at(-1);
			assert.deepStrictEqual({
				clientId: config?.activeClient?.clientId,
				toolName: config?.activeClient?.tools[0]?.name,
				customizationUri: config?.activeClient?.customizations?.[0].uri,
			}, {
				clientId: 'client-1',
				toolName: 't1',
				customizationUri: 'file:///plugin-a',
			});
		});

		test('rejects createSession when activeClient.clientId mismatches', async () => {
			const newSession = URI.parse('copilot:///mismatch-session').toString();

			const transport = connectClient('client-1');
			transport.sent.length = 0;

			const responsePromise = waitForResponse(transport, 2);
			transport.simulateMessage(request(2, 'createSession', {
				session: newSession,
				provider: 'copilot',
				activeClient: {
					clientId: 'other-client',
					tools: [],
				},
			}));
			const resp = await responsePromise as { result?: unknown; error?: { code: number; message: string } };

			assert.ok(resp.error, 'response should be an error');
			assert.strictEqual(resp.result, undefined);
			assert.strictEqual(agentService.createSessionConfigs.length, 0, 'agent service should not have been called');
		});
	});

	suite('OTLP logs channel', () => {
		// We need a separate handler instance that has an OtlpLogEmitter
		// attached, so spin one up per-test using a private state manager.
		// The outer-suite handler is left alone and continues to test the
		// "no OTLP" code path implicitly.
		let otlpEmitter: OtlpLogEmitter;
		let otlpStateManager: AgentHostStateManager;
		let otlpServer: MockProtocolServer;
		let otlpAgentService: MockAgentService;
		let localDisposables: DisposableStore;

		setup(() => {
			localDisposables = new DisposableStore();
			otlpEmitter = localDisposables.add(new OtlpLogEmitter());
			otlpStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
			otlpServer = localDisposables.add(new MockProtocolServer());
			otlpAgentService = new MockAgentService();
			otlpAgentService.setStateManager(otlpStateManager);
			localDisposables.add(otlpAgentService);
			localDisposables.add(new ProtocolServerHandler(
				otlpAgentService,
				otlpStateManager,
				otlpServer,
				{ defaultDirectory: URI.file('/home/testuser').toString(), otlpLogEmitter: otlpEmitter },
				localDisposables.add(new AgentHostFileSystemProvider()),
				new NullLogService(),
			));
		});

		teardown(() => {
			localDisposables.dispose();
		});

		function connectOtlpClient(clientId: string, initialSubscriptions?: readonly string[]): MockProtocolTransport {
			const transport = new MockProtocolTransport();
			otlpServer.simulateConnection(transport);
			transport.simulateMessage(request(1, 'initialize', {
				protocolVersions: [PROTOCOL_VERSION],
				clientId,
				initialSubscriptions,
			}));
			return transport;
		}

		function findOtlpLogs(sent: ProtocolMessage[]): { channel: string; payload: unknown }[] {
			return sent
				.filter(isJsonRpcNotification)
				.filter((m): m is AhpNotification & { method: 'otlp/exportLogs'; params: { channel: string; payload: unknown } } => m.method === 'otlp/exportLogs')
				.map(m => ({ channel: m.params.channel, payload: m.params.payload }));
		}

		test('handshake advertises the logs channel template', () => {
			const transport = connectOtlpClient('client-otlp-1');
			const resp = findResponse(transport.sent, 1) as { result: InitializeResult & { telemetry?: { logs?: string } } };
			assert.deepStrictEqual(resp.result.telemetry, { logs: 'ahp-otlp://logs/{level}' });
		});

		test('subscribe to logs channel returns an empty stateless result and starts forwarding records at-or-above the requested level', async () => {
			const transport = connectOtlpClient('client-otlp-2');
			transport.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/warn' }));
			const resp = await waitForResponse(transport, 2);
			assert.deepStrictEqual((resp as { result: unknown }).result, {});

			otlpEmitter.emit({ timeUnixNano: '1000', severityNumber: 9, severityText: 'info', body: 'info-msg' });
			otlpEmitter.emit({ timeUnixNano: '1001', severityNumber: 13, severityText: 'warn', body: 'warn-msg' });
			otlpEmitter.emit({ timeUnixNano: '1002', severityNumber: 17, severityText: 'error', body: 'error-msg' });

			const logs = findOtlpLogs(transport.sent);
			const bodies = logs.flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map(r => r.body));
			assert.deepStrictEqual(bodies, ['warn-msg', 'error-msg']);
			for (const { channel } of logs) {
				assert.strictEqual(channel, 'ahp-otlp://logs/warn');
			}
		});

		test('unsubscribe stops forwarding without affecting other subscribers', async () => {
			const a = connectOtlpClient('client-otlp-a');
			const b = connectOtlpClient('client-otlp-b');

			const aSubscribed = waitForResponse(a, 2);
			const bSubscribed = waitForResponse(b, 2);
			a.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/trace' }));
			b.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/trace' }));
			await aSubscribed;
			await bSubscribed;

			otlpEmitter.emit({ timeUnixNano: '1', severityNumber: 9, severityText: 'info', body: 'first' });

			a.simulateMessage(notification('unsubscribe', { channel: 'ahp-otlp://logs/trace' }));
			otlpEmitter.emit({ timeUnixNano: '2', severityNumber: 9, severityText: 'info', body: 'second' });

			const aBodies = findOtlpLogs(a.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map(r => r.body));
			const bBodies = findOtlpLogs(b.sent).flatMap(({ payload }) => [...iterateOtlpLogRecords(payload)].map(r => r.body));
			assert.deepStrictEqual({ a: aBodies, b: bBodies }, { a: ['first'], b: ['first', 'second'] });
		});

		test('multiple subscriptions to different levels each receive their own band', async () => {
			const transport = connectOtlpClient('client-otlp-multi');
			const subscribed2 = waitForResponse(transport, 2);
			const subscribed3 = waitForResponse(transport, 3);
			transport.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/info' }));
			transport.simulateMessage(request(3, 'subscribe', { channel: 'ahp-otlp://logs/error' }));
			await subscribed2;
			await subscribed3;

			otlpEmitter.emit({ timeUnixNano: '1', severityNumber: 9, severityText: 'info', body: 'info-only' });
			otlpEmitter.emit({ timeUnixNano: '2', severityNumber: 17, severityText: 'error', body: 'both' });

			const byChannel = new Map<string, string[]>();
			for (const { channel, payload } of findOtlpLogs(transport.sent)) {
				const bodies = [...iterateOtlpLogRecords(payload)].map(r => r.body);
				byChannel.set(channel, [...(byChannel.get(channel) ?? []), ...bodies]);
			}
			assert.deepStrictEqual(Object.fromEntries(byChannel), {
				'ahp-otlp://logs/info': ['info-only', 'both'],
				'ahp-otlp://logs/error': ['both'],
			});
		});

		test('client disconnect drops its OTLP subscriptions', async () => {
			const transport = connectOtlpClient('client-otlp-disconnect');
			transport.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/trace' }));
			await waitForResponse(transport, 2);

			transport.simulateClose();
			otlpEmitter.emit({ timeUnixNano: '1', severityNumber: 9, severityText: 'info', body: 'after-close' });

			// After close, no further notifications should land on the
			// disconnected transport. (Sanity: the only message we expect
			// was the subscribe response we already consumed.)
			const logs = findOtlpLogs(transport.sent);
			assert.deepStrictEqual(logs, []);
		});

		test('unrecognised ahp-otlp URIs do not crash subscribe', async () => {
			const transport = connectOtlpClient('client-otlp-bad');
			transport.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/verbose' }));
			const resp = await waitForResponse(transport, 2);
			assert.deepStrictEqual((resp as { result: unknown }).result, {}, 'unknown level should be acknowledged as stateless');

			otlpEmitter.emit({ timeUnixNano: '1', severityNumber: 9, severityText: 'info', body: 'whatever' });
			assert.deepStrictEqual(findOtlpLogs(transport.sent), [], 'no records should leak to an invalid level');
		});

		test('URI variants that parse to the same level collapse to one canonical subscription', async () => {
			const transport = connectOtlpClient('client-otlp-canonical');
			const r2 = waitForResponse(transport, 2);
			const r3 = waitForResponse(transport, 3);
			const r4 = waitForResponse(transport, 4);
			transport.simulateMessage(request(2, 'subscribe', { channel: 'ahp-otlp://logs/info' }));
			transport.simulateMessage(request(3, 'subscribe', { channel: 'ahp-otlp://logs/info?dup=1' }));
			transport.simulateMessage(request(4, 'subscribe', { channel: 'ahp-otlp://logs/info#frag' }));
			await r2; await r3; await r4;

			otlpEmitter.emit({ timeUnixNano: '1', severityNumber: 9, severityText: 'info', body: 'once' });

			const logs = findOtlpLogs(transport.sent);
			assert.strictEqual(logs.length, 1, 'one record should produce exactly one notification');
			assert.strictEqual(logs[0].channel, 'ahp-otlp://logs/info', 'channel should be canonicalised');

			// Unsubscribe should remove the canonical entry regardless of
			// which URI variant the client uses to unsubscribe.
			transport.simulateMessage(notification('unsubscribe', { channel: 'ahp-otlp://logs/info?dup=1' }));
			otlpEmitter.emit({ timeUnixNano: '2', severityNumber: 9, severityText: 'info', body: 'after-unsub' });

			assert.strictEqual(findOtlpLogs(transport.sent).length, 1, 'no further notifications after unsubscribe');
		});
	});

	suite('download progress channel', () => {
		// Progress is emitted on the state manager (so it reaches both local
		// IPC and remote WebSocket renderers through the same path as session
		// notifications). This suite verifies the handler forwards each frame to
		// connected clients as a `progress` notification on the root channel.
		// Spun up per-test with a private state manager so the outer suite is
		// unaffected.
		let dlStateManager: AgentHostStateManager;
		let dlServer: MockProtocolServer;
		let dlAgentService: MockAgentService;
		let localDisposables: DisposableStore;

		setup(() => {
			localDisposables = new DisposableStore();
			dlStateManager = localDisposables.add(new AgentHostStateManager(new NullLogService()));
			dlServer = localDisposables.add(new MockProtocolServer());
			dlAgentService = new MockAgentService();
			dlAgentService.setStateManager(dlStateManager);
			localDisposables.add(dlAgentService);
			localDisposables.add(new ProtocolServerHandler(
				dlAgentService,
				dlStateManager,
				dlServer,
				{ defaultDirectory: URI.file('/home/testuser').toString() },
				localDisposables.add(new AgentHostFileSystemProvider()),
				new NullLogService(),
			));
		});

		teardown(() => {
			localDisposables.dispose();
		});

		function connectDownloadClient(clientId: string): MockProtocolTransport {
			const transport = new MockProtocolTransport();
			dlServer.simulateConnection(transport);
			transport.simulateMessage(request(1, 'initialize', {
				protocolVersions: [PROTOCOL_VERSION],
				clientId,
			}));
			return transport;
		}

		function findProgress(sent: ProtocolMessage[]): ProgressParams[] {
			return sent
				.filter(isJsonRpcNotification)
				.filter((m): m is AhpNotification & { method: 'root/progress'; params: ProgressParams } => m.method === 'root/progress')
				.map(m => m.params);
		}

		test('forwards each progress frame to connected clients on the root channel', () => {
			const transport = connectDownloadClient('client-dl-1');

			dlStateManager.emitProgress({ progressToken: 't1', progress: 0, total: 1000, message: 'Claude' });
			dlStateManager.emitProgress({ progressToken: 't1', progress: 500, total: 1000, message: 'Claude' });
			dlStateManager.emitProgress({ progressToken: 't1', progress: 1000, total: 1000, message: 'Claude' });

			const frames = findProgress(transport.sent);
			assert.deepStrictEqual(frames.map(f => f.progress), [0, 500, 1000]);
			assert.ok(frames.every(f => f.progressToken === 't1' && f.message === 'Claude' && f.total === 1000));
			assert.ok(frames.every(f => (f as ProgressParams & { channel: string }).channel === 'ahp-root://'), 'frames are broadcast on the root channel');
		});
	});

	suite('resource watches', () => {

		test('subscribe to a resource-watch channel returns the descriptor + bumps refcount; envelopes are routed', async () => {
			// Pre-populate the mock so `onResourceWatchSubscribed` returns
			// a descriptor — this is the role the production `AgentService`
			// plays after it parses the channel URI.
			const watchChannel = 'ahp-resource-watch:/mock-watch';
			const descriptor = { root: 'file:///workspace', recursive: false };
			agentService.liveWatchDescriptors.set(watchChannel, descriptor);

			const transport = connectClient('client-watch');
			transport.sent.length = 0;

			const subPromise = waitForResponse(transport, 101);
			transport.simulateMessage(request(101, 'subscribe', { channel: watchChannel }));
			const resp = await subPromise;
			const result = (resp as { result: { snapshot: IStateSnapshot } }).result;
			assert.strictEqual(result.snapshot.resource, watchChannel);
			assert.deepStrictEqual(result.snapshot.state, descriptor);
			assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);

			transport.sent.length = 0;
			stateManager.dispatchServerAction(watchChannel, {
				type: ActionType.ResourceWatchChanged,
				changes: { items: [{ uri: 'file:///workspace/a.txt', type: 'updated' as never }] },
			} as unknown as Parameters<typeof stateManager.dispatchServerAction>[1]);

			const actionMsgs = findNotifications(transport.sent, 'action');
			assert.strictEqual(actionMsgs.length, 1, 'subscriber should receive the change envelope');
			const env = actionMsgs[0].params as unknown as { channel: string; action: { type: string } };
			assert.strictEqual(env.channel, watchChannel);
			assert.strictEqual(env.action.type, ActionType.ResourceWatchChanged);

			// Explicit unsubscribe drops the refcount through the agent service.
			transport.simulateMessage(notification('unsubscribe', { channel: watchChannel }));
			assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
		});

		test('subscribe to an unknown resource-watch channel surfaces a JSON-RPC error', async () => {
			const transport = connectClient('client-watch-bad');
			transport.sent.length = 0;
			const respPromise = waitForResponse(transport, 102);
			transport.simulateMessage(request(102, 'subscribe', { channel: 'ahp-resource-watch:/bogus' }));
			const resp = await respPromise;
			const error = (resp as unknown as { error?: { code: number } }).error;
			assert.ok(error, `expected an error response, got ${JSON.stringify(resp)}`);
		});

		test('client disconnect releases the watch refcount', async () => {
			const watchChannel = 'ahp-resource-watch:/mock-watch-disconnect';
			agentService.liveWatchDescriptors.set(watchChannel, { root: 'file:///root', recursive: false });

			const transport = connectClient('client-watch-2');
			const subPromise = waitForResponse(transport, 200);
			transport.simulateMessage(request(200, 'subscribe', { channel: watchChannel }));
			await subPromise;
			assert.deepStrictEqual(agentService.watchSubscribeCalls, [watchChannel]);

			transport.simulateClose();
			assert.deepStrictEqual(agentService.watchUnsubscribeCalls, [watchChannel]);
		});

		test('overlapping transports release each resource-watch subscription', async () => {
			const watchChannel = 'ahp-resource-watch:/mock-watch-overlap';
			agentService.liveWatchDescriptors.set(watchChannel, { root: 'file:///root', recursive: false });

			const transport1 = connectClient('client-watch-overlap');
			const subPromise1 = waitForResponse(transport1, 200);
			transport1.simulateMessage(request(200, 'subscribe', { channel: watchChannel }));
			await subPromise1;

			const transport2 = connectClient('client-watch-overlap');
			const subPromise2 = waitForResponse(transport2, 201);
			transport2.simulateMessage(request(201, 'subscribe', { channel: watchChannel }));
			await subPromise2;

			transport2.simulateClose();
			transport1.simulateClose();

			assert.deepStrictEqual({
				subscribes: agentService.watchSubscribeCalls,
				unsubscribes: agentService.watchUnsubscribeCalls,
			}, {
				subscribes: [watchChannel, watchChannel],
				unsubscribes: [watchChannel, watchChannel],
			});
		});
	});
});
