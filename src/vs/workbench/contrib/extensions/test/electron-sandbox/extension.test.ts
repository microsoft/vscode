/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ExtensionState } from 'vs/workbench/contrib/extensions/common/extensions';
import { Extension } from 'vs/workbench/contrib/extensions/browser/extensionsWorkbenchService';
import { IGalleryExtension, IGalleryExtensionProperties, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { generateUuid } from 'vs/base/common/uuid';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { IProductService } from 'vs/platform/product/common/productService';

suite('Extension Test', () => {

	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = new TestInstantiationService();
		instantiationService.stub(IProductService, <Partial<IProductService>>{ quality: 'insiders' });
	});

	teardown(() => {
		instantiationService.dispose();
	});

	test('extension is not outdated when there is no local and gallery', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, undefined, undefined);
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is not outdated when there is local and no gallery', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension(), undefined);
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is not outdated when there is no local and has gallery', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, undefined, aGalleryExtension());
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is not outdated when local and gallery are on same version', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension(), aGalleryExtension());
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is outdated when local is older than gallery', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }), aGalleryExtension('somext', { version: '1.0.1' }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is outdated when local is built in and older than gallery', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { type: ExtensionType.System }), aGalleryExtension('somext', { version: '1.0.1' }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is not outdated when local is built in and older than gallery but product quality is stable', () => {
		instantiationService.stub(IProductService, <Partial<IProductService>>{ quality: 'stable' });
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { type: ExtensionType.System }), aGalleryExtension('somext', { version: '1.0.1' }));
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is outdated when local and gallery are on same version but on different target platforms', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', {}, { targetPlatform: TargetPlatform.WIN32_IA32 }), aGalleryExtension('somext', {}, { targetPlatform: TargetPlatform.WIN32_X64 }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is not outdated when local and gallery are on same version and local is on web', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', {}, { targetPlatform: TargetPlatform.WEB }), aGalleryExtension('somext'));
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is not outdated when local and gallery are on same version and gallery is on web', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext'), aGalleryExtension('somext', {}, { targetPlatform: TargetPlatform.WEB }));
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is not outdated when local is not pre-release but gallery is pre-release', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }), aGalleryExtension('somext', { version: '1.0.1' }, { isPreReleaseVersion: true }));
		assert.strictEqual(extension.outdated, false);
	});

	test('extension is outdated when local and gallery are pre-releases', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { preRelease: true, isPreReleaseVersion: true }), aGalleryExtension('somext', { version: '1.0.1' }, { isPreReleaseVersion: true }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is outdated when local was opted to pre-release but current version is not pre-release', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { preRelease: true, isPreReleaseVersion: false }), aGalleryExtension('somext', { version: '1.0.1' }, { isPreReleaseVersion: true }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is outdated when local is pre-release but gallery is not', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { preRelease: true, isPreReleaseVersion: true }), aGalleryExtension('somext', { version: '1.0.1' }));
		assert.strictEqual(extension.outdated, true);
	});

	test('extension is outdated when local was opted pre-release but current version is not and gallery is not', () => {
		const extension = instantiationService.createInstance(Extension, () => ExtensionState.Installed, () => undefined, undefined, aLocalExtension('somext', { version: '1.0.0' }, { preRelease: true, isPreReleaseVersion: false }), aGalleryExtension('somext', { version: '1.0.1' }));
		assert.strictEqual(extension.outdated, true);
	});

	function aLocalExtension(name: string = 'someext', manifest: Partial<IExtensionManifest> = {}, properties: Partial<ILocalExtension> = {}): ILocalExtension {
		manifest = { name, publisher: 'pub', version: '1.0.0', ...manifest };
		properties = {
			type: ExtensionType.User,
			location: URI.file(`pub.${name}`),
			identifier: { id: getGalleryExtensionId(manifest.publisher!, manifest.name!) },
			targetPlatform: TargetPlatform.UNDEFINED,
			...properties
		};
		return <ILocalExtension>Object.create({ manifest, ...properties });
	}

	function aGalleryExtension(name: string = 'somext', properties: Partial<IGalleryExtension> = {}, galleryExtensionProperties: Partial<IGalleryExtensionProperties> = {}): IGalleryExtension {
		const targetPlatform = galleryExtensionProperties.targetPlatform ?? TargetPlatform.UNDEFINED;
		const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}

});
