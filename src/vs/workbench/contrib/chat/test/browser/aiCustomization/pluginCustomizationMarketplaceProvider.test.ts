/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { CustomizationMarketplaceMediaType } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration, CustomizationMarketplaceSources } from '../../../../../../platform/customizationMarketplace/common/customizationMarketplaceSources.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { PluginCustomizationMarketplaceProvider, getPluginCustomizationMarketplaceSourceInfos, getPluginMarketplaceIdentifier } from '../../../browser/aiCustomization/pluginCustomizationMarketplaceProvider.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { DEFAULT_PLUGIN_MARKETPLACE } from '../../../common/plugins/marketplaceReference.js';
import { IMarketplacePlugin, IPluginMarketplacePage, IPluginMarketplaceQuery, IPluginMarketplaceService, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('PluginCustomizationMarketplaceProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const customReference = parseMarketplaceReference('microsoft/plugins#stable')!;
	const defaultReference = parseMarketplaceReference(DEFAULT_PLUGIN_MARKETPLACE)!;
	const plugin: IMarketplacePlugin = {
		name: 'Review',
		description: 'Review code',
		version: '1.0',
		source: 'plugins/review',
		sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'plugins/review' },
		marketplace: customReference.displayLabel,
		marketplaceReference: customReference,
		marketplaceType: MarketplaceType.Claude,
	};

	class TestPluginMarketplaceService extends mock<IPluginMarketplaceService>() {
		override readonly onDidChangeMarketplaces = Event.None;
		readonly calls: IPluginMarketplaceQuery[] = [];
		references = [customReference, defaultReference];
		page: IPluginMarketplacePage = { items: [plugin], total: 1, errors: [] };

		override getMarketplaceReferences() {
			return this.references;
		}

		override async queryMarketplacePlugins(options: IPluginMarketplaceQuery): Promise<IPluginMarketplacePage> {
			this.calls.push(options);
			return this.page;
		}
	}

	test('maps custom registry results behind the configured Plugin source', async () => {
		const service = new TestPluginMarketplaceService();
		service.page = {
			items: [plugin],
			total: undefined,
			nextCursor: 'next',
			errors: [{ marketplace: customReference.displayLabel, message: 'Another marketplace is unavailable' }],
		};
		const provider = new PluginCustomizationMarketplaceProvider('custom', service, new TestConfigurationService());
		const page = await provider.query({ query: 'review', pageSize: 1 }, CancellationToken.None);
		assert.deepStrictEqual({
			id: provider.id,
			sourceId: provider.sourceId,
			items: page.items,
			total: page.total,
			nextCursor: page.nextCursor,
			warning: page.warning,
			query: {
				...service.calls[0],
				marketplaceIds: [...service.calls[0].marketplaceIds],
				marketplaceTypes: [...service.calls[0].marketplaceTypes],
			},
		}, {
			id: 'pluginMarketplaces.custom',
			sourceId: CustomizationMarketplaceSources.PluginMarketplaces.id,
			items: [{
				identifier: getPluginMarketplaceIdentifier(plugin),
				displayName: 'Review',
				description: 'Review code',
				mediaType: CustomizationMarketplaceMediaType.ClaudePlugin,
				tags: [],
				capabilities: [],
				representativeQueries: [],
				originLabel: customReference.displayLabel,
				version: '1.0',
				url: undefined,
				score: 0,
				priority: 1,
				installation: { kind: 'configuredPlugin' },
			}],
			total: undefined,
			nextCursor: 'next',
			warning: `${customReference.displayLabel}: Another marketplace is unavailable`,
			query: {
				text: 'review',
				pageSize: 1,
				cursor: undefined,
				marketplaceIds: [customReference.canonicalId],
				marketplaceTypes: [MarketplaceType.Claude, MarketplaceType.Copilot, MarketplaceType.OpenPlugin],
			},
		});
	});

	test('default provider is suppressed while the public feed is enabled', async () => {
		const service = new TestPluginMarketplaceService();
		const provider = new PluginCustomizationMarketplaceProvider('default', service, new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		}));
		assert.deepStrictEqual(await provider.query({}, CancellationToken.None), { items: [], total: 0 });
		assert.strictEqual(service.calls.length, 0);
	});

	test('default provider selects only the existing default marketplace', async () => {
		const service = new TestPluginMarketplaceService();
		service.page = { items: [{ ...plugin, marketplace: defaultReference.displayLabel, marketplaceReference: defaultReference }], total: 1, errors: [] };
		const provider = new PluginCustomizationMarketplaceProvider('default', service, new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: false,
		}));
		const page = await provider.query({ mediaType: CustomizationMarketplaceMediaType.ClaudePlugin }, CancellationToken.None);
		assert.deepStrictEqual({
			ids: [...service.calls[0].marketplaceIds],
			priority: page.items[0].priority,
			score: page.items[0].score,
		}, {
			ids: [defaultReference.canonicalId],
			priority: 0,
			score: undefined,
		});
	});

	test('maps customization media types to native Plugin marketplace types', async () => {
		const service = new TestPluginMarketplaceService();
		const provider = new PluginCustomizationMarketplaceProvider('custom', service, new TestConfigurationService());
		await provider.query({ mediaType: CustomizationMarketplaceMediaType.CopilotPlugin }, CancellationToken.None);
		await provider.query({ mediaType: CustomizationMarketplaceMediaType.ClaudePlugin }, CancellationToken.None);
		const unsupported = await provider.query({ mediaType: CustomizationMarketplaceMediaType.Skill }, CancellationToken.None);
		assert.deepStrictEqual({
			types: service.calls.map(call => [...call.marketplaceTypes]),
			unsupported,
		}, {
			types: [
				[MarketplaceType.Copilot, MarketplaceType.OpenPlugin],
				[MarketplaceType.Claude],
			],
			unsupported: { items: [], total: 0 },
		});
	});

	test('contributes the logical source only when an allowed native registry can provide content', async () => {
		const service = new TestPluginMarketplaceService();
		const configuration = new TestConfigurationService({
			[ChatConfiguration.PluginsEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		const sourceIds = () => getPluginCustomizationMarketplaceSourceInfos(configuration, service).map(source => source.id);
		service.references = [defaultReference];
		const publicOnly = sourceIds();
		service.references = [defaultReference, customReference];
		const withCustom = sourceIds();
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		service.references = [defaultReference];
		const defaultWithoutPublic = sourceIds();
		await configuration.setUserConfiguration(ChatConfiguration.PluginsEnabled, false);
		const pluginsDisabled = sourceIds();
		assert.deepStrictEqual({
			publicOnly,
			withCustom,
			defaultWithoutPublic,
			pluginsDisabled,
		}, {
			publicOnly: [],
			withCustom: [CustomizationMarketplaceSources.PluginMarketplaces.id],
			defaultWithoutPublic: [CustomizationMarketplaceSources.PluginMarketplaces.id],
			pluginsDisabled: [],
		});
	});
});
