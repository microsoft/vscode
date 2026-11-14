/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IMcpGalleryManifest, McpGalleryManifestStatus } from '../../../../../platform/mcp/common/mcpGalleryManifest.js';
import { mcpGalleryServiceEnablementConfig, mcpGalleryServiceUrlConfig } from '../../../../../platform/mcp/common/mcpManagement.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IRequestService } from '../../../../../platform/request/common/request.js';
import { TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';
import { WorkbenchMcpGalleryManifestService } from '../../browser/mcpGalleryManifestService.js';

suite('WorkbenchMcpGalleryManifestService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const productGalleryUrl = 'https://product.test';
	const customGalleryUrl = 'https://custom.test';
	const productService = upcastPartial<IProductService>({
		mcpGallery: {
			serviceUrl: productGalleryUrl,
			itemWebUrl: `${productGalleryUrl}/items/{name}`,
			publisherUrl: `${productGalleryUrl}/publishers/{publisher}`,
			supportUrl: `${productGalleryUrl}/support`,
			privacyPolicyUrl: `${productGalleryUrl}/privacy`,
			termsOfServiceUrl: `${productGalleryUrl}/terms`,
			reportUrl: `${productGalleryUrl}/report`,
		}
	});
	const requestService = upcastPartial<IRequestService>({});

	function createService(configuration: Record<string, unknown>) {
		const configurationService = new TestConfigurationService({
			'chat.mcp.gallery.version': 'v0.1',
			...configuration,
		});
		const service = store.add(new WorkbenchMcpGalleryManifestService(
			productService,
			new TestRemoteAgentService(),
			requestService,
			new NullLogService(),
			configurationService,
		));
		return { service, configurationService };
	}

	async function settle(): Promise<void> {
		await timeout(0);
	}

	function fireConfigurationChange(configurationService: TestConfigurationService, key: string): void {
		configurationService.onDidChangeConfigurationEmitter.fire(upcastPartial<IConfigurationChangeEvent>({
			affectsConfiguration: candidate => candidate === key,
		}));
	}

	test('selects product and custom manifests based on product gallery enablement', async () => {
		const enabled = createService({ [mcpGalleryServiceEnablementConfig]: true });
		const disabled = createService({ [mcpGalleryServiceEnablementConfig]: false });
		const unset = createService({});
		const custom = createService({
			[mcpGalleryServiceEnablementConfig]: false,
			[mcpGalleryServiceUrlConfig]: `${customGalleryUrl}/`,
		});
		const matchingProduct = createService({
			[mcpGalleryServiceEnablementConfig]: false,
			[mcpGalleryServiceUrlConfig]: `${productGalleryUrl}/`,
		});

		await Promise.all([
			enabled.service.getMcpGalleryManifest(),
			disabled.service.getMcpGalleryManifest(),
			unset.service.getMcpGalleryManifest(),
			custom.service.getMcpGalleryManifest(),
			matchingProduct.service.getMcpGalleryManifest(),
		]);

		assert.deepStrictEqual({
			enabled: (await enabled.service.getMcpGalleryManifest())?.url,
			enabledStatus: enabled.service.mcpGalleryManifestStatus,
			disabled: await disabled.service.getMcpGalleryManifest(),
			disabledStatus: disabled.service.mcpGalleryManifestStatus,
			unset: (await unset.service.getMcpGalleryManifest())?.url,
			custom: (await custom.service.getMcpGalleryManifest())?.url,
			customStatus: custom.service.mcpGalleryManifestStatus,
			matchingProduct: await matchingProduct.service.getMcpGalleryManifest(),
		}, {
			enabled: productGalleryUrl,
			enabledStatus: McpGalleryManifestStatus.Available,
			disabled: null,
			disabledStatus: McpGalleryManifestStatus.Unavailable,
			unset: productGalleryUrl,
			custom: customGalleryUrl,
			customStatus: McpGalleryManifestStatus.Available,
			matchingProduct: null,
		});
	});

	test('updates manifest and status when product gallery enablement changes', async () => {
		const { service, configurationService } = createService({ [mcpGalleryServiceEnablementConfig]: true });
		await service.getMcpGalleryManifest();

		const disabledManifest = Event.toPromise(service.onDidChangeMcpGalleryManifest);
		const disabledStatus = Event.toPromise(service.onDidChangeMcpGalleryManifestStatus);
		await configurationService.setUserConfiguration(mcpGalleryServiceEnablementConfig, false);
		fireConfigurationChange(configurationService, mcpGalleryServiceEnablementConfig);

		assert.deepStrictEqual({
			manifest: await disabledManifest,
			status: await disabledStatus,
			current: await service.getMcpGalleryManifest(),
		}, {
			manifest: null,
			status: McpGalleryManifestStatus.Unavailable,
			current: null,
		});

		const enabledManifest = Event.toPromise(service.onDidChangeMcpGalleryManifest);
		const enabledStatus = Event.toPromise(service.onDidChangeMcpGalleryManifestStatus);
		await configurationService.setUserConfiguration(mcpGalleryServiceEnablementConfig, true);
		fireConfigurationChange(configurationService, mcpGalleryServiceEnablementConfig);

		assert.deepStrictEqual({
			manifest: (await enabledManifest)?.url,
			status: await enabledStatus,
			current: (await service.getMcpGalleryManifest())?.url,
		}, {
			manifest: productGalleryUrl,
			status: McpGalleryManifestStatus.Available,
			current: productGalleryUrl,
		});
	});

	test('does not publish an older asynchronous manifest refresh', async () => {
		const blockedManifest = new DeferredPromise<IMcpGalleryManifest>();
		const configurationService = new TestConfigurationService({
			[mcpGalleryServiceEnablementConfig]: false,
			'chat.mcp.gallery.version': 'v0.1',
		});
		const service = store.add(new class extends WorkbenchMcpGalleryManifestService {
			protected override async createMcpGalleryManifest(url: string, version?: string): Promise<IMcpGalleryManifest> {
				if (url === customGalleryUrl) {
					return blockedManifest.p;
				}
				return super.createMcpGalleryManifest(url, version);
			}
		}(
			productService,
			new TestRemoteAgentService(),
			requestService,
			new NullLogService(),
			configurationService,
		));
		await service.getMcpGalleryManifest();

		await configurationService.setUserConfiguration(mcpGalleryServiceUrlConfig, customGalleryUrl);
		fireConfigurationChange(configurationService, mcpGalleryServiceUrlConfig);
		await configurationService.setUserConfiguration(mcpGalleryServiceUrlConfig, 'https://newer.test');
		const newerManifest = Event.toPromise(service.onDidChangeMcpGalleryManifest);
		fireConfigurationChange(configurationService, mcpGalleryServiceUrlConfig);
		assert.strictEqual((await newerManifest)?.url, 'https://newer.test');

		blockedManifest.complete({
			url: customGalleryUrl,
			version: 'v0.1',
			resources: [],
		});
		await settle();

		assert.strictEqual((await service.getMcpGalleryManifest())?.url, 'https://newer.test');
	});
});
