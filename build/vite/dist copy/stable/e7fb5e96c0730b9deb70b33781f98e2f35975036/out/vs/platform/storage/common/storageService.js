/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Promises } from '../../../base/common/async.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { joinPath } from '../../../base/common/resources.js';
import { Storage } from '../../../base/parts/storage/common/storage.js';
import { AbstractStorageService, isProfileUsingDefaultStorage, WillSaveStateReason } from './storage.js';
import { ApplicationStorageDatabaseClient, ProfileStorageDatabaseClient, WorkspaceStorageDatabaseClient } from './storageIpc.js';
import { isUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
export class RemoteStorageService extends AbstractStorageService {
    constructor(initialWorkspace, initialProfiles, remoteService, environmentService) {
        super();
        this.remoteService = remoteService;
        this.environmentService = environmentService;
        this.profileStorageDisposables = this._register(new DisposableStore());
        this.workspaceStorageDisposables = this._register(new DisposableStore());
        this.applicationStorageProfile = initialProfiles.defaultProfile;
        this.applicationStorage = this.createApplicationStorage();
        this.profileStorageProfile = initialProfiles.currentProfile;
        this.profileStorage = this.createProfileStorage(this.profileStorageProfile);
        this.workspaceStorageId = initialWorkspace?.id;
        this.workspaceStorage = this.createWorkspaceStorage(initialWorkspace);
    }
    createApplicationStorage() {
        const storageDataBaseClient = this._register(new ApplicationStorageDatabaseClient(this.remoteService.getChannel('storage')));
        const applicationStorage = this._register(new Storage(storageDataBaseClient));
        this._register(applicationStorage.onDidChangeStorage(e => this.emitDidChangeValue(-1 /* StorageScope.APPLICATION */, e)));
        return applicationStorage;
    }
    createProfileStorage(profile) {
        // First clear any previously associated disposables
        this.profileStorageDisposables.clear();
        // Remember profile associated to profile storage
        this.profileStorageProfile = profile;
        let profileStorage;
        if (isProfileUsingDefaultStorage(profile)) {
            // If we are using default profile storage, the profile storage is
            // actually the same as application storage. As such we
            // avoid creating the storage library a second time on
            // the same DB.
            profileStorage = this.applicationStorage;
        }
        else {
            const storageDataBaseClient = this.profileStorageDisposables.add(new ProfileStorageDatabaseClient(this.remoteService.getChannel('storage'), profile));
            profileStorage = this.profileStorageDisposables.add(new Storage(storageDataBaseClient));
        }
        this.profileStorageDisposables.add(profileStorage.onDidChangeStorage(e => this.emitDidChangeValue(0 /* StorageScope.PROFILE */, e)));
        return profileStorage;
    }
    createWorkspaceStorage(workspace) {
        // First clear any previously associated disposables
        this.workspaceStorageDisposables.clear();
        // Remember workspace ID for logging later
        this.workspaceStorageId = workspace?.id;
        let workspaceStorage = undefined;
        if (workspace) {
            const storageDataBaseClient = this.workspaceStorageDisposables.add(new WorkspaceStorageDatabaseClient(this.remoteService.getChannel('storage'), workspace));
            workspaceStorage = this.workspaceStorageDisposables.add(new Storage(storageDataBaseClient));
            this.workspaceStorageDisposables.add(workspaceStorage.onDidChangeStorage(e => this.emitDidChangeValue(1 /* StorageScope.WORKSPACE */, e)));
        }
        return workspaceStorage;
    }
    async doInitialize() {
        // Init all storage locations
        await Promises.settled([
            this.applicationStorage.init(),
            this.profileStorage.init(),
            this.workspaceStorage?.init() ?? Promise.resolve()
        ]);
    }
    getStorage(scope) {
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                return this.applicationStorage;
            case 0 /* StorageScope.PROFILE */:
                return this.profileStorage;
            default:
                return this.workspaceStorage;
        }
    }
    getLogDetails(scope) {
        switch (scope) {
            case -1 /* StorageScope.APPLICATION */:
                return this.applicationStorageProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
            case 0 /* StorageScope.PROFILE */:
                return this.profileStorageProfile?.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
            default:
                return this.workspaceStorageId ? `${joinPath(this.environmentService.workspaceStorageHome, this.workspaceStorageId, 'state.vscdb').with({ scheme: Schemas.file }).fsPath}` : undefined;
        }
    }
    async close() {
        // Stop periodic scheduler and idle runner as we now collect state normally
        this.stopFlushWhenIdle();
        // Signal as event so that clients can still store data
        this.emitWillSaveState(WillSaveStateReason.SHUTDOWN);
        // Do it
        await Promises.settled([
            this.applicationStorage.close(),
            this.profileStorage.close(),
            this.workspaceStorage?.close() ?? Promise.resolve()
        ]);
    }
    async switchToProfile(toProfile) {
        if (!this.canSwitchProfile(this.profileStorageProfile, toProfile)) {
            return;
        }
        const oldProfileStorage = this.profileStorage;
        const oldItems = oldProfileStorage.items;
        // Close old profile storage but only if this is
        // different from application storage!
        if (oldProfileStorage !== this.applicationStorage) {
            await oldProfileStorage.close();
        }
        // Create new profile storage & init
        this.profileStorage = this.createProfileStorage(toProfile);
        await this.profileStorage.init();
        // Handle data switch and eventing
        this.switchData(oldItems, this.profileStorage, 0 /* StorageScope.PROFILE */);
    }
    async switchToWorkspace(toWorkspace, preserveData) {
        const oldWorkspaceStorage = this.workspaceStorage;
        const oldItems = oldWorkspaceStorage?.items ?? new Map();
        // Close old workspace storage
        await oldWorkspaceStorage?.close();
        // Create new workspace storage & init
        this.workspaceStorage = this.createWorkspaceStorage(toWorkspace);
        await this.workspaceStorage.init();
        // Handle data switch and eventing
        this.switchData(oldItems, this.workspaceStorage, 1 /* StorageScope.WORKSPACE */);
    }
    hasScope(scope) {
        if (isUserDataProfile(scope)) {
            return this.profileStorageProfile.id === scope.id;
        }
        return this.workspaceStorageId === scope.id;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3BFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMxRCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDN0QsT0FBTyxFQUFZLE9BQU8sRUFBRSxNQUFNLCtDQUErQyxDQUFDO0FBR2xGLE9BQU8sRUFBRSxzQkFBc0IsRUFBRSw0QkFBNEIsRUFBZ0IsbUJBQW1CLEVBQUUsTUFBTSxjQUFjLENBQUM7QUFDdkgsT0FBTyxFQUFFLGdDQUFnQyxFQUFFLDRCQUE0QixFQUFFLDhCQUE4QixFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFDakksT0FBTyxFQUFFLGlCQUFpQixFQUFvQixNQUFNLGlEQUFpRCxDQUFDO0FBR3RHLE1BQU0sT0FBTyxvQkFBcUIsU0FBUSxzQkFBc0I7SUFhL0QsWUFDQyxnQkFBcUQsRUFDckQsZUFBdUYsRUFDdEUsYUFBNkIsRUFDN0Isa0JBQXVDO1FBRXhELEtBQUssRUFBRSxDQUFDO1FBSFMsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQzdCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFYeEMsOEJBQXlCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFJbEUsZ0NBQTJCLEdBQUcsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLGVBQWUsRUFBRSxDQUFDLENBQUM7UUFXcEYsSUFBSSxDQUFD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