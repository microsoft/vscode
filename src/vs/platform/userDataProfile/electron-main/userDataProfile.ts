/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, IUserDataProfilesService, reviveProfile, PROFILES_ENABLEMENT_CONFIG, WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { Promises } from 'vs/base/common/async';
import { StoredProfileAssociations, StoredUserDataProfile, UserDataProfilesService } from 'vs/platform/userDataProfile/node/userDataProfile';
import { IStringDictionary } from 'vs/base/common/collections';

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
	unsetWorkspace(workspaceIdentifier: WorkspaceIdentifier): Promise<void>;
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

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

	override async createProfile(profile: IUserDataProfile, workspaceIdentifier?: WorkspaceIdentifier): Promise<IUserDataProfile> {
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

		this.updateProfiles([profile], []);

		if (workspaceIdentifier) {
			await this.setProfileForWorkspace(profile, workspaceIdentifier);
		}

		return this.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	override async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: WorkspaceIdentifier): Promise<IUserDataProfile> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		profile = reviveProfile(profile, this.profilesHome.scheme);
		this.updateWorkspaceAssociation(workspaceIdentifier, profile);

		return this.profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profile.location))!;
	}

	async unsetWorkspace(workspaceIdentifier: WorkspaceIdentifier): Promise<void> {
		if (!this.enabled) {
			throw new Error(`Settings Profiles are disabled. Enable them via the '${PROFILES_ENABLEMENT_CONFIG}' setting.`);
		}

		this.updateWorkspaceAssociation(workspaceIdentifier);
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

		if (profile.id === this.profilesObject.emptyWindow?.id) {
			this.profilesObject.emptyWindow = undefined;
		}
		for (const workspace of [...this.profilesObject.workspaces.keys()]) {
			if (profile.id === this.profilesObject.workspaces.get(workspace)?.id) {
				this.profilesObject.workspaces.delete(workspace);
			}
		}
		this.saveStoredProfileAssociations();

		this.updateProfiles([], [profile]);

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

	private updateProfiles(added: IUserDataProfile[], removed: IUserDataProfile[]) {
		const storedProfiles: StoredUserDataProfile[] = [];
		for (const profile of [...this.profilesObject.profiles, ...added]) {
			if (profile.isDefault) {
				continue;
			}
			if (removed.some(p => profile.id === p.id)) {
				continue;
			}
			storedProfiles.push({ location: profile.location, name: profile.name, useDefaultFlags: profile.useDefaultFlags });
		}
		this.stateMainService.setItem(UserDataProfilesMainService.PROFILES_KEY, storedProfiles);
		this._profilesObject = undefined;
		this._onDidChangeProfiles.fire({ added, removed, all: this.profiles });
	}

	private updateWorkspaceAssociation(workspaceIdentifier: WorkspaceIdentifier, newProfile?: IUserDataProfile) {
		const workspace = this.getWorkspace(workspaceIdentifier);

		// Folder or Multiroot workspace
		if (URI.isUri(workspace)) {
			this.profilesObject.workspaces.delete(workspace);
			if (newProfile && !newProfile.isDefault) {
				this.profilesObject.workspaces.set(workspace, newProfile);
			}
		}
		// Empty Window
		else {
			this.profilesObject.emptyWindow = !newProfile?.isDefault ? newProfile : undefined;
		}

		this.saveStoredProfileAssociations();
	}

	private saveStoredProfileAssociations() {
		const workspaces: IStringDictionary<string> = {};
		for (const [workspace, profile] of this.profilesObject.workspaces.entries()) {
			workspaces[workspace.toString()] = profile.location.toString();
		}
		const emptyWindow = this.profilesObject.emptyWindow?.location.toString();
		this.stateMainService.setItem(UserDataProfilesMainService.PROFILE_ASSOCIATIONS_KEY, { workspaces, emptyWindow });
		this._profilesObject = undefined;
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		const oldKey = 'workspaceAndProfileInfo';
		const storedWorkspaceInfos = this.stateMainService.getItem<{ workspace: UriComponents; profile: UriComponents }[]>(oldKey, undefined);
		if (storedWorkspaceInfos) {
			this.stateMainService.removeItem(oldKey);
			const workspaces = storedWorkspaceInfos.reduce<IStringDictionary<string>>((result, { workspace, profile }) => {
				result[URI.revive(workspace).toString()] = URI.revive(profile).toString();
				return result;
			}, {});
			this.stateMainService.setItem(UserDataProfilesMainService.PROFILE_ASSOCIATIONS_KEY, <StoredProfileAssociations>{ workspaces });
		}
		return super.getStoredProfileAssociations();
	}

}
