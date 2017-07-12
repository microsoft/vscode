/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { remote } from 'electron';
import { IRecentlyOpened } from "vs/platform/history/common/history";

export class WindowService implements IWindowService {

	_serviceBrand: any;

	constructor(
		private windowId: number,
		@IWindowsService private windowsService: IWindowsService
	) { }

	getCurrentWindowId(): number {
		return this.windowId;
	}

	pickFileFolderAndOpen(forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void> {
		return this.windowsService.pickFileFolderAndOpen(this.windowId, forceNewWindow, data);
	}

	pickFileAndOpen(forceNewWindow?: boolean, path?: string, data?: ITelemetryData): TPromise<void> {
		return this.windowsService.pickFileAndOpen(this.windowId, forceNewWindow, path, data);
	}

	pickFolderAndOpen(forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void> {
		return this.windowsService.pickFolderAndOpen(this.windowId, forceNewWindow, data);
	}

	pickFolder(options?: { buttonLabel: string; title: string; }): TPromise<string[]> {
		return this.windowsService.pickFolder(this.windowId, options);
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

	closeFolder(): TPromise<void> {
		return this.windowsService.closeFolder(this.windowId);
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
