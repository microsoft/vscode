/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import * as arrays from 'vs/base/common/arrays';
import { trim } from 'vs/base/common/strings';
import { IStateService } from 'vs/platform/state/common/state';
import { app } from 'electron';
import { ILogService } from 'vs/platform/log/common/log';
import { getBaseLabel } from 'vs/base/common/labels';
import { IPath } from 'vs/platform/windows/common/windows';
import { Event as CommonEvent, Emitter } from 'vs/base/common/event';
import { isWindows, isMacintosh, isLinux } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, IWorkspacesMainService, getWorkspaceLabel, IWorkspaceSavedEvent, ISingleFolderWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IHistoryMainService, IRecentlyOpened } from 'vs/platform/history/common/history';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { isEqual } from 'vs/base/common/paths';
import { RunOnceScheduler } from 'vs/base/common/async';
import { getComparisonKey, isEqual as areResourcesEqual, hasToIgnoreCase, dirname } from 'vs/base/common/resources';
import URI, { UriComponents } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { IUriDisplayService } from 'vs/platform/uriDisplay/common/uriDisplay';

interface ISerializedRecentlyOpened {
	workspaces: (IWorkspaceIdentifier | string | UriComponents)[];
	files: string[];
}

export class HistoryMainService implements IHistoryMainService {

	private static readonly MAX_TOTAL_RECENT_ENTRIES = 100;
	private static readonly MAX_MACOS_DOCK_RECENT_ENTRIES = 10;

	private static readonly recentlyOpenedStorageKey = 'openedPathsList';

	_serviceBrand: any;

	private _onRecentlyOpenedChange = new Emitter<void>();
	onRecentlyOpenedChange: CommonEvent<void> = this._onRecentlyOpenedChange.event;

	private macOSRecentDocumentsUpdater: RunOnceScheduler;

