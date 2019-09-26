/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { IRecent, IRecentlyOpened, isRecentFolder, isRecentFile } from 'vs/platform/history/common/history';
import { IWorkspacesHistoryService } from 'vs/workbench/services/workspace/common/workspacesHistoryService';
import { restoreRecentlyOpened, toStoreData } from 'vs/platform/history/common/historyStorage';
import { StorageScope, IStorageService } from 'vs/platform/storage/common/storage';
import { WorkbenchState, IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { ILogService } from 'vs/platform/log/common/log';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';

export class BrowserWorkspacesHistoryService implements IWorkspacesHistoryService {

	static readonly RECENTLY_OPENED_KEY = 'recently.opened';

	_serviceBrand: undefined;

	readonly onRecentlyOpenedChange: Event<void> = Event.None;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		this.addWorkspaceToRecentlyOpened();
	}

	private addWorkspaceToRecentlyOpened(): void {
		const workspace = this.workspaceService.getWorkspace();
		switch (this.workspaceService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				this.addRecentlyOpened([{ folderUri: workspace.folders[0].uri }]);
				break;
			case WorkbenchState.WORKSPACE:
				this.addRecentlyOpened([{ workspace: { id: workspace.id, configPath: workspace.configuration! } }]);
				break;
		}
	}

	async getRecentlyOpened(): Promise<IRecentlyOpened> {
		const recentlyOpenedRaw = this.storageService.get(BrowserWorkspacesHistoryService.RECENTLY_OPENED_KEY, StorageScope.GLOBAL);
		if (recentlyOpenedRaw) {
			return restoreRecentlyOpened(JSON.parse(recentlyOpenedRaw), this.logService);
		}

		return { workspaces: [], files: [] };
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		recents.forEach(recent => {
			if (isRecentFile(recent)) {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.fileUri]);
				recentlyOpened.files.unshift(recent);
			} else if (isRecentFolder(recent)) {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.folderUri]);
				recentlyOpened.workspaces.unshift(recent);
			} else {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.workspace.configPath]);
				recentlyOpened.workspaces.unshift(recent);
			}
		});

		return this.saveRecentlyOpened(recentlyOpened);
	}

	async removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		this.doRemoveFromRecentlyOpened(recentlyOpened, paths);

		return this.saveRecentlyOpened(recentlyOpened);
	}

	private doRemoveFromRecentlyOpened(recentlyOpened: IRecentlyOpened, paths: URI[]): void {
		recentlyOpened.files = recentlyOpened.files.filter(file => {
			return !paths.some(path => path.toString() === file.fileUri.toString());
		});

		recentlyOpened.workspaces = recentlyOpened.workspaces.filter(workspace => {
			return !paths.some(path => path.toString() === (isRecentFolder(workspace) ? workspace.folderUri.toString() : workspace.workspace.configPath.toString()));
		});
	}

	private async saveRecentlyOpened(data: IRecentlyOpened): Promise<void> {
		return this.storageService.store(BrowserWorkspacesHistoryService.RECENTLY_OPENED_KEY, JSON.stringify(toStoreData(data)), StorageScope.GLOBAL);
	}

	async clearRecentlyOpened(): Promise<void> {
		this.storageService.remove(BrowserWorkspacesHistoryService.RECENTLY_OPENED_KEY, StorageScope.GLOBAL);
	}
}

registerSingleton(IWorkspacesHistoryService, BrowserWorkspacesHistoryService, true);
