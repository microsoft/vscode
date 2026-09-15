/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostRemoteTargetStatus, AgentHostRemoteTargetUnavailableError, type IAgentHostRemoteTargetConnector } from '../../common/agentHostRemoteAgents.js';
import { AgentHostProtocolClientCore } from '../../common/agentHostProtocolClient.js';
import { AgentHostRemoteAgentsEnabledConfigKey } from '../../common/agentHostSchema.js';
import { ReconnectResultType } from '../../common/state/protocol/commands.js';
import type { RootState } from '../../common/state/protocol/channels-root/state.js';
import { PROTOCOL_VERSION } from '../../common/state/protocol/version/registry.js';
import { ROOT_STATE_URI } from '../../common/state/sessionState.js';
import type { InitializeResult, JsonRpcRequest, ProtocolMessage } from '../../common/state/sessionProtocol.js';
import type { IClientTransport, IProtocolTransport } from '../../common/state/sessionTransport.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostManagedSettingsService } from '../../node/agentHostManagedSettingsService.js';
import { AgentHostRemoteAgentsService } from '../../node/agentHostRemoteAgentsService.js';
import { AgentHostRemoteTargetRegistry } from '../../node/agentHostRemoteTargetRegistry.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService, type IAgentHostStorageWriter } from '../../node/agentHostStorageService.js';
import { WebSocketProtocolServer } from '../../node/webSocketTransport.js';
import { remoteTarget as target, TestAgentHostRemoteTargetConnector as TestTargetConnector } from './agentHostRemoteTargetsTestUtils.js';
import { NodeWebSocketClientTransport } from './nodeWebSocketClientTransport.js';

class ScriptedTargetTransport extends Disposable implements IProtocolTransport {
	protected readonly _onMessage = this._register(new Emitter<ProtocolMessage>());
	readonly onMessage = this._onMessage.event;

	private readonly _onClose = this._register(new Emitter<void>());
	readonly onClose = this._onClose.event;

	readonly initializeRequest = new DeferredPromise<JsonRpcRequest>();

	send(message: Parameters<IProtocolTransport['send']>[0]): void {
		if (hasKey(message, { method: true, id: true }) && message.method === 'initialize') {
			this.initializeRequest.complete(message);
		}
	}

	initialize(rootState?: RootState): void {
		void this.initializeRequest.p.then(request => this._onMessage.fire({
			jsonrpc: '2.0',
			id: request.id,
			result: {
				protocolVersion: PROTOCOL_VERSION,
				serverSeq: 0,
				snapshots: rootState ? [{ resource: ROOT_STATE_URI, state: rootState, fromSeq: 0 }] : [],
			} satisfies InitializeResult,
		}));
	}

	close(): void {
		this._onClose.fire();
	}

	protected respond(request: JsonRpcRequest, result: object): void {
		this._onMessage.fire({ jsonrpc: '2.0', id: request.id, result });
	}
}

class ScriptedTargetClientTransport extends ScriptedTargetTransport implements IClientTransport {
	readonly reconnectRequest = new DeferredPromise<JsonRpcRequest>();

	connect(): Promise<void> {
		return Promise.resolve();
	}

	override send(message: Parameters<IProtocolTransport['send']>[0]): void {
		super.send(message);
		if (hasKey(message, { method: true, id: true }) && message.method === 'reconnect') {
			this.reconnectRequest.complete(message);
		}
	}

	completeReconnect(): void {
		void this.reconnectRequest.p.then(request => this.respond(request, {
			type: ReconnectResultType.Replay,
			actions: [],
			missing: [],
		}));
	}
}

class TrackingProtocolClient extends AgentHostProtocolClientCore {
	disposeCount = 0;

	override dispose(): void {
		this.disposeCount++;
		super.dispose();
	}
}

