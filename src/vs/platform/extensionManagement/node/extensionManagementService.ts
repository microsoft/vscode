/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import * as path from 'path';
import * as pfs from 'vs/base/node/pfs';
import * as errors from 'vs/base/common/errors';
import { assign } from 'vs/base/common/objects';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { flatten, distinct, coalesce } from 'vs/base/common/arrays';
import { extract, buffer } from 'vs/base/node/zip';
import { TPromise } from 'vs/base/common/winjs.base';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, LocalExtensionType,
	StatisticType,
	IExtensionIdentifier,
	IReportedExtension
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal, adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId, groupByExtension, getMaliciousExtensionsSet, getLocalExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from '../common/extensionNls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import * as semver from 'semver';
import URI from 'vs/base/common/uri';
import pkg from 'vs/platform/node/package';
import { isMacintosh } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { ExtensionsManifestCache } from 'vs/platform/extensionManagement/node/extensionsManifestCache';
import { IChoiceService } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { ExtensionsLifecycle } from 'vs/platform/extensionManagement/node/extensionLifecycle';
import { toErrorMessage } from 'vs/base/common/errorMessage';

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
const INSTALL_ERROR_DELETING = 'deleting';
const INSTALL_ERROR_READING_EXTENSION_FROM_DISK = 'readingExtension';
const INSTALL_ERROR_SAVING_METADATA = 'savingMetadata';
const INSTALL_ERROR_UNKNOWN = 'unknown';

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
	private readonly installingExtensions: Map<string, TPromise<ILocalExtension>> = new Map<string, TPromise<ILocalExtension>>();
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
		@IChoiceService private choiceService: IChoiceService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@ILogService private logService: ILogService
	) {
		super();
		this.extensionsPath = environmentService.extensionsPath;
		this.uninstalledPath = path.join(this.extensionsPath, '.obsolete');
		this.uninstalledFileLimiter = new Limiter(1);
		this._register(toDisposable(() => this.installingExtensions.clear()));
		this.manifestCache = this._register(new ExtensionsManifestCache(environmentService, this));
		this.extensionLifecycle = this._register(new ExtensionsLifecycle(this.logService));
	}

	install(zipPath: string): TPromise<void> {
		zipPath = path.resolve(zipPath);

		return validateLocalExtension(zipPath)
			.then(manifest => {
				const identifier = { id: getLocalExtensionIdFromManifest(manifest) };
				return this.unsetUninstalledAndRemove(identifier.id)
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
									() => this.logService.info('Successfully installed the extension:', identifier.id),
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

	private unsetUninstalledAndRemove(id: string): TPromise<void> {
		return this.isUninstalled(id)
			.then(isUninstalled => {
				if (isUninstalled) {
					this.logService.trace('Removing the extension:', id);
					const extensionPath = path.join(this.extensionsPath, id);
					return pfs.rimraf(extensionPath)
						.then(() => this.unsetUninstalled(id))
						.then(() => this.logService.info('Removed the extension:', id));
				}
				return null;
			});
	}

	private checkOutdated(manifest: IExtensionManifest): TPromise<boolean> {
		const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
		return this.getInstalled(LocalExtensionType.User)
			.then(installedExtensions => {
				const newer = installedExtensions.filter(local => areSameExtensions(extensionIdentifier, { id: getGalleryExtensionIdFromLocal(local) }) && semver.gt(local.manifest.version, manifest.version))[0];
				if (newer) {
					const message = nls.localize('installingOutdatedExtension', "A newer version of this extension is already installed. Would you like to override this with the older version?");
					const options = [
						nls.localize('override', "Override"),
						nls.localize('cancel', "Cancel")
					];
					return this.choiceService.choose(Severity.Info, message, options, 1, true)
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

	private installFromZipPath(identifier: IExtensionIdentifier, zipPath: string, metadata: IGalleryMetadata, manifest: IExtensionManifest): TPromise<void> {
		return this.installExtension({ zipPath, id: identifier.id, metadata })
			.then(local => {
				if (this.galleryService.isEnabled() && local.manifest.extensionDependencies && local.manifest.extensionDependencies.length) {
					return this.getDependenciesToInstall(local.manifest.extensionDependencies)
						.then(dependenciesToInstall => this.downloadAndInstallExtensions(metadata ? dependenciesToInstall.filter(d => d.identifier.uuid !== metadata.id) : dependenciesToInstall))
						.then(() => local, error => {
							this.uninstallExtension(local);
							return TPromise.wrapError(new Error(nls.localize('errorInstallingDependencies', "Error while installing dependencies. {0}", error instanceof Error ? error.message : error)));
						});
				}
				return local;
			})
			.then(
			local => this._onDidInstallExtension.fire({ identifier, zipPath, local }),
			error => { this._onDidInstallExtension.fire({ identifier, zipPath, error }); return TPromise.wrapError(error); }
			);
	}

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		this.onInstallExtensions([extension]);
		return this.collectExtensionsToInstall(extension)
			.then(
			extensionsToInstall => {
				if (extensionsToInstall.length > 1) {
					this.onInstallExtensions(extensionsToInstall.slice(1));
				}
				return this.downloadAndInstallExtensions(extensionsToInstall)
					.then(
					locals => this.onDidInstallExtensions(extensionsToInstall, locals, []),
					errors => this.onDidInstallExtensions(extensionsToInstall, [], errors));
			},
			error => this.onDidInstallExtensions([extension], [], [error]));
	}

	reinstall(extension: ILocalExtension): TPromise<void> {
		if (!this.galleryService.isEnabled()) {
			return TPromise.wrapError(new Error(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled")));
		}
		return this.findGalleryExtension(extension)
			.then(galleryExtension => {
				if (galleryExtension) {
					return this.uninstallExtension(extension)
						.then(() => this.removeUninstalledExtension(extension)
							.then(
							() => this.installFromGallery(galleryExtension),
							e => TPromise.wrapError(new Error(nls.localize('removeError', "Error while removing the extension: {0}. Please Quit and Start VS Code before trying again.", toErrorMessage(e))))));
				}
				return TPromise.wrapError(new Error(nls.localize('Not Market place extension', "Only Market place Extensions can be reinstalled")));
			});
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

	private downloadAndInstallExtensions(extensions: IGalleryExtension[]): TPromise<ILocalExtension[]> {
		return TPromise.join(extensions.map(extensionToInstall => this.downloadAndInstallExtension(extensionToInstall)))
			.then(null, errors => this.rollback(extensions).then(() => TPromise.wrapError(errors), () => TPromise.wrapError(errors)));
	}

	private downloadAndInstallExtension(extension: IGalleryExtension): TPromise<ILocalExtension> {
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
				.then(extension => this.downloadInstallableExtension(extension))
				.then(installableExtension => this.installExtension(installableExtension))
				.then(
				local => { this.installingExtensions.delete(extension.identifier.id); return local; },
				e => { this.installingExtensions.delete(extension.identifier.id); return TPromise.wrapError(e); }
				);

			this.installingExtensions.set(extension.identifier.id, installingExtension);
		}
		return installingExtension;
	}

	private downloadInstallableExtension(extension: IGalleryExtension): TPromise<InstallableExtension> {
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
					return this.galleryService.download(extension)
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
			const id = getLocalExtensionIdFromGallery(extension, extension.version);
			this._onInstallExtension.fire({ identifier: { id, uuid: extension.identifier.uuid }, gallery: extension });
		}
	}

	private onDidInstallExtensions(extensions: IGalleryExtension[], locals: ILocalExtension[], errors: Error[]): TPromise<any> {
		extensions.forEach((gallery, index) => {
			const identifier = { id: getLocalExtensionIdFromGallery(gallery, gallery.version), uuid: gallery.identifier.uuid };
			const local = locals[index];
			const error = errors[index];
			if (local) {
				this.logService.info(`Extensions installed successfully:`, gallery.identifier.id);
				this._onDidInstallExtension.fire({ identifier, gallery, local });
			} else {
				const errorCode = error && (<ExtensionManagementError>error).code ? (<ExtensionManagementError>error).code : INSTALL_ERROR_UNKNOWN;
				this.logService.error(`Failed to install extension:`, gallery.identifier.id, error ? error.message : errorCode);
				this._onDidInstallExtension.fire({ identifier, gallery, error: errorCode });
			}
		});
		return errors.length ? TPromise.wrapError(this.joinErrors(errors)) : TPromise.as(null);
	}

	private getDependenciesToInstall(dependencies: string[]): TPromise<IGalleryExtension[]> {
		if (dependencies.length) {
			return this.getInstalled()
				.then(installed => {
					const uninstalledDeps = dependencies.filter(d => installed.every(i => getGalleryExtensionId(i.manifest.publisher, i.manifest.name) !== d));
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
		const extensionPath = path.join(this.extensionsPath, id);
		return pfs.rimraf(extensionPath)
			.then(() => {
				this.logService.trace(`Started extracting the extension from ${zipPath} to ${extensionPath}`);
				return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
					.then(
					() => {
						this.logService.info(`Extracted extension to ${extensionPath}:`, id);
						return this.completeInstall(id, extensionPath, metadata);
					},
					e => TPromise.wrapError(new ExtensionManagementError(e.message, INSTALL_ERROR_EXTRACTING)))
					.then(null, e => {
						this.logService.info('Deleting the extracted extension', id);
						return pfs.rimraf(extensionPath).then(() => TPromise.wrapError(e), () => TPromise.wrapError(e));
					});
			}, e => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(e).message, INSTALL_ERROR_DELETING)));
	}

	private completeInstall(id: string, extensionPath: string, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		return TPromise.join([readManifest(extensionPath), pfs.readdir(extensionPath)])
			.then(null, e => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(e).message, INSTALL_ERROR_READING_EXTENSION_FROM_DISK)))
			.then(([{ manifest }, children]) => {
				const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
				const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
				const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
				const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;
				const type = LocalExtensionType.User;
				const identifier = { id, uuid: metadata ? metadata.id : null };

				const local: ILocalExtension = { type, identifier, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };

				this.logService.trace(`Updating metadata of the extension:`, id);
				return this.saveMetadataForLocalExtension(local)
					.then(() => {
						this.logService.info(`Updated metadata of the extension:`, id);
						return local;
					}, e => TPromise.wrapError(new ExtensionManagementError(this.joinErrors(e).message, INSTALL_ERROR_SAVING_METADATA)));
			});
	}

	private rollback(extensions: IGalleryExtension[]): TPromise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed =>
				TPromise.join(installed.filter(local => extensions.some(galleryExtension => local.identifier.id === getLocalExtensionIdFromGallery(galleryExtension, galleryExtension.version))) // Only check id (pub.name-version) because we want to rollback the exact version
					.map(local => this.uninstallExtension(local))))
			.then(() => null, () => null);
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed => {
				const promises = installed
					.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name)
					.map(e => this.checkForDependenciesAndUninstall(e, installed, force));
				return TPromise.join(promises).then(() => null, error => TPromise.wrapError(this.joinErrors(error)));
			});
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
			.then(() => this.hasDependencies(extension, installed) ? this.promptForDependenciesAndUninstall(extension, installed, force) : this.promptAndUninstall(extension, installed, force))
			.then(() => this.postUninstallExtension(extension),
			error => {
				this.postUninstallExtension(extension, INSTALL_ERROR_LOCAL);
				return TPromise.wrapError(error);
			});
	}

	private hasDependencies(extension: ILocalExtension, installed: ILocalExtension[]): boolean {
		if (extension.manifest.extensionDependencies && extension.manifest.extensionDependencies.length) {
			return installed.some(i => extension.manifest.extensionDependencies.indexOf(getGalleryExtensionIdFromLocal(i)) !== -1);
		}
		return false;
	}

	private promptForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], force: boolean): TPromise<void> {
		if (force) {
			const dependencies = distinct(this.getDependenciesToUninstallRecursively(extension, installed, [])).filter(e => e !== extension);
			return this.uninstallWithDependencies(extension, dependencies, installed);
		}

		const message = nls.localize('uninstallDependeciesConfirmation', "Would you like to uninstall '{0}' only or its dependencies also?", extension.manifest.displayName || extension.manifest.name);
		const options = [
			nls.localize('uninstallOnly', "Only"),
			nls.localize('uninstallAll', "All"),
			nls.localize('cancel', "Cancel")
		];
		this.logService.info('Requesting for confirmation to uninstall extension with dependencies', extension.identifier.id);
		return this.choiceService.choose(Severity.Info, message, options, 2, true)
			.then<void>(value => {
				if (value === 0) {
					return this.uninstallWithDependencies(extension, [], installed);
				}
				if (value === 1) {
					const dependencies = distinct(this.getDependenciesToUninstallRecursively(extension, installed, [])).filter(e => e !== extension);
					return this.uninstallWithDependencies(extension, dependencies, installed);
				}
				this.logService.info('Cancelled uninstalling extension:', extension.identifier.id);
				return TPromise.wrapError(errors.canceled());
			}, error => TPromise.wrapError(errors.canceled()));
	}

	private promptAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], force: boolean): TPromise<void> {
		if (force) {
			return this.uninstallWithDependencies(extension, [], installed);
		}

		const message = nls.localize('uninstallConfirmation', "Are you sure you want to uninstall '{0}'?", extension.manifest.displayName || extension.manifest.name);
		const options = [
			nls.localize('ok', "OK"),
			nls.localize('cancel', "Cancel")
		];
		this.logService.info('Requesting for confirmation to uninstall extension', extension.identifier.id);
		return this.choiceService.choose(Severity.Info, message, options, 1, true)
			.then<void>(value => {
				if (value === 0) {
					return this.uninstallWithDependencies(extension, [], installed);
				}
				this.logService.info('Cancelled uninstalling extension:', extension.identifier.id);
				return TPromise.wrapError(errors.canceled());
			}, error => TPromise.wrapError(errors.canceled()));
	}

	private uninstallWithDependencies(extension: ILocalExtension, dependencies: ILocalExtension[], installed: ILocalExtension[]): TPromise<void> {
		const dependenciesToUninstall = this.filterDependents(extension, dependencies, installed);
		let dependents = this.getDependents(extension, installed).filter(dependent => extension !== dependent && dependenciesToUninstall.indexOf(dependent) === -1);
		if (dependents.length) {
			return TPromise.wrapError<void>(new Error(this.getDependentsErrorMessage(extension, dependents)));
		}
		return TPromise.join([this.uninstallExtension(extension), ...dependenciesToUninstall.map(d => this.doUninstall(d))]).then(() => null);
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

	private getDependenciesToUninstallRecursively(extension: ILocalExtension, installed: ILocalExtension[], checked: ILocalExtension[]): ILocalExtension[] {
		if (checked.indexOf(extension) !== -1) {
			return [];
		}
		checked.push(extension);
		if (!extension.manifest.extensionDependencies || extension.manifest.extensionDependencies.length === 0) {
			return [];
		}
		const dependenciesToUninstall = installed.filter(i => extension.manifest.extensionDependencies.indexOf(getGalleryExtensionIdFromLocal(i)) !== -1);
		const depsOfDeps = [];
		for (const dep of dependenciesToUninstall) {
			depsOfDeps.push(...this.getDependenciesToUninstallRecursively(dep, installed, checked));
		}
		return [...dependenciesToUninstall, ...depsOfDeps];
	}

	private filterDependents(extension: ILocalExtension, dependencies: ILocalExtension[], installed: ILocalExtension[]): ILocalExtension[] {
		installed = installed.filter(i => i !== extension && i.manifest.extensionDependencies && i.manifest.extensionDependencies.length > 0);
		let result = dependencies.slice(0);
		for (let i = 0; i < dependencies.length; i++) {
			const dep = dependencies[i];
			const dependents = this.getDependents(dep, installed).filter(e => dependencies.indexOf(e) === -1);
			if (dependents.length) {
				result.splice(i - (dependencies.length - result.length), 1);
			}
		}
		return result;
	}

	private getDependents(extension: ILocalExtension, installed: ILocalExtension[]): ILocalExtension[] {
		return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.indexOf(getGalleryExtensionIdFromLocal(extension)) !== -1);
	}

	private doUninstall(extension: ILocalExtension): TPromise<void> {
		return this.preUninstallExtension(extension)
			.then(() => this.uninstallExtension(extension))
			.then(() => this.postUninstallExtension(extension),
			error => {
				this.postUninstallExtension(extension, INSTALL_ERROR_LOCAL);
				return TPromise.wrapError(error);
			});
	}

	private preUninstallExtension(extension: ILocalExtension): TPromise<void> {
		return pfs.exists(extension.path)
			.then(exists => exists ? null : TPromise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => {
				this.logService.info('Uninstalling extension:', extension.identifier.id);
				this._onUninstallExtension.fire(extension.identifier);
			});
	}

	private uninstallExtension(local: ILocalExtension): TPromise<void> {
		return this.setUninstalled(local.identifier.id);
	}

	private async postUninstallExtension(extension: ILocalExtension, error?: string): TPromise<void> {
		if (error) {
			this.logService.error('Failed to uninstall extension:', extension.identifier.id, error);
		} else {
			this.logService.info('Successfully uninstalled extension:', extension.identifier.id);
			// only report if extension has a mapped gallery extension. UUID identifies the gallery extension.
			if (extension.identifier.uuid) {
				await this.galleryService.reportStatistic(extension.manifest.publisher, extension.manifest.name, extension.manifest.version, StatisticType.Uninstall);
			}
		}
		this._onDidUninstallExtension.fire({ identifier: extension.identifier, error });
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
			.then(extensionsFolders => TPromise.join(extensionsFolders.map(extensionFolder => limiter.queue(() => this.scanExtension(extensionFolder, root, type)))))
			.then(extensions => coalesce(extensions));
	}

	private scanExtension(folderName: string, root: string, type: LocalExtensionType): TPromise<ILocalExtension> {
		const extensionPath = path.join(root, folderName);
		return pfs.readdir(extensionPath)
			.then(children => readManifest(extensionPath)
				.then<ILocalExtension>(({ manifest, metadata }) => {
					const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
					const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
					const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
					const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;
					if (manifest.extensionDependencies) {
						manifest.extensionDependencies = manifest.extensionDependencies.map(id => adoptToGalleryExtensionId(id));
					}
					const identifier = { id: type === LocalExtensionType.System ? folderName : getLocalExtensionIdFromManifest(manifest), uuid: metadata ? metadata.id : null };
					return { type, identifier, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };
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
		return pfs.rimraf(extension.path).then(() => this.logService.info('Deleted from disk', extension.identifier.id));
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

	private setUninstalled(...ids: string[]): TPromise<void> {
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
}

export function getLocalExtensionIdFromGallery(extension: IGalleryExtension, version: string): string {
	return getLocalExtensionId(extension.identifier.id, version);
}

export function getLocalExtensionIdFromManifest(manifest: IExtensionManifest): string {
	return getLocalExtensionId(getGalleryExtensionId(manifest.publisher, manifest.name), manifest.version);
}