/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionGalleryService, IExtensionInfo, IGalleryExtension, IGalleryExtensionAssets, ILocalExtension } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ExtensionType, TargetPlatform } from '../../../../../platform/extensions/common/extensions.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { InMemoryStorageService, IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IUserDataProfile, toUserDataProfile } from '../../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { IWorkbenchExtensionManagementService } from '../../../extensionManagement/common/extensionManagement.js';
import { ExtensionsResource } from '../../browser/extensionsResource.js';

const noAssets: IGalleryExtensionAssets = {
	changelog: null,
	download: null!,
	icon: null!,
	license: null,
	manifest: null,
	readme: null,
	repository: null,
	signature: null,
	coreTranslations: []
};

function aGalleryExtension(id: string): IGalleryExtension {
	const [publisher, name] = id.split('.');
	const galleryExtension = <IGalleryExtension>Object.create({ name, publisher, version: '1.0.0', allTargetPlatforms: [TargetPlatform.UNDEFINED], assets: noAssets });
	galleryExtension.identifier = { id, uuid: `uuid-${id}` };
	galleryExtension.properties = { targetPlatform: TargetPlatform.UNDEFINED, isPreReleaseVersion: false, dependencies: [] };
	return galleryExtension;
}

function aLocalExtension(id: string, isBuiltin: boolean = false): ILocalExtension {
	const [publisher, name] = id.split('.');
	return <ILocalExtension>Object.create({
		identifier: { id, uuid: `uuid-${id}` },
		manifest: { name, publisher, version: '1.0.0' },
		type: isBuiltin ? ExtensionType.System : ExtensionType.User,
		isBuiltin,
		isValid: true,
		isApplicationScoped: false,
		preRelease: false,
		pinned: false,
		location: URI.file(id),
		targetPlatform: TargetPlatform.UNDEFINED,
	});
}

suite('ExtensionsResource', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let extensionManagementService: Partial<IWorkbenchExtensionManagementService>;
	let profile: IUserDataProfile;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());
		const storageService = disposables.add(new InMemoryStorageService());

		extensionManagementService = {
			onDidInstallExtensions: Event.None,
			async getInstalled() { return []; },
			async canInstall(): Promise<true> { return true; },
			async requestPublisherTrust() { },
			async installFromGallery(extension: IGalleryExtension) { return aLocalExtension(extension.identifier.id); },
			async uninstall() { },
		};
		instantiationService.stub(IWorkbenchExtensionManagementService, extensionManagementService);

		instantiationService.stub(IExtensionGalleryService, <Partial<IExtensionGalleryService>>{
			async getExtensions(extensionInfos: ReadonlyArray<IExtensionInfo>) {
				return extensionInfos.map(({ id }) => aGalleryExtension(id));
			}
		});

		instantiationService.stub(IUserDataProfileStorageService, new class extends mock<IUserDataProfileStorageService>() {
			override withProfileScopedStorageService<T>(profile: IUserDataProfile, fn: (storageService: IStorageService) => Promise<T>): Promise<T> {
				return fn(storageService);
			}
		});

		instantiationService.stub(ILogService, new NullLogService());

		profile = toUserDataProfile('test', 'test', URI.file('/profiles/test'), URI.file('/cache'));
	});

	test('installs the remaining extensions when one extension fails to install', async () => {
		const installed: string[] = [];
		extensionManagementService.installFromGallery = async (extension: IGalleryExtension) => {
			if (extension.identifier.id === 'pub.b') {
				throw new Error('Failed to install pub.b');
			}
			installed.push(extension.identifier.id);
			return aLocalExtension(extension.identifier.id);
		};

		const testObject = instantiationService.createInstance(ExtensionsResource);

		// A cancellation token selects the sequential install path in `apply()`.
		await testObject.apply(JSON.stringify([
			{ identifier: { id: 'pub.a' } },
			{ identifier: { id: 'pub.b' } },
			{ identifier: { id: 'pub.c' } },
		]), profile, undefined, CancellationToken.None);

		assert.deepStrictEqual(installed, ['pub.a', 'pub.c']);
	});

	test('reports progress for every extension when one extension fails to install', async () => {
		const progressMessages: string[] = [];
		extensionManagementService.installFromGallery = async (extension: IGalleryExtension) => {
			if (extension.identifier.id === 'pub.a') {
				throw new Error('Failed to install pub.a');
			}
			return aLocalExtension(extension.identifier.id);
		};

		const testObject = instantiationService.createInstance(ExtensionsResource);

		await testObject.apply(JSON.stringify([
			{ identifier: { id: 'pub.a' } },
			{ identifier: { id: 'pub.b' } },
		]), profile, message => progressMessages.push(message), CancellationToken.None);

		assert.strictEqual(progressMessages.length, 2);
	});

	test('does not install an extension that is already installed as a builtin', async () => {
		extensionManagementService.getInstalled = async () => [aLocalExtension('pub.builtin', true)];
		const installed: string[] = [];
		extensionManagementService.installFromGallery = async (extension: IGalleryExtension) => {
			installed.push(extension.identifier.id);
			return aLocalExtension(extension.identifier.id);
		};

		const testObject = instantiationService.createInstance(ExtensionsResource);

		await testObject.apply(JSON.stringify([
			{ identifier: { id: 'pub.builtin' } },
			{ identifier: { id: 'pub.a' } },
		]), profile, undefined, CancellationToken.None);

		assert.deepStrictEqual(installed, ['pub.a']);
	});
});
