/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { autorun, constObservable, observableValue } from '../../../../../base/common/observable.js';
import { OperatingSystem } from '../../../../../base/common/platform.js';
import { hasKey } from '../../../../../base/common/types.js';
import { URI } from '../../../../../base/common/uri.js';
import type { IChannel, IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { AgentHostClientState, AgentHostProtocolClient, type IAgentHostProtocolClientOptions } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { AgentHostClientConnectionKind } from '../../../../../platform/agentHost/common/agentHostTelemetry.js';
import type { IAgentHostTcpConnection } from '../../../../../platform/agentHost/common/agentHostTcpConnection.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import type { IAgentHostDebugLogsArtifact } from '../../../../../platform/agentHost/common/agentService.js';
import type { IClientTransport } from '../../../../../platform/agentHost/common/state/sessionTransport.js';
import { AhpErrorCodes, ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService, type ResourceLabelFormatter } from '../../../../../platform/label/common/label.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService, NoOpNotification, Severity } from '../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../platform/notification/test/common/testNotificationService.js';
import type { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import type { PersistentConnectionEvent } from '../../../../../platform/remote/common/remoteAgentConnection.js';
import { IRemoteAuthorityResolverService, RemoteAuthorityResolverError, RemoteAuthorityResolverErrorCode, type ResolverResult } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { EditorRemoteAgentHostServiceClient } from '../../browser/editorRemoteAgentHostServiceClient.js';
import { IAgentHostFileSystemService } from '../../common/agentHostFileSystemService.js';
import { IRemoteAgentService, type IRemoteAgentConnection } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { IHostService } from '../../../host/browser/host.js';

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

	function createTransportFactory(channel: IChannel, resolveAuthority: IRemoteAuthorityResolverService['resolveAuthority'], isSessionsWindow = false, logService = new NullLogService(), certificates?: { useHostProxy: boolean; systemCertificates: boolean; authority?: string }, onOptions?: (options: IAgentHostProtocolClientOptions) => void): () => IClientTransport {
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection(channel, certificates ? certificates.authority ?? 'wsl+test' : 'codespaces+test')));
		remoteAgentService.environmentReady.complete(upcastPartial<IRemoteAgentEnvironment>({ useHostProxy: certificates?.useHostProxy ?? false }));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IConfigurationService, new TestConfigurationService({ 'http.systemCertificates': certificates?.systemCertificates ?? false })],
			[IRequestService, upcastPartial<IRequestService>({
				loadCertificates: async () => {
					assert.ok(certificates?.useHostProxy && certificates.systemCertificates);
					return ['LOCAL CA'];
				}
			})],
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
		onOptions?.(protocolClientCall?.args[3] as IAgentHostProtocolClientOptions);
		return protocolClientCall?.args[2] as () => IClientTransport;
	}

	for (const useHostProxy of [true, false]) {
		for (const systemCertificates of [true, false]) {
			test(`forwards certificates only for local-network remotes (useHostProxy=${useHostProxy}, systemCertificates=${systemCertificates})`, async () => {
				const calls: unknown[] = [];
				const channel: IChannel = {
					call: async <T>(_command: string, arg?: unknown) => {
						calls.push(arg);
						return undefined as T;
					},
					listen: () => Event.None,
				};
				let provider: IAgentHostProtocolClientOptions['clientCertificates'];
				const createTransport = createTransportFactory(channel, async () => upcastPartial<ResolverResult>({}), false, new NullLogService(), { useHostProxy, systemCertificates }, options => provider = options.clientCertificates);
				await disposables.add(createTransport()).connect();
				assert.deepStrictEqual({ calls, enabled: provider?.isEnabled(), certificates: provider?.isEnabled() ? await provider.loadCertificates() : undefined }, {
					calls: [{ env: {}, debugEnv: { GITHUB_TOKEN: 'debug-token', DEBUG_ENV: 'debug-value' } }],
					enabled: useHostProxy && systemCertificates,
					certificates: useHostProxy && systemCertificates ? ['LOCAL CA'] : undefined,
				});
			});
		}
	}

	for (const authority of ['wsl+test', 'dev-container+test', 'attached-container+test', 'ssh-remote+test', 'tunnel+test', 'codespaces+test']) {
		test(`limits the client certificate API to WSL and local container authorities (${authority})`, async () => {
			const channel: IChannel = { call: async <T>() => undefined as T, listen: () => Event.None };
			let provider: IAgentHostProtocolClientOptions['clientCertificates'];
			const createTransport = createTransportFactory(channel, async () => upcastPartial<ResolverResult>({}), false, new NullLogService(), {
				authority, useHostProxy: true, systemCertificates: true,
			}, options => provider = options.clientCertificates);
			await disposables.add(createTransport()).connect();
			assert.deepStrictEqual(provider?.isEnabled() ? await provider.loadCertificates() : undefined, ['wsl+test', 'dev-container+test', 'attached-container+test'].includes(authority) ? ['LOCAL CA'] : undefined);
		});
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
		const tcpTargets: Array<{ host: string; port: number }> = [];
		const tcpConnection = upcastPartial<IAgentHostTcpConnection>({});
		const onDidChangeConnectionState = disposables.add(new Emitter<AgentHostClientState>());
		const protocolClient = {
			clientId: 'test-client',
			clientConnectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
			connect: async () => {
				connectCalls++;
				throw new Error('Initial connection failed');
			},
			openTcpConnection: async (target: { host: string; port: number }) => {
				tcpTargets.push(target);
				return tcpConnection;
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
		const openedTcpConnection = await service.openTcpConnection({ host: 'canvas.test', port: 4321 });
		assert.deepStrictEqual({
			beforeReady,
			afterReady: connectCalls,
			connectionKind: service.clientConnectionKind,
			transportConnectionKind: transport.clientConnectionKind,
			clientInfo: protocolClientCall?.args[3]?.clientInfo,
			registeredAuthorities,
			registeredFormatters: registeredFormatters.map(formatter => formatter.formatting),
			toHost: protocolClientCall?.args[3]?.resourceUris?.toAgentHost(URI.parse('vscode-remote://ssh-remote+test/x')).toString(),
			toClient: protocolClientCall?.args[3]?.resourceUris?.fromAgentHost(URI.file('/x')).toString(),
			tcpTargets,
			openedTcpConnection: openedTcpConnection === tcpConnection,
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
			toHost: 'file:///x',
			toClient: URI.parse('vscode-remote://ssh-remote+test/x').toString(),
			tcpTargets: [{ host: 'canvas.test', port: 4321 }],
			openedTcpConnection: true,
		});
	});

	test('forwards debug-log collection progress tokens and cancellation to the remote bridge', async () => {
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection({
			call: <T>() => Promise.resolve(undefined as T),
			listen: () => Event.None,
		})));
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({})],
			[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false) }],
			[ILogService, new NullLogService()],
			[IWorkbenchEnvironmentService, { isSessionsWindow: false }],
			[ILabelService, upcastPartial<ILabelService>({ registerFormatter: () => Disposable.None })],
			[IAgentHostFileSystemService, {
				_serviceBrand: undefined,
				registerAuthority: () => Disposable.None,
				ensureSyncedCustomizationProvider: () => { },
			}],
		)));
		const artifact: IAgentHostDebugLogsArtifact = {
			kind: 'archive', resource: URI.parse('vscode-agent-host://remote/tmp/logs.zip'),
			providerLogsIncluded: true, size: 10, uncompressedSize: 20, entries: [{ path: 'events.jsonl', size: 20 }],
		};
		const calls: { session?: string; chat?: string; progressToken: string | undefined }[] = [];
		instantiationService.stubInstance(AgentHostProtocolClient, {
			onDidClose: Event.None,
			onDidChangeConnectionState: Event.None,
			collectDebugLogs: async (session, _kind, chat, progressToken) => {
				calls.push({ session: session?.toString(), chat: chat?.toString(), progressToken });
				return artifact;
			},
			cancelDebugLogs: async progressToken => { calls.push({ progressToken }); },
			dispose: () => { },
		});
		instantiationService.set(IInstantiationService, instantiationService);
		const service = disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
		const session = URI.parse('custom-session://host/session');
		const chat = URI.parse('custom-chat://host/chat');
		const result = await service.collectDebugLogs(session, 'archive', chat, 'export-progress');
		await service.cancelDebugLogs('export-progress');
		assert.deepStrictEqual({ calls, result }, {
			calls: [{ session: session.toString(), chat: chat.toString(), progressToken: 'export-progress' }, { progressToken: 'export-progress' }],
			result: artifact,
		});
	});

	suite('incompatible remote startup', () => {
		async function createService() {
			const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection({
				call: async <T>() => undefined as T,
				listen: () => Event.None,
			})));
			await remoteAgentService.environmentReady.complete(null);
			const enabled = observableValue('enabled', true);
			const onState = disposables.add(new Emitter<AgentHostClientState>());
			const started = new DeferredPromise<void>();
			const connect = sinon.stub().callsFake(async () => { await started.complete(); });
			const reload = sinon.stub().resolves();
			const notification = new NoOpNotification();
			const close = sinon.spy(notification, 'close');
			const notifications = new TestNotificationService();
			const prompt = sinon.stub(notifications, 'prompt').returns(notification);
			const protocolClient = {
				connectionError: new ProtocolError(AhpErrorCodes.UnsupportedProtocolVersion, 'Server accepts ^0.8.0', { supportedVersions: ['0.8.0'] }),
				onDidClose: Event.None,
				onDidChangeConnectionState: onState.event,
				connect,
				dispose: () => { },
			};
			const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
				[IRemoteAgentService, remoteAgentService],
				[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({})],
				[IAgentHostEnablementService, { _serviceBrand: undefined, enabled, managedSandboxEnforced: constObservable(false) }],
				[ILogService, new NullLogService()],
				[IWorkbenchEnvironmentService, { isSessionsWindow: false }],
				[ILabelService, upcastPartial<ILabelService>({ registerFormatter: () => Disposable.None })],
				[IAgentHostFileSystemService, upcastPartial<IAgentHostFileSystemService>({ registerAuthority: () => Disposable.None })],
				[INotificationService, notifications],
				[IHostService, upcastPartial<IHostService>({ reload })],
			)));
			instantiationService.stubInstance(AgentHostProtocolClient, protocolClient);
			instantiationService.set(IInstantiationService, instantiationService);
			const service = disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
			await started.p;
			const exits: number[] = [];
			disposables.add(service.onAgentHostExit(code => exits.push(code)));
			return { service, enabled, onState, connect, reload, prompt, close, exits, protocolClient };
		}

		test('reports incompatibility once, settles startup, and reloads only on request', async () => {
			const fixture = await createService();
			fixture.onState.fire(AgentHostClientState.Incompatible);
			fixture.onState.fire(AgentHostClientState.Incompatible);
			fixture.service.startAgentHost();
			const notification = fixture.prompt.firstCall?.args;
			assert.deepStrictEqual({
				prompts: fixture.prompt.callCount,
				severity: notification?.[0],
				message: notification?.[1],
				choices: notification?.[2].map(choice => choice.label),
				connects: fixture.connect.callCount,
				reloads: fixture.reload.callCount,
				authenticationPending: fixture.service.authenticationPending.get(),
				exits: fixture.exits,
			}, {
				prompts: 1,
				severity: Severity.Error,
				message: 'The remote Agent Host is incompatible with this version of VS Code. Update the remote Agent Host or VS Code, then reload this window to reconnect. Server accepts ^0.8.0',
				choices: ['Reload Window'],
				connects: 1,
				reloads: 0,
				authenticationPending: false,
				exits: [0],
			});
			await notification![2][0].run();
			fixture.service.dispose();
			assert.deepStrictEqual({ reloads: fixture.reload.callCount, closed: fixture.close.callCount }, { reloads: 1, closed: 1 });
		});

		test('does not mislabel compatible connections or authentication failures as protocol mismatches', async () => {
			const fixture = await createService();
			fixture.onState.fire(AgentHostClientState.Connected);
			fixture.protocolClient.connectionError = new ProtocolError(AhpErrorCodes.AuthRequired, 'Authentication required');
			fixture.onState.fire(AgentHostClientState.Incompatible);
			assert.deepStrictEqual({ prompts: fixture.prompt.callCount, exits: fixture.exits, connects: fixture.connect.callCount }, { prompts: 0, exits: [], connects: 1 });
		});

		test('does not surface late errors after AI is disabled or the service is disposed', async () => {
			const fixture = await createService();
			fixture.enabled.set(false, undefined);
			fixture.onState.fire(AgentHostClientState.Incompatible);
			fixture.service.dispose();
			fixture.onState.fire(AgentHostClientState.Incompatible);
			assert.deepStrictEqual({ prompts: fixture.prompt.callCount, reloads: fixture.reload.callCount }, { prompts: 0, reloads: 0 });
		});

		for (const stop of ['disable', 'dispose'] as const) {
			test(`closes a shown notification and ignores stale reload after ${stop}`, async () => {
				const fixture = await createService();
				fixture.onState.fire(AgentHostClientState.Incompatible);
				const reload = fixture.prompt.firstCall.args[2][0];
				if (stop === 'disable') {
					fixture.enabled.set(false, undefined);
				} else {
					fixture.service.dispose();
				}
				await reload.run();
				assert.deepStrictEqual({ closed: fixture.close.callCount, reloads: fixture.reload.callCount }, { closed: 1, reloads: 0 });
			});
		}
	});

	suite('sandbox certificate delegation', () => {
		const operations = [
			['installSandboxCertificate', 'sandboxCertificateInstallationSupported'],
			['rotateSandboxCertificate', 'sandboxCertificateRotationSupported'],
			['removeSandboxCertificate', 'sandboxCertificateRemovalSupported'],
			['refreshSandboxCertificate', 'sandboxCertificateRefreshSupported'],
		] as const;
		const chat = 'conversation://tenant/a%2Fb?revision%3D2#entry';
		const scopeId = 'remote-runtime-scope';

		function createService(protocolClient: Partial<AgentHostProtocolClient>, remoteAuthority?: string): EditorRemoteAgentHostServiceClient {
			const remoteAgentService = remoteAuthority
				? new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection({
					call: <T>() => Promise.resolve(undefined as T),
					listen: () => Event.None,
				}, remoteAuthority)))
				: new TestRemoteAgentService();
			const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
				[IRemoteAgentService, remoteAgentService],
				[IRemoteAuthorityResolverService, upcastPartial<IRemoteAuthorityResolverService>({})],
				[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: constObservable(false), managedSandboxEnforced: constObservable(false) }],
				[ILogService, new NullLogService()],
				[IWorkbenchEnvironmentService, { isSessionsWindow: false, remoteAuthority }],
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
				...protocolClient,
			});
			instantiationService.set(IInstantiationService, instantiationService);
			return disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
		}

		for (const remoteAuthority of ['ssh-remote+test', 'wsl+test', 'dev-container+test']) {
			test(`forwards independent live capabilities and exact certificate targets in ${remoteAuthority}`, async () => {
				const installation = observableValue('installation', false);
				const rotation = observableValue('rotation', false);
				const removal = observableValue('removal', false);
				const refresh = observableValue('refresh', false);
				const calls: { operation: string; chat: string; scopeId: string }[] = [];
				const service = createService({
					sandboxCertificateInstallationSupported: installation,
					sandboxCertificateRotationSupported: rotation,
					sandboxCertificateRemovalSupported: removal,
					sandboxCertificateRefreshSupported: refresh,
					installSandboxCertificate: async (chat, scopeId) => { calls.push({ operation: 'install', chat, scopeId }); },
					rotateSandboxCertificate: async (chat, scopeId) => { calls.push({ operation: 'rotate', chat, scopeId }); },
					removeSandboxCertificate: async (chat, scopeId) => { calls.push({ operation: 'remove', chat, scopeId }); },
					refreshSandboxCertificate: async (chat, scopeId) => { calls.push({ operation: 'refresh', chat, scopeId }); },
				}, remoteAuthority);
				const capabilities: boolean[][] = [];
				disposables.add(autorun(reader => {
					capabilities.push(operations.map(([, capability]) => service[capability].read(reader)));
				}));

				installation.set(true, undefined);
				await service.installSandboxCertificate(chat, scopeId);
				installation.set(false, undefined);
				rotation.set(true, undefined);
				await service.rotateSandboxCertificate(chat, scopeId);
				rotation.set(false, undefined);
				removal.set(true, undefined);
				await service.removeSandboxCertificate(chat, scopeId);
				removal.set(false, undefined);
				refresh.set(true, undefined);
				await service.refreshSandboxCertificate(chat, scopeId);
				refresh.set(false, undefined);

				assert.deepStrictEqual({ capabilities, calls }, {
					capabilities: [
						[false, false, false, false],
						[true, false, false, false],
						[false, false, false, false],
						[false, true, false, false],
						[false, false, false, false],
						[false, false, true, false],
						[false, false, false, false],
						[false, false, false, true],
						[false, false, false, false],
					],
					calls: ['install', 'rotate', 'remove', 'refresh'].map(operation => ({ operation, chat, scopeId })),
				});
			});
		}

		test('propagates certificate operation failures from the remote protocol client', async () => {
			const error = new Error('Remote certificate operation is unavailable');
			const fail = async () => { throw error; };
			const service = createService({
				sandboxCertificateInstallationSupported: observableValue('installation', false),
				sandboxCertificateRotationSupported: observableValue('rotation', false),
				sandboxCertificateRemovalSupported: observableValue('removal', false),
				sandboxCertificateRefreshSupported: observableValue('refresh', false),
				installSandboxCertificate: fail,
				rotateSandboxCertificate: fail,
				removeSandboxCertificate: fail,
				refreshSandboxCertificate: fail,
			}, 'ssh-remote+test');

			for (const [method, capability] of operations) {
				assert.strictEqual(service[capability].get(), false);
				await assert.rejects(async () => service[method](chat, scopeId), actual => actual === error);
			}
		});

		test('reports unsupported capabilities and rejects operations without a remote connection', async () => {
			const service = createService({});
			for (const [method, capability] of operations) {
				assert.strictEqual(service[capability].get(), false);
				await assert.rejects(async () => service[method](chat, scopeId), /no remote connection is available/);
			}
		});
	});
});
