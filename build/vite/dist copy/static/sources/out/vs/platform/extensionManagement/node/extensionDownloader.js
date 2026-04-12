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
var ExtensionsDownloader_1;
import { Promises } from '../../../base/common/async.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import * as semver from '../../../base/common/semver/semver.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { Promises as FSPromises } from '../../../base/node/pfs.js';
import { buffer, CorruptZipMessage } from '../../../base/node/zip.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { toExtensionManagementError } from '../common/abstractExtensionManagementService.js';
import { ExtensionManagementError, ExtensionSignatureVerificationCode, IExtensionGalleryService } from '../common/extensionManagement.js';
import { ExtensionKey, groupByExtension } from '../common/extensionManagementUtil.js';
import { fromExtractError } from './extensionManagementUtil.js';
import { IExtensionSignatureVerificationService } from './extensionSignatureVerificationService.js';
import { IFileService, toFileOperationResult } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
let ExtensionsDownloader = class ExtensionsDownloader extends Disposable {
    static { ExtensionsDownloader_1 = this; }
    static { this.SignatureArchiveExtension = '.sigzip'; }
    constructor(environmentService, fileService, extensionGalleryService, extensionSignatureVerificationService, telemetryService, uriIdentityService, logService) {
        super();
        this.fileService = fileService;
        this.extensionGalleryService = extensionGalleryService;
        this.extensionSignatureVerificationService = extensionSignatureVerificationService;
        this.telemetryService = telemetryService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.extensionsDownloadDir = environmentService.extensionsDownloadLocation;
        this.extensionsTrashDir = uriIdentityService.extUri.joinPath(environmentService.extensionsDownloadLocation, `.trash`);
        this.cache = 20; // Cache 20 downloaded VSIX files
        this.cleanUpPromise = this.cleanUp();
    }
    async download(extension, operation, verifySignature, clientTargetPlatform) {
        await this.cleanUpPromise;
        const location = await this.downloadVSIX(extension, operation);
        if (!verifySignature) {
            return { location, verificationStatus: undefined };
        }
        if (!extension.isSigned) {
            return { location, verificationStatus: ExtensionSignatureVerificationCode.NotSigned };
        }
        let signatureArchiveLocation;
        try {
            signatureArchiveLocation = await this.downloadSignatureArchive(extension);
            const verificationStatus = (await this.extensionSignatureVerificationService.verify(extension.identifier.id, extension.version, location.fsPath, signatureArchiveLocation.fsPath, clientTargetPlatform))?.code;
            if (verificationStatus === ExtensionSignatureVerificationCode.PackageIsInvalidZip || verificationStatus === ExtensionSignatureVerificationCode.SignatureArchiveIsInvalidZip) {
                try {
                    // Delete the downloaded vsix if VSIX or signature archive is invalid
                    await this.delete(location);
                }
                catch (error) {
                    this.logService.error(error);
                }
                throw new ExtensionManagementError(CorruptZipMessage, "CorruptZip" /* ExtensionManagementErrorCode.CorruptZip */);
            }
            return { location, verificationStatus };
        }
        catch (error) {
            try {
                // Delete the downloaded VSIX if signature archive download fails
                await this.delete(location);
            }
            catch (error) {
                this.logService.error(error);
            }
            throw error;
        }
        finally {
            if (signatureArchiveLocation) {
                try {
                    // Delete signature archive always
                    await this.delete(signatureArchiveLocation);
                }
                catch (error) {
                    this.logService.error(error);
                }
            }
        }
    }
    async downloadVSIX(extension, operation) {
        try {
            const location = joinPath(this.extensionsDownloadDir, this.getName(extension));
            const attempts = await this.doDownload(extension, 'vsix', async () => {
                await this.downloadFile(extension, location, location => this.extensionGalleryService.download(extension, location, operation));
                try {
                    await this.validate(location.fsPath, 'extension/package.json');
                }
                catch (error) {
                    try {
                        await this.fileService.del(location);
                    }
                    catch (e) {
                        this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
                    }
                    throw error;
                }
            }, 2);
            if (attempts > 1) {
                this.telemetryService.publicLog2('extensiongallery:downloadvsix:retry', {
                    extensionId: extension.identifier.id,
                    attempts
                });
            }
            return location;
        }
        catch (e) {
            throw toExtensionManagementError(e, "Download" /* ExtensionManagementErrorCode.Download */);
        }
    }
    async downloadSignatureArchive(extension) {
        try {
            const location = joinPath(this.extensionsDownloadDir, `${this.getName(extension)}${ExtensionsDownloader_1.SignatureArchiveExtension}`);
            const attempts = await this.doDownload(extension, 'sigzip', async () => {
                await this.extensionGalleryService.downloadSignatureArchive(extension, location);
                try {
                    await this.validate(location.fsPath, '.signature.p7s');
                }
                catch (error) {
                    try {
                        await this.fileService.del(location);
                    }
                    catch (e) {
                        this.logService.warn(`Error while deleting: ${location.path}`, getErrorMessage(e));
                    }
                    throw error;
                }
            }, 2);
            if (attempts > 1) {
                this.telemetryService.publicLog2('extensiongallery:downloadsigzip:retry', {
                    extensionId: extension.identifier.id,
                    attempts
                });
            }
            return location;
        }
        catch (e) {
            throw toExtensionManagementError(e, "DownloadSignature" /* ExtensionManagementErrorCode.DownloadSignature */);
        }
    }
    async downloadFile(extension, location, downloadFn) {
        // Do not download if exists
        if (await this.fileService.exists(location)) {
            return;
        }
        // Download directly if locaiton is not file scheme
        if (location.scheme !== Schemas.file) {
            await downloadFn(location);
            return;
        }
        // Download to temporary location first only if file does not exist
        const tempLocation = joinPath(this.extensionsDownloadDir, `.${generateUuid()}`);
        try {
            await downloadFn(tempLocation);
        }
        catch (error) {
            try {
                await this.fileService.del(tempLocation);
            }
            catch (e) { /* ignore */ }
            throw error;
        }
        try {
            // Rename temp location to original
            await FSPromises.rename(tempLocation.fsPath, location.fsPath, 2 * 60 * 1000 /* Retry for 2 minutes */);
        }
        catch (error) {
            try {
                await this.fileService.del(tempLocation);
            }
            catch (e) { /* ignore */ }
            let exists = false;
            try {
                exists = await this.fileService.exists(location);
            }
            catch (e) { /* ignore */ }
            if (exists) {
                this.logService.info(`Rename failed because the file was downloaded by another source. So ignoring renaming.`, extension.identifier.id, location.path);
            }
            else {
                this.logService.info(`Rename failed because of ${getErrorMessage(error)}. Deleted the file from downloaded location`, tempLocation.path);
                throw error;
            }
        }
    }
    async doDownload(extension, name, downloadFn, retries) {
        let attempts = 1;
        while (true) {
            try {
                await downloadFn();
                return attempts;
            }
            catch (e) {
                if (attempts++ > retries) {
                    throw e;
                }
                this.logService.warn(`Failed downloading ${name}. ${getErrorMessage(e)}. Retry again...`, extension.identifier.id);
            }
        }
    }
    async validate(zipPath, filePath) {
        try {
            await buffer(zipPath, filePath);
        }
        catch (e) {
            throw fromExtractError(e);
        }
    }
    async delete(location) {
        await this.cleanUpPromise;
        const trashRelativePath = this.uriIdentityService.extUri.relativePath(this.extensionsDownloadDir, location);
        if (trashRelativePath) {
            await this.fileService.move(location, this.uriIdentityService.extUri.joinPath(this.extensionsTrashDir, trashRelativePath), true);
        }
        else {
            await this.fileService.del(location);
        }
    }
    async cleanUp() {
        try {
            if (!(await this.fileService.exists(this.extensionsDownloadDir))) {
                this.logService.trace('Extension VSIX downloads cache dir does not exist');
                return;
            }
            try {
                await this.fileService.del(this.extensionsTrashDir, { recursive: true });
            }
            catch (error) {
                if (toFileOperationResult(error) !== 1 /* FileOperationResult.FILE_NOT_FOUND */) {
                    this.logService.error(error);
                }
            }
            const folderStat = await this.fileService.resolve(this.extensionsDownloadDir, { resolveMetadata: true });
            if (folderStat.children) {
                const toDelete = [];
                const vsixs = [];
                const signatureArchives = [];
                for (const stat of folderStat.children) {
                    if (stat.name.endsWith(ExtensionsDownloader_1.SignatureArchiveExtension)) {
                        signatureArchives.push(stat.resource);
                    }
                    else {
                        const extension = ExtensionKey.parse(stat.name);
                        if (extension) {
                            vsixs.push([extension, stat]);
                        }
                    }
                }
                const byExtension = groupByExtension(vsixs, ([extension]) => extension);
                const distinct = [];
                for (const p of byExtension) {
                    p.sort((a, b) => semver.rcompare(a[0].version, b[0].version));
                    toDelete.push(...p.slice(1).map(e => e[1].resource)); // Delete outdated extensions
                    distinct.push(p[0][1]);
                }
                distinct.sort((a, b) => a.mtime - b.mtime); // sort by modified time
                toDelete.push(...distinct.slice(0, Math.max(0, distinct.length - this.cache)).map(s => s.resource)); // Retain minimum cacheSize and delete the rest
                toDelete.push(...signatureArchives); // Delete all signature archives
                await Promises.settled(toDelete.map(resource => {
                    this.logService.trace('Deleting from cache', resource.path);
                    return this.fileService.del(resource);
                }));
            }
        }
        catch (e) {
            this.logService.error(e);
        }
    }
    getName(extension) {
        return ExtensionKey.create(extension).toString().toLowerCase();
    }
};
ExtensionsDownloader = ExtensionsDownloader_1 = __decorate([
    __param(0, INativeEnvironmentService),
    __param(1, IFileService),
    __param(2, IExtensionGalleryService),
    __param(3, IExtensionSignatureVerificationService),
    __param(4, ITelemetryService),
    __param(5, IUriIdentityService),
    __param(6, ILogService)
], ExtensionsDownloader);
export { ExtensionsDownloader };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uRG93bmxvYWRlci5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvbm9kZS9leHRlbnNpb25Eb3dubG9hZGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDMUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQzdELE9BQU8sS0FBSyxNQUFNLE1BQU0sdUNBQXVDLENBQUM7QUFFaEUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBRSxRQUFRLElBQUksVUFBVSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDbkUsT0FBTyxFQUFFLE1BQU0sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3RFLE9BQU8sRUFBRSx5QkFBeUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BGLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzdGLE9BQU8sRUFBRSx3QkFBd0IsRUFBZ0Msa0NBQWtDLEVBQUUsd0JBQXdCLEVBQXVDLE1BQU0sa0NBQWtDLENBQUM7QUFDN00sT0FBTyxFQUFFLFlBQVksRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQ2hFLE9BQU8sRUFB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