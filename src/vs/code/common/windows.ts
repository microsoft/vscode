/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Event from 'vs/base/common/event';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWindowsService } from 'vs/platform/windows/common/windows';

export enum OpenContext {

	// opening when running from the command line
	CLI,

	// macOS only: opening from the dock (also when opening files to a running instance from desktop)
	DOCK,

	// opening from the main application window
	MENU,

	// opening from a file or folder dialog
	DIALOG,

	// opening from the OS's UI
	DESKTOP,

	// opening through the API
	API
}

export interface IWindowEventService {
	_serviceBrand: any;

	onNewWindowOpen: Event<number>;
	onWindowFocus: Event<number>;
}

export class ActiveWindowManager implements IDisposable {

	private disposables: IDisposable[] = [];
	private _activeWindowId: number;

	constructor( @IWindowsService windowsService: IWindowsService) {
		windowsService.onWindowOpen(this.setActiveWindow, this, this.disposables);
		windowsService.onWindowFocus(this.setActiveWindow, this, this.disposables);
	}

	private setActiveWindow(windowId: number) {
		this._activeWindowId = windowId;
	}

	get activeClientId(): string {
		return `window:${this._activeWindowId}`;
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}