/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { tmpdir } from 'os';
import * as path from 'path';
import types = require('vs/base/common/types');
import { ServiceEvent } from 'vs/base/common/service';
import * as pfs from 'vs/base/node/pfs';
import { assign } from 'vs/base/common/objects';
import { flatten } from 'vs/base/common/arrays';
import { extract, buffer } from 'vs/base/node/zip';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IExtensionsService, IExtension, IExtensionManifest, IGalleryMetadata, IGalleryVersion } from 'vs/workbench/parts/extensions/common/extensions';
import { download, json, IRequestOptions } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { UserSettings } from 'vs/workbench/node/userSettings';
import * as semver from 'semver';
import { groupBy, values } from 'vs/base/common/collections';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';

function parseManifest(raw: string): TPromise<IExtensionManifest> {
	return new Promise((c, e) => {
		try {
			c(JSON.parse(raw));
		} catch (err) {
			e(new Error(nls.localize('invalidManifest', "Extension invalid: package.json is not a JSON file.")));
		}
	});
}

function validate(zipPath: string, extension?: IExtension, version = extension && extension.version): TPromise<IExtension> {
	return buffer(zipPath, 'extension/package.json')
		.then(buffer => parseManifest(buffer.toString('utf8')))
		.then(manifest => {
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

function createExtension(manifest: IExtensionManifest, galleryInformation?: IGalleryMetadata, path?: string): IExtension {
	const extension: IExtension = {
		name: manifest.name,
		displayName: manifest.displayName || manifest.name,
		publisher: manifest.publisher,
		version: manifest.version,
		engines: { vscode: manifest.engines.vscode },
		description: manifest.description || ''
	};

	if (galleryInformation) {
		extension.galleryInformation = galleryInformation;
	}

	if (path) {
		extension.path = path;
	}

	return extension;
}

function getExtensionId(extension: IExtensionManifest, version = extension.version): string {
	return `${ extension.publisher }.${ extension.name }-${ version }`;
}

export class ExtensionsService implements IExtensionsService {

	serviceId = IExtensionsService;

	private extensionsPath: string;
	private obsoletePath: string;
	private obsoleteFileLimiter: Limiter<void>;

	private _onInstallExtension = new Emitter<IExtensionManifest>();
	@ServiceEvent onInstallExtension: Event<IExtensionManifest> = this._onInstallExtension.event;

	private _onDidInstallExtension = new Emitter<{ extension: IExtension; error?: Error; }>();
	@ServiceEvent onDidInstallExtension: Event<{ extension: IExtension; error?: Error; }> = this._onDidInstallExtension.event;

	private _onUninstallExtension = new Emitter<IExtension>();
	@ServiceEvent onUninstallExtension: Event<IExtension> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<IExtension>();
	@ServiceEvent onDidUninstallExtension: Event<IExtension> = this._onDidUninstallExtension.event;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		const env = contextService.getConfiguration().env;
		this.extensionsPath = env.userExtensionsHome;
		this.obsoletePath = path.join(this.extensionsPath, '.obsolete');
		this.obsoleteFileLimiter = new Limiter(1);
	}

	install(extension: IExtension): TPromise<IExtension>;
	install(zipPath: string): TPromise<IExtension>;
	install(arg: any): TPromise<IExtension> {
		if (types.isString(arg)) {
			return this.installFromZip(arg);
		}

		const extension = arg as IExtension;
		return this.isObsolete(extension).then(obsolete => {
			if (obsolete) {
				return TPromise.wrapError(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", extension.name)));
			}

			return this.installFromGallery(arg);
		});
	}

	private installFromGallery(extension: IExtension): TPromise<IExtension> {
		const galleryInformation = extension.galleryInformation;

		if (!galleryInformation) {
			return TPromise.wrapError(new Error(nls.localize('missingGalleryInformation', "Gallery information is missing")));
		}

		this._onInstallExtension.fire(extension);

		return this.getLastValidExtensionVersion(extension, extension.galleryInformation.versions).then(versionInfo => {
			const version = versionInfo.version;
			const url = versionInfo.downloadUrl;
			const headers = versionInfo.downloadHeaders;
			const zipPath = path.join(tmpdir(), galleryInformation.id);
			const extensionPath = path.join(this.extensionsPath, getExtensionId(extension, version));
			const manifestPath = path.join(extensionPath, 'package.json');

			return this.request(url)
				.then(opts => assign(opts, { headers }))
				.then(opts => download(zipPath, opts))
				.then(() => validate(zipPath, extension, version))
				.then(manifest => extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true }).then(() => manifest))
				.then(manifest => assign({ __metadata: galleryInformation }, manifest))
				.then(manifest => pfs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t')))
				.then(() => { this._onDidInstallExtension.fire({ extension }); return extension; })
				.then(null, error => { this._onDidInstallExtension.fire({ extension, error }); return TPromise.wrapError(error); });
		});
	}

	private getLastValidExtensionVersion(extension: IExtension, versions: IGalleryVersion[]): TPromise<IGalleryVersion> {
		if (!versions.length) {
			return TPromise.wrapError(new Error(nls.localize('noCompatible', "Couldn't find a compatible version of {0} with this version of Code.", extension.displayName)));
		}

		const version = versions[0];
		return this.request(version.manifestUrl)
			.then(opts => json<IExtensionManifest>(opts))
			.then(manifest => {
				const codeVersion = this.contextService.getConfiguration().env.version;
				const desc = {
					isBuiltin: false,
					engines: { vscode: manifest.engines.vscode },
					main: manifest.main
				};

				if (!isValidExtensionVersion(codeVersion, desc, [])) {
					return this.getLastValidExtensionVersion(extension, versions.slice(1));
				}

				return version;
			});
	}

	private installFromZip(zipPath: string): TPromise<IExtension> {
		return validate(zipPath).then(manifest => {
			const extensionPath = path.join(this.extensionsPath, getExtensionId(manifest));
			this._onInstallExtension.fire(manifest);

			return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
				.then(() => createExtension(manifest, (<any> manifest).__metadata, extensionPath))
				.then(extension => { this._onDidInstallExtension.fire({ extension }); return extension; });
		});
	}

	uninstall(extension: IExtension): TPromise<void> {
		const extensionPath = extension.path || path.join(this.extensionsPath, getExtensionId(extension));

		return pfs.exists(extensionPath)
			.then(exists => exists ? null : Promise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(extension))
			.then(() => this.setObsolete(extension))
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this.unsetObsolete(extension))
			.then(() => this._onDidUninstallExtension.fire(extension));
	}

	getInstalled(includeDuplicateVersions: boolean = false): TPromise<IExtension[]> {
		const all = this.getAllInstalled();

		if (includeDuplicateVersions) {
			return all;
		}

		return all.then(extensions => {
			const byId = values(groupBy(extensions, p => `${ p.publisher }.${ p.name }`));
			return byId.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
		});
	}

	private getAllInstalled(): TPromise<IExtension[]> {
		const limiter = new Limiter(10);

		return this.getObsoleteExtensions()
			.then(obsolete => {
				return pfs.readdir(this.extensionsPath)
					.then(extensions => extensions.filter(e => !obsolete[e]))
					.then<IExtension[]>(extensions => Promise.join(extensions.map(e => {
						const extensionPath = path.join(this.extensionsPath, e);

						return limiter.queue(
							() => pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
								.then(raw => parseManifest(raw))
								.then(manifest => createExtension(manifest, (<any> manifest).__metadata, extensionPath))
								.then(null, () => null)
						);
					})))
					.then(result => result.filter(a => !!a));
			});
	}

	removeDeprecatedExtensions(): TPromise<void> {
		const outdated = this.getOutdatedExtensions()
			.then(extensions => extensions.map(e => getExtensionId(e)));

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

	private getOutdatedExtensions(): TPromise<IExtension[]> {
		return this.getAllInstalled().then(plugins => {
			const byId = values(groupBy(plugins, p => `${ p.publisher }.${ p.name }`));
			const extensions = flatten(byId.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version)).slice(1)));

			return extensions
				.filter(e => !!e.path);
		});
	}

	private isObsolete(extension: IExtension): TPromise<boolean> {
		const id = getExtensionId(extension);
		return this.withObsoleteExtensions(obsolete => !!obsolete[id]);
	}

	private setObsolete(extension: IExtension): TPromise<void> {
		const id = getExtensionId(extension);
		return this.withObsoleteExtensions(obsolete => assign(obsolete, { [id]: true }));
	}

	private unsetObsolete(extension: IExtension): TPromise<void> {
		const id = getExtensionId(extension);
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
			UserSettings.getValue(this.contextService, 'http.proxy'),
			UserSettings.getValue(this.contextService, 'http.proxyStrictSSL')
		]);

		return settings.then(settings => {
			const proxyUrl: string = settings[0];
			const strictSSL: boolean = settings[1];
			const agent = getProxyAgent(url, { proxyUrl, strictSSL });

			return { url, agent, strictSSL };
		});
	}
}
