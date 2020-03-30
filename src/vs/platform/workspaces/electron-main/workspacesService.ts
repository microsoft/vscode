/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AddFirstParameterToFunctions } from 'vs/base/common/types';
import { IWorkspacesService, IEnterWorkspaceResult, IWorkspaceFolderCreationData, IWorkspaceIdentifier, IRecentlyOpened, IRecent, IRecentWorkspace, IRecentFolder } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IWorkspacesMainService } from 'vs/platform/workspaces/electron-main/workspacesMainService';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { IWorkspacesHistoryMainService } from 'vs/platform/workspaces/electron-main/workspacesHistoryMainService';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';

export class WorkspacesService implements AddFirstParameterToFunctions<IWorkspacesService, Promise<unknown> /* only methods, not events */, number /* window ID */> {

	_serviceBrand: undefined;

	constructor(
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IWorkspacesHistoryMainService private readonly workspacesHistoryMainService: IWorkspacesHistoryMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService
	) {
	}

	//#region Workspace Management

	async enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult | null> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return this.workspacesMainService.enterWorkspace(window, this.windowsMainService.getWindows(), path);
		}

		return null;
	}

	createUntitledWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		return this.workspacesMainService.createUntitledWorkspace(folders, remoteAuthority);
	}

	deleteUntitledWorkspace(windowId: number, workspace: IWorkspaceIdentifier): Promise<void> {
		return this.workspacesMainService.deleteUntitledWorkspace(workspace);
	}

	getWorkspaceIdentifier(windowId: number, workspacePath: URI): Promise<IWorkspaceIdentifier> {
		return this.workspacesMainService.getWorkspaceIdentifier(workspacePath);
	}

	//#endregion

	//#region Workspaces History

	readonly onRecentlyOpenedChange = this.workspacesHistoryMainService.onRecentlyOpenedChange;

	async getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window?.config) {
			return this.workspacesHistoryMainService.getRecentlyOpened(window.config.workspace, window.config.folderUri, window.config.filesToOpenOrCreate);
		}

		return this.workspacesHistoryMainService.getRecentlyOpened();
	}

	async addRecentlyOpened(windowId: number, recents: IRecent[]): Promise<void> {
		return this.workspacesHistoryMainService.addRecentlyOpened(recents);
	}

	async removeRecentlyOpened(windowId: number, paths: URI[]): Promise<void> {
		return this.workspacesHistoryMainService.removeRecentlyOpened(paths);
	}

	async clearRecentlyOpened(windowId: number): Promise<void> {
		return this.workspacesHistoryMainService.clearRecentlyOpened();
	}

	//#endregion


	//#region Dirty Workspaces

	async getDirtyWorkspaces(): Promise<Array<IRecentWorkspace | IRecentFolder>> {
		const dirtyWorkspaces: Array<IRecentWorkspace | IRecentFolder> = [];

		// Workspaces with backups
		for (const workspace of this.backupMainService.getWorkspaceBackups()) {
			if ((await this.backupMainService.hasBackups(workspace))) {
				dirtyWorkspaces.push(workspace);
			}
		}

		// Folders with backups
		for (const folder of this.backupMainService.getFolderBackupPaths()) {
			if ((await this.backupMainService.hasBackups(folder))) {
				dirtyWorkspaces.push({ folderUri: folder });
			}
		}

		return dirtyWorkspaces;
	}

	//#endregion
}
