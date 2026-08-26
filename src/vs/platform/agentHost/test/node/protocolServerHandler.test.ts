/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { FileType } from '../../../files/common/files.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { ITelemetryService, TelemetryLevel } from '../../../telemetry/common/telemetry.js';
import { type IAgentCreateChatRequestOptions, type IAgentCreateSessionConfig, type IAgentResolveSessionConfigParams, type IAgentSessionConfigCompletionsParams, type IAgentSessionMetadata, type AuthenticateParams, type AuthenticateResult } from '../../common/agent.js';
import { type IAgentHostManagedSettingsDiagnostics, type IAgentHostNetworkDiagnosticsInfo, type IAgentHostNetworkFetchResult, type IAgentService } from '../../common/agentService.js';
import { ChatSourceKind, CompletionsParams, CompletionsResult, ContentEncoding, ListSessionsResult, ResourceReadResult, ResolveSessionConfigResult, SessionConfigCompletionsResult, ResourceMkdirParams, ResourceMkdirResult, ResourceResolveParams, ResourceResolveResult, ResourceCopyParams, ResourceCopyResult } from '../../common/state/protocol/commands.js';
import type { AutomationCapabilities, Implementation } from '../../common/state/protocol/common/commands.js';
import type { FetchAutomationRunsParams, FetchAutomationRunsResult, ListAutomationTriggerDefinitionsParams, ListAutomationTriggerDefinitionsResult, RunAutomationParams, RunAutomationResult } from '../../common/state/protocol/channels-automation/commands.js';
import { ActionType, type ActionEnvelope, type ChatAction, type ClientAnnotationsAction, type ClientAutomationAction, type ClientAutomationRunAction, type ClientChangesetAction, type IRootConfigChangedAction, type ProgressParams, type SessionAction, type TerminalAction } from '../../common/state/sessionActions.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { isJsonRpcNotification, isJsonRpcRequest, isJsonRpcResponse, JSON_RPC_INTERNAL_ERROR, JsonRpcErrorCodes, ProtocolError, AhpErrorCodes, AHP_UNSUPPORTED_PROTOCOL_VERSION, AHP_SESSION_NOT_FOUND, type AhpNotification, type InitializeResult, type ProtocolMessage, type ReconnectResult, type ResourceListResult, type ResourceWriteParams, type ResourceWriteResult, type IStateSnapshot, type SubscribeResult } from '../../common/state/sessionProtocol.js';
import { AUTOMATION_CATALOG_URI, MessageKind, ResponsePartKind, SessionStatus, ChangesetStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, buildChatUri, buildDefaultChatUri, readSessionExternal, readSessionWorkspaceless, withSessionExternal, withSessionWorkspaceless, type SessionSummary } from '../../common/state/sessionState.js';
import type { SessionAddedParams, SessionSummaryChangedParams } from '../../common/state/protocol/notifications.js';
import type { IProtocolServer, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { ProtocolServerHandler } from '../../node/protocolServerHandler.js';
import { CompositeProtocolServer } from '../../node/compositeProtocolServer.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostFileSystemProvider, agentHostUri, type IRemoteFilesystemConnection } from '../../common/agentHostFileSystemProvider.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo, AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind, type IAgentHostClientTelemetryContext } from '../../common/agentHostTelemetry.js';
import { iterateOtlpLogRecords, OtlpLogEmitter } from '../../common/otlp/otlpLogEmitter.js';
import { MessagePortProtocolServer } from '../../node/messagePortProtocolServer.js';
import { AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION, AgentHostClientConnectionService } from '../../node/agentHostClientConnectionService.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { AgentHostTelemetryService } from '../../node/agentHostTelemetryService.js';

// ---- Mock helpers -----------------------------------------------------------

class MockProtocolTransport implements IProtocolTransport {
	constructor(readonly transportKind = AgentHostTransportKind.Unknown) { }

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

class FailingAgentHostFileSystemProvider extends AgentHostFileSystemProvider {
	override registerAuthority(_authority: string, _connection: IRemoteFilesystemConnection): never {
		throw new Error('registration failed');
	}
}

class FailingReconnectAgentHostFileSystemProvider extends AgentHostFileSystemProvider {
	private _registrationCount = 0;

	override registerAuthority(authority: string, connection: IRemoteFilesystemConnection) {
		this._registrationCount++;
		if (this._registrationCount === 2) {
			throw new Error('registration failed');
		}
		return super.registerAuthority(authority, connection);
	}
}

class TestTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sendErrorTelemetry = true;
	readonly sessionId = 'session';
	readonly machineId = 'machine';
	readonly sqmId = 'sqm';
	readonly devDeviceId = 'device';
	readonly firstSessionDate = 'first-session';
	readonly events: { eventName: string; data: unknown }[] = [];
	throwOnClientConnection = false;

	publicLog(): void { }
	publicLog2(eventName?: string, data?: unknown): void {
		if (this.throwOnClientConnection && eventName === 'agentHost.clientConnection') {
			throw new Error('client connection telemetry failed');
		}
		if (eventName) {
			this.events.push({ eventName, data });
		}
	}
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

class MockAgentService implements IAgentService {
	declare readonly _serviceBrand: undefined;
	readonly handledActions: (SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction)[] = [];
	readonly handledClientTypes: (AgentHostClientType | undefined)[] = [];
	readonly handledClientContexts: (IAgentHostClientTelemetryContext | undefined)[] = [];
	readonly browsedUris: URI[] = [];
	readonly browseErrors = new Map<string, Error>();
	readonly readErrors = new Map<string, Error>();
	readonly listedSessions: IAgentSessionMetadata[] = [];
	readonly createSessionConfigs: (IAgentCreateSessionConfig | undefined)[] = [];
	managedSettingsDiagnostics: readonly IAgentHostManagedSettingsDiagnostics[] = [];
	readonly getSessionStateFileCalls: string[] = [];
	readonly collectDebugLogsCalls: { session: string | undefined; chat: string | undefined; kind: 'archive' | 'directory' }[] = [];
	shutdownCalls = 0;
	createSessionBarrier: DeferredPromise<void> | undefined;
	subscribeBarrier: DeferredPromise<void> | undefined;
	readonly subscribeBarriers = new Map<string, DeferredPromise<void>>();
	readonly subscribeCalls: { resource: string; clientId: string }[] = [];
	readonly unsubscribeCalls: { resource: string; clientId: string }[] = [];
	afterListSessionsSnapshot: (() => void) | undefined;
	readonly automationRunRequests: RunAutomationParams[] = [];
	automationRunResult: RunAutomationResult | undefined;

	private readonly _onDidAction = new Emitter<import('../../common/state/sessionActions.js').ActionEnvelope>();
	readonly onDidAction = this._onDidAction.event;
	private readonly _onDidNotification = new Emitter<import('../../common/state/sessionActions.js').INotification>();
	readonly onDidNotification = this._onDidNotification.event;
	private readonly _onMcpNotification = new Emitter<import('../../common/agent.js').IMcpNotification>();
	readonly onMcpNotification = this._onMcpNotification.event;

	private _stateManager!: AgentHostStateManager;

	/** Connect to the state manager so dispatchAction works correctly. */
	setStateManager(sm: AgentHostStateManager): void {
		this._stateManager = sm;
	}

	dispatchAction(channel: string, action: SessionAction | ChatAction | TerminalAction | ClientChangesetAction | ClientAnnotationsAction | IRootConfigChangedAction | ClientAutomationAction | ClientAutomationRunAction, clientId: string, clientSeq: number, clientContext?: IAgentHostClientTelemetryContext): void {
		this.handledActions.push(action);
		this.handledClientTypes.push(clientContext?.clientType);
		this.handledClientContexts.push(clientContext);
		const origin = { clientId, clientSeq };
		this._stateManager.dispatchClientAction(channel, action, origin);
	}
	async createSession(config?: IAgentCreateSessionConfig): Promise<URI> {
		this.createSessionConfigs.push(config);
		await this.createSessionBarrier?.p;
		const session = config?.session ?? URI.parse('copilot:///new-session');
		this._stateManager.createSession({
			resource: session.toString(),
			provider: config?.provider ?? 'copilot',
			title: '',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
			workingDirectories: config?.workingDirectories?.[0] ? [config.workingDirectories?.[0].toString()] : undefined,
		});
		return session;
	}

