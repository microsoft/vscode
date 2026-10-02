/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { WorkspaceAgentPluginActivationService } from '../../../browser/workspaceAgentPluginActivation.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IInstallMarketplacePluginOptions, IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';
import { IWorkspacePluginSettings, IWorkspacePluginSettingsService } from '../../../common/plugins/workspacePluginSettingsService.js';

suite('WorkspaceAgentPluginActivation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const installUri = URI.file('/agent-plugins/owner/marketplace/example-plugin');
	const workspaceFolder = URI.file('/workspace');

	function createPlugin(): IMarketplacePlugin {
		const marketplaceReference = parseMarketplaceReference('owner/marketplace');
		assert.ok(marketplaceReference);
		return {
			name: 'example-plugin',
			description: '',
			version: '1.0.0',
			source: 'plugins/example-plugin',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/example-plugin' },
			marketplace: 'owner/marketplace',
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function createEnablementModel(onSet?: (state: ContributionEnablementState) => void): { model: IEnablementModel; states: Map<string, ContributionEnablementState> } {
		const states = new Map<string, ContributionEnablementState>();
		return {
			states,
			model: {
				readEnabled: key => states.get(key) ?? ContributionEnablementState.EnabledProfile,
				readProfileEnabled: key => (states.get(key) ?? ContributionEnablementState.EnabledProfile) === ContributionEnablementState.EnabledProfile,
				setEnabled: (key, state) => {
					states.set(key, state);
					onSet?.(state);
				},
				remove: key => states.delete(key),
			},
		};
	}

	function createContribution(options?: { readonly installed?: boolean; readonly hidden?: boolean; readonly installSucceeds?: boolean; readonly discoveredPlugin?: IAgentPlugin; readonly installedPlugin?: IMarketplacePlugin }) {
		const plugin = createPlugin();
		const pluginId = `${plugin.name}@${plugin.marketplace}`;
		let installedMetadata = options?.installedPlugin ?? (options?.installed ? plugin : undefined);
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('installedPlugins', installedMetadata ? [{ pluginUri: installUri, plugin: installedMetadata }] : []);
		const recommendedPlugins = observableValue<ReadonlySet<string>>('recommendedPlugins', new Set([pluginId]));
		const workspaceSettings: IWorkspacePluginSettings = {
			workspaceFolder,
			extraMarketplaces: [{ name: plugin.marketplace, reference: plugin.marketplaceReference }],
			enabledPlugins: new Map([[pluginId, true]]),
		};
		const installCalled = new DeferredPromise<void>();
		const baselineSet = new DeferredPromise<void>();
		let installCount = 0;
		let fetchCount = 0;
		let metadataRefreshCount = 0;
		let discoveryRefreshCount = 0;
		let installOptions: IInstallMarketplacePluginOptions | undefined;
		const { model, states } = createEnablementModel(state => {
			if (state === ContributionEnablementState.DisabledProfile) {
				baselineSet.complete();
			}
		});

		const marketplaceService = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override readonly installedPlugins = installedPlugins;
			override readonly whenInstalledPluginsReady = Promise.resolve();
			override readonly recommendedPlugins = recommendedPlugins;
			override getMarketplacePluginMetadata(): IMarketplacePlugin | undefined {
				return installedMetadata;
			}
			override isPluginInstalled(pluginUri: URI): boolean {
				return installedPlugins.get().some(entry => entry.pluginUri.toString() === pluginUri.toString());
			}
			override addInstalledPlugin(pluginUri: URI, installedPlugin: IMarketplacePlugin): void {
				metadataRefreshCount++;
				installedMetadata = installedPlugin;
				installedPlugins.set([{ pluginUri, plugin: installedPlugin }], undefined);
			}
			override async fetchMarketplacePlugins(): Promise<IMarketplacePlugin[]> {
				fetchCount++;
				return [plugin];
			}
		}();
		const installService = new class extends mock<IPluginInstallService>() {
			override async installPlugin(_plugin: IMarketplacePlugin, _token?: CancellationToken, installOptionsArgument?: IInstallMarketplacePluginOptions): Promise<void> {
				installCount++;
				installOptions = installOptionsArgument;
				if (options?.installSucceeds !== false) {
					marketplaceService.addInstalledPlugin(installUri, plugin);
				}
				installCalled.complete();
			}
			override getPluginInstallUri(): URI {
				return installUri;
			}
		}();
		const agentPluginService = new class extends mock<IAgentPluginService>() {
			override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', options?.discoveredPlugin ? [options.discoveredPlugin] : []);
			override readonly enablementModel = model;
			override readonly whenReady = Promise.resolve();
			override async refresh(): Promise<void> {
				discoveryRefreshCount++;
			}
		}();
		const workspacePluginSettingsService = new class extends mock<IWorkspacePluginSettingsService>() {
			override readonly workspaceSettings = observableValue<readonly IWorkspacePluginSettings[]>('workspaceSettings', [workspaceSettings]);
			override readonly extraMarketplaces = observableValue('extraMarketplaces', workspaceSettings.extraMarketplaces);
			override readonly enabledPlugins = observableValue('enabledPlugins', workspaceSettings.enabledPlugins);
			override async whenSettled(): Promise<void> { }
			override getWorkspaceSettings(): IWorkspacePluginSettings {
				return workspaceSettings;
			}
		}();
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = Event.None;
			override readonly sentiment = { hidden: options?.hidden };
		}();

		const service = store.add(new WorkspaceAgentPluginActivationService(
			marketplaceService,
			installService,
			agentPluginService,
			workspacePluginSettingsService,
			entitlementService,
			new NullLogService(),
		));

		return {
			baselineSet,
			installCalled,
			installedPlugins,
			states,
			reconcile: () => service.reconcile([workspaceFolder]),
			get installOptions() { return installOptions; },
			get metadataRefreshCount() { return metadataRefreshCount; },
			get discoveryRefreshCount() { return discoveryRefreshCount; },
			get fetchCount() { return fetchCount; },
			get installCount() { return installCount; },
		};
	}

	test('installs a configured plugin with a disabled profile baseline', async () => {
		const harness = createContribution();

		await harness.reconcile();

		assert.deepStrictEqual({
			installCount: harness.installCount,
			discoveryRefreshCount: harness.discoveryRefreshCount,
			skipTrust: harness.installOptions?.skipTrust,
			profileState: harness.states.get(installUri.toString()),
		}, {
			installCount: 1,
			discoveryRefreshCount: 1,
			skipTrust: true,
			profileState: ContributionEnablementState.DisabledProfile,
		});
	});

	test('preserves enablement when the configured plugin is already installed', async () => {
		const harness = createContribution({ installed: true });

		await harness.reconcile();

		assert.deepStrictEqual({
			installCount: harness.installCount,
			metadataRefreshCount: harness.metadataRefreshCount,
			states: [...harness.states],
		}, {
			installCount: 0,
			metadataRefreshCount: 0,
			states: [],
		});
	});

	test('refreshes installed metadata from the repository marketplace before resolving', async () => {
		const currentPlugin = createPlugin();
		const installedPlugin = {
			...currentPlugin,
			marketplace: 'stale-marketplace-name',
			marketplaceReference: {
				...currentPlugin.marketplaceReference,
				displayLabel: 'stale-marketplace-name',
				autoUpdate: undefined,
			},
		};
		const harness = createContribution({ installedPlugin });

		await harness.reconcile();

		assert.deepStrictEqual({
			installCount: harness.installCount,
			metadataRefreshCount: harness.metadataRefreshCount,
			discoveryRefreshCount: harness.discoveryRefreshCount,
		}, {
			installCount: 0,
			metadataRefreshCount: 1,
			discoveryRefreshCount: 1,
		});
	});

	test('reinstalls a configured plugin after it is removed', async () => {
		const harness = createContribution({ installed: true });
		await timeout(0);

		harness.installedPlugins.set([], undefined);
		await harness.baselineSet.p;

		assert.deepStrictEqual({
			installCount: harness.installCount,
			profileState: harness.states.get(installUri.toString()),
		}, {
			installCount: 1,
			profileState: ContributionEnablementState.DisabledProfile,
		});
	});

	test('installs the configured source when a same-named plugin from another source is discovered', async () => {
		const otherMarketplace = createPlugin();
		const otherReference = parseMarketplaceReference('owner/other-marketplace');
		assert.ok(otherReference);
		const harness = createContribution({
			discoveredPlugin: {
				uri: URI.file('/agent-plugins/owner/other-marketplace/example-plugin'),
				format: PluginFormat.Copilot,
				label: otherMarketplace.name,
				enablement: observableValue('otherPluginEnablement', ContributionEnablementState.EnabledProfile),
				hooks: observableValue('otherPluginHooks', []),
				commands: observableValue('otherPluginCommands', []),
				skills: observableValue('otherPluginSkills', []),
				agents: observableValue('otherPluginAgents', []),
				instructions: observableValue('otherPluginInstructions', []),
				mcpServerDefinitions: observableValue('otherPluginMcpServers', []),
				automations: observableValue('otherPluginAutomations', []),
				fromMarketplace: {
					...otherMarketplace,
					marketplaceReference: { ...otherReference, displayLabel: otherMarketplace.marketplace },
				},
			},
		});

		await harness.baselineSet.p;

		assert.deepStrictEqual({
			installCount: harness.installCount,
			profileState: harness.states.get(installUri.toString()),
		}, {
			installCount: 1,
			profileState: ContributionEnablementState.DisabledProfile,
		});
	});

	test('does not change profile enablement when installation fails', async () => {
		const harness = createContribution({ installSucceeds: false });

		await harness.installCalled.p;
		await timeout(0);

		assert.deepStrictEqual({
			installCount: harness.installCount,
			states: [...harness.states],
		}, {
			installCount: 1,
			states: [],
		});
	});

	test('does not fetch or install plugins when AI features are hidden', async () => {
		const harness = createContribution({ hidden: true });

		await timeout(0);

		assert.deepStrictEqual({
			fetchCount: harness.fetchCount,
			installCount: harness.installCount,
		}, {
			fetchCount: 0,
			installCount: 0,
		});
	});
});