suite('AgentHostRemoteTargets', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const catalog: RootState = {
		agents: [{
			provider: 'copilot',
			displayName: 'Copilot',
			description: 'Remote Copilot',
			models: [{ id: 'gpt-test', provider: 'copilot', name: 'GPT Test' }],
		}],
	};

	function createRuntime(storageService = disposables.add(new AgentHostStorageService(undefined, new NullLogService()))) {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const managedSettingsService = disposables.add(new AgentHostManagedSettingsService());
		const service = disposables.add(new AgentHostRemoteAgentsService(configurationService, managedSettingsService, storageService, logService));
		disposables.add(service.activate());
		return { configurationService, managedSettingsService, service, storageService };
	}

	function contribute(service: AgentHostRemoteAgentsService, connector: IAgentHostRemoteTargetConnector) {
		return disposables.add(service.registerContribution({
			activate: context => {
				context.registerTargetConnector(connector);
				return Disposable.None;
			},
		}));
	}

	function enable(configurationService: AgentConfigurationService, managedSettingsService: AgentHostManagedSettingsService): void {
		managedSettingsService.setClientRemoteAgentHostsEnabled('test-client', true);
		configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
	}

	async function waitFor(predicate: () => boolean): Promise<void> {
		const deadline = Date.now() + 5000;
		while (Date.now() < deadline) {
			if (predicate()) {
				return;
			}
			await new Promise(resolve => setTimeout(resolve, 5));
		}
		throw new Error('Timed out waiting for remote target state');
	}

	function client(clientId: string, transport: ScriptedTargetTransport): TrackingProtocolClient {
		return new TrackingProtocolClient('scripted-target', transport, { clientId }, new NullLogService());
	}

	test('publishes an admitted handle before exposing its initialized catalogue connection', async () => {
		const runtime = createRuntime();
		const transport = disposables.add(new ScriptedTargetTransport());
		const connector = new TestTargetConnector('fixed', async (_target, options) => client(options.clientId, transport));
		contribute(runtime.service, connector);
		connector.setTargets([target('account-a:target-1', 'fixed:target-1', 'Target One')]);
		enable(runtime.configurationService, runtime.managedSettingsService);

		await waitFor(() => runtime.service.targets.get().length === 1 && connector.createCalls.length === 1);
		const handle = runtime.service.targets.get()[0];
		const beforeInitialize = {
			connectorId: handle.connectorId,
			targetId: handle.targetId,
			label: handle.label.get(),
			status: handle.status.get(),
			connection: handle.connection.get(),
			clientId: handle.clientId,
			requestClientId: (await transport.initializeRequest.p).params,
		};

		transport.initialize(catalog);
		await waitFor(() => handle.connection.get() !== undefined);
		const connection = handle.requireConnection();
		const rootState = connection.rootState.value;
		if (!rootState || rootState instanceof Error) {
			throw new Error('Expected initialized root state');
		}

		assert.deepStrictEqual({
			beforeInitialize: {
				...beforeInitialize,
				requestClientId: (beforeInitialize.requestClientId as { clientId: string }).clientId,
			},
			afterInitialize: {
				sameHandle: runtime.service.targets.get()[0] === handle,
				status: handle.status.get(),
				connectionClientId: connection.clientId,
				agents: rootState.agents,
			},
		}, {
			beforeInitialize: {
				connectorId: 'fixed',
				targetId: 'fixed:target-1',
				label: 'Target One',
				status: AgentHostRemoteTargetStatus.Connecting,
				connection: undefined,
				clientId: handle.clientId,
				requestClientId: handle.clientId,
			},
			afterInitialize: {
				sameHandle: true,
				status: AgentHostRemoteTargetStatus.Connected,
				connectionClientId: handle.clientId,
				agents: catalog.agents,
			},
		});
	});

	test('uses internal identity for ownership while labels remain mutable metadata', async () => {
		const runtime = createRuntime();
		const transports: ScriptedTargetTransport[] = [];
		const connector = new TestTargetConnector('tunnel', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transports.push(transport);
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('github:account-a:tunnel-1', 'tunnel:tunnel-1', 'Old Label')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);

		const handle = runtime.service.targets.get()[0];
		connector.setTargets([target('github:account-a:tunnel-1', 'tunnel:tunnel-1', 'New Label')]);
		await waitFor(() => handle.label.get() === 'New Label');

		assert.deepStrictEqual({
			sameHandle: runtime.service.targets.get()[0] === handle,
			targetId: handle.targetId,
			label: handle.label.get(),
			createCount: connector.createCalls.length,
		}, {
			sameHandle: true,
			targetId: 'tunnel:tunnel-1',
			label: 'New Label',
			createCount: 1,
		});
	});

	test('publishes connector target reordering without recreating handles', async () => {
		const runtime = createRuntime();
		const connector = new TestTargetConnector('ordered', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		const first = target('first', 'ordered:first', 'First');
		const second = target('second', 'ordered:second', 'Second');
		connector.setTargets([first, second]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get().length === 2);
		const originalHandles = runtime.service.targets.get();

		connector.setTargets([second, first]);
		await waitFor(() => runtime.service.targets.get()[0] === originalHandles[1]);

		assert.deepStrictEqual({
			sameHandles: runtime.service.targets.get().every(handle => originalHandles.includes(handle)),
			targetOrder: runtime.service.targets.get().map(handle => handle.targetId),
			createCount: connector.createCalls.length,
		}, {
			sameHandles: true,
			targetOrder: ['ordered:second', 'ordered:first'],
			createCount: 2,
		});
	});

	test('persists a distinct client identity per connector and internal target key', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-host-remote-targets-'));
		disposables.add(toDisposable(() => fs.rmSync(directory, { recursive: true, force: true })));
		const storageResource = URI.file(join(directory, 'storage.json'));
		const firstStorageService = disposables.add(new AgentHostStorageService(storageResource, new NullLogService()));
		const firstRuntime = createRuntime(firstStorageService);
		const firstConnector = new TestTargetConnector('tunnel', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(firstRuntime.service, firstConnector);
		firstConnector.setTargets([
			target('github:account-a:tunnel-1', 'tunnel:tunnel-1', 'One'),
			target('github:account-a:tunnel-2', 'tunnel:tunnel-2', 'Two'),
		]);
		enable(firstRuntime.configurationService, firstRuntime.managedSettingsService);
		await waitFor(() => firstRuntime.service.targets.get().length === 2);
		const firstIds = firstRuntime.service.targets.get().map(handle => handle.clientId);
		await firstStorageService.whenIdle();
		firstRuntime.service.dispose();
		firstStorageService.dispose();

		const secondStorageService = disposables.add(new AgentHostStorageService(storageResource, new NullLogService()));
		const secondRuntime = createRuntime(secondStorageService);
		const secondConnector = new TestTargetConnector('tunnel', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(secondRuntime.service, secondConnector);
		secondConnector.setTargets([
			target('github:account-a:tunnel-1', 'tunnel:tunnel-1', 'One'),
			target('github:account-a:tunnel-2', 'tunnel:tunnel-2', 'Two'),
		]);
		enable(secondRuntime.configurationService, secondRuntime.managedSettingsService);
		await waitFor(() => secondRuntime.service.targets.get().length === 2);

		assert.deepStrictEqual({
			distinct: new Set(firstIds).size,
			firstIds,
			secondIds: secondRuntime.service.targets.get().map(handle => handle.clientId),
		}, {
			distinct: 2,
			firstIds,
			secondIds: firstIds,
		});
	});

	test('disposes target handles on master disable and restores them once without changing client identity', async () => {
		const runtime = createRuntime();
		const connector = new TestTargetConnector('fixed', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('fixed-internal', 'fixed:target', 'Fixed')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const firstHandle = runtime.service.targets.get()[0];
		let firstDisposed = false;
		disposables.add(firstHandle.onDidDispose(() => firstDisposed = true));

		runtime.configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: false });
		await waitFor(() => runtime.service.targets.get().length === 0);
		runtime.configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);

		assert.deepStrictEqual({
			firstDisposed,
			handleChanged: runtime.service.targets.get()[0] !== firstHandle,
			clientId: runtime.service.targets.get()[0].clientId,
			createCount: connector.createCalls.length,
			targetCount: runtime.service.targets.get().length,
		}, {
			firstDisposed: true,
			handleChanged: true,
			clientId: firstHandle.clientId,
			createCount: 2,
			targetCount: 1,
		});
	});

	test('removes only the disposed connector kind and disposes its handles', async () => {
		const runtime = createRuntime();
		const createConnector = (connectorId: string) => new TestTargetConnector(connectorId, async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		const first = createConnector('first-kind');
		const second = createConnector('second-kind');
		const firstContribution = contribute(runtime.service, first);
		contribute(runtime.service, second);
		first.setTargets([target('first-internal', 'first:target', 'First')]);
		second.setTargets([target('second-internal', 'second:target', 'Second')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get().length === 2);
		const firstHandle = runtime.service.targets.get().find(handle => handle.connectorId === 'first-kind')!;
		let firstDisposed = false;
		disposables.add(firstHandle.onDidDispose(() => firstDisposed = true));

		firstContribution.dispose();
		await waitFor(() => runtime.service.targets.get().length === 1);

		assert.deepStrictEqual({
			firstDisposed,
			remaining: runtime.service.targets.get().map(handle => `${handle.connectorId}/${handle.targetId}`),
		}, {
			firstDisposed: true,
			remaining: ['second-kind/second:target'],
		});
	});

	test('disposes a connection that resolves after its target was removed', async () => {
		const runtime = createRuntime();
		const pendingClient = new DeferredPromise<TrackingProtocolClient>();
		const connector = new TestTargetConnector('slow', () => pendingClient.p);
		contribute(runtime.service, connector);
		connector.setTargets([target('slow-internal', 'slow:target', 'Slow')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get().length === 1 && connector.createCalls.length === 1);
		const handle = runtime.service.targets.get()[0];
		let disposed = false;
		disposables.add(handle.onDidDispose(() => disposed = true));

		connector.setTargets([]);
		await waitFor(() => runtime.service.targets.get().length === 0);
		const lateClient = client(connector.createCalls[0].options.clientId, disposables.add(new ScriptedTargetTransport()));
		pendingClient.complete(lateClient);
		await waitFor(() => lateClient.disposeCount === 1);

		assert.deepStrictEqual({
			handleDisposed: disposed,
			clientDisposed: lateClient.disposeCount,
			targetCount: runtime.service.targets.get().length,
		}, {
			handleDisposed: true,
			clientDisposed: 1,
			targetCount: 0,
		});
	});

	test('publishes an unavailable handle when a connector throws synchronously', async () => {
		const runtime = createRuntime();
		const connector = new TestTargetConnector('sync-throw', () => {
			throw new Error('Synchronous connection failure');
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('sync-throw-internal', 'sync-throw:target', 'Sync Throw')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Unavailable);

		const handle = runtime.service.targets.get()[0];
		assert.deepStrictEqual({
			targetId: handle.targetId,
			status: handle.status.get(),
			connection: handle.connection.get(),
			createCount: connector.createCalls.length,
		}, {
			targetId: 'sync-throw:target',
			status: AgentHostRemoteTargetStatus.Unavailable,
			connection: undefined,
			createCount: 1,
		});
	});

	test('does not dial until a new client identity is durably persisted', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-host-remote-target-write-failure-'));
		disposables.add(toDisposable(() => fs.rmSync(directory, { recursive: true, force: true })));
		const storageResource = URI.file(join(directory, 'storage.json'));
		const failingWriter: IAgentHostStorageWriter = {
			async mkdir() { },
			async writeFile() { throw new Error('Storage write failed'); },
		};
		const failingStorage = disposables.add(new AgentHostStorageService(storageResource, new NullLogService(), failingWriter));
		const firstRuntime = createRuntime(failingStorage);
		const connector = new TestTargetConnector('durable-id', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(firstRuntime.service, connector);
		connector.setTargets([target('durable-id-internal', 'durable-id:target', 'Durable ID')]);
		enable(firstRuntime.configurationService, firstRuntime.managedSettingsService);
		await waitFor(() => firstRuntime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Unavailable);
		const failedClientId = firstRuntime.service.targets.get()[0].clientId;

		firstRuntime.service.dispose();
		failingStorage.dispose();
		const restartedStorage = disposables.add(new AgentHostStorageService(storageResource, new NullLogService()));
		const restartedRuntime = createRuntime(restartedStorage);
		const restartedConnector = new TestTargetConnector('durable-id', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(restartedRuntime.service, restartedConnector);
		restartedConnector.setTargets([target('durable-id-internal', 'durable-id:target', 'Durable ID')]);
		enable(restartedRuntime.configurationService, restartedRuntime.managedSettingsService);
		await waitFor(() => restartedRuntime.service.targets.get().length === 1);

		assert.deepStrictEqual({
			failedCreateCount: connector.createCalls.length,
			restartedWithNewIdentity: restartedRuntime.service.targets.get()[0].clientId !== failedClientId,
		}, {
			failedCreateCount: 0,
			restartedWithNewIdentity: true,
		});
	});

	test('does not create a connection after disable while identity persistence is pending', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-host-remote-target-pending-write-'));
		disposables.add(toDisposable(() => fs.rmSync(directory, { recursive: true, force: true })));
		const writeStarted = new DeferredPromise<void>();
		const allowWrite = new DeferredPromise<void>();
		const writer: IAgentHostStorageWriter = {
			async mkdir() { },
			async writeFile() {
				writeStarted.complete();
				await allowWrite.p;
			},
		};
		const storage = disposables.add(new AgentHostStorageService(URI.file(join(directory, 'storage.json')), new NullLogService(), writer));
		const runtime = createRuntime(storage);
		const connector = new TestTargetConnector('pending-write', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('pending-write-internal', 'pending-write:target', 'Pending Write')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await writeStarted.p;

		runtime.configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: false });
		await waitFor(() => runtime.service.targets.get().length === 0);
		allowWrite.complete();
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.strictEqual(connector.createCalls.length, 0);
	});

	test('re-enabled target awaits an in-flight identity write and observes its failure', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-host-remote-target-reenabled-write-'));
		disposables.add(toDisposable(() => fs.rmSync(directory, { recursive: true, force: true })));
		const writeStarted = new DeferredPromise<void>();
		const finishWrite = new DeferredPromise<void>();
		const writer: IAgentHostStorageWriter = {
			async mkdir() { },
			async writeFile() {
				writeStarted.complete();
				await finishWrite.p;
			},
		};
		const storage = disposables.add(new AgentHostStorageService(URI.file(join(directory, 'storage.json')), new NullLogService(), writer));
		const runtime = createRuntime(storage);
		const connector = new TestTargetConnector('reenabled-write', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('reenabled-write-internal', 'reenabled-write:target', 'Re-enabled Write')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await writeStarted.p;

		runtime.configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: false });
		await waitFor(() => runtime.service.targets.get().length === 0);
		runtime.configurationService.updateRootConfig({ [AgentHostRemoteAgentsEnabledConfigKey]: true });
		await waitFor(() => runtime.service.targets.get().length === 1);
		const createCountBeforeFailure = connector.createCalls.length;
		finishWrite.error(new Error('Write failed'));
		await waitFor(() => runtime.service.targets.get()[0].status.get() === AgentHostRemoteTargetStatus.Unavailable);

		assert.deepStrictEqual({
			createCountBeforeFailure,
			createCountAfterFailure: connector.createCalls.length,
			connection: runtime.service.targets.get()[0].connection.get(),
		}, {
			createCountBeforeFailure: 0,
			createCountAfterFailure: 0,
			connection: undefined,
		});
	});

	test('retains an unavailable handle and rejects operations after its connection closes', async () => {
		const runtime = createRuntime();
		const transport = disposables.add(new ScriptedTargetTransport());
		transport.initialize(catalog);
		let protocolClient: TrackingProtocolClient | undefined;
		const connector = new TestTargetConnector('fixed', async (_target, options) => {
			protocolClient = client(options.clientId, transport);
			return protocolClient;
		}, { autoRestore: false, initialDelayMs: 0, maxDelayMs: 0, maxAttempts: 0 });
		contribute(runtime.service, connector);
		connector.setTargets([target('fixed-internal', 'fixed:target', 'Fixed')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const handle = runtime.service.targets.get()[0];

		transport.close();
		await waitFor(() => handle.status.get() === AgentHostRemoteTargetStatus.Unavailable);
		let unavailableError: AgentHostRemoteTargetUnavailableError | undefined;
		try {
			handle.requireConnection();
		} catch (error) {
			assert.ok(error instanceof AgentHostRemoteTargetUnavailableError);
			unavailableError = error;
		}

		assert.deepStrictEqual({
			sameHandle: runtime.service.targets.get()[0] === handle,
			connection: handle.connection.get(),
			clientDisposed: protocolClient?.disposeCount,
			error: unavailableError?.message,
		}, {
			sameHandle: true,
			connection: undefined,
			clientDisposed: 1,
			error: 'Remote Agent Host target is unavailable: fixed/fixed:target (unavailable)',
		});
	});

	test('does not publish a connection when initialize omits the root provider catalogue', async () => {
		const runtime = createRuntime();
		const transport = disposables.add(new ScriptedTargetTransport());
		transport.initialize();
		let protocolClient: TrackingProtocolClient | undefined;
		const connector = new TestTargetConnector('missing-catalogue', async (_target, options) => {
			protocolClient = client(options.clientId, transport);
			return protocolClient;
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('missing-catalogue-internal', 'missing-catalogue:target', 'Missing Catalogue')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Unavailable);

		const handle = runtime.service.targets.get()[0];
		assert.deepStrictEqual({
			status: handle.status.get(),
			connection: handle.connection.get(),
			clientDisposed: protocolClient?.disposeCount,
		}, {
			status: AgentHostRemoteTargetStatus.Unavailable,
			connection: undefined,
			clientDisposed: 1,
		});
	});

	test('rejects and disposes a connector client that ignores the persisted client identity', async () => {
		const runtime = createRuntime();
		const transport = disposables.add(new ScriptedTargetTransport());
		transport.initialize(catalog);
		const wrongClient = client('wrong-client-id', transport);
		const connector = new TestTargetConnector('wrong-client', async () => wrongClient);
		contribute(runtime.service, connector);
		connector.setTargets([target('wrong-client-internal', 'wrong-client:target', 'Wrong Client')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Unavailable);

		const handle = runtime.service.targets.get()[0];
		assert.deepStrictEqual({
			expectedClientId: handle.clientId,
			actualClientId: wrongClient.clientId,
			clientDisposed: wrongClient.disposeCount,
			connection: handle.connection.get(),
		}, {
			expectedClientId: handle.clientId,
			actualClientId: 'wrong-client-id',
			clientDisposed: 1,
			connection: undefined,
		});
	});

	test('retains the handle and republishes its connection after protocol reconnect', async () => {
		const runtime = createRuntime();
		const transports: ScriptedTargetClientTransport[] = [];
		const connector = new TestTargetConnector('reconnecting', async (_target, options) => new TrackingProtocolClient(
			'reconnecting-target',
			() => {
				const transport = disposables.add(new ScriptedTargetClientTransport());
				transports.push(transport);
				if (transports.length === 1) {
					transport.initialize(catalog);
				}
				return transport;
			},
			{
				clientId: options.clientId,
				reconnectPolicy: { autoRestore: true, initialDelayMs: 0, maxDelayMs: 0, maxAttempts: 1 },
			},
			new NullLogService(),
		));
		contribute(runtime.service, connector);
		connector.setTargets([target('reconnecting-internal', 'reconnecting:target', 'Reconnecting')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const handle = runtime.service.targets.get()[0];
		const connection = handle.requireConnection();

		transports[0].close();
		await waitFor(() => handle.status.get() === AgentHostRemoteTargetStatus.Reconnecting);
		await waitFor(() => transports.length === 2);
		transports[1].completeReconnect();
		await waitFor(() => handle.status.get() === AgentHostRemoteTargetStatus.Connected);

		assert.deepStrictEqual({
			sameHandle: runtime.service.targets.get()[0] === handle,
			status: handle.status.get(),
			sameConnection: handle.requireConnection() === connection,
			clientId: handle.requireConnection().clientId,
		}, {
			sameHandle: true,
			status: AgentHostRemoteTargetStatus.Connected,
			sameConnection: true,
			clientId: handle.clientId,
		});
	});

	test('replaces an unavailable client on connector refresh without replacing the handle', async () => {
		const runtime = createRuntime();
		const transports: ScriptedTargetTransport[] = [];
		const connector = new TestTargetConnector('refreshable', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transports.push(transport);
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		const descriptor = target('refreshable-internal', 'refreshable:target', 'Refreshable');
		connector.setTargets([descriptor]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const handle = runtime.service.targets.get()[0];
		const clientId = handle.clientId;

		transports[0].close();
		await waitFor(() => handle.status.get() === AgentHostRemoteTargetStatus.Unavailable);
		connector.setTargets([{ ...descriptor }]);
		await waitFor(() => handle.status.get() === AgentHostRemoteTargetStatus.Connected && connector.createCalls.length === 2);

		assert.deepStrictEqual({
			sameHandle: runtime.service.targets.get()[0] === handle,
			clientId: handle.clientId,
			connectionClientId: handle.requireConnection().clientId,
			createCount: connector.createCalls.length,
		}, {
			sameHandle: true,
			clientId,
			connectionClientId: clientId,
			createCount: 2,
		});
	});

	test('quarantines a live target identity change without blocking other target updates', async () => {
		const runtime = createRuntime();
		const connector = new TestTargetConnector('identity-change', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		contribute(runtime.service, connector);
		const original = target('stable-internal', 'identity-change:stable', 'Stable');
		const other = target('other-internal', 'identity-change:other', 'Other');
		connector.setTargets([original, other]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get().length === 2);
		const originalHandle = runtime.service.targets.get()[0];
		const otherHandle = runtime.service.targets.get()[1];
		let originalDisposed = false;
		disposables.add(originalHandle.onDidDispose(() => originalDisposed = true));

		connector.setTargets([
			{ ...original, targetId: 'identity-change:mutated' },
			{ ...other, label: 'Updated Other' },
		]);
		await waitFor(() => runtime.service.targets.get().length === 1 && otherHandle.label.get() === 'Updated Other');
		connector.setTargets([
			{ ...original, targetId: 'identity-change:mutated' },
			{ ...other, label: 'Updated Again' },
		]);
		await waitFor(() => otherHandle.label.get() === 'Updated Again');
		connector.setTargets([original, other]);
		await waitFor(() => runtime.service.targets.get().length === 2);

		assert.deepStrictEqual({
			originalDisposed,
			replacementCreated: runtime.service.targets.get()[0] !== originalHandle,
			otherPreserved: runtime.service.targets.get()[1] === otherHandle,
			targetIds: runtime.service.targets.get().map(handle => handle.targetId),
		}, {
			originalDisposed: true,
			replacementCreated: true,
			otherPreserved: true,
			targetIds: ['identity-change:stable', 'identity-change:other'],
		});
	});

	test('redials a closed static target without target-list churn', async () => {
		const runtime = createRuntime();
		const transports: ScriptedTargetTransport[] = [];
		const connector = new TestTargetConnector('automatic-redial', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transports.push(transport);
			transport.initialize(catalog);
			return client(options.clientId, transport);
		}, {
			autoRestore: true,
			initialDelayMs: 0,
			maxDelayMs: 0,
			maxAttempts: 1,
		});
		contribute(runtime.service, connector);
		connector.setTargets([target('automatic-redial-internal', 'automatic-redial:target', 'Automatic Redial')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);
		const handle = runtime.service.targets.get()[0];

		transports[0].close();
		await waitFor(() => connector.createCalls.length === 2 && handle.status.get() === AgentHostRemoteTargetStatus.Connected);

		assert.deepStrictEqual({
			sameHandle: runtime.service.targets.get()[0] === handle,
			clientId: handle.requireConnection().clientId,
			createCount: connector.createCalls.length,
		}, {
			sameHandle: true,
			clientId: handle.clientId,
			createCount: 2,
		});
	});

	test('connects a fixed Node WebSocket target and reads its provider catalogue', async () => {
		const logService = new NullLogService();
		const server = disposables.add(await WebSocketProtocolServer.create({ port: 0, host: '127.0.0.1' }, logService));
		await server.whenListening;
		const serverConnections = disposables.add(new DisposableStore());
		disposables.add(server.onConnection(transport => {
			serverConnections.add(transport);
			serverConnections.add(transport.onMessage(message => {
				if (hasKey(message, { method: true, id: true }) && message.method === 'initialize') {
					transport.send({
						jsonrpc: '2.0',
						id: message.id,
						result: {
							protocolVersion: PROTOCOL_VERSION,
							serverSeq: 0,
							snapshots: [{ resource: ROOT_STATE_URI, state: catalog, fromSeq: 0 }],
						},
					});
				}
			}));
		}));

		const address = `ws://127.0.0.1:${server.boundPort}`;
		const runtime = createRuntime();
		const connector = new TestTargetConnector('fixed-websocket', async (_target, options) => {
			const transportFactory = await NodeWebSocketClientTransport.createFactory(address, undefined, logService);
			return new TrackingProtocolClient(address, transportFactory, { clientId: options.clientId }, logService);
		});
		contribute(runtime.service, connector);
		connector.setTargets([target(address, 'fixed:local-test', 'Local Test Host')]);
		enable(runtime.configurationService, runtime.managedSettingsService);
		await waitFor(() => runtime.service.targets.get()[0]?.status.get() === AgentHostRemoteTargetStatus.Connected);

		const handle = runtime.service.targets.get()[0];
		const rootState = handle.requireConnection().rootState.value;
		if (!rootState || rootState instanceof Error) {
			throw new Error('Expected fixed target root state');
		}
		assert.deepStrictEqual({
			targetId: handle.targetId,
			status: handle.status.get(),
			agents: rootState.agents,
		}, {
			targetId: 'fixed:local-test',
			status: AgentHostRemoteTargetStatus.Connected,
			agents: catalog.agents,
		});
	});

	test('registry disposal stops connector observation and prevents target resurrection', async () => {
		const registry = disposables.add(new AgentHostRemoteTargetRegistry(
			disposables.add(new AgentHostStorageService(undefined, new NullLogService())),
			new NullLogService(),
		));
		const connector = new TestTargetConnector('disposable-registry', async (_target, options) => {
			const transport = disposables.add(new ScriptedTargetTransport());
			transport.initialize(catalog);
			return client(options.clientId, transport);
		});
		disposables.add(registry.registerConnector(connector));
		connector.setTargets([target('first', 'disposable:first', 'First')]);
		await waitFor(() => registry.targets.get().length === 1 && connector.createCalls.length === 1);

		registry.dispose();
		connector.setTargets([target('second', 'disposable:second', 'Second')]);
		await new Promise(resolve => setTimeout(resolve, 10));

		assert.deepStrictEqual({
			targets: registry.targets.get(),
			createCount: connector.createCalls.length,
		}, {
			targets: [],
			createCount: 1,
		});
	});
});
