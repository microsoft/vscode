/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, ExtensionType, IExtensionIdentifier, IExtension, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IScannedExtension, IWebExtensionsScannerService, ScanOptions } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { isWeb } from 'vs/base/common/platform';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { joinPath } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { FileOperationError, FileOperationResult, IFileService } from 'vs/platform/files/common/files';
import { Queue } from 'vs/base/common/async';
import { VSBuffer } from 'vs/base/common/buffer';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionGalleryService, IExtensionInfo, IGalleryExtension, IGalleryMetadata, Metadata } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getGalleryExtensionId, getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { Disposable } from 'vs/base/common/lifecycle';
import { localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { localize } from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { isString } from 'vs/base/common/types';
import { getErrorMessage } from 'vs/base/common/errors';
import { ResourceMap } from 'vs/base/common/map';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IExtensionResourceLoaderService } from 'vs/workbench/services/extensionResourceLoader/common/extensionResourceLoader';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IsWebContext } from 'vs/platform/contextkey/common/contextkeys';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { basename } from 'vs/base/common/path';
import { IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { ILifecycleService, LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { validateExtensionManifest } from 'vs/platform/extensions/common/extensionValidator';
import Severity from 'vs/base/common/severity';

type GalleryExtensionInfo = { readonly id: string; preRelease?: boolean; migrateStorageFrom?: string };
type ExtensionInfo = { readonly id: string; preRelease: boolean };

function isGalleryExtensionInfo(obj: unknown): obj is GalleryExtensionInfo {
	const galleryExtensionInfo = obj as GalleryExtensionInfo | undefined;
	return typeof galleryExtensionInfo?.id === 'string'
		&& (galleryExtensionInfo.preRelease === undefined || typeof galleryExtensionInfo.preRelease === 'boolean')
		&& (galleryExtensionInfo.migrateStorageFrom === undefined || typeof galleryExtensionInfo.migrateStorageFrom === 'string');
}

interface IStoredWebExtension {
	readonly identifier: IExtensionIdentifier;
	readonly version: string;
	readonly location: UriComponents;
	readonly readmeUri?: UriComponents;
	readonly changelogUri?: UriComponents;
	readonly packageNLSUri?: UriComponents;
	readonly metadata?: Metadata;
}

interface IWebExtension {
	identifier: IExtensionIdentifier;
	version: string;
	location: URI;
	readmeUri?: URI;
	changelogUri?: URI;
	packageNLSUri?: URI;
	metadata?: Metadata;
}

export class WebExtensionsScannerService extends Disposable implements IWebExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly systemExtensionsCacheResource: URI | undefined = undefined;
	private readonly customBuiltinExtensionsCacheResource: URI | undefined = undefined;
	private readonly installedExtensionsResource: URI | undefined = undefined;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IWebExtension[]>>();

	constructor(
		@IBrowserWorkbenchEnvironmentService private readonly environmentService: IBrowserWorkbenchEnvironmentService,
		@IBuiltinExtensionsScannerService private readonly builtinExtensionsScannerService: IBuiltinExtensionsScannerService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IExtensionGalleryService private readonly galleryService: IExtensionGalleryService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IExtensionResourceLoaderService private readonly extensionResourceLoaderService: IExtensionResourceLoaderService,
		@IExtensionStorageService private readonly extensionStorageService: IExtensionStorageService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		if (isWeb) {
			this.installedExtensionsResource = joinPath(environmentService.userRoamingDataHome, 'extensions.json');
			this.systemExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'systemExtensionsCache.json');
			this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'customBuiltinExtensionsCache.json');
			this.registerActions();

			// Eventually update caches
			lifecycleService.when(LifecyclePhase.Eventually).then(() => this.updateCaches());
		}
	}

	private _customBuiltinExtensionsInfoPromise: Promise<{ extensions: ExtensionInfo[]; extensionsToMigrate: [string, string][]; extensionLocations: URI[] }> | undefined;
	private readCustomBuiltinExtensionsInfoFromEnv(): Promise<{ extensions: ExtensionInfo[]; extensionsToMigrate: [string, string][]; extensionLocations: URI[] }> {
		if (!this._customBuiltinExtensionsInfoPromise) {
			this._customBuiltinExtensionsInfoPromise = (async () => {
				let extensions: ExtensionInfo[] = [], extensionLocations: URI[] = [];
				const extensionsToMigrate: [string, string][] = [];
				const customBuiltinExtensionsInfo = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions)
					? this.environmentService.options.additionalBuiltinExtensions.map(additionalBuiltinExtension => isString(additionalBuiltinExtension) ? { id: additionalBuiltinExtension } : additionalBuiltinExtension)
					: [];
				for (const e of customBuiltinExtensionsInfo) {
					if (isGalleryExtensionInfo(e)) {
						extensions.push({ id: e.id, preRelease: !!e.preRelease });
						if (e.migrateStorageFrom) {
							extensionsToMigrate.push([e.migrateStorageFrom, e.id]);
						}
					} else {
						extensionLocations.push(URI.revive(e));
					}
				}
				if (extensions.length) {
					extensions = await this.checkAdditionalBuiltinExtensions(extensions);
				}
				return { extensions, extensionsToMigrate, extensionLocations };
			})();
		}
		return this._customBuiltinExtensionsInfoPromise;
	}

	private async checkAdditionalBuiltinExtensions(extensions: ExtensionInfo[]): Promise<ExtensionInfo[]> {
		const extensionsControlManifest = await this.galleryService.getExtensionsControlManifest();
		const result: ExtensionInfo[] = [];
		for (const extension of extensions) {
			if (extensionsControlManifest.malicious.some(e => areSameExtensions(e, { id: extension.id }))) {
				this.logService.info(`Checking additional builtin extensions: Ignoring '${extension.id}' because it is reported to be malicious.`);
				continue;
			}
			if (extensionsControlManifest.unsupportedPreReleaseExtensions && extensionsControlManifest.unsupportedPreReleaseExtensions[extension.id.toLowerCase()]) {
				const preReleaseExtensionId = extensionsControlManifest.unsupportedPreReleaseExtensions[extension.id.toLowerCase()].id;
				this.logService.info(`Checking additional builtin extensions: '${extension.id}' is no longer supported, instead using '${preReleaseExtensionId}'`);
				result.push({ id: preReleaseExtensionId, preRelease: true });
			} else {
				result.push(extension);
			}
		}
		return result;
	}

	/**
	 * All system extensions bundled with the product
	 */
	private async readSystemExtensions(): Promise<IExtension[]> {
		const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
		const cachedSystemExtensions = await Promise.all((await this.readSystemExtensionsCache()).map(e => this.toScannedExtension(e, true, ExtensionType.System)));

		const result = new Map<string, IExtension>();
		for (const extension of [...systemExtensions, ...cachedSystemExtensions]) {
			const existing = result.get(extension.identifier.id.toLowerCase());
			if (existing) {
				// Incase there are duplicates always take the latest version
				if (semver.gt(existing.manifest.version, extension.manifest.version)) {
					continue;
				}
			}
			result.set(extension.identifier.id.toLowerCase(), extension);
		}
		return [...result.values()];
	}

	/**
	 * All extensions defined via `additionalBuiltinExtensions` API
	 */
	private async readCustomBuiltinExtensions(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		const [customBuiltinExtensionsFromLocations, customBuiltinExtensionsFromGallery] = await Promise.all([
			this.getCustomBuiltinExtensionsFromLocations(scanOptions),
			this.getCustomBuiltinExtensionsFromGallery(scanOptions),
		]);
		const customBuiltinExtensions: IScannedExtension[] = [...customBuiltinExtensionsFromLocations, ...customBuiltinExtensionsFromGallery];
		await this.migrateExtensionsStorage(customBuiltinExtensions);
		return customBuiltinExtensions;
	}

	private async getCustomBuiltinExtensionsFromLocations(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		const { extensionLocations } = await this.readCustomBuiltinExtensionsInfoFromEnv();
		if (!extensionLocations.length) {
			return [];
		}
		const result: IScannedExtension[] = [];
		await Promise.allSettled(extensionLocations.map(async location => {
			try {
				const webExtension = await this.toWebExtension(location);
				const extension = await this.toScannedExtension(webExtension, true);
				if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
					result.push(extension);
				}
			} catch (error) {
				this.logService.info(`Error while fetching the additional builtin extension ${location.toString()}.`, getErrorMessage(error));
			}
		}));
		return result;
	}

	private async getCustomBuiltinExtensionsFromGallery(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		const { extensions } = await this.readCustomBuiltinExtensionsInfoFromEnv();
		if (!extensions.length) {
			return [];
		}
		if (!this.galleryService.isEnabled()) {
			this.logService.info('Ignoring fetching additional builtin extensions from gallery as it is disabled.');
			return [];
		}
		const result: IScannedExtension[] = [];
		try {
			const useCache = this.storageService.get('additionalBuiltinExtensions', StorageScope.GLOBAL, '[]') === JSON.stringify(extensions);
			const webExtensions = await (useCache ? this.getCustomBuiltinExtensionsFromCache() : this.updateCustomBuiltinExtensionsCache());
			if (webExtensions.length) {
				await Promise.all(webExtensions.map(async webExtension => {
					try {
						const extension = await this.toScannedExtension(webExtension, true);
						if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
							result.push(extension);
						}
					} catch (error) {
						this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
					}
				}));
			}
			this.storageService.store('additionalBuiltinExtensions', JSON.stringify(extensions), StorageScope.GLOBAL, StorageTarget.MACHINE);
		} catch (error) {
			this.logService.info('Ignoring following additional builtin extensions as there is an error while fetching them from gallery', extensions.map(({ id }) => id), getErrorMessage(error));
		}
		return result;
	}

	private async getCustomBuiltinExtensionsFromCache(): Promise<IWebExtension[]> {
		const cachedCustomBuiltinExtensions = await this.readCustomBuiltinExtensionsCache();
		const webExtensionsMap = new Map<string, IWebExtension>();
		for (const webExtension of cachedCustomBuiltinExtensions) {
			const existing = webExtensionsMap.get(webExtension.identifier.id.toLowerCase());
			if (existing) {
				// Incase there are duplicates always take the latest version
				if (semver.gt(existing.version, webExtension.version)) {
					continue;
				}
			}
			/* Update preRelease flag in the cache - https://github.com/microsoft/vscode/issues/142831 */
			if (webExtension.metadata?.isPreReleaseVersion && !webExtension.metadata?.preRelease) {
				webExtension.metadata.preRelease = true;
			}
			webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
		}
		return [...webExtensionsMap.values()];
	}

	private _migrateExtensionsStoragePromise: Promise<void> | undefined;
	private async migrateExtensionsStorage(customBuiltinExtensions: IExtension[]): Promise<void> {
		if (!this._migrateExtensionsStoragePromise) {
			this._migrateExtensionsStoragePromise = (async () => {
				const { extensionsToMigrate } = await this.readCustomBuiltinExtensionsInfoFromEnv();
				if (!extensionsToMigrate.length) {
					return;
				}
				const fromExtensions = await this.galleryService.getExtensions(extensionsToMigrate.map(([id]) => ({ id })), CancellationToken.None);
				try {
					await Promise.allSettled(extensionsToMigrate.map(async ([from, to]) => {
						const toExtension = customBuiltinExtensions.find(extension => areSameExtensions(extension.identifier, { id: to }));
						if (toExtension) {
							const fromExtension = fromExtensions.find(extension => areSameExtensions(extension.identifier, { id: from }));
							const fromExtensionManifest = fromExtension ? await this.galleryService.getManifest(fromExtension, CancellationToken.None) : null;
							const fromExtensionId = fromExtensionManifest ? getExtensionId(fromExtensionManifest.publisher, fromExtensionManifest.name) : from;
							const toExtensionId = getExtensionId(toExtension.manifest.publisher, toExtension.manifest.name);
							this.extensionStorageService.addToMigrationList(fromExtensionId, toExtensionId);
						} else {
							this.logService.info(`Skipped migrating extension storage from '${from}' to '${to}', because the '${to}' extension is not found.`);
						}
					}));
				} catch (error) {
					this.logService.error(error);
				}
			})();
		}
		return this._migrateExtensionsStoragePromise;
	}

	private async updateCaches(): Promise<void> {
		await this.updateSystemExtensionsCache();
		await this.updateCustomBuiltinExtensionsCache();
	}

	private async updateSystemExtensionsCache(): Promise<void> {
		const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
		const cachedSystemExtensions = (await this.readSystemExtensionsCache())
			.filter(cached => {
				const systemExtension = systemExtensions.find(e => areSameExtensions(e.identifier, cached.identifier));
				return systemExtension && semver.gt(cached.version, systemExtension.manifest.version);
			});
		await this.writeSystemExtensionsCache(() => cachedSystemExtensions);
	}

	private _updateCustomBuiltinExtensionsCachePromise: Promise<IWebExtension[]> | undefined;
	private async updateCustomBuiltinExtensionsCache(): Promise<IWebExtension[]> {
		if (!this._updateCustomBuiltinExtensionsCachePromise) {
			this._updateCustomBuiltinExtensionsCachePromise = (async () => {
				// Clear Cache
				await this.writeCustomBuiltinExtensionsCache(() => []);

				const { extensions } = await this.readCustomBuiltinExtensionsInfoFromEnv();

				if (!extensions.length) {
					return [];
				}

				const galleryExtensionsMap = await this.getExtensionsWithDependenciesAndPackedExtensions(extensions);

				const missingExtensions = extensions.filter(({ id }) => !galleryExtensionsMap.has(id.toLowerCase()));
				if (missingExtensions.length) {
					this.logService.info('Skipping the additional builtin extensions because their compatible versions are not foud.', missingExtensions);
				}

				const webExtensions: IWebExtension[] = [];
				await Promise.all([...galleryExtensionsMap.values()].map(async gallery => {
					try {
						webExtensions.push(await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true }));
					} catch (error) {
						this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
					}
				}));

				await this.writeCustomBuiltinExtensionsCache(() => webExtensions);
				return webExtensions;
			})();
		}
		return this._updateCustomBuiltinExtensionsCachePromise;
	}

	private async getExtensionsWithDependenciesAndPackedExtensions(toGet: IExtensionInfo[], result: Map<string, IGalleryExtension> = new Map<string, IGalleryExtension>()): Promise<Map<string, IGalleryExtension>> {
		if (toGet.length === 0) {
			return result;
		}
		const extensions = await this.galleryService.getExtensions(toGet, { compatible: true, targetPlatform: TargetPlatform.WEB }, CancellationToken.None);
		const packsAndDependencies = new Map<string, IExtensionInfo>();
		for (const extension of extensions) {
			result.set(extension.identifier.id.toLowerCase(), extension);
			for (const id of [...(isNonEmptyArray(extension.properties.dependencies) ? extension.properties.dependencies : []), ...(isNonEmptyArray(extension.properties.extensionPack) ? extension.properties.extensionPack : [])]) {
				if (!result.has(id.toLowerCase()) && !packsAndDependencies.has(id.toLowerCase())) {
					const extensionInfo = toGet.find(e => areSameExtensions(e, extension.identifier));
					packsAndDependencies.set(id.toLowerCase(), { id, preRelease: extensionInfo?.preRelease });
				}
			}
		}
		return this.getExtensionsWithDependenciesAndPackedExtensions([...packsAndDependencies.values()].filter(({ id }) => !result.has(id.toLowerCase())), result);
	}

	async scanSystemExtensions(): Promise<IExtension[]> {
		return this.readSystemExtensions();
	}

	async scanUserExtensions(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		const extensions = new Map<string, IScannedExtension>();

		// Custom builtin extensions defined through `additionalBuiltinExtensions` API
		const customBuiltinExtensions = await this.readCustomBuiltinExtensions(scanOptions);
		for (const extension of customBuiltinExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		// User Installed extensions
		const installedExtensions = await this.scanInstalledExtensions(scanOptions);
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

	async addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: Metadata): Promise<IExtension> {
		const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
		return this.addWebExtension(webExtension);
	}

	async addExtension(location: URI, metadata?: Metadata): Promise<IExtension> {
		const webExtension = await this.toWebExtension(location, undefined, undefined, undefined, undefined, metadata);
		return this.addWebExtension(webExtension);
	}

	async removeExtension(identifier: IExtensionIdentifier, version?: string): Promise<void> {
		await this.writeInstalledExtensions(installedExtensions => installedExtensions.filter(extension => !(areSameExtensions(extension.identifier, identifier) && (version ? extension.version === version : true))));
	}

	private async addWebExtension(webExtension: IWebExtension): Promise<IScannedExtension> {
		const isSystem = !!(await this.scanSystemExtensions()).find(e => areSameExtensions(e.identifier, webExtension.identifier));
		const isBuiltin = !!webExtension.metadata?.isBuiltin;
		const extension = await this.toScannedExtension(webExtension, isBuiltin);

		if (isSystem) {
			await this.writeSystemExtensionsCache(systemExtensions => {
				// Remove the existing extension to avoid duplicates
				systemExtensions = systemExtensions.filter(extension => !areSameExtensions(extension.identifier, webExtension.identifier));
				systemExtensions.push(webExtension);
				return systemExtensions;
			});
			return extension;
		}

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
			return extension;
		}

		// Add to installed extensions
		await this.addToInstalledExtensions(webExtension);
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

	private async scanInstalledExtensions(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		let installedExtensions = await this.readInstalledExtensions();
		installedExtensions.sort((a, b) => a.identifier.id < b.identifier.id ? -1 : a.identifier.id > b.identifier.id ? 1 : semver.rcompare(a.version, b.version));
		const result = new Map<string, IScannedExtension>();
		for (const webExtension of installedExtensions) {
			const existing = result.get(webExtension.identifier.id.toLowerCase());
			if (existing && semver.gt(existing.manifest.version, webExtension.version)) {
				continue;
			}
			const extension = await this.toScannedExtension(webExtension, false);
			if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
				result.set(extension.identifier.id.toLowerCase(), extension);
			}
		}
		return [...result.values()];
	}

	private async toWebExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: Metadata): Promise<IWebExtension> {
		let extensionLocation = this.extensionResourceLoaderService.getExtensionGalleryResourceURL(galleryExtension, 'extension');
		if (!extensionLocation) {
			throw new Error('No extension gallery service configured.');
		}
		extensionLocation = galleryExtension.properties.targetPlatform === TargetPlatform.WEB ? extensionLocation.with({ query: `${extensionLocation.query ? `${extensionLocation.query}&` : ''}target=${galleryExtension.properties.targetPlatform}` }) : extensionLocation;
		const extensionResources = await this.listExtensionResources(extensionLocation);
		const packageNLSResource = extensionResources.find(e => basename(e) === 'package.nls.json');
		return this.toWebExtension(extensionLocation, galleryExtension.identifier, packageNLSResource ? URI.parse(packageNLSResource) : null, galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined, galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined, metadata);
	}

	private async toWebExtension(extensionLocation: URI, identifier?: IExtensionIdentifier, packageNLSUri?: URI | null, readmeUri?: URI, changelogUri?: URI, metadata?: Metadata): Promise<IWebExtension> {
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

	private async toScannedExtension(webExtension: IWebExtension, isBuiltin: boolean, type: ExtensionType = ExtensionType.User): Promise<IScannedExtension> {
		const url = joinPath(webExtension.location, 'package.json');

		const validations: [Severity, string][] = [];
		let content: string | undefined;
		try {
			content = await this.extensionResourceLoaderService.readExtensionResource(url);
			if (!content) {
				validations.push([Severity.Error, `Error while fetching package.json from the location '${url}'. Server returned no content`]);
			}
		} catch (error) {
			validations.push([Severity.Error, `Error while fetching package.json from the location '${url}'. ${getErrorMessage(error)}`]);
		}

		let manifest: IExtensionManifest | null = null;
		if (content) {
			try {
				manifest = JSON.parse(content);
			} catch (error) {
				validations.push([Severity.Error, `Error while parsing package.json. ${getErrorMessage(error)}`]);
			}
		}

		if (!manifest) {
			const [publisher, name] = webExtension.identifier.id.split('.');
			manifest = {
				name,
				publisher,
				version: webExtension.version,
				engines: { vscode: '*' },
			};
		}

		if (webExtension.packageNLSUri) {
			manifest = await this.translateManifest(manifest, webExtension.packageNLSUri);
		}

		const uuid = (<IGalleryMetadata | undefined>webExtension.metadata)?.id;

		validations.push(...validateExtensionManifest(this.productService.version, this.productService.date, webExtension.location, manifest, false));
		let isValid = true;
		for (const [severity, message] of validations) {
			if (severity === Severity.Error) {
				isValid = false;
				this.logService.error(message);
			}
		}

		return {
			identifier: { id: webExtension.identifier.id, uuid: webExtension.identifier.uuid || uuid },
			location: webExtension.location,
			manifest,
			type,
			isBuiltin,
			readmeUrl: webExtension.readmeUri,
			changelogUrl: webExtension.changelogUri,
			metadata: webExtension.metadata,
			targetPlatform: TargetPlatform.WEB,
			validations,
			isValid
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

	private readSystemExtensionsCache(): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.systemExtensionsCacheResource);
	}

	private writeSystemExtensionsCache(updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Promise<IWebExtension[]> {
		return this.withWebExtensions(this.systemExtensionsCacheResource, updateFn);
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
