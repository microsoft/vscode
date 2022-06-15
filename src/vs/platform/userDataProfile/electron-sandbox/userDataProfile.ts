/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserDataProfile, IUserDataProfilesService, UserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class UserDataProfilesNativeService extends UserDataProfilesService implements IUserDataProfilesService {

	constructor(
		defaultProfile: IUserDataProfile,
		currentProfile: IUserDataProfile,
		private readonly channel: IChannel,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(defaultProfile, currentProfile, environmentService, fileService, logService);
	}

	override setProfile(name: string): Promise<void> {
		return this.channel.call('setProfile', [name]);
	}
}

