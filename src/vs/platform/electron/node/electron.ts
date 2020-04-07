/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { MessageBoxOptions, MessageBoxReturnValue, OpenDevToolsOptions, SaveDialogOptions, OpenDialogOptions, OpenDialogReturnValue, SaveDialogReturnValue, CrashReporterStartOptions } from 'electron';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IWindowOpenable, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { INativeOpenDialogOptions } from 'vs/platform/dialogs/node/dialogs';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { INativeOpenWindowOptions, IOpenedWindow } from 'vs/platform/windows/node/window';

export const IElectronService = createDecorator<IElectronService>('electronService');

export interface IElectronService {

	_serviceBrand: undefined;

	// Events
	readonly onWindowOpen: Event<number>;

	readonly onWindowMaximize: Event<number>;
	readonly onWindowUnmaximize: Event<number>;

	readonly onWindowFocus: Event<number>;
	readonly onWindowBlur: Event<number>;

	// Window
	getWindows(): Promise<IOpenedWindow[]>;
	getWindowCount(): Promise<number>;
	getActiveWindowId(): Promise<number | undefined>;

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: INativeOpenWindowOptions): Promise<void>;

	toggleFullScreen(): Promise<void>;

	handleTitleDoubleClick(): Promise<void>;

	isMaximized(): Promise<boolean>;
	maximizeWindow(): Promise<void>;
	unmaximizeWindow(): Promise<void>;
	minimizeWindow(): Promise<void>;

	focusWindow(options?: { windowId?: number }): Promise<void>;

	// Dialogs
	showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;

	// OS
	showItemInFolder(path: string): Promise<void>;
	setRepresentedFilename(path: string): Promise<void>;
	setDocumentEdited(edited: boolean): Promise<void>;
	openExternal(url: string): Promise<boolean>;
	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void>;

	// macOS Touchbar
	newWindowTab(): Promise<void>;
	showPreviousWindowTab(): Promise<void>;
	showNextWindowTab(): Promise<void>;
	moveWindowTabToNewWindow(): Promise<void>;
	mergeAllWindowTabs(): Promise<void>;
	toggleWindowTabsBar(): Promise<void>;

	// Lifecycle
	relaunch(options?: { addArgs?: string[], removeArgs?: string[] }): Promise<void>;
	reload(options?: { disableExtensions?: boolean }): Promise<void>;
	closeWindow(): Promise<void>;
	closeWindowById(windowId: number): Promise<void>;
	quit(): Promise<void>;

	// Development
	openDevTools(options?: OpenDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;
	startCrashReporter(options: CrashReporterStartOptions): Promise<void>;

	// Connectivity
	resolveProxy(url: string): Promise<string | undefined>;
}
