/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { AllowedExtensionsService } from '../../common/allowedExtensionsService.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IProductService } from '../../../product/common/productService.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import { AllowedExtensionsConfigKey, IGalleryExtension, ILocalExtension } from '../../common/extensionManagement.js';
import { ExtensionType, IExtensionManifest, TargetPlatform } from '../../../extensions/common/extensions.js';
import { Event } from '../../../../base/common/event.js';
import { ConfigurationTarget } from '../../../configuration/common/configuration.js';
import { getGalleryExtensionId } from '../../common/extensionManagementUtil.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { URI } from '../../../../base/common/uri.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

suite('AllowedExtensionsService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	const configurationService = new TestConfigurationService();

	setup(() => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, '*');
	});

	test('should allow all extensions if no allowed extensions are configured', () => {
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
	});

	test('should not allow specific extension if not in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': false });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
	});

	test('should allow specific extension if in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
	});

	test('should not allow pre-release extension if only stable is allowed', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, false);
	});

	test('should allow pre-release extension if pre-release is allowed', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, true);
	});

	test('should allow specific version of an extension when configured to that version', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
	});

	test('should allow any version of an extension when a specific version is configured', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
	});

	test('should allow any version of an extension when stable is configured', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, true);
	});

	test('should allow a version of an extension when stable is configured', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
	});

	test('should allow a pre-release version of an extension when stable is configured', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': 'stable' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', prerelease: true }) === true, false);
	});

	test('should allow specific version of an extension when configured to multiple versions', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3', '2.0.1', '3.1.2'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
	});

	test('should allow platform specific version of an extension when configured to platform specific version', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: TargetPlatform.DARWIN_X64 }) === true, true);
	});

	test('should allow universal platform specific version of an extension when configured to platform specific version', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: TargetPlatform.UNIVERSAL }) === true, true);
	});

	test('should allow specific version of an extension when configured to platform specific version', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3' }) === true, true);
	});

	test('should allow platform specific version of an extension when configured to multiple versions', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.0.0', '1.2.3@darwin-x64', '1.2.3@darwin-arm64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: TargetPlatform.DARWIN_X64 }) === true, true);
	});

	test('should not allow platform specific version of an extension when configured to different platform specific version', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.2.3@darwin-x64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.2.3', targetPlatform: TargetPlatform.DARWIN_ARM64 }) === true, false);
	});

	test('should specific version of an extension when configured to different versions', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test.extension': ['1.0.0', '1.2.3@darwin-x64', '1.2.3@darwin-arm64'] });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, version: '1.0.1' }) === true, false);
	});

	test('should allow extension if publisher is in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
	});

	test('should allow extension if publisher is not in allowed list and has publisher mapping', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'hello': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(['hello']), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: 'Hello' }), true);
	});

	test('should allow extension if publisher is not in allowed list and has different publisher mapping', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'hello': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(['bar']), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: 'Hello' }) === true, false);
	});

	test('should not allow extension if publisher is not in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': false });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
	});

	test('should not allow prerelease extension if publisher is allowed only to stable', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': 'stable' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, false);
	});

	test('should allow extension if publisher is set to random value', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'test': 'hello' });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined, prerelease: true }) === true, true);
	});

	test('should allow extension if only wildcard is in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
	});

	test('should allow extension if wildcard is in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': true, 'hello': false });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }), true);
	});

	test('should not allow extension if wildcard is not in allowed list', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': false, 'hello': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed({ id: 'test.extension', publisherDisplayName: undefined }) === true, false);
	});

	test('should allow a gallery extension', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'pub': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed(aGalleryExtension('name')) === true, true);
	});

	test('should allow a local extension', () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { 'pub': true });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		assert.strictEqual(testObject.isAllowed(aLocalExtension('pub.name')) === true, true);
	});

	test('should trigger change event when allowed list change', async () => {
		configurationService.setUserConfiguration(AllowedExtensionsConfigKey, { '*': false });
		const testObject = disposables.add(new AllowedExtensionsService(aProductService(), configurationService));
		const promise = Event.toPromise(testObject.onDidChangeAllowedExtensionsConfigValue);
		configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, affectedKeys: new Set([AllowedExtensionsConfigKey]), change: { keys: [], overrides: [] }, source: ConfigurationTarget.USER });
		await promise;
	});

	function aProductService(extensionPublisherOrgs?: string[]): IProductService {
		return {
			_serviceBrand: undefined,
			extensionPublisherOrgs
		} as IProductService;
	}

	function aGalleryExtension(name: string, properties: Partial<IGalleryExtension> = {}, galleryExtensionProperties: IStringDictionary<unknown> = {}): IGalleryExtension {
		const galleryExtension = <IGalleryExtension>Object.create({ type: 'gallery', name, publisher: 'pub', publisherDisplayName: 'Pub', version: '1.0.0', allTargetPlatforms: [TargetPlatform.UNIVERSAL], properties: {}, assets: {}, isSigned: true, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], ...galleryExtensionProperties };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

	function aLocalExtension(id: string, manifest: Partial<IExtensionManifest> = {}, properties: IStringDictionary<unknown> = {}): ILocalExtension {
		const [publisher, name] = id.split('.');
		manifest = { name, publisher, ...manifest };
		properties = {
			identifier: { id },
			location: URI.file(`pub.${name}`),
			galleryIdentifier: { id, uuid: undefined },
			type: ExtensionType.User,
			...properties,
			isValid: properties.isValid ?? true,
		};
		properties.isBuiltin = properties.type === ExtensionType.System;
		return <ILocalExtension>Object.create({ manifest, ...properties });
	}
});
