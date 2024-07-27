/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBuiltinExtensionsScannerService, ExtensionType, IExtensionIdentifier, IExtension, IExtensionManifest, TargetPlatform, IRelaxedExtensionManifest, parseEnabledApiProposalNames } from 'vs/platform/extensions/common/extensions';
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { IScannedExtension, IWebExtensionsScannerService, ScanOptions } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { isWeb, Language } from 'vs/base/common/platform';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
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
import { ITranslations, localizeManifest } from 'vs/platform/extensionManagement/common/extensionNls';
import { localize, localize2 } from 'vs/nls';
import * as semver from 'vs/base/common/semver/semver';
import { isString, isUndefined } from 'vs/base/common/types';
import { getErrorMessage } from 'vs/base/common/errors';
import { ResourceMap } from 'vs/base/common/map';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IExtensionResourceLoaderService, migratePlatformSpecificExtensionGalleryResourceURL } from 'vs/platform/extensionResourceLoader/common/extensionResourceLoader';
import { Action2, registerAction2 } from 'vs/platform/actions/common/actions';
import { Categories } from 'vs/platform/action/common/actionCommonCategories';
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
import { IStringDictionary } from 'vs/base/common/collections';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';

type GalleryExtensionInfo = { readonly id: string; preRelease?: boolean; migrateStorageFrom?: string };
type ExtensionInfo = { readonly id: string; preRelease: boolean };

function isGalleryExtensionInfo(obj: unknown): obj is GalleryExtensionInfo {
	const galleryExtensionInfo = obj as GalleryExtensionInfo | undefined;
	return typeof galleryExtensionInfo?.id === 'string'
		&& (galleryExtensionInfo.preRelease === undefined || typeof galleryExtensionInfo.preRelease === 'boolean')
		&& (galleryExtensionInfo.migrateStorageFrom === undefined || typeof galleryExtensionInfo.migrateStorageFrom === 'string');
}

function isUriComponents(thing: unknown): thing is UriComponents {
	if (!thing) {
		return false;
	}
	return isString((<any>thing).path) &&
		isString((<any>thing).scheme);
}

interface IStoredWebExtension {
	readonly identifier: IExtensionIdentifier;
	readonly version: string;
	readonly location: UriComponents;
	readonly manifest?: IExtensionManifest;
	readonly readmeUri?: UriComponents;
	readonly changelogUri?: UriComponents;
	// deprecated in favor of packageNLSUris & fallbackPackageNLSUri
	readonly packageNLSUri?: UriComponents;
	readonly packageNLSUris?: IStringDictionary<UriComponents>;
	readonly fallbackPackageNLSUri?: UriComponents;
	readonly defaultManifestTranslations?: ITranslations | null;
	readonly metadata?: Metadata;
}

interface IWebExtension {
	identifier: IExtensionIdentifier;
	version: string;
	location: URI;
	manifest?: IExtensionManifest;
	readmeUri?: URI;
	changelogUri?: URI;
	// deprecated in favor of packageNLSUris & fallbackPackageNLSUri
	packageNLSUri?: URI;
	packageNLSUris?: Map<string, URI>;
	fallbackPackageNLSUri?: URI;
	defaultManifestTranslations?: ITranslations | null;
	metadata?: Metadata;
}

export class WebExtensionsScannerService extends Disposable implements IWebExtensionsScannerService {

	declare readonly _serviceBrand: undefined;

