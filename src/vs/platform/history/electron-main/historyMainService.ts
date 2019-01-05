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
import { isWindows, isMacintosh, isLinux } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, IWorkspacesMainService, IWorkspaceSavedEvent, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IHistoryMainService, IRecentlyOpened } from 'vs/platform/history/common/history';
import { isEqual } from 'vs/base/common/paths';
import { RunOnceScheduler } from 'vs/base/common/async';
import { getComparisonKey, isEqual as areResourcesEqual, dirname } from 'vs/base/common/resources';
import { URI, UriComponents } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { getSimpleWorkspaceLabel } from 'vs/platform/label/common/label';

interface ISerializedRecentlyOpened {
	workspaces2: Array<IWorkspaceIdentifier | string>; // IWorkspaceIdentifier or URI.toString()
	files2: string[]; // files as URI.toString()
}

interface ILegacySerializedRecentlyOpened {
	workspaces: Array<IWorkspaceIdentifier | string | UriComponents>; // legacy (UriComponents was also supported for a few insider builds)
	files: string[]; // files as paths
}

export class HistoryMainService implements IHistoryMainService {

	private static readonly MAX_TOTAL_RECENT_ENTRIES = 100;
	private static readonly MAX_MACOS_DOCK_RECENT_FOLDERS = 10;
	private static readonly MAX_MACOS_DOCK_RECENT_FILES = 5;

	private static readonly recentlyOpenedStorageKey = 'openedPathsList';

	_serviceBrand: any;

	private _onRecentlyOpenedChange = new Emitter<void>();
	onRecentlyOpenedChange: CommonEvent<void> = this._onRecentlyOpenedChange.event;

	private macOSRecentDocumentsUpdater: RunOnceScheduler;

	constructor(
		@IStateService private readonly stateService: IStateService,
		@ILogService private readonly logService: ILogService,
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
		this.macOSRecentDocumentsUpdater = new RunOnceScheduler(() => this.updateMacOSRecentDocuments(), 800);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.workspacesMainService.onWorkspaceSaved(e => this.onWorkspaceSaved(e));
	}

	private onWorkspaceSaved(e: IWorkspaceSavedEvent): void {

		// Make sure to add newly saved workspaces to the list of recent workspaces
		this.addRecentlyOpened([e.workspace], []);
	}

