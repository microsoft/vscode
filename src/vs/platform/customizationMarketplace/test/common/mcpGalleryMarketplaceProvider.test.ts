/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService } from '../../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../../product/common/productService.js';
import { CustomizationMarketplaceMediaType } from '../../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration } from '../../common/customizationMarketplaceSources.js';
import { getCustomizationMarketplaceSourceInfos, McpGalleryMarketplaceProvider } from '../../common/mcpGalleryMarketplaceProvider.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IMcpGalleryService, IMcpGalleryQueryPageOptions, mcpGalleryServiceUrlConfig } from '../../../mcp/common/mcpManagement.js';

suite('McpGalleryMarketplaceProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();
	const server: IGalleryMcpServer = {
		name: 'io.github.owner/server',
		displayName: 'Server',
		description: 'Description',
		version: '1.0.0',
		isLatest: true,
		status: GalleryMcpServerStatus.Active,
		publisher: 'Owner',
		topics: ['database'],
		starsCount: 42,
		webUrl: 'https://registry.test/servers/io.github.owner%2Fserver',
		repositoryUrl: 'https://github.com/owner/server',
		icon: { light: 'javascript:alert(1)', dark: 'https://registry.test/icon.png' },
		configuration: { packages: [] },
	};
	const customUrl = 'https://registry.test';
	const productUrl = 'https://api.mcp.github.com';
	const product = { mcpGallery: { serviceUrl: productUrl } } as IProductService;
	const manifest = (url: string) => new class extends mock<IMcpGalleryManifestService>() {
		override async getMcpGalleryManifest() { return { url, version: 'v0.1', resources: [] }; }
	}();
	const configuration = (url = customUrl, publicFeed = false) => new TestConfigurationService({
		[mcpGalleryServiceUrlConfig]: url,
		[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: publicFeed,
	});

	test('maps metadata, never executable configuration, and continues with the native cursor', async () => {
		const requests: IMcpGalleryQueryPageOptions[] = [];
		const registryUrls: string[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions, _token: CancellationToken, registry?: IMcpGalleryManifest) {
				requests.push(options);
				registryUrls.push(registry?.url ?? '');
				return { items: [server], total: 2, nextCursor: options.cursor ? undefined : 'opaque+/=' };
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ query: 'server', pageSize: 2 }, CancellationToken.None);
		const last = await provider.query({ query: 'server', pageSize: 2, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			requests,
			registryUrls,
			first,
			lastCursor: last.nextCursor,
			entryFields: Object.keys(first.items[0]),
		}, {
			requests: [
				{ text: 'server', pageSize: 2, cursor: undefined },
				{ text: 'server', pageSize: 2, cursor: 'opaque+/=' },
			],
			registryUrls: [customUrl, customUrl],
			first: {
				items: [{
					identifier: `custom:${server.name}`, displayName: server.displayName, description: server.description,
					mediaType: CustomizationMarketplaceMediaType.McpServer,
					tags: ['database'], capabilities: [], representativeQueries: [],
					url: first.items[0].url, externalUrl: server.webUrl,
					repository: first.items[0].repository,
					publisher: 'Owner', version: '1.0.0', stars: 42, priority: 1,
					installation: { kind: 'mcpGallery', name: server.name, registry: 'custom', registryUrl: customUrl },
				}],
				total: 2, nextCursor: 'opaque+/=',
			},
			lastCursor: undefined,
			entryFields: ['identifier', 'displayName', 'description', 'mediaType', 'tags', 'capabilities', 'representativeQueries', 'url', 'externalUrl', 'repository', 'publisher', 'version', 'stars', 'priority', 'installation'],
		});
	});

	test('advertises one MCP source when either registry contributes content', () => {
		const cases = [
			{ configuredUrl: '', publicFeed: false, sourceIds: ['mcpGallery', 'agentFinder'] },
			{ configuredUrl: '', publicFeed: true, sourceIds: ['agentFinder'] },
			{ configuredUrl: productUrl, publicFeed: false, sourceIds: ['mcpGallery', 'agentFinder'] },
			{ configuredUrl: customUrl, publicFeed: true, sourceIds: ['mcpGallery', 'agentFinder'] },
		];
		assert.deepStrictEqual(cases.map(({ configuredUrl, publicFeed }) =>
			getCustomizationMarketplaceSourceInfos(configuration(configuredUrl, publicFeed), product).map(source => source.id)),
		cases.map(({ sourceIds }) => sourceIds));
	});

	test('uses an item page or repository as its review link, never the registry root', async () => {
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage() {
				return {
					items: [
						{ ...server, webUrl: undefined },
						{ ...server, name: 'io.github.owner/no-link', webUrl: undefined, repositoryUrl: undefined },
					],
				};
			}
		}();
		const page = await new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product).query({}, CancellationToken.None);
		assert.deepStrictEqual(page.items.map(item => ({
			url: item.url?.toString(),
			externalUrl: item.externalUrl,
		})), [
			{ url: server.repositoryUrl, externalUrl: server.repositoryUrl },
			{ url: undefined, externalUrl: undefined },
		]);
	});

	test('skips the gallery for unrelated types and propagates registry errors', async () => {
		let calls = 0;
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(): Promise<never> { calls++; throw new Error('registry unavailable'); }
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const skipped = await provider.query({ mediaType: CustomizationMarketplaceMediaType.Skill }, CancellationToken.None);
		await assert.rejects(provider.query({}, CancellationToken.None), /registry unavailable/);
		assert.deepStrictEqual({ skipped, calls }, { skipped: { items: [] }, calls: 1 });
	});

	test('advances past empty filtered registry pages without dropping later results', async () => {
		const cursors: (string | undefined)[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				cursors.push(options.cursor);
				return options.cursor ? { items: [server], nextCursor: undefined } : { items: [], nextCursor: 'next' };
			}
		}();
		const result = await new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product).query({ pageSize: 2 }, CancellationToken.None);
		assert.deepStrictEqual({ cursors, items: result.items.map(item => item.identifier), nextCursor: result.nextCursor }, {
			cursors: [undefined, 'next'], items: ['custom:io.github.owner/server'], nextCursor: undefined,
		});
	});

	test('does not query the product registry without an explicit custom registry', async () => {
		let calls = 0;
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(): Promise<never> { calls++; throw new Error('Product registry queried'); }
		}();
		const results = [];
		for (const [configuredUrl, activeUrl] of [
			['', productUrl],
			[productUrl, productUrl],
		]) {
			results.push(await new McpGalleryMarketplaceProvider('custom', gallery, manifest(activeUrl), configuration(configuredUrl), product).query({}, CancellationToken.None));
		}
		await assert.rejects(
			new McpGalleryMarketplaceProvider('custom', gallery, manifest(productUrl), configuration(customUrl), product).query({}, CancellationToken.None),
			/configured MCP gallery is changing/,
		);
		assert.deepStrictEqual({ results, calls }, { results: [{ items: [], total: 0 }, { items: [], total: 0 }], calls: 0 });
	});

	test('default feed queries the pinned product manifest independently of a configured custom gallery', async () => {
		const urls: string[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(_options: IMcpGalleryQueryPageOptions, _token: CancellationToken, registry?: IMcpGalleryManifest) {
				urls.push(registry?.url ?? '');
				return { items: [server], total: 1 };
			}
		}();
		const manifests = new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: customUrl, version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return { url: productUrl, version: 'v0.1', resources: [] }; }
		}();
		const provider = new McpGalleryMarketplaceProvider('default', gallery, manifests, configuration(), product);
		const page = await provider.query({}, CancellationToken.None);
		const excluded = await new McpGalleryMarketplaceProvider('default', gallery, manifests, configuration(customUrl, true), product).query({}, CancellationToken.None);
		assert.deepStrictEqual({
			id: provider.id, sourceId: provider.sourceId, urls, identifier: page.items[0].identifier,
			priority: page.items[0].priority, installation: page.items[0].installation, excluded,
		}, {
			id: 'mcpGallery.default', sourceId: 'mcpGallery', urls: [productUrl], identifier: `default:${server.name}`, priority: 0,
			installation: { kind: 'mcpGallery', name: server.name, registry: 'default', registryUrl: productUrl },
			excluded: { items: [], total: 0 },
		});
	});
});