	private readonly systemExtensionsCacheResource: URI | undefined = undefined;
	private readonly customBuiltinExtensionsCacheResource: URI | undefined = undefined;
	private readonly resourcesAccessQueueMap = new ResourceMap<Queue<IWebExtension[]>>();
	private readonly extensionsEnabledWithApiProposalVersion: string[];

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
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILifecycleService lifecycleService: ILifecycleService,
	) {
		super();
		if (isWeb) {
			this.systemExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'systemExtensionsCache.json');
			this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'customBuiltinExtensionsCache.json');

			// Eventually update caches
			lifecycleService.when(LifecyclePhase.Eventually).then(() => this.updateCaches());
		}
		this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
	}

	private _customBuiltinExtensionsInfoPromise: Promise<{ extensions: ExtensionInfo[]; extensionsToMigrate: [string, string][]; extensionLocations: URI[]; extensionGalleryResources: URI[] }> | undefined;
	private readCustomBuiltinExtensionsInfoFromEnv(): Promise<{ extensions: ExtensionInfo[]; extensionsToMigrate: [string, string][]; extensionLocations: URI[]; extensionGalleryResources: URI[] }> {
		if (!this._customBuiltinExtensionsInfoPromise) {
			this._customBuiltinExtensionsInfoPromise = (async () => {
				let extensions: ExtensionInfo[] = [];
				const extensionLocations: URI[] = [];
				const extensionGalleryResources: URI[] = [];
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
					} else if (isUriComponents(e)) {
						const extensionLocation = URI.revive(e);
						if (this.extensionResourceLoaderService.isExtensionGalleryResource(extensionLocation)) {
							extensionGalleryResources.push(extensionLocation);
						} else {
							extensionLocations.push(extensionLocation);
						}
					}
				}
				if (extensions.length) {
					extensions = await this.checkAdditionalBuiltinExtensions(extensions);
				}
				if (extensions.length) {
					this.logService.info('Found additional builtin gallery extensions in env', extensions);
				}
				if (extensionLocations.length) {
					this.logService.info('Found additional builtin location extensions in env', extensionLocations.map(e => e.toString()));
				}
				if (extensionGalleryResources.length) {
					this.logService.info('Found additional builtin extension gallery resources in env', extensionGalleryResources.map(e => e.toString()));
				}
				return { extensions, extensionsToMigrate, extensionLocations, extensionGalleryResources };
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
			const deprecationInfo = extensionsControlManifest.deprecated[extension.id.toLowerCase()];
			if (deprecationInfo?.extension?.autoMigrate) {
				const preReleaseExtensionId = deprecationInfo.extension.id;
				this.logService.info(`Checking additional builtin extensions: '${extension.id}' is deprecated, instead using '${preReleaseExtensionId}'`);
				result.push({ id: preReleaseExtensionId, preRelease: !!extension.preRelease });
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
		await Promise.allSettled(extensionLocations.map(async extensionLocation => {
			try {
				const webExtension = await this.toWebExtension(extensionLocation);
				const extension = await this.toScannedExtension(webExtension, true);
				if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
					result.push(extension);
				} else {
					this.logService.info(`Skipping invalid additional builtin extension ${webExtension.identifier.id}`);
				}
			} catch (error) {
				this.logService.info(`Error while fetching the additional builtin extension ${extensionLocation.toString()}.`, getErrorMessage(error));
			}
		}));
		return result;
	}

	private async getCustomBuiltinExtensionsFromGallery(scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		if (!this.galleryService.isEnabled()) {
			this.logService.info('Ignoring fetching additional builtin extensions from gallery as it is disabled.');
			return [];
		}
		const result: IScannedExtension[] = [];
		const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
		try {
			const cacheValue = JSON.stringify({
				extensions: extensions.sort((a, b) => a.id.localeCompare(b.id)),
				extensionGalleryResources: extensionGalleryResources.map(e => e.toString()).sort()
			});
			const useCache = this.storageService.get('additionalBuiltinExtensions', StorageScope.APPLICATION, '{}') === cacheValue;
			const webExtensions = await (useCache ? this.getCustomBuiltinExtensionsFromCache() : this.updateCustomBuiltinExtensionsCache());
			if (webExtensions.length) {
				await Promise.all(webExtensions.map(async webExtension => {
					try {
						const extension = await this.toScannedExtension(webExtension, true);
						if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
							result.push(extension);
						} else {
							this.logService.info(`Skipping invalid additional builtin gallery extension ${webExtension.identifier.id}`);
						}
					} catch (error) {
						this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
					}
				}));
			}
			this.storageService.store('additionalBuiltinExtensions', cacheValue, StorageScope.APPLICATION, StorageTarget.MACHINE);
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
				this.logService.info('Updating additional builtin extensions cache');
				const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
				const [galleryWebExtensions, extensionGalleryResourceWebExtensions] = await Promise.all([
					this.resolveBuiltinGalleryExtensions(extensions),
					this.resolveBuiltinExtensionGalleryResources(extensionGalleryResources)
				]);
				const webExtensionsMap = new Map<string, IWebExtension>();
				for (const webExtension of [...galleryWebExtensions, ...extensionGalleryResourceWebExtensions]) {
					webExtensionsMap.set(webExtension.identifier.id.toLowerCase(), webExtension);
				}
				await this.resolveDependenciesAndPackedExtensions(extensionGalleryResourceWebExtensions, webExtensionsMap);
				const webExtensions = [...webExtensionsMap.values()];
				await this.writeCustomBuiltinExtensionsCache(() => webExtensions);
				return webExtensions;
			})();
		}
		return this._updateCustomBuiltinExtensionsCachePromise;
	}

	private async resolveBuiltinExtensionGalleryResources(extensionGalleryResources: URI[]): Promise<IWebExtension[]> {
		if (extensionGalleryResources.length === 0) {
			return [];
		}
		const result = new Map<string, IWebExtension>();
		const extensionInfos: IExtensionInfo[] = [];
		await Promise.all(extensionGalleryResources.map(async extensionGalleryResource => {
			try {
				const webExtension = await this.toWebExtensionFromExtensionGalleryResource(extensionGalleryResource);
				result.set(webExtension.identifier.id.toLowerCase(), webExtension);
				extensionInfos.push({ id: webExtension.identifier.id, version: webExtension.version });
			} catch (error) {
				this.logService.info(`Ignoring additional builtin extension from gallery resource ${extensionGalleryResource.toString()} because there is an error while converting it into web extension`, getErrorMessage(error));
			}
		}));
		const galleryExtensions = await this.galleryService.getExtensions(extensionInfos, CancellationToken.None);
		for (const galleryExtension of galleryExtensions) {
			const webExtension = result.get(galleryExtension.identifier.id.toLowerCase());
			if (webExtension) {
				result.set(galleryExtension.identifier.id.toLowerCase(), {
					...webExtension,
					identifier: { id: webExtension.identifier.id, uuid: galleryExtension.identifier.uuid },
					readmeUri: galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined,
					changelogUri: galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined,
					metadata: { isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion, preRelease: galleryExtension.properties.isPreReleaseVersion, isBuiltin: true, pinned: true }
				});
			}
		}
		return [...result.values()];
	}

	private async resolveBuiltinGalleryExtensions(extensions: IExtensionInfo[]): Promise<IWebExtension[]> {
		if (extensions.length === 0) {
			return [];
		}
		const webExtensions: IWebExtension[] = [];
		const galleryExtensionsMap = await this.getExtensionsWithDependenciesAndPackedExtensions(extensions);
		const missingExtensions = extensions.filter(({ id }) => !galleryExtensionsMap.has(id.toLowerCase()));
		if (missingExtensions.length) {
			this.logService.info('Skipping the additional builtin extensions because their compatible versions are not found.', missingExtensions);
		}
		await Promise.all([...galleryExtensionsMap.values()].map(async gallery => {
			try {
				const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
				webExtensions.push(webExtension);
			} catch (error) {
				this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
			}
		}));
		return webExtensions;
	}

	private async resolveDependenciesAndPackedExtensions(webExtensions: IWebExtension[], result: Map<string, IWebExtension>): Promise<void> {
		const extensionInfos: IExtensionInfo[] = [];
		for (const webExtension of webExtensions) {
			for (const e of [...(webExtension.manifest?.extensionDependencies ?? []), ...(webExtension.manifest?.extensionPack ?? [])]) {
				if (!result.has(e.toLowerCase())) {
					extensionInfos.push({ id: e, version: webExtension.version });
				}
			}
		}
		if (extensionInfos.length === 0) {
			return;
		}
		const galleryExtensions = await this.getExtensionsWithDependenciesAndPackedExtensions(extensionInfos, new Set<string>([...result.keys()]));
		await Promise.all([...galleryExtensions.values()].map(async gallery => {
			try {
				const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
				result.set(webExtension.identifier.id.toLowerCase(), webExtension);
			} catch (error) {
				this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
			}
		}));
	}

	private async getExtensionsWithDependenciesAndPackedExtensions(toGet: IExtensionInfo[], seen: Set<string> = new Set<string>(), result: Map<string, IGalleryExtension> = new Map<string, IGalleryExtension>()): Promise<Map<string, IGalleryExtension>> {
		if (toGet.length === 0) {
			return result;
		}
		const extensions = await this.galleryService.getExtensions(toGet, { compatible: true, targetPlatform: TargetPlatform.WEB }, CancellationToken.None);
		const packsAndDependencies = new Map<string, IExtensionInfo>();
		for (const extension of extensions) {
			result.set(extension.identifier.id.toLowerCase(), extension);
			for (const id of [...(isNonEmptyArray(extension.properties.dependencies) ? extension.properties.dependencies : []), ...(isNonEmptyArray(extension.properties.extensionPack) ? extension.properties.extensionPack : [])]) {
				if (!result.has(id.toLowerCase()) && !packsAndDependencies.has(id.toLowerCase()) && !seen.has(id.toLowerCase())) {
					const extensionInfo = toGet.find(e => areSameExtensions(e, extension.identifier));
					packsAndDependencies.set(id.toLowerCase(), { id, preRelease: extensionInfo?.preRelease });
				}
			}
		}
		return this.getExtensionsWithDependenciesAndPackedExtensions([...packsAndDependencies.values()].filter(({ id }) => !result.has(id.toLowerCase())), seen, result);
	}

	async scanSystemExtensions(): Promise<IExtension[]> {
		return this.readSystemExtensions();
	}

	async scanUserExtensions(profileLocation: URI, scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		const extensions = new Map<string, IScannedExtension>();

		// Custom builtin extensions defined through `additionalBuiltinExtensions` API
		const customBuiltinExtensions = await this.readCustomBuiltinExtensions(scanOptions);
		for (const extension of customBuiltinExtensions) {
			extensions.set(extension.identifier.id.toLowerCase(), extension);
		}

		// User Installed extensions
		const installedExtensions = await this.scanInstalledExtensions(profileLocation, scanOptions);
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

	async scanExistingExtension(extensionLocation: URI, extensionType: ExtensionType, profileLocation: URI): Promise<IScannedExtension | null> {
		if (extensionType === ExtensionType.System) {
			const systemExtensions = await this.scanSystemExtensions();
			return systemExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
		}
		const userExtensions = await this.scanUserExtensions(profileLocation);
		return userExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
	}

	async scanExtensionManifest(extensionLocation: URI): Promise<IExtensionManifest | null> {
		try {
			return await this.getExtensionManifest(extensionLocation);
		} catch (error) {
			this.logService.warn(`Error while fetching manifest from ${extensionLocation.toString()}`, getErrorMessage(error));
			return null;
		}
	}

	async addExtensionFromGallery(galleryExtension: IGalleryExtension, metadata: Metadata, profileLocation: URI): Promise<IScannedExtension> {
		const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
		return this.addWebExtension(webExtension, profileLocation);
	}

	async addExtension(location: URI, metadata: Metadata, profileLocation: URI): Promise<IScannedExtension> {
		const webExtension = await this.toWebExtension(location, undefined, undefined, undefined, undefined, undefined, undefined, metadata);
		const extension = await this.toScannedExtension(webExtension, false);
		await this.addToInstalledExtensions([webExtension], profileLocation);
		return extension;
	}

	async removeExtension(extension: IScannedExtension, profileLocation: URI): Promise<void> {
		await this.writeInstalledExtensions(profileLocation, installedExtensions => installedExtensions.filter(installedExtension => !areSameExtensions(installedExtension.identifier, extension.identifier)));
	}

	async updateMetadata(extension: IScannedExtension, metadata: Partial<Metadata>, profileLocation: URI): Promise<IScannedExtension> {
		let updatedExtension: IWebExtension | undefined = undefined;
		await this.writeInstalledExtensions(profileLocation, installedExtensions => {
			const result: IWebExtension[] = [];
			for (const installedExtension of installedExtensions) {
				if (areSameExtensions(extension.identifier, installedExtension.identifier)) {
					installedExtension.metadata = { ...installedExtension.metadata, ...metadata };
					updatedExtension = installedExtension;
					result.push(installedExtension);
				} else {
					result.push(installedExtension);
				}
			}
			return result;
		});
		if (!updatedExtension) {
			throw new Error('Extension not found');
		}
		return this.toScannedExtension(updatedExtension, extension.isBuiltin);
	}

	async copyExtensions(fromProfileLocation: URI, toProfileLocation: URI, filter: (extension: IScannedExtension) => boolean): Promise<void> {
		const extensionsToCopy: IWebExtension[] = [];
		const fromWebExtensions = await this.readInstalledExtensions(fromProfileLocation);
		await Promise.all(fromWebExtensions.map(async webExtension => {
			const scannedExtension = await this.toScannedExtension(webExtension, false);
			if (filter(scannedExtension)) {
				extensionsToCopy.push(webExtension);
			}
		}));
		if (extensionsToCopy.length) {
			await this.addToInstalledExtensions(extensionsToCopy, toProfileLocation);
		}
	}

	private async addWebExtension(webExtension: IWebExtension, profileLocation: URI): Promise<IScannedExtension> {
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

			const installedExtensions = await this.readInstalledExtensions(profileLocation);
			// Also add to installed extensions if it is installed to update its version
			if (installedExtensions.some(e => areSameExtensions(e.identifier, webExtension.identifier))) {
				await this.addToInstalledExtensions([webExtension], profileLocation);
			}
			return extension;
		}

		// Add to installed extensions
		await this.addToInstalledExtensions([webExtension], profileLocation);
		return extension;
	}

	private async addToInstalledExtensions(webExtensions: IWebExtension[], profileLocation: URI): Promise<void> {
		await this.writeInstalledExtensions(profileLocation, installedExtensions => {
			// Remove the existing extension to avoid duplicates
			installedExtensions = installedExtensions.filter(installedExtension => webExtensions.some(extension => !areSameExtensions(installedExtension.identifier, extension.identifier)));
			installedExtensions.push(...webExtensions);
			return installedExtensions;
		});
	}

	private async scanInstalledExtensions(profileLocation: URI, scanOptions?: ScanOptions): Promise<IScannedExtension[]> {
		let installedExtensions = await this.readInstalledExtensions(profileLocation);

		// If current profile is not a default profile, then add the application extensions to the list
		if (!this.uriIdentityService.extUri.isEqual(profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
			// Remove application extensions from the non default profile
			installedExtensions = installedExtensions.filter(i => !i.metadata?.isApplicationScoped);
			// Add application extensions from the default profile to the list
			const defaultProfileExtensions = await this.readInstalledExtensions(this.userDataProfilesService.defaultProfile.extensionsResource);
			installedExtensions.push(...defaultProfileExtensions.filter(i => i.metadata?.isApplicationScoped));
		}

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
			} else {
				this.logService.info(`Skipping invalid installed extension ${webExtension.identifier.id}`);
			}
		}
		return [...result.values()];
	}

	private async toWebExtensionFromGallery(galleryExtension: IGalleryExtension, metadata?: Metadata): Promise<IWebExtension> {
		const extensionLocation = this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
			publisher: galleryExtension.publisher,
			name: galleryExtension.name,
			version: galleryExtension.version,
			targetPlatform: galleryExtension.properties.targetPlatform === TargetPlatform.WEB ? TargetPlatform.WEB : undefined
		}, 'extension');

		if (!extensionLocation) {
			throw new Error('No extension gallery service configured.');
		}

		return this.toWebExtensionFromExtensionGalleryResource(extensionLocation,
			galleryExtension.identifier,
			galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined,
			galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined,
			metadata);
	}

	private async toWebExtensionFromExtensionGalleryResource(extensionLocation: URI, identifier?: IExtensionIdentifier, readmeUri?: URI, changelogUri?: URI, metadata?: Metadata): Promise<IWebExtension> {
		const extensionResources = await this.listExtensionResources(extensionLocation);
		const packageNLSResources = this.getPackageNLSResourceMapFromResources(extensionResources);

		// The fallback, in English, will fill in any gaps missing in the localized file.
		const fallbackPackageNLSResource = extensionResources.find(e => basename(e) === 'package.nls.json');
		return this.toWebExtension(
			extensionLocation,
			identifier,
			undefined,
			packageNLSResources,
			fallbackPackageNLSResource ? URI.parse(fallbackPackageNLSResource) : null,
			readmeUri,
			changelogUri,
			metadata);
	}

	private getPackageNLSResourceMapFromResources(extensionResources: string[]): Map<string, URI> {
		const packageNLSResources = new Map<string, URI>();
		extensionResources.forEach(e => {
			// Grab all package.nls.{language}.json files
			const regexResult = /package\.nls\.([\w-]+)\.json/.exec(basename(e));
			if (regexResult?.[1]) {
				packageNLSResources.set(regexResult[1], URI.parse(e));
			}
		});
		return packageNLSResources;
	}

	private async toWebExtension(extensionLocation: URI, identifier?: IExtensionIdentifier, manifest?: IExtensionManifest, packageNLSUris?: Map<string, URI>, fallbackPackageNLSUri?: URI | ITranslations | null, readmeUri?: URI, changelogUri?: URI, metadata?: Metadata): Promise<IWebExtension> {
		if (!manifest) {
			try {
				manifest = await this.getExtensionManifest(extensionLocation);
			} catch (error) {
				throw new Error(`Error while fetching manifest from the location '${extensionLocation.toString()}'. ${getErrorMessage(error)}`);
			}
		}

		if (!this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			throw new Error(localize('not a web extension', "Cannot add '{0}' because this extension is not a web extension.", manifest.displayName || manifest.name));
		}

		if (fallbackPackageNLSUri === undefined) {
			try {
				fallbackPackageNLSUri = joinPath(extensionLocation, 'package.nls.json');
				await this.extensionResourceLoaderService.readExtensionResource(fallbackPackageNLSUri);
			} catch (error) {
				fallbackPackageNLSUri = undefined;
			}
		}
		const defaultManifestTranslations: ITranslations | null | undefined = fallbackPackageNLSUri ? URI.isUri(fallbackPackageNLSUri) ? await this.getTranslations(fallbackPackageNLSUri) : fallbackPackageNLSUri : null;

		return {
			identifier: { id: getGalleryExtensionId(manifest.publisher, manifest.name), uuid: identifier?.uuid },
			version: manifest.version,
			location: extensionLocation,
			manifest,
			readmeUri,
			changelogUri,
			packageNLSUris,
			fallbackPackageNLSUri: URI.isUri(fallbackPackageNLSUri) ? fallbackPackageNLSUri : undefined,
			defaultManifestTranslations,
			metadata,
		};
	}

	private async toScannedExtension(webExtension: IWebExtension, isBuiltin: boolean, type: ExtensionType = ExtensionType.User): Promise<IScannedExtension> {
		const validations: [Severity, string][] = [];
		let manifest: IRelaxedExtensionManifest | undefined = webExtension.manifest;

		if (!manifest) {
			try {
				manifest = await this.getExtensionManifest(webExtension.location);
			} catch (error) {
				validations.push([Severity.Error, `Error while fetching manifest from the location '${webExtension.location}'. ${getErrorMessage(error)}`]);
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

		const packageNLSUri = webExtension.packageNLSUris?.get(Language.value().toLowerCase());
		const fallbackPackageNLS = webExtension.defaultManifestTranslations ?? webExtension.fallbackPackageNLSUri;

		if (packageNLSUri) {
			manifest = await this.translateManifest(manifest, packageNLSUri, fallbackPackageNLS);
		} else if (fallbackPackageNLS) {
			manifest = await this.translateManifest(manifest, fallbackPackageNLS);
		}

		const uuid = (<IGalleryMetadata | undefined>webExtension.metadata)?.id;

		const validateApiVersion = this.extensionsEnabledWithApiProposalVersion.includes(webExtension.identifier.id.toLowerCase());
		validations.push(...validateExtensionManifest(this.productService.version, this.productService.date, webExtension.location, manifest, false, validateApiVersion));
		let isValid = true;
		for (const [severity, message] of validations) {
			if (severity === Severity.Error) {
				isValid = false;
				this.logService.error(message);
			}
		}

		if (manifest.enabledApiProposals && validateApiVersion) {
			manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
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

	private async translateManifest(manifest: IExtensionManifest, nlsURL: ITranslations | URI, fallbackNLS?: ITranslations | URI): Promise<IRelaxedExtensionManifest> {
		try {
			const translations = URI.isUri(nlsURL) ? await this.getTranslations(nlsURL) : nlsURL;
			const fallbackTranslations = URI.isUri(fallbackNLS) ? await this.getTranslations(fallbackNLS) : fallbackNLS;
			if (translations) {
				manifest = localizeManifest(this.logService, manifest, translations, fallbackTranslations);
			}
		} catch (error) { /* ignore */ }
		return manifest;
	}

	private async getExtensionManifest(location: URI): Promise<IExtensionManifest> {
		const url = joinPath(location, 'package.json');
		const content = await this.extensionResourceLoaderService.readExtensionResource(url);
		return JSON.parse(content);
	}

	private async getTranslations(nlsUrl: URI): Promise<ITranslations | undefined> {
		try {
			const content = await this.extensionResourceLoaderService.readExtensionResource(nlsUrl);
			return JSON.parse(content);
		} catch (error) {
			this.logService.error(`Error while fetching translations of an extension`, nlsUrl.toString(), getErrorMessage(error));
		}
		return undefined;
	}

	private async readInstalledExtensions(profileLocation: URI): Promise<IWebExtension[]> {
		return this.withWebExtensions(profileLocation);
	}

	private writeInstalledExtensions(profileLocation: URI, updateFn: (extensions: IWebExtension[]) => IWebExtension[]): Promise<IWebExtension[]> {
		return this.withWebExtensions(profileLocation, updateFn);
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
					let packageNLSUris: Map<string, URI> | undefined;
					if (e.packageNLSUris) {
						packageNLSUris = new Map<string, URI>();
						Object.entries(e.packageNLSUris).forEach(([key, value]) => packageNLSUris!.set(key, URI.revive(value)));
					}

					webExtensions.push({
						identifier: e.identifier,
						version: e.version,
						location: URI.revive(e.location),
						manifest: e.manifest,
						readmeUri: URI.revive(e.readmeUri),
						changelogUri: URI.revive(e.changelogUri),
						packageNLSUris,
						fallbackPackageNLSUri: URI.revive(e.fallbackPackageNLSUri),
						defaultManifestTranslations: e.defaultManifestTranslations,
						packageNLSUri: URI.revive(e.packageNLSUri),
						metadata: e.metadata,
					});
				}

				try {
					webExtensions = await this.migrateWebExtensions(webExtensions, file);
				} catch (error) {
					this.logService.error(`Error while migrating scanned extensions in ${file.toString()}`, getErrorMessage(error));
				}

			} catch (error) {
				/* Ignore */
				if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
					this.logService.error(error);
				}
			}

			// Update
			if (updateFn) {
				await this.storeWebExtensions(webExtensions = updateFn(webExtensions), file);
			}

			return webExtensions;
		});
	}

	private async migrateWebExtensions(webExtensions: IWebExtension[], file: URI): Promise<IWebExtension[]> {
		let update = false;
		webExtensions = await Promise.all(webExtensions.map(async webExtension => {
			if (!webExtension.manifest) {
				try {
					webExtension.manifest = await this.getExtensionManifest(webExtension.location);
					update = true;
				} catch (error) {
					this.logService.error(`Error while updating manifest of an extension in ${file.toString()}`, webExtension.identifier.id, getErrorMessage(error));
				}
			}
			if (isUndefined(webExtension.defaultManifestTranslations)) {
				if (webExtension.fallbackPackageNLSUri) {
					try {
						const content = await this.extensionResourceLoaderService.readExtensionResource(webExtension.fallbackPackageNLSUri);
						webExtension.defaultManifestTranslations = JSON.parse(content);
						update = true;
					} catch (error) {
						this.logService.error(`Error while fetching default manifest translations of an extension`, webExtension.identifier.id, getErrorMessage(error));
					}
				} else {
					update = true;
					webExtension.defaultManifestTranslations = null;
				}
			}
			const migratedLocation = migratePlatformSpecificExtensionGalleryResourceURL(webExtension.location, TargetPlatform.WEB);
			if (migratedLocation) {
				update = true;
				webExtension.location = migratedLocation;
			}
			if (isUndefined(webExtension.metadata?.hasPreReleaseVersion) && webExtension.metadata?.preRelease) {
				update = true;
				webExtension.metadata.hasPreReleaseVersion = true;
			}
			return webExtension;
		}));
		if (update) {
			await this.storeWebExtensions(webExtensions, file);
		}
		return webExtensions;
	}

	private async storeWebExtensions(webExtensions: IWebExtension[], file: URI): Promise<void> {
		function toStringDictionary(dictionary: Map<string, URI> | undefined): IStringDictionary<UriComponents> | undefined {
			if (!dictionary) {
				return undefined;
			}
			const result: IStringDictionary<UriComponents> = Object.create(null);
			dictionary.forEach((value, key) => result[key] = value.toJSON());
			return result;
		}
		const storedWebExtensions: IStoredWebExtension[] = webExtensions.map(e => ({
			identifier: e.identifier,
			version: e.version,
			manifest: e.manifest,
			location: e.location.toJSON(),
			readmeUri: e.readmeUri?.toJSON(),
			changelogUri: e.changelogUri?.toJSON(),
			packageNLSUris: toStringDictionary(e.packageNLSUris),
			defaultManifestTranslations: e.defaultManifestTranslations,
			fallbackPackageNLSUri: e.fallbackPackageNLSUri?.toJSON(),
			metadata: e.metadata
		}));
		await this.fileService.writeFile(file, VSBuffer.fromString(JSON.stringify(storedWebExtensions)));
	}

	private getResourceAccessQueue(file: URI): Queue<IWebExtension[]> {
		let resourceQueue = this.resourcesAccessQueueMap.get(file);
		if (!resourceQueue) {
			this.resourcesAccessQueueMap.set(file, resourceQueue = new Queue<IWebExtension[]>());
		}
		return resourceQueue;
	}

}

if (isWeb) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: 'workbench.extensions.action.openInstalledWebExtensionsResource',
				title: localize2('openInstalledWebExtensionsResource', 'Open Installed Web Extensions Resource'),
				category: Categories.Developer,
				f1: true,
				precondition: IsWebContext
			});
		}
		run(serviceAccessor: ServicesAccessor): void {
			const editorService = serviceAccessor.get(IEditorService);
			const userDataProfileService = serviceAccessor.get(IUserDataProfileService);
			editorService.openEditor({ resource: userDataProfileService.currentProfile.extensionsResource });
		}
	});
}

registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService, InstantiationType.Delayed);
