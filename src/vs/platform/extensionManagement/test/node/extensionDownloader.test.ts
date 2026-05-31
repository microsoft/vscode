/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { platform } from '../../../../base/common/platform.js';
import { arch } from '../../../../base/common/process.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { INativeEnvironmentService } from '../../../environment/common/environment.js';
import { ExtensionSignatureVerificationCode, getTargetPlatform, IExtensionGalleryService, IGalleryExtension, IGalleryExtensionAssets, InstallOperation } from '../../common/extensionManagement.js';
import { getGalleryExtensionId } from '../../common/extensionManagementUtil.js';
import { ExtensionsDownloader } from '../../node/extensionDownloader.js';
import { IExtensionSignatureVerificationResult, IExtensionSignatureVerificationService } from '../../node/extensionSignatureVerificationService.js';
import { IFileService } from '../../../files/common/files.js';
import { FileService } from '../../../files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider.js';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../log/common/log.js';
import { IUriIdentityService } from '../../../uriIdentity/common/uriIdentity.js';
import { UriIdentityService } from '../../../uriIdentity/common/uriIdentityService.js';
import { IStringDictionary } from '../../../../base/common/collections.js';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestExtensionSignatureVerificationService extends mock<IExtensionSignatureVerificationService>() {

	constructor(
		private readonly verificationResult: string | boolean) {
		super();
	}

	override async verify(): Promise<IExtensionSignatureVerificationResult | undefined> {
		if (this.verificationResult === true) {
			return {
				code: ExtensionSignatureVerificationCode.Success
			};
		}
		if (this.verificationResult === false) {
			return undefined;
		}
		return {
			code: this.verificationResult as ExtensionSignatureVerificationCode,
		};
	}
}

class TestExtensionDownloader extends ExtensionsDownloader {
	protected override async validate(): Promise<void> { }
}

suite('ExtensionDownloader Tests', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	let instantiationService: TestInstantiationService;

	setup(() => {
		instantiationService = disposables.add(new TestInstantiationService());

		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(IUriIdentityService, disposables.add(new UriIdentityService(fileService)));
		instantiationService.stub(INativeEnvironmentService, { extensionsDownloadLocation: joinPath(ROOT, 'CachedExtensionVSIXs') });
		instantiationService.stub(IExtensionGalleryService, {
			async download(extension, location, operation) {
				await fileService.writeFile(location, VSBuffer.fromString('extension vsix'));
			},
			async downloadSignatureArchive(extension, location) {
				await fileService.writeFile(location, VSBuffer.fromString('extension signature'));
			},
		});
	});

	test('download completes successfully if verification is disabled by options', async () => {
		const testObject = aTestObject({ verificationResult: 'error' });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, false);

		assert.strictEqual(actual.verificationStatus, undefined);
	});

	test('download completes successfully if verification is disabled because the module is not loaded', async () => {
		const testObject = aTestObject({ verificationResult: false });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, undefined);
	});

	test('download completes successfully if verification fails to execute', async () => {
		const errorCode = 'ENOENT';
		const testObject = aTestObject({ verificationResult: errorCode });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, errorCode);
	});

	test('download completes successfully if verification fails ', async () => {
		const errorCode = 'IntegrityCheckFailed';
		const testObject = aTestObject({ verificationResult: errorCode });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, errorCode);
	});

	test('download completes successfully if verification succeeds', async () => {
		const testObject = aTestObject({ verificationResult: true });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.Success);
	});

	test('download completes successfully for unsigned extension', async () => {
		const testObject = aTestObject({ verificationResult: true });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.NotSigned);
	});

	test('download completes successfully for an unsigned extension even when signature verification throws error', async () => {
		const testObject = aTestObject({ verificationResult: 'error' });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, ExtensionSignatureVerificationCode.NotSigned);
	});

	function aTestObject(options: { verificationResult: boolean | string }): ExtensionsDownloader {
		instantiationService.stub(IExtensionSignatureVerificationService, new TestExtensionSignatureVerificationService(options.verificationResult));
		return disposables.add(instantiationService.createInstance(TestExtensionDownloader));
	}

	function aGalleryExtension(name: string, properties: Partial<IGalleryExtension> = {}, galleryExtensionProperties: IStringDictionary<unknown> = {}, assets: Partial<IGalleryExtensionAssets> = {}): IGalleryExtension {
		const targetPlatform = getTargetPlatform(platform, arch);
		const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
		galleryExtension.assets = { ...galleryExtension.assets, ...assets };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}
});
