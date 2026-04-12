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
import { coalesce } from '../../../base/common/arrays.js';
import { ThrottledDelayer } from '../../../base/common/async.js';
import * as objects from '../../../base/common/objects.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { getNodeType, parse } from '../../../base/common/json.js';
import { getParseErrorMessage } from '../../../base/common/jsonErrorMessages.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import * as platform from '../../../base/common/platform.js';
import { basename, isEqual, joinPath } from '../../../base/common/resources.js';
import * as semver from '../../../base/common/semver/semver.js';
import Severity from '../../../base/common/severity.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { areSameExtensions, computeTargetPlatform, getExtensionId, getGalleryExtensionId } from './extensionManagementUtil.js';
import { ExtensionIdentifier, UNDEFINED_PUBLISHER, BUILTIN_MANIFEST_CACHE_FILE, USER_MANIFEST_CACHE_FILE, ExtensionIdentifierMap, parseEnabledApiProposalNames } from '../../extensions/common/extensions.js';
import { validateExtensionManifest } from '../../extensions/common/extensionValidator.js';
import { IFileService, toFileOperationResult } from '../../files/common/files.js';
import { createDecorator, IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { Emitter } from '../../../base/common/event.js';
import { revive } from '../../../base/common/marshalling.js';
import { ExtensionsProfileScanningError, IExtensionsProfileScannerService } from './extensionsProfileScannerService.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { localizeManifest } from './extensionNls.js';
export var Translations;
(function (Translations) {
    function equals(a, b) {
        if (a === b) {
            return true;
        }
        const aKeys = Object.keys(a);
        const bKeys = new Set();
        for (const key of Object.keys(b)) {
            bKeys.add(key);
        }
        if (aKeys.length !== bKeys.size) {
            return false;
        }
        for (const key of aKeys) {
            if (a[key] !== b[key]) {
                return false;
            }
            bKeys.delete(key);
        }
        return bKeys.size === 0;
    }
    Translations.equals = equals;
})(Translations || (Translations = {}));
export const IExtensionsScannerService = createDecorator('IExtensionsScannerService');
let AbstractExtensionsScannerService = class AbstractExtensionsScannerService extends Disposable {
    constructor(systemExtensionsLocation, userExtensionsLocation, extensionsControlLocation, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
        super();
        this.systemExtensionsLocation = systemExtensionsLocation;
        this.userExtensionsLocation = userExtensionsLocation;
        this.extensionsControlLocation = extensionsControlLocation;
        this.userDataProfilesService = userDataProfilesService;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.fileService = fileService;
        this.logService = logService;
        this.environmentService = environmentService;
        this.productService = productService;
        this.uriIdentityService = uriIdentityService;
        this.instantiationService = instantiationService;
        this._onDidChangeCache = this._register(new Emitter());
        this.onDidChangeCache = this._onDidChangeCache.event;
        this.initializeDefaultProfileExtensionsPromise = undefined;
        this.systemExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
        this.userExtensionsCachedScanner = this._register(this.instantiationService.createInstance(CachedExtensionsScanner, currentProfile));
        this.extensionsScanner = this._register(this.instantiationService.createInstance(ExtensionsScanner));
        this._register(this.systemExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(0 /* ExtensionType.System */)));
        this._register(this.userExtensionsCachedScanner.onDidChangeCache(() => this._onDidChangeCache.fire(1 /* ExtensionType.User */)));
    }
    getTargetPlatform() {
        if (!this._targetPlatformPromise) {
            this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
        }
        return this._targetPlatformPromise;
    }
    async scanAllExtensions(systemScanOptions, userScanOptions) {
        const [system, user] = await Promise.all([
            this.scanSystemExtensions(systemScanOptions),
            this.scanUserExtensions(userScanOptions),
        ]);
        return this.dedupExtensions(system, user, [], await this.getTargetPlatform(), true);
    }
    async scanSystemExtensions(scanOptions) {
        const promises = [];
        promises.push(this.scanDefaultSystemExtensions(scanOptions.language));
        promises.push(this.scanDevSystemExtensions(scanOptions.language, !!scanOptions.checkControlFile));
        const [defaultSystemExtensions, devSystemExtensions] = await Promise.all(promises);
        return this.applyScanOptions([...defaultSystemExtensions, ...devSystemExtensions], 0 /* ExtensionType.System */, { pickLatest: false });
    }
    async scanUserExtensions(scanOptions) {
        this.logService.trace('Started scanning user extensions', scanOptions.profileLocation);
        const profileScanOptions = this.uriIdentityService.extUri.isEqual(scanOptions.profileLocation, this.userDataProfilesService.defaultProfile.extensionsResource) ? { bailOutWhenFileNotFound: true } : undefined;
        const extensionsScannerInput = await this.createExtensionScannerInput(scanOptions.profileLocation, true, 1 /* ExtensionType.User */, scanOptions.language, true, profileScanOptions, scanOptions.productVersion ?? this.getProductVersion());
        const extensionsScanner = scanOptions.useCache && !extensionsScannerInput.devMode ? this.userExtensionsCachedScanner : this.extensionsScanner;
        let extensions;
        try {
            extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
        }
        catch (error) {
            if (error instanceof ExtensionsProfileScanningError && error.code === "ERROR_PROFILE_NOT_FOUND" /* ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND */) {
                await this.doInitializeDefaultProfileExtensions();
                extensions = await extensionsScanner.scanExtensions(extensionsScannerInput);
            }
            else {
                throw error;
            }
        }
        extensions = await this.applyScanOptions(extensions, 1 /* ExtensionType.User */, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
        this.logService.trace('Scanned user extensions:', extensions.length);
        return extensions;
    }
    async scanAllUserExtensions(scanOptions = { includeInvalid: true, includeAllVersions: true }) {
        const extensionsScannerInput = await this.createExtensionScannerInput(this.userExtensionsLocation, false, 1 /* ExtensionType.User */, undefined, true, undefined, this.getProductVersion());
        const extensions = await this.extensionsScanner.scanExtensions(extensionsScannerInput);
        return this.applyScanOptions(extensions, 1 /* ExtensionType.User */, { includeAllVersions: scanOptions.includeAllVersions, includeInvalid: scanOptions.includeInvalid });
    }
    async scanExtensionsUnderDevelopment(existingExtensions, scanOptions) {
        if (this.environmentService.isExtensionDevelopment && this.environmentService.extensionDevelopmentLocationURI) {
            const extensions = (await Promise.all(this.environmentService.extensionDevelopmentLocationURI.filter(extLoc => extLoc.scheme === Schemas.file)
                .map(async (extensionDevelopmentLocationURI) => {
                const input = await this.createExtensionScannerInput(extensionDevelopmentLocationURI, false, 1 /* ExtensionType.User */, scanOptions.language, false /* do not validate */, undefined, this.getProductVersion());
                const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(input);
                return extensions.map(extension => {
                    // Override the extension type from the existing extensions
                    extension.type = existingExtensions.find(e => areSameExtensions(e.identifier, extension.identifier))?.type ?? extension.type;
                    // Validate the extension
                    return this.extensionsScanner.validate(extension, input);
                });
            })))
                .flat();
            return this.applyScanOptions(extensions, 'development', { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
        }
        return [];
    }
    async scanExistingExtension(extensionLocation, extensionType, scanOptions) {
        const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, undefined, this.getProductVersion());
        const extension = await this.extensionsScanner.scanExtension(extensionsScannerInput);
        if (!extension) {
            return null;
        }
        if (!scanOptions.includeInvalid && !extension.isValid) {
            return null;
        }
        return extension;
    }
    async scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions) {
        const extensionsScannerInput = await this.createExtensionScannerInput(extensionLocation, false, extensionType, scanOptions.language, true, undefined, this.getProductVersion());
        const extensions = await this.extensionsScanner.scanOneOrMultipleExtensions(extensionsScannerInput);
        return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    }
    async scanMultipleExtensions(extensionLocations, extensionType, scanOptions) {
        const extensions = [];
        await Promise.all(extensionLocations.map(async (extensionLocation) => {
            const scannedExtensions = await this.scanOneOrMultipleExtensions(extensionLocation, extensionType, scanOptions);
            extensions.push(...scannedExtensions);
        }));
        return this.applyScanOptions(extensions, extensionType, { includeInvalid: scanOptions.includeInvalid, pickLatest: true });
    }
    async updateManifestMetadata(extensionLocation, metaData) {
        const manifestLocation = joinPath(extensionLocation, 'package.json');
        const content = (await this.fileService.readFile(manifestLocation)).value.toString();
        const manifest = JSON.parse(content);
        manifest.__metadata = { ...manifest.__metadata, ...metaData };
        await this.fileService.writeFile(joinPath(extensionLocation, 'package.json'), VSBuffer.fromString(JSON.stringify(manifest, null, '\t')));
    }
    async initializeDefaultProfileExtensions() {
        try {
            await this.extensionsProfileScannerService.scanProfileExtensions(this.userDataProfilesService.defaultProfile.extensionsResource, { bailOutWhenFileNotFound: true });
        }
        catch (error) {
            if (error instanceof ExtensionsProfileScanningError && error.code === "ERROR_PROFILE_NOT_FOUND" /* ExtensionsProfileScanningErrorCode.ERROR_PROFILE_NOT_FOUND */) {
                await this.doInitializeDefaultProfileExtensions();
            }
            else {
                throw error;
            }
        }
    }
    async doInitializeDefaultProfileExtensions() {
        if (!this.initializeDefaultProfileExtensionsPromise) {
            this.initializeDefaultProfileExtensionsPromise = (async () => {
                try {
                    this.logService.info('Started initializing default profile extensions in extensions installation folder.', this.userExtensionsLocation.toString());
                    const userExtensions = await this.scanAllUserExtensions({ includeInvalid: true });
                    if (userExtensions.length) {
                        await this.extensionsProfileScannerService.addExtensionsToProfile(userExtensions.map(e => [e, e.metadata]), this.userDataProfilesService.defaultProfile.extensionsResource);
                    }
                    else {
                        try {
                            await this.fileService.createFile(this.userDataProfilesService.defaultProfile.extensionsResource, VSBuffer.fromString(JSON.stringify([])));
                        }
                        catch (error) {
                            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                                this.logService.warn('Failed to create default profile extensions manifest in extensions installation folder.', this.userExtensionsLocation.toString(), getErrorMessage(error));
                            }
                        }
                    }
                    this.logService.info('Completed initializing default profile extensions in extensions installation folder.', this.userExtensionsLocation.toString());
                }
                catch (error) {
                    this.logService.error(error);
                }
                finally {
                    this.initializeDefaultProfileExtensionsPromise = undefined;
                }
            })();
        }
        return this.initializeDefaultProfileExtensionsPromise;
    }
    async applyScanOptions(extensions, type, scanOptions = {}) {
        if (!scanOptions.includeAllVersions) {
            extensions = this.dedupExtensions(type === 0 /* ExtensionType.System */ ? extensions : undefined, type === 1 /* ExtensionType.User */ ? extensions : undefined, type === 'development' ? extensions : undefined, await this.getTargetPlatform(), !!scanOptions.pickLatest);
        }
        if (!scanOptions.includeInvalid) {
            extensions = extensions.filter(extension => extension.isValid);
        }
        return extensions.sort((a, b) => {
            const aLastSegment = path.basename(a.location.fsPath);
            const bLastSegment = path.basename(b.location.fsPath);
            if (aLastSegment < bLastSegment) {
                return -1;
            }
            if (aLastSegment > bLastSegment) {
                return 1;
            }
            return 0;
        });
    }
    dedupExtensions(system, user, development, targetPlatform, pickLatest) {
        const pick = (existing, extension, isDevelopment) => {
            if (!isDevelopment) {
                if (existing.metadata?.isApplicationScoped && !extension.metadata?.isApplicationScoped) {
                    return false;
                }
                if (!existing.metadata?.isApplicationScoped && extension.metadata?.isApplicationScoped) {
                    return true;
                }
            }
            if (existing.isValid && !extension.isValid) {
                return false;
            }
            if (existing.isValid === extension.isValid) {
                if (pickLatest && semver.gt(existing.manifest.version, extension.manifest.version)) {
                    this.logService.debug(`Skipping extension ${extension.location.path} with lower version ${extension.manifest.version} in favour of ${existing.location.path} with version ${existing.manifest.version}`);
                    return false;
                }
                if (semver.eq(existing.manifest.version, extension.manifest.version)) {
                    if (existing.type === 0 /* ExtensionType.System */) {
                        this.logService.debug(`Skipping extension ${extension.location.path} in favour of system extension ${existing.location.path} with same version`);
                        return false;
                    }
                    if (existing.targetPlatform === targetPlatform) {
                        this.logService.debug(`Skipping extension ${extension.location.path} from different target platform ${extension.targetPlatform}`);
                        return false;
                    }
                }
            }
            if (isDevelopment) {
                this.logService.warn(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
            }
            else {
                this.logService.debug(`Overwriting user extension ${existing.location.path} with ${extension.location.path}.`);
            }
            return true;
        };
        const result = new ExtensionIdentifierMap();
        system?.forEach((extension) => {
            const existing = result.get(extension.identifier.id);
            if (!existing || pick(existing, extension, false)) {
                result.set(extension.identifier.id, extension);
            }
        });
        user?.forEach((extension) => {
            const existing = result.get(extension.identifier.id);
            if (!existing && system && extension.type === 0 /* ExtensionType.System */) {
                this.logService.debug(`Skipping obsolete system extension ${extension.location.path}.`);
                return;
            }
            if (!existing || pick(existing, extension, false)) {
                result.set(extension.identifier.id, extension);
            }
        });
        development?.forEach(extension => {
            const existing = result.get(extension.identifier.id);
            if (!existing || pick(existing, extension, true)) {
                result.set(extension.identifier.id, extension);
            }
            result.set(extension.identifier.id, extension);
        });
        return [...result.values()];
    }
    async scanDefaultSystemExtensions(language) {
        this.logService.trace('Started scanning system extensions');
        const extensionsScannerInput = await this.createExtensionScannerInput(this.systemExtensionsLocation, false, 0 /* ExtensionType.System */, language, true, undefined, this.getProductVersion());
        const extensionsScanner = extensionsScannerInput.devMode ? this.extensionsScanner : this.systemExtensionsCachedScanner;
        const result = await extensionsScanner.scanExtensions(extensionsScannerInput);
        this.logService.trace('Scanned system extensions:', result.length);
        return result;
    }
    async scanDevSystemExtensions(language, checkControlFile) {
        const devSystemExtensionsList = this.environmentService.isBuilt ? [] : this.productService.builtInExtensions;
        if (!devSystemExtensionsList?.length) {
            return [];
        }
        this.logService.trace('Started scanning dev system extensions');
        const builtinExtensionControl = checkControlFile ? await this.getBuiltInExtensionControl() : {};
        const devSystemExtensionsLocations = [];
        const devSystemExtensionsLocation = URI.file(path.normalize(path.join(FileAccess.asFileUri('').fsPath, '..', '.build', 'builtInExtensions')));
        for (const extension of devSystemExtensionsList) {
            const controlState = builtinExtensionControl[extension.name] || 'marketplace';
            switch (controlState) {
                case 'disabled':
                    break;
                case 'marketplace':
                    devSystemExtensionsLocations.push(joinPath(devSystemExtensionsLocation, extension.name));
                    break;
                default:
                    devSystemExtensionsLocations.push(URI.file(controlState));
                    break;
            }
        }
        const result = await Promise.all(devSystemExtensionsLocations.map(async (location) => this.extensionsScanner.scanExtension((await this.createExtensionScannerInput(location, false, 0 /* ExtensionType.System */, language, true, undefined, this.getProductVersion())))));
        this.logService.trace('Scanned dev system extensions:', result.length);
        return coalesce(result);
    }
    async getBuiltInExtensionControl() {
        try {
            const content = await this.fileService.readFile(this.extensionsControlLocation);
            return JSON.parse(content.value.toString());
        }
        catch (error) {
            return {};
        }
    }
    async createExtensionScannerInput(location, profile, type, language, validate, profileScanOptions, productVersion) {
        const translations = await this.getTranslations(language ?? platform.language);
        const mtime = await this.getMtime(location);
        const applicationExtensionsLocation = profile && !this.uriIdentityService.extUri.isEqual(location, this.userDataProfilesService.defaultProfile.extensionsResource) ? this.userDataProfilesService.defaultProfile.extensionsResource : undefined;
        const applicationExtensionsLocationMtime = applicationExtensionsLocation ? await this.getMtime(applicationExtensionsLocation) : undefined;
        return new ExtensionScannerInput(location, mtime, applicationExtensionsLocation, applicationExtensionsLocationMtime, profile, profileScanOptions, type, validate, productVersion.version, productVersion.date, this.productService.commit, !this.environmentService.isBuilt, language, translations);
    }
    async getMtime(location) {
        try {
            const stat = await this.fileService.stat(location);
            if (typeof stat.mtime === 'number') {
                return stat.mtime;
            }
        }
        catch (err) {
            // That's ok...
        }
        return undefined;
    }
    getProductVersion() {
        return {
            version: this.productService.version,
            date: this.productService.date,
        };
    }
};
AbstractExtensionsScannerService = __decorate([
    __param(4, IUserDataProfilesService),
    __param(5, IExtensionsProfileScannerService),
    __param(6, IFileService),
    __param(7, ILogService),
    __param(8, IEnvironmentService),
    __param(9, IProductService),
    __param(10, IUriIdentityService),
    __param(11, IInstantiationService)
], AbstractExtensionsScannerService);
export { AbstractExtensionsScannerService };
export class ExtensionScannerInput {
    constructor(location, mtime, applicationExtensionslocation, applicationExtensionslocationMtime, profile, profileScanOptions, type, validate, productVersion, productDate, productCommit, devMode, language, translations) {
        this.location = location;
        this.mtime = mtime;
        this.applicationExtensionslocation = applicationExtensionslocation;
        this.applicationExtensionslocationMtime = applicationExtensionslocationMtime;
        this.profile = profile;
        this.profileScanOptions = profileScanOptions;
        this.type = type;
        this.validate = validate;
        this.productVersion = productVersion;
        this.productDate = productDate;
        this.productCommit = productCommit;
        this.devMode = devMode;
        this.language = language;
        this.translations = translations;
        // Keep empty!! (JSON.parse)
    }
    static createNlsConfiguration(input) {
        return {
            language: input.language,
            pseudo: input.language === 'pseudo',
            devMode: input.devMode,
            translations: input.translations
        };
    }
    static equals(a, b) {
        return (isEqual(a.location, b.location)
            && a.mtime === b.mtime
            && isEqual(a.applicationExtensionslocation, b.applicationExtensionslocation)
            && a.applicationExtensionslocationMtime === b.applicationExtensionslocationMtime
            && a.profile === b.profile
            && objects.equals(a.profileScanOptions, b.profileScanOptions)
            && a.type === b.type
            && a.validate === b.validate
            && a.productVersion === b.productVersion
            && a.productDate === b.productDate
            && a.productCommit === b.productCommit
            && a.devMode === b.devMode
            && a.language === b.language
            && Translations.equals(a.translations, b.translations));
    }
}
let ExtensionsScanner = class ExtensionsScanner extends Disposable {
    constructor(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
        super();
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this.environmentService = environmentService;
        this.logService = logService;
        this.extensionsEnabledWithApiProposalVersion = productService.extensionsEnabledWithApiProposalVersion?.map(id => id.toLowerCase()) ?? [];
    }
    async scanExtensions(input) {
        return input.profile
            ? this.scanExtensionsFromProfile(input)
            : this.scanExtensionsFromLocation(input);
    }
    async scanExtensionsFromLocation(input) {
        const stat = await this.fileService.resolve(input.location);
        if (!stat.children?.length) {
            return [];
        }
        const extensions = await Promise.all(stat.children.map(async (c) => {
            if (!c.isDirectory) {
                return null;
            }
            // Do not consider user extension folder starting with `.`
            if (input.type === 1 /* ExtensionType.User */ && basename(c.resource).indexOf('.') === 0) {
                return null;
            }
            const extensionScannerInput = new ExtensionScannerInput(c.resource, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
            return this.scanExtension(extensionScannerInput);
        }));
        return coalesce(extensions)
            // Sort: Make sure extensions are in the same order always. Helps cache invalidation even if the order changes.
            .sort((a, b) => a.location.path < b.location.path ? -1 : 1);
    }
    async scanExtensionsFromProfile(input) {
        let profileExtensions = await this.scanExtensionsFromProfileResource(input.location, () => true, input);
        if (input.applicationExtensionslocation && !this.uriIdentityService.extUri.isEqual(input.location, input.applicationExtensionslocation)) {
            profileExtensions = profileExtensions.filter(e => !e.metadata?.isApplicationScoped);
            const applicationExtensions = await this.scanExtensionsFromProfileResource(input.applicationExtensionslocation, (e) => !!e.metadata?.isBuiltin || !!e.metadata?.isApplicationScoped, input);
            profileExtensions.push(...applicationExtensions);
        }
        return profileExtensions;
    }
    async scanExtensionsFromProfileResource(profileResource, filter, input) {
        const scannedProfileExtensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileResource, input.profileScanOptions);
        if (!scannedProfileExtensions.length) {
            return [];
        }
        const extensions = await Promise.all(scannedProfileExtensions.map(async (extensionInfo) => {
            if (filter(extensionInfo)) {
                const extensionScannerInput = new ExtensionScannerInput(extensionInfo.location, input.mtime, input.applicationExtensionslocation, input.applicationExtensionslocationMtime, input.profile, input.profileScanOptions, input.type, input.validate, input.productVersion, input.productDate, input.productCommit, input.devMode, input.language, input.translations);
                return this.scanExtension(extensionScannerInput, extensionInfo);
            }
            return null;
        }));
        return coalesce(extensions);
    }
    async scanOneOrMultipleExtensions(input) {
        try {
            if (await this.fileService.exists(joinPath(input.location, 'package.json'))) {
                const extension = await this.scanExtension(input);
                return extension ? [extension] : [];
            }
            else {
                return await this.scanExtensions(input);
            }
        }
        catch (error) {
            this.logService.error(`Error scanning extensions at ${input.location.path}:`, getErrorMessage(error));
            return [];
        }
    }
    async scanExtension(input, scannedProfileExtension) {
        const validations = [];
        let isValid = true;
        let manifest;
        try {
            manifest = await this.scanExtensionManifest(input.location);
        }
        catch (e) {
            if (scannedProfileExtension) {
                validations.push([Severity.Error, getErrorMessage(e)]);
                isValid = false;
                const [publisher, name] = scannedProfileExtension.identifier.id.split('.');
                manifest = {
                    name,
                    publisher,
                    version: scannedProfileExtension.version,
                    engines: { vscode: '' }
                };
            }
            else {
                if (input.type !== 0 /* ExtensionType.System */) {
                    this.logService.error(e);
                }
                return null;
            }
        }
        // allow publisher to be undefined to make the initial extension authoring experience smoother
        if (!manifest.publisher) {
            manifest.publisher = UNDEFINED_PUBLISHER;
        }
        let metadata;
        if (scannedProfileExtension) {
            metadata = {
                ...scannedProfileExtension.metadata,
                size: manifest.__metadata?.size,
            };
        }
        else if (manifest.__metadata) {
            metadata = {
                installedTimestamp: manifest.__metadata.installedTimestamp,
                size: manifest.__metadata.size,
                targetPlatform: manifest.__metadata.targetPlatform,
            };
        }
        delete manifest.__metadata;
        const id = getGalleryExtensionId(manifest.publisher, manifest.name);
        const identifier = metadata?.id ? { id, uuid: metadata.id } : { id };
        const type = metadata?.isSystem ? 0 /* ExtensionType.System */ : input.type;
        const isBuiltin = type === 0 /* ExtensionType.System */ || !!metadata?.isBuiltin;
        try {
            manifest = await this.translateManifest(input.location, manifest, ExtensionScannerInput.createNlsConfiguration(input));
        }
        catch (error) {
            this.logService.warn('Failed to translate manifest', getErrorMessage(error));
        }
        let extension = {
            type,
            identifier,
            manifest,
            location: input.location,
            isBuiltin,
            targetPlatform: metadata?.targetPlatform ?? "undefined" /* TargetPlatform.UNDEFINED */,
            publisherDisplayName: metadata?.publisherDisplayName,
            metadata,
            isValid,
            validations,
            preRelease: !!metadata?.preRelease,
        };
        if (input.validate) {
            extension = this.validate(extension, input);
        }
        if (manifest.enabledApiProposals && (!this.environmentService.isBuilt || this.extensionsEnabledWithApiProposalVersion.includes(id.toLowerCase()))) {
            manifest.originalEnabledApiProposals = manifest.enabledApiProposals;
            manifest.enabledApiProposals = parseEnabledApiProposalNames([...manifest.enabledApiProposals]);
        }
        return extension;
    }
    validate(extension, input) {
        let isValid = extension.isValid;
        const validateApiVersion = this.environmentService.isBuilt && this.extensionsEnabledWithApiProposalVersion.includes(extension.identifier.id.toLowerCase());
        const validations = validateExtensionManifest(input.productVersion, input.productDate, input.location, extension.manifest, extension.isBuiltin, validateApiVersion);
        for (const [severity, message] of validations) {
            if (severity === Severity.Error) {
                isValid = false;
                this.logService.error(this.formatMessage(input.location, message));
            }
        }
        extension.isValid = isValid;
        extension.validations = [...extension.validations, ...validations];
        return extension;
    }
    async scanExtensionManifest(extensionLocation) {
        const manifestLocation = joinPath(extensionLocation, 'package.json');
        let content;
        try {
            content = (await this.fileService.readFile(manifestLocation)).value.toString();
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.error(this.formatMessage(extensionLocation, localize('fileReadFail', "Cannot read file {0}: {1}.", manifestLocation.path, error.message)));
            }
            throw error;
        }
        let manifest;
        try {
            manifest = JSON.parse(content);
        }
        catch (err) {
            // invalid JSON, let's get good errors
            const errors = [];
            parse(content, errors);
            for (const e of errors) {
                this.logService.error(this.formatMessage(extensionLocation, localize('jsonParseFail', "Failed to parse {0}: [{1}, {2}] {3}.", manifestLocation.path, e.offset, e.length, getParseErrorMessage(e.error))));
            }
            throw err;
        }
        if (getNodeType(manifest) !== 'object') {
            const errorMessage = this.formatMessage(extensionLocation, localize('jsonParseInvalidType', "Invalid manifest file {0}: Not a JSON object.", manifestLocation.path));
            this.logService.error(errorMessage);
            throw new Error(errorMessage);
        }
        return manifest;
    }
    async translateManifest(extensionLocation, extensionManifest, nlsConfiguration) {
        const localizedMessages = await this.getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration);
        if (localizedMessages) {
            try {
                const errors = [];
                // resolveOriginalMessageBundle returns null if localizedMessages.default === undefined;
                const defaults = await this.resolveOriginalMessageBundle(localizedMessages.default, errors);
                if (errors.length > 0) {
                    errors.forEach((error) => {
                        this.logService.error(this.formatMessage(extensionLocation, localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localizedMessages.default?.path, getParseErrorMessage(error.error))));
                    });
                    return extensionManifest;
                }
                else if (getNodeType(localizedMessages) !== 'object') {
                    this.logService.error(this.formatMessage(extensionLocation, localize('jsonInvalidFormat', "Invalid format {0}: JSON object expected.", localizedMessages.default?.path)));
                    return extensionManifest;
                }
                const localized = localizedMessages.values || Object.create(null);
                return localizeManifest(this.logService, extensionManifest, localized, defaults);
            }
            catch (error) {
                /*Ignore Error*/
            }
        }
        return extensionManifest;
    }
    async getLocalizedMessages(extensionLocation, extensionManifest, nlsConfiguration) {
        const defaultPackageNLS = joinPath(extensionLocation, 'package.nls.json');
        const reportErrors = (localized, errors) => {
            errors.forEach((error) => {
                this.logService.error(this.formatMessage(extensionLocation, localize('jsonsParseReportErrors', "Failed to parse {0}: {1}.", localized?.path, getParseErrorMessage(error.error))));
            });
        };
        const reportInvalidFormat = (localized) => {
            this.logService.error(this.formatMessage(extensionLocation, localize('jsonInvalidFormat', "Invalid format {0}: JSON object expected.", localized?.path)));
        };
        const translationId = `${extensionManifest.publisher}.${extensionManifest.name}`;
        const translationPath = nlsConfiguration.translations[translationId];
        if (translationPath) {
            try {
                const translationResource = URI.file(translationPath);
                const content = (await this.fileService.readFile(translationResource)).value.toString();
                const errors = [];
                const translationBundle = parse(content, errors);
                if (errors.length > 0) {
                    reportErrors(translationResource, errors);
                    return { values: undefined, default: defaultPackageNLS };
                }
                else if (getNodeType(translationBundle) !== 'object') {
                    reportInvalidFormat(translationResource);
                    return { values: undefined, default: defaultPackageNLS };
                }
                else {
                    const values = translationBundle.contents ? translationBundle.contents.package : undefined;
                    return { values: values, default: defaultPackageNLS };
                }
            }
            catch (error) {
                return { values: undefined, default: defaultPackageNLS };
            }
        }
        else {
            const exists = await this.fileService.exists(defaultPackageNLS);
            if (!exists) {
                return undefined;
            }
            let messageBundle;
            try {
                messageBundle = await this.findMessageBundles(extensionLocation, nlsConfiguration);
            }
            catch (error) {
                return undefined;
            }
            if (!messageBundle.localized) {
                return { values: undefined, default: messageBundle.original };
            }
            try {
                const messageBundleContent = (await this.fileService.readFile(messageBundle.localized)).value.toString();
                const errors = [];
                const messages = parse(messageBundleContent, errors);
                if (errors.length > 0) {
                    reportErrors(messageBundle.localized, errors);
                    return { values: undefined, default: messageBundle.original };
                }
                else if (getNodeType(messages) !== 'object') {
                    reportInvalidFormat(messageBundle.localized);
                    return { values: undefined, default: messageBundle.original };
                }
                return { values: messages, default: messageBundle.original };
            }
            catch (error) {
                return { values: undefined, default: messageBundle.original };
            }
        }
    }
    /**
     * Parses original message bundle, returns null if the original message bundle is null.
     */
    async resolveOriginalMessageBundle(originalMessageBundle, errors) {
        if (originalMessageBundle) {
            try {
                const originalBundleContent = (await this.fileService.readFile(originalMessageBundle)).value.toString();
                return parse(originalBundleContent, errors);
            }
            catch (error) {
                /* Ignore Error */
            }
        }
        return;
    }
    /**
     * Finds localized message bundle and the original (unlocalized) one.
     * If the localized file is not present, returns null for the original and marks original as localized.
     */
    findMessageBundles(extensionLocation, nlsConfiguration) {
        return new Promise((c, e) => {
            const loop = (locale) => {
                const toCheck = joinPath(extensionLocation, `package.nls.${locale}.json`);
                this.fileService.exists(toCheck).then(exists => {
                    if (exists) {
                        c({ localized: toCheck, original: joinPath(extensionLocation, 'package.nls.json') });
                    }
                    const index = locale.lastIndexOf('-');
                    if (index === -1) {
                        c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
                    }
                    else {
                        locale = locale.substring(0, index);
                        loop(locale);
                    }
                });
            };
            if (nlsConfiguration.devMode || nlsConfiguration.pseudo || !nlsConfiguration.language) {
                return c({ localized: joinPath(extensionLocation, 'package.nls.json'), original: null });
            }
            loop(nlsConfiguration.language);
        });
    }
    formatMessage(extensionLocation, message) {
        return `[${extensionLocation.path}]: ${message}`;
    }
};
ExtensionsScanner = __decorate([
    __param(0, IExtensionsProfileScannerService),
    __param(1, IUriIdentityService),
    __param(2, IFileService),
    __param(3, IProductService),
    __param(4, IEnvironmentService),
    __param(5, ILogService)
], ExtensionsScanner);
let CachedExtensionsScanner = class CachedExtensionsScanner extends ExtensionsScanner {
    constructor(currentProfile, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService) {
        super(extensionsProfileScannerService, uriIdentityService, fileService, productService, environmentService, logService);
        this.currentProfile = currentProfile;
        this.userDataProfilesService = userDataProfilesService;
        this.cacheValidatorThrottler = this._register(new ThrottledDelayer(3000));
        this._onDidChangeCache = this._register(new Emitter());
        this.onDidChangeCache = this._onDidChangeCache.event;
    }
    async scanExtensions(input) {
        const cacheFile = this.getCacheFile(input);
        const cacheContents = await this.readExtensionCache(cacheFile);
        this.input = input;
        if (cacheContents && cacheContents.input && ExtensionScannerInput.equals(cacheContents.input, this.input)) {
            this.logService.debug('Using cached extensions scan result', input.type === 0 /* ExtensionType.System */ ? 'system' : 'user', input.location.toString());
            this.cacheValidatorThrottler.trigger(() => this.validateCache());
            return cacheContents.result.map((extension) => {
                // revive URI object
                extension.location = URI.revive(extension.location);
                return extension;
            });
        }
        const result = await super.scanExtensions(input);
        await this.writeExtensionCache(cacheFile, { input, result });
        return result;
    }
    async readExtensionCache(cacheFile) {
        try {
            const cacheRawContents = await this.fileService.readFile(cacheFile);
            const extensionCacheData = JSON.parse(cacheRawContents.value.toString());
            return { result: extensionCacheData.result, input: revive(extensionCacheData.input) };
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.debug('Error while reading the extension cache file:', cacheFile.path, getErrorMessage(error));
            }
        }
        return null;
    }
    async writeExtensionCache(cacheFile, cacheContents) {
        try {
            await this.fileService.writeFile(cacheFile, VSBuffer.fromString(JSON.stringify(cacheContents)));
        }
        catch (error) {
            this.logService.debug('Error while writing the extension cache file:', cacheFile.path, getErrorMessage(error));
        }
    }
    async validateCache() {
        if (!this.input) {
            // Input has been unset by the time we get here, so skip validation
            return;
        }
        const cacheFile = this.getCacheFile(this.input);
        const cacheContents = await this.readExtensionCache(cacheFile);
        if (!cacheContents) {
            // Cache has been deleted by someone else, which is perfectly fine...
            return;
        }
        const actual = cacheContents.result;
        const expected = JSON.parse(JSON.stringify(await super.scanExtensions(this.input)));
        if (objects.equals(expected, actual)) {
            // Cache is valid and running with it is perfectly fine...
            return;
        }
        try {
            this.logService.info('Invalidating Cache', actual, expected);
            // Cache is invalid, delete it
            await this.fileService.del(cacheFile);
            this._onDidChangeCache.fire();
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    getCacheFile(input) {
        const profile = this.getProfile(input);
        return this.uriIdentityService.extUri.joinPath(profile.cacheHome, input.type === 0 /* ExtensionType.System */ ? BUILTIN_MANIFEST_CACHE_FILE : USER_MANIFEST_CACHE_FILE);
    }
    getProfile(input) {
        if (input.type === 0 /* ExtensionType.System */) {
            return this.userDataProfilesService.defaultProfile;
        }
        if (!input.profile) {
            return this.userDataProfilesService.defaultProfile;
        }
        if (this.uriIdentityService.extUri.isEqual(input.location, this.currentProfile.extensionsResource)) {
            return this.currentProfile;
        }
        return this.userDataProfilesService.profiles.find(p => this.uriIdentityService.extUri.isEqual(input.location, p.extensionsResource)) ?? this.currentProfile;
    }
};
CachedExtensionsScanner = __decorate([
    __param(1, IUserDataProfilesService),
    __param(2, IExtensionsProfileScannerService),
    __param(3, IUriIdentityService),
    __param(4, IFileService),
    __param(5, IProductService),
    __param(6, IEnvironmentService),
    __param(7, ILogService)
], CachedExtensionsScanner);
export function toExtensionDescription(extension, isUnderDevelopment) {
    const id = getExtensionId(extension.manifest.publisher, extension.manifest.name);
    return {
        id,
        identifier: new ExtensionIdentifier(id),
        isBuiltin: extension.type === 0 /* ExtensionType.System */,
        isUserBuiltin: extension.type === 1 /* ExtensionType.User */ && extension.isBuiltin,
        isUnderDevelopment,
        extensionLocation: extension.location,
        uuid: extension.identifier.uuid,
        targetPlatform: extension.targetPlatform,
        publisherDisplayName: extension.publisherDisplayName,
        preRelease: extension.preRelease,
        ...extension.manifest,
    };
}
export class NativeExtensionsScannerService extends AbstractExtensionsScannerService {
    constructor(systemExtensionsLocation, userExtensionsLocation, userHome, currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService) {
        super(systemExtensionsLocation, userExtensionsLocation, joinPath(userHome, '.vscode-oss-dev', 'extensions', 'control.json'), currentProfile, userDataProfilesService, extensionsProfileScannerService, fileService, logService, environmentService, productService, uriIdentityService, instantiationService);
        this.translationsPromise = (async () => {
            if (platform.translationsConfigFile) {
                try {
                    const content = await this.fileService.readFile(URI.file(platform.translationsConfigFile));
                    return JSON.parse(content.value.toString());
                }
                catch (err) { /* Ignore Error */ }
            }
            return Object.create(null);
        })();
    }
    getTranslations(language) {
        return this.translationsPromise;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uc1NjYW5uZXJTZXJ2aWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNqRSxPQUFPLEtBQUssT0FBTyxNQUFNLGlDQUFpQyxDQUFDO0FBQzNELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFDakUsT0FBTyxFQUFFLFdBQVcsRUFBRSxLQUFLLEVBQWMsTUFBTSw4QkFBOEIsQ0FBQztBQUM5RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwyQ0FBMkMsQ0FBQztBQUNqRixPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDL0QsT0FBTyxFQUFFLFVBQVUsRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUN0RSxPQUFPLEtBQUssSUFBSSxNQUFNLDhCQUE4QixDQUFDO0FBQ3JELE9BQU8sS0FBSyxRQUFRLE1BQU0sa0NBQWtDLENBQUM7QUFDN0QsT0FBTyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDaEYsT0FBTyxLQUFLLE1BQU0sTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLFFBQVEsTUFBTSxrQ0FBa0MsQ0FBQztBQUN4RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGlCQUFpQixDQUFDO0FBQzNDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRTlFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxxQkFBcUIsRUFBRSxjQUFjLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw4QkFBOEIsQ0FBQztBQUMvSCxPQUFPLEVBQWlCLG1CQUFtQixFQUF1RixtQkFBbUIsRUFBeUIsMkJBQTJCLEVBQUUsd0JBQXdCLEVBQUUsc0JBQXNCLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUN6VSxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSwrQ0FBK0MsQ0FBQztBQUMxRixPQUFPLEVBQXVCLFlBQVksRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ3ZHLE9BQU8sRUFBRSxlQUFlLEVBQUUscUJBQXFCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUNyRyxPQUFPLEVBQUUsV0FBVyxFQUFFLE1BQU0seUJBQXlCLENBQUM7QUFDdEQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0scUNBQXFDLENBQUM7QUFDN0QsT0FBTyxFQUFFLDhCQUE4QixFQUFzQyxnQ0FBZ0MsRUFBMkQsTUFBTSxzQ0FBc0MsQ0FBQztBQUNyTixPQUFPLEVBQW9CLHdCQUF3QixFQUFFLE1BQU0saURBQWlELENBQUM7QUFDN0csT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUE4QnJELE1BQU0sS0FBVyxZQUFZLENBc0I1QjtBQXRCRCxXQUFpQixZQUFZO0lBQzVCLFNBQWdCLE1BQU0sQ0FBQyxDQUFlLEVBQUUsQ0FBZTtRQUN0RCxJQUFJLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztZQUNiLE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQztRQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IsTUFBTSxLQUFLLEdBQWdCLElBQUksR0FBRyxFQUFVLENBQUM7UUFDN0MsS0FBSyxNQUFNLEdBQUcsSUFBSSxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDbEMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoQixDQUFDO1FBQ0QsSUFBSSxLQUFLLENBQUMsTUFBTSxLQUFLLEtBQUssQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNqQyxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFFRCxLQUFLLE1BQU0sR0FBRyxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ3pCLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN2QixPQUFPLEtBQUssQ0FBQztZQUNkLENBQUM7WUFDRCxLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ25CLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFwQmUsbUJBQU0sU0FvQnJCLENBQUE7QUFDRixDQUFDLEVBdEJnQixZQUFZLEtBQVosWUFBWSxRQXNCNUI7QUF1Q0QsTUFBTSxDQUFDLE1BQU0seUJBQXlCLEdBQUcsZUFBZSxDQUE0QiwyQkFBMkIsQ0FBQyxDQUFDO0FBc0IxRyxJQUFlLGdDQUFnQyxHQUEvQyxNQUFlLGdDQUFpQyxTQUFRLFVBQVU7SUFheEUsWUFDVSx3QkFBNkIsRUFDN0Isc0JBQTJCLEVBQ25CLHlCQUE4QixFQUMvQyxjQUFnQyxFQUNOLHVCQUFrRSxFQUMxRCwrQkFBb0YsRUFDeEcsV0FBNEMsRUFDN0MsVUFBMEMsRUFDbEMsa0JBQXdELEVBQzVELGNBQWdELEVBQzVDLGtCQUF3RCxFQUN0RCxvQkFBNEQ7UUFFbkYsS0FBSyxFQUFFLENBQUM7UUFiQyw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQUs7UUFDN0IsMkJBQXNCLEdBQXRCLHNCQUFzQixDQUFLO1FBQ25CLDhCQUF5QixHQUF6Qix5QkFBeUIsQ0FBSztRQUVKLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFDdkMsb0NBQStCLEdBQS9CLCtCQUErQixDQUFrQztRQUNyRixnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUMxQixlQUFVLEdBQVYsVUFBVSxDQUFhO1FBQ2pCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDM0MsbUJBQWMsR0FBZCxjQUFjLENBQWlCO1FBQzNCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDckMseUJBQW9CLEdBQXBCLG9CQUFvQixDQUF1QjtRQW5CbkUsc0JBQWlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLE9BQU8sRUFBaUIsQ0FBQyxDQUFDO1FBQ3pFLHFCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7UUFvSmpELDhDQUF5QyxHQUE4QixTQUFTLENBQUM7UUE5SHhGLElBQUksQ0FBQyw2QkFBNkIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxjQUFjLENBQUMsdUJBQXVCLEVBQUUsY0FBYyxDQUFDLENBQUMsQ0FBQztRQUN2SSxJQUFJLENBQUMsMkJBQTJCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLENBQUMsY0FBYyxDQUFDLHVCQUF1QixFQUFFLGNBQWMsQ0FBQyxDQUFDLENBQUM7UUFDckksSUFBSSxDQUFDLGlCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDLENBQUM7UUFFckcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsZ0JBQWdCLENBQUMsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDLElBQUksOEJBQXNCLENBQUMsQ0FBQyxDQUFDO1FBQzdILElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLGdCQUFnQixDQUFDLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLDRCQUFvQixDQUFDLENBQUMsQ0FBQztJQUMxSCxDQUFDO0lBR08saUJBQWlCO1FBQ3hCLElBQUksQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztZQUNsQyxJQUFJLENBQUMsc0JBQXNCLEdBQUcscUJBQXFCLENBQUMsSUFBSSxDQUFDLFdBQVcsRUFBRSxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDeEYsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLHNCQUFzQixDQUFDO0lBQ3BDLENBQUM7SUFFRCxLQUFLLENBQUMsaUJBQWlCLENBQUMsaUJBQThDLEVBQUUsZUFBMEM7UUFDakgsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsR0FBRyxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUM7WUFDeEMsSUFBSSxDQUFDLG9CQUFvQixDQUFDLGlCQUFpQixDQUFDO1lBQzVDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxlQUFlLENBQUM7U0FDeEMsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsRUFBRSxFQUFFLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUVELEtBQUssQ0FBQyxvQkFBb0IsQ0FBQyxXQUF3QztRQUNsRSxNQUFNLFFBQVEsR0FBMEMsRUFBRSxDQUFDO1FBQzNELFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLDJCQUEyQixDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDO1FBQ3RFLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLFdBQVcsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7UUFDbEcsTUFBTSxDQUFDLHVCQUF1QixFQUFFLG1CQUFtQixDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQ25GLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLENBQUMsR0FBRyx1QkFBdUIsRUFBRSxHQUFHLG1CQUFtQixDQUFDLGdDQUF3QixFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO0lBQ2pJLENBQUM7SUFFRCxLQUFLLENBQUMsa0JBQWtCLENBQUMsV0FBc0M7UUFDOUQsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsV0FBVyxDQUFDLGVBQWUsQ0FBQyxDQUFDO1FBQ3ZGLE1BQU0sa0JBQWtCLEdBQThDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyxlQUFlLEVBQUUsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLHVCQUF1QixFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDMVAsTUFBTSxzQkFBc0IsR0FBRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxXQUFXLENBQUMsZUFBZSxFQUFFLElBQUksOEJBQXNCLFdBQVcsQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxjQUFjLElBQUksSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUNyTyxNQUFNLGlCQUFpQixHQUFHLFdBQVcsQ0FBQyxRQUFRLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLGlCQUFpQixDQUFDO1FBQzlJLElBQUksVUFBc0MsQ0FBQztRQUMzQyxJQUFJLENBQUM7WUFDSixVQUFVLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUM3RSxDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLEtBQUssWUFBWSw4QkFBOEIsSUFBSSxLQUFLLENBQUMsSUFBSSwrRkFBK0QsRUFBRSxDQUFDO2dCQUNsSSxNQUFNLElBQUksQ0FBQyxvQ0FBb0MsRUFBRSxDQUFDO2dCQUNsRCxVQUFVLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztZQUM3RSxDQUFDO2lCQUFNLENBQUM7Z0JBQ1AsTUFBTSxLQUFLLENBQUM7WUFDYixDQUFDO1FBQ0YsQ0FBQztRQUNELFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLDhCQUFzQixFQUFFLGNBQWMsRUFBRSxXQUFXLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzNJLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDBCQUEwQixFQUFFLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNyRSxPQUFPLFVBQVUsQ0FBQztJQUNuQixDQUFDO0lBRUQsS0FBSyxDQUFDLHFCQUFxQixDQUFDLGNBQXlFLEVBQUUsY0FBYyxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxJQUFJLEVBQUU7UUFDdEosTUFBTSxzQkFBc0IsR0FBRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLENBQUMsc0JBQXNCLEVBQUUsS0FBSyw4QkFBc0IsU0FBUyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUNwTCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxjQUFjLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUN2RixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLDhCQUFzQixFQUFFLGtCQUFrQixFQUFFLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLGNBQWMsRUFBRSxDQUFDLENBQUM7SUFDbEssQ0FBQztJQUVELEtBQUssQ0FBQyw4QkFBOEIsQ0FBQyxrQkFBdUMsRUFBRSxXQUF3QjtRQUNyRyxJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxzQkFBc0IsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsK0JBQStCLEVBQUUsQ0FBQztZQUMvRyxNQUFNLFVBQVUsR0FBRyxDQUFDLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsK0JBQStCLENBQUMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU0sS0FBSyxPQUFPLENBQUMsSUFBSSxDQUFDO2lCQUM1SSxHQUFHLENBQUMsS0FBSyxFQUFDLCtCQUErQixFQUFDLEVBQUU7Z0JBQzVDLE1BQU0sS0FBSyxHQUFHLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLCtCQUErQixFQUFFLEtBQUssOEJBQXNCLFdBQVcsQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLHFCQUFxQixFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO2dCQUN6TSxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQywyQkFBMkIsQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDbkYsT0FBTyxVQUFVLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxFQUFFO29CQUNqQywyREFBMkQ7b0JBQzNELFNBQVMsQ0FBQyxJQUFJLEdBQUcsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsRUFBRSxJQUFJLElBQUksU0FBUyxDQUFDLElBQUksQ0FBQztvQkFDN0gseUJBQXlCO29CQUN6QixPQUFPLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUMxRCxDQUFDLENBQUMsQ0FBQztZQUNKLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQ0gsSUFBSSxFQUFFLENBQUM7WUFDVCxPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsYUFBYSxFQUFFLEVBQUUsY0FBYyxFQUFFLFdBQVcsQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDM0gsQ0FBQztRQUNELE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUVELEtBQUssQ0FBQyxxQkFBcUIsQ0FBQyxpQkFBc0IsRUFBRSxhQUE0QixFQUFFLFdBQXdCO1FBQ3pHLE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxJQUFJLENBQUMsMkJBQTJCLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUNoTCxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUNyRixJQUFJLENBQUMsU0FBUyxFQUFFLENBQUM7WUFDaEIsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDdkQsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDO1FBQ0QsT0FBTyxTQUFTLENBQUM7SUFDbEIsQ0FBQztJQUVELEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxpQkFBc0IsRUFBRSxhQUE0QixFQUFFLFdBQXdCO1FBQy9HLE1BQU0sc0JBQXNCLEdBQUcsTUFBTSxJQUFJLENBQUMsMkJBQTJCLENBQUMsaUJBQWlCLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztRQUNoTCxNQUFNLFVBQVUsR0FBRyxNQUFNLElBQUksQ0FBQyxpQkFBaUIsQ0FBQywyQkFBMkIsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQ3BHLE9BQU8sSUFBSSxDQUFDLGdCQUFnQixDQUFDLFVBQVUsRUFBRSxhQUFhLEVBQUUsRUFBRSxjQUFjLEVBQUUsV0FBVyxDQUFDLGNBQWMsRUFBRSxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztJQUMzSCxDQUFDO0lBRUQsS0FBSyxDQUFDLHNCQUFzQixDQUFDLGtCQUF5QixFQUFFLGFBQTRCLEVBQUUsV0FBd0I7UUFDN0csTUFBTSxVQUFVLEdBQStCLEVBQUUsQ0FBQztRQUNsRCxNQUFNLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBQyxpQkFBaUIsRUFBQyxFQUFFO1lBQ2xFLE1BQU0saUJBQWlCLEdBQUcsTUFBTSxJQUFJLENBQUMsMkJBQTJCLENBQUMsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLFdBQVcsQ0FBQyxDQUFDO1lBQ2hILFVBQVUsQ0FBQyxJQUFJLENBQUMsR0FBRyxpQkFBaUIsQ0FBQyxDQUFDO1FBQ3ZDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDSixPQUFPLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLEVBQUUsYUFBYSxFQUFFLEVBQUUsY0FBYyxFQUFFLFdBQVcsQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7SUFDM0gsQ0FBQztJQUVELEtBQUssQ0FBQyxzQkFBc0IsQ0FBQyxpQkFBc0IsRUFBRSxRQUEwQjtRQUM5RSxNQUFNLGdCQUFnQixHQUFHLFFBQVEsQ0FBQyxpQkFBaUIsRUFBRSxjQUFjLENBQUMsQ0FBQztRQUNyRSxNQUFNLE9BQU8sR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztRQUNyRixNQUFNLFFBQVEsR0FBOEIsSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRSxRQUFRLENBQUMsVUFBVSxHQUFHLEVBQUUsR0FBRyxRQUFRLENBQUMsVUFBVSxFQUFFLEdBQUcsUUFBUSxFQUFFLENBQUM7UUFFOUQsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsY0FBYyxDQUFDLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzFJLENBQUM7SUFFRCxLQUFLLENBQUMsa0NBQWtDO1FBQ3ZDLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLCtCQUErQixDQUFDLHFCQUFxQixDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLEVBQUUsRUFBRSx1QkFBdUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3JLLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksS0FBSyxZQUFZLDhCQUE4QixJQUFJLEtBQUssQ0FBQyxJQUFJLCtGQUErRCxFQUFFLENBQUM7Z0JBQ2xJLE1BQU0sSUFBSSxDQUFDLG9DQUFvQyxFQUFFLENBQUM7WUFDbkQsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE1BQU0sS0FBSyxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBR08sS0FBSyxDQUFDLG9DQUFvQztRQUNqRCxJQUFJLENBQUMsSUFBSSxDQUFDLHlDQUF5QyxFQUFFLENBQUM7WUFDckQsSUFBSSxDQUFDLHlDQUF5QyxHQUFHLENBQUMsS0FBSyxJQUFJLEVBQUU7Z0JBQzVELElBQUksQ0FBQztvQkFDSixJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxvRkFBb0YsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztvQkFDbkosTUFBTSxjQUFjLEdBQUcsTUFBTSxJQUFJLENBQUMscUJBQXFCLENBQUMsRUFBRSxjQUFjLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztvQkFDbEYsSUFBSSxjQUFjLENBQUMsTUFBTSxFQUFFLENBQUM7d0JBQzNCLE1BQU0sSUFBSSxDQUFDLCtCQUErQixDQUFDLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLENBQUM7b0JBQzdLLENBQUM7eUJBQU0sQ0FBQzt3QkFDUCxJQUFJLENBQUM7NEJBQ0osTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDLGtCQUFrQixFQUFFLFFBQVEsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBQzVJLENBQUM7d0JBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQzs0QkFDaEIsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsK0NBQXVDLEVBQUUsQ0FBQztnQ0FDekUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMseUZBQXlGLEVBQUUsSUFBSSxDQUFDLHNCQUFzQixDQUFDLFFBQVEsRUFBRSxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDOzRCQUNqTCxDQUFDO3dCQUNGLENBQUM7b0JBQ0YsQ0FBQztvQkFDRCxJQUFJLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxzRkFBc0YsRUFBRSxJQUFJLENBQUMsc0JBQXNCLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDdEosQ0FBQztnQkFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO29CQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztnQkFDOUIsQ0FBQzt3QkFBUyxDQUFDO29CQUNWLElBQUksQ0FBQyx5Q0FBeUMsR0FBRyxTQUFTLENBQUM7Z0JBQzVELENBQUM7WUFDRixDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ04sQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDLHlDQUF5QyxDQUFDO0lBQ3ZELENBQUM7SUFFTyxLQUFLLENBQUMsZ0JBQWdCLENBQUMsVUFBc0MsRUFBRSxJQUFtQyxFQUFFLGNBQWdHLEVBQUU7UUFDN00sSUFBSSxDQUFDLFdBQVcsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO1lBQ3JDLFVBQVUsR0FBRyxJQUFJLENBQUMsZUFBZSxDQUFDLElBQUksaUNBQXlCLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLElBQUksK0JBQXVCLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLElBQUksS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUFFLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixFQUFFLEVBQUUsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUM1UCxDQUFDO1FBQ0QsSUFBSSxDQUFDLFdBQVcsQ0FBQyxjQUFjLEVBQUUsQ0FBQztZQUNqQyxVQUFVLEdBQUcsVUFBVSxDQUFDLE1BQU0sQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRSxDQUFDO1FBQ0QsT0FBTyxVQUFVLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQy9CLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7WUFDdEQsSUFBSSxZQUFZLEdBQUcsWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sQ0FBQyxDQUFDLENBQUM7WUFDWCxDQUFDO1lBQ0QsSUFBSSxZQUFZLEdBQUcsWUFBWSxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sQ0FBQyxDQUFDO1lBQ1YsQ0FBQztZQUNELE9BQU8sQ0FBQyxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7SUFDSixDQUFDO0lBRU8sZUFBZSxDQUFDLE1BQXVDLEVBQUUsSUFBcUMsRUFBRSxXQUE0QyxFQUFFLGNBQThCLEVBQUUsVUFBbUI7UUFDeE0sTUFBTSxJQUFJLEdBQUcsQ0FBQyxRQUEyQixFQUFFLFNBQTRCLEVBQUUsYUFBc0IsRUFBVyxFQUFFO1lBQzNHLElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztnQkFDcEIsSUFBSSxRQUFRLENBQUMsUUFBUSxFQUFFLG1CQUFtQixJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxtQkFBbUIsRUFBRSxDQUFDO29CQUN4RixPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELElBQUksQ0FBQyxRQUFRLENBQUMsUUFBUSxFQUFFLG1CQUFtQixJQUFJLFNBQVMsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQztvQkFDeEYsT0FBTyxJQUFJLENBQUM7Z0JBQ2IsQ0FBQztZQUNGLENBQUM7WUFDRCxJQUFJLFFBQVEsQ0FBQyxPQUFPLElBQUksQ0FBQyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzVDLE9BQU8sS0FBSyxDQUFDO1lBQ2QsQ0FBQztZQUNELElBQUksUUFBUSxDQUFDLE9BQU8sS0FBSyxTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQzVDLElBQUksVUFBVSxJQUFJLE1BQU0sQ0FBQyxFQUFFLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO29CQUNwRixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLHVCQUF1QixTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8saUJBQWlCLFFBQVEsQ0FBQyxRQUFRLENBQUMsSUFBSSxpQkFBaUIsUUFBUSxDQUFDLFFBQVEsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxDQUFDO29CQUN6TSxPQUFPLEtBQUssQ0FBQztnQkFDZCxDQUFDO2dCQUNELElBQUksTUFBTSxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLE9BQU8sRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7b0JBQ3RFLElBQUksUUFBUSxDQUFDLElBQUksaUNBQXlCLEVBQUUsQ0FBQzt3QkFDNUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsc0JBQXNCLFNBQVMsQ0FBQyxRQUFRLENBQUMsSUFBSSxrQ0FBa0MsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLG9CQUFvQixDQUFDLENBQUM7d0JBQ2pKLE9BQU8sS0FBSyxDQUFDO29CQUNkLENBQUM7b0JBQ0QsSUFBSSxRQUFRLENBQUMsY0FBYyxLQUFLLGNBQWMsRUFBRSxDQUFDO3dCQUNoRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxzQkFBc0IsU0FBUyxDQUFDLFFBQVEsQ0FBQyxJQUFJLG1DQUFtQyxTQUFTLENBQUMsY0FBYyxFQUFFLENBQUMsQ0FBQzt3QkFDbEksT0FBTyxLQUFLLENBQUM7b0JBQ2QsQ0FBQztnQkFDRixDQUFDO1lBQ0YsQ0FBQztZQUNELElBQUksYUFBYSxFQUFFLENBQUM7Z0JBQ25CLElBQUksQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLDhCQUE4QixRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksU0FBUyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7WUFDL0csQ0FBQztpQkFBTSxDQUFDO2dCQUNQLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDhCQUE4QixRQUFRLENBQUMsUUFBUSxDQUFDLElBQUksU0FBUyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7WUFDaEgsQ0FBQztZQUNELE9BQU8sSUFBSSxDQUFDO1FBQ2IsQ0FBQyxDQUFDO1FBQ0YsTUFBTSxNQUFNLEdBQUcsSUFBSSxzQkFBc0IsRUFBcUIsQ0FBQztRQUMvRCxNQUFNLEVBQUUsT0FBTyxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUU7WUFDN0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztnQkFDbkQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNoRCxDQUFDO1FBQ0YsQ0FBQyxDQUFDLENBQUM7UUFDSCxJQUFJLEVBQUUsT0FBTyxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUU7WUFDM0IsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxRQUFRLElBQUksTUFBTSxJQUFJLFNBQVMsQ0FBQyxJQUFJLGlDQUF5QixFQUFFLENBQUM7Z0JBQ3BFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHNDQUFzQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUM7Z0JBQ3hGLE9BQU87WUFDUixDQUFDO1lBQ0QsSUFBSSxDQUFDLFFBQVEsSUFBSSxJQUFJLENBQUMsUUFBUSxFQUFFLFNBQVMsRUFBRSxLQUFLLENBQUMsRUFBRSxDQUFDO2dCQUNuRCxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ2hELENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztRQUNILFdBQVcsRUFBRSxPQUFPLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDaEMsTUFBTSxRQUFRLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1lBQ3JELElBQUksQ0FBQyxRQUFRLElBQUksSUFBSSxDQUFDLFFBQVEsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLEVBQUUsQ0FBQztnQkFDbEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztZQUNoRCxDQUFDO1lBQ0QsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNoRCxDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQzdCLENBQUM7SUFFTyxLQUFLLENBQUMsMkJBQTJCLENBQUMsUUFBNEI7UUFDckUsSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsb0NBQW9DLENBQUMsQ0FBQztRQUM1RCxNQUFNLHNCQUFzQixHQUFHLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRSxLQUFLLGdDQUF3QixRQUFRLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxJQUFJLENBQUMsaUJBQWlCLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZMLE1BQU0saUJBQWlCLEdBQUcsc0JBQXNCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyw2QkFBNkIsQ0FBQztRQUN2SCxNQUFNLE1BQU0sR0FBRyxNQUFNLGlCQUFpQixDQUFDLGNBQWMsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDO1FBQzlFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLDRCQUE0QixFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuRSxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7SUFFTyxLQUFLLENBQUMsdUJBQXVCLENBQUMsUUFBNEIsRUFBRSxnQkFBeUI7UUFDNUYsTUFBTSx1QkFBdUIsR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsaUJBQWlCLENBQUM7UUFDN0csSUFBSSxDQUFDLHVCQUF1QixFQUFFLE1BQU0sRUFBRSxDQUFDO1lBQ3RDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUVELElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHdDQUF3QyxDQUFDLENBQUM7UUFDaEUsTUFBTSx1QkFBdUIsR0FBRyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsMEJBQTBCLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO1FBQ2hHLE1BQU0sNEJBQTRCLEdBQVUsRUFBRSxDQUFDO1FBQy9DLE1BQU0sMkJBQTJCLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5SSxLQUFLLE1BQU0sU0FBUyxJQUFJLHVCQUF1QixFQUFFLENBQUM7WUFDakQsTUFBTSxZQUFZLEdBQUcsdUJBQXVCLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLGFBQWEsQ0FBQztZQUM5RSxRQUFRLFlBQVksRUFBRSxDQUFDO2dCQUN0QixLQUFLLFVBQVU7b0JBQ2QsTUFBTTtnQkFDUCxLQUFLLGFBQWE7b0JBQ2pCLDRCQUE0QixDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsMkJBQTJCLEVBQUUsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7b0JBQ3pGLE1BQU07Z0JBQ1A7b0JBQ0MsNEJBQTRCLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztvQkFDMUQsTUFBTTtZQUNSLENBQUM7UUFDRixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsUUFBUSxFQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsYUFBYSxDQUFDLENBQUMsTUFBTSxJQUFJLENBQUMsMkJBQTJCLENBQUMsUUFBUSxFQUFFLEtBQUssZ0NBQXdCLFFBQVEsRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLElBQUksQ0FBQyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqUSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDdkUsT0FBTyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDekIsQ0FBQztJQUVPLEtBQUssQ0FBQywwQkFBMEI7UUFDdkMsSUFBSSxDQUFDO1lBQ0osTUFBTSxPQUFPLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMseUJBQXlCLENBQUMsQ0FBQztZQUNoRixPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsMkJBQTJCLENBQUMsUUFBYSxFQUFFLE9BQWdCLEVBQUUsSUFBbUIsRUFBRSxRQUE0QixFQUFFLFFBQWlCLEVBQUUsa0JBQTZELEVBQUUsY0FBK0I7UUFDOU8sTUFBTSxZQUFZLEdBQUcsTUFBTSxJQUFJLENBQUMsZUFBZSxDQUFDLFFBQVEsSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDL0UsTUFBTSxLQUFLLEdBQUcsTUFBTSxJQUFJLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sNkJBQTZCLEdBQUcsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDO1FBQ2hQLE1BQU0sa0NBQWtDLEdBQUcsNkJBQTZCLENBQUMsQ0FBQyxDQUFDLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUM7UUFDMUksT0FBTyxJQUFJLHFCQUFxQixDQUMvQixRQUFRLEVBQ1IsS0FBSyxFQUNMLDZCQUE2QixFQUM3QixrQ0FBa0MsRUFDbEMsT0FBTyxFQUNQLGtCQUFrQixFQUNsQixJQUFJLEVBQ0osUUFBUSxFQUNSLGNBQWMsQ0FBQyxPQUFPLEVBQ3RCLGNBQWMsQ0FBQyxJQUFJLEVBQ25CLElBQUksQ0FBQyxjQUFjLENBQUMsTUFBTSxFQUMxQixDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLEVBQ2hDLFFBQVEsRUFDUixZQUFZLENBQ1osQ0FBQztJQUNILENBQUM7SUFFTyxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQWE7UUFDbkMsSUFBSSxDQUFDO1lBQ0osTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsQ0FBQztZQUNuRCxJQUFJLE9BQU8sSUFBSSxDQUFDLEtBQUssS0FBSyxRQUFRLEVBQUUsQ0FBQztnQkFDcEMsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDO1lBQ25CLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxHQUFHLEVBQUUsQ0FBQztZQUNkLGVBQWU7UUFDaEIsQ0FBQztRQUNELE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxpQkFBaUI7UUFDeEIsT0FBTztZQUNOLE9BQU8sRUFBRSxJQUFJLENBQUMsY0FBYyxDQUFDLE9BQU87WUFDcEMsSUFBSSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsSUFBSTtTQUM5QixDQUFDO0lBQ0gsQ0FBQztDQUVELENBQUE7QUFuV3FCLGdDQUFnQztJQWtCbkQsV0FBQSx3QkFBd0IsQ0FBQTtJQUN4QixXQUFBLGdDQUFnQyxDQUFBO0lBQ2hDLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxXQUFXLENBQUE7SUFDWCxXQUFBLG1CQUFtQixDQUFBO0lBQ25CLFdBQUEsZUFBZSxDQUFBO0lBQ2YsWUFBQSxtQkFBbUIsQ0FBQTtJQUNuQixZQUFBLHFCQUFxQixDQUFBO0dBekJGLGdDQUFnQyxDQW1XckQ7O0FBRUQsTUFBTSxPQUFPLHFCQUFxQjtJQUVqQyxZQUNpQixRQUFhLEVBQ2IsS0FBeUIsRUFDekIsNkJBQThDLEVBQzlDLGtDQUFzRCxFQUN0RCxPQUFnQixFQUNoQixrQkFBNkQsRUFDN0QsSUFBbUIsRUFDbkIsUUFBaUIsRUFDakIsY0FBc0IsRUFDdEIsV0FBK0IsRUFDL0IsYUFBaUMsRUFDakMsT0FBZ0IsRUFDaEIsUUFBNEIsRUFDNUIsWUFBMEI7UUFiMUIsYUFBUSxHQUFSLFFBQVEsQ0FBSztRQUNiLFVBQUssR0FBTCxLQUFLLENBQW9CO1FBQ3pCLGtDQUE2QixHQUE3Qiw2QkFBNkIsQ0FBaUI7UUFDOUMsdUNBQWtDLEdBQWxDLGtDQUFrQyxDQUFvQjtRQUN0RCxZQUFPLEdBQVAsT0FBTyxDQUFTO1FBQ2hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBMkM7UUFDN0QsU0FBSSxHQUFKLElBQUksQ0FBZTtRQUNuQixhQUFRLEdBQVIsUUFBUSxDQUFTO1FBQ2pCLG1CQUFjLEdBQWQsY0FBYyxDQUFRO1FBQ3RCLGdCQUFXLEdBQVgsV0FBVyxDQUFvQjtRQUMvQixrQkFBYSxHQUFiLGFBQWEsQ0FBb0I7UUFDakMsWUFBTyxHQUFQLE9BQU8sQ0FBUztRQUNoQixhQUFRLEdBQVIsUUFBUSxDQUFvQjtRQUM1QixpQkFBWSxHQUFaLFlBQVksQ0FBYztRQUUxQyw0QkFBNEI7SUFDN0IsQ0FBQztJQUVNLE1BQU0sQ0FBQyxzQkFBc0IsQ0FBQyxLQUE0QjtRQUNoRSxPQUFPO1lBQ04sUUFBUSxFQUFFLEtBQUssQ0FBQyxRQUFRO1lBQ3hCLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUSxLQUFLLFFBQVE7WUFDbkMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPO1lBQ3RCLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWTtTQUNoQyxDQUFDO0lBQ0gsQ0FBQztJQUVNLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBd0IsRUFBRSxDQUF3QjtRQUN0RSxPQUFPLENBQ04sT0FBTyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQztlQUM1QixDQUFDLENBQUMsS0FBSyxLQUFLLENBQUMsQ0FBQyxLQUFLO2VBQ25CLE9BQU8sQ0FBQyxDQUFDLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxDQUFDLDZCQUE2QixDQUFDO2VBQ3pFLENBQUMsQ0FBQyxrQ0FBa0MsS0FBSyxDQUFDLENBQUMsa0NBQWtDO2VBQzdFLENBQUMsQ0FBQyxPQUFPLEtBQUssQ0FBQyxDQUFDLE9BQU87ZUFDdkIsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsa0JBQWtCLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDO2VBQzFELENBQUMsQ0FBQyxJQUFJLEtBQUssQ0FBQyxDQUFDLElBQUk7ZUFDakIsQ0FBQyxDQUFDLFFBQVEsS0FBSyxDQUFDLENBQUMsUUFBUTtlQUN6QixDQUFDLENBQUMsY0FBYyxLQUFLLENBQUMsQ0FBQyxjQUFjO2VBQ3JDLENBQUMsQ0FBQyxXQUFXLEtBQUssQ0FBQyxDQUFDLFdBQVc7ZUFDL0IsQ0FBQyxDQUFDLGFBQWEsS0FBSyxDQUFDLENBQUMsYUFBYTtlQUNuQyxDQUFDLENBQUMsT0FBTyxLQUFLLENBQUMsQ0FBQyxPQUFPO2VBQ3ZCLENBQUMsQ0FBQyxRQUFRLEtBQUssQ0FBQyxDQUFDLFFBQVE7ZUFDekIsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsWUFBWSxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FDdEQsQ0FBQztJQUNILENBQUM7Q0FDRDtBQVNELElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWtCLFNBQVEsVUFBVTtJQUl6QyxZQUNzRCwrQkFBaUUsRUFDOUUsa0JBQXVDLEVBQzlDLFdBQXlCLEVBQ3pDLGNBQStCLEVBQ1Ysa0JBQXVDLEVBQzdDLFVBQXVCO1FBRXZELEtBQUssRUFBRSxDQUFDO1FBUDZDLG9DQUErQixHQUEvQiwrQkFBK0IsQ0FBa0M7UUFDOUUsdUJBQWtCLEdBQWxCLGtCQUFrQixDQUFxQjtRQUM5QyxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUVwQix1QkFBa0IsR0FBbEIsa0JBQWtCLENBQXFCO1FBQzdDLGVBQVUsR0FBVixVQUFVLENBQWE7UUFHdkQsSUFBSSxDQUFDLHVDQUF1QyxHQUFHLGNBQWMsQ0FBQyx1Q0FBdUMsRUFBRSxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDMUksQ0FBQztJQUVELEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBNEI7UUFDaEQsT0FBTyxLQUFLLENBQUMsT0FBTztZQUNuQixDQUFDLENBQUMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLEtBQUssQ0FBQztZQUN2QyxDQUFDLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzNDLENBQUM7SUFFTyxLQUFLLENBQUMsMEJBQTBCLENBQUMsS0FBNEI7UUFDcEUsTUFBTSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLElBQUksQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDNUIsT0FBTyxFQUFFLENBQUM7UUFDWCxDQUFDO1FBQ0QsTUFBTSxVQUFVLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUNuQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxLQUFLLEVBQUMsQ0FBQyxFQUFDLEVBQUU7WUFDM0IsSUFBSSxDQUFDLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztnQkFDcEIsT0FBTyxJQUFJLENBQUM7WUFDYixDQUFDO1lBQ0QsMERBQTBEO1lBQzFELElBQUksS0FBSyxDQUFDLElBQUksK0JBQXVCLElBQUksUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7Z0JBQ2xGLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztZQUNELE1BQU0scUJBQXFCLEdBQUcsSUFBSSxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLDZCQUE2QixFQUFFLEtBQUssQ0FBQyxrQ0FBa0MsRUFBRSxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxrQkFBa0IsRUFBRSxLQUFLLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLGNBQWMsRUFBRSxLQUFLLENBQUMsV0FBVyxFQUFFLEtBQUssQ0FBQyxhQUFhLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztZQUN0VixPQUFPLElBQUksQ0FBQyxhQUFhLENBQUMscUJBQXFCLENBQUMsQ0FBQztRQUNsRCxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsT0FBTyxRQUFRLENBQUMsVUFBVSxDQUFDO1lBQzFCLCtHQUErRzthQUM5RyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQzlELENBQUM7SUFFTyxLQUFLLENBQUMseUJBQXlCLENBQUMsS0FBNEI7UUFDbkUsSUFBSSxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyxpQ0FBaUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4RyxJQUFJLEtBQUssQ0FBQyw2QkFBNkIsSUFBSSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsS0FBSyxDQUFDLDZCQUE2QixDQUFDLEVBQUUsQ0FBQztZQUN6SSxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztZQUNwRixNQUFNLHFCQUFxQixHQUFHLE1BQU0sSUFBSSxDQUFDLGlDQUFpQyxDQUFDLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxFQUFFLG1CQUFtQixFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzVMLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLHFCQUFxQixDQUFDLENBQUM7UUFDbEQsQ0FBQztRQUNELE9BQU8saUJBQWlCLENBQUM7SUFDMUIsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQ0FBaUMsQ0FBQyxlQUFvQixFQUFFLE1BQTRELEVBQUUsS0FBNEI7UUFDL0osTUFBTSx3QkFBd0IsR0FBRyxNQUFNLElBQUksQ0FBQywrQkFBK0IsQ0FBQyxxQkFBcUIsQ0FBQyxlQUFlLEVBQUUsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUM7UUFDN0ksSUFBSSxDQUFDLHdCQUF3QixDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3RDLE9BQU8sRUFBRSxDQUFDO1FBQ1gsQ0FBQztRQUNELE1BQU0sVUFBVSxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FDbkMsd0JBQXdCLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBQyxhQUFhLEVBQUMsRUFBRTtZQUNsRCxJQUFJLE1BQU0sQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDO2dCQUMzQixNQUFNLHFCQUFxQixHQUFHLElBQUkscUJBQXFCLENBQUMsYUFBYSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxLQUFLLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFBRSxLQUFLLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxDQUFDLElBQUksRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsYUFBYSxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQUUsS0FBSyxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7Z0JBQ2xXLE9BQU8sSUFBSSxDQUFDLGFBQWEsQ0FBQyxxQkFBcUIsRUFBRSxhQUFhLENBQUMsQ0FBQztZQUNqRSxDQUFDO1lBQ0QsT0FBTyxJQUFJLENBQUM7UUFDYixDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsT0FBTyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDN0IsQ0FBQztJQUVELEtBQUssQ0FBQywyQkFBMkIsQ0FBQyxLQUE0QjtRQUM3RCxJQUFJLENBQUM7WUFDSixJQUFJLE1BQU0sSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsY0FBYyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUM3RSxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQ2xELE9BQU8sU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7WUFDckMsQ0FBQztpQkFBTSxDQUFDO2dCQUNQLE9BQU8sTUFBTSxJQUFJLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3pDLENBQUM7UUFDRixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxnQ0FBZ0MsS0FBSyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEdBQUcsRUFBRSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztZQUN0RyxPQUFPLEVBQUUsQ0FBQztRQUNYLENBQUM7SUFDRixDQUFDO0lBSUQsS0FBSyxDQUFDLGFBQWEsQ0FBQyxLQUE0QixFQUFFLHVCQUFrRDtRQUNuRyxNQUFNLFdBQVcsR0FBeUIsRUFBRSxDQUFDO1FBQzdDLElBQUksT0FBTyxHQUFHLElBQUksQ0FBQztRQUNuQixJQUFJLFFBQW1DLENBQUM7UUFDeEMsSUFBSSxDQUFDO1lBQ0osUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLHFCQUFxQixDQUFDLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxDQUFDO1FBQUMsT0FBTyxDQUFDLEVBQUUsQ0FBQztZQUNaLElBQUksdUJBQXVCLEVBQUUsQ0FBQztnQkFDN0IsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsZUFBZSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDdkQsT0FBTyxHQUFHLEtBQUssQ0FBQztnQkFDaEIsTUFBTSxDQUFDLFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyx1QkFBdUIsQ0FBQyxVQUFVLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztnQkFDM0UsUUFBUSxHQUFHO29CQUNWLElBQUk7b0JBQ0osU0FBUztvQkFDVCxPQUFPLEVBQUUsdUJBQXVCLENBQUMsT0FBTztvQkFDeEMsT0FBTyxFQUFFLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRTtpQkFDdkIsQ0FBQztZQUNILENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLEtBQUssQ0FBQyxJQUFJLGlDQUF5QixFQUFFLENBQUM7b0JBQ3pDLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUMxQixDQUFDO2dCQUNELE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQztRQUNGLENBQUM7UUFFRCw4RkFBOEY7UUFDOUYsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUN6QixRQUFRLENBQUMsU0FBUyxHQUFHLG1CQUFtQixDQUFDO1FBQzFDLENBQUM7UUFFRCxJQUFJLFFBQThCLENBQUM7UUFDbkMsSUFBSSx1QkFBdUIsRUFBRSxDQUFDO1lBQzdCLFFBQVEsR0FBRztnQkFDVixHQUFHLHVCQUF1QixDQUFDLFFBQVE7Z0JBQ25DLElBQUksRUFBRSxRQUFRLENBQUMsVUFBVSxFQUFFLElBQUk7YUFDL0IsQ0FBQztRQUNILENBQUM7YUFBTSxJQUFJLFFBQVEsQ0FBQyxVQUFVLEVBQUUsQ0FBQztZQUNoQyxRQUFRLEdBQUc7Z0JBQ1Ysa0JBQWtCLEVBQUUsUUFBUSxDQUFDLFVBQVUsQ0FBQyxrQkFBa0I7Z0JBQzFELElBQUksRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUk7Z0JBQzlCLGNBQWMsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLGNBQWM7YUFDbEQsQ0FBQztRQUNILENBQUM7UUFFRCxPQUFPLFFBQVEsQ0FBQyxVQUFVLENBQUM7UUFDM0IsTUFBTSxFQUFFLEdBQUcscUJBQXFCLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDcEUsTUFBTSxVQUFVLEdBQUcsUUFBUSxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLFFBQVEsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQztRQUNyRSxNQUFNLElBQUksR0FBRyxRQUFRLEVBQUUsUUFBUSxDQUFDLENBQUMsOEJBQXNCLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQ3BFLE1BQU0sU0FBUyxHQUFHLElBQUksaUNBQXlCLElBQUksQ0FBQyxDQUFDLFFBQVEsRUFBRSxTQUFTLENBQUM7UUFDekUsSUFBSSxDQUFDO1lBQ0osUUFBUSxHQUFHLE1BQU0sSUFBSSxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsUUFBUSxFQUFFLHFCQUFxQixDQUFDLHNCQUFzQixDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDeEgsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsOEJBQThCLEVBQUUsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDOUUsQ0FBQztRQUNELElBQUksU0FBUyxHQUE2QjtZQUN6QyxJQUFJO1lBQ0osVUFBVTtZQUNWLFFBQVE7WUFDUixRQUFRLEVBQUUsS0FBSyxDQUFDLFFBQVE7WUFDeEIsU0FBUztZQUNULGNBQWMsRUFBRSxRQUFRLEVBQUUsY0FBYyw4Q0FBNEI7WUFDcEUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLG9CQUFvQjtZQUNwRCxRQUFRO1lBQ1IsT0FBTztZQUNQLFdBQVc7WUFDWCxVQUFVLEVBQUUsQ0FBQyxDQUFDLFFBQVEsRUFBRSxVQUFVO1NBQ2xDLENBQUM7UUFDRixJQUFJLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUNwQixTQUFTLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDN0MsQ0FBQztRQUNELElBQUksUUFBUSxDQUFDLG1CQUFtQixJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyx1Q0FBdUMsQ0FBQyxRQUFRLENBQUMsRUFBRSxDQUFDLFdBQVcsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDO1lBQ25KLFFBQVEsQ0FBQywyQkFBMkIsR0FBRyxRQUFRLENBQUMsbUJBQW1CLENBQUM7WUFDcEUsUUFBUSxDQUFDLG1CQUFtQixHQUFHLDRCQUE0QixDQUFDLENBQUMsR0FBRyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxDQUFDO1FBQ2hHLENBQUM7UUFDRCxPQUFPLFNBQVMsQ0FBQztJQUNsQixDQUFDO0lBRUQsUUFBUSxDQUFDLFNBQW1DLEVBQUUsS0FBNEI7UUFDekUsSUFBSSxPQUFPLEdBQUcsU0FBUyxDQUFDLE9BQU8sQ0FBQztRQUNoQyxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLHVDQUF1QyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLEVBQUUsQ0FBQyxXQUFXLEVBQUUsQ0FBQyxDQUFDO1FBQzNKLE1BQU0sV0FBVyxHQUFHLHlCQUF5QixDQUFDLEtBQUssQ0FBQyxjQUFjLEVBQUUsS0FBSyxDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxRQUFRLEVBQUUsU0FBUyxDQUFDLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQyxDQUFDO1FBQ3BLLEtBQUssTUFBTSxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsSUFBSSxXQUFXLEVBQUUsQ0FBQztZQUMvQyxJQUFJLFFBQVEsS0FBSyxRQUFRLENBQUMsS0FBSyxFQUFFLENBQUM7Z0JBQ2pDLE9BQU8sR0FBRyxLQUFLLENBQUM7Z0JBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxPQUFPLENBQUMsQ0FBQyxDQUFDO1lBQ3BFLENBQUM7UUFDRixDQUFDO1FBQ0QsU0FBUyxDQUFDLE9BQU8sR0FBRyxPQUFPLENBQUM7UUFDNUIsU0FBUyxDQUFDLFdBQVcsR0FBRyxDQUFDLEdBQUcsU0FBUyxDQUFDLFdBQVcsRUFBRSxHQUFHLFdBQVcsQ0FBQyxDQUFDO1FBQ25FLE9BQU8sU0FBUyxDQUFDO0lBQ2xCLENBQUM7SUFFTyxLQUFLLENBQUMscUJBQXFCLENBQUMsaUJBQXNCO1FBQ3pELE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLGNBQWMsQ0FBQyxDQUFDO1FBQ3JFLElBQUksT0FBTyxDQUFDO1FBQ1osSUFBSSxDQUFDO1lBQ0osT0FBTyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO1FBQ2hGLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUkscUJBQXFCLENBQUMsS0FBSyxDQUFDLCtDQUF1QyxFQUFFLENBQUM7Z0JBQ3pFLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLGNBQWMsRUFBRSw0QkFBNEIsRUFBRSxnQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUM1SixDQUFDO1lBQ0QsTUFBTSxLQUFLLENBQUM7UUFDYixDQUFDO1FBQ0QsSUFBSSxRQUFtQyxDQUFDO1FBQ3hDLElBQUksQ0FBQztZQUNKLFFBQVEsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBQ2hDLENBQUM7UUFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDO1lBQ2Qsc0NBQXNDO1lBQ3RDLE1BQU0sTUFBTSxHQUFpQixFQUFFLENBQUM7WUFDaEMsS0FBSyxDQUFDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztZQUN2QixLQUFLLE1BQU0sQ0FBQyxJQUFJLE1BQU0sRUFBRSxDQUFDO2dCQUN4QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxlQUFlLEVBQUUsc0NBQXNDLEVBQUUsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLE1BQU0sRUFBRSxvQkFBb0IsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDM00sQ0FBQztZQUNELE1BQU0sR0FBRyxDQUFDO1FBQ1gsQ0FBQztRQUNELElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO1lBQ3hDLE1BQU0sWUFBWSxHQUFHLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLHNCQUFzQixFQUFFLCtDQUErQyxFQUFFLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDckssSUFBSSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsWUFBWSxDQUFDLENBQUM7WUFDcEMsTUFBTSxJQUFJLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUMvQixDQUFDO1FBQ0QsT0FBTyxRQUFRLENBQUM7SUFDakIsQ0FBQztJQUVPLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxpQkFBc0IsRUFBRSxpQkFBcUMsRUFBRSxnQkFBa0M7UUFDaEksTUFBTSxpQkFBaUIsR0FBRyxNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxpQkFBaUIsRUFBRSxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2xILElBQUksaUJBQWlCLEVBQUUsQ0FBQztZQUN2QixJQUFJLENBQUM7Z0JBQ0osTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztnQkFDaEMsd0ZBQXdGO2dCQUN4RixNQUFNLFFBQVEsR0FBRyxNQUFNLElBQUksQ0FBQyw0QkFBNEIsQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQzVGLElBQUksTUFBTSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQztvQkFDdkIsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFO3dCQUN4QixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSwyQkFBMkIsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxFQUFFLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztvQkFDbk0sQ0FBQyxDQUFDLENBQUM7b0JBQ0gsT0FBTyxpQkFBaUIsQ0FBQztnQkFDMUIsQ0FBQztxQkFBTSxJQUFJLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUN4RCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSwyQ0FBMkMsRUFBRSxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUMxSyxPQUFPLGlCQUFpQixDQUFDO2dCQUMxQixDQUFDO2dCQUNELE1BQU0sU0FBUyxHQUFHLGlCQUFpQixDQUFDLE1BQU0sSUFBSSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUNsRSxPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsaUJBQWlCLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQ2xGLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixnQkFBZ0I7WUFDakIsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPLGlCQUFpQixDQUFDO0lBQzFCLENBQUM7SUFFTyxLQUFLLENBQUMsb0JBQW9CLENBQUMsaUJBQXNCLEVBQUUsaUJBQXFDLEVBQUUsZ0JBQWtDO1FBQ25JLE1BQU0saUJBQWlCLEdBQUcsUUFBUSxDQUFDLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDMUUsTUFBTSxZQUFZLEdBQUcsQ0FBQyxTQUFxQixFQUFFLE1BQW9CLEVBQVEsRUFBRTtZQUMxRSxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7Z0JBQ3hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsaUJBQWlCLEVBQUUsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDJCQUEyQixFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsb0JBQW9CLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ25MLENBQUMsQ0FBQyxDQUFDO1FBQ0osQ0FBQyxDQUFDO1FBQ0YsTUFBTSxtQkFBbUIsR0FBRyxDQUFDLFNBQXFCLEVBQVEsRUFBRTtZQUMzRCxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLGlCQUFpQixFQUFFLFFBQVEsQ0FBQyxtQkFBbUIsRUFBRSwyQ0FBMkMsRUFBRSxTQUFTLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNKLENBQUMsQ0FBQztRQUVGLE1BQU0sYUFBYSxHQUFHLEdBQUcsaUJBQWlCLENBQUMsU0FBUyxJQUFJLGlCQUFpQixDQUFDLElBQUksRUFBRSxDQUFDO1FBQ2pGLE1BQU0sZUFBZSxHQUFHLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVyRSxJQUFJLGVBQWUsRUFBRSxDQUFDO1lBQ3JCLElBQUksQ0FBQztnQkFDSixNQUFNLG1CQUFtQixHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsZUFBZSxDQUFDLENBQUM7Z0JBQ3RELE1BQU0sT0FBTyxHQUFHLENBQUMsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxtQkFBbUIsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUN4RixNQUFNLE1BQU0sR0FBaUIsRUFBRSxDQUFDO2dCQUNoQyxNQUFNLGlCQUFpQixHQUFzQixLQUFLLENBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNwRSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZCLFlBQVksQ0FBQyxtQkFBbUIsRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDMUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLENBQUM7Z0JBQzFELENBQUM7cUJBQU0sSUFBSSxXQUFXLENBQUMsaUJBQWlCLENBQUMsS0FBSyxRQUFRLEVBQUUsQ0FBQztvQkFDeEQsbUJBQW1CLENBQUMsbUJBQW1CLENBQUMsQ0FBQztvQkFDekMsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLENBQUM7Z0JBQzFELENBQUM7cUJBQU0sQ0FBQztvQkFDUCxNQUFNLE1BQU0sR0FBRyxpQkFBaUIsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztvQkFDM0YsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLENBQUM7Z0JBQ3ZELENBQUM7WUFDRixDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGlCQUFpQixFQUFFLENBQUM7WUFDMUQsQ0FBQztRQUNGLENBQUM7YUFBTSxDQUFDO1lBQ1AsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2hFLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztnQkFDYixPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsSUFBSSxhQUFhLENBQUM7WUFDbEIsSUFBSSxDQUFDO2dCQUNKLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1lBQ3BGLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsSUFBSSxDQUFDLGFBQWEsQ0FBQyxTQUFTLEVBQUUsQ0FBQztnQkFDOUIsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMvRCxDQUFDO1lBQ0QsSUFBSSxDQUFDO2dCQUNKLE1BQU0sb0JBQW9CLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLGFBQWEsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDekcsTUFBTSxNQUFNLEdBQWlCLEVBQUUsQ0FBQztnQkFDaEMsTUFBTSxRQUFRLEdBQWUsS0FBSyxDQUFDLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNqRSxJQUFJLE1BQU0sQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQ3ZCLFlBQVksQ0FBQyxhQUFhLENBQUMsU0FBUyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM5QyxPQUFPLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxPQUFPLEVBQUUsYUFBYSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUMvRCxDQUFDO3FCQUFNLElBQUksV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLFFBQVEsRUFBRSxDQUFDO29CQUMvQyxtQkFBbUIsQ0FBQyxhQUFhLENBQUMsU0FBUyxDQUFDLENBQUM7b0JBQzdDLE9BQU8sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxhQUFhLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQy9ELENBQUM7Z0JBQ0QsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUM5RCxDQUFDO1lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztnQkFDaEIsT0FBTyxFQUFFLE1BQU0sRUFBRSxTQUFTLEVBQUUsT0FBTyxFQUFFLGFBQWEsQ0FBQyxRQUFRLEVBQUUsQ0FBQztZQUMvRCxDQUFDO1FBQ0YsQ0FBQztJQUNGLENBQUM7SUFFRDs7T0FFRztJQUNLLEtBQUssQ0FBQyw0QkFBNEIsQ0FBQyxxQkFBaUMsRUFBRSxNQUFvQjtRQUNqRyxJQUFJLHFCQUFxQixFQUFFLENBQUM7WUFDM0IsSUFBSSxDQUFDO2dCQUNKLE1BQU0scUJBQXFCLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3hHLE9BQU8sS0FBSyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQzdDLENBQUM7WUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO2dCQUNoQixrQkFBa0I7WUFDbkIsQ0FBQztRQUNGLENBQUM7UUFDRCxPQUFPO0lBQ1IsQ0FBQztJQUVEOzs7T0FHRztJQUNLLGtCQUFrQixDQUFDLGlCQUFzQixFQUFFLGdCQUFrQztRQUNwRixPQUFPLElBQUksT0FBTyxDQUEyQyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUNyRSxNQUFNLElBQUksR0FBRyxDQUFDLE1BQWMsRUFBUSxFQUFFO2dCQUNyQyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsZUFBZSxNQUFNLE9BQU8sQ0FBQyxDQUFDO2dCQUMxRSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLEVBQUU7b0JBQzlDLElBQUksTUFBTSxFQUFFLENBQUM7d0JBQ1osQ0FBQyxDQUFDLEVBQUUsU0FBUyxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxDQUFDO29CQUN0RixDQUFDO29CQUNELE1BQU0sS0FBSyxHQUFHLE1BQU0sQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLENBQUM7b0JBQ3RDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ2xCLENBQUMsQ0FBQyxFQUFFLFNBQVMsRUFBRSxRQUFRLENBQUMsaUJBQWlCLEVBQUUsa0JBQWtCLENBQUMsRUFBRSxRQUFRLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztvQkFDbkYsQ0FBQzt5QkFBTSxDQUFDO3dCQUNQLE1BQU0sR0FBRyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUMsRUFBRSxLQUFLLENBQUMsQ0FBQzt3QkFDcEMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUNkLENBQUM7Z0JBQ0YsQ0FBQyxDQUFDLENBQUM7WUFDSixDQUFDLENBQUM7WUFDRixJQUFJLGdCQUFnQixDQUFDLE9BQU8sSUFBSSxnQkFBZ0IsQ0FBQyxNQUFNLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsQ0FBQztnQkFDdkYsT0FBTyxDQUFDLENBQUMsRUFBRSxTQUFTLEVBQUUsUUFBUSxDQUFDLGlCQUFpQixFQUFFLGtCQUFrQixDQUFDLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDMUYsQ0FBQztZQUNELElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUNqQyxDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxhQUFhLENBQUMsaUJBQXNCLEVBQUUsT0FBZTtRQUM1RCxPQUFPLElBQUksaUJBQWlCLENBQUMsSUFBSSxNQUFNLE9BQU8sRUFBRSxDQUFDO0lBQ2xELENBQUM7Q0FFRCxDQUFBO0FBMVZLLGlCQUFpQjtJQUtwQixXQUFBLGdDQUFnQyxDQUFBO0lBQ2hDLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxZQUFZLENBQUE7SUFDWixXQUFBLGVBQWUsQ0FBQTtJQUNmLFdBQUEsbUJBQW1CLENBQUE7SUFDbkIsV0FBQSxXQUFXLENBQUE7R0FWUixpQkFBaUIsQ0EwVnRCO0FBT0QsSUFBTSx1QkFBdUIsR0FBN0IsTUFBTSx1QkFBd0IsU0FBUSxpQkFBaUI7SUFRdEQsWUFDa0IsY0FBZ0MsRUFDdkIsdUJBQWtFLEVBQzFELCtCQUFpRSxFQUM5RSxrQkFBdUMsRUFDOUMsV0FBeUIsRUFDdEIsY0FBK0IsRUFDM0Isa0JBQXVDLEVBQy9DLFVBQXVCO1FBRXBDLEtBQUssQ0FBQywrQkFBK0IsRUFBRSxrQkFBa0IsRUFBRSxXQUFXLEVBQUUsY0FBYyxFQUFFLGtCQUFrQixFQUFFLFVBQVUsQ0FBQyxDQUFDO1FBVHZHLG1CQUFjLEdBQWQsY0FBYyxDQUFrQjtRQUNOLDRCQUF1QixHQUF2Qix1QkFBdUIsQ0FBMEI7UUFQNUUsNEJBQXVCLEdBQTJCLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBRTdGLHNCQUFpQixHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxPQUFPLEVBQVEsQ0FBQyxDQUFDO1FBQ2hFLHFCQUFnQixHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUM7SUFhekQsQ0FBQztJQUVRLEtBQUssQ0FBQyxjQUFjLENBQUMsS0FBNEI7UUFDekQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMzQyxNQUFNLGFBQWEsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsQ0FBQztRQUMvRCxJQUFJLENBQUMsS0FBSyxHQUFHLEtBQUssQ0FBQztRQUNuQixJQUFJLGFBQWEsSUFBSSxhQUFhLENBQUMsS0FBSyxJQUFJLHFCQUFxQixDQUFDLE1BQU0sQ0FBQyxhQUFhLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDO1lBQzNHLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLHFDQUFxQyxFQUFFLEtBQUssQ0FBQyxJQUFJLGlDQUF5QixDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7WUFDakosSUFBSSxDQUFDLHVCQUF1QixDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUMsQ0FBQztZQUNqRSxPQUFPLGFBQWEsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsU0FBUyxFQUFFLEVBQUU7Z0JBQzdDLG9CQUFvQjtnQkFDcEIsU0FBUyxDQUFDLFFBQVEsR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDcEQsT0FBTyxTQUFTLENBQUM7WUFDbEIsQ0FBQyxDQUFDLENBQUM7UUFDSixDQUFDO1FBQ0QsTUFBTSxNQUFNLEdBQUcsTUFBTSxLQUFLLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2pELE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQzdELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUVPLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxTQUFjO1FBQzlDLElBQUksQ0FBQztZQUNKLE1BQU0sZ0JBQWdCLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUNwRSxNQUFNLGtCQUFrQixHQUF3QixJQUFJLENBQUMsS0FBSyxDQUFDLGdCQUFnQixDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1lBQzlGLE9BQU8sRUFBRSxNQUFNLEVBQUUsa0JBQWtCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLEVBQUUsQ0FBQztRQUN2RixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLHFCQUFxQixDQUFDLEtBQUssQ0FBQywrQ0FBdUMsRUFBRSxDQUFDO2dCQUN6RSxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQywrQ0FBK0MsRUFBRSxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1lBQ2hILENBQUM7UUFDRixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUM7SUFDYixDQUFDO0lBRU8sS0FBSyxDQUFDLG1CQUFtQixDQUFDLFNBQWMsRUFBRSxhQUFrQztRQUNuRixJQUFJLENBQUM7WUFDSixNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsU0FBUyxDQUFDLFNBQVMsRUFBRSxRQUFRLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsYUFBYSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pHLENBQUM7UUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLCtDQUErQyxFQUFFLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7UUFDaEgsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsYUFBYTtRQUMxQixJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1lBQ2pCLG1FQUFtRTtZQUNuRSxPQUFPO1FBQ1IsQ0FBQztRQUVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ2hELE1BQU0sYUFBYSxHQUFHLE1BQU0sSUFBSSxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQy9ELElBQUksQ0FBQyxhQUFhLEVBQUUsQ0FBQztZQUNwQixxRUFBcUU7WUFDckUsT0FBTztRQUNSLENBQUM7UUFFRCxNQUFNLE1BQU0sR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFDO1FBQ3BDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwRixJQUFJLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDdEMsMERBQTBEO1lBQzFELE9BQU87UUFDUixDQUFDO1FBRUQsSUFBSSxDQUFDO1lBQ0osSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsb0JBQW9CLEVBQUUsTUFBTSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzdELDhCQUE4QjtZQUM5QixNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3RDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxJQUFJLEVBQUUsQ0FBQztRQUMvQixDQUFDO1FBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztZQUNoQixJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM5QixDQUFDO0lBQ0YsQ0FBQztJQUVPLFlBQVksQ0FBQyxLQUE0QjtRQUNoRCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3ZDLE9BQU8sSUFBSSxDQUFDLGtCQUFrQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsSUFBSSxpQ0FBeUIsQ0FBQyxDQUFDLENBQUMsMkJBQTJCLENBQUMsQ0FBQyxDQUFDLHdCQUF3QixDQUFDLENBQUM7SUFDakssQ0FBQztJQUVPLFVBQVUsQ0FBQyxLQUE0QjtRQUM5QyxJQUFJLEtBQUssQ0FBQyxJQUFJLGlDQUF5QixFQUFFLENBQUM7WUFDekMsT0FBTyxJQUFJLENBQUMsdUJBQXVCLENBQUMsY0FBYyxDQUFDO1FBQ3BELENBQUM7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ3BCLE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQztRQUNwRCxDQUFDO1FBQ0QsSUFBSSxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO1lBQ3BHLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztRQUM1QixDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDO0lBQzdKLENBQUM7Q0FFRCxDQUFBO0FBNUdLLHVCQUF1QjtJQVUxQixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsZ0NBQWdDLENBQUE7SUFDaEMsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLFlBQVksQ0FBQTtJQUNaLFdBQUEsZUFBZSxDQUFBO0lBQ2YsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixXQUFBLFdBQVcsQ0FBQTtHQWhCUix1QkFBdUIsQ0E0RzVCO0FBRUQsTUFBTSxVQUFVLHNCQUFzQixDQUFDLFNBQTRCLEVBQUUsa0JBQTJCO0lBQy9GLE1BQU0sRUFBRSxHQUFHLGNBQWMsQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ2pGLE9BQU87UUFDTixFQUFFO1FBQ0YsVUFBVSxFQUFFLElBQUksbUJBQW1CLENBQUMsRUFBRSxDQUFDO1FBQ3ZDLFNBQVMsRUFBRSxTQUFTLENBQUMsSUFBSSxpQ0FBeUI7UUFDbEQsYUFBYSxFQUFFLFNBQVMsQ0FBQyxJQUFJLCtCQUF1QixJQUFJLFNBQVMsQ0FBQyxTQUFTO1FBQzNFLGtCQUFrQjtRQUNsQixpQkFBaUIsRUFBRSxTQUFTLENBQUMsUUFBUTtRQUNyQyxJQUFJLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQyxJQUFJO1FBQy9CLGNBQWMsRUFBRSxTQUFTLENBQUMsY0FBYztRQUN4QyxvQkFBb0IsRUFBRSxTQUFTLENBQUMsb0JBQW9CO1FBQ3BELFVBQVUsRUFBRSxTQUFTLENBQUMsVUFBVTtRQUNoQyxHQUFHLFNBQVMsQ0FBQyxRQUFRO0tBQ3JCLENBQUM7QUFDSCxDQUFDO0FBRUQsTUFBTSxPQUFPLDhCQUErQixTQUFRLGdDQUFnQztJQUluRixZQUNDLHdCQUE2QixFQUM3QixzQkFBMkIsRUFDM0IsUUFBYSxFQUNiLGNBQWdDLEVBQ2hDLHVCQUFpRCxFQUNqRCwrQkFBaUUsRUFDakUsV0FBeUIsRUFDekIsVUFBdUIsRUFDdkIsa0JBQXVDLEVBQ3ZDLGNBQStCLEVBQy9CLGtCQUF1QyxFQUN2QyxvQkFBMkM7UUFFM0MsS0FBSyxDQUNKLHdCQUF3QixFQUN4QixzQkFBc0IsRUFDdEIsUUFBUSxDQUFDLFFBQVEsRUFBRSxpQkFBaUIsRUFBRSxZQUFZLEVBQUUsY0FBYyxDQUFDLEVBQ25FLGNBQWMsRUFDZCx1QkFBdUIsRUFBRSwrQkFBK0IsRUFBRSxXQUFXLEVBQUUsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGNBQWMsRUFBRSxrQkFBa0IsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBQ2xLLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ3RDLElBQUksUUFBUSxDQUFDLHNCQUFzQixFQUFFLENBQUM7Z0JBQ3JDLElBQUksQ0FBQztvQkFDSixNQUFNLE9BQU8sR0FBRyxNQUFNLElBQUksQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLHNCQUFzQixDQUFDLENBQUMsQ0FBQztvQkFDM0YsT0FBTyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztnQkFDN0MsQ0FBQztnQkFBQyxPQUFPLEdBQUcsRUFBRSxDQUFDLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNyQyxDQUFDO1lBQ0QsT0FBTyxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQzVCLENBQUMsQ0FBQyxFQUFFLENBQUM7SUFDTixDQUFDO0lBRVMsZUFBZSxDQUFDLFFBQWdCO1FBQ3pDLE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDO0lBQ2pDLENBQUM7Q0FFRCJ9