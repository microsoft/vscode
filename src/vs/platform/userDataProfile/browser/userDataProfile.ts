/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from 'vs/base/common/marshalling';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService, PROFILES_ENABLEMENT_CONFIG, StoredProfileAssociations, StoredUserDataProfile, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class BrowserUserDataProfilesService extends UserDataProfilesService implements IUserDataProfilesService {

	protected override readonly defaultProfileShouldIncludeExtensionsResourceAlways: boolean = true;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, uriIdentityService, logService);
		super.setEnablement(window.localStorage.getItem(PROFILES_ENABLEMENT_CONFIG) === 'true');
	}

	override setEnablement(enabled: boolean): void {
		super.setEnablement(enabled);
		window.localStorage.setItem(PROFILES_ENABLEMENT_CONFIG, enabled ? 'true' : 'false');
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		try {
			const value = window.localStorage.getItem(UserDataProfilesService.PROFILES_KEY);
			if (value) {
				return revive(JSON.parse(value));
			}
		} catch (error) {
			/* ignore */
			this.logService.error(error);
		}
		return [];
	}

	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void {
		window.localStorage.setItem(UserDataProfilesService.PROFILES_KEY, JSON.stringify(storedProfiles));
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		try {
			const value = window.localStorage.getItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY);
			if (value) {
				return revive(JSON.parse(value));
			}
		} catch (error) {
			/* ignore */
			this.logService.error(error);
		}
		return {};
	}

	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void {
		window.localStorage.setItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, JSON.stringify(storedProfileAssociations));
	}

}
