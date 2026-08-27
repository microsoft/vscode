/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue, waitForState } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { StorageScope } from '../../../../../platform/storage/common/storage.js';
import { makeMcpServerCustomization, PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { McpServerType } from '../../../../../platform/mcp/common/mcpPlatformTypes.js';
import { IWorkspace, IWorkspaceContextService, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../platform/workspace/common/workspace.js';
import { testWorkspace } from '../../../../../platform/workspace/test/common/testWorkspace.js';
import { IRemoteAgentConnection, IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { AgentPluginDiscoveryOrigin, IAgentPlugin, IAgentPluginService } from '../../../chat/common/plugins/agentPluginService.js';
import { DiscoverySource, mcpDiscoverySection } from '../../common/mcpConfiguration.js';
import { IMcpRegistry } from '../../common/mcpRegistryTypes.js';
import { FilesystemMcpDiscovery, WritableMcpCollectionDefinition } from '../../common/discovery/nativeMcpDiscoveryAbstract.js';
import { RemoteNativeMpcDiscovery } from '../../common/discovery/nativeMcpRemoteDiscovery.js';
import { PluginMcpDiscovery } from '../../common/discovery/pluginMcpDiscovery.js';
import { WorkspaceDotMcpDiscovery } from '../../common/discovery/workspaceDotMcpDiscovery.js';
import { McpCollectionSortOrder, McpDiscoveryFormat, McpDiscoveryHost, McpDiscoveryScope, McpDiscoverySource, McpServerDefinition, McpServerLaunch, McpServerTransportType, McpServerTrust } from '../../common/mcpTypes.js';

class DelayedReadProvider extends InMemoryFileSystemProvider {
	readonly readBarrier = new DeferredPromise<void>();

	override async readFile(resource: URI): Promise<Uint8Array> {
		const result = await super.readFile(resource);
		await this.readBarrier.p;
		return result;
	}
}

class TestFilesystemMcpDiscovery extends FilesystemMcpDiscovery {
	private readonly file = URI.from({ scheme: 'test', path: '/mcp.json' });

	constructor(
		configurationService: TestConfigurationService,
		fileService: FileService,
		registry: IMcpRegistry,
	) {
		super(configurationService, fileService, registry);
	}

	start(): void {
		const collection: WritableMcpCollectionDefinition = {
			id: 'test',
			label: 'Test',
			remoteAuthority: null,
			scope: StorageScope.PROFILE,
			configTarget: ConfigurationTarget.USER,
			trustBehavior: McpServerTrust.Kind.Trusted,
			serverDefinitions: observableValue(this, []),
			order: McpCollectionSortOrder.Filesystem,
			discovery: {
				source: McpDiscoverySource.CursorGlobal,
				format: McpDiscoveryFormat.ClaudeMcpServers,
				scope: McpDiscoveryScope.Profile,
				host: McpDiscoveryHost.Local,
			},
		};
		this._register(this.watchFile(this.file, collection, DiscoverySource.CursorGlobal, async () => [createServerDefinition()]));
		this.completeTelemetryRegistration();
	}
}

class MutableWorkspaceService extends mock<IWorkspaceContextService>() {
	declare readonly _serviceBrand: undefined;
	private workspace: IWorkspace;
	private readonly changeEmitter: Emitter<IWorkspaceFoldersChangeEvent>;
	override readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent>;

	constructor(store: DisposableStore, root: URI) {
		super();
		this.workspace = testWorkspace(root);
		this.changeEmitter = store.add(new Emitter<IWorkspaceFoldersChangeEvent>());
		this.onDidChangeWorkspaceFolders = this.changeEmitter.event;
	}

	override getWorkspace(): IWorkspace {
		return this.workspace;
	}

	remove(folder: IWorkspaceFolder): void {
		this.workspace = testWorkspace();
		this.changeEmitter.fire({ added: [], removed: [folder], changed: [] });
	}
}

function createServerDefinition(): McpServerDefinition {
	const launch: McpServerLaunch = {
		type: McpServerTransportType.Stdio,
		command: 'server',
		args: [],
		env: {},
		envFile: undefined,
		cwd: undefined,
		sandbox: undefined,
	};
	return { id: 'server', label: 'Server', launch, cacheNonce: '1' };
}

function fireConfigurationChange(configurationService: TestConfigurationService): void {
	configurationService.onDidChangeConfigurationEmitter.fire({
		source: ConfigurationTarget.USER,
		affectedKeys: new Set([mcpDiscoverySection]),
		change: { keys: [mcpDiscoverySection], overrides: [] },
		affectsConfiguration: key => key === mcpDiscoverySection,
	} satisfies IConfigurationChangeEvent);
}

suite('MCP discovery telemetry lifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('disabled filesystem discovery cannot be overwritten by an in-flight read', async () => {
		const provider = store.add(new DelayedReadProvider());
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('test', provider));
		await fileService.writeFile(URI.from({ scheme: 'test', path: '/mcp.json' }), VSBuffer.fromString('{}'));
		const configurationService = new TestConfigurationService({
			[mcpDiscoverySection]: { [DiscoverySource.CursorGlobal]: true },
		});
		let registrations = 0;
		const discovery = store.add(new TestFilesystemMcpDiscovery(configurationService, fileService, upcastPartial<IMcpRegistry>({
			registerCollection: () => {
				registrations++;
				return Disposable.None;
			},
		})));
		discovery.start();

		await configurationService.setUserConfiguration(mcpDiscoverySection, { [DiscoverySource.CursorGlobal]: false });
		fireConfigurationChange(configurationService);
		provider.readBarrier.complete();
		await timeout(0);

		assert.deepStrictEqual({
			snapshot: discovery.telemetrySnapshot.get(),
			registrations,
		}, {
			snapshot: { candidates: [], configurations: [] },
			registrations: 0,
		});
	});

	test('removed workspace folders cannot be reinserted by an in-flight read', async () => {
		const root = URI.from({ scheme: 'test', path: '/workspace' });
		const provider = store.add(new DelayedReadProvider());
		const fileService = store.add(new FileService(new NullLogService()));
		store.add(fileService.registerProvider('test', provider));
		await fileService.writeFile(URI.joinPath(root, '.mcp.json'), VSBuffer.fromString(JSON.stringify({ mcpServers: { server: { command: 'server' } } })));
		const workspaceServiceStore = store.add(new DisposableStore());
		const workspaceService = new MutableWorkspaceService(workspaceServiceStore, root);
		let registrations = 0;
		const discovery = store.add(new WorkspaceDotMcpDiscovery(
			fileService,
			workspaceService,
			upcastPartial<IMcpRegistry>({
				registerCollection: () => {
					registrations++;
					return Disposable.None;
				},
			}),
			upcastPartial<IRemoteAgentService>({ getConnection: () => null }),
		));
		const [folder] = workspaceService.getWorkspace().folders;
		discovery.start();

		workspaceService.remove(folder);
		provider.readBarrier.complete();
		const snapshot = await waitForState(discovery.telemetrySnapshot, value => value !== undefined);
		await timeout(0);

		assert.deepStrictEqual({
			snapshot,
			registrations,
		}, {
			snapshot: { candidates: [], configurations: [] },
			registrations: 0,
		});
	});

	test('remote discovery publishes a terminal snapshot when channel startup fails', async () => {
		const fileService = store.add(new FileService(new NullLogService()));
		const connection = upcastPartial<IRemoteAgentConnection>({
			remoteAuthority: 'remote',
			withChannel: async () => { throw new Error('channel failed'); },
		});
		const discovery = store.add(new RemoteNativeMpcDiscovery(
			upcastPartial<IRemoteAgentService>({ getConnection: () => connection }),
			new NullLogService(),
			upcastPartial<ILabelService>({ getHostLabel: () => 'Remote' }),
			fileService,
			store.add(new TestInstantiationService()),
			upcastPartial<IMcpRegistry>({}),
			new TestConfigurationService(),
		));

		await discovery.start();

		assert.deepStrictEqual(discovery.telemetrySnapshot.get(), { candidates: [], configurations: [] });
	});

	test('plugin MCP registration does not wait for unrelated component telemetry', () => {
		const pluginUri = URI.file('/plugin');
		const mcpUri = URI.joinPath(pluginUri, '.mcp.json');
		const plugin: IAgentPlugin = {
			uri: pluginUri,
			format: PluginFormat.Copilot,
			discoveryOrigin: AgentPluginDiscoveryOrigin.ConfiguredPath,
			label: 'Plugin',
			enablement: constObservable(ContributionEnablementState.EnabledProfile),
			hooks: constObservable([]),
			commands: observableValue('pendingCommands', []),
			skills: constObservable([]),
			agents: constObservable([]),
			instructions: constObservable([]),
			mcpServerDefinitions: constObservable([{
				name: 'server',
				uri: mcpUri,
				configuration: { type: McpServerType.LOCAL, command: 'server' },
				customization: makeMcpServerCustomization(mcpUri, 'server'),
			}]),
			mcpDiscoveryResult: constObservable({
				serverDefinitions: [{
					name: 'server',
					uri: mcpUri,
					configuration: { type: McpServerType.LOCAL, command: 'server' },
					customization: makeMcpServerCustomization(mcpUri, 'server'),
				}],
				configurationPresent: 1,
				parseErrorCount: 0,
				unreadableCount: 0,
			}),
			mcpDiscoveryReady: constObservable(true),
		};
		let registrations = 0;
		const discovery = store.add(new PluginMcpDiscovery(
			upcastPartial<IAgentPluginService>({
				plugins: constObservable([plugin]),
				discoveredPlugins: constObservable([plugin]),
				discoveryComplete: constObservable(true),
				telemetryComplete: constObservable(false),
			}),
			upcastPartial<IMcpRegistry>({
				registerCollection: () => {
					registrations++;
					return Disposable.None;
				},
			}),
		));

		discovery.start();

		assert.deepStrictEqual({
			registrations,
			telemetryCandidates: discovery.telemetrySnapshot.get()?.candidates.length,
		}, {
			registrations: 1,
			telemetryCandidates: 1,
		});
	});
});
