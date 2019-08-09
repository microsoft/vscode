/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { IStateService } from 'vs/platform/state/common/state';
import { app } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { getBaseLabel, getPathLabel } from 'vs/base/common/labels';
import { IPath } from 'vs/platform/windows/common/windows';
import { Event as CommonEvent, Emitter } from 'vs/base/common/event';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, IWorkspacesMainService, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IHistoryMainService, IRecentlyOpened, isRecentWorkspace, isRecentFolder, IRecent, isRecentFile, IRecentFolder, IRecentWorkspace, IRecentFile } from 'vs/platform/history/common/history';
import { ThrottledDelayer } from 'vs/base/common/async';
import { isEqual as areResourcesEqual, dirname, originalFSPath, basename } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { getSimpleWorkspaceLabel } from 'vs/platform/label/common/label';
import { toStoreData, restoreRecentlyOpened, RecentlyOpenedStorageData } from 'vs/platform/history/common/historyStorage';
import { exists } from 'vs/base/node/pfs';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';
import { ILifecycleService, LifecycleMainPhase } from 'vs/platform/lifecycle/electron-main/lifecycleMain';

export class HistoryMainService implements IHistoryMainService {

	private static readonly MAX_TOTAL_RECENT_ENTRIES = 100;

	private static readonly MAX_MACOS_DOCK_RECENT_WORKSPACES = 7; // prefer more workspaces...
	private static readonly MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL = 10; // ...compared to files

	// Exclude some very common files from the dock/taskbar
	private static readonly COMMON_FILES_FILTER = [
		'COMMIT_EDITMSG',
		'MERGE_MSG'
	];

	private static readonly recentlyOpenedStorageKey = 'openedPathsList';

	_serviceBrand!: ServiceIdentifier<IHistoryMainService>;

	private _onRecentlyOpenedChange = new Emitter<void>();
	readonly onRecentlyOpenedChange: CommonEvent<void> = this._onRecentlyOpenedChange.event;

	private macOSRecentDocumentsUpdater: ThrottledDelayer<void>;

	constructor(
		@IStateService private readonly stateService: IStateService,
		@ILogService private readonly logService: ILogService,
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILifecycleService lifecycleService: ILifecycleService
	) {
		this.macOSRecentDocumentsUpdater = new ThrottledDelayer<void>(800);

		lifecycleService.when(LifecycleMainPhase.AfterWindowOpen).then(() => this.handleWindowsJumpList());
	}

	private handleWindowsJumpList(): void {
		if (!isWindows) {
			return; // only on windows
		}

		this.updateWindowsJumpList();
		this.onRecentlyOpenedChange(() => this.updateWindowsJumpList());
	}

	addRecentlyOpened(newlyAdded: IRecent[]): void {
		const workspaces: Array<IRecentFolder | IRecentWorkspace> = [];
		const files: IRecentFile[] = [];

		for (let curr of newlyAdded) {

			// Workspace
			if (isRecentWorkspace(curr)) {
				if (!this.workspacesMainService.isUntitledWorkspace(curr.workspace) && indexOfWorkspace(workspaces, curr.workspace) === -1) {
					workspaces.push(curr);
				}
			}

			// Folder
			else if (isRecentFolder(curr)) {
				if (indexOfFolder(workspaces, curr.folderUri) === -1) {
					workspaces.push(curr);
				}
			}

			// File
			else {
				const alreadyExistsInHistory = indexOfFile(files, curr.fileUri) >= 0;
				const shouldBeFiltered = curr.fileUri.scheme === Schemas.file && HistoryMainService.COMMON_FILES_FILTER.indexOf(basename(curr.fileUri)) >= 0;

				if (!alreadyExistsInHistory && !shouldBeFiltered) {
					files.push(curr);

					// Add to recent documents (Windows only, macOS later)
					if (isWindows && curr.fileUri.scheme === Schemas.file) {
						app.addRecentDocument(curr.fileUri.fsPath);
					}
				}
			}
		}

		this.addEntriesFromStorage(workspaces, files);

		if (workspaces.length > HistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
			workspaces.length = HistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
		}

		if (files.length > HistoryMainService.MAX_TOTAL_RECENT_ENTRIES) {
			files.length = HistoryMainService.MAX_TOTAL_RECENT_ENTRIES;
		}

		this.saveRecentlyOpened({ workspaces, files });
		this._onRecentlyOpenedChange.fire();

		// Schedule update to recent documents on macOS dock
		if (isMacintosh) {
			this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
		}
	}

