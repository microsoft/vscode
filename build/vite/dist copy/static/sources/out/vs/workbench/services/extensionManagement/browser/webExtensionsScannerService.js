/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { IBuiltinExtensionsScannerService, parseEnabledApiProposalNames } from '../../../../platform/extensions/common/extensions.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { IWebExtensionsScannerService } from '../common/extensionManagement.js';
import { isWeb, Language } from '../../../../base/common/platform.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { joinPath } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { Queue } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { IExtensionGalleryService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions, getGalleryExtensionId, getExtensionId, isMalicious } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localizeManifest } from '../../../../platform/extensionManagement/common/extensionNls.js';
import { localize, localize2 } from '../../../../nls.js';
import * as semver from '../../../../base/common/semver/semver.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IExtensionResourceLoaderService, migratePlatformSpecificExtensionGalleryResourceURL } from '../../../../platform/extensionResourceLoader/common/extensionResourceLoader.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { IsWebContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { basename } from '../../../../base/common/path.js';
import { IExtensionStorageService } from '../../../../platform/extensionManagement/common/extensionStorage.js';
import { isNonEmptyArray } from '../../../../base/common/arrays.js';
import { ILifecycleService } from '../../lifecycle/common/lifecycle.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { validateExtensionManifest } from '../../../../platform/extensions/common/extensionValidator.js';
import Severity from '../../../../base/common/severity.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
function isGalleryExtensionInfo(obj) {
    const galleryExtensionInfo = obj;
    return typeof galleryExtensionInfo?.id === 'string'
        && (galleryExtensionInfo.preRelease === undefined || typeof galleryExtensionInfo.preRelease === 'boolean')
        && (galleryExtensionInfo.migrateStorageFrom === undefined || typeof galleryExtensionInfo.migrateStorageFrom === 'string');
}
function isUriComponents(obj) {
    if (!obj) {
        return false;
    }
    const thing = obj;
    return typeof thing?.path === 'string' &&
        typeof thing?.scheme === 'string';
}
let WebExtensionsScannerService = class WebExtensionsScannerService extends Disposable {
    constructor(environmentService, builtinExtensionsScannerService, fileService, logService, galleryService, extensionManifestPropertiesService, extensionResourceLoaderService, extensionStorageService, storageService, productService, userDataProfilesService, uriIdentityService, lifecycleService) {
        super();
        this.environmentService = environmentService;
        this.builtinExtensionsScannerService = builtinExtensionsScannerService;
        this.fileService = fileService;
        this.logService = logService;
        this.galleryService = galleryService;
        this.extensionManifestPropertiesService = extensionManifestPropertiesService;
        this.extensionResourceLoaderService = extensionResourceLoaderService;
        this.extensionStorageService = extensionStorageService;
        this.storageService = storageService;
        this.productService = productService;
        this.userDataProfilesService = userDataProfilesService;
        this.uriIdentityService = uriIdentityService;
        this.systemExtensionsCacheResource = undefined;
        this.customBuiltinExtensionsCacheResource = undefined;
        this.resourcesAccessQueueMap = new ResourceMap();
        if (isWeb) {
            this.systemExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'systemExtensionsCache.json');
            this.customBuiltinExtensionsCacheResource = joinPath(environmentService.userRoamingDataHome, 'customBuiltinExtensionsCache.json');
            // Eventually update caches
            lifecycleService.when(4 /* LifecyclePhase.Eventually */).then(() => this.updateCaches());
        }
        this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
    }
    readCustomBuiltinExtensionsInfoFromEnv() {
        if (!this._customBuiltinExtensionsInfoPromise) {
            this._customBuiltinExtensionsInfoPromise = (async () => {
                let extensions = [];
                const extensionLocations = [];
                const extensionGalleryResources = [];
                const extensionsToMigrate = [];
                const customBuiltinExtensionsInfo = this.environmentService.options && Array.isArray(this.environmentService.options.additionalBuiltinExtensions)
                    ? this.environmentService.options.additionalBuiltinExtensions.map(additionalBuiltinExtension => isString(additionalBuiltinExtension) ? { id: additionalBuiltinExtension } : additionalBuiltinExtension)
                    : [];
                for (const e of customBuiltinExtensionsInfo) {
                    if (isGalleryExtensionInfo(e)) {
                        extensions.push({ id: e.id, preRelease: !!e.preRelease });
                        if (e.migrateStorageFrom) {
                            extensionsToMigrate.push([e.migrateStorageFrom, e.id]);
                        }
                    }
                    else if (isUriComponents(e)) {
                        const extensionLocation = URI.revive(e);
                        if (await this.extensionResourceLoaderService.isExtensionGalleryResource(extensionLocation)) {
                            extensionGalleryResources.push(extensionLocation);
                        }
                        else {
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
    async checkAdditionalBuiltinExtensions(extensions) {
        const extensionsControlManifest = await this.galleryService.getExtensionsControlManifest();
        const result = [];
        for (const extension of extensions) {
            if (isMalicious({ id: extension.id }, extensionsControlManifest.malicious)) {
                this.logService.info(`Checking additional builtin extensions: Ignoring '${extension.id}' because it is reported to be malicious.`);
                continue;
            }
            const deprecationInfo = extensionsControlManifest.deprecated[extension.id.toLowerCase()];
            if (deprecationInfo?.extension?.autoMigrate) {
                const preReleaseExtensionId = deprecationInfo.extension.id;
                this.logService.info(`Checking additional builtin extensions: '${extension.id}' is deprecated, instead using '${preReleaseExtensionId}'`);
                result.push({ id: preReleaseExtensionId, preRelease: !!extension.preRelease });
            }
            else {
                result.push(extension);
            }
        }
        return result;
    }
    /**
     * All system extensions bundled with the product
     */
    async readSystemExtensions() {
        const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
        const cachedSystemExtensions = await Promise.all((await this.readSystemExtensionsCache()).map(e => this.toScannedExtension(e, true, 0 /* ExtensionType.System */)));
        const result = new Map();
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
    async readCustomBuiltinExtensions(scanOptions) {
        const [customBuiltinExtensionsFromLocations, customBuiltinExtensionsFromGallery] = await Promise.all([
            this.getCustomBuiltinExtensionsFromLocations(scanOptions),
            this.getCustomBuiltinExtensionsFromGallery(scanOptions),
        ]);
        const customBuiltinExtensions = [...customBuiltinExtensionsFromLocations, ...customBuiltinExtensionsFromGallery];
        await this.migrateExtensionsStorage(customBuiltinExtensions);
        return customBuiltinExtensions;
    }
    async getCustomBuiltinExtensionsFromLocations(scanOptions) {
        const { extensionLocations } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        if (!extensionLocations.length) {
            return [];
        }
        const result = [];
        await Promise.allSettled(extensionLocations.map(async (extensionLocation) => {
            try {
                const webExtension = await this.toWebExtension(extensionLocation);
                const extension = await this.toScannedExtension(webExtension, true);
                if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
                    result.push(extension);
                }
                else {
                    this.logService.info(`Skipping invalid additional builtin extension ${webExtension.identifier.id}`);
                }
            }
            catch (error) {
                this.logService.info(`Error while fetching the additional builtin extension ${extensionLocation.toString()}.`, getErrorMessage(error));
            }
        }));
        return result;
    }
    async getCustomBuiltinExtensionsFromGallery(scanOptions) {
        if (!this.galleryService.isEnabled()) {
            this.logService.info('Ignoring fetching additional builtin extensions from gallery as it is disabled.');
            return [];
        }
        const result = [];
        const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
        try {
            const cacheValue = JSON.stringify({
                extensions: extensions.sort((a, b) => a.id.localeCompare(b.id)),
                extensionGalleryResources: extensionGalleryResources.map(e => e.toString()).sort()
            });
            const useCache = this.storageService.get('additionalBuiltinExtensions', -1 /* StorageScope.APPLICATION */, '{}') === cacheValue;
            const webExtensions = await (useCache ? this.getCustomBuiltinExtensionsFromCache() : this.updateCustomBuiltinExtensionsCache());
            if (webExtensions.length) {
                await Promise.all(webExtensions.map(async (webExtension) => {
                    try {
                        const extension = await this.toScannedExtension(webExtension, true);
                        if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
                            result.push(extension);
                        }
                        else {
                            this.logService.info(`Skipping invalid additional builtin gallery extension ${webExtension.identifier.id}`);
                        }
                    }
                    catch (error) {
                        this.logService.info(`Ignoring additional builtin extension ${webExtension.identifier.id} because there is an error while converting it into scanned extension`, getErrorMessage(error));
                    }
                }));
            }
            this.storageService.store('additionalBuiltinExtensions', cacheValue, -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
        }
        catch (error) {
            this.logService.info('Ignoring following additional builtin extensions as there is an error while fetching them from gallery', extensions.map(({ id }) => id), getErrorMessage(error));
        }
        return result;
    }
    async getCustomBuiltinExtensionsFromCache() {
        const cachedCustomBuiltinExtensions = await this.readCustomBuiltinExtensionsCache();
        const webExtensionsMap = new Map();
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
    async migrateExtensionsStorage(customBuiltinExtensions) {
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
                        }
                        else {
                            this.logService.info(`Skipped migrating extension storage from '${from}' to '${to}', because the '${to}' extension is not found.`);
                        }
                    }));
                }
                catch (error) {
                    this.logService.error(error);
                }
            })();
        }
        return this._migrateExtensionsStoragePromise;
    }
    async updateCaches() {
        await this.updateSystemExtensionsCache();
        await this.updateCustomBuiltinExtensionsCache();
    }
    async updateSystemExtensionsCache() {
        const systemExtensions = await this.builtinExtensionsScannerService.scanBuiltinExtensions();
        const cachedSystemExtensions = (await this.readSystemExtensionsCache())
            .filter(cached => {
            const systemExtension = systemExtensions.find(e => areSameExtensions(e.identifier, cached.identifier));
            return systemExtension && semver.gt(cached.version, systemExtension.manifest.version);
        });
        await this.writeSystemExtensionsCache(() => cachedSystemExtensions);
    }
    async updateCustomBuiltinExtensionsCache() {
        if (!this._updateCustomBuiltinExtensionsCachePromise) {
            this._updateCustomBuiltinExtensionsCachePromise = (async () => {
                this.logService.info('Updating additional builtin extensions cache');
                const { extensions, extensionGalleryResources } = await this.readCustomBuiltinExtensionsInfoFromEnv();
                const [galleryWebExtensions, extensionGalleryResourceWebExtensions] = await Promise.all([
                    this.resolveBuiltinGalleryExtensions(extensions),
                    this.resolveBuiltinExtensionGalleryResources(extensionGalleryResources)
                ]);
                const webExtensionsMap = new Map();
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
    async resolveBuiltinExtensionGalleryResources(extensionGalleryResources) {
        if (extensionGalleryResources.length === 0) {
            return [];
        }
        const result = new Map();
        const extensionInfos = [];
        await Promise.all(extensionGalleryResources.map(async (extensionGalleryResource) => {
            try {
                const webExtension = await this.toWebExtensionFromExtensionGalleryResource(extensionGalleryResource);
                result.set(webExtension.identifier.id.toLowerCase(), webExtension);
                extensionInfos.push({ id: webExtension.identifier.id, version: webExtension.version });
            }
            catch (error) {
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
    async resolveBuiltinGalleryExtensions(extensions) {
        if (extensions.length === 0) {
            return [];
        }
        const webExtensions = [];
        const galleryExtensionsMap = await this.getExtensionsWithDependenciesAndPackedExtensions(extensions);
        const missingExtensions = extensions.filter(({ id }) => !galleryExtensionsMap.has(id.toLowerCase()));
        if (missingExtensions.length) {
            this.logService.info('Skipping the additional builtin extensions because their compatible versions are not found.', missingExtensions);
        }
        await Promise.all([...galleryExtensionsMap.values()].map(async (gallery) => {
            try {
                const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
                webExtensions.push(webExtension);
            }
            catch (error) {
                this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
            }
        }));
        return webExtensions;
    }
    async resolveDependenciesAndPackedExtensions(webExtensions, result) {
        const extensionInfos = [];
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
        const galleryExtensions = await this.getExtensionsWithDependenciesAndPackedExtensions(extensionInfos, new Set([...result.keys()]));
        await Promise.all([...galleryExtensions.values()].map(async (gallery) => {
            try {
                const webExtension = await this.toWebExtensionFromGallery(gallery, { isPreReleaseVersion: gallery.properties.isPreReleaseVersion, preRelease: gallery.properties.isPreReleaseVersion, isBuiltin: true });
                result.set(webExtension.identifier.id.toLowerCase(), webExtension);
            }
            catch (error) {
                this.logService.info(`Ignoring additional builtin extension ${gallery.identifier.id} because there is an error while converting it into web extension`, getErrorMessage(error));
            }
        }));
    }
    async getExtensionsWithDependenciesAndPackedExtensions(toGet, seen = new Set(), result = new Map()) {
        if (toGet.length === 0) {
            return result;
        }
        const extensions = await this.galleryService.getExtensions(toGet, { compatible: true, targetPlatform: "web" /* TargetPlatform.WEB */ }, CancellationToken.None);
        const packsAndDependencies = new Map();
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
    async scanSystemExtensions() {
        return this.readSystemExtensions();
    }
    async scanUserExtensions(profileLocation, scanOptions) {
        const extensions = new Map();
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
    async scanExtensionsUnderDevelopment() {
        const devExtensions = this.environmentService.options?.developmentOptions?.extensions;
        const result = [];
        if (Array.isArray(devExtensions)) {
            await Promise.allSettled(devExtensions.map(async (devExtension) => {
                try {
                    const location = URI.revive(devExtension);
                    if (URI.isUri(location)) {
                        const webExtension = await this.toWebExtension(location);
                        result.push(await this.toScannedExtension(webExtension, false));
                    }
                    else {
                        this.logService.info(`Skipping the extension under development ${devExtension} as it is not URI type.`);
                    }
                }
                catch (error) {
                    this.logService.info(`Error while fetching the extension under development ${devExtension.toString()}.`, getErrorMessage(error));
                }
            }));
        }
        return result;
    }
    async scanExistingExtension(extensionLocation, extensionType, profileLocation) {
        if (extensionType === 0 /* ExtensionType.System */) {
            const systemExtensions = await this.scanSystemExtensions();
            return systemExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
        }
        const userExtensions = await this.scanUserExtensions(profileLocation);
        return userExtensions.find(e => e.location.toString() === extensionLocation.toString()) || null;
    }
    async scanExtensionManifest(extensionLocation) {
        try {
            return await this.getExtensionManifest(extensionLocation);
        }
        catch (error) {
            this.logService.warn(`Error while fetching manifest from ${extensionLocation.toString()}`, getErrorMessage(error));
            return null;
        }
    }
    async addExtensionFromGallery(galleryExtension, metadata, profileLocation) {
        const webExtension = await this.toWebExtensionFromGallery(galleryExtension, metadata);
        return this.addWebExtension(webExtension, profileLocation);
    }
    async addExtension(location, metadata, profileLocation) {
        const webExtension = await this.toWebExtension(location, undefined, undefined, undefined, undefined, undefined, undefined, metadata);
        const extension = await this.toScannedExtension(webExtension, false);
        await this.addToInstalledExtensions([webExtension], profileLocation);
        return extension;
    }
    async removeExtension(extension, profileLocation) {
        await this.writeInstalledExtensions(profileLocation, installedExtensions => installedExtensions.filter(installedExtension => !areSameExtensions(installedExtension.identifier, extension.identifier)));
    }
    async updateMetadata(extension, metadata, profileLocation) {
        let updatedExtension = undefined;
        await this.writeInstalledExtensions(profileLocation, installedExtensions => {
            const result = [];
            for (const installedExtension of installedExtensions) {
                if (areSameExtensions(extension.identifier, installedExtension.identifier)) {
                    installedExtension.metadata = { ...installedExtension.metadata, ...metadata };
                    updatedExtension = installedExtension;
                    result.push(installedExtension);
                }
                else {
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
    async copyExtensions(fromProfileLocation, toProfileLocation, filter) {
        const extensionsToCopy = [];
        const fromWebExtensions = await this.readInstalledExtensions(fromProfileLocation);
        await Promise.all(fromWebExtensions.map(async (webExtension) => {
            const scannedExtension = await this.toScannedExtension(webExtension, false);
            if (filter(scannedExtension)) {
                extensionsToCopy.push(webExtension);
            }
        }));
        if (extensionsToCopy.length) {
            await this.addToInstalledExtensions(extensionsToCopy, toProfileLocation);
        }
    }
    async addWebExtension(webExtension, profileLocation) {
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
    async addToInstalledExtensions(webExtensions, profileLocation) {
        await this.writeInstalledExtensions(profileLocation, installedExtensions => {
            // Remove the existing extension to avoid duplicates
            installedExtensions = installedExtensions.filter(installedExtension => webExtensions.some(extension => !areSameExtensions(installedExtension.identifier, extension.identifier)));
            installedExtensions.push(...webExtensions);
            return installedExtensions;
        });
    }
    async scanInstalledExtensions(profileLocation, scanOptions) {
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
        const result = new Map();
        for (const webExtension of installedExtensions) {
            const existing = result.get(webExtension.identifier.id.toLowerCase());
            if (existing && semver.gt(existing.manifest.version, webExtension.version)) {
                continue;
            }
            const extension = await this.toScannedExtension(webExtension, false);
            if (extension.isValid || !scanOptions?.skipInvalidExtensions) {
                result.set(extension.identifier.id.toLowerCase(), extension);
            }
            else {
                this.logService.info(`Skipping invalid installed extension ${webExtension.identifier.id}`);
            }
        }
        return [...result.values()];
    }
    async toWebExtensionFromGallery(galleryExtension, metadata) {
        const extensionLocation = await this.extensionResourceLoaderService.getExtensionGalleryResourceURL({
            publisher: galleryExtension.publisher,
            name: galleryExtension.name,
            version: galleryExtension.version,
            targetPlatform: galleryExtension.properties.targetPlatform === "web" /* TargetPlatform.WEB */ ? "web" /* TargetPlatform.WEB */ : undefined
        }, 'extension');
        if (!extensionLocation) {
            throw new Error('No extension gallery service configured.');
        }
        return this.toWebExtensionFromExtensionGalleryResource(extensionLocation, galleryExtension.identifier, galleryExtension.assets.readme ? URI.parse(galleryExtension.assets.readme.uri) : undefined, galleryExtension.assets.changelog ? URI.parse(galleryExtension.assets.changelog.uri) : undefined, metadata);
    }
    async toWebExtensionFromExtensionGalleryResource(extensionLocation, identifier, readmeUri, changelogUri, metadata) {
        const extensionResources = await this.listExtensionResources(extensionLocation);
        const packageNLSResources = this.getPackageNLSResourceMapFromResources(extensionResources);
        // The fallback, in English, will fill in any gaps missing in the localized file.
        const fallbackPackageNLSResource = extensionResources.find(e => basename(e) === 'package.nls.json');
        return this.toWebExtension(extensionLocation, identifier, undefined, packageNLSResources, fallbackPackageNLSResource ? URI.parse(fallbackPackageNLSResource) : null, readmeUri, changelogUri, metadata);
    }
    getPackageNLSResourceMapFromResources(extensionResources) {
        const packageNLSResources = new Map();
        extensionResources.forEach(e => {
            // Grab all package.nls.{language}.json files
            const regexResult = /package\.nls\.([\w-]+)\.json/.exec(basename(e));
            if (regexResult?.[1]) {
                packageNLSResources.set(regexResult[1], URI.parse(e));
            }
        });
        return packageNLSResources;
    }
    async toWebExtension(extensionLocation, identifier, manifest, packageNLSUris, fallbackPackageNLSUri, readmeUri, changelogUri, metadata) {
        if (!manifest) {
            try {
                manifest = await this.getExtensionManifest(extensionLocation);
            }
            catch (error) {
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
            }
            catch (error) {
                fallbackPackageNLSUri = undefined;
            }
        }
        const defaultManifestTranslations = fallbackPackageNLSUri ? URI.isUri(fallbackPackageNLSUri) ? await this.getTranslations(fallbackPackageNLSUri) : fallbackPackageNLSUri : null;
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
    async toScannedExtension(webExtension, isBuiltin, type = 1 /* ExtensionType.User */) {
        const validations = [];
        let manifest = webExtension.manifest;
        if (!manifest) {
            try {
                manifest = await this.getExtensionManifest(webExtension.location);
            }
            catch (error) {
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
        }
        else if (fallbackPackageNLS) {
            manifest = await this.translateManifest(manifest, fallbackPackageNLS);
        }
        const uuid = webExtension.metadata?.id;
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
            targetPlatform: "web" /* TargetPlatform.WEB */,
            validations,
            isValid,
            preRelease: !!webExtension.metadata?.preRelease,
        };
    }
    async listExtensionResources(extensionLocation) {
        try {
            const result = await this.extensionResourceLoaderService.readExtensionResource(extensionLocation);
            return JSON.parse(result);
        }
        catch (error) {
            this.logService.warn('Error while fetching extension resources list', getErrorMessage(error));
        }
        return [];
    }
    async translateManifest(manifest, nlsURL, fallbackNLS) {
        try {
            const translations = URI.isUri(nlsURL) ? await this.getTranslations(nlsURL) : nlsURL;
            const fallbackTranslations = URI.isUri(fallbackNLS) ? await this.getTranslations(fallbackNLS) : fallbackNLS;
            if (translations) {
                manifest = localizeManifest(this.logService, manifest, translations, fallbackTranslations);
            }
        }
        catch (error) { /* ignore */ }
        return manifest;
    }
    async getExtensionManifest(location) {
        const url = joinPath(location, 'package.json');
        const content = await this.extensionResourceLoaderService.readExtensionResource(url);
        return JSON.parse(content);
    }
    async getTranslations(nlsUrl) {
        try {
            const content = await this.extensionResourceLoaderService.readExtensionResource(nlsUrl);
            return JSON.parse(content);
        }
        catch (error) {
            this.logService.error(`Error while fetching translations of an extension`, nlsUrl.toString(), getErrorMessage(error));
        }
        return undefined;
    }
    async readInstalledExtensions(profileLocation) {
        return this.withWebExtensions(profileLocation);
    }
    writeInstalledExtensions(profileLocation, updateFn) {
        return this.withWebExtensions(profileLocation, updateFn);
    }
    readCustomBuiltinExtensionsCache() {
        return this.withWebExtensions(this.customBuiltinExtensionsCacheResource);
    }
    writeCustomBuiltinExtensionsCache(updateFn) {
        return this.withWebExtensions(this.customBuiltinExtensionsCacheResource, updateFn);
    }
    readSystemExtensionsCache() {
        return this.withWebExtensions(this.systemExtensionsCacheResource);
    }
    writeSystemExtensionsCache(updateFn) {
        return this.withWebExtensions(this.systemExtensionsCacheResource, updateFn);
    }
    async withWebExtensions(file, updateFn) {
        if (!file) {
            return [];
        }
        return this.getResourceAccessQueue(file).queue(async () => {
            let webExtensions = [];
            // Read
            try {
                const content = await this.fileService.readFile(file);
                const storedWebExtensions = JSON.parse(content.value.toString());
                for (const e of storedWebExtensions) {
                    if (!e.location || !e.identifier || !e.version) {
                        this.logService.info('Ignoring invalid extension while scanning', storedWebExtensions);
                        continue;
                    }
                    let packageNLSUris;
                    if (e.packageNLSUris) {
                        packageNLSUris = new Map();
                        Object.entries(e.packageNLSUris).forEach(([key, value]) => packageNLSUris.set(key, URI.revive(value)));
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
                }
                catch (error) {
                    this.logService.error(`Error while migrating scanned extensions in ${file.toString()}`, getErrorMessage(error));
                }
            }
            catch (error) {
                /* Ignore */
                if (error.fileOperationResult !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
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
    async migrateWebExtensions(webExtensions, file) {
        let update = false;
        webExtensions = await Promise.all(webExtensions.map(async (webExtension) => {
            if (!webExtension.manifest) {
                try {
                    webExtension.manifest = await this.getExtensionManifest(webExtension.location);
                    update = true;
                }
                catch (error) {
                    this.logService.error(`Error while updating manifest of an extension in ${file.toString()}`, webExtension.identifier.id, getErrorMessage(error));
                }
            }
            if (isUndefined(webExtension.defaultManifestTranslations)) {
                if (webExtension.fallbackPackageNLSUri) {
                    try {
                        const content = await this.extensionResourceLoaderService.readExtensionResource(webExtension.fallbackPackageNLSUri);
                        webExtension.defaultManifestTranslations = JSON.parse(content);
                        update = true;
                    }
                    catch (error) {
                        this.logService.error(`Error while fetching default manifest translations of an extension`, webExtension.identifier.id, getErrorMessage(error));
                    }
                }
                else {
                    update = true;
                    webExtension.defaultManifestTranslations = null;
                }
            }
            const migratedLocation = migratePlatformSpecificExtensionGalleryResourceURL(webExtension.location, "web" /* TargetPlatform.WEB */);
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
    async storeWebExtensions(webExtensions, file) {
        function toStringDictionary(dictionary) {
            if (!dictionary) {
                return undefined;
            }
            const result = Object.create(null);
            dictionary.forEach((value, key) => result[key] = value.toJSON());
            return result;
        }
        const storedWebExtensions = webExtensions.map(e => ({
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
    getResourceAccessQueue(file) {
        let resourceQueue = this.resourcesAccessQueueMap.get(file);
        if (!resourceQueue) {
            this.resourcesAccessQueueMap.set(file, resourceQueue = new Queue());
        }
        return resourceQueue;
    }
};
WebExtensionsScannerService = __decorate([
    __param(0, IBrowserWorkbenchEnvironmentService),
    __param(1, IBuiltinExtensionsScannerService),
    __param(2, IFileService),
    __param(3, ILogService),
    __param(4, IExtensionGalleryService),
    __param(5, IExtensionManifestPropertiesService),
    __param(6, IExtensionResourceLoaderService),
    __param(7, IExtensionStorageService),
    __param(8, IStorageService),
    __param(9, IProductService),
    __param(10, IUserDataProfilesService),
    __param(11, IUriIdentityService),
    __param(12, ILifecycleService)
], WebExtensionsScannerService);
export { WebExtensionsScannerService };
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
        run(serviceAccessor) {
            const editorService = serviceAccessor.get(IEditorService);
            const userDataProfileService = serviceAccessor.get(IUserDataProfileService);
            editorService.openEditor({ resource: userDataProfileService.currentProfile.extensionsResource });
        }
    });
}
registerSingleton(IWebExtensionsScannerService, WebExtensionsScannerService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2ViRXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL3NlcnZpY2VzL2V4dGVuc2lvbk1hbmFnZW1lbnQvYnJvd3Nlci93ZWJFeHRlbnNpb25zU2Nhbm5lclNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLGdDQUFnQyxFQUFrSCw0QkFBNEIsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RQLE9BQU8sRUFBRSxtQ0FBbUMsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ3RHLE9BQU8sRUFBcUIsNEJBQTRCLEVBQWUsTUFBTSxrQ0FBa0MsQ0FBQztBQUNoSCxPQUFPLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQ3RFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFDaEUsT0FBTyxFQUFFLEdBQUcsRUFBaUIsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQTJDLFlBQVksRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQ25ILE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSx3QkFBd0IsRUFBaUUsTUFBTSx3RUFBd0UsQ0FBQztBQUNqTCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUscUJBQXFCLEVBQUUsY0FBYyxFQUFFLFdB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