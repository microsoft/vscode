/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../base/common/buffer';
import { platform } from '../../../../base/common/platform';
import { arch } from '../../../../base/common/process';
import { joinPath } from '../../../../base/common/resources';
import { isBoolean } from '../../../../base/common/types';
import { URI } from '../../../../base/common/uri';
import { generateUuid } from '../../../../base/common/uuid';
import { mock } from '../../../../base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils';
import { IConfigurationService } from '../../../configuration/common/configuration';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService';
import { INativeEnvironmentService } from '../../../environment/common/environment';
import { getTargetPlatform, IExtensionGalleryService, IGalleryExtension, IGalleryExtensionAssets, InstallOperation } from '../../common/extensionManagement';
import { getGalleryExtensionId } from '../../common/extensionManagementUtil';
import { ExtensionsDownloader } from '../../node/extensionDownloader';
import { IExtensionSignatureVerificationService } from '../../node/extensionSignatureVerificationService';
import { IFileService } from '../../../files/common/files';
import { FileService } from '../../../files/common/fileService';
import { InMemoryFileSystemProvider } from '../../../files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from '../../../instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from '../../../log/common/log';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestExtensionSignatureVerificationService extends mock<IExtensionSignatureVerificationService>() {

	constructor(
		private readonly verificationResult: string | boolean) {
		super();
	}

	override async verify(): Promise<boolean> {
		if (isBoolean(this.verificationResult)) {
			return this.verificationResult;
		}
		const error = Error(this.verificationResult);
		(error as any).code = this.verificationResult;
		throw error;
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

	test('download completes successfully if verification is disabled by setting set to false', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: false, verificationResult: 'error' });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, false);
	});

	test('download completes successfully if verification is disabled by options', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: 'error' });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, false);

		assert.strictEqual(actual.verificationStatus, false);
	});

	test('download completes successfully if verification is disabled because the module is not loaded', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: false });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, false);
	});

	test('download completes successfully if verification fails to execute', async () => {
		const errorCode = 'ENOENT';
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: errorCode });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, errorCode);
	});

	test('download completes successfully if verification fails ', async () => {
		const errorCode = 'IntegrityCheckFailed';
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: errorCode });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, errorCode);
	});

	test('download completes successfully if verification succeeds', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: true });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: true }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, true);
	});

	test('download completes successfully for unsigned extension', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: true });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, false);
	});

	test('download completes successfully for an unsigned extension even when signature verification throws error', async () => {
		const testObject = aTestObject({ isSignatureVerificationEnabled: true, verificationResult: 'error' });

		const actual = await testObject.download(aGalleryExtension('a', { isSigned: false }), InstallOperation.Install, true);

		assert.strictEqual(actual.verificationStatus, false);
	});

	function aTestObject(options: { isSignatureVerificationEnabled: boolean; verificationResult: boolean | string }): ExtensionsDownloader {
		instantiationService.stub(IConfigurationService, new TestConfigurationService(isBoolean(options.isSignatureVerificationEnabled) ? { extensions: { verifySignature: options.isSignatureVerificationEnabled } } : undefined));
		instantiationService.stub(IExtensionSignatureVerificationService, new TestExtensionSignatureVerificationService(options.verificationResult));
		return disposables.add(instantiationService.createInstance(TestExtensionDownloader));
	}

	function aGalleryExtension(name: string, properties: Partial<IGalleryExtension> = {}, galleryExtensionProperties: any = {}, assets: Partial<IGalleryExtensionAssets> = {}): IGalleryExtension {
		const targetPlatform = getTargetPlatform(platform, arch);
		const galleryExtension = <IGalleryExtension>Object.create({ name, publisher: 'pub', version: '1.0.0', allTargetPlatforms: [targetPlatform], properties: {}, assets: {}, ...properties });
		galleryExtension.properties = { ...galleryExtension.properties, dependencies: [], targetPlatform, ...galleryExtensionProperties };
		galleryExtension.assets = { ...galleryExtension.assets, ...assets };
		galleryExtension.identifier = { id: getGalleryExtensionId(galleryExtension.publisher, galleryExtension.name), uuid: generateUuid() };
		return <IGalleryExtension>galleryExtension;
	}
});
