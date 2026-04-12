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
var UserDataProfilesReadonlyService_1, UserDataProfilesService_1;
import { URI } from '../../../base/common/uri.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IStateReadService, IStateService } from '../../state/node/state.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { UserDataProfilesService as BaseUserDataProfilesService } from '../common/userDataProfile.js';
import { isString } from '../../../base/common/types.js';
import { StateService } from '../../state/node/stateService.js';
let UserDataProfilesReadonlyService = UserDataProfilesReadonlyService_1 = class UserDataProfilesReadonlyService extends BaseUserDataProfilesService {
    constructor(stateReadonlyService, uriIdentityService, nativeEnvironmentService, fileService, logService) {
        super(nativeEnvironmentService, fileService, uriIdentityService, logService);
        this.stateReadonlyService = stateReadonlyService;
        this.nativeEnvironmentService = nativeEnvironmentService;
    }
    getStoredProfiles() {
        const storedProfilesState = this.stateReadonlyService.getItem(UserDataProfilesReadonlyService_1.PROFILES_KEY, []);
        return storedProfilesState.map(p => ({
            ...p,
            location: isString(p.location) ? this.uriIdentityService.extUri.joinPath(this.profilesHome, p.location) : URI.revive(p.location),
        }));
    }
    getStoredProfileAssociations() {
        return this.stateReadonlyService.getItem(UserDataProfilesReadonlyService_1.PROFILE_ASSOCIATIONS_KEY, {});
    }
    getDefaultProfileExtensionsLocation() {
        return this.uriIdentityService.extUri.joinPath(URI.file(this.nativeEnvironmentService.extensionsPath).with({ scheme: this.profilesHome.scheme }), 'extensions.json');
    }
};
UserDataProfilesReadonlyService = UserDataProfilesReadonlyService_1 = __decorate([
    __param(0, IStateReadService),
    __param(1, IUriIdentityService),
    __param(2, INativeEnvironmentService),
    __param(3, IFileService),
    __param(4, ILogService)
], UserDataProfilesReadonlyService);
export { UserDataProfilesReadonlyService };
let UserDataProfilesService = UserDataProfilesService_1 = class UserDataProfilesService extends UserDataProfilesReadonlyService {
    constructor(stateService, uriIdentityService, environmentService, fileService, logService) {
        super(stateService, uriIdentityService, environmentService, fileService, logService);
        this.stateService = stateService;
    }
    saveStoredProfiles(storedProfiles) {
        if (storedProfiles.length) {
            this.stateService.setItem(UserDataProfilesService_1.PROFILES_KEY, storedProfiles.map(profile => ({ ...profile, location: this.uriIdentityService.extUri.relativePath(this.profilesHome, profile.location) })));
        }
        else {
            this.stateService.removeItem(UserDataProfilesService_1.PROFILES_KEY);
        }
    }
    saveStoredProfileAssociations(storedProfileAssociations) {
        if (storedProfileAssociations.emptyWindows || storedProfileAssociations.workspaces) {
            this.stateService.setItem(UserDataProfilesService_1.PROFILE_ASSOCIATIONS_KEY, storedProfileAssociations);
        }
        else {
            this.stateService.removeItem(UserDataProfilesService_1.PROFILE_ASSOCIATIONS_KEY);
        }
    }
};
UserDataProfilesService = UserDataProfilesService_1 = __decorate([
    __param(0, IStateService),
    __param(1, IUriIdentityService),
    __param(2, INativeEnvironmentService),
    __param(3, IFileService),
    __param(4, ILogService)
], UserDataProfilesService);
export { UserDataProfilesService };
let ServerUserDataProfilesService = class ServerUserDataProfilesService extends UserDataProfilesService {
    constructor(uriIdentityService, environmentService, fileService, logService) {
        super(new StateService(0 /* SaveStrategy.IMMEDIATE */, environmentService, logService, fileService), uriIdentityService, environmentService, fileService, logService);
    }
    async init() {
        await this.stateService.init();
        return super.init();
    }
};
ServerUserDataProfilesService = __decorate([
    __param(0, IUriIdentityService),
    __param(1, INativeEnvironmentService),
    __param(2, IFileService),
    __param(3, ILogService)
], ServerUserDataProfilesService);
export { ServerUserDataProfilesService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvcGxhdGZvcm0vdXNlckRhdGFQcm9maWxlL25vZGUvdXNlckRhdGFQcm9maWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsR0FBRyxFQUFVLE1BQU0sNkJBQTZCLENBQUM7QUFDMUQsT0FBTyxFQUFFLHlCQUF5QixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDcEYsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUN0RCxPQUFPLEVBQUUsaUJBQWlCLEVBQUUsYUFBYSxFQUFFLE1BQU0sMkJBQTJCLENBQUM7QUFDN0UsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDOUUsT0FBTyxFQUE0Qix1QkFBdUIsSUFBSSwyQkFBMkIsRUFBb0QsTUFBTSw4QkFBOEIsQ0FBQztBQUNsTCxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDekQsT0FBTyxFQUFnQixZQUFZLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUl2RSxJQUFNLCtCQUErQix1Q0FBckMsTUFBTSwrQkFBZ0MsU0FBUSwyQkFBMkI7SUFFL0UsWUFDcUMsb0JBQXVDLEVBQ3RELGtCQUF1QyxFQUNoQix3QkFBbUQsRUFDakYsV0FBeUIsRUFDMUIsVUFBdUI7UUFFcEMsS0FBSyxDQUFDLHdCQUF3QixFQUFFLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxVQUFVLENBQUMsQ0FBQztRQU56Qyx5QkFBb0IsR0FBcEIsb0JBQW9CLENBQW1CO1FBRS9CLDZCQUF3QixHQUF4Qix3QkFBd0IsQ0FBMkI7SUFLaEcsQ0FBQztJQUVrQixpQkFBaUI7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