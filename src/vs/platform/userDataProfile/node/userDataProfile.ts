/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI, UriComponents, UriDto } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateReadService, IStateService } from 'vs/platform/state/node/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService, UserDataProfilesService as BaseUserDataProfilesService, StoredUserDataProfile, StoredProfileAssociations } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IStringDictionary } from 'vs/base/common/collections';
import { isString } from 'vs/base/common/types';
import { SaveStrategy, StateService } from 'vs/platform/state/node/stateService';

type StoredUserDataProfileState = StoredUserDataProfile & { location: URI | string };

export class UserDataProfilesReadonlyService extends BaseUserDataProfilesService implements IUserDataProfilesService {

	protected static readonly PROFILE_ASSOCIATIONS_MIGRATION_KEY = 'profileAssociationsMigration';

	constructor(
		@IStateReadService private readonly stateReadonlyService: IStateReadService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(nativeEnvironmentService, fileService, uriIdentityService, logService);
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		const storedProfilesState = this.stateReadonlyService.getItem<UriDto<StoredUserDataProfileState>[]>(UserDataProfilesReadonlyService.PROFILES_KEY, []);
		return storedProfilesState.map(p => ({ ...p, location: isString(p.location) ? this.uriIdentityService.extUri.joinPath(this.profilesHome, p.location) : URI.revive(p.location) }));
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		const associations = this.stateReadonlyService.getItem<StoredProfileAssociations>(UserDataProfilesReadonlyService.PROFILE_ASSOCIATIONS_KEY, {});
		const migrated = this.stateReadonlyService.getItem<boolean>(UserDataProfilesReadonlyService.PROFILE_ASSOCIATIONS_MIGRATION_KEY, false);
		return migrated ? associations : this.migrateStoredProfileAssociations(associations);
	}

	protected override getDefaultProfileExtensionsLocation(): URI {
		return this.uriIdentityService.extUri.joinPath(URI.file(this.nativeEnvironmentService.extensionsPath).with({ scheme: this.profilesHome.scheme }), 'extensions.json');
	}

}

export class UserDataProfilesService extends UserDataProfilesReadonlyService implements IUserDataProfilesService {

	constructor(
		@IStateService protected readonly stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(stateService, uriIdentityService, environmentService, fileService, logService);
	}

	protected override saveStoredProfiles(storedProfiles: StoredUserDataProfile[]): void {
		if (storedProfiles.length) {
			this.stateService.setItem(UserDataProfilesService.PROFILES_KEY, storedProfiles.map(profile => ({ ...profile, location: this.uriIdentityService.extUri.basename(profile.location) })));
		} else {
			this.stateService.removeItem(UserDataProfilesService.PROFILES_KEY);
		}
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		const storedProfiles = super.getStoredProfiles();
		if (!this.stateService.getItem<boolean>('userDataProfilesMigration', false)) {
			this.saveStoredProfiles(storedProfiles);
			this.stateService.setItem('userDataProfilesMigration', true);
		}
		return storedProfiles;
	}

	protected override saveStoredProfileAssociations(storedProfileAssociations: StoredProfileAssociations): void {
		if (storedProfileAssociations.emptyWindows || storedProfileAssociations.workspaces) {
			this.stateService.setItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, storedProfileAssociations);
		} else {
			this.stateService.removeItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY);
		}
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		const oldKey = 'workspaceAndProfileInfo';
		const storedWorkspaceInfos = this.stateService.getItem<{ workspace: UriComponents; profile: UriComponents }[]>(oldKey, undefined);
		if (storedWorkspaceInfos) {
			this.stateService.removeItem(oldKey);
			const workspaces = storedWorkspaceInfos.reduce<IStringDictionary<string>>((result, { workspace, profile }) => {
				result[URI.revive(workspace).toString()] = URI.revive(profile).toString();
				return result;
			}, {});
			this.stateService.setItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, { workspaces } satisfies StoredProfileAssociations);
		}
		const associations = super.getStoredProfileAssociations();
		if (!this.stateService.getItem<boolean>(UserDataProfilesService.PROFILE_ASSOCIATIONS_MIGRATION_KEY, false)) {
			this.saveStoredProfileAssociations(associations);
			this.stateService.setItem(UserDataProfilesService.PROFILE_ASSOCIATIONS_MIGRATION_KEY, true);
		}
		return associations;
	}
}

export class ServerUserDataProfilesService extends UserDataProfilesService implements IUserDataProfilesService {

	constructor(
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(new StateService(SaveStrategy.IMMEDIATE, environmentService, logService, fileService), uriIdentityService, environmentService, fileService, logService);
	}

	override async init(): Promise<void> {
		await (this.stateService as StateService).init();
		return super.init();
	}

}
