/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../../browser/agentHostProtocolClient.js';
import { AgentHostPermissionMode, AgentHostResourceIdentity, AgentHostResourcePermissionError, IAgentHostResourceService, LOCAL_AGENT_HOST_RESOURCE_IDENTITY } from '../../common/agentHostResourceService.js';
import { buildAnnotationsUri } from '../../common/annotationsUri.js';
import { ConfigurationTarget, type IConfigurationValue } from '../../../configuration/common/configuration.js';
import { ContentEncoding, ReconnectResultType } from '../../common/state/protocol/commands.js';
import { ChatSourceKind } from '../../common/state/protocol/channels-chat/commands.js';
import { AhpErrorCodes, JsonRpcErrorCodes } from '../../common/state/protocol/errors.js';
import { PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from '../../common/state/protocol/version/registry.js';
import { ActionType, type ChatTurnStartedAction, type SessionActiveClientSetAction, type SessionActiveClientRemovedAction, type SessionTitleChangedAction } from '../../common/state/sessionActions.js';
import { ProtocolError, type AhpServerNotification, type JsonRpcNotification, type JsonRpcRequest, type JsonRpcResponse, type ProtocolMessage } from '../../common/state/sessionProtocol.js';
import { hasKey } from '../../../../base/common/types.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { buildChatUri, CustomizationType, MessageAttachmentKind, MessageKind, PendingMessageKind, readSessionExternal, readSessionWorkspaceless, ROOT_STATE_URI, SessionStatus, StateComponents, customizationId, withSessionExternal, withSessionWorkspaceless } from '../../common/state/sessionState.js';
import { NonReconnectableTransportError, type IClientTransport, type IProtocolTransport } from '../../common/state/sessionTransport.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ITelemetryService, TelemetryConfiguration, TelemetryLevel, TELEMETRY_SETTING_ID } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../telemetry/common/telemetryUtils.js';
import { AgentHostDisableRepoInfoTelemetryConfigKey, AgentHostTelemetryLevelConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, GLOBAL_AUTO_APPROVE_SETTING_ID, telemetryLevelToAgentHostConfigValue, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, TERMINAL_AUTO_APPROVE_SETTING_ID, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, type AgentHostTerminalAutoApproveRules } from '../../common/agentHostSchema.js';
import { AgentHostMapLegacySettingsToManagedSettingsSettingId } from '../../common/agentHostManagedSettings.js';
import { AgentHostConfigurationSyncScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../configuration/common/configurationRegistry.js';
import { Registry } from '../../../registry/common/platform.js';

// Settings used to exercise declarative agent-host mirroring. Registered by this
// suite rather than pulling in a product configuration contribution: the
// configuration registry is a process-wide singleton, so a side-effect import
// here would leak its registrations (and their `managedSettings` policies) into
// every other suite in the run.
const SYNC_SETTING_A = 'test.agentHostProtocolClient.syncA';
const SYNC_CONFIG_KEY_A = 'testSyncValueA';
const SYNC_SETTING_B = 'test.agentHostProtocolClient.syncB';
const SYNC_CONFIG_KEY_B = 'testSyncValueB';
const SYNC_LOCAL_SETTING = 'test.agentHostProtocolClient.syncLocal';
const SYNC_LOCAL_CONFIG_KEY = 'testSyncLocal';
const SYNC_AMBIENT_SETTING = 'test.agentHostProtocolClient.syncAmbient';
const SYNC_AMBIENT_CONFIG_KEY = 'testSyncAmbient';

const syncTestConfigurationNode = {
	id: 'testAgentHostProtocolClientSync',
	type: 'object' as const,
	properties: {
		[SYNC_SETTING_A]: {
			type: 'boolean' as const,
			default: false,
			agentHost: { key: SYNC_CONFIG_KEY_A },
		},
		[SYNC_SETTING_B]: {
			type: 'boolean' as const,
			default: false,
			agentHost: { key: SYNC_CONFIG_KEY_B },
		},
		[SYNC_LOCAL_SETTING]: {
			type: 'boolean' as const,
			default: true,
			agentHost: { key: SYNC_LOCAL_CONFIG_KEY, scope: AgentHostConfigurationSyncScope.Local },
		},
		[SYNC_AMBIENT_SETTING]: {
			type: 'boolean' as const,
			default: true,
			agentHost: { key: SYNC_AMBIENT_CONFIG_KEY, scope: AgentHostConfigurationSyncScope.Ambient },
		},
	},
};
import type { Implementation } from '../../common/state/protocol/common/commands.js';
import { agentsWindowAgentHostClientInfo, editorWindowAgentHostClientInfo } from '../../common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../common/agentHostTelemetry.js';

type ProtocolTransportMessage = ProtocolMessage | AhpServerNotification | JsonRpcNotification | JsonRpcResponse | JsonRpcRequest;
type RootConfigValue = boolean | string | AgentHostTerminalAutoApproveRules | undefined;

class TestClientIdentityTelemetryService implements ITelemetryService {
	declare readonly _serviceBrand: undefined;
	readonly telemetryLevel = TelemetryLevel.USAGE;
	readonly sessionId = 'client-session-id';
	readonly machineId = 'client-machine-id';
	readonly sqmId = 'client-sqm-id';
	readonly devDeviceId = 'client-dev-device-id';
	readonly firstSessionDate = '2026-08-14';
	readonly sendErrorTelemetry = true;
	publicLog(): void { }
	publicLog2(): void { }
	publicLogError(): void { }
	publicLogError2(): void { }
	setExperimentProperty(): void { }
	setCommonProperty(): void { }
}

interface ITestRootConfigNotificationParams {
	readonly action?: {
		readonly type?: string;
		readonly config?: Record<string, RootConfigValue>;
	};
}

function isPingRequest(msg: ProtocolTransportMessage): msg is JsonRpcRequest & { method: 'ping' } {
	return hasKey(msg, { method: true, id: true }) && msg.method === 'ping';
}

/**
 * Locate the `dispatchAction` notification that forwards a particular root
 * config key. The connect flow sends several `RootConfigChanged` notifications
 * (telemetry, session sync, terminal auto-approve), so matching on the config
 * key is more robust than indexing into `sentMessages` by position.
 */
function findRootConfigNotification(messages: readonly ProtocolTransportMessage[], configKey: string): JsonRpcNotification {
	const match = messages.find((msg): msg is JsonRpcNotification => {
		if (!hasKey(msg, { method: true }) || msg.method !== 'dispatchAction') {
			return false;
		}
		const params = (msg as JsonRpcNotification).params as ITestRootConfigNotificationParams | undefined;
		return params?.action?.type === ActionType.RootConfigChanged && !!params.action.config && configKey in params.action.config;
	});
	assert.ok(match, `Expected a RootConfigChanged notification carrying '${configKey}'`);
	return match;
}

function getRootConfig(notification: JsonRpcNotification): Record<string, RootConfigValue> {
	const params = notification.params as ITestRootConfigNotificationParams | undefined;
	assert.ok(params?.action?.config);
	return params.action.config;
}

function findLastRootConfigNotification(messages: readonly ProtocolTransportMessage[], configKey: string): JsonRpcNotification {
	return findRootConfigNotification([...messages].reverse(), configKey);
}

function findLastManagedSettingsNotification(messages: readonly ProtocolTransportMessage[]): ProtocolTransportMessage {
	const match = [...messages].reverse().find(message => hasKey(message, { method: true }) && message.method === 'setClientManagedSettingsPermissions');
	assert.ok(match, 'Expected a setClientManagedSettingsPermissions notification');
	return match;
}

/** The value forwarded for `configKey` in the first root-config notification carrying it. */
function findRootConfigValue(messages: readonly ProtocolTransportMessage[], configKey: string): RootConfigValue {
	return getRootConfig(findRootConfigNotification(messages, configKey))[configKey];
}

function findOptionalRootConfigValue(messages: readonly ProtocolTransportMessage[], configKey: string): RootConfigValue {
	for (const message of messages) {
		if (!hasKey(message, { method: true }) || message.method !== 'dispatchAction') {
			continue;
		}
		const params = (message as JsonRpcNotification).params as ITestRootConfigNotificationParams | undefined;
		if (params?.action?.type === ActionType.RootConfigChanged && params.action.config && hasKey(params.action.config, { [configKey]: true })) {
			return params.action.config[configKey];
		}
	}
	return undefined;
}

class TestProtocolTransport extends Disposable implements IProtocolTransport {
	constructor(readonly clientConnectionKind?: AgentHostClientConnectionKind) {
		super();
	}

	private readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly sentMessages: ProtocolTransportMessage[] = [];

	send(message: ProtocolTransportMessage): void {
		this.sentMessages.push(message);
	}

	fireMessage(message: ProtocolMessage): void {
		this._onMessage.fire(message);
	}

	fireClose(): void {
		this._onClose.fire();
	}
}

class TestClientProtocolTransport extends TestProtocolTransport implements IClientTransport {
	readonly connectDeferred = new DeferredPromise<void>();

	connect(): Promise<void> {
		return this.connectDeferred.p;
	}
}

class CloseOnDisposeProtocolTransport extends TestProtocolTransport {
	override dispose(): void {
		this.fireClose();
		super.dispose();
	}
}

class CountingLogService extends NullLogService {
	warnCount = 0;

	override warn(_message: string, ..._args: unknown[]): void {
		this.warnCount++;
	}
}

class TerminalAutoApproveConfigurationService extends TestConfigurationService {

	constructor(
		configuration: Record<string, AgentHostTerminalAutoApproveRules | boolean>,
		private readonly _terminalAutoApproveInspectValue: IConfigurationValue<Readonly<AgentHostTerminalAutoApproveRules>>,
	) {
		super(configuration);
	}

	override inspect<T>(key: string): IConfigurationValue<T> {
		if (key === TERMINAL_AUTO_APPROVE_SETTING_ID) {
			return this._terminalAutoApproveInspectValue as IConfigurationValue<T>;
		}
		return super.inspect<T>(key);
	}
}

class ManagedPermissionsConfigurationService extends TestConfigurationService {
	private globalAutoApprovePolicyValue: boolean | undefined = false;

	override inspect<T>(key: string): IConfigurationValue<T> {
		if (key === GLOBAL_AUTO_APPROVE_SETTING_ID) {
			return {
				...super.inspect<T>(key),
				policyValue: this.globalAutoApprovePolicyValue as T | undefined,
			};
		}
		return super.inspect<T>(key);
	}

	clearGlobalAutoApprovePolicy(): void {
		this.globalAutoApprovePolicyValue = undefined;
	}
}

suite('AgentHostProtocolClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	suiteSetup(() => configurationRegistry.registerConfiguration(syncTestConfigurationNode));
	suiteTeardown(() => configurationRegistry.deregisterConfigurations([syncTestConfigurationNode]));

	function createPermissionService(allow = true): IAgentHostResourceService {
		return createResourceServiceStub({ granted: () => allow });
	}

	interface IResourceServiceStubOpts {
		granted?: (identity: AgentHostResourceIdentity, uri: URI, mode: AgentHostPermissionMode) => boolean;
		onRequest?: (identity: AgentHostResourceIdentity, params: { uri: string; read?: boolean; write?: boolean }) => Promise<void>;
		onGrantImplicitRead?: (identity: AgentHostResourceIdentity, uri: URI) => void;
		/** Test hook that observes disposal of the implicit-read grant. */
		onRevokeImplicitRead?: (identity: AgentHostResourceIdentity, uri: URI) => void;
		readBytes?: VSBuffer;
	}

	/**
	 * Stub for {@link IAgentHostResourceService}: each FS method runs the
	 * `granted` predicate and either throws {@link AgentHostResourcePermissionError}
	 * (carrying the same `resourceRequest` payload the real service would
	 * advertise) or resolves with a minimal placeholder result. Sufficient to
	 * drive the protocol client's reverse-RPC permission-gating paths.
	 */
	function createResourceServiceStub(opts: IResourceServiceStubOpts = {}): IAgentHostResourceService {
		const grant = opts.granted ?? (() => true);
		const empty = observableValue<readonly never[]>('test', []);
		const denyRead = (uri: string) => new AgentHostResourcePermissionError({ channel: 'ahp-root://', uri, read: true });
		const denyWrite = (uri: string) => new AgentHostResourcePermissionError({ channel: 'ahp-root://', uri, write: true });
		const gateRead = async (identity: AgentHostResourceIdentity, uri: URI) => {
			if (!grant(identity, uri, AgentHostPermissionMode.Read)) { throw denyRead(uri.toString()); }
		};
		const gateWrite = async (identity: AgentHostResourceIdentity, uri: URI) => {
			if (!grant(identity, uri, AgentHostPermissionMode.Write)) { throw denyWrite(uri.toString()); }
		};
		return {
			_serviceBrand: undefined,
			check: async (addr, uri, mode) => grant(addr, uri, mode),
			async list(addr, uri) { await gateRead(addr, uri); return { entries: [] }; },
			async read(addr, uri) {
				await gateRead(addr, uri);
				if (opts.readBytes) {
					return { bytes: opts.readBytes };
				}
				throw new Error('Not implemented in stub');
			},
			async write(addr, params) { await gateWrite(addr, URI.parse(params.uri)); },
			async del(addr, params) { await gateWrite(addr, URI.parse(params.uri)); },
			async move(addr, params) { await gateWrite(addr, URI.parse(params.source)); await gateWrite(addr, URI.parse(params.destination)); },
			async copy(addr, params) { await gateRead(addr, URI.parse(params.source)); await gateWrite(addr, URI.parse(params.destination)); },
			async resolve(addr, params) { await gateRead(addr, URI.parse(params.uri)); throw new Error('Not implemented in stub'); },
			async mkdir(addr, params) { await gateWrite(addr, URI.parse(params.uri)); },
			request: async (addr, params) => opts.onRequest ? opts.onRequest(addr, params) : undefined,
			pendingFor: () => empty,
			allPending: empty,
			findPending: () => undefined,
			grantImplicitRead: (address, uri) => {
				opts.onGrantImplicitRead?.(address, uri);
				return opts.onRevokeImplicitRead ? toDisposable(() => opts.onRevokeImplicitRead?.(address, uri)) : Disposable.None;
			},
			connectionClosed: () => { },
		};
	}

	function createClientForIdentity(identity: AgentHostResourceIdentity, transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator?: { hasHighLoad(): boolean }, logService: ILogService = new NullLogService(), configurationService = new TestConfigurationService(), clientId?: string, clientInfo?: Implementation, telemetryService: ITelemetryService = NullTelemetryService): { client: AgentHostProtocolClient; transport: TestProtocolTransport; configurationService: TestConfigurationService } {
		const client = disposables.add(new AgentHostProtocolClient(identity, transport, loadEstimator, clientId, clientInfo, logService, permissionService, configurationService, telemetryService));
		return { client, transport, configurationService };
	}

	function createClient(transport = disposables.add(new TestProtocolTransport()), permissionService = createPermissionService(), loadEstimator?: { hasHighLoad(): boolean }, logService: ILogService = new NullLogService(), configurationService = new TestConfigurationService(), clientId?: string, clientInfo?: Implementation): { client: AgentHostProtocolClient; transport: TestProtocolTransport; configurationService: TestConfigurationService } {
		return createClientForIdentity('test.example:1234', transport, permissionService, loadEstimator, logService, configurationService, clientId, clientInfo);
	}

	async function connectClient(client: AgentHostProtocolClient, transport: TestProtocolTransport): Promise<void> {
		const connectPromise = client.connect();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}
		const sent = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connectPromise;
	}

	test('initialize sends the local client telemetry identity only for usage telemetry', async () => {
		const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.RemoteExtensionHost));
		const { client } = createClientForIdentity('test.example:1234', transport, createPermissionService(), undefined, new NullLogService(), new TestConfigurationService(), undefined, agentsWindowAgentHostClientInfo, new TestClientIdentityTelemetryService());
		const connectPromise = client.connect();
		const initialize = transport.sentMessages[0] as JsonRpcRequest;

		assert.deepStrictEqual((initialize.params as { _meta?: Record<string, unknown> })._meta, {
			'vscode.clientConnectionKind': AgentHostClientConnectionKind.RemoteExtensionHost,
			'vscode.telemetryLevel': 'all',
			'vscode.clientMachineId': 'client-machine-id',
			'vscode.clientDevDeviceId': 'client-dev-device-id',
		});

		transport.fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connectPromise;

		const noTelemetryTransport = disposables.add(new TestProtocolTransport());
		const noTelemetryClient = createClient(noTelemetryTransport).client;
		const noTelemetryConnectPromise = noTelemetryClient.connect();
		const noTelemetryInitialize = noTelemetryTransport.sentMessages[0] as JsonRpcRequest;
		assert.deepStrictEqual((noTelemetryInitialize.params as { _meta?: Record<string, unknown> })._meta, {
			'vscode.telemetryLevel': 'off',
		});
		noTelemetryTransport.fireMessage({
			jsonrpc: '2.0',
			id: noTelemetryInitialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await noTelemetryConnectPromise;
	});

	async function flushMicrotasks(): Promise<void> {
		// `await Promise.resolve()` only advances one microtask; loop to drain chained handlers.
		for (let i = 0; i < 10; i++) {
			await Promise.resolve();
		}
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, settingId: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire({
			source: ConfigurationTarget.USER,
			affectedKeys: new Set([settingId]),
			change: { keys: [settingId], overrides: [] },
			affectsConfiguration: configuration => configuration === settingId,
		});
	}

	async function assertRemoteProtocolError(promise: Promise<unknown>, expected: { code: number; message: string; data?: unknown }): Promise<void> {
		try {
			await promise;
			assert.fail('Expected promise to reject');
		} catch (error) {
			if (!(error instanceof ProtocolError)) {
				assert.fail(`Expected ProtocolError, got ${String(error)}`);
			}
			assert.strictEqual(error.code, expected.code);
			assert.strictEqual(error.message, expected.message);
			assert.deepStrictEqual(error.data, expected.data);
		}
	}

	test('completes matching response and removes it from pending requests', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'resourceList',
			params: { channel: 'ahp-root://', uri: URI.file('/workspace').toString() },
		});

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });
		assert.deepStrictEqual(await resultPromise, { entries: [] });

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [{ name: 'late', type: 'file' }] } });
		assert.strictEqual(transport.sentMessages.length, 1);
	});

	test('does not retain revoked authentication for reconnect replay', async () => {
		const { client, transport } = createClient();
		const authenticate = client.authenticate({ resource: 'https://api.github.com', scopes: ['write:user', 'read:user', 'write:user'], token: 'token' });
		const authenticateRequest = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({ jsonrpc: '2.0', id: authenticateRequest.id, result: { authenticated: true } });
		await authenticate;
		assert.deepStrictEqual(authenticateRequest.params, {
			channel: ROOT_STATE_URI,
			resource: 'https://api.github.com',
			scopes: ['read:user', 'write:user'],
			token: 'token',
		});

		const revoke = client.authenticate({ resource: 'https://api.github.com', scopes: ['write:user', 'read:user'], token: '' });
		const revokeRequest = transport.sentMessages[1] as JsonRpcRequest;
		transport.fireMessage({ jsonrpc: '2.0', id: revokeRequest.id, result: { authenticated: true } });
		await revoke;

		assert.deepStrictEqual([...client['_authentication'].values()], []);
	});

	test('listSessions carries the workspace-less marker back on _meta', async () => {
		// Regression: the sessions provider resolves a session's kind (quick
		// chat vs. workspace) from `_meta.workspaceless`, and after a window
		// reload a listing is what materializes it.
		// Dropping `_meta` on the way back made every restored quick chat look
		// workspace-bound and leak the host's scratch cwd as a workspace folder.
		const { client, transport } = createClient();
		const resultPromise = client.listSessions();

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			result: {
				items: [{
					resource: 'agent-session://copilotcli/quick-1',
					provider: 'copilotcli',
					title: 'Quick Chat',
					status: SessionStatus.Idle,
					createdAt: new Date(1000).toISOString(),
					modifiedAt: new Date(2000).toISOString(),
					workingDirectories: [URI.file('/home/user/.copilot/chats/quick-1').toString()],
					_meta: withSessionWorkspaceless(undefined, true),
				}],
			},
		});

		const sessions = await resultPromise;
		assert.deepStrictEqual(sessions.map(s => readSessionWorkspaceless(s._meta)), [true]);
	});

	test('listSessions carries external provenance back on _meta', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.listSessions();

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			result: {
				items: [{
					resource: 'agent-session://copilotcli/native-1',
					provider: 'copilotcli',
					title: 'Native Chat',
					status: SessionStatus.Idle,
					createdAt: new Date(1000).toISOString(),
					modifiedAt: new Date(2000).toISOString(),
					_meta: withSessionExternal(undefined, true),
				}],
			},
		});

		const sessions = await resultPromise;
		assert.deepStrictEqual(sessions.map(s => readSessionExternal(s._meta)), [true]);
	});

	test('queues requests and notifications until a client transport initializes', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const resource = URI.file('/workspace');
		const request = client.resourceList(resource);
		client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
		assert.strictEqual(transport.sentMessages.length, 0);
		disposables.add(client.onDidChangeConnectionState(state => {
			if (state === AgentHostClientState.Connected) {
				client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { onConnected: true } });
			}
		}));

		const connect = client.connect();
		await Promise.resolve();
		assert.strictEqual(transport.sentMessages.length, 0);

		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}
		const initialize = transport.sentMessages[0] as JsonRpcRequest;
		assert.strictEqual(initialize.method, 'initialize');
		transport.fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connect;

		const resourceList = transport.sentMessages.find((message): message is JsonRpcRequest =>
			hasKey(message, { method: true }) && message.method === 'resourceList');
		assert.ok(resourceList);
		const actions = transport.sentMessages.filter((message): message is JsonRpcNotification =>
			hasKey(message, { method: true }) && message.method === 'dispatchAction');
		const preInitialize = actions.find(action => (action.params as ITestRootConfigNotificationParams).action?.config?.preInitialize === true);
		const onConnected = actions.find(action => (action.params as ITestRootConfigNotificationParams).action?.config?.onConnected === true);
		assert.ok(preInitialize);
		assert.ok(onConnected);
		assert.ok(transport.sentMessages.indexOf(resourceList) < transport.sentMessages.indexOf(preInitialize));
		assert.ok(transport.sentMessages.indexOf(preInitialize) < transport.sentMessages.indexOf(onConnected));
		transport.fireMessage({ jsonrpc: '2.0', id: resourceList.id, result: { entries: [] } });
		assert.deepStrictEqual(await request, { entries: [] });
	});

	test('rejects queued requests and drops queued notifications when initialization fails', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const request = client.resourceList(URI.file('/workspace'));
		client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { preInitialize: true } });
		assert.strictEqual(transport.sentMessages.length, 0);

		const connect = client.connect();
		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}
		const initialize = transport.sentMessages[0] as JsonRpcRequest;
		const expected = { code: -32001, message: 'Initialization failed' };
		const requestError = assertRemoteProtocolError(request, expected);
		const connectError = assertRemoteProtocolError(connect, expected);
		transport.fireMessage({ jsonrpc: '2.0', id: initialize.id, error: expected });

		await Promise.all([requestError, connectError]);
		assert.deepStrictEqual(transport.sentMessages, [initialize]);
	});

	test('waits for initialization before returning completion trigger characters', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const completionTriggerCharacters = client.getCompletionTriggerCharacters();
		let settled = false;
		void completionTriggerCharacters.then(() => settled = true);
		await Promise.resolve();
		assert.strictEqual(settled, false);

		const connect = client.connect();
		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}
		const initialize = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [], completionTriggerCharacters: ['.', '@'] },
		});

		await connect;
		assert.deepStrictEqual(await completionTriggerCharacters, ['.', '@']);
	});

	test('rejects completion trigger characters after an incompatible initialization', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const completionTriggerCharacters = assertRemoteProtocolError(client.getCompletionTriggerCharacters(), {
			code: AhpErrorCodes.UnsupportedProtocolVersion,
			message: 'Protocol versions do not match',
		});
		const connect = client.connect();
		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}
		const initialize = transport.sentMessages[0] as JsonRpcRequest;
		const connectError = assertRemoteProtocolError(connect, {
			code: AhpErrorCodes.UnsupportedProtocolVersion,
			message: 'Protocol versions do not match',
		});
		transport.fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			error: { code: AhpErrorCodes.UnsupportedProtocolVersion, message: 'Protocol versions do not match' },
		});

		await Promise.all([completionTriggerCharacters, connectError]);
	});

	test('maps create session metadata and progress token', async () => {
		const { client, transport } = createClient();
		await connectClient(client, transport);
		const session = URI.parse('ahp-session:/new');
		const creation = client.createSession({
			provider: 'copilot',
			session,
			_meta: { multiRoot: { workspaceFile: 'file:///demo.code-workspace' } },
			progressToken: 'progress-token',
		});

		const request = transport.sentMessages.find((message): message is JsonRpcRequest =>
			hasKey(message, { method: true }) && message.method === 'createSession');
		assert.deepStrictEqual(request?.params, {
			channel: session.toString(),
			_meta: { multiRoot: { workspaceFile: 'file:///demo.code-workspace' } },
			provider: 'copilot',
			workingDirectories: undefined,
			config: undefined,
			activeClient: undefined,
			progressToken: 'progress-token',
		});
		assert.strictEqual(client.getInflightSessionCreate(session), creation);
		assert.ok(request);
		transport.fireMessage({ jsonrpc: '2.0', id: request.id, result: null });
		assert.strictEqual(await creation, session);
	});

	suite('createChat', () => {
		const sessionUri = URI.parse('ahp-session:/test');
		const chatUri = URI.parse('ahp-session:/test/chat-1');
		const sourceUri = URI.parse('ahp-session:/test/chat-0');

		test('forwards a fork source tagged with kind "fork"', async () => {
			const { client, transport } = createClient();

			const resultPromise = client.createChat(sessionUri, chatUri, { fork: { source: sourceUri, turnId: 'turn-1' } });

			assert.deepStrictEqual(transport.sentMessages[0], {
				jsonrpc: '2.0',
				id: 1,
				method: 'createChat',
				params: {
					channel: sessionUri.toString(),
					chat: chatUri.toString(),
					source: { kind: ChatSourceKind.Fork, chat: sourceUri.toString(), turnId: 'turn-1' },
				},
			});

			transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });
			await resultPromise;
		});

		test('forwards a side chat (`/btw`) source tagged with kind "sideChat"', async () => {
			const { client, transport } = createClient();

			const selection = { text: '  selected text  ', responsePartId: 'response-part-1' };
			const resultPromise = client.createChat(sessionUri, chatUri, { sideChat: { source: sourceUri, turnId: 'turn-1', selection } });

			assert.deepStrictEqual(transport.sentMessages[0], {
				jsonrpc: '2.0',
				id: 1,
				method: 'createChat',
				params: {
					channel: sessionUri.toString(),
					chat: chatUri.toString(),
					source: { kind: ChatSourceKind.SideChat, chat: sourceUri.toString(), turnId: 'turn-1', selection },
				},
			});

			transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });
			await resultPromise;
		});

		test('omits source entirely when neither fork nor sideChat is requested', async () => {
			const { client, transport } = createClient();

			const resultPromise = client.createChat(sessionUri, chatUri);

			assert.deepStrictEqual(transport.sentMessages[0], {
				jsonrpc: '2.0',
				id: 1,
				method: 'createChat',
				params: { channel: sessionUri.toString(), chat: chatUri.toString() },
			});

			transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });
			await resultPromise;
		});
	});
	test('preserves JSON-RPC error code and data', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceRead(URI.file('/missing'));
		const data = { uri: URI.file('/missing').toString() };

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.NotFound, message: 'Missing resource', data } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: 'Missing resource', data });
	});

	test('does not warn for missing file resource reads', async () => {
		const logService = new CountingLogService();
		const { client, transport } = createClient(undefined, undefined, undefined, logService);
		const resultPromise = client.resourceRead(URI.file('/workspace/src/missing.ts'));

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.NotFound, message: 'Content not found' } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: 'Content not found' });
		assert.strictEqual(logService.warnCount, 0);
	});

	test('warns for non-file resource read NotFound errors', async () => {
		const logService = new CountingLogService();
		const { client, transport } = createClient(undefined, undefined, undefined, logService);
		const resultPromise = client.resourceRead(URI.parse('session-db:/missing'));

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.NotFound, message: 'Missing snapshot' } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: 'Missing snapshot' });
		assert.strictEqual(logService.warnCount, 1);
	});

	test('warns for non-read NotFound errors', async () => {
		const logService = new CountingLogService();
		const { client, transport } = createClient(undefined, undefined, undefined, logService);
		const resultPromise = client.resourceResolve({ channel: ROOT_STATE_URI, uri: URI.file('/workspace/src/missing.ts').toString() });

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.NotFound, message: 'Missing resource' } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.NotFound, message: 'Missing resource' });
		assert.strictEqual(logService.warnCount, 1);
	});

	test('ignores response for unknown request id', () => {
		const { transport } = createClient();

		transport.fireMessage({ jsonrpc: '2.0', id: 99, result: null });

		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects all pending requests on transport close', async () => {
		const { client, transport } = createClient();
		const first = client.resourceList(URI.file('/one'));
		const second = client.resourceRead(URI.file('/two'));
		let closeCount = 0;
		disposables.add(client.onDidClose(() => closeCount++));
		const firstRejected = assertRemoteProtocolError(first, { code: -32000, message: 'Connection closed: test.example:1234' });
		const secondRejected = assertRemoteProtocolError(second, { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.fireClose();

		await firstRejected;
		await secondRejected;
		assert.strictEqual(closeCount, 1);
	});

	test('rejects pending requests on dispose', async () => {
		const { client } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
	});

	test('dispose rejection wins when transport emits close while disposing', async () => {
		const transport = disposables.add(new CloseOnDisposeProtocolTransport());
		const { client } = createClient(transport);
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
	});

	test('late response after close does not complete rejected request', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.resourceList(URI.file('/workspace'));
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });

		await rejected;
	});

	test('rejects requests started after transport close', async () => {
		const { client, transport } = createClient();

		transport.fireClose();

		await assertRemoteProtocolError(client.resourceList(URI.file('/workspace')), { code: -32000, message: 'Connection closed: test.example:1234' });
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects requests started after dispose', async () => {
		const { client, transport } = createClient();

		client.dispose();

		await assertRemoteProtocolError(client.resourceList(URI.file('/workspace')), { code: -32000, message: 'Connection disposed: test.example:1234' });
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('liveness sends a ping when idle and force-closes after the ping ages out', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// First idle tick (t=5s) sends a ping; that ping then ages out
			// over the next ~20s and triggers a close at ~t=25s.
			await timeout(30_000);

			const pings = transport.sentMessages.filter(isPingRequest);
			assert.ok(pings.length >= 1, `expected at least 1 ping, got ${pings.length}`);
			assert.strictEqual(closeCount, 1);
			client.dispose();
		});
	});

	test('liveness keeps the connection open while pings are answered', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// Auto-respond to every outgoing ping.
			let answered = 0;
			const dispose = mainWindow.setInterval(() => {
				for (const msg of transport.sentMessages) {
					if (isPingRequest(msg) && msg.id > answered) {
						answered = msg.id;
						transport.fireMessage({ jsonrpc: '2.0', id: msg.id, result: null });
					}
				}
			}, 1_000);

			await timeout(60_000);
			mainWindow.clearInterval(dispose);

			assert.strictEqual(closeCount, 0);
			assert.ok(answered >= 4, `expected several pings to have been answered, got ${answered}`);
			client.dispose();
		});
	});

	test('liveness is suppressed while local load is high', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const highLoad = { hasHighLoad: () => true };
			const { client } = createClient(undefined, undefined, highLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// 60s of silence — would normally trigger the timeout — but
			// high local load means we attribute the silence to ourselves
			// and stay quiet.
			await timeout(60_000);

			assert.strictEqual(closeCount, 0);
			client.dispose();
		});
	});

	test('liveness watchdog does not time out local child-process connections', async () => {
		const clock = sinon.useFakeTimers();
		const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.Local));
		const { client } = createClient(transport);
		let closeCount = 0;
		disposables.add(client.onDidClose(() => closeCount++));
		try {
			await clock.tickAsync(60_000);

			assert.deepStrictEqual({
				sentPing: transport.sentMessages.some(isPingRequest),
				closeCount,
			}, {
				sentPing: true,
				closeCount: 0,
			});
		} finally {
			client.dispose();
			clock.restore();
		}
	});

	test('liveness stops after the connection is closed', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const lowLoad = { hasHighLoad: () => false };
			const { client, transport } = createClient(undefined, undefined, lowLoad);
			let closeCount = 0;
			disposables.add(client.onDidClose(() => closeCount++));

			// Wait for the first force-close.
			await timeout(30_000);
			assert.strictEqual(closeCount, 1, 'should have force-closed once');

			const pingsAtClose = transport.sentMessages.filter(isPingRequest).length;

			// Wait much longer; no further pings, no further closes.
			await timeout(60_000);
			assert.strictEqual(closeCount, 1, 'should not fire again after close');
			const pingsLater = transport.sentMessages.filter(isPingRequest).length;
			assert.strictEqual(pingsLater, pingsAtClose, 'no further pings should be sent after close');
			client.dispose();
		});
	});

	test('inbound messages are dropped after close', async () => {
		return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
			const { client, transport } = createClient();
			let actionCount = 0;
			disposables.add(client.onDidAction(() => actionCount++));

			// Issue a request, then force close via the watchdog timeout.
			const pending = client.resourceList(URI.file('/workspace'));
			const rejected = pending.catch(err => err);
			await timeout(30_000);
			const err = await rejected;
			assert.ok(err instanceof ProtocolError);

			// Late response for the same request id — the shared
			// SSHRelayTransport feeds both old and new clients for the
			// same connectionId, so this can happen in production. The
			// pending request was already rejected; if _handleMessage
			// processed the response it would log a "unknown request id"
			// warning at best, or settle a request the caller no longer
			// owns at worst. Either way, after close it must be a no-op.
			transport.fireMessage({ jsonrpc: '2.0', id: 1, result: { entries: [] } });

			// Late notification — must not fan out as an action event.
			const lateAction: SessionActiveClientRemovedAction = {
				type: ActionType.SessionActiveClientRemoved,
				clientId: 'c1',
			};
			transport.fireMessage({
				jsonrpc: '2.0',
				method: 'action',
				params: { channel: 'ahp-session:/test', action: lateAction, serverSeq: 1, origin: undefined }
			});

			assert.strictEqual(actionCount, 0, 'late action notifications must be ignored after close');
			client.dispose();
		});
	});

	test('rejects connect when transport closes before connect completes', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const rejected = assertRemoteProtocolError(client.connect(), { code: -32000, message: 'Connection closed: test.example:1234' });

		transport.fireClose();
		transport.connectDeferred.complete();

		await rejected;
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('rejects connect when disposed before transport connect completes', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const rejected = assertRemoteProtocolError(client.connect(), { code: -32000, message: 'Connection disposed: test.example:1234' });

		client.dispose();

		await rejected;
		assert.strictEqual(transport.sentMessages.length, 0);
	});

	test('initialize handshake includes protocol version and client info', async () => {
		const transport = disposables.add(new TestClientProtocolTransport(AgentHostClientConnectionKind.DevTunnel));
		const clientInfo = agentsWindowAgentHostClientInfo;
		const { client } = createClientForIdentity('test.example:1234', transport, createPermissionService(), undefined, new NullLogService(), new TestConfigurationService(), 'renderer-client-id', clientInfo, new TestClientIdentityTelemetryService());
		const connectPromise = client.connect();

		transport.connectDeferred.complete();
		// `connect()` chains through several awaits before posting the
		// initialize request — yield until it shows up.
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		assert.strictEqual(sent.method, 'initialize');
		const params = sent.params as { protocolVersions: readonly string[]; clientId: string; clientInfo?: Implementation; _meta?: Record<string, unknown> };
		assert.deepStrictEqual({
			protocolVersions: params.protocolVersions,
			clientId: params.clientId,
			clientInfo: params.clientInfo,
			_meta: params._meta,
		}, {
			// Every negotiable version is offered so an older host can negotiate down,
			// newest first so a current host still picks it.
			protocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
			clientId: 'renderer-client-id',
			clientInfo,
			_meta: {
				'vscode.clientConnectionKind': 'dev_tunnel',
				'vscode.telemetryLevel': 'all',
				'vscode.clientMachineId': 'client-machine-id',
				'vscode.clientDevDeviceId': 'client-dev-device-id',
			},
		});
		assert.strictEqual(params.protocolVersions[0], PROTOCOL_VERSION);

		// Reply with a successful handshake so `connect()` resolves and the
		// test can finish cleanly.
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connectPromise;
		const telemetryLevel = findRootConfigNotification(transport.sentMessages, AgentHostTelemetryLevelConfigKey);
		assert.deepStrictEqual(telemetryLevel, {
			jsonrpc: '2.0',
			method: 'dispatchAction',
			params: {
				channel: ROOT_STATE_URI,
				clientSeq: 0,
				action: {
					type: ActionType.RootConfigChanged,
					config: { [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE) },
				},
			},
		});
		const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
		assert.deepStrictEqual(terminalAutoApproveRules, {
			jsonrpc: '2.0',
			method: 'dispatchAction',
			params: {
				channel: ROOT_STATE_URI,
				clientSeq: 0,
				action: {
					type: ActionType.RootConfigChanged,
					config: { [AgentHostTerminalAutoApproveRulesConfigKey]: {} },
				},
			},
		});
	});

	test('forwards the actual telemetry service restriction during initialization and config sync', async () => {
		const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.RemoteExtensionHost));
		const configurationService = new TestConfigurationService();
		const client = disposables.add(new AgentHostProtocolClient(
			'test.example:1234',
			transport,
			undefined,
			'telemetry-disabled-client',
			editorWindowAgentHostClientInfo,
			new NullLogService(),
			createPermissionService(),
			configurationService,
			NullTelemetryService,
		));

		const connectPromise = client.connect();
		const initialize = transport.sentMessages[0] as JsonRpcRequest;
		assert.deepStrictEqual((initialize.params as { _meta?: Record<string, unknown> })._meta, {
			'vscode.clientConnectionKind': AgentHostClientConnectionKind.RemoteExtensionHost,
			'vscode.telemetryLevel': 'off',
		});
		transport.fireMessage({
			jsonrpc: '2.0',
			id: initialize.id,
			result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
		});
		await connectPromise;

		assert.strictEqual(
			findRootConfigValue(transport.sentMessages, AgentHostTelemetryLevelConfigKey),
			'off',
		);
	});

	test('forwards telemetry setting changes to the local agent host after initialization', async () => {
		const transport = disposables.add(new TestProtocolTransport(AgentHostClientConnectionKind.Local));
		const configurationService = new TestConfigurationService();
		const { client } = createClientForIdentity(
			LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
			transport,
			createPermissionService(),
			undefined,
			new NullLogService(),
			configurationService,
			undefined,
			editorWindowAgentHostClientInfo,
			new TestClientIdentityTelemetryService(),
		);
		await connectClient(client, transport);
		transport.sentMessages.length = 0;

		await configurationService.setUserConfiguration(TELEMETRY_SETTING_ID, TelemetryConfiguration.OFF);
		fireConfigurationChange(configurationService, TELEMETRY_SETTING_ID);

		assert.strictEqual(findRootConfigValue(transport.sentMessages, AgentHostTelemetryLevelConfigKey), 'off');
	});

	test('forwards every setting declaring `agentHost` on connect and when one changes', async () => {
		const configurationService = new TestConfigurationService({
			[SYNC_SETTING_A]: true,
			[SYNC_SETTING_B]: false,
		});
		const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), undefined, new NullLogService(), configurationService);

		await connectClient(client, transport);

		assert.deepStrictEqual({
			a: findRootConfigValue(transport.sentMessages, SYNC_CONFIG_KEY_A),
			b: findRootConfigValue(transport.sentMessages, SYNC_CONFIG_KEY_B),
		}, {
			a: true,
			b: false,
		});

		transport.sentMessages.length = 0;
		await configurationService.setUserConfiguration(SYNC_SETTING_A, false);
		fireConfigurationChange(configurationService, SYNC_SETTING_A);

		// Only the affected setting is re-forwarded.
		assert.deepStrictEqual(getRootConfig(findLastRootConfigNotification(transport.sentMessages, SYNC_CONFIG_KEY_A)), {
			[SYNC_CONFIG_KEY_A]: false,
		});
	});

	test('applies local and ambient configuration scopes to the target Agent Host', async () => {
		const local = createClientForIdentity(LOCAL_AGENT_HOST_RESOURCE_IDENTITY);
		const remoteExtensionHost = createClientForIdentity('vscode-remote://ssh-remote+host');
		const remote = createClient();

		await Promise.all([
			connectClient(local.client, local.transport),
			connectClient(remoteExtensionHost.client, remoteExtensionHost.transport),
			connectClient(remote.client, remote.transport),
		]);

		assert.deepStrictEqual({
			local: {
				local: findRootConfigValue(local.transport.sentMessages, SYNC_LOCAL_CONFIG_KEY),
				ambient: findRootConfigValue(local.transport.sentMessages, SYNC_AMBIENT_CONFIG_KEY),
			},
			remoteExtensionHost: {
				local: findOptionalRootConfigValue(remoteExtensionHost.transport.sentMessages, SYNC_LOCAL_CONFIG_KEY),
				ambient: findRootConfigValue(remoteExtensionHost.transport.sentMessages, SYNC_AMBIENT_CONFIG_KEY),
			},
			remote: {
				local: findOptionalRootConfigValue(remote.transport.sentMessages, SYNC_LOCAL_CONFIG_KEY),
				ambient: findOptionalRootConfigValue(remote.transport.sentMessages, SYNC_AMBIENT_CONFIG_KEY),
			},
		}, {
			local: { local: true, ambient: true },
			remoteExtensionHost: { local: undefined, ambient: true },
			remote: { local: undefined, ambient: undefined },
		});
	});

	test('forwards the repo-info telemetry debug switch on connect and change', async () => {
		const configurationService = new TestConfigurationService({ [DISABLE_REPO_INFO_TELEMETRY_SETTING_ID]: true });
		const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), undefined, new NullLogService(), configurationService);

		await connectClient(client, transport);

		const disabled = findRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
		assert.deepStrictEqual(getRootConfig(disabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: true });

		transport.sentMessages.length = 0;
		await configurationService.setUserConfiguration(DISABLE_REPO_INFO_TELEMETRY_SETTING_ID, false);
		fireConfigurationChange(configurationService, DISABLE_REPO_INFO_TELEMETRY_SETTING_ID);

		const enabled = findLastRootConfigNotification(transport.sentMessages, AgentHostDisableRepoInfoTelemetryConfigKey);
		assert.deepStrictEqual(getRootConfig(enabled), { [AgentHostDisableRepoInfoTelemetryConfigKey]: false });
	});

	test('forwards and clears legacy managed permissions for the local host', async () => {
		const configurationService = new ManagedPermissionsConfigurationService({
			[AgentHostMapLegacySettingsToManagedSettingsSettingId]: true,
			[TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID]: false,
		});
		const { client, transport } = createClientForIdentity(
			LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
			disposables.add(new TestProtocolTransport()),
			createPermissionService(),
			undefined,
			new NullLogService(),
			configurationService,
		);

		await connectClient(client, transport);

		assert.deepStrictEqual(findLastManagedSettingsNotification(transport.sentMessages), {
			jsonrpc: '2.0',
			method: 'setClientManagedSettingsPermissions',
			params: {
				permissions: {
					disableBypassPermissionsMode: 'disable',
					ask: ['Shell'],
				},
			},
		});

		transport.sentMessages.length = 0;
		configurationService.clearGlobalAutoApprovePolicy();
		await configurationService.setUserConfiguration(GLOBAL_AUTO_APPROVE_SETTING_ID, true);
		fireConfigurationChange(configurationService, GLOBAL_AUTO_APPROVE_SETTING_ID);
		await configurationService.setUserConfiguration(TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID, true);
		fireConfigurationChange(configurationService, TERMINAL_AUTO_APPROVE_ENABLED_SETTING_ID);

		assert.deepStrictEqual(findLastManagedSettingsNotification(transport.sentMessages), {
			jsonrpc: '2.0',
			method: 'setClientManagedSettingsPermissions',
			params: { permissions: {} },
		});
	});

	test('forwards terminal auto-approve rules on connect', async () => {
		const configurationService = new TestConfigurationService({
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: {
				echo: null,
				python: true,
				'/^npm run build$/': { approve: true, matchCommandLine: true },
			},
		});
		const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), undefined, new NullLogService(), configurationService);

		await connectClient(client, transport);

		const terminalAutoApproveRules = findRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
		assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
			[AgentHostTerminalAutoApproveRulesConfigKey]: {
				echo: null,
				python: true,
				'/^npm run build$/': { approve: true, matchCommandLine: true },
			},
		});
	});

	test('redispatches terminal auto-approve rules when the rule setting changes', async () => {
		const configurationService = new TestConfigurationService();
		const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), undefined, new NullLogService(), configurationService);
		await connectClient(client, transport);
		transport.sentMessages.length = 0;

		await configurationService.setUserConfiguration(TERMINAL_AUTO_APPROVE_SETTING_ID, { python: true });
		fireConfigurationChange(configurationService, TERMINAL_AUTO_APPROVE_SETTING_ID);

		const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
		assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
			[AgentHostTerminalAutoApproveRulesConfigKey]: { python: true },
		});
	});

	test('redispatches terminal auto-approve rules when ignored defaults change', async () => {
		const configurationService = new TerminalAutoApproveConfigurationService({
			[TERMINAL_AUTO_APPROVE_SETTING_ID]: { echo: true, python: true },
		}, {
			default: { value: { echo: true } },
			user: { value: { python: true } },
		});
		const { client, transport } = createClient(disposables.add(new TestProtocolTransport()), createPermissionService(), undefined, new NullLogService(), configurationService);
		await connectClient(client, transport);
		transport.sentMessages.length = 0;

		await configurationService.setUserConfiguration(TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID, true);
		fireConfigurationChange(configurationService, TERMINAL_IGNORE_DEFAULT_AUTO_APPROVE_RULES_SETTING_ID);

		const terminalAutoApproveRules = findLastRootConfigNotification(transport.sentMessages, AgentHostTerminalAutoApproveRulesConfigKey);
		assert.deepStrictEqual(getRootConfig(terminalAutoApproveRules), {
			[AgentHostTerminalAutoApproveRulesConfigKey]: { python: true },
		});
	});

	test('rejects normal traffic but retains the transport for an incompatible protocol upgrade', async () => {
		const transport = disposables.add(new TestClientProtocolTransport());
		const { client } = createClient(transport);
		const connectPromise = client.connect();

		transport.connectDeferred.complete();
		while (transport.sentMessages.length === 0) {
			await Promise.resolve();
		}

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		transport.fireMessage({
			jsonrpc: '2.0',
			id: sent.id,
			error: {
				code: AhpErrorCodes.UnsupportedProtocolVersion,
				message: 'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
				data: { supportedVersions: ['0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
			},
		});

		await assertRemoteProtocolError(connectPromise, {
			code: AhpErrorCodes.UnsupportedProtocolVersion,
			message: 'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
			data: { supportedVersions: ['0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
		});
		assert.strictEqual(client.connectionState, AgentHostClientState.Incompatible);
		await assertRemoteProtocolError(client.resourceList(URI.file('/workspace')), {
			code: AhpErrorCodes.UnsupportedProtocolVersion,
			message: 'Client offered protocol versions [0.1.0], but this server only supports 0.2.0.',
			data: { supportedVersions: ['0.2.0'], _meta: { vscodeUpgradeMethod: '_vscodeUpgrade' } },
		});
		client.dispatch(ROOT_STATE_URI, { type: ActionType.RootConfigChanged, config: { dropped: true } });
		assert.strictEqual(transport.sentMessages.length, 1);

		const upgrade = client.triggerVscodeUpgrade('_vscodeUpgrade');
		const request = transport.sentMessages[1] as JsonRpcRequest;
		assert.deepStrictEqual(request, {
			jsonrpc: '2.0',
			id: 2,
			method: '_vscodeUpgrade',
			params: {},
		});
		transport.fireMessage({ jsonrpc: '2.0', id: request.id, result: { ok: true, upgradeStarted: true } });
		assert.deepStrictEqual(await upgrade, { ok: true, upgradeStarted: true });
		transport.fireClose();
		assert.strictEqual(client.connectionState, AgentHostClientState.Closed);
	});

	test('sends shutdown as a JSON-RPC request shape', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.shutdown();

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'shutdown',
			params: undefined,
		});

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });
		await resultPromise;
	});

	test('rejects shutdown with structured JSON-RPC error', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.shutdown();

		transport.fireMessage({ jsonrpc: '2.0', id: 1, error: { code: AhpErrorCodes.TurnInProgress, message: 'Turn in progress' } });

		await assertRemoteProtocolError(resultPromise, { code: AhpErrorCodes.TurnInProgress, message: 'Turn in progress' });
	});

	test('collectDebugLogs maps the returned host resource', async () => {
		const { client, transport } = createClient();
		const session = URI.parse('copilotcli:/session-1');
		const chat = URI.parse(buildChatUri(session, 'peer-1'));
		const resultPromise = client.collectDebugLogs(session, 'archive', chat);

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'vscode/collectAgentHostDebugLogs',
			params: { session: session.toString(), chat: chat.toString(), kind: 'archive' },
		});

		transport.fireMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true, size: 1024, uncompressedSize: 2048, entries: [{ path: 'agenthost.log', size: 2048 }] },
		});
		const result = await resultPromise;
		assert.deepStrictEqual({
			kind: result.kind,
			providerLogsIncluded: result.providerLogsIncluded,
			size: result.size,
			uncompressedSize: result.uncompressedSize,
			scheme: result.resource.scheme,
			authority: result.resource.authority,
			path: result.resource.path,
			entries: result.entries,
		}, {
			kind: 'archive',
			providerLogsIncluded: true,
			size: 1024,
			uncompressedSize: 2048,
			scheme: 'vscode-agent-host',
			authority: 'test.example__1234',
			path: '/tmp/agent-host-debug.zip',
			entries: [{ path: 'agenthost.log', size: 2048 }],
		});
	});

	test('getSessionStateFile maps the returned host resource', async () => {
		const { client, transport } = createClient();
		const session = URI.parse('copilotcli:/session-1');
		const resultPromise = client.getSessionStateFile(session);

		assert.deepStrictEqual(transport.sentMessages[0], {
			jsonrpc: '2.0',
			id: 1,
			method: 'vscode/getAgentHostSessionStateFile',
			params: { session: session.toString() },
		});

		transport.fireMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { resource: 'file:///state/sdk-session/events.jsonl' },
		});

		assert.strictEqual(
			(await resultPromise)?.toString(),
			'vscode-agent-host://test.example__1234/state/sdk-session/events.jsonl?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0',
		);
	});

	test('getSessionStateFile rejects a non-file host resource', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.getSessionStateFile(URI.parse('copilotcli:/session-1'));
		transport.fireMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { resource: 'vscode-userdata:/User/settings.json' },
		});

		await assertRemoteProtocolError(resultPromise, {
			code: JsonRpcErrorCodes.InvalidParams,
			message: 'Agent Host returned a non-file session state resource: vscode-userdata:/User/settings.json',
		});
	});

	test('getSessionStateFile returns undefined when the host has no state file', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.getSessionStateFile(URI.parse('copilotcli:/session-1'));
		transport.fireMessage({
			jsonrpc: '2.0',
			id: 1,
			result: {},
		});

		assert.strictEqual(await resultPromise, undefined);
	});

	test('collectDebugLogs accepts an archive with a larger uncompressed size', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.collectDebugLogs(URI.parse('copilotcli:/session-1'), 'archive');
		const entrySize = 10 * 1024 * 1024;
		transport.fireMessage({
			jsonrpc: '2.0', id: 1,
			result: {
				kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true,
				size: 1024, uncompressedSize: entrySize * 2,
				entries: [{ path: 'process.log', size: entrySize }, { path: 'events.jsonl', size: entrySize }],
			},
		});

		assert.strictEqual((await resultPromise).uncompressedSize, entrySize * 2);
	});

	test('collectDebugLogs accepts a directory larger than the previous 256 MiB limit', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.collectDebugLogs(URI.parse('copilotcli:/session-1'), 'directory');
		const entrySize = 50 * 1024 * 1024;
		const entries = Array.from({ length: 6 }, (_, index) => ({
			path: index === 0 ? 'agenthost.log' : `agenthost.${index}.log`,
			size: entrySize,
		}));
		transport.fireMessage({
			jsonrpc: '2.0', id: 1,
			result: {
				kind: 'directory', resource: 'file:///tmp/agent-host-debug-logs', providerLogsIncluded: true,
				size: entrySize * entries.length, uncompressedSize: entrySize * entries.length, entries,
			},
		});

		assert.strictEqual((await resultPromise).uncompressedSize, 300 * 1024 * 1024);
	});

	test('collectDebugLogs rejects an unsafe or inconsistent artifact manifest', async () => {
		const unsafe = createClient();
		const unsafeResult = unsafe.client.collectDebugLogs(URI.parse('copilotcli:/session-1'), 'archive');
		unsafe.transport.fireMessage({
			jsonrpc: '2.0', id: 1,
			result: { kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true, size: 10, uncompressedSize: 10, entries: [{ path: '../secret', size: 10 }] },
		});

		const inconsistent = createClient();
		const inconsistentResult = inconsistent.client.collectDebugLogs(URI.parse('copilotcli:/session-1'), 'archive');
		inconsistent.transport.fireMessage({
			jsonrpc: '2.0', id: 1,
			result: { kind: 'archive', resource: 'file:///tmp/agent-host-debug.zip', providerLogsIncluded: true, size: 10, uncompressedSize: 10, entries: [{ path: 'agenthost.log', size: 9 }] },
		});

		assert.deepStrictEqual({
			unsafe: await unsafeResult.then(() => 'resolved', error => error.message),
			inconsistent: await inconsistentResult.then(() => 'resolved', error => error.message),
		}, {
			unsafe: 'Agent Host returned an invalid debug log artifact manifest entry',
			inconsistent: 'Agent Host debug log artifact manifest size does not match its declared size',
		});
	});

	test('collectDebugLogs rejects a non-file host resource', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.collectDebugLogs(URI.parse('copilotcli:/session-1'), 'archive');
		transport.fireMessage({
			jsonrpc: '2.0',
			id: 1,
			result: { kind: 'archive', resource: 'vscode-userdata:/User/settings.json', providerLogsIncluded: true, size: 10, uncompressedSize: 10, entries: [{ path: 'agenthost.log', size: 10 }] },
		});

		await assertRemoteProtocolError(resultPromise, {
			code: JsonRpcErrorCodes.InvalidParams,
			message: 'Agent Host returned a non-file debug log resource: vscode-userdata:/User/settings.json',
		});
	});

	test('ping sends a JSON-RPC request and resolves on response', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.ping();

		const sent = transport.sentMessages[0] as JsonRpcRequest;
		assert.strictEqual(sent.method, 'ping');
		assert.strictEqual(sent.id, 1);

		transport.fireMessage({ jsonrpc: '2.0', id: 1, result: null });

		assert.strictEqual(await resultPromise, undefined);
	});

	test('ping rejects with ProtocolError when the connection closes', async () => {
		const { client, transport } = createClient();
		const resultPromise = client.ping();
		const rejected = assertRemoteProtocolError(resultPromise, { code: -32000, message: 'Connection closed: test.example:1234' });
		transport.fireClose();
		await rejected;
	});

	suite('reverse permission gating', () => {

		test('remote local address does not receive trusted local access', async () => {
			const permissionService = createResourceServiceStub({
				granted: identity => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
			});
			const { client, transport } = createClientForIdentity('local', undefined, permissionService);
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 41, method: 'resourceRead', params: { channel: 'ahp-root://', uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual({
				address: client.address,
				response: transport.sentMessages.pop(),
			}, {
				address: 'local',
				response: {
					jsonrpc: '2.0',
					id: 41,
					error: {
						code: AhpErrorCodes.PermissionDenied,
						message: `Access to ${uri} is not granted.`,
						data: { request: { channel: ROOT_STATE_URI, uri, read: true } },
					},
				},
			});
		});

		test('trusted local identity retains local resource access', async () => {
			const permissionService = createResourceServiceStub({
				granted: identity => identity === LOCAL_AGENT_HOST_RESOURCE_IDENTITY,
				readBytes: VSBuffer.fromString('trusted'),
			});
			const { client, transport } = createClientForIdentity(LOCAL_AGENT_HOST_RESOURCE_IDENTITY, undefined, permissionService);
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 40, method: 'resourceRead', params: { channel: 'ahp-root://', uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual({
				address: client.address,
				response: transport.sentMessages.pop(),
			}, {
				address: 'local',
				response: {
					jsonrpc: '2.0',
					id: 40,
					result: { data: 'dHJ1c3RlZA==', encoding: ContentEncoding.Base64 },
				},
			});
		});

		test('resourceRead is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 42, method: 'resourceRead', params: { channel: 'ahp-root://', uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 42,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { channel: ROOT_STATE_URI, uri, read: true } },
				},
			});
		});

		test('resourceWrite is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 7, method: 'resourceWrite', params: { channel: 'ahp-root://', uri, data: 'aGVsbG8=', encoding: ContentEncoding.Base64 } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 7,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { channel: ROOT_STATE_URI, uri, write: true } },
				},
			});
		});

		test('resourceList is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 5, method: 'resourceList', params: { channel: 'ahp-root://', uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 5,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { channel: ROOT_STATE_URI, uri, read: true } },
				},
			});
		});

		test('resourceDelete is denied with PermissionDeniedErrorData when not granted', async () => {
			const { transport } = createClient(undefined, createPermissionService(false));
			const uri = URI.file('/etc/passwd').toString();

			transport.fireMessage({ jsonrpc: '2.0', id: 8, method: 'resourceDelete', params: { channel: 'ahp-root://', uri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 8,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${uri} is not granted.`,
					data: { request: { channel: ROOT_STATE_URI, uri, write: true } },
				},
			});
		});

		test('resourceMove is denied when destination lacks write access', async () => {
			const sourceUri = URI.file('/grant/foo').toString();
			const destUri = URI.file('/no-grant/bar').toString();
			const stub = createResourceServiceStub({
				granted: (_addr, uri) => uri.toString() === sourceUri,
			});
			const { transport } = createClient(undefined, stub);

			transport.fireMessage({ jsonrpc: '2.0', id: 9, method: 'resourceMove', params: { channel: 'ahp-root://', source: sourceUri, destination: destUri } });
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 9,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: `Access to ${destUri} is not granted.`,
					data: { request: { channel: ROOT_STATE_URI, uri: destUri, write: true } },
				},
			});
		});

		test('reverse resourceRequest delegates to permission service and replies with empty result', async () => {
			let lastRequest: { address: AgentHostResourceIdentity; params: { uri: string; read?: boolean; write?: boolean } } | undefined;
			const stub = createResourceServiceStub({
				granted: () => false,
				onRequest: async (address, params) => { lastRequest = { address, params }; },
			});
			const { transport } = createClient(undefined, stub);

			const uri = URI.file('/etc/foo').toString();
			transport.fireMessage({ jsonrpc: '2.0', id: 11, method: 'resourceRequest', params: { channel: 'ahp-root://', uri, read: true } });

			// Allow the awaited request promise to resolve.
			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(lastRequest, { address: 'test.example:1234', params: { channel: 'ahp-root://', uri, read: true } });
			assert.deepStrictEqual(transport.sentMessages.pop(), { jsonrpc: '2.0', id: 11, result: {} });
		});

		test('reverse resourceRequest replies with PermissionDenied on cancellation', async () => {
			const stub = createResourceServiceStub({
				granted: () => false,
				onRequest: async () => { throw new CancellationError(); },
			});
			const { transport } = createClient(undefined, stub);

			const uri = URI.file('/etc/foo').toString();
			transport.fireMessage({ jsonrpc: '2.0', id: 12, method: 'resourceRequest', params: { channel: 'ahp-root://', uri, read: true } });

			await new Promise(resolve => setTimeout(resolve, 0));

			assert.deepStrictEqual(transport.sentMessages.pop(), {
				jsonrpc: '2.0',
				id: 12,
				error: {
					code: AhpErrorCodes.PermissionDenied,
					message: 'Access to the requested resource is not granted.',
					data: undefined,
				},
			});
		});
	});

	suite('implicit grants for outgoing actions', () => {

		function createCapturingPermissionService(): { service: IAgentHostResourceService; calls: { address: AgentHostResourceIdentity; uri: URI }[] } {
			const calls: { address: AgentHostResourceIdentity; uri: URI }[] = [];
			const service = createResourceServiceStub({
				onGrantImplicitRead: (address, uri) => calls.push({ address, uri }),
			});
			return { service, calls };
		}

		test('SessionActiveClientSet dispatches implicit reads for each customization', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);
			const sessionUri = URI.parse('ahp-session:/test');

			client.dispatch(sessionUri.toString(), {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ type: CustomizationType.Plugin, id: customizationId('file:///plugins/foo'), uri: 'file:///plugins/foo', name: 'Foo', },
						{ type: CustomizationType.Plugin, id: customizationId('file:///other/bar'), uri: 'file:///other/bar', name: 'Bar', },
					]
				},
			});

			assert.deepStrictEqual(
				calls.map(c => ({ address: c.address, uri: c.uri.toString() })),
				[
					{ address: 'test.example:1234', uri: 'file:///plugins' },
					{ address: 'test.example:1234', uri: 'file:///other' },
				],
			);
		});

		test('ChatTurnStarted grants attachment access before reverse resourceRead', async () => {
			const granted = new Set<string>();
			const attachmentUri = URI.file('/attachments/example.txt');
			const service = createResourceServiceStub({
				granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
				onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
				readBytes: VSBuffer.fromString('attachment'),
			});
			const { client, transport } = createClient(undefined, service);
			const action: ChatTurnStartedAction = {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-1',
				startedAt: '2026-07-23T00:00:00.000Z',
				message: {
					text: 'Review this file',
					origin: { kind: MessageKind.User },
					attachments: [{
						type: MessageAttachmentKind.Resource,
						uri: attachmentUri.toString(),
						label: 'example.txt',
					}],
				},
			};

			client.dispatch('copilot-chat:/test', action);
			transport.fireMessage({
				jsonrpc: '2.0',
				id: 42,
				method: 'resourceRead',
				params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() },
			});
			await flushMicrotasks();

			assert.deepStrictEqual(transport.sentMessages.at(-1), {
				jsonrpc: '2.0',
				id: 42,
				result: { data: 'YXR0YWNobWVudA==', encoding: ContentEncoding.Base64 },
			});
		});

		test('ChatPendingMessageSet grants resource attachments only', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);

			client.dispatch('copilot-chat:/test', {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Queued,
				id: 'queued-1',
				message: {
					text: 'Review these attachments',
					origin: { kind: MessageKind.User },
					attachments: [
						{ type: MessageAttachmentKind.Resource, uri: 'file:///attachments/queued.txt', label: 'queued.txt' },
						{ type: MessageAttachmentKind.EmbeddedResource, data: '', contentType: 'text/plain', label: 'inline.txt' },
					],
				},
			});

			assert.deepStrictEqual(calls.map(call => call.uri.toString()), ['file:///attachments/queued.txt']);
		});

		test('multiple customizations in the same directory dedupe to one grant', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);
			const sessionUri = URI.parse('ahp-session:/test');

			client.dispatch(sessionUri.toString(), {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ type: CustomizationType.Plugin, id: customizationId('file:///plugins/foo'), uri: 'file:///plugins/foo', name: 'Foo', },
						{ type: CustomizationType.Plugin, id: customizationId('file:///plugins/bar'), uri: 'file:///plugins/bar', name: 'Bar', },
					]
				},
			});

			assert.deepStrictEqual(
				calls.map(c => c.uri.toString()),
				['file:///plugins'],
			);
		});

		test('repeat dispatch dedupes per URI', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);
			const sessionUri = URI.parse('ahp-session:/test');

			const action: SessionActiveClientSetAction = {
				type: ActionType.SessionActiveClientSet,
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ type: CustomizationType.Plugin, id: customizationId('file:///plugins/foo'), uri: 'file:///plugins/foo', name: 'Foo', },
					]
				},
			};

			client.dispatch(sessionUri.toString(), action);
			client.dispatch(sessionUri.toString(), action);

			assert.strictEqual(calls.length, 1);
		});

		test('connection close disposes implicit read grants', async () => {
			const didGrant = new DeferredPromise<void>();
			const revoked: string[] = [];
			const service = createResourceServiceStub({
				onGrantImplicitRead: () => didGrant.complete(),
				onRevokeImplicitRead: (_address, uri) => revoked.push(uri.toString()),
			});
			const { client, transport } = createClient(undefined, service);

			client.dispatch('copilot-chat:/test', {
				type: ActionType.ChatPendingMessageSet,
				kind: PendingMessageKind.Queued,
				id: 'queued-1',
				message: {
					text: 'Review this attachment',
					origin: { kind: MessageKind.User },
					attachments: [
						{ type: MessageAttachmentKind.Resource, uri: 'file:///attachments/queued.txt', label: 'queued.txt' },
					],
				},
			});
			await didGrant.p;
			transport.fireClose();

			assert.deepStrictEqual(revoked, ['file:///attachments/queued.txt']);
		});

		test('active client removal does not crash', () => {
			const { service, calls } = createCapturingPermissionService();
			const { client } = createClient(undefined, service);
			const sessionUri = URI.parse('ahp-session:/test');

			client.dispatch(sessionUri.toString(), {
				type: ActionType.SessionActiveClientRemoved,
				clientId: 'c1',
			});

			assert.strictEqual(calls.length, 0);
		});

		test('createSession with active-client customizations grants implicit reads', async () => {
			const { service, calls } = createCapturingPermissionService();
			const { client, transport } = createClient(undefined, service);

			void client.createSession({
				provider: 'copilot',
				activeClient: {
					clientId: 'c1',
					tools: [],
					customizations: [
						{ type: CustomizationType.Plugin, id: customizationId('file:///plugins/foo'), uri: 'file:///plugins/foo', name: 'Foo', },
					],
				},
			});

			// Resolve the in-flight createSession request for cleanup.
			const sent = transport.sentMessages.find(
				(m): m is JsonRpcRequest => 'method' in m && m.method === 'createSession');
			assert.ok(sent);
			transport.fireMessage({ jsonrpc: '2.0', id: sent.id, result: null });

			assert.deepStrictEqual(
				calls.map(c => c.uri.toString()),
				['file:///plugins'],
			);
		});
	});

	suite('ordinary working-directory dispatch', () => {

		function workingDirectorySetAction(directory: string) {
			return { type: ActionType.SessionWorkingDirectorySet as const, directory };
		}

		/** Connect `client`, subscribe to `sessionUri`, and answer the `subscribe` request with an empty session snapshot. */
		async function subscribeToSession(client: AgentHostProtocolClient, transport: TestProtocolTransport, sessionUri: URI): Promise<void> {
			client.getSubscription(StateComponents.Session, sessionUri, 'test');
			let subscribeReq: JsonRpcRequest | undefined;
			while (!subscribeReq) {
				subscribeReq = transport.sentMessages.find(
					(m): m is JsonRpcRequest => hasKey(m, { method: true, id: true }) && (m as JsonRpcRequest).method === 'subscribe',
				);
				if (!subscribeReq) {
					await Promise.resolve();
				}
			}
			transport.fireMessage({
				jsonrpc: '2.0', id: subscribeReq.id,
				result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
			});
			await flushMicrotasks();
		}

		function findLastDispatchAction(transport: TestProtocolTransport): JsonRpcNotification {
			const match = [...transport.sentMessages].reverse().find(
				(m): m is JsonRpcNotification => hasKey(m, { method: true }) && (m as JsonRpcNotification).method === 'dispatchAction' && !('id' in m),
			);
			assert.ok(match, 'expected a dispatchAction notification to have been sent');
			return match;
		}

		test('optimistically applies and confirms an accepted action', async () => {
			const { client, transport } = createClient();
			await connectClient(client, transport);
			const sessionUri = URI.parse('copilot:/test-session');
			const sub = client.getSubscription<{ workingDirectories?: readonly string[] }>(StateComponents.Session, sessionUri, 'test');
			await subscribeToSession(client, transport, sessionUri);

			client.dispatch(sessionUri.toString(), workingDirectorySetAction('file:///ws2'));
			const sent = findLastDispatchAction(transport);
			const { clientSeq, action } = sent.params as { clientSeq: number; action: ReturnType<typeof workingDirectorySetAction> };
			assert.deepStrictEqual((sub.object.value as { workingDirectories?: readonly string[] }).workingDirectories, ['file:///ws2']);
			assert.strictEqual(sub.object.verifiedValue?.workingDirectories, undefined);

			transport.fireMessage({
				jsonrpc: '2.0',
				method: 'action',
				params: { channel: sessionUri.toString(), action, serverSeq: 6, origin: { clientId: client.clientId, clientSeq } },
			});

			assert.deepStrictEqual(sub.object.verifiedValue?.workingDirectories, ['file:///ws2']);
			assert.strictEqual(sub.object.value, sub.object.verifiedValue);
			sub.dispose();
		});

		test('rolls optimistic state back when the server rejects an action', async () => {
			const { client, transport } = createClient();
			await connectClient(client, transport);
			const sessionUri = URI.parse('copilot:/test-session');
			const sub = client.getSubscription<{ workingDirectories?: readonly string[] }>(StateComponents.Session, sessionUri, 'test');
			await subscribeToSession(client, transport, sessionUri);

			client.dispatch(sessionUri.toString(), workingDirectorySetAction('file:///ws2'));
			const sent = findLastDispatchAction(transport);
			const { clientSeq, action } = sent.params as { clientSeq: number; action: ReturnType<typeof workingDirectorySetAction> };
			assert.deepStrictEqual((sub.object.value as { workingDirectories?: readonly string[] }).workingDirectories, ['file:///ws2']);

			transport.fireMessage({
				jsonrpc: '2.0',
				method: 'action',
				params: { channel: sessionUri.toString(), action, serverSeq: 6, origin: { clientId: client.clientId, clientSeq }, rejectionReason: 'denied' },
			});

			assert.strictEqual(sub.object.verifiedValue?.workingDirectories, undefined);
			assert.strictEqual((sub.object.value as { workingDirectories?: readonly string[] }).workingDirectories, undefined);
			sub.dispose();
		});
	});

	suite('soft reconnect (transport factory)', () => {

		function findRequest(transport: TestProtocolTransport, method: string): JsonRpcRequest | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcRequest => 'method' in m && (m as JsonRpcRequest).method === method && 'id' in m,
			);
		}

		function findNotification(transport: TestProtocolTransport, method: string): JsonRpcNotification | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcNotification => 'method' in m && (m as JsonRpcNotification).method === method && !('id' in m),
			);
		}

		function findDispatchAction(transport: TestProtocolTransport, actionType: ActionType): JsonRpcNotification | undefined {
			return transport.sentMessages.find(
				(m): m is JsonRpcNotification => 'method' in m
					&& (m as JsonRpcNotification).method === 'dispatchAction'
					&& !('id' in m)
					&& ((m as JsonRpcNotification).params as { action?: { type?: unknown } } | undefined)?.action?.type === actionType,
			);
		}

		/** Wait until the client transitions into the {@link AgentHostClientState.Reconnecting} state. */
		async function waitForReconnecting(client: AgentHostProtocolClient): Promise<void> {
			if (client.connectionState === AgentHostClientState.Reconnecting) {
				return;
			}
			await Event.toPromise(Event.filter(client.onDidChangeConnectionState, s => s === AgentHostClientState.Reconnecting));
		}

		/** Wait for the next time a method-named request appears in the transport's outbox. */
		async function waitForRequest(transport: TestProtocolTransport, method: string): Promise<JsonRpcRequest> {
			while (true) {
				const req = findRequest(transport, method);
				if (req) {
					return req;
				}
				await Promise.resolve();
			}
		}

		async function waitForRequestAt(transport: TestProtocolTransport, method: string, index: number): Promise<JsonRpcRequest> {
			while (true) {
				const requests = transport.sentMessages.filter(
					(message): message is JsonRpcRequest => 'method' in message && message.method === method && 'id' in message,
				);
				if (requests[index]) {
					return requests[index];
				}
				await Promise.resolve();
			}
		}

		/** Wait for the next time the new transport is created by the factory. */
		async function waitForTransport(transports: TestClientProtocolTransport[], index: number): Promise<TestClientProtocolTransport> {
			while (transports.length <= index) {
				await new Promise<void>(r => setTimeout(r, 25));
			}
			return transports[index];
		}

		/**
		 * Build a client wired to a transport factory that hands out fresh
		 * `TestClientProtocolTransport`s on each invocation. Returns the
		 * client plus a `transports` array recording each transport handed
		 * out, so tests can drive handshake/reconnect interactions.
		 */
		function createFactoryClient(permissionService = createPermissionService(), clientInfo?: Implementation, telemetryService: ITelemetryService = NullTelemetryService): { client: AgentHostProtocolClient; transports: TestClientProtocolTransport[] } {
			const transports: TestClientProtocolTransport[] = [];
			const factory = () => {
				const t = disposables.add(new TestClientProtocolTransport());
				transports.push(t);
				return t;
			};
			const client = disposables.add(new AgentHostProtocolClient(
				'test.example:1234', factory, undefined, undefined, clientInfo, new NullLogService(), permissionService, new TestConfigurationService(), telemetryService,
			));
			return { client, transports };
		}

		async function completeHandshake(transport: TestClientProtocolTransport, connectPromise: Promise<void>): Promise<void> {
			transport.connectDeferred.complete();
			while (findRequest(transport, 'initialize') === undefined) {
				await Promise.resolve();
			}
			const init = findRequest(transport, 'initialize')!;
			transport.fireMessage({
				jsonrpc: '2.0', id: init.id,
				result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 5, snapshots: [] },
			});
			await connectPromise;
		}

		test('retries an initial transport failure with a fresh initialization', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient();
			const connectPromise = client.connect();
			transports[0].connectDeferred.error(new Error('initial transport failed'));
			await assert.rejects(connectPromise, /initial transport failed/);
			await waitForReconnecting(client);

			const reconnectTransport = await waitForTransport(transports, 1);
			reconnectTransport.connectDeferred.complete();
			const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: reconnect.id,
				error: { code: AhpErrorCodes.NotFound, message: 'client not found' },
			});
			const initialize = await waitForRequest(reconnectTransport, 'initialize');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: initialize.id,
				result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
			});
			while (client.connectionState !== AgentHostClientState.Connected) {
				await Promise.resolve();
			}

			assert.deepStrictEqual({
				state: client.connectionState,
				transportCount: transports.length,
			}, {
				state: AgentHostClientState.Connected,
				transportCount: 2,
			});
		});

		test('does not retry a non-reconnectable initial transport failure', async () => {
			const { client, transports } = createFactoryClient();
			const fatalErrors: string[] = [];
			disposables.add(client.onDidFatalClose(error => fatalErrors.push(error.message)));
			const connectPromise = client.connect();
			transports[0].connectDeferred.error(new NonReconnectableTransportError('terminal failure'));

			await assert.rejects(connectPromise, /terminal failure/);

			assert.deepStrictEqual({
				state: client.connectionState,
				transportCount: transports.length,
				fatalErrors,
			}, {
				state: AgentHostClientState.Closed,
				transportCount: 1,
				fatalErrors: ['terminal failure'],
			});
		});

		test('surfaces a non-reconnectable failure reached during initial reconnect', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient();
			const fatalError = Event.toPromise(client.onDidFatalClose);
			const connectPromise = client.connect();
			transports[0].connectDeferred.error(new Error('transient failure'));
			await assert.rejects(connectPromise, /transient failure/);

			const reconnectTransport = await waitForTransport(transports, 1);
			reconnectTransport.connectDeferred.error(new NonReconnectableTransportError('terminal failure'));

			assert.deepStrictEqual({
				fatalError: (await fatalError).message,
				state: client.connectionState,
				transportCount: transports.length,
			}, {
				fatalError: 'terminal failure',
				state: AgentHostClientState.Closed,
				transportCount: 2,
			});
		});

		test('can reconnect a terminal connection after an explicit host restart', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient();
			const connectPromise = client.connect();
			transports[0].connectDeferred.error(new NonReconnectableTransportError('terminal failure'));
			await assert.rejects(connectPromise, /terminal failure/);

			assert.strictEqual(client.reconnectFromClosed(), true);
			const reconnectTransport = await waitForTransport(transports, 1);
			reconnectTransport.connectDeferred.complete();
			const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: reconnect.id,
				error: { code: AhpErrorCodes.NotFound, message: 'client not found' },
			});
			const initialize = await waitForRequest(reconnectTransport, 'initialize');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: initialize.id,
				result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
			});
			while (client.connectionState !== AgentHostClientState.Connected) {
				await Promise.resolve();
			}

			assert.deepStrictEqual({
				state: client.connectionState,
				transportCount: transports.length,
			}, {
				state: AgentHostClientState.Connected,
				transportCount: 2,
			});
		});

		test('reuses clientId across transport reconnects', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);
				const originalClientId = client.clientId;

				// Drop the transport; the client should attach a fresh one and
				// reconnect with the same clientId rather than restart from scratch.
				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');

				const params = reconnect.params as { clientId: string; lastSeenServerSeq: number; subscriptions: unknown[] };
				assert.strictEqual(params.clientId, originalClientId);
				assert.strictEqual(params.lastSeenServerSeq, 5);
				assert.ok(Array.isArray(params.subscriptions));

				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				await flushMicrotasks();
				client.dispose();
			});
		});

		test('retries with a fresh initialize when the factory transport closes during initial connect', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient();
			const connectPromise = assert.rejects(client.connect());

			client.notifyTransportClosed();
			await waitForReconnecting(client);
			transports[0].connectDeferred.error(new Error('Initial transport closed'));
			await connectPromise;

			const reconnectTransport = await waitForTransport(transports, 1);
			reconnectTransport.connectDeferred.complete();
			const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: reconnect.id,
				error: { code: AhpErrorCodes.NotFound, message: 'Reconnect client not found' },
			});

			const initialize = await waitForRequest(reconnectTransport, 'initialize');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0',
				id: initialize.id,
				result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
			});
			await flushMicrotasks();

			assert.strictEqual(client.connectionState, AgentHostClientState.Connected);
		});

		test('falls back to initialize with client info when the server forgot the client', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient(createPermissionService(), agentsWindowAgentHostClientInfo, new TestClientIdentityTelemetryService());
			let connectedRequest = Disposable.None;
			try {
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);
				connectedRequest = Event.once(Event.filter(client.onDidChangeConnectionState, state => state === AgentHostClientState.Connected))(() => {
					void client.listSessions().catch(() => { });
				});

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				assert.deepStrictEqual((reconnect.params as { _meta?: Record<string, unknown> })._meta, {
					'vscode.telemetryLevel': 'all',
					'vscode.clientMachineId': 'client-machine-id',
					'vscode.clientDevDeviceId': 'client-dev-device-id',
				});
				reconnectTransport.fireMessage({
					jsonrpc: '2.0',
					id: reconnect.id,
					error: { code: AhpErrorCodes.NotFound, message: 'Reconnect client not found' },
				});

				const initialize = await waitForRequest(reconnectTransport, 'initialize');
				assert.deepStrictEqual({
					clientInfo: (initialize.params as { clientInfo?: Implementation }).clientInfo,
					meta: (initialize.params as { _meta?: Record<string, unknown> })._meta,
				}, {
					clientInfo: agentsWindowAgentHostClientInfo,
					meta: {
						'vscode.telemetryLevel': 'all',
						'vscode.clientMachineId': 'client-machine-id',
						'vscode.clientDevDeviceId': 'client-dev-device-id',
					},
				});
				reconnectTransport.fireMessage({
					jsonrpc: '2.0',
					id: initialize.id,
					result: { protocolVersion: PROTOCOL_VERSION, serverSeq: 0, snapshots: [] },
				});
				await flushMicrotasks();
				const managedSettingsIndex = reconnectTransport.sentMessages.findIndex(message => hasKey(message, { method: true }) && message.method === 'setClientManagedSettingsPermissions');
				const listSessionsIndex = reconnectTransport.sentMessages.findIndex(message => hasKey(message, { method: true }) && message.method === 'listSessions');
				assert.strictEqual(client.connectionState, AgentHostClientState.Connected);
				assert.ok(managedSettingsIndex >= 0 && managedSettingsIndex < listSessionsIndex, 'managed settings must be sent before requests triggered by the connected transition');
			} finally {
				connectedRequest.dispose();
				client.dispose();
			}
		});

		test('restores subscriptions before replaying pending actions when the server forgot the client', async function () {
			this.timeout(10_000);
			const { client, transports } = createFactoryClient();
			const sessionUri = URI.parse('copilot:/test-session');
			const chatUri = URI.parse('ahp-chat://default/test-session');
			const annotationsUri = URI.parse(buildAnnotationsUri(sessionUri.toString()));
			const connectPromise = client.connect();
			await completeHandshake(transports[0], connectPromise);

			const sessionRef = client.getSubscription(StateComponents.Session, sessionUri, 'test');
			const initialSessionSubscribe = await waitForRequestAt(transports[0], 'subscribe', 0);
			transports[0].fireMessage({
				jsonrpc: '2.0', id: initialSessionSubscribe.id,
				result: { snapshot: { resource: sessionUri.toString(), state: { lifecycle: 'ready' }, fromSeq: 5 } },
			});
			const chatRef = client.getSubscription(StateComponents.Chat, chatUri, 'test');
			const initialChatSubscribe = await waitForRequestAt(transports[0], 'subscribe', 1);
			transports[0].fireMessage({
				jsonrpc: '2.0', id: initialChatSubscribe.id,
				result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 5 } },
			});
			const annotationsRef = client.getSubscription(StateComponents.Annotations, annotationsUri, 'test');
			const initialAnnotationsSubscribe = await waitForRequestAt(transports[0], 'subscribe', 2);
			transports[0].fireMessage({
				jsonrpc: '2.0', id: initialAnnotationsSubscribe.id,
				result: { snapshot: { resource: annotationsUri.toString(), state: { annotations: [] }, fromSeq: 5 } },
			});
			const authentication = client.authenticate({ resource: 'https://api.github.com', token: 'token' });
			const initialAuthenticate = await waitForRequest(transports[0], 'authenticate');
			transports[0].fireMessage({ jsonrpc: '2.0', id: initialAuthenticate.id, result: {} });
			await authentication;
			await flushMicrotasks();

			client.dispatch(chatUri.toString(), {
				type: ActionType.ChatTurnStarted,
				turnId: 'turn-after-restart',
				startedAt: '2026-08-09T00:00:00.000Z',
				message: { text: 'Continue', origin: { kind: MessageKind.User } },
			});
			const initialDispatch = findDispatchAction(transports[0], ActionType.ChatTurnStarted);
			assert.ok(initialDispatch);
			client.dispatch(annotationsUri.toString(), {
				type: ActionType.AnnotationsSet,
				annotation: {
					id: 'feedback-1',
					origin: { session: sessionUri.toString(), turnId: 'turn-after-restart' },
					resource: 'file:///reviewed.ts',
					resolved: false,
					entries: [{ id: 'feedback-1:0', text: 'Please revisit this.' }],
				},
			});
			assert.ok(findDispatchAction(transports[0], ActionType.AnnotationsSet));

			transports[0].fireClose();
			await waitForReconnecting(client);
			const reconnectTransport = await waitForTransport(transports, 1);
			reconnectTransport.connectDeferred.complete();
			const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0', id: reconnect.id,
				error: { code: AhpErrorCodes.NotFound, message: 'Reconnect client not found' },
			});
			const initialize = await waitForRequest(reconnectTransport, 'initialize');
			reconnectTransport.fireMessage({
				jsonrpc: '2.0', id: initialize.id,
				result: {
					protocolVersion: PROTOCOL_VERSION,
					serverSeq: 0,
					snapshots: [{ resource: ROOT_STATE_URI, state: { agents: [], activeSessions: 0 }, fromSeq: 0 }],
				},
			});

			const restoredAuthenticate = await waitForRequestAt(reconnectTransport, 'authenticate', 0);
			const managedSettings = reconnectTransport.sentMessages.find(message => hasKey(message, { method: true }) && message.method === 'setClientManagedSettingsPermissions');
			assert.ok(managedSettings, 'managed settings should be restored after fresh initialization');
			assert.ok(
				reconnectTransport.sentMessages.indexOf(managedSettings) < reconnectTransport.sentMessages.indexOf(restoredAuthenticate),
				'managed settings should be restored before authentication and subscriptions',
			);
			reconnectTransport.fireMessage({ jsonrpc: '2.0', id: restoredAuthenticate.id, result: {} });
			const restoredSessionSubscribe = await waitForRequestAt(reconnectTransport, 'subscribe', 0);
			assert.strictEqual((restoredSessionSubscribe.params as { channel: string }).channel, sessionUri.toString());
			reconnectTransport.fireMessage({
				jsonrpc: '2.0', id: restoredSessionSubscribe.id,
				result: { snapshot: { resource: sessionUri.toString(), state: { lifecycle: 'ready' }, fromSeq: 1 } },
			});
			const restoredChatSubscribe = await waitForRequestAt(reconnectTransport, 'subscribe', 1);
			assert.strictEqual((restoredChatSubscribe.params as { channel: string }).channel, chatUri.toString());
			reconnectTransport.fireMessage({
				jsonrpc: '2.0', id: restoredChatSubscribe.id,
				result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 2 } },
			});
			const restoredAnnotationsSubscribe = await waitForRequestAt(reconnectTransport, 'subscribe', 2);
			assert.strictEqual((restoredAnnotationsSubscribe.params as { channel: string }).channel, annotationsUri.toString());
			reconnectTransport.fireMessage({
				jsonrpc: '2.0', id: restoredAnnotationsSubscribe.id,
				result: { snapshot: { resource: annotationsUri.toString(), state: { annotations: [] }, fromSeq: 2 } },
			});
			await flushMicrotasks();

			const replayed = findDispatchAction(reconnectTransport, ActionType.ChatTurnStarted);
			assert.ok(replayed, 'pending turn should replay after the session and chat are restored');
			assert.ok(
				reconnectTransport.sentMessages.indexOf(replayed) > reconnectTransport.sentMessages.indexOf(restoredChatSubscribe),
				'pending turn should be sent after subscription restoration',
			);
			const replayedAnnotation = findDispatchAction(reconnectTransport, ActionType.AnnotationsSet);
			assert.ok(replayedAnnotation, 'pending annotation should replay after its subscription is restored');
			assert.ok(
				reconnectTransport.sentMessages.indexOf(replayedAnnotation) > reconnectTransport.sentMessages.indexOf(restoredAnnotationsSubscribe),
				'pending annotation should be sent after subscription restoration',
			);

			annotationsRef.dispose();
			chatRef.dispose();
			sessionRef.dispose();
			client.dispose();
		});

		test('replays pending optimistic actions after reconnect', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Establish a session subscription so dispatch() can apply optimistically.
				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				// Dispatch an optimistic action right before the transport drops.
				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					title: 'Renamed by user',
				};
				client.dispatch(sessionUri.toString(), action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged);
				assert.ok(initialDispatch, 'optimistic dispatch should reach the original transport');
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				// Drop the transport mid-flight. The new transport receives a
				// reconnect RPC plus a replay of the unconfirmed dispatch.
				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				const replayed = findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged);
				assert.ok(replayed, 'pending optimistic action should be re-sent after reconnect');
				assert.strictEqual((replayed.params as { clientSeq: number }).clientSeq, initialSeq, 'replayed dispatch must reuse the original clientSeq');

				subRef.dispose();
				client.dispose();
			});
		});

		test('attachment grant remains available when a pending turn is replayed after reconnect', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const attachmentUri = URI.file('/attachments/replayed.txt');
				const granted = new Set<string>();
				const permissionService = createResourceServiceStub({
					granted: (_address, uri, mode) => mode === AgentHostPermissionMode.Read && granted.has(uri.toString()),
					onGrantImplicitRead: (_address, uri) => granted.add(uri.toString()),
					readBytes: VSBuffer.fromString('replayed'),
				});
				const { client, transports } = createFactoryClient(permissionService);
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const chatUri = URI.parse('copilot-chat:/test-chat');
				const subRef = client.getSubscription(StateComponents.Chat, chatUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: chatUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				client.dispatch(chatUri.toString(), {
					type: ActionType.ChatTurnStarted,
					turnId: 'turn-1',
					startedAt: '2026-07-23T00:00:00.000Z',
					message: {
						text: 'Review this file',
						origin: { kind: MessageKind.User },
						attachments: [{
							type: MessageAttachmentKind.Resource,
							uri: attachmentUri.toString(),
							label: 'replayed.txt',
						}],
					},
				});

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				assert.ok(findDispatchAction(reconnectTransport, ActionType.ChatTurnStarted));
				reconnectTransport.fireMessage({
					jsonrpc: '2.0',
					id: 42,
					method: 'resourceRead',
					params: { channel: ROOT_STATE_URI, uri: attachmentUri.toString() },
				});
				await flushMicrotasks();
				assert.deepStrictEqual(reconnectTransport.sentMessages.at(-1), {
					jsonrpc: '2.0',
					id: 42,
					result: { data: 'cmVwbGF5ZWQ=', encoding: ContentEncoding.Base64 },
				});

				subRef.dispose();
				client.dispose();
			});
		});

		test('skips replay when server already echoed the action in the replay buffer', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					title: 'Echoed back',
				};
				client.dispatch(sessionUri.toString(), action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged)!;
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Reply with a replay buffer that already contains our action,
				// echoed back with origin = { clientId, clientSeq }.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Replay,
						actions: [{
							channel: sessionUri.toString(),
							action,
							serverSeq: 6,
							origin: { clientId: client.clientId, clientSeq: initialSeq },
							rejectionReason: undefined,
						}],
						missing: [],
					},
				});
				await flushMicrotasks();

				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged), undefined,
					'action echoed back via replay buffer must not be re-sent');

				subRef.dispose();
				client.dispose();
			});
		});

		test('outgoing requests wait for reconnect to complete', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Drop the transport, then issue a new request while the
				// soft-reconnect is in flight. The request must land on the new
				// transport rather than racing the dead one or being dropped.
				transports[0].fireClose();
				const inFlight = client.resourceList(URI.file('/workspace')).catch(err => err);

				// Hold off the new transport's connect() so the request stays gated.
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				assert.strictEqual(findRequest(reconnectTransport, 'resourceList'), undefined,
					'request must NOT be sent before reconnect completes');

				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const resourceList = await waitForRequest(reconnectTransport, 'resourceList');
				reconnectTransport.fireMessage({ jsonrpc: '2.0', id: resourceList.id, result: { entries: [] } });

				const value = await inFlight;
				assert.deepStrictEqual(value, { entries: [] });
				client.dispose();
			});
		});

		test('rejected action echoed in replay buffer is not applied to confirmed state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription<{ summary: { title: string } }>(StateComponents.Session, sessionUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { summary: { title: 'Original' }, turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				const action: SessionTitleChangedAction = {
					type: ActionType.SessionTitleChanged,
					title: 'Rejected change',
				};
				client.dispatch(sessionUri.toString(), action);
				const initialDispatch = findDispatchAction(transports[0], ActionType.SessionTitleChanged)!;
				const initialSeq = (initialDispatch.params as { clientSeq: number }).clientSeq;

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Server echoes back the action with a rejectionReason — the
				// confirmed state must NOT advance to 'Rejected change'.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Replay,
						actions: [{
							channel: sessionUri.toString(),
							action,
							serverSeq: 6,
							origin: { clientId: client.clientId, clientSeq: initialSeq },
							rejectionReason: 'unauthorized',
						}],
						missing: [],
					},
				});
				await flushMicrotasks();

				const sessionState = subRef.object.verifiedValue;
				assert.ok(sessionState, 'session state should be hydrated');
				assert.strictEqual(sessionState.summary.title, 'Original',
					'rejected action must not have been applied to confirmed state');
				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionTitleChanged), undefined,
					'rejected action must not be re-dispatched');

				subRef.dispose();
				client.dispose();
			});
		});

		test('snapshot reconnect result reseats the root state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Snapshot,
						snapshots: [{
							resource: ROOT_STATE_URI,
							state: { agents: [{ provider: 'copilot', displayName: 'Copilot', models: [], tools: [] }], activeSessions: 0, terminals: [] },
							fromSeq: 42,
						}],
					},
				});
				await flushMicrotasks();

				const root = client.rootState.value;
				assert.ok(root && !(root instanceof Error), 'root state should be hydrated from snapshot');
				assert.strictEqual(root.agents[0]?.provider, 'copilot');
				client.dispose();
			});
		});

		test('reconnect snapshot replaces pending optimistic working-directory state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await flushMicrotasks();

				client.dispatch(sessionUri.toString(), {
					type: ActionType.SessionWorkingDirectorySet,
					directory: 'file:///ws2',
				});
				assert.deepStrictEqual((subRef.object.value as { workingDirectories?: string[] }).workingDirectories, ['file:///ws2']);

				// Drop the transport before the server ever echoes the action back.
				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Server reports the replay buffer no longer covers our gap, so it
				// sends a fresh snapshot instead — rebasing confirmed state before
				// the dispatched action's echo ever arrived.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: {
						type: ReconnectResultType.Snapshot,
						snapshots: [{ resource: sessionUri.toString(), state: { turns: [], workingDirectories: ['file:///fresh'] }, fromSeq: 9 }],
					},
				});
				await flushMicrotasks();

				assert.deepStrictEqual((subRef.object.value as { workingDirectories?: string[] }).workingDirectories, ['file:///fresh']);
				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionWorkingDirectorySet), undefined,
					'action cleared by a fresh snapshot must not be replayed');

				subRef.dispose();
				client.dispose();
			});
		});

		test('reconnect missing result clears pending optimistic working-directory state', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				const sessionUri = URI.parse('copilot:/test-session');
				const subRef = client.getSubscription(StateComponents.Session, sessionUri, 'test');
				const subscribeReq = await waitForRequest(transports[0], 'subscribe');
				transports[0].fireMessage({
					jsonrpc: '2.0', id: subscribeReq.id,
					result: { snapshot: { resource: sessionUri.toString(), state: { turns: [] }, fromSeq: 5 } },
				});
				await Promise.resolve();

				client.dispatch(sessionUri.toString(), {
					type: ActionType.SessionWorkingDirectorySet,
					directory: 'file:///ws2',
				});

				transports[0].fireClose();
				await waitForReconnecting(client);
				const reconnectTransport = await waitForTransport(transports, 1);
				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				// Server replays with no actions but reports our session
				// subscription as no-longer-resumable.
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [sessionUri.toString()] },
				});
				await flushMicrotasks();

				assert.ok(subRef.object.value instanceof Error);
				assert.strictEqual(findDispatchAction(reconnectTransport, ActionType.SessionWorkingDirectorySet), undefined,
					'action for a missing subscription must not be replayed');

				subRef.dispose();
				client.dispose();
			});
		});

		test('transport drop during reconnect RPC re-schedules instead of hanging', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.complete();
				await waitForRequest(attempt1, 'reconnect');

				// Second drop mid-handshake. The attempt's pending RPC must be rejected
				// so the retry path fires; without that the await stays pending and
				// every subsequent request deadlocks on the reconnect gate.
				attempt1.fireClose();

				const attempt2 = await waitForTransport(transports, 2);
				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				assert.strictEqual(client.connectionState, AgentHostClientState.Connected,
					'client must recover to Connected after a mid-reconnect drop');
				client.dispose();
			});
		});

		test('non-session dispatch issued during reconnect rides retries until success', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Drop transport before any successful reconnect so the gate stays
				// engaged across the failed attempt.
				transports[0].fireClose();
				await waitForReconnecting(client);

				// A terminal action dispatched while reconnecting. There is no
				// optimistic replay path for terminal/root actions; the only way
				// these reach the server is via the notification gate.
				const terminalUri = URI.parse('agenthost-terminal:/term-1');
				client.dispatch(terminalUri.toString(), {
					type: ActionType.TerminalInput,
					data: 'echo hello\n',
				});

				// First attempt fails. The notification must NOT be dropped; the
				// rejection handler should re-queue it onto the new gate.
				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.error(new Error('connect failed'));

				const attempt2 = await waitForTransport(transports, 2);
				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});
				await flushMicrotasks();

				const dispatched = findNotification(attempt2, 'dispatchAction');
				assert.ok(dispatched, 'terminal dispatch must ride the failed attempt through to the next successful one');
				client.dispose();
			});
		});

		test('request issued during reconnect rides retries until success', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);

				// Issue a request while the gate is engaged. The first reconnect
				// attempt will fail; the request must NOT surface the transient
				// failure to its caller, it should stay gated until the next
				// successful handshake.
				const inFlight = client.resourceList(URI.file('/workspace')).catch(err => err);

				const attempt1 = await waitForTransport(transports, 1);
				attempt1.connectDeferred.error(new Error('connect failed'));

				const attempt2 = await waitForTransport(transports, 2);
				assert.strictEqual(findRequest(attempt2, 'resourceList'), undefined,
					'request must not slip through to the new transport before its handshake completes');

				attempt2.connectDeferred.complete();
				const reconnect2 = await waitForRequest(attempt2, 'reconnect');
				attempt2.fireMessage({
					jsonrpc: '2.0', id: reconnect2.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const resourceList = await waitForRequest(attempt2, 'resourceList');
				attempt2.fireMessage({ jsonrpc: '2.0', id: resourceList.id, result: { entries: [] } });

				const value = await inFlight;
				assert.deepStrictEqual(value, { entries: [] },
					'request must resolve once a later reconnect attempt succeeds');
				client.dispose();
			});
		});

		test('_sendExtensionRequest waits for the reconnect gate', async function () {
			this.timeout(10_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				transports[0].fireClose();
				await waitForReconnecting(client);
				const shutdown = client.shutdown().catch(err => err);

				const reconnectTransport = await waitForTransport(transports, 1);
				// Extension requests must not race the dead transport — nothing
				// should be on the wire yet.
				assert.strictEqual(findRequest(reconnectTransport, 'shutdown'), undefined,
					'shutdown extension request must NOT be sent before reconnect completes');

				reconnectTransport.connectDeferred.complete();
				const reconnect = await waitForRequest(reconnectTransport, 'reconnect');
				reconnectTransport.fireMessage({
					jsonrpc: '2.0', id: reconnect.id,
					result: { type: ReconnectResultType.Replay, actions: [], missing: [] },
				});

				const shutdownReq = await waitForRequest(reconnectTransport, 'shutdown');
				reconnectTransport.fireMessage({ jsonrpc: '2.0', id: shutdownReq.id, result: null });
				await shutdown;
				client.dispose();
			});
		});

		test('watchdog dead-transport detection triggers soft reconnect', async function () {
			this.timeout(60_000);
			return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 10_000 }, async () => {
				const { client, transports } = createFactoryClient();
				const connectPromise = client.connect();
				await completeHandshake(transports[0], connectPromise);

				// Issue a request the server never answers. After WATCHDOG_TIMEOUT_MS
				// of silence the watchdog must route through the soft-reconnect
				// path — *not* rely on the transport's onClose firing (it never
				// will for a silent dead socket, see WebSocketClientTransport.dispose).
				const pending = client.resourceList(URI.file('/workspace')).catch(err => err);
				await timeout(30_000);

				assert.strictEqual(client.connectionState, AgentHostClientState.Reconnecting,
					'watchdog must drive the client into Reconnecting via soft reconnect rather than firing onDidClose');

				const err = await pending;
				assert.ok(err instanceof ProtocolError);
				assert.match((err as ProtocolError).message, /Connection appears dead/);
			});
		});
	});
});
