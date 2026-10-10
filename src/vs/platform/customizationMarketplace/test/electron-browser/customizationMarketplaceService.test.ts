/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IMcpGalleryService, mcpGalleryServiceUrlConfig } from '../../../mcp/common/mcpManagement.js';
import { IMcpGalleryManifestService } from '../../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../../product/common/productService.js';
import { CustomizationMarketplaceConfiguration, getVisibleCustomizationMarketplaceSources } from '../../common/customizationMarketplaceSources.js';
import { NativeCustomizationMarketplaceService } from '../../electron-browser/customizationMarketplaceService.js';

suite('NativeCustomizationMarketplaceService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('queries configured and default MCP registries without a platform GitHub Feed', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const galleryUrls: string[] = [];
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		services.stub(IMcpGalleryManifestService, new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: 'https://registry.test', version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return { url: 'https://api.mcp.github.com', version: 'v0.1', resources: [] }; }
		}());
		services.stub(IMcpGalleryService, new class extends mock<IMcpGalleryService>() {
			override async queryPage(_options: { readonly pageSize: number }, _token: CancellationToken, manifest?: { readonly url: string }) {
				const registryUrl = manifest?.url ?? '';
				galleryUrls.push(registryUrl);
				const name = registryUrl === 'https://registry.test' ? 'custom' : 'default';
				return {
					items: [{
						name,
						displayName: name,
						description: '',
						version: '1.0',
						isLatest: true,
						status: GalleryMcpServerStatus.Active,
						publisher: name,
						configuration: {},
					} satisfies IGalleryMcpServer],
					total: 1,
				};
			}
		}());
		const service = services.createInstance(NativeCustomizationMarketplaceService);

		const first = await service.query({ pageSize: 3 }, CancellationToken.None);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		const second = await service.query({ pageSize: 3 }, CancellationToken.None);

		assert.deepStrictEqual({
			sources: service.sources.map(source => source.id),
			pages: [first, second].map(page => page.items.map(item => [item.sourceId, item.identifier])),
			galleryUrls,
		}, {
			sources: ['mcpGallery'],
			pages: [
				[['mcpGallery', 'custom:custom'], ['mcpGallery', 'default:default']],
				[['mcpGallery', 'custom:custom'], ['mcpGallery', 'default:default']],
			],
			galleryUrls: [
				'https://registry.test',
				'https://api.mcp.github.com',
				'https://registry.test',
				'https://api.mcp.github.com',
			],
		});
	});

	test('Marketplace visibility gates MCP Gallery discovery and isolates failures', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.MarketplaceEnabled]: false,
			[mcpGalleryServiceUrlConfig]: 'https://registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(IMcpGalleryService, new class extends mock<IMcpGalleryService>() {
			override async queryPage(): Promise<never> { throw new Error('MCP registry unavailable'); }
		}());
		services.stub(IMcpGalleryManifestService, new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: 'https://registry.test', version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return null; }
		}());
		services.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		const service = services.createInstance(NativeCustomizationMarketplaceService);
		const invisible = getVisibleCustomizationMarketplaceSources(configuration, service.sources);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.MarketplaceEnabled, true);
		const page = await service.query({}, CancellationToken.None);

		assert.deepStrictEqual({
			invisible,
			page,
		}, {
			invisible: [],
			page: {
				items: [],
				total: undefined,
				nextCursor: undefined,
				sourceErrors: [{ sourceId: 'mcpGallery', message: 'MCP registry unavailable' }],
			},
		});
	});
});
