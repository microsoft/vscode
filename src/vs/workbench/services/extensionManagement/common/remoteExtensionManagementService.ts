/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { URI } from '../../../../base/common/uri.js';
import { DidChangeProfileEvent, IProfileAwareExtensionManagementService } from './extensionManagement.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IRemoteUserDataProfilesService } from '../../userDataProfile/common/remoteUserDataProfiles.js';
import { ProfileAwareExtensionManagementChannelClient } from './extensionManagementChannelClient.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';

export class RemoteExtensionManagementService extends ProfileAwareExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	constructor(
		channel: IChannel,
		@IProductService productService: IProductService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
		@IUserDataProfileService userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IRemoteUserDataProfilesService private readonly remoteUserDataProfilesService: IRemoteUserDataProfilesService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(channel, productService, allowedExtensionsService, userDataProfileService, uriIdentityService);
	}

	protected async filterEvent(profileLocation: URI, applicationScoped: boolean): Promise<boolean> {
		if (applicationScoped) {
			return true;
		}
		if (!profileLocation && this.userDataProfileService.currentProfile.isDefault) {
			return true;
		}
		const currentRemoteProfile = await this.remoteUserDataProfilesService.getRemoteProfile(this.userDataProfileService.currentProfile);
		if (this.uriIdentityService.extUri.isEqual(currentRemoteProfile.extensionsResource, profileLocation)) {
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
