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
import { distinct, isNonEmptyArray } from '../../../base/common/arrays.js';
import { Barrier, createCancelablePromise } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { CancellationError, getErrorMessage, isCancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { isWeb } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import * as nls from '../../../nls.js';
import { ExtensionManagementError, IExtensionGalleryService, isTargetPlatformCompatible, TargetPlatformToString, EXTENSION_INSTALL_DEP_PACK_CONTEXT, ExtensionGalleryError, EXTENSION_INSTALL_SOURCE_CONTEXT, ExtensionSignatureVerificationCode, IAllowedExtensionsService } from './extensionManagement.js';
import { areSameExtensions, ExtensionKey, getGalleryExtensionId, getGalleryExtensionTelemetryData, getLocalExtensionTelemetryData, isMalicious } from './extensionManagementUtil.js';
import { isApplicationScopedExtension } from '../../extensions/common/extensions.js';
import { areApiProposalsCompatible } from '../../extensions/common/extensionValidator.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { MarkdownString } from '../../../base/common/htmlContent.js';
let CommontExtensionManagementService = class CommontExtensionManagementService extends Disposable {
    constructor(productService, allowedExtensionsService) {
        super();
        this.productService = productService;
        this.allowedExtensionsService = allowedExtensionsService;
        this.preferPreReleases = this.productService.quality !== 'stable';
    }
    async canInstall(extension) {
        const allowedToInstall = this.allowedExtensionsService.isAllowed({ id: extension.identifier.id, publisherDisplayName: extension.publisherDisplayName });
        if (allowedToInstall !== true) {
            return new MarkdownString(nls.localize('not allowed to install', "This extension cannot be installed because {0}", allowedToInstall.value));
        }
        if (!(await this.isExtensionPlatformCompatible(extension))) {
            const learnLink = isWeb ? 'https://aka.ms/vscode-web-extensions-guide' : 'https://aka.ms/vscode-platform-specific-extensions';
            return new MarkdownString(`${nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for the {2} platform.", extension.displayName ?? extension.identifier.id, this.productService.nameLong, TargetPlatformToString(await this.getTargetPlatform()))} [${nls.localize('learn why', "Learn Why")}](${learnLink})`);
        }
        return true;
    }
    async isExtensionPlatformCompatible(extension) {
        const currentTargetPlatform = await this.getTargetPlatform();
        return extension.allTargetPlatforms.some(targetPlatform => isTargetPlatformCompatible(targetPlatform, extension.allTargetPlatforms, currentTargetPlatform));
    }
};
CommontExtensionManagementService = __decorate([
    __param(0, IProductService),
    __param(1, IAllowedExtensionsService)
], CommontExtensionManagementService);
export { CommontExtensionManagementService };
let AbstractExtensionManagementService = class AbstractExtensionManagementService extends CommontExtensionManagementService {
    get onInstallExtension() { return this._onInstallExtension.event; }
    get onDidInstallExtensions() { return this._onDidInstallExtensions.event; }
    get onUninstallExtension() { return this._onUninstallExtension.event; }
    get onDidUninstallExtension() { return this._onDidUninstallExtension.event; }
    get onDidUpdateExtensionMetadata() { return this._onDidUpdateExtensionMetadata.event; }
    constructor(galleryService, telemetryService, uriIdentityService, logService, productService, allowedExtensionsService, userDataProfilesService) {
        super(productService, allowedExtensionsService);
        this.galleryService = galleryService;
        this.telemetryService = telemetryService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this.userDataProfilesService = userDataProfilesService;
        this.lastReportTimestamp = 0;
        this.installingExtensions = new Map();
        this.uninstallingExtensions = new Map();
        this._onInstallExtension = this._register(new Emitter());
        this._onDidInstallExtensions = this._register(new Emitter());
        this._onUninstallExtension = this._register(new Emitter());
        this._onDidUninstallExtension = this._register(new Emitter());
        this._onDidUpdateExtensionMetadata = this._register(new Emitter());
        this.participants = [];
        this._register(toDisposable(() => {
            this.installingExtensions.forEach(({ task }) => task.cancel());
            this.uninstallingExtensions.forEach(promise => promise.cancel());
            this.installingExtensions.clear();
            this.uninstallingExtensions.clear();
        }));
    }
    async installFromGallery(extension, options = {}) {
        try {
            const results = await this.installGalleryExtensions([{ extension, options }]);
            const result = results.find(({ identifier }) => areSameExtensions(identifier, extension.identifier));
            if (result?.local) {
                return result.local;
            }
            if (result?.error) {
                throw result.error;
            }
            // Extension might have been redirected due to deprecation (e.g., github.copilot -> github.copilot-chat)
            // In this case, the result will have the redirected extension's identifier
            const redirectedResult = results[0];
            if (redirectedResult?.local) {
                return redirectedResult.local;
            }
            if (redirectedResult?.error) {
                throw redirectedResult.error;
            }
            throw new ExtensionManagementError(`Unknown error while installing extension ${extension.identifier.id}`, "Unknown" /* ExtensionManagementErrorCode.Unknown */);
        }
        catch (error) {
            throw toExtensionManagementError(error);
        }
    }
    async installGalleryExtensions(extensions) {
        if (!this.galleryService.isEnabled()) {
            throw new ExtensionManagementError(nls.localize('MarketPlaceDisabled', "Marketplace is not enabled"), "NotAllowed" /* ExtensionManagementErrorCode.NotAllowed */);
        }
        const results = [];
        const installableExtensions = [];
        await Promise.allSettled(extensions.map(async ({ extension, options }) => {
            try {
                const compatible = await this.checkAndGetCompatibleVersion(extension, !!options?.installGivenVersion, !!options?.installPreReleaseVersion, options.productVersion ?? { version: this.productService.version, date: this.productService.date });
                installableExtensions.push({ ...compatible, options });
            }
            catch (error) {
                results.push({ identifier: extension.identifier, operation: 2 /* InstallOperation.Install */, source: extension, error, profileLocation: options.profileLocation ?? this.getCurrentExtensionsManifestLocation() });
            }
        }));
        if (installableExtensions.length) {
            results.push(...await this.installExtensions(installableExtensions));
        }
        return results;
    }
    async uninstall(extension, options) {
        this.logService.trace('ExtensionManagementService#uninstall', extension.identifier.id);
        return this.uninstallExtensions([{ extension, options }]);
    }
    async toggleApplicationScope(extension, fromProfileLocation) {
        if (isApplicationScopedExtension(extension.manifest) || extension.isBuiltin) {
            return extension;
        }
        if (extension.isApplicationScoped) {
            let local = await this.updateMetadata(extension, { isApplicationScoped: false }, this.userDataProfilesService.defaultProfile.extensionsResource);
            if (!this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)) {
                local = await this.copyExtension(extension, this.userDataProfilesService.defaultProfile.extensionsResource, fromProfileLocation);
            }
            for (const profile of this.userDataProfilesService.profiles) {
                const existing = (await this.getInstalled(1 /* ExtensionType.User */, profile.extensionsResource))
                    .find(e => areSameExtensions(e.identifier, extension.identifier));
                if (existing) {
                    this._onDidUpdateExtensionMetadata.fire({ local: existing, profileLocation: profile.extensionsResource });
                }
                else {
                    this._onDidUninstallExtension.fire({ identifier: extension.identifier, profileLocation: profile.extensionsResource });
                }
            }
            return local;
        }
        else {
            const local = this.uriIdentityService.extUri.isEqual(fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource)
                ? await this.updateMetadata(extension, { isApplicationScoped: true }, this.userDataProfilesService.defaultProfile.extensionsResource)
                : await this.copyExtension(extension, fromProfileLocation, this.userDataProfilesService.defaultProfile.extensionsResource, { isApplicationScoped: true });
            this._onDidInstallExtensions.fire([{ identifier: local.identifier, operation: 2 /* InstallOperation.Install */, local, profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource, applicationScoped: true }]);
            return local;
        }
    }
    getExtensionsControlManifest() {
        const now = new Date().getTime();
        if (!this.extensionsControlManifest || now - this.lastReportTimestamp > 1000 * 60 * 5) { // 5 minute cache freshness
            this.extensionsControlManifest = this.updateControlCache();
            this.lastReportTimestamp = now;
        }
        return this.extensionsControlManifest;
    }
    registerParticipant(participant) {
        this.participants.push(participant);
    }
    async resetPinnedStateForAllUserExtensions(pinned) {
        try {
            await this.joinAllSettled(this.userDataProfilesService.profiles.map(async (profile) => {
                const extensions = await this.getInstalled(1 /* ExtensionType.User */, profile.extensionsResource);
                await this.joinAllSettled(extensions.map(async (extension) => {
                    if (extension.pinned !== pinned) {
                        await this.updateMetadata(extension, { pinned }, profile.extensionsResource);
                    }
                }));
            }));
        }
        catch (error) {
            this.logService.error('Error while resetting pinned state for all user extensions', getErrorMessage(error));
            throw error;
        }
    }
    async installExtensions(extensions) {
        const installExtensionResultsMap = new Map();
        const installingExtensionsMap = new Map();
        const alreadyRequestedInstallations = [];
        const getInstallExtensionTaskKey = (extension, profileLocation) => `${ExtensionKey.create(extension).toString()}-${profileLocation.toString()}`;
        const createInstallExtensionTask = (manifest, extension, options, root) => {
            let uninstallTaskToWaitFor;
            if (!URI.isUri(extension)) {
                if (installingExtensionsMap.has(`${extension.identifier.id.toLowerCase()}-${options.profileLocation.toString()}`)) {
                    return;
                }
                const existingInstallingExtension = this.installingExtensions.get(getInstallExtensionTaskKey(extension, options.profileLocation));
                if (existingInstallingExtension) {
                    if (root && this.canWaitForTask(root, existingInstallingExtension.task)) {
                        const identifier = existingInstallingExtension.task.identifier;
                        this.logService.info('Waiting for already requested installing extension', identifier.id, root.identifier.id, options.profileLocation.toString());
                        existingInstallingExtension.waitingTasks.push(root);
                        // add promise that waits until the extension is completely installed, ie., onDidInstallExtensions event is triggered for this extension
                        alreadyRequestedInstallations.push(Event.toPromise(Event.filter(this.onDidInstallExtensions, results => results.some(result => areSameExtensions(result.identifier, identifier)))).then(results => {
                            this.logService.info('Finished waiting for already requested installing extension', identifier.id, root.identifier.id, options.profileLocation.toString());
                            const result = results.find(result => areSameExtensions(result.identifier, identifier));
                            if (!result?.local) {
                                // Extension failed to install
                                throw new Error(`Extension ${identifier.id} is not installed`);
                            }
                            return result.local;
                        }));
                    }
                    return;
                }
                uninstallTaskToWaitFor = this.uninstallingExtensions.get(this.getUninstallExtensionTaskKey(extension.identifier, options.profileLocation));
            }
            const installExtensionTask = this.createInstallExtensionTask(manifest, extension, options);
            const key = `${getGalleryExtensionId(manifest.publisher, manifest.name)}-${options.profileLocation.toString()}`;
            installingExtensionsMap.set(key, { task: installExtensionTask, root, uninstallTaskToWaitFor });
            this._onInstallExtension.fire({ identifier: installExtensionTask.identifier, source: extension, profileLocation: options.profileLocation });
            this.logService.info('Installing extension:', installExtensionTask.identifier.id, options);
            // only cache gallery extensions tasks
            if (!URI.isUri(extension)) {
                this.installingExtensions.set(getInstallExtensionTaskKey(extension, options.profileLocation), { task: installExtensionTask, waitingTasks: [] });
            }
        };
        try {
            // Start installing extensions
            for (const { manifest, extension, options } of extensions) {
                const isApplicationScoped = options.isApplicationScoped || options.isBuiltin || isApplicationScopedExtension(manifest);
                const installExtensionTaskOptions = {
                    ...options,
                    isApplicationScoped,
                    profileLocation: isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options.profileLocation ?? this.getCurrentExtensionsManifestLocation(),
                    productVersion: options.productVersion ?? { version: this.productService.version, date: this.productService.date }
                };
                const existingInstallExtensionTask = !URI.isUri(extension) ? this.installingExtensions.get(getInstallExtensionTaskKey(extension, installExtensionTaskOptions.profileLocation)) : undefined;
                if (existingInstallExtensionTask) {
                    this.logService.info('Extension is already requested to install', existingInstallExtensionTask.task.identifier.id, installExtensionTaskOptions.profileLocation.toString());
                    alreadyRequestedInstallations.push(existingInstallExtensionTask.task.waitUntilTaskIsFinished());
                }
                else {
                    createInstallExtensionTask(manifest, extension, installExtensionTaskOptions, undefined);
                }
            }
            // collect and start installing all dependencies and pack extensions
            await Promise.all([...installingExtensionsMap.values()].map(async ({ task }) => {
                if (task.options.donotIncludePackAndDependencies) {
                    this.logService.info('Installing the extension without checking dependencies and pack', task.identifier.id);
                }
                else {
                    try {
                        let preferPreRelease = this.preferPreReleases;
                        if (task.options.installPreReleaseVersion) {
                            preferPreRelease = true;
                        }
                        else if (!URI.isUri(task.source) && task.source.hasPreReleaseVersion) {
                            // Explicitly asked to install the release version
                            preferPreRelease = false;
                        }
                        const installed = await this.getInstalled(undefined, task.options.profileLocation, task.options.productVersion);
                        const allDepsAndPackExtensionsToInstall = await this.getAllDepsAndPackExtensions(task.identifier, task.manifest, preferPreRelease, task.options.productVersion, installed);
                        const options = { ...task.options, pinned: false, installGivenVersion: false, context: { ...task.options.context, [EXTENSION_INSTALL_DEP_PACK_CONTEXT]: true } };
                        for (const { gallery, manifest } of distinct(allDepsAndPackExtensionsToInstall, ({ gallery }) => gallery.identifier.id)) {
                            const existing = installed.find(e => areSameExtensions(e.identifier, gallery.identifier));
                            // Skip if the extension is already installed and has the same application scope
                            if (existing && existing.isApplicationScoped === !!options.isApplicationScoped) {
                                continue;
                            }
                            createInstallExtensionTask(manifest, gallery, options, task);
                        }
                    }
                    catch (error) {
                        // Installing through VSIX
                        if (URI.isUri(task.source)) {
                            // Ignore installing dependencies and packs
                            if (isNonEmptyArray(task.manifest.extensionDependencies)) {
                                this.logService.warn(`Cannot install dependencies of extension:`, task.identifier.id, error.message);
                            }
                            if (isNonEmptyArray(task.manifest.extensionPack)) {
                                this.logService.warn(`Cannot install packed extensions of extension:`, task.identifier.id, error.message);
                            }
                        }
                        else {
                            this.logService.error('Error while preparing to install dependencies and extension packs of the extension:', task.identifier.id);
                            throw error;
                        }
                    }
                }
            }));
            const otherProfilesToUpdate = await this.getOtherProfilesToUpdateExtension([...installingExtensionsMap.values()].map(({ task }) => task));
            for (const [profileLocation, task] of otherProfilesToUpdate) {
                createInstallExtensionTask(task.manifest, task.source, { ...task.options, profileLocation }, undefined);
            }
            // Install extensions in parallel and wait until all extensions are installed / failed
            await this.joinAllSettled([...installingExtensionsMap.entries()].map(async ([key, { task, uninstallTaskToWaitFor }]) => {
                const startTime = new Date().getTime();
                let local;
                try {
                    if (uninstallTaskToWaitFor) {
                        this.logService.info('Waiting for existing uninstall task to complete before installing', task.identifier.id);
                        try {
                            await uninstallTaskToWaitFor.waitUntilTaskIsFinished();
                            this.logService.info('Finished waiting for uninstall task, proceeding with install', task.identifier.id);
                        }
                        catch (error) {
                            this.logService.info('Uninstall task failed, proceeding with install anyway', task.identifier.id, getErrorMessage(error));
                        }
                    }
                    local = await task.run();
                    await this.joinAllSettled(this.participants.map(participant => participant.postInstall(local, task.source, task.options, CancellationToken.None)), "PostInstall" /* ExtensionManagementErrorCode.PostInstall */);
                }
                catch (e) {
                    const error = toExtensionManagementError(e);
                    if (!URI.isUri(task.source)) {
                        reportTelemetry(this.telemetryService, task.operation === 3 /* InstallOperation.Update */ ? 'extensionGallery:update' : 'extensionGallery:install', {
                            extensionData: getGalleryExtensionTelemetryData(task.source),
                            error,
                            source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
                        });
                    }
                    installExtensionResultsMap.set(key, { error, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: task.options.isApplicationScoped });
                    this.logService.error('Error while installing the extension', task.identifier.id, getErrorMessage(error), task.options.profileLocation.toString());
                    throw error;
                }
                if (!URI.isUri(task.source)) {
                    const isUpdate = task.operation === 3 /* InstallOperation.Update */;
                    const durationSinceUpdate = isUpdate ? undefined : (new Date().getTime() - task.source.lastUpdated) / 1000;
                    reportTelemetry(this.telemetryService, isUpdate ? 'extensionGallery:update' : 'extensionGallery:install', {
                        extensionData: getGalleryExtensionTelemetryData(task.source),
                        verificationStatus: task.verificationStatus,
                        duration: new Date().getTime() - startTime,
                        durationSinceUpdate,
                        source: task.options.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT]
                    });
                }
                installExtensionResultsMap.set(key, { local, identifier: task.identifier, operation: task.operation, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, applicationScoped: local.isApplicationScoped });
            }));
            if (alreadyRequestedInstallations.length) {
                await this.joinAllSettled(alreadyRequestedInstallations);
            }
        }
        catch (error) {
            const getAllDepsAndPacks = (extension, profileLocation, allDepsOrPacks) => {
                const depsOrPacks = [];
                if (extension.manifest.extensionDependencies?.length) {
                    depsOrPacks.push(...extension.manifest.extensionDependencies);
                }
                if (extension.manifest.extensionPack?.length) {
                    depsOrPacks.push(...extension.manifest.extensionPack);
                }
                for (const id of depsOrPacks) {
                    if (allDepsOrPacks.includes(id.toLowerCase())) {
                        continue;
                    }
                    allDepsOrPacks.push(id.toLowerCase());
                    const installed = installExtensionResultsMap.get(`${id.toLowerCase()}-${profileLocation.toString()}`);
                    if (installed?.local) {
                        allDepsOrPacks = getAllDepsAndPacks(installed.local, profileLocation, allDepsOrPacks);
                    }
                }
                return allDepsOrPacks;
            };
            const getErrorResult = (task) => ({ identifier: task.identifier, operation: 2 /* InstallOperation.Install */, source: task.source, context: task.options.context, profileLocation: task.options.profileLocation, error });
            const rollbackTasks = [];
            for (const [key, { task, root }] of installingExtensionsMap) {
                const result = installExtensionResultsMap.get(key);
                if (!result) {
                    task.cancel();
                    installExtensionResultsMap.set(key, getErrorResult(task));
                }
                // If the extension is installed by a root task and the root task is failed, then uninstall the extension
                else if (result.local && root && !installExtensionResultsMap.get(`${root.identifier.id.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local) {
                    rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
                    installExtensionResultsMap.set(key, getErrorResult(task));
                }
            }
            for (const [key, { task }] of installingExtensionsMap) {
                const result = installExtensionResultsMap.get(key);
                if (!result?.local) {
                    continue;
                }
                if (task.options.donotIncludePackAndDependencies) {
                    continue;
                }
                const depsOrPacks = getAllDepsAndPacks(result.local, task.options.profileLocation, [result.local.identifier.id.toLowerCase()]).slice(1);
                if (depsOrPacks.some(depOrPack => installingExtensionsMap.has(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`) && !installExtensionResultsMap.get(`${depOrPack.toLowerCase()}-${task.options.profileLocation.toString()}`)?.local)) {
                    rollbackTasks.push(this.createUninstallExtensionTask(result.local, { versionOnly: true, profileLocation: task.options.profileLocation }));
                    installExtensionResultsMap.set(key, getErrorResult(task));
                }
            }
            if (rollbackTasks.length) {
                await Promise.allSettled(rollbackTasks.map(async (rollbackTask) => {
                    try {
                        await rollbackTask.run();
                        this.logService.info('Rollback: Uninstalled extension', rollbackTask.extension.identifier.id);
                    }
                    catch (error) {
                        this.logService.warn('Rollback: Error while uninstalling extension', rollbackTask.extension.identifier.id, getErrorMessage(error));
                    }
                }));
            }
        }
        finally {
            // Finally, remove all the tasks from the cache
            for (const { task } of installingExtensionsMap.values()) {
                if (task.source && !URI.isUri(task.source)) {
                    this.installingExtensions.delete(getInstallExtensionTaskKey(task.source, task.options.profileLocation));
                }
            }
        }
        const results = [...installExtensionResultsMap.values()];
        for (const result of results) {
            if (result.local) {
                this.logService.info(`Extension installed successfully:`, result.identifier.id, result.profileLocation.toString());
            }
        }
        this._onDidInstallExtensions.fire(results);
        return results;
    }
    async getOtherProfilesToUpdateExtension(tasks) {
        const otherProfilesToUpdate = [];
        const profileExtensionsCache = new ResourceMap();
        for (const task of tasks) {
            if (task.operation !== 3 /* InstallOperation.Update */
                || task.options.isApplicationScoped
                || task.options.pinned
                || task.options.installGivenVersion
                || URI.isUri(task.source)) {
                continue;
            }
            for (const profile of this.userDataProfilesService.profiles) {
                if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, task.options.profileLocation)) {
                    continue;
                }
                let installedExtensions = profileExtensionsCache.get(profile.extensionsResource);
                if (!installedExtensions) {
                    installedExtensions = await this.getInstalled(1 /* ExtensionType.User */, profile.extensionsResource);
                    profileExtensionsCache.set(profile.extensionsResource, installedExtensions);
                }
                const installedExtension = installedExtensions.find(e => areSameExtensions(e.identifier, task.identifier));
                if (installedExtension && !installedExtension.pinned) {
                    otherProfilesToUpdate.push([profile.extensionsResource, task]);
                }
            }
        }
        return otherProfilesToUpdate;
    }
    canWaitForTask(taskToWait, taskToWaitFor) {
        for (const [, { task, waitingTasks }] of this.installingExtensions.entries()) {
            if (task === taskToWait) {
                // Cannot be waited, If taskToWaitFor is waiting for taskToWait
                if (waitingTasks.includes(taskToWaitFor)) {
                    return false;
                }
                // Cannot be waited, If taskToWaitFor is waiting for tasks waiting for taskToWait
                if (waitingTasks.some(waitingTask => this.canWaitForTask(waitingTask, taskToWaitFor))) {
                    return false;
                }
            }
            // Cannot be waited, if the taskToWait cannot be waited for the task created the taskToWaitFor
            // Because, the task waits for the tasks it created
            if (task === taskToWaitFor && waitingTasks[0] && !this.canWaitForTask(taskToWait, waitingTasks[0])) {
                return false;
            }
        }
        return true;
    }
    async joinAllSettled(promises, errorCode) {
        const results = [];
        const errors = [];
        const promiseResults = await Promise.allSettled(promises);
        for (const r of promiseResults) {
            if (r.status === 'fulfilled') {
                results.push(r.value);
            }
            else {
                errors.push(toExtensionManagementError(r.reason, errorCode));
            }
        }
        if (!errors.length) {
            return results;
        }
        // Throw if there are errors
        if (errors.length === 1) {
            throw errors[0];
        }
        let error = new ExtensionManagementError('', "Unknown" /* ExtensionManagementErrorCode.Unknown */);
        for (const current of errors) {
            error = new ExtensionManagementError(error.message ? `${error.message}, ${current.message}` : current.message, current.code !== "Unknown" /* ExtensionManagementErrorCode.Unknown */ && current.code !== "Internal" /* ExtensionManagementErrorCode.Internal */ ? current.code : error.code);
        }
        throw error;
    }
    async getAllDepsAndPackExtensions(extensionIdentifier, manifest, preferPreRelease, productVersion, installed) {
        if (!this.galleryService.isEnabled()) {
            return [];
        }
        const knownIdentifiers = [];
        const allDependenciesAndPacks = [];
        const collectDependenciesAndPackExtensionsToInstall = async (extensionIdentifier, manifest) => {
            knownIdentifiers.push(extensionIdentifier);
            const dependecies = manifest.extensionDependencies ? manifest.extensionDependencies.filter(dep => !installed.some(e => areSameExtensions(e.identifier, { id: dep }))) : [];
            const dependenciesAndPackExtensions = [...dependecies];
            if (manifest.extensionPack) {
                const existing = installed.find(e => areSameExtensions(e.identifier, extensionIdentifier));
                for (const extension of manifest.extensionPack) {
                    // add only those extensions which are new in currently installed extension
                    if (!(existing && existing.manifest.extensionPack && existing.manifest.extensionPack.some(old => areSameExtensions({ id: old }, { id: extension })))) {
                        if (dependenciesAndPackExtensions.every(e => !areSameExtensions({ id: e }, { id: extension }))) {
                            dependenciesAndPackExtensions.push(extension);
                        }
                    }
                }
            }
            if (dependenciesAndPackExtensions.length) {
                // filter out known extensions
                const ids = dependenciesAndPackExtensions.filter(id => knownIdentifiers.every(galleryIdentifier => !areSameExtensions(galleryIdentifier, { id })));
                if (ids.length) {
                    const galleryExtensions = await this.galleryService.getExtensions(ids.map(id => ({ id, preRelease: preferPreRelease })), CancellationToken.None);
                    for (const galleryExtension of galleryExtensions) {
                        if (knownIdentifiers.find(identifier => areSameExtensions(identifier, galleryExtension.identifier))) {
                            continue;
                        }
                        const isDependency = dependecies.some(id => areSameExtensions({ id }, galleryExtension.identifier));
                        let compatible;
                        try {
                            compatible = await this.checkAndGetCompatibleVersion(galleryExtension, false, preferPreRelease, productVersion);
                        }
                        catch (error) {
                            if (!isDependency) {
                                this.logService.info('Skipping the packed extension as it cannot be installed', galleryExtension.identifier.id, getErrorMessage(error));
                                continue;
                            }
                            else {
                                throw error;
                            }
                        }
                        allDependenciesAndPacks.push({ gallery: compatible.extension, manifest: compatible.manifest });
                        await collectDependenciesAndPackExtensionsToInstall(compatible.extension.identifier, compatible.manifest);
                    }
                }
            }
        };
        await collectDependenciesAndPackExtensionsToInstall(extensionIdentifier, manifest);
        return allDependenciesAndPacks;
    }
    async checkAndGetCompatibleVersion(extension, sameVersion, installPreRelease, productVersion) {
        let compatibleExtension;
        const extensionsControlManifest = await this.getExtensionsControlManifest();
        if (isMalicious(extension.identifier, extensionsControlManifest.malicious)) {
            throw new ExtensionManagementError(nls.localize('malicious extension', "Can't install '{0}' extension since it was reported to be problematic.", extension.identifier.id), "Malicious" /* ExtensionManagementErrorCode.Malicious */);
        }
        const deprecationInfo = extensionsControlManifest.deprecated[extension.identifier.id.toLowerCase()];
        if (deprecationInfo?.extension?.autoMigrate) {
            this.logService.info(`The '${extension.identifier.id}' extension is deprecated, fetching the compatible '${deprecationInfo.extension.id}' extension instead.`);
            compatibleExtension = (await this.galleryService.getExtensions([{ id: deprecationInfo.extension.id, preRelease: deprecationInfo.extension.preRelease }], { targetPlatform: await this.getTargetPlatform(), compatible: true, productVersion }, CancellationToken.None))[0];
            if (!compatibleExtension) {
                throw new ExtensionManagementError(nls.localize('notFoundDeprecatedReplacementExtension', "Can't install '{0}' extension since it was deprecated and the replacement extension '{1}' can't be found.", extension.identifier.id, deprecationInfo.extension.id), "Deprecated" /* ExtensionManagementErrorCode.Deprecated */);
            }
        }
        else {
            if (await this.canInstall(extension) !== true) {
                const targetPlatform = await this.getTargetPlatform();
                throw new ExtensionManagementError(nls.localize('incompatible platform', "The '{0}' extension is not available in {1} for the {2} platform.", extension.identifier.id, this.productService.nameLong, TargetPlatformToString(targetPlatform)), "IncompatibleTargetPlatform" /* ExtensionManagementErrorCode.IncompatibleTargetPlatform */);
            }
            compatibleExtension = await this.getCompatibleVersion(extension, sameVersion, installPreRelease, productVersion);
            if (!compatibleExtension) {
                const incompatibleApiProposalsMessages = [];
                if (!areApiProposalsCompatible(extension.properties.enabledApiProposals ?? [], incompatibleApiProposalsMessages)) {
                    throw new ExtensionManagementError(nls.localize('incompatibleAPI', "Can't install '{0}' extension. {1}", extension.displayName ?? extension.identifier.id, incompatibleApiProposalsMessages[0]), "IncompatibleApi" /* ExtensionManagementErrorCode.IncompatibleApi */);
                }
                /** If no compatible release version is found, check if the extension has a release version or not and throw relevant error */
                if (!installPreRelease && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion && (await this.galleryService.getExtensions([extension.identifier], CancellationToken.None))[0]) {
                    throw new ExtensionManagementError(nls.localize('notFoundReleaseExtension', "Can't install release version of '{0}' extension because it has no release version.", extension.displayName ?? extension.identifier.id), "ReleaseVersionNotFound" /* ExtensionManagementErrorCode.ReleaseVersionNotFound */);
                }
                throw new ExtensionManagementError(nls.localize('notFoundCompatibleDependency', "Can't install '{0}' extension because it is not compatible with the current version of {1} (version {2}).", extension.identifier.id, this.productService.nameLong, this.productService.version), "Incompatible" /* ExtensionManagementErrorCode.Incompatible */);
            }
        }
        this.logService.info('Getting Manifest...', compatibleExtension.identifier.id);
        const manifest = await this.galleryService.getManifest(compatibleExtension, CancellationToken.None);
        if (manifest === null) {
            throw new ExtensionManagementError(`Missing manifest for extension ${compatibleExtension.identifier.id}`, "Invalid" /* ExtensionManagementErrorCode.Invalid */);
        }
        if (manifest.version !== compatibleExtension.version) {
            throw new ExtensionManagementError(`Cannot install '${compatibleExtension.identifier.id}' extension because of version mismatch in Marketplace`, "Invalid" /* ExtensionManagementErrorCode.Invalid */);
        }
        return { extension: compatibleExtension, manifest };
    }
    async getCompatibleVersion(extension, sameVersion, includePreRelease, productVersion) {
        const targetPlatform = await this.getTargetPlatform();
        let compatibleExtension = null;
        if (!sameVersion && extension.hasPreReleaseVersion && extension.properties.isPreReleaseVersion !== includePreRelease) {
            compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, preRelease: includePreRelease }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
        }
        if (!compatibleExtension && await this.galleryService.isExtensionCompatible(extension, includePreRelease, targetPlatform, productVersion)) {
            compatibleExtension = extension;
        }
        if (!compatibleExtension) {
            if (sameVersion) {
                compatibleExtension = (await this.galleryService.getExtensions([{ ...extension.identifier, version: extension.version }], { targetPlatform, compatible: true, productVersion }, CancellationToken.None))[0] || null;
            }
            else {
                compatibleExtension = await this.galleryService.getCompatibleExtension(extension, includePreRelease, targetPlatform, productVersion);
            }
        }
        return compatibleExtension;
    }
    getUninstallExtensionTaskKey(identifier, profileLocation, version) {
        return `${identifier.id.toLowerCase()}${version ? `-${version}` : ''}@${profileLocation.toString()}`;
    }
    async uninstallExtensions(extensions) {
        const getUninstallExtensionTaskKey = (extension, uninstallOptions) => this.getUninstallExtensionTaskKey(extension.identifier, uninstallOptions.profileLocation, uninstallOptions.versionOnly ? extension.manifest.version : undefined);
        const createUninstallExtensionTask = (extension, uninstallOptions) => {
            let installTaskToWaitFor;
            for (const { task } of this.installingExtensions.values()) {
                if (!(task.source instanceof URI) && areSameExtensions(task.identifier, extension.identifier) && this.uriIdentityService.extUri.isEqual(task.options.profileLocation, uninstallOptions.profileLocation)) {
                    installTaskToWaitFor = task;
                    break;
                }
            }
            const task = this.createUninstallExtensionTask(extension, uninstallOptions);
            this.uninstallingExtensions.set(getUninstallExtensionTaskKey(task.extension, uninstallOptions), task);
            this.logService.info('Uninstalling extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
            this._onUninstallExtension.fire({ identifier: extension.identifier, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
            allTasks.push({ task, installTaskToWaitFor });
        };
        const postUninstallExtension = (extension, uninstallOptions, error) => {
            if (error) {
                this.logService.error('Failed to uninstall extension from the profile:', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString(), error.message);
            }
            else {
                this.logService.info('Successfully uninstalled extension from the profile', `${extension.identifier.id}@${extension.manifest.version}`, uninstallOptions.profileLocation.toString());
            }
            reportTelemetry(this.telemetryService, 'extensionGallery:uninstall', { extensionData: getLocalExtensionTelemetryData(extension), error });
            this._onDidUninstallExtension.fire({ identifier: extension.identifier, error: error?.code, profileLocation: uninstallOptions.profileLocation, applicationScoped: extension.isApplicationScoped });
        };
        const allTasks = [];
        const processedTasks = [];
        const alreadyRequestedUninstalls = [];
        const extensionsToRemove = [];
        const installedExtensionsMap = new ResourceMap();
        const getInstalledExtensions = async (profileLocation) => {
            let installed = installedExtensionsMap.get(profileLocation);
            if (!installed) {
                installedExtensionsMap.set(profileLocation, installed = await this.getInstalled(1 /* ExtensionType.User */, profileLocation));
            }
            return installed;
        };
        for (const { extension, options } of extensions) {
            const uninstallOptions = {
                ...options,
                profileLocation: extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : options?.profileLocation ?? this.getCurrentExtensionsManifestLocation()
            };
            const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(extension, uninstallOptions));
            if (uninstallExtensionTask) {
                this.logService.info('Extensions is already requested to uninstall', extension.identifier.id);
                alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
            }
            else {
                createUninstallExtensionTask(extension, uninstallOptions);
            }
            if (uninstallOptions.remove || extension.isApplicationScoped) {
                if (uninstallOptions.remove) {
                    extensionsToRemove.push(extension);
                }
                for (const profile of this.userDataProfilesService.profiles) {
                    if (this.uriIdentityService.extUri.isEqual(profile.extensionsResource, uninstallOptions.profileLocation)) {
                        continue;
                    }
                    const installed = await getInstalledExtensions(profile.extensionsResource);
                    const profileExtension = installed.find(e => areSameExtensions(e.identifier, extension.identifier));
                    if (profileExtension) {
                        const uninstallOptionsWithProfile = { ...uninstallOptions, profileLocation: profile.extensionsResource };
                        const uninstallExtensionTask = this.uninstallingExtensions.get(getUninstallExtensionTaskKey(profileExtension, uninstallOptionsWithProfile));
                        if (uninstallExtensionTask) {
                            this.logService.info('Extensions is already requested to uninstall', profileExtension.identifier.id);
                            alreadyRequestedUninstalls.push(uninstallExtensionTask.waitUntilTaskIsFinished());
                        }
                        else {
                            createUninstallExtensionTask(profileExtension, uninstallOptionsWithProfile);
                        }
                    }
                }
            }
        }
        try {
            for (const { task } of allTasks.slice(0)) {
                const installed = await getInstalledExtensions(task.options.profileLocation);
                if (task.options.donotIncludePack) {
                    this.logService.info('Uninstalling the extension without including packed extension', `${task.extension.identifier.id}@${task.extension.manifest.version}`);
                }
                else {
                    const packedExtensions = this.getAllPackExtensionsToUninstall(task.extension, installed);
                    for (const packedExtension of packedExtensions) {
                        if (this.uninstallingExtensions.has(getUninstallExtensionTaskKey(packedExtension, task.options))) {
                            this.logService.info('Extensions is already requested to uninstall', packedExtension.identifier.id);
                        }
                        else {
                            createUninstallExtensionTask(packedExtension, task.options);
                        }
                    }
                }
                if (task.options.donotCheckDependents) {
                    this.logService.info('Uninstalling the extension without checking dependents', `${task.extension.identifier.id}@${task.extension.manifest.version}`);
                }
                else {
                    this.checkForDependents(allTasks.map(({ task }) => task.extension), installed, task.extension);
                }
            }
            // Uninstall extensions in parallel and wait until all extensions are uninstalled / failed
            await this.joinAllSettled(allTasks.map(async ({ task, installTaskToWaitFor }) => {
                try {
                    // Wait for opposite task if it exists
                    if (installTaskToWaitFor) {
                        this.logService.info('Waiting for existing install task to complete before uninstalling', task.extension.identifier.id);
                        try {
                            await installTaskToWaitFor.waitUntilTaskIsFinished();
                            this.logService.info('Finished waiting for install task, proceeding with uninstall', task.extension.identifier.id);
                        }
                        catch (error) {
                            this.logService.info('Install task failed, proceeding with uninstall anyway', task.extension.identifier.id, getErrorMessage(error));
                        }
                    }
                    await task.run();
                    await this.joinAllSettled(this.participants.map(participant => participant.postUninstall(task.extension, task.options, CancellationToken.None)));
                    // only report if extension has a mapped gallery extension and not in web. UUID identifies the gallery extension.
                    if (task.extension.identifier.uuid && !isWeb) {
                        try {
                            await this.galleryService.reportStatistic(task.extension.manifest.publisher, task.extension.manifest.name, task.extension.manifest.version, "uninstall" /* StatisticType.Uninstall */);
                        }
                        catch (error) { /* ignore */ }
                    }
                }
                catch (e) {
                    const error = toExtensionManagementError(e);
                    postUninstallExtension(task.extension, task.options, error);
                    throw error;
                }
                finally {
                    processedTasks.push(task);
                }
            }));
            if (alreadyRequestedUninstalls.length) {
                await this.joinAllSettled(alreadyRequestedUninstalls);
            }
            for (const { task } of allTasks) {
                postUninstallExtension(task.extension, task.options);
            }
            if (extensionsToRemove.length) {
                await this.joinAllSettled(extensionsToRemove.map(extension => this.deleteExtension(extension)));
            }
        }
        catch (e) {
            const error = toExtensionManagementError(e);
            for (const { task } of allTasks) {
                // cancel the tasks
                try {
                    task.cancel();
                }
                catch (error) { /* ignore */ }
                if (!processedTasks.includes(task)) {
                    postUninstallExtension(task.extension, task.options, error);
                }
            }
            throw error;
        }
        finally {
            // Remove tasks from cache
            for (const { task } of allTasks) {
                if (!this.uninstallingExtensions.delete(getUninstallExtensionTaskKey(task.extension, task.options))) {
                    this.logService.warn('Uninstallation task is not found in the cache', task.extension.identifier.id);
                }
            }
        }
    }
    checkForDependents(extensionsToUninstall, installed, extensionToUninstall) {
        for (const extension of extensionsToUninstall) {
            const dependents = this.getDependents(extension, installed);
            if (dependents.length) {
                const remainingDependents = dependents.filter(dependent => !extensionsToUninstall.some(e => areSameExtensions(e.identifier, dependent.identifier)));
                if (remainingDependents.length) {
                    throw new Error(this.getDependentsErrorMessage(extension, remainingDependents, extensionToUninstall));
                }
            }
        }
    }
    getDependentsErrorMessage(dependingExtension, dependents, extensionToUninstall) {
        if (extensionToUninstall === dependingExtension) {
            if (dependents.length === 1) {
                return nls.localize('singleDependentError', "Cannot uninstall '{0}' extension. '{1}' extension depends on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
            }
            if (dependents.length === 2) {
                return nls.localize('twoDependentsError', "Cannot uninstall '{0}' extension. '{1}' and '{2}' extensions depend on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
            }
            return nls.localize('multipleDependentsError', "Cannot uninstall '{0}' extension. '{1}', '{2}' and other extension depend on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
        }
        if (dependents.length === 1) {
            return nls.localize('singleIndirectDependentError', "Cannot uninstall '{0}' extension . It includes uninstalling '{1}' extension and '{2}' extension depends on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
                || dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
        }
        if (dependents.length === 2) {
            return nls.localize('twoIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}' and '{3}' extensions depend on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
                || dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
        }
        return nls.localize('multipleIndirectDependentsError', "Cannot uninstall '{0}' extension. It includes uninstalling '{1}' extension and '{2}', '{3}' and other extensions depend on this.", extensionToUninstall.manifest.displayName || extensionToUninstall.manifest.name, dependingExtension.manifest.displayName
            || dependingExtension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
    }
    getAllPackExtensionsToUninstall(extension, installed, checked = []) {
        if (checked.indexOf(extension) !== -1) {
            return [];
        }
        if (areSameExtensions(extension.identifier, { id: this.productService.defaultChatAgent.extensionId })) {
            return [];
        }
        checked.push(extension);
        const extensionsPack = extension.manifest.extensionPack ? extension.manifest.extensionPack : [];
        if (extensionsPack.length) {
            const packedExtensions = installed.filter(i => !i.isBuiltin && extensionsPack.some(id => areSameExtensions({ id }, i.identifier)));
            const packOfPackedExtensions = [];
            for (const packedExtension of packedExtensions) {
                packOfPackedExtensions.push(...this.getAllPackExtensionsToUninstall(packedExtension, installed, checked));
            }
            return [...packedExtensions, ...packOfPackedExtensions];
        }
        return [];
    }
    getDependents(extension, installed) {
        return installed.filter(e => e.manifest.extensionDependencies && e.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
    }
    async updateControlCache() {
        try {
            this.logService.trace('ExtensionManagementService.updateControlCache');
            return await this.galleryService.getExtensionsControlManifest();
        }
        catch (err) {
            this.logService.trace('ExtensionManagementService.refreshControlCache - failed to get extension control manifest', getErrorMessage(err));
            return { malicious: [], deprecated: {}, search: [] };
        }
    }
};
AbstractExtensionManagementService = __decorate([
    __param(0, IExtensionGalleryService),
    __param(1, ITelemetryService),
    __param(2, IUriIdentityService),
    __param(3, ILogService),
    __param(4, IProductService),
    __param(5, IAllowedExtensionsService),
    __param(6, IUserDataProfilesService)
], AbstractExtensionManagementService);
export { AbstractExtensionManagementService };
export function toExtensionManagementError(error, code) {
    if (error instanceof ExtensionManagementError) {
        return error;
    }
    let extensionManagementError;
    if (error instanceof ExtensionGalleryError) {
        extensionManagementError = new ExtensionManagementError(error.message, error.code === "DownloadFailedWriting" /* ExtensionGalleryErrorCode.DownloadFailedWriting */ ? "DownloadFailedWriting" /* ExtensionManagementErrorCode.DownloadFailedWriting */ : "Gallery" /* ExtensionManagementErrorCode.Gallery */);
    }
    else {
        extensionManagementError = new ExtensionManagementError(error.message, isCancellationError(error) ? "Cancelled" /* ExtensionManagementErrorCode.Cancelled */ : (code ?? "Internal" /* ExtensionManagementErrorCode.Internal */));
    }
    extensionManagementError.stack = error.stack;
    return extensionManagementError;
}
function reportTelemetry(telemetryService, eventName, { extensionData, verificationStatus, duration, error, source, durationSinceUpdate }) {
    /* __GDPR__
        "extensionGallery:install" : {
            "owner": "sandy081",
            "success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "durationSinceUpdate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
            "recommendationReason": { "retiredFromVersion": "1.23.0", "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true },
            "verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "source": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "${include}": [
                "${GalleryExtensionTelemetryData}"
            ]
        }
    */
    /* __GDPR__
        "extensionGallery:uninstall" : {
            "owner": "sandy081",
            "success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
            "${include}": [
                "${GalleryExtensionTelemetryData}"
            ]
        }
    */
    /* __GDPR__
        "extensionGallery:update" : {
            "owner": "sandy081",
            "success": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "duration" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth", "isMeasurement": true },
            "errorcode": { "classification": "CallstackOrException", "purpose": "PerformanceAndHealth" },
            "verificationStatus" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "source": { "classification": "SystemMetaData", "purpose": "FeatureInsight" },
            "${include}": [
                "${GalleryExtensionTelemetryData}"
            ]
        }
    */
    telemetryService.publicLog(eventName, {
        ...extensionData,
        source,
        duration,
        durationSinceUpdate,
        success: !error,
        errorcode: error?.code,
        verificationStatus: verificationStatus === ExtensionSignatureVerificationCode.Success ? 'Verified' : (verificationStatus ?? 'Unverified')
    });
}
export class AbstractExtensionTask {
    constructor() {
        this.barrier = new Barrier();
    }
    async waitUntilTaskIsFinished() {
        await this.barrier.wait();
        return this.cancellablePromise;
    }
    run() {
        if (!this.cancellablePromise) {
            this.cancellablePromise = createCancelablePromise(token => this.doRun(token));
        }
        this.barrier.open();
        return this.cancellablePromise;
    }
    cancel() {
        if (!this.cancellablePromise) {
            this.cancellablePromise = createCancelablePromise(token => {
                return new Promise((c, e) => {
                    const disposable = token.onCancellationRequested(() => {
                        disposable.dispose();
                        e(new CancellationError());
                    });
                });
            });
            this.barrier.open();
        }
        this.cancellablePromise.cancel();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RFeHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL2V4dGVuc2lvbk1hbmFnZW1lbnQvY29tbW9uL2Fic3RyYWN0RXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxlQUFlLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUMzRSxPQUFPLEVBQUUsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3BHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ3pFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUN6RyxPQUFPLEVBQUUsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxVQUFVLEVBQUUsWUFBWSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0UsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzFELE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUN6RCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxLQUFLLEdBQUcsTUFBTSxpQkFBaUIsQ0FBQztBQUN2QyxPQUFPLEVBQ04sd0JBQXdCLEVBQUUsd0JBQXdCLEVBQ1AsMEJBQTBCLEVBQUUsc0JBQXNCLEVBQ3NHLGtDQUFrQyxFQUFFLHFCQUFxQixFQUU1UCxnQ0FBZ0MsRUFHaEMsa0NBQWtDLEVBQ2xDLHlCQUF5QixFQUN6QixNQUFNLDBCQUEwQixDQUFDO0FBQ2xDLE9B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