/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { UriDto } from 'vs/base/common/types';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { ILogService } from 'vs/platform/log/common/log';
import { DidChangeProfilesEvent, IUserDataProfile, IUserDataProfilesService, reviveProfile, UseDefaultProfileFlags, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class UserDataProfilesNativeService extends UserDataProfilesService implements IUserDataProfilesService {

	private readonly channel: IChannel;

	override get profiles(): IUserDataProfile[] { return this._profiles; }

	constructor(
		profiles: UriDto<IUserDataProfile>[],
		@IMainProcessService mainProcessService: IMainProcessService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(environmentService, fileService, logService);
		this.channel = mainProcessService.getChannel('userDataProfiles');
		this._profiles = profiles.map(profile => reviveProfile(profile, this.profilesHome.scheme));
		this._register(this.channel.listen<DidChangeProfilesEvent>('onDidChangeProfiles')(e => {
			const added = e.added.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			const removed = e.removed.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._profiles = e.all.map(profile => reviveProfile(profile, this.profilesHome.scheme));
			this._onDidChangeProfiles.fire({ added, removed, all: this.profiles });
		}));
	}

	override async createProfile(name: string, useDefaultFlags?: UseDefaultProfileFlags, workspaceIdentifier?: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<IUserDataProfile> {
		const result = await this.channel.call<UriDto<IUserDataProfile>>('createProfile', [name, useDefaultFlags, workspaceIdentifier]);
		return reviveProfile(result, this.profilesHome.scheme);
	}

	override async setProfileForWorkspace(profile: IUserDataProfile, workspaceIdentifier: ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier): Promise<void> {
		await this.channel.call<UriDto<IUserDataProfile>>('setProfileForWorkspace', [profile, workspaceIdentifier]);
	}

	override removeProfile(profile: IUserDataProfile): Promise<void> {
		return this.channel.call('removeProfile', [profile]);
	}
}

