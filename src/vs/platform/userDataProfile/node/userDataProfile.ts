/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isString } from 'vs/base/common/types';
import { URI, UriDto } from 'vs/base/common/uri';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStateService } from 'vs/platform/state/node/state';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService, UserDataProfilesService as BaseUserDataProfilesService, StoredUserDataProfile, StoredProfileAssociations } from 'vs/platform/userDataProfile/common/userDataProfile';

export class ServerUserDataProfilesService extends BaseUserDataProfilesService implements IUserDataProfilesService {

	constructor(
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService protected readonly nativeEnvironmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(nativeEnvironmentService, fileService, uriIdentityService, logService);
	}

	protected override getDefaultProfileExtensionsLocation(): URI {
		return this.uriIdentityService.extUri.joinPath(URI.file(this.nativeEnvironmentService.extensionsPath).with({ scheme: this.profilesHome.scheme }), 'extensions.json');
	}

}

type StoredUserDataProfileState = StoredUserDataProfile & { location: URI | string };

export class UserDataProfilesService extends ServerUserDataProfilesService implements IUserDataProfilesService {

	protected static readonly PROFILE_ASSOCIATIONS_MIGRATION_KEY = 'profileAssociationsMigration';

	constructor(
		@IStateService private readonly stateService: IStateService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@INativeEnvironmentService nativeEnvironmentService: INativeEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(uriIdentityService, nativeEnvironmentService, fileService, logService);
	}

	protected override getStoredProfiles(): StoredUserDataProfile[] {
		const storedProfilesState = this.stateService.getItem<UriDto<StoredUserDataProfileState>[]>(UserDataProfilesService.PROFILES_KEY, []);
		return storedProfilesState.map(p => ({ ...p, location: isString(p.location) ? this.uriIdentityService.extUri.joinPath(this.profilesHome, p.location) : URI.revive(p.location) }));
	}

	protected override getStoredProfileAssociations(): StoredProfileAssociations {
		const associations = this.stateService.getItem<StoredProfileAssociations>(UserDataProfilesService.PROFILE_ASSOCIATIONS_KEY, {});
		const migrated = this.stateService.getItem<boolean>(UserDataProfilesService.PROFILE_ASSOCIATIONS_MIGRATION_KEY, false);
		return migrated ? associations : this.migrateStoredProfileAssociations(associations);
	}

	protected override getDefaultProfileExtensionsLocation(): URI {
		return this.uriIdentityService.extUri.joinPath(URI.file(this.nativeEnvironmentService.extensionsPath).with({ scheme: this.profilesHome.scheme }), 'extensions.json');
	}

}
