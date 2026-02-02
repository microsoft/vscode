/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AddFirstParameterToFunctions } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { IEnterWorkspaceResult, IRecent, IRecentlyOpened, IWorkspaceFolderCreationData, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkspacesHistoryMainService } from 'vs/platform/workspaces/electron-main/workspacesHistoryMainService';
import { IWorkspacesManagementMainService } from 'vs/platform/workspaces/electron-main/workspacesManagementMainService';
import { IWorkspaceBackupInfo, IFolderBackupInfo } from 'vs/platform/backup/common/backup';

export class WorkspacesMainService implements AddFirstParameterToFunctions<IWorkspacesService, Promise<unknown> /* only methods, not events */, number /* window ID */> {

	declare readonly _serviceBrand: undefined;

	constructor(
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IWorkspacesHistoryMainService private readonly workspacesHistoryMainService: IWorkspacesHistoryMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService
	) {
	}

	//#region Workspace Management

	async enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult | undefined> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return this.workspacesManagementMainService.enterWorkspace(window, this.windowsMainService.getWindows(), path);
		}

		return undefined;
	}

	createUntitledWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		return this.workspacesManagementMainService.createUntitledWorkspace(folders, remoteAuthority);
	}

	deleteUntitledWorkspace(windowId: number, workspace: IWorkspaceIdentifier): Promise<void> {
		return this.workspacesManagementMainService.deleteUntitledWorkspace(workspace);
	}

	getWorkspaceIdentifier(windowId: number, workspacePath: URI): Promise<IWorkspaceIdentifier> {
		return this.workspacesManagementMainService.getWorkspaceIdentifier(workspacePath);
	}

	//#endregion

	//#region Workspaces History

	readonly onDidChangeRecentlyOpened = this.workspacesHistoryMainService.onDidChangeRecentlyOpened;

	getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		return this.workspacesHistoryMainService.getRecentlyOpened();
	}

	addRecentlyOpened(windowId: number, recents: IRecent[]): Promise<void> {
		return this.workspacesHistoryMainService.addRecentlyOpened(recents);
	}

	removeRecentlyOpened(windowId: number, paths: URI[]): Promise<void> {
		return this.workspacesHistoryMainService.removeRecentlyOpened(paths);
	}

	clearRecentlyOpened(windowId: number): Promise<void> {
		return this.workspacesHistoryMainService.clearRecentlyOpened();
	}

	//#endregion


	//#region Dirty Workspaces

	async getDirtyWorkspaces(): Promise<Array<IWorkspaceBackupInfo | IFolderBackupInfo>> {
		return this.backupMainService.getDirtyWorkspaces();
	}

	//#endregion
}