	async resolveSessionConfig(_params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> { return { schema: { type: 'object', properties: {} }, values: {} }; }
	async sessionConfigCompletions(_params: IAgentSessionConfigCompletionsParams): Promise<SessionConfigCompletionsResult> { return { items: [] }; }
	async completions(_params: CompletionsParams): Promise<CompletionsResult> { return { items: [] }; }
	automationCapabilities: AutomationCapabilities | undefined;
	async listAutomationTriggerDefinitions(_params: ListAutomationTriggerDefinitionsParams): Promise<ListAutomationTriggerDefinitionsResult> { return { items: [] }; }
	async runAutomation(params: RunAutomationParams): Promise<RunAutomationResult> {
		this.automationRunRequests.push(params);
		if (!this.automationRunResult) {
			throw new Error('Not implemented');
		}
		return this.automationRunResult;
	}
	async fetchAutomationRuns(_params: FetchAutomationRunsParams): Promise<FetchAutomationRunsResult> { return {}; }
	async getCompletionTriggerCharacters(): Promise<readonly string[]> { return []; }
	async disposeSession(_session: URI): Promise<void> { }
	readonly createdChats: { session: string; chat: string; options?: IAgentCreateChatRequestOptions }[] = [];
	readonly disposedChats: { session: string; chat: string }[] = [];
	async createChat(session: URI, chat: URI, options?: IAgentCreateChatRequestOptions): Promise<void> {
		this.createdChats.push({ session: session.toString(), chat: chat.toString(), ...(options ? { options } : {}) });
		this._stateManager.addChat(session.toString(), chat.toString());
	}
	async disposeChat(session: URI, chat: URI): Promise<void> {
		this.disposedChats.push({ session: session.toString(), chat: chat.toString() });
		this._stateManager.removeChat(session.toString(), chat.toString());
	}
	async listSessions(): Promise<IAgentSessionMetadata[]> {
		const result = [...this.listedSessions];
		this.afterListSessionsSnapshot?.();
		return result;
	}
	async subscribe(resource: URI, clientId: string, isActive?: () => boolean): Promise<IStateSnapshot> {
		this.subscribeCalls.push({ resource: resource.toString(), clientId });
		await (this.subscribeBarriers.get(resource.toString())?.p ?? this.subscribeBarrier?.p);
		if (isActive && !isActive()) {
			throw new Error(`Subscription cancelled: ${resource.toString()}`);
		}
		const snapshot = this._stateManager.getSnapshot(resource.toString());
		if (!snapshot) {
			throw new Error(`Cannot subscribe to unknown resource: ${resource.toString()}`);
		}
		return snapshot;
	}
	addSubscriber(_resource: URI, _clientId: string): void { }
	unsubscribe(resource: URI, clientId: string): void {
		this.unsubscribeCalls.push({ resource: resource.toString(), clientId });
	}
	async shutdown(): Promise<void> { this.shutdownCalls++; }
	async getNetworkDiagnosticsInfo(): Promise<IAgentHostNetworkDiagnosticsInfo> { return { version: 'test', os: 'test', arch: 'test', proxySettings: {}, proxyEnv: {}, endpoints: [] }; }
	async getManagedSettingsDiagnostics(): Promise<readonly IAgentHostManagedSettingsDiagnostics[]> { return this.managedSettingsDiagnostics; }
	async diagnosticsFetch(url: string): Promise<IAgentHostNetworkFetchResult> { return { url }; }
	async getSessionStateFile(session: URI): Promise<URI | undefined> {
		this.getSessionStateFileCalls.push(session.toString());
		return URI.file('/state/sdk-session/events.jsonl');
	}
	async collectDebugLogs(session: URI | undefined, kind: 'archive' | 'directory', chat?: URI) {
		this.collectDebugLogsCalls.push({ session: session?.toString(), chat: chat?.toString(), kind });
		return { kind, resource: URI.file('/tmp/agent-host-debug.zip'), providerLogsIncluded: true, size: 1024, uncompressedSize: 2048, entries: [{ path: 'agenthost.log', size: 2048 }] };
	}
	async authenticate(_params: AuthenticateParams): Promise<AuthenticateResult> { return { authenticated: true }; }
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
	return sent.find(message => isJsonRpcResponse(message) && message.id === id);
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
	let managedSettingsService: AgentHostManagedSettingsService;
	let handler: ProtocolServerHandler;
	let fileSystemProvider: AgentHostFileSystemProvider;
	let logService: CountingLogService;
	let telemetryService: TestTelemetryService;
	let agentHostTelemetryService: AgentHostTelemetryService;
	let clientConnections: AgentHostClientConnectionService;

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

	function connectClient(clientId: string, initialSubscriptions?: readonly string[], clientInfo?: Implementation, meta?: Record<string, unknown>): MockProtocolTransport {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId,
			clientInfo,
			_meta: {
				'vscode.telemetryLevel': 'all',
				...meta,
			},
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
		managedSettingsService = disposables.add(new AgentHostManagedSettingsService());
		logService = new CountingLogService();
		telemetryService = new TestTelemetryService();
		agentHostTelemetryService = disposables.add(new AgentHostTelemetryService(telemetryService));
		clientConnections = disposables.add(new AgentHostClientConnectionService());
		disposables.add(agentService);
		disposables.add(handler = new ProtocolServerHandler(
			agentService,
			stateManager,
			server,
			{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess, defaultDirectory: URI.file('/home/testuser').toString() },
			disposables.add(fileSystemProvider = new AgentHostFileSystemProvider()),
			logService,
			agentHostTelemetryService,
			managedSettingsService,
			clientConnections,
		));
	});

