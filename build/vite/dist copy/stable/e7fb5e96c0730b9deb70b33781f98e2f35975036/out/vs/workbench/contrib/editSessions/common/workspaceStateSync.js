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
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Emitter } from '../../../../base/common/event.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IEnvironmentService } from '../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { AbstractSynchroniser } from '../../../../platform/userDataSync/common/abstractSynchronizer.js';
import { IEditSessionsStorageService } from './editSessions.js';
import { IWorkspaceIdentityService } from '../../../services/workspaces/common/workspaceIdentityService.js';
class NullBackupStoreService {
    async writeResource() {
        return;
    }
    async getAllResourceRefs() {
        return [];
    }
    async resolveResourceContent() {
        return null;
    }
}
class NullEnablementService {
    constructor() {
        this._onDidChangeEnablement = new Emitter();
        this.onDidChangeEnablement = this._onDidChangeEnablement.event;
        this._onDidChangeResourceEnablement = new Emitter();
        this.onDidChangeResourceEnablement = this._onDidChangeResourceEnablement.event;
    }
    isEnabled() { return true; }
    canToggleEnablement() { return true; }
    setEnablement(_enabled) { }
    isResourceEnabled(_resource) { return true; }
    isResourceEnablementConfigured(_resource) { return false; }
    setResourceEnablement(_resource, _enabled) { }
    getResourceSyncStateVersion(_resource) { return undefined; }
}
let WorkspaceStateSynchroniser = class WorkspaceStateSynchroniser extends AbstractSynchroniser {
    constructor(profile, collection, userDataSyncStoreService, logService, fileService, environmentService, telemetryService, configurationService, storageService, uriIdentityService, workspaceIdentityService, editSessionsStorageService) {
        const userDataSyncLocalStoreService = new NullBackupStoreService();
        const userDataSyncEnablementService = new NullEnablementService();
        super({ syncResource: "workspaceState" /* SyncResource.WorkspaceState */, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
        this.workspaceIdentityService = workspaceIdentityService;
        this.editSessionsStorageService = editSessionsStorageService;
        this.version = 1;
    }
    async sync() {
        const cancellationTokenSource = new CancellationTokenSource();
        const folders = await this.workspaceIdentityService.getWorkspaceStateFolders(cancellationTokenSource.token);
        if (!folders.length) {
            return null;
        }
        // Ensure we have latest state by sending out onWillSaveState event
        await this.storageService.flush();
        const keys = this.storageService.keys(1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
        if (!keys.length) {
            return null;
        }
        const contributedData = {};
        keys.forEach((key) => {
            const data = this.storageService.get(key, 1 /* StorageScope.WORKSPACE */);
            if (data) {
                contributedData[key] = data;
            }
        });
        const content = { folders, storage: contributedData, version: this.version };
        await this.editSessionsStorageService.write('workspaceState', stringify(content));
        return null;
    }
    async apply() {
        const payload = this.editSessionsStorageService.lastReadResources.get('editSessions')?.content;
        const workspaceStateId = payload ? JSON.parse(payload).workspaceStateId : undefined;
        const resource = await this.editSessionsStorageService.read('workspaceState', workspaceStateId);
        if (!resource) {
            return null;
        }
        const remoteWorkspaceState = parse(resource.content);
        if (!remoteWorkspaceState) {
            this.logService.info('Skipping initializing workspace state because remote workspace state does not exist.');
            return null;
        }
        // Evaluate whether storage is applicable for current workspace
        const cancellationTokenSource = new CancellationTokenSource();
        const replaceUris = await this.workspaceIdentityService.matches(remoteWorkspaceState.folders, cancellationTokenSource.token);
        if (!replaceUris) {
            this.logService.info('Skipping initializing workspace state because remote workspace state does not match current workspace.');
            return null;
        }
        const storage = {};
        for (const key of Object.keys(remoteWorkspaceState.storage)) {
            storage[key] = remoteWorkspaceState.storage[key];
        }
        if (Object.keys(storage).length) {
            // Initialize storage with remote storage
            const storageEntries = [];
            for (const key of Object.keys(storage)) {
                // Deserialize the stored state
                try {
                    const value = parse(storage[key]);
                    // Run URI conversion on the stored state
                    replaceUris(value);
                    storageEntries.push({ key, value, scope: 1 /* StorageScope.WORKSPACE */, target: 0 /* StorageTarget.USER */ });
                }
                catch {
                    storageEntries.push({ key, value: storage[key], scope: 1 /* StorageScope.WORKSPACE */, target: 0 /* StorageTarget.USER */ });
                }
            }
            this.storageService.storeAll(storageEntries, true);
        }
        this.editSessionsStorageService.delete('workspaceState', resource.ref);
        return null;
    }
    // TODO@joyceerhl implement AbstractSynchronizer in full
    applyResult(remoteUserData, lastSyncUserData, result, force) {
        throw new Error('Method not implemented.');
    }
    async generateSyncPreview(remoteUserData, lastSyncUserData, isRemoteDataFromCurrentMachine, userDataSyncConfiguration, token) {
        return [];
    }
    getMergeResult(resourcePreview, token) {
        throw new Error('Method not implemented.');
    }
    getAcceptResult(resourcePreview, resource, content, token) {
        throw new Error('Method not implemented.');
    }
    async hasRemoteChanged(lastSyncUserData) {
        return true;
    }
    async hasLocalData() {
        return false;
    }
    async resolveContent(uri) {
        return null;
    }
};
WorkspaceStateSynchroniser = __decorate([
    __param(4, IFileService),
    __param(5, IEnvironmentService),
    __param(6, ITelemetryService),
    __param(7, IConfigurationService),
    __param(8, IStorageService),
    __param(9, IUriIdentityService),
    __param(10, IWorkspaceIdentityService),
    __param(11, IEditSessionsStorageService)
], WorkspaceStateSynchroniser);
export { WorkspaceStateSynchroniser };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid29ya3NwYWNlU3RhdGVTeW5jLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZWRpdFNlc3Npb25zL2NvbW1vbi93b3Jrc3BhY2VTdGF0ZVN5bmMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFxQix1QkFBdUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBRXJHLE9BQU8sRUFBRSxPQUFPLEVBQVMsTUFBTSxrQ0FBa0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBRTFFLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxPQUFPLEVBQWlCLGVBQWUsRUFBK0IsTUFBTSxnREFBZ0QsQ0FBQztBQUM3SCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2RixPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUU3RixPQUFPLEVBQUUsb0JBQW9CLEVBQXVFLE1BQU0sa0VBQWtFLENBQUM7QUFFN0ssT0FBTyxFQUFlLDJCQUEyQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDN0UsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0saUVBQWlFLENBQUM7QUFHNUcsTUFBTSxzQkFBc0I7SUFFM0IsS0FBSyxDQUFDLGFBQWE7UUFDbEIsT0FBTztJQUNSLENBQUM7SUFDRCxLQUFLLENBQUMsa0JBQWtCO1FBQ3ZCLE9BQU8sRUFBRSxDQUFDO0lBQ1gsQ0FBQztJQUNELEtBQUssQ0FBQyxzQkFB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