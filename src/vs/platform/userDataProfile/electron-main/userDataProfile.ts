/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesService {

	private static CURRENT_PROFILE_KEY = 'currentUserDataProfile';

	constructor(
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(undefined, undefined, environmentService, fileService, logService);
	}

	async init(): Promise<void> {
		const profileName = this.stateMainService.getItem<string>(UserDataProfilesMainService.CURRENT_PROFILE_KEY);
		if (profileName) {
			const profiles = await this.getAllProfiles();
			const profile = profiles.find(p => p.name === profileName);
			if (profile || (profileName === UserDataProfilesMainService.DEFAULT_PROFILE_NAME && profiles.length > 1)) {
				this._defaultProfile = this.createProfile(UserDataProfilesService.DEFAULT_PROFILE_NAME);
				this._currentProfile = profileName === UserDataProfilesMainService.DEFAULT_PROFILE_NAME ? this._defaultProfile : profile ?? this._defaultProfile;
			} else {
				this.stateMainService?.removeItem(UserDataProfilesMainService.CURRENT_PROFILE_KEY);
			}
		}
	}

	override async setProfile(name: string): Promise<void> {
		this.stateMainService?.setItem(UserDataProfilesMainService.CURRENT_PROFILE_KEY, name);
	}

}

