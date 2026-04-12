/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getErrorMessage } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../base/common/map.js';
import { getIdAndVersion } from '../common/extensionManagementUtil.js';
import { ExtensionIdentifier } from '../../extensions/common/extensions.js';
export class ExtensionsWatcher extends Disposable {
    constructor(extensionManagementService, extensionsScannerService, userDataProfilesService, extensionsProfileScannerService, uriIdentityService, fileService, logService) {
        super();
        this.extensionManagementService = extensionManagementService;
        this.extensionsScannerService = extensionsScannerService;
        this.userDataProfilesService = userDataProfilesService;
        this.extensionsProfileScannerService = extensionsProfileScannerService;
        this.uriIdentityService = uriIdentityService;
        this.fileService = fileService;
        this.logService = logService;
        this._onDidChangeExtensionsByAnotherSource = this._register(new Emitter());
        this.onDidChangeExtensionsByAnotherSource = this._onDidChangeExtensionsByAnotherSource.event;
        this.allExtensions = new Map;
        this.extensionsProfileWatchDisposables = this._register(new DisposableMap());
        this.initialize().then(null, error => logService.error('Error while initializing Extensions Watcher', getErrorMessage(error)));
    }
    async initialize() {
        await this.extensionsScannerService.initializeDefaultProfileExtensions();
        await this.onDidChangeProfiles(this.userDataProfilesService.profiles);
        this.registerListeners();
        await this.deleteExtensionsNotInProfiles();
    }
    registerListeners() {
        this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e.added)));
        this._register(this.extensionsProfileScannerService.onAddExtensions(e => this.onAddExtensions(e)));
        this._register(this.extensionsProfileScannerService.onDidAddExtensions(e => this.onDidAddExtensions(e)));
        this._register(this.extensionsProfileScannerService.onRemoveExtensions(e => this.onRemoveExtensions(e)));
        this._register(this.extensionsProfileScannerService.onDidRemoveExtensions(e => this.onDidRemoveExtensions(e)));
        this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
    }
    async onDidChangeProfiles(added) {
        try {
            if (added.length) {
                await Promise.all(added.map(profile => {
                    this.extensionsProfileWatchDisposables.set(profile.id, combinedDisposable(this.fileService.watch(this.uriIdentityService.extUri.dirname(profile.extensionsResource)), 
                    // Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
                    this.fileService.watch(profile.extensionsResource)));
                    return this.populateExtensionsFromProfile(profile.extensionsResource);
                }));
            }
        }
        catch (error) {
            this.logService.error(error);
            throw error;
        }
    }
    async onAddExtensions(e) {
        for (const extension of e.extensions) {
            this.addExtensionWithKey(this.getKey(extension.identifier, extension.version), e.profileLocation);
        }
    }
    async onDidAddExtensions(e) {
        for (const extension of e.extensions) {
            const key = this.getKey(extension.identifier, extension.version);
            if (e.error) {
                this.removeExtensionWithKey(key, e.profileLocation);
            }
            else {
                this.addExtensionWithKey(key, e.profileLocation);
            }
        }
    }
    async onRemoveExtensions(e) {
        for (const extension of e.extensions) {
            this.removeExtensionWithKey(this.getKey(extension.identifier, extension.version), e.profileLocation);
        }
    }
    async onDidRemoveExtensions(e) {
        const extensionsToDelete = [];
        const promises = [];
        for (const extension of e.extensions) {
            const key = this.getKey(extension.identifier, extension.version);
            if (e.error) {
                this.addExtensionWithKey(key, e.profileLocation);
            }
            else {
                this.removeExtensionWithKey(key, e.profileLocation);
                if (!this.allExtensions.has(key)) {
                    this.logService.debug('Extension is removed from all profiles', extension.identifier.id, extension.version);
                    promises.push(this.extensionManagementService.scanInstalledExtensionAtLocation(extension.location)
                        .then(result => {
                        if (result) {
                            extensionsToDelete.push(result);
                        }
                        else {
                            this.logService.info('Extension not found at the location', extension.location.toString());
                        }
                    }, error => this.logService.error(error)));
                }
            }
        }
        try {
            await Promise.all(promises);
            if (extensionsToDelete.length) {
                await this.deleteExtensionsNotInProfiles(extensionsToDelete);
            }
        }
        catch (error) {
            this.logService.error(error);
        }
    }
    onDidFilesChange(e) {
        for (const profile of this.userDataProfilesService.profiles) {
            if (e.contains(profile.extensionsResource, 0 /* FileChangeType.UPDATED */, 1 /* FileChangeType.ADDED */)) {
                this.onDidExtensionsProfileChange(profile.extensionsResource);
            }
        }
    }
    async onDidExtensionsProfileChange(profileLocation) {
        const added = [], removed = [];
        const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileLocation);
        const extensionKeys = new Set();
        const cached = new Set();
        for (const [key, profiles] of this.allExtensions) {
            if (profiles.has(profileLocation)) {
                cached.add(key);
            }
        }
        for (const extension of extensions) {
            const key = this.getKey(extension.identifier, extension.version);
            extensionKeys.add(key);
            if (!cached.has(key)) {
                added.push(extension.identifier);
                this.addExtensionWithKey(key, profileLocation);
            }
        }
        for (const key of cached) {
            if (!extensionKeys.has(key)) {
                const extension = this.fromKey(key);
                if (extension) {
                    removed.push(extension.identifier);
                    this.removeExtensionWithKey(key, profileLocation);
                }
            }
        }
        if (added.length || removed.length) {
            this._onDidChangeExtensionsByAnotherSource.fire({ added: added.length ? { extensions: added, profileLocation } : undefined, removed: removed.length ? { extensions: removed, profileLocation } : undefined });
        }
    }
    async populateExtensionsFromProfile(extensionsProfileLocation) {
        const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(extensionsProfileLocation);
        for (const extension of extensions) {
            this.addExtensionWithKey(this.getKey(extension.identifier, extension.version), extensionsProfileLocation);
        }
    }
    async deleteExtensionsNotInProfiles(toDelete) {
        if (!toDelete) {
            const installed = await this.extensionManagementService.scanAllUserInstalledExtensions();
            toDelete = installed.filter(installedExtension => !this.allExtensions.has(this.getKey(installedExtension.identifier, installedExtension.manifest.version)));
        }
        if (toDelete.length) {
            await this.extensionManagementService.deleteExtensions(...toDelete);
        }
    }
    addExtensionWithKey(key, extensionsProfileLocation) {
        let profiles = this.allExtensions.get(key);
        if (!profiles) {
            this.allExtensions.set(key, profiles = new ResourceSet((uri) => this.uriIdentityService.extUri.getComparisonKey(uri)));
        }
        profiles.add(extensionsProfileLocation);
    }
    removeExtensionWithKey(key, profileLocation) {
        const profiles = this.allExtensions.get(key);
        if (profiles) {
            profiles.delete(profileLocation);
        }
        if (!profiles?.size) {
            this.allExtensions.delete(key);
        }
    }
    getKey(identifier, version) {
        return `${ExtensionIdentifier.toKey(identifier.id)}@${version}`;
    }
    fromKey(key) {
        const [id, version] = getIdAndVersion(key);
        return version ? { identifier: { id }, version } : undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uc1dhdGNoZXIuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9leHRlbnNpb25NYW5hZ2VtZW50L25vZGUvZXh0ZW5zaW9uc1dhdGNoZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLGdDQUFnQyxDQUFDO0FBQ2pFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUN4RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsVUFBVSxFQUFFLGFBQWEsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2xHLE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSw2QkFBNkIsQ0FBQztBQUUxRCxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sc0NBQXNDLENBQUM7QUFJdkUsT0FBTyxFQUFFLG1CQUFtQixFQUFvQyxNQUFNLHVDQUF1QyxDQUFDO0FBVzlHLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxVQUFVO0lBUWhELFlBQ2tCLDBCQUFtRSxFQUNuRSx3QkFBbUQsRUFDbkQsdUJBQWlELEVBQ2pELCtCQUFpRSxFQUNqRSxrQkFBdUMsRUFDdkMsV0FBeUIsRUFDekIsVUFBdUI7UUFFeEMsS0FBSyxFQUFFLENBQUM7UUFSUywrQkFBMEIsR0FBMUIsMEJBQTBCLENBQXlDO1FBQ25FLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMkI7UUFDbkQsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUNqRCxvQ0FBK0IsR0FBL0IsK0JBQStCLENBQWtDO1FBQ2pFLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDdkMsZ0JBQVcsR0FBWCxXQUFXLENBQWM7UUFDekIsZUFBVSxHQUFWLFVBQVUsQ0FBYTtRQWJ4QiwwQ0FBcUMsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxF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