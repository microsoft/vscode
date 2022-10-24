/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { WorkspaceIdentifier } from 'vs/platform/userDataProfile/common/userDataProfile';
import { Disposable } from 'vs/base/common/lifecycle';
import { ILifecycleMainService, } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { LoadReason } from 'vs/platform/window/electron-main/window';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';

export class UserDataTransientProfilesHandler extends Disposable {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
	) {
		super();
		this._register(lifecycleMainService.onWillLoadWindow(e => {
			if (e.reason === LoadReason.LOAD) {
				this.unsetTransientProfileForWorkspace(e.window.openedWorkspace ?? 'empty-window');
			}
		}));
		this._register(lifecycleMainService.onBeforeCloseWindow(window => this.unsetTransientProfileForWorkspace(window.openedWorkspace ?? 'empty-window')));
	}

	private async unsetTransientProfileForWorkspace(workspace: WorkspaceIdentifier): Promise<void> {
		const profile = this.userDataProfilesService.getOrSetProfileForWorkspace(workspace);
		if (profile.isTransient) {
			this.userDataProfilesService.unsetWorkspace(workspace, true);
			await this.userDataProfilesService.cleanUpTransientProfiles();
		}
	}

}
