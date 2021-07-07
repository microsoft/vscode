/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, ExtensionType, IExtensionIdentifier, IExtension, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IScannedExtension, IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { asText, isSuccess, IRequestService } from 'vs/platform/request/common/request';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionGalleryService, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { groupByExtension, areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import type { IStaticExtension } from 'vs/workbench/workbench.web.api';
import { Disposable } from 'vs/base/common/lifecycle';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { localize } from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { isString, isUndefined } from 'vs/base/common/types';
import { getErrorMessage } from 'vs/base/common/errors';
import { ResourceMap } from 'vs/base/common/map';
import { IProductService } from 'vs/platform/product/common/productService';
import { format2 } from 'vs/base/common/strings';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IStringDictionary } from 'vs/base/common/collections';

interface IStoredWebExtension {
	readonly identifier: IExtensionIdentifier;
	readonly version: string;
	readonly location: UriComponents;
	readonly readmeUri?: UriComponents;
	readonly changelogUri?: UriComponents;
	readonly packageNLSUri?: UriComponents;
	readonly metadata?: IStringDictionary<any>;
}

interface IWebExtension {
	identifier: IExtensionIdentifier;
	version: string;
	location: URI;
	readmeUri?: URI;
	changelogUri?: URI;
	packageNLSUri?: URI;
	metadata?: IStringDictionary<any>;
}

export class WebExtensionsScannerService extends Disposable implements IWebExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly builtinExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);
	private readonly staticExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);
	private readonly cutomBuiltinExtensions: (string | URI)[];
	private readonly customBuiltinExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);

	private readonly customBuiltinExtensionsCacheResource: URI | undefined = undefined;
	private readonly installedExtensionsResource: URI | undefined = undefined;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IWebExtension[]>>();

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IBuiltinExtensionsScannerService private readonly builtinExtensionsScannerService: IBuiltinExtensionsScannerService,
		@IFileService private readonly fileService: IFileService,
		@IRequestService private readonly requestService: IRequestService,
		@ILogService private readonly logService: ILogService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
	) {
		super();
		this.cutomBuiltinExtensions = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions) ? this.environmentService.options.additionalBuiltinExtensions : [];
		if (isWeb) {
			this.installedExtensionsResource = joinPath(environmentService.userRoamingDataHome, 'extensions.json');
			this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'customBuiltinExtensionsCache.json');
			this.builtinExtensionsPromise = this.readSystemExtensions();
			this.staticExtensionsPromise = this.readStaticExtensions();
			this.customBuiltinExtensionsPromise = this.readCustomBuiltinExtensions();
		}
	}

	/**
	 * All system extensions bundled with the product
	 */
	private async readSystemExtensions(): Promise<IExtension[]> {
		return this.builtinExtensionsScannerService.scanBuiltinExtensions();
	}

	/**
	 * All extensions defined via `staticExtensions` API
	 */
	private async readStaticExtensions(): Promise<IExtension[]> {
		const staticExtensions = this.environmentService.options && Array.isArray(this.environmentService.options.staticExtensions) ? this.environmentService.options.staticExtensions : [];
		const result: IExtension[] = [];
		for (const e of staticExtensions) {
			const extension = this.parseStaticExtension(e, isUndefined(e.isBuiltin) ? true : e.isBuiltin);
			if (extension) {
				result.push(extension);
			}
		}
		return result;
	}

	/**
	 * All extensions defined via `additionalBuiltinExtensions` API
	 */
	private async readCustomBuiltinExtensions(): Promise<IExtension[]> {
		const extensionIds: string[] = [], extensionLocations: URI[] = [], result: IExtension[] = [];
		for (const e of this.cutomBuiltinExtensions) {
			if (isString(e)) {
				extensionIds.push(e);
			} else {
				extensionLocations.push(URI.revive(e));
			}
		}

		await Promise.allSettled([
			(async () => {
				if (extensionLocations.length) {
					await Promise.allSettled(extensionLocations.map(async location => {
						try {
							const webExtension = await this.toWebExtensionFromLocation(location);
							result.push(await this.toScannedExtension(webExtension, true));
						} catch (error) {
							this.logService.info(`Error while fetching the additional builtin extension ${location.toString()}.`, getErrorMessage(error));
						}
					}));
				}
			})(),
			(async () => {
				if (extensionIds.length) {
					try {
						result.push(...await this.getCustomBuiltinExtensionsFromGallery(extensionIds));
					} catch (error) {
						this.logService.info('Ignoring following additional builtin extensions as there is an error while fetching them from gallery', extensionIds, getErrorMessage(error));
					}
				} else {
					await this.writeCustomBuiltinExtensionsCache([]);
				}
			})(),
		]);

		return result;
	}

	private async getCustomBuiltinExtensionsFromGallery(extensionIds: string[]): Promise<IExtension[]> {
		if (!this.galleryService.isEnabled()) {
			this.logService.info('Ignoring fetching additional builtin extensions from gallery as it is disabled.');
			return [];
		}

		let cachedStaticWebExtensions = await this.readCustomBuiltinExtensionsCache();

		// Incase there are duplicates always take the latest version
		const byExtension: IWebExtension[][] = groupByExtension(cachedStaticWebExtensions, e => e.identifier);
		cachedStaticWebExtensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);

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
					webExtensions.push(await this.toWebExtensionFromGallery(gallery));
				} catch (error) {
					this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
				}
			}));
		}

		const result: IExtension[] = [];

		if (webExtensions.length) {
			await Promise.all(webExtensions.map(async webExtension => {
				try {
					result.push(await this.toScannedExtension(webExtension, true));
				} catch (error) {
					this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
				}
			}));
		}

		try {
			await this.writeCustomBuiltinExtensionsCache(webExtensions);
		} catch (error) {
			this.logService.info(`Ignoring the error while adding additional builtin gallery extensions`, getErrorMessage(error));
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

	async scanSystemExtensions(): Promise<IExtension[]> {
		return this.builtinExtensionsPromise;
	}

	async scanUserExtensions(): Promise<IScannedExtension[]> {
		const extensions = new Map<string, IScannedExtension>();

		// User Installed extensions
		const installedExtensions = await this.scanInstalledExtensions();
		for (const extension of installedExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		// Static extensions defined through `staticExtensions` API
		const staticExtensions = await this.staticExtensionsPromise;
		for (const extension of staticExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		// Custom builtin extensions defined through `additionalBuiltinExtensions` API
		const customBuiltinExtensions = await this.customBuiltinExtensionsPromise;
		for (const extension of customBuiltinExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		return [...extensions.values()];
	}

	async scanExtensionsUnderDevelopment(): Promise<IExtension[]> {
		const devExtensions = this.environmentService.options?.developmentOptions?.extensions;
		const result: IExtension[] = [];
		if (Array.isArray(devExtensions)) {
			await Promise.allSettled(devExtensions.map(async devExtension => {
				try {
					const location = URI.revive(devExtension);
					if (URI.isUri(location)) {
						const webExtension = await this.toWebExtensionFromLocation(location);
						result.push(await this.toScannedExtension(webExtension, false));
					} else {
						this.logService.info(`Skipping the extension under development ${devExtension} as it is not URI type.`);
					}
				} catch (error) {
					this.logService.info(`Error while fetching the extension under development ${devExtension.toString()}.`, getErrorMessage(error));
				}
			}));
		}
		return result;
	}

	async scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType): Promise<IExtension | null> {
		if (extensionType === ExtensionType.System) {
			const systemExtensions = await this.scanSystemExtensions();
			return systemExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
		}
		const userExtensions = await this.scanUserExtensions();
		return userExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
	}

	async scanExtensionManifest(extensionLocation: URI): Promise<IExtensionManifest | null> {
		const packageJSONUri = joinPath(extensionLocation, 'package.json');
		const context = await this.requestService.request({ type: 'GET', url: this.toRequestUrl(packageJSONUri) }, CancellationToken.None);
		if (isSuccess(context)) {
			const content = await asText(context);
			if (content) {
				return JSON.parse(content);
			}
		}
		return null;
	}

	async addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: IStringDictionary<any>): Promise<IExtension> {
		const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
		return this.addWebExtension(webExtension);
	}

	async addExtension(location: URI, metadata?: IStringDictionary<any>): Promise<IExtension> {
		const webExtension = await this.toWebExtensionFromLocation(location, undefined, undefined, metadata);
		return this.addWebExtension(webExtension);
	}

	async removeExtension(identifier: IExtensionIdentifier, version?: string): Promise<void> {
		let installedExtensions = await this.readInstalledExtensions();
		installedExtensions = installedExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier) && (version ? extension.version === version : true)));
		await this.writeInstalledExtensions(installedExtensions);
	}

	private async addWebExtension(webExtension: IWebExtension) {
		const isBuiltin = this.cutomBuiltinExtensions.some(id => isString(id) && areSameExtensions(webExtension.identifier, { id }));
		const extension = await this.toScannedExtension(webExtension, isBuiltin);

		// Update custom builtin extensions to custom builtin extensions cache
		if (isBuiltin) {
			let customBuiltinExtensions = await this.readCustomBuiltinExtensionsCache();
			// Remove the existing extension to avoid duplicates
			customBuiltinExtensions = customBuiltinExtensions.filter(extension => !areSameExtensions(extension.identifier, webExtension.identifier));
			customBuiltinExtensions.push(webExtension);
			await this.writeCustomBuiltinExtensionsCache(customBuiltinExtensions);

			const installedExtensions = await this.readInstalledExtensions();
			// Also add to installed extensions if it is installed to update its version
			if (installedExtensions.some(e => areSameExtensions(e.identifier, webExtension.identifier))) {
				await this.addToInstalledExtensions(webExtension);
			}
		}

		// Add to installed extensions
		else {
			await this.addToInstalledExtensions(webExtension);
		}

		return extension;
	}

	private async addToInstalledExtensions(webExtension: IWebExtension): Promise<void> {
		let installedExtensions = await this.readInstalledExtensions();
		// Remove the existing extension to avoid duplicates
		installedExtensions = installedExtensions.filter(e => !areSameExtensions(e.identifier, webExtension.identifier));
		installedExtensions.push(webExtension);
		await this.writeInstalledExtensions(installedExtensions);
	}

	private async scanInstalledExtensions(): Promise<IExtension[]> {
		let installedExtensions = await this.readInstalledExtensions();
		const byExtension: IWebExtension[][] = groupByExtension(installedExtensions, e => e.identifier);
		installedExtensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
		const extensions: IExtension[] = [];
		await Promise.all(installedExtensions.map(async installedExtension => {
			try {
				extensions.push(await this.toScannedExtension(installedExtension, false));
			} catch (error) {
				this.logService.error(error, 'Error while scanning user extension', installedExtension.identifier.id);
			}
		}));
		return extensions;
	}

	private async toWebExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: IStringDictionary<any>): Promise<IWebExtension> {
		const extensionLocation = this.productService.extensionsGallery?.resourceUrlTemplate
			? URI.parse(format2(this.productService.extensionsGallery.resourceUrlTemplate, { publisher: galleryExtension.publisher, name: galleryExtension.name, version: galleryExtension.version, path: 'extension' }))
			: joinPath(galleryExtension.assetUri, 'Microsoft.VisualStudio.Code.WebResources', 'extension');

		return this.toWebExtensionFromLocation(extensionLocation, galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined, galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined, metadata);
	}

	private async toWebExtensionFromLocation(extensionLocation: URI, readmeUri?: URI, changelogUri?: URI, metadata?: IStringDictionary<any>): Promise<IWebExtension> {
		const packageJSONUri = joinPath(extensionLocation, 'package.json');
		const packageNLSUri: URI = joinPath(extensionLocation, 'package.nls.json');

		const [packageJSONResult, packageNLSResult] = await Promise.allSettled([
			this.requestService.request({ type: 'GET', url: this.toRequestUrl(packageJSONUri) }, CancellationToken.None),
			this.requestService.request({ type: 'GET', url: this.toRequestUrl(packageNLSUri) }, CancellationToken.None),
		]);

		if (packageJSONResult.status === 'rejected' || !isSuccess(packageJSONResult.value)) {
			throw new Error(`Cannot find the package.json from the location '${extensionLocation.toString()}'`);
		}

		const content = await asText(packageJSONResult.value);
		if (!content) {
			throw new Error(`Error while fetching package.json for extension '${extensionLocation.toString()}'. Server returned no content`);
		}

		const manifest = JSON.parse(content);
		if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			throw new Error(localize('not a web extension', "Cannot add '{0}' because this extension is not a web extension.", manifest.displayName || manifest.name));
		}

		return {
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name) },
			version: manifest.version,
			location: extensionLocation,
			readmeUri,
			changelogUri,
			packageNLSUri: packageNLSResult.status === 'fulfilled' && isSuccess(packageNLSResult.value) ? packageNLSUri : undefined,
			metadata,
		};
	}

	private async toScannedExtension(webExtension: IWebExtension, isBuiltin: boolean): Promise<IScannedExtension> {
		const context = await this.requestService.request({ type: 'GET', url: this.toRequestUrl(joinPath(webExtension.location, 'package.json')) }, CancellationToken.None);
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
			metadata: webExtension.metadata
		};
	}

	private async translateManifest(manifest: IExtensionManifest, nlsURL: URI): Promise<IExtensionManifest> {
		try {
			const context = await this.requestService.request({ type: 'GET', url: this.toRequestUrl(nlsURL) }, CancellationToken.None);
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

	private readCustomBuiltinExtensionsCache(): Promise<IWebExtension[]> {
		return this.readWebExtensions(this.customBuiltinExtensionsCacheResource);
	}

	private writeCustomBuiltinExtensionsCache(customBuiltinExtensions: IWebExtension[]): Promise<IWebExtension[]> {
		return this.writeWebExtensions(this.customBuiltinExtensionsCacheResource, customBuiltinExtensions);
	}

	private async readWebExtensions(file: URI | undefined): Promise<IWebExtension[]> {
		if (!file) {
			return [];
		}
		return this.getResourceAccessQueue(file).queue(async () => {
			try {
				const content = await this.fileService.readFile(file);
				const webExtensions: IWebExtension[] = [];
				const storedWebExtensions: IStoredWebExtension[] = JSON.parse(content.value.toString());
				for (const e of storedWebExtensions) {
					if (!e.location || !e.identifier || !e.version) {
						this.logService.info('Ignoring invalid extension while scanning', storedWebExtensions);
						continue;
					}
					webExtensions.push({
						identifier: e.identifier,
						version: e.version,
						location: URI.revive(e.location),
						readmeUri: URI.revive(e.readmeUri),
						changelogUri: URI.revive(e.changelogUri),
						packageNLSUri: URI.revive(e.packageNLSUri),
						metadata: e.metadata,
					});
				}
				return webExtensions;
			} catch (error) {
				/* Ignore */
				if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
					this.logService.error(error);
				}
			}
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
				metadata: e.metadata
			}));
			await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
			return webExtensions;
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

	private toRequestUrl(uri: URI): string {
		return uri.toString(true /* skip encoding the uri */);
	}

}

registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService);