	removeFromRecentlyOpened(toRemove: URI[]): void {
		const keep = (recent: IRecent) => {
			const uri = location(recent);
			for (const r of toRemove) {
				if (areResourcesEqual(r, uri)) {
					return false;
				}
			}
			return true;
		};

		const mru = this.getRecentlyOpened();
		const workspaces = mru.workspaces.filter(keep);
		const files = mru.files.filter(keep);

		if (workspaces.length !== mru.workspaces.length || files.length !== mru.files.length) {
			this.saveRecentlyOpened({ files, workspaces });
			this._onRecentlyOpenedChange.fire();

			// Schedule update to recent documents on macOS dock
			if (isMacintosh) {
				this.macOSRecentDocumentsUpdater.trigger(() => this.updateMacOSRecentDocuments());
			}
		}
	}

	private async updateMacOSRecentDocuments(): Promise<void> {
		if (!isMacintosh) {
			return;
		}

		// We clear all documents first to ensure an up-to-date view on the set. Since entries
		// can get deleted on disk, this ensures that the list is always valid
		app.clearRecentDocuments();

		const mru = this.getRecentlyOpened();

		// Collect max-N recent workspaces that are known to exist
		const workspaceEntries: string[] = [];
		let entries = 0;
		for (let i = 0; i < mru.workspaces.length && entries < HistoryMainService.MAX_MACOS_DOCK_RECENT_WORKSPACES; i++) {
			const loc = location(mru.workspaces[i]);
			if (loc.scheme === Schemas.file) {
				const workspacePath = originalFSPath(loc);
				if (await exists(workspacePath)) {
					workspaceEntries.push(workspacePath);
					entries++;
				}
			}
		}

		// Collect max-N recent files that are known to exist
		const fileEntries: string[] = [];
		for (let i = 0; i < mru.files.length && entries < HistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES_TOTAL; i++) {
			const loc = location(mru.files[i]);
			if (loc.scheme === Schemas.file) {
				const filePath = originalFSPath(loc);
				if (
					HistoryMainService.COMMON_FILES_FILTER.indexOf(basename(loc)) !== -1 || // skip some well known file entries
					workspaceEntries.indexOf(filePath) !== -1								// prefer a workspace entry over a file entry (e.g. for .code-workspace)
				) {
					continue;
				}

				if (await exists(filePath)) {
					fileEntries.push(filePath);
					entries++;
				}
			}
		}

		// The apple guidelines (https://developer.apple.com/design/human-interface-guidelines/macos/menus/menu-anatomy/)
		// explain that most recent entries should appear close to the interaction by the user (e.g. close to the
		// mouse click). Most native macOS applications that add recent documents to the dock, show the most recent document
		// to the bottom (because the dock menu is not appearing from top to bottom, but from the bottom to the top). As such
		// we fill in the entries in reverse order so that the most recent shows up at the bottom of the menu.
		//
		// On top of that, the maximum number of documents can be configured by the user (defaults to 10). To ensure that
		// we are not failing to show the most recent entries, we start by adding files first (in reverse order of recency)
		// and then add folders (in reverse order of recency). Given that strategy, we can ensure that the most recent
		// N folders are always appearing, even if the limit is low (https://github.com/microsoft/vscode/issues/74788)
		fileEntries.reverse().forEach(fileEntry => app.addRecentDocument(fileEntry));
		workspaceEntries.reverse().forEach(workspaceEntry => app.addRecentDocument(workspaceEntry));
	}

