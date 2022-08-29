/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, Queue } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { getErrorMessage } from 'vs/base/common/errors';
import { Disposable } from 'vs/base/common/lifecycle';
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
import { AbstractExtensionManagementService, AbstractExtensionTask, IInstallExtensionTask, IUninstallExtensionTask, joinErrors } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import {
	ExtensionManagementError, ExtensionManagementErrorCode, IExtensionGalleryService, IExtensionIdentifier, IGalleryExtension, IGalleryMetadata, ILocalExtension, InstallOperation,
	IServerExtensionManagementService,
	Metadata, ServerInstallOptions, ServerInstallVSIXOptions, ServerUninstallOptions
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId, groupByExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService, IScannedExtension, ScanOptions } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { ExtensionsWatcher } from 'vs/platform/extensionManagement/node/extensionsWatcher';
import { ExtensionType, IExtensionManifest, isApplicationScopedExtension, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { isEngineValid } from 'vs/platform/extensions/common/extensionValidator';
import { IFileService } from 'vs/platform/files/common/files';
import { IInstantiationService, refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

interface InstallableExtension {
	zipPath: string;
	key: ExtensionKey;
	metadata?: Metadata;
}

export const INativeServerExtensionManagementService = refineServiceDecorator<IServerExtensionManagementService, INativeServerExtensionManagementService>(IServerExtensionManagementService);
export interface INativeServerExtensionManagementService extends IServerExtensionManagementService {
	readonly _serviceBrand: undefined;
	removeUninstalledExtensions(removeOutdated: boolean): Promise<void>;
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
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
	) {
		super(galleryService, telemetryService, logService, productService, userDataProfilesService);
		const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
		this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, extension => extensionLifecycle.postUninstall(extension)));
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
		return this.extensionsScanner.scanUserExtensions(false);
	}

	async install(vsix: URI, options: ServerInstallVSIXOptions = {}): Promise<ILocalExtension> {
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

	removeUninstalledExtensions(removeOutdated: boolean): Promise<void> {
		return this.extensionsScanner.cleanUp(removeOutdated);
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

	protected doCreateInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: ServerInstallOptions & ServerInstallVSIXOptions): IInstallExtensionTask {
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
		if (options.profileLocation) {
			return new InstallExtensionInProfileTask(installExtensionTask, options.profileLocation, this.extensionsProfileScannerService);
		}
		return installExtensionTask;
	}

	protected doCreateUninstallExtensionTask(extension: ILocalExtension, options: ServerUninstallOptions): IUninstallExtensionTask {
		if (options.profileLocation) {
			return new UninstallExtensionFromProfileTask(extension, options.profileLocation, this.extensionsProfileScannerService);
		}
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

class ExtensionsScanner extends Disposable {

	private readonly uninstalledPath: string;
	private readonly uninstalledFileLimiter: Queue<any>;

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

	async cleanUp(removeOutdated: boolean): Promise<void> {
		await this.removeUninstalledExtensions();
		if (removeOutdated) {
			await this.removeOutdatedExtensions();
		}
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

	async scanUserExtensions(excludeOutdated: boolean): Promise<ILocalExtension[]> {
		const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: !excludeOutdated, includeInvalid: true });
		return Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
	}

	async extractUserExtension(extensionKey: ExtensionKey, zipPath: string, metadata: Metadata | undefined, token: CancellationToken): Promise<ILocalExtension> {
		const folderName = extensionKey.toString();
		const tempPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`);
		const extensionPath = path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName);

		try {
			await pfs.Promises.rm(extensionPath);
		} catch (error) {
			throw new ExtensionManagementError(nls.localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, extensionKey.id), ExtensionManagementErrorCode.Delete);
		}

		await this.extractAtLocation(extensionKey, zipPath, tempPath, token);
		metadata = { ...metadata, installedTimestamp: Date.now() };
		await this.extensionsScannerService.updateMetadata(URI.file(tempPath), metadata);

		try {
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

	async setUninstalled(...extensions: ILocalExtension[]): Promise<void> {
		const extensionKeys: ExtensionKey[] = extensions.map(e => ExtensionKey.create(e));
		await this.withUninstalledExtensions(uninstalled => {
			extensionKeys.forEach(extensionKey => uninstalled[extensionKey.toString()] = true);
		});
	}

	async setInstalled(extensionKey: ExtensionKey): Promise<ILocalExtension | null> {
		await this.withUninstalledExtensions(uninstalled => delete uninstalled[extensionKey.toString()]);
		const userExtensions = await this.scanUserExtensions(true);
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
		const toRemove = extensions.filter(e => uninstalled[ExtensionKey.create(e).toString()]);
		await Promises.settled(toRemove.map(e => this.removeUninstalledExtension(e)));
	}

	private async removeOutdatedExtensions(): Promise<void> {
		const systemExtensions = await this.extensionsScannerService.scanSystemExtensions({}); // System extensions
		const extensions = await this.extensionsScannerService.scanUserExtensions({ includeAllVersions: true, includeUninstalled: true, includeInvalid: true }); // All user extensions
		const toRemove: IScannedExtension[] = [];

		// Outdated extensions
		const targetPlatform = await this.extensionsScannerService.getTargetPlatform();
		const byExtension = groupByExtension(extensions, e => e.identifier);
		for (const extensions of byExtension) {
			if (extensions.length > 1) {
				toRemove.push(...extensions.sort((a, b) => {
					const vcompare = semver.rcompare(a.manifest.version, b.manifest.version);
					if (vcompare !== 0) {
						return vcompare;
					}
					if (a.targetPlatform === targetPlatform) {
						return -1;
					}
					return 1;
				}).slice(1));
			}
			if (extensions[0].type === ExtensionType.System) {
				const systemExtension = systemExtensions.find(e => areSameExtensions(e.identifier, extensions[0].identifier));
				if (!systemExtension || semver.gte(systemExtension.manifest.version, extensions[0].manifest.version)) {
					toRemove.push(extensions[0]);
				}
			}
		}
		await Promises.settled(toRemove.map(extension => this.removeExtension(extension, 'outdated')));
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

	protected _operation = InstallOperation.Install;
	get operation() { return isUndefined(this.options.operation) ? this._operation : this.options.operation; }

	constructor(
		readonly identifier: IExtensionIdentifier,
		readonly source: URI | IGalleryExtension,
		protected readonly options: ServerInstallOptions,
		protected readonly extensionsScanner: ExtensionsScanner,
		protected readonly logService: ILogService,
	) {
		super();
	}

	protected async installExtension(installableExtension: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		try {
			const local = await this.unsetUninstalledAndGetLocal(installableExtension.key);
			if (local) {
				return installableExtension.metadata ? this.extensionsScanner.updateMetadata(local, installableExtension.metadata) : local;
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

class InstallGalleryExtensionTask extends InstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly gallery: IGalleryExtension,
		options: ServerInstallOptions,
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
			preRelease: this.gallery.properties.isPreReleaseVersion ||
				(isBoolean(this.options.installPreReleaseVersion)
					? this.options.installPreReleaseVersion /* Respect the passed flag */
					: existingExtension?.preRelease /* Respect the existing pre-release flag if it was set */)
		};

		if (existingExtension?.manifest.version === this.gallery.version) {
			const local = await this.extensionsScanner.updateMetadata(existingExtension, metadata);
			return { local, metadata };
		}

		const zipPath = await this.downloadExtension(this.gallery, this._operation);
		try {
			const local = await this.installExtension({ zipPath, key: ExtensionKey.create(this.gallery), metadata }, token);
			if (existingExtension && !this.options.profileLocation && (existingExtension.targetPlatform !== local.targetPlatform || semver.neq(existingExtension.manifest.version, local.manifest.version))) {
				await this.extensionsScanner.setUninstalled(existingExtension);
			}
			return { local, metadata };
		} catch (error) {
			await this.deleteDownloadedVSIX(zipPath);
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

	private async downloadExtension(extension: IGalleryExtension, operation: InstallOperation): Promise<string> {
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
			return zipPath;
		} catch (error) {
			await this.deleteDownloadedVSIX(zipPath);
			throw new ExtensionManagementError(joinErrors(error).message, ExtensionManagementErrorCode.Invalid);
		}
	}
}

class InstallVSIXTask extends InstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly location: URI,
		options: ServerInstallOptions,
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

	private readonly promise: Promise<{ local: ILocalExtension; metadata: Metadata }>;

	constructor(
		private readonly task: IInstallExtensionTask,
		private readonly profileLocation: URI,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
	) {
		this.promise = this.waitAndAddExtensionToProfile();
	}

	private async waitAndAddExtensionToProfile(): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		const result = await this.task.waitUntilTaskIsFinished();
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

class UninstallExtensionTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly options: ServerUninstallOptions,
		private readonly extensionsScanner: ExtensionsScanner,
	) {
		super();
	}

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

class UninstallExtensionFromProfileTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly profileLocation: URI,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
	) {
		super();
	}

	protected async doRun(token: CancellationToken): Promise<void> {
		await this.extensionsProfileScannerService.removeExtensionFromProfile(this.extension.identifier, this.profileLocation);
	}

}

