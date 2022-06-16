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
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ProfileOptions, DefaultOptions, IUserDataProfile, IUserDataProfilesService, UserDataProfilesService, reviveProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

type UserDataProfilesObject = {
	profiles: IUserDataProfile[];
	workspaces: ResourceMap<IUserDataProfile>;
};

type StoredUserDataProfile = {
	name: string;
	location: URI;
	options: ProfileOptions;
};

type StoredWorkspaceInfo = {
	workspace: URI;
	profile: URI;
};

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesService {

	private static readonly PROFILES_KEY = 'userDataProfiles';
	private static readonly WORKSPACE_PROFILE_INFO_KEY = 'workspaceAndProfileInfo';

	constructor(
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(undefined, undefined, environmentService, fileService, logService);
	}

	init(): void {
		if (this.storedProfiles.length) {
			this._defaultProfile = this.toUserDataProfile(this.defaultProfile.name, this.defaultProfile.location, DefaultOptions, true);
		}
	}

	private _profilesObject: UserDataProfilesObject | undefined;
	private get profilesObject(): UserDataProfilesObject {
		if (!this._profilesObject) {
			const profiles = this.storedProfiles.map(storedProfile => this.toUserDataProfile(storedProfile.name, storedProfile.location, storedProfile.options, this.defaultProfile));
			profiles.unshift(this.defaultProfile);
			const workspaces = this.storedWorskpaceInfos.reduce((workspaces, workspaceProfileInfo) => {
				const profile = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, workspaceProfileInfo.profile));
				if (profile) {
					workspaces.set(workspaceProfileInfo.workspace, profile);
				}
				return workspaces;
			}, new ResourceMap<IUserDataProfile>());
			this._profilesObject = { profiles: profiles, workspaces: workspaces };
		}
		return this._profilesObject;
	}

	override get profiles(): IUserDataProfile[] { return this.profilesObject.profiles; }

	override async getAllProfiles(): Promise<IUserDataProfile[]> {
		return this.profiles;
	}

	override getProfile(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): IUserDataProfile {
		return this.profilesObject.workspaces.get(this.getWorkspace(workspaceIdentifier)) ?? this.defaultProfile;
	}

	override async createProfile(profile: IUserDataProfile, options: ProfileOptions, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		profile = reviveProfile(profile, this.profilesHome.scheme);
		if (this.storedProfiles.some(p => p.name === profile.name)) {
			throw new Error(`Profile with name ${profile.name} already exists`);
		}
		const storedProfile: StoredUserDataProfile = { name: profile.name, location: profile.location, options };
		const storedProfiles = [...this.storedProfiles, storedProfile];
		this.storedProfiles = storedProfiles;
		if (workspaceIdentifier) {
			await this.setProfileForWorkspace(profile, workspaceIdentifier);
		}
		return this.profilesObject.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	override async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		profile = reviveProfile(profile, this.profilesHome.scheme);
		const workspace = this.getWorkspace(workspaceIdentifier);
		const storedWorkspaceInfos = this.storedWorskpaceInfos.filter(info => !this.uriIdentityService.extUri.isEqual(info.workspace, workspace));
		if (!profile.isDefault) {
			storedWorkspaceInfos.push({ workspace, profile: profile.location });
		}
		this.storedWorskpaceInfos = storedWorkspaceInfos;
		return this.profilesObject.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	private getWorkspace(workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier) {
		return isSingleFolderWorkspaceIdentifier(workspaceIdentifier) ? workspaceIdentifier.uri : workspaceIdentifier.configPath;
	}

	override async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (profile.isDefault) {
			throw new Error('Cannot remove default profile');
		}
		profile = reviveProfile(profile, this.profilesHome.scheme);
		if (!this.storedProfiles.some(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))) {
			throw new Error(`Profile with name ${profile.name} does not exist`);
		}
		this.storedWorskpaceInfos = this.storedWorskpaceInfos.filter(p => !this.uriIdentityService.extUri.isEqual(p.profile, profile.location));
		this.storedProfiles = this.storedProfiles.filter(p => !this.uriIdentityService.extUri.isEqual(p.location, profile.location));
	}

	private get storedProfiles(): StoredUserDataProfile[] {
		return revive(this.stateMainService.getItem<UriDto<StoredUserDataProfile>[]>(UserDataProfilesMainService.PROFILES_KEY, []));
	}

	private set storedProfiles(storedProfiles: StoredUserDataProfile[]) {
		this.stateMainService.setItem(UserDataProfilesMainService.PROFILES_KEY, storedProfiles);
		this._profilesObject = undefined;
		this._onDidChangeProfiles.fire(this.profiles);
	}

	private get storedWorskpaceInfos(): StoredWorkspaceInfo[] {
		return revive(this.stateMainService.getItem<UriDto<StoredWorkspaceInfo>[]>(UserDataProfilesMainService.WORKSPACE_PROFILE_INFO_KEY, []));
	}

	private set storedWorskpaceInfos(storedWorkspaceInfos: StoredWorkspaceInfo[]) {
		this.stateMainService.setItem(UserDataProfilesMainService.WORKSPACE_PROFILE_INFO_KEY, storedWorkspaceInfos);
		this._profilesObject = undefined;
	}

}
