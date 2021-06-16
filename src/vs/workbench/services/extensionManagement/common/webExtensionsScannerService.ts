/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, ExtensionType, IExtensionIdentifier, IExtension, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IFileService } from 'vs/platform/files/common/files';
import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { asText, isSuccess, IRequestService } from 'vs/platform/request/common/request';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionGalleryService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { groupByExtension, areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import type { IStaticExtension } from 'vs/workbench/workbench.web.api';
import { Disposable } from 'vs/base/common/lifecycle';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { localize } from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { isArray, isFunction, isString, isUndefined } from 'vs/base/common/types';
import { getErrorMessage } from 'vs/base/common/errors';
import { ResourceMap } from 'vs/base/common/map';

interface IStoredWebExtension {
	readonly identifier: IExtensionIdentifier;
	readonly version: string;
	readonly location: UriComponents;
	readonly readmeUri?: UriComponents;
	readonly changelogUri?: UriComponents;
	readonly packageNLSUri?: UriComponents;
}

interface IWebExtension {
	identifier: IExtensionIdentifier;
	version: string;
	location: URI;
	readmeUri?: URI;
	changelogUri?: URI;
	packageNLSUri?: URI;
}

export class WebExtensionsScannerService extends Disposable implements IWebExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly builtinExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);
	private readonly staticExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);
	private readonly userConfiguredExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);

	private readonly staticExtensionsResource: URI | undefined = undefined;
	private readonly installedExtensionsResource: URI | undefined = undefined;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IWebExtension[]>>();

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IBuiltinExtensionsScannerService private readonly builtinExtensionsScannerService: IBuiltinExtensionsScannerService,
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
	) {
		super();
		if (isWeb) {
			this.installedExtensionsResource = joinPath(environmentService.userRoamingDataHome, 'extensions.json');
			this.staticExtensionsResource = joinPath(environmentService.userRoamingDataHome, 'staticExtensions.json');
			this.builtinExtensionsPromise = this.readBuiltinExtensions();
			this.staticExtensionsPromise = this.readStaticExtensions();
			this.userConfiguredExtensionsPromise = this.readUserConfiguredExtensions();
		}
	}

	/**
	 * All builtin extensions bundled with the product
	 */
	private async readBuiltinExtensions(): Promise<IExtension[]> {
		let builtinExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
		if (isFunction(this.environmentService.options?.builtinExtensionsFilter)) {
			builtinExtensions = builtinExtensions.filter(e => this.environmentService.options!.builtinExtensionsFilter!(e.identifier.id));
		}
		return builtinExtensions;
	}

	/**
	 * All extensions defined via `staticExtensions` API
	 */
	private async readStaticExtensions(): Promise<IExtension[]> {
		const staticExtensions: (string | IStaticExtension)[] = this.environmentService.options && Array.isArray(this.environmentService.options.staticExtensions) ? this.environmentService.options.staticExtensions : [];
		const staticExtensionIds = [], result: IExtension[] = [];
		for (const e of staticExtensions) {
			if (isString(e)) {
				staticExtensionIds.push(e);
			} else {
				const extension = this.parseStaticExtension(e, isUndefined(e.isBuiltin) ? true : e.isBuiltin);
				if (extension) {
					result.push(extension);
				}
			}
		}
		if (staticExtensionIds.length) {
			try {
				result.push(...await this.getStaticExtensionsFromGallery(staticExtensionIds));
			} catch (error) {
				this.logService.info('Ignoring following static extensions as there is an error while fetching them from gallery', staticExtensionIds, getErrorMessage(error));
			}
		}
		return result;
	}

	private async getStaticExtensionsFromGallery(extensionIds: string[]): Promise<IExtension[]> {
		if (!this.galleryService.isEnabled()) {
			this.logService.info('Ignoring fetching static extensions from gallery as it is disabled.');
			return [];
		}

		const cachedStaticWebExtensions = await this.readWebExtensions(this.staticExtensionsResource);
		const webExtensions: IWebExtension[] = [];
		extensionIds = extensionIds.map(id => id.toLowerCase());

		for (const webExtension of cachedStaticWebExtensions) {
			const index = extensionIds.indexOf(webExtension.identifier.id.toLowerCase());
			if (index !== -1) {
				webExtensions.push(webExtension);
				extensionIds.splice(index, 1);
			}
		}

		if (extensionIds.length) {
			const galleryExtensions = await this.galleryService.getExtensions(extensionIds, CancellationToken.None);
			const missingExtensions = extensionIds.filter(id => !galleryExtensions.find(({ identifier }) => areSameExtensions(identifier, { id })));
			if (missingExtensions.length) {
				this.logService.info('Cannot find static extensions from gallery', missingExtensions);
			}

			await Promise.all(galleryExtensions.map(async gallery => {
				try {
					if (this.canAddExtension(gallery)) {
						webExtensions.push(await this.toWebExtension(gallery));
					} else {
						this.logService.info(`Ignoring static gallery extension ${gallery.identifier.id} because it is not a web extension`);
					}
				} catch (error) {
					this.logService.info(`Ignoring static gallery extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
				}
			}));
		}

		const result: IExtension[] = [];

		if (webExtensions.length) {
			await Promise.all(webExtensions.map(async webExtension => {
				try {
					result.push(await this.toExtension(webExtension, true));
				} catch (error) {
					this.logService.info(`Ignoring static gallery extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
				}
			}));
		}

		try {
			await this.writeWebExtensions(this.staticExtensionsResource, webExtensions);
		} catch (error) {
			this.logService.info(`Ignoring the error while adding static gallery extensions`, getErrorMessage(error));
		}

		return result;
	}

	private parseStaticExtension(e: IStaticExtension, isBuiltin: boolean): IExtension | null {
		const extensionLocation = URI.revive(e.extensionLocation);
		try {
			return {
				identifier: { id: getGalleryExtensionId(e.packageJSON.publisher, e.packageJSON.name) },
				location: extensionLocation,
				type: ExtensionType.User,
				isBuiltin,
				manifest: e.packageJSON,
			};
		} catch (error) {
			this.logService.error(`Error while parsing extension ${extensionLocation.toString()}`);
			this.logService.error(error);
		}
		return null;
	}

	private async readUserConfiguredExtensions(): Promise<IExtension[]> {
		const result: IStaticExtension[] = [];
		const userConfiguredExtensions = this.configurationService.getValue<{ location: string }[]>('_extensions.defaultUserWebExtensions');
		if (isArray(userConfiguredExtensions)) {
			for (const userConfiguredExtension of userConfiguredExtensions) {
				try {
					const extensionLocation = URI.parse(userConfiguredExtension.location);
					const manifestLocation = joinPath(extensionLocation, 'package.json');
					const context = await this.requestService.request({ type: 'GET', url: manifestLocation.toString(true) }, CancellationToken.None);
					if (!isSuccess(context)) {
						this.logService.warn('Skipped user static extension as there is an error while fetching manifest', manifestLocation);
						continue;
					}
					const content = await asText(context);
					if (!content) {
						this.logService.warn('Skipped user static extension as there is manifest is not found', manifestLocation);
						continue;
					}
					const packageJSON = JSON.parse(content);
					result.push({
						packageJSON,
						extensionLocation,
					});
				} catch (error) {
					this.logService.warn('Skipped user static extension as there is an error while fetching manifest', userConfiguredExtension);
				}
			}
		}
		const extensions: IExtension[] = [];
		for (const e of result) {
			const extension = this.parseStaticExtension(e, false);
			if (extension) {
				extensions.push(extension);
			}
		}
		return extensions;
	}

	async scanSystemExtensions(): Promise<IExtension[]> {
		return this.builtinExtensionsPromise;
	}

	async scanUserExtensions(): Promise<IExtension[]> {
		const extensions = [];

		// Static extensions defined through `staticExtensions` API
		const staticExtensions = await this.staticExtensionsPromise;
		extensions.push(...staticExtensions);

		// User configured extensions
		const userConfiguredExtensions = await this.userConfiguredExtensionsPromise;
		extensions.push(...userConfiguredExtensions);

		// User Installed extensions
		const installedExtensions = await this.scanInstalledExtensions();
		extensions.push(...installedExtensions);

		return extensions;
	}

	async scanExtensionsUnderDevelopment(): Promise<IExtension[]> {
		const devExtensions = this.environmentService.options?.developmentOptions?.extensions;
		const result: IExtension[] = [];
		if (Array.isArray(devExtensions)) {
			for (const e of devExtensions) {
				const extension = this.parseStaticExtension(e, false);
				if (extension) {
					result.push(extension);
				}
			}
		}
		return result;
	}

	async scanSingleExtension(extensionLocation: URI, extensionType: ExtensionType): Promise<IExtension | null> {
		if (extensionType === ExtensionType.System) {
			const systemExtensions = await this.scanSystemExtensions();
			return systemExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
		}
		const userExtensions = await this.scanUserExtensions();
		return userExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
	}

	canAddExtension(galleryExtension: IGalleryExtension): boolean {
		if (this.environmentService.options?.assumeGalleryExtensionsAreAddressable) {
			return true;
		}

		return !!galleryExtension.properties.webExtension && !!galleryExtension.webResource;
	}

	async addExtension(galleryExtension: IGalleryExtension): Promise<IExtension> {
		if (!this.canAddExtension(galleryExtension)) {
			throw new Error(localize('cannot be installed', "Cannot install '{0}' because this extension is not a web extension.", galleryExtension.displayName || galleryExtension.name));
		}

		const webExtension = await this.toWebExtension(galleryExtension);
		const extension = await this.toExtension(webExtension, false);
		const installedExtensions = await this.readInstalledExtensions();
		installedExtensions.push(webExtension);
		await this.writeInstalledExtensions(installedExtensions);
		return extension;
	}

	async removeExtension(identifier: IExtensionIdentifier, version?: string): Promise<void> {
		let installedExtensions = await this.readInstalledExtensions();
		installedExtensions = installedExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier) && (version ? extension.version === version : true)));
		await this.writeInstalledExtensions(installedExtensions);
	}

	private async scanInstalledExtensions(): Promise<IExtension[]> {
		let installedExtensions = await this.readInstalledExtensions();
		const byExtension: IWebExtension[][] = groupByExtension(installedExtensions, e => e.identifier);
		installedExtensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
		const extensions: IExtension[] = [];
		await Promise.all(installedExtensions.map(async installedExtension => {
			try {
				extensions.push(await this.toExtension(installedExtension, false));
			} catch (error) {
				this.logService.error(error, 'Error while scanning user extension', installedExtension.identifier.id);
			}
		}));
		return extensions;
	}

	private async toWebExtension(galleryExtension: IGalleryExtension): Promise<IWebExtension> {
		const extensionLocation = joinPath(galleryExtension.assetUri, 'Microsoft.VisualStudio.Code.WebResources', 'extension');
		const packageNLSUri = joinPath(extensionLocation, 'package.nls.json');
		const context = await this.requestService.request({ type: 'GET', url: packageNLSUri.toString() }, CancellationToken.None);
		const packageNLSExists = isSuccess(context);
		return {
			identifier: galleryExtension.identifier,
			version: galleryExtension.version,
			location: extensionLocation,
			readmeUri: galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined,
			changelogUri: galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined,
			packageNLSUri: packageNLSExists ? packageNLSUri : undefined
		};
	}

	private async toExtension(webExtension: IWebExtension, isBuiltin: boolean): Promise<IExtension> {
		const context = await this.requestService.request({ type: 'GET', url: joinPath(webExtension.location, 'package.json').toString() }, CancellationToken.None);
		if (!isSuccess(context)) {
			throw new Error(`Error while fetching package.json for extension '${webExtension.identifier.id}'. Server returned ${context.res.statusCode}`);
		}
		const content = await asText(context);
		if (!content) {
			throw new Error(`Error while fetching package.json for extension '${webExtension.identifier.id}'. Server returned no content`);
		}

		let manifest: IExtensionManifest = JSON.parse(content);
		if (webExtension.packageNLSUri) {
			manifest = await this.translateManifest(manifest, webExtension.packageNLSUri);
		}

		return {
			identifier: webExtension.identifier,
			location: webExtension.location,
			manifest,
			type: ExtensionType.User,
			isBuiltin,
			readmeUrl: webExtension.readmeUri,
			changelogUrl: webExtension.changelogUri,
		};
	}

	private async translateManifest(manifest: IExtensionManifest, nlsURL: URI): Promise<IExtensionManifest> {
		try {
			const context = await this.requestService.request({ type: 'GET', url: nlsURL.toString() }, CancellationToken.None);
			if (isSuccess(context)) {
				const content = await asText(context);
				if (content) {
					manifest = localizeManifest(manifest, JSON.parse(content));
				}
			}
		} catch (error) { /* ignore */ }
		return manifest;
	}

	private readInstalledExtensions(): Promise<IWebExtension[]> {
		return this.readWebExtensions(this.installedExtensionsResource);
	}

	private writeInstalledExtensions(userWebExtensions: IWebExtension[]): Promise<IWebExtension[]> {
		return this.writeWebExtensions(this.installedExtensionsResource, userWebExtensions);
	}

	private async readWebExtensions(file: URI | undefined): Promise<IWebExtension[]> {
		if (!file) {
			return [];
		}
		return this.getResourceAccessQueue(file).queue(async () => {
			try {
				const content = await this.fileService.readFile(file);
				const storedWebExtensions: IStoredWebExtension[] = this.parseExtensions(content.value.toString());
				return storedWebExtensions.map(e => ({
					identifier: e.identifier,
					version: e.version,
					location: URI.revive(e.location),
					readmeUri: URI.revive(e.readmeUri),
					changelogUri: URI.revive(e.changelogUri),
					packageNLSUri: URI.revive(e.packageNLSUri),
				}));
			} catch (error) { /* Ignore */ }
			return [];
		});
	}

	private writeWebExtensions(file: URI | undefined, webExtensions: IWebExtension[]): Promise<IWebExtension[]> {
		if (!file) {
			throw new Error('unsupported');
		}
		return this.getResourceAccessQueue(file).queue(async () => {
			const storedWebExtensions: IStoredWebExtension[] = webExtensions.map(e => ({
				identifier: e.identifier,
				version: e.version,
				location: e.location.toJSON(),
				readmeUri: e.readmeUri?.toJSON(),
				changelogUri: e.changelogUri?.toJSON(),
				packageNLSUri: e.packageNLSUri?.toJSON(),
			}));
			await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
			return webExtensions;
		});
	}

	private parseExtensions(content: string): IStoredWebExtension[] {
		const storedWebExtensions: (IStoredWebExtension & { uri?: UriComponents })[] = JSON.parse(content.toString());
		return storedWebExtensions.map(e => {
			const location = e.uri ? joinPath(URI.revive(e.uri), 'Microsoft.VisualStudio.Code.WebResources', 'extension') : e.location;
			return { ...e, location };
		});
	}

	private getResourceAccessQueue(file: URI): Queue<IWebExtension[]> {
		let resourceQueue = this.resourcesAccessQueueMap.get(file);
		if (!resourceQueue) {
			resourceQueue = new Queue<IWebExtension[]>();
			this.resourcesAccessQueueMap.set(file, resourceQueue);
		}
		return resourceQueue;
	}

}

registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService);
