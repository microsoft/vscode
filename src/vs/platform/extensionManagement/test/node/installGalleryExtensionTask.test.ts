/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { VSBuffer } from 'vs/base/common/buffer';
import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { platform } from 'vs/base/common/platform';
import { arch } from 'vs/base/common/process';
import { joinPath } from 'vs/base/common/resources';
import { isBoolean } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { mock } from 'vs/base/test/common/mock';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { getTargetPlatform, IExtensionGalleryService, IGalleryExtension, IGalleryExtensionAssets, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsScanner, InstallGalleryExtensionTask } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { ExtensionsProfileScannerService } from 'vs/platform/extensionManagement/node/extensionsProfileScannerService';
import { ExtensionsScannerService } from 'vs/platform/extensionManagement/node/extensionsScannerService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { TestInstantiationService } from 'vs/platform/instantiation/test/common/instantiationServiceMock';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

const ROOT = URI.file('tests').with({ scheme: 'vscode-tests' });

class TestExtensionsScanner extends mock<ExtensionsScanner>() {
	override async scanExtensions(): Promise<ILocalExtension[]> { return []; }
}

class TestExtensionSignatureVerificationService extends mock<IExtensionSignatureVerificationService>() {

	constructor(
		private readonly verificationResult: string | boolean,
		private readonly didExecute: boolean) {
		super();
	}

	override async verify(): Promise<boolean> {
		if (isBoolean(this.verificationResult)) {
			return this.verificationResult;
		}
		const error = Error(this.verificationResult);
		(error as any).code = this.verificationResult;
		(error as any).didExecute = this.didExecute;
		throw error;
	}
}

class TestInstallGalleryExtensionTask extends InstallGalleryExtensionTask {

	installed = false;

	constructor(
		extension: IGalleryExtension,
		extensionDownloader: ExtensionsDownloader,
		disposables: DisposableStore,
	) {
		const instantiationService = disposables.add(new TestInstantiationService());
		const logService = instantiationService.stub(ILogService, new NullLogService());
		const fileService = instantiationService.stub(IFileService, disposables.add(new FileService(logService)));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));
		const systemExtensionsLocation = joinPath(ROOT, 'system');
		const userExtensionsLocation = joinPath(ROOT, 'extensions');
		instantiationService.stub(INativeEnvironmentService, {
			userHome: ROOT,
			userRoamingDataHome: ROOT,
			builtinExtensionsPath: systemExtensionsLocation.fsPath,
			extensionsPath: userExtensionsLocation.fsPath,
			userDataPath: userExtensionsLocation.fsPath,
			cacheHome: ROOT,
		});
		instantiationService.stub(IProductService, {});
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const uriIdentityService = instantiationService.stub(IUriIdentityService, disposables.add(instantiationService.createInstance(UriIdentityService)));
		const userDataProfilesService = instantiationService.stub(IUserDataProfilesService, disposables.add(instantiationService.createInstance(UserDataProfilesService)));
		const extensionsProfileScannerService = instantiationService.stub(IExtensionsProfileScannerService, disposables.add(instantiationService.createInstance(ExtensionsProfileScannerService)));
		const extensionsScannerService = instantiationService.stub(IExtensionsScannerService, disposables.add(instantiationService.createInstance(ExtensionsScannerService)));
		super(
			{
				name: extension.name,
				publisher: extension.publisher,
				version: extension.version,
				engines: { vscode: '*' },
			},
			extension,
			{ profileLocation: userDataProfilesService.defaultProfile.extensionsResource },
			extensionDownloader,
			new TestExtensionsScanner(),
			uriIdentityService,
			userDataProfilesService,
			extensionsScannerService,
			extensionsProfileScannerService,
			logService,
		);
	}

	protected override async doRun(token: CancellationToken): Promise<ILocalExtension> {
		const result = await this.install(token);
		return result[0];
	}

	protected override async extractExtension(): Promise<ILocalExtension> {
		this.installed = true;
		return new class extends mock<ILocalExtension>() { };
	}

	protected override async validateManifest(): Promise<void> { }
}

suite('InstallGalleryExtensionTask Tests', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('if verification is enabled by default, the task completes', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: true, didExecute: true }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, true);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification is enabled in stable, the task completes', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: true, didExecute: true, quality: 'stable' }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, true);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification is disabled by setting set to false, the task skips verification', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: false, verificationResult: 'error', didExecute: false }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification is disabled because the module is not loaded, the task skips verification', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: false, didExecute: false }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification fails to execute, the task completes', async () => {
		const errorCode = 'ENOENT';
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: errorCode, didExecute: false }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, errorCode);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification fails', async () => {
		const errorCode = 'IntegrityCheckFailed';

		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: errorCode, didExecute: true }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, errorCode);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification succeeds, the task completes', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: true, didExecute: true }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, true);
		assert.strictEqual(testObject.installed, true);
	});

	test('task completes for unsigned extension', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: false }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: true, didExecute: false }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('task completes for an unsigned extension even when signature verification throws error', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: false }), anExtensionsDownloader({ isSignatureVerificationEnabled: true, verificationResult: 'error', didExecute: true }), disposables.add(new DisposableStore()));

		await testObject.run();

		assert.strictEqual(testObject.verificationStatus, false);
		assert.strictEqual(testObject.installed, true);
	});

	function anExtensionsDownloader(options: { isSignatureVerificationEnabled: boolean; verificationResult: boolean | string; didExecute: boolean; quality?: string }): ExtensionsDownloader {
		const logService = new NullLogService();
		const fileService = disposables.add(new FileService(logService));
		const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
		disposables.add(fileService.registerProvider(ROOT.scheme, fileSystemProvider));

		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IProductService, { quality: options.quality ?? 'insiders' });
		instantiationService.stub(IFileService, fileService);
		instantiationService.stub(ILogService, logService);
		instantiationService.stub(INativeEnvironmentService, <Partial<INativeEnvironmentService>>{ extensionsDownloadLocation: joinPath(ROOT, 'CachedExtensionVSIXs') });
		instantiationService.stub(IExtensionGalleryService, <Partial<IExtensionGalleryService>>{
			async download(extension, location, operation) {
				await fileService.writeFile(location, VSBuffer.fromString('extension vsix'));
			},
			async downloadSignatureArchive(extension, location) {
				await fileService.writeFile(location, VSBuffer.fromString('extension signature'));
			},
		});
		instantiationService.stub(IConfigurationService, new TestConfigurationService(isBoolean(options.isSignatureVerificationEnabled) ? { extensions: { verifySignature: options.isSignatureVerificationEnabled } } : undefined));
		instantiationService.stub(IExtensionSignatureVerificationService, new TestExtensionSignatureVerificationService(options.verificationResult, !!options.didExecute));
		return disposables.add(instantiationService.createInstance(ExtensionsDownloader));
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
