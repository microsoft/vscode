/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import { assign } from 'vs/base/common/objects';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { flatten } from 'vs/base/common/arrays';
import { extract, ExtractError, zip, IFile } from 'vs/platform/node/zip';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, LocalExtensionType,
	StatisticType,
	IExtensionIdentifier,
	IReportedExtension,
	InstallOperation,
	INSTALL_ERROR_MALICIOUS,
	INSTALL_ERROR_INCOMPATIBLE
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal, adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, groupByExtension, getMaliciousExtensionsSet, getLocalExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, getIdFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from '../common/extensionNls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter, always, createCancelablePromise, CancelablePromise, Queue } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import * as semver from 'semver';
import { URI } from 'vs/base/common/uri';
import pkg from 'vs/platform/node/package';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isEngineValid } from 'vs/platform/extensions/node/extensionValidator';
import { tmpdir } from 'os';
import { generateUuid } from 'vs/base/common/uuid';
import { IDownloadService } from 'vs/platform/download/common/download';
import { optional } from 'vs/platform/instantiation/common/instantiation';
import { Schemas } from 'vs/base/common/network';
import { CancellationToken } from 'vs/base/common/cancellation';
import { getPathFromAmdModule } from 'vs/base/common/amd';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';

const ERROR_SCANNING_SYS_EXTENSIONS = 'scanningSystem';
const ERROR_SCANNING_USER_EXTENSIONS = 'scanningUser';
const INSTALL_ERROR_UNSET_UNINSTALLED = 'unsetUninstalled';
const INSTALL_ERROR_DOWNLOADING = 'downloading';
const INSTALL_ERROR_VALIDATING = 'validating';
const INSTALL_ERROR_LOCAL = 'local';
const INSTALL_ERROR_EXTRACTING = 'extracting';
const INSTALL_ERROR_RENAMING = 'renaming';
const INSTALL_ERROR_DELETING = 'deleting';
const ERROR_UNKNOWN = 'unknown';

export class ExtensionManagementError extends Error {
	constructor(message: string, readonly code: string) {
		super(message);
	}
}

function parseManifest(raw: string): Promise<{ manifest: IExtensionManifest; metadata: IGalleryMetadata; }> {
	return new Promise((c, e) => {
		try {
			const manifest = JSON.parse(raw);
			const metadata = manifest.__metadata || null;
			delete manifest.__metadata;
			c({ manifest, metadata });
		} catch (err) {
			e(new Error(nls.localize('invalidManifest', "Extension invalid: package.json is not a JSON file.")));
		}
	});
}

function readManifest(extensionPath: string): Promise<{ manifest: IExtensionManifest; metadata: IGalleryMetadata; }> {
	const promises = [
		pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
			.then(raw => parseManifest(raw)),
		pfs.readFile(path.join(extensionPath, 'package.nls.json'), 'utf8')
			.then(undefined, err => err.code !== 'ENOENT' ? Promise.reject<string>(err) : '{}')
			.then(raw => JSON.parse(raw))
	];

	return Promise.all<any>(promises).then(([{ manifest, metadata }, translations]) => {
		return {
			manifest: localizeManifest(manifest, translations),
			metadata
		};
	});
}

interface InstallableExtension {
	zipPath: string;
	id: string;
	metadata: IGalleryMetadata | null;
}

