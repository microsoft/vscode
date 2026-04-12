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
import { Disposable } from '../../../../base/common/lifecycle.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IUserDataProfileService } from './userDataProfile.js';
import { distinct } from '../../../../base/common/arrays.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { UserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfileIpc.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
const associatedRemoteProfilesKey = 'associatedRemoteProfiles';
export const IRemoteUserDataProfilesService = createDecorator('IRemoteUserDataProfilesService');
let RemoteUserDataProfilesService = class RemoteUserDataProfilesService extends Disposable {
    constructor(environmentService, remoteAgentService, userDataProfilesService, userDataProfileService, storageService, logService) {
        super();
        this.environmentService = environmentService;
        this.remoteAgentService = remoteAgentService;
        this.userDataProfilesService = userDataProfilesService;
        this.userDataProfileService = userDataProfileService;
        this.storageService = storageService;
        this.logService = logService;
        this.initPromise = this.init();
    }
    async init() {
        const connection = this.remoteAgentService.getConnection();
        if (!connection) {
            return;
        }
        const environment = await this.remoteAgentService.getEnvironment();
        if (!environment) {
            return;
        }
        this.remoteUserDataProfilesService = new UserDataProfilesService(environment.profiles.all, environment.profiles.home, connection.getChannel('userDataProfiles'));
        this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeLocalProfiles(e)));
        // Associate current local profile with remote profile
        const remoteProfile = await this.getAssociatedRemoteProfile(this.userDataProfileService.currentProfile, this.remoteUserDataProfilesService);
        if (!remoteProfile.isDefault) {
            this.setAssociatedRemoteProfiles([...this.getAssociatedRemoteProfiles(), remoteProfile.id]);
        }
        this.cleanUp();
    }
    async onDidChangeLocalProfiles(e) {
        for (const profile of e.removed) {
            const remoteProfile = this.remoteUserDataProfilesService?.profiles.find(p => p.id === profile.id);
            if (remoteProfile) {
                await this.remoteUserDataProfilesService?.removeProfile(remoteProfile);
            }
        }
    }
    async getRemoteProfiles() {
        await this.initPromise;
        if (!this.remoteUserDataProfilesService) {
            throw new ErrorNoTelemetry('Remote profiles service not available in the current window');
        }
        return this.remoteUserDataProfilesService.profiles;
    }
    async getRemoteProfile(localProfile) {
        await this.initPromise;
        if (!this.remoteUserDataProfilesService) {
            throw new ErrorNoTelemetry('Remote profiles service not available in the current window');
        }
        return this.getAssociatedRemoteProfile(localProfile, this.remoteUserDataProfilesService);
    }
    async getAssociatedRemoteProfile(localProfile, remoteUserDataProfilesService) {
        // If the local profile is the default profile, return the remote default profile
        if (localProfile.isDefault) {
            return remoteUserDataProfilesService.defaultProfile;
        }
        let profile = remoteUserDataProfilesService.profiles.find(p => p.id === localProfile.id);
        if (!profile) {
            profile = await remoteUserDataProfilesService.createProfile(localProfile.id, localProfile.name, {
                transient: localProfile.isTransient,
                useDefaultFlags: localProfile.useDefaultFlags,
            });
            this.setAssociatedRemoteProfiles([...this.getAssociatedRemoteProfiles(), this.userDataProfileService.currentProfile.id]);
        }
        return profile;
    }
    getAssociatedRemoteProfiles() {
        if (this.environmentService.remoteAuthority) {
            const remotes = this.parseAssociatedRemoteProfiles();
            return remotes[this.environmentService.remoteAuthority] ?? [];
        }
        return [];
    }
    setAssociatedRemoteProfiles(profiles) {
        if (this.environmentService.remoteAuthority) {
            const remotes = this.parseAssociatedRemoteProfiles();
            profiles = distinct(profiles);
            if (profiles.length) {
                remotes[this.environmentService.remoteAuthority] = profiles;
            }
            else {
                delete remotes[this.environmentService.remoteAuthority];
            }
            if (Object.keys(remotes).length) {
                this.storageService.store(associatedRemoteProfilesKey, JSON.stringify(remotes), -1 /* StorageScope.APPLICATION */, 1 /* StorageTarget.MACHINE */);
            }
            else {
                this.storageService.remove(associatedRemoteProfilesKey, -1 /* StorageScope.APPLICATION */);
            }
        }
    }
    parseAssociatedRemoteProfiles() {
        if (this.environmentService.remoteAuthority) {
            const value = this.storageService.get(associatedRemoteProfilesKey, -1 /* StorageScope.APPLICATION */);
            try {
                return value ? JSON.parse(value) : {};
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return {};
    }
    async cleanUp() {
        const associatedRemoteProfiles = [];
        for (const profileId of this.getAssociatedRemoteProfiles()) {
            const remoteProfile = this.remoteUserDataProfilesService?.profiles.find(p => p.id === profileId);
            if (!remoteProfile) {
                continue;
            }
            const localProfile = this.userDataProfilesService.profiles.find(p => p.id === profileId);
            if (localProfile) {
                if (localProfile.name !== remoteProfile.name) {
                    await this.remoteUserDataProfilesService?.updateProfile(remoteProfile, { name: localProfile.name });
                }
                associatedRemoteProfiles.push(profileId);
                continue;
            }
            if (remoteProfile) {
                // Cleanup remote profiles those are not available locally
                await this.remoteUserDataProfilesService?.removeProfile(remoteProfile);
            }
        }
        this.setAssociatedRemoteProfiles(associatedRemoteProfiles);
    }
};
RemoteUserDataProfilesService = __decorate([
    __param(0, IWorkbenchEnvironmentService),
    __param(1, IRemoteAgentService),
    __param(2, IUserDataProfilesService),
    __param(3, IUserDataProfileService),
    __param(4, IStorageService),
    __param(5, ILogService)
], RemoteUserDataProfilesService);
registerSingleton(IRemoteUserDataProfilesService, RemoteUserDataProfilesService, 1 /* InstantiationType.Delayed */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVtb3RlVXNlckRhdGFQcm9maWxlcy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvY29tbW9uL3JlbW90ZVVzZXJEYXRhUHJvZmlsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBcUIsaUJBQWlCLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUMvRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sNERBQTRELENBQUM7QUFDN0YsT0FBTyxFQUE0Qyx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQ3BKLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLDJDQUEyQyxDQUFDO0FBQ2hGLE9BQU8sRUFBRSxlQUFlLEVBQStCLE1BQU0sZ0RBQWdELENBQUM7QUFFOUcsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQy9ELE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUM3RCxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxtRUFBbUUsQ0FBQztBQUM1RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUVyRSxNQUFNLDJCQUEyQixHQUFHLDBCQUEwQixDQUFDO0FBRS9ELE1BQU0sQ0FBQyxNQUFNLDhCQUE4QixHQUFHLGVBQWUsQ0FBaUMsZ0NBQWdDLENBQUMsQ0FBQztBQU9oSSxJQUFNLDZCQUE2QixHQUFuQyxNQUFNLDZCQUE4QixT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