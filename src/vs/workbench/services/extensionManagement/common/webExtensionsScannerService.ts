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
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionGalleryService, IGalleryExtension, IGalleryMetadata, TargetPlatform } from 'vs/platform/extensionManagement/common/extensionManagement';
import { groupByExtension, areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { Disposable } from 'vs/base/common/lifecycle';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { localize } from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { isString } from 'vs/base/common/types';
import { getErrorMessage } from 'vs/base/common/errors';
import { ResourceMap } from 'vs/base/common/map';
import { IProductService } from 'vs/platform/product/common/productService';
import { format2 } from 'vs/base/common/strings';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IStringDictionary } from 'vs/base/common/collections';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { basename } from 'vs/base/common/path';

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
	private readonly cutomBuiltinExtensions: (string | URI)[];
	private readonly customBuiltinExtensionsPromise: Promise<IExtension[]> = Promise.resolve([]);

	private readonly customBuiltinExtensionsCacheResource: URI | undefined = undefined;
	private readonly installedExtensionsResource: URI | undefined = undefined;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IWebExtension[]>>();

	constructor(
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService,
		@IBuiltinExtensionsScannerService private readonly builtinExtensionsScannerService: IBuiltinExtensionsScannerService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IProductService private readonly productService: IProductService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
	) {
		super();
		this.cutomBuiltinExtensions = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions) ? this.environmentService.options.additionalBuiltinExtensions : [];
		if (isWeb) {
			this.installedExtensionsResource = joinPath(environmentService.userRoamingDataHome, 'extensions.json');
			this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'customBuiltinExtensionsCache.json');
			this.builtinExtensionsPromise = this.readSystemExtensions();
			this.customBuiltinExtensionsPromise = this.readCustomBuiltinExtensions();
			this.registerActions();
		}
	}

	/**
	 * All system extensions bundled with the product
	 */
	private async readSystemExtensions(): Promise<IExtension[]> {
		return this.builtinExtensionsScannerService.scanBuiltinExtensions();
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
							const webExtension = await this.toWebExtension(location);
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
					await this.writeCustomBuiltinExtensionsCache(() => []);
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
			const galleryExtensions = await this.galleryService.getExtensions(extensionIds.map(id => ({ id })), CancellationToken.None);
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
			await this.writeCustomBuiltinExtensionsCache(() => webExtensions);
		} catch (error) {
			this.logService.info(`Ignoring the error while adding additional builtin gallery extensions`, getErrorMessage(error));
		}

		return result;
	}

	async scanSystemExtensions(): Promise<IExtension[]> {
		return this.builtinExtensionsPromise;
	}

	async scanUserExtensions(donotIgnoreInvalidExtensions?: boolean): Promise<IScannedExtension[]> {
		const extensions = new Map<string, IScannedExtension>();

		// Custom builtin extensions defined through `additionalBuiltinExtensions` API
		const customBuiltinExtensions = await this.customBuiltinExtensionsPromise;
		for (const extension of customBuiltinExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		// User Installed extensions
		const installedExtensions = await this.scanInstalledExtensions(donotIgnoreInvalidExtensions);
		for (const extension of installedExtensions) {
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
						const webExtension = await this.toWebExtension(location);
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
		try {
			const content = await this.extensionResourceLoaderService.readExtensionResource(packageJSONUri);
			if (content) {
				return JSON.parse(content);
			}
		} catch (error) {
			this.logService.warn(`Error while fetching package.json from ${packageJSONUri.toString()}`, getErrorMessage(error));
		}
		return null;
	}

	async addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: IStringDictionary<any>): Promise<IExtension> {
		const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
		return this.addWebExtension(webExtension);
	}

	async addExtension(location: URI, metadata?: IStringDictionary<any>): Promise<IExtension> {
		const webExtension = await this.toWebExtension(location, undefined, undefined, undefined, undefined, metadata);
		return this.addWebExtension(webExtension);
	}

	async removeExtension(identifier: IExtensionIdentifier, version?: string): Promise<void> {
		await this.writeInstalledExtensions(installedExtensions => installedExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier) && (version ? extension.version === version : true))));
	}

	private async addWebExtension(webExtension: IWebExtension) {
		const isBuiltin = this.cutomBuiltinExtensions.some(id => isString(id) && areSameExtensions(webExtension.identifier, { id }));
		const extension = await this.toScannedExtension(webExtension, isBuiltin);

		// Update custom builtin extensions to custom builtin extensions cache
		if (isBuiltin) {
			await this.writeCustomBuiltinExtensionsCache(customBuiltinExtensions => {
				// Remove the existing extension to avoid duplicates
				customBuiltinExtensions = customBuiltinExtensions.filter(extension => !areSameExtensions(extension.identifier, webExtension.identifier));
				customBuiltinExtensions.push(webExtension);
				return customBuiltinExtensions;
			});

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
		await this.writeInstalledExtensions(installedExtensions => {
			// Remove the existing extension to avoid duplicates
			installedExtensions = installedExtensions.filter(e => !areSameExtensions(e.identifier, webExtension.identifier));
			installedExtensions.push(webExtension);
			return installedExtensions;
		});
	}

	private async scanInstalledExtensions(donotIgnoreInvalidExtensions?: boolean): Promise<IExtension[]> {
		let installedExtensions = await this.readInstalledExtensions();
		const byExtension: IWebExtension[][] = groupByExtension(installedExtensions, e => e.identifier);
		installedExtensions = byExtension.map(p => p.sort((a, b) => semver.rcompare(a.version, b.version))[0]);
		const extensions: IExtension[] = [];
		await Promise.all(installedExtensions.map(async installedExtension => {
			try {
				extensions.push(await this.toScannedExtension(installedExtension, false));
			} catch (error) {
				if (donotIgnoreInvalidExtensions) {
					throw error;
				} else {
					this.logService.error(error, 'Error while scanning user extension', installedExtension.identifier.id);
				}
			}
		}));
		return extensions;
	}

	private async toWebExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: IStringDictionary<any>): Promise<IWebExtension> {
		if (!this.productService.extensionsGallery) {
			throw new Error('No extension gallery service configured.');
		}
		let extensionLocation = URI.parse(format2(this.productService.extensionsGallery.resourceUrlTemplate, { publisher: galleryExtension.publisher, name: galleryExtension.name, version: galleryExtension.version, path: 'extension' }));
		extensionLocation = galleryExtension.properties.targetPlatform === TargetPlatform.WEB ? extensionLocation.with({ query: `${extensionLocation.query ? `${extensionLocation.query}&` : ''}target=${galleryExtension.properties.targetPlatform}` }) : extensionLocation;
		const extensionResources = await this.listExtensionResources(extensionLocation);
		const packageNLSResource = extensionResources.find(e => basename(e) === 'package.nls.json');
		return this.toWebExtension(extensionLocation, galleryExtension.identifier, packageNLSResource ? URI.parse(packageNLSResource) : null, galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined, galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined, metadata);
	}

	private async toWebExtension(extensionLocation: URI, identifier?: IExtensionIdentifier, packageNLSUri?: URI | null, readmeUri?: URI, changelogUri?: URI, metadata?: IStringDictionary<any>): Promise<IWebExtension> {
		let packageJSONContent;
		try {
			packageJSONContent = await this.extensionResourceLoaderService.readExtensionResource(joinPath(extensionLocation, 'package.json'));
		} catch (error) {
			throw new Error(`Cannot find the package.json from the location '${extensionLocation.toString()}'. ${getErrorMessage(error)}`);
		}

		if (!packageJSONContent) {
			throw new Error(`Error while fetching package.json for extension '${extensionLocation.toString()}'. Server returned no content`);
		}

		const manifest = JSON.parse(packageJSONContent);
		if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			throw new Error(localize('not a web extension', "Cannot add '{0}' because this extension is not a web extension.", manifest.displayName || manifest.name));
		}

		if (packageNLSUri === undefined) {
			try {
				packageNLSUri = joinPath(extensionLocation, 'package.nls.json');
				await this.extensionResourceLoaderService.readExtensionResource(packageNLSUri);
			} catch (error) {
				packageNLSUri = undefined;
			}
		}

		return {
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier?.uuid },
			version: manifest.version,
			location: extensionLocation,
			readmeUri,
			changelogUri,
			packageNLSUri: packageNLSUri ? packageNLSUri : undefined,
			metadata,
		};
	}

	private async toScannedExtension(webExtension: IWebExtension, isBuiltin: boolean): Promise<IScannedExtension> {
		const url = joinPath(webExtension.location, 'package.json');

		let content;
		try {
			content = await this.extensionResourceLoaderService.readExtensionResource(url);
		} catch (error) {
			throw new Error(`Error while fetching package.json for extension '${webExtension.identifier.id}' from the location '${url}'. ${getErrorMessage(error)}`);
		}

		if (!content) {
			throw new Error(`Error while fetching package.json for extension '${webExtension.identifier.id}'. Server returned no content for the request '${url}'`);
		}

		let manifest: IExtensionManifest = JSON.parse(content);
		if (webExtension.packageNLSUri) {
			manifest = await this.translateManifest(manifest, webExtension.packageNLSUri);
		}

		const uuid = (<IGalleryMetadata | undefined>webExtension.metadata)?.id;

		return {
			identifier: { id: webExtension.identifier.id, uuid: webExtension.identifier.uuid || uuid },
			location: webExtension.location,
			manifest,
			type: ExtensionType.User,
			isBuiltin,
			readmeUrl: webExtension.readmeUri,
			changelogUrl: webExtension.changelogUri,
			metadata: webExtension.metadata
		};
	}

	private async listExtensionResources(extensionLocation: URI): Promise<string[]> {
		try {
			const result = await this.extensionResourceLoaderService.readExtensionResource(extensionLocation);
			return JSON.parse(result);
		} catch (error) {
			this.logService.warn('Error while fetching extension resources list', getErrorMessage(error));
		}
		return [];
	}

	private async translateManifest(manifest: IExtensionManifest, nlsURL: URI): Promise<IExtensionManifest> {
		try {
			const content = await this.extensionResourceLoaderService.readExtensionResource(nlsURL);
			if (content) {
				manifest = localizeManifest(manifest, JSON.parse(content));
			}
		} catch (error) { /* ignore */ }
		return manifest;
	}

	private readInstalledExtensions(): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.installedExtensionsResource);
	}

	private writeInstalledExtensions(updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.installedExtensionsResource, updateFn);
	}

	private readCustomBuiltinExtensionsCache(): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.customBuiltinExtensionsCacheResource);
	}

	private writeCustomBuiltinExtensionsCache(updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.customBuiltinExtensionsCacheResource, updateFn);
	}

	private async withWebExtensions(file: URI | undefined, updateFn?: (extensions: IWebExtension[]) => IWebExtension[]): Promise<IWebExtension[]> {
		if (!file) {
			return [];
		}
		return this.getResourceAccessQueue(file).queue(async () => {
			let webExtensions: IWebExtension[] = [];

			// Read
			try {
				const content = await this.fileService.readFile(file);
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
			} catch (error) {
				/* Ignore */
				if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
					this.logService.error(error);
				}
			}

			// Update
			if (updateFn) {
				webExtensions = updateFn(webExtensions);
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
			}

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

	private registerActions(): void {
		const that = this;
		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: 'workbench.extensions.action.openInstalledWebExtensionsResource',
					title: { value: localize('openInstalledWebExtensionsResource', "Open Installed Web Extensions Resource"), original: 'Open Installed Web Extensions Resource' },
					category: CATEGORIES.Developer,
					f1: true,
					precondition: IsWebContext
				});
			}
			run(serviceAccessor: ServicesAccessor): void {
				serviceAccessor.get(IEditorService).openEditor({ resource: that.installedExtensionsResource });
			}
		}));
	}

}

registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService);
