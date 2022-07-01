/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IStringDictionary } from 'vs/base/common/collections';
import { ResourceMap } from 'vs/base/common/map';
import { revive } from 'vs/base/common/marshalling';
import { UriDto } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UseDefaultProfileFlags, IUserDataProfile, IUserDataProfilesService, UserDataProfilesService as BaseUserDataProfilesService, toUserDataProfile, WorkspaceIdentifier, EmptyWindowWorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export type UserDataProfilesObject = {
	profiles: IUserDataProfile[];
	workspaces: ResourceMap<IUserDataProfile>;
	emptyWindow?: IUserDataProfile;
};

export type StoredUserDataProfile = {
	name: string;
	location: URI;
	useDefaultFlags?: UseDefaultProfileFlags;
};

export type StoredProfileAssociations = {
	workspaces?: IStringDictionary<string>;
	emptyWindow?: string;
};

export class UserDataProfilesService extends BaseUserDataProfilesService implements IUserDataProfilesService {

	protected static readonly PROFILES_KEY = 'userDataProfiles';
	protected static readonly PROFILE_ASSOCIATIONS_KEY = 'profileAssociations';

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
			let emptyWindow: IUserDataProfile | undefined;
			const workspaces = new ResourceMap<IUserDataProfile>();
			if (profiles.length) {
				profiles.unshift(this.createDefaultUserDataProfile(true));
				const profileAssicaitions = this.getStoredProfileAssociations();
				if (profileAssicaitions.workspaces) {
					for (const [workspacePath, profilePath] of Object.entries(profileAssicaitions.workspaces)) {
						const workspace = URI.parse(workspacePath);
						const profileLocation = URI.parse(profilePath);
						const profile = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, profileLocation));
						if (profile) {
							workspaces.set(workspace, profile);
						}
					}
				}
				if (profileAssicaitions.emptyWindow) {
					const emptyWindowProfileLocation = URI.parse(profileAssicaitions.emptyWindow);
					emptyWindow = profiles.find(p => this.uriIdentityService.extUri.isEqual(p.location, emptyWindowProfileLocation));
				}
			}
			this._profilesObject = { profiles, workspaces, emptyWindow };
		}
		return this._profilesObject;
	}

	override get profiles(): IUserDataProfile[] { return this.profilesObject.profiles; }

	override getProfile(workspaceIdentifier: WorkspaceIdentifier): IUserDataProfile {
		const workspace = this.getWorkspace(workspaceIdentifier);
		const profile = URI.isUri(workspace) ? this.profilesObject.workspaces.get(workspace) : this.profilesObject.emptyWindow;
		return profile ?? this.defaultProfile;
	}

	protected getWorkspace(workspaceIdentifier: WorkspaceIdentifier): URI | EmptyWindowWorkspaceIdentifier {
		if (isSingleFolderWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.uri;
		}
		if (isWorkspaceIdentifier(workspaceIdentifier)) {
			return workspaceIdentifier.configPath;
		}
		return 'empty-window';
	}

	protected getStoredProfiles(): StoredUserDataProfile[] {
		return revive(this.stateService.getItem<UriDto<StoredUserDataProfile>[]>(UserDataProfilesService.PROFILES_KEY, []));
	}

	protected getStoredProfileAssociations(): StoredProfileAssociations {
		return revive(this.stateService.getItem<UriDto<StoredProfileAssociations>>(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, {}));
	}

}
