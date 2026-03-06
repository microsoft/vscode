/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { PluginInstallService } from '../../../browser/pluginInstallService.js';
import { IAgentPluginRepositoryService, IEnsureRepositoryOptions, IPullRepositoryOptions } from '../../../common/plugins/agentPluginRepositoryService.js';
import { IMarketplacePlugin, IMarketplaceReference, IPluginMarketplaceService, IPluginSourceDescriptor, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { IPluginSource } from '../../../common/plugins/pluginSource.js';

suite('PluginInstallService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	// --- Factory helpers -------------------------------------------------------

	function makeMarketplaceRef(marketplace: string): IMarketplaceReference {
		const ref = parseMarketplaceReference(marketplace);
		assert.ok(ref);
		return ref!;
	}

	function createPlugin(overrides: Partial<IMarketplacePlugin> & { sourceDescriptor: IPluginSourceDescriptor }): IMarketplacePlugin {
		return {
			name: overrides.name ?? 'test-plugin',
			description: overrides.description ?? '',
			version: overrides.version ?? '',
			source: overrides.source ?? '',
			sourceDescriptor: overrides.sourceDescriptor,
			marketplace: overrides.marketplace ?? 'microsoft/vscode',
			marketplaceReference: overrides.marketplaceReference ?? makeMarketplaceRef('microsoft/vscode'),
			marketplaceType: overrides.marketplaceType ?? MarketplaceType.Copilot,
			readmeUri: overrides.readmeUri,
		};
	}

	// --- Mock tracking types ---------------------------------------------------

	interface MockState {
		notifications: { severity: number; message: string }[];
		addedPlugins: { uri: string; plugin: IMarketplacePlugin }[];
		dialogConfirmResult: boolean;
		fileExistsResult: boolean | ((uri: URI) => Promise<boolean>);
		ensureRepositoryResult: URI;
		ensurePluginSourceResult: URI;
		/** Plugin source install URI, per kind */
		pluginSourceInstallUris: Map<string, URI>;
		/** The commands that were sent to the terminal */
		terminalCommands: string[];
		/** Simulated exit code from terminal */
		terminalExitCode: number;
		/** Whether the terminal resolves the command completion at all */
		terminalCompletes: boolean;
		pullRepositoryCalls: { marketplace: IMarketplaceReference; options?: IPullRepositoryOptions }[];
		updatePluginSourceCalls: { plugin: IMarketplacePlugin; options?: IPullRepositoryOptions }[];
		/** Whether the marketplace is already trusted */
		marketplaceTrusted: boolean;
		/** Canonical IDs that were trusted via trustMarketplace() */
		trustedMarketplaces: string[];
	}

	function createDefaults(): MockState {
		return {
			notifications: [],
			addedPlugins: [],
			dialogConfirmResult: true,
			fileExistsResult: true,
			ensureRepositoryResult: URI.file('/cache/agentPlugins/github.com/microsoft/vscode'),
			ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-package'),
			pluginSourceInstallUris: new Map(),
			terminalCommands: [],
			terminalExitCode: 0,
			terminalCompletes: true,
			pullRepositoryCalls: [],
			updatePluginSourceCalls: [],
			marketplaceTrusted: true,
			trustedMarketplaces: [],
		};
	}

	function createService(stateOverrides?: Partial<MockState>): { service: PluginInstallService; state: MockState } {
		const state: MockState = { ...createDefaults(), ...stateOverrides };
		const instantiationService = store.add(new TestInstantiationService());

		// IFileService
		instantiationService.stub(IFileService, {
			exists: async (resource: URI) => {
				if (typeof state.fileExistsResult === 'function') {
					return state.fileExistsResult(resource);
				}
				return state.fileExistsResult;
			},
		} as unknown as IFileService);

		// INotificationService
		instantiationService.stub(INotificationService, {
			notify: (notification: { severity: number; message: string }) => {
				state.notifications.push({ severity: notification.severity, message: notification.message });
				return undefined;
			},
		} as unknown as INotificationService);

		// IDialogService
		instantiationService.stub(IDialogService, {
			confirm: async () => ({ confirmed: state.dialogConfirmResult }),
		} as unknown as IDialogService);

		// ITerminalService — the mock coordinates runCommand and onCommandFinished
		// so the command ID matches, just like a real terminal would.
		instantiationService.stub(ITerminalService, {
			createTerminal: async () => {
				let finishedCallback: ((cmd: { id: string; exitCode: number }) => void) | undefined;
				return {
					processReady: Promise.resolve(),
					dispose: () => { },
					runCommand: (command: string, _addNewLine?: boolean) => {
						state.terminalCommands.push(command);
						// Simulate command completing after runCommand is called
						if (finishedCallback) {
							finishedCallback({ id: 'command', exitCode: state.terminalExitCode });
						}
					},
					capabilities: {
						get: () => state.terminalCompletes ? {
							onCommandFinished: (callback: (cmd: { id: string; exitCode: number }) => void) => {
								finishedCallback = callback;
								return { dispose() { } };
							},
						} : undefined,
						onDidAddCommandDetectionCapability: () => ({ dispose() { } }),
					},
				};
			},
			setActiveInstance: () => { },
		} as unknown as ITerminalService);

		// IProgressService
		instantiationService.stub(IProgressService, {
			withProgress: async (_options: unknown, callback: (...args: unknown[]) => Promise<unknown>) => callback(),
		} as unknown as IProgressService);

		// ILogService
		instantiationService.stub(ILogService, new NullLogService());

		// IAgentPluginRepositoryService
		// Build mock source repositories for npm/pip that simulate terminal-based install
		const makeMockPackageRepo = (kind: PluginSourceKind): IPluginSource => ({
			kind,
			getCleanupTarget: () => URI.file('/mock-cleanup'),
			getInstallUri: () => URI.file('/mock'),
			ensure: async () => state.ensurePluginSourceResult,
			update: async () => { },
			getLabel: (d) => kind === PluginSourceKind.Npm ? (d as { package: string }).package : (d as { package: string }).package,
			runInstall: async (_installDir: URI, pluginDir: URI, plugin: IMarketplacePlugin) => {
				// Simulate confirmation dialog
				if (!state.dialogConfirmResult) {
					return undefined;
				}

				// Simulate building and running the command
				const descriptor = plugin.sourceDescriptor;
				let args: string[];
				if (kind === PluginSourceKind.Npm) {
					const npm = descriptor as { package: string; version?: string; registry?: string };
					const packageSpec = npm.version ? `${npm.package}@${npm.version}` : npm.package;
					args = ['npm', 'install', '--prefix', _installDir.fsPath, packageSpec];
					if (npm.registry) {
						args.push('--registry', npm.registry);
					}
				} else {
					const pip = descriptor as { package: string; version?: string; registry?: string };
					const packageSpec = pip.version ? `${pip.package}==${pip.version}` : pip.package;
					args = ['pip', 'install', '--target', _installDir.fsPath, packageSpec];
					if (pip.registry) {
						args.push('--index-url', pip.registry);
					}
				}
				const command = args.join(' ');
				state.terminalCommands.push(command);

				if (state.terminalExitCode !== 0) {
					state.notifications.push({ severity: 3, message: `Plugin installation command failed: Command exited with code ${state.terminalExitCode}` });
					return undefined;
				}

				// Check if plugin dir exists
				const exists = typeof state.fileExistsResult === 'function'
					? await state.fileExistsResult(pluginDir)
					: state.fileExistsResult;
				if (!exists) {
					const label = kind === PluginSourceKind.Npm ? 'npm' : 'pip';
					const pkg = (descriptor as { package: string }).package;
					state.notifications.push({ severity: 3, message: `${label} package '${pkg}' was not found after installation.` });
					return undefined;
				}

				return { pluginDir };
			},
		});

		const mockSourceRepos = new Map<PluginSourceKind, IPluginSource>([
			[PluginSourceKind.RelativePath, { kind: PluginSourceKind.RelativePath, getCleanupTarget: () => undefined, getInstallUri: () => { throw new Error(); }, ensure: async () => { throw new Error(); }, update: async () => { throw new Error(); }, getLabel: (d) => (d as { path: string }).path || '.' }],
			[PluginSourceKind.GitHub, { kind: PluginSourceKind.GitHub, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => { }, getLabel: (d) => (d as { repo: string }).repo }],
			[PluginSourceKind.GitUrl, { kind: PluginSourceKind.GitUrl, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => { }, getLabel: (d) => (d as { url: string }).url }],
			[PluginSourceKind.Npm, makeMockPackageRepo(PluginSourceKind.Npm)],
			[PluginSourceKind.Pip, makeMockPackageRepo(PluginSourceKind.Pip)],
		]);

		instantiationService.stub(IAgentPluginRepositoryService, {
			getPluginInstallUri: (plugin: IMarketplacePlugin) => {
				return URI.joinPath(state.ensureRepositoryResult, plugin.source);
			},
			getRepositoryUri: () => state.ensureRepositoryResult,
			ensureRepository: async (_marketplace: IMarketplaceReference, _options?: IEnsureRepositoryOptions) => {
				return state.ensureRepositoryResult;
			},
			pullRepository: async (marketplace: IMarketplaceReference, options?: IPullRepositoryOptions) => {
				state.pullRepositoryCalls.push({ marketplace, options });
			},
			getPluginSourceInstallUri: (descriptor: IPluginSourceDescriptor) => {
				const key = descriptor.kind;
				return state.pluginSourceInstallUris.get(key) ?? URI.file(`/cache/agentPlugins/${key}/default`);
			},
			ensurePluginSource: async () => state.ensurePluginSourceResult,
			updatePluginSource: async (plugin: IMarketplacePlugin, options?: IPullRepositoryOptions) => {
				state.updatePluginSourceCalls.push({ plugin, options });
			},
			getPluginSource: (kind: PluginSourceKind) => mockSourceRepos.get(kind)!,
			cleanupPluginSource: async () => { },
		} as unknown as IAgentPluginRepositoryService);

		// IPluginMarketplaceService
		instantiationService.stub(IPluginMarketplaceService, {
			addInstalledPlugin: (uri: URI, plugin: IMarketplacePlugin) => {
				state.addedPlugins.push({ uri: uri.toString(), plugin });
			},
			isMarketplaceTrusted: () => state.marketplaceTrusted,
			trustMarketplace: (ref: IMarketplaceReference) => {
				state.trustedMarketplaces.push(ref.canonicalId);
			},
		} as unknown as IPluginMarketplaceService);

		const service = instantiationService.createInstance(PluginInstallService);
		return { service, state };
	}

	// =========================================================================
	// getPluginInstallUri
	// =========================================================================

	suite('getPluginInstallUri', () => {

		test('delegates to getPluginInstallUri for relative-path plugins', () => {
			const { service } = createService();
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});
			const uri = service.getPluginInstallUri(plugin);
			assert.strictEqual(uri.path, '/cache/agentPlugins/github.com/microsoft/vscode/plugins/myPlugin');
		});

		test('delegates to getPluginSourceInstallUri for npm plugins', () => {
			const npmUri = URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg');
			const { service } = createService({
				pluginSourceInstallUris: new Map([['npm', npmUri]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});
			const uri = service.getPluginInstallUri(plugin);
			assert.strictEqual(uri.path, npmUri.path);
		});

		test('delegates to getPluginSourceInstallUri for pip plugins', () => {
			const pipUri = URI.file('/cache/agentPlugins/pip/my-pkg');
			const { service } = createService({
				pluginSourceInstallUris: new Map([['pip', pipUri]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});
			const uri = service.getPluginInstallUri(plugin);
			assert.strictEqual(uri.path, pipUri.path);
		});

		test('delegates to getPluginSourceInstallUri for github plugins', () => {
			const ghUri = URI.file('/cache/agentPlugins/github.com/owner/repo');
			const { service } = createService({
				pluginSourceInstallUris: new Map([['github', ghUri]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
			});
			const uri = service.getPluginInstallUri(plugin);
			assert.strictEqual(uri.path, ghUri.path);
		});
	});

	// =========================================================================
	// installPlugin — relative path
	// =========================================================================

	suite('installPlugin — relative path', () => {

		test('installs a relative-path plugin when directory exists', async () => {
			const { service, state } = createService();
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.ok(state.addedPlugins[0].uri.includes('plugins/myPlugin'));
			assert.strictEqual(state.notifications.length, 0);
		});

		test('notifies error when plugin directory does not exist', async () => {
			const { service, state } = createService({ fileExistsResult: false });
			const plugin = createPlugin({
				source: 'plugins/missing',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/missing' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.notifications.length, 1);
			assert.ok(state.notifications[0].message.includes('not found'));
		});

		test('does not install when ensureRepository throws', async () => {
			const { state } = createService();
			// Override ensureRepository to throw
			const instantiationService = store.add(new TestInstantiationService());
			const repoService = {
				ensureRepository: async () => { throw new Error('clone failed'); },
				getPluginInstallUri: () => URI.file('/x'),
				getPluginSourceInstallUri: () => URI.file('/x'),
			};
			instantiationService.stub(IAgentPluginRepositoryService, repoService as unknown as IAgentPluginRepositoryService);
			instantiationService.stub(IFileService, { exists: async () => true } as unknown as IFileService);
			instantiationService.stub(INotificationService, { notify: (n: { severity: number; message: string }) => { state.notifications.push(n); } } as unknown as INotificationService);
			instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: true }) } as unknown as IDialogService);
			instantiationService.stub(ITerminalService, {} as unknown as ITerminalService);
			instantiationService.stub(IProgressService, { withProgress: async (_o: unknown, cb: () => Promise<unknown>) => cb() } as unknown as IProgressService);
			instantiationService.stub(ILogService, new NullLogService());
			instantiationService.stub(IPluginMarketplaceService, { addInstalledPlugin: () => { } } as unknown as IPluginMarketplaceService);
			instantiationService.stub(IPluginMarketplaceService, 'isMarketplaceTrusted', () => true);
			instantiationService.stub(IPluginMarketplaceService, 'trustMarketplace', () => { });
			const svc = instantiationService.createInstance(PluginInstallService);

			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});
			await svc.installPlugin(plugin);

			// Should return without installing or crashing
			assert.strictEqual(state.addedPlugins.length, 0);
		});
	});

	// =========================================================================
	// installPlugin — GitHub / GitUrl
	// =========================================================================

	suite('installPlugin — git sources', () => {

		test('installs a GitHub plugin when source exists after clone', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/repo'),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.notifications.length, 0);
		});

		test('installs a GitUrl plugin when source exists after clone', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/example.com/repo'),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.notifications.length, 0);
		});

		test('notifies error when cloned directory does not exist', async () => {
			const { service, state } = createService({
				fileExistsResult: false,
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/repo'),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.notifications.length, 1);
			assert.ok(state.notifications[0].message.includes('not found'));
		});
	});

	// =========================================================================
	// installPlugin — npm
	// =========================================================================

	suite('installPlugin — npm', () => {

		test('runs npm install and registers plugin on success', async () => {
			const npmInstallUri = URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg');
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				pluginSourceInstallUris: new Map([['npm', npmInstallUri]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('npm'));
			assert.ok(state.terminalCommands[0].includes('install'));
			assert.ok(state.terminalCommands[0].includes('my-pkg'));
			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.notifications.length, 0);
		});

		test('includes version in npm install command', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg', version: '1.2.3' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('my-pkg@1.2.3'));
		});

		test('includes registry in npm install command', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg', registry: 'https://custom.registry.com' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('--registry'));
			assert.ok(state.terminalCommands[0].includes('https://custom.registry.com'));
		});

		test('does not install when user declines confirmation', async () => {
			const { service, state } = createService({ dialogConfirmResult: false });
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('notifies error when npm package directory not found after install', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				// exists returns true for ensurePluginSource but false for the final check
				fileExistsResult: false,
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.notifications.length, 1);
			assert.ok(state.notifications[0].message.includes('not found'));
		});

		test('notifies error when terminal command fails with non-zero exit code', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				terminalExitCode: 1,
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.notifications.length, 1);
			assert.ok(state.notifications[0].message.includes('failed'));
		});
	});

	// =========================================================================
	// installPlugin — pip
	// =========================================================================

	suite('installPlugin — pip', () => {

		test('runs pip install and registers plugin on success', async () => {
			const pipInstallUri = URI.file('/cache/agentPlugins/pip/my-pkg');
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				pluginSourceInstallUris: new Map([['pip', pipInstallUri]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('pip'));
			assert.ok(state.terminalCommands[0].includes('install'));
			assert.ok(state.terminalCommands[0].includes('my-pkg'));
			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.notifications.length, 0);
		});

		test('includes version with == syntax in pip install command', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg', version: '2.0.0' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('my-pkg==2.0.0'));
		});

		test('includes registry with --index-url in pip install command', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg', registry: 'https://pypi.custom.com/simple' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('--index-url'));
			assert.ok(state.terminalCommands[0].includes('https://pypi.custom.com/simple'));
		});

		test('does not install when user declines confirmation', async () => {
			const { service, state } = createService({ dialogConfirmResult: false });
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('notifies error when pip package directory not found after install', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				fileExistsResult: false,
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.notifications.length, 1);
			assert.ok(state.notifications[0].message.includes('not found'));
		});
	});

	// =========================================================================
	// updatePlugin
	// =========================================================================

	suite('updatePlugin', () => {

		test('calls updatePluginSource for relative-path plugins', async () => {
			const { service, state } = createService();
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});

			await service.updatePlugin(plugin);

			assert.strictEqual(state.updatePluginSourceCalls.length, 1);
		});

		test('calls updatePluginSource for GitHub plugins', async () => {
			const { service, state } = createService();
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
			});

			await service.updatePlugin(plugin);

			assert.strictEqual(state.updatePluginSourceCalls.length, 1);
		});

		test('calls updatePluginSource for GitUrl plugins', async () => {
			const { service, state } = createService();
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git' },
			});

			await service.updatePlugin(plugin);

			assert.strictEqual(state.updatePluginSourceCalls.length, 1);
		});

		test('re-installs for npm plugin updates', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			await service.updatePlugin(plugin);

			// npm update goes through the same install flow
			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('npm'));
		});

		test('re-installs for pip plugin updates', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});

			await service.updatePlugin(plugin);

			assert.strictEqual(state.terminalCommands.length, 1);
			assert.ok(state.terminalCommands[0].includes('pip'));
		});
	});

	// =========================================================================
	// installPlugin — marketplace trust
	// =========================================================================

	suite('installPlugin — marketplace trust', () => {

		test('skips trust prompt when marketplace is already trusted', async () => {
			const { service, state } = createService({ marketplaceTrusted: true });
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.trustedMarketplaces.length, 0, 'should not re-trust');
		});

		test('shows trust prompt and installs when user confirms', async () => {
			const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: true });
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.trustedMarketplaces.length, 1);
			assert.strictEqual(state.addedPlugins.length, 1);
		});

		test('does not install when user declines trust', async () => {
			const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });
			const plugin = createPlugin({
				source: 'plugins/myPlugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' },
			});

			await service.installPlugin(plugin);

			assert.strictEqual(state.trustedMarketplaces.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('trust prompt applies to all source kinds', async () => {
			const { service, state } = createService({ marketplaceTrusted: false, dialogConfirmResult: false });

			const kinds: IPluginSourceDescriptor[] = [
				{ kind: PluginSourceKind.RelativePath, path: 'p' },
				{ kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
				{ kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git' },
				{ kind: PluginSourceKind.Npm, package: 'my-pkg' },
				{ kind: PluginSourceKind.Pip, package: 'my-pkg' },
			];

			for (const sourceDescriptor of kinds) {
				await service.installPlugin(createPlugin({ sourceDescriptor }));
			}

			assert.strictEqual(state.addedPlugins.length, 0, 'no plugins should be installed when trust is declined');
		});
	});
});
