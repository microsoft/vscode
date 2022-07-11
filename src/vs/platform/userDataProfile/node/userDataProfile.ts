/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { revive } from 'vs/base/common/marshalling';
import { UriDto } from 'vs/base/common/types';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService, UserDataProfilesService as BaseUserDataProfilesService, StoredUserDataProfile, StoredProfileAssociations } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataProfilesService extends BaseUserDataProfilesService implements IUserDataProfilesService {

	constructor(
		@IStateService private readonly stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, uriIdentityService, logService);
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		return revive(this.stateService.getItem<UriDto<StoredUserDataProfile>[]>(UserDataProfilesService.PROFILES_KEY, []));
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		return revive(this.stateService.getItem<UriDto<StoredProfileAssociations>>(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, {}));
	}

}
