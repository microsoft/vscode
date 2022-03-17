/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { getErrorMessage } from 'vs/base/common/errors';
import { Schemas } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import { isMacintosh } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import { isBoolean } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { IFile, zip } from 'vs/base/node/zip';
import * as nls from 'vs/nls';
import { IDownloadService } from 'vs/platform/download/common/download';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractExtensionManagementService, AbstractExtensionTask, IInstallExtensionTask, IUninstallExtensionTask, joinErrors, UninstallExtensionTaskOptions } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import {
	ExtensionManagementError, ExtensionManagementErrorCode, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, IGalleryExtension, IGalleryMetadata, ILocalExtension, InstallOperation, InstallOptions,
	InstallVSIXOptions, Metadata
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { ExtensionsScanner, ILocalExtensionManifest } from 'vs/platform/extensionManagement/node/extensionsScanner';
import { ExtensionsWatcher } from 'vs/platform/extensionManagement/node/extensionsWatcher';
import { ExtensionType, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { isEngineValid } from 'vs/platform/extensions/common/extensionValidator';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

interface InstallableExtension {
	zipPath: string;
	key: ExtensionKey;
	metadata?: Metadata;
}

export class ExtensionManagementService extends AbstractExtensionManagementService implements IExtensionManagementService {

	private readonly extensionsScanner: ExtensionsScanner;
	private readonly manifestCache: ExtensionsManifestCache;
	private readonly extensionsDownloader: ExtensionsDownloader;

	constructor(
		@IExtensionGalleryService galleryService: IExtensionGalleryService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IDownloadService private downloadService: IDownloadService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IProductService productService: IProductService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(galleryService, telemetryService, logService, productService);
		const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
		this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, extension => extensionLifecycle.postUninstall(extension), this.getTargetPlatform()));
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));
		const extensionsWatcher = this._register(new ExtensionsWatcher(this, fileService, environmentService, logService, uriIdentityService));

		this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource(({ added, removed }) => {
			if (added.length) {
				this._onDidInstallExtensions.fire(added.map(local => ({ identifier: local.identifier, operation: InstallOperation.None, local })));
			}
			removed.forEach(extension => this._onDidUninstallExtension.fire({ identifier: extension }));
		}));
	}

	private _targetPlatformPromise: Promise<TargetPlatform> | undefined;
	getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
		}
		return this._targetPlatformPromise;
	}

	async zip(extension: ILocalExtension): Promise<URI> {
		this.logService.trace('ExtensionManagementService#zip', extension.identifier.id);
		const files = await this.collectFiles(extension);
		const location = await zip(joinPath(this.environmentService.tmpDir, generateUuid()).fsPath, files);
		return URI.file(location);
	}

	async unzip(zipLocation: URI): Promise<IExtensionIdentifier> {
		this.logService.trace('ExtensionManagementService#unzip', zipLocation.toString());
		const local = await this.install(zipLocation);
		return local.identifier;
	}

	async getManifest(vsix: URI): Promise<IExtensionManifest> {
		const downloadLocation = await this.downloadVsix(vsix);
		const zipPath = path.resolve(downloadLocation.fsPath);
		return getManifest(zipPath);
	}

	getInstalled(type: ExtensionType | null = null): Promise<ILocalExtension[]> {
		return this.extensionsScanner.scanExtensions(type);
	}

	async install(vsix: URI, options: InstallVSIXOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', vsix.toString());

		const downloadLocation = await this.downloadVsix(vsix);
		const manifest = await getManifest(path.resolve(downloadLocation.fsPath));
		if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, this.productService.version, this.productService.date)) {
			throw new Error(nls.localize('incompatible', "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", getGalleryExtensionId(manifest.publisher, manifest.name), this.productService.version));
		}

		return this.installExtension(manifest, downloadLocation, options);
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateMetadata', local.identifier.id);
		const localMetadata: Metadata = { ...((<ILocalExtensionManifest>local.manifest).__metadata || {}), ...metadata };
		if (metadata.isPreReleaseVersion) {
			localMetadata.preRelease = true;
		}
		local = await this.extensionsScanner.saveMetadataForLocalExtension(local, localMetadata);
		this.manifestCache.invalidate();
		return local;
	}

	async updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateExtensionScope', local.identifier.id);
		local = await this.extensionsScanner.saveMetadataForLocalExtension(local, { ...((<ILocalExtensionManifest>local.manifest).__metadata || {}), isMachineScoped });
		this.manifestCache.invalidate();
		return local;
	}

	removeDeprecatedExtensions(): Promise<void> {
		return this.extensionsScanner.cleanUp();
	}

	private async downloadVsix(vsix: URI): Promise<URI> {
		if (vsix.scheme === Schemas.file) {
			return vsix;
		}
		const downloadedLocation = joinPath(this.environmentService.tmpDir, generateUuid());
		await this.downloadService.download(vsix, downloadedLocation);
		return downloadedLocation;
	}

	protected createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions & InstallVSIXOptions): IInstallExtensionTask {
		return URI.isUri(extension) ? new InstallVSIXTask(manifest, extension, options, this.galleryService, this.extensionsScanner, this.logService) : new InstallGalleryExtensionTask(extension, options, this.extensionsDownloader, this.extensionsScanner, this.logService);
	}

	protected createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask {
		return new UninstallExtensionTask(extension, options, this.extensionsScanner);
	}

	private async collectFiles(extension: ILocalExtension): Promise<IFile[]> {

		const collectFilesFromDirectory = async (dir: string): Promise<string[]> => {
			let entries = await pfs.Promises.readdir(dir);
			entries = entries.map(e => path.join(dir, e));
			const stats = await Promise.all(entries.map(e => pfs.Promises.stat(e)));
			let promise: Promise<string[]> = Promise.resolve([]);
			stats.forEach((stat, index) => {
				const entry = entries[index];
				if (stat.isFile()) {
					promise = promise.then(result => ([...result, entry]));
				}
				if (stat.isDirectory()) {
					promise = promise
						.then(result => collectFilesFromDirectory(entry)
							.then(files => ([...result, ...files])));
				}
			});
			return promise;
		};

		const files = await collectFilesFromDirectory(extension.location.fsPath);
		return files.map(f => (<IFile>{ path: `extension/${path.relative(extension.location.fsPath, f)}`, localPath: f }));
	}

}

abstract class AbstractInstallExtensionTask extends AbstractExtensionTask<ILocalExtension> implements IInstallExtensionTask {

	protected _operation = InstallOperation.Install;
	get operation() { return this._operation; }

	constructor(
		readonly identifier: IExtensionIdentifier,
		readonly source: URI | IGalleryExtension,
		protected readonly extensionsScanner: ExtensionsScanner,
		protected readonly logService: ILogService,
	) {
		super();
	}

	protected async installExtension(installableExtension: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		try {
			const local = await this.unsetUninstalledAndGetLocal(installableExtension.key);
			if (local) {
				return installableExtension.metadata ? this.extensionsScanner.saveMetadataForLocalExtension(local, { ...((<ILocalExtensionManifest>local.manifest).__metadata || {}), ...installableExtension.metadata }) : local;
			}
		} catch (e) {
			if (isMacintosh) {
				throw new ExtensionManagementError(nls.localize('quitCode', "Unable to install the extension. Please Quit and Start VS Code before reinstalling."), ExtensionManagementErrorCode.Internal);
			} else {
				throw new ExtensionManagementError(nls.localize('exitCode', "Unable to install the extension. Please Exit and Start VS Code before reinstalling."), ExtensionManagementErrorCode.Internal);
			}
		}
		return this.extract(installableExtension, token);
	}

	protected async unsetUninstalledAndGetLocal(extensionKey: ExtensionKey): Promise<ILocalExtension | null> {
		const isUninstalled = await this.isUninstalled(extensionKey);
		if (!isUninstalled) {
			return null;
		}

		this.logService.trace('Removing the extension from uninstalled list:', extensionKey.id);
		// If the same version of extension is marked as uninstalled, remove it from there and return the local.
		const local = await this.extensionsScanner.setInstalled(extensionKey);
		this.logService.info('Removed the extension from uninstalled list:', extensionKey.id);

		return local;
	}

	private async isUninstalled(extensionId: ExtensionKey): Promise<boolean> {
		const uninstalled = await this.extensionsScanner.getUninstalledExtensions();
		return !!uninstalled[extensionId.toString()];
	}

	private async extract({ zipPath, key, metadata }: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		let local = await this.extensionsScanner.extractUserExtension(key, zipPath, metadata, token);
		this.logService.info('Extracting completed.', key.id);
		return local;
	}

}

class InstallGalleryExtensionTask extends AbstractInstallExtensionTask {

	constructor(
		private readonly gallery: IGalleryExtension,
		private readonly options: InstallOptions,
		private readonly extensionsDownloader: ExtensionsDownloader,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService,
	) {
		super(gallery.identifier, gallery, extensionsScanner, logService);
	}

	protected async doRun(token: CancellationToken): Promise<ILocalExtension> {
		const installed = await this.extensionsScanner.scanExtensions(null);
		const existingExtension = installed.find(i => areSameExtensions(i.identifier, this.gallery.identifier));
		if (existingExtension) {
			this._operation = InstallOperation.Update;
		}

		const installableExtension = await this.downloadInstallableExtension(this.gallery, this._operation);
		installableExtension.metadata.isMachineScoped = this.options.isMachineScoped || existingExtension?.isMachineScoped;
		installableExtension.metadata.isBuiltin = this.options.isBuiltin || existingExtension?.isBuiltin;
		installableExtension.metadata.isSystem = existingExtension?.type === ExtensionType.System ? true : undefined;
		installableExtension.metadata.isPreReleaseVersion = this.gallery.properties.isPreReleaseVersion;
		installableExtension.metadata.preRelease = this.gallery.properties.isPreReleaseVersion ||
			(isBoolean(this.options.installPreReleaseVersion)
				? this.options.installPreReleaseVersion /* Respect the passed flag */
				: existingExtension?.preRelease /* Respect the existing pre-release flag if it was set */);

		try {
			const local = await this.installExtension(installableExtension, token);
			if (existingExtension && (existingExtension.targetPlatform !== local.targetPlatform || semver.neq(existingExtension.manifest.version, local.manifest.version))) {
				await this.extensionsScanner.setUninstalled(existingExtension);
			}
			return local;
		} catch (error) {
			await this.deleteDownloadedVSIX(installableExtension.zipPath);
			throw error;
		}
	}

	private async deleteDownloadedVSIX(vsix: string): Promise<void> {
		try {
			await this.extensionsDownloader.delete(URI.file(vsix));
		} catch (error) {
			/* Ignore */
			this.logService.warn('Error while deleting the downloaded vsix', vsix.toString(), getErrorMessage(error));
		}
	}

	private async downloadInstallableExtension(extension: IGalleryExtension, operation: InstallOperation): Promise<Required<InstallableExtension>> {
		const metadata = <IGalleryMetadata>{
			id: extension.identifier.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
			targetPlatform: extension.properties.targetPlatform
		};

		let zipPath: string | undefined;
		try {
			this.logService.trace('Started downloading extension:', extension.identifier.id);
			zipPath = (await this.extensionsDownloader.downloadExtension(extension, operation)).fsPath;
			this.logService.info('Downloaded extension:', extension.identifier.id, zipPath);
		} catch (error) {
			throw new ExtensionManagementError(joinErrors(error).message, ExtensionManagementErrorCode.Download);
		}

		try {
			await getManifest(zipPath);
			return (<Required<InstallableExtension>>{ zipPath, key: ExtensionKey.create(extension), metadata });
		} catch (error) {
			await this.deleteDownloadedVSIX(zipPath);
			throw new ExtensionManagementError(joinErrors(error).message, ExtensionManagementErrorCode.Invalid);
		}
	}
}

class InstallVSIXTask extends AbstractInstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly location: URI,
		private readonly options: InstallOptions,
		private readonly galleryService: IExtensionGalleryService,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService
	) {
		super({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, location, extensionsScanner, logService);
	}

	protected async doRun(token: CancellationToken): Promise<ILocalExtension> {
		const extensionKey = new ExtensionKey(this.identifier, this.manifest.version);
		const installedExtensions = await this.extensionsScanner.scanExtensions(ExtensionType.User);
		const existing = installedExtensions.find(i => areSameExtensions(this.identifier, i.identifier));
		const metadata = await this.getMetadata(this.identifier.id, this.manifest.version, token);
		metadata.isMachineScoped = this.options.isMachineScoped || existing?.isMachineScoped;
		metadata.isBuiltin = this.options.isBuiltin || existing?.isBuiltin;

		if (existing) {
			this._operation = InstallOperation.Update;
			if (extensionKey.equals(new ExtensionKey(existing.identifier, existing.manifest.version))) {
				try {
					await this.extensionsScanner.removeExtension(existing, 'existing');
				} catch (e) {
					throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
				}
			} else if (semver.gt(existing.manifest.version, this.manifest.version)) {
				await this.extensionsScanner.setUninstalled(existing);
			}
		} else {
			// Remove the extension with same version if it is already uninstalled.
			// Installing a VSIX extension shall replace the existing extension always.
			const existing = await this.unsetUninstalledAndGetLocal(extensionKey);
			if (existing) {
				try {
					await this.extensionsScanner.removeExtension(existing, 'existing');
				} catch (e) {
					throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
				}
			}
		}

		return this.installExtension({ zipPath: path.resolve(this.location.fsPath), key: extensionKey, metadata }, token);
	}

	private async getMetadata(id: string, version: string, token: CancellationToken): Promise<Metadata> {
		try {
			let [galleryExtension] = await this.galleryService.getExtensions([{ id, version }], token);
			if (!galleryExtension) {
				[galleryExtension] = await this.galleryService.getExtensions([{ id }], token);
			}
			if (galleryExtension) {
				return {
					id: galleryExtension.identifier.uuid,
					publisherDisplayName: galleryExtension.publisherDisplayName,
					publisherId: galleryExtension.publisherId,
					isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion,
					preRelease: galleryExtension.properties.isPreReleaseVersion || this.options.installPreReleaseVersion
				};
			}
		} catch (error) {
			/* Ignore Error */
		}
		return {};
	}
}

class UninstallExtensionTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly options: UninstallExtensionTaskOptions,
		private readonly extensionsScanner: ExtensionsScanner
	) { super(); }

	protected async doRun(token: CancellationToken): Promise<void> {
		const toUninstall: ILocalExtension[] = [];
		const userExtensions = await this.extensionsScanner.scanUserExtensions(false);
		if (this.options.versionOnly) {
			const extensionKey = ExtensionKey.create(this.extension);
			toUninstall.push(...userExtensions.filter(u => extensionKey.equals(ExtensionKey.create(u))));
		} else {
			toUninstall.push(...userExtensions.filter(u => areSameExtensions(u.identifier, this.extension.identifier)));
		}

		if (!toUninstall.length) {
			throw new Error(nls.localize('notInstalled', "Extension '{0}' is not installed.", this.extension.manifest.displayName || this.extension.manifest.name));
		}
		await this.extensionsScanner.setUninstalled(...toUninstall);

		if (this.options.remove) {
			for (const extension of toUninstall) {
				try {
					if (!token.isCancellationRequested) {
						await this.extensionsScanner.removeUninstalledExtension(extension);
					}
				} catch (e) {
					throw new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e)));
				}
			}
		}
	}

}
