/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { Event } from 'vs/base/common/event';
import { URI } from 'vs/base/common/uri';
import { MessageBoxOptions, MessageBoxReturnValue, MouseInputEvent, OpenDevToolsOptions, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from 'vs/base/parts/sandbox/common/electronTypes';
import { ISerializableCommandAction } from 'vs/platform/action/common/action';
import { INativeOpenDialogOptions } from 'vs/platform/dialogs/common/dialogs';
import { IPartsSplash } from 'vs/platform/theme/common/themeService';
import { IColorScheme, IOpenedWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IWindowOpenable } from 'vs/platform/window/common/window';

export interface ICPUProperties {
	model: string;
	speed: number;
}

export interface IOSProperties {
	type: string;
	release: string;
	arch: string;
	platform: string;
	cpus: ICPUProperties[];
}

export interface IOSStatistics {
	totalmem: number;
	freemem: number;
	loadavg: number[];
}

export interface ICommonNativeHostService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	// Events
	readonly onDidOpenWindow: Event<number>;

	readonly onDidMaximizeWindow: Event<number>;
	readonly onDidUnmaximizeWindow: Event<number>;

	readonly onDidFocusWindow: Event<number>;
	readonly onDidBlurWindow: Event<number>;

	readonly onDidChangeDisplay: Event<void>;

	readonly onDidResumeOS: Event<unknown>;

	readonly onDidChangeColorScheme: Event<IColorScheme>;

	readonly onDidChangePassword: Event<{ service: string; account: string }>;

	readonly onDidTriggerSystemContextMenu: Event<{ windowId: number; x: number; y: number }>;

	// Window
	getWindows(): Promise<IOpenedWindow[]>;
	getWindowCount(): Promise<number>;
	getActiveWindowId(): Promise<number | undefined>;

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;

	toggleFullScreen(): Promise<void>;

	handleTitleDoubleClick(): Promise<void>;

	isMaximized(): Promise<boolean>;
	maximizeWindow(): Promise<void>;
	unmaximizeWindow(): Promise<void>;
	minimizeWindow(): Promise<void>;

	/**
	 * Only supported on Windows and macOS. Updates the window controls to match the title bar size.
	 *
	 * @param options `backgroundColor` and `foregroundColor` are only supported on Windows
	 */
	updateWindowControls(options: { height?: number; backgroundColor?: string; foregroundColor?: string }): Promise<void>;

	setMinimumSize(width: number | undefined, height: number | undefined): Promise<void>;

	saveWindowSplash(splash: IPartsSplash): Promise<void>;

	/**
	 * Make the window focused.
	 *
	 * @param options Pass `force: true` if you want to make the window take
	 * focus even if the application does not have focus currently. This option
	 * should only be used if it is necessary to steal focus from the current
	 * focused application which may not be VSCode.
	 */
	focusWindow(options?: { windowId?: number; force?: boolean }): Promise<void>;

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
	moveItemToTrash(fullPath: string): Promise<void>;

	isAdmin(): Promise<boolean>;
	writeElevated(source: URI, target: URI, options?: { unlock?: boolean }): Promise<void>;

	getOSProperties(): Promise<IOSProperties>;
	getOSStatistics(): Promise<IOSStatistics>;
	getOSVirtualMachineHint(): Promise<number>;

	getOSColorScheme(): Promise<IColorScheme>;

	hasWSLFeatureInstalled(): Promise<boolean>;

	// Process
	killProcess(pid: number, code: string): Promise<void>;

	// Clipboard
	readClipboardText(type?: 'selection' | 'clipboard'): Promise<string>;
	writeClipboardText(text: string, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardFindText(): Promise<string>;
	writeClipboardFindText(text: string): Promise<void>;
	writeClipboardBuffer(format: string, buffer: VSBuffer, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardBuffer(format: string): Promise<VSBuffer>;
	hasClipboard(format: string, type?: 'selection' | 'clipboard'): Promise<boolean>;

	// macOS Touchbar
	newWindowTab(): Promise<void>;
	showPreviousWindowTab(): Promise<void>;
	showNextWindowTab(): Promise<void>;
	moveWindowTabToNewWindow(): Promise<void>;
	mergeAllWindowTabs(): Promise<void>;
	toggleWindowTabsBar(): Promise<void>;
	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void>;

	// macOS Shell command
	installShellCommand(): Promise<void>;
	uninstallShellCommand(): Promise<void>;

	// Lifecycle
	notifyReady(): Promise<void>;
	relaunch(options?: { addArgs?: string[]; removeArgs?: string[] }): Promise<void>;
	reload(options?: { disableExtensions?: boolean }): Promise<void>;
	closeWindow(): Promise<void>;
	closeWindowById(windowId: number): Promise<void>;
	quit(): Promise<void>;
	exit(code: number): Promise<void>;

	// Development
	openDevTools(options?: OpenDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;
	toggleSharedProcessWindow(): Promise<void>;
	sendInputEvent(event: MouseInputEvent): Promise<void>;

	// Connectivity
	resolveProxy(url: string): Promise<string | undefined>;
	findFreePort(startPort: number, giveUpAfter: number, timeout: number, stride?: number): Promise<number>;

	// Registry (windows only)
	windowsGetStringRegKey(hive: 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE' | 'HKEY_CLASSES_ROOT' | 'HKEY_USERS' | 'HKEY_CURRENT_CONFIG', path: string, name: string): Promise<string | undefined>;
}
