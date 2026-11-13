/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { AgentPluginsBrowseCommand, AgentPluginsListView } from '../../browser/agentPluginsView.js';
import { AgentPluginItemKind } from '../../browser/agentPluginEditor/agentPluginItems.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../../common/views.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';
import { IPluginInstallService } from '../../common/plugins/pluginInstallService.js';
import { IMarketplacePlugin, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../common/plugins/pluginMarketplaceService.js';

suite('AgentPluginsView', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('browse action searches for agent plugins', async () => {
		const instantiationService = store.add(new TestInstantiationService());
		const searches: string[] = [];
		instantiationService.stub(IExtensionsWorkbenchService, new class extends mock<IExtensionsWorkbenchService>() {
			override openSearch(searchValue: string): Promise<void> {
				searches.push(searchValue);
				return Promise.resolve();
			}
		}());

		await instantiationService.invokeFunction(accessor => new AgentPluginsBrowseCommand().run(accessor));

		assert.deepStrictEqual(searches, ['@agentPlugins ']);
	});

	function createView(cliMarketplace = 'catalog') {
		const services = workbenchInstantiationService(undefined, store);
		services.stub(IViewDescriptorService, new class extends mock<IViewDescriptorService>() {
			override readonly onDidChangeLocation = Event.None;
			override getViewLocationById() { return ViewContainerLocation.Sidebar; }
			override getViewContainerByViewId() { return null; }
		}());
		const plugin = new class extends mock<IAgentPlugin>() {
			override readonly uri = URI.file('/home/user/.copilot/installed-plugins/catalog/test');
			override readonly label = 'Test Plugin';
			override readonly copilotCliInstallation = { name: 'test', marketplace: cliMarketplace };
			override readonly enablement = observableValue('enablement', ContributionEnablementState.DisabledProfile);
		}();
		const marketplacePlugin: IMarketplacePlugin = {
			name: 'test',
			description: '',
			version: '',
			source: './test',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: './test' },
			marketplace: 'workspace-alias',
			marketplaceName: 'catalog',
			marketplaceReference: parseMarketplaceReference('owner/marketplace')!,
			marketplaceType: MarketplaceType.Copilot,
		};
		services.stub(IAgentPluginService, { plugins: observableValue('plugins', [plugin]) });
		services.stub(IPluginMarketplaceService, {
			onDidChangeMarketplaces: Event.None,
			installedPlugins: observableValue('installed', []),
			lastFetchedPlugins: observableValue('fetched', []),
			recommendedPlugins: observableValue('recommended', new Set(['test@workspace-alias'])),
			fetchMarketplacePlugins: async () => [marketplacePlugin],
		});
		services.stub(IPluginInstallService, { getPluginInstallUri: () => URI.file('/vscode/plugins/test') });
		const view = store.add(services.createInstance(AgentPluginsListView, {}, { id: 'test.agentPlugins', title: 'Plugins' }));
		return { view, plugin };
	}

	test('search shows a CLI installation instead of an installable marketplace duplicate', async () => {
		const { view, plugin } = createView();
		const results = [];
		for (const query of ['@agentPlugins @recommended', '@agentPlugins', '@agentPlugins workspace-alias']) {
			const model = await view.show(query);
			results.push(Array.from({ length: model.length }, (_, i) => {
				const item = model.get(i);
				return { kind: item.kind, uri: item.kind === AgentPluginItemKind.Installed ? item.plugin.uri : undefined };
			}));
		}
		assert.deepStrictEqual(results, [
			[{ kind: AgentPluginItemKind.Installed, uri: plugin.uri }],
			[{ kind: AgentPluginItemKind.Installed, uri: plugin.uri }],
			[{ kind: AgentPluginItemKind.Installed, uri: plugin.uri }],
		]);
	});

	test('recommended search does not show a CLI plugin from a different marketplace with the same alias', async () => {
		const { view } = createView('workspace-alias');
		const model = await view.show('@agentPlugins @recommended');
		assert.deepStrictEqual(Array.from({ length: model.length }, (_, i) => model.get(i).kind), [AgentPluginItemKind.Marketplace]);
	});
});
