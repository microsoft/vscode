/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import Event, { filterEvent, mapEvent, anyEvent } from 'vs/base/common/event';
import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IWindowConfiguration } from 'vs/platform/windows/common/windows';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ICommandAction } from 'vs/platform/actions/common/actions';
import { IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { ILogService } from 'vs/platform/log/common/log';

export class WindowService implements IWindowService {

	readonly onDidChangeFocus: Event<boolean>;

	_serviceBrand: any;

	constructor(
		private windowId: number,
		private configuration: IWindowConfiguration,
		@IWindowsService private windowsService: IWindowsService,
		@ILogService private logService: ILogService // TODO@Ben remove logging when no longer needed
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

		this.logService.info('pickFileFolderAndOpen: begin');

		return this.windowsService.pickFileFolderAndOpen(options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		this.logService.info('pickFileAndOpen: begin');

		return this.windowsService.pickFileAndOpen(options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		this.logService.info('pickFolderAndOpen: begin');

		return this.windowsService.pickFolderAndOpen(options);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		options.windowId = this.windowId;

		this.logService.info('pickWorkspaceAndOpen: begin');

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

	showMessageBox(options: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		this.logService.info('showMessageBox begin: ', options);
		return this.windowsService.showMessageBox(this.windowId, options).then(result => {
			this.logService.info('showMessageBox closed, response: ', result);
			return result;
		});
	}

	showSaveDialog(options: Electron.SaveDialogOptions): TPromise<string> {
		this.logService.info('showSaveDialog begin: ', options);
		return this.windowsService.showSaveDialog(this.windowId, options).then(result => {
			this.logService.info('showSaveDialog begin: ', result);
			return result;
		});
	}

	showOpenDialog(options: Electron.OpenDialogOptions): TPromise<string[]> {
		this.logService.info('showOpenDialog begin: ', options);
		return this.windowsService.showOpenDialog(this.windowId, options).then(result => {
			this.logService.info('showOpenDialog closed: ', result);
			return result;
		});
	}

	updateTouchBar(items: ICommandAction[][]): TPromise<void> {
		return this.windowsService.updateTouchBar(this.windowId, items);
	}
}
