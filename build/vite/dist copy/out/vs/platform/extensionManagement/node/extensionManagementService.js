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
import * as fs from 'fs';
import { Promises, Queue } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { CancellationError, getErrorMessage } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { hash } from '../../../base/common/hash.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../base/common/map.js';
import { Schemas } from '../../../base/common/network.js';
import * as path from '../../../base/common/path.js';
import { joinPath } from '../../../base/common/resources.js';
import * as semver from '../../../base/common/semver/semver.js';
import { isBoolean, isDefined, isUndefined } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import * as pfs from '../../../base/node/pfs.js';
import { extract, zip } from '../../../base/node/zip.js';
import * as nls from '../../../nls.js';
import { IDownloadService } from '../../download/common/download.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { AbstractExtensionManagementService, AbstractExtensionTask, toExtensionManagementError } from '../common/abstractExtensionManagementService.js';
import { ExtensionManagementError, IExtensionGalleryService, IExtensionManagementService, EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT, ExtensionSignatureVerificationCode, computeSize, IAllowedExtensionsService, VerifyExtensionSignatureConfigKey, shouldRequireRepositorySignatureFor, } from '../common/extensionManagement.js';
import { areSameExtensions, computeTargetPlatform, ExtensionKey, getGalleryExtensionId, groupByExtension } from '../common/extensionManagementUtil.js';
import { IExtensionsProfileScannerService } from '../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../common/extensionsScannerService.js';
import { ExtensionsDownloader } from './extensionDownloader.js';
import { ExtensionsLifecycle } from './extensionLifecycle.js';
import { fromExtractError, getManifest } from './extensionManagementUtil.js';
import { ExtensionsManifestCache } from './extensionsManifestCache.js';
import { ExtensionsWatcher } from './extensionsWatcher.js';
import { isEngineValid } from '../../extensions/common/extensionValidator.js';
import { IFileService, toFileOperationResult } from '../../files/common/files.js';
import { IInstantiationService, refineServiceDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IExtensionGalleryManifestService } from '../common/extensionGalleryManifest.js';
export const INativeServerExtensionManagementService = refineServiceDecorator(IExtensionManagementService);
const DELETED_FOLDER_POSTFIX = '.vsctmp';
let ExtensionManagementService = class ExtensionManagementService extends AbstractExtensionManagementService {
    constructor(galleryService, telemetryService, logService, environmentService, extensionsScannerService, extensionsProfileScannerService, downloadService, instantiationService, fileService, configurationService, extensionGalleryManifestService, productService, allowedExtensionsService, uriIdentityService, userDataProfilesService) {
        super(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService);
        this.environmentService = environmentService;
        this.extensionsScannerService = extensionsScannerService;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.downloadService = downloadService;
        this.instantiationService = instantiationService;
        this.fileService = fileService;
        this.configurationService = configurationService;
        this.extensionGalleryManifestService = extensionGalleryManifestService;
        this.extractingGalleryExtensions = new Map();
        this.knownDirectories = new ResourceSet();
        const extensionLifecycle = this._register(instantiationService.createInstance(ExtensionsLifecycle));
        this.extensionsScanner = this._register(instantiationService.createInstance(ExtensionsScanner, extension => extensionLifecycle.postUninstall(extension)));
        this.manifestCache = this._register(new ExtensionsManifestCache(userDataProfilesService, fileService, uriIdentityService, this, this.logService));
        this.extensionsDownloader = this._register(instantiationService.createInstance(ExtensionsDownloader));
        const extensionsWatcher = this._register(new ExtensionsWatcher(this, this.extensionsScannerService, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, logService));
        this._register(extensionsWatcher.onDidChangeExtensionsByAnotherSource(e => this.onDidChangeExtensionsFromAnotherSource(e)));
        this.watchForExtensionsNotInstalledBySystem();
    }
    getTargetPlatform() {
        if (!this._targetPlatformPromise) {
            this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
        }
        return this._targetPlatformPromise;
    }
    async zip(extension) {
        this.logService.trace('ExtensionManagementService#zip', extension.identifier.id);
        const files = await this.collectFiles(extension);
        const location = await zip(joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid()).fsPath, files);
        return URI.file(location);
    }
    async getManifest(vsix) {
        const { location, cleanup } = await this.downloadVsix(vsix);
        const zipPath = path.resolve(location.fsPath);
        try {
            return await getManifest(zipPath);
        }
        finally {
            await cleanup();
        }
    }
    getInstalled(type, profileLocation = this.userDataProfilesService.defaultProfile.extensionsResource, productVersion = { version: this.productService.version, date: this.productService.date }, language) {
        return this.extensionsScanner.scanExtensions(type ?? null, profileLocation, productVersion, language);
    }
    scanAllUserInstalledExtensions() {
        return this.extensionsScanner.scanAllUserExtensions();
    }
    scanInstalledExtensionAtLocation(location) {
        return this.extensionsScanner.scanUserExtensionAtLocation(location);
    }
    async install(vsix, options = {}) {
        this.logService.trace('ExtensionManagementService#install', vsix.toString());
        const { location, cleanup } = await this.downloadVsix(vsix);
        try {
            const manifest = await getManifest(path.resolve(location.fsPath));
            const extensionId = getGalleryExtensionId(manifest.publisher, manifest.name);
            if (manifest.engines && manifest.engines.vscode && !isEngineValid(manifest.engines.vscode, this.productService.version, this.productService.date)) {
                throw new Error(nls.localize('incompatible', "Unable to install extension '{0}' as it is not compatible with VS Code '{1}'.", extensionId, this.productService.version));
            }
            const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extensionId, version: manifest.version, publisherDisplayName: undefined });
            if (allowedToInstall !== true) {
                throw new Error(nls.localize('notAllowed', "This extension cannot be installed because {0}", allowedToInstall.value));
            }
            const results = await this.installExtensions([{ manifest, extension: location, options }]);
            const result = results.find(({ identifier }) => areSameExtensions(identifier, { id: extensionId }));
            if (result?.local) {
                return result.local;
            }
            if (result?.error) {
                throw result.error;
            }
            throw toExtensionManagementError(new Error(`Unknown error while installing extension ${extensionId}`));
        }
        finally {
            await cleanup();
        }
    }
    async installFromLocation(location, profileLocation) {
        this.logService.trace('ExtensionManagementService#installFromLocation', location.toString());
        const local = await this.extensionsScanner.scanUserExtensionAtLocation(location);
        if (!local || !local.manifest.name || !local.manifest.version) {
            throw new Error(`Cannot find a valid extension from the location ${location.toString()}`);
        }
        await this.addExtensionsToProfile([[local, { source: 'resource' }]], profileLocation);
        this.logService.info('Successfully installed extension', local.identifier.id, profileLocation.toString());
        return local;
    }
    async installExtensionsFromProfile(extensions, fromProfileLocation, toProfileLocation) {
        this.logService.trace('ExtensionManagementService#installExtensionsFromProfile', extensions, fromProfileLocation.toString(), toProfileLocation.toString());
        const extensionsToInstall = (await this.getInstalled(1 /* ExtensionType.User */, fromProfileLocation)).filter(e => extensions.some(id => areSameExtensions(id, e.identifier)));
        if (extensionsToInstall.length) {
            const metadata = await Promise.all(extensionsToInstall.map(e => this.extensionsScanner.scanMetadata(e, fromProfileLocation)));
            await this.addExtensionsToProfile(extensionsToInstall.map((e, index) => [e, metadata[index]]), toProfileLocation);
            this.logService.info('Successfully installed extensions', extensionsToInstall.map(e => e.identifier.id), toProfileLocation.toString());
        }
        return extensionsToInstall;
    }
    async updateMetadata(local, metadata, profileLocation) {
        this.logService.trace('ExtensionManagementService#updateMetadata', local.identifier.id);
        if (metadata.isPreReleaseVersion) {
            metadata.preRelease = true;
            metadata.hasPreReleaseVersion = true;
        }
        // unset if false
        if (metadata.isMachineScoped === false) {
            metadata.isMachineScoped = undefined;
        }
        if (metadata.isBuiltin === false) {
            metadata.isBuiltin = undefined;
        }
        if (metadata.pinned === false) {
            metadata.pinned = undefined;
        }
        local = await this.extensionsScanner.updateMetadata(local, metadata, profileLocation);
        this.manifestCache.invalidate(profileLocation);
        this._onDidUpdateExtensionMetadata.fire({ local, profileLocation });
        return local;
    }
    deleteExtension(extension) {
        return this.extensionsScanner.deleteExtension(extension, 'remove');
    }
    copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        return this.extensionsScanner.copyExtension(extension, fromProfileLocation, toProfileLocation, metadata);
    }
    moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        return this.extensionsScanner.moveExtension(extension, fromProfileLocation, toProfileLocation, metadata);
    }
    removeExtension(extension, fromProfileLocation) {
        return this.extensionsScanner.removeExtension(extension.identifier, fromProfileLocation);
    }
    copyExtensions(fromProfileLocation, toProfileLocation) {
        return this.extensionsScanner.copyExtensions(fromProfileLocation, toProfileLocation, { version: this.productService.version, date: this.productService.date });
    }
    deleteExtensions(...extensions) {
        return this.extensionsScanner.setExtensionsForRemoval(...extensions);
    }
    async cleanUp() {
        this.logService.trace('ExtensionManagementService#cleanUp');
        try {
            await this.extensionsScanner.cleanUp();
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    async download(extension, operation, donotVerifySignature) {
        const { location } = await this.downloadExtension(extension, operation, !donotVerifySignature);
        return location;
    }
    async downloadVsix(vsix) {
        if (vsix.scheme === Schemas.file) {
            return { location: vsix, async cleanup() { } };
        }
        this.logService.trace('Downloading extension from', vsix.toString());
        const location = joinPath(this.extensionsDownloader.extensionsDownloadDir, generateUuid());
        await this.downloadService.download(vsix, location, 'extensionManagement.downloadVsix');
        this.logService.info('Downloaded extension to', location.toString());
        const cleanup = async () => {
            try {
                await this.fileService.del(location);
            }
            catch (error) {
                this.logService.error(error);
            }
        };
        return { location, cleanup };
    }
    getCurrentExtensionsManifestLocation() {
        return this.userDataProfilesService.defaultProfile.extensionsResource;
    }
    createInstallExtensionTask(manifest, extension, options) {
        const extensionKey = extension instanceof URI ? new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version) : ExtensionKey.create(extension);
        return this.instantiationService.createInstance(InstallExtensionInProfileTask, extensionKey, manifest, extension, options, (operation, token) => {
            if (extension instanceof URI) {
                return this.extractVSIX(extensionKey, extension, options, token);
            }
            let promise = this.extractingGalleryExtensions.get(extensionKey.toString());
            if (!promise) {
                this.extractingGalleryExtensions.set(extensionKey.toString(), promise = this.downloadAndExtractGalleryExtension(extensionKey, extension, operation, options, token));
                promise.finally(() => this.extractingGalleryExtensions.delete(extensionKey.toString()));
            }
            return promise;
        }, this.extensionsScanner);
    }
    createUninstallExtensionTask(extension, options) {
        return new UninstallExtensionInProfileTask(extension, options, this.extensionsProfileScannerService);
    }
    async downloadAndExtractGalleryExtension(extensionKey, gallery, operation, options, token) {
        const { verificationStatus, location } = await this.downloadExtension(gallery, operation, !options.donotVerifySignature, options.context?.[EXTENSION_INSTALL_CLIENT_TARGET_PLATFORM_CONTEXT]);
        try {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            // validate manifest
            const manifest = await getManifest(location.fsPath);
            if (!new ExtensionKey(gallery.identifier, gallery.version).equals(new ExtensionKey({ id: getGalleryExtensionId(manifest.publisher, manifest.name) }, manifest.version))) {
                throw new ExtensionManagementError(nls.localize('invalidManifest', "Cannot install '{0}' extension because of manifest mismatch with Marketplace", gallery.identifier.id), "Invalid" /* ExtensionManagementErrorCode.Invalid */);
            }
            const local = await this.extensionsScanner.extractUserExtension(extensionKey, location.fsPath, false, token);
            if (verificationStatus !== ExtensionSignatureVerificationCode.Success && this.environmentService.isBuilt) {
                try {
                    await this.extensionsDownloader.delete(location);
                }
                catch (e) {
                    /* Ignore */
                    this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
                }
            }
            return { local, verificationStatus };
        }
        catch (error) {
            try {
                await this.extensionsDownloader.delete(location);
            }
            catch (e) {
                /* Ignore */
                this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
            }
            throw toExtensionManagementError(error);
        }
    }
    async downloadExtension(extension, operation, verifySignature, clientTargetPlatform) {
        if (verifySignature) {
            const value = this.configurationService.getValue(VerifyExtensionSignatureConfigKey);
            verifySignature = isBoolean(value) ? value : true;
        }
        const { location, verificationStatus } = await this.extensionsDownloader.download(extension, operation, verifySignature, clientTargetPlatform);
        const shouldRequireSignature = shouldRequireRepositorySignatureFor(extension.private, await this.extensionGalleryManifestService.getExtensionGalleryManifest());
        if (verificationStatus !== ExtensionSignatureVerificationCode.Success
            && !(verificationStatus === ExtensionSignatureVerificationCode.NotSigned && !shouldRequireSignature)
            && verifySignature
            && this.environmentService.isBuilt
            && (await this.getTargetPlatform()) !== "linux-armhf" /* TargetPlatform.LINUX_ARMHF */) {
            try {
                await this.extensionsDownloader.delete(location);
            }
            catch (e) {
                /* Ignore */
                this.logService.warn(`Error while deleting the downloaded file`, location.toString(), getErrorMessage(e));
            }
            if (!verificationStatus) {
                throw new ExtensionManagementError(nls.localize('signature verification not executed', "Signature verification was not executed."), "SignatureVerificationInternal" /* ExtensionManagementErrorCode.SignatureVerificationInternal */);
            }
            switch (verificationStatus) {
                case ExtensionSignatureVerificationCode.PackageIntegrityCheckFailed:
                case ExtensionSignatureVerificationCode.SignatureIsInvalid:
                case ExtensionSignatureVerificationCode.SignatureManifestIsInvalid:
                case ExtensionSignatureVerificationCode.SignatureIntegrityCheckFailed:
                case ExtensionSignatureVerificationCode.EntryIsMissing:
                case ExtensionSignatureVerificationCode.EntryIsTampered:
                case ExtensionSignatureVerificationCode.Untrusted:
                case ExtensionSignatureVerificationCode.CertificateRevoked:
                case ExtensionSignatureVerificationCode.SignatureIsNotValid:
                case ExtensionSignatureVerificationCode.SignatureArchiveHasTooManyEntries:
                case ExtensionSignatureVerificationCode.NotSigned:
                    throw new ExtensionManagementError(nls.localize('signature verification failed', "Signature verification failed with '{0}' error.", verificationStatus), "SignatureVerificationFailed" /* ExtensionManagementErrorCode.SignatureVerificationFailed */);
            }
            throw new ExtensionManagementError(nls.localize('signature verification failed', "Signature verification failed with '{0}' error.", verificationStatus), "SignatureVerificationInternal" /* ExtensionManagementErrorCode.SignatureVerificationInternal */);
        }
        return { location, verificationStatus };
    }
    async extractVSIX(extensionKey, location, options, token) {
        const local = await this.extensionsScanner.extractUserExtension(extensionKey, path.resolve(location.fsPath), isBoolean(options.keepExisting) ? !options.keepExisting : true, token);
        return { local };
    }
    async collectFiles(extension) {
        const collectFilesFromDirectory = async (dir) => {
            let entries = await pfs.Promises.readdir(dir);
            entries = entries.map(e => path.join(dir, e));
            const stats = await Promise.all(entries.map(e => fs.promises.stat(e)));
            let promise = Promise.resolve([]);
            stats.forEach((stat, index) => {
                const entry = entries[index];
                if (stat.isFile()) {
                    promise = promise.then(result => ([...result, entry]));
                }
                if (stat.isDirectory()) {
                    promise = promise
                        .then(result => collectFilesFromDirectory(entry)
                        .then(files => ([...result, ...files])));
                }
            });
            return promise;
        };
        const files = await collectFilesFromDirectory(extension.location.fsPath);
        return files.map(f => ({ path: `extension/${path.relative(extension.location.fsPath, f)}`, localPath: f }));
    }
    async onDidChangeExtensionsFromAnotherSource({ added, removed }) {
        if (removed) {
            const removedExtensions = added && this.uriIdentityService.extUri.isEqual(removed.profileLocation, added.profileLocation)
                ? removed.extensions.filter(e => added.extensions.every(identifier => !areSameExtensions(identifier, e)))
                : removed.extensions;
            for (const identifier of removedExtensions) {
                this.logService.info('Extensions removed from another source', identifier.id, removed.profileLocation.toString());
                this._onDidUninstallExtension.fire({ identifier, profileLocation: removed.profileLocation });
            }
        }
        if (added) {
            const extensions = await this.getInstalled(1 /* ExtensionType.User */, added.profileLocation);
            const addedExtensions = extensions.filter(e => added.extensions.some(identifier => areSameExtensions(identifier, e.identifier)));
            this._onDidInstallExtensions.fire(addedExtensions.map(local => {
                this.logService.info('Extensions added from another source', local.identifier.id, added.profileLocation.toString());
                return { identifier: local.identifier, local, profileLocation: added.profileLocation, operation: 1 /* InstallOperation.None */ };
            }));
        }
    }
    async watchForExtensionsNotInstalledBySystem() {
        this._register(this.extensionsScanner.onExtract(resource => this.knownDirectories.add(resource)));
        const stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
        for (const childStat of stat.children ?? []) {
            if (childStat.isDirectory) {
                this.knownDirectories.add(childStat.resource);
            }
        }
        this._register(this.fileService.watch(this.extensionsScannerService.userExtensionsLocation));
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
    }
    async onDidFilesChange(e) {
        if (!e.affects(this.extensionsScannerService.userExtensionsLocation, 1 /* FileChangeType.ADDED */)) {
            return;
        }
        const added = [];
        for (const resource of e.rawAdded) {
            // Check if this is a known directory
            if (this.knownDirectories.has(resource)) {
                continue;
            }
            // Is not immediate child of extensions resource
            if (!this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(resource), this.extensionsScannerService.userExtensionsLocation)) {
                continue;
            }
            // .obsolete file changed
            if (this.uriIdentityService.extUri.isEqual(resource, this.uriIdentityService.extUri.joinPath(this.extensionsScannerService.userExtensionsLocation, '.obsolete'))) {
                continue;
            }
            // Ignore changes to files starting with `.`
            if (this.uriIdentityService.extUri.basename(resource).startsWith('.')) {
                continue;
            }
            // Ignore changes to the deleted folder
            if (this.uriIdentityService.extUri.basename(resource).endsWith(DELETED_FOLDER_POSTFIX)) {
                continue;
            }
            try {
                // Check if this is a directory
                if (!(await this.fileService.stat(resource)).isDirectory) {
                    continue;
                }
            }
            catch (error) {
                if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.logService.error(error);
                }
                continue;
            }
            // Check if this is an extension added by another source
            // Extension added by another source will not have installed timestamp
            const extension = await this.extensionsScanner.scanUserExtensionAtLocation(resource);
            if (extension && extension.installedTimestamp === undefined) {
                this.knownDirectories.add(resource);
                added.push(extension);
            }
        }
        if (added.length) {
            await this.addExtensionsToProfile(added.map(e => [e, undefined]), this.userDataProfilesService.defaultProfile.extensionsResource);
            this.logService.info('Added extensions to default profile from external source', added.map(e => e.identifier.id));
        }
    }
    async addExtensionsToProfile(extensions, profileLocation) {
        const localExtensions = extensions.map(e => e[0]);
        await this.extensionsScanner.unsetExtensionsForRemoval(...localExtensions.map(extension => ExtensionKey.create(extension)));
        await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, profileLocation);
        this._onDidInstallExtensions.fire(localExtensions.map(local => ({ local, identifier: local.identifier, operation: 1 /* InstallOperation.None */, profileLocation })));
    }
};
ExtensionManagementService = __decorate([
    __param(0, IExtensionGalleryService),
    __param(1, ITelemetryService),
    __param(2, ILogService),
    __param(3, INativeEnvironmentService),
    __param(4, IExtensionsScannerService),
    __param(5, IExtensionsProfileScannerService),
    __param(6, IDownloadService),
    __param(7, IInstantiationService),
    __param(8, IFileService),
    __param(9, IConfigurationService),
    __param(10, IExtensionGalleryManifestService),
    __param(11, IProductService),
    __param(12, IAllowedExtensionsService),
    __param(13, IUriIdentityService),
    __param(14, IUserDataProfilesService)
], ExtensionManagementService);
export { ExtensionManagementService };
let ExtensionsScanner = class ExtensionsScanner extends Disposable {
    constructor(beforeRemovingExtension, fileService, extensionsScannerService, extensionsProfileScannerService, uriIdentityService, telemetryService, logService) {
        super();
        this.beforeRemovingExtension = beforeRemovingExtension;
        this.fileService = fileService;
        this.extensionsScannerService = extensionsScannerService;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.uriIdentityService = uriIdentityService;
        this.telemetryService = telemetryService;
        this.logService = logService;
        this._onExtract = this._register(new Emitter());
        this.onExtract = this._onExtract.event;
        this.scanAllExtensionPromise = new ResourceMap();
        this.scanUserExtensionsPromise = new ResourceMap();
        this.obsoletedResource = joinPath(this.extensionsScannerService.userExtensionsLocation, '.obsolete');
        this.obsoleteFileLimiter = new Queue();
    }
    async cleanUp() {
        await this.removeTemporarilyDeletedFolders();
        await this.deleteExtensionsMarkedForRemoval();
        //TODO: Remove this initiialization after coupe of releases
        await this.initializeExtensionSize();
    }
    async scanExtensions(type, profileLocation, productVersion, language) {
        try {
            const cacheKey = profileLocation.with({ query: language });
            const userScanOptions = { includeInvalid: true, profileLocation, productVersion, language };
            let scannedExtensions = [];
            if (type === null || type === 0 /* ExtensionType.System */) {
                let scanAllExtensionsPromise = this.scanAllExtensionPromise.get(cacheKey);
                if (!scanAllExtensionsPromise) {
                    scanAllExtensionsPromise = this.extensionsScannerService.scanAllExtensions({ language }, userScanOptions)
                        .finally(() => this.scanAllExtensionPromise.delete(cacheKey));
                    this.scanAllExtensionPromise.set(cacheKey, scanAllExtensionsPromise);
                }
                scannedExtensions.push(...await scanAllExtensionsPromise);
            }
            else if (type === 1 /* ExtensionType.User */) {
                let scanUserExtensionsPromise = this.scanUserExtensionsPromise.get(cacheKey);
                if (!scanUserExtensionsPromise) {
                    scanUserExtensionsPromise = this.extensionsScannerService.scanUserExtensions(userScanOptions)
                        .finally(() => this.scanUserExtensionsPromise.delete(cacheKey));
                    this.scanUserExtensionsPromise.set(cacheKey, scanUserExtensionsPromise);
                }
                scannedExtensions.push(...await scanUserExtensionsPromise);
            }
            scannedExtensions = type !== null ? scannedExtensions.filter(r => r.type === type) : scannedExtensions;
            return await Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
        }
        catch (error) {
            throw toExtensionManagementError(error, "Scanning" /* ExtensionManagementErrorCode.Scanning */);
        }
    }
    async scanAllUserExtensions() {
        try {
            const scannedExtensions = await this.extensionsScannerService.scanAllUserExtensions();
            return await Promise.all(scannedExtensions.map(extension => this.toLocalExtension(extension)));
        }
        catch (error) {
            throw toExtensionManagementError(error, "Scanning" /* ExtensionManagementErrorCode.Scanning */);
        }
    }
    async scanUserExtensionAtLocation(location) {
        try {
            const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, 1 /* ExtensionType.User */, { includeInvalid: true });
            if (scannedExtension) {
                return await this.toLocalExtension(scannedExtension);
            }
        }
        catch (error) {
            this.logService.error(error);
        }
        return null;
    }
    async extractUserExtension(extensionKey, zipPath, removeIfExists, token) {
        const folderName = extensionKey.toString();
        const tempLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, `.${generateUuid()}`));
        const extensionLocation = URI.file(path.join(this.extensionsScannerService.userExtensionsLocation.fsPath, folderName));
        if (await this.fileService.exists(extensionLocation)) {
            if (!removeIfExists) {
                try {
                    return await this.scanLocalExtension(extensionLocation, 1 /* ExtensionType.User */);
                }
                catch (error) {
                    this.logService.warn(`Error while scanning the existing extension at ${extensionLocation.path}. Deleting the existing extension and extracting it.`, getErrorMessage(error));
                }
            }
            try {
                await this.deleteExtensionFromLocation(extensionKey.id, extensionLocation, 'removeExisting');
            }
            catch (error) {
                throw new ExtensionManagementError(nls.localize('errorDeleting', "Unable to delete the existing folder '{0}' while installing the extension '{1}'. Please delete the folder manually and try again", extensionLocation.fsPath, extensionKey.id), "Delete" /* ExtensionManagementErrorCode.Delete */);
            }
        }
        try {
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            // Extract
            try {
                this.logService.trace(`Started extracting the extension from ${zipPath} to ${extensionLocation.fsPath}`);
                await extract(zipPath, tempLocation.fsPath, { sourcePath: 'extension', overwrite: true }, token);
                this.logService.info(`Extracted extension to ${extensionLocation}:`, extensionKey.id);
            }
            catch (e) {
                throw fromExtractError(e);
            }
            const metadata = { installedTimestamp: Date.now(), targetPlatform: extensionKey.targetPlatform };
            try {
                metadata.size = await computeSize(tempLocation, this.fileService);
            }
            catch (error) {
                // Log & ignore
                this.logService.warn(`Error while getting the size of the extracted extension : ${tempLocation.fsPath}`, getErrorMessage(error));
            }
            try {
                await this.extensionsScannerService.updateManifestMetadata(tempLocation, metadata);
            }
            catch (error) {
                this.telemetryService.publicLog2('extension:extract', { extensionId: extensionKey.id, code: `${toFileOperationResult(error)}` });
                throw toExtensionManagementError(error, "UpdateMetadata" /* ExtensionManagementErrorCode.UpdateMetadata */);
            }
            if (token.isCancellationRequested) {
                throw new CancellationError();
            }
            // Rename
            try {
                this.logService.trace(`Started renaming the extension from ${tempLocation.fsPath} to ${extensionLocation.fsPath}`);
                await this.rename(tempLocation.fsPath, extensionLocation.fsPath);
                this.logService.info('Renamed to', extensionLocation.fsPath);
            }
            catch (error) {
                if (error.code === 'ENOTEMPTY') {
                    this.logService.info(`Rename failed because extension was installed by another source. So ignoring renaming.`, extensionKey.id);
                    try {
                        await this.fileService.del(tempLocation, { recursive: true });
                    }
                    catch (e) { /* ignore */ }
                }
                else {
                    this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted from extracted location`, tempLocation);
                    throw error;
                }
            }
            this._onExtract.fire(extensionLocation);
        }
        catch (error) {
            try {
                await this.fileService.del(tempLocation, { recursive: true });
            }
            catch (e) { /* ignore */ }
            throw error;
        }
        return this.scanLocalExtension(extensionLocation, 1 /* ExtensionType.User */);
    }
    async scanMetadata(local, profileLocation) {
        const extension = await this.getScannedExtension(local, profileLocation);
        return extension?.metadata;
    }
    async getScannedExtension(local, profileLocation) {
        const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileLocation);
        return extensions.find(e => areSameExtensions(e.identifier, local.identifier));
    }
    async updateMetadata(local, metadata, profileLocation) {
        try {
            await this.extensionsProfileScannerService.updateMetadata([[local, metadata]], profileLocation);
        }
        catch (error) {
            this.telemetryService.publicLog2('extension:extract', { extensionId: local.identifier.id, code: `${toFileOperationResult(error)}`, isProfile: !!profileLocation });
            throw toExtensionManagementError(error, "UpdateMetadata" /* ExtensionManagementErrorCode.UpdateMetadata */);
        }
        return this.scanLocalExtension(local.location, local.type, profileLocation);
    }
    async setExtensionsForRemoval(...extensions) {
        const extensionsToRemove = [];
        for (const extension of extensions) {
            if (await this.fileService.exists(extension.location)) {
                extensionsToRemove.push(extension);
            }
        }
        const extensionKeys = extensionsToRemove.map(e => ExtensionKey.create(e));
        await this.withRemovedExtensions(removedExtensions => extensionKeys.forEach(extensionKey => {
            removedExtensions[extensionKey.toString()] = true;
            this.logService.info('Marked extension as removed', extensionKey.toString());
        }));
    }
    async unsetExtensionsForRemoval(...extensionKeys) {
        try {
            const results = [];
            await this.withRemovedExtensions(removedExtensions => extensionKeys.forEach(extensionKey => {
                if (removedExtensions[extensionKey.toString()]) {
                    results.push(true);
                    delete removedExtensions[extensionKey.toString()];
                }
                else {
                    results.push(false);
                }
            }));
            return results;
        }
        catch (error) {
            throw toExtensionManagementError(error, "UnsetRemoved" /* ExtensionManagementErrorCode.UnsetRemoved */);
        }
    }
    async deleteExtension(extension, type) {
        if (this.uriIdentityService.extUri.isEqualOrParent(extension.location, this.extensionsScannerService.userExtensionsLocation)) {
            await this.deleteExtensionFromLocation(extension.identifier.id, extension.location, type);
            await this.unsetExtensionsForRemoval(ExtensionKey.create(extension));
        }
    }
    async copyExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        const source = await this.getScannedExtension(extension, fromProfileLocation);
        const target = await this.getScannedExtension(extension, toProfileLocation);
        metadata = { ...source?.metadata, ...metadata };
        if (target) {
            if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
                await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
            }
            else {
                const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
                await this.extensionsProfileScannerService.removeExtensionsFromProfile([targetExtension.identifier], toProfileLocation);
                await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
            }
        }
        else {
            await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
        }
        return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
    }
    async moveExtension(extension, fromProfileLocation, toProfileLocation, metadata) {
        const source = await this.getScannedExtension(extension, fromProfileLocation);
        const target = await this.getScannedExtension(extension, toProfileLocation);
        metadata = { ...source?.metadata, ...metadata };
        if (target) {
            if (this.uriIdentityService.extUri.isEqual(target.location, extension.location)) {
                await this.extensionsProfileScannerService.updateMetadata([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
            }
            else {
                const targetExtension = await this.scanLocalExtension(target.location, extension.type, toProfileLocation);
                await this.removeExtension(targetExtension.identifier, toProfileLocation);
                await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, { ...target.metadata, ...metadata }]], toProfileLocation);
            }
        }
        else {
            await this.extensionsProfileScannerService.addExtensionsToProfile([[extension, metadata]], toProfileLocation);
            if (source) {
                await this.removeExtension(source.identifier, fromProfileLocation);
            }
        }
        return this.scanLocalExtension(extension.location, extension.type, toProfileLocation);
    }
    async removeExtension(identifier, fromProfileLocation) {
        await this.extensionsProfileScannerService.removeExtensionsFromProfile([identifier], fromProfileLocation);
    }
    async copyExtensions(fromProfileLocation, toProfileLocation, productVersion) {
        const fromExtensions = await this.scanExtensions(1 /* ExtensionType.User */, fromProfileLocation, productVersion);
        const extensions = await Promise.all(fromExtensions
            .filter(e => !e.isApplicationScoped) /* remove application scoped extensions */
            .map(async (e) => ([e, await this.scanMetadata(e, fromProfileLocation)])));
        await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, toProfileLocation);
    }
    async deleteExtensionFromLocation(id, location, type) {
        this.logService.trace(`Deleting ${type} extension from disk`, id, location.fsPath);
        const renamedLocation = this.uriIdentityService.extUri.joinPath(this.uriIdentityService.extUri.dirname(location), `${this.uriIdentityService.extUri.basename(location)}.${hash(generateUuid()).toString(16)}${DELETED_FOLDER_POSTFIX}`);
        await this.rename(location.fsPath, renamedLocation.fsPath);
        await this.fileService.del(renamedLocation, { recursive: true });
        this.logService.info(`Deleted ${type} extension from disk`, id, location.fsPath);
    }
    withRemovedExtensions(updateFn) {
        return this.obsoleteFileLimiter.queue(async () => {
            let raw;
            try {
                const content = await this.fileService.readFile(this.obsoletedResource, 'utf8');
                raw = content.value.toString();
            }
            catch (error) {
                if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    throw error;
                }
            }
            let removed = {};
            if (raw) {
                try {
                    removed = JSON.parse(raw);
                }
                catch (e) { /* ignore */ }
            }
            if (updateFn) {
                updateFn(removed);
                if (Object.keys(removed).length) {
                    await this.fileService.writeFile(this.obsoletedResource, VSBuffer.fromString(JSON.stringify(removed)));
                }
                else {
                    try {
                        await this.fileService.del(this.obsoletedResource);
                    }
                    catch (error) {
                        if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                            throw error;
                        }
                    }
                }
            }
            return removed;
        });
    }
    async rename(extractPath, renamePath) {
        try {
            await pfs.Promises.rename(extractPath, renamePath, 2 * 60 * 1000 /* Retry for 2 minutes */);
        }
        catch (error) {
            throw toExtensionManagementError(error, "Rename" /* ExtensionManagementErrorCode.Rename */);
        }
    }
    async scanLocalExtension(location, type, profileLocation) {
        try {
            if (profileLocation) {
                const scannedExtensions = await this.extensionsScannerService.scanUserExtensions({ profileLocation });
                const scannedExtension = scannedExtensions.find(e => this.uriIdentityService.extUri.isEqual(e.location, location));
                if (scannedExtension) {
                    return await this.toLocalExtension(scannedExtension);
                }
            }
            else {
                const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, type, { includeInvalid: true });
                if (scannedExtension) {
                    return await this.toLocalExtension(scannedExtension);
                }
            }
            throw new ExtensionManagementError(nls.localize('cannot read', "Cannot read the extension from {0}", location.path), "ScanningExtension" /* ExtensionManagementErrorCode.ScanningExtension */);
        }
        catch (error) {
            throw toExtensionManagementError(error, "ScanningExtension" /* ExtensionManagementErrorCode.ScanningExtension */);
        }
    }
    async toLocalExtension(extension) {
        let stat;
        try {
            stat = await this.fileService.resolve(extension.location);
        }
        catch (error) { /* ignore */ }
        let readmeUrl;
        let changelogUrl;
        if (stat?.children) {
            readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
            changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
        }
        return {
            identifier: extension.identifier,
            type: extension.type,
            isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
            location: extension.location,
            manifest: extension.manifest,
            targetPlatform: extension.targetPlatform,
            validations: extension.validations,
            isValid: extension.isValid,
            readmeUrl,
            changelogUrl,
            publisherDisplayName: extension.metadata?.publisherDisplayName,
            publisherId: extension.metadata?.publisherId || null,
            isApplicationScoped: !!extension.metadata?.isApplicationScoped,
            isMachineScoped: !!extension.metadata?.isMachineScoped,
            isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
            hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
            preRelease: extension.preRelease,
            installedTimestamp: extension.metadata?.installedTimestamp,
            updated: !!extension.metadata?.updated,
            pinned: !!extension.metadata?.pinned,
            private: !!extension.metadata?.private,
            isWorkspaceScoped: false,
            source: extension.metadata?.source ?? (extension.identifier.uuid ? 'gallery' : 'vsix'),
            size: extension.metadata?.size ?? 0,
        };
    }
    async initializeExtensionSize() {
        const extensions = await this.extensionsScannerService.scanAllUserExtensions();
        await Promise.all(extensions.map(async (extension) => {
            // set size if not set before
            if (isDefined(extension.metadata?.installedTimestamp) && isUndefined(extension.metadata?.size)) {
                const size = await computeSize(extension.location, this.fileService);
                await this.extensionsScannerService.updateManifestMetadata(extension.location, { size });
            }
        }));
    }
    async deleteExtensionsMarkedForRemoval() {
        let removed;
        try {
            removed = await this.withRemovedExtensions();
        }
        catch (error) {
            throw toExtensionManagementError(error, "ReadRemoved" /* ExtensionManagementErrorCode.ReadRemoved */);
        }
        if (Object.keys(removed).length === 0) {
            this.logService.debug(`No extensions are marked as removed.`);
            return;
        }
        this.logService.debug(`Deleting extensions marked as removed:`, Object.keys(removed));
        const extensions = await this.scanAllUserExtensions();
        const installed = new Set();
        for (const e of extensions) {
            if (!removed[ExtensionKey.create(e).toString()]) {
                installed.add(e.identifier.id.toLowerCase());
            }
        }
        try {
            // running post uninstall tasks for extensions that are not installed anymore
            const byExtension = groupByExtension(extensions, e => e.identifier);
            await Promises.settled(byExtension.map(async (e) => {
                const latest = e.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version))[0];
                if (!installed.has(latest.identifier.id.toLowerCase())) {
                    await this.beforeRemovingExtension(latest);
                }
            }));
        }
        catch (error) {
            this.logService.error(error);
        }
        const toRemove = extensions.filter(e => e.installedTimestamp /* Installed by System */ && removed[ExtensionKey.create(e).toString()]);
        await Promise.allSettled(toRemove.map(e => this.deleteExtension(e, 'marked for removal')));
    }
    async removeTemporarilyDeletedFolders() {
        this.logService.trace('ExtensionManagementService#removeTempDeleteFolders');
        let stat;
        try {
            stat = await this.fileService.resolve(this.extensionsScannerService.userExtensionsLocation);
        }
        catch (error) {
            if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                this.logService.error(error);
            }
            return;
        }
        if (!stat?.children) {
            return;
        }
        try {
            await Promise.allSettled(stat.children.map(async (child) => {
                if (!child.isDirectory || !child.name.endsWith(DELETED_FOLDER_POSTFIX)) {
                    return;
                }
                this.logService.trace('Deleting the temporarily deleted folder', child.resource.toString());
                try {
                    await this.fileService.del(child.resource, { recursive: true });
                    this.logService.trace('Deleted the temporarily deleted folder', child.resource.toString());
                }
                catch (error) {
                    if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                        this.logService.error(error);
                    }
                }
            }));
        }
        catch (error) { /* ignore */ }
    }
};
ExtensionsScanner = __decorate([
    __param(1, IFileService),
    __param(2, IExtensionsScannerService),
    __param(3, IExtensionsProfileScannerService),
    __param(4, IUriIdentityService),
    __param(5, ITelemetryService),
    __param(6, ILogService)
], ExtensionsScanner);
export { ExtensionsScanner };
let InstallExtensionInProfileTask = class InstallExtensionInProfileTask extends AbstractExtensionTask {
    get operation() { return this.options.operation ?? this._operation; }
    get verificationStatus() { return this._verificationStatus; }
    constructor(extensionKey, manifest, source, options, extractExtensionFn, extensionsScanner, uriIdentityService, galleryService, userDataProfilesService, extensionsScannerService, extensionsProfileScannerService, logService) {
        super();
        this.extensionKey = extensionKey;
        this.manifest = manifest;
        this.source = source;
        this.options = options;
        this.extractExtensionFn = extractExtensionFn;
        this.extensionsScanner = extensionsScanner;
        this.uriIdentityService = uriIdentityService;
        this.galleryService = galleryService;
        this.userDataProfilesService = userDataProfilesService;
        this.extensionsScannerService = extensionsScannerService;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.logService = logService;
        this._operation = 2 /* InstallOperation.Install */;
        this.identifier = this.extensionKey.identifier;
    }
    async doRun(token) {
        const installed = await this.extensionsScanner.scanExtensions(1 /* ExtensionType.User */, this.options.profileLocation, this.options.productVersion);
        const existingExtension = installed.find(i => areSameExtensions(i.identifier, this.identifier));
        if (existingExtension) {
            this._operation = 3 /* InstallOperation.Update */;
        }
        const metadata = {
            isApplicationScoped: this.options.isApplicationScoped || existingExtension?.isApplicationScoped,
            isMachineScoped: this.options.isMachineScoped || existingExtension?.isMachineScoped,
            isBuiltin: this.options.isBuiltin || existingExtension?.isBuiltin,
            isSystem: existingExtension?.type === 0 /* ExtensionType.System */ ? true : undefined,
            installedTimestamp: Date.now(),
            pinned: this.options.installGivenVersion ? true : (this.options.pinned ?? existingExtension?.pinned),
            source: this.source instanceof URI ? 'vsix' : 'gallery',
        };
        let local;
        // VSIX
        if (this.source instanceof URI) {
            if (existingExtension) {
                if (this.extensionKey.equals(new ExtensionKey(existingExtension.identifier, existingExtension.manifest.version))) {
                    try {
                        await this.extensionsScanner.deleteExtension(existingExtension, 'existing');
                    }
                    catch (e) {
                        throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
                    }
                }
            }
            // Remove the extension with same version if it is already uninstalled.
            // Installing a VSIX extension shall replace the existing extension always.
            const existingWithSameVersion = await this.unsetIfRemoved(this.extensionKey);
            if (existingWithSameVersion) {
                try {
                    await this.extensionsScanner.deleteExtension(existingWithSameVersion, 'existing');
                }
                catch (e) {
                    throw new Error(nls.localize('restartCode', "Please restart VS Code before reinstalling {0}.", this.manifest.displayName || this.manifest.name));
                }
            }
        }
        // Gallery
        else {
            metadata.id = this.source.identifier.uuid;
            metadata.publisherId = this.source.publisherId;
            metadata.publisherDisplayName = this.source.publisherDisplayName;
            metadata.targetPlatform = this.source.properties.targetPlatform;
            metadata.updated = !!existingExtension;
            metadata.private = this.source.private;
            metadata.isPreReleaseVersion = this.source.properties.isPreReleaseVersion;
            metadata.hasPreReleaseVersion = existingExtension?.hasPreReleaseVersion || this.source.properties.isPreReleaseVersion;
            metadata.preRelease = isBoolean(this.options.preRelease)
                ? this.options.preRelease
                : this.options.installPreReleaseVersion || this.source.properties.isPreReleaseVersion || existingExtension?.preRelease;
            if (existingExtension && existingExtension.type !== 0 /* ExtensionType.System */ && existingExtension.manifest.version === this.source.version) {
                return this.extensionsScanner.updateMetadata(existingExtension, metadata, this.options.profileLocation);
            }
            // Unset if the extension is uninstalled and return the unset extension.
            local = await this.unsetIfRemoved(this.extensionKey);
        }
        if (token.isCancellationRequested) {
            throw toExtensionManagementError(new CancellationError());
        }
        if (!local) {
            const result = await this.extractExtensionFn(this.operation, token);
            local = result.local;
            this._verificationStatus = result.verificationStatus;
        }
        if (this.uriIdentityService.extUri.isEqual(this.userDataProfilesService.defaultProfile.extensionsResource, this.options.profileLocation)) {
            try {
                await this.extensionsScannerService.initializeDefaultProfileExtensions();
            }
            catch (error) {
                throw toExtensionManagementError(error, "IntializeDefaultProfile" /* ExtensionManagementErrorCode.IntializeDefaultProfile */);
            }
        }
        if (token.isCancellationRequested) {
            throw toExtensionManagementError(new CancellationError());
        }
        try {
            await this.extensionsProfileScannerService.addExtensionsToProfile([[local, metadata]], this.options.profileLocation, !local.isValid);
        }
        catch (error) {
            throw toExtensionManagementError(error, "AddToProfile" /* ExtensionManagementErrorCode.AddToProfile */);
        }
        const result = await this.extensionsScanner.scanLocalExtension(local.location, 1 /* ExtensionType.User */, this.options.profileLocation);
        if (!result) {
            throw new ExtensionManagementError('Cannot find the installed extension', "InstalledExtensionNotFound" /* ExtensionManagementErrorCode.InstalledExtensionNotFound */);
        }
        if (this.source instanceof URI) {
            this.updateMetadata(local, token);
        }
        return result;
    }
    async unsetIfRemoved(extensionKey) {
        // If the same version of extension is marked as removed, remove it from there and return the local.
        const [removed] = await this.extensionsScanner.unsetExtensionsForRemoval(extensionKey);
        if (removed) {
            this.logService.info('Removed the extension from removed list:', extensionKey.id);
            const userExtensions = await this.extensionsScanner.scanAllUserExtensions();
            return userExtensions.find(i => ExtensionKey.create(i).equals(extensionKey));
        }
        return undefined;
    }
    async updateMetadata(extension, token) {
        try {
            let [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id, version: extension.manifest.version }], token);
            if (!galleryExtension) {
                [galleryExtension] = await this.galleryService.getExtensions([{ id: extension.identifier.id }], token);
            }
            if (galleryExtension) {
                const metadata = {
                    id: galleryExtension.identifier.uuid,
                    publisherDisplayName: galleryExtension.publisherDisplayName,
                    publisherId: galleryExtension.publisherId,
                    isPreReleaseVersion: galleryExtension.properties.isPreReleaseVersion,
                    hasPreReleaseVersion: extension.hasPreReleaseVersion || galleryExtension.properties.isPreReleaseVersion,
                    preRelease: galleryExtension.properties.isPreReleaseVersion || this.options.installPreReleaseVersion
                };
                await this.extensionsScanner.updateMetadata(extension, metadata, this.options.profileLocation);
            }
        }
        catch (error) {
            /* Ignore Error */
        }
    }
};
InstallExtensionInProfileTask = __decorate([
    __param(6, IUriIdentityService),
    __param(7, IExtensionGalleryService),
    __param(8, IUserDataProfilesService),
    __param(9, IExtensionsScannerService),
    __param(10, IExtensionsProfileScannerService),
    __param(11, ILogService)
], InstallExtensionInProfileTask);
class UninstallExtensionInProfileTask extends AbstractExtensionTask {
    constructor(extension, options, extensionsProfileScannerService) {
        super();
        this.extension = extension;
        this.options = options;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
    }
    doRun(token) {
        return this.extensionsProfileScannerService.removeExtensionsFromProfile([this.extension.identifier], this.options.profileLocation);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L25vZGUvZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFDekIsT0FBTyxFQUFFLFFBQVEsRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUNoRSxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFHMUQsT0FBTyxFQUFFLGlCQUFpQixFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsSUFBSSxFQUFFLE1BQU0sOEJBQThCLENBQUM7QUFDcEQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxXQUFXLEVBQUUsV0FBVyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDdkUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBQzFELE9BQU8sS0FBSyxJQUFJLE1BQU0sOEJBQThCLENBQUM7QUFDckQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sS0FBSyxNQUFNLE1BQU0sdUNBQXVDLENBQUM7QUFDaEUsT0FBTyxFQUFFLFNBQVMsRUFBRSxTQUFTLEVBQUUsV0FBVyxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDbEYsT0FBTyxFQUFFLEdBQUcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQ2xELE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFB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