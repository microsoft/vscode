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
import { flatten } from 'vs/base/common/arrays';
import { extract, buffer } from 'vs/base/node/zip';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IExtensionManagementService, IExtensionGalleryService, ILocalExtension,
	IGalleryExtension, IExtensionIdentity, IExtensionManifest, IGalleryMetadata,
	InstallExtensionEvent, DidInstallExtensionEvent, LocalExtensionType
} from 'vs/platform/extensionManagement/common/extensionManagement';
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

function validate(zipPath: string, extension?: IExtensionIdentity, version?: string): TPromise<IExtensionManifest> {
	return buffer(zipPath, 'extension/package.json')
		.then(buffer => parseManifest(buffer.toString('utf8')))
		.then(({ manifest }) => {
			if (extension) {
				if (extension.name !== manifest.name) {
					return Promise.wrapError(Error(nls.localize('invalidName', "Extension invalid: manifest name mismatch.")));
				}

				if (extension.publisher !== manifest.publisher) {
					return Promise.wrapError(Error(nls.localize('invalidPublisher', "Extension invalid: manifest publisher mismatch.")));
				}

				if (version !== manifest.version) {
					return Promise.wrapError(Error(nls.localize('invalidVersion', "Extension invalid: manifest version mismatch.")));
				}
			}

			return TPromise.as(manifest);
		});
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

function getExtensionId(extension: IExtensionIdentity, version: string): string {
	return `${ extension.publisher }.${ extension.name }-${ version }`;
}

export class ExtensionManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	private extensionsPath: string;
	private obsoletePath: string;
	private obsoleteFileLimiter: Limiter<void>;
	private disposables: IDisposable[];

	private _onInstallExtension = new Emitter<InstallExtensionEvent>();
	onInstallExtension: Event<InstallExtensionEvent> = this._onInstallExtension.event;

	private _onDidInstallExtension = new Emitter<DidInstallExtensionEvent>();
	onDidInstallExtension: Event<DidInstallExtensionEvent> = this._onDidInstallExtension.event;

	private _onUninstallExtension = new Emitter<string>();
	onUninstallExtension: Event<string> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<string>();
	onDidUninstallExtension: Event<string> = this._onDidUninstallExtension.event;

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
			const id = getExtensionId(manifest, manifest.version);

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

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		const id = getExtensionId(extension, extension.version);

		return this.isObsolete(id).then(isObsolete => {
			if (isObsolete) {
				return TPromise.wrapError<void>(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", extension.displayName || extension.name)));
			}
			this._onInstallExtension.fire({ id, gallery: extension });
			return this.installCompatibleVersion(extension, true)
					.then(
						local => this._onDidInstallExtension.fire({ id, local, gallery: extension }),
						error => {
							this._onDidInstallExtension.fire({ id, gallery: extension, error });
							return TPromise.wrapError(error);
						}
					);
		});
	}

	private installCompatibleVersion(extension: IGalleryExtension, checkDependecies: boolean): TPromise<ILocalExtension> {
		return this.galleryService.loadCompatibleVersion(extension)
			.then(compatibleVersion => {
				const dependencies = checkDependecies ? this.getDependenciesToInstall(compatibleVersion) : [];
				if (!dependencies.length) {
					return this.downloadAndInstall(compatibleVersion);
				}

				const message = nls.localize('installDependecies', "This extension has dependencies. Would you like to install them along with it?");
				const options = [
					nls.localize('installWithDependenices', "Install With Dependencies"),
					nls.localize('installWithoutDependenices', "Install only this"),
					nls.localize('close', "Close")
				];
				return this.choiceService.choose(Severity.Info, message, options)
					.then(value => {
						switch (value) {
							case 0:
								return this.installWithDependencies(compatibleVersion);
							case 1:
								return this.downloadAndInstall(compatibleVersion);
							default:
								return TPromise.wrapError(errors.canceled());
						}
					});
			});
	}

	private getDependenciesToInstall(extension: IGalleryExtension): string[] {
		const extensionName = `${extension.publisher}.${extension.name}`;
		return extension.properties.dependencies ? extension.properties.dependencies.filter(name => name !== extensionName) : [];
	}

	private installWithDependencies(extension: IGalleryExtension): TPromise<ILocalExtension> {
		return this.galleryService.getAllDependencies(extension)
			.then(allDependencies => this.filterOutInstalled(allDependencies))
			.then(toInstall => this.filterObsolete(...toInstall.map(i => getExtensionId(i, i.version)))
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
			const id = getExtensionId(dependency, dependency.version);
			this._onInstallExtension.fire({ id, gallery: dependency });
		}
		return this.downloadAndInstall(extension)
			.then(localExtension => {
				return TPromise.join(dependecies.map((dep) => this.installCompatibleVersion(dep, false)))
					.then(installedLocalExtensions => {
						for (const installedLocalExtension of installedLocalExtensions) {
							const gallery = this.getGalleryExtensionForLocalExtension(dependecies, installedLocalExtension);
							this._onDidInstallExtension.fire({ id: installedLocalExtension.id, local: installedLocalExtension, gallery });
						}
						return localExtension;
					}, error => {
						return this.rollback(localExtension, dependecies).then(() => {
							return TPromise.wrapError(Array.isArray(error) ? error[error.length - 1] : error);
						});
					});
			})
			.then(localExtension => localExtension, error => {
				for (const dependency of dependecies) {
					this._onDidInstallExtension.fire({ id: getExtensionId(dependency, dependency.version), gallery: dependency, error });
				}
				return TPromise.wrapError(error);
			});
	}

	private rollback(localExtension: ILocalExtension, dependecies: IGalleryExtension[]): TPromise<void> {
		return this.uninstall(localExtension)
					.then(() => this.filterOutUnInstalled(dependecies))
					.then(installed => TPromise.join(installed.map((i) => this.uninstall(i))))
					.then(() => null);
	}

	private filterOutInstalled(extensions: IGalleryExtension[]): TPromise<IGalleryExtension[]> {
		return this.getInstalled().then(local => {
			return extensions.filter(extension => {
				const extensionId = getExtensionId(extension, extension.version);
				return local.every(local => local.id !== extensionId);
			});
		});
	}

	private filterOutUnInstalled(extensions: IGalleryExtension[]): TPromise<ILocalExtension[]> {
		return this.getInstalled().then(installed => {
			return installed.filter(local => {
				return !!this.getGalleryExtensionForLocalExtension(extensions, local);
			});
		});
	}

	private getGalleryExtensionForLocalExtension(galleryExtensions: IGalleryExtension[], localExtension: ILocalExtension): IGalleryExtension {
		const filtered = galleryExtensions.filter(galleryExtension => getExtensionId(galleryExtension, galleryExtension.version) === localExtension.id);
		return filtered.length ? filtered[0] : null;
	}

	private downloadAndInstall(extension: IGalleryExtension): TPromise<ILocalExtension> {
		const id = getExtensionId(extension, extension.version);
		const metadata = {
				id: extension.id,
				publisherId: extension.publisherId,
				publisherDisplayName: extension.publisherDisplayName
			};
		return this.galleryService.download(extension)
			.then(zipPath => validate(zipPath).then(() => zipPath))
			.then(zipPath => this.installExtension(zipPath, id, metadata));
	}

	private installExtension(zipPath: string, id: string, metadata: IGalleryMetadata = null): TPromise<ILocalExtension> {
		const extensionPath = path.join(this.extensionsPath, id);

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
	}

	uninstall(extension: ILocalExtension): TPromise<void> {
		return this.scanUserExtensions().then<void>(installed => {
			const promises = installed
				.filter(e => e.manifest.publisher === extension.manifest.publisher && e.manifest.name === extension.manifest.name)
				.map(({ id }) => this.uninstallExtension(id));

			return TPromise.join(promises);
		});
	}

	private uninstallExtension(id: string): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, id);

		return pfs.exists(extensionPath)
			.then(exists => exists ? null : Promise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(id))
			.then(() => this.setObsolete(id))
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this.unsetObsolete(id))
			.then(() => this._onDidUninstallExtension.fire(id));
	}

	getInstalled(type: LocalExtensionType = null): TPromise<ILocalExtension[]> {
		const promises = [];

		if (type === null || type === LocalExtensionType.System) {
			promises.push(this.scanSystemExtensions());
		}

		if (type === null || type === LocalExtensionType.User) {
			promises.push(this.scanUserExtensions());
		}

		return TPromise.join(promises).then(flatten);
	}

	private scanSystemExtensions(): TPromise<ILocalExtension[]> {
		return this.scanExtensions(SystemExtensionsRoot, LocalExtensionType.System);
	}

	private scanUserExtensions(): TPromise<ILocalExtension[]> {
		return this.scanExtensions(this.extensionsPath, LocalExtensionType.User).then(extensions => {
			const byId = values(groupBy(extensions, p => `${ p.manifest.publisher }.${ p.manifest.name }`));
			return byId.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
		});
	}

	private scanExtensions(root: string, type: LocalExtensionType): TPromise<ILocalExtension[]> {
		const limiter = new Limiter(10);

		return this.getObsoleteExtensions()
			.then(obsolete => {
				return pfs.readdir(root)
					.then(extensions => extensions.filter(id => !obsolete[id]))
					.then<ILocalExtension[]>(extensionIds => Promise.join(extensionIds.map(id => {
						const extensionPath = path.join(root, id);

						const each = () => pfs.readdir(extensionPath).then(children => {
							const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
							const readmeUrl = readme ? URI.file(path.join(extensionPath, readme)).toString() : null;
							const changelog = children.filter(child => /^changelog(\.txt|\.md|)$/i.test(child))[0];
							const changelogUrl = changelog ? URI.file(path.join(extensionPath, changelog)).toString() : null;

							return readManifest(extensionPath)
								.then<ILocalExtension>(({ manifest, metadata }) => ({ type, id, manifest, metadata, path: extensionPath, readmeUrl, changelogUrl }));
						}).then(null, () => null);

						return limiter.queue(each);
					})))
					.then(result => result.filter(a => !!a));
			});
	}

	removeDeprecatedExtensions(): TPromise<void> {
		const outdated = this.getOutdatedExtensionIds()
			.then(extensions => extensions.map(e => getExtensionId(e.manifest, e.manifest.version)));

		const obsolete = this.getObsoleteExtensions()
			.then(obsolete => Object.keys(obsolete));

		return TPromise.join([outdated, obsolete])
			.then(result => flatten(result))
			.then<void>(extensionsIds => {
				return TPromise.join(extensionsIds.map(id => {
					return pfs.rimraf(path.join(this.extensionsPath, id))
						.then(() => this.withObsoleteExtensions(obsolete => delete obsolete[id]));
				}));
			});
	}

	private getOutdatedExtensionIds(): TPromise<ILocalExtension[]> {
		return this.scanUserExtensions()
			.then(extensions => values(groupBy(extensions, p => `${ p.manifest.publisher }.${ p.manifest.name }`)))
			.then(versions => flatten(versions.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version)).slice(1))));
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

	private getObsoleteExtensions(): TPromise<{ [id:string]: boolean; }> {
		return this.withObsoleteExtensions(obsolete => obsolete);
	}

	private withObsoleteExtensions<T>(fn: (obsolete: { [id:string]: boolean; }) => T): TPromise<T> {
		return this.obsoleteFileLimiter.queue(() => {
			let result: T = null;
			return pfs.readFile(this.obsoletePath, 'utf8')
				.then<string>(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
				.then<{ [id: string]: boolean }>(raw => { try { return JSON.parse(raw); } catch (e) { return {}; }})
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
