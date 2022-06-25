/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceMap } from 'vs/base/common/map';
import { revive } from 'vs/base/common/marshalling';
import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UseDefaultProfileFlags, IUserDataProfile, IUserDataProfilesService, UserDataProfilesService as BaseUserDataProfilesService, toUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

type UserDataProfilesObject = {
	profiles: IUserDataProfile[];
	workspaces: ResourceMap<IUserDataProfile>;
};

type StoredUserDataProfile = {
	name: string;
	location: URI;
	useDefaultFlags?: UseDefaultProfileFlags;
};

type StoredWorkspaceInfo = {
	workspace: URI;
	profile: URI;
};

export class UserDataProfilesService extends BaseUserDataProfilesService implements IUserDataProfilesService {

	protected static readonly PROFILES_KEY = 'userDataProfiles';
	protected static readonly WORKSPACE_PROFILE_INFO_KEY = 'workspaceAndProfileInfo';

	protected enabled: boolean = false;

	constructor(
		@IStateService private readonly stateService: IStateService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, logService);
	}

	setEnablement(enabled: boolean): void {
		this._profilesObject = undefined;
		this.enabled = enabled;
	}

	protected _profilesObject: UserDataProfilesObject | undefined;
	protected get profilesObject(): UserDataProfilesObject {
		if (!this.enabled) {
			return { profiles: [], workspaces: new ResourceMap() };
		}
		if (!this._profilesObject) {
			const profiles = this.getStoredProfiles().map<IUserDataProfile>(storedProfile => toUserDataProfile(storedProfile.name, storedProfile.location, storedProfile.useDefaultFlags));
			const workspaces = new ResourceMap<IUserDataProfile>();
			if (profiles.length) {
				profiles.unshift(this.createDefaultUserDataProfile(true));
				for (const workspaceProfileInfo of this.getStoredWorskpaceInfos()) {
					const profile = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, workspaceProfileInfo.profile));
					if (profile) {
						workspaces.set(workspaceProfileInfo.workspace, profile);
					}
				}
			}
			this._profilesObject = { profiles, workspaces };
		}
		return this._profilesObject;
	}

	override get profiles(): IUserDataProfile[] { return this.profilesObject.profiles; }

	override getProfile(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): IUserDataProfile {
		return this.profilesObject.workspaces.get(this.getWorkspace(workspaceIdentifier)) ?? this.defaultProfile;
	}

	protected getWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier) {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) ? workspaceIdentifier.uri : workspaceIdentifier.configPath;
	}

	protected getStoredProfiles(): StoredUserDataProfile[] {
		return revive(this.stateService.getItem<UriDto<StoredUserDataProfile>[]>(UserDataProfilesService.PROFILES_KEY, []));
	}

	protected getStoredWorskpaceInfos(): StoredWorkspaceInfo[] {
		return revive(this.stateService.getItem<UriDto<StoredWorkspaceInfo>[]>(UserDataProfilesService.WORKSPACE_PROFILE_INFO_KEY, []));
	}

}
