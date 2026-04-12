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
import { URI } from '../../../base/common/uri.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { AbstractStorageService, isProfileUsingDefaultStorage } from '../common/storage.js';
import { ApplicationStorageMain, ProfileStorageMain, InMemoryStorageMain, WorkspaceStorageMain } from './storageMain.js';
import { IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { Schemas } from '../../../base/common/network.js';
//#region Storage Main Service (intent: make application, profile and workspace storage accessible to windows from main process)
export const IStorageMainService = createDecorator('storageMainService');
let StorageMainService = class StorageMainService extends Disposable {
    constructor(logService, environmentService, userDataProfilesService, lifecycleMainService, fileService, uriIdentityService) {
        super();
        this.logService = logService;
        this.environmentService = environmentService;
        this.userDataProfilesService = userDataProfilesService;
        this.lifecycleMainService = lifecycleMainService;
        this.fileService = fileService;
        this.uriIdentityService = uriIdentityService;
        this.shutdownReason = undefined;
        this._onDidChangeProfileStorage = this._register(new Emitter());
        this.onDidChangeProfileStorage = this._onDidChangeProfileStorage.event;
        //#endregion
        //#region Profile Storage
        this.mapProfileToStorage = new Map();
        //#endregion
        //#region Workspace Storage
        this.mapWorkspaceToStorage = new Map();
        this.applicationStorage = this._register(this.createApplicationStorage());
        this.registerListeners();
    }
    getStorageOptions() {
        return {
            useInMemoryStorage: !!this.environmentService.extensionTestsLocationURI // no storage during extension tests!
        };
    }
    registerListeners() {
        // Application Storage: Warmup when any window opens
        (async () => {
            await this.lifecycleMainService.when(3 /* LifecycleMainPhase.AfterWindowOpen */);
            this.applicationStorage.init();
        })();
        this._register(this.lifecycleMainService.onWillLoadWindow(e => {
            // Profile Storage: Warmup when related window with profile loads
            if (e.window.profile) {
                this.profileStorage(e.window.profile).init();
            }
            // Workspace Storage: Warmup when related window with workspace loads
            if (e.workspace) {
                this.workspaceStorage(e.workspace).init();
            }
        }));
        // All Storage: Close when shutting down
        this._register(this.lifecycleMainService.onWillShutdown(e => {
            this.logService.trace('storageMainService#onWillShutdown()');
            // Remember shutdown reason
            this.shutdownReason = e.reason;
            // Application Storage
            e.join('applicationStorage', this.applicationStorage.close());
            // Profile Storage(s)
            for (const [, profileStorage] of this.mapProfileToStorage) {
                e.join('profileStorage', profileStorage.close());
            }
            // Workspace Storage(s)
            for (const [, workspaceStorage] of this.mapWorkspaceToStorage) {
                e.join('workspaceStorage', workspaceStorage.close());
            }
        }));
        // Prepare storage location as needed
        this._register(this.userDataProfilesService.onWillCreateProfile(e => {
            e.join((async () => {
                if (!(await this.fileService.exists(e.profile.globalStorageHome))) {
                    await this.fileService.createFolder(e.profile.globalStorageHome);
                }
            })());
        }));
        // Close the storage of the profile that is being removed
        this._register(this.userDataProfilesService.onWillRemoveProfile(e => {
            const storage = this.mapProfileToStorage.get(e.profile.id);
            if (storage) {
                e.join(storage.close());
            }
        }));
    }
    createApplicationStorage() {
        this.logService.trace(`StorageMainService: creating application storage`);
        const applicationStorage = new ApplicationStorageMain(this.getStorageOptions(), this.userDataProfilesService, this.logService, this.fileService);
        this._register(Event.once(applicationStorage.onDidCloseStorage)(() => {
            this.logService.trace(`StorageMainService: closed application storage`);
        }));
        return applicationStorage;
    }
    profileStorage(profile) {
        if (isProfileUsingDefaultStorage(profile)) {
            return this.applicationStorage; // for profiles using default storage, use application storage
        }
        let profileStorage = this.mapProfileToStorage.get(profile.id);
        if (!profileStorage) {
            this.logService.trace(`StorageMainService: creating profile storage (${profile.name})`);
            profileStorage = this._register(this.createProfileStorage(profile));
            this.mapProfileToStorage.set(profile.id, profileStorage);
            // Don't use this._register() for listeners that are disposed early
            // as it causes entries to accumulate in _store when storage is closed/reopened
            const listener = profileStorage.onDidChangeStorage(e => this._onDidChangeProfileStorage.fire({
                ...e,
                storage: profileStorage,
                profile
            }));
            Event.once(profileStorage.onDidCloseStorage)(() => {
                this.logService.trace(`StorageMainService: closed profile storage (${profile.name})`);
                this.mapProfileToStorage.delete(profile.id);
                listener.dispose();
            });
        }
        return profileStorage;
    }
    createProfileStorage(profile) {
        if (this.shutdownReason === 2 /* ShutdownReason.KILL */) {
            // Workaround for native crashes that we see when
            // SQLite DBs are being created even after shutdown
            // https://github.com/microsoft/vscode/issues/143186
            return new InMemoryStorageMain(this.logService, this.fileService);
        }
        return new ProfileStorageMain(profile, this.getStorageOptions(), this.logService, this.fileService);
    }
    workspaceStorage(workspace) {
        let workspaceStorage = this.mapWorkspaceToStorage.get(workspace.id);
        if (!workspaceStorage) {
            this.logService.trace(`StorageMainService: creating workspace storage (${workspace.id})`);
            workspaceStorage = this._register(this.createWorkspaceStorage(workspace));
            this.mapWorkspaceToStorage.set(workspace.id, workspaceStorage);
            // Don't use this._register() for Event.once as it auto-disposes
            Event.once(workspaceStorage.onDidCloseStorage)(() => {
                this.logService.trace(`StorageMainService: closed workspace storage (${workspace.id})`);
                this.mapWorkspaceToStorage.delete(workspace.id);
            });
        }
        return workspaceStorage;
    }
    createWorkspaceStorage(workspace) {
        if (this.shutdownReason === 2 /* ShutdownReason.KILL */) {
            // Workaround for native crashes that we see when
            // SQLite DBs are being created even after shutdown
            // https://github.com/microsoft/vscode/issues/143186
            return new InMemoryStorageMain(this.logService, this.fileService);
        }
        return new WorkspaceStorageMain(workspace, this.getStorageOptions(), this.logService, this.environmentService, this.fileService);
    }
    //#endregion
    isUsed(path) {
        const pathUri = URI.file(path);
        for (const storage of [this.applicationStorage, ...this.mapProfileToStorage.values(), ...this.mapWorkspaceToStorage.values()]) {
            if (!storage.path) {
                continue;
            }
            if (this.uriIdentityService.extUri.isEqualOrParent(URI.file(storage.path), pathUri)) {
                return true;
            }
        }
        return false;
    }
};
StorageMainService = __decorate([
    __param(0, ILogService),
    __param(1, IEnvironmentService),
    __param(2, IUserDataProfilesMainService),
    __param(3, ILifecycleMainService),
    __param(4, IFileService),
    __param(5, IUriIdentityService)
], StorageMainService);
export { StorageMainService };
//#endregion
//#region Application Main Storage Service (intent: use application storage from main process)
export const IApplicationStorageMainService = createDecorator('applicationStorageMainService');
let ApplicationStorageMainService = class ApplicationStorageMainService extends AbstractStorageService {
    constructor(userDataProfilesService, storageMainService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this.storageMainService = storageMainService;
        this.whenReady = this.storageMainService.applicationStorage.whenInit;
    }
    doInitialize() {
        // application storage is being initialized as part
        // of the first window opening, so we do not trigger
        // it here but can join it
        return this.storageMainService.applicationStorage.whenInit;
    }
    getStorage(scope) {
        if (scope === -1 /* StorageScope.APPLICATION */) {
            return this.storageMainService.applicationStorage.storage;
        }
        return undefined; // any other scope is unsupported from main process
    }
    getLogDetails(scope) {
        if (scope === -1 /* StorageScope.APPLICATION */) {
            return this.userDataProfilesService.defaultProfile.globalStorageHome.with({ scheme: Schemas.file }).fsPath;
        }
        return undefined; // any other scope is unsupported from main process
    }
    shouldFlushWhenIdle() {
        return false; // not needed here, will be triggered from any window that is opened
    }
    switch() {
        throw new Error('Migrating storage is unsupported from main process');
    }
    switchToProfile() {
        throw new Error('Switching storage profile is unsupported from main process');
    }
    switchToWorkspace() {
        throw new Error('Switching storage workspace is unsupported from main process');
    }
    hasScope() {
        throw new Error('Main process is never profile or workspace scoped');
    }
};
ApplicationStorageMainService = __decorate([
    __param(0, IUserDataProfilesService),
    __param(1, IStorageMainService)
], ApplicationStorageMainService);
export { ApplicationStorageMainService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RvcmFnZU1haW5TZXJ2aWNlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vc3RvcmFnZS9lbGVjdHJvbi1tYWluL3N0b3JhZ2VNYWluU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUMvRCxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFFL0QsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUM5RSxPQUFPLEVBQUUscUJBQXFCLEVBQXNDLE1BQU0sdURBQXVELENBQUM7QUFDbEksT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQ3RELE9BQU8sRUFBRSxzQkFBc0IsRUFBRSw0QkFBNEIsRUFBZ0QsTUFBTSxzQkFBc0IsQ0FBQztBQUMxSSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsa0JBQWtCLEVBQUUsbUJBQW1CLEVBQXFDLG9CQUFvQixFQUF1QixNQUFNLGtCQUFrQixDQUFDO0FBQ2pMLE9BQU8sRUFBb0Isd0JBQXdCLEVBQUUsTUFBTSxpREFBaUQsQ0FBQztBQUM3RyxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUV0RyxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUM5RSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFFMUQs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