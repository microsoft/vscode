/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../../base/common/observable.js';
import { IChannel } from '../../../../../../base/parts/ipc/common/ipc.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDevContainerAgentHostConfig, IDevContainerAgentHostMainService } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { AGENT_HOST_SCHEME, agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../../platform/configuration/common/configurationRegistry.js';
import { IEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISharedProcessService } from '../../../../../../platform/ipc/electron-browser/services.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { ITelemetryData, ITelemetryService, TelemetryLevel } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IOutputChannel, IOutputService } from '../../../../../../workbench/services/output/common/output.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerWorktreeEnabledSettingId } from '../../../../../common/devContainerAgentHostService.js';
import { WorkspaceHistoryLoadState } from '../../../../../common/workspaceSelection.js';
import { ISessionFolder, ISessionWorkspace } from '../../../../../services/sessions/common/session.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IRecentWorkspace, ISessionsRecentWorkspacesService } from '../../../../../services/sessions/browser/sessionsRecentWorkspacesService.js';
import { DevContainerAgentHostConnector, ensureDevContainerAgentHostsEnabled, getDevContainerEnvironment, isDevContainerWorkspaceAvailable, RemoteDevContainerService, reportDevContainerEnvironment } from '../../electron-browser/devContainerAgentHostConnector.contribution.js';

