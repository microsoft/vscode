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
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import {
	IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, DidUninstallExtensionEvent, LocalExtensionType
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { getLocalExtensionIdFromGallery, getLocalExtensionIdFromManifest, getGalleryExtensionIdFromLocal, getIdAndVersionFromLocalExtensionId, adoptToGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localizeManifest } from '../common/extensionNls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import * as semver from 'semver';
import { groupBy, values } from 'vs/base/common/collections';
import URI from 'vs/base/common/uri';
import { IChoiceService, Severity } from 'vs/platform/message/common/message';

const SystemExtensionsRoot = path.normalize(path.join(URI.parse(require.toUrl('')).fsPath, '..', 'extensions'));

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
			.then<string>(null, err => err.code !== 'ENOENT' ? TPromise.wrapError(err) : '{}')
			.then(raw => JSON.parse(raw))
	];

	return TPromise.join<any>(promises).then(([{ manifest, metadata }, translations]) => {
		return {
			manifest: localizeManifest(manifest, translations),
			metadata
		};
	});
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

	private _onUninstallExtension = new Emitter<string>();
	onUninstallExtension: Event<string> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<DidUninstallExtensionEvent>();
	onDidUninstallExtension: Event<DidUninstallExtensionEvent> = this._onDidUninstallExtension.event;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
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
			const id = getLocalExtensionIdFromManifest(manifest);

			return this.isObsolete(id).then(isObsolete => {
				if (isObsolete) {
					return TPromise.wrapError(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", manifest.displayName || manifest.name)));
				}

				this._onInstallExtension.fire({ id, zipPath });

				return this.installExtension(zipPath, id)
					.then(
					local => this._onDidInstallExtension.fire({ id, zipPath, local }),
					error => { this._onDidInstallExtension.fire({ id, zipPath, error }); return TPromise.wrapError(error); }
					);
			});
		});
	}

	installFromGallery(extension: IGalleryExtension, promptToInstallDependencies: boolean = true): TPromise<void> {
		const id = getLocalExtensionIdFromGallery(extension, extension.version);

		return this.isObsolete(id).then(isObsolete => {
			if (isObsolete) {
				return TPromise.wrapError<void>(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", extension.displayName || extension.name)));
			}
			this._onInstallExtension.fire({ id, gallery: extension });
			return this.installCompatibleVersion(extension, true, promptToInstallDependencies)
				.then(
				local => this._onDidInstallExtension.fire({ id, local, gallery: extension }),
				error => {
					this._onDidInstallExtension.fire({ id, gallery: extension, error });
					return TPromise.wrapError(error);
				}
				);
		});
	}

	private installCompatibleVersion(extension: IGalleryExtension, installDependencies: boolean, promptToInstallDependencies: boolean): TPromise<ILocalExtension> {
		return this.galleryService.loadCompatibleVersion(extension)
			.then(compatibleVersion => this.getDependenciesToInstall(extension, installDependencies)
				.then(dependencies => {
					if (!dependencies.length) {
						return this.downloadAndInstall(compatibleVersion);
					}
					if (promptToInstallDependencies) {
						const message = nls.localize('installDependeciesConfirmation', "Installing '{0}' also installs its dependencies. Would you like to continue?", extension.displayName);
						const options = [
							nls.localize('install', "Yes"),
							nls.localize('doNotInstall', "No")
						];
						return this.choiceService.choose(Severity.Info, message, options, 1, true)
							.then(value => {
								if (value === 0) {
									return this.installWithDependencies(compatibleVersion);
								}
								return TPromise.wrapError<ILocalExtension>(errors.canceled());
							}, error => TPromise.wrapError<ILocalExtension>(errors.canceled()));
					} else {
						return this.installWithDependencies(compatibleVersion);
					}
				})
			);
	}

	private getDependenciesToInstall(extension: IGalleryExtension, checkDependecies: boolean): TPromise<string[]> {
		if (!checkDependecies) {
			return TPromise.wrap([]);
		}
		// Filter out self
		const dependencies = extension.properties.dependencies ? extension.properties.dependencies.filter(id => id !== extension.id) : [];
		if (!dependencies.length) {
			return TPromise.wrap([]);
		}
		// Filter out installed dependencies
		return this.getInstalled().then(installed => {
			return dependencies.filter(dep => installed.every(i => `${i.manifest.publisher}.${i.manifest.name}` !== dep));
		});
	}

	private installWithDependencies(extension: IGalleryExtension): TPromise<ILocalExtension> {
		return this.galleryService.getAllDependencies(extension)
			.then(allDependencies => this.filterDependenciesToInstall(extension, allDependencies))
			.then(toInstall => this.filterObsolete(...toInstall.map(i => getLocalExtensionIdFromGallery(i, i.version)))
				.then((obsolete) => {
					if (obsolete.length) {
						return TPromise.wrapError<ILocalExtension>(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", extension.displayName || extension.name)));
					}
					return this.bulkInstallWithDependencies(extension, toInstall);
				})
			);
	}

	private bulkInstallWithDependencies(extension: IGalleryExtension, dependecies: IGalleryExtension[]): TPromise<ILocalExtension> {
		for (const dependency of dependecies) {
			const id = getLocalExtensionIdFromGallery(dependency, dependency.version);
			this._onInstallExtension.fire({ id, gallery: dependency });
		}
		return this.downloadAndInstall(extension)
			.then(localExtension => {
				return TPromise.join(dependecies.map((dep) => this.installCompatibleVersion(dep, false, false)))
					.then(installedLocalExtensions => {
						for (const installedLocalExtension of installedLocalExtensions) {
							const gallery = this.getGalleryExtensionForLocalExtension(dependecies, installedLocalExtension);
							this._onDidInstallExtension.fire({ id: installedLocalExtension.id, local: installedLocalExtension, gallery });
						}
						return localExtension;
					}, error => {
						return this.rollback(localExtension, dependecies).then(() => {
							return TPromise.wrapError<ILocalExtension>(Array.isArray(error) ? error[error.length - 1] : error);
						});
					});
			})
			.then(localExtension => localExtension, error => {
				for (const dependency of dependecies) {
					this._onDidInstallExtension.fire({ id: getLocalExtensionIdFromGallery(dependency, dependency.version), gallery: dependency, error });
				}
				return TPromise.wrapError<ILocalExtension>(error);
			});
	}

	private rollback(localExtension: ILocalExtension, dependecies: IGalleryExtension[]): TPromise<void> {
		return this.doUninstall(localExtension.id)
			.then(() => this.filterOutUninstalled(dependecies))
			.then(installed => TPromise.join(installed.map((i) => this.doUninstall(i.id))))
			.then(() => null);
	}

	private filterDependenciesToInstall(extension: IGalleryExtension, dependencies: IGalleryExtension[]): TPromise<IGalleryExtension[]> {
		return this.getInstalled()
			.then(local => {
				return dependencies.filter(d => {
					if (extension.uuid === d.uuid) {
						return false;
					}
					const extensionId = getLocalExtensionIdFromGallery(d, d.version);
					return local.every(local => local.id !== extensionId);
				});
			});
	}

	private filterOutUninstalled(extensions: IGalleryExtension[]): TPromise<ILocalExtension[]> {
		return this.getInstalled()
			.then(installed => installed.filter(local => !!this.getGalleryExtensionForLocalExtension(extensions, local)));
	}

	private getGalleryExtensionForLocalExtension(galleryExtensions: IGalleryExtension[], localExtension: ILocalExtension): IGalleryExtension {
		const filtered = galleryExtensions.filter(galleryExtension => getLocalExtensionIdFromGallery(galleryExtension, galleryExtension.version) === localExtension.id);
		return filtered.length ? filtered[0] : null;
	}

	private downloadAndInstall(extension: IGalleryExtension): TPromise<ILocalExtension> {
		const id = getLocalExtensionIdFromGallery(extension, extension.version);
		const metadata = {
			id: extension.uuid,
			publisherId: extension.publisherId,
			publisherDisplayName: extension.publisherDisplayName,
		};

		return this.galleryService.download(extension)
			.then(zipPath => validate(zipPath).then(() => zipPath))
			.then(zipPath => this.installExtension(zipPath, id, metadata));
	}

	private installExtension(zipPath: string, id: string, metadata: IGalleryMetadata = null): TPromise<ILocalExtension> {
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

						const local: ILocalExtension = { type, id, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };
						const manifestPath = path.join(extensionPath, 'package.json');

						return pfs.readFile(manifestPath, 'utf8')
							.then(raw => parseManifest(raw))
							.then(({ manifest }) => assign(manifest, { __metadata: metadata }))
							.then(manifest => pfs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t')))
							.then(() => local);
					});
				});
		});
	}

	uninstall(extension: ILocalExtension, force = false): TPromise<void> {
		return this.removeOutdatedExtensions().then(() => {
			return this.scanUserExtensions().then<void>(installed => {
				const promises = installed
					.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name)
					.map(e => this.checkForDependenciesAndUninstall(e, installed, force));
				return TPromise.join(promises);
			});
		});
	}

	private checkForDependenciesAndUninstall(extension: ILocalExtension, installed: ILocalExtension[], force: boolean): TPromise<void> {
		return this.preUninstallExtension(extension.id)
			.then(() => this.hasDependencies(extension, installed) ? this.promptForDependenciesAndUninstall(extension, installed, force) : this.promptAndUninstall(extension, installed, force))
			.then(() => this.postUninstallExtension(extension.id),
			error => {
				this.postUninstallExtension(extension.id, error);
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
		return TPromise.join([this.uninstallExtension(extension.id), ...dependenciesToUninstall.map(d => this.doUninstall(d.id))]).then(() => null);
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

	private doUninstall(id: string): TPromise<void> {
		return this.preUninstallExtension(id)
			.then(() => this.uninstallExtension(id))
			.then(() => this.postUninstallExtension(id),
			error => {
				this.postUninstallExtension(id, error);
				return TPromise.wrapError(error);
			});
	}

	private preUninstallExtension(id: string): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, id);
		return pfs.exists(extensionPath)
			.then(exists => exists ? null : TPromise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(id));
	}

	private uninstallExtension(id: string): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, id);
		return this.setObsolete(id)
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this.unsetObsolete(id));
	}

	private postUninstallExtension(id: string, error?: any): TPromise<void> {
		return this._onDidUninstallExtension.fire({ id, error });
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
			.then(extensionIds => Promise.join(extensionIds.map(id => {
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
							return { type, id, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl };
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
				.then<string>(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
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
