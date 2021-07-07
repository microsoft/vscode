/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'vs/base/common/path';
import * as pfs from 'vs/base/node/pfs';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { zip, IFile } from 'vs/base/node/zip';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent,
	StatisticType,
	IExtensionIdentifier,
	IReportedExtension,
	InstallOperation,
	INSTALL_ERROR_MALICIOUS,
	INSTALL_ERROR_INCOMPATIBLE,
	ExtensionManagementError,
	InstallOptions,
	UninstallOptions,
	InstallVSIXOptions
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getGalleryExtensionId, getMaliciousExtensionsSet, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, ExtensionIdentifierWithVersion } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { createCancelablePromise, CancelablePromise, Promises, Barrier } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import * as semver from 'vs/base/common/semver/semver';
import { URI } from 'vs/base/common/uri';
import product from 'vs/platform/product/common/product';
import { isMacintosh } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isEngineValid } from 'vs/platform/extensions/common/extensionValidator';
import { joinPath } from 'vs/base/common/resources';
import { generateUuid } from 'vs/base/common/uuid';
import { IDownloadService } from 'vs/platform/download/common/download';
import { optional, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Schemas } from 'vs/base/common/network';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { IExtensionManifest, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { ExtensionsDownloader } from 'vs/platform/extensionManagement/node/extensionDownloader';
import { ExtensionsScanner, ILocalExtensionManifest, IMetadata } from 'vs/platform/extensionManagement/node/extensionsScanner';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { ExtensionsWatcher } from 'vs/platform/extensionManagement/node/extensionsWatcher';
import { IFileService } from 'vs/platform/files/common/files';
import { canceled } from 'vs/base/common/errors';

const INSTALL_ERROR_UNSET_UNINSTALLED = 'unsetUninstalled';
const INSTALL_ERROR_DOWNLOADING = 'downloading';
const INSTALL_ERROR_VALIDATING = 'validating';
const INSTALL_ERROR_LOCAL = 'local';
const ERROR_UNKNOWN = 'unknown';

interface InstallableExtension {
	zipPath: string;
	identifierWithVersion: ExtensionIdentifierWithVersion;
	metadata?: IMetadata;
}

interface InstallResult {
	readonly local: ILocalExtension,
	readonly operation: InstallOperation,
	readonly gallery?: IGalleryExtension
}

interface InstallExtensionTask {
	readonly extensionIdentifier: IExtensionIdentifier;
	run(): Promise<InstallResult>;
	waitUntilTaskIsFinished(): Promise<InstallResult>;
	cancel(): void;
}

export class ExtensionManagementService extends Disposable implements IExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly extensionsScanner: ExtensionsScanner;
	private reportedExtensions: Promise<IReportedExtension[]> | undefined;
	private lastReportTimestamp = 0;
	private readonly installingExtensions = new Map<string, InstallExtensionTask>();
	private readonly uninstallingExtensions: Map<string, CancelablePromise<void>> = new Map<string, CancelablePromise<void>>();
	private readonly manifestCache: ExtensionsManifestCache;
	private readonly extensionsDownloader: ExtensionsDownloader;

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionEvent>());
	readonly onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	private readonly _onDidInstallExtension = this._register(new Emitter<DidInstallExtensionEvent>());
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent> = this._onDidInstallExtension.event;

	private readonly _onUninstallExtension = this._register(new Emitter<IExtensionIdentifier>());
	readonly onUninstallExtension: Event<IExtensionIdentifier> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	constructor(
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@ILogService private readonly logService: ILogService,
		@optional(IDownloadService) private downloadService: IDownloadService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService fileService: IFileService,
	) {
		super();
		const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
		this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, extension => extensionLifecycle.postUninstall(extension)));
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));
		const extensionsWatcher = this._register(new ExtensionsWatcher(this, fileService, environmentService, logService));

		this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource(({ added, removed }) => {
			added.forEach(extension => this._onDidInstallExtension.fire({ identifier: extension.identifier, operation: InstallOperation.None, local: extension }));
			removed.forEach(extension => this._onDidUninstallExtension.fire({ identifier: extension }));
		}));

		this._register(toDisposable(() => {
			this.installingExtensions.forEach(task => task.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
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

	async install(vsix: URI, options: InstallVSIXOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', vsix.toString());

		const downloadLocation = await this.downloadVsix(vsix);
		const zipPath = path.resolve(downloadLocation.fsPath);
		const manifest = await getManifest(zipPath);
		if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, product.version, product.date)) {
			throw new Error(nls.localize('incompatible', "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", getGalleryExtensionId(manifest.publisher, manifest.name), product.version));
		}

		const installVSIXExtensionTask = this.createInstallVSIXExtensionTask(manifest, zipPath, options);
		const { local } = await this.installVSIXExtension(manifest, installVSIXExtensionTask, options);
		return local;
	}

	private async downloadVsix(vsix: URI): Promise<URI> {
		if (vsix.scheme === Schemas.file) {
			return vsix;
		}
		if (!this.downloadService) {
			throw new Error('Download service is not available');
		}

		const downloadedLocation = joinPath(this.environmentService.tmpDir, generateUuid());
		await this.downloadService.download(vsix, downloadedLocation);
		return downloadedLocation;
	}

	private createInstallVSIXExtensionTask(manifest: IExtensionManifest, zipPath: string, options: InstallVSIXOptions): InstallVSIXTask {
		const installExtensionTask = new InstallVSIXTask(manifest, zipPath, options, this.galleryService, this.extensionsScanner, this.logService);
		this.logService.info('Installing the extension:', installExtensionTask.extensionIdentifier.id);
		this._onInstallExtension.fire({ identifier: installExtensionTask.extensionIdentifier, zipPath });

		installExtensionTask.waitUntilTaskIsFinished()
			.then(({ local, operation }) => {
				this._onDidInstallExtension.fire({ identifier: installExtensionTask.extensionIdentifier, zipPath, local, operation });
				this.logService.info('Successfully installed the extension:', installExtensionTask.extensionIdentifier.id);
			}, error => {
				this._onDidInstallExtension.fire({ identifier: installExtensionTask.extensionIdentifier, zipPath, operation: InstallOperation.Install, error });
				this.logService.error('Failed to install the extension:', installExtensionTask.extensionIdentifier.id, error.message);
				throw error;
			});

		return installExtensionTask;
	}

	private async installVSIXExtension(manifest: IExtensionManifest, installExtensionTask: InstallVSIXTask, options: InstallVSIXOptions): Promise<InstallResult> {
		if (options.donotIncludePackAndDependencies) {
			this.logService.info('Installing the extension without checking dependencies and pack', installExtensionTask.extensionIdentifier.id);
			return installExtensionTask.run();
		}
		return this.installExtensionWithPackAndDeps(manifest, installExtensionTask, options);
	}

	async canInstall(extension: IGalleryExtension): Promise<boolean> {
		return true;
	}

	async installFromGallery(extension: IGalleryExtension, options: InstallOptions = {}): Promise<ILocalExtension> {
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		try {
			extension = await this.checkAndGetCompatibleVersion(extension);
		} catch (error) {
			const errorCode = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : ERROR_UNKNOWN;
			this.logService.error(`Failed to install extension:`, extension.identifier.id, error ? error.message : errorCode);
			reportTelemetry(this.telemetryService, 'extensionGallery:install', getGalleryExtensionTelemetryData(extension), undefined, error);
			if (error instanceof Error) {
				error.name = errorCode;
			}
			throw error;
		}

		let installExtensionTask = this.installingExtensions.get(new ExtensionIdentifierWithVersion(extension.identifier, extension.version).key());
		if (installExtensionTask) {
			this.logService.info('Extensions is already requested to install', extension.identifier.id);
			return (await installExtensionTask.waitUntilTaskIsFinished()).local;
		} else {
			installExtensionTask = this.createInstallFromGalleryExtensionTask(extension, options);
			return (await this.installGalleryExtension(extension, installExtensionTask, options)).local;
		}
	}

	private createInstallFromGalleryExtensionTask(extension: IGalleryExtension, options: InstallOptions): InstallExtensionTask {
		const key = new ExtensionIdentifierWithVersion(extension.identifier, extension.version).key();
		this._onInstallExtension.fire({ identifier: extension.identifier, gallery: extension });
		this.logService.info('Installing extension:', extension.identifier.id);

		const installExtensionTask = new InstallGalleryExtensionTask(extension, options, this.extensionsDownloader, this.telemetryService, this.extensionsScanner, this.logService);
		installExtensionTask.waitUntilTaskIsFinished()
			.then(result => {
				this.logService.info(`Extensions installed successfully:`, extension.identifier.id);
				this._onDidInstallExtension.fire({ identifier: extension.identifier, gallery: result.gallery, local: result.local, operation: result.operation });
			}, error => {
				const errorCode = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : ERROR_UNKNOWN;
				this.logService.error(`Failed to install extension:`, extension.identifier.id, error ? error.message : errorCode);
				this._onDidInstallExtension.fire({ identifier: extension.identifier, gallery: extension, operation: InstallOperation.Install, error: errorCode });
				if (error instanceof Error) {
					error.name = errorCode;
				}
				throw error;
			}).finally(() => this.installingExtensions.delete(key));

		this.installingExtensions.set(key, installExtensionTask);
		return installExtensionTask;
	}

	private async installGalleryExtension(extension: IGalleryExtension, installExtensionTask: InstallExtensionTask, options: InstallOptions): Promise<InstallResult> {
		if (options.donotIncludePackAndDependencies) {
			this.logService.info('Installing the extension without checking dependencies and pack', installExtensionTask.extensionIdentifier.id);
			return installExtensionTask.run();
		}

		const manifest = await this.galleryService.getManifest(extension, CancellationToken.None);
		if (manifest === null) {
			installExtensionTask.cancel();
			const error = new ExtensionManagementError(`Missing manifest for extension ${installExtensionTask.extensionIdentifier.id}`, INSTALL_ERROR_VALIDATING);
			this.logService.error(`Failed to install extension:`, installExtensionTask.extensionIdentifier.id, error.message);
			throw error;
		}

		return this.installExtensionWithPackAndDeps(manifest, installExtensionTask, { ...options, installOnlyNewlyAddedFromExtensionPack: true });
	}

	private async installExtensionWithPackAndDeps(manifest: IExtensionManifest, installExtensionTask: InstallExtensionTask, options: InstallOptions & InstallVSIXOptions): Promise<InstallResult> {
		const extensionsToInstallMap = new Map<string, { task: InstallExtensionTask, manifest: IExtensionManifest }>();
		try {
			const installResults: InstallResult[] = [];
			extensionsToInstallMap.set(installExtensionTask.extensionIdentifier.id.toLowerCase(), { task: installExtensionTask, manifest });
			const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensionsToInstall(installExtensionTask.extensionIdentifier, manifest, !!options.installOnlyNewlyAddedFromExtensionPack);
			let installExtensionHasDependents: boolean = false;
			for (const { gallery, manifest } of allDepsAndPackExtensionsToInstall) {
				installExtensionHasDependents = installExtensionHasDependents || !!manifest.extensionDependencies?.some(id => areSameExtensions({ id }, installExtensionTask.extensionIdentifier));
				if (this.installingExtensions.has(new ExtensionIdentifierWithVersion(gallery.identifier, gallery.version).key())) {
					this.logService.info('Extension is already requested to install', gallery.identifier.id);
				} else {
					const task = this.createInstallFromGalleryExtensionTask(gallery, { ...options, donotIncludePackAndDependencies: true });
					extensionsToInstallMap.set(gallery.identifier.id.toLowerCase(), { task, manifest });
				}
			}

			while (extensionsToInstallMap.size) {
				const extensionsWithoutDepsToInstall = [...extensionsToInstallMap.values()].filter(({ manifest }) => !manifest.extensionDependencies?.some(id => extensionsToInstallMap.has(id.toLowerCase())));
				let extensionsToInstall;
				if (extensionsWithoutDepsToInstall.length) {
					extensionsToInstall = extensionsToInstallMap.size === 1 ? extensionsWithoutDepsToInstall
						/* If the main extension has no dependents remove it and install it at the end */
						: extensionsWithoutDepsToInstall.filter(({ task }) => !(task === installExtensionTask && !installExtensionHasDependents));
				} else {
					this.logService.info('Found extensions with circular dependencies', extensionsWithoutDepsToInstall.map(({ task }) => task.extensionIdentifier.id));
					extensionsToInstall = [...extensionsToInstallMap.values()];
				}
				await Promise.all(extensionsToInstall.map(async ({ task }) => {
					installResults.push(await task.run());
					extensionsToInstallMap.delete(task.extensionIdentifier.id.toLowerCase());
				}));
			}

			const installResult = installResults.find(({ local }) => areSameExtensions(local.identifier, installExtensionTask.extensionIdentifier));
			if (installResult) {
				return installResult;
			}

			throw new Error('Extension is not installed');

		} catch (error) {
			if (extensionsToInstallMap.size) {
				extensionsToInstallMap.forEach(({ task }) => task.cancel());
			} else {
				installExtensionTask.cancel();
			}
			throw error;
		}
	}

	private async getAllDepsAndPackExtensionsToInstall(extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest, getOnlyNewlyAddedFromExtensionPack: boolean): Promise<{ gallery: IGalleryExtension, manifest: IExtensionManifest }[]> {
		if (!this.galleryService.isEnabled()) {
			return [];
		}

		let installed = await this.getInstalled();
		const knownIdentifiers = [extensionIdentifier, ...(installed).map(i => i.identifier)];

		const allDependenciesAndPacks: { gallery: IGalleryExtension, manifest: IExtensionManifest }[] = [];
		const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier: IExtensionIdentifier, manifest: IExtensionManifest): Promise<void> => {
			const dependenciesAndPackExtensions: string[] = manifest.extensionDependencies || [];
			if (manifest.extensionPack) {
				const existing = getOnlyNewlyAddedFromExtensionPack ? installed.find(e => areSameExtensions(e.identifier, extensionIdentifier)) : undefined;
				for (const extension of manifest.extensionPack) {
					// add only those extensions which are new in currently installed extension
					if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some(old => areSameExtensions({ id: old }, { id: extension })))) {
						if (dependenciesAndPackExtensions.every(e => !areSameExtensions({ id: e }, { id: extension }))) {
							dependenciesAndPackExtensions.push(extension);
						}
					}
				}
			}

			if (dependenciesAndPackExtensions.length) {
				// filter out installed and known extensions
				const identifiers = [...knownIdentifiers, ...allDependenciesAndPacks.map(r => r.gallery.identifier)];
				const names = dependenciesAndPackExtensions.filter(id => identifiers.every(galleryIdentifier => !areSameExtensions(galleryIdentifier, { id })));
				if (names.length) {
					const galleryResult = await this.galleryService.query({ names, pageSize: dependenciesAndPackExtensions.length }, CancellationToken.None);
					for (const galleryExtension of galleryResult.firstPage) {
						if (identifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
							continue;
						}
						const compatibleExtension = await this.checkAndGetCompatibleVersion(galleryExtension);
						const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
						if (manifest === null) {
							throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, INSTALL_ERROR_VALIDATING);
						}
						allDependenciesAndPacks.push({ gallery: compatibleExtension, manifest });
						await collectDependenciesAndPackExtensionsToInstall(compatibleExtension.identifier, manifest);
					}
				}
			}
		};

		await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
		installed = await this.getInstalled();
		return allDependenciesAndPacks.filter(e => !installed.some(i => areSameExtensions(i.identifier, e.gallery.identifier)));
	}

	private async checkAndGetCompatibleVersion(extension: IGalleryExtension): Promise<IGalleryExtension> {
		if (await this.isMalicious(extension)) {
			throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install extension since it was reported to be problematic."), INSTALL_ERROR_MALICIOUS);
		}

		const compatibleExtension = await this.galleryService.getCompatibleExtension(extension);
		if (!compatibleExtension) {
			throw new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Unable to install '{0}' extension because it is not compatible with the current version of VS Code (version {1}).", extension.identifier.id, product.version), INSTALL_ERROR_INCOMPATIBLE);
		}

		return compatibleExtension;
	}

	async reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		this.logService.trace('ExtensionManagementService#reinstallFromGallery', extension.identifier.id);
		if (!this.galleryService.isEnabled()) {
			throw new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"));
		}

		const galleryExtension = await this.findGalleryExtension(extension);
		if (!galleryExtension) {
			throw new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled"));
		}

		await this.extensionsScanner.setUninstalled(extension);
		try {
			await this.extensionsScanner.removeUninstalledExtension(extension);
		} catch (e) {
			throw new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e)));
		}

		await this.installFromGallery(galleryExtension);
	}

	private async isMalicious(extension: IGalleryExtension): Promise<boolean> {
		const report = await this.getExtensionsReport();
		return getMaliciousExtensionsSet(report).has(extension.identifier.id);
	}

	async uninstall(extension: ILocalExtension, options: UninstallOptions = {}): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		const installed = await this.getInstalled(ExtensionType.User);
		const extensionToUninstall = installed.find(e => areSameExtensions(e.identifier, extension.identifier));
		if (!extensionToUninstall) {
			throw new Error(nls.localize('notInstalled', "Extension '{0}' is not installed.", extension.manifest.displayName || extension.manifest.name));
		}

		try {
			await this.checkForDependenciesAndUninstall(extensionToUninstall, installed, options);
		} catch (error) {
			throw joinErrors(error);
		}
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateMetadata', local.identifier.id);
		local = await this.extensionsScanner.saveMetadataForLocalExtension(local, { ...((<ILocalExtensionManifest>local.manifest).__metadata || {}), ...metadata });
		this.manifestCache.invalidate();
		return local;
	}

	async updateExtensionScope(local: ILocalExtension, isMachineScoped: boolean): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateExtensionScope', local.identifier.id);
		local = await this.extensionsScanner.saveMetadataForLocalExtension(local, { ...((<ILocalExtensionManifest>local.manifest).__metadata || {}), isMachineScoped });
		this.manifestCache.invalidate();
		return local;
	}

	private async findGalleryExtension(local: ILocalExtension): Promise<IGalleryExtension> {
		if (local.identifier.uuid) {
			const galleryExtension = await this.findGalleryExtensionById(local.identifier.uuid);
			return galleryExtension ? galleryExtension : this.findGalleryExtensionByName(local.identifier.id);
		}
		return this.findGalleryExtensionByName(local.identifier.id);
	}

	private async findGalleryExtensionById(uuid: string): Promise<IGalleryExtension> {
		const galleryResult = await this.galleryService.query({ ids: [uuid], pageSize: 1 }, CancellationToken.None);
		return galleryResult.firstPage[0];
	}

	private async findGalleryExtensionByName(name: string): Promise<IGalleryExtension> {
		const galleryResult = await this.galleryService.query({ names: [name], pageSize: 1 }, CancellationToken.None);
		return galleryResult.firstPage[0];
	}

	private async checkForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], options: UninstallOptions): Promise<void> {
		try {
			await this.preUninstallExtension(extension);
			const packedExtensions = options.donotIncludePack ? [] : this.getAllPackExtensionsToUninstall(extension, installed);
			await this.uninstallExtensions(extension, packedExtensions, installed, options);
		} catch (error) {
			await this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
			throw error;
		}
		await this.postUninstallExtension(extension);
	}

	private async uninstallExtensions(extension: ILocalExtension, otherExtensionsToUninstall: ILocalExtension[], installed: ILocalExtension[], options: UninstallOptions): Promise<void> {
		const extensionsToUninstall = [extension, ...otherExtensionsToUninstall];
		if (!options.donotCheckDependents) {
			for (const e of extensionsToUninstall) {
				this.checkForDependents(e, extensionsToUninstall, installed, extension);
			}
		}
		await Promises.settled([this.uninstallExtension(extension), ...otherExtensionsToUninstall.map(d => this.doUninstall(d))]);
	}

	private checkForDependents(extension: ILocalExtension, extensionsToUninstall: ILocalExtension[], installed: ILocalExtension[], extensionToUninstall: ILocalExtension): void {
		const dependents = this.getDependents(extension, installed);
		if (dependents.length) {
			const remainingDependents = dependents.filter(dependent => extensionsToUninstall.indexOf(dependent) === -1);
			if (remainingDependents.length) {
				throw new Error(this.getDependentsErrorMessage(extension, remainingDependents, extensionToUninstall));
			}
		}
	}

	private getDependentsErrorMessage(dependingExtension: ILocalExtension, dependents: ILocalExtension[], extensionToUninstall: ILocalExtension): string {
		if (extensionToUninstall === dependingExtension) {
			if (dependents.length === 1) {
				return nls.localize('singleDependentError', "Cannot uninstall '{0}' extension. '{1}' extension depends on this.",
					extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
			}
			if (dependents.length === 2) {
				return nls.localize('twoDependentsError', "Cannot uninstall '{0}' extension. '{1}' and '{2}' extensions depend on this.",
					extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
			}
			return nls.localize('multipleDependentsError', "Cannot uninstall '{0}' extension. '{1}', '{2}' and other extension depend on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		if (dependents.length === 1) {
			return nls.localize('singleIndirectDependentError', "Cannot uninstall '{0}' extension . It includes uninstalling '{1}' extension and '{2}' extension depends on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
			|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
		}
		if (dependents.length === 2) {
			return nls.localize('twoIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}' and '{3}' extensions depend on this.",
				extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
			|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		return nls.localize('multipleIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}', '{3}' and other extensions depend on this.",
			extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
		|| dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);

	}

	private getAllPackExtensionsToUninstall(extension: ILocalExtension, installed: ILocalExtension[], checked: ILocalExtension[] = []): ILocalExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
		if (extensionsPack.length) {
			const packedExtensions = installed.filter(i => !i.isBuiltin && extensionsPack.some(id => areSameExtensions({ id }, i.identifier)));
			const packOfPackedExtensions: ILocalExtension[] = [];
			for (const packedExtension of packedExtensions) {
				packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
			}
			return [...packedExtensions, ...packOfPackedExtensions];
		}
		return [];
	}

	private getDependents(extension: ILocalExtension, installed: ILocalExtension[]): ILocalExtension[] {
		return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
	}

	private async doUninstall(extension: ILocalExtension): Promise<void> {
		try {
			await this.preUninstallExtension(extension);
			await this.uninstallExtension(extension);
		} catch (error) {
			await this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
			throw error;
		}
		await this.postUninstallExtension(extension);
	}

	private async preUninstallExtension(extension: ILocalExtension): Promise<void> {
		const exists = await pfs.Promises.exists(extension.location.fsPath);
		if (!exists) {
			throw new Error(nls.localize('notExists', "Could not find extension"));
		}
		this.logService.info('Uninstalling extension:', extension.identifier.id);
		this._onUninstallExtension.fire(extension.identifier);
	}

	private async uninstallExtension(local: ILocalExtension): Promise<void> {
		let promise = this.uninstallingExtensions.get(local.identifier.id);
		if (!promise) {
			// Set all versions of the extension as uninstalled
			promise = createCancelablePromise(async () => {
				const userExtensions = await this.extensionsScanner.scanUserExtensions(false);
				await this.extensionsScanner.setUninstalled(...userExtensions.filter(u => areSameExtensions(u.identifier, local.identifier)));
			});
			this.uninstallingExtensions.set(local.identifier.id, promise);
			promise.finally(() => this.uninstallingExtensions.delete(local.identifier.id));
		}
		return promise;
	}

	private async postUninstallExtension(extension: ILocalExtension, error?: Error): Promise<void> {
		if (error) {
			this.logService.error('Failed to uninstall extension:', extension.identifier.id, error.message);
		} else {
			this.logService.info('Successfully uninstalled extension:', extension.identifier.id);
			// only report if extension has a mapped gallery extension. UUID identifies the gallery extension.
			if (extension.identifier.uuid) {
				try {
					await this.galleryService.reportStatistic(extension.manifest.publisher, extension.manifest.name, extension.manifest.version, StatisticType.Uninstall);
				} catch (error) { /* ignore */ }
			}
		}
		reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', getLocalExtensionTelemetryData(extension), undefined, error);
		const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : undefined;
		this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: errorcode });
	}

	getInstalled(type: ExtensionType | null = null): Promise<ILocalExtension[]> {
		return this.extensionsScanner.scanExtensions(type);
	}

	removeDeprecatedExtensions(): Promise<void> {
		return this.extensionsScanner.cleanUp();
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		const now = new Date().getTime();

		if (!this.reportedExtensions || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
			this.reportedExtensions = this.updateReportCache();
			this.lastReportTimestamp = now;
		}

		return this.reportedExtensions;
	}

	private async updateReportCache(): Promise<IReportedExtension[]> {
		try {
			this.logService.trace('ExtensionManagementService.refreshReportedCache');
			const result = await this.galleryService.getExtensionsReport();
			this.logService.trace(`ExtensionManagementService.refreshReportedCache - got ${result.length} reported extensions from service`);
			return result;
		} catch (err) {
			this.logService.trace('ExtensionManagementService.refreshReportedCache - failed to get extension report');
			return [];
		}
	}

}

function joinErrors(errorOrErrors: (Error | string) | (Array<Error | string>)): Error {
	const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
	if (errors.length === 1) {
		return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
	}
	return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
		return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
	}, new Error(''));
}

function reportTelemetry(telemetryService: ITelemetryService, eventName: string, extensionData: any, duration?: number, error?: Error): void {
	const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : undefined;
	/* __GDPR__
		"extensionGallery:install" : {
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"recommendationReason": { "retiredFromVersion": "1.23.0", "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	/* __GDPR__
		"extensionGallery:uninstall" : {
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	/* __GDPR__
		"extensionGallery:update" : {
			"success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
			"errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
			"${include}": [
				"${GalleryExtensionTelemetryData}"
			]
		}
	*/
	telemetryService.publicLogError(eventName, { ...extensionData, success: !error, duration, errorcode });
}

abstract class AbstractInstallExtensionTask implements InstallExtensionTask {

	private readonly barrier = new Barrier();
	private cancellablePromise: CancelablePromise<InstallResult> | undefined;

	constructor(
		readonly extensionIdentifier: IExtensionIdentifier,
		protected readonly extensionsScanner: ExtensionsScanner,
		protected readonly logService: ILogService,
	) {
	}

	async waitUntilTaskIsFinished(): Promise<InstallResult> {
		await this.barrier.wait();
		return this.cancellablePromise!;
	}

	async run(): Promise<InstallResult> {
		if (!this.cancellablePromise) {
			this.cancellablePromise = createCancelablePromise(token => this.install(token));
		}
		this.barrier.open();
		return this.cancellablePromise;
	}

