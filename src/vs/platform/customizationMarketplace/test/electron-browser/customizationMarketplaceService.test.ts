/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../configuration/common/configuration.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { ISharedProcessService } from '../../../ipc/electron-browser/services.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { GalleryMcpServerStatus, IGalleryMcpServer, IMcpGalleryService, mcpGalleryServiceUrlConfig } from '../../../mcp/common/mcpManagement.js';
import { IMcpGalleryManifestService } from '../../../mcp/common/mcpGalleryManifest.js';
import { IProductService } from '../../../product/common/productService.js';
import { CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME, CustomizationMarketplaceChannel } from '../../common/customizationMarketplaceIpc.js';
import { CustomizationMarketplaceMediaType, CustomizationMarketplaceService, ICustomizationMarketplacePage, ICustomizationMarketplaceRequest } from '../../common/customizationMarketplaceService.js';
import { CustomizationMarketplaceConfiguration } from '../../common/customizationMarketplaceSources.js';
import { NativeCustomizationMarketplaceService } from '../../electron-browser/customizationMarketplaceService.js';

suite('NativeCustomizationMarketplaceService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('merges public IPC and renderer-local MCP pages without sending MCP queries through IPC', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.Enabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
			[CustomizationMarketplaceConfiguration.McpGalleryEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const ipcRequests: ICustomizationMarketplaceRequest[] = [];
		const galleryRequests: string[] = [];
		const channel: IChannel = {
			listen: () => Event.None,
			async call<T>(_command: string, request?: ICustomizationMarketplaceRequest): Promise<T> {
				ipcRequests.push(request!);
				return {
					items: [{
						sourceId: 'agentFinder', identifier: 'public', displayName: 'Public', description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [], score: request?.query === 'tie' ? 0 : 75,
					}],
					total: 1,
				} satisfies ICustomizationMarketplacePage as T;
			},
		};
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel() { return channel; }
		}());
		services.stub(IMcpGalleryService, new class extends mock<IMcpGalleryService>() {
			override async queryPage(options: { readonly cursor?: string }) {
				galleryRequests.push(options.cursor ?? 'first');
				return {
					items: [{
						name: 'io.github.owner/server', displayName: 'Server', description: '', version: '1.0',
						isLatest: true, status: GalleryMcpServerStatus.Active, publisher: 'Owner', configuration: {},
					}],
					total: 1,
				};
			}
		}());
		services.stub(IMcpGalleryManifestService, new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: 'https://registry.test', version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return null; }
		}());
		services.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		const service = services.createInstance(NativeCustomizationMarketplaceService);
		const page = await service.query({ query: 'server', pageSize: 1 }, CancellationToken.None);
		const last = await service.query({ query: 'server', pageSize: 1, cursor: page.nextCursor }, CancellationToken.None);
		const browse = await service.query({ pageSize: 1 }, CancellationToken.None);
		const tie = await service.query({ query: 'tie', pageSize: 1 }, CancellationToken.None);
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, false);
		const mcpOnly = await service.query({ pageSize: 1 }, CancellationToken.None);
		assert.deepStrictEqual({
			ids: [page, last, browse, tie, mcpOnly].map(result => result.items.map(item => [item.sourceId, item.identifier])),
			ipcRequests,
			galleryRequests,
		}, {
			ids: [[['agentFinder', 'public']], [['mcpGallery', 'io.github.owner/server']], [['mcpGallery', 'io.github.owner/server']], [['mcpGallery', 'io.github.owner/server']], [['mcpGallery', 'io.github.owner/server']]],
			ipcRequests: [
				{ query: 'server', mediaType: undefined, pageSize: 1, cursor: undefined, sourceIds: ['agentFinder'] },
				{ query: '', mediaType: undefined, pageSize: 1, cursor: undefined, sourceIds: ['agentFinder'] },
				{ query: 'tie', mediaType: undefined, pageSize: 1, cursor: undefined, sourceIds: ['agentFinder'] },
			],
			galleryRequests: ['first', 'first', 'first', 'first'],
		});
	});

	test('continues desktop public-feed pages using the shared-process cursor contract', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.Enabled]: true,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const requests: ICustomizationMarketplaceRequest[] = [];
		const source = new CustomizationMarketplaceService([{
			id: 'agentFinder',
			async query(options) {
				return {
					items: [{
						identifier: options.cursor ? 'second' : 'first', displayName: 'Public', description: '',
						mediaType: CustomizationMarketplaceMediaType.McpServer, tags: [], capabilities: [], representativeQueries: [],
					}],
					nextCursor: options.cursor ? undefined : 'native-cursor',
				};
			},
		}]);
		const server = new CustomizationMarketplaceChannel(() => source);
		const channel: IChannel = {
			listen: () => Event.None,
			call: (command, request, token) => {
				requests.push(request);
				return server.call('test', command, request, token);
			},
		};
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel(name: string) {
				assert.strictEqual(name, CUSTOMIZATION_MARKETPLACE_CHANNEL_NAME);
				return channel;
			}
		}());
		const service = services.createInstance(NativeCustomizationMarketplaceService);
		const first = await service.query({ pageSize: 1 }, CancellationToken.None);
		const second = await service.query({ pageSize: 1, cursor: first.nextCursor }, CancellationToken.None);
		assert.deepStrictEqual({
			ids: [first, second].map(page => page.items.map(item => item.identifier)),
			cursorFields: requests.map(request => request.cursor && Object.keys(request.cursor)),
			hasMore: second.nextCursor !== undefined,
		}, {
			ids: [['first'], ['second']],
			cursorFields: [undefined, ['token']],
			hasMore: false,
		});
	});

	test('visibility and public feed toggles select custom, default, and public registries without duplicate default requests', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.Enabled]: false,
			[CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled]: false,
			[CustomizationMarketplaceConfiguration.McpGalleryEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const galleryUrls: string[] = [];
		let publicCalls = 0;
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel(): IChannel {
				return {
					listen: () => Event.None,
					async call<T>(): Promise<T> {
						publicCalls++;
						return { items: [{
							sourceId: 'agentFinder', identifier: 'public', displayName: 'Public', description: '',
							mediaType: CustomizationMarketplaceMediaType.McpServer,
							tags: [], capabilities: [], representativeQueries: [],
						}], total: 1 } as T;
					},
				};
			}
		}());
		services.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		services.stub(IMcpGalleryManifestService, new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: 'https://registry.test', version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return { url: 'https://api.mcp.github.com', version: 'v0.1', resources: [] }; }
		}());
		services.stub(IMcpGalleryService, new class extends mock<IMcpGalleryService>() {
			override async queryPage(_options: { readonly pageSize: number }, _token: CancellationToken, manifest?: { readonly url: string }) {
				galleryUrls.push(manifest?.url ?? '');
				const name = manifest?.url === 'https://registry.test' ? 'custom' : 'default';
				return { items: [{
					name, displayName: name, description: '', version: '1.0',
					isLatest: true, status: GalleryMcpServerStatus.Active, publisher: name, configuration: {},
				} satisfies IGalleryMcpServer], total: 1 };
			}
		}());
		const service = services.createInstance(NativeCustomizationMarketplaceService);
		const ids = async () => (await service.query({ pageSize: 3 }, CancellationToken.None)).items.map(item => item.sourceId);
		await assert.rejects(service.query({}, CancellationToken.None));
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.Enabled, true);
		const customAndDefault = await ids();
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.AgentFinderPublicFeedEnabled, true);
		const customAndPublic = await ids();
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.McpGalleryEnabled, false);
		const publicOnly = await ids();
		await configuration.setUserConfiguration(CustomizationMarketplaceConfiguration.Enabled, false);
		await assert.rejects(service.query({}, CancellationToken.None));
		assert.deepStrictEqual({ customAndDefault, customAndPublic, publicOnly, galleryUrls, publicCalls }, {
			customAndDefault: ['mcpGallery', 'mcpGalleryDefault'],
			customAndPublic: ['mcpGallery', 'agentFinder'],
			publicOnly: ['agentFinder'],
			galleryUrls: ['https://registry.test', 'https://api.mcp.github.com', 'https://registry.test'],
			publicCalls: 2,
		});
	});

	test('isolates gallery failures and never opens a public IPC channel for MCP-only discovery', async () => {
		const configuration = new TestConfigurationService({
			[CustomizationMarketplaceConfiguration.Enabled]: true,
			[CustomizationMarketplaceConfiguration.McpGalleryEnabled]: true,
			[mcpGalleryServiceUrlConfig]: 'https://registry.test',
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		const services = store.add(new TestInstantiationService());
		services.stub(IConfigurationService, configuration);
		services.stub(ISharedProcessService, new class extends mock<ISharedProcessService>() {
			override getChannel(): IChannel { throw new Error('Public IPC must remain unused'); }
		}());
		services.stub(IMcpGalleryService, new class extends mock<IMcpGalleryService>() {
			override async queryPage(): Promise<never> { throw new Error('MCP registry unavailable'); }
		}());
		services.stub(IMcpGalleryManifestService, new class extends mock<IMcpGalleryManifestService>() {
			override async getMcpGalleryManifest() { return { url: 'https://registry.test', version: 'v0.1', resources: [] }; }
			override async getDefaultMcpGalleryManifest() { return null; }
		}());
		services.stub(IProductService, { mcpGallery: { serviceUrl: 'https://api.mcp.github.com' } } as IProductService);
		const service = services.createInstance(NativeCustomizationMarketplaceService);
		const page = await service.query({}, CancellationToken.None);
		assert.deepStrictEqual(page, {
			items: [],
			total: undefined,
			nextCursor: undefined,
			sourceErrors: [{ sourceId: 'mcpGallery', message: 'MCP registry unavailable' }],
		});
	});
});
