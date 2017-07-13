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
import { IWorkspaceIdentifier, IWorkspacesMainService, getWorkspaceLabel } from "vs/platform/workspaces/common/workspaces";
import { IHistoryMainService, IRecentlyOpened } from "vs/platform/history/common/history";
import { IEnvironmentService } from "vs/platform/environment/common/environment";

export interface ILegacyRecentlyOpened extends IRecentlyOpened {
	folders: string[]; // TODO@Ben migration
}

export class HistoryMainService implements IHistoryMainService {

	private static MAX_TOTAL_RECENT_ENTRIES = 100;

	private static recentlyOpenedStorageKey = 'openedPathsList';

	_serviceBrand: any;

	private _onRecentlyOpenedChange = new Emitter<void>();
	onRecentlyOpenedChange: CommonEvent<void> = this._onRecentlyOpenedChange.event;

	constructor(
		@IStorageService private storageService: IStorageService,
		@ILogService private logService: ILogService,
		@IWorkspacesMainService private workspacesService: IWorkspacesMainService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
	}

	public addRecentlyOpened(workspaces: (IWorkspaceIdentifier | string)[], files: string[]): void {
		if ((workspaces && workspaces.length > 0) || (files && files.length > 0)) {
			const mru = this.getRecentlyOpened();

			// Workspaces
			workspaces.forEach(workspace => {
				mru.workspaces.unshift(workspace);
				mru.workspaces = arrays.distinct(mru.workspaces, workspace => this.isSingleFolderWorkspace(workspace) ? workspace : workspace.id);

				// Add to recent documents unless the workspace is untitled (macOS only, Windows can show workspaces separately)
				const isUntitledWorkspace = this.isWorkspace(workspace) && this.workspacesService.isUntitledWorkspace(workspace);
				if (isMacintosh && !isUntitledWorkspace) {
					app.addRecentDocument(this.isSingleFolderWorkspace(workspace) ? workspace : workspace.configPath);
				}
			});

			// Files
			files.forEach((path) => {
				mru.files.unshift(path);
				mru.files = arrays.distinct(mru.files, f => isLinux ? f : f.toLowerCase());

				// Add to recent documents (Windows/macOS only)
				if (isMacintosh || isWindows) {
					app.addRecentDocument(path);
				}
			});

			// Make sure its bounded
			mru.workspaces = mru.workspaces.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);
			mru.files = mru.files.slice(0, HistoryMainService.MAX_TOTAL_RECENT_ENTRIES);

			this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, mru);
			this._onRecentlyOpenedChange.fire();
		}
	}

	private isWorkspace(obj: any): obj is IWorkspaceIdentifier {
		return !!(obj as IWorkspaceIdentifier).id;
	}

	private isSingleFolderWorkspace(obj: any): obj is string {
		return typeof obj === 'string';
	}

	public removeFromRecentlyOpened(toRemove: IWorkspaceIdentifier | string): void;
	public removeFromRecentlyOpened(toRemove: (IWorkspaceIdentifier | string)[]): void;
	public removeFromRecentlyOpened(arg1: any): void {
		let workspacesOrFilesToRemove: any[];
		if (Array.isArray(arg1)) {
			workspacesOrFilesToRemove = arg1;
		} else {
			workspacesOrFilesToRemove = [arg1];
		}

		const mru = this.getRecentlyOpened();
		let update = false;

		workspacesOrFilesToRemove.forEach((workspaceOrFileToRemove: IWorkspaceIdentifier | string) => {

			// Remove workspace
			let index = arrays.firstIndex(mru.workspaces, workspace => this.equals(workspace, workspaceOrFileToRemove));
			if (index >= 0) {
				mru.workspaces.splice(index, 1);
				update = true;
			}

			// Remove file
			if (typeof workspaceOrFileToRemove === 'string') {
				let index = mru.files.indexOf(workspaceOrFileToRemove);
				if (index >= 0) {
					mru.files.splice(index, 1);
					update = true;
				}
			}
		});

		if (update) {
			this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, mru);
			this._onRecentlyOpenedChange.fire();
		}
	}

	private equals(w1: IWorkspaceIdentifier | string, w2: IWorkspaceIdentifier | string): boolean {
		if (w1 === w2) {
			return true;
		}

		if (typeof w1 === 'string' || typeof w2 === 'string') {
			return false;
		}

		return w1.id === w2.id;
	}

	public clearRecentlyOpened(): void {
		this.storageService.setItem(HistoryMainService.recentlyOpenedStorageKey, <IRecentlyOpened>{ workspaces: [], folders: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentlyOpenedChange.fire();
	}

	public getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | string, currentFiles?: IPath[]): IRecentlyOpened {
		let workspaces: (IWorkspaceIdentifier | string)[];
		let files: string[];

		// Get from storage
		const storedRecents = this.storageService.getItem<IRecentlyOpened>(HistoryMainService.recentlyOpenedStorageKey) as ILegacyRecentlyOpened;
		if (storedRecents) {
			workspaces = storedRecents.workspaces || storedRecents.folders || [];
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
			files.unshift(...currentFiles.map(f => f.filePath));
		}

		// Clear those dupes
		workspaces = arrays.distinct(workspaces, workspace => this.isSingleFolderWorkspace(workspace) ? workspace : workspace.id);
		files = arrays.distinct(files);

		return { workspaces, files };
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

		// Recent Workspaces
		if (this.getRecentlyOpened().workspaces.length > 0) {

			// The user might have meanwhile removed items from the jump list and we have to respect that
			// so we need to update our list of recent paths with the choice of the user to not add them again
			// Also: Windows will not show our custom category at all if there is any entry which was removed
			// by the user! See https://github.com/Microsoft/vscode/issues/15052
			this.removeFromRecentlyOpened(app.getJumpListSettings().removedItems.map(r => trim(r.args, '"')));

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Workspaces"),
				items: this.getRecentlyOpened().workspaces.slice(0, 7 /* limit number of entries here */).map(workspace => {
					const title = this.isSingleFolderWorkspace(workspace) ? (path.basename(workspace) || workspace) : getWorkspaceLabel(this.environmentService, workspace);
					const description = this.isSingleFolderWorkspace(workspace) ? nls.localize('folderDesc', "{0} {1}", path.basename(workspace), getPathLabel(path.dirname(workspace))) : nls.localize('codeWorkspace', "Code Workspace");

					return <Electron.JumpListItem>{
						type: 'task',
						title,
						description,
						program: process.execPath,
						args: `"${this.isSingleFolderWorkspace(workspace) ? workspace : workspace.configPath}"`, // open folder (use quotes to support paths with whitespaces)
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