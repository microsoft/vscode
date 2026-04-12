/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionManagementChannelClient as BaseExtensionManagementChannelClient } from '../../../../platform/extensionManagement/common/extensionManagementIpc.js';
import { Emitter } from '../../../../base/common/event.js';
import { delta } from '../../../../base/common/arrays.js';
import { compare } from '../../../../base/common/strings.js';
export class ProfileAwareExtensionManagementChannelClient extends BaseExtensionManagementChannelClient {
    get onProfileAwareDidInstallExtensions() { return this._onDidProfileAwareInstallExtensions.event; }
    get onProfileAwareDidUninstallExtension() { return this._onDidProfileAwareUninstallExtension.event; }
    get onProfileAwareDidUpdateExtensionMetadata() { return this._onDidProfileAwareUpdateExtensionMetadata.event; }
    constructor(channel, productService, allowedExtensionsService, userDataProfileService, uriIdentityService) {
        super(channel, productService, allowedExtensionsService);
        this.userDataProfileService = userDataProfileService;
        this.uriIdentityService = uriIdentityService;
        this._onDidChangeProfile = this._register(new Emitter());
        this.onDidChangeProfile = this._onDidChangeProfile.event;
        this._onDidProfileAwareInstallExtensions = this._register(new Emitter());
        this._onDidProfileAwareUninstallExtension = this._register(new Emitter());
        this._onDidProfileAwareUpdateExtensionMetadata = this._register(new Emitter());
        this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
            if (!this.uriIdentityService.extUri.isEqual(e.previous.extensionsResource, e.profile.extensionsResource)) {
                e.join(this.whenProfileChanged(e));
            }
        }));
    }
    async onInstallExtensionEvent(data) {
        const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
        if (result instanceof Promise ? await result : result) {
            this._onInstallExtension.fire(data);
        }
    }
    async onDidInstallExtensionsEvent(results) {
        const filtered = [];
        for (const e of results) {
            const result = this.filterEvent(e.profileLocation, e.applicationScoped ?? e.local?.isApplicationScoped ?? false);
            if (result instanceof Promise ? await result : result) {
                filtered.push(e);
            }
        }
        if (filtered.length) {
            this._onDidInstallExtensions.fire(filtered);
        }
        this._onDidProfileAwareInstallExtensions.fire(results);
    }
    async onUninstallExtensionEvent(data) {
        const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
        if (result instanceof Promise ? await result : result) {
            this._onUninstallExtension.fire(data);
        }
    }
    async onDidUninstallExtensionEvent(data) {
        const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
        if (result instanceof Promise ? await result : result) {
            this._onDidUninstallExtension.fire(data);
        }
        this._onDidProfileAwareUninstallExtension.fire(data);
    }
    async onDidUpdateExtensionMetadataEvent(data) {
        const result = this.filterEvent(data.profileLocation, data.local?.isApplicationScoped ?? false);
        if (result instanceof Promise ? await result : result) {
            this._onDidUpdateExtensionMetadata.fire(data);
        }
        this._onDidProfileAwareUpdateExtensionMetadata.fire(data);
    }
    async install(vsix, installOptions) {
        installOptions = { ...installOptions, profileLocation: await this.getProfileLocation(installOptions?.profileLocation) };
        return super.install(vsix, installOptions);
    }
    async installFromLocation(location, profileLocation) {
        return super.installFromLocation(location, await this.getProfileLocation(profileLocation));
    }
    async installFromGallery(extension, installOptions) {
        installOptions = { ...installOptions, profileLocation: await this.getProfileLocation(installOptions?.profileLocation) };
        return super.installFromGallery(extension, installOptions);
    }
    async installGalleryExtensions(extensions) {
        const infos = [];
        for (const extension of extensions) {
            infos.push({ ...extension, options: { ...extension.options, profileLocation: await this.getProfileLocation(extension.options?.profileLocation) } });
        }
        return super.installGalleryExtensions(infos);
    }
    async uninstall(extension, options) {
        options = { ...options, profileLocation: await this.getProfileLocation(options?.profileLocation) };
        return super.uninstall(extension, options);
    }
    async uninstallExtensions(extensions) {
        const infos = [];
        for (const { extension, options } of extensions) {
            infos.push({ extension, options: { ...options, profileLocation: await this.getProfileLocation(options?.profileLocation) } });
        }
        return super.uninstallExtensions(infos);
    }
    async getInstalled(type = null, extensionsProfileResource, productVersion) {
        return super.getInstalled(type, await this.getProfileLocation(extensionsProfileResource), productVersion);
    }
    async updateMetadata(local, metadata, extensionsProfileResource) {
        return super.updateMetadata(local, metadata, await this.getProfileLocation(extensionsProfileResource));
    }
    async toggleApplicationScope(local, fromProfileLocation) {
        return super.toggleApplicationScope(local, await this.getProfileLocation(fromProfileLocation));
    }
    async copyExtensions(fromProfileLocation, toProfileLocation) {
        return super.copyExtensions(await this.getProfileLocation(fromProfileLocation), await this.getProfileLocation(toProfileLocation));
    }
    async whenProfileChanged(e) {
        const previousProfileLocation = await this.getProfileLocation(e.previous.extensionsResource);
        const currentProfileLocation = await this.getProfileLocation(e.profile.extensionsResource);
        if (this.uriIdentityService.extUri.isEqual(previousProfileLocation, currentProfileLocation)) {
            return;
        }
        const eventData = await this.switchExtensionsProfile(previousProfileLocation, currentProfileLocation);
        this._onDidChangeProfile.fire(eventData);
    }
    async switchExtensionsProfile(previousProfileLocation, currentProfileLocation, preserveExtensions) {
        const oldExtensions = await this.getInstalled(1 /* ExtensionType.User */, previousProfileLocation);
        const newExtensions = await this.getInstalled(1 /* ExtensionType.User */, currentProfileLocation);
        if (preserveExtensions?.length) {
            const extensionsToInstall = [];
            for (const extension of oldExtensions) {
                if (preserveExtensions.some(id => ExtensionIdentifier.equals(extension.identifier.id, id)) &&
                    !newExtensions.some(e => ExtensionIdentifier.equals(e.identifier.id, extension.identifier.id))) {
                    extensionsToInstall.push(extension.identifier);
                }
            }
            if (extensionsToInstall.length) {
                await this.installExtensionsFromProfile(extensionsToInstall, previousProfileLocation, currentProfileLocation);
            }
        }
        return delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
    }
    async getProfileLocation(profileLocation) {
        return profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0ZW5zaW9uTWFuYWdlbWVudENoYW5uZWxDbGllbnQuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudENoYW5uZWxDbGllbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFJaEcsT0FBTyxFQUFFLG1CQUFtQixFQUF1QyxNQUFNLHNEQUFzRCxDQUFDO0FBQ2hJLE9BQU8sRUFBRSxnQ0FBZ0MsSUFBSSxvQ0FBb0MsRUFBRSxNQUFNLDJFQUEyRSxDQUFDO0FBR3JLLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxrQ0FBa0MsQ0FBQztBQUMzRCxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFDMUQsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLG9DQUFvQyxDQUFDO0FBSzdELE1BQU0sT0FBZ0IsNENBQTZDLFNBQVEsb0NBQW9DO0lBTTlHLElBQUksa0NBQWtDLEtBQUssT0FBTyxJQUFJLENBQUMsbUNBQW1DLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztJQUduRyxJQUFJLG1DQUFtQyxLQUFLLE9BQU8sSUFBSSxDQUFDLG9DQUFvQyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFHckcsSUFBSSx3Q0FBd0MsS0FBSyxPQUFPLElBQUksQ0FBQyx5Q0FBeUMsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRS9HLFlBQVksT0FBaUIsRUFDNUIsY0FBK0IsRUFDL0Isd0JBQW1ELEVBQ2hDLHNCQUErQyxFQUMvQyxrQkFBdUM7UUFFMUQsS0FBSyxDQUFDLE9BQU8sRUFBRSxjQUFjLEVBQUUsd0JBQXdCLENBQUMsQ0FBQztRQUh0QywyQkFBc0IsR0FBdEIsc0JBQXNCLENBQXlCO1FBQy9DLHVCQUFrQixHQUFsQixr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