	constructor(
		@IStateService private stateService: IStateService,
		@ILogService private logService: ILogService,
		@IWorkspacesMainService private workspacesMainService: IWorkspacesMainService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IUriDisplayService private uriDisplayService: IUriDisplayService
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

	addRecentlyOpened(workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[], files: string[]): void {
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
				files.forEach((path) => {
					mru.files.unshift(path);
					mru.files = arrays.distinct(mru.files, file => this.distinctFn(file));

					// Add to recent documents (Windows only, macOS later)
					if (isWindows) {
						app.addRecentDocument(path);
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

	removeFromRecentlyOpened(pathsToRemove: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | string)[]): void {
		const mru = this.getRecentlyOpened();
		let update = false;

		pathsToRemove.forEach((pathToRemove => {

			// Remove workspace
			let index = arrays.firstIndex(mru.workspaces, workspace => {
				if (isWorkspaceIdentifier(pathToRemove)) {
					return isWorkspaceIdentifier(workspace) && isEqual(pathToRemove.configPath, workspace.configPath, !isLinux /* ignorecase */);
				}
				if (isSingleFolderWorkspaceIdentifier(pathToRemove)) {
					return isSingleFolderWorkspaceIdentifier(workspace) && areResourcesEqual(pathToRemove, workspace, hasToIgnoreCase(pathToRemove));
				}
				if (typeof pathToRemove === 'string') {
					if (isSingleFolderWorkspaceIdentifier(workspace)) {
						return workspace.scheme === Schemas.file && areResourcesEqual(URI.file(pathToRemove), workspace, hasToIgnoreCase(workspace));
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
			index = arrays.firstIndex(mru.files, file => typeof pathToRemove === 'string' && isEqual(file, pathToRemove, !isLinux /* ignorecase */));
			if (index >= 0) {
				mru.files.splice(index, 1);
				update = true;
			}
		}));

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

		let maxEntries = HistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES;

		// Take up to maxEntries/2 workspaces
		const workspaces = mru.workspaces.filter(w => !(isSingleFolderWorkspaceIdentifier(w) && w.scheme !== Schemas.file));
		for (let i = 0; i < workspaces.length && i < HistoryMainService.MAX_MACOS_DOCK_RECENT_ENTRIES / 2; i++) {
			const workspace = workspaces[i];
			app.addRecentDocument(isSingleFolderWorkspaceIdentifier(workspace) ? workspace.scheme === Schemas.file ? workspace.fsPath : workspace.toString() : workspace.configPath);
			maxEntries--;
		}

		// Take up to maxEntries files
		for (let i = 0; i < mru.files.length && i < maxEntries; i++) {
			const file = mru.files[i];
			app.addRecentDocument(file);
		}
	}

	clearRecentlyOpened(): void {
		this.saveRecentlyOpened({ workspaces: [], files: [] });
		app.clearRecentDocuments();

		// Event
		this._onRecentlyOpenedChange.fire();
	}

	getRecentlyOpened(currentWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, currentFiles?: IPath[]): IRecentlyOpened {
		let workspaces: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[];
		let files: string[];

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
			files.unshift(...currentFiles.map(f => f.filePath));
		}

		// Clear those dupes
		workspaces = arrays.distinct(workspaces, workspace => this.distinctFn(workspace));
		files = arrays.distinct(files, file => this.distinctFn(file));

		// Hide untitled workspaces
		workspaces = workspaces.filter(workspace => isSingleFolderWorkspaceIdentifier(workspace) || !this.workspacesMainService.isUntitledWorkspace(workspace));

		return { workspaces, files };
	}

	private distinctFn(workspaceOrFile: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | string): string {
		if (isSingleFolderWorkspaceIdentifier(workspaceOrFile)) {
			return getComparisonKey(workspaceOrFile);
		}
		if (typeof workspaceOrFile === 'string') {
			return isLinux ? workspaceOrFile : workspaceOrFile.toLowerCase();
		}

		return workspaceOrFile.id;
	}

	private getRecentlyOpenedFromStorage(): IRecentlyOpened {
		const storedRecents: ISerializedRecentlyOpened = this.stateService.getItem<ISerializedRecentlyOpened>(HistoryMainService.recentlyOpenedStorageKey) || { workspaces: [], files: [] };
		const result: IRecentlyOpened = { workspaces: [], files: storedRecents.files };
		for (const workspace of storedRecents.workspaces) {
			if (typeof workspace === 'string') {
				result.workspaces.push(URI.file(workspace));
			} else if (isWorkspaceIdentifier(workspace)) {
				result.workspaces.push(workspace);
			} else {
				result.workspaces.push(URI.revive(workspace));
			}
		}
		return result;
	}

	private saveRecentlyOpened(recent: IRecentlyOpened): void {
		const serialized: ISerializedRecentlyOpened = { workspaces: [], files: recent.files };
		for (const workspace of recent.workspaces) {
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				serialized.workspaces.push(<UriComponents>workspace.toJSON());
			} else {
				serialized.workspaces.push(workspace);
			}
		}
		this.stateService.setItem(HistoryMainService.recentlyOpenedStorageKey, recent);
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
			this.removeFromRecentlyOpened(app.getJumpListSettings().removedItems.filter(r => !!r.args).map(r => trim(r.args, '"')));

			// Add entries
			jumpList.push({
				type: 'custom',
				name: nls.localize('recentFolders', "Recent Workspaces"),
				items: this.getRecentlyOpened().workspaces.slice(0, 7 /* limit number of entries here */).map(workspace => {
					const title = getWorkspaceLabel(workspace, this.environmentService, this.uriDisplayService);
					const description = isSingleFolderWorkspaceIdentifier(workspace) ? nls.localize('folderDesc', "{0} {1}", getBaseLabel(workspace), this.uriDisplayService.getLabel(dirname(workspace))) : nls.localize('codeWorkspace', "Code Workspace");
					let args;
					// use quotes to support paths with whitespaces
					if (isSingleFolderWorkspaceIdentifier(workspace)) {
						if (workspace.scheme === Schemas.file) {
							args = `"${workspace.fsPath}"`;
						} else {
							args = `--folderUri "${workspace.path}"`;
						}
					} else {
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
			this.logService.warn('#setJumpList', error); // since setJumpList is relatively new API, make sure to guard for errors
		}
	}
}
