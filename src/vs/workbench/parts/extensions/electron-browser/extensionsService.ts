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
import errors = require('vs/base/common/errors');
import * as pfs from 'vs/base/node/pfs';
import { assign } from 'vs/base/common/objects';
import { extract, buffer } from 'vs/base/node/zip';
import { Promise, TPromise } from 'vs/base/common/winjs.base';
import { IExtensionsService, IExtension, IExtensionManifest, IGalleryInformation } from 'vs/workbench/parts/extensions/common/extensions';
import { download, getProxyAgent, getSystemProxyAgent } from 'vs/base/node/request';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { Limiter } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { manager as Settings } from 'vs/workbench/electron-main/settings';

function parseManifest(raw: string): TPromise<IExtensionManifest> {
	return new Promise((c, e) => {
		try {
			c(JSON.parse(raw));
		} catch (err) {
			e(new Error(nls.localize('invalidManifest', "Extension invalid: package.json is not a JSON file.")));
		}
	});
}

function validate(zipPath: string, extension?: IExtension): TPromise<IExtension> {
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

				if (extension.version !== manifest.version) {
					return Promise.wrapError(Error(nls.localize('invalidVersion', "Extension invalid: manifest version mismatch.")));
				}
			}

			return Promise.as(manifest);
		});
}

function createExtension(manifest: IExtensionManifest, galleryInformation?: IGalleryInformation, path?: string): IExtension {
	const extension: IExtension = {
		name: manifest.name,
		displayName: manifest.displayName || manifest.name,
		publisher: manifest.publisher,
		version: manifest.version,
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

export class ExtensionsService implements IExtensionsService {

	public serviceId = IExtensionsService;

	private extensionsPath: string;

	private _onInstallExtension = new Emitter<IExtensionManifest>();
	@ServiceEvent onInstallExtension = this._onInstallExtension.event;

	private _onDidInstallExtension = new Emitter<IExtension>();
	@ServiceEvent onDidInstallExtension = this._onDidInstallExtension.event;

	private _onUninstallExtension = new Emitter<IExtension>();
	@ServiceEvent onUninstallExtension = this._onUninstallExtension.event;

	private _onDidUninstallExtension = new Emitter<IExtension>();
	@ServiceEvent onDidUninstallExtension = this._onDidUninstallExtension.event;

	constructor(
		@IWorkspaceContextService private contextService: IWorkspaceContextService
	) {
		const env = contextService.getConfiguration().env;
		this.extensionsPath = env.userPluginsHome;
	}

	public install(extension: IExtension): TPromise<IExtension>;
	public install(zipPath: string): TPromise<IExtension>;
	public install(arg: any): TPromise<IExtension> {
		if (types.isString(arg)) {
			return this.installFromZip(arg);
		}

		return this.installFromGallery(arg);
	}

	private installFromGallery(extension: IExtension): TPromise<IExtension> {
		const galleryInformation = extension.galleryInformation;

		if (!galleryInformation) {
			return TPromise.wrapError(new Error(nls.localize('missingGalleryInformation', "Gallery information is missing")));
		}

		const httpProxySettings = Settings.getValue('http.proxy');
		const getAgent = url => httpProxySettings ? getProxyAgent(url, httpProxySettings) : getSystemProxyAgent(url);

		const url = `${ galleryInformation.galleryApiUrl }/publisher/${ extension.publisher }/extension/${ extension.name }/latest/assetbyname/Microsoft.VisualStudio.Services.VSIXPackage?install=true`;
		const zipPath = path.join(tmpdir(), galleryInformation.id);
		const extensionPath = path.join(this.extensionsPath, `${ extension.publisher }.${ extension.name }`);
		const manifestPath = path.join(extensionPath, 'package.json');

		return download(zipPath, { url: url, agent: getAgent(url) })
			.then(() => validate(zipPath, extension))
			.then(manifest => { this._onInstallExtension.fire(manifest); return manifest; })
			.then(manifest => extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true }).then(() => manifest))
			.then(manifest => {
				manifest = assign({ __metadata: galleryInformation }, manifest);
				return pfs.writeFile(manifestPath, JSON.stringify(manifest, null, '\t'));
			})
			.then(() => { this._onDidInstallExtension.fire(extension); return extension; });
	}

	private installFromZip(zipPath: string): TPromise<IExtension> {
		return validate(zipPath).then(manifest => {
			const extensionPath = path.join(this.extensionsPath, `${ manifest.publisher }.${ manifest.name }`);
			this._onInstallExtension.fire(manifest);

			return extract(zipPath, extensionPath, { sourcePath: 'extension', overwrite: true })
				.then(() => createExtension(manifest, (<any> manifest).__metadata, extensionPath))
				.then(extension => { this._onDidInstallExtension.fire(extension); return extension; });
		});
	}

	public uninstall(extension: IExtension): TPromise<void> {
		const extensionPath = this.getInstallationPath(extension);

		return pfs.exists(extensionPath)
			.then(exists => exists ? null : Promise.wrapError(new Error(nls.localize('notExists', "Could not find extension"))))
			.then(() => this._onUninstallExtension.fire(extension))
			.then(() => pfs.rimraf(extensionPath))
			.then(() => this._onDidUninstallExtension.fire(extension));
	}

	public getInstalled(): TPromise<IExtension[]> {
		const limiter = new Limiter(10);

		return pfs.readdir(this.extensionsPath)
			.then<IExtensionManifest[]>(extensions => Promise.join(extensions.map(e => {
				const extensionPath = path.join(this.extensionsPath, e);

				return limiter.queue(
					() => pfs.readFile(path.join(extensionPath, 'package.json'), 'utf8')
						.then(raw => parseManifest(raw))
						.then(manifest => createExtension(manifest, (<any> manifest).__metadata, extensionPath))
						.then(null, () => null)
				);
			})))
			.then(result => result.filter(a => !!a));
	}

	private getInstallationPath(extension: IExtension): string {
		return extension.path ||  path.join(this.extensionsPath, `${ extension.publisher }.${ extension.name }`);
	}
}
