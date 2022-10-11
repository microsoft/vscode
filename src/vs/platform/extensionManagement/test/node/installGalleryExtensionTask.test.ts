/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { platform } from 'vs/base/common/platform';
import { arch } from 'vs/base/common/process';
import { isBoolean } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionManagementError, ExtensionManagementErrorCode, getTargetPlatform, IGalleryExtension, IGalleryExtensionAssets, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsScanner, InstallGalleryExtensionTask } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { NullLogService } from 'vs/platform/log/common/log';

class TestExtensionsDownloader extends mock<ExtensionsDownloader>() {
	override async downloadVSIX(): Promise<URI> { return URI.file('vsix'); }
	override async downloadSignatureArchive(): Promise<URI> { return URI.file('signature'); }
}

class TestExtensionsScanner extends mock<ExtensionsScanner>() {
	override async scanExtensions(): Promise<ILocalExtension[]> { return []; }
}

class TestExtensionSignatureVerificationService extends mock<IExtensionSignatureVerificationService>() {

	constructor(private readonly verificationResult: string | boolean) {
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

class TestInstallGalleryExtensionTask extends InstallGalleryExtensionTask {

	installed = false;

	constructor(
		extension: IGalleryExtension,
		configurationService: IConfigurationService,
		extensionSignatureVerificationService: IExtensionSignatureVerificationService,
	) {
		super(
			{
				name: extension.name,
				publisher: extension.publisher,
				version: extension.version,
				engines: { vscode: '*' },
			},
			extension,
			{},
			new TestExtensionsDownloader(),
			new TestExtensionsScanner(),
			new NullLogService(),
			configurationService,
			extensionSignatureVerificationService
		);
	}

	protected override async installExtension(): Promise<ILocalExtension> {
		this.installed = true;
		return new class extends mock<ILocalExtension>() { };
	}

	protected override async validateManifest(): Promise<void> { }
}

suite('InstallGalleryExtensionTask Tests', () => {

	test('if verification is disabled by default, the task skips verification', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), aTestConfigurationService(), new TestExtensionSignatureVerificationService('error'));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification is disabled by setting set to false, the task skips verification', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), aTestConfigurationService(false), new TestExtensionSignatureVerificationService('error'));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification is disabled because the module is not loaded, the task skips verification', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), aTestConfigurationService(true), new TestExtensionSignatureVerificationService(false));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('if verification fails, the task throws', async () => {
		const errorCode = 'IntegrityCheckFailed';

		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), aTestConfigurationService(true), new TestExtensionSignatureVerificationService(errorCode));

		try {
			await testObject.run();
		} catch (e) {
			assert.ok(e instanceof ExtensionManagementError);
			assert.strictEqual(e.code, ExtensionManagementErrorCode.Signature);
			assert.strictEqual(e.message, errorCode);
			assert.strictEqual(testObject.wasVerified, false);
			assert.strictEqual(testObject.installed, false);
			return;
		}

		assert.fail('It should have thrown.');

	});

	test('if verification succeeds, the task completes', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: true }), aTestConfigurationService(true), new TestExtensionSignatureVerificationService(true));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, true);
		assert.strictEqual(testObject.installed, true);
	});

	test('task completes for unsigned extension', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: false }), aTestConfigurationService(true), new TestExtensionSignatureVerificationService(true));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, false);
		assert.strictEqual(testObject.installed, true);
	});

	test('task completes for an unsigned extension even when signature verification throws error', async () => {
		const testObject = new TestInstallGalleryExtensionTask(aGalleryExtension('a', { isSigned: false }), aTestConfigurationService(true), new TestExtensionSignatureVerificationService('error'));

		await testObject.run();

		assert.strictEqual(testObject.wasVerified, false);
		assert.strictEqual(testObject.installed, true);
	});

	function aTestConfigurationService(isSignatureVerificationEnabled?: boolean): IConfigurationService {
		return new TestConfigurationService(isBoolean(isSignatureVerificationEnabled) ? { extensions: { verifySignature: isSignatureVerificationEnabled } } : undefined);
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
