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
import { IExtensionManagementService, IExtension, IGalleryExtension, IExtensionManifest, IGalleryVersion } from 'vs/platform/extensionManagement/common/extensionManagement';
import { download, json, IRequestOptions } from 'vs/base/node/request';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { UserSettings } from 'vs/workbench/node/userSettings';
import * as semver from 'semver';
import { groupBy, values } from 'vs/base/common/collections';
import { isValidExtensionVersion } from 'vs/platform/extensions/node/extensionValidator';
import pkg from 'vs/platform/package';

function parseManifest(raw: string): TPromise<IExtensionManifest> {
	return new Promise((c, e) => {
		try {
			c(JSON.parse(raw));
		} catch (err) {
			e(new Error(nls.localize('invalidManifest', "Extension invalid: package.json is not a JSON file.")));
		}
	});
}

function validate(zipPath: string, extension?: IExtensionManifest, version = extension && extension.version): TPromise<IExtensionManifest> {
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

function getExtensionId(extension: IExtensionManifest, version = extension.version): string {
	return `${ extension.publisher }.${ extension.name }-${ version }`;
}

export class ExtensionManagementService implements IExtensionManagementService {

	serviceId = IExtensionManagementService;

	private extensionsPath: string;
	private obsoletePath: string;
	private obsoleteFileLimiter: Limiter<void>;
	private disposables: IDisposable[];

	private _onInstallExtension = new Emitter<string>();
	onInstallExtension: Event<string> = this._onInstallExtension.event;

	private _onDidInstallExtension = new Emitter<{ id: string; error?: Error; }>();
	onDidInstallExtension: Event<{ id: string; error?: Error; }> = this._onDidInstallExtension.event;

	private _onUninstallExtension = new Emitter<string>();
	onUninstallExtension: Event<string> = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<string>();
	onDidUninstallExtension: Event<string> = this._onDidUninstallExtension.event;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ITelemetryService telemetryService: ITelemetryService
	) {
		this.extensionsPath = environmentService.extensionsPath;
		this.obsoletePath = path.join(this.extensionsPath, '.obsolete');
		this.obsoleteFileLimiter = new Limiter(1);

		// this.disposables = [
		// 	this.onDidInstallExtension(({ extension, isUpdate, error }) => telemetryService.publicLog(
		// 		isUpdate ? 'extensionGallery2:update' : 'extensionGallery2:install',
		// 		assign(getTelemetryData(extension), { success: !error })
		// 	)),
		// 	this.onDidUninstallExtension(extension => telemetryService.publicLog(
		// 		'extensionGallery2:uninstall',
		// 		assign(getTelemetryData(extension), { success: true })
		// 	))
		// ];
	}

	install(extension: IGalleryExtension): TPromise<void>;
	install(zipPath: string): TPromise<void>;
	install(arg: any): TPromise<void> {
		if (types.isString(arg)) {
			return this.installFromZip(arg);
		}

		const extension = arg as IGalleryExtension;
		const { manifest } = extension;
		const id = getExtensionId(manifest);

		return this.isObsolete(id).then(obsolete => {
			if (obsolete) {
				return TPromise.wrapError<void>(new Error(nls.localize('restartCode', "Please restart Code before reinstalling {0}.", manifest.name)));
			}

			return this.installFromGallery(arg);
		});
	}

	private installFromGallery(extension: IGalleryExtension): TPromise<void> {
		const id = getExtensionId(extension.manifest);

		this._onInstallExtension.fire(id);

		return this.getLastValidExtensionVersion(extension).then(versionInfo => {
				const version = versionInfo.version;
				const url = versionInfo.downloadUrl;
				const headers = versionInfo.downloadHeaders;
				const zipPath = path.join(tmpdir(), extension.id);
				const extensionPath = path.join(this.extensionsPath, getExtensionId(extension.manifest, version));

				return this.request(url)
					.then(opts => assign(opts, { headers }))
					.then(opts => download(zipPath, opts))
					.then(() => validate(zipPath, extension.manifest, version))
					.then(manifest => extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true }))
					.then(() => this._onDidInstallExtension.fire({ id }))
					.then<void>(null, error => { this._onDidInstallExtension.fire({ id, error }); return TPromise.wrapError(error); });
		});
	}

	private getLastValidExtensionVersion(extension: IGalleryExtension): TPromise<IGalleryVersion> {
		return this._getLastValidExtensionVersion(extension, extension.metadata.versions);
	}

	private _getLastValidExtensionVersion(extension: IGalleryExtension, versions: IGalleryVersion[]): TPromise<IGalleryVersion> {
		if (!versions.length) {
			return TPromise.wrapError(new Error(nls.localize('noCompatible', "Couldn't find a compatible version of {0} with this version of Code.", extension.manifest.displayName)));
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

	private installFromZip(zipPath: string): TPromise<void> {
		return validate(zipPath).then(manifest => {
			const id = getExtensionId(manifest);
			const extensionPath = path.join(this.extensionsPath, id);
			this._onInstallExtension.fire(id);

			return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
				.then(() => this._onDidInstallExtension.fire({ id }))
				.then<void>(null, error => { this._onDidInstallExtension.fire({ id, error }); return TPromise.wrapError(error); });
		});
	}

	uninstall(extension: IExtension): TPromise<void> {
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

	getInstalled(includeDuplicateVersions: boolean = false): TPromise<IExtension[]> {
		const all = this.getAllInstalled();

		if (includeDuplicateVersions) {
			return all;
		}

		return all.then(extensions => {
			const byId = values(groupBy(extensions, p => `${ p.manifest.publisher }.${ p.manifest.name }`));
			return byId.map(p => p.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0]);
		});
	}

	private getAllInstalled(): TPromise<IExtension[]> {
		const limiter = new Limiter(10);

		return this.getObsoleteExtensions()
			.then(obsolete => {
				return pfs.readdir(this.extensionsPath)
					.then(extensions => extensions.filter(id => !obsolete[id]))
					.then<IExtension[]>(extensionIds => Promise.join(extensionIds.map(id => {
						const extensionPath = path.join(this.extensionsPath, id);

						return limiter.queue(
							() => pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
								.then(raw => parseManifest(raw))
								.then<IExtension>(manifest => ({ id, manifest }))
								.then(null, () => null)
						);
					})))
					.then(result => result.filter(a => !!a));
			});
	}

	removeDeprecatedExtensions(): TPromise<void> {
		const outdated = this.getOutdatedExtensionIds()
			.then(extensions => extensions.map(e => getExtensionId(e.manifest)));

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

	private getOutdatedExtensionIds(): TPromise<IExtension[]> {
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
