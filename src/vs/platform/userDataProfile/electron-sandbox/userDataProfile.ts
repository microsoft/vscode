/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriDto } from 'vs/base/common/types';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserDataProfile, IUserDataProfilesService, reviveProfile, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class UserDataProfilesNativeService extends UserDataProfilesService implements IUserDataProfilesService {

	private _profiles: IUserDataProfile[] = [];
	override get profiles(): IUserDataProfile[] { return this._profiles; }

	constructor(
		defaultProfile: UriDto<IUserDataProfile>,
		private readonly channel: IChannel,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(defaultProfile, environmentService, fileService, logService);
		this.initializeProfiles();
	}

	private async initializeProfiles(): Promise<void> {
		const result = await this.channel.call<UriDto<IUserDataProfile>[]>('getAllProfiles');
		this._profiles = result.map(profile => reviveProfile(profile, this.profilesHome.scheme));
		this._register(this.channel.listen<IUserDataProfile[]>('onDidChangeProfiles')((profiles) => {
			this._profiles = profiles.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._onDidChangeProfiles.fire(this._profiles);
		}));
	}

	override async createProfile(profile: IUserDataProfile, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createProfile', [profile, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	override async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('setProfileForWorkspace', [profile, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	override removeProfile(profile: IUserDataProfile): Promise<void> {
		return this.channel.call('removeProfile', [profile]);
	}
}

