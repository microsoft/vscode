/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/common/mainProcessService';
import { RemoteStorageService } from 'vs/platform/storage/common/storageService';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IAnyWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class NativeWorkbenchStorageService extends RemoteStorageService {

	constructor(
		workspace: IAnyWorkspaceIdentifier | undefined,
		private readonly userDataProfileService: IUserDataProfileService,
		userDataProfilesService: IUserDataProfilesService,
		mainProcessService: IMainProcessService,
		environmentService: IEnvironmentService
	) {
		super(workspace, { currentProfile: userDataProfileService.currentProfile, defaultProfile: userDataProfilesService.defaultProfile }, mainProcessService, environmentService);

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.switchToProfile(e.profile))));
	}
}