	addRecentlyOpened(workspaces: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier>, files: URI[]): void {
		if ((workspaces && workspaces.length > 0) || (files && files.length > 0)) {
			const mru = this.getRecentlyOpened();

			// Workspaces
			if (Array.isArray(workspaces)) {
				workspaces.forEach(workspace => {
					const isUntitledWorkspace = !isSingleFolderWorkspaceIdentifier(workspace) && this.workspacesMainService.isUntitledWorkspace(workspace);
					if (isUntitledWorkspace) {
						return; // only store saved workspaces
					}

					mru.workspaces.unshift(workspace);
					mru.workspaces = arrays.distinct(mru.workspaces, workspace => this.distinctFn(workspace));

					// We do not add to recent documents here because on Windows we do this from a custom
					// JumpList and on macOS we fill the recent documents in one go from all our data later.
				});
			}

			// Files
			if (Array.isArray(files)) {
				files.forEach((fileUri) => {
					mru.files.unshift(fileUri);
					mru.files = arrays.distinct(mru.files, file => this.distinctFn(file));

					// Add to recent documents (Windows only, macOS later)
					if (isWindows && fileUri.scheme === Schemas.file) {
						app.addRecentDocument(fileUri.fsPath);
					}
				});
			}

			// Make sure its bounded
			mru.workspaces = mru.workspaces.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
			mru.files = mru.files.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);

			this.saveRecentlyOpened(mru);
			this._onRecentlyOpenedChange.fire();

			// Schedule update to recent documents on macOS dock
			if (isMacintosh) {
				this.macOSRecentDocumentsUpdater.schedule();
			}
		}
	}

	removeFromRecentlyOpened(pathsToRemove: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string>): void {
		const mru = this.getRecentlyOpened();
		let update = false;

		pathsToRemove.forEach(pathToRemove => {

			// Remove workspace
			let index = arrays.firstIndex(mru.workspaces, workspace => {
				if (isWorkspaceIdentifier(pathToRemove)) {
					return isWorkspaceIdentifier(workspace) && isEqual(pathToRemove.configPath, workspace.configPath, !isLinux /* ignorecase */);
				}
				if (isSingleFolderWorkspaceIdentifier(pathToRemove)) {
					return isSingleFolderWorkspaceIdentifier(workspace) && areResourcesEqual(pathToRemove, workspace);
				}
				if (typeof pathToRemove === 'string') {
					if (isSingleFolderWorkspaceIdentifier(workspace)) {
						return workspace.scheme === Schemas.file && isEqual(pathToRemove, workspace.fsPath, !isLinux /* ignorecase */);
					}
					if (isWorkspaceIdentifier(workspace)) {
						return isEqual(pathToRemove, workspace.configPath, !isLinux /* ignorecase */);
					}
				}
				return false;
			});
			if (index >= 0) {
				mru.workspaces.splice(index, 1);
				update = true;
			}

			// Remove file
			index = arrays.firstIndex(mru.files, file => {
				if (pathToRemove instanceof URI) {
					return areResourcesEqual(file, pathToRemove);
				} else if (typeof pathToRemove === 'string') {
					return isEqual(file.fsPath, pathToRemove, !isLinux /* ignorecase */);
				}
				return false;
			});

			if (index >= 0) {
				mru.files.splice(index, 1);
				update = true;
			}
		});

		if (update) {
			this.saveRecentlyOpened(mru);
			this._onRecentlyOpenedChange.fire();

			// Schedule update to recent documents on macOS dock
			if (isMacintosh) {
				this.macOSRecentDocumentsUpdater.schedule();
			}
		}
	}

	private updateMacOSRecentDocuments(): void {
		if (!isMacintosh) {
			return;
		}

		// macOS recent documents in the dock are behaving strangely. the entries seem to get
		// out of sync quickly over time. the attempted fix is to always set the list fresh
		// from our MRU history data. So we clear the documents first and then set the documents
		// again.
		app.clearRecentDocuments();

		const mru = this.getRecentlyOpened();

		// Fill in workspaces
		let entries = 0;
		for (let i = 0; i < mru.workspaces.length && entries < HistoryMainService.MAX_MACOS_DOCK_RECENT_FOLDERS; i++) {
			const workspace = mru.workspaces[i];
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				if (workspace.scheme === Schemas.file) {
					app.addRecentDocument(workspace.fsPath);
					entries++;
				}
			} else {
				app.addRecentDocument(workspace.configPath);
				entries++;
			}
		}

		// Fill in files
		entries = 0;
		for (let i = 0; i < mru.files.length && entries < HistoryMainService.MAX_MACOS_DOCK_RECENT_FILES; i++) {
			const file = mru.files[i];
			if (file.scheme === Schemas.file) {
				app.addRecentDocument(file.fsPath);
				entries++;
			}
		}
	}

	clearRecentlyOpened(): void {
		this.saveRecentlyOpened({ workspaces: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentlyOpenedChange.fire();
	}

	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened {
		let workspaces: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier>;
		let files: URI[];

		// Get from storage
		const storedRecents = this.getRecentlyOpenedFromStorage();
		if (storedRecents) {
			workspaces = storedRecents.workspaces || [];
			files = storedRecents.files || [];
		} else {
			workspaces = [];
			files = [];
		}

		// Add current workspace to beginning if set
		if (currentWorkspace) {
			workspaces.unshift(currentWorkspace);
		}

		// Add currently files to open to the beginning if any
		if (currentFiles) {
			files.unshift(...arrays.coalesce(currentFiles.map(f => f.fileUri)));
		}

		// Clear those dupes
		workspaces = arrays.distinct(workspaces, workspace => this.distinctFn(workspace));
		files = arrays.distinct(files, file => this.distinctFn(file));

		// Hide untitled workspaces
		workspaces = workspaces.filter(workspace => isSingleFolderWorkspaceIdentifier(workspace) || !this.workspacesMainService.isUntitledWorkspace(workspace));

		return { workspaces, files };
	}

	private distinctFn(workspaceOrFile: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI): string {
		if (workspaceOrFile instanceof URI) {
			return getComparisonKey(workspaceOrFile);
		}

		return workspaceOrFile.id;
	}

	private getRecentlyOpenedFromStorage(): IRecentlyOpened {
		const storedRecents = this.stateService.getItem<ISerializedRecentlyOpened & ILegacySerializedRecentlyOpened>(HistoryMainService.recentlyOpenedStorageKey);
		const result: IRecentlyOpened = { workspaces: [], files: [] };
		if (storedRecents) {
			if (Array.isArray(storedRecents.workspaces2)) {
				for (const workspace of storedRecents.workspaces2) {
					if (isWorkspaceIdentifier(workspace)) {
						result.workspaces.push(workspace);
					} else if (typeof workspace === 'string') {
						result.workspaces.push(URI.parse(workspace));
					}
				}
			} else if (Array.isArray(storedRecents.workspaces)) {
				// TODO@martin legacy support can be removed at some point (6 month?)
				// format of 1.25 and before
				for (const workspace of storedRecents.workspaces) {
					if (typeof workspace === 'string') {
						result.workspaces.push(URI.file(workspace));
					} else if (isWorkspaceIdentifier(workspace)) {
						result.workspaces.push(workspace);
					} else if (workspace && typeof workspace.path === 'string' && typeof workspace.scheme === 'string') {
						// added by 1.26-insiders
						result.workspaces.push(URI.revive(workspace));
					}
				}
			}

			if (Array.isArray(storedRecents.files2)) {
				for (const file of storedRecents.files2) {
					if (typeof file === 'string') {
						result.files.push(URI.parse(file));
					}
				}
			} else if (Array.isArray(storedRecents.files)) {
				for (const file of storedRecents.files) {
					if (typeof file === 'string') {
						result.files.push(URI.file(file));
					}
				}
			}
		}

		return result;
	}

	private saveRecentlyOpened(recent: IRecentlyOpened): void {
		const serialized: ISerializedRecentlyOpened = { workspaces2: [], files2: [] };

		for (const workspace of recent.workspaces) {
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				serialized.workspaces2.push(workspace.toString());
			} else {
				serialized.workspaces2.push(workspace);
			}
		}

		for (const file of recent.files) {
			serialized.files2.push(file.toString());
		}

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
			let toRemove: Array<ISingleFolderWorkspaceIdentifier | IWorkspaceIdentifier> = [];
			for (let item of app.getJumpListSettings().removedItems) {
				const args = item.args;
				if (args) {
					const match = /^--folder-uri\s+"([^"]+)"$/.exec(args);
					if (match) {
						if (args[0] === '-') {
							toRemove.push(URI.parse(match[1]));
						} else {
							let configPath = match[1];
							toRemove.push({ id: this.workspacesMainService.getWorkspaceId(configPath), configPath });
						}
					}
				}
			}
			this.removeFromRecentlyOpened(toRemove);

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Workspaces"),
				items: arrays.coalesce(this.getRecentlyOpened().workspaces.slice(0, 7 /* limit number of entries here */).map(workspace => {
					const title = getSimpleWorkspaceLabel(workspace, this.environmentService.workspacesHome);
					let description;
					let args;
					if (isSingleFolderWorkspaceIdentifier(workspace)) {
						const parentFolder = dirname(workspace);
						description = parentFolder ? nls.localize('folderDesc', "{0} {1}", getBaseLabel(workspace), getPathLabel(parentFolder, this.environmentService)) : getBaseLabel(workspace);
						args = `--folder-uri "${workspace.toString()}"`;
					} else {
						description = nls.localize('codeWorkspace', "Code Workspace");
						args = `"${workspace.configPath}"`;
					}
					return <Electron.JumpListItem>{
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
