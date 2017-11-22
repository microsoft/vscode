/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { filterEvent, mapEvent, anyEvent } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { remote } from 'electron';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ICommandAction } from 'vs/platform/actions/common/actions';
import { isMacintosh } from 'vs/base/common/platform';
import { normalizeNFC } from 'vs/base/common/strings';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';

export class WindowService implements IWindowService {

	readonly onDidChangeFocus: Event<boolean>;

	_serviceBrand: any;

	constructor(
		private windowId: number,
		private configuration: IWindowConfiguration,
		@IWindowsService private windowsService: IWindowsService
	) {
		const onThisWindowFocus = mapEvent(filterEvent(windowsService.onWindowFocus, id => id === windowId), _ => true);
		const onThisWindowBlur = mapEvent(filterEvent(windowsService.onWindowBlur, id => id === windowId), _ => false);
		this.onDidChangeFocus = anyEvent(onThisWindowFocus, onThisWindowBlur);
	}

	getCurrentWindowId(): number {
		return this.windowId;
	}

	getConfiguration(): IWindowConfiguration {
		return this.configuration;
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

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		return this.windowsService.pickWorkspaceAndOpen(options);
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

	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		return this.windowsService.createAndEnterWorkspace(this.windowId, folders, path);
	}

	saveAndEnterWorkspace(path: string): TPromise<IEnterWorkspaceResult> {
		return this.windowsService.saveAndEnterWorkspace(this.windowId, path);
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

	onWindowTitleDoubleClick(): TPromise<void> {
		return this.windowsService.onWindowTitleDoubleClick(this.windowId);
	}

	setDocumentEdited(flag: boolean): TPromise<void> {
		return this.windowsService.setDocumentEdited(this.windowId, flag);
	}

	show(): TPromise<void> {
		return this.windowsService.showWindow(this.windowId);
	}

	showMessageBoxSync(options: Electron.MessageBoxOptions): number {
		return remote.dialog.showMessageBox(remote.getCurrentWindow(), options);
	}

	showMessageBox(options: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		return new TPromise((c, e) => {
			return remote.dialog.showMessageBox(remote.getCurrentWindow(), options, (response: number, checkboxChecked: boolean) => {
				c({ button: response, checkboxChecked });
			});
		});
	}

	showSaveDialog(options: Electron.SaveDialogOptions, callback?: (fileName: string) => void): string {

		function normalizePath(path: string): string {
			if (path && isMacintosh) {
				path = normalizeNFC(path); // normalize paths returned from the OS
			}

			return path;
		}

		if (callback) {
			return remote.dialog.showSaveDialog(remote.getCurrentWindow(), options, path => callback(normalizePath(path)));
		}

		return normalizePath(remote.dialog.showSaveDialog(remote.getCurrentWindow(), options)); // https://github.com/electron/electron/issues/4936
	}

	showOpenDialog(options: Electron.OpenDialogOptions, callback?: (fileNames: string[]) => void): string[] {

		function normalizePaths(paths: string[]): string[] {
			if (paths && paths.length > 0 && isMacintosh) {
				paths = paths.map(path => normalizeNFC(path)); // normalize paths returned from the OS
			}

			return paths;
		}

		if (callback) {
			return remote.dialog.showOpenDialog(remote.getCurrentWindow(), options, paths => callback(normalizePaths(paths)));
		}

		return normalizePaths(remote.dialog.showOpenDialog(remote.getCurrentWindow(), options)); // https://github.com/electron/electron/issues/4936
	}

	updateTouchBar(items: ICommandAction[][]): TPromise<void> {
		return this.windowsService.updateTouchBar(this.windowId, items);
	}
}