export class ExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: any;

	private systemExtensionsPath: string;
	private extensionsPath: string;
	private uninstalledPath: string;
	private uninstalledFileLimiter: Queue<any>;
	private reportedExtensions: Promise<IReportedExtension[]> | undefined;
	private lastReportTimestamp = 0;
	private readonly installingExtensions: Map<string, CancelablePromise<void>> = new Map<string, CancelablePromise<void>>();
	private readonly uninstallingExtensions: Map<string, CancelablePromise<void>> = new Map<string, CancelablePromise<void>>();
	private readonly manifestCache: ExtensionsManifestCache;
	private readonly extensionLifecycle: ExtensionsLifecycle;

	private readonly _onInstallExtension = new Emitter<InstallExtensionEvent>();
	readonly onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	private readonly _onDidInstallExtension = new Emitter<DidInstallExtensionEvent>();
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent> = this._onDidInstallExtension.event;

	private readonly _onUninstallExtension = new Emitter<IExtensionIdentifier>();
	readonly onUninstallExtension: Event<IExtensionIdentifier> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<DidUninstallExtensionEvent>();
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@ILogService private readonly logService: ILogService,
		@optional(IDownloadService) private downloadService: IDownloadService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this.systemExtensionsPath = environmentService.builtinExtensionsPath;
		this.extensionsPath = environmentService.extensionsPath;
		this.uninstalledPath = path.join(this.extensionsPath, '.obsolete');
		this.uninstalledFileLimiter = new Queue();
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionLifecycle = this._register(new ExtensionsLifecycle(environmentService, this.logService));

		this._register(toDisposable(() => {
			this.installingExtensions.forEach(promise => promise.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
	}

	zip(extension: ILocalExtension): Promise<URI> {
		this.logService.trace('ExtensionManagementService#zip', extension.identifier.id);
		return this.collectFiles(extension)
			.then(files => zip(path.join(tmpdir(), generateUuid()), files))
			.then(path => URI.file(path));
	}

	unzip(zipLocation: URI, type: LocalExtensionType): Promise<IExtensionIdentifier> {
		this.logService.trace('ExtensionManagementService#unzip', zipLocation.toString());
		return this.install(zipLocation, type);
	}

	private collectFiles(extension: ILocalExtension): Promise<IFile[]> {

		const collectFilesFromDirectory = async (dir): Promise<string[]> => {
			let entries = await pfs.readdir(dir);
			entries = entries.map(e => path.join(dir, e));
			const stats = await Promise.all(entries.map(e => pfs.stat(e)));
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

		return collectFilesFromDirectory(extension.location.fsPath)
			.then(files => files.map(f => (<IFile>{ path: `extension/${path.relative(extension.location.fsPath, f)}`, localPath: f })));

	}

	install(vsix: URI, type: LocalExtensionType = LocalExtensionType.User): Promise<IExtensionIdentifier> {
		this.logService.trace('ExtensionManagementService#install', vsix.toString());
		return createCancelablePromise(token => {
			return this.downloadVsix(vsix).then(downloadLocation => {
				const zipPath = path.resolve(downloadLocation.fsPath);

				return getManifest(zipPath)
					.then(manifest => {
						const identifier = { id: getLocalExtensionIdFromManifest(manifest) };
						if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode)) {
							return Promise.reject(new Error(nls.localize('incompatible', "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", identifier.id, pkg.version)));
						}
						return this.removeIfExists(identifier.id).then(
							() => {
								const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
								return this.getInstalled(LocalExtensionType.User)
									.then(installedExtensions => {
										const newer = installedExtensions.filter(local => areSameExtensions(extensionIdentifier, { id: getGalleryExtensionIdFromLocal(local) }) && semver.gt(local.manifest.version, manifest.version))[0];
										return newer ? this.uninstall(newer, true) : undefined;
									})
									.then(() => {
										this.logService.info('Installing the extension:', identifier.id);
										this._onInstallExtension.fire({ identifier, zipPath });
										return this.getMetadata(getGalleryExtensionId(manifest.publisher, manifest.name))
											.then(
												metadata => this.installFromZipPath(identifier, zipPath, metadata, type, token),
												error => this.installFromZipPath(identifier, zipPath, null, type, token))
											.then(
												() => { this.logService.info('Successfully installed the extension:', identifier.id); return identifier; },
												e => {
													this.logService.error('Failed to install the extension:', identifier.id, e.message);
													return Promise.reject(e);
												});
									});
							},
							e => Promise.reject(new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", manifest.displayName || manifest.name))));
					});
			});
		});
	}

	private downloadVsix(vsix: URI): Promise<URI> {
		if (vsix.scheme === Schemas.file) {
			return Promise.resolve(vsix);
		}
		if (!this.downloadService) {
			throw new Error('Download service is not available');
		}
		const downloadedLocation = path.join(tmpdir(), generateUuid());
		return this.downloadService.download(vsix, downloadedLocation).then(() => URI.file(downloadedLocation));
	}

	private removeIfExists(id: string): Promise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed => installed.filter(i => i.identifier.id === id)[0])
			.then(existing => existing ? this.removeExtension(existing, 'existing') : undefined);
	}

	private installFromZipPath(identifier: IExtensionIdentifier, zipPath: string, metadata: IGalleryMetadata | null, type: LocalExtensionType, token: CancellationToken): Promise<ILocalExtension> {
		return this.toNonCancellablePromise(this.getInstalled()
			.then(installed => {
				const operation = this.getOperation({ id: getIdFromLocalExtensionId(identifier.id), uuid: identifier.uuid }, installed);
				return this.installExtension({ zipPath, id: identifier.id, metadata }, type, token)
					.then(local => this.installDependenciesAndPackExtensions(local, null).then(() => local, error => this.uninstall(local, true).then(() => Promise.reject(error), () => Promise.reject(error))))
					.then(
						local => { this._onDidInstallExtension.fire({ identifier, zipPath, local, operation }); return local; },
						error => { this._onDidInstallExtension.fire({ identifier, zipPath, operation, error }); return Promise.reject(error); }
					);
			}));
	}

	async installFromGallery(extension: IGalleryExtension): Promise<void> {
		const startTime = new Date().getTime();

		this.logService.info('Installing extension:', extension.name);
		this._onInstallExtension.fire({ identifier: extension.identifier, gallery: extension });

		const onDidInstallExtensionSuccess = (extension: IGalleryExtension, operation: InstallOperation, local: ILocalExtension) => {
			this.logService.info(`Extensions installed successfully:`, extension.identifier.id);
			this._onDidInstallExtension.fire({ identifier: { id: getLocalExtensionIdFromGallery(extension, extension.version), uuid: extension.identifier.uuid }, gallery: extension, local, operation });
			this.reportTelemetry(this.getTelemetryEvent(operation), getGalleryExtensionTelemetryData(extension), new Date().getTime() - startTime, undefined);
		};

		const onDidInstallExtensionFailure = (extension: IGalleryExtension, operation: InstallOperation, error) => {
			const errorCode = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : ERROR_UNKNOWN;
			this.logService.error(`Failed to install extension:`, extension.identifier.id, error ? error.message : errorCode);
			this._onDidInstallExtension.fire({ identifier: extension.identifier, gallery: extension, operation, error: errorCode });
			this.reportTelemetry(this.getTelemetryEvent(operation), getGalleryExtensionTelemetryData(extension), new Date().getTime() - startTime, error);
			if (error instanceof Error) {
				error.name = errorCode;
			}
		};

		try {
			extension = await this.checkAndGetCompatibleVersion(extension);
		} catch (error) {
			onDidInstallExtensionFailure(extension, InstallOperation.Install, error);
			return Promise.reject(error);
		}

		const key = getLocalExtensionId(extension.identifier.id, extension.version);
		let cancellablePromise = this.installingExtensions.get(key);
		if (!cancellablePromise) {


			let operation: InstallOperation = InstallOperation.Install;
			let cancellationToken: CancellationToken, successCallback: (a?: any) => void, errorCallback: (e?: any) => any | null;
			cancellablePromise = createCancelablePromise(token => { cancellationToken = token; return new Promise((c, e) => { successCallback = c; errorCallback = e; }); });
			this.installingExtensions.set(key, cancellablePromise);
			try {
				const installed = await this.getInstalled(LocalExtensionType.User);
				const existingExtension = installed.filter(i => areSameExtensions(i.galleryIdentifier, extension.identifier))[0];
				if (existingExtension) {
					operation = InstallOperation.Update;
					if (semver.gt(existingExtension.manifest.version, extension.version)) {
						await this.uninstall(existingExtension, true);
					}
				}

				this.downloadInstallableExtension(extension, operation)
					.then(installableExtension => this.installExtension(installableExtension, LocalExtensionType.User, cancellationToken)
						.then(local => always(pfs.rimraf(installableExtension.zipPath), () => null).then(() => local)))
					.then(local => this.installDependenciesAndPackExtensions(local, existingExtension)
						.then(() => local, error => this.uninstall(local, true).then(() => Promise.reject(error), () => Promise.reject(error))))
					.then(
						local => {
							this.installingExtensions.delete(key);
							onDidInstallExtensionSuccess(extension, operation, local);
							successCallback(null);
						},
						error => {
							this.installingExtensions.delete(key);
							onDidInstallExtensionFailure(extension, operation, error);
							errorCallback(error);
						});

			} catch (error) {
				this.installingExtensions.delete(key);
				onDidInstallExtensionFailure(extension, operation, error);
				return Promise.reject(error);
			}

		}

		return cancellablePromise;
	}

	private async checkAndGetCompatibleVersion(extension: IGalleryExtension): Promise<IGalleryExtension> {
		if (await this.isMalicious(extension)) {
			return Promise.reject(new ExtensionManagementError(nls.localize('malicious extension', "Can't install extension since it was reported to be problematic."), INSTALL_ERROR_MALICIOUS));
		}

		const compatibleExtension = await this.galleryService.loadCompatibleVersion(extension);

		if (!compatibleExtension) {
			return Promise.reject(new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Unable to install because, the extension '{0}' compatible with current version '{1}' of VS Code is not found.", extension.identifier.id, pkg.version), INSTALL_ERROR_INCOMPATIBLE));
		}

		return compatibleExtension;
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		this.logService.trace('ExtensionManagementService#reinstallFromGallery', extension.identifier.id);
		if (!this.galleryService.isEnabled()) {
			return Promise.reject(new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled")));
		}
		return this.findGalleryExtension(extension)
			.then(galleryExtension => {
				if (galleryExtension) {
					return this.setUninstalled(extension)
						.then(() => this.removeUninstalledExtension(extension)
							.then(
								() => this.installFromGallery(galleryExtension),
								e => Promise.reject(new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e))))));
				}
				return Promise.reject(new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled")));
			});
	}

	private getOperation(extensionToInstall: IExtensionIdentifier, installed: ILocalExtension[]): InstallOperation {
		return installed.some(i => areSameExtensions({ id: getGalleryExtensionIdFromLocal(i), uuid: i.identifier.uuid }, extensionToInstall)) ? InstallOperation.Update : InstallOperation.Install;
	}

	private getTelemetryEvent(operation: InstallOperation): string {
		return operation === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install';
	}

	private isMalicious(extension: IGalleryExtension): Promise<boolean> {
		return this.getExtensionsReport()
			.then(report => getMaliciousExtensionsSet(report).has(extension.identifier.id));
	}

	private downloadInstallableExtension(extension: IGalleryExtension, operation: InstallOperation): Promise<InstallableExtension> {
		const metadata = <IGalleryMetadata>{
			id: extension.identifier.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
		};

		this.logService.trace('Started downloading extension:', extension.name);
		return this.galleryService.download(extension, operation)
			.then(
				zipPath => {
					this.logService.info('Downloaded extension:', extension.name, zipPath);
					return getManifest(zipPath)
						.then(
							manifest => (<InstallableExtension>{ zipPath, id: getLocalExtensionIdFromManifest(manifest), metadata }),
							error => Promise.reject(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_VALIDATING))
						);
				},
				error => Promise.reject(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_DOWNLOADING)));
	}

	private installExtension(installableExtension: InstallableExtension, type: LocalExtensionType, token: CancellationToken): Promise<ILocalExtension> {
		return this.unsetUninstalledAndGetLocal(installableExtension.id)
			.then(
				local => {
					if (local) {
						return local;
					}
					return this.extractAndInstall(installableExtension, type, token);
				},
				e => {
					if (isMacintosh) {
						return Promise.reject(new ExtensionManagementError(nls.localize('quitCode', "Unable to install the extension. Please Quit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED));
					}
					return Promise.reject(new ExtensionManagementError(nls.localize('exitCode', "Unable to install the extension. Please Exit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED));
				});
	}

	private unsetUninstalledAndGetLocal(id: string): Promise<ILocalExtension | null> {
		return this.isUninstalled(id)
			.then<ILocalExtension | null>(isUninstalled => {
				if (isUninstalled) {
					this.logService.trace('Removing the extension from uninstalled list:', id);
					// If the same version of extension is marked as uninstalled, remove it from there and return the local.
					return this.unsetUninstalled(id)
						.then(() => {
							this.logService.info('Removed the extension from uninstalled list:', id);
							return this.getInstalled(LocalExtensionType.User);
						})
						.then(installed => installed.filter(i => i.identifier.id === id)[0]);
				}
				return null;
			});
	}

	private extractAndInstall({ zipPath, id, metadata }: InstallableExtension, type: LocalExtensionType, token: CancellationToken): Promise<ILocalExtension> {
		const location = type === LocalExtensionType.User ? this.extensionsPath : this.systemExtensionsPath;
		const tempPath = path.join(location, `.${id}`);
		const extensionPath = path.join(location, id);
		return pfs.rimraf(extensionPath)
			.then(() => this.extractAndRename(id, zipPath, tempPath, extensionPath, token), e => Promise.reject(new ExtensionManagementError(nls.localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, id), INSTALL_ERROR_DELETING)))
			.then(() => this.scanExtension(id, location, type))
			.then(local => {
				if (!local) {
					return Promise.reject(nls.localize('cannot read', "Cannot read the extension from {0}", location));
				}
				this.logService.info('Installation completed.', id);
				if (metadata) {
					local.metadata = metadata;
					return this.saveMetadataForLocalExtension(local);
				}
				return local;
			}, error => pfs.rimraf(extensionPath).then(() => Promise.reject(error), () => Promise.reject(error)));
	}

	private extractAndRename(id: string, zipPath: string, extractPath: string, renamePath: string, token: CancellationToken): Promise<void> {
		return this.extract(id, zipPath, extractPath, token)
			.then(() => this.rename(id, extractPath, renamePath, Date.now() + (2 * 60 * 1000) /* Retry for 2 minutes */)
				.then(
					() => this.logService.info('Renamed to', renamePath),
					e => {
						this.logService.info('Rename failed. Deleting from extracted location', extractPath);
						return always(pfs.rimraf(extractPath), () => null).then(() => Promise.reject(e));
					}));
	}

	private extract(id: string, zipPath: string, extractPath: string, token: CancellationToken): Promise<void> {
		this.logService.trace(`Started extracting the extension from ${zipPath} to ${extractPath}`);
		return pfs.rimraf(extractPath)
			.then(
				() => extract(zipPath, extractPath, { sourcePath: 'extension', overwrite: true }, this.logService, token)
					.then(
						() => this.logService.info(`Extracted extension to ${extractPath}:`, id),
						e => always(pfs.rimraf(extractPath), () => null)
							.then(() => Promise.reject(new ExtensionManagementError(e.message, e instanceof ExtractError && e.type ? e.type : INSTALL_ERROR_EXTRACTING)))),
				e => Promise.reject(new ExtensionManagementError(this.joinErrors(e).message, INSTALL_ERROR_DELETING)));
	}

	private rename(id: string, extractPath: string, renamePath: string, retryUntil: number): Promise<void> {
		return pfs.rename(extractPath, renamePath)
			.then(undefined, error => {
				if (isWindows && error && error.code === 'EPERM' && Date.now() < retryUntil) {
					this.logService.info(`Failed renaming ${extractPath} to ${renamePath} with 'EPERM' error. Trying again...`);
					return this.rename(id, extractPath, renamePath, retryUntil);
				}
				return Promise.reject(new ExtensionManagementError(error.message || nls.localize('renameError', "Unknown error while renaming {0} to {1}", extractPath, renamePath), error.code || INSTALL_ERROR_RENAMING));
			});
	}

	private installDependenciesAndPackExtensions(installed: ILocalExtension, existing: ILocalExtension | null): Promise<void> {
		if (this.galleryService.isEnabled()) {
			const dependenciesAndPackExtensions: string[] = installed.manifest.extensionDependencies || [];
			if (installed.manifest.extensionPack) {
				for (const extension of installed.manifest.extensionPack) {
					// add only those extensions which are new in currently installed extension
					if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some(old => areSameExtensions({ id: old }, { id: extension })))) {
						if (dependenciesAndPackExtensions.every(e => !areSameExtensions({ id: e }, { id: extension }))) {
							dependenciesAndPackExtensions.push(extension);
						}
					}
				}
			}
			if (dependenciesAndPackExtensions.length) {
				return this.getInstalled()
					.then(installed => {
						// filter out installing and installed extensions
						const names = dependenciesAndPackExtensions.filter(id => !this.installingExtensions.has(adoptToGalleryExtensionId(id)) && installed.every(({ galleryIdentifier }) => !areSameExtensions(galleryIdentifier, { id })));
						if (names.length) {
							return this.galleryService.query({ names, pageSize: dependenciesAndPackExtensions.length })
								.then(galleryResult => {
									const extensionsToInstall = galleryResult.firstPage;
									return Promise.all(extensionsToInstall.map(e => this.installFromGallery(e)))
										.then(() => null, errors => this.rollback(extensionsToInstall).then(() => Promise.reject(errors), () => Promise.reject(errors)));
								});
						}
						return null;
					});
			}
		}
		return Promise.resolve(undefined);
	}

	private rollback(extensions: IGalleryExtension[]): Promise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed =>
				Promise.all(installed.filter(local => extensions.some(galleryExtension => local.identifier.id === getLocalExtensionIdFromGallery(galleryExtension, galleryExtension.version))) // Only check id (pub.name-version) because we want to rollback the exact version
					.map(local => this.uninstall(local, true))))
			.then(() => undefined, () => undefined);
	}

	uninstall(extension: ILocalExtension, force = false): Promise<void> {
		this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
		return this.toNonCancellablePromise(this.getInstalled(LocalExtensionType.User)
			.then(installed => {
				const extensionsToUninstall = installed
					.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name);
				if (extensionsToUninstall.length) {
					const promises = extensionsToUninstall.map(e => this.checkForDependenciesAndUninstall(e, installed));
					return Promise.all(promises).then(() => null, error => Promise.reject(this.joinErrors(error)));
				} else {
					return Promise.reject(new Error(nls.localize('notInstalled', "Extension '{0}' is not installed.", extension.manifest.displayName || extension.manifest.name)));
				}
			}));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#updateMetadata', local.identifier.id);
		local.metadata = metadata;
		return this.saveMetadataForLocalExtension(local)
			.then(localExtension => {
				this.manifestCache.invalidate();
				return localExtension;
			});
	}

	private saveMetadataForLocalExtension(local: ILocalExtension): Promise<ILocalExtension> {
		if (!local.metadata) {
			return Promise.resolve(local);
		}
		const manifestPath = path.join(this.extensionsPath, local.identifier.id, 'package.json');
		return pfs.readFile(manifestPath, 'utf8')
			.then(raw => parseManifest(raw))
			.then(({ manifest }) => assign(manifest, { __metadata: local.metadata }))
			.then(manifest => pfs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t')))
			.then(() => local);
	}

	private getMetadata(extensionName: string): Promise<IGalleryMetadata | null> {
		return this.findGalleryExtensionByName(extensionName)
			.then(galleryExtension => galleryExtension ? <IGalleryMetadata>{ id: galleryExtension.identifier.uuid, publisherDisplayName: galleryExtension.publisherDisplayName, publisherId: galleryExtension.publisherId } : null);
	}

	private findGalleryExtension(local: ILocalExtension): Promise<IGalleryExtension> {
		if (local.identifier.uuid) {
			return this.findGalleryExtensionById(local.identifier.uuid)
				.then(galleryExtension => galleryExtension ? galleryExtension : this.findGalleryExtensionByName(getGalleryExtensionIdFromLocal(local)));
		}
		return this.findGalleryExtensionByName(getGalleryExtensionIdFromLocal(local));
	}

	private findGalleryExtensionById(uuid: string): Promise<IGalleryExtension> {
		return this.galleryService.query({ ids: [uuid], pageSize: 1 }).then(galleryResult => galleryResult.firstPage[0]);
	}

	private findGalleryExtensionByName(name: string): Promise<IGalleryExtension> {
		return this.galleryService.query({ names: [name], pageSize: 1 }).then(galleryResult => galleryResult.firstPage[0]);
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

	private checkForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[]): Promise<void> {
		return this.preUninstallExtension(extension)
			.then(() => {
				const packedExtensions = this.getAllPackExtensionsToUninstall(extension, installed);
				if (packedExtensions.length) {
					return this.uninstallExtensions(extension, packedExtensions, installed);
				}
				return this.uninstallExtensions(extension, [], installed);
			})
			.then(() => this.postUninstallExtension(extension),
				error => {
					this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
					return Promise.reject(error);
				});
	}

	private uninstallExtensions(extension: ILocalExtension, otherExtensionsToUninstall: ILocalExtension[], installed: ILocalExtension[]): Promise<void> {
		const dependents = this.getDependents(extension, installed);
		if (dependents.length) {
			const remainingDependents = dependents.filter(dependent => extension !== dependent && otherExtensionsToUninstall.indexOf(dependent) === -1);
			if (remainingDependents.length) {
				return Promise.reject(new Error(this.getDependentsErrorMessage(extension, remainingDependents)));
			}
		}
		return Promise.all([this.uninstallExtension(extension), ...otherExtensionsToUninstall.map(d => this.doUninstall(d))]).then(() => undefined);
	}

	private getDependentsErrorMessage(extension: ILocalExtension, dependents: ILocalExtension[]): string {
		if (dependents.length === 1) {
			return nls.localize('singleDependentError', "Cannot uninstall extension '{0}'. Extension '{1}' depends on this.",
				extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
		}
		if (dependents.length === 2) {
			return nls.localize('twoDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
				extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		return nls.localize('multipleDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
			extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
	}

	private getAllPackExtensionsToUninstall(extension: ILocalExtension, installed: ILocalExtension[], checked: ILocalExtension[] = []): ILocalExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
		if (extensionsPack.length) {
			const packedExtensions = installed.filter(i => extensionsPack.some(id => areSameExtensions({ id }, i.galleryIdentifier)));
			const packOfPackedExtensions: ILocalExtension[] = [];
			for (const packedExtension of packedExtensions) {
				packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
			}
			return [...packedExtensions, ...packOfPackedExtensions];
		}
		return [];
	}

	private getDependents(extension: ILocalExtension, installed: ILocalExtension[]): ILocalExtension[] {
		return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.galleryIdentifier)));
	}

	private doUninstall(extension: ILocalExtension): Promise<void> {
		return this.preUninstallExtension(extension)
			.then(() => this.uninstallExtension(extension))
			.then(() => this.postUninstallExtension(extension),
				error => {
					this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
					return Promise.reject(error);
				});
	}

	private preUninstallExtension(extension: ILocalExtension): Promise<void> {
		return Promise.resolve(pfs.exists(extension.location.fsPath))
			.then(exists => exists ? null : Promise.reject(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => {
				this.logService.info('Uninstalling extension:', extension.identifier.id);
				this._onUninstallExtension.fire(extension.identifier);
			});
	}

	private uninstallExtension(local: ILocalExtension): Promise<void> {
		const id = getGalleryExtensionIdFromLocal(local);
		let promise = this.uninstallingExtensions.get(id);
		if (!promise) {
			// Set all versions of the extension as uninstalled
			promise = createCancelablePromise(token => this.scanUserExtensions(false)
				.then(userExtensions => this.setUninstalled(...userExtensions.filter(u => areSameExtensions({ id: getGalleryExtensionIdFromLocal(u), uuid: u.identifier.uuid }, { id, uuid: local.identifier.uuid }))))
				.then(() => { this.uninstallingExtensions.delete(id); }));
			this.uninstallingExtensions.set(id, promise);
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
				await this.galleryService.reportStatistic(extension.manifest.publisher, extension.manifest.name, extension.manifest.version, StatisticType.Uninstall);
			}
		}
		this.reportTelemetry('extensionGallery:uninstall', getLocalExtensionTelemetryData(extension), undefined, error);
		const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : undefined;
		this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: errorcode });
	}

	getInstalled(type: LocalExtensionType | null = null): Promise<ILocalExtension[]> {
		const promises: Promise<ILocalExtension[]>[] = [];

		if (type === null || type === LocalExtensionType.System) {
			promises.push(this.scanSystemExtensions().then(null, e => Promise.reject(new ExtensionManagementError(this.joinErrors(e).message, ERROR_SCANNING_SYS_EXTENSIONS))));
		}

		if (type === null || type === LocalExtensionType.User) {
			promises.push(this.scanUserExtensions(true).then(null, e => Promise.reject(new ExtensionManagementError(this.joinErrors(e).message, ERROR_SCANNING_USER_EXTENSIONS))));
		}

		return Promise.all<ILocalExtension[]>(promises).then(flatten, errors => Promise.reject(this.joinErrors(errors)));
	}

	private scanSystemExtensions(): Promise<ILocalExtension[]> {
		this.logService.trace('Started scanning system extensions');
		const systemExtensionsPromise = this.scanExtensions(this.systemExtensionsPath, LocalExtensionType.System)
			.then(result => {
				this.logService.info('Scanned system extensions:', result.length);
				return result;
			});
		if (this.environmentService.isBuilt) {
			return systemExtensionsPromise;
		}

		// Scan other system extensions during development
		const devSystemExtensionsPromise = this.getDevSystemExtensionsList()
			.then(devSystemExtensionsList => {
				if (devSystemExtensionsList.length) {
					return this.scanExtensions(this.devSystemExtensionsPath, LocalExtensionType.System)
						.then(result => {
							this.logService.info('Scanned dev system extensions:', result.length);
							return result.filter(r => devSystemExtensionsList.some(id => areSameExtensions(r.galleryIdentifier, { id })));
						});
				} else {
					return [];
				}
			});
		return Promise.all([systemExtensionsPromise, devSystemExtensionsPromise])
			.then(([systemExtensions, devSystemExtensions]) => [...systemExtensions, ...devSystemExtensions]);
	}

	private scanUserExtensions(excludeOutdated: boolean): Promise<ILocalExtension[]> {
		this.logService.trace('Started scanning user extensions');
		return Promise.all([this.getUninstalledExtensions(), this.scanExtensions(this.extensionsPath, LocalExtensionType.User)])
			.then(([uninstalled, extensions]) => {
				extensions = extensions.filter(e => !uninstalled[e.identifier.id]);
				if (excludeOutdated) {
					const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => ({ id: getGalleryExtensionIdFromLocal(e), uuid: e.identifier.uuid }));
					extensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
				}
				this.logService.info('Scanned user extensions:', extensions.length);
				return extensions;
			});
	}

	private scanExtensions(root: string, type: LocalExtensionType): Promise<ILocalExtension[]> {
		const limiter = new Limiter<any>(10);
		return pfs.readdir(root)
			.then(extensionsFolders => Promise.all<ILocalExtension>(extensionsFolders.map(extensionFolder => limiter.queue(() => this.scanExtension(extensionFolder, root, type)))))
			.then(extensions => extensions.filter(e => e && e.identifier));
	}

	private scanExtension(folderName: string, root: string, type: LocalExtensionType): Promise<ILocalExtension | null> {
		if (type === LocalExtensionType.User && folderName.indexOf('.') === 0) { // Do not consider user extension folder starting with `.`
			return Promise.resolve(null);
		}
		const extensionPath = path.join(root, folderName);
		return pfs.readdir(extensionPath)
			.then(children => readManifest(extensionPath)
				.then(({ manifest, metadata }) => {
					const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
					const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)) : null;
					const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
					const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)) : null;
					if (manifest.extensionDependencies) {
						manifest.extensionDependencies = manifest.extensionDependencies.map(id => adoptToGalleryExtensionId(id));
					}
					if (manifest.extensionPack) {
						manifest.extensionPack = manifest.extensionPack.map(id => adoptToGalleryExtensionId(id));
					}
					const identifier = { id: type === LocalExtensionType.System ? folderName : getLocalExtensionIdFromManifest(manifest), uuid: metadata ? metadata.id : null };
					const galleryIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier.uuid };
					return <ILocalExtension>{ type, identifier, galleryIdentifier, manifest, metadata, location: URI.file(extensionPath), readmeUrl, changelogUrl };
				}))
			.then(undefined, () => null);
	}

	removeDeprecatedExtensions(): Promise<any> {
		return this.removeUninstalledExtensions()
			.then(() => this.removeOutdatedExtensions());
	}

	private removeUninstalledExtensions(): Promise<void> {
		return this.getUninstalledExtensions()
			.then(uninstalled => this.scanExtensions(this.extensionsPath, LocalExtensionType.User) // All user extensions
				.then(extensions => {
					const toRemove: ILocalExtension[] = extensions.filter(e => uninstalled[e.identifier.id]);
					return Promise.all(toRemove.map(e => this.extensionLifecycle.postUninstall(e).then(() => this.removeUninstalledExtension(e))));
				})
			).then(() => undefined);
	}

	private removeOutdatedExtensions(): Promise<void> {
		return this.scanExtensions(this.extensionsPath, LocalExtensionType.User) // All user extensions
			.then(extensions => {
				const toRemove: ILocalExtension[] = [];

				// Outdated extensions
				const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => ({ id: getGalleryExtensionIdFromLocal(e), uuid: e.identifier.uuid }));
				toRemove.push(...flatten(byExtension.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version)).slice(1))));

				return Promise.all(toRemove.map(extension => this.removeExtension(extension, 'outdated')));
			}).then(() => undefined);
	}

	private removeUninstalledExtension(extension: ILocalExtension): Promise<void> {
		return this.removeExtension(extension, 'uninstalled')
			.then(() => this.withUninstalledExtensions(uninstalled => delete uninstalled[extension.identifier.id]))
			.then(() => undefined);
	}

	private removeExtension(extension: ILocalExtension, type: string): Promise<void> {
		this.logService.trace(`Deleting ${type} extension from disk`, extension.identifier.id);
		return pfs.rimraf(extension.location.fsPath).then(() => this.logService.info('Deleted from disk', extension.identifier.id));
	}

	private isUninstalled(id: string): Promise<boolean> {
		return this.filterUninstalled(id).then(uninstalled => uninstalled.length === 1);
	}

	private filterUninstalled(...ids: string[]): Promise<string[]> {
		return this.withUninstalledExtensions(allUninstalled => {
			const uninstalled: string[] = [];
			for (const id of ids) {
				if (!!allUninstalled[id]) {
					uninstalled.push(id);
				}
			}
			return uninstalled;
		});
	}

	private setUninstalled(...extensions: ILocalExtension[]): Promise<{ [id: string]: boolean }> {
		const ids = extensions.map(e => e.identifier.id);
		return this.withUninstalledExtensions(uninstalled => assign(uninstalled, ids.reduce((result, id) => { result[id] = true; return result; }, {} as { [id: string]: boolean })));
	}

	private unsetUninstalled(id: string): Promise<void> {
		return this.withUninstalledExtensions<void>(uninstalled => delete uninstalled[id]);
	}

	private getUninstalledExtensions(): Promise<{ [id: string]: boolean; }> {
		return this.withUninstalledExtensions(uninstalled => uninstalled);
	}

	private async withUninstalledExtensions<T>(fn: (uninstalled: { [id: string]: boolean; }) => T): Promise<T> {
		return await this.uninstalledFileLimiter.queue(() => {
			let result: T | null = null;
			return pfs.readFile(this.uninstalledPath, 'utf8')
				.then(undefined, err => err.code === 'ENOENT' ? Promise.resolve('{}') : Promise.reject(err))
				.then<{ [id: string]: boolean }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; } })
				.then(uninstalled => { result = fn(uninstalled); return uninstalled; })
				.then(uninstalled => {
					if (Object.keys(uninstalled).length === 0) {
						return pfs.rimraf(this.uninstalledPath);
					} else {
						const raw = JSON.stringify(uninstalled);
						return pfs.writeFile(this.uninstalledPath, raw);
					}
				})
				.then(() => result);
		});
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		const now = new Date().getTime();

		if (!this.reportedExtensions || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
			this.reportedExtensions = this.updateReportCache();
			this.lastReportTimestamp = now;
		}

		return this.reportedExtensions;
	}

	private updateReportCache(): Promise<IReportedExtension[]> {
		this.logService.trace('ExtensionManagementService.refreshReportedCache');

		return this.galleryService.getExtensionsReport()
			.then(result => {
				this.logService.trace(`ExtensionManagementService.refreshReportedCache - got ${result.length} reported extensions from service`);
				return result;
			}, err => {
				this.logService.trace('ExtensionManagementService.refreshReportedCache - failed to get extension report');
				return [];
			});
	}

	private _devSystemExtensionsPath: string | null = null;
	private get devSystemExtensionsPath(): string {
		if (!this._devSystemExtensionsPath) {
			this._devSystemExtensionsPath = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', '.build', 'builtInExtensions'));
		}
		return this._devSystemExtensionsPath;
	}

	private _devSystemExtensionsFilePath: string | null = null;
	private get devSystemExtensionsFilePath(): string {
		if (!this._devSystemExtensionsFilePath) {
			this._devSystemExtensionsFilePath = path.normalize(path.join(getPathFromAmdModule(require, ''), '..', 'build', 'builtInExtensions.json'));
		}
		return this._devSystemExtensionsFilePath;
	}

	private getDevSystemExtensionsList(): Promise<string[]> {
		return pfs.readFile(this.devSystemExtensionsFilePath, 'utf8')
			.then<string[]>(raw => {
				const parsed: { name: string }[] = JSON.parse(raw);
				return parsed.map(({ name }) => name);
			});
	}

	private toNonCancellablePromise<T>(promise: Promise<T>): Promise<T> {
		return new Promise((c, e) => promise.then(result => c(result), error => e(error)));
	}

	private reportTelemetry(eventName: string, extensionData: any, duration?: number, error?: Error): void {
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
		this.telemetryService.publicLog(eventName, assign(extensionData, { success: !error, duration, errorcode }));
	}
}

export function getLocalExtensionIdFromGallery(extension: IGalleryExtension, version: string): string {
	return getLocalExtensionId(extension.identifier.id, version);
}

export function getLocalExtensionIdFromManifest(manifest: IExtensionManifest): string {
	return getLocalExtensionId(getGalleryExtensionId(manifest.publisher, manifest.name), manifest.version);
}
