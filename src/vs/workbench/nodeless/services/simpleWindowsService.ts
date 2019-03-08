/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, IURIToOpen, IMessageBoxResult } from 'vs/platform/windows/common/windows';
import { URI } from 'vs/base/common/uri';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';

export class SimpleWindowsService implements IWindowsService {
	_serviceBrand: any;

	windowCount = 1;

	readonly onWindowOpen: Event<number> = Event.None;
	readonly onWindowFocus: Event<number> = Event.None;
	readonly onWindowBlur: Event<number> = Event.None;
	readonly onWindowMaximize: Event<number> = Event.None;
	readonly onWindowUnmaximize: Event<number> = Event.None;
	readonly onRecentlyOpenedChange: Event<void> = Event.None;

	isFocused(_windowId: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	openDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_windowId: number, _path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setRepresentedFilename(_windowId: number, _fileName: string): Promise<void> {
		return Promise.resolve();
	}

	addRecentlyOpened(_files: URI[]): Promise<void> {
		return Promise.resolve();
	}

	removeFromRecentlyOpened(_paths: URI[]): Promise<void> {
		return Promise.resolve();
	}

	clearRecentlyOpened(): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(_windowId: number): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}

	focusWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	isMaximized(_windowId: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	maximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setDocumentEdited(_windowId: number, _flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	quit(): Promise<void> {
		return Promise.resolve();
	}

	relaunch(_options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return Promise.resolve();
	}

	whenSharedProcessReady(): Promise<void> {
		return Promise.resolve();
	}

	toggleSharedProcess(): Promise<void> {
		return Promise.resolve();
	}

	// Global methods
	openWindow(_windowId: number, _uris: IURIToOpen[], _options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): Promise<void> {
		return Promise.resolve();
	}

	openNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	showWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		throw new Error('not implemented');
	}

	getWindowCount(): Promise<number> {
		return Promise.resolve(this.windowCount);
	}

	log(_severity: string, ..._messages: string[]): Promise<void> {
		return Promise.resolve();
	}

	showItemInFolder(_path: URI): Promise<void> {
		return Promise.resolve();
	}

	newWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showPreviousWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showNextWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	mergeAllWindowTabs(): Promise<void> {
		return Promise.resolve();
	}

	toggleWindowTabsBar(): Promise<void> {
		return Promise.resolve();
	}

	updateTouchBar(_windowId: number, _items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	getActiveWindowId(): Promise<number | undefined> {
		return Promise.resolve(undefined);
	}

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(_url: string): Promise<boolean> {
		return Promise.resolve(true);
	}

	// TODO: this is a bit backwards
	startCrashReporter(_config: Electron.CrashReporterStartOptions): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_windowId: number, _options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		throw new Error('not implemented');
	}

	showSaveDialog(_windowId: number, _options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_windowId: number, _options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	openAboutDialog(): Promise<void> {
		return Promise.resolve();
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}