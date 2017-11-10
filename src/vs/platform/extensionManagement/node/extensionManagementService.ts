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
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { flatten, distinct } from 'vs/base/common/arrays';
import { extract, buffer } from 'vs/base/node/zip';
import { TPromise } from 'vs/base/common/winjs.base';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, LocalExtensionType,
	StatisticType,
	IExtensionIdentifier
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getGalleryExtensionIdFromLocal, getIdAndVersionFromLocalExtensionId, adoptToGalleryExtensionId, areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from '../common/extensionNls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import * as semver from 'semver';
import { groupBy, values } from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));
const INSTALL_ERROR_OBSOLETE = 'obsolete';
const INSTALL_ERROR_GALLERY = 'gallery';
const INSTALL_ERROR_LOCAL = 'local';

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

function validate(zipPath: string): TPromise<IExtensionManifest> {
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
	metadata: IGalleryMetadata;
	current?: ILocalExtension;
}

export class ExtensionManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	private extensionsPath: string;
	private obsoletePath: string;
	private obsoleteFileLimiter: Limiter<void>;
	private disposables: IDisposable[] = [];

	private _onInstallExtension = new Emitter<InstallExtensionEvent>();
	onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	private _onDidInstallExtension = new Emitter<DidInstallExtensionEvent>();
	onDidInstallExtension: Event<DidInstallExtensionEvent> = this._onDidInstallExtension.event;

	private _onUninstallExtension = new Emitter<IExtensionIdentifier>();
	onUninstallExtension: Event<IExtensionIdentifier> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<DidUninstallExtensionEvent>();
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IChoiceService private choiceService: IChoiceService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService
	) {
		this.extensionsPath = environmentService.extensionsPath;
		this.obsoletePath = path.join(this.extensionsPath, '.obsolete');
		this.obsoleteFileLimiter = new Limiter(1);
	}

	install(zipPath: string): TPromise<void> {
		zipPath = path.resolve(zipPath);

		return validate(zipPath).then<void>(manifest => {
			const identifier = { id: getLocalExtensionIdFromManifest(manifest) };

			return this.isObsolete(identifier.id).then(isObsolete => {
				if (isObsolete) {
					return TPromise.wrapError(new Error(nls.localize('restartCodeLocal', "Please restart Code before reinstalling {0}.", manifest.displayName || manifest.name)));
				}

				this._onInstallExtension.fire({ identifier, zipPath });

				return this.galleryService.query({ names: [getGalleryExtensionId(manifest.publisher, manifest.name)], pageSize: 1 })
					.then(galleryResult => {
						const galleryExtension = galleryResult.firstPage[0];
						const metadata = galleryExtension ? <IGalleryMetadata>{ id: galleryExtension.identifier.uuid, publisherDisplayName: galleryExtension.publisherDisplayName, publisherId: galleryExtension.publisherId } : null;
						return this.installExtension({ zipPath, id: identifier.id, metadata })
							.then(
							local => this._onDidInstallExtension.fire({ identifier, zipPath, local }),
							error => { this._onDidInstallExtension.fire({ identifier, zipPath, error }); return TPromise.wrapError(error); }
							);
					});

			});
		});
	}

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		return this.prepareAndCollectExtensionsToInstall(extension)
			.then(extensionsToInstall => this.downloadAndInstallExtensions(extensionsToInstall)
				.then(local => this.onDidInstallExtensions(extensionsToInstall, local)));
	}

	private prepareAndCollectExtensionsToInstall(extension: IGalleryExtension): TPromise<IGalleryExtension[]> {
		this.onInstallExtensions([extension]);
		return this.collectExtensionsToInstall(extension)
			.then(
			extensionsToInstall => this.checkForObsolete(extensionsToInstall)
				.then(
				extensionsToInstall => {
					if (extensionsToInstall.length > 1) {
						this.onInstallExtensions(extensionsToInstall.slice(1));
					}
					return extensionsToInstall;
				},
				error => this.onDidInstallExtensions([extension], null, INSTALL_ERROR_OBSOLETE, error)
				),
			error => this.onDidInstallExtensions([extension], null, INSTALL_ERROR_GALLERY, error)
			);
	}

	private downloadAndInstallExtensions(extensions: IGalleryExtension[]): TPromise<ILocalExtension[]> {
		return this.getInstalled(LocalExtensionType.User)
			.then(installed => TPromise.join(extensions.map(extensionToInstall => this.downloadInstallableExtension(extensionToInstall, installed)))
				.then(
				installableExtensions => TPromise.join(installableExtensions.map(installableExtension => this.installExtension(installableExtension)))
					.then(null, error => this.rollback(extensions).then(() => this.onDidInstallExtensions(extensions, null, INSTALL_ERROR_LOCAL, error))),
				error => this.onDidInstallExtensions(extensions, null, INSTALL_ERROR_GALLERY, error)));
	}

	private collectExtensionsToInstall(extension: IGalleryExtension): TPromise<IGalleryExtension[]> {
		return this.galleryService.loadCompatibleVersion(extension)
			.then(extensionToInstall => this.galleryService.getAllDependencies(extension)
				.then(allDependencies => this.filterDependenciesToInstall(extension, allDependencies))
				.then(dependenciesToInstall => [extensionToInstall, ...dependenciesToInstall]));
	}

	private checkForObsolete(extensionsToInstall: IGalleryExtension[]): TPromise<IGalleryExtension[]> {
		return this.filterObsolete(...extensionsToInstall.map(i => getLocalExtensionIdFromGallery(i, i.version)))
			.then(obsolete => obsolete.length ? TPromise.wrapError<IGalleryExtension[]>(new Error(nls.localize('restartCodeGallery', "Please restart Code before reinstalling."))) : extensionsToInstall);
	}

	private downloadInstallableExtension(extension: IGalleryExtension, installed: ILocalExtension[]): TPromise<InstallableExtension> {
		const current = installed.filter(i => i.identifier.uuid === extension.identifier.uuid)[0];
		const id = getLocalExtensionIdFromGallery(extension, extension.version);
		const metadata = <IGalleryMetadata>{
			id: extension.identifier.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
		};
		return this.galleryService.download(extension)
			.then(zipPath => validate(zipPath).then(() => (<InstallableExtension>{ zipPath, id, metadata, current })));
	}

	private rollback(extensions: IGalleryExtension[]): TPromise<void> {
		return this.filterOutUninstalled(extensions)
			.then(installed => TPromise.join(installed.map(local => this.uninstallExtension(local.identifier))))
			.then(() => null, () => null);
	}

	private onInstallExtensions(extensions: IGalleryExtension[]): void {
		for (const extension of extensions) {
			const id = getLocalExtensionIdFromGallery(extension, extension.version);
			this._onInstallExtension.fire({ identifier: { id, uuid: extension.identifier.uuid }, gallery: extension });
		}
	}

	private onDidInstallExtensions(extensions: IGalleryExtension[], local: ILocalExtension[], errorCode?: string, error?: any): TPromise<any> {
		extensions.forEach((gallery, index) => {
			const identifier = { id: getLocalExtensionIdFromGallery(gallery, gallery.version), uuid: gallery.identifier.uuid };
			if (errorCode) {
				this._onDidInstallExtension.fire({ identifier, gallery, error: errorCode });
			} else {
				this._onDidInstallExtension.fire({ identifier, gallery, local: local[index] });
			}
		});
		return error ? TPromise.wrapError(Array.isArray(error) ? this.joinErrors(error) : error) : TPromise.as(null);
	}

	private filterDependenciesToInstall(extension: IGalleryExtension, dependencies: IGalleryExtension[]): TPromise<IGalleryExtension[]> {
		return this.getInstalled()
			.then(local => {
				return dependencies.filter(d => {
					if (extension.identifier.uuid === d.identifier.uuid) {
						return false;
					}
					const extensionId = getLocalExtensionIdFromGallery(d, d.version);
					return local.every(({ identifier }) => identifier.id !== extensionId);
				});
			});
	}

	private filterOutUninstalled(extensions: IGalleryExtension[]): TPromise<ILocalExtension[]> {
		return this.getInstalled()
			.then(installed => installed.filter(local => !!this.getGalleryExtensionForLocalExtension(extensions, local)));
	}

	private getGalleryExtensionForLocalExtension(galleryExtensions: IGalleryExtension[], localExtension: ILocalExtension): IGalleryExtension {
		const filtered = galleryExtensions.filter(galleryExtension => areSameExtensions(localExtension.identifier, { id: getLocalExtensionIdFromGallery(galleryExtension, galleryExtension.version), uuid: galleryExtension.identifier.uuid }));
		return filtered.length ? filtered[0] : null;
	}

	private installExtension({ zipPath, id, metadata, current }: InstallableExtension): TPromise<ILocalExtension> {
		const extensionPath = path.join(this.extensionsPath, id);

		return pfs.rimraf(extensionPath).then(() => {
			return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
				.then(() => readManifest(extensionPath))
				.then(({ manifest }) => {
					return pfs.readdir(extensionPath).then(children => {
						const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
						const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
						const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
						const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;
						const type = LocalExtensionType.User;
						const identifier = { id, uuid: metadata ? metadata.id : null };

						const local: ILocalExtension = { type, identifier, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };

						return this.saveMetadataForLocalExtension(local)
							.then(() => this.checkForRename(current, local))
							.then(() => local);
					});
				});
		});
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.removeOutdatedExtensions()
			.then(() =>
				this.scanUserExtensions()
					.then(installed => {
						const promises = installed
							.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name)
							.map(e => this.checkForDependenciesAndUninstall(e, installed, force));
						return TPromise.join(promises).then(null, error => TPromise.wrapError(Array.isArray(error) ? this.joinErrors(error) : error));
					}))
			.then(() => { /* drop resolved value */ });
	}

	updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		local.metadata = metadata;
		return this.saveMetadataForLocalExtension(local);
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

	private checkForRename(currentExtension: ILocalExtension, newExtension: ILocalExtension): TPromise<void> {
		// Check if the gallery id for current and new exensions are same, if not, remove the current one.
		if (currentExtension && getGalleryExtensionIdFromLocal(currentExtension) !== getGalleryExtensionIdFromLocal(newExtension)) {
			// return this.uninstallExtension(currentExtension.identifier);
			return this.setObsolete(currentExtension.identifier.id);
		}
		return TPromise.as(null);
	}

	private joinErrors(errors: (Error | string)[]): Error {
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
		return this.choiceService.choose(Severity.Info, message, options, 2, true)
			.then<void>(value => {
				if (value === 0) {
					return this.uninstallWithDependencies(extension, [], installed);
				}
				if (value === 1) {
					const dependencies = distinct(this.getDependenciesToUninstallRecursively(extension, installed, [])).filter(e => e !== extension);
					return this.uninstallWithDependencies(extension, dependencies, installed);
				}
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
		return this.choiceService.choose(Severity.Info, message, options, 1, true)
			.then<void>(value => {
				if (value === 0) {
					return this.uninstallWithDependencies(extension, [], installed);
				}
				return TPromise.wrapError(errors.canceled());
			}, error => TPromise.wrapError(errors.canceled()));
	}

	private uninstallWithDependencies(extension: ILocalExtension, dependencies: ILocalExtension[], installed: ILocalExtension[]): TPromise<void> {
		const dependenciesToUninstall = this.filterDependents(extension, dependencies, installed);
		let dependents = this.getDependents(extension, installed).filter(dependent => extension !== dependent && dependenciesToUninstall.indexOf(dependent) === -1);
		if (dependents.length) {
			return TPromise.wrapError<void>(new Error(this.getDependentsErrorMessage(extension, dependents)));
		}
		return TPromise.join([this.uninstallExtension(extension.identifier), ...dependenciesToUninstall.map(d => this.doUninstall(d))]).then(() => null);
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
			.then(() => this.uninstallExtension(extension.identifier))
			.then(() => this.postUninstallExtension(extension),
			error => {
				this.postUninstallExtension(extension, INSTALL_ERROR_LOCAL);
				return TPromise.wrapError(error);
			});
	}

	private preUninstallExtension(extension: ILocalExtension): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, extension.identifier.id);
		return pfs.exists(extensionPath)
			.then(exists => exists ? null : TPromise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(extension.identifier));
	}

	private uninstallExtension({ id }: IExtensionIdentifier): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, id);
		return this.setObsolete(id)
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this.unsetObsolete(id));
	}

	private async postUninstallExtension(extension: ILocalExtension, error?: string): TPromise<void> {
		if (!error) {
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
			promises.push(this.scanSystemExtensions());
		}

		if (type === null || type === LocalExtensionType.User) {
			promises.push(this.scanUserExtensions());
		}

		return TPromise.join<ILocalExtension[]>(promises).then(flatten);
	}

	private scanSystemExtensions(): TPromise<ILocalExtension[]> {
		return this.scanExtensions(SystemExtensionsRoot, LocalExtensionType.System);
	}

	private scanUserExtensions(): TPromise<ILocalExtension[]> {
		return this.scanExtensions(this.extensionsPath, LocalExtensionType.User).then(extensions => {
			const byId = values(groupBy(extensions, p => getGalleryExtensionIdFromLocal(p)));
			return byId.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
		});
	}

	private scanExtensions(root: string, type: LocalExtensionType): TPromise<ILocalExtension[]> {
		const limiter = new Limiter(10);

		return this.scanExtensionFolders(root)
			.then(extensionIds => TPromise.join(extensionIds.map(id => {
				const extensionPath = path.join(root, id);

				const each = () => pfs.readdir(extensionPath).then(children => {
					const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
					const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
					const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
					const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;

					return readManifest(extensionPath)
						.then<ILocalExtension>(({ manifest, metadata }) => {
							if (manifest.extensionDependencies) {
								manifest.extensionDependencies = manifest.extensionDependencies.map(id => adoptToGalleryExtensionId(id));
							}
							const identifier = { id, uuid: metadata ? metadata.id : null };
							return { type, identifier, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };
						});
				}).then(null, () => null);

				return limiter.queue(each);
			})))
			.then(result => result.filter(a => !!a));
	}

	private scanExtensionFolders(root: string): TPromise<string[]> {
		return this.getObsoleteExtensions()
			.then(obsolete => pfs.readdir(root).then(extensions => extensions.filter(id => !obsolete[id])));
	}

	removeDeprecatedExtensions(): TPromise<any> {
		return TPromise.join([
			this.removeOutdatedExtensions(),
			this.removeObsoleteExtensions()
		]);
	}

	private removeOutdatedExtensions(): TPromise<any> {
		return this.getOutdatedExtensionIds()
			.then(extensionIds => this.removeExtensions(extensionIds));
	}

	private removeObsoleteExtensions(): TPromise<any> {
		return this.getObsoleteExtensions()
			.then(obsolete => Object.keys(obsolete))
			.then(extensionIds => this.removeExtensions(extensionIds));
	}

	private removeExtensions(extensionsIds: string[]): TPromise<any> {
		return TPromise.join(extensionsIds.map(id => {
			return pfs.rimraf(path.join(this.extensionsPath, id))
				.then(() => this.withObsoleteExtensions(obsolete => delete obsolete[id]));
		}));
	}

	private getOutdatedExtensionIds(): TPromise<string[]> {
		return this.scanExtensionFolders(this.extensionsPath)
			.then(folders => {
				const galleryFolders = folders
					.map(folder => (assign({ folder }, getIdAndVersionFromLocalExtensionId(folder))))
					.filter(({ id, version }) => !!id && !!version);

				const byId = values(groupBy(galleryFolders, p => p.id));

				return flatten(byId.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version)).slice(1)))
					.map(a => a.folder);
			});
	}

	private isObsolete(id: string): TPromise<boolean> {
		return this.filterObsolete(id).then(obsolete => obsolete.length === 1);
	}

	private filterObsolete(...ids: string[]): TPromise<string[]> {
		return this.withObsoleteExtensions(allObsolete => {
			const obsolete = [];
			for (const id of ids) {
				if (!!allObsolete[id]) {
					obsolete.push(id);
				}
			}
			return obsolete;
		});
	}

	private setObsolete(id: string): TPromise<void> {
		return this.withObsoleteExtensions(obsolete => assign(obsolete, { [id]: true }));
	}

	private unsetObsolete(id: string): TPromise<void> {
		return this.withObsoleteExtensions<void>(obsolete => delete obsolete[id]);
	}

	private getObsoleteExtensions(): TPromise<{ [id: string]: boolean; }> {
		return this.withObsoleteExtensions(obsolete => obsolete);
	}

	private withObsoleteExtensions<T>(fn: (obsolete: { [id: string]: boolean; }) => T): TPromise<T> {
		return this.obsoleteFileLimiter.queue(() => {
			let result: T = null;
			return pfs.readFile(this.obsoletePath, 'utf8')
				.then(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
				.then<{ [id: string]: boolean }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; } })
				.then(obsolete => { result = fn(obsolete); return obsolete; })
				.then(obsolete => {
					if (Object.keys(obsolete).length === 0) {
						return pfs.rimraf(this.obsoletePath);
					} else {
						const raw = JSON.stringify(obsolete);
						return pfs.writeFile(this.obsoletePath, raw);
					}
				})
				.then(() => result);
		});
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}

export function getLocalExtensionIdFromGallery(extension: IGalleryExtension, version: string): string {
	return getLocalExtensionId(extension.identifier.id, version);
}

export function getLocalExtensionIdFromManifest(manifest: IExtensionManifest): string {
	return getLocalExtensionId(getGalleryExtensionId(manifest.publisher, manifest.name), manifest.version);
}

function getLocalExtensionId(id: string, version: string): string {
	return `${id}-${version}`;
}