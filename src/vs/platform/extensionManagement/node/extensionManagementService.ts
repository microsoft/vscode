/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { tmpdir } from 'os';
import * as path from 'path';
import types = require('vs/base/common/types');
import * as pfs from 'vs/base/node/pfs';
import { assign } from 'vs/base/common/objects';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { flatten } from 'vs/base/common/arrays';
import { extract, buffer } from 'vs/base/node/zip';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IExtensionManagementService, ILocalExtension, IGalleryExtension, IExtensionIdentity, IExtensionManifest, IGalleryVersion, IGalleryMetadata, InstallExtensionEvent, DidInstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { download, json, IRequestOptions } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { UserSettings } from 'vs/workbench/node/userSettings';
import * as semver from 'semver';
import { groupBy, values } from 'vs/base/common/collections';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';
import pkg from 'vs/platform/package';

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

function getExtensionId(extension: IExtensionIdentity, version: string): string {
	return `${ extension.publisher }.${ extension.name }-${ version }`;
}

export class ExtensionManagementService implements IExtensionManagementService {

	serviceId = IExtensionManagementService;

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
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.extensionsPath = environmentService.extensionsPath;
		this.obsoletePath = path.join(this.extensionsPath, '.obsolete');
		this.obsoleteFileLimiter = new Limiter(1);
	}

	install(extension: IGalleryExtension): TPromise<void>;
	install(zipPath: string): TPromise<void>;
	install(arg: any): TPromise<void> {
		if (types.isString(arg)) {
			const zipPath = arg as string;

			return validate(zipPath).then(manifest => {
				const id = getExtensionId(manifest, manifest.version);
				this._onInstallExtension.fire({ id });

				return this.installValidExtension(zipPath, id);
			});
		}

		const extension = arg as IGalleryExtension;
		const id = getExtensionId(extension, extension.versions[0].version);
		this._onInstallExtension.fire({ id, gallery: extension });

		return this.isObsolete(id).then(obsolete => {
			if (obsolete) {
				return TPromise.wrapError<void>(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", extension.displayName || extension.name)));
			}

			return this.installFromGallery(arg);
		});
	}

	private installFromGallery(extension: IGalleryExtension): TPromise<void> {
		return this.getLastValidExtensionVersion(extension).then(versionInfo => {
				const version = versionInfo.version;
				const url = versionInfo.downloadUrl;
				const headers = versionInfo.downloadHeaders;
				const zipPath = path.join(tmpdir(), extension.id);
				const id = getExtensionId(extension, version);
				const metadata = {
					id: extension.id,
					publisherId: extension.publisherId,
					publisherDisplayName: extension.publisherDisplayName
				};

				return this.request(url)
					.then(opts => assign(opts, { headers }))
					.then(opts => download(zipPath, opts))
					.then(() => validate(zipPath, extension, version))
					.then(() => this.installValidExtension(zipPath, id, metadata));
		});
	}

	private getLastValidExtensionVersion(extension: IGalleryExtension): TPromise<IGalleryVersion> {
		return this._getLastValidExtensionVersion(extension, extension.versions);
	}

	private _getLastValidExtensionVersion(extension: IGalleryExtension, versions: IGalleryVersion[]): TPromise<IGalleryVersion> {
		if (!versions.length) {
			return TPromise.wrapError(new Error(nls.localize('noCompatible', "Couldn't find a compatible version of {0} with this version of Code.", extension.displayName || extension.name)));
		}

		const version = versions[0];
		return this.request(version.manifestUrl)
			.then(opts => json<IExtensionManifest>(opts))
			.then(manifest => {
				const desc = {
					isBuiltin: false,
					engines: { vscode: manifest.engines.vscode },
					main: manifest.main
				};

				if (!isValidExtensionVersion(pkg.version, desc, [])) {
					return this._getLastValidExtensionVersion(extension, versions.slice(1));
				}

				return version;
			});
	}

	private installValidExtension(zipPath: string, id: string, metadata: IGalleryMetadata = null): TPromise<void> {
		const extensionPath = path.join(this.extensionsPath, id);
		const manifestPath = path.join(extensionPath, 'package.json');

		return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
			.then(() => pfs.readFile(manifestPath, 'utf8'))
			.then(raw => parseManifest(raw))
			.then(({ manifest }) => {
				return pfs.readdir(extensionPath).then(children => {
					const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
					const readmeUrl = readme ? `file://${ extensionPath }/${ readme }` : null;

					const local: ILocalExtension = { id, manifest, metadata, path: extensionPath, readmeUrl };
					const rawManifest = assign(manifest, { __metadata: metadata });

					return pfs.writeFile(manifestPath, JSON.stringify(rawManifest, null, '\t'))
						.then(() => this._onDidInstallExtension.fire({ id, local }));
				});
			})
			.then<void>(null, error => { this._onDidInstallExtension.fire({ id, error }); return TPromise.wrapError(error); });
	}

	uninstall(extension: ILocalExtension): TPromise<void> {
		const id = extension.id;
		const extensionPath = path.join(this.extensionsPath, id);

		return pfs.exists(extensionPath)
			.then(exists => exists ? null : Promise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(id))
			.then(() => this.setObsolete(id))
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this.unsetObsolete(id))
			.then(() => this._onDidUninstallExtension.fire(id));
	}

	getInstalled(includeDuplicateVersions: boolean = false): TPromise<ILocalExtension[]> {
		const all = this.getAllInstalled();

		if (includeDuplicateVersions) {
			return all;
		}

		return all.then(extensions => {
			const byId = values(groupBy(extensions, p => `${ p.manifest.publisher }.${ p.manifest.name }`));
			return byId.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
		});
	}

	private getAllInstalled(): TPromise<ILocalExtension[]> {
		const limiter = new Limiter(10);

		return this.getObsoleteExtensions()
			.then(obsolete => {
				return pfs.readdir(this.extensionsPath)
					.then(extensions => extensions.filter(id => !obsolete[id]))
					.then<ILocalExtension[]>(extensionIds => Promise.join(extensionIds.map(id => {
						const extensionPath = path.join(this.extensionsPath, id);

						const each = () => pfs.readdir(extensionPath).then(children => {
							const readme = children.filter(child => /^readme(\.txt|\.md|)$/i.test(child))[0];
							const readmeUrl = readme ? `file://${ extensionPath }/${ readme }` : null;

							return pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
								.then(raw => parseManifest(raw))
								.then<ILocalExtension>(({ manifest, metadata }) => ({ id, manifest, metadata, path: extensionPath, readmeUrl }));
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
		return this.getAllInstalled()
			.then(extensions => values(groupBy(extensions, p => `${ p.manifest.publisher }.${ p.manifest.name }`)))
			.then(versions => flatten(versions.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version)).slice(1))));
	}

	private isObsolete(id: string): TPromise<boolean> {
		return this.withObsoleteExtensions(obsolete => !!obsolete[id]);
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
				.then(null, err => err.code === 'ENOENT' ? TPromise.as('{}') : TPromise.wrapError(err))
				.then<{ [id: string]: boolean }>(raw => JSON.parse(raw))
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

	// Helper for proxy business... shameful.
	// This should be pushed down and not rely on the context service
	private request(url: string): TPromise<IRequestOptions> {
		const settings = TPromise.join([
			// TODO@Joao we need a nice configuration service here!
			UserSettings.getValue(this.environmentService.userDataPath, 'http.proxy'),
			UserSettings.getValue(this.environmentService.userDataPath, 'http.proxyStrictSSL')
		]);

		return settings.then(settings => {
			const proxyUrl: string = settings[0];
			const strictSSL: boolean = settings[1];
			const agent = getProxyAgent(url, { proxyUrl, strictSSL });

			return { url, agent, strictSSL };
		});
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}