	clearRecentlyOpened(): void {
		this.saveRecentlyOpened({ workspaces: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentlyOpenedChange.fire();
	}

	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier, currentFolder?: ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened {
		const workspaces: Array<IRecentFolder | IRecentWorkspace> = [];
		const files: IRecentFile[] = [];

		// Add current workspace to beginning if set
		if (currentWorkspace && !this.workspacesMainService.isUntitledWorkspace(currentWorkspace)) {
			workspaces.push({ workspace: currentWorkspace });
		}

		if (currentFolder) {
			workspaces.push({ folderUri: currentFolder });
		}

		// Add currently files to open to the beginning if any
		if (currentFiles) {
			for (let currentFile of currentFiles) {
				const fileUri = currentFile.fileUri;
				if (fileUri && indexOfFile(files, fileUri) === -1) {
					files.push({ fileUri });
				}
			}
		}

		this.addEntriesFromStorage(workspaces, files);

		return { workspaces, files };
	}

	private addEntriesFromStorage(workspaces: Array<IRecentFolder | IRecentWorkspace>, files: IRecentFile[]) {

		// Get from storage
		let recents = this.getRecentlyOpenedFromStorage();
		for (let recent of recents.workspaces) {
			let index = isRecentFolder(recent) ? indexOfFolder(workspaces, recent.folderUri) : indexOfWorkspace(workspaces, recent.workspace);
			if (index >= 0) {
				workspaces[index].label = workspaces[index].label || recent.label;
			} else {
				workspaces.push(recent);
			}
		}

		for (let recent of recents.files) {
			let index = indexOfFile(files, recent.fileUri);
			if (index >= 0) {
				files[index].label = files[index].label || recent.label;
			} else {
				files.push(recent);
			}
		}
	}

	private getRecentlyOpenedFromStorage(): IRecentlyOpened {
		const storedRecents = this.stateService.getItem<RecentlyOpenedStorageData>(HistoryMainService.recentlyOpenedStorageKey);

		return restoreRecentlyOpened(storedRecents, this.logService);
	}

	private saveRecentlyOpened(recent: IRecentlyOpened): void {
		const serialized = toStoreData(recent);

		this.stateService.setItem(HistoryMainService.recentlyOpenedStorageKey, serialized);
	}

	updateWindowsJumpList(): void {
		if (!isWindows) {
			return; // only on windows
		}

		const jumpList: Electron.JumpListCategory[] = [];

		// Tasks
		jumpList.push({
			type: 'tasks',
			items: [
				{
					type: 'task',
					title: nls.localize('newWindow', "New Window"),
					description: nls.localize('newWindowDesc', "Opens a new window"),
					program: process.execPath,
					args: '-n', // force new window
					iconPath: process.execPath,
					iconIndex: 0
				}
			]
		});

		// Recent Workspaces
		if (this.getRecentlyOpened().workspaces.length > 0) {

			// The user might have meanwhile removed items from the jump list and we have to respect that
			// so we need to update our list of recent paths with the choice of the user to not add them again
			// Also: Windows will not show our custom category at all if there is any entry which was removed
			// by the user! See https://github.com/Microsoft/vscode/issues/15052
			let toRemove: URI[] = [];
			for (let item of app.getJumpListSettings().removedItems) {
				const args = item.args;
				if (args) {
					const match = /^--(folder|file)-uri\s+"([^"]+)"$/.exec(args);
					if (match) {
						toRemove.push(URI.parse(match[2]));
					}
				}
			}
			this.removeFromRecentlyOpened(toRemove);

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Workspaces"),
				items: arrays.coalesce(this.getRecentlyOpened().workspaces.slice(0, 7 /* limit number of entries here */).map(recent => {
					const workspace = isRecentWorkspace(recent) ? recent.workspace : recent.folderUri;
					const title = recent.label || getSimpleWorkspaceLabel(workspace, this.environmentService.untitledWorkspacesHome);

					let description;
					let args;
					if (isSingleFolderWorkspaceIdentifier(workspace)) {
						description = nls.localize('folderDesc', "{0} {1}", getBaseLabel(workspace), getPathLabel(dirname(workspace), this.environmentService));
						args = `--folder-uri "${workspace.toString()}"`;
					} else {
						description = nls.localize('workspaceDesc', "{0} {1}", getBaseLabel(workspace.configPath), getPathLabel(dirname(workspace.configPath), this.environmentService));
						args = `--file-uri "${workspace.configPath.toString()}"`;
					}

					return {
						type: 'task',
						title,
						description,
						program: process.execPath,
						args,
						iconPath: 'explorer.exe', // simulate folder icon
						iconIndex: 0
					};
				}))
			});
		}

		// Recent
		jumpList.push({
			type: 'recent' // this enables to show files in the "recent" category
		});

		try {
			app.setJumpList(jumpList);
		} catch (error) {
			this.logService.warn('#setJumpList', error); // since setJumpList is relatively new API, make sure to guard for errors
		}
	}
}

function location(recent: IRecent): URI {
	if (isRecentFolder(recent)) {
		return recent.folderUri;
	}

	if (isRecentFile(recent)) {
		return recent.fileUri;
	}

	return recent.workspace.configPath;
}

function indexOfWorkspace(arr: IRecent[], workspace: IWorkspaceIdentifier): number {
	return arrays.firstIndex(arr, w => isRecentWorkspace(w) && w.workspace.id === workspace.id);
}

function indexOfFolder(arr: IRecent[], folderURI: ISingleFolderWorkspaceIdentifier): number {
	return arrays.firstIndex(arr, f => isRecentFolder(f) && areResourcesEqual(f.folderUri, folderURI));
}

function indexOfFile(arr: IRecentFile[], fileURI: URI): number {
	return arrays.firstIndex(arr, f => areResourcesEqual(f.fileUri, fileURI));
}
