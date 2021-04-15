/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtensionWorkspaceTrustRequestService } from 'vs/workbench/services/extensions/common/extensionWorkspaceTrustRequest';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { ExtensionWorkspaceTrustRequestType, IExtensionManifest } from 'vs/platform/extensions/common/extensions';


suite('ExtensionWorkspaceTrustRequestService', () => {
	let testObject: ExtensionWorkspaceTrustRequestService;
	let instantiationService: TestInstantiationService;
	let testConfigurationService: TestConfigurationService;

	setup(async () => {
		instantiationService = new TestInstantiationService();

		testConfigurationService = new TestConfigurationService();
		instantiationService.stub(IConfigurationService, testConfigurationService);
		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { enabled: true } } });
	});

	teardown(() => testObject.dispose());

	function assertWorkspaceTrustRequest(extensionMaifest: IExtensionManifest, expected: ExtensionWorkspaceTrustRequestType): void {
		testObject = instantiationService.createInstance(ExtensionWorkspaceTrustRequestService);
		const workspaceTrustRequest = testObject.getExtensionWorkspaceTrustRequestType(extensionMaifest);

		assert.strictEqual(workspaceTrustRequest, expected);
	}

	test('test extension workspace trust request when main entry point is missing', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		const extensionMaifest = getExtensionManifest();
		assertWorkspaceTrustRequest(extensionMaifest, 'never');
	});

	test('test extension workspace trust request when workspace trust is disabled', async () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});
		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { enabled: false } } });

		const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
		assertWorkspaceTrustRequest(extensionMaifest, 'never');
	});

	test('test extension workspace trust request when override exists in settings.json', async () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { extensionRequest: { 'pub.a': { request: 'never' } } } } });
		const extensionMaifest = getExtensionManifest({ main: './out/extension.js', workspaceTrust: { request: 'onDemand' } });
		assertWorkspaceTrustRequest(extensionMaifest, 'never');
	});

	test('test extension workspace trust request when override for the version exists in settings.json', async () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		await testConfigurationService.setUserConfiguration('security', { workspace: { trust: { extensionRequest: { 'pub.a': { request: 'never', version: '1.0.0' } } } } });
		const extensionMaifest = getExtensionManifest({ main: './out/extension.js', workspaceTrust: { request: 'onDemand' } });
		assertWorkspaceTrustRequest(extensionMaifest, 'never');
	});

	test('test extension workspace trust request when override for a different version exists in settings.json', async () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		await testConfigurationService.setUserConfiguration('security', {
			workspace: {
				trust: {
					enabled: true,
					extensionRequest: { 'pub.a': { request: 'never', version: '2.0.0' } }
				}
			}
		});
		const extensionMaifest = getExtensionManifest({ main: './out/extension.js', workspaceTrust: { request: 'onDemand' } });
		assertWorkspaceTrustRequest(extensionMaifest, 'onDemand');
	});

	test('test extension workspace trust request when default exists in product.json', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionWorkspaceTrustRequest: { 'pub.a': { default: 'never' } } });

		const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
		assertWorkspaceTrustRequest(extensionMaifest, 'never');
	});

	test('test extension workspace trust request when override exists in product.json', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionWorkspaceTrustRequest: { 'pub.a': { override: 'onDemand' } } });

		const extensionMaifest = getExtensionManifest({ main: './out/extension.js', workspaceTrust: { request: 'never' } });
		assertWorkspaceTrustRequest(extensionMaifest, 'onDemand');
	});

	test('test extension workspace trust request when value exists in package.json', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		const extensionMaifest = getExtensionManifest({ main: './out/extension.js', workspaceTrust: { request: 'onDemand' } });
		assertWorkspaceTrustRequest(extensionMaifest, 'onDemand');
	});

	test('test extension workspace trust request when no value exists in package.json', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{});

		const extensionMaifest = getExtensionManifest({ main: './out/extension.js' });
		assertWorkspaceTrustRequest(extensionMaifest, 'onStart');
	});
});

function getExtensionManifest(properties: any = {}): IExtensionManifest {
	return Object.create({
		name: 'a',
		publisher: 'pub',
		version: '1.0.0',
		...properties
	}) as IExtensionManifest;
}
