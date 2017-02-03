/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IWindowService, IWindowsService } from 'vs/platform/windows/common/windows';

export class WindowService implements IWindowService {

	_serviceBrand: any;

	constructor(
		private windowId: number,
		@IWindowsService private windowsService: IWindowsService
	) { }

	getCurrentWindowId(): number {
		return this.windowId;
	}

	openFileFolderPicker(forceNewWindow?: boolean): TPromise<void> {
		return this.windowsService.openFileFolderPicker(this.windowId, forceNewWindow);
	}

	openFilePicker(forceNewWindow?: boolean, path?: string): TPromise<void> {
		return this.windowsService.openFilePicker(this.windowId, forceNewWindow, path);
	}

	openFolderPicker(forceNewWindow?: boolean): TPromise<void> {
		return this.windowsService.openFolderPicker(this.windowId, forceNewWindow);
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

	toggleFullScreen(): TPromise<void> {
		return this.windowsService.toggleFullScreen(this.windowId);
	}

	setRepresentedFilename(fileName: string): TPromise<void> {
		return this.windowsService.setRepresentedFilename(this.windowId, fileName);
	}

	addToRecentlyOpen(paths: { path: string, isFile?: boolean }[]): TPromise<void> {
		return this.windowsService.addToRecentlyOpen(paths);
	}

	removeFromRecentlyOpen(paths: string[]): TPromise<void> {
		return this.windowsService.removeFromRecentlyOpen(paths);
	}

	getRecentlyOpen(): TPromise<{ files: string[]; folders: string[]; }> {
		return this.windowsService.getRecentlyOpen(this.windowId);
	}

	focusWindow(): TPromise<void> {
		return this.windowsService.focusWindow(this.windowId);
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

	setDocumentEdited(flag: boolean): TPromise<void> {
		return this.windowsService.setDocumentEdited(this.windowId, flag);
	}

}
