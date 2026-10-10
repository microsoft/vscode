/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IChannel, IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentSessionMetadata } from '../../../../../platform/agentHost/common/agentService.js';
import type { IClientTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService, type ResourceLabelFormatter } from '../../../../../platform/label/common/label.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import type { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import type { PersistentConnectionEvent } from '../../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, type ResolverResult } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { EditorRemoteAgentHostServiceClient } from '../../browser/editorRemoteAgentHostServiceClient.js';
import { IAgentHostFileSystemService } from '../../common/agentHostFileSystemService.js';
import { EditorRemoteAgentHostTransport } from '../../common/editorRemoteAgentHostTransport.js';
import { IRemoteAgentService, type IRemoteAgentConnection } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';

class TestRemoteAgentConnection extends Disposable implements IRemoteAgentConnection {
	readonly isConnected = true;
	readonly onReconnecting = Event.None;
	readonly onDidStateChange = Event.None as Event<PersistentConnectionEvent>;

	constructor(private readonly channel: IChannel, readonly remoteAuthority = 'ssh-remote+test') {
		super();
	}

	end(): Promise<void> {
		return Promise.resolve();
	}

	getChannel<T extends IChannel>(_channelName: string): T {
		return this.channel as T;
	}

	withChannel<T extends IChannel, R>(_channelName: string, callback: (channel: T) => Promise<R>): Promise<R> {
		return callback(this.channel as T);
	}

	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(_channelName: string, _channel: T): void { }

	getInitialConnectionTimeMs(): Promise<number> {
		return Promise.resolve(0);
	}

	updateGraceTime(_graceTime: number): void { }
}

class DeferredRemoteAgentService extends TestRemoteAgentService {
	readonly environmentReady = new DeferredPromise<IRemoteAgentEnvironment | null>();

	constructor(private readonly connection: IRemoteAgentConnection) {
		super();
	}

	override getConnection(): IRemoteAgentConnection {
		return this.connection;
	}

	override getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return this.environmentReady.p;
	}
}

suite('EditorRemoteAgentHostServiceClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	function createTransportFactory(channel: IChannel, resolveAuthority: IRemoteAuthorityResolverService['resolveAuthority'], isSessionsWindow = false, logService = new NullLogService()): () => IClientTransport {
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection(channel, 'codespaces+test')));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({ resolveAuthority })],
			[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false) }],
			[ILogService, logService],
			[IWorkbenchEnvironmentService, { isSessionsWindow, debugExtensionHost: { env: { GITHUB_TOKEN: 'debug-token', DEBUG_ENV: 'debug-value' } } }],
			[ILabelService, upcastPartial<ILabelService>({ registerFormatter: () => Disposable.None })],
			[IAgentHostFileSystemService, {
				_serviceBrand: undefined,
				registerAuthority: () => Disposable.None,
				ensureSyncedCustomizationProvider: () => { },
			}],
		)));
		instantiationService.stubInstance(AgentHostProtocolClient, {
			onDidClose: Event.None,
			onDidChangeConnectionState: Event.None,
			dispose: () => { },
		});
		instantiationService.set(IInstantiationService, instantiationService);
		const createInstanceSpy = sinon.spy(instantiationService, 'createInstance');
		disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
		const protocolClientCall = createInstanceSpy.getCalls().find(call => call.args[0] === AgentHostProtocolClient);
		return protocolClientCall?.args[2] as () => IClientTransport;
	}

	for (const isSessionsWindow of [false, true]) {
		test(`forwards the resolver environment on each connection in the ${isSessionsWindow ? 'Agents' : 'editor'} window`, async () => {
			const calls: { command: string; arg: unknown }[] = [];
			const channel: IChannel = {
				call: <T>(command: string, arg?: unknown) => {
					calls.push({ command, arg });
					return Promise.resolve(undefined as T);
				},
				listen: () => Event.None,
			};
			const remoteAuthority = 'codespaces+test';
			const resolvedAuthorities: string[] = [];
			let token = 'codespace-token';
			const createTransport = createTransportFactory(channel, async authority => {
				resolvedAuthorities.push(authority);
				return upcastPartial<ResolverResult>({ options: { extensionHostEnv: { GITHUB_TOKEN: token, GH_TOKEN: null, EMPTY: '' } } });
			}, isSessionsWindow);

			await disposables.add(createTransport()).connect();
			token = 'refreshed-codespace-token';
			await disposables.add(createTransport()).connect();

			assert.deepStrictEqual({ resolvedAuthorities, calls }, {
				resolvedAuthorities: [remoteAuthority, remoteAuthority],
				calls: ['codespace-token', 'refreshed-codespace-token'].map(token => ({
					command: 'connect',
					arg: {
						env: { GITHUB_TOKEN: token, GH_TOKEN: null, EMPTY: '' },
						debugEnv: { GITHUB_TOKEN: 'debug-token', DEBUG_ENV: 'debug-value' },
					},
				})),
			});
		});
	}

	test('keeps resolver failures on the buffered IPC connection and refreshes the next connection', async () => {
		const ipcRequested = new DeferredPromise<void>();
		const ipcReady = new DeferredPromise<void>();
		const calls: { command: string; arg: unknown }[] = [];
		const channel: IChannel = {
			call: <T>(command: string, arg?: unknown) => {
				calls.push({ command, arg });
				void ipcRequested.complete();
				return ipcReady.p as Promise<T>;
			},
			listen: () => Event.None,
		};
		const logService = new NullLogService();
		const warn = sinon.spy(logService, 'warn');
		let resolverAvailable = false;
		const createTransport = createTransportFactory(channel, async () => {
			if (!resolverAvailable) {
				throw new RemoteAuthorityResolverError('sensitive resolver details', RemoteAuthorityResolverErrorCode.TemporarilyNotAvailable);
			}
			return upcastPartial<ResolverResult>({ options: { extensionHostEnv: { GITHUB_TOKEN: 'refreshed-token' } } });
		}, false, logService);
		const connecting = disposables.add(createTransport()).connect();
		const duringOutage = await Promise.race([
			ipcRequested.p.then(() => 'buffered'),
			connecting.then(() => 'connected', () => 'rejected'),
		]);
		await ipcReady.complete();
		await assert.doesNotReject(connecting);
		resolverAvailable = true;
		await disposables.add(createTransport()).connect();

		assert.deepStrictEqual({ duringOutage, calls, warnings: warn.args }, {
			duringOutage: 'buffered',
			calls: [
				{ command: 'connect', arg: undefined },
				{
					command: 'connect',
					arg: {
						env: { GITHUB_TOKEN: 'refreshed-token' },
						debugEnv: { GITHUB_TOKEN: 'debug-token', DEBUG_ENV: 'debug-value' },
					},
				},
			],
			warnings: [['[AgentHost:remote] Unable to resolve the remote environment; connecting without environment overrides.']],
		});
	});

	test('waits for enablement and the remote environment before connecting to Agent Host', async () => {
		const channel: IChannel = {
			call: <T>() => Promise.resolve(undefined as T),
			listen: () => Event.None,
		};
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection(channel)));
		let connectCalls = 0;
		const onDidChangeConnectionState = disposables.add(new Emitter<AgentHostClientState>());
		const protocolClient = {
			clientId: 'test-client',
			clientConnectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			connect: async () => {
				connectCalls++;
				throw new Error('Initial connection failed');
			},
			onDidClose: Event.None,
			onDidChangeConnectionState: onDidChangeConnectionState.event,
			onDidNotification: Event.None,
			onDidAction: Event.None,
			onMcpNotification: Event.None,
			initializeResult: constObservable(undefined),
			rootState: {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: Event.None,
				onDidError: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
		const registeredAuthorities: string[] = [];
		const registeredFormatters: ResourceLabelFormatter[] = [];
		const agentHostEnabled = observableValue('agentHostEnabled', false);
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({})],
			[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: agentHostEnabled, managedSandboxEnforced: constObservable(false) }],
			[ILogService, new NullLogService()],
			[IWorkbenchEnvironmentService, { isSessionsWindow: false }],
			[ILabelService, upcastPartial<ILabelService>({
				registerFormatter: formatter => {
					if (hasKey(formatter, { scheme: true })) {
						registeredFormatters.push(formatter);
					}
					return Disposable.None;
				},
			})],
			[IAgentHostFileSystemService, {
				_serviceBrand: undefined,
				registerAuthority: (authority: string) => {
					registeredAuthorities.push(authority);
					return Disposable.None;
				},
				ensureSyncedCustomizationProvider: () => { },
			}],
		)));
		instantiationService.stubInstance(AgentHostProtocolClient, protocolClient);
		instantiationService.set(IInstantiationService, instantiationService);
		const createInstanceSpy = sinon.spy(instantiationService, 'createInstance');

		const service = disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
		const started = Event.toPromise(service.onAgentHostStart);
		agentHostEnabled.set(true, undefined);
		const beforeReady = connectCalls;

		remoteAgentService.environmentReady.complete(upcastPartial<IRemoteAgentEnvironment>({ os: OperatingSystem.Windows }));
		while (connectCalls === 0) {
			await Promise.resolve();
		}
		onDidChangeConnectionState.fire(AgentHostClientState.Connected);
		await started;

		const protocolClientCall = createInstanceSpy.getCalls().find(call => call.args[0] === AgentHostProtocolClient);
		const createTransport = protocolClientCall?.args[2] as () => IClientTransport;
		const transport = disposables.add(createTransport());
		assert.deepStrictEqual({
			beforeReady,
			afterReady: connectCalls,
			connectionKind: service.clientConnectionKind,
			transportConnectionKind: transport.clientConnectionKind,
			clientInfo: protocolClientCall?.args[3]?.clientInfo,
			registeredAuthorities,
			registeredFormatters: registeredFormatters.map(formatter => formatter.formatting),
			mapsRemoteDirectories: transport instanceof EditorRemoteAgentHostTransport,
		}, {
			beforeReady: 0,
			afterReady: 1,
			connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			transportConnectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			clientInfo: editorWindowAgentHostClientInfo,
			registeredAuthorities: [agentHostAuthority('vscode-remote://ssh-remote+test')],
			registeredFormatters: [{
				label: '${path}',
				separator: '\\',
				normalizeDriveLetter: true,
			}],
			mapsRemoteDirectories: true,
		});
	});

	test('returns remote workspace identities for both session-list directory fields', async () => {
		const channel: IChannel = {
			call: <T>() => Promise.resolve(undefined as T),
			listen: () => Event.None,
		};
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection(channel)));
		const directory = URI.parse('vscode-remote://ssh-remote+test/workspace');
		const secondDirectory = URI.parse('vscode-remote://ssh-remote+test/second');
		const directorySets = [undefined, [], [directory], [directory, secondDirectory]];
		const sessions: IAgentSessionMetadata[] = directorySets.map((directories, index) => ({
			session: URI.parse(`copilot:/session-${index}`),
			startTime: 0,
			modifiedTime: 0,
			workingDirectory: directories?.[0] ? toAgentHostUri(directories[0], 'test') : undefined,
			workingDirectories: directories?.map(directory => toAgentHostUri(directory, 'test')),
		}));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({})],
			[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false) }],
			[ILogService, new NullLogService()],
			[IWorkbenchEnvironmentService, { isSessionsWindow: false }],
			[ILabelService, upcastPartial<ILabelService>({
				registerFormatter: () => Disposable.None,
			})],
			[IAgentHostFileSystemService, {
				_serviceBrand: undefined,
				registerAuthority: () => Disposable.None,
				ensureSyncedCustomizationProvider: () => { },
			}],
		)));
		instantiationService.stubInstance(AgentHostProtocolClient, {
			onDidClose: Event.None,
			onDidChangeConnectionState: Event.None,
			listSessions: async () => sessions,
			dispose: () => { },
		});
		instantiationService.set(IInstantiationService, instantiationService);
		const service = disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));

		assert.deepStrictEqual(await service.listSessions(), sessions.map((session, index) => ({
			...session,
			workingDirectory: directorySets[index]?.[0],
			workingDirectories: directorySets[index],
		})));
	});
});
