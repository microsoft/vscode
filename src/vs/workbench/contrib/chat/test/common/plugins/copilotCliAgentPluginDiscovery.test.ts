/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import sinon from 'sinon';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { autorun, derived, observableValue, waitForState } from '../../../../../../base/common/observable.js';
import { joinPath } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IAgentHostService, type IAgentPluginUninstallRequest } from '../../../../../../platform/agentHost/common/agentService.js';
import { type IAgentPluginInstallation } from '../../../../../../platform/agentHost/common/agent.js';
import { withRuntimePluginEnablement } from '../../../../../../platform/agentHost/common/meta/pluginEnablementMeta.js';
import { ActionType, type ActionEnvelope } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { CustomizationType } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { testWorkspace } from '../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TestContextService, TestUserDataProfileService } from '../../../../../test/common/workbenchTestServices.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { ContributionEnablementState, IEnablementModel, isContributionEnabled } from '../../../common/enablement.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { AgentPluginEnablementService } from '../../../common/plugins/agentPluginEnablement.js';
import { AgentPluginDiscoveryPriority, agentPluginDiscoveryRegistry, IAgentPlugin, IAgentPluginDiscovery } from '../../../common/plugins/agentPluginService.js';
import { AgentPluginService, CopilotCliAgentPluginDiscovery } from '../../../common/plugins/agentPluginServiceImpl.js';
import { MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';

interface ITestInstalledPlugin {
	readonly name: string;
	readonly marketplace: string;
	readonly enabled?: boolean;
	readonly uri?: URI;
	readonly version?: string;
	readonly installedAt?: string;
	readonly sourceSha?: string;
	readonly source?: string | { readonly source: 'github'; readonly repo: string; readonly ref?: string; readonly sha?: string; readonly path?: string };
	readonly directSourceId?: string;
}

class TestCopilotCliAgentPluginDiscovery extends CopilotCliAgentPluginDiscovery {
	public discoveryCount = 0;

	public discoverPluginSources() {
		return this._discoverPluginSources();
	}

	public refreshPlugins(): Promise<void> {
		return this._refreshPlugins();
	}

	protected override _discoverPluginSources() {
		this.discoveryCount++;
		return super._discoverPluginSources();
	}

	public setEnablementModel(enablementModel: IEnablementModel): void {
		this._enablementModel = enablementModel;
	}
}

suite('CopilotCliAgentPluginDiscovery', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const logService = new NullLogService();
	const userHome = URI.from({ scheme: Schemas.inMemory, path: '/home/testuser' });
	const copilotHome = joinPath(userHome, '.copilot');
	const configFile = joinPath(copilotHome, 'config.json');
	const installedPluginsRoot = joinPath(copilotHome, 'installed-plugins');
	const marketplaceRoot = joinPath(installedPluginsRoot, 'copilot-plugins');
	const workspaceRoot = URI.from({ scheme: Schemas.inMemory, path: '/workspace' });
	const removedEnablement: string[] = [];
	const changedEnablement: Array<{ id: string; state: ContributionEnablementState }> = [];
	const defaultEnablement: Array<{ id: string; enabled: boolean }> = [];
	const enablementModel: IEnablementModel = {
		readEnabled: () => ContributionEnablementState.EnabledProfile,
		readProfileEnabled: () => true,
		setEnabled: (id, state) => changedEnablement.push({ id, state }),
		setDefaultEnabled: (id, enabled) => defaultEnablement.push({ id, enabled }),
		remove: id => removedEnablement.push(id),
	};
	const uninstallCalls: Array<{ provider: string; request: IAgentPluginUninstallRequest }> = [];
	const enablementCalls: Array<{ provider: string; plugin: string; enabled: boolean }> = [];

	let fileService: FileService;
	let runtimePlugins: IAgentPluginInstallation[];
	let customizationChanges: Emitter<ActionEnvelope>;

	setup(() => {
		removedEnablement.length = 0;
		changedEnablement.length = 0;
		defaultEnablement.length = 0;
		uninstallCalls.length = 0;
		enablementCalls.length = 0;
		runtimePlugins = [];
		customizationChanges = store.add(new Emitter<ActionEnvelope>());
		fileService = store.add(new FileService(logService));
		store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
	});

	teardown(() => {
		sinon.restore();
	});

	function createDiscovery(uninstallSupported = true, readInventory: () => Promise<readonly IAgentPluginInstallation[]> = async () => runtimePlugins, home = userHome): TestCopilotCliAgentPluginDiscovery {
		const discovery = store.add(new TestCopilotCliAgentPluginDiscovery(
			fileService,
			new class extends mock<IPathService>() {
				override userHome(options: { preferLocal: true }): URI;
				override userHome(options?: { preferLocal: boolean }): Promise<URI>;
				override userHome(options?: { preferLocal: boolean }): URI | Promise<URI> {
					return options?.preferLocal ? home : Promise.resolve(home);
				}

				override fileURI(path: string): Promise<URI> {
					return Promise.resolve(home.with({ path }));
				}
			},
			logService,
			new TestContextService(testWorkspace(workspaceRoot)),
			new class extends mock<IAgentHostService>() {
				override readonly onAgentHostStart = Event.None;
				override readonly onDidAction = customizationChanges.event;
				override readonly uninstallPlugin = uninstallSupported ? async (provider: string, request: IAgentPluginUninstallRequest): Promise<void> => {
					uninstallCalls.push({ provider, request });
				} : undefined;
				override async listPluginInstallations(): Promise<readonly IAgentPluginInstallation[]> {
					return readInventory();
				}
				override async setPluginEnabled(provider: string, plugin: string, enabled: boolean): Promise<void> {
					enablementCalls.push({ provider, plugin, enabled });
					runtimePlugins = runtimePlugins.map(installation => installation.directSourceId === plugin || `${installation.name}@${installation.marketplace}` === plugin ? { ...installation, enabled } : installation);
					publishCustomizations();
				}
			}(),
		));
		discovery.setEnablementModel(enablementModel);
		return discovery;
	}

	async function writePlugin(uri: URI, name: string): Promise<void> {
		await fileService.writeFile(joinPath(uri, 'plugin.json'), VSBuffer.fromString(JSON.stringify({ name })));
		await fileService.writeFile(joinPath(uri, 'skills', 'repro', 'SKILL.md'), VSBuffer.fromString([
			'---',
			'name: repro',
			'description: Reproduction skill.',
			'---',
			'',
			'Reproduction skill.',
		].join('\n')));
	}

	function publishCustomizations(contentRevision = '1'): void {
		runtimePlugins = runtimePlugins.map(plugin => ({ ...plugin, contentRevision }));
		customizationChanges.fire({
			channel: 'other-agent:/opaque-session', serverSeq: 1, origin: undefined,
			action: {
				type: ActionType.SessionCustomizationsChanged,
				customizations: runtimePlugins.map(plugin => ({
					type: CustomizationType.Plugin, id: plugin.name, uri: plugin.resource!.toString(), name: plugin.name,
					_meta: withRuntimePluginEnablement(undefined, {
						provider: 'copilotcli', plugin: plugin.directSourceId ?? `${plugin.name}@${plugin.marketplace}`,
						globalEnabled: plugin.enabled === true, repositorySupported: !!plugin.marketplace, contentRevision,
					}),
				})),
			},
		});
	}

	async function writeInstalledPlugins(plugins: readonly ITestInstalledPlugin[], resource = configFile): Promise<void> {
		runtimePlugins = plugins.map(plugin => ({ name: plugin.name, marketplace: plugin.marketplace, enabled: plugin.enabled ?? true, directSourceId: plugin.directSourceId, resource: plugin.uri, version: plugin.version, contentRevision: '1' }));
		const installedPlugins = plugins.map(plugin => ({
			name: plugin.name,
			marketplace: plugin.marketplace,
			...(plugin.uri ? { cache_path: plugin.uri.path } : {}),
			version: plugin.version ?? '1.0.0',
			installed_at: plugin.installedAt ?? '2026-09-21T00:00:00Z',
			enabled: plugin.enabled ?? true,
			...(plugin.sourceSha ? { source_sha: plugin.sourceSha } : {}),
			...(plugin.source ? { source: plugin.source } : {}),
		}));
		await fileService.writeFile(resource, VSBuffer.fromString([
			'// Managed by Copilot CLI.',
			JSON.stringify({ installedPlugins }, undefined, 2),
		].join('\n')));
	}

	test('discovers committed plugins and delegates uninstall to the Agent Host', async () => {
		const committedPlugin = joinPath(marketplaceRoot, 'spark');
		const uncommittedPlugin = joinPath(marketplaceRoot, 'transaction-directory');
		await writePlugin(committedPlugin, 'spark');
		await writePlugin(uncommittedPlugin, 'transaction-directory');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: committedPlugin }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.ok(sources[0].remove);
		const removed = await sources[0].remove();

		assert.deepStrictEqual({
			sources: sources.map(source => ({ uri: source.uri.toString(), removable: source.remove !== undefined })),
			removed,
			uninstallCalls,
			removedEnablement,
		}, {
			sources: [{ uri: committedPlugin.toString(), removable: true }],
			removed: true,
			uninstallCalls: [{
				provider: 'copilotcli',
				request: { name: 'spark', marketplace: 'copilot-plugins' },
			}],
			removedEnablement: [committedPlugin.toString()],
		});
	});

	test('automatically retries failed first inventory without an installation change', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri, enabled: false }]);
		const failure = new Error('inventory unavailable');
		let fail = true;
		const warning = sinon.spy(logService, 'warn');
		const discovery = createDiscovery(true, async () => {
			if (fail) {
				throw failure;
			}
			return runtimePlugins;
		});
		discovery.start(enablementModel);
		await waitForState(discovery.plugins, plugins => plugins?.length === 0);
		const failedPlugins = discovery.plugins.get();
		const logged = warning.calledWith('[CopilotCliAgentPluginDiscovery] Failed to read runtime plugin inventory', failure);
		fail = false;
		await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.deepStrictEqual({
			failedPlugins, logged,
			recovered: discovery.plugins.get()?.map(plugin => plugin.enablement.get()),
			changedEnablement, defaultEnablement,
		}, {
			failedPlugins: [], logged: true,
			recovered: [ContributionEnablementState.DisabledProfile],
			changedEnablement: [], defaultEnablement: [],
		});
	}));

	test('automatically restores previously discovered plugins after a transient inventory failure', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri }]);
		let requests = 0;
		const discovery = createDiscovery(true, async () => {
			if (++requests === 2) {
				throw new Error('inventory unavailable');
			}
			return runtimePlugins;
		});
		discovery.start(enablementModel);
		await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		await discovery.refreshPlugins();
		const failedPlugins = discovery.plugins.get();
		await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.deepStrictEqual({
			failedPlugins,
			recovered: discovery.plugins.get()?.map(plugin => plugin.enablement.get()),
			requests,
		}, {
			failedPlugins: [],
			recovered: [ContributionEnablementState.EnabledProfile],
			requests: 3,
		});
	}));

	test('bounds runtime inventory retries and cancels them on disposal', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri }]);
		const warning = sinon.spy(logService, 'warn');
		const discovery = createDiscovery(true, async () => { throw new Error('inventory unavailable'); });
		discovery.start(enablementModel);
		await timeout(20000);
		const attempts = discovery.discoveryCount;
		await timeout(20000);
		const attemptsAfterLimit = discovery.discoveryCount;
		const disposableDiscovery = createDiscovery(true, async () => { throw new Error('inventory unavailable'); });
		disposableDiscovery.start(enablementModel);
		await waitForState(disposableDiscovery.plugins, plugins => plugins?.length === 0);
		disposableDiscovery.dispose();
		await timeout(20000);
		assert.deepStrictEqual({
			attempts,
			attemptsAfterLimit,
			loggedLimit: warning.calledWith('[CopilotCliAgentPluginDiscovery] Runtime plugin inventory retry limit reached.'),
			disposedAttempts: disposableDiscovery.discoveryCount,
		}, { attempts: 4, attemptsAfterLimit: 4, loggedLimit: true, disposedAttempts: 1 });
	}));

	test('superseded inventory cannot overwrite newer enablement or policy observables', async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri, enabled: false }]);
		const staleInventory = new DeferredPromise<readonly IAgentPluginInstallation[]>();
		const staleRequested = new DeferredPromise<void>();
		let requests = 0;
		const discovery = createDiscovery(true, async () => {
			if (++requests === 2) {
				await staleRequested.complete();
				return staleInventory.p;
			}
			return runtimePlugins;
		});
		await discovery.refreshPlugins();
		const olderRefresh = discovery.refreshPlugins();
		await staleRequested.p;
		const stale = runtimePlugins.map(plugin => ({ ...plugin, enabled: false, managedDesiredEnabled: false }));
		runtimePlugins = runtimePlugins.map(plugin => ({ ...plugin, enabled: true, managedDesiredEnabled: true }));
		await discovery.refreshPlugins();
		const plugin = discovery.plugins.get()![0];
		const observed: Array<[ContributionEnablementState, boolean | undefined]> = [];
		store.add(autorun(reader => {
			observed.push([plugin.enablement.read(reader), plugin.policyEnablement?.read(reader)]);
		}));
		await staleInventory.complete(stale);
		await olderRefresh;
		assert.deepStrictEqual({
			samePlugin: discovery.plugins.get()![0] === plugin,
			observed,
		}, { samePlugin: true, observed: [[ContributionEnablementState.EnabledProfile, true]] });
	});

	test('uses runtime enablement without writing workbench defaults', async () => {
		const enabledPlugin = joinPath(marketplaceRoot, 'enabled');
		const disabledPlugin = joinPath(marketplaceRoot, 'disabled');
		await writePlugin(enabledPlugin, 'enabled');
		await writePlugin(disabledPlugin, 'disabled');
		await writeInstalledPlugins([
			{ name: 'enabled', marketplace: 'copilot-plugins', uri: enabledPlugin },
			{ name: 'disabled', marketplace: 'copilot-plugins', uri: disabledPlugin, enabled: false },
		]);

		runtimePlugins = runtimePlugins.map(plugin => ({ ...plugin, enabled: !plugin.enabled }));
		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual({
			changedEnablement,
			defaultEnablement,
			runtime: sources.map(source => [source.copilotCliInstallation?.name, source.runtimeEnablement?.get().enabled]),
		}, {
			changedEnablement: [],
			defaultEnablement: [],
			runtime: [['disabled', true], ['enabled', false]],
		});
	});

	for (const policyEnabled of [undefined, true, false]) {
		test(`resolves marketplace collisions using runtime enablement instead of local overrides (policy: ${policyEnabled})`, () => runWithFakedTimers({ useFakeTimers: true }, async () => {
			store.add(fileService.registerProvider(Schemas.file, store.add(new InMemoryFileSystemProvider())));
			const home = userHome.with({ scheme: Schemas.file });
			const uri = joinPath(home, '.copilot/installed-plugins/_direct/microsoft--vscode-team-kit--model-council');
			await writePlugin(uri, 'model-council');
			await writeInstalledPlugins([{ name: 'model-council', marketplace: '', uri }], joinPath(home, '.copilot/config.json'));
			const discovery = createDiscovery(true, async () => runtimePlugins, home);
			await discovery.refreshPlugins();
			const initialPlugin = discovery.plugins.get()![0];
			const marketplaceUri = URI.file('/marketplace/model-council');
			const marketplaceReference = parseMarketplaceReference('microsoft/vscode-team-kit')!;
			const marketplacePlugin: IAgentPlugin = {
				uri: marketplaceUri,
				format: initialPlugin.format,
				label: initialPlugin.label,
				commands: initialPlugin.commands,
				skills: initialPlugin.skills,
				agents: initialPlugin.agents,
				instructions: initialPlugin.instructions,
				hooks: initialPlugin.hooks,
				mcpServerDefinitions: initialPlugin.mcpServerDefinitions,
				automations: initialPlugin.automations,
				enablement: derived(reader => service.enablementModel.readEnabled(marketplaceUri.toString(), reader)),
				fromMarketplace: {
					name: 'model-council',
					description: '',
					version: '1.0.0',
					source: 'model-council',
					sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'model-council' },
					marketplace: 'microsoft/vscode-team-kit',
					marketplaceReference,
					marketplaceType: MarketplaceType.Copilot,
				},
			};
			const marketplaceDiscovery = new class extends mock<IAgentPluginDiscovery>() {
				override readonly plugins = observableValue<readonly IAgentPlugin[]>('marketplacePlugins', [marketplacePlugin]);
				override start(): void { }
				override dispose(): void { }
			}();
			const instantiationService = store.add(new TestInstantiationService());
			sinon.stub(instantiationService, 'createInstance').onFirstCall().returns(marketplaceDiscovery).onSecondCall().returns(discovery);
			sinon.stub(agentPluginDiscoveryRegistry, 'getAll').returns([
				{ descriptor: new SyncDescriptor(CopilotCliAgentPluginDiscovery), priority: AgentPluginDiscoveryPriority.Marketplace, order: 0 },
				{ descriptor: new SyncDescriptor(CopilotCliAgentPluginDiscovery), priority: AgentPluginDiscoveryPriority.CopilotCli, order: 1 },
			]);
			const configurationService = new TestConfigurationService();
			const inspected = configurationService.inspect(ChatConfiguration.EnabledPlugins);
			sinon.stub(configurationService, 'inspect').withArgs(ChatConfiguration.EnabledPlugins).returns({
				...inspected,
				policyValue: policyEnabled === undefined ? undefined : { 'model-council@microsoft/vscode-team-kit': policyEnabled },
			});
			const baseEnablement = store.add(new AgentPluginEnablementService(store.add(new InMemoryStorageService()), new TestUserDataProfileService()));
			baseEnablement.setEnabled(uri.toString(), ContributionEnablementState.DisabledWorkspace);
			baseEnablement.setEnabled(marketplaceUri.toString(), ContributionEnablementState.EnabledWorkspace);
			const service = store.add(new AgentPluginService(instantiationService, configurationService, baseEnablement, logService));
			await waitForState(discovery.plugins, plugins => !!plugins?.length && plugins[0] !== initialPlugin);
			const exposed = () => service.plugins.get().filter(plugin => isContributionEnabled(plugin.enablement.get())).map(plugin => plugin.uri.toString());
			const enabled = exposed();
			service.enablementModel.setEnabled(uri.toString(), ContributionEnablementState.DisabledWorkspace);
			service.enablementModel.setEnabled(marketplaceUri.toString(), ContributionEnablementState.EnabledWorkspace);
			const afterLocalOverrides = exposed();
			runtimePlugins = runtimePlugins.map(plugin => ({ ...plugin, enabled: false }));
			await discovery.refreshPlugins();
			assert.deepStrictEqual({
				enabled,
				afterLocalOverrides,
				runtimeDisabled: exposed(),
				localRuntimeState: baseEnablement.readEnabled(uri.toString()),
			}, {
				enabled: [uri.toString()],
				afterLocalOverrides: [uri.toString()],
				runtimeDisabled: policyEnabled === false ? [] : [marketplaceUri.toString()],
				localRuntimeState: ContributionEnablementState.DisabledWorkspace,
			});
		}));
	}

	test('delegates direct plugin enablement to the Agent Host by source identity', async () => {
		const uri = joinPath(installedPluginsRoot, '_direct', 'canvas');
		await writePlugin(uri, 'canvas');
		await writeInstalledPlugins([{ name: 'canvas', marketplace: '', uri, enabled: false, directSourceId: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2', source: { source: 'github', repo: 'owner/repo', ref: 'main' } }]);
		const discovery = createDiscovery();
		discovery.start(enablementModel);
		const plugins = await waitForState(discovery.plugins, plugins => !!plugins?.length);
		const plugin = plugins![0];
		assert.ok(plugin.setEnabled);
		await plugin.setEnabled(true);
		await plugin.setEnabled(false);
		assert.deepStrictEqual(enablementCalls, [
			{ provider: 'copilotcli', plugin: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2', enabled: true },
			{ provider: 'copilotcli', plugin: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2', enabled: false },
		]);
	});

	test('ignores legacy workspace overrides and refreshes authoritative state after a toggle', async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri, enabled: false }]);
		const discovery = createDiscovery();
		discovery.start({ ...enablementModel, readEnabled: () => ContributionEnablementState.DisabledWorkspace });
		const plugins = await waitForState(discovery.plugins, plugins => !!plugins?.length);
		const plugin = plugins![0];
		await plugin.setEnabled!(true);
		assert.deepStrictEqual({
			enablement: plugin.enablement.get(),
			localWrites: changedEnablement,
			defaults: defaultEnablement,
			calls: enablementCalls,
		}, {
			enablement: ContributionEnablementState.EnabledProfile,
			localWrites: [],
			defaults: [],
			calls: [{ provider: 'copilotcli', plugin: 'spark@copilot-plugins', enabled: true }],
		});
	});

	test('preserves plugin entries and loaded contributions across enablement refreshes', async () => {
		const uri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(uri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri, version: '1' }]);
		const discovery = createDiscovery();
		discovery.start(enablementModel);
		const plugins = (await waitForState(discovery.plugins, plugins => !!plugins?.length))!;
		const plugin = plugins[0];
		await waitForState(plugin.skills, skills => skills.length === 1);
		const contributionCounts: number[] = [];
		let publications = 0;
		store.add(autorun(reader => {
			publications++;
			for (const entry of discovery.plugins.read(reader) ?? []) {
				contributionCounts.push(entry.skills.read(reader).length);
			}
		}));
		await plugin.setEnabled!(false);
		await plugin.setEnabled!(true);
		await discovery.refreshPlugins();
		const retained = discovery.plugins.get();
		const afterActivation = { samePlugins: retained === plugins, samePlugin: retained?.[0] === plugin, contributionCounts: [...contributionCounts], publications };
		await writePlugin(uri, 'spark-v2');
		runtimePlugins = runtimePlugins.map(installation => ({ ...installation, version: '2' }));
		await discovery.refreshPlugins();
		assert.deepStrictEqual({
			afterActivation,
			updated: discovery.plugins.get()?.map(entry => ({ label: entry.label, replaced: entry !== plugin })),
		}, {
			afterActivation: { samePlugins: true, samePlugin: true, contributionCounts: [1], publications: 1 },
			updated: [{ label: 'spark-v2', replaced: true }],
		});
	});

	test('disambiguates same-name direct plugin uninstalls by source identity', async () => {
		const mainPlugin = joinPath(installedPluginsRoot, '_direct', 'spark-main');
		const nextPlugin = joinPath(installedPluginsRoot, '_direct', 'spark-next');
		await writePlugin(mainPlugin, 'spark');
		await writePlugin(nextPlugin, 'spark');
		await writeInstalledPlugins([
			{ name: 'spark', marketplace: '', uri: mainPlugin, directSourceId: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2', source: { source: 'github', repo: 'owner/repo', ref: 'main' } },
			{ name: 'spark', marketplace: '', uri: nextPlugin, directSourceId: '94478a45a5d696cd7e18f9bb6752956b0fb9ac1bd21fe5676215c3fdb0071634', source: { source: 'github', repo: 'owner/repo', ref: 'next' } },
		]);

		const sources = await createDiscovery().discoverPluginSources();
		for (const source of sources) {
			assert.ok(source.remove);
			await source.remove();
		}

		assert.deepStrictEqual({
			sources: sources.map(source => ({
				uri: source.uri.toString(),
				installation: source.copilotCliInstallation,
			})),
			uninstallCalls,
		}, {
			sources: [{
				uri: mainPlugin.toString(),
				installation: {
					name: 'spark',
					marketplace: '',
					directSourceId: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2',
				},
			}, {
				uri: nextPlugin.toString(),
				installation: {
					name: 'spark',
					marketplace: '',
					directSourceId: '94478a45a5d696cd7e18f9bb6752956b0fb9ac1bd21fe5676215c3fdb0071634',
				},
			}],
			uninstallCalls: [{
				provider: 'copilotcli',
				request: {
					name: 'spark',
					marketplace: '',
					directSourceId: 'b28f37595143df611741ca53f1d7e05eb85b133a1307f8a3a44cb383649d6ab2',
				},
			}, {
				provider: 'copilotcli',
				request: {
					name: 'spark',
					marketplace: '',
					directSourceId: '94478a45a5d696cd7e18f9bb6752956b0fb9ac1bd21fe5676215c3fdb0071634',
				},
			}],
		});
	});

	test('does not expose uninstall for a direct plugin without source identity', async () => {
		const pluginUri = joinPath(installedPluginsRoot, '_direct', 'spark');
		await writePlugin(pluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: '', uri: pluginUri }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => ({
			uri: source.uri.toString(),
			remove: source.remove,
		})), [{
			uri: pluginUri.toString(),
			remove: undefined,
		}]);
	});

	test('does not expose uninstall without Agent Host management support', async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(pluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri }]);

		const sources = await createDiscovery(false).discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => ({
			uri: source.uri.toString(),
			remove: source.remove,
		})), [{
			uri: pluginUri.toString(),
			remove: undefined,
		}]);
	});

	test('refreshes runtime installations and replaced content without config or cache watchers', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		const stagingUri = joinPath(marketplaceRoot, 'transaction-directory');
		const backupUri = joinPath(marketplaceRoot, 'backup-directory');
		await writePlugin(pluginUri, 'spark-v1');
		await writePlugin(stagingUri, 'spark-v2');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v1' }]);
		await timeout(10);

		const createWatcherSpy = sinon.spy(fileService, 'createWatcher');
		const watchSpy = sinon.spy(fileService, 'watch');
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(initialPlugins);

		await fileService.move(pluginUri, backupUri);
		await fileService.move(stagingUri, pluginUri);
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri, installedAt: 'v2' }]);
		publishCustomizations('2');

		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(updatedPlugins);
		assert.deepStrictEqual({
			reusedPlugin: initialPlugins[0] === updatedPlugins[0],
			watchRequests: createWatcherSpy.getCalls().map(call => ({
				resource: call.args[0].toString(),
				recursive: call.args[1]?.recursive,
			})),
			uncorrelatedWatchCount: watchSpy.callCount,
		}, {
			reusedPlugin: false,
			watchRequests: [],
			uncorrelatedWatchCount: 0,
		});
	}));

	test('discovers new harness installations without changes to the default home', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const initialPluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(initialPluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: initialPluginUri }]);
		await timeout(10);

		const discovery = createDiscovery();
		let publicationCount = 0;
		store.add(autorun(reader => {
			discovery.plugins.read(reader);
			publicationCount++;
		}));
		discovery.start(enablementModel);

		const initialPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 1);
		assert.ok(initialPlugins);
		const initialDiscoveryCount = discovery.discoveryCount;
		const initialPublicationCount = publicationCount;

		await fileService.writeFile(joinPath(copilotHome, 'data.db'), VSBuffer.fromString('runtime churn'));
		await timeout(500);

		assert.deepStrictEqual({
			discoveryCount: discovery.discoveryCount,
			publicationCount,
			reusedPublishedArray: discovery.plugins.get() === initialPlugins,
		}, {
			discoveryCount: initialDiscoveryCount,
			publicationCount: initialPublicationCount,
			reusedPublishedArray: true,
		});

		const secondPluginUri = joinPath(marketplaceRoot, 'second');
		await writePlugin(secondPluginUri, 'second');
		runtimePlugins.push({ name: 'second', marketplace: 'copilot-plugins', resource: secondPluginUri, enabled: true });
		publishCustomizations('2');
		const updatedPlugins = await waitForState(discovery.plugins, plugins => plugins?.length === 2);
		assert.ok(updatedPlugins);
		assert.deepStrictEqual(updatedPlugins.map(plugin => plugin.label), ['second', 'spark']);
	}));

	test('discovers isolated-home plugins and follows uninstall and reinstall notifications', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const reads = sinon.spy(fileService, 'readFile');
		const discovery = createDiscovery();
		discovery.start(enablementModel);

		await waitForState(discovery.plugins, plugins => plugins?.length === 0);

		const pluginUri = URI.from({ scheme: Schemas.inMemory, path: '/isolated/copilot-home/installed-plugins/spark' });
		await writePlugin(pluginUri, 'spark-v1');
		runtimePlugins = [{ name: 'spark', marketplace: 'copilot-plugins', resource: pluginUri, enabled: false }];
		publishCustomizations();
		const installedPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v1');
		assert.ok(installedPlugins);

		runtimePlugins = [];
		publishCustomizations();
		await waitForState(discovery.plugins, plugins => plugins?.length === 0);

		await writePlugin(pluginUri, 'spark-v2');
		runtimePlugins = [{ name: 'spark', marketplace: 'copilot-plugins', resource: pluginUri, enabled: true }];
		publishCustomizations('2');
		const reinstalledPlugins = await waitForState(discovery.plugins, plugins => plugins?.[0]?.label === 'spark-v2');
		assert.ok(reinstalledPlugins);

		assert.deepStrictEqual({
			labels: [installedPlugins[0].label, reinstalledPlugins[0].label],
			enablement: [installedPlugins[0].enablement.get(), reinstalledPlugins[0].enablement.get()],
			configReads: reads.getCalls().filter(call => call.args[0].path.endsWith('/config.json')).length,
		}, {
			labels: ['spark-v1', 'spark-v2'],
			enablement: [ContributionEnablementState.EnabledProfile, ContributionEnablementState.EnabledProfile],
			configReads: 0,
		});
	}));

	test('uses harness inventory even when the default-home config is malformed', async () => {
		const pluginUri = joinPath(marketplaceRoot, 'spark');
		await writePlugin(pluginUri, 'spark');
		await writeInstalledPlugins([{ name: 'spark', marketplace: 'copilot-plugins', uri: pluginUri }]);
		await fileService.writeFile(configFile, VSBuffer.fromString('{ invalid'));
		const sources = await createDiscovery().discoverPluginSources();
		assert.deepStrictEqual(sources.map(source => source.uri.toString()), [pluginUri.toString()]);
	});

	test('accepts harness-reported content outside the default CLI installed root', async () => {
		const externalPlugin = joinPath(userHome, 'external-plugin');
		await writePlugin(externalPlugin, 'external');
		await writeInstalledPlugins([{ name: 'external', marketplace: 'copilot-plugins', uri: externalPlugin }]);

		const sources = await createDiscovery().discoverPluginSources();

		assert.deepStrictEqual(sources.map(source => source.uri.toString()), [externalPlugin.toString()]);
	});

	test('does not guess content locations when the harness omits them', async () => {
		await writePlugin(joinPath(marketplaceRoot, 'spark'), 'spark');
		runtimePlugins = [{ name: 'spark', marketplace: 'copilot-plugins', enabled: true }];
		const sources = await createDiscovery().discoverPluginSources();
		assert.deepStrictEqual(sources, []);
	});
});
