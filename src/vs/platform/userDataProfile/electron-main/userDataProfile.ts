/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UseDefaultProfileFlags, IUserDataProfile, IUserDataProfilesService, reviveProfile, PROFILES_ENABLEMENT_CONFIG } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { Promises } from 'vs/base/common/async';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/node/userDataProfile';

export type WillCreateProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export type WillRemoveProfileEvent = {
	profile: IUserDataProfile;
	join(promise: Promise<void>): void;
};

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

type StoredUserDataProfile = {
	name: string;
	location: URI;
	useDefaultFlags?: UseDefaultProfileFlags;
};

type StoredWorkspaceInfo = {
	workspace: URI;
	profile: URI;
};

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesMainService {

	private readonly _onWillCreateProfile = this._register(new Emitter<WillCreateProfileEvent>());
	readonly onWillCreateProfile = this._onWillCreateProfile.event;

	private readonly _onWillRemoveProfile = this._register(new Emitter<WillRemoveProfileEvent>());
	readonly onWillRemoveProfile = this._onWillRemoveProfile.event;

	constructor(
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(stateMainService, uriIdentityService, environmentService, fileService, logService);
	}

	override async createProfile(profile: IUserDataProfile, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		profile = reviveProfile(profile, this.profilesHome.scheme);
		if (this.getStoredProfiles().some(p => p.name === profile.name)) {
			throw new Error(`Profile with name ${profile.name} already exists`);
		}

		if (!(await this.fileService.exists(this.profilesHome))) {
			await this.fileService.createFolder(this.profilesHome);
		}

		const joiners: Promise<void>[] = [];
		this._onWillCreateProfile.fire({
			profile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);

		const storedProfile: StoredUserDataProfile = { name: profile.name, location: profile.location, useDefaultFlags: profile.useDefaultFlags };
		const storedProfiles = [...this.getStoredProfiles(), storedProfile];
		this.setStoredProfiles(storedProfiles, [profile], []);
		if (workspaceIdentifier) {
			await this.setProfileForWorkspace(profile, workspaceIdentifier);
		}
		return this.profilesObject.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	override async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		profile = reviveProfile(profile, this.profilesHome.scheme);
		const workspace = this.getWorkspace(workspaceIdentifier);
		const storedWorkspaceInfos = this.getStoredWorskpaceInfos().filter(info => !this.uriIdentityService.extUri.isEqual(info.workspace, workspace));
		if (!profile.isDefault) {
			storedWorkspaceInfos.push({ workspace, profile: profile.location });
		}
		this.setStoredWorskpaceInfos(storedWorkspaceInfos);
		return this.profilesObject.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	override async removeProfile(profile: IUserDataProfile): Promise<void> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}
		if (profile.isDefault) {
			throw new Error('Cannot remove default profile');
		}
		profile = reviveProfile(profile, this.profilesHome.scheme);
		if (!this.getStoredProfiles().some(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))) {
			throw new Error(`Profile with name ${profile.name} does not exist`);
		}

		const joiners: Promise<void>[] = [];
		this._onWillRemoveProfile.fire({
			profile,
			join(promise) {
				joiners.push(promise);
			}
		});
		await Promises.settled(joiners);

		this.setStoredWorskpaceInfos(this.getStoredWorskpaceInfos().filter(p => !this.uriIdentityService.extUri.isEqual(p.profile, profile.location)));
		this.setStoredProfiles(this.getStoredProfiles().filter(p => !this.uriIdentityService.extUri.isEqual(p.location, profile.location)), [], [profile]);

		try {
			if (this.profiles.length === 2) {
				await this.fileService.del(this.profilesHome, { recursive: true });
			} else {
				await this.fileService.del(profile.location, { recursive: true });
			}
		} catch (error) {
			this.logService.error(error);
		}
	}

	private setStoredProfiles(storedProfiles: StoredUserDataProfile[], added: IUserDataProfile[], removed: IUserDataProfile[]): void {
		this.stateMainService.setItem(UserDataProfilesMainService.PROFILES_KEY, storedProfiles);
		this._profilesObject = undefined;
		this._onDidChangeProfiles.fire({ added, removed, all: this.profiles });
	}

	private setStoredWorskpaceInfos(storedWorkspaceInfos: StoredWorkspaceInfo[]) {
		this.stateMainService.setItem(UserDataProfilesMainService.WORKSPACE_PROFILE_INFO_KEY, storedWorkspaceInfos);
		this._profilesObject = undefined;
	}

}
