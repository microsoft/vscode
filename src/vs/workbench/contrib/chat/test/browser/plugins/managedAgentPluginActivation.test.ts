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
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ManagedAgentPluginActivation } from '../../../browser/managedAgentPluginActivation.js';
import { ContributionEnablementState, IEnablementModel } from '../../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../../common/plugins/pluginInstallService.js';
import { IMarketplaceInstalledPlugin, IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('ManagedAgentPluginActivation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const installUri = URI.file('/agent-plugins/owner/marketplace/example-plugin');

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

	function createContribution(options?: { readonly installed?: boolean; readonly hidden?: boolean; readonly installSucceeds?: boolean; readonly managed?: boolean }) {
		const plugin = createPlugin();
		const pluginId = `${plugin.name}@${plugin.marketplace}`;
		const installedPlugins = observableValue<readonly IMarketplaceInstalledPlugin[]>('installedPlugins', options?.installed ? [{ pluginUri: installUri, plugin }] : []);
		const installCalled = new DeferredPromise<void>();
		const baselineSet = new DeferredPromise<void>();
		let installCount = 0;
		let fetchCount = 0;
		const { model, states } = createEnablementModel(state => {
			if (state === ContributionEnablementState.DisabledProfile) {
				baselineSet.complete();
			}
		});

		const marketplaceService = new class extends mock<IPluginMarketplaceService>() {
			override readonly onDidChangeMarketplaces = Event.None;
			override readonly installedPlugins = installedPlugins;
			override isPluginInstalled(pluginUri: URI): boolean {
				return installedPlugins.get().some(entry => entry.pluginUri.toString() === pluginUri.toString());
			}
			override async fetchMarketplacePlugins(): Promise<IMarketplacePlugin[]> {
				fetchCount++;
				return [plugin];
			}
		}();
		const installService = new class extends mock<IPluginInstallService>() {
			override async installPlugin(_plugin: IMarketplacePlugin, _token?: CancellationToken): Promise<void> {
				installCount++;
				if (options?.installSucceeds !== false) {
					installedPlugins.set([{ pluginUri: installUri, plugin }], undefined);
				}
				installCalled.complete();
			}
			override getPluginInstallUri(): URI {
				return installUri;
			}
		}();
		const agentPluginService = new class extends mock<IAgentPluginService>() {
			override readonly plugins = observableValue<readonly IAgentPlugin[]>('plugins', []);
			override readonly enablementModel = model;
			override setInstalledPluginProfileBaseline(key: string, enabled: boolean): void {
				model.setEnabled(key, enabled ? ContributionEnablementState.EnabledProfile : ContributionEnablementState.DisabledProfile);
			}
		}();
		const entitlementService = new class extends mock<IChatEntitlementService>() {
			override readonly onDidChangeSentiment = Event.None;
			override readonly sentiment = { hidden: options?.hidden };
		}();
		const configurationService = new class extends mock<IConfigurationService>() {
			override readonly onDidChangeConfiguration = Event.None;
			override inspect<T>(): { policyValue?: T } {
				return {
					policyValue: (options?.managed === false ? undefined : { [pluginId]: true }) as T | undefined,
				};
			}
		}();

		store.add(new ManagedAgentPluginActivation(
			marketplaceService,
			installService,
			agentPluginService,
			entitlementService,
			configurationService,
			new NullLogService(),
		));

		return {
			baselineSet,
			installCalled,
			installedPlugins,
			states,
			get fetchCount() { return fetchCount; },
			get installCount() { return installCount; },
		};
	}

	test('installs a required plugin with a disabled profile baseline', async () => {
		const harness = createContribution();

		await harness.baselineSet.p;

		assert.deepStrictEqual({
			fetchCount: harness.fetchCount,
			installCount: harness.installCount,
			profileState: harness.states.get(installUri.toString()),
		}, {
			fetchCount: 1,
			installCount: 1,
			profileState: ContributionEnablementState.DisabledProfile,
		});
	});

	test('preserves enablement when the required plugin is already installed', async () => {
		const harness = createContribution({ installed: true });

		await timeout(0);

		assert.deepStrictEqual({
			fetchCount: harness.fetchCount,
			installCount: harness.installCount,
			states: [...harness.states],
		}, {
			fetchCount: 1,
			installCount: 0,
			states: [],
		});
	});

	test('reinstalls a required plugin after it is removed', async () => {
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

	test('does not fetch or install without a required policy entry', async () => {
		const harness = createContribution({ managed: false });

		await timeout(0);

		assert.deepStrictEqual({
			fetchCount: harness.fetchCount,
			installCount: harness.installCount,
		}, {
			fetchCount: 0,
			installCount: 0,
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
