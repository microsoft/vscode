/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { extUri, joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ExtensionType, TargetPlatform } from '../../../extensions/common/extensions.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService, toUserDataProfile } from '../../../userDataProfile/common/userDataProfile.js';
import { IExtensionGalleryService, IGalleryExtension, ILocalExtension, Metadata } from '../../common/extensionManagement.js';
import { ExtensionKey } from '../../common/extensionManagementUtil.js';
import { IExtensionsProfileScannerService } from '../../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../../common/extensionsScannerService.js';
import { InstallExtensionInProfileTask } from '../../node/extensionManagementService.js';

suite('InstallExtensionInProfileTask', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	for (const [installedPlatform, targetPlatform] of [
		[TargetPlatform.UNDEFINED, TargetPlatform.DARWIN_ARM64],
		[TargetPlatform.UNIVERSAL, TargetPlatform.DARWIN_ARM64],
		[TargetPlatform.DARWIN_X64, TargetPlatform.DARWIN_ARM64],
		[TargetPlatform.DARWIN_ARM64, TargetPlatform.DARWIN_ARM64],
	] as const) {
		test(`same-version installation from ${installedPlatform} to ${targetPlatform}`, async () => {
			const instantiationService = store.add(new TestInstantiationService());
			const profile = toUserDataProfile('default', 'Default', URI.file('/profiles/default'), URI.file('/cache'));
			const profileLocation = profile.extensionsResource;
			const manifest = { name: 'test', publisher: 'publisher', version: '1.0.0', engines: { vscode: '*' } };
			const identifier = { id: 'publisher.test', uuid: 'extension-uuid' };
			const existingExtension = upcastPartial<ILocalExtension>({
				identifier, manifest, type: ExtensionType.User, targetPlatform: installedPlatform,
				location: URI.file(`/extensions/publisher.test-1.0.0-${installedPlatform}`), isValid: true
			});
			const nativeExtension: ILocalExtension = { ...existingExtension, targetPlatform, location: joinPath(URI.file('/extensions'), `publisher.test-1.0.0-${targetPlatform}`) };
			const gallery = upcastPartial<IGalleryExtension>({
				identifier, version: manifest.version,
				properties: upcastPartial<IGalleryExtension['properties']>({ targetPlatform, isPreReleaseVersion: false })
			});
			const operations: string[] = [];
			const scanner = upcastPartial<ConstructorParameters<typeof InstallExtensionInProfileTask>[5]>({
				scanExtensions: async type => type === ExtensionType.User ? [existingExtension] : [],
				updateMetadata: async extension => { operations.push('updateMetadata'); return extension; },
				unsetExtensionsForRemoval: async () => [false],
				scanLocalExtension: async () => nativeExtension
			});
			instantiationService.stub(IUriIdentityService, { extUri });
			instantiationService.stub(IExtensionGalleryService, {});
			instantiationService.stub(IUserDataProfilesService, { defaultProfile: profile });
			instantiationService.stub(IExtensionsScannerService, { initializeDefaultProfileExtensions: async () => { } });
			instantiationService.stub(IExtensionsProfileScannerService, {
				addExtensionsToProfile: async (extensions: [ILocalExtension, Metadata][]) => {
					operations.push(`addToProfile:${extensions[0][0].location.path}`);
					return [];
				}
			});
			instantiationService.stub(IProductService, { version: '1.140.0' });
			instantiationService.stub(ILogService, new NullLogService());
			const task = instantiationService.createInstance(InstallExtensionInProfileTask,
				ExtensionKey.create(gallery), manifest, gallery,
				{ profileLocation, productVersion: { version: '1.140.0' } },
				async () => { operations.push('extract'); return { local: nativeExtension }; }, scanner);

			const result = await task.run();

			const platformChanged = installedPlatform !== targetPlatform;
			assert.deepStrictEqual({ operations, location: result.location.path }, {
				operations: platformChanged ? ['extract', `addToProfile:${nativeExtension.location.path}`] : ['updateMetadata'],
				location: platformChanged ? nativeExtension.location.path : existingExtension.location.path
			});
		});
	}
});
