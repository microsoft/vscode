/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { refineServiceDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService, WorkspaceIdentifier, StoredUserDataProfile, StoredProfileAssociations, WillCreateProfileEvent, WillRemoveProfileEvent, IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { UserDataProfilesService } from 'vs/platform/userDataProfile/node/userDataProfile';
import { IStringDictionary } from 'vs/base/common/collections';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';

export const IUserDataProfilesMainService = refineServiceDecorator<IUserDataProfilesService, IUserDataProfilesMainService>(IUserDataProfilesService);
export interface IUserDataProfilesMainService extends IUserDataProfilesService {
	isEnabled(): boolean;
	getOrSetProfileForWorkspace(workspaceIdentifier: WorkspaceIdentifier, profileToSet?: IUserDataProfile): IUserDataProfile;
	setProfileForWorkspaceSync(workspaceIdentifier: WorkspaceIdentifier, profileToSet: IUserDataProfile): void;
	checkAndCreateProfileFromCli(args: NativeParsedArgs): Promise<NativeParsedArgs> | undefined;
	unsetWorkspace(workspaceIdentifier: WorkspaceIdentifier, transient?: boolean): void;
	readonly onWillCreateProfile: Event<WillCreateProfileEvent>;
	readonly onWillRemoveProfile: Event<WillRemoveProfileEvent>;
}

export class UserDataProfilesMainService extends UserDataProfilesService implements IUserDataProfilesMainService {

	constructor(
		@IStateMainService private readonly stateMainService: IStateMainService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(stateMainService, uriIdentityService, environmentService, fileService, logService);
	}

	override setEnablement(enabled: boolean): void {
		super.setEnablement(enabled);
		if (!this.enabled) {
			// reset
			this.saveStoredProfiles([]);
			this.saveStoredProfileAssociations({});
		}
	}

	isEnabled(): boolean {
		return this.enabled;
	}

	checkAndCreateProfileFromCli(args: NativeParsedArgs): Promise<NativeParsedArgs> | undefined {
		if (!this.isEnabled()) {
			return undefined;
		}
		// Do not create the profile if folder/file arguments are not provided
		if (!args._.length && !args['folder-uri'] && !args['file-uri']) {
			return undefined;
		}
		if (args.profile) {
			if (this.profiles.some(p => p.name === args.profile)) {
				return undefined;
			}
			return this.createProfile(args.profile).then(() => args);
		}
		if (args['profile-temp']) {
			return this.createTransientProfile()
				.then(profile => {
					// Set the profile name to use
					args.profile = profile.name;
					return args;
				});
		}
		return undefined;
	}

	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void {
		if (storedProfiles.length) {
			this.stateMainService.setItem(UserDataProfilesMainService.PROFILES_KEY, storedProfiles);
		} else {
			this.stateMainService.removeItem(UserDataProfilesMainService.PROFILES_KEY);
		}
	}

	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void {
		if (storedProfileAssociations.emptyWindow || storedProfileAssociations.workspaces) {
			this.stateMainService.setItem(UserDataProfilesMainService.PROFILE_ASSOCIATIONS_KEY, storedProfileAssociations);
		} else {
			this.stateMainService.removeItem(UserDataProfilesMainService.PROFILE_ASSOCIATIONS_KEY);
		}
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