suite('Dev Container Agent Host Connector', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
	// Capture these before configuration registry tests clear global registrations.
	const devContainerAgentHostEnabledProperty = configurationRegistry.getConfigurationProperties()[DevContainerAgentHostEnabledSettingId];
	const devContainerWorktreeEnabledProperty = configurationRegistry.getExcludedConfigurationProperties()[DevContainerWorktreeEnabledSettingId];

	test('requires Docker and a default Dev Container configuration', async () => {
		const workspaceUri = URI.file('/workspace');
		const check = (existingPaths: readonly string[], dockerAvailable: boolean, devContainerAgentHostsEnabled = true, remoteAgentHostsEnabled = true, uri = workspaceUri) => {
			const fileService = new class extends mock<IFileService>() {
				override async exists(resource: URI): Promise<boolean> {
					return existingPaths.includes(resource.path);
				}
			}();
			const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
				override async isDockerAvailable(): Promise<boolean> {
					return dockerAvailable;
				}
			}();
			const configurationService = new TestConfigurationService({
				[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
				[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
			});
			return isDevContainerWorkspaceAvailable(uri, fileService, mainService, configurationService);
		};

		assert.deepStrictEqual({
			nestedConfig: await check(['/workspace/.devcontainer/devcontainer.json'], true),
			rootConfig: await check(['/workspace/.devcontainer.json'], true),
			noDocker: await check(['/workspace/.devcontainer/devcontainer.json'], false),
			noConfig: await check([], true),
			devContainerAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, false),
			remoteAgentHostsDisabled: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, false),
			nonFileWorkspace: await check(['/workspace/.devcontainer/devcontainer.json'], true, true, true, URI.parse('vscode-remote://host/workspace')),
		}, {
			nestedConfig: true,
			rootConfig: true,
			noDocker: false,
			noConfig: false,
			devContainerAgentHostsDisabled: false,
			remoteAgentHostsDisabled: false,
			nonFileWorkspace: false,
		});
	});

	test('reports Docker independently from the Dev Container folder count', async () => {
		const existingPaths = new Set([
			'/first/.devcontainer/devcontainer.json',
			'/third/.devcontainer.json',
		]);
		const fileService = new class extends mock<IFileService>() {
			override async exists(resource: URI): Promise<boolean> {
				return existingPaths.has(resource.path);
			}
		}();
		const mainService = new class extends mock<IDevContainerAgentHostMainService>() {
			override async isDockerAvailable(): Promise<boolean> {
				return false;
			}
		}();

		assert.deepStrictEqual(
			await getDevContainerEnvironment(
				[URI.file('/first'), URI.file('/second'), URI.file('/third')],
				fileService,
				mainService,
			),
			{
				dockerAvailable: false,
				devContainerFolderCount: 2,
			},
		);
	});

	test('does not start a remote container after cancellation while reconnecting the source host', async () => {
		const source = new DeferredPromise<IDevContainerAgentHostMainService>();
		const service = store.add(new RemoteDevContainerService(() => source.p, store.add(new NullLogService())));
		const connecting = service.connect({ connectionId: 'cancelled', workspaceFolder: '/project', name: 'Project' });
		const rejected = assert.rejects(connecting, /Canceled/);
		await service.disconnect('cancelled');
		await source.complete(new class extends mock<IDevContainerAgentHostMainService>() {
			override async connect(): Promise<never> { throw new Error('Must not start a cancelled container'); }
		}());
		await rejected;
	});

	test('a stale failed connection does not disconnect its same-ID replacement', async () => {
		const firstSource = new DeferredPromise<IDevContainerAgentHostMainService>();
		const replacementSource = new DeferredPromise<IDevContainerAgentHostMainService>();
		const replacementStarted = new DeferredPromise<void>();
		let resolveCalls = 0;
		const relay = store.add(new RemoteDevContainerService(() => {
			if (++resolveCalls === 1) {
				return firstSource.p;
			}
			void replacementStarted.complete();
			return replacementSource.p;
		}, store.add(new NullLogService())));
		const config = { connectionId: 'shared', workspaceFolder: '/project', name: 'Project' };
		const first = relay.connect(config);
		const firstRejected = assert.rejects(first, /Canceled/);
		const replacement = relay.connect(config);
		await replacementStarted.p;

		const calls: string[] = [];
		const source = new class extends mock<IDevContainerAgentHostMainService>() {
			override readonly onDidOutput = Event.None;
			override readonly onDidRelayMessage = Event.None;
			override readonly onDidRelayClose = Event.None;
			override readonly onDidCloseConnection = Event.None;
			override async connect(config: IDevContainerAgentHostConfig) {
				calls.push(`connect:${config.connectionId}`);
				return { ...config, address: 'devcontainer:replacement', remoteWorkspaceFolder: '/workspaces/project' };
			}
			override async relaySend(id: string, message: string): Promise<void> { calls.push(`send:${id}:${message}`); }
			override async disconnect(id: string): Promise<void> { calls.push(`disconnect:${id}`); }
		}();
		await firstSource.complete(source);
		await firstRejected;
		await replacementSource.complete(source);
		const result = await replacement;
		await relay.relaySend(config.connectionId, 'message');
		await relay.disconnect(config.connectionId);
		assert.deepStrictEqual({ address: result.address, calls }, {
			address: 'devcontainer:replacement',
			calls: ['connect:shared', 'send:shared:message', 'disconnect:shared'],
		});
	});

	test('rebinds remote relays and output when the source client is replaced', async () => {
		const disconnected: string[] = [];
		const createSource = () => {
			const output = store.add(new Emitter<{ connectionId: string; data: string }>());
			const service = new class extends mock<IDevContainerAgentHostMainService>() {
				override readonly onDidOutput = output.event;
				override readonly onDidRelayMessage = Event.None;
				override readonly onDidRelayClose = Event.None;
				override readonly onDidCloseConnection = Event.None;
				override async connect(config: IDevContainerAgentHostConfig) {
					return { ...config, address: 'devcontainer:container', remoteWorkspaceFolder: '/workspaces/project' };
				}
				override async disconnect(id: string): Promise<void> { disconnected.push(id); }
			}();
			return { output, service };
		};
		const first = createSource();
		const second = createSource();
		let current = first;
		const relay = store.add(new RemoteDevContainerService(async () => current.service, store.add(new NullLogService())));
		const output: string[] = [];
		store.add(relay.onDidOutput(event => output.push(event.data)));
		await relay.connect({ connectionId: 'first', workspaceFolder: '/project', name: 'Project' });
		first.output.fire({ connectionId: 'first', data: 'first source' });
		first.output.fire({ connectionId: 'unrelated', data: 'unrelated connection' });
		await relay.disconnect('first');
		current = second;
		await relay.connect({ connectionId: 'second', workspaceFolder: '/project', name: 'Project' });
		first.output.fire({ connectionId: 'first', data: 'stale source' });
		second.output.fire({ connectionId: 'second', data: 'second source' });
		await relay.disconnect('second');
		assert.deepStrictEqual({ output, disconnected }, {
			output: ['first source', 'second source'],
			disconnected: ['first', 'second'],
		});
	});

	for (const entry of [
		{ name: 'SSH Host', connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:server', hostName: 'server' } },
		{ name: 'Tunnel Host', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'server', clusterId: 'region' } },
		{ name: 'WSL Host', connection: { type: RemoteAgentHostEntryType.WSL, address: 'wsl:Ubuntu', distro: 'Ubuntu' } },
	] satisfies IRemoteAgentHostEntry[]) {
		test(`checks Docker and starts containers on the ${entry.name}, not the desktop`, async () => {
			const workspaceUri = URI.from({ scheme: AGENT_HOST_SCHEME, authority: agentHostAuthority(getEntryAddress(entry)), path: '/remote/project' });
			const configs: IDevContainerAgentHostConfig[] = [];
			const disconnected: string[] = [];
			const outputs = store.add(new Emitter<{ connectionId: string; data: string }>());
			const output: string[] = [];
			let dockerChecks = 0;
			let dockerAvailable = true;
			let supported = true;
			const remoteService = new class extends mock<IDevContainerAgentHostMainService>() {
				override readonly onDidOutput = outputs.event;
				override readonly onDidRelayMessage = Event.None;
				override readonly onDidRelayClose = Event.None;
				override readonly onDidCloseConnection = Event.None;
				override async isDockerAvailable(): Promise<boolean> {
					dockerChecks++;
					return dockerAvailable;
				}
				override async connect(config: IDevContainerAgentHostConfig) {
					configs.push(config);
					outputs.fire({ connectionId: config.connectionId, data: 'remote container output' });
					return { connectionId: config.connectionId, address: 'devcontainer:container', name: config.name, remoteWorkspaceFolder: '/workspaces/project' };
				}
				override async disconnect(id: string): Promise<void> {
					disconnected.push(id);
				}
			}();
			const connection = new class extends mock<IAgentConnection>() {
				override get initializeResult() {
					return constObservable({ _meta: supported ? { 'vscode.devContainers': true } : {} } as ReturnType<IAgentConnection['initializeResult']['get']>);
				}
				override readonly devContainerService = remoteService;
			}();
			const connector = new DevContainerAgentHostConnector(
				new class extends mock<ISharedProcessService>() {
					override getChannel(): IChannel {
						return new class extends mock<IChannel>() {
							override async call<T>(): Promise<T> { throw new Error('Must not run Docker locally'); }
						}();
					}
				}(),
				store.add(new TestInstantiationService()),
				new class extends mock<ILogService>() { }(),
				new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: true, [RemoteAgentHostsEnabledSettingId]: true }),
				new class extends mock<IEnvironmentService>() { }(),
				new class extends mock<IOutputService>() {
					override getChannel(): IOutputChannel {
						return new class extends mock<IOutputChannel>() {
							override append(value: string): void { output.push(value); }
						}();
					}
				}(),
				new class extends mock<IFileService>() {
					override async exists(uri: URI): Promise<boolean> {
						assert.strictEqual(uri.authority, workspaceUri.authority);
						return uri.path.endsWith('/.devcontainer/devcontainer.json');
					}
				}(),
				new class extends mock<IRemoteAgentHostService>() {
					override readonly configuredEntries = [entry];
					override getConnection(): IAgentConnection { return connection; }
				}(),
				new class extends mock<ISessionsProvidersService>() { }(),
			);
			const available = await connector.isAvailable(workspaceUri);
			supported = false;
			const oldHostAvailable = await connector.isAvailable(workspaceUri);
			supported = true;
			dockerAvailable = false;
			const withoutDocker = await connector.isAvailable(workspaceUri);
			dockerAvailable = true;
			const target = await connector.createConnection(workspaceUri, 'devcontainer:test', CancellationToken.None);
			target.transportDisposable?.dispose();
			await Promise.resolve();
			assert.deepStrictEqual({
				available, oldHostAvailable, withoutDocker, dockerChecks,
				workspaces: configs.map(config => config.workspaceFolder),
				output: output.filter(value => value === 'remote container output'),
				workspace: target.workspaceUri,
				disconnected: disconnected.length,
			}, {
				available: true, oldHostAvailable: false, withoutDocker: false, dockerChecks: 2,
				workspaces: ['/remote/project'],
				output: ['remote container output'],
				workspace: URI.from({ scheme: AGENT_HOST_SCHEME, authority: agentHostAuthority('devcontainer:test'), path: '/workspaces/project' }),
				disconnected: 1,
			});
		});
	}

	test('reports the disabled setting after resolving unique recent local folders', async () => {
		const historyLoadState = observableValue<WorkspaceHistoryLoadState>({}, 'loading');
		const folder = (root: URI) => new class extends mock<ISessionFolder>() {
			override readonly root = root;
		}();
		const workspace = (root: URI) => new class extends mock<ISessionWorkspace>() {
			override readonly folders = [folder(root)];
		}();
		const recentWorkspace = (workspace: ISessionWorkspace): IRecentWorkspace => ({
			workspace,
			providerId: 'local-agent-host',
			checked: false,
			source: 'vscode',
		});
		const recentWorkspacesService = new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly historyLoadState = historyLoadState;
			override getRecentWorkspaces(): IRecentWorkspace[] {
				return [
					recentWorkspace(workspace(URI.file('/first'))),
					recentWorkspace(workspace(URI.file('/second'))),
					recentWorkspace(workspace(URI.file('/first'))),
					recentWorkspace(workspace(URI.parse('vscode-remote://host/remote'))),
				];
			}
		}();
		const environmentInputs: string[][] = [];
		const events: Array<{ eventName: string; data: ITelemetryData | undefined }> = [];
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.USAGE;
			override publicLog2(eventName: string, data?: ITelemetryData): void {
				events.push({ eventName, data });
			}
		}();
		const report = reportDevContainerEnvironment(
			recentWorkspacesService,
			async workspaceUris => {
				environmentInputs.push(workspaceUris.map(uri => uri.path));
				return { dockerAvailable: true, devContainerFolderCount: 1 };
			},
			new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: false }),
			telemetryService,
		);
		await Promise.resolve();
		const beforeHistoryLoaded = { environmentInputs: [...environmentInputs], events: [...events] };

		historyLoadState.set('loaded', undefined);
		await report;

		assert.deepStrictEqual({
			beforeHistoryLoaded,
			environmentInputs,
			events,
		}, {
			beforeHistoryLoaded: { environmentInputs: [], events: [] },
			environmentInputs: [['/first', '/second']],
			events: [{
				eventName: 'vscodeAgents.devContainer/environment',
				data: { dockerAvailable: true, devContainerFolderCount: 1, devContainerEnabled: false },
			}],
		});
	});

	test('does not inspect recent workspaces when usage telemetry is disabled', async () => {
		const calls: string[] = [];
		const recentWorkspacesService = new class extends mock<ISessionsRecentWorkspacesService>() {
			override readonly historyLoadState = observableValue<WorkspaceHistoryLoadState>({}, 'loading');
			override getRecentWorkspaces(): IRecentWorkspace[] {
				calls.push('getRecentWorkspaces');
				return [];
			}
		}();
		const telemetryService = new class extends mock<ITelemetryService>() {
			override readonly telemetryLevel = TelemetryLevel.ERROR;
			override publicLog2(): void {
				calls.push('publicLog2');
			}
		}();

		await reportDevContainerEnvironment(
			recentWorkspacesService,
			async () => {
				calls.push('getEnvironment');
				return { dockerAvailable: true, devContainerFolderCount: 0 };
			},
			new TestConfigurationService({ [DevContainerAgentHostEnabledSettingId]: false }),
			telemetryService,
		);

		assert.deepStrictEqual(calls, []);
	});

	test('registers a disabled-by-default user setting', () => {
		assert.deepStrictEqual({
			default: devContainerAgentHostEnabledProperty.default,
			scope: devContainerAgentHostEnabledProperty.scope,
			tags: devContainerAgentHostEnabledProperty.tags,
			experiment: devContainerAgentHostEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('registers a hidden experimental setting for combining Dev Containers and worktrees', () => {
		assert.deepStrictEqual({
			default: devContainerWorktreeEnabledProperty.default,
			scope: devContainerWorktreeEnabledProperty.scope,
			tags: devContainerWorktreeEnabledProperty.tags,
			experiment: devContainerWorktreeEnabledProperty.experiment,
		}, {
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental', 'onExP'],
			experiment: { mode: 'auto' },
		});
	});

	test('rejects connections when Dev Container or remote Agent Hosts are disabled', () => {
		const configurationService = (devContainerAgentHostsEnabled: boolean, remoteAgentHostsEnabled: boolean) => new TestConfigurationService({
			[DevContainerAgentHostEnabledSettingId]: devContainerAgentHostsEnabled,
			[RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled,
		});

		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(false, true)), /Dev Container Agent Host connections are not enabled/);
		assert.throws(() => ensureDevContainerAgentHostsEnabled(configurationService(true, false)), /Remote Agent Host connections are not enabled/);
	});

	async function connectWithFailure(error: Error, token: CancellationToken, onConnect?: () => void): Promise<string[]> {
		const calls: string[] = [];
		const channel = new class extends mock<IChannel>() {
			override call<T>(command: string): Promise<T> {
				calls.push(command);
				if (command === 'connect') {
					onConnect?.();
					return Promise.reject(error);
				}
				return Promise.resolve(undefined as T);
			}

			override listen<T>(): Event<T> {
				return Event.None;
			}
		}();
		const sharedProcessService = new class extends mock<ISharedProcessService>() {
			override getChannel(): IChannel {
				return channel;
			}
		}();
		const outputService = new class extends mock<IOutputService>() {
			override getChannel(id: string): IOutputChannel {
				calls.push(`get:${id}`);
				return new class extends mock<IOutputChannel>() {
					override append(): void { }
				}();
			}

			override async showChannel(id: string, preserveFocus?: boolean): Promise<void> {
				calls.push(`show:${id}:${preserveFocus}`);
			}
		}();
		const connector = new DevContainerAgentHostConnector(
			sharedProcessService,
			new TestInstantiationService(),
			new class extends mock<ILogService>() { }(),
			new TestConfigurationService({
				[DevContainerAgentHostEnabledSettingId]: true,
				[RemoteAgentHostsEnabledSettingId]: true,
			}),
			new class extends mock<IEnvironmentService>() { }(),
			outputService,
			new class extends mock<IFileService>() { }(),
			new class extends mock<IRemoteAgentHostService>() { }(),
			new class extends mock<ISessionsProvidersService>() { }(),
		);

		await assert.rejects(
			connector.createConnection(URI.file('/workspace'), 'devcontainer:test', token),
			error,
		);
		return calls.map(call => call.replace(/devContainer\.[^:]+/, 'devContainer.<workspace>'));
	}

	test('reveals the Dev Container output channel when setup fails', async () => {
		const setupError = new Error('Dev Container setup failed');

		assert.deepStrictEqual(await connectWithFailure(setupError, CancellationToken.None), [
			'get:devContainer.<workspace>',
			'connect',
			'show:devContainer.<workspace>:true',
			'disconnect',
		]);
	});

	test('does not reveal the Dev Container output channel when setup is canceled', async () => {
		const canceledError = new Error('Canceled');
		canceledError.name = 'Canceled';
		const tokenSource = new CancellationTokenSource();
		try {
			assert.deepStrictEqual({
				serializedCancellation: await connectWithFailure(canceledError, CancellationToken.None),
				canceledToken: await connectWithFailure(new Error('Setup stopped'), tokenSource.token, () => tokenSource.cancel()),
			}, {
				serializedCancellation: ['get:devContainer.<workspace>', 'connect', 'disconnect'],
				canceledToken: ['get:devContainer.<workspace>', 'connect', 'disconnect', 'disconnect'],
			});
		} finally {
			tokenSource.dispose();
		}
	});
});
