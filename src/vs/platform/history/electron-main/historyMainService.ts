/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { trim } from 'vs/base/common/strings';
import { IStorageService } from 'vs/platform/storage/node/storage';
import { app } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { getPathLabel } from 'vs/base/common/labels';
import { IPath } from 'vs/platform/windows/common/windows';
import CommonEvent, { Emitter } from 'vs/base/common/event';
import { isWindows, isMacintosh, isLinux } from 'vs/base/common/platform';
import { IWorkspaceIdentifier } from "vs/platform/workspaces/common/workspaces";
import { IHistoryMainService, IRecentlyOpenedFile, IRecentlyOpened } from "vs/platform/history/common/history";

export class HistoryMainService implements IHistoryMainService {

	private static MAX_TOTAL_RECENT_ENTRIES = 100;

	private static recentlyOpenedStorageKey = 'openedPathsList';

	_serviceBrand: any;

	private _onRecentlyOpenedChange = new Emitter<void>();
	onRecentlyOpenedChange: CommonEvent<void> = this._onRecentlyOpenedChange.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService
	) {
	}

	public addToRecentlyOpened(recent: (IWorkspaceIdentifier | IRecentlyOpenedFile)[]): void {
		if (!recent || !recent.length) {
			return;
		}

		const mru = this.getRecentlyOpened();
		recent.forEach((workspaceOrFile: IWorkspaceIdentifier | IRecentlyOpenedFile) => {

			// Add Workspace
			if (this.isWorkspace(workspaceOrFile)) {
				mru.workspaces.unshift(workspaceOrFile);
				mru.workspaces = arrays.distinct(mru.workspaces, w => w.id);

				// Add to recent documents (Windows/macOS only)
				if (isMacintosh || isWindows) {
					app.addRecentDocument(workspaceOrFile.configPath);
				}
			}

			// Add File/Folder
			else {
				const { path, isFile } = workspaceOrFile as IRecentlyOpenedFile;
				if (isFile) {
					mru.files.unshift(path);
					mru.files = arrays.distinct(mru.files, f => isLinux ? f : f.toLowerCase());
				} else {
					mru.folders.unshift(path);
					mru.folders = arrays.distinct(mru.folders, f => isLinux ? f : f.toLowerCase());
				}

				// Add to recent documents (Windows/macOS only)
				if (isMacintosh || isWindows) {
					app.addRecentDocument(path);
				}
			}

			// Make sure its bounded
			mru.workspaces = mru.workspaces.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
			mru.folders = mru.folders.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
			mru.files = mru.files.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
		});

		this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, mru);
		this._onRecentlyOpenedChange.fire();
	}

	private isWorkspace(obj: any): obj is IWorkspaceIdentifier {
		return !!(obj as IWorkspaceIdentifier).id;
	}

	public removeFromRecentlyOpened(toRemove: IWorkspaceIdentifier | string): void;
	public removeFromRecentlyOpened(toRemove: (IWorkspaceIdentifier | string)[]): void;
	public removeFromRecentlyOpened(arg1: any): void {
		let workspacesOrFiles: any[];
		if (Array.isArray(arg1)) {
			workspacesOrFiles = arg1;
		} else {
			workspacesOrFiles = [arg1];
		}

		const mru = this.getRecentlyOpened();
		let update = false;

		workspacesOrFiles.forEach((workspaceOrFile: IWorkspaceIdentifier | string) => {

			// Remove workspace
			if (this.isWorkspace(workspaceOrFile)) {
				let index = arrays.firstIndex(mru.workspaces, w => w.id === workspaceOrFile.id);
				if (index >= 0) {
					mru.workspaces.splice(index, 1);
					update = true;
				}
			}

			// Remove file/folder
			else {
				let index = mru.files.indexOf(workspaceOrFile);
				if (index >= 0) {
					mru.files.splice(index, 1);
					update = true;
				}

				index = mru.folders.indexOf(workspaceOrFile);
				if (index >= 0) {
					mru.folders.splice(index, 1);
					update = true;
				}
			}
		});

		if (update) {
			this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, mru);
			this._onRecentlyOpenedChange.fire();
		}
	}

	public clearRecentlyOpened(): void {
		this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, <IRecentlyOpened>{ workspaces: [], folders: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentlyOpenedChange.fire();
	}

	public getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier, currentFolderPath?: string, currentFiles?: IPath[]): IRecentlyOpened {
		let workspaces: IWorkspaceIdentifier[];
		let files: string[];
		let folders: string[];

		// Get from storage
		const storedRecents = this.storageService.getItem<IRecentlyOpened>(HistoryMainService.recentlyOpenedStorageKey);
		if (storedRecents) {
			workspaces = storedRecents.workspaces || [];
			files = storedRecents.files || [];
			folders = storedRecents.folders || [];
		} else {
			workspaces = [];
			files = [];
			folders = [];
		}

		// Add current workspace to beginning if set
		if (currentWorkspace) {
			workspaces.unshift(currentWorkspace);
		}

		// Add currently files to open to the beginning if any
		if (currentFiles) {
			files.unshift(...currentFiles.map(f => f.filePath));
		}

		// Add current folder path to beginning if set
		if (currentFolderPath) {
			folders.unshift(currentFolderPath);
		}

		// Clear those dupes
		workspaces = arrays.distinct(workspaces, w => w.id);
		files = arrays.distinct(files);
		folders = arrays.distinct(folders);

		return { workspaces, files, folders };
	}

	public updateWindowsJumpList(): void {
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

		// Recent Folders
		if (this.getRecentlyOpened().folders.length > 0) {

			// The user might have meanwhile removed items from the jump list and we have to respect that
			// so we need to update our list of recent paths with the choice of the user to not add them again
			// Also: Windows will not show our custom category at all if there is any entry which was removed
			// by the user! See https://github.com/Microsoft/vscode/issues/15052
			this.removeFromRecentlyOpened(app.getJumpListSettings().removedItems.map(r => trim(r.args, '"')));

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Folders"),
				items: this.getRecentlyOpened().folders.slice(0, 7 /* limit number of entries here */).map(folder => {
					return <Electron.JumpListItem>{
						type: 'task',
						title: path.basename(folder) || folder, // use the base name to show shorter entries in the list
						description: nls.localize('folderDesc', "{0} {1}", path.basename(folder), getPathLabel(path.dirname(folder))),
						program: process.execPath,
						args: `"${folder}"`, // open folder (use quotes to support paths with whitespaces)
						iconPath: 'explorer.exe', // simulate folder icon
						iconIndex: 0
					};
				}).filter(i => !!i)
			});
		}

		// Recent
		jumpList.push({
			type: 'recent' // this enables to show files in the "recent" category
		});

		try {
			app.setJumpList(jumpList);
		} catch (error) {
			this.logService.log('#setJumpList', error); // since setJumpList is relatively new API, make sure to guard for errors
		}
	}
}