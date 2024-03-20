/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { URI } from 'vs/base/common/uri';
import { DidChangeProfileEvent, IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IRemoteUserDataProfilesService } from 'vs/workbench/services/userDataProfile/common/remoteUserDataProfiles';
import { ProfileAwareExtensionManagementChannelClient } from 'vs/workbench/services/extensionManagement/common/extensionManagementChannelClient';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ExtensionEventResult } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class RemoteExtensionManagementService extends ProfileAwareExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	constructor(
		channel: IChannel,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IRemoteUserDataProfilesService private readonly remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(channel, userDataProfileService, uriIdentityService);
	}

	protected async filterEvent(e: ExtensionEventResult): Promise<boolean> {
		if (e.applicationScoped) {
			return true;
		}
		if (!e.profileLocation && this.userDataProfileService.currentProfile.isDefault) {
			return true;
		}
		const currentRemoteProfile = await this.remoteUserDataProfilesService.getRemoteProfile(this.userDataProfileService.currentProfile);
		if (this.uriIdentityService.extUri.isEqual(currentRemoteProfile.extensionsResource, e.profileLocation)) {
			return true;
		}
		return false;
	}

	protected override getProfileLocation(profileLocation: URI): Promise<URI>;
	protected override getProfileLocation(profileLocation?: URI): Promise<URI | undefined>;
	protected override async getProfileLocation(profileLocation?: URI): Promise<URI | undefined> {
		if (!profileLocation && this.userDataProfileService.currentProfile.isDefault) {
			return undefined;
		}
		profileLocation = await super.getProfileLocation(profileLocation);
		let profile = this.userDataProfilesService.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.extensionsResource, profileLocation));
		if (profile) {
			profile = await this.remoteUserDataProfilesService.getRemoteProfile(profile);
		} else {
			profile = (await this.remoteUserDataProfilesService.getRemoteProfiles()).find(p => this.uriIdentityService.extUri.isEqual(p.extensionsResource, profileLocation));
		}
		return profile?.extensionsResource;
	}

	protected override async switchExtensionsProfile(previousProfileLocation: URI, currentProfileLocation: URI, preserveExtensions?: ExtensionIdentifier[]): Promise<DidChangeProfileEvent> {
		const remoteProfiles = await this.remoteUserDataProfilesService.getRemoteProfiles();
		const previousProfile = remoteProfiles.find(p => this.uriIdentityService.extUri.isEqual(p.extensionsResource, previousProfileLocation));
		const currentProfile = remoteProfiles.find(p => this.uriIdentityService.extUri.isEqual(p.extensionsResource, currentProfileLocation));
		if (previousProfile?.id === currentProfile?.id) {
			return { added: [], removed: [] };
		}
		return super.switchExtensionsProfile(previousProfileLocation, currentProfileLocation, preserveExtensions);
	}
}
