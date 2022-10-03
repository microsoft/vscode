/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { tmpdir } from 'os';
import { CancellationToken } from 'vs/base/common/cancellation';
import { randomPath } from 'vs/base/common/extpath';
import { join } from 'vs/base/common/path';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import { mock } from 'vs/base/test/common/mock';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TestConfigurationService } from 'vs/platform/configuration/test/common/testConfigurationService';
import { ExtensionManagementErrorCode, IGalleryExtension, ILocalExtension, InstallOperation, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { IExtensionsScanner, InstallableExtension, InstallGalleryExtensionTask } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionSignatureVerificationError, IExtensionSignatureVerificationService } from 'vs/platform/extensionManagement/node/extensionSignatureVerificationService';
import { ExtensionType, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ILogService, NullLogService } from 'vs/platform/log/common/log';

class TestInstallGalleryExtensionTask extends InstallGalleryExtensionTask {

	private readonly _manifest: IExtensionManifest;
	private readonly _gallery: IGalleryExtension;
	private _installExtensionWasCalled = false;

	public get installExtensionWasCalled(): boolean {
		return this._installExtensionWasCalled;
	}

	constructor(
		manifest: IExtensionManifest,
		gallery: IGalleryExtension,
		options: InstallOptions,
		extensionsDownloader: IExtensionsDownloader,
		extensionsScanner: IExtensionsScanner,
		logService: ILogService,
		extensionSignatureVerificationService: IExtensionSignatureVerificationService,
		private readonly extensionLocation: URI,
		private readonly signatureArchiveLocation: URI,
		configurationService: IConfigurationService
	) {
		super(manifest, gallery, options, extensionsDownloader, extensionsScanner, logService, configurationService, extensionSignatureVerificationService);

		this._manifest = manifest;
		this._gallery = gallery;
	}

	protected override downloadExtension(extension: IGalleryExtension, operation: InstallOperation): Promise<{ zipPath: string; signatureArchivePath?: string }> {
		const uris = {
			zipPath: this.extensionLocation.fsPath,
			signatureArchivePath: this.signatureArchiveLocation.fsPath
		};

		return Promise.resolve(uris);
	}

	protected override installExtension(installableExtension: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		this._installExtensionWasCalled = true;

		const extension = {
			identifier: this._gallery.identifier,
			installedTimestamp: new Date().getDate(),
			isApplicationScoped: true,
			isBuiltin: false,
			isMachineScoped: false,
			isPreReleaseVersion: this._gallery.properties.isPreReleaseVersion,
			isSigned: !!this.signatureArchiveLocation,
			isValid: true,
			location: this.extensionLocation,
			manifest: this._manifest,
			preRelease: this._gallery.properties.isPreReleaseVersion,
			publisherDisplayName: this._gallery.publisherDisplayName,
			publisherId: this._gallery.publisherId,
			targetPlatform: TargetPlatform.UNKNOWN,
			type: ExtensionType.User,
			updated: true,
			validations: []
		};

		return Promise.resolve(extension);
	}

}

