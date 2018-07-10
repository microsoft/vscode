/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import { assign } from 'vs/base/common/objects';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { flatten } from 'vs/base/common/arrays';
import { extract, buffer, ExtractError } from 'vs/base/node/zip';
import { TPromise } from 'vs/base/common/winjs.base';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, LocalExtensionType,
	StatisticType,
	IExtensionIdentifier,
	IReportedExtension,
	InstallOperation
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal, adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, groupByExtension, getMaliciousExtensionsSet, getLocalExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, getIdFromLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from '../common/extensionNls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter, always } from 'vs/base/common/async';
import { Event, Emitter } from 'vs/base/common/event';
import * as semver from 'semver';
import URI from 'vs/base/common/uri';
import pkg from 'vs/platform/node/package';
import { isMacintosh, isWindows } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { isEngineValid } from 'vs/platform/extensions/node/extensionValidator';

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));
const ERROR_SCANNING_SYS_EXTENSIONS = 'scanningSystem';
const ERROR_SCANNING_USER_EXTENSIONS = 'scanningUser';
const INSTALL_ERROR_UNSET_UNINSTALLED = 'unsetUninstalled';
const INSTALL_ERROR_INCOMPATIBLE = 'incompatible';
const INSTALL_ERROR_DOWNLOADING = 'downloading';
const INSTALL_ERROR_VALIDATING = 'validating';
const INSTALL_ERROR_GALLERY = 'gallery';
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

function parseManifest(raw: string): TPromise<{ manifest: IExtensionManifest; metadata: IGalleryMetadata; }> {
	return new TPromise((c, e) => {
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

export function validateLocalExtension(zipPath: string): TPromise<IExtensionManifest> {
	return buffer(zipPath, 'extension/package.json')
		.then(buffer => parseManifest(buffer.toString('utf8')))
		.then(({ manifest }) => TPromise.as(manifest));
}

function readManifest(extensionPath: string): TPromise<{ manifest: IExtensionManifest; metadata: IGalleryMetadata; }> {
	const promises = [
		pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
			.then(raw => parseManifest(raw)),
		pfs.readFile(path.join(extensionPath, 'package.nls.json'), 'utf8')
			.then(null, err => err.code !== 'ENOENT' ? TPromise.wrapError<string>(err) : '{}')
			.then(raw => JSON.parse(raw))
	];

	return TPromise.join<any>(promises).then(([{ manifest, metadata }, translations]) => {
		return {
			manifest: localizeManifest(manifest, translations),
			metadata
		};
	});
}

interface InstallableExtension {
	zipPath: string;
	id: string;
	metadata?: IGalleryMetadata;
}

export class ExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: any;

	private extensionsPath: string;
	private uninstalledPath: string;
	private uninstalledFileLimiter: Limiter<void>;
	private reportedExtensions: TPromise<IReportedExtension[]> | undefined;
	private lastReportTimestamp = 0;
	private readonly installationStartTime: Map<string, number> = new Map<string, number>();
	private readonly installingExtensions: Map<string, TPromise<ILocalExtension>> = new Map<string, TPromise<ILocalExtension>>();
	private readonly uninstallingExtensions: Map<string, TPromise<void>> = new Map<string, TPromise<void>>();
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
		@IEnvironmentService environmentService: IEnvironmentService,
		@IDialogService private dialogService: IDialogService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@ILogService private logService: ILogService,
		@ITelemetryService private telemetryService: ITelemetryService,
	) {
		super();
		this.extensionsPath = environmentService.extensionsPath;
		this.uninstalledPath = path.join(this.extensionsPath, '.obsolete');
		this.uninstalledFileLimiter = new Limiter(1);
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionLifecycle = this._register(new ExtensionsLifecycle(this.logService));

		this._register(toDisposable(() => {
			this.installingExtensions.forEach(promise => promise.cancel());
			this.uninstallingExtensions.forEach(promise => promise.cancel());
			this.installingExtensions.clear();
			this.uninstallingExtensions.clear();
		}));
	}

	install(zipPath: string): TPromise<void> {
		zipPath = path.resolve(zipPath);

		return validateLocalExtension(zipPath)
			.then(manifest => {
				const identifier = { id: getLocalExtensionIdFromManifest(manifest) };
				if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode)) {
					return TPromise.wrapError<void>(new Error(nls.localize('incompatible', "Unable to install Extension '{0}' as it is not compatible with Code '{1}'.", identifier.id, pkg.version)));
				}
				return this.removeIfExists(identifier.id)
					.then(
						() => this.checkOutdated(manifest)
							.then(validated => {
								if (validated) {
									this.logService.info('Installing the extension:', identifier.id);
									this._onInstallExtension.fire({ identifier, zipPath });
									return this.getMetadata(getGalleryExtensionId(manifest.publisher, manifest.name))
										.then(
											metadata => this.installFromZipPath(identifier, zipPath, metadata, manifest),
											error => this.installFromZipPath(identifier, zipPath, null, manifest))
										.then(
											() => { this.logService.info('Successfully installed the extension:', identifier.id); },
											e => {
												this.logService.error('Failed to install the extension:', identifier.id, e.message);
												return TPromise.wrapError(e);
											});
								}
								return null;
							}),
						e => TPromise.wrapError(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", manifest.displayName || manifest.name))));
			});
	}

	private removeIfExists(id: string): TPromise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed => installed.filter(i => i.identifier.id === id)[0])
			.then(existing => existing ? this.removeExtension(existing, 'existing') : null);
	}

	private checkOutdated(manifest: IExtensionManifest): TPromise<boolean> {
		const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
		return this.getInstalled(LocalExtensionType.User)
			.then(installedExtensions => {
				const newer = installedExtensions.filter(local => areSameExtensions(extensionIdentifier, { id: getGalleryExtensionIdFromLocal(local) }) && semver.gt(local.manifest.version, manifest.version))[0];
				if (newer) {
					const message = nls.localize('installingOutdatedExtension', "A newer version of this extension is already installed. Would you like to override this with the older version?");
					const buttons = [
						nls.localize('override', "Override"),
						nls.localize('cancel', "Cancel")
					];
					return this.dialogService.show(Severity.Info, message, buttons, { cancelId: 1 })
						.then<boolean>(value => {
							if (value === 0) {
								return this.uninstall(newer, true).then(() => true);
							}
							return TPromise.wrapError(errors.canceled());
						});
				}
				return true;
			});
	}

	private installFromZipPath(identifier: IExtensionIdentifier, zipPath: string, metadata: IGalleryMetadata, manifest: IExtensionManifest): TPromise<ILocalExtension> {
		return this.toNonCancellablePromise(this.getInstalled()
			.then(installed => {
				const operation = this.getOperation({ id: getIdFromLocalExtensionId(identifier.id), uuid: identifier.uuid }, installed);
				return this.installExtension({ zipPath, id: identifier.id, metadata })
					.then(local => {
						if (this.galleryService.isEnabled() && local.manifest.extensionDependencies && local.manifest.extensionDependencies.length) {
							return this.getDependenciesToInstall(local.manifest.extensionDependencies)
								.then(dependenciesToInstall => {
									dependenciesToInstall = metadata ? dependenciesToInstall.filter(d => d.identifier.uuid !== metadata.id) : dependenciesToInstall;
									return this.downloadAndInstallExtensions(dependenciesToInstall, dependenciesToInstall.map(d => this.getOperation(d.identifier, installed)));
								})
								.then(() => local, error => {
									this.setUninstalled(local);
									return TPromise.wrapError(new Error(nls.localize('errorInstallingDependencies', "Error while installing dependencies. {0}", error instanceof Error ? error.message : error)));
								});
						}
						return local;
					})
					.then(
						local => { this._onDidInstallExtension.fire({ identifier, zipPath, local, operation }); return local; },
						error => { this._onDidInstallExtension.fire({ identifier, zipPath, operation, error }); return TPromise.wrapError(error); }
					);
			}));
	}

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		this.onInstallExtensions([extension]);
		return this.toNonCancellablePromise(this.getInstalled(LocalExtensionType.User)
			.then(installed => this.collectExtensionsToInstall(extension)
				.then(
					extensionsToInstall => {
						if (extensionsToInstall.length > 1) {
							this.onInstallExtensions(extensionsToInstall.slice(1));
						}
						const operataions: InstallOperation[] = extensionsToInstall.map(e => this.getOperation(e.identifier, installed));
						return this.downloadAndInstallExtensions(extensionsToInstall, operataions)
							.then(
								locals => this.onDidInstallExtensions(extensionsToInstall, locals, operataions, [])
									.then(() => null),
								errors => this.onDidInstallExtensions(extensionsToInstall, [], operataions, errors));
					},
					error => this.onDidInstallExtensions([extension], [], [this.getOperation(extension.identifier, installed)], [error]))));
	}

	reinstallFromGallery(extension: ILocalExtension): TPromise<void> {
		if (!this.galleryService.isEnabled()) {
			return TPromise.wrapError(new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled")));
		}
		return this.findGalleryExtension(extension)
			.then(galleryExtension => {
				if (galleryExtension) {
					return this.setUninstalled(extension)
						.then(() => this.removeUninstalledExtension(extension)
							.then(
								() => this.installFromGallery(galleryExtension),
								e => TPromise.wrapError(new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e))))));
				}
				return TPromise.wrapError(new Error(nls.localize('Not a Marketplace extension', "Only Marketplace Extensions can be reinstalled")));
			});
	}

	private getOperation(extensionToInstall: IExtensionIdentifier, installed: ILocalExtension[]): InstallOperation {
		return installed.some(i => areSameExtensions({ id: getGalleryExtensionIdFromLocal(i), uuid: i.identifier.uuid }, extensionToInstall)) ? InstallOperation.Update : InstallOperation.Install;
	}

	private collectExtensionsToInstall(extension: IGalleryExtension): TPromise<IGalleryExtension[]> {
		return this.galleryService.loadCompatibleVersion(extension)
			.then(compatible => {
				if (!compatible) {
					return TPromise.wrapError<IGalleryExtension[]>(new ExtensionManagementError(nls.localize('notFoundCompatible', "Unable to install '{0}'; there is no available version compatible with VS Code '{1}'.", extension.identifier.id, pkg.version), INSTALL_ERROR_INCOMPATIBLE));
				}
				return this.getDependenciesToInstall(compatible.properties.dependencies)
					.then(
						dependenciesToInstall => ([compatible, ...dependenciesToInstall.filter(d => d.identifier.uuid !== compatible.identifier.uuid)]),
						error => TPromise.wrapError<IGalleryExtension[]>(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_GALLERY)));
			},
				error => TPromise.wrapError<IGalleryExtension[]>(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_GALLERY)));
	}

	private downloadAndInstallExtensions(extensions: IGalleryExtension[], operations: InstallOperation[]): TPromise<ILocalExtension[]> {
		return TPromise.join(extensions.map((extensionToInstall, index) => this.downloadAndInstallExtension(extensionToInstall, operations[index])))
			.then(null, errors => this.rollback(extensions).then(() => TPromise.wrapError(errors), () => TPromise.wrapError(errors)));
	}

	private downloadAndInstallExtension(extension: IGalleryExtension, operation: InstallOperation): TPromise<ILocalExtension> {
		let installingExtension = this.installingExtensions.get(extension.identifier.id);
		if (!installingExtension) {
			installingExtension = this.getExtensionsReport()
				.then(report => {
					if (getMaliciousExtensionsSet(report).has(extension.identifier.id)) {
						throw new Error(nls.localize('malicious extension', "Can't install extension since it was reported to be problematic."));
					} else {
						return extension;
					}
				})
				.then(extension => this.downloadInstallableExtension(extension, operation))
				.then(installableExtension => this.installExtension(installableExtension))
				.then(
					local => { this.installingExtensions.delete(extension.identifier.id); return local; },
					e => { this.installingExtensions.delete(extension.identifier.id); return TPromise.wrapError(e); }
				);

			this.installingExtensions.set(extension.identifier.id, installingExtension);
		}
		return installingExtension;
	}

	private downloadInstallableExtension(extension: IGalleryExtension, operation: InstallOperation): TPromise<InstallableExtension> {
		const metadata = <IGalleryMetadata>{
			id: extension.identifier.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
		};

		return this.galleryService.loadCompatibleVersion(extension)
			.then(
				compatible => {
					if (compatible) {
						this.logService.trace('Started downloading extension:', extension.name);
						return this.galleryService.download(extension, operation)
							.then(
								zipPath => {
									this.logService.info('Downloaded extension:', extension.name);
									return validateLocalExtension(zipPath)
										.then(
											manifest => (<InstallableExtension>{ zipPath, id: getLocalExtensionIdFromManifest(manifest), metadata }),
											error => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_VALIDATING))
										);
								},
								error => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_DOWNLOADING)));
					} else {
						return TPromise.wrapError<InstallableExtension>(new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Unable to install because, the depending extension '{0}' compatible with current version '{1}' of VS Code is not found.", extension.identifier.id, pkg.version), INSTALL_ERROR_INCOMPATIBLE));
					}
				},
				error => TPromise.wrapError<InstallableExtension>(new ExtensionManagementError(this.joinErrors(error).message, INSTALL_ERROR_GALLERY)));
	}

	private onInstallExtensions(extensions: IGalleryExtension[]): void {
		for (const extension of extensions) {
			this.logService.info('Installing extension:', extension.name);
			this.installationStartTime.set(extension.identifier.id, new Date().getTime());
			const id = getLocalExtensionIdFromGallery(extension, extension.version);
			this._onInstallExtension.fire({ identifier: { id, uuid: extension.identifier.uuid }, gallery: extension });
		}
	}

	private onDidInstallExtensions(extensions: IGalleryExtension[], locals: ILocalExtension[], operations: InstallOperation[], errors: Error[]): TPromise<any> {
		extensions.forEach((gallery, index) => {
			const identifier = { id: getLocalExtensionIdFromGallery(gallery, gallery.version), uuid: gallery.identifier.uuid };
			const local = locals[index];
			const error = errors[index];
			const operation = operations[index];
			if (local) {
				this.logService.info(`Extensions installed successfully:`, gallery.identifier.id);
				this._onDidInstallExtension.fire({ identifier, gallery, local, operation });
			} else {
				const errorCode = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : ERROR_UNKNOWN;
				this.logService.error(`Failed to install extension:`, gallery.identifier.id, error ? error.message : errorCode);
				this._onDidInstallExtension.fire({ identifier, gallery, operation, error: errorCode });
			}
			const startTime = this.installationStartTime.get(gallery.identifier.id);
			this.reportTelemetry(operations[index] === InstallOperation.Update ? 'extensionGallery:update' : 'extensionGallery:install', getGalleryExtensionTelemetryData(gallery), startTime ? new Date().getTime() - startTime : void 0, error);
			this.installationStartTime.delete(gallery.identifier.id);
		});
		return errors.length ? TPromise.wrapError(this.joinErrors(errors)) : TPromise.as(null);
	}

	private getDependenciesToInstall(dependencies: string[]): TPromise<IGalleryExtension[]> {
		if (dependencies.length) {
			return this.getInstalled()
				.then(installed => {
					const uninstalledDeps = dependencies.filter(id => installed.every(i => !areSameExtensions(i.galleryIdentifier, { id })));
					if (uninstalledDeps.length) {
						return this.galleryService.loadAllDependencies(uninstalledDeps.map(id => (<IExtensionIdentifier>{ id })))
							.then(allDependencies => allDependencies.filter(d => {
								const extensionId = getLocalExtensionIdFromGallery(d, d.version);
								return installed.every(({ identifier }) => identifier.id !== extensionId);
							}));
					}
					return [];
				});
		}
		return TPromise.as([]);
	}

	private installExtension(installableExtension: InstallableExtension): TPromise<ILocalExtension> {
		return this.unsetUninstalledAndGetLocal(installableExtension.id)
			.then(
				local => {
					if (local) {
						return local;
					}
					return this.extractAndInstall(installableExtension);
				},
				e => {
					if (isMacintosh) {
						return TPromise.wrapError<ILocalExtension>(new ExtensionManagementError(nls.localize('quitCode', "Unable to install the extension. Please Quit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED));
					}
					return TPromise.wrapError<ILocalExtension>(new ExtensionManagementError(nls.localize('exitCode', "Unable to install the extension. Please Exit and Start VS Code before reinstalling."), INSTALL_ERROR_UNSET_UNINSTALLED));
				});
	}

	private unsetUninstalledAndGetLocal(id: string): TPromise<ILocalExtension> {
		return this.isUninstalled(id)
			.then(isUninstalled => {
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

	private extractAndInstall({ zipPath, id, metadata }: InstallableExtension): TPromise<ILocalExtension> {
		const tempPath = path.join(this.extensionsPath, `.${id}`);
		const extensionPath = path.join(this.extensionsPath, id);
		return pfs.rimraf(extensionPath)
			.then(() => this.extractAndRename(id, zipPath, tempPath, extensionPath), e => TPromise.wrapError(new ExtensionManagementError(nls.localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionPath, id), INSTALL_ERROR_DELETING)))
			.then(() => {
				this.logService.info('Installation completed.', id);
				return this.scanExtension(id, this.extensionsPath, LocalExtensionType.User);
			})
			.then(local => {
				if (metadata) {
					local.metadata = metadata;
					return this.saveMetadataForLocalExtension(local);
				}
				return local;
			});
	}

	private extractAndRename(id: string, zipPath: string, extractPath: string, renamePath: string): TPromise<void> {
		return this.extract(id, zipPath, extractPath)
			.then(() => this.rename(id, extractPath, renamePath, Date.now() + (2 * 60 * 1000) /* Retry for 2 minutes */)
				.then(
					() => this.logService.info('Renamed to', renamePath),
					e => {
						this.logService.info('Rename failed. Deleting from extracted location', extractPath);
						return always(pfs.rimraf(extractPath), () => null).then(() => TPromise.wrapError(e));
					}));
	}

	private extract(id: string, zipPath: string, extractPath: string): TPromise<void> {
		this.logService.trace(`Started extracting the extension from ${zipPath} to ${extractPath}`);
		return pfs.rimraf(extractPath)
			.then(
				() => extract(zipPath, extractPath, { sourcePath: 'extension', overwrite: true }, this.logService)
					.then(
						() => this.logService.info(`Extracted extension to ${extractPath}:`, id),
						e => always(pfs.rimraf(extractPath), () => null)
							.then(() => TPromise.wrapError(new ExtensionManagementError(e.message, e instanceof ExtractError ? e.type : INSTALL_ERROR_EXTRACTING)))),
				e => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(e).message, INSTALL_ERROR_DELETING)));
	}

	private rename(id: string, extractPath: string, renamePath: string, retryUntil: number): TPromise<void> {
		return pfs.rename(extractPath, renamePath)
			.then(null, error => {
				if (isWindows && error && error.code === 'EPERM' && Date.now() < retryUntil) {
					this.logService.info(`Failed renaming ${extractPath} to ${renamePath} with 'EPERM' error. Trying again...`);
					return this.rename(id, extractPath, renamePath, retryUntil);
				}
				return TPromise.wrapError(new ExtensionManagementError(error.message || nls.localize('renameError', "Unknown error while renaming {0} to {1}", extractPath, renamePath), error.code || INSTALL_ERROR_RENAMING));
			});
	}

	private rollback(extensions: IGalleryExtension[]): TPromise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed =>
				TPromise.join(installed.filter(local => extensions.some(galleryExtension => local.identifier.id === getLocalExtensionIdFromGallery(galleryExtension, galleryExtension.version))) // Only check id (pub.name-version) because we want to rollback the exact version
					.map(local => this.setUninstalled(local))))
			.then(() => null, () => null);
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.toNonCancellablePromise(this.getInstalled(LocalExtensionType.User)
			.then(installed => {
				const promises = installed
					.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name)
					.map(e => this.checkForDependenciesAndUninstall(e, installed, force));
				return TPromise.join(promises).then(() => null, error => TPromise.wrapError(this.joinErrors(error)));
			}));
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		local.metadata = metadata;
		return this.saveMetadataForLocalExtension(local)
			.then(localExtension => {
				this.manifestCache.invalidate();
				return localExtension;
			});
	}

	private saveMetadataForLocalExtension(local: ILocalExtension): TPromise<ILocalExtension> {
		if (!local.metadata) {
			return TPromise.as(local);
		}
		const manifestPath = path.join(this.extensionsPath, local.identifier.id, 'package.json');
		return pfs.readFile(manifestPath, 'utf8')
			.then(raw => parseManifest(raw))
			.then(({ manifest }) => assign(manifest, { __metadata: local.metadata }))
			.then(manifest => pfs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t')))
			.then(() => local);
	}

	private getMetadata(extensionName: string): TPromise<IGalleryMetadata> {
		return this.findGalleryExtensionByName(extensionName)
			.then(galleryExtension => galleryExtension ? <IGalleryMetadata>{ id: galleryExtension.identifier.uuid, publisherDisplayName: galleryExtension.publisherDisplayName, publisherId: galleryExtension.publisherId } : null);
	}

	private findGalleryExtension(local: ILocalExtension): TPromise<IGalleryExtension> {
		if (local.identifier.uuid) {
			return this.findGalleryExtensionById(local.identifier.uuid)
				.then(galleryExtension => galleryExtension ? galleryExtension : this.findGalleryExtensionByName(getGalleryExtensionIdFromLocal(local)));
		}
		return this.findGalleryExtensionByName(getGalleryExtensionIdFromLocal(local));
	}

	private findGalleryExtensionById(uuid: string): TPromise<IGalleryExtension> {
		return this.galleryService.query({ ids: [uuid], pageSize: 1 }).then(galleryResult => galleryResult.firstPage[0]);
	}

	private findGalleryExtensionByName(name: string): TPromise<IGalleryExtension> {
		return this.galleryService.query({ names: [name], pageSize: 1 }).then(galleryResult => galleryResult.firstPage[0]);
	}

	private joinErrors(errorOrErrors: (Error | string) | ((Error | string)[])): Error {
		const errors = Array.isArray(errorOrErrors) ? errorOrErrors : [errorOrErrors];
		if (errors.length === 1) {
			return errors[0] instanceof Error ? <Error>errors[0] : new Error(<string>errors[0]);
		}
		return errors.reduce<Error>((previousValue: Error, currentValue: Error | string) => {
			return new Error(`${previousValue.message}${previousValue.message ? ',' : ''}${currentValue instanceof Error ? currentValue.message : currentValue}`);
		}, new Error(''));
	}

	private checkForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], force: boolean): TPromise<void> {
		return this.preUninstallExtension(extension)
			.then(() => this.hasDependencies(extension, installed) ? this.promptForDependenciesAndUninstall(extension, installed, force) : this.uninstallExtensions(extension, [], installed))
			.then(() => this.postUninstallExtension(extension),
				error => {
					this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
					return TPromise.wrapError(error);
				});
	}

	private hasDependencies(extension: ILocalExtension, installed: ILocalExtension[]): boolean {
		if (extension.manifest.extensionDependencies && extension.manifest.extensionDependencies.length) {
			return installed.some(i => extension.manifest.extensionDependencies.some(dep => areSameExtensions({ id: dep }, i.galleryIdentifier)));
		}
		return false;
	}

	private promptForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], force: boolean): TPromise<void> {
		if (force) {
			return this.uninstallExtensionWithDependencies(extension, installed);
		}

		const message = nls.localize('uninstallDependeciesConfirmation', "Would you like to uninstall '{0}' only or its dependencies also?", extension.manifest.displayName || extension.manifest.name);
		const buttons = [
			nls.localize('uninstallOnly', "Extension Only"),
			nls.localize('uninstallAll', "Uninstall All"),
			nls.localize('cancel', "Cancel")
		];
		this.logService.info('Requesting for confirmation to uninstall extension with dependencies', extension.identifier.id);
		return this.dialogService.show(Severity.Info, message, buttons, { cancelId: 2 })
			.then<void>(value => {
				if (value === 0) {
					return this.uninstallExtensions(extension, [], installed);
				}
				if (value === 1) {
					return this.uninstallExtensionWithDependencies(extension, installed);
				}
				this.logService.info('Cancelled uninstalling extension:', extension.identifier.id);
				return TPromise.wrapError(errors.canceled());
			}, error => TPromise.wrapError(errors.canceled()));
	}

	private uninstallExtensionWithDependencies(extension: ILocalExtension, installed: ILocalExtension[]): TPromise<void> {
		const dependencies = this.getAllDependenciesToUninstall(extension, installed).filter(e => e !== extension);

		const dependenciesToUninstall = dependencies.slice(0);
		for (let index = 0; index < dependencies.length; index++) {
			const dep = dependencies[index];
			const dependents = this.getMandatoryDependents(dep, installed);
			// Remove the dependency from the uninstall list if there is a dependent which will not be uninstalled.
			if (dependents.some(e => e !== extension && dependencies.indexOf(e) === -1)) {
				dependenciesToUninstall.splice(index - (dependencies.length - dependenciesToUninstall.length), 1);
			}
		}

		return this.uninstallExtensions(extension, dependenciesToUninstall, installed);
	}

	private uninstallExtensions(extension: ILocalExtension, otherExtensions: ILocalExtension[], installed: ILocalExtension[]): TPromise<void> {
		const mandatoryDependents = this.getMandatoryDependents(extension, installed);
		if (mandatoryDependents.length) {
			const dependents = mandatoryDependents.filter(dependent => extension !== dependent && otherExtensions.indexOf(dependent) === -1);
			if (dependents.length) {
				return TPromise.wrapError<void>(new Error(this.getDependentsErrorMessage(extension, dependents)));
			}
		}
		return TPromise.join([this.uninstallExtension(extension), ...otherExtensions.map(d => this.doUninstall(d))]).then(() => null);
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

	private getAllDependenciesToUninstall(extension: ILocalExtension, installed: ILocalExtension[], checked: ILocalExtension[] = []): ILocalExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		if (!extension.manifest.extensionDependencies || extension.manifest.extensionDependencies.length === 0) {
			return [];
		}
		const dependenciesToUninstall = installed.filter(i => extension.manifest.extensionDependencies.some(id => areSameExtensions({ id }, i.galleryIdentifier)));
		const depsOfDeps = [];
		for (const dep of dependenciesToUninstall) {
			depsOfDeps.push(...this.getAllDependenciesToUninstall(dep, installed, checked));
		}
		return [...dependenciesToUninstall, ...depsOfDeps];
	}

	private getMandatoryDependents(extension: ILocalExtension, installed: ILocalExtension[]): ILocalExtension[] {
		return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.galleryIdentifier)));
	}

	private doUninstall(extension: ILocalExtension): TPromise<void> {
		return this.preUninstallExtension(extension)
			.then(() => this.uninstallExtension(extension))
			.then(() => this.postUninstallExtension(extension),
				error => {
					this.postUninstallExtension(extension, new ExtensionManagementError(error instanceof Error ? error.message : error, INSTALL_ERROR_LOCAL));
					return TPromise.wrapError(error);
				});
	}

	private preUninstallExtension(extension: ILocalExtension): TPromise<void> {
		return pfs.exists(extension.location.fsPath)
			.then(exists => exists ? null : TPromise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => {
				this.logService.info('Uninstalling extension:', extension.identifier.id);
				this._onUninstallExtension.fire(extension.identifier);
			});
	}

	private uninstallExtension(local: ILocalExtension): TPromise<void> {
		const id = getGalleryExtensionIdFromLocal(local);
		let promise = this.uninstallingExtensions.get(id);
		if (!promise) {
			// Set all versions of the extension as uninstalled
			promise = this.scanUserExtensions(false)
				.then(userExtensions => this.setUninstalled(...userExtensions.filter(u => areSameExtensions({ id: getGalleryExtensionIdFromLocal(u), uuid: u.identifier.uuid }, { id, uuid: local.identifier.uuid }))))
				.then(() => { this.uninstallingExtensions.delete(id); });
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
		this.reportTelemetry('extensionGallery:uninstall', getLocalExtensionTelemetryData(extension), void 0, error);
		const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : void 0;
		this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: errorcode });
	}

	getInstalled(type: LocalExtensionType = null): TPromise<ILocalExtension[]> {
		const promises = [];

		if (type === null || type === LocalExtensionType.System) {
			promises.push(this.scanSystemExtensions().then(null, e => new ExtensionManagementError(this.joinErrors(e).message, ERROR_SCANNING_SYS_EXTENSIONS)));
		}

		if (type === null || type === LocalExtensionType.User) {
			promises.push(this.scanUserExtensions(true).then(null, e => new ExtensionManagementError(this.joinErrors(e).message, ERROR_SCANNING_USER_EXTENSIONS)));
		}

		return TPromise.join<ILocalExtension[]>(promises).then(flatten, errors => TPromise.wrapError<ILocalExtension[]>(this.joinErrors(errors)));
	}

	private scanSystemExtensions(): TPromise<ILocalExtension[]> {
		this.logService.trace('Started scanning system extensions');
		return this.scanExtensions(SystemExtensionsRoot, LocalExtensionType.System)
			.then(result => {
				this.logService.info('Scanned system extensions:', result.length);
				return result;
			});
	}

	private scanUserExtensions(excludeOutdated: boolean): TPromise<ILocalExtension[]> {
		this.logService.trace('Started scanning user extensions');
		return TPromise.join([this.getUninstalledExtensions(), this.scanExtensions(this.extensionsPath, LocalExtensionType.User)])
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

	private scanExtensions(root: string, type: LocalExtensionType): TPromise<ILocalExtension[]> {
		const limiter = new Limiter(10);
		return pfs.readdir(root)
			.then(extensionsFolders => TPromise.join<ILocalExtension>(extensionsFolders.map(extensionFolder => limiter.queue(() => this.scanExtension(extensionFolder, root, type)))))
			.then(extensions => extensions.filter(e => e && e.identifier));
	}

	private scanExtension(folderName: string, root: string, type: LocalExtensionType): TPromise<ILocalExtension> {
		if (type === LocalExtensionType.User && folderName.indexOf('.') === 0) { // Do not consider user exension folder starting with `.`
			return TPromise.as(null);
		}
		const extensionPath = path.join(root, folderName);
		return pfs.readdir(extensionPath)
			.then(children => readManifest(extensionPath)
				.then<ILocalExtension>(({ manifest, metadata }) => {
					const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
					const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
					const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
					const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;
					manifest.extensionDependencies = manifest.extensionDependencies ? manifest.extensionDependencies = manifest.extensionDependencies.map(id => adoptToGalleryExtensionId(id)) : [];
					const identifier = { id: type === LocalExtensionType.System ? folderName : getLocalExtensionIdFromManifest(manifest), uuid: metadata ? metadata.id : null };
					const galleryIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier.uuid };
					return { type, identifier, galleryIdentifier, manifest, metadata, location: URI.file(extensionPath), readmeUrl, changelogUrl };
				}))
			.then(null, () => null);
	}

	removeDeprecatedExtensions(): TPromise<any> {
		return this.removeUninstalledExtensions()
			.then(() => this.removeOutdatedExtensions());
	}

	private removeUninstalledExtensions(): TPromise<void> {
		return this.getUninstalledExtensions()
			.then(uninstalled => this.scanExtensions(this.extensionsPath, LocalExtensionType.User) // All user extensions
				.then(extensions => {
					const toRemove: ILocalExtension[] = extensions.filter(e => uninstalled[e.identifier.id]);
					return TPromise.join(toRemove.map(e => this.extensionLifecycle.uninstall(e).then(() => this.removeUninstalledExtension(e))));
				})
			).then(() => null);
	}

	private removeOutdatedExtensions(): TPromise<void> {
		return this.scanExtensions(this.extensionsPath, LocalExtensionType.User) // All user extensions
			.then(extensions => {
				const toRemove: ILocalExtension[] = [];

				// Outdated extensions
				const byExtension: ILocalExtension[][] = groupByExtension(extensions, e => ({ id: getGalleryExtensionIdFromLocal(e), uuid: e.identifier.uuid }));
				toRemove.push(...flatten(byExtension.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version)).slice(1))));

				return TPromise.join(toRemove.map(extension => this.removeExtension(extension, 'outdated')));
			}).then(() => null);
	}

	private removeUninstalledExtension(extension: ILocalExtension): TPromise<void> {
		return this.removeExtension(extension, 'uninstalled')
			.then(() => this.withUninstalledExtensions(uninstalled => delete uninstalled[extension.identifier.id]))
			.then(() => null);
	}

	private removeExtension(extension: ILocalExtension, type: string): TPromise<void> {
		this.logService.trace(`Deleting ${type} extension from disk`, extension.identifier.id);
		return pfs.rimraf(extension.location.fsPath).then(() => this.logService.info('Deleted from disk', extension.identifier.id));
	}

	private isUninstalled(id: string): TPromise<boolean> {
		return this.filterUninstalled(id).then(uninstalled => uninstalled.length === 1);
	}

	private filterUninstalled(...ids: string[]): TPromise<string[]> {
		return this.withUninstalledExtensions(allUninstalled => {
			const uninstalled = [];
			for (const id of ids) {
				if (!!allUninstalled[id]) {
					uninstalled.push(id);
				}
			}
			return uninstalled;
		});
	}

	private setUninstalled(...extensions: ILocalExtension[]): TPromise<void> {
		const ids = extensions.map(e => e.identifier.id);
		return this.withUninstalledExtensions(uninstalled => assign(uninstalled, ids.reduce((result, id) => { result[id] = true; return result; }, {})));
	}

	private unsetUninstalled(id: string): TPromise<void> {
		return this.withUninstalledExtensions<void>(uninstalled => delete uninstalled[id]);
	}

	private getUninstalledExtensions(): TPromise<{ [id: string]: boolean; }> {
		return this.withUninstalledExtensions(uninstalled => uninstalled);
	}

	private withUninstalledExtensions<T>(fn: (uninstalled: { [id: string]: boolean; }) => T): TPromise<T> {
		return this.uninstalledFileLimiter.queue(() => {
			let result: T = null;
			return pfs.readFile(this.uninstalledPath, 'utf8')
				.then(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
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

	getExtensionsReport(): TPromise<IReportedExtension[]> {
		const now = new Date().getTime();

		if (!this.reportedExtensions || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
			this.reportedExtensions = this.updateReportCache();
			this.lastReportTimestamp = now;
		}

		return this.reportedExtensions;
	}

	private updateReportCache(): TPromise<IReportedExtension[]> {
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

	private toNonCancellablePromise<T>(promise: TPromise<T>): TPromise<T> {
		return new TPromise((c, e) => promise.then(result => c(result), error => e(error)), () => this.logService.debug('Request Cancelled'));
	}

	private reportTelemetry(eventName: string, extensionData: any, duration: number, error?: Error): void {
		const errorcode = error ? error instanceof ExtensionManagementError ? error.code : ERROR_UNKNOWN : void 0;
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
