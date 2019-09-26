/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as browser from 'vs/base/browser/browser';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened, IRecent, isRecentFile, isRecentFolder } from 'vs/platform/history/common/history';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { addDisposableListener, EventType } from 'vs/base/browser/dom';
import { toStoreData, restoreRecentlyOpened } from 'vs/platform/history/common/historyStorage';

//#region Window

export class SimpleWindowService extends Disposable implements IWindowService {

	_serviceBrand: undefined;

	readonly windowId = 0;

	static readonly RECENTLY_OPENED_KEY = 'recently.opened';

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.addWorkspaceToRecentlyOpened();
		this.registerListeners();
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

	private registerListeners(): void {
		this._register(addDisposableListener(document, EventType.FULLSCREEN_CHANGE, () => {
			if (document.fullscreenElement || (<any>document).webkitFullscreenElement) {
				browser.setFullscreen(true);
			} else {
				browser.setFullscreen(false);
			}
		}));

		this._register(addDisposableListener(document, EventType.WK_FULLSCREEN_CHANGE, () => {
			if (document.fullscreenElement || (<any>document).webkitFullscreenElement || (<any>document).webkitIsFullScreen) {
				browser.setFullscreen(true);
			} else {
				browser.setFullscreen(false);
			}
		}));
	}

	async getRecentlyOpened(): Promise<IRecentlyOpened> {
		const recentlyOpenedRaw = this.storageService.get(SimpleWindowService.RECENTLY_OPENED_KEY, StorageScope.GLOBAL);
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
		return this.storageService.store(SimpleWindowService.RECENTLY_OPENED_KEY, JSON.stringify(toStoreData(data)), StorageScope.GLOBAL);
	}
}

registerSingleton(IWindowService, SimpleWindowService);

//#endregion

//#region Window

export class SimpleWindowsService implements IWindowsService {
	_serviceBrand: undefined;

	readonly onRecentlyOpenedChange: Event<void> = Event.None;

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return Promise.resolve();
	}

	removeFromRecentlyOpened(_paths: URI[]): Promise<void> {
		return Promise.resolve();
	}

	clearRecentlyOpened(): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(_windowId: number): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}
}

registerSingleton(IWindowsService, SimpleWindowsService);

//#endregion
