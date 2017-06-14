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
import { createDecorator } from "vs/platform/instantiation/common/instantiation";
import { isWindows, isMacintosh, isLinux } from "vs/base/common/platform";

export const IHistoryMainService = createDecorator<IHistoryMainService>('historyMainService');

export interface IRecentPathsList {
	folders: string[];
	files: string[];
}

export interface IHistoryMainService {
	_serviceBrand: any;

	// events
	onRecentPathsChange: CommonEvent<void>;

	// methods

	addToRecentPathsList(paths: { path: string; isFile?: boolean; }[]): void;
	getRecentPathsList(workspacePath?: string, filesToOpen?: IPath[]): IRecentPathsList;
	removeFromRecentPathsList(path: string): void;
	removeFromRecentPathsList(paths: string[]): void;
	clearRecentPathsList(): void;
	updateWindowsJumpList(): void;
}

export class HistoryMainService implements IHistoryMainService {

	private static MAX_TOTAL_RECENT_ENTRIES = 100;

	private static recentPathsListStorageKey = 'openedPathsList';

	_serviceBrand: any;

	private _onRecentPathsChange = new Emitter<void>();
	onRecentPathsChange: CommonEvent<void> = this._onRecentPathsChange.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService
	) {
	}

	public addToRecentPathsList(paths: { path: string; isFile?: boolean; }[]): void {
		if (!paths || !paths.length) {
			return;
		}

		const mru = this.getRecentPathsList();
		paths.forEach(p => {
			const { path, isFile } = p;

			if (isFile) {
				mru.files.unshift(path);
				mru.files = arrays.distinct(mru.files, (f) => isLinux ? f : f.toLowerCase());
			} else {
				mru.folders.unshift(path);
				mru.folders = arrays.distinct(mru.folders, (f) => isLinux ? f : f.toLowerCase());
			}

			// Make sure its bounded
			mru.folders = mru.folders.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
			mru.files = mru.files.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);

			// Add to recent documents (Windows/macOS only)
			if (isMacintosh || isWindows) {
				app.addRecentDocument(path);
			}
		});

		this.storageService.setItem(HistoryMainService.recentPathsListStorageKey, mru);
		this._onRecentPathsChange.fire();
	}

	public removeFromRecentPathsList(path: string): void;
	public removeFromRecentPathsList(paths: string[]): void;
	public removeFromRecentPathsList(arg1: any): void {
		let paths: string[];
		if (Array.isArray(arg1)) {
			paths = arg1;
		} else {
			paths = [arg1];
		}

		const mru = this.getRecentPathsList();
		let update = false;

		paths.forEach(path => {
			let index = mru.files.indexOf(path);
			if (index >= 0) {
				mru.files.splice(index, 1);
				update = true;
			}

			index = mru.folders.indexOf(path);
			if (index >= 0) {
				mru.folders.splice(index, 1);
				update = true;
			}
		});

		if (update) {
			this.storageService.setItem(HistoryMainService.recentPathsListStorageKey, mru);
			this._onRecentPathsChange.fire();
		}
	}

	public clearRecentPathsList(): void {
		this.storageService.setItem(HistoryMainService.recentPathsListStorageKey, { folders: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentPathsChange.fire();
	}

	public getRecentPathsList(workspacePath?: string, filesToOpen?: IPath[]): IRecentPathsList {
		let files: string[];
		let folders: string[];

		// Get from storage
		const storedRecents = this.storageService.getItem<IRecentPathsList>(HistoryMainService.recentPathsListStorageKey);
		if (storedRecents) {
			files = storedRecents.files || [];
			folders = storedRecents.folders || [];
		} else {
			files = [];
			folders = [];
		}

		// Add currently files to open to the beginning if any
		if (filesToOpen) {
			files.unshift(...filesToOpen.map(f => f.filePath));
		}

		// Add current workspace path to beginning if set
		if (workspacePath) {
			folders.unshift(workspacePath);
		}

		// Clear those dupes
		files = arrays.distinct(files);
		folders = arrays.distinct(folders);

		return { files, folders };
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
		if (this.getRecentPathsList().folders.length > 0) {

			// The user might have meanwhile removed items from the jump list and we have to respect that
			// so we need to update our list of recent paths with the choice of the user to not add them again
			// Also: Windows will not show our custom category at all if there is any entry which was removed
			// by the user! See https://github.com/Microsoft/vscode/issues/15052
			this.removeFromRecentPathsList(app.getJumpListSettings().removedItems.map(r => trim(r.args, '"')));

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Folders"),
				items: this.getRecentPathsList().folders.slice(0, 7 /* limit number of entries here */).map(folder => {
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