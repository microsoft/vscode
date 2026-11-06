/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { IMcpGalleryManifest, IMcpGalleryManifestService, McpGalleryManifestStatus, McpGalleryResourceType } from '../../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../../product/common/productService.js';
import { CustomizationMarketplaceMediaType } from '../../common/customizationMarketplaceService.js';
import { getCustomizationMarketplaceSourceInfos, McpGalleryMarketplaceProvider } from '../../common/mcpGalleryMarketplaceProvider.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IMcpGalleryService, IMcpGalleryQueryPageOptions, mcpGalleryServiceUrlConfig } from '../../../mcp/common/mcpManagement.js';
import { McpGalleryInvalidCursorError } from '../../../mcp/common/mcpGalleryService.js';

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
		publisherUrl: 'https://registry.test/publishers/owner',
		topics: ['database'],
		starsCount: 42,
		webUrl: 'https://registry.test/servers/io.github.owner%2Fserver',
		repositoryUrl: 'https://github.com/owner/server',
		icon: { light: 'https://registry.test/icon-light.png', dark: 'https://registry.test/icon-dark.png' },
		configuration: { packages: [] },
	};
	const customUrl = 'https://registry.test';
	const productUrl = 'https://api.mcp.github.com';
	const product = { mcpGallery: { serviceUrl: productUrl } } as IProductService;
	const manifest = (url: string) => new class extends mock<IMcpGalleryManifestService>() {
		override async getMcpGalleryManifest() { return { url, version: 'v0.1', resources: [] }; }
	}();
	const configuration = (url = customUrl) => new TestConfigurationService({
		[mcpGalleryServiceUrlConfig]: url,
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
		const first = await provider.query({ query: 'server', pageSize: 1 }, CancellationToken.None);
		const last = await provider.query({ query: 'server', pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			requests,
			registryUrls,
			first,
			lastCursor: last.nextCursor,
			entryFields: Object.keys(first.items[0]),
			iconUris: URI.isUri(first.items[0].icon) ? undefined : {
				light: first.items[0].icon?.light.toString(),
				dark: first.items[0].icon?.dark.toString(),
			},
		}, {
			requests: [{ text: 'server', pageSize: 100, cursor: undefined }, { text: 'server', pageSize: 100, cursor: 'opaque+/=' }],
			registryUrls: [customUrl, customUrl],
			first: {
				items: [{
					identifier: `custom:${server.name}`, displayName: server.displayName, description: server.description,
					mediaType: CustomizationMarketplaceMediaType.McpServer,
					tags: ['database'], capabilities: [], representativeQueries: [],
					url: first.items[0].url, externalUrl: server.webUrl,
					repository: first.items[0].repository,
					icon: first.items[0].icon,
					publisher: 'Owner', publisherUrl: first.items[0].publisherUrl, version: '1.0.0', stars: 42, priority: 1,
					installation: { kind: 'mcpGallery', name: server.name, registry: 'custom', registryUrl: customUrl },
				}],
				total: 2, nextCursor: first.nextCursor,
			},
			lastCursor: undefined,
			entryFields: ['identifier', 'displayName', 'description', 'mediaType', 'tags', 'capabilities', 'representativeQueries', 'url', 'externalUrl', 'repository', 'icon', 'publisher', 'publisherUrl', 'version', 'stars', 'priority', 'installation'],
			iconUris: {
				light: 'https://registry.test/icon-light.png',
				dark: 'https://registry.test/icon-dark.png',
			},
		});
	});

	test('uses the registry page size that produces valid continuation cursors', async () => {
		const requests: IMcpGalleryQueryPageOptions[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				requests.push(options);
				const start = options.cursor ? 100 : 0;
				return {
					items: Array.from({ length: 100 }, (_, index) => ({ ...server, name: `io.github.owner/server-${start + index}` })),
					nextCursor: options.cursor ? undefined : 'next',
				};
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ pageSize: 100 }, CancellationToken.None);
		await provider.query({ pageSize: 100, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual(requests, [
			{ text: undefined, pageSize: 100, cursor: undefined },
			{ text: undefined, pageSize: 100, cursor: 'next' },
		]);
	});

	test('buffers native pages so visible pagination does not immediately use a registry cursor', async () => {
		const requests: IMcpGalleryQueryPageOptions[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				requests.push(options);
				const start = options.cursor ? 100 : 0;
				return {
					items: Array.from({ length: 100 }, (_, index) => ({ ...server, name: `io.github.owner/server-${start + index}` })),
					nextCursor: options.cursor ? undefined : 'native-next',
				};
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ pageSize: 24 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 24, cursor: first.nextCursor }, CancellationToken.None);
		const third = await provider.query({ pageSize: 24, cursor: second.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			names: [...first.items, ...second.items, ...third.items].map(item => item.identifier),
		}, {
			requests: [{ text: undefined, pageSize: 100, cursor: undefined }],
			names: Array.from({ length: 72 }, (_, index) => `custom:io.github.owner/server-${index}`),
		});
	});

	test('retains continuation checkpoints when fetching a later page is cancelled', async () => {
		const requests: (string | undefined)[] = [];
		let cancelNextContinuation = true;
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				requests.push(options.cursor);
				if (options.cursor && cancelNextContinuation) {
					cancelNextContinuation = false;
					throw new CancellationError();
				}
				const start = options.cursor ? 1 : 0;
				return {
					items: [{ ...server, name: `io.github.owner/server-${start}` }],
					nextCursor: start ? undefined : 'next',
				};
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ pageSize: 1 }, CancellationToken.None);
		await assert.rejects(provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None), error => error instanceof CancellationError);
		const retried = await provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			first: first.items.map(item => item.identifier),
			retried: retried.items.map(item => item.identifier),
		}, {
			requests: [undefined, 'next', 'next'],
			first: ['custom:io.github.owner/server-0'],
			retried: ['custom:io.github.owner/server-1'],
		});
	});

	test('recovers once from a registry-issued invalid cursor with a different native boundary', async () => {
		const requests: IMcpGalleryQueryPageOptions[] = [];
		const firstServer = { ...server, name: 'io.github.owner/first' };
		const secondServer = { ...server, name: 'io.github.owner/second' };
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				requests.push(options);
				if (options.cursor === 'invalid') {
					throw new McpGalleryInvalidCursorError();
				}
				if (options.cursor === 'recovery') {
					return { items: [firstServer, secondServer] };
				}
				return options.pageSize === 100
					? { items: [firstServer], nextCursor: 'invalid' }
					: { items: [firstServer], nextCursor: 'recovery' };
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ pageSize: 1 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			requests,
			first: first.items.map(item => item.identifier),
			second: second.items.map(item => item.identifier),
			error: second.error,
		}, {
			requests: [
				{ text: undefined, pageSize: 100, cursor: undefined },
				{ text: undefined, pageSize: 100, cursor: 'invalid' },
				{ text: undefined, pageSize: 99, cursor: undefined },
				{ text: undefined, pageSize: 99, cursor: 'recovery' },
			],
			first: ['custom:io.github.owner/first'],
			second: ['custom:io.github.owner/second'],
			error: undefined,
		});
	});

	test('recovery can replay more than four full native pages', async () => {
		const requests: IMcpGalleryQueryPageOptions[] = [];
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				requests.push(options);
				const cursor = options.cursor ? Number(options.cursor.split('-')[1]) : 0;
				if (options.pageSize === 100 && cursor === 400) {
					throw new McpGalleryInvalidCursorError();
				}
				const items = Array.from({ length: options.pageSize }, (_, index) => ({
					...server,
					name: `io.github.owner/server-${cursor + index}`,
				}));
				return {
					items,
					nextCursor: `${options.pageSize === 100 ? 'native' : 'recovery'}-${cursor + options.pageSize}`,
				};
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		let page = await provider.query({ pageSize: 100 }, CancellationToken.None);
		for (let index = 0; index < 3; index++) {
			page = await provider.query({ pageSize: 100, cursor: page.nextCursor }, CancellationToken.None);
		}
		const recovered = await provider.query({ pageSize: 100, cursor: page.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			recoveryRequests: requests.filter(request => request.pageSize === 99).map(request => request.cursor),
			recovered: recovered.items.map(item => item.identifier),
		}, {
			recoveryRequests: [undefined, 'recovery-99', 'recovery-198', 'recovery-297', 'recovery-396', 'recovery-495'],
			recovered: Array.from({ length: 100 }, (_, index) => `custom:io.github.owner/server-${400 + index}`),
		});
	});

	test('preserves buffered results and ends pagination when cursor recovery also fails', async () => {
		const firstServer = { ...server, name: 'io.github.owner/first' };
		const secondServer = { ...server, name: 'io.github.owner/second' };
		const bufferedServer = { ...server, name: 'io.github.owner/buffered' };
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: IMcpGalleryQueryPageOptions) {
				if (options.cursor) {
					throw new McpGalleryInvalidCursorError();
				}
				return {
					items: [firstServer, secondServer, bufferedServer],
					nextCursor: `invalid-${options.pageSize}`,
				};
			}
		}();
		const provider = new McpGalleryMarketplaceProvider('custom', gallery, manifest(customUrl), configuration(), product);
		const first = await provider.query({ pageSize: 2 }, CancellationToken.None);
		const second = await provider.query({ pageSize: 2, cursor: first.nextCursor }, CancellationToken.None);

		assert.deepStrictEqual({
			items: second.items.map(item => item.identifier),
			nextCursor: second.nextCursor,
			error: second.error,
		}, {
			items: ['custom:io.github.owner/buffered'],
			nextCursor: undefined,
			error: 'The MCP gallery could not continue loading because the registry rejected its pagination cursor. Retry to refresh the results.',
		});
	});

	test('advertises the MCP Gallery platform source only when available', () => {
		assert.deepStrictEqual({
			available: getCustomizationMarketplaceSourceInfos(McpGalleryManifestStatus.Available).map(source => source.id),
			unavailable: getCustomizationMarketplaceSourceInfos(McpGalleryManifestStatus.Unavailable).map(source => source.id),
		}, {
			available: ['mcpGallery'],
			unavailable: [],
		});
	});

	test('retains the registry card URL for provider-owned installation', async () => {
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage() {
				return { items: [server] };
			}
		}();
		const manifests = new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() {
				return {
					url: customUrl,
					version: 'v0.1',
					resources: [{
						type: McpGalleryResourceType.McpServerLatestVersionUri,
						id: `${customUrl}/v0.1/servers/{name}/versions/latest`,
					}],
				};
			}
		}();
		const page = await new McpGalleryMarketplaceProvider('custom', gallery, manifests, configuration(), product).query({}, CancellationToken.None);

		assert.deepStrictEqual(page.items[0].installation, {
			kind: 'mcpGallery',
			name: server.name,
			registry: 'custom',
			registryUrl: customUrl,
			cardUrl: `${customUrl}/v0.1/servers/io.github.owner%2Fserver/versions/latest`,
		});
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
		const repeated = await new McpGalleryMarketplaceProvider('default', gallery, manifests, configuration(customUrl), product).query({}, CancellationToken.None);
		assert.deepStrictEqual({
			id: provider.id, sourceId: provider.sourceId, urls, identifier: page.items[0].identifier,
			priority: page.items[0].priority, installation: page.items[0].installation, repeated: repeated.items.map(item => item.identifier),
		}, {
			id: 'mcpGallery.default', sourceId: 'mcpGallery', urls: [productUrl, productUrl], identifier: `default:${server.name}`, priority: 0,
			installation: { kind: 'mcpGallery', name: server.name, registry: 'default', registryUrl: productUrl },
			repeated: [`default:${server.name}`],
		});
	});

	test('uses the active MCP gallery when no product gallery is declared', async () => {
		const activeUrl = 'https://active.registry.test';
		let queryCalls = 0;
		let activeManifestCalls = 0;
		let defaultManifestCalls = 0;
		const gallery = new class extends mock<IMcpGalleryService>() {
			override async queryPage(_options: IMcpGalleryQueryPageOptions, _token: CancellationToken, registry?: IMcpGalleryManifest) {
				queryCalls++;
				assert.strictEqual(registry?.url, activeUrl);
				return { items: [server], total: 1 };
			}
		}();
		const manifests = new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { activeManifestCalls++; return { url: activeUrl, version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { defaultManifestCalls++; return null; }
		}();
		const provider = new McpGalleryMarketplaceProvider('default', gallery, manifests, configuration(''), {} as IProductService);
		const page = await provider.query({}, CancellationToken.None);
		assert.deepStrictEqual({
			queryCalls,
			activeManifestCalls,
			defaultManifestCalls,
			installations: page.items.map(item => item.installation),
		}, {
			queryCalls: 1,
			activeManifestCalls: 1,
			defaultManifestCalls: 0,
			installations: [{
				kind: 'mcpGallery',
				name: server.name,
				registry: 'default',
				registryUrl: activeUrl,
			}],
		});
	});
});
