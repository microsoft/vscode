/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { ILifecycleMainService, } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ICodeWindow, LoadReason } from 'vs/platform/window/electron-main/window';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { IAnyWorkspaceIdentifier, toWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';

export class UserDataProfilesHandler extends Disposable {

	constructor(
		@ILifecycleMainService lifecycleMainService: ILifecycleMainService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
	) {
		super();
		this._register(lifecycleMainService.onWillLoadWindow(e => {
			if (e.reason === LoadReason.LOAD) {
				this.unsetProfileForWorkspace(e.window);
			}
		}));
		this._register(lifecycleMainService.onBeforeCloseWindow(window => this.unsetProfileForWorkspace(window)));
		this._register(new RunOnceScheduler(() => this.cleanUpEmptyWindowAssociations(), 30 * 1000 /* after 30s */)).schedule();
	}

	private async unsetProfileForWorkspace(window: ICodeWindow): Promise<void> {
		const workspace = this.getWorkspace(window);
		const profile = this.userDataProfilesService.getProfileForWorkspace(workspace);
		if (profile?.isTransient) {
			this.userDataProfilesService.unsetWorkspace(workspace, profile.isTransient);
			if (profile.isTransient) {
				await this.userDataProfilesService.cleanUpTransientProfiles();
			}
		}
	}

	private getWorkspace(window: ICodeWindow): IAnyWorkspaceIdentifier {
		return window.openedWorkspace ?? toWorkspaceIdentifier(window.backupPath, window.isExtensionDevelopmentHost);
	}

	private cleanUpEmptyWindowAssociations(): void {
		const associatedEmptyWindows = this.userDataProfilesService.getAssociatedEmptyWindows();
		if (associatedEmptyWindows.length === 0) {
			return;
		}
		const openedWorkspaces = this.windowsMainService.getWindows().map(window => this.getWorkspace(window));
		for (const associatedEmptyWindow of associatedEmptyWindows) {
			if (openedWorkspaces.some(openedWorkspace => openedWorkspace.id === associatedEmptyWindow.id)) {
				continue;
			}
			this.userDataProfilesService.unsetWorkspace(associatedEmptyWindow, false);
		}
	}

}
