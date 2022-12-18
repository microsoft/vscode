/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILifecycleMainService, } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ICodeWindow, LoadReason } from 'vs/platform/window/electron-main/window';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { isEmptyWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class UserDataProfilesHandler extends Disposable {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
	) {
		super();
		this._register(lifecycleMainService.onWillLoadWindow(e => {
			if (e.reason === LoadReason.LOAD) {
				this.unsetProfileForWorkspace(e.window);
			}
		}));
		this._register(lifecycleMainService.onBeforeCloseWindow(window => this.unsetProfileForWorkspace(window)));
	}

	private async unsetProfileForWorkspace(window: ICodeWindow): Promise<void> {
		const workspace = window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost);
		const profile = this.userDataProfilesService.getProfileForWorkspace(workspace);
		if (profile && (isEmptyWorkspaceIdentifier(workspace) || profile.isTransient)) {
			this.userDataProfilesService.unsetWorkspace(workspace, profile.isTransient);
			if (profile.isTransient) {
				await this.userDataProfilesService.cleanUpTransientProfiles();
			}
		}
	}

}
