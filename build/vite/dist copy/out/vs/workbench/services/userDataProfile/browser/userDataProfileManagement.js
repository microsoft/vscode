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
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { equals } from '../../../../base/common/objects.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IRequestService, asJson } from '../../../../platform/request/common/request.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { isEmptyWorkspaceIdentifier, IWorkspaceContextService, toWorkspaceIdentifier } from '../../../../platform/workspace/common/workspace.js';
import { CONFIG_NEW_WINDOW_PROFILE } from '../../../common/configuration.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IExtensionService } from '../../extensions/common/extensions.js';
import { IHostService } from '../../host/browser/host.js';
import { IUserDataProfileManagementService, IUserDataProfileService } from '../common/userDataProfile.js';
let UserDataProfileManagementService = class UserDataProfileManagementService extends Disposable {
    constructor(userDataProfilesService, userDataProfileService, hostService, dialogService, workspaceContextService, extensionService, environmentService, productService, requestService, configurationService, uriIdentityService, logService) {
        super();
        this.userDataProfilesService = userDataProfilesService;
        this.userDataProfileService = userDataProfileService;
        this.hostService = hostService;
        this.dialogService = dialogService;
        this.workspaceContextService = workspaceContextService;
        this.extensionService = extensionService;
        this.environmentService = environmentService;
        this.productService = productService;
        this.requestService = requestService;
        this.configurationService = configurationService;
        this.uriIdentityService = uriIdentityService;
        this.logService = logService;
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => this.onDidChangeCurrentProfile(e)));
        this._register(userDataProfilesService.onDidChangeProfiles(e => {
            if (e.removed.some(profile => profile.id === this.userDataProfileService.currentProfile.id)) {
                const profileToUse = this.getProfileToUseForCurrentWorkspace();
                this.switchProfile(profileToUse);
                this.changeCurrentProfile(profileToUse, localize('reload message when removed', "The current profile has been removed. Please reload to switch back to default profile"));
                return;
            }
            const updatedCurrentProfile = e.updated.find(p => this.userDataProfileService.currentProfile.id === p.id);
            if (updatedCurrentProfile) {
                const profileToUse = this.getProfileToUseForCurrentWorkspace();
                if (profileToUse?.id !== updatedCurrentProfile.id) {
                    this.switchProfile(profileToUse);
                    this.changeCurrentProfile(profileToUse, localize('reload message when switched', "The current workspace has been removed from the current profile. Please reload to switch back to the updated profile"));
                }
                else {
                    this.changeCurrentProfile(updatedCurrentProfile, localize('reload message when updated', "The current profile has been updated. Please reload to switch back to the updated profile"));
                }
            }
        }));
    }
    async onDidChangeCurrentProfile(e) {
        if (e.previous.isTransient) {
            await this.userDataProfilesService.cleanUpTransientProfiles();
        }
    }
    getWorkspaceUri() {
        const workspace = this.workspaceContextService.getWorkspace();
        return workspace.configuration ?? workspace.folders[0]?.uri;
    }
    getProfileToUseForCurrentWorkspace() {
        const workspaceUri = this.getWorkspaceUri();
        if (workspaceUri) {
            const profileForWorkspace = this.userDataProfilesService.profiles.find(profile => profile.workspaces?.some(ws => this.uriIdentityService.extUri.isEqual(ws, workspaceUri)));
            if (profileForWorkspace) {
                return profileForWorkspace;
            }
        }
        else {
            // If no workspace is open, use the current profile
            const currentProfile = this.userDataProfilesService.profiles.find(profile => profile.id === this.userDataProfileService.currentProfile.id);
            if (currentProfile) {
                return currentProfile;
            }
        }
        return this.getDefaultProfileToUse();
    }
    getDefaultProfileToUse() {
        const newWindowProfileConfigValue = this.configurationService.getValue(CONFIG_NEW_WINDOW_PROFILE);
        if (newWindowProfileConfigValue) {
            const newWindowProfile = this.userDataProfilesService.profiles.find(profile => profile.name === newWindowProfileConfigValue);
            if (newWindowProfile) {
                return newWindowProfile;
            }
        }
        return this.userDataProfilesService.defaultProfile;
    }
    async createProfile(name, options) {
        return this.userDataProfilesService.createNamedProfile(name, options);
    }
    async createAndEnterProfile(name, options) {
        const profile = await this.userDataProfilesService.createNamedProfile(name, options, toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
        await this.changeCurrentProfile(profile);
        return profile;
    }
    async createAndEnterTransientProfile() {
        const profile = await this.userDataProfilesService.createTransientProfile(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()));
        await this.changeCurrentProfile(profile);
        return profile;
    }
    async updateProfile(profile, updateOptions) {
        if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
            throw new Error(`Profile ${profile.name} does not exist`);
        }
        if (profile.isDefault) {
            throw new Error(localize('cannotRenameDefaultProfile', "Cannot rename the default profile"));
        }
        const updatedProfile = await this.userDataProfilesService.updateProfile(profile, updateOptions);
        return updatedProfile;
    }
    async removeProfile(profile) {
        if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
            throw new Error(`Profile ${profile.name} does not exist`);
        }
        if (profile.isDefault) {
            throw new Error(localize('cannotDeleteDefaultProfile', "Cannot delete the default profile"));
        }
        await this.userDataProfilesService.removeProfile(profile);
    }
    async switchProfile(profile) {
        if (!this.userDataProfilesService.profiles.some(p => p.id === profile.id)) {
            throw new Error(`Profile ${profile.name} does not exist`);
        }
        if (this.userDataProfileService.currentProfile.id === profile.id) {
            return;
        }
        const workspaceUri = this.getWorkspaceUri();
        if (workspaceUri && profile.workspaces?.some(ws => this.uriIdentityService.extUri.isEqual(ws, workspaceUri))) {
            return;
        }
        const workspaceIdentifier = toWorkspaceIdentifier(this.workspaceContextService.getWorkspace());
        await this.userDataProfilesService.setProfileForWorkspace(workspaceIdentifier, profile);
        if (isEmptyWorkspaceIdentifier(workspaceIdentifier)) {
            await this.changeCurrentProfile(profile);
        }
    }
    async getBuiltinProfileTemplates() {
        if (this.productService.profileTemplatesUrl) {
            try {
                const context = await this.requestService.request({ type: 'GET', url: this.productService.profileTemplatesUrl, callSite: 'userDataProfileManagement.getProfileTemplates' }, CancellationToken.None);
                if (context.res.statusCode === 200) {
                    return (await asJson(context)) || [];
                }
                else {
                    this.logService.error('Could not get profile templates.', context.res.statusCode);
                }
            }
            catch (error) {
                this.logService.error(error);
            }
        }
        return [];
    }
    async changeCurrentProfile(profile, reloadMessage) {
        const isRemoteWindow = !!this.environmentService.remoteAuthority;
        const shouldRestartExtensionHosts = this.userDataProfileService.currentProfile.id !== profile.id || !equals(this.userDataProfileService.currentProfile.useDefaultFlags, profile.useDefaultFlags);
        if (shouldRestartExtensionHosts) {
            if (!isRemoteWindow) {
                if (!(await this.extensionService.stopExtensionHosts(localize('switch profile', "Switching to a profile")))) {
                    // If extension host did not stop, do not switch profile
                    if (this.userDataProfilesService.profiles.some(p => p.id === this.userDataProfileService.currentProfile.id)) {
                        await this.userDataProfilesService.setProfileForWorkspace(toWorkspaceIdentifier(this.workspaceContextService.getWorkspace()), this.userDataProfileService.currentProfile);
                    }
                    throw new CancellationError();
                }
            }
        }
        // In a remote window update current profile before reloading so that data is preserved from current profile if asked to preserve
        await this.userDataProfileService.updateCurrentProfile(profile);
        if (shouldRestartExtensionHosts) {
            if (isRemoteWindow) {
                const { confirmed } = await this.dialogService.confirm({
                    message: reloadMessage ?? localize('reload message', "Switching a profile requires reloading VS Code."),
                    primaryButton: localize('reload button', "&&Reload"),
                });
                if (confirmed) {
                    await this.hostService.reload();
                }
            }
            else {
                await this.extensionService.startExtensionHosts();
            }
        }
    }
};
UserDataProfileManagementService = __decorate([
    __param(0, IUserDataProfilesService),
    __param(1, IUserDataProfileService),
    __param(2, IHostService),
    __param(3, IDialogService),
    __param(4, IWorkspaceContextService),
    __param(5, IExtensionService),
    __param(6, IWorkbenchEnvironmentService),
    __param(7, IProductService),
    __param(8, IRequestService),
    __param(9, IConfigurationService),
    __param(10, IUriIdentityService),
    __param(11, ILogService)
], UserDataProfileManagementService);
export { UserDataProfileManagementService };
registerSingleton(IUserDataProfileManagementService, UserDataProfileManagementService, 0 /* InstantiationType.Eager */);
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXNlckRhdGFQcm9maWxlTWFuYWdlbWVudC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy91c2VyRGF0YVByb2ZpbGUvYnJvd3Nlci91c2VyRGF0YVByb2ZpbGVNYW5hZ2VtZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHOzs7Ozs7Ozs7O0FBRWhHLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RFLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUNsRSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFFNUQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUNoRixPQUFPLEVBQXFCLGlCQUFpQixFQUFFLE1BQU0seURBQXlELENBQUM7QUFDL0csT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLHdDQUF3QyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSx1REFBdUQsQ0FBQztBQUN4RixPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBQzdGLE9BQU8sRUFBNkMsd0JBQXdCLEVBQWlDLE1BQU0sZ0VBQWdFLENBQUM7QUFDcEwsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHdCQUF3QixFQUFFLHFCQUFxQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDakos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