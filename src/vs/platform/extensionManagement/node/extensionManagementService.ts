/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, Queue } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { getErrorMessage } from 'vs/base/common/errors';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { ResourceSet } from 'vs/base/common/map';
import { Schemas } from 'vs/base/common/network';
import * as path from 'vs/base/common/path';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { joinPath } from 'vs/base/common/resources';
import * as semver from 'vs/base/common/semver/semver';
import { isBoolean, isUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { generateUuid } from 'vs/base/common/uuid';
import * as pfs from 'vs/base/node/pfs';
import { extract, ExtractError, IFile, zip } from 'vs/base/node/zip';
import * as nls from 'vs/nls';
import { IDownloadService } from 'vs/platform/download/common/download';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { AbstractExtensionManagementService, AbstractExtensionTask, ExtensionVerificationStatus, IInstallExtensionTask, InstallExtensionTaskOptions, IUninstallExtensionTask, joinErrors, UninstallExtensionTaskOptions } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import {
	ExtensionManagementError, ExtensionManagementErrorCode, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, IGalleryExtension, IGalleryMetadata, ILocalExtension, InstallOperation,
	Metadata, InstallOptions, InstallVSIXOptions
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService, IScannedExtension, ScanOptions } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { DidChangeProfileExtensionsEvent, ExtensionsWatcher } from 'vs/platform/extensionManagement/node/extensionsWatcher';
import { ExtensionType, IExtension, IExtensionManifest, isApplicationScopedExtension, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { isEngineValid } from 'vs/platform/extensions/common/extensionValidator';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

interface InstallableExtension {
	zipPath: string;
	key: ExtensionKey;
	metadata: Metadata;
}

export const INativeServerExtensionManagementService = refineServiceDecorator<IExtensionManagementService, INativeServerExtensionManagementService>(IExtensionManagementService);
export interface INativeServerExtensionManagementService extends IExtensionManagementService {
	readonly _serviceBrand: undefined;
	markAsUninstalled(...extensions: IExtension[]): Promise<void>;
	removeUninstalledExtensions(): Promise<void>;
	getAllUserInstalled(): Promise<ILocalExtension[]>;
}

export class ExtensionManagementService extends AbstractExtensionManagementService implements INativeServerExtensionManagementService {

	private readonly extensionsScanner: ExtensionsScanner;
	private readonly manifestCache: ExtensionsManifestCache;
	private readonly extensionsDownloader: ExtensionsDownloader;

	private readonly installGalleryExtensionsTasks = new Map<string, InstallGalleryExtensionTask>();

	constructor(
		@IExtensionGalleryService galleryService: IExtensionGalleryService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IDownloadService private downloadService: IDownloadService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private readonly fileService: IFileService,
		@IProductService productService: IProductService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService
	) {
		super(galleryService, telemetryService, logService, productService, userDataProfilesService);
		const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
		this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, extension => extensionLifecycle.postUninstall(extension)));
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));

		const extensionsWatcher = this._register(new ExtensionsWatcher(this, this.extensionsScannerService, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, logService));
		this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource(e => this.onDidChangeExtensionsFromAnotherSource(e)));
		this.watchForExtensionsNotInstalledBySystem();
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
		const location = await zip(joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid()).fsPath, files);
		return URI.file(location);
	}

	async unzip(zipLocation: URI): Promise<IExtensionIdentifier> {
		this.logService.trace('ExtensionManagementService#unzip', zipLocation.toString());
		const local = await this.install(zipLocation);
		return local.identifier;
	}

	async getManifest(vsix: URI): Promise<IExtensionManifest> {
		const { location, cleanup } = await this.downloadVsix(vsix);
		const zipPath = path.resolve(location.fsPath);
		try {
			return await getManifest(zipPath);
		} finally {
			await cleanup();
		}
	}

	getInstalled(type?: ExtensionType, profileLocation?: URI): Promise<ILocalExtension[]> {
		return this.extensionsScanner.scanExtensions(type ?? null, profileLocation);
	}

	getAllUserInstalled(): Promise<ILocalExtension[]> {
		return this.extensionsScanner.scanAllUserExtensions(false);
	}

	async install(vsix: URI, options: InstallVSIXOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', vsix.toString());

		const { location, cleanup } = await this.downloadVsix(vsix);

		try {
			const manifest = await getManifest(path.resolve(location.fsPath));
			if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, this.productService.version, this.productService.date)) {
				throw new Error(nls.localize('incompatible', "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", getGalleryExtensionId(manifest.publisher, manifest.name), this.productService.version));
			}

			return await this.installExtension(manifest, location, options);
		} finally {
			await cleanup();
		}
	}

	async installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#installFromLocation', location.toString());
		const local = await this.extensionsScanner.scanUserExtensionAtLocation(location);
		if (!local) {
			throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
		}
		await this.addExtensionsToProfile([local], profileLocation);
		this.logService.info('Successfully installed extension', local.identifier.id, profileLocation.toString());
		return local;
	}

	getMetadata(extension: ILocalExtension): Promise<Metadata | undefined> {
		return this.extensionsScannerService.scanMetadata(extension.location);
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateMetadata', local.identifier.id);
		const localMetadata: Metadata = { ...metadata };
		if (metadata.isPreReleaseVersion) {
			localMetadata.preRelease = true;
		}
		local = await this.extensionsScanner.updateMetadata(local, localMetadata);
		this.manifestCache.invalidate();
		return local;
	}

	async updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateExtensionScope', local.identifier.id);
		local = await this.extensionsScanner.updateMetadata(local, { isMachineScoped });
		this.manifestCache.invalidate();
		return local;
	}

	async reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#reinstallFromGallery', extension.identifier.id);
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		const targetPlatform = await this.getTargetPlatform();
		const [galleryExtension] = await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: extension.preRelease }], { targetPlatform, compatible: true }, CancellationToken.None);
		if (!galleryExtension) {
			throw new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled"));
		}

		await this.extensionsScanner.setUninstalled(extension);
		try {
			await this.extensionsScanner.removeUninstalledExtension(extension);
		} catch (e) {
			throw new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e)));
		}
		return this.installFromGallery(galleryExtension);
	}

	markAsUninstalled(...extensions: IExtension[]): Promise<void> {
		return this.extensionsScanner.setUninstalled(...extensions);
	}

	removeUninstalledExtensions(): Promise<void> {
		return this.extensionsScanner.cleanUp();
	}

	async download(extension: IGalleryExtension, operation: InstallOperation): Promise<URI> {
		const { location } = await this.extensionsDownloader.download(extension, operation);
		return location;
	}

	private async downloadVsix(vsix: URI): Promise<{ location: URI; cleanup: () => Promise<void> }> {
		if (vsix.scheme === Schemas.file) {
			return { location: vsix, async cleanup() { } };
		}
		this.logService.trace('Downloading extension from', vsix.toString());
		const location = joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid());
		await this.downloadService.download(vsix, location);
		this.logService.info('Downloaded extension to', location.toString());
		const cleanup = async () => {
			try {
				await this.fileService.del(location);
			} catch (error) {
				this.logService.error(error);
			}
		};
		return { location, cleanup };
	}

	protected getCurrentExtensionsManifestLocation(): URI {
		return this.userDataProfilesService.defaultProfile.extensionsResource;
	}

	protected createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallExtensionTaskOptions): IInstallExtensionTask {
		let installExtensionTask: IInstallExtensionTask | undefined;
		if (URI.isUri(extension)) {
			installExtensionTask = new InstallVSIXTask(manifest, extension, options, this.galleryService, this.extensionsScanner, this.logService);
		} else {
			const key = ExtensionKey.create(extension).toString();
			installExtensionTask = this.installGalleryExtensionsTasks.get(key);
			if (!installExtensionTask) {
				this.installGalleryExtensionsTasks.set(key, installExtensionTask = new InstallGalleryExtensionTask(manifest, extension, options, this.extensionsDownloader, this.extensionsScanner, this.logService));
				installExtensionTask.waitUntilTaskIsFinished().then(() => this.installGalleryExtensionsTasks.delete(key));
			}
		}
		return new InstallExtensionInProfileTask(installExtensionTask, options.profileLocation, this.uriIdentityService, this.userDataProfilesService, this.extensionsScannerService, this.extensionsProfileScannerService);
	}

	protected createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask {
		return new UninstallExtensionFromProfileTask(extension, options.profileLocation, this.extensionsProfileScannerService);
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

	private async onDidChangeExtensionsFromAnotherSource({ added, removed }: DidChangeProfileExtensionsEvent): Promise<void> {
		if (removed) {
			for (const identifier of removed.extensions) {
				this.logService.info('Extensions removed from another source', identifier.id, removed.profileLocation.toString());
				this._onDidUninstallExtension.fire({ identifier, profileLocation: removed.profileLocation });
			}
		}
		if (added) {
			const extensions = await this.extensionsScanner.scanExtensions(ExtensionType.User, added.profileLocation);
			const addedExtensions = extensions.filter(e => added.extensions.some(identifier => areSameExtensions(identifier, e.identifier)));
			this._onDidInstallExtensions.fire(addedExtensions.map(local => {
				this.logService.info('Extensions added from another source', local.identifier.id, added.profileLocation.toString());
				return { identifier: local.identifier, local, profileLocation: added.profileLocation, operation: InstallOperation.None };
			}));
		}
	}

	private readonly knownDirectories = new ResourceSet();
	private async watchForExtensionsNotInstalledBySystem(): Promise<void> {
		this._register(this.extensionsScanner.onExtract(resource => this.knownDirectories.add(resource)));
		const stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
		for (const childStat of stat.children ?? []) {
			if (childStat.isDirectory) {
				this.knownDirectories.add(childStat.resource);
			}
		}
		this._register(this.fileService.watch(this.extensionsScannerService.userExtensionsLocation));
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
	}

	private async onDidFilesChange(e: FileChangesEvent): Promise<void> {
		if (!e.affects(this.extensionsScannerService.userExtensionsLocation, FileChangeType.ADDED)) {
			return;
		}

		const added: ILocalExtension[] = [];
		for (const resource of e.rawAdded) {
			// Check if this is a known directory
			if (this.knownDirectories.has(resource)) {
				continue;
			}

			// Is not immediate child of extensions resource
			if (!this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(resource), this.extensionsScannerService.userExtensionsLocation)) {
				continue;
			}

			// .obsolete file changed
			if (this.uriIdentityService.extUri.isEqual(resource, this.uriIdentityService.extUri.joinPath(this.extensionsScannerService.userExtensionsLocation, '.obsolete'))) {
				continue;
			}

			// Ignore changes to files starting with `.`
			if (this.uriIdentityService.extUri.basename(resource).startsWith('.')) {
				continue;
			}

			// Check if this is a directory
			if (!(await this.fileService.stat(resource)).isDirectory) {
				continue;
			}

			// Check if this is an extension added by another source
			// Extension added by another source will not have installed timestamp
			const extension = await this.extensionsScanner.scanUserExtensionAtLocation(resource);
			if (extension && extension.installedTimestamp === undefined) {
				this.knownDirectories.add(resource);
				added.push(extension);
			}
		}

		if (added.length) {
			await this.addExtensionsToProfile(added, this.userDataProfilesService.defaultProfile.extensionsResource);
			this.logService.info('Added extensions to default profile from external source', added.map(e => e.identifier.id));
		}
	}

	private async addExtensionsToProfile(extensions: ILocalExtension[], profileLocation: URI): Promise<void> {
		await this.extensionsProfileScannerService.addExtensionsToProfile(extensions.map(local => ([local, undefined])), profileLocation);
		this._onDidInstallExtensions.fire(extensions.map(local => ({ local, identifier: local.identifier, operation: InstallOperation.None, profileLocation })));
	}

}

export class ExtensionsScanner extends Disposable {

	private readonly uninstalledPath: string;
	private readonly uninstalledFileLimiter: Queue<any>;

	private readonly _onExtract = this._register(new Emitter<URI>());
	readonly onExtract = this._onExtract.event;

	constructor(
		private readonly beforeRemovingExtension: (e: ILocalExtension) => Promise<void>,
		@IFileService private readonly fileService: IFileService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.uninstalledPath = joinPath(this.extensionsScannerService.userExtensionsLocation, '.obsolete').fsPath;
		this.uninstalledFileLimiter = new Queue();
	}

	async cleanUp(): Promise<void> {
		await this.removeUninstalledExtensions();
	}

	async scanExtensions(type: ExtensionType | null, profileLocation: URI | undefined): Promise<ILocalExtension[]> {
		const userScanOptions: ScanOptions = { includeInvalid: true, profileLocation };
		let scannedExtensions: IScannedExtension[] = [];
		if (type === null || type === ExtensionType.System) {
			scannedExtensions.push(...await this.extensionsScannerService.scanAllExtensions({ includeInvalid: true }, userScanOptions, false));
		} else if (type === ExtensionType.User) {
			scannedExtensions.push(...await this.extensionsScannerService.scanUserExtensions(userScanOptions));
		}
		scannedExtensions = type !== null ? scannedExtensions.filter(r => r.type === type) : scannedExtensions;
		return Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
	}

	async scanAllUserExtensions(excludeOutdated: boolean): Promise<ILocalExtension[]> {
		const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: !excludeOutdated, includeInvalid: true });
		return Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
	}

	async scanUserExtensionAtLocation(location: URI): Promise<ILocalExtension | null> {
		try {
			const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
			if (scannedExtension) {
				return await this.toLocalExtension(scannedExtension);
			}
		} catch (error) {
			this.logService.error(error);
		}
		return null;
	}

	async extractUserExtension(extensionKey: ExtensionKey, zipPath: string, metadata: Metadata, token: CancellationToken): Promise<ILocalExtension> {
		const folderName = extensionKey.toString();
		const tempPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`);
		const extensionPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName);

		try {
			await pfs.Promises.rm(extensionPath);
		} catch (error) {
			throw new ExtensionManagementError(nls.localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
		}

		await this.extractAtLocation(extensionKey, zipPath, tempPath, token);
		await this.extensionsScannerService.updateMetadata(URI.file(tempPath), metadata);

		try {
			this._onExtract.fire(URI.file(extensionPath));
			await this.rename(extensionKey, tempPath, extensionPath, Date.now() + (2 * 60 * 1000) /* Retry for 2 minutes */);
			this.logService.info('Renamed to', extensionPath);
		} catch (error) {
			try {
				await pfs.Promises.rm(tempPath);
			} catch (e) { /* ignore */ }
			if (error.code === 'ENOTEMPTY') {
				this.logService.info(`Rename failed because extension was installed by another source. So ignoring renaming.`, extensionKey.id);
			} else {
				this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted from extracted location`, tempPath);
				throw error;
			}
		}

		return this.scanLocalExtension(URI.file(extensionPath), ExtensionType.User);
	}

	async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> {
		await this.extensionsScannerService.updateMetadata(local.location, metadata);
		return this.scanLocalExtension(local.location, local.type);
	}

	getUninstalledExtensions(): Promise<IStringDictionary<boolean>> {
		return this.withUninstalledExtensions();
	}

	async setUninstalled(...extensions: IExtension[]): Promise<void> {
		const extensionKeys: ExtensionKey[] = extensions.map(e => ExtensionKey.create(e));
		await this.withUninstalledExtensions(uninstalled =>
			extensionKeys.forEach(extensionKey => {
				uninstalled[extensionKey.toString()] = true;
				this.logService.info('Marked extension as uninstalled', extensionKey.toString());
			}));
	}

	async setInstalled(extensionKey: ExtensionKey): Promise<ILocalExtension | null> {
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[extensionKey.toString()]);
		const userExtensions = await this.scanAllUserExtensions(true);
		const localExtension = userExtensions.find(i => ExtensionKey.create(i).equals(extensionKey)) || null;
		if (!localExtension) {
			return null;
		}
		return this.updateMetadata(localExtension, { installedTimestamp: Date.now() });
	}

	async removeExtension(extension: ILocalExtension | IScannedExtension, type: string): Promise<void> {
		this.logService.trace(`Deleting ${type} extension from disk`, extension.identifier.id, extension.location.fsPath);
		await pfs.Promises.rm(extension.location.fsPath);
		this.logService.info('Deleted from disk', extension.identifier.id, extension.location.fsPath);
	}

	async removeUninstalledExtension(extension: ILocalExtension | IScannedExtension): Promise<void> {
		await this.removeExtension(extension, 'uninstalled');
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[ExtensionKey.create(extension).toString()]);
	}

	private async withUninstalledExtensions(updateFn?: (uninstalled: IStringDictionary<boolean>) => void): Promise<IStringDictionary<boolean>> {
		return this.uninstalledFileLimiter.queue(async () => {
			let raw: string | undefined;
			try {
				raw = await pfs.Promises.readFile(this.uninstalledPath, 'utf8');
			} catch (err) {
				if (err.code !== 'ENOENT') {
					throw err;
				}
			}

			let uninstalled = {};
			if (raw) {
				try {
					uninstalled = JSON.parse(raw);
				} catch (e) { /* ignore */ }
			}

			if (updateFn) {
				updateFn(uninstalled);
				if (Object.keys(uninstalled).length) {
					await pfs.Promises.writeFile(this.uninstalledPath, JSON.stringify(uninstalled));
				} else {
					await pfs.Promises.rm(this.uninstalledPath);
				}
			}

			return uninstalled;
		});
	}

	private async extractAtLocation(identifier: IExtensionIdentifier, zipPath: string, location: string, token: CancellationToken): Promise<void> {
		this.logService.trace(`Started extracting the extension from ${zipPath} to ${location}`);

		// Clean the location
		try {
			await pfs.Promises.rm(location);
		} catch (e) {
			throw new ExtensionManagementError(this.joinErrors(e).message, ExtensionManagementErrorCode.Delete);
		}

		try {
			await extract(zipPath, location, { sourcePath: 'extension', overwrite: true }, token);
			this.logService.info(`Extracted extension to ${location}:`, identifier.id);
		} catch (e) {
			try { await pfs.Promises.rm(location); } catch (e) { /* Ignore */ }
			let errorCode = ExtensionManagementErrorCode.Extract;
			if (e instanceof ExtractError) {
				if (e.type === 'CorruptZip') {
					errorCode = ExtensionManagementErrorCode.CorruptZip;
				} else if (e.type === 'Incomplete') {
					errorCode = ExtensionManagementErrorCode.IncompleteZip;
				}
			}
			throw new ExtensionManagementError(e.message, errorCode);
		}
	}

	private async rename(identifier: IExtensionIdentifier, extractPath: string, renamePath: string, retryUntil: number): Promise<void> {
		try {
			await pfs.Promises.rename(extractPath, renamePath);
		} catch (error) {
			if (isWindows && error && error.code === 'EPERM' && Date.now() < retryUntil) {
				this.logService.info(`Failed renaming ${extractPath} to ${renamePath} with 'EPERM' error. Trying again...`, identifier.id);
				return this.rename(identifier, extractPath, renamePath, retryUntil);
			}
			throw new ExtensionManagementError(error.message || nls.localize('renameError', "Unknown error while renaming {0} to {1}", extractPath, renamePath), error.code || ExtensionManagementErrorCode.Rename);
		}
	}

	private async scanLocalExtension(location: URI, type: ExtensionType): Promise<ILocalExtension> {
		const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, type, { includeInvalid: true });
		if (scannedExtension) {
			return this.toLocalExtension(scannedExtension);
		}
		throw new Error(nls.localize('cannot read', "Cannot read the extension from {0}", location.path));
	}

	private async toLocalExtension(extension: IScannedExtension): Promise<ILocalExtension> {
		const stat = await this.fileService.resolve(extension.location);
		let readmeUrl: URI | undefined;
		let changelogUrl: URI | undefined;
		if (stat.children) {
			readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
			changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
		}
		return {
			identifier: extension.identifier,
			type: extension.type,
			isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
			location: extension.location,
			manifest: extension.manifest,
			targetPlatform: extension.targetPlatform,
			validations: extension.validations,
			isValid: extension.isValid,
			readmeUrl,
			changelogUrl,
			publisherDisplayName: extension.metadata?.publisherDisplayName || null,
			publisherId: extension.metadata?.publisherId || null,
			isApplicationScoped: !!extension.metadata?.isApplicationScoped,
			isMachineScoped: !!extension.metadata?.isMachineScoped,
			isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
			preRelease: !!extension.metadata?.preRelease,
			installedTimestamp: extension.metadata?.installedTimestamp,
			updated: !!extension.metadata?.updated,
		};
	}

	private async removeUninstalledExtensions(): Promise<void> {
		const uninstalled = await this.getUninstalledExtensions();
		const extensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: true, includeUninstalled: true, includeInvalid: true }); // All user extensions
		const installed: Set<string> = new Set<string>();
		for (const e of extensions) {
			if (!uninstalled[ExtensionKey.create(e).toString()]) {
				installed.add(e.identifier.id.toLowerCase());
			}
		}
		const byExtension = groupByExtension(extensions, e => e.identifier);
		await Promises.settled(byExtension.map(async e => {
			const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
			if (!installed.has(latest.identifier.id.toLowerCase())) {
				await this.beforeRemovingExtension(await this.toLocalExtension(latest));
			}
		}));
		const toRemove = extensions.filter(e => e.metadata /* Installed by VS Code */ && uninstalled[ExtensionKey.create(e).toString()]);
		await Promises.settled(toRemove.map(e => this.removeUninstalledExtension(e)));
	}

	private joinErrors(errorOrErrors: (Error | string) | (Array<Error | string>)): Error {
		const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
		if (errors.length === 1) {
			return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
		}
		return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
			return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
		}, new Error(''));
	}

}

abstract class InstallExtensionTask extends AbstractExtensionTask<{ local: ILocalExtension; metadata: Metadata }> implements IInstallExtensionTask {

	protected _verificationStatus = ExtensionVerificationStatus.Unverified;
	get verificationStatus() { return this._verificationStatus; }

	protected _operation = InstallOperation.Install;
	get operation() { return isUndefined(this.options.operation) ? this._operation : this.options.operation; }

	constructor(
		readonly identifier: IExtensionIdentifier,
		readonly source: URI | IGalleryExtension,
		protected readonly options: InstallOptions,
		protected readonly extensionsScanner: ExtensionsScanner,
		protected readonly logService: ILogService,
	) {
		super();
	}

	protected async installExtension(installableExtension: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		try {
			const local = await this.unsetUninstalledAndGetLocal(installableExtension.key);
			if (local) {
				return this.extensionsScanner.updateMetadata(local, installableExtension.metadata);
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
		const local = await this.extensionsScanner.extractUserExtension(key, zipPath, metadata, token);
		this.logService.info('Extracting completed.', key.id);
		return local;
	}

}

export class InstallGalleryExtensionTask extends InstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly gallery: IGalleryExtension,
		options: InstallOptions,
		private readonly extensionsDownloader: ExtensionsDownloader,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService,
	) {
		super(gallery.identifier, gallery, options, extensionsScanner, logService);
	}

	protected async doRun(token: CancellationToken): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		const installed = await this.extensionsScanner.scanExtensions(null, undefined);
		const existingExtension = installed.find(i => areSameExtensions(i.identifier, this.gallery.identifier));

		if (existingExtension) {
			this._operation = InstallOperation.Update;
		}

		const metadata: Metadata = {
			id: this.gallery.identifier.uuid,
			publisherId: this.gallery.publisherId,
			publisherDisplayName: this.gallery.publisherDisplayName,
			targetPlatform: this.gallery.properties.targetPlatform,
			isApplicationScoped: isApplicationScopedExtension(this.manifest),
			isMachineScoped: this.options.isMachineScoped || existingExtension?.isMachineScoped,
			isBuiltin: this.options.isBuiltin || existingExtension?.isBuiltin,
			isSystem: existingExtension?.type === ExtensionType.System ? true : undefined,
			updated: !!existingExtension,
			isPreReleaseVersion: this.gallery.properties.isPreReleaseVersion,
			installedTimestamp: Date.now(),
			preRelease: this.gallery.properties.isPreReleaseVersion ||
				(isBoolean(this.options.installPreReleaseVersion)
					? this.options.installPreReleaseVersion /* Respect the passed flag */
					: existingExtension?.preRelease /* Respect the existing pre-release flag if it was set */)
		};