	cancel(): void {
		if (!this.cancellablePromise) {
			this.cancellablePromise = createCancelablePromise(token => {
				return new Promise((c, e) => {
					const disposable = token.onCancellationRequested(() => {
						disposable.dispose();
						e(canceled());
					});
				});
			});
			this.barrier.open();
		}
		this.cancellablePromise.cancel();
	}

	protected async installExtension(installableExtension: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		try {
			const local = await this.unsetUninstalledAndGetLocal(installableExtension.identifierWithVersion);
			if (local) {
				return installableExtension.metadata ? this.extensionsScanner.saveMetadataForLocalExtension(local, installableExtension.metadata) : local;
			}
		} catch (e) {
			if (isMacintosh) {
				throw new ExtensionManagementError(nls.localize('quitCode', "Unable to install the extension. Please Quit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED);
			} else {
				throw new ExtensionManagementError(nls.localize('exitCode', "Unable to install the extension. Please Exit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED);
			}
		}
		return this.extractAndInstall(installableExtension, token);
	}

	protected async unsetUninstalledAndGetLocal(identifierWithVersion: ExtensionIdentifierWithVersion): Promise<ILocalExtension | null> {
		const isUninstalled = await this.isUninstalled(identifierWithVersion);
		if (!isUninstalled) {
			return null;
		}

		this.logService.trace('Removing the extension from uninstalled list:', identifierWithVersion.id);
		// If the same version of extension is marked as uninstalled, remove it from there and return the local.
		const local = await this.extensionsScanner.setInstalled(identifierWithVersion);
		this.logService.info('Removed the extension from uninstalled list:', identifierWithVersion.id);

		return local;
	}

	private async isUninstalled(identifier: ExtensionIdentifierWithVersion): Promise<boolean> {
		const uninstalled = await this.extensionsScanner.getUninstalledExtensions();
		return !!uninstalled[identifier.key()];
	}

	private async extractAndInstall({ zipPath, identifierWithVersion, metadata }: InstallableExtension, token: CancellationToken): Promise<ILocalExtension> {
		let local = await this.extensionsScanner.extractUserExtension(identifierWithVersion, zipPath, token);
		this.logService.info('Installation completed.', identifierWithVersion.id);
		if (metadata) {
			local = await this.extensionsScanner.saveMetadataForLocalExtension(local, metadata);
		}
		return local;
	}

	abstract install(token: CancellationToken): Promise<InstallResult>;
}

class InstallGalleryExtensionTask extends AbstractInstallExtensionTask {

	constructor(
		private readonly extension: IGalleryExtension,
		private readonly options: InstallOptions,
		private readonly extensionsDownloader: ExtensionsDownloader,
		private readonly telemetryService: ITelemetryService,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService,
	) {
		super(extension.identifier, extensionsScanner, logService);
	}

	install(token: CancellationToken): Promise<InstallResult> {
		return this.installGalleryExtension(this.extension, this.options, token);
	}

	private async installGalleryExtension(gallery: IGalleryExtension, options: InstallOptions, token: CancellationToken): Promise<InstallResult> {
		const startTime = new Date().getTime();
		let operation = InstallOperation.Install;
		try {
			const installed = await this.extensionsScanner.scanExtensions(null);
			const existingExtension = installed.find(i => areSameExtensions(i.identifier, gallery.identifier));
			if (existingExtension) {
				operation = InstallOperation.Update;
			}

			const installableExtension = await this.downloadInstallableExtension(gallery, operation);
			installableExtension.metadata.isMachineScoped = options.isMachineScoped || existingExtension?.isMachineScoped;
			installableExtension.metadata.isBuiltin = options.isBuiltin || existingExtension?.isBuiltin;

			const local = await this.installExtension(installableExtension, token);
			if (existingExtension && semver.neq(existingExtension.manifest.version, gallery.version)) {
				await this.extensionsScanner.setUninstalled(existingExtension);
			}
			try { await this.extensionsDownloader.delete(URI.file(installableExtension.zipPath)); } catch (error) { /* Ignore */ }
			reportTelemetry(this.telemetryService, this.getTelemetryEvent(operation), getGalleryExtensionTelemetryData(gallery), new Date().getTime() - startTime, undefined);
			return { local, operation, gallery };
		} catch (error) {
			reportTelemetry(this.telemetryService, this.getTelemetryEvent(operation), getGalleryExtensionTelemetryData(gallery), new Date().getTime() - startTime, error);
			throw error;
		}
	}

	private getTelemetryEvent(operation: InstallOperation): string {
		return operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install';
	}

	private async downloadInstallableExtension(extension: IGalleryExtension, operation: InstallOperation): Promise<Required<InstallableExtension>> {
		const metadata = <IGalleryMetadata>{
			id: extension.identifier.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
		};

		let zipPath: string | undefined;
		try {
			this.logService.trace('Started downloading extension:', extension.identifier.id);
			zipPath = (await this.extensionsDownloader.downloadExtension(extension, operation)).fsPath;
			this.logService.info('Downloaded extension:', extension.identifier.id, zipPath);
		} catch (error) {
			throw new ExtensionManagementError(joinErrors(error).message, INSTALL_ERROR_DOWNLOADING);
		}

		try {
			const manifest = await getManifest(zipPath);
			return (<Required<InstallableExtension>>{ zipPath, identifierWithVersion: new ExtensionIdentifierWithVersion(extension.identifier, manifest.version), metadata });
		} catch (error) {
			throw new ExtensionManagementError(joinErrors(error).message, INSTALL_ERROR_VALIDATING);
		}
	}
}

class InstallVSIXTask extends AbstractInstallExtensionTask {

	constructor(
		private readonly manifest: IExtensionManifest,
		private readonly zipPath: string,
		private readonly options: InstallOptions,
		private readonly galleryService: IExtensionGalleryService,
		extensionsScanner: ExtensionsScanner,
		logService: ILogService
	) {
		super({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, extensionsScanner, logService);
	}

	async install(token: CancellationToken): Promise<InstallResult> {
		let operation = InstallOperation.Install;
		const identifierWithVersion = new ExtensionIdentifierWithVersion(this.extensionIdentifier, this.manifest.version);
		const installedExtensions = await this.extensionsScanner.scanExtensions(ExtensionType.User);
		const existing = installedExtensions.find(i => areSameExtensions(this.extensionIdentifier, i.identifier));
		const metadata = await this.getMetadata(this.extensionIdentifier.id, token);

		if (existing) {
			metadata.isMachineScoped = this.options.isMachineScoped || existing.isMachineScoped;
			metadata.isBuiltin = this.options.isBuiltin || existing.isBuiltin;
			operation = InstallOperation.Update;
			if (identifierWithVersion.equals(new ExtensionIdentifierWithVersion(existing.identifier, existing.manifest.version))) {
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
			const existing = await this.unsetUninstalledAndGetLocal(identifierWithVersion);
			if (existing) {
				try {
					await this.extensionsScanner.removeExtension(existing, 'existing');
				} catch (e) {
					throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
				}
			}
		}

		const local = await this.installExtension({ zipPath: this.zipPath, identifierWithVersion, metadata }, token);
		return { local, operation };
	}

	private async getMetadata(name: string, token: CancellationToken): Promise<IMetadata> {
		try {
			const galleryExtension = (await this.galleryService.query({ names: [name], pageSize: 1 }, token)).firstPage[0];
			if (galleryExtension) {
				return { id: galleryExtension.identifier.uuid, publisherDisplayName: galleryExtension.publisherDisplayName, publisherId: galleryExtension.publisherId };
			}
		} catch (error) {
			/* Ignore Error */
		}
		return {};
	}
}