	teardown(() => {
		disposables.dispose();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('handshake returns initialize response', () => {
		const transport = connectClient('client-1');

		const resp = findResponse(transport.sent, 1);
		if (!resp || !hasKey(resp, { result: true })) {
			assert.fail('should have sent initialize response');
		}
		const result = resp.result as InitializeResult;
		assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
		assert.strictEqual(result.serverSeq, stateManager.serverSeq);
	});

	test('handshake advertises only implemented automation capabilities', () => {
		agentService.automationCapabilities = { create: {}, runCancellation: {} };
		const transport = connectClient('automation-client');
		const resp = findResponse(transport.sent, 1);
		if (!resp || !hasKey(resp, { result: true })) {
			assert.fail('should have sent initialize response');
		}
		assert.deepStrictEqual((resp.result as InitializeResult).automations, {
			create: {},
			runCancellation: {},
		});
	});

	test('applies telemetry disablement before reporting the client connection', () => {
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'telemetry-disabled-client',
			clientInfo: editorWindowAgentHostClientInfo,
			_meta: {
				'vscode.clientConnectionKind': AgentHostClientConnectionKind.RemoteExtensionHost,
				'vscode.telemetryLevel': 'off',
			},
		}));

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			events: telemetryService.events,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			events: [],
		});
		transport.simulateClose();
		transport.dispose();
	});

	test('uses the launch telemetry level when a legacy client omits telemetry metadata', () => {
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'legacy-client',
			clientInfo: editorWindowAgentHostClientInfo,
		}));

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			eventNames: telemetryService.events.map(event => event.eventName),
		}, {
			telemetryLevel: TelemetryLevel.USAGE,
			eventNames: ['agentHost.clientConnection'],
		});
		transport.simulateClose();
		transport.dispose();
	});

	test('fails closed before reporting the client connection for malformed telemetry metadata', () => {
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'malformed-telemetry-client',
			clientInfo: editorWindowAgentHostClientInfo,
			_meta: { 'vscode.telemetryLevel': 'invalid' },
		}));

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			events: telemetryService.events,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			events: [],
		});
		transport.simulateClose();
		transport.dispose();
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

	test('automation catalogue subscription and run command preserve canonical channels', async () => {
		stateManager.setAutomationCatalogState({ automations: [] });
		agentService.automationCapabilities = { create: {}, schedules: {}, runCancellation: {} };
		agentService.automationRunResult = { resource: 'ahp-automation-run:/run-1' };
		const transport = connectClient('automation-client');
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'subscribe', { channel: AUTOMATION_CATALOG_URI }));
		const subscription = await responsePromise;
		const runResponsePromise = waitForResponse(transport, 3);

		transport.simulateMessage(request(3, 'runAutomation', {
			channel: AUTOMATION_CATALOG_URI,
			automation: 'ahp-automation:/automation-1',
			requestId: 'request-1',
		}));
		const response = await runResponsePromise;
		const subscribeResult = (subscription as { result?: SubscribeResult }).result;

		assert.deepStrictEqual({
			snapshot: subscribeResult?.snapshot,
			requests: agentService.automationRunRequests,
			response: hasKey(response, { result: true }) ? response.result : undefined,
		}, {
			snapshot: {
				resource: AUTOMATION_CATALOG_URI,
				state: { automations: [] },
				fromSeq: stateManager.serverSeq,
			},
			requests: [{
				channel: AUTOMATION_CATALOG_URI,
				automation: 'ahp-automation:/automation-1',
				requestId: 'request-1',
			}],
			response: { resource: 'ahp-automation-run:/run-1' },
		});
	});

	test('handshake retains an initial subscription whose state has not materialized', () => {
		const transport = connectClient('client-1', [defaultChatUri]);
		const response = findResponse(transport.sent, 1) as { result: InitializeResult };
		assert.deepStrictEqual(response.result.snapshots, []);
		transport.sent.length = 0;

		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(defaultChatUri, {
			type: ActionType.ChatTurnStarted,
			turnId: 'turn-1',
			startedAt: '2025-01-01T00:00:00.000Z',
			message: { text: 'hello after restore', origin: { kind: MessageKind.User } },
		});

		const actionMessages = findNotifications(transport.sent, 'action');
		const turnStarted = actionMessages.find(message => {
			const envelope = message.params as unknown as { action?: { type: string } };
			return envelope.action?.type === ActionType.ChatTurnStarted;
		});
		assert.ok(turnStarted, 'should deliver actions after the initially missing state materializes');
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

	test('unknown requests return MethodNotFound before and after initialize', () => {
		const transport = new MockProtocolTransport();
		disposables.add(transport);
		server.simulateConnection(transport);

		transport.simulateMessage(request(7, 'notARealMethod', { channel: 'ahp-root://' }));
		transport.simulateMessage(request(8, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'client-1',
		}));
		transport.simulateMessage(request(9, 'notARealMethod', { channel: 'ahp-root://' }));

		assert.deepStrictEqual(
			[findResponse(transport.sent, 7), findResponse(transport.sent, 9)],
			[
				{ jsonrpc: '2.0', id: 7, error: { code: JsonRpcErrorCodes.MethodNotFound, message: 'Method not found: notARealMethod' } },
				{ jsonrpc: '2.0', id: 9, error: { code: JsonRpcErrorCodes.MethodNotFound, message: 'Method not found: notARealMethod' } },
			],
		);
	});

	test('extension methods remain enabled by default', async () => {
		const transport = connectClient('client-extension-default');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 11);

		transport.simulateMessage(request(11, 'shutdown', {}));

		assert.deepStrictEqual({
			response: await responsePromise,
			shutdownCalls: agentService.shutdownCalls,
		}, {
			response: { jsonrpc: '2.0', id: 11, result: null },
			shutdownCalls: 1,
		});
	});

	test('collects Agent Host debug logs through the extension request', async () => {
		const transport = connectClient('client-debug-logs');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 12);

		transport.simulateMessage(request(12, 'vscode/collectAgentHostDebugLogs', {
			session: 'copilotcli:/session-1',
			chat: buildChatUri('copilotcli:/session-1', 'peer-1'),
			kind: 'archive',
		}));

		assert.deepStrictEqual({
			response: await responsePromise,
			calls: agentService.collectDebugLogsCalls,
		}, {
			response: {
				jsonrpc: '2.0',
				id: 12,
				result: { kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true, size: 1024, uncompressedSize: 2048, entries: [{ path: 'agenthost.log', size: 2048 }] },
			},
			calls: [{ session: 'copilotcli:/session-1', chat: buildChatUri('copilotcli:/session-1', 'peer-1'), kind: 'archive' }],
		});
	});

	test('gets an Agent Host session state file through the extension request', async () => {
		const transport = connectClient('client-session-state-file');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 17);

		transport.simulateMessage(request(17, 'vscode/getAgentHostSessionStateFile', {
			session: 'copilotcli:/session-1',
		}));

		assert.deepStrictEqual({
			response: await responsePromise,
			calls: agentService.getSessionStateFileCalls,
		}, {
			response: {
				jsonrpc: '2.0',
				id: 17,
				result: { resource: 'file:///state/sdk-session/events.jsonl' },
			},
			calls: ['copilotcli:/session-1'],
		});
	});

	test('rejects a debug-log chat belonging to another session', async () => {
		const transport = connectClient('client-debug-logs-wrong-chat');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 19);

		transport.simulateMessage(request(19, 'vscode/collectAgentHostDebugLogs', {
			session: 'copilotcli:/session-1',
			chat: buildChatUri('copilotcli:/session-2', 'peer-1'),
			kind: 'archive',
		}));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 19,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: 'chat must belong to the requested Agent Session' },
		});
	});

	test('rejects a non-string Agent Host session state file session', async () => {
		const transport = connectClient('client-session-state-file-invalid');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 18);

		transport.simulateMessage(request(18, 'vscode/getAgentHostSessionStateFile', { session: 123 }));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 18,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: 'session must be a URI string' },
		});
	});

	test('rejects an invalid Agent Host debug log artifact kind', async () => {
		const transport = connectClient('client-debug-logs-invalid');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 13);

		transport.simulateMessage(request(13, 'vscode/collectAgentHostDebugLogs', { session: 'copilotcli:/session-1', kind: 'tgz' }));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 13,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: `Error in property 'kind': Expected one of: archive, directory` },
		});
	});

	test('collects Agent Host debug logs without a session', async () => {
		const transport = connectClient('client-debug-logs-no-session');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 16);

		transport.simulateMessage(request(16, 'vscode/collectAgentHostDebugLogs', { kind: 'archive' }));

		assert.deepStrictEqual({
			response: await responsePromise,
			calls: agentService.collectDebugLogsCalls.at(-1),
		}, {
			response: {
				jsonrpc: '2.0',
				id: 16,
				result: { kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true, size: 1024, uncompressedSize: 2048, entries: [{ path: 'agenthost.log', size: 2048 }] },
			},
			calls: { session: undefined, chat: undefined, kind: 'archive' },
		});
	});

	test('rejects a non-string Agent Host debug log session', async () => {
		const transport = connectClient('client-debug-logs-invalid-session');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 14);

		transport.simulateMessage(request(14, 'vscode/collectAgentHostDebugLogs', { session: 123, kind: 'archive' }));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 14,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: `Error in property 'session': Expected string, but got number` },
		});
	});

	test('rejects non-object Agent Host debug log params', async () => {
		const transport = connectClient('client-debug-logs-invalid-params');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 15);

		transport.simulateMessage(request(15, 'vscode/collectAgentHostDebugLogs', null));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 15,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: 'Expected object' },
		});
	});

	test('rejects a scheme-less Agent Host debug log session', async () => {
		const transport = connectClient('client-debug-logs-invalid-session-uri');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 16);

		transport.simulateMessage(request(16, 'vscode/collectAgentHostDebugLogs', { session: 'session-1', kind: 'archive' }));

		assert.deepStrictEqual(await responsePromise, {
			jsonrpc: '2.0',
			id: 16,
			error: { code: JsonRpcErrorCodes.InvalidParams, message: 'session must be a valid URI string' },
		});
	});

	test('extension methods can be disabled without blocking managed settings contributions', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const localServer = localDisposables.add(new MockProtocolServer());
		localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			localServer,
			{
				defaultDirectory: URI.file('/home/testuser').toString(),
				allowExtensionMethods: false,
			},
			localDisposables.add(new AgentHostFileSystemProvider()),
			logService,
			NullTelemetryService,
			managedSettingsService,
			clientConnections,
		));
		const transport = new MockProtocolTransport();
		localServer.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'client-extension-disabled',
		}));
		transport.sent.length = 0;
		transport.simulateMessage(request(2, 'shutdown', {}));
		transport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { disableBypassPermissionsMode: 'disable', ask: ['Shell'] },
		}));

		assert.deepStrictEqual({
			response: findResponse(transport.sent, 2),
			shutdownCalls: agentService.shutdownCalls,
			managedSettingsPermissions: managedSettingsService.permissions,
		}, {
			response: { jsonrpc: '2.0', id: 2, error: { code: JsonRpcErrorCodes.MethodNotFound, message: 'Method not found: shutdown' } },
			shutdownCalls: 0,
			managedSettingsPermissions: { disableBypassPermissionsMode: 'disable', ask: ['Shell'] },
		});
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

	test('disconnect cancels a pending subscribe request', async () => {
		stateManager.createSession(makeSessionSummary());
		agentService.subscribeBarrier = new DeferredPromise<void>();
		const transport = connectClient('client-1');
		transport.sent.length = 0;

		transport.simulateMessage(request(2, 'subscribe', { channel: sessionUri }));
		await Promise.resolve();
		transport.simulateClose();
		await agentService.subscribeBarrier.complete();
		await Promise.resolve();

		assert.deepStrictEqual({
			subscribes: agentService.subscribeCalls,
			unsubscribes: agentService.unsubscribeCalls,
		}, {
			subscribes: [{ resource: sessionUri, clientId: 'client-1' }],
			unsubscribes: [{ resource: sessionUri, clientId: 'client-1' }],
		});
	});

	test('pending subscribe receives state in its snapshot without an early action', async () => {
		stateManager.createSession(makeSessionSummary());
		agentService.subscribeBarrier = new DeferredPromise<void>();
		const transport = connectClient('client-1');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'subscribe', { channel: sessionUri }));
		await Promise.resolve();
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated while subscribing' });
		const actionsWhilePending = findNotifications(transport.sent, 'action');
		await agentService.subscribeBarrier.complete();
		const response = await responsePromise as { result: { snapshot: IStateSnapshot } };
		const snapshotState = response.result.snapshot.state;

		assert.deepStrictEqual({
			actionsWhilePending: actionsWhilePending.length,
			actionsAfterResponse: findNotifications(transport.sent, 'action').length,
			snapshotTitle: hasKey(snapshotState, { title: true }) ? snapshotState.title : undefined,
		}, {
			actionsWhilePending: 0,
			actionsAfterResponse: 0,
			snapshotTitle: 'Updated while subscribing',
		});
	});

	test('resubscribing an active channel keeps action delivery active', async () => {
		stateManager.createSession(makeSessionSummary());
		const transport = connectClient('client-active-resubscribe', [sessionUri]);
		transport.sent.length = 0;
		agentService.subscribeBarrier = new DeferredPromise<void>();
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'subscribe', { channel: sessionUri }));
		await Promise.resolve();
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated while resubscribing' });
		const actionsWhilePending = findNotifications(transport.sent, 'action');
		await agentService.subscribeBarrier.complete();
		await responsePromise;

		assert.strictEqual(actionsWhilePending.length, 1);
	});

	test('cancelled subscribe does not clean up a newer subscribe from the same client', async () => {
		stateManager.createSession(makeSessionSummary());
		agentService.subscribeBarrier = new DeferredPromise<void>();
		const transport = connectClient('client-1');
		transport.sent.length = 0;
		const firstResponse = waitForResponse(transport, 2);
		const secondResponse = waitForResponse(transport, 3);

		transport.simulateMessage(request(2, 'subscribe', { channel: sessionUri }));
		await Promise.resolve();
		transport.simulateMessage(notification('unsubscribe', { channel: sessionUri }));
		transport.simulateMessage(request(3, 'subscribe', { channel: sessionUri }));
		await Promise.resolve();
		await agentService.subscribeBarrier.complete();

		const [first, second] = await Promise.all([firstResponse, secondResponse]);
		assert.deepStrictEqual({
			firstFailed: hasKey(first, { error: true }),
			secondSucceeded: hasKey(second, { result: true }),
			subscribes: agentService.subscribeCalls,
			unsubscribes: agentService.unsubscribeCalls,
		}, {
			firstFailed: true,
			secondSucceeded: true,
			subscribes: [
				{ resource: sessionUri, clientId: 'client-1' },
				{ resource: sessionUri, clientId: 'client-1' },
			],
			unsubscribes: [{ resource: sessionUri, clientId: 'client-1' }],
		});
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

	test('unsupported chat actions are rejected, not dispatched', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });

		const cases: readonly { readonly action: ChatAction; readonly channel: string }[] = [
			{ action: { type: ActionType.ChatWorkingDirectorySet, directory: 'file:///tmp/extra-root' }, channel: defaultChatUri },
			{ action: { type: ActionType.ChatWorkingDirectoryRemoved, directory: 'file:///tmp/extra-root' }, channel: defaultChatUri },
		];

		for (const [index, { action, channel }] of cases.entries()) {
			const clientId = `unsupported-client-${index}`;
			const clientSeq = 100 + index;
			const transport = connectClient(clientId, [sessionUri, defaultChatUri]);
			transport.sent.length = 0;
			agentService.handledActions.length = 0;

			transport.simulateMessage(notification('dispatchAction', {
				channel,
				clientSeq,
				action,
			}));

			// No dispatch: the gate intercepts before reaching the agent service,
			// so the reducer never runs and synchronized state is untouched.
			assert.deepStrictEqual(agentService.handledActions, [], `${action.type} must not be dispatched`);

			// Exactly one rejection envelope, preserving the original origin so the
			// client can reconcile its optimistic action.
			const actionMsgs = findNotifications(transport.sent, 'action');
			assert.strictEqual(actionMsgs.length, 1, `${action.type} should emit exactly one envelope`);
			const envelope = actionMsgs[0].params as unknown as { action: { type: string }; origin: { clientId: string; clientSeq: number }; rejectionReason?: string };
			assert.strictEqual(envelope.action.type, action.type);
			assert.ok(envelope.rejectionReason, `${action.type} envelope should carry a rejectionReason`);
			assert.strictEqual(envelope.origin.clientId, clientId);
			assert.strictEqual(envelope.origin.clientSeq, clientSeq);
		}
	});

	test('turn resume reaches the agent service', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
		const transport = connectClient('resume-client', [sessionUri, defaultChatUri]);
		transport.sent.length = 0;

		transport.simulateMessage(notification('dispatchAction', {
			channel: defaultChatUri,
			clientSeq: 1,
			action: { type: ActionType.ChatTurnResume, turnId: 'turn-1' },
		}));

		assert.deepStrictEqual(agentService.handledActions.at(-1), { type: ActionType.ChatTurnResume, turnId: 'turn-1' });
	});

	test('session working-directory actions reach the agent service', () => {
		stateManager.createSession(makeSessionSummary());
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
		const transport = connectClient('working-directory-client', [sessionUri], editorWindowAgentHostClientInfo);
		transport.sent.length = 0;

		transport.simulateMessage(notification('dispatchAction', {
			channel: sessionUri,
			clientSeq: 1,
			action: { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///tmp/extra-root' },
		}));

		const action = agentService.handledActions.at(-1);
		const envelope = findNotifications(transport.sent, 'action').at(-1)?.params as ActionEnvelope | undefined;
		assert.deepStrictEqual({
			action,
			clientType: agentService.handledClientTypes.at(-1),
			rejectionReason: envelope?.rejectionReason,
		}, {
			action: { type: ActionType.SessionWorkingDirectorySet, directory: 'file:///tmp/extra-root' },
			clientType: AgentHostClientType.EditorWindow,
			rejectionReason: undefined,
		});
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

	test('listSessions exposure does not suppress a global sessionAdded notification', async () => {
		const summary = makeSessionSummary();
		const transportA = connectClient('client-list-exposed');
		const transportB = connectClient('client-list-missing');
		transportA.sent.length = 0;
		transportB.sent.length = 0;

		let responsePromise = waitForResponse(transportB, 2);
		transportB.simulateMessage(request(2, 'listSessions'));
		await responsePromise;

		agentService.listedSessions.push({
			session: URI.parse(summary.resource),
			startTime: Date.parse(summary.createdAt),
			modifiedTime: Date.parse(summary.modifiedAt),
			summary: summary.title,
			status: summary.status,
		});
		responsePromise = waitForResponse(transportA, 2);
		transportA.simulateMessage(request(2, 'listSessions'));
		await responsePromise;
		transportA.sent.length = 0;
		transportB.sent.length = 0;

		stateManager.announceSurfacedSession(summary);

		assert.deepStrictEqual({
			exposedClient: findNotifications(transportA.sent, 'root/sessionAdded').length,
			missingClient: findNotifications(transportB.sent, 'root/sessionAdded').length,
		}, {
			exposedClient: 1,
			missingClient: 1,
		});
	});

	test('listSessions publishes only changed canonical fields for restored sessions', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const project = { uri: 'file:///test-project', displayName: 'Test Project' };
			const summary = {
				...makeSessionSummary(),
				project,
				workingDirectories: ['file:///test-project'],
				changes: { additions: 1, deletions: 2, files: 3 },
				_meta: { live: 'current' },
			};
			const startedAt = new Date(Date.parse(summary.modifiedAt) + 1000).toISOString();
			stateManager.restoreSession(summary, []);
			agentService.listedSessions.push({
				session: URI.parse(summary.resource),
				startTime: Date.parse(summary.createdAt),
				modifiedTime: Date.parse(summary.modifiedAt),
				summary: summary.title,
				status: summary.status,
				project: { uri: URI.parse(project.uri), displayName: project.displayName },
				workingDirectories: summary.workingDirectories.map(directory => URI.parse(directory)),
				changes: { ...summary.changes },
				_meta: { providerOnly: true, live: 'stale' },
			});

			const transport = connectClient('client-list-status');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);
			transport.simulateMessage(request(2, 'listSessions'));
			const response = await responsePromise;
			const listedMeta = (response as unknown as { result: ListSessionsResult }).result.items[0]._meta;
			transport.sent.length = 0;

			stateManager.dispatchServerAction(buildDefaultChatUri(sessionUri), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt,
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});
			await new Promise(resolve => setTimeout(resolve, 150));

			const summaryChanges = transport.sent
				.filter(isJsonRpcNotification)
				.filter(message => message.method === 'root/sessionSummaryChanged')
				.map(message => (message.params as SessionSummaryChangedParams).changes);
			assert.deepStrictEqual({ listedMeta, summaryChanges }, {
				listedMeta: { providerOnly: true, live: 'current' },
				summaryChanges: [{ modifiedAt: startedAt, status: SessionStatus.InProgress }],
			});
		});
	});

	test('repeated listSessions flushes a pending status before returning the new baseline', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const summary = makeSessionSummary();
			stateManager.restoreSession(summary, []);
			const listedSession: IAgentSessionMetadata = {
				session: URI.parse(summary.resource),
				startTime: Date.parse(summary.createdAt),
				modifiedTime: Date.parse(summary.modifiedAt),
				summary: summary.title,
				status: summary.status,
			};
			agentService.listedSessions.push(listedSession);

			const transport = connectClient('client-repeat-list-status');
			transport.sent.length = 0;
			let responsePromise = waitForResponse(transport, 2);
			transport.simulateMessage(request(2, 'listSessions'));
			await responsePromise;
			transport.sent.length = 0;

			stateManager.dispatchServerAction(buildDefaultChatUri(sessionUri), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: new Date().toISOString(),
				message: { text: 'hello', origin: { kind: MessageKind.User } },
			});
			agentService.listedSessions[0] = { ...listedSession, status: SessionStatus.InProgress };
			responsePromise = waitForResponse(transport, 3);
			transport.simulateMessage(request(3, 'listSessions'));
			const response = await responsePromise;
			const listedStatus = (response as unknown as { result: ListSessionsResult }).result.items[0].status;

			stateManager.dispatchServerAction(buildDefaultChatUri(sessionUri), {
				type: ActionType.ChatTurnComplete,
				turnId: 'turn-1',
				duration: 1,
			});
			await new Promise(resolve => setTimeout(resolve, 150));

			const statusChanges = transport.sent
				.filter(isJsonRpcNotification)
				.filter(message => message.method === 'root/sessionSummaryChanged')
				.map(message => (message.params as SessionSummaryChangedParams).changes.status);
			assert.deepStrictEqual({ listedStatus, statusChanges }, {
				listedStatus: SessionStatus.InProgress,
				statusChanges: [SessionStatus.InProgress, SessionStatus.Idle],
			});
		});
	});

	test('repeated listSessions refreshes a stale snapshot before its response', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const summary = makeSessionSummary();
			const startedAt = new Date(Date.parse(summary.modifiedAt) + 1000).toISOString();
			stateManager.restoreSession(summary, []);
			agentService.listedSessions.push({
				session: URI.parse(summary.resource),
				startTime: Date.parse(summary.createdAt),
				modifiedTime: Date.parse(summary.modifiedAt),
				summary: summary.title,
				status: summary.status,
			});

			const transport = connectClient('client-stale-list-status');
			transport.sent.length = 0;
			let responsePromise = waitForResponse(transport, 2);
			transport.simulateMessage(request(2, 'listSessions'));
			await responsePromise;
			transport.sent.length = 0;

			agentService.afterListSessionsSnapshot = () => {
				agentService.afterListSessionsSnapshot = undefined;
				stateManager.dispatchServerAction(buildDefaultChatUri(sessionUri), {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt,
					message: { text: 'hello', origin: { kind: MessageKind.User } },
				});
			};
			responsePromise = waitForResponse(transport, 3);
			transport.simulateMessage(request(3, 'listSessions'));
			await responsePromise;

			const observed = transport.sent.flatMap(message => {
				if (isJsonRpcNotification(message) && message.method === 'root/sessionSummaryChanged') {
					return [{ kind: 'notification', status: (message.params as SessionSummaryChangedParams).changes.status }];
				}
				if (isJsonRpcResponse(message) && message.id === 3 && hasKey(message, { result: true })) {
					return [{ kind: 'response', status: (message.result as ListSessionsResult).items[0].status }];
				}
				return [];
			});
			assert.deepStrictEqual(observed, [
				{ kind: 'notification', status: SessionStatus.InProgress },
				{ kind: 'response', status: SessionStatus.InProgress },
			]);
		});
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

	test('listSessions carries the workspace-less marker on _meta', async () => {
		// Regression: the client resolves a session's kind (quick chat vs.
		// workspace) from `_meta.workspaceless`, and a listing is the first
		// thing it sees after a window reload.
		// Dropping `_meta` here made every restored quick chat look
		// workspace-bound and leak the host's scratch cwd as a workspace folder.
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'Quick Chat',
			workingDirectories: [URI.file('/home/user/.copilot/chats/session-1')],
			_meta: withSessionWorkspaceless(undefined, true),
		});

		const transport = connectClient('client-list-workspaceless');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: ListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => readSessionWorkspaceless(item._meta)), [true]);
	});

	test('listSessions carries external provenance on _meta', async () => {
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'Native Chat',
			_meta: withSessionExternal(undefined, true),
		});

		const transport = connectClient('client-list-external');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: ListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => readSessionExternal(item._meta)), [true]);
	});

	test('listSessions omits _meta when the agent provides none', async () => {
		// The wire item is built field by field and `satisfies SessionSummary`
		// cannot catch a dropped optional, so pin the absent case too: a
		// listing must not start manufacturing an empty `_meta` bag that later
		// overwrites a richer one on the client.
		agentService.listedSessions.push({
			session: URI.parse(sessionUri),
			startTime: 1000,
			modifiedTime: 2000,
			summary: 'Session Summary',
		});

		const transport = connectClient('client-list-no-meta');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		transport.simulateMessage(request(2, 'listSessions'));
		const resp = await responsePromise;

		const result = (resp as unknown as { result: ListSessionsResult }).result;
		assert.deepStrictEqual(result.items.map(item => item._meta), [undefined]);
	});

	test('createSession forwards request metadata and broadcasts project in sessionAdded summary', async () => {
		const transport = connectClient('client-create');
		transport.sent.length = 0;
		const responsePromise = waitForResponse(transport, 2);

		const newSession = URI.parse('copilot:///created-session').toString();
		const _meta = { multiRoot: { workspaceFile: 'file:///demo.code-workspace' } };
		transport.simulateMessage(request(2, 'createSession', { channel: newSession, _meta }));
		const resp = await responsePromise;

		const added = findNotifications(transport.sent, 'root/sessionAdded')[0];
		assert.deepStrictEqual({
			result: (resp as { result: null }).result,
			project: (added!.params as SessionAddedParams).summary.project,
			_meta: agentService.createSessionConfigs.at(-1)?._meta,
		}, {
			result: null,
			project: { uri: 'file:///created-project', displayName: 'Created Project' },
			_meta,
		});
	});

	test('whenIdle waits for in-flight protocol requests after disposal', async () => {
		const transport = connectClient('client-drain');
		agentService.createSessionBarrier = new DeferredPromise<void>();
		const newSession = URI.parse('copilot:///drain-session').toString();
		transport.simulateMessage(request(2, 'createSession', { channel: newSession }));
		handler.dispose();
		let idle = false;
		const whenIdle = handler.whenIdle().then(() => idle = true);

		await Promise.resolve();
		const idleWhileRequestPending = idle;
		agentService.createSessionBarrier.complete();
		await whenIdle;

		assert.deepStrictEqual({
			idleWhileRequestPending,
			idleAfterRequest: idle,
		}, {
			idleWhileRequestPending: false,
			idleAfterRequest: true,
		});
	});

	test('whenIdle waits for reconnect subscription restoration', async () => {
		stateManager.createSession(makeSessionSummary());
		const initialTransport = connectClient('client-drain-reconnect', [sessionUri]);
		const initialResponse = findResponse(initialTransport.sent, 1) as { result: InitializeResult };
		initialTransport.simulateClose();
		agentService.subscribeBarrier = new DeferredPromise<void>();

		const reconnectTransport = new MockProtocolTransport();
		server.simulateConnection(reconnectTransport);
		reconnectTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-drain-reconnect',
			lastSeenServerSeq: initialResponse.result.serverSeq,
			subscriptions: [sessionUri],
		}));
		await Promise.resolve();
		let idle = false;
		const whenIdle = handler.whenIdle().then(() => idle = true);

		await Promise.resolve();
		const idleWhileRestoring = idle;
		agentService.subscribeBarrier.complete();
		await whenIdle;

		assert.deepStrictEqual({
			idleWhileRestoring,
			idleAfterRestore: idle,
		}, {
			idleWhileRestoring: false,
			idleAfterRestore: true,
		});
	});

	test('disconnect cancels pending reconnect subscription restoration', async () => {
		stateManager.createSession(makeSessionSummary());
		const initialTransport = connectClient('client-reconnect-cancel', [sessionUri]);
		const initialResponse = findResponse(initialTransport.sent, 1) as { result: InitializeResult };
		initialTransport.simulateClose();
		agentService.unsubscribeCalls.length = 0;
		agentService.subscribeBarrier = new DeferredPromise<void>();

		const reconnectTransport = new MockProtocolTransport();
		server.simulateConnection(reconnectTransport);
		reconnectTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-reconnect-cancel',
			lastSeenServerSeq: initialResponse.result.serverSeq,
			subscriptions: [sessionUri],
		}));
		await Promise.resolve();
		reconnectTransport.simulateClose();
		await agentService.subscribeBarrier.complete();
		await handler.whenIdle();

		assert.deepStrictEqual({
			subscribes: agentService.subscribeCalls,
			unsubscribes: agentService.unsubscribeCalls,
		}, {
			subscribes: [{ resource: sessionUri, clientId: 'client-reconnect-cancel' }],
			unsubscribes: [{ resource: sessionUri, clientId: 'client-reconnect-cancel' }],
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

		test('createChat forwards a fork source to the agent service', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', {
				channel: sessionUri,
				chat: peerChat,
				source: { kind: ChatSourceKind.Fork, chat: buildDefaultChatUri(sessionUri), turnId: 'turn-1' },
			}));
			const resp = await responsePromise;

			assert.deepStrictEqual({
				result: (resp as { result: null }).result,
				created: agentService.createdChats,
			}, {
				result: null,
				created: [{
					session: sessionUri,
					chat: peerChat,
					options: {
						fork: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: 'turn-1' },
					},
				}],
			});
		});

		test('createChat rejects a source without kind', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', {
				channel: sessionUri,
				chat: peerChat,
				source: {
					chat: buildDefaultChatUri(sessionUri),
					turnId: 'turn-1',
				},
			}));
			const resp = await responsePromise as { error?: { code: number; message: string } };

			assert.deepStrictEqual({
				code: resp.error?.code,
				message: resp.error?.message,
				created: agentService.createdChats,
			}, {
				code: JsonRpcErrorCodes.InvalidParams,
				message: 'Unsupported createChat source kind: undefined',
				created: [],
			});
		});

		test('createChat forwards a side chat source to the agent service', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', {
				channel: sessionUri,
				chat: peerChat,
				source: {
					kind: ChatSourceKind.SideChat,
					chat: buildDefaultChatUri(sessionUri),
					turnId: 'turn-active',
					selection: { text: '  selected text  ', responsePartId: 'response-part-1' },
				},
			}));
			const resp = await responsePromise;

			assert.deepStrictEqual({
				result: (resp as { result: null }).result,
				created: agentService.createdChats,
			}, {
				result: null,
				created: [{
					session: sessionUri,
					chat: peerChat,
					options: {
						sideChat: { source: URI.parse(buildDefaultChatUri(sessionUri)), turnId: 'turn-active', selection: { text: '  selected text  ', responsePartId: 'response-part-1' } },
					},
				}],
			});
		});

		test('createChat rejects an unknown source kind', async () => {
			stateManager.createSession(makeSessionSummary());
			const transport = connectClient('client-cc');
			transport.sent.length = 0;
			const responsePromise = waitForResponse(transport, 2);

			transport.simulateMessage(request(2, 'createChat', {
				channel: sessionUri,
				chat: peerChat,
				source: {
					kind: 'unknown',
					chat: buildDefaultChatUri(sessionUri),
					turnId: 'turn-1',
				},
			}));
			const resp = await responsePromise as { error?: { code: number; message: string } };

			assert.deepStrictEqual({
				code: resp.error?.code,
				message: resp.error?.message,
				created: agentService.createdChats,
			}, {
				code: JsonRpcErrorCodes.InvalidParams,
				message: 'Unsupported createChat source kind: unknown',
				created: [],
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

	test('pending reconnect replays an action without broadcasting it early', async () => {
		const slowSessionUri = URI.from({ scheme: 'copilot', path: '/slow-session' }).toString();
		stateManager.createSession(makeSessionSummary());
		stateManager.createSession(makeSessionSummary(slowSessionUri));
		const initialTransport = connectClient('client-reconnect-pending', [sessionUri, slowSessionUri]);
		const initialResponse = findResponse(initialTransport.sent, 1) as { result: InitializeResult };
		initialTransport.simulateClose();
		const slowSubscribeBarrier = new DeferredPromise<void>();
		agentService.subscribeBarriers.set(slowSessionUri, slowSubscribeBarrier);

		const reconnectTransport = new MockProtocolTransport();
		server.simulateConnection(reconnectTransport);
		const responsePromise = waitForResponse(reconnectTransport, 2);
		reconnectTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-reconnect-pending',
			lastSeenServerSeq: initialResponse.result.serverSeq,
			subscriptions: [sessionUri, slowSessionUri],
		}));
		await Promise.resolve();
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated while reconnecting' });
		const actionsWhilePending = findNotifications(reconnectTransport.sent, 'action');
		await slowSubscribeBarrier.complete();
		const response = await responsePromise as { result: ReconnectResult };
		const replayedTitleChanges = response.result.type === 'replay'
			? response.result.actions.filter(envelope => envelope.action.type === ActionType.SessionTitleChanged)
			: [];

		assert.deepStrictEqual({
			actionsWhilePending: actionsWhilePending.length,
			actionsAfterResponse: findNotifications(reconnectTransport.sent, 'action').length,
			replayedTitleChanges: replayedTitleChanges.length,
		}, {
			actionsWhilePending: 0,
			actionsAfterResponse: 0,
			replayedTitleChanges: 1,
		});
	});

	test('pending reconnect retains refcount when the overlapping transport closes', async () => {
		stateManager.createSession(makeSessionSummary());
		const initialTransport = connectClient('client-reconnect-overlap', [sessionUri]);
		const initialResponse = findResponse(initialTransport.sent, 1) as { result: InitializeResult };
		agentService.subscribeBarrier = new DeferredPromise<void>();

		const reconnectTransport = new MockProtocolTransport();
		server.simulateConnection(reconnectTransport);
		const responsePromise = waitForResponse(reconnectTransport, 2);
		reconnectTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-reconnect-overlap',
			lastSeenServerSeq: initialResponse.result.serverSeq,
			subscriptions: [sessionUri],
		}));
		await Promise.resolve();
		initialTransport.simulateClose();
		await agentService.subscribeBarrier.complete();
		await responsePromise;

		assert.deepStrictEqual(agentService.unsubscribeCalls, []);
	});

	test('reconnect rejects a client the server no longer remembers', async () => {
		const transport = new MockProtocolTransport();
		server.simulateConnection(transport);
		const responsePromise = waitForResponse(transport, 1);
		transport.simulateMessage(request(1, 'reconnect', {
			clientId: 'forgotten-client',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));

		const response = await responsePromise;
		assert.deepStrictEqual((response as { error: { code: number; message: string } }).error, {
			code: AhpErrorCodes.NotFound,
			message: 'Reconnect client not found: forgotten-client',
		});
		transport.simulateClose();
	});

	test('retains client info for action attribution across reconnect', async () => {
		const transport1 = connectClient('client-attribution', undefined, agentsWindowAgentHostClientInfo, {
			'vscode.clientConnectionKind': AgentHostClientConnectionKind.DevTunnel,
			'vscode.clientMachineId': 'client-machine-id',
			'vscode.clientDevDeviceId': 'client-dev-device-id',
		});
		transport1.simulateMessage(notification('dispatchAction', {
			channel: 'ahp-root://',
			clientSeq: 1,
			action: { type: ActionType.RootConfigChanged, config: {} },
		}));
		transport1.simulateClose();

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-attribution',
			lastSeenServerSeq: stateManager.serverSeq,
			subscriptions: [],
			_meta: {
				'vscode.clientMachineId': 'client-machine-id',
				'vscode.clientDevDeviceId': 'client-dev-device-id',
			},
		}));
		await reconnectRespPromise;
		transport2.simulateMessage(notification('dispatchAction', {
			channel: 'ahp-root://',
			clientSeq: 2,
			action: { type: ActionType.RootConfigChanged, config: {} },
		}));

		assert.deepStrictEqual({
			clientTypes: agentService.handledClientTypes,
			connectionKinds: agentService.handledClientContexts.map(context => context?.connectionKind),
			machineIds: agentService.handledClientContexts.map(context => context?.machineId),
			devDeviceIds: agentService.handledClientContexts.map(context => context?.devDeviceId),
		}, {
			clientTypes: ['agents_window', 'agents_window'],
			connectionKinds: ['dev_tunnel', 'dev_tunnel'],
			machineIds: ['client-machine-id', 'client-machine-id'],
			devDeviceIds: ['client-dev-device-id', 'client-dev-device-id'],
		});
	});

	test('applies telemetry disablement before reporting a reconnected client', async () => {
		const transport1 = connectClient('telemetry-reconnect-client');
		transport1.simulateClose();
		const eventsBeforeReconnect = [...telemetryService.events];

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectResponse = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'telemetry-reconnect-client',
			lastSeenServerSeq: stateManager.serverSeq,
			subscriptions: [],
			_meta: { 'vscode.telemetryLevel': 'off' },
		}));
		await reconnectResponse;

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			events: telemetryService.events,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			events: eventsBeforeReconnect,
		});
		transport2.simulateClose();
		transport2.dispose();
	});

	test('fails closed before reporting a reconnected client for malformed telemetry metadata', async () => {
		const transport1 = connectClient('malformed-telemetry-reconnect-client');
		transport1.simulateClose();
		const eventsBeforeReconnect = [...telemetryService.events];

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectResponse = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'malformed-telemetry-reconnect-client',
			lastSeenServerSeq: stateManager.serverSeq,
			subscriptions: [],
			_meta: { 'vscode.telemetryLevel': 'invalid' },
		}));
		await reconnectResponse;

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			events: telemetryService.events,
		}, {
			telemetryLevel: TelemetryLevel.NONE,
			events: eventsBeforeReconnect,
		});
		transport2.simulateClose();
		transport2.dispose();
	});

	test('uses the launch telemetry level when a legacy reconnect omits telemetry metadata', async () => {
		const transport1 = connectClient('legacy-reconnect-client');
		transport1.simulateClose();
		const eventCountBeforeReconnect = telemetryService.events.length;

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectResponse = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'legacy-reconnect-client',
			lastSeenServerSeq: stateManager.serverSeq,
			subscriptions: [],
		}));
		await reconnectResponse;

		assert.deepStrictEqual({
			telemetryLevel: agentHostTelemetryService.telemetryLevel,
			newEventNames: telemetryService.events.slice(eventCountBeforeReconnect).map(event => event.eventName),
		}, {
			telemetryLevel: TelemetryLevel.USAGE,
			newEventNames: ['agentHost.clientConnection'],
		});
		transport2.simulateClose();
		transport2.dispose();
	});

	test('does not retain client telemetry identity when reconnect omits it', async () => {
		const transport1 = connectClient('client-consent', undefined, agentsWindowAgentHostClientInfo, {
			'vscode.clientMachineId': 'client-machine-id',
			'vscode.clientDevDeviceId': 'client-dev-device-id',
		});
		transport1.simulateClose();

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const reconnectRespPromise = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-consent',
			lastSeenServerSeq: stateManager.serverSeq,
			subscriptions: [],
		}));
		await reconnectRespPromise;
		transport2.simulateMessage(notification('dispatchAction', {
			channel: 'ahp-root://',
			clientSeq: 1,
			action: { type: ActionType.RootConfigChanged, config: {} },
		}));

		assert.deepStrictEqual(agentService.handledClientContexts.at(-1), {
			clientType: 'agents_window',
			connectionKind: 'unknown',
			transportKind: 'unknown',
			hostLaunchKind: 'vscode_main_process',
		});
	});

	test('attributes telemetry identity independently for concurrent clients', () => {
		const clients = [
			connectClient('client-a', undefined, agentsWindowAgentHostClientInfo, {
				'vscode.clientMachineId': 'machine-a',
				'vscode.clientDevDeviceId': 'device-a',
			}),
			connectClient('client-b', undefined, editorWindowAgentHostClientInfo, {
				'vscode.clientMachineId': 'machine-b',
				'vscode.clientDevDeviceId': 'device-b',
			}),
		];

		for (const client of clients) {
			client.simulateMessage(notification('dispatchAction', {
				channel: 'ahp-root://',
				clientSeq: 1,
				action: { type: ActionType.RootConfigChanged, config: {} },
			}));
		}

		assert.deepStrictEqual(agentService.handledClientContexts.map(context => ({
			clientType: context?.clientType,
			machineId: context?.machineId,
			devDeviceId: context?.devDeviceId,
		})), [{
			clientType: 'agents_window',
			machineId: 'machine-a',
			devDeviceId: 'device-a',
		}, {
			clientType: 'editor_window',
			machineId: 'machine-b',
			devDeviceId: 'device-b',
		}]);
	});

	test('reports client topology and attributes actions to the initiating connection', () => {
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		server.simulateConnection(transport);
		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'tunnel-client',
			clientInfo: { name: 'vscode-agents-window', version: '1.2.3', title: 'VS Code Agents Window' },
			_meta: {
				'vscode.clientConnectionKind': AgentHostClientConnectionKind.DevTunnel,
				'vscode.telemetryLevel': 'all',
				'vscode.clientMachineId': 'client-machine-id',
				'vscode.clientDevDeviceId': 'client-dev-device-id',
			},
		}));
		transport.simulateMessage(notification('dispatchAction', {
			channel: 'ahp-root://',
			clientSeq: 1,
			action: { type: ActionType.RootConfigChanged, config: {} },
		}));
		transport.simulateClose();

		const connectionEvents = telemetryService.events.map(event => {
			const data = event.data as Record<string, unknown>;
			return {
				...event,
				data: {
					...data,
					connectionDurationMs: typeof data.connectionDurationMs,
				},
			};
		});
		assert.deepStrictEqual({
			clientContext: agentService.handledClientContexts.at(-1),
			connectionEvents,
		}, {
			clientContext: {
				clientType: 'agents_window',
				connectionKind: 'dev_tunnel',
				transportKind: 'websocket',
				hostLaunchKind: 'vscode_main_process',
				machineId: 'client-machine-id',
				devDeviceId: 'client-dev-device-id',
			},
			connectionEvents: [{
				eventName: 'agentHost.clientConnection',
				data: {
					action: 'connected',
					hostLaunchKind: 'vscode_main_process',
					clientId: 'tunnel-client',
					clientType: 'agents_window',
					clientImplementationName: 'vscode-agents-window',
					clientImplementationVersion: '1.2.3',
					connectionKind: 'dev_tunnel',
					transportKind: 'websocket',
					clientMachineId: 'client-machine-id',
					clientDevDeviceId: 'client-dev-device-id',
					protocolVersion: PROTOCOL_VERSION,
					isReconnect: false,
					connectedClientCount: 1,
					connectedTransportCount: 1,
					clientTransportCount: 1,
					connectionDurationMs: 'undefined',
					subscriptionCount: undefined,
				},
			}, {
				eventName: 'agentHost.clientConnection',
				data: {
					action: 'disconnected',
					hostLaunchKind: 'vscode_main_process',
					clientId: 'tunnel-client',
					clientType: 'agents_window',
					clientImplementationName: 'vscode-agents-window',
					clientImplementationVersion: '1.2.3',
					connectionKind: 'dev_tunnel',
					transportKind: 'websocket',
					clientMachineId: 'client-machine-id',
					clientDevDeviceId: 'client-dev-device-id',
					protocolVersion: PROTOCOL_VERSION,
					isReconnect: false,
					connectedClientCount: 0,
					connectedTransportCount: 0,
					clientTransportCount: 0,
					connectionDurationMs: 'number',
					subscriptionCount: 0,
				},
			}],
		});
	});

	test('reports process-wide client counts across protocol listeners', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const tracker = localDisposables.add(new AgentHostClientConnectionService());
		const firstServer = localDisposables.add(new MockProtocolServer());
		const secondServer = localDisposables.add(new MockProtocolServer());
		const handlers: ProtocolServerHandler[] = [];
		for (const listener of [firstServer, secondServer]) {
			handlers.push(localDisposables.add(new ProtocolServerHandler(
				agentService,
				stateManager,
				listener,
				{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
				localDisposables.add(new AgentHostFileSystemProvider()),
				logService,
				telemetryService,
				managedSettingsService,
				tracker,
			)));
		}

		for (const [index, listener] of [firstServer, secondServer].entries()) {
			const transport = new MockProtocolTransport(index === 0 ? AgentHostTransportKind.MessagePort : AgentHostTransportKind.WebSocket);
			listener.simulateConnection(transport);
			transport.simulateMessage(request(index + 1, 'initialize', {
				protocolVersions: [PROTOCOL_VERSION],
				clientId: `client-${index}`,
			}));
		}
		handlers[0].dispose();

		assert.deepStrictEqual(telemetryService.events.map(event => {
			const data = event.data as { action: string; connectedClientCount: number; connectedTransportCount: number };
			return {
				action: data.action,
				connectedClientCount: data.connectedClientCount,
				connectedTransportCount: data.connectedTransportCount,
			};
		}), [
			{ action: 'connected', connectedClientCount: 1, connectedTransportCount: 1 },
			{ action: 'connected', connectedClientCount: 2, connectedTransportCount: 2 },
			{ action: 'disconnected', connectedClientCount: 1, connectedTransportCount: 1 },
		]);
	});

	test('deduplicates one client connected through multiple protocol listeners', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const tracker = localDisposables.add(new AgentHostClientConnectionService());
		const listeners = [
			localDisposables.add(new MockProtocolServer()),
			localDisposables.add(new MockProtocolServer()),
		];
		for (const listener of listeners) {
			localDisposables.add(new ProtocolServerHandler(
				agentService,
				stateManager,
				listener,
				{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
				localDisposables.add(new AgentHostFileSystemProvider()),
				logService,
				telemetryService,
				managedSettingsService,
				tracker,
			));
			const transport = new MockProtocolTransport();
			listener.simulateConnection(transport);
			transport.simulateMessage(request(1, 'initialize', {
				protocolVersions: [PROTOCOL_VERSION],
				clientId: 'shared-client',
			}));
		}

		assert.deepStrictEqual(tracker.getConnectionCounts('shared-client'), {
			connectedClientCount: 1,
			connectedTransportCount: 2,
			clientTransportCount: 2,
		});
	});

	test('expires disconnected client reconnect history', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const firstTransport = connectClient('client');
			firstTransport.simulateClose();
			assert.strictEqual(clientConnections.hasSeenClient('client'), true);

			await new Promise(resolve => setTimeout(resolve, AGENT_HOST_CLIENT_CONNECTION_HISTORY_RETENTION + 1));

			assert.deepStrictEqual({
				hasSeenClient: clientConnections.hasSeenClient('client'),
				isClientConnected: clientConnections.isClientConnected('client'),
			}, {
				hasSeenClient: false,
				isClientConnected: false,
			});
		});
	});

	test('does not count a client when initialization fails after negotiation', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const localServer = localDisposables.add(new MockProtocolServer());
		const localTelemetry = new TestTelemetryService();
		const localHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			localServer,
			{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
			localDisposables.add(new FailingAgentHostFileSystemProvider()),
			logService,
			localTelemetry,
			managedSettingsService,
			clientConnections,
		));
		const counts: number[] = [];
		localDisposables.add(localHandler.onDidChangeConnectionCount(count => counts.push(count)));
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		localServer.simulateConnection(transport);

		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'failed-client',
		}));
		const responseCode = (findResponse(transport.sent, 1) as { error: { code: number } }).error.code;
		transport.simulateClose();

		assert.deepStrictEqual({
			counts,
			events: localTelemetry.events,
			responseCode,
			hasSeenClient: clientConnections.hasSeenClient('failed-client'),
			isClientConnected: clientConnections.isClientConnected('failed-client'),
			connectionCounts: clientConnections.getConnectionCounts('failed-client'),
		}, {
			counts: [],
			events: [],
			responseCode: JSON_RPC_INTERNAL_ERROR,
			hasSeenClient: false,
			isClientConnected: false,
			connectionCounts: {
				connectedClientCount: 0,
				connectedTransportCount: 0,
				clientTransportCount: 0,
			},
		});
	});

	test('rolls back authoritative connection state when connected telemetry throws', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const localServer = localDisposables.add(new MockProtocolServer());
		const localTelemetry = new TestTelemetryService();
		localTelemetry.throwOnClientConnection = true;
		const localHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			localServer,
			{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
			localDisposables.add(new AgentHostFileSystemProvider()),
			logService,
			localTelemetry,
			managedSettingsService,
			clientConnections,
		));
		const countEvents: number[] = [];
		localDisposables.add(localHandler.onDidChangeConnectionCount(count => countEvents.push(count)));
		const transport = new MockProtocolTransport(AgentHostTransportKind.WebSocket);
		localServer.simulateConnection(transport);

		transport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'telemetry-failed-client',
		}));
		transport.simulateClose();

		assert.deepStrictEqual({
			countEvents,
			isClientConnected: clientConnections.isClientConnected('telemetry-failed-client'),
			counts: clientConnections.getConnectionCounts('telemetry-failed-client'),
		}, {
			countEvents: [],
			isClientConnected: false,
			counts: {
				connectedClientCount: 0,
				connectedTransportCount: 0,
				clientTransportCount: 0,
			},
		});
	});

	test('does not notify connection observers when reconnect telemetry throws', () => {
		const localDisposables = disposables.add(new DisposableStore());
		const localServer = localDisposables.add(new MockProtocolServer());
		const localTelemetry = new TestTelemetryService();
		const localHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			localServer,
			{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
			localDisposables.add(new AgentHostFileSystemProvider()),
			logService,
			localTelemetry,
			managedSettingsService,
			clientConnections,
		));
		const countEvents: number[] = [];
		localDisposables.add(localHandler.onDidChangeConnectionCount(count => countEvents.push(count)));

		const initialTransport = new MockProtocolTransport();
		localServer.simulateConnection(initialTransport);
		initialTransport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'reconnect-telemetry-failed-client',
		}));
		localTelemetry.throwOnClientConnection = true;

		const failedTransport = new MockProtocolTransport();
		localServer.simulateConnection(failedTransport);
		failedTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'reconnect-telemetry-failed-client',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		failedTransport.simulateClose();
		localTelemetry.throwOnClientConnection = false;

		assert.deepStrictEqual({
			countEvents,
			counts: clientConnections.getConnectionCounts('reconnect-telemetry-failed-client'),
		}, {
			countEvents: [1],
			counts: {
				connectedClientCount: 1,
				connectedTransportCount: 1,
				clientTransportCount: 1,
			},
		});
	});

	test('rolls back reconnect when filesystem authority registration fails', async () => {
		const localDisposables = disposables.add(new DisposableStore());
		const localServer = localDisposables.add(new MockProtocolServer());
		const localTelemetry = new TestTelemetryService();
		const localHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			localServer,
			{ hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess },
			localDisposables.add(new FailingReconnectAgentHostFileSystemProvider()),
			logService,
			localTelemetry,
			managedSettingsService,
			clientConnections,
		));
		const counts: number[] = [];
		localDisposables.add(localHandler.onDidChangeConnectionCount(count => counts.push(count)));

		const initialTransport = new MockProtocolTransport();
		localServer.simulateConnection(initialTransport);
		initialTransport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'reconnecting-client',
		}));
		initialTransport.simulateClose();

		const failedTransport = new MockProtocolTransport();
		localServer.simulateConnection(failedTransport);
		failedTransport.simulateMessage(request(2, 'reconnect', {
			clientId: 'reconnecting-client',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		const failedResponseCode = (findResponse(failedTransport.sent, 2) as { error: { code: number } }).error.code;
		failedTransport.simulateClose();

		const retryTransport = new MockProtocolTransport();
		localServer.simulateConnection(retryTransport);
		const retryResponsePromise = waitForResponse(retryTransport, 3);
		retryTransport.simulateMessage(request(3, 'reconnect', {
			clientId: 'reconnecting-client',
			lastSeenServerSeq: 0,
			subscriptions: [],
		}));
		await retryResponsePromise;

		assert.deepStrictEqual({
			counts,
			connectionActions: localTelemetry.events.map(event => (event.data as { action: string }).action),
			failedResponseCode,
		}, {
			counts: [1, 0, 1],
			connectionActions: ['connected', 'disconnected', 'connected'],
			failedResponseCode: JSON_RPC_INTERNAL_ERROR,
		});
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

	test('snapshot reconnect refreshes state after a slower subscription settles', async () => {
		const slowSessionUri = URI.from({ scheme: 'copilot', path: '/slow-snapshot-session' }).toString();
		stateManager.createSession(makeSessionSummary());
		stateManager.createSession(makeSessionSummary(slowSessionUri));
		const transport1 = connectClient('client-snapshot-refresh', [sessionUri, slowSessionUri]);
		transport1.simulateClose();
		for (let i = 0; i < 1100; i++) {
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: `Title ${i}` });
		}
		const slowSubscribeBarrier = new DeferredPromise<void>();
		agentService.subscribeBarriers.set(slowSessionUri, slowSubscribeBarrier);

		const transport2 = new MockProtocolTransport();
		server.simulateConnection(transport2);
		const responsePromise = waitForResponse(transport2, 2);
		transport2.simulateMessage(request(2, 'reconnect', {
			clientId: 'client-snapshot-refresh',
			lastSeenServerSeq: 0,
			subscriptions: [sessionUri, slowSessionUri],
		}));
		await Promise.resolve();
		stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: 'Updated while reconnecting' });
		await slowSubscribeBarrier.complete();
		const response = await responsePromise as { result: ReconnectResult };
		const sessionSnapshot = response.result.type === 'snapshot'
			? response.result.snapshots.find(snapshot => snapshot.resource.toString() === sessionUri)
			: undefined;

		assert.deepStrictEqual({
			type: response.result.type,
			title: sessionSnapshot && hasKey(sessionSnapshot.state, { title: true }) ? sessionSnapshot.state.title : undefined,
		}, {
			type: 'snapshot',
			title: 'Updated while reconnecting',
		});
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
		// was disconnected (this is what residency eviction does in the real service).
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

	test('client tool call stamped for a disconnected protocol client fails after the grace period', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			const chatUri = buildDefaultChatUri(sessionUri);
			const transport = connectClient('disconnected-client', [sessionUri]);
			transport.simulateClose();
			stateManager.dispatchServerAction(chatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			stateManager.dispatchServerAction(chatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'disconnected-client' },
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
				error: 'Client disconnected-client disconnected before completing Run Task',
			});
		});
	});

	test('client tool call owned by an active local IPC client is not treated as orphaned', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			stateManager.dispatchServerAction(sessionUri, {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'local-client',
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
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'local-client' },
			});

			await new Promise(r => setTimeout(r, 30_001));

			const part = stateManager.getSessionState(sessionUri)?.activeTurn?.responseParts[0];
			assert.strictEqual(part?.kind === ResponsePartKind.ToolCall ? part.toolCall.status : undefined, ToolCallStatus.Streaming);
		});
	});

	test('orphaned client tool call timeout is cleared when the owning client connects within the window', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			stateManager.createSession(makeSessionSummary());
			stateManager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady, });
			const transport = connectClient('late-client', [sessionUri]);
			transport.simulateClose();
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

			// The owning client reconnects within the grace window.
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
			const transport = connectClient('disconnected-client', [sessionUri]);
			transport.simulateClose();
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2025-01-01T00:00:00.000Z',
				message: { text: 'run it', origin: { kind: MessageKind.User } },
			});
			// First orphaned tool call arms the grace timer.
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-1',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'disconnected-client' },
			});

			// Re-arming for a later call must retain the original deadline.
			await new Promise(r => setTimeout(r, 20_000));
			stateManager.dispatchServerAction(defaultChatUri, {
				type: ActionType.ChatToolCallStart,
				turnId: 'turn-1',
				toolCallId: 'tool-2',
				toolName: 'runTask',
				displayName: 'Run Task',
				contributor: { kind: ToolCallContributorKind.Client, clientId: 'disconnected-client' },
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

	test('getManagedSettingsDiagnostics returns provider SDK snapshots', async () => {
		agentService.managedSettingsDiagnostics = [{
			provider: 'copilot',
			snapshot: {
				source: 'device',
				serverManaged: false,
				deviceManaged: true,
				failClosed: false,
				bypassPermissionsDisabled: false,
				managedKeys: ['permissions'],
				settings: { permissions: { allow: ['Shell(echo *)'] } },
			},
		}];
		const transport = connectClient('client-managed-settings');
		transport.sent.length = 0;

		const responsePromise = waitForResponse(transport, 2);
		transport.simulateMessage(request(2, 'getManagedSettingsDiagnostics'));
		const response = await responsePromise as { result?: unknown; error?: { message: string } };

		assert.ok(!response.error, `unexpected error: ${response.error?.message}`);
		assert.deepStrictEqual(response.result, agentService.managedSettingsDiagnostics);
	});

	test('setClientManagedSettingsPermissions validates and attributes contributions to the connected client', async () => {
		const transport = connectClient('client-managed-settings-contribution');
		transport.sent.length = 0;

		transport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { disableBypassPermissionsMode: 'disable', ask: ['Shell'] },
		}));
		transport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { allow: ['Shell'] },
		}));
		await Promise.resolve();

		assert.deepStrictEqual(managedSettingsService.permissions, {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		});
	});

	test('scopes managed settings contributions to each protocol handler', () => {
		const firstTransport = connectClient('shared-client-id');
		firstTransport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { ask: ['Shell'] },
		}));

		const localDisposables = disposables.add(new DisposableStore());
		const secondServer = localDisposables.add(new MockProtocolServer());
		const secondHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			secondServer,
			{ defaultDirectory: URI.file('/home/testuser').toString() },
			localDisposables.add(new AgentHostFileSystemProvider()),
			logService,
			NullTelemetryService,
			managedSettingsService,
			clientConnections,
		));
		const secondTransport = new MockProtocolTransport();
		secondServer.simulateConnection(secondTransport);
		secondTransport.simulateMessage(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'shared-client-id',
		}));
		secondTransport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));

		assert.deepStrictEqual(managedSettingsService.permissions, {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		});

		secondTransport.simulateClose();
		secondHandler.dispose();

		assert.deepStrictEqual(managedSettingsService.permissions, { ask: ['Shell'] });
	});

	test('removes managed settings contributions for active and grace clients on dispose', () => {
		const activeTransport = connectClient('client-managed-settings-active');
		activeTransport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { ask: ['Shell'] },
		}));
		const graceTransport = connectClient('client-managed-settings-grace');
		graceTransport.simulateMessage(notification('setClientManagedSettingsPermissions', {
			permissions: { disableBypassPermissionsMode: 'disable' },
		}));
		graceTransport.simulateClose();

		assert.deepStrictEqual(managedSettingsService.permissions, {
			disableBypassPermissionsMode: 'disable',
			ask: ['Shell'],
		});

		handler.dispose();

		assert.deepStrictEqual(managedSettingsService.permissions, {});
	});

	test('removes a managed settings contribution after disconnect grace expires', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const transport = connectClient('client-managed-settings-disconnect');
			transport.simulateMessage(notification('setClientManagedSettingsPermissions', {
				permissions: { ask: ['Shell'] },
			}));
			transport.simulateClose();

			await new Promise(resolve => setTimeout(resolve, 30_001));

			assert.deepStrictEqual(managedSettingsService.permissions, {});
		});
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

	test('shares connection count across MessagePort and external listeners', async () => {
		const localDisposables = disposables.add(new DisposableStore());
		const messagePortServer = new MessagePortProtocolServer<string>();
		const socketServer = new MockProtocolServer();
		const combinedServer = localDisposables.add(new CompositeProtocolServer([messagePortServer, socketServer]));
		const combinedHandler = localDisposables.add(new ProtocolServerHandler(
			agentService,
			stateManager,
			combinedServer,
			{ defaultDirectory: URI.file('/home/testuser').toString() },
			localDisposables.add(new AgentHostFileSystemProvider()),
			logService,
			NullTelemetryService,
			managedSettingsService,
			clientConnections,
		));
		const counts: number[] = [];
		localDisposables.add(combinedHandler.onDidChangeConnectionCount(count => counts.push(count)));

		await messagePortServer.call<void>('message-port-client', 'connect');
		await messagePortServer.call<void>('message-port-client', 'send', JSON.stringify(request(1, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'message-port-client',
		})));

		const socketTransport = new MockProtocolTransport();
		socketServer.simulateConnection(socketTransport);
		socketTransport.simulateMessage(request(2, 'initialize', {
			protocolVersions: [PROTOCOL_VERSION],
			clientId: 'socket-client',
		}));

		messagePortServer.closeClient('message-port-client');
		socketTransport.simulateClose();

		assert.deepStrictEqual(counts, [1, 2, 1, 0]);
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
				NullTelemetryService,
				managedSettingsService,
				clientConnections,
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
				NullTelemetryService,
				managedSettingsService,
				clientConnections,
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