		if (existingExtension?.manifest.version === this.gallery.version) {
			const local = await this.extensionsScanner.updateMetadata(existingExtension, metadata);
			return { local, metadata };
		}

		const { location, verificationStatus } = await this.extensionsDownloader.download(this.gallery, this._operation);
		try {
			this._verificationStatus = verificationStatus;
			this.validateManifest(location.fsPath);
			const local = await this.installExtension({ zipPath: location.fsPath, key: ExtensionKey.create(this.gallery), metadata }, token);
			return { local, metadata };
		} catch (error) {
			try {
				await this.extensionsDownloader.delete(location);
			} catch (error) {
				/* Ignore */
				this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(error));
			}
			throw error;
		}
	}

	protected async validateManifest(zipPath: string): Promise<void> {
		try {
			await getManifest(zipPath);
		} catch (error) {
			throw new ExtensionManagementError(joinErrors(error).message, ExtensionManagementErrorCode.Invalid);
		}
	}

}

class InstallVSIXTask extends InstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly location: URI,
		options: InstallOptions,
		private readonly galleryService: IExtensionGalleryService,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService,
	) {
		super({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, location, options, extensionsScanner, logService);
	}

	protected async doRun(token: CancellationToken): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		const extensionKey = new ExtensionKey(this.identifier, this.manifest.version);
		const installedExtensions = await this.extensionsScanner.scanExtensions(ExtensionType.User, undefined);
		const existing = installedExtensions.find(i => areSameExtensions(this.identifier, i.identifier));
		const metadata = await this.getMetadata(this.identifier.id, this.manifest.version, token);
		metadata.isApplicationScoped = isApplicationScopedExtension(this.manifest);
		metadata.isMachineScoped = this.options.isMachineScoped || existing?.isMachineScoped;
		metadata.isBuiltin = this.options.isBuiltin || existing?.isBuiltin;
		metadata.installedTimestamp = Date.now();

		if (existing) {
			this._operation = InstallOperation.Update;
			if (extensionKey.equals(new ExtensionKey(existing.identifier, existing.manifest.version))) {
				try {
					await this.extensionsScanner.removeExtension(existing, 'existing');
				} catch (e) {
					throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
				}
			} else if (!this.options.profileLocation && semver.gt(existing.manifest.version, this.manifest.version)) {
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

		const local = await this.installExtension({ zipPath: path.resolve(this.location.fsPath), key: extensionKey, metadata }, token);
		return { local, metadata };
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

class InstallExtensionInProfileTask implements IInstallExtensionTask {

	readonly identifier = this.task.identifier;
	readonly source = this.task.source;
	readonly operation = this.task.operation;

	get verificationStatus() {
		return this.task.verificationStatus;
	}

	private readonly promise: Promise<{ local: ILocalExtension; metadata: Metadata }>;

	constructor(
		private readonly task: IInstallExtensionTask,
		private readonly profileLocation: URI,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly extensionsScannerService: IExtensionsScannerService,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
	) {
		this.promise = this.waitAndAddExtensionToProfile();
	}

	private async waitAndAddExtensionToProfile(): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		const result = await this.task.waitUntilTaskIsFinished();
		if (this.uriIdentityService.extUri.isEqual(this.userDataProfilesService.defaultProfile.extensionsResource, this.profileLocation)) {
			await this.extensionsScannerService.initializeDefaultProfileExtensions();
		}
		await this.extensionsProfileScannerService.addExtensionsToProfile([[result.local, result.metadata]], this.profileLocation);
		return result;
	}

	async run(): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		await this.task.run();
		return this.promise;
	}

	waitUntilTaskIsFinished(): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		return this.promise;
	}

	cancel(): void {
		return this.task.cancel();
	}
}

class UninstallExtensionFromProfileTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly profileLocation: URI,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
	) {
		super();
	}

	protected async doRun(token: CancellationToken): Promise<void> {
		await this.extensionsProfileScannerService.removeExtensionFromProfile(this.extension, this.profileLocation);
	}

}

