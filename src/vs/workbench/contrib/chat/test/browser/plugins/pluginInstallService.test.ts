/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isEqual } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ITerminalService } from '../../../../terminal/browser/terminal.js';
import { PluginInstallService } from '../../../browser/pluginInstallService.js';
import { IAgentPluginRepositoryService, IEnsureRepositoryOptions, IPullRepositoryOptions } from '../../../common/plugins/agentPluginRepositoryService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { AgentPluginEnablementService, IAgentPluginEnablementService } from '../../../common/plugins/agentPluginEnablement.js';
import { IFetchMarketplacePluginsOptions, IMarketplaceInstalledPlugin, IMarketplacePlugin, IMarketplaceReference, IPluginMarketplaceService, IPluginSourceDescriptor, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
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
		onEnsureRepository?: (token: CancellationToken | undefined) => Promise<URI>;
		onTrustConfirmation?: () => Promise<boolean>;
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
		updatePluginSourceResult: boolean;
		onUpdatePluginSource?: () => Promise<boolean>;
		onEnsurePluginSource?: () => Promise<URI>;
		/** Whether the marketplace is already trusted */
		marketplaceTrusted: boolean;
		/** Whether the strict-marketplace enterprise policy is active */
		strictMarketplacePolicyActive?: boolean;
		installedPlugins: IMarketplaceInstalledPlugin[];
		durablePluginUris: URI[];
		removedPluginUris: string[];
		cleanupPluginSourceCalls: { plugin: IMarketplacePlugin; otherInstalledDescriptors: readonly IPluginSourceDescriptor[] }[];
		recordInstalledPlugins: boolean;
		ensurePluginSourceDescriptors: IPluginSourceDescriptor[];
		singlePluginManifestDirectories: URI[];
		fetchedMarketplacePlugins: IMarketplacePlugin[];
		fetchMarketplaceCalls: string[][];
		fetchMarketplaceOptions: (IFetchMarketplacePluginsOptions | undefined)[];
		autoUpdateByMarketplace: Map<string, boolean>;
		clearUpdatesAvailableCalls: number;
		/** Canonical IDs that were trusted via trustMarketplace() */
		trustedMarketplaces: string[];
		/** Plugins returned by readPluginsFromDirectory */
		readPluginsResult: IMarketplacePlugin[];
		/** Plugin returned by readSinglePluginManifest (single-plugin repo fallback) */
		singlePluginManifestResult: IMarketplacePlugin | undefined;
		/** Result of the quick pick dialog */
		quickPickResult: { label: string } | undefined;
		/** Result of the quick input dialog */
		quickInputResult: string | undefined;
		/** Current configured marketplace values */
		configuredMarketplaces: string[];
		/** Updated marketplace config values */
		updatedMarketplaces: string[] | undefined;
		/** Whether readResult resolves to a directory (IFileService.resolve) */
		resolveIsDirectory: boolean;
		resolveIsSymbolicLink: boolean;
		/** Whether the directory is a standalone plugin (isPluginDirectory) */
		isPluginDirectoryResult: boolean;
		/** Current configured plugin location values */
		configuredPluginLocations: Record<string, boolean>;
		/** Updated plugin location config values */
		updatedPluginLocations: Record<string, boolean> | undefined;
		/** User home directory used to expand `~` paths */
		userHome: string;
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
			updatePluginSourceResult: false,
			marketplaceTrusted: true,
			strictMarketplacePolicyActive: false,
			installedPlugins: [],
			durablePluginUris: [],
			removedPluginUris: [],
			cleanupPluginSourceCalls: [],
			recordInstalledPlugins: false,
			ensurePluginSourceDescriptors: [],
			singlePluginManifestDirectories: [],
			fetchedMarketplacePlugins: [],
			fetchMarketplaceCalls: [],
			fetchMarketplaceOptions: [],
			autoUpdateByMarketplace: new Map(),
			clearUpdatesAvailableCalls: 0,
			trustedMarketplaces: [],
			readPluginsResult: [],
			singlePluginManifestResult: undefined,
			quickPickResult: undefined,
			quickInputResult: undefined,
			configuredMarketplaces: [],
			updatedMarketplaces: undefined,
			resolveIsDirectory: true,
			resolveIsSymbolicLink: false,
			isPluginDirectoryResult: false,
			configuredPluginLocations: {},
			updatedPluginLocations: undefined,
			userHome: '/home/user',
		};
	}

	function createService(stateOverrides?: Partial<MockState>): { service: PluginInstallService; state: MockState; enablementService: IAgentPluginEnablementService } {
		const state: MockState = { ...createDefaults(), ...stateOverrides };
		if (stateOverrides?.durablePluginUris === undefined) {
			state.durablePluginUris = state.installedPlugins.map(candidate => candidate.pluginUri);
		}
		const instantiationService = store.add(new TestInstantiationService());
		const enablementService = store.add(new AgentPluginEnablementService(store.add(new InMemoryStorageService())));
		instantiationService.stub(IAgentPluginEnablementService, enablementService);

		// IFileService
		instantiationService.stub(IFileService, {
			exists: async (resource: URI) => {
				if (typeof state.fileExistsResult === 'function') {
					return state.fileExistsResult(resource);
				}
				return state.fileExistsResult;
			},
			resolve: async (resource: URI) => ({ resource, isDirectory: state.resolveIsDirectory, isSymbolicLink: state.resolveIsSymbolicLink }),
		} as unknown as IFileService);

		// INotificationService
		instantiationService.stub(INotificationService, {
			notify: (notification: { severity: number; message: string; actions?: { primary?: readonly { dispose(): void }[] } }) => {
				state.notifications.push({ severity: notification.severity, message: notification.message });
				notification.actions?.primary?.forEach(action => action.dispose());
				return undefined;
			},
		} as unknown as INotificationService);

		// IDialogService
		instantiationService.stub(IDialogService, {
			confirm: async () => ({ confirmed: state.onTrustConfirmation ? await state.onTrustConfirmation() : state.dialogConfirmResult }),
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
			update: async () => true,
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
			[PluginSourceKind.GitHub, { kind: PluginSourceKind.GitHub, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => true, getLabel: (d) => (d as { repo: string }).repo }],
			[PluginSourceKind.GitUrl, { kind: PluginSourceKind.GitUrl, getCleanupTarget: () => URI.file('/mock'), getInstallUri: () => URI.file('/mock'), ensure: async () => URI.file('/mock'), update: async () => true, getLabel: (d) => (d as { url: string }).url }],
			[PluginSourceKind.Npm, makeMockPackageRepo(PluginSourceKind.Npm)],
			[PluginSourceKind.Pip, makeMockPackageRepo(PluginSourceKind.Pip)],
		]);

		instantiationService.stub(IAgentPluginRepositoryService, {
			getPluginInstallUri: (plugin: IMarketplacePlugin) => {
				if (plugin.sourceDescriptor.kind !== PluginSourceKind.RelativePath) {
					return state.pluginSourceInstallUris.get(plugin.sourceDescriptor.kind) ?? URI.file(`/cache/agentPlugins/${plugin.sourceDescriptor.kind}/default`);
				}
				return URI.joinPath(state.ensureRepositoryResult, plugin.source);
			},
			getRepositoryUri: () => state.ensureRepositoryResult,
			ensureRepository: async (_marketplace: IMarketplaceReference, options?: IEnsureRepositoryOptions) => {
				return state.onEnsureRepository ? state.onEnsureRepository(options?.token) : state.ensureRepositoryResult;
			},
			pullRepository: async (marketplace: IMarketplaceReference, options?: IPullRepositoryOptions) => {
				state.pullRepositoryCalls.push({ marketplace, options });
			},
			getPluginSourceInstallUri: (descriptor: IPluginSourceDescriptor) => {
				const key = descriptor.kind;
				return state.pluginSourceInstallUris.get(key) ?? URI.file(`/cache/agentPlugins/${key}/default`);
			},
			ensurePluginSource: async (plugin: IMarketplacePlugin) => {
				state.ensurePluginSourceDescriptors.push(plugin.sourceDescriptor);
				return state.onEnsurePluginSource ? state.onEnsurePluginSource() : state.ensurePluginSourceResult;
			},
			updatePluginSource: async (plugin: IMarketplacePlugin, options?: IPullRepositoryOptions) => {
				state.updatePluginSourceCalls.push({ plugin, options });
				return state.onUpdatePluginSource ? state.onUpdatePluginSource() : state.updatePluginSourceResult;
			},
			getPluginSource: (kind: PluginSourceKind) => mockSourceRepos.get(kind)!,
			cleanupPluginSource: async (plugin: IMarketplacePlugin, otherInstalledDescriptors?: readonly IPluginSourceDescriptor[]) => {
				state.cleanupPluginSourceCalls.push({ plugin, otherInstalledDescriptors: otherInstalledDescriptors ?? [] });
			},
		} as unknown as IAgentPluginRepositoryService);

		// IPluginMarketplaceService
		const installedPlugins = observableValue('test.installedPlugins', state.installedPlugins);
		instantiationService.stub(IPluginMarketplaceService, {
			installedPlugins,
			addInstalledPlugin: (uri: URI, plugin: IMarketplacePlugin) => {
				state.addedPlugins.push({ uri: uri.toString(), plugin });
				state.durablePluginUris = [...state.durablePluginUris, uri];
				if (state.recordInstalledPlugins) {
					state.installedPlugins = [...state.installedPlugins, { pluginUri: uri, plugin }];
					installedPlugins.set(state.installedPlugins, undefined);
				}
			},
			removeInstalledPlugin: (uri: URI) => {
				if (!state.durablePluginUris.some(candidate => isEqual(candidate, uri))) {
					return false;
				}
				state.removedPluginUris.push(uri.toString());
				state.durablePluginUris = state.durablePluginUris.filter(candidate => !isEqual(candidate, uri));
				state.installedPlugins = state.installedPlugins.filter(candidate => !isEqual(candidate.pluginUri, uri));
				installedPlugins.set(state.installedPlugins, undefined);
				return true;
			},
			isMarketplaceTrusted: () => state.marketplaceTrusted,
			isStrictMarketplacePolicyActive: () => state.strictMarketplacePolicyActive ?? false,
			isMarketplaceAutoUpdateEnabled: (ref: IMarketplaceReference) => state.autoUpdateByMarketplace.get(ref.canonicalId) ?? true,
			fetchMarketplacePlugins: async (_token: CancellationToken, marketplaceIds?: ReadonlySet<string>, options?: IFetchMarketplacePluginsOptions) => {
				state.fetchMarketplaceCalls.push([...marketplaceIds ?? []]);
				state.fetchMarketplaceOptions.push(options);
				return state.fetchedMarketplacePlugins.filter(plugin => !marketplaceIds || marketplaceIds.has(plugin.marketplaceReference.canonicalId));
			},
			clearUpdatesAvailable: () => state.clearUpdatesAvailableCalls++,
			trustMarketplace: (ref: IMarketplaceReference) => {
				state.trustedMarketplaces.push(ref.canonicalId);
			},
			readPluginsFromDirectory: async () => state.readPluginsResult,
			readSinglePluginManifest: async (directory: URI) => {
				state.singlePluginManifestDirectories.push(directory);
				return state.singlePluginManifestResult;
			},
			isPluginDirectory: async () => state.isPluginDirectoryResult,
		} as unknown as IPluginMarketplaceService);

		// IConfigurationService
		instantiationService.stub(IConfigurationService, {
			getValue: (key: string) => {
				if (key === ChatConfiguration.PluginMarketplaces) {
					return state.configuredMarketplaces;
				}
				if (key === ChatConfiguration.PluginLocations) {
					return state.configuredPluginLocations;
				}
				return undefined;
			},
			inspect: (key: string) => {
				if (key === ChatConfiguration.PluginMarketplaces) {
					return { userValue: state.configuredMarketplaces, defaultValue: undefined, policyValue: undefined };
				}
				if (key === ChatConfiguration.PluginLocations) {
					return { userValue: state.configuredPluginLocations, defaultValue: undefined, policyValue: undefined };
				}
				return { userValue: undefined, defaultValue: undefined, policyValue: undefined };
			},
			updateValue: async (key: string, value: unknown) => {
				if (key === ChatConfiguration.PluginMarketplaces) {
					state.updatedMarketplaces = value as string[];
				}
				if (key === ChatConfiguration.PluginLocations) {
					state.updatedPluginLocations = value as Record<string, boolean>;
				}
			},
		} as unknown as IConfigurationService);

		// IPathService
		instantiationService.stub(IPathService, {
			userHome: async () => URI.file(state.userHome),
		} as unknown as IPathService);

		// IQuickInputService
		instantiationService.stub(IQuickInputService, {
			input: async () => state.quickInputResult,
			pick: async (picks: { label: string }[]) => {
				if (!state.quickPickResult) {
					return undefined;
				}
				return picks.find(p => p.label === state.quickPickResult!.label);
			},
		} as unknown as IQuickInputService);

		const service = instantiationService.createInstance(PluginInstallService);
		return { service, state, enablementService };
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

	suite('uninstallPlugin', () => {

		test('removes the exact entry and cleans its source with the remaining descriptors', async () => {
			const targetUri = URI.file('/cache/target');
			const otherUri = URI.file('/cache/other');
			const target = createPlugin({
				name: 'target',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/shared', path: 'plugins/target' },
			});
			const other = createPlugin({
				name: 'other',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/shared', path: 'plugins/other' },
			});
			const { service, state } = createService({
				installedPlugins: [
					{ pluginUri: targetUri, plugin: target },
					{ pluginUri: otherUri, plugin: other },
				],
			});

			const removed = await service.uninstallPlugin(targetUri);
			const missing = await service.uninstallPlugin(targetUri);

			assert.deepStrictEqual({
				removed,
				missing,
				removedPluginUris: state.removedPluginUris,
				remaining: state.installedPlugins.map(candidate => candidate.plugin.name),
				cleanup: state.cleanupPluginSourceCalls.map(call => ({
					plugin: call.plugin.name,
					otherInstalledDescriptors: call.otherInstalledDescriptors,
				})),
			}, {
				removed: true,
				missing: false,
				removedPluginUris: [targetUri.toString()],
				remaining: ['other'],
				cleanup: [{
					plugin: 'target',
					otherInstalledDescriptors: [other.sourceDescriptor],
				}],
			});
		});

		test('removes a durable entry when its marketplace metadata is unavailable', async () => {
			const targetUri = URI.file('/cache/unhydrated');
			const { service, state } = createService({
				durablePluginUris: [targetUri],
				installedPlugins: [],
			});

			const removed = await service.uninstallPlugin(targetUri);

			assert.deepStrictEqual({
				removed,
				durablePluginUris: state.durablePluginUris,
				removedPluginUris: state.removedPluginUris,
				cleanup: state.cleanupPluginSourceCalls,
			}, {
				removed: true,
				durablePluginUris: [],
				removedPluginUris: [targetUri.toString()],
				cleanup: [],
			});
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

		test('serializes overlapping revision updates before looking up the installed URI', async () => {
			const first = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', sha: 'first' } });
			const second = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git', sha: 'second' } });
			const oldUri = URI.file('/cache/old');
			const firstUri = URI.file('/cache/first');
			const secondUri = URI.file('/cache/second');
			const started = new DeferredPromise<void>();
			const release = new DeferredPromise<void>();
			const { service, state } = createService({
				installedPlugins: [{ pluginUri: oldUri, plugin: first }],
				pluginSourceInstallUris: new Map([[PluginSourceKind.GitHub, firstUri], [PluginSourceKind.GitUrl, secondUri]]),
				recordInstalledPlugins: true,
				onUpdatePluginSource: async () => {
					started.complete();
					await release.p;
					return false;
				},
			});

			const firstUpdate = service.updatePlugin(first, true);
			await started.p;
			const secondUpdate = service.updatePlugin(second, true);
			const updatesBeforeRelease = state.updatePluginSourceCalls.length;
			release.complete();
			await Promise.all([firstUpdate, secondUpdate]);

			assert.deepStrictEqual({
				updatesBeforeRelease,
				installed: state.installedPlugins,
				removed: state.removedPluginUris,
			}, {
				updatesBeforeRelease: 1,
				installed: [{ pluginUri: secondUri, plugin: second }],
				removed: [oldUri.toString(), firstUri.toString()],
			});
		});

		test('preserves disabled profile and workspace decisions when the installed URI changes', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', sha: 'new-sha' } });
			const oldUri = URI.file('/cache/old-sha');
			const newUri = URI.file('/cache/new-sha');
			const { service, enablementService } = createService({
				installedPlugins: [{ pluginUri: oldUri, plugin }],
				pluginSourceInstallUris: new Map([[PluginSourceKind.GitHub, newUri]]),
			});
			enablementService.setEnabled(oldUri.toString(), ContributionEnablementState.DisabledProfile);
			enablementService.setEnabled(oldUri.toString(), ContributionEnablementState.EnabledWorkspace);

			await service.updatePlugin(plugin, true);

			assert.deepStrictEqual({
				profileEnabled: enablementService.readProfileEnabled(newUri.toString()),
				effective: enablementService.readEnabled(newUri.toString()),
			}, { profileEnabled: false, effective: ContributionEnablementState.EnabledWorkspace });
		});

		for (const sourceDescriptor of [
			{ kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main', sha: 'new-sha', path: 'plugins/test' },
			{ kind: PluginSourceKind.GitUrl, url: 'https://example.com/repo.git', ref: 'main', path: 'plugins/test' },
		] satisfies IPluginSourceDescriptor[]) {
			test(`moves the installed ${sourceDescriptor.kind} plugin when its cache location changes`, async () => {
				const plugin = createPlugin({ sourceDescriptor });
				const oldUri = URI.file('/cache/old-revision/plugins/test');
				const newUri = URI.file('/cache/new-revision/plugins/test');
				const { service, state } = createService({
					installedPlugins: [{ pluginUri: oldUri, plugin }],
					pluginSourceInstallUris: new Map([[sourceDescriptor.kind, newUri]]),
					ensurePluginSourceResult: newUri,
					recordInstalledPlugins: true,
				});

				const updated = await service.updatePlugin(plugin, true);

				assert.deepStrictEqual({
					updated,
					ensured: state.ensurePluginSourceDescriptors,
					added: state.addedPlugins,
					removed: state.removedPluginUris,
					installed: state.installedPlugins,
					silent: state.updatePluginSourceCalls[0].options?.silent,
				}, {
					updated: true,
					ensured: [sourceDescriptor],
					added: [{ uri: newUri.toString(), plugin }],
					removed: [oldUri.toString()],
					installed: [{ pluginUri: newUri, plugin }],
					silent: true,
				});
			});
		}

		test('keeps the old installation if provisioning the new revision fails', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', sha: 'new-sha' } });
			const installed = { pluginUri: URI.file('/cache/old-sha'), plugin };
			const { service, state } = createService({
				installedPlugins: [installed],
				onEnsurePluginSource: async () => { throw new Error('Clone failed'); },
			});

			await assert.rejects(service.updatePlugin(plugin), /Clone failed/);

			assert.deepStrictEqual({
				installed: state.installedPlugins,
				added: state.addedPlugins,
				removed: state.removedPluginUris,
				updated: state.updatePluginSourceCalls,
			}, { installed: [installed], added: [], removed: [], updated: [] });
		});

		test('keeps the old installation if the new plugin directory is missing', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'missing' } });
			const installed = { pluginUri: URI.file('/cache/old-path'), plugin };
			const { service, state } = createService({ installedPlugins: [installed], fileExistsResult: false });

			await assert.rejects(service.updatePlugin(plugin), /not found after updating/);

			assert.deepStrictEqual({
				installed: state.installedPlugins,
				added: state.addedPlugins,
				removed: state.removedPluginUris,
			}, { installed: [installed], added: [], removed: [] });
		});

		test('does not replace an installed entry when cancelled during provisioning', async () => {
			const cancellation = store.add(new CancellationTokenSource());
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', sha: 'new-sha' } });
			const installed = { pluginUri: URI.file('/cache/old-sha'), plugin };
			const { service, state } = createService({
				installedPlugins: [installed],
				onEnsurePluginSource: async () => {
					cancellation.cancel();
					return URI.file('/cache/new-sha');
				},
			});

			await assert.rejects(service.updatePlugin(plugin, true, cancellation.token), isCancellationError);

			assert.deepStrictEqual({
				added: state.addedPlugins,
				removed: state.removedPluginUris,
				updated: state.updatePluginSourceCalls,
			}, { added: [], removed: [], updated: [] });
		});

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

		test('blocks direct updates when the strict marketplace policy disallows the source', async () => {
			const { service, state } = createService({
				strictMarketplacePolicyActive: true,
				marketplaceTrusted: false,
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' },
			});

			const updated = await service.updatePlugin(plugin);

			assert.deepStrictEqual({
				updated,
				updateCalls: state.updatePluginSourceCalls.length,
				notifications: state.notifications.map(notification => notification.message),
			}, {
				updated: false,
				updateCalls: 0,
				notifications: ['Updates from \'microsoft/vscode\' are blocked by your organization\'s policy.'],
			});
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

		test('does not report npm plugin as updated when install is declined', async () => {
			const { service, state } = createService({
				dialogConfirmResult: false,
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/npm/my-pkg'),
				pluginSourceInstallUris: new Map([['npm', URI.file('/cache/agentPlugins/npm/my-pkg/node_modules/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Npm, package: 'my-pkg' },
			});

			const updated = await service.updatePlugin(plugin);

			assert.strictEqual(updated, false);
			assert.strictEqual(state.terminalCommands.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
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

		test('does not report pip plugin as updated when install is declined', async () => {
			const { service, state } = createService({
				dialogConfirmResult: false,
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/pip/my-pkg'),
				pluginSourceInstallUris: new Map([['pip', URI.file('/cache/agentPlugins/pip/my-pkg')]]),
			});
			const plugin = createPlugin({
				sourceDescriptor: { kind: PluginSourceKind.Pip, package: 'my-pkg' },
			});

			const updated = await service.updatePlugin(plugin);

			assert.strictEqual(updated, false);
			assert.strictEqual(state.terminalCommands.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
		});
	});

	suite('updateAllPlugins', () => {

		for (const sourceDescriptor of [
			{ kind: PluginSourceKind.GitHub, repo: 'owner/repo', path: 'plugins/test' },
			{ kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main', path: 'plugins/test' },
			{ kind: PluginSourceKind.GitUrl, url: 'https://example.com/private.git', ref: 'main', path: 'plugins/test' },
		] satisfies IPluginSourceDescriptor[]) {
			for (const force of [false, true]) {
				test(`refreshes unchanged ${JSON.stringify(sourceDescriptor)} sources (force=${force})`, async () => {
					const plugin = createPlugin({ sourceDescriptor });
					const pluginUri = URI.file('/cache/plugin');
					const { service, state } = createService({
						installedPlugins: [{ pluginUri, plugin }],
						fetchedMarketplacePlugins: [plugin],
						pluginSourceInstallUris: new Map([[sourceDescriptor.kind, pluginUri]]),
						updatePluginSourceResult: true,
					});

					const result = await service.updateAllPlugins({ silent: true, force }, CancellationToken.None);

					assert.deepStrictEqual({
						result,
						updated: state.updatePluginSourceCalls.map(call => call.plugin),
						added: state.addedPlugins,
						ensured: state.ensurePluginSourceDescriptors,
					}, {
						result: { updatedNames: [plugin.name], failedNames: [] },
						updated: [plugin],
						added: [{ uri: pluginUri.toString(), plugin }],
						ensured: [],
					});
				});
			}
		}

		test('does not report an unchanged Git checkout as updated', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main' } });
			const { service, state } = createService({
				installedPlugins: [{ pluginUri: URI.file('/cache/agentPlugins/github/default'), plugin }],
				fetchedMarketplacePlugins: [plugin],
			});

			const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);

			assert.deepStrictEqual({
				result,
				updated: state.updatePluginSourceCalls.map(call => call.plugin),
				added: state.addedPlugins,
			}, { result: { updatedNames: [], failedNames: [] }, updated: [plugin], added: [] });
		});

		test('uses the refreshed Git descriptor and replaces the old installed URI', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main', path: 'plugins/test' } });
			const livePlugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main', path: 'plugins/test', sha: 'new-sha' } });
			const oldUri = URI.file('/cache/ref_main/plugins/test');
			const newUri = URI.file('/cache/sha_new-sha/plugins/test');
			const { service, state } = createService({
				installedPlugins: [{ pluginUri: oldUri, plugin }],
				fetchedMarketplacePlugins: [livePlugin],
				pluginSourceInstallUris: new Map([[PluginSourceKind.GitHub, newUri]]),
				ensurePluginSourceResult: newUri,
				recordInstalledPlugins: true,
			});

			const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);

			assert.deepStrictEqual({
				result,
				ensured: state.ensurePluginSourceDescriptors,
				installed: state.installedPlugins,
				removed: state.removedPluginUris,
				fetchOptions: state.fetchMarketplaceOptions,
			}, {
				result: { updatedNames: [plugin.name], failedNames: [] },
				ensured: [livePlugin.sourceDescriptor],
				installed: [{ pluginUri: newUri, plugin: livePlugin }],
				removed: [oldUri.toString()],
				fetchOptions: [{ refresh: true }],
			});
		});

		for (const kind of [PluginSourceKind.Npm, PluginSourceKind.Pip] as const) {
			for (const force of [false, true]) {
				test(`${force ? 'reinstalls' : 'skips'} unchanged unversioned ${kind} packages`, async () => {
					const plugin = createPlugin({ sourceDescriptor: { kind, package: 'test-package' } });
					const { service, state } = createService({
						installedPlugins: [{ pluginUri: URI.file('/cache/package'), plugin }],
						fetchedMarketplacePlugins: [plugin],
					});

					const result = await service.updateAllPlugins({ silent: true, force }, CancellationToken.None);

					assert.deepStrictEqual({
						result,
						commands: state.terminalCommands.length,
					}, {
						result: { updatedNames: force ? [plugin.name] : [], failedNames: [] },
						commands: force ? 1 : 0,
					});
				});
			}
		}

		test('reports a Git update failure without replacing the installed entry', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main' } });
			const installed = { pluginUri: URI.file('/cache/agentPlugins/github/default'), plugin };
			const { service, state } = createService({
				installedPlugins: [installed],
				fetchedMarketplacePlugins: [plugin],
				onUpdatePluginSource: async () => { throw new Error('Pull failed'); },
			});

			const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);

			assert.deepStrictEqual({
				result,
				installed: state.installedPlugins,
				added: state.addedPlugins,
				removed: state.removedPluginUris,
				notifications: state.notifications.map(notification => notification.message),
			}, {
				result: { updatedNames: [], failedNames: [plugin.name] },
				installed: [installed],
				added: [],
				removed: [],
				notifications: [`Failed to update: ${plugin.name}`],
			});
		});

		test('does not update independent Git sources blocked by strict marketplace policy', async () => {
			const plugin = createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo', ref: 'main' } });
			const { service, state } = createService({
				installedPlugins: [{ pluginUri: URI.file('/cache/plugin'), plugin }],
				fetchedMarketplacePlugins: [plugin],
				strictMarketplacePolicyActive: true,
				marketplaceTrusted: false,
			});

			const result = await service.updateAllPlugins({ silent: true, force: true }, CancellationToken.None);

			assert.deepStrictEqual({
				result,
				updated: state.updatePluginSourceCalls,
				ensured: state.ensurePluginSourceDescriptors,
			}, {
				result: { updatedNames: [], failedNames: [plugin.marketplaceReference.displayLabel] },
				updated: [],
				ensured: [],
			});
		});

		function installedPlugin(name: string, marketplace: string): IMarketplaceInstalledPlugin {
			const marketplaceReference = makeMarketplaceRef(marketplace);
			const plugin = createPlugin({
				name,
				marketplace,
				marketplaceReference,
				source: `plugins/${name}`,
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: `plugins/${name}` },
			});
			return { pluginUri: URI.file(`/plugins/${name}`), plugin };
		}

		test('updates only the targeted marketplace', async () => {
			const first = installedPlugin('first', 'microsoft/first');
			const second = installedPlugin('second', 'microsoft/second');
			const { service, state } = createService({ installedPlugins: [first, second] });

			await service.updateAllPlugins({
				silent: true,
				automatic: true,
				marketplaceIds: new Set([first.plugin.marketplaceReference.canonicalId]),
			}, CancellationToken.None);

			assert.deepStrictEqual({
				pulled: state.pullRepositoryCalls.map(call => call.marketplace.canonicalId),
				fetched: state.fetchMarketplaceCalls,
			}, {
				pulled: [first.plugin.marketplaceReference.canonicalId],
				fetched: [[first.plugin.marketplaceReference.canonicalId]],
			});
		});

		test('rechecks managed auto-update policy before an automatic update', async () => {
			const installed = installedPlugin('blocked', 'microsoft/blocked');
			const { service, state } = createService({
				installedPlugins: [installed],
				autoUpdateByMarketplace: new Map([[installed.plugin.marketplaceReference.canonicalId, false]]),
			});

			await service.updateAllPlugins({
				silent: true,
				automatic: true,
				marketplaceIds: new Set([installed.plugin.marketplaceReference.canonicalId]),
			}, CancellationToken.None);

			assert.deepStrictEqual(state.pullRepositoryCalls, []);
			assert.deepStrictEqual(state.fetchMarketplaceCalls, []);
		});

		test('blocks updates when the strict marketplace policy disallows the source', async () => {
			const installed = installedPlugin('blocked', 'microsoft/blocked');
			const { service, state } = createService({
				installedPlugins: [installed],
				strictMarketplacePolicyActive: true,
				marketplaceTrusted: false,
			});

			const result = await service.updateAllPlugins({ silent: true }, CancellationToken.None);

			assert.deepStrictEqual(result.failedNames, [installed.plugin.marketplaceReference.displayLabel]);
			assert.deepStrictEqual(state.pullRepositoryCalls, []);
		});
	});

	// =========================================================================
	// installPlugin — marketplace trust
	// =========================================================================

	suite('installPlugin — marketplace trust', () => {

		test('cancellation while confirming trust never trusts or installs the plugin', async () => {
			const confirmation = new DeferredPromise<boolean>();
			const cancellation = store.add(new CancellationTokenSource());
			const { service, state } = createService({ marketplaceTrusted: false, onTrustConfirmation: () => confirmation.p });
			const plugin = createPlugin({ source: 'plugins/myPlugin', sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' } });
			const pending = service.installPlugin(plugin, cancellation.token);
			cancellation.cancel();
			await confirmation.complete(true);
			await assert.rejects(pending, isCancellationError);
			assert.deepStrictEqual({ trusted: state.trustedMarketplaces, installed: state.addedPlugins }, { trusted: [], installed: [] });
		});

		test('cancellation while checking a cloned plugin prevents registration', async () => {
			const exists = new DeferredPromise<boolean>();
			const checking = new DeferredPromise<void>();
			const cancellation = store.add(new CancellationTokenSource());
			let repositoryToken: CancellationToken | undefined;
			const { service, state } = createService({
				onEnsureRepository: async token => {
					repositoryToken = token;
					return URI.file('/cache/agentPlugins/github.com/microsoft/vscode');
				},
				fileExistsResult: async () => {
					await checking.complete();
					return exists.p;
				},
			});
			const plugin = createPlugin({ source: 'plugins/myPlugin', sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/myPlugin' } });
			const pending = service.installPlugin(plugin, cancellation.token);
			await checking.p;
			cancellation.cancel();
			await exists.complete(true);
			await assert.rejects(pending, isCancellationError);
			assert.deepStrictEqual({
				repositoryReceivedToken: repositoryToken === cancellation.token,
				installed: state.addedPlugins,
			}, { repositoryReceivedToken: true, installed: [] });
		});

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

			await assert.rejects(() => service.installPlugin(plugin), (err: unknown) => isCancellationError(err as Error));

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
				await assert.rejects(() => service.installPlugin(createPlugin({ sourceDescriptor })), (err: unknown) => isCancellationError(err as Error));
			}

			assert.strictEqual(state.addedPlugins.length, 0, 'no plugins should be installed when trust is declined');
		});
	});

	// =========================================================================
	// installPluginFromSource
	// =========================================================================

	suite('installPluginFromSource', () => {

		test('keeps legacy source handling for repository-root plugins', async () => {
			const { service, state } = createService({
				singlePluginManifestResult: createPlugin({
					sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/catalog' },
				}),
			});
			const result = await service.installPluginFromSource('owner/catalog#release/v1', { plugin: 'test-plugin' });

			assert.deepStrictEqual({
				success: result.success,
				sources: state.ensurePluginSourceDescriptors,
				installedSource: result.matchedPlugin?.sourceDescriptor,
			}, {
				success: true,
				sources: [
					{ kind: PluginSourceKind.GitHub, repo: 'owner/catalog' },
					{ kind: PluginSourceKind.GitHub, repo: 'owner/catalog' },
				],
				installedSource: { kind: PluginSourceKind.GitHub, repo: 'owner/catalog' },
			});
		});

		test('installs the exact plugin subdirectory and revision without registering the repository as a marketplace', async () => {
			const installUri = URI.file('/cache/plugin-source');
			const { service, state } = createService({
				recordInstalledPlugins: true,
				ensurePluginSourceResult: installUri,
				pluginSourceInstallUris: new Map([[PluginSourceKind.GitHub, installUri]]),
				singlePluginManifestResult: createPlugin({
					name: 'selected-plugin',
					sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/collection' },
				}),
			});

			const result = await service.installPluginFromSource('owner/collection#release/v1', { path: 'plugins/selected-plugin' });

			assert.deepStrictEqual({
				success: result.success,
				name: result.matchedPlugin?.name,
				manifests: state.singlePluginManifestDirectories.map(uri => uri.path),
				sources: state.ensurePluginSourceDescriptors,
				registeredMarketplaces: state.updatedMarketplaces,
			}, {
				success: true,
				name: 'selected-plugin',
				manifests: ['/cache/plugin-source/plugins/selected-plugin'],
				sources: [
					{ kind: PluginSourceKind.GitHub, repo: 'owner/collection', ref: 'release/v1' },
					{ kind: PluginSourceKind.GitHub, repo: 'owner/collection', ref: 'release/v1', path: 'plugins/selected-plugin' },
				],
				registeredMarketplaces: undefined,
			});
		});

		test('installs the exact marketplace-declared plugin subdirectory without registering the repository as a marketplace', async () => {
			const marketplaceReference = makeMarketplaceRef('owner/collection#release/v1');
			const plugin = createPlugin({
				name: 'spark',
				source: 'plugins/spark',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/spark' },
				marketplace: marketplaceReference.displayLabel,
				marketplaceReference,
			});
			const { service, state } = createService({
				ensureRepositoryResult: URI.file('/cache/agentPlugins/owner/collection'),
				readPluginsResult: [plugin],
				recordInstalledPlugins: true,
			});

			const result = await service.installPluginFromSource('owner/collection#release/v1', { path: 'plugins/spark' });

			assert.deepStrictEqual({
				success: result.success,
				name: result.matchedPlugin?.name,
				source: result.matchedPlugin?.sourceDescriptor,
				registeredMarketplaces: state.updatedMarketplaces,
				installed: state.addedPlugins.map(entry => ({ uri: entry.uri, name: entry.plugin.name })),
			}, {
				success: true,
				name: 'spark',
				source: { kind: PluginSourceKind.RelativePath, path: 'plugins/spark' },
				registeredMarketplaces: undefined,
				installed: [{ uri: 'file:///cache/agentPlugins/owner/collection/plugins/spark', name: 'spark' }],
			});
		});

		test('rejects unsafe or oversized plugin subdirectories before cloning', async () => {
			const { service, state } = createService();
			const results = [];
			for (const path of ['../outside', '/absolute', 'plugins/../other', 'plugins\\other', '.git', 'a//b', 'C:/plugin', 'a'.repeat(8193)]) {
				const result = await service.installPluginFromSource('owner/repo', { path });
				results.push({ success: result.success, hasError: !!result.message });
			}
			assert.deepStrictEqual({ results, sources: state.ensurePluginSourceDescriptors }, {
				results: Array.from({ length: 8 }, () => ({ success: false, hasError: true })),
				sources: [],
			});
		});

		test('accepts the maximum-length plugin subdirectory for source resolution', async () => {
			const { service, state } = createService();
			await service.installPluginFromSource('owner/repo', { path: 'a'.repeat(8192) });
			assert.deepStrictEqual(state.ensurePluginSourceDescriptors.map(descriptor => descriptor.kind), [PluginSourceKind.GitHub]);
		});

		test('does not install a subdirectory without a supported manifest', async () => {
			const { service, state } = createService();
			const result = await service.installPluginFromSource('owner/repo', { path: 'plugins/missing' });
			assert.deepStrictEqual({ success: result.success, hasError: !!result.message, installed: state.addedPlugins }, {
				success: false, hasError: true, installed: [],
			});
		});

		test('does not follow a symlink in a plugin subdirectory', async () => {
			const { service, state } = createService({ resolveIsSymbolicLink: true });
			const result = await service.installPluginFromSource('owner/repo', { path: 'plugins/tool' });
			assert.deepStrictEqual({ success: result.success, manifests: state.singlePluginManifestDirectories, installed: state.addedPlugins }, {
				success: false, manifests: [], installed: [],
			});
		});

		test('retains strict-marketplace policy for subdirectory installs', async () => {
			const { service, state } = createService({ marketplaceTrusted: false, strictMarketplacePolicyActive: true });
			const result = await service.installPluginFromSource('owner/repo', { path: 'plugins/tool' });
			assert.deepStrictEqual({ success: result.success, sources: state.ensurePluginSourceDescriptors, installed: state.addedPlugins }, {
				success: false, sources: [], installed: [],
			});
		});

		test('does not report a subdirectory install as successful when the owning installer did not register it', async () => {
			let existsChecks = 0;
			const { service, state } = createService({
				fileExistsResult: async () => ++existsChecks === 1,
				singlePluginManifestResult: createPlugin({ sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/repo' } }),
			});
			const result = await service.installPluginFromSource('owner/repo', { path: 'plugins/tool' });
			assert.deepStrictEqual({ success: result.success, hasError: !!result.message, installed: state.addedPlugins }, {
				success: false, hasError: true, installed: [],
			});
		});

		test('rejects invalid source strings', async () => {
			const { service, state } = createService();
			const result = await service.installPluginFromSource('not a valid source');
			assert.strictEqual(result.success, false);
			assert.ok(result.message);
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('validatePluginSource accepts git and local sources and rejects garbage', () => {
			const { service } = createService();
			assert.strictEqual(service.validatePluginSource('owner/repo'), undefined);
			assert.strictEqual(service.validatePluginSource('https://github.com/owner/repo.git'), undefined);
			assert.strictEqual(service.validatePluginSource('file:///some/path'), undefined);
			assert.strictEqual(service.validatePluginSource('/abs/path'), undefined);
			assert.strictEqual(service.validatePluginSource('~/plugins/foo'), undefined);
			assert.ok(service.validatePluginSource('not a valid source'));
		});

		test('installs a local folder marketplace and registers it under chat.plugins.marketplaces', async () => {
			const ref = makeMarketplaceRef('file:///some/marketplace');
			const discoveredPlugin = createPlugin({
				name: 'local-marketplace-plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
			const { service, state } = createService({
				readPluginsResult: [discoveredPlugin],
			});

			await service.installPluginFromSource('file:///some/marketplace');

			assert.strictEqual(state.notifications.length, 0);
			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.addedPlugins[0].plugin.name, 'local-marketplace-plugin');
			assert.deepStrictEqual(state.updatedMarketplaces, ['file:///some/marketplace']);
			assert.strictEqual(state.updatedPluginLocations, undefined);
		});

		test('does not persist a local marketplace to config when trust is declined', async () => {
			const ref = makeMarketplaceRef('file:///some/marketplace');
			const discoveredPlugin = createPlugin({
				name: 'local-marketplace-plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
			const { service, state } = createService({
				readPluginsResult: [discoveredPlugin],
				marketplaceTrusted: false,
				dialogConfirmResult: false,
			});

			const result = await service.installPluginFromSource('file:///some/marketplace');

			assert.strictEqual(result.success, false);
			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.updatedMarketplaces, undefined);
		});

		test('registers a local folder standalone plugin under chat.pluginLocations', async () => {
			const { service, state } = createService({
				readPluginsResult: [],
				isPluginDirectoryResult: true,
			});

			await service.installPluginFromSource('/abs/my-plugin');

			assert.strictEqual(state.notifications.length, 0);
			assert.strictEqual(state.addedPlugins.length, 0);
			assert.deepStrictEqual(state.updatedPluginLocations, { '/abs/my-plugin': true });
			assert.strictEqual(state.updatedMarketplaces, undefined);
		});

		test('expands ~ paths but persists the original form in chat.pluginLocations', async () => {
			const { service, state } = createService({
				readPluginsResult: [],
				isPluginDirectoryResult: true,
				userHome: '/home/user',
			});

			await service.installPluginFromSource('~/my-plugin');

			assert.deepStrictEqual(state.updatedPluginLocations, { '~/my-plugin': true });
		});

		test('registers a file:// standalone plugin using its filesystem path', async () => {
			const { service, state } = createService({
				readPluginsResult: [],
				isPluginDirectoryResult: true,
			});

			await service.installPluginFromSource('file:///some/plugin');

			assert.strictEqual(state.addedPlugins.length, 0);
			assert.ok(state.updatedPluginLocations);
			assert.deepStrictEqual(Object.values(state.updatedPluginLocations!), [true]);
			assert.strictEqual(Object.keys(state.updatedPluginLocations!).length, 1);
		});

		test('shows error when local folder does not exist', async () => {
			const { service, state } = createService({
				resolveIsDirectory: false,
			});

			const result = await service.installPluginFromSource('/abs/missing');

			assert.strictEqual(result.success, false);
			assert.ok(result.message);
			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.updatedPluginLocations, undefined);
		});

		test('shows error when local folder is neither a marketplace nor a plugin', async () => {
			const { service, state } = createService({
				readPluginsResult: [],
				isPluginDirectoryResult: false,
			});

			const result = await service.installPluginFromSource('/abs/empty');

			assert.strictEqual(result.success, false);
			assert.ok(result.message?.includes('No plugin or marketplace found'));
			assert.strictEqual(state.addedPlugins.length, 0);
			assert.strictEqual(state.updatedPluginLocations, undefined);
		});

		test('installs single plugin from GitHub shorthand with marketplace.json', async () => {
			const ref = makeMarketplaceRef('owner/my-plugin');
			const discoveredPlugin = createPlugin({
				name: 'my-discovered-plugin',
				description: 'A discovered plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
				readPluginsResult: [discoveredPlugin],
			});

			await service.installPluginFromSource('owner/my-plugin');

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.addedPlugins[0].plugin.name, 'my-discovered-plugin');
		});

		test('shows error when no marketplace.json found', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/cool-tool'),
				readPluginsResult: [],
			});

			const result = await service.installPluginFromSource('owner/cool-tool');

			assert.strictEqual(result.success, false);
			assert.ok(result.message?.includes('No plugins found'));
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('shows quick pick for multi-plugin repos', async () => {
			const ref = makeMarketplaceRef('owner/multi-repo');
			const pluginA = createPlugin({
				name: 'plugin-a',
				source: 'plugins/a',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/a' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const pluginB = createPlugin({
				name: 'plugin-b',
				source: 'plugins/b',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/b' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
				readPluginsResult: [pluginA, pluginB],
				quickPickResult: { label: 'plugin-b' },
			});

			await service.installPluginFromSource('owner/multi-repo');

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.addedPlugins[0].plugin.name, 'plugin-b');
			assert.ok(state.addedPlugins[0].uri.includes('plugins/b'));
		});

		test('does not install when quick pick is cancelled', async () => {
			const ref = makeMarketplaceRef('owner/multi-repo');
			const pluginA = createPlugin({
				name: 'plugin-a',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/a' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const pluginB = createPlugin({
				name: 'plugin-b',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/b' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
				readPluginsResult: [pluginA, pluginB],
				quickPickResult: undefined,
			});

			await service.installPluginFromSource('owner/multi-repo');

			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('does not install when trust is declined', async () => {
			const { service, state } = createService({
				marketplaceTrusted: false,
				dialogConfirmResult: false,
				readPluginsResult: [],
			});

			await service.installPluginFromSource('owner/repo');

			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('shows error when no plugins found in git URL', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-tool'),
				readPluginsResult: [],
			});

			const result = await service.installPluginFromSource('https://github.com/owner/my-tool.git');

			assert.strictEqual(result.success, false);
			assert.ok(result.message?.includes('No plugins found'));
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('shows error when clone directory does not exist', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/missing'),
				fileExistsResult: false,
			});

			const result = await service.installPluginFromSource('owner/missing');

			assert.strictEqual(result.success, false);
			assert.ok(result.message);
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('adds marketplace to config after installing single plugin', async () => {
			const ref = makeMarketplaceRef('owner/my-plugin');
			const discoveredPlugin = createPlugin({
				name: 'my-discovered-plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
				readPluginsResult: [discoveredPlugin],
			});

			await service.installPluginFromSource('owner/my-plugin');

			assert.deepStrictEqual(state.updatedMarketplaces, ['owner/my-plugin']);
		});

		test('adds marketplace to config after picking from multi-plugin repo', async () => {
			const ref = makeMarketplaceRef('owner/multi-repo');
			const pluginA = createPlugin({
				name: 'plugin-a',
				source: 'plugins/a',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/a' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const pluginB = createPlugin({
				name: 'plugin-b',
				source: 'plugins/b',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/b' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/multi-repo'),
				readPluginsResult: [pluginA, pluginB],
				quickPickResult: { label: 'plugin-a' },
			});

			await service.installPluginFromSource('owner/multi-repo');

			assert.deepStrictEqual(state.updatedMarketplaces, ['owner/multi-repo']);
		});

		test('does not duplicate marketplace in config', async () => {
			const ref = makeMarketplaceRef('owner/my-plugin');
			const discoveredPlugin = createPlugin({
				name: 'my-discovered-plugin',
				sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: '' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.OpenPlugin,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/my-plugin'),
				readPluginsResult: [discoveredPlugin],
				configuredMarketplaces: ['owner/my-plugin'],
			});

			await service.installPluginFromSource('owner/my-plugin');

			assert.strictEqual(state.updatedMarketplaces, undefined);
		});

		test('falls back to single-plugin manifest when no marketplace.json exists', async () => {
			const ref = makeMarketplaceRef('owner/single-plugin-repo');
			const singlePlugin = createPlugin({
				name: 'single-plugin-repo',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/single-plugin-repo' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.Claude,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/single-plugin-repo'),
				readPluginsResult: [],
				singlePluginManifestResult: singlePlugin,
			});

			await service.installPluginFromSource('owner/single-plugin-repo');

			assert.strictEqual(state.addedPlugins.length, 1);
			assert.strictEqual(state.addedPlugins[0].plugin.name, 'single-plugin-repo');
			assert.strictEqual(state.notifications.length, 0);
			// Single-plugin repos are not marketplaces — config must NOT be touched.
			assert.strictEqual(state.updatedMarketplaces, undefined);
		});

		test('reports error when single-plugin manifest name does not match options.plugin', async () => {
			const ref = makeMarketplaceRef('owner/single-plugin-repo');
			const singlePlugin = createPlugin({
				name: 'actual-name',
				sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/single-plugin-repo' },
				marketplace: ref.displayLabel,
				marketplaceReference: ref,
				marketplaceType: MarketplaceType.Claude,
			});
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/single-plugin-repo'),
				readPluginsResult: [],
				singlePluginManifestResult: singlePlugin,
			});

			const result = await service.installPluginFromSource('owner/single-plugin-repo', { plugin: 'requested-name' });

			assert.strictEqual(result.success, false);
			assert.ok(result.message?.includes('not found'));
			assert.strictEqual(state.addedPlugins.length, 0);
		});

		test('still reports "no plugins found" when neither marketplace.json nor single-plugin manifest exists', async () => {
			const { service, state } = createService({
				ensurePluginSourceResult: URI.file('/cache/agentPlugins/github.com/owner/empty-repo'),
				readPluginsResult: [],
				singlePluginManifestResult: undefined,
			});

			const result = await service.installPluginFromSource('owner/empty-repo');

			assert.strictEqual(result.success, false);
			assert.ok(result.message?.includes('No plugins found'));
			assert.strictEqual(state.addedPlugins.length, 0);
		});
	});
});