suite('InstallGalleryExtensionTask Tests', () => {
	let extension: IGalleryExtension;
	let extensionLocation: URI;
	let extensionsDownloader: IExtensionsDownloader;
	let extensionsScanner: IExtensionsScanner;
	let logService: ILogService;
	let manifest: IExtensionManifest;
	let options: InstallOptions;
	let signatureArchiveLocation: URI;
	let testDirectory: string;

	setup(async () => {
		logService = new NullLogService();
		extensionsDownloader = new class extends mock<IExtensionsDownloader>() { };
		extensionsScanner = new class extends mock<IExtensionsScanner>() {
			override async scanExtensions(type: ExtensionType | null, profileLocation: URI | undefined): Promise<ILocalExtension[]> {
				return [];
			}
		};

		testDirectory = join(tmpdir(), randomPath(), 'galleryinstall');
		extensionLocation = URI.file(join(testDirectory, 'extension.vsix'));
		signatureArchiveLocation = URI.file(join(testDirectory, 'extension.sigzip'));

		manifest = {
			name: 'name',
			version: '1.2.3',
			publisher: 'publisher',
			engines: { vscode: '^1.66.0' }
		};

		extension = {
			name: manifest.name,
			version: manifest.version,
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: generateUuid() },
			displayName: 'displayName',
			publisherId: 'publisherId',
			publisher: 'publisher',
			publisherDisplayName: 'publisherDisplayName',
			description: 'description',
			installCount: 7,
			rating: 4,
			ratingCount: 9,
			categories: [],
			tags: [],
			releaseDate: new Date().getDate(),
			lastUpdated: new Date().getDate(),
			preview: false,
			hasPreReleaseVersion: false,
			hasReleaseVersion: true,
			allTargetPlatforms: [],
			assets: {
				manifest: { uri: 'uri:manifest', fallbackUri: 'fallback:manifest' },
				readme: { uri: 'uri:readme', fallbackUri: 'fallback:readme' },
				changelog: { uri: 'uri:changelog', fallbackUri: 'fallback:changlog' },
				download: { uri: 'uri:download', fallbackUri: 'fallback:download' },
				icon: { uri: 'uri:icon', fallbackUri: 'fallback:icon' },
				license: { uri: 'uri:license', fallbackUri: 'fallback:license' },
				repository: { uri: 'uri:repository', fallbackUri: 'fallback:repository' },
				signature: { uri: 'uri:signature', fallbackUri: 'fallback:signature' },
				coreTranslations: []
			},
			properties: { targetPlatform: TargetPlatform.UNKNOWN, isPreReleaseVersion: false },
			isSigned: true
		};

		options = {};
	});

	function CreateTask(func: () => Promise<boolean>, isSignatureVerificationEnabled?: boolean): TestInstallGalleryExtensionTask {
		const configuration = isSignatureVerificationEnabled ? { extensions: { verifySignature: isSignatureVerificationEnabled } } : null;
		const configurationService = new TestConfigurationService(configuration);
		const extensionSignatureVerificationService = new class extends mock<IExtensionSignatureVerificationService>() {
			override async verify(vsixFilePath: string, signatureArchiveFilePath: string): Promise<boolean> {
				return func();
			}
		};

		return new TestInstallGalleryExtensionTask(
			manifest,
			extension,
			options,
			extensionsDownloader,
			extensionsScanner,
			logService,
			extensionSignatureVerificationService,
			extensionLocation,
			signatureArchiveLocation,
			configurationService);
	}

	test('if verification is disabled by settings, the task skips verification', async () => {
		const task: TestInstallGalleryExtensionTask = CreateTask(() => {
			const error = new Error() as ExtensionSignatureVerificationError;

			error.code = 'If this error is thrown, it is a bug.  Verification should be skipped.';

			throw error;
		});

		await task.run();

		assert.strictEqual(task.wasVerified, false);
		assert.strictEqual(task.installExtensionWasCalled, true);
	});

	test('if verification is disabled because the module is not loaded, the task skips verification', async () => {
		const task: TestInstallGalleryExtensionTask = CreateTask(() => Promise.resolve(false), true);

		await task.run();

		assert.strictEqual(task.wasVerified, false);
		assert.strictEqual(task.installExtensionWasCalled, true);
	});

	test('if verification fails, the task throws', async () => {
		const errorCode = 'IntegrityCheckFailed';

		const task: TestInstallGalleryExtensionTask = CreateTask(() => {
			const error = new Error() as ExtensionSignatureVerificationError;

			error.code = errorCode;

			throw error;
		}, true);

		try {
			await task.run();

			assert.fail('It should have thrown.');
		} catch (e) {
			assert.ok(e instanceof Error);

			const extensionVerificationError = e as ExtensionSignatureVerificationError;

			assert.ok(extensionVerificationError);
			assert.strictEqual(extensionVerificationError.code, ExtensionManagementErrorCode.Signature);
			assert.strictEqual(extensionVerificationError.message, errorCode);
		}

		assert.strictEqual(task.wasVerified, false);
		assert.strictEqual(task.installExtensionWasCalled, false);
	});

	test('if verification succeeds, the task completes', async () => {
		const task: TestInstallGalleryExtensionTask = CreateTask(() => Promise.resolve(true), true);

		await task.run();

		assert.strictEqual(task.wasVerified, true);
		assert.strictEqual(task.installExtensionWasCalled, true);
	});
});
