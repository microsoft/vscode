/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IExtensionManifest, ExtensionUntrustedWorkspaceSupportType } from 'vs/platform/extensions/common/extensions';
import { ExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { TestProductService } from 'vs/workbench/test/common/workbenchTestServices';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IProductService } from 'vs/platform/product/common/productService';
import { isWeb } from 'vs/base/common/platform';
import { TestWorkspaceTrustEnablementService } from 'vs/workbench/services/workspaces/test/common/testWorkspaceTrustService';
import { IWorkspaceTrustEnablementService } from 'vs/platform/workspace/common/workspaceTrust';
import { NullLogService } from 'vs/platform/log/common/log';

suite('ExtensionManifestPropertiesService - ExtensionKind', () => {

	let testObject = new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService(), new TestWorkspaceTrustEnablementService(), new NullLogService());

	test('declarative with extension dependencies', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionDependencies: ['ext1'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack and extension dependencies', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], extensionDependencies: ['ext1', 'ext2'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative with unknown contribution point => workspace, web in web and => workspace in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ contributes: <any>{ 'unknownPoint': { something: true } } }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('declarative extension pack with unknown contribution point', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionPack: ['ext1', 'ext2'], contributes: <any>{ 'unknownPoint': { something: true } } }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('simple declarative => ui, workspace, web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{}), ['ui', 'workspace', 'web']);
	});

	test('only browser => web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js' }), ['web']);
	});

	test('only main => workspace', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js' }), ['workspace']);
	});

	test('main and browser => workspace, web in web and workspace in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', browser: 'main.browser.js' }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('browser entry point with workspace extensionKind => workspace, web in web and workspace in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ main: 'main.js', browser: 'main.browser.js', extensionKind: ['workspace'] }), isWeb ? ['workspace', 'web'] : ['workspace']);
	});

	test('only browser entry point with out extensionKind => web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js' }), ['web']);
	});

	test('simple descriptive with workspace, ui extensionKind => workspace, ui, web in web and workspace, ui in desktop', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ extensionKind: ['workspace', 'ui'] }), isWeb ? ['workspace', 'ui', 'web'] : ['workspace', 'ui']);
	});

	test('opt out from web through settings even if it can run in web', () => {
		testObject = new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService({ remote: { extensionKind: { 'pub.a': ['-web'] } } }), new TestWorkspaceTrustEnablementService(), new NullLogService());
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js', publisher: 'pub', name: 'a' }), ['ui', 'workspace']);
	});

	test('opt out from web and include only workspace through settings even if it can run in web', () => {
		testObject = new ExtensionManifestPropertiesService(TestProductService, new TestConfigurationService({ remote: { extensionKind: { 'pub.a': ['-web', 'workspace'] } } }), new TestWorkspaceTrustEnablementService(), new NullLogService());
		assert.deepStrictEqual(testObject.getExtensionKind(<IExtensionManifest>{ browser: 'main.browser.js', publisher: 'pub', name: 'a' }), ['workspace']);
	});

	test('extension cannot opt out from web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ browser: 'main.browser.js', extensionKind: ['-web'] }), ['web']);
	});

	test('extension cannot opt into web', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web', 'workspace', 'ui'] }), ['workspace', 'ui']);
	});

	test('extension cannot opt into web only', () => {
		assert.deepStrictEqual(testObject.getExtensionKind(<any>{ main: 'main.js', extensionKind: ['web'] }), ['workspace']);
	});
});


// Workspace Trust is disabled in web at the moment
if (!isWeb) {
	suite('ExtensionManifestPropertiesService - ExtensionUntrustedWorkspaceSupportType', () => {
		let testObject: ExtensionManifestPropertiesService;
		let instantiationService: TestInstantiationService;
		let testConfigurationService: TestConfigurationService;

		setup(async () => {
			instantiationService = new TestInstantiationService();

			testConfigurationService = new TestConfigurationService();
			instantiationService.stub(IConfigurationService, testConfigurationService);
		});

		teardown(() => testObject.dispose());

		function assertUntrustedWorkspaceSupport(extensionManifest: IExtensionManifest, expected: ExtensionUntrustedWorkspaceSupportType): void {
			testObject = instantiationService.createInstance(ExtensionManifestPropertiesService);
			const untrustedWorkspaceSupport = testObject.getExtensionUntrustedWorkspaceSupportType(extensionManifest);

			assert.strictEqual(untrustedWorkspaceSupport, expected);
		}

		function getExtensionManifest(properties: any = {}): IExtensionManifest {
			return Object.create({ name: 'a', publisher: 'pub', version: '1.0.0', ...properties }) as IExtensionManifest;
		}

		test('test extension workspace trust request when main entry point is missing', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest();
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when workspace trust is disabled', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService(false));

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when "true" override exists in settings.json', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when override (false) exists in settings.json', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: false } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override (true) for the version exists in settings.json', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true, version: '1.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when override (false) for the version exists in settings.json', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: false, version: '1.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override for a different version exists in settings.json', async () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			await testConfigurationService.setUserConfiguration('extensions', { supportUntrustedWorkspaces: { 'pub.a': { supported: true, version: '2.0.0' } } });
			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when default (true) exists in product.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionUntrustedWorkspaceSupport: { 'pub.a': { default: true } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, true);
		});

		test('test extension workspace trust request when default (false) exists in product.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionUntrustedWorkspaceSupport: { 'pub.a': { default: false } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when override (limited) exists in product.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionUntrustedWorkspaceSupport: { 'pub.a': { override: 'limited' } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: true } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when override (false) exists in product.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{ extensionUntrustedWorkspaceSupport: { 'pub.a': { override: false } } });
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: true } } });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});

		test('test extension workspace trust request when value exists in package.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js', capabilities: { untrustedWorkspaces: { supported: 'limited' } } });
			assertUntrustedWorkspaceSupport(extensionManifest, 'limited');
		});

		test('test extension workspace trust request when no value exists in package.json', () => {
			instantiationService.stub(IProductService, <Partial<IProductService>>{});
			instantiationService.stub(IWorkspaceTrustEnablementService, new TestWorkspaceTrustEnablementService());

			const extensionManifest = getExtensionManifest({ main: './out/extension.js' });
			assertUntrustedWorkspaceSupport(extensionManifest, false);
		});
	});
}
