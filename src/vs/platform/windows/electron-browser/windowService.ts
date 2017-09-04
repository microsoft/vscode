/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { filterEvent, mapEvent, any } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService, INativeOpenDialogOptions } from 'vs/platform/windows/common/windows';
import { remote } from 'electron';
import { IRecentlyOpened } from 'vs/platform/history/common/history';

export class WindowService implements IWindowService {

	readonly onDidChangeFocus: Event<boolean>;

	_serviceBrand: any;

	constructor(
		private windowId: number,
		@IWindowsService private windowsService: IWindowsService
	) {
		const onThisWindowFocus = mapEvent(filterEvent(windowsService.onWindowFocus, id => id === windowId), _ => true);
		const onThisWindowBlur = mapEvent(filterEvent(windowsService.onWindowBlur, id => id === windowId), _ => false);
		this.onDidChangeFocus = any(onThisWindowFocus, onThisWindowBlur);
	}

	getCurrentWindowId(): number {
		return this.windowId;
	}

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFileFolderAndOpen(options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFileAndOpen(options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickFolderAndOpen(options);
	}

	reloadWindow(): TPromise<void> {
		return this.windowsService.reloadWindow(this.windowId);
	}

	openDevTools(): TPromise<void> {
		return this.windowsService.openDevTools(this.windowId);
	}

	toggleDevTools(): TPromise<void> {
		return this.windowsService.toggleDevTools(this.windowId);
	}

	closeWorkspace(): TPromise<void> {
		return this.windowsService.closeWorkspace(this.windowId);
	}

	openWorkspace(): TPromise<void> {
		return this.windowsService.openWorkspace(this.windowId);
	}

	createAndOpenWorkspace(folders?: string[], path?: string): TPromise<void> {
		return this.windowsService.createAndOpenWorkspace(this.windowId, folders, path);
	}

	saveAndOpenWorkspace(path: string): TPromise<void> {
		return this.windowsService.saveAndOpenWorkspace(this.windowId, path);
	}

	closeWindow(): TPromise<void> {
		return this.windowsService.closeWindow(this.windowId);
	}

	toggleFullScreen(): TPromise<void> {
		return this.windowsService.toggleFullScreen(this.windowId);
	}

	setRepresentedFilename(fileName: string): TPromise<void> {
		return this.windowsService.setRepresentedFilename(this.windowId, fileName);
	}

	getRecentlyOpened(): TPromise<IRecentlyOpened> {
		return this.windowsService.getRecentlyOpened(this.windowId);
	}

	focusWindow(): TPromise<void> {
		return this.windowsService.focusWindow(this.windowId);
	}

	isFocused(): TPromise<boolean> {
		return this.windowsService.isFocused(this.windowId);
	}

	isMaximized(): TPromise<boolean> {
		return this.windowsService.isMaximized(this.windowId);
	}

	maximizeWindow(): TPromise<void> {
		return this.windowsService.maximizeWindow(this.windowId);
	}

	unmaximizeWindow(): TPromise<void> {
		return this.windowsService.unmaximizeWindow(this.windowId);
	}

	onWindowTitleDoubleClick(): TPromise<void> {
		return this.windowsService.onWindowTitleDoubleClick(this.windowId);
	}

	setDocumentEdited(flag: boolean): TPromise<void> {
		return this.windowsService.setDocumentEdited(this.windowId, flag);
	}

	show(): TPromise<void> {
		return this.windowsService.showWindow(this.windowId);
	}

	showMessageBox(options: Electron.ShowMessageBoxOptions): number {
		return remote.dialog.showMessageBox(remote.getCurrentWindow(), options);
	}

	showSaveDialog(options: Electron.SaveDialogOptions, callback?: (fileName: string) => void): string {
		if (callback) {
			return remote.dialog.showSaveDialog(remote.getCurrentWindow(), options, callback);
		}

		return remote.dialog.showSaveDialog(remote.getCurrentWindow(), options); // https://github.com/electron/electron/issues/4936
	}

	showOpenDialog(options: Electron.OpenDialogOptions, callback?: (fileNames: string[]) => void): string[] {
		if (callback) {
			return remote.dialog.showOpenDialog(remote.getCurrentWindow(), options, callback);
		}

		return remote.dialog.showOpenDialog(remote.getCurrentWindow(), options); // https://github.com/electron/electron/issues/4936
	}
}
