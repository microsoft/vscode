/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { URI } from '../../../base/common/uri.js';
import { MessageBoxOptions, MessageBoxReturnValue, OpenDevToolsOptions, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from '../../../base/parts/sandbox/common/electronTypes.js';
import { ISerializableCommandAction } from '../../action/common/action.js';
import { INativeOpenDialogOptions } from '../../dialogs/common/dialogs.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IV8Profile } from '../../profiling/common/profiling.js';
import { AuthInfo, Credentials } from '../../request/common/request.js';
import { IPartsSplash } from '../../theme/common/themeService.js';
import { IColorScheme, IOpenedAuxiliaryWindow, IOpenedMainWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IPoint, IRectangle, IWindowOpenable } from '../../window/common/window.js';

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

export interface INativeHostOptions {
	readonly targetWindowId?: number;
}

export interface ICommonNativeHostService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	// Events
	readonly onDidOpenMainWindow: Event<number>;

	readonly onDidMaximizeWindow: Event<number>;
	readonly onDidUnmaximizeWindow: Event<number>;

	readonly onDidFocusMainWindow: Event<number>;
	readonly onDidBlurMainWindow: Event<number>;

	readonly onDidChangeWindowFullScreen: Event<{ windowId: number; fullscreen: boolean }>;
	readonly onDidChangeWindowAlwaysOnTop: Event<{ windowId: number; alwaysOnTop: boolean }>;

	readonly onDidFocusMainOrAuxiliaryWindow: Event<number>;
	readonly onDidBlurMainOrAuxiliaryWindow: Event<number>;

	readonly onDidChangeDisplay: Event<void>;

	readonly onDidResumeOS: Event<unknown>;

	readonly onDidChangeColorScheme: Event<IColorScheme>;

	readonly onDidChangePassword: Event<{ readonly service: string; readonly account: string }>;

	readonly onDidTriggerWindowSystemContextMenu: Event<{ readonly windowId: number; readonly x: number; readonly y: number }>;

	// Window
	getWindows(options: { includeAuxiliaryWindows: true }): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>>;
	getWindows(options: { includeAuxiliaryWindows: false }): Promise<Array<IOpenedMainWindow>>;
	getWindowCount(): Promise<number>;
	getActiveWindowId(): Promise<number | undefined>;
	getActiveWindowPosition(): Promise<IRectangle | undefined>;
	getNativeWindowHandle(windowId: number): Promise<VSBuffer | undefined>;

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;

	isFullScreen(options?: INativeHostOptions): Promise<boolean>;
	toggleFullScreen(options?: INativeHostOptions): Promise<void>;

	getCursorScreenPoint(): Promise<{ readonly point: IPoint; readonly display: IRectangle }>;

	isMaximized(options?: INativeHostOptions): Promise<boolean>;
	maximizeWindow(options?: INativeHostOptions): Promise<void>;
	unmaximizeWindow(options?: INativeHostOptions): Promise<void>;
	minimizeWindow(options?: INativeHostOptions): Promise<void>;
	moveWindowTop(options?: INativeHostOptions): Promise<void>;
	positionWindow(position: IRectangle, options?: INativeHostOptions): Promise<void>;

	isWindowAlwaysOnTop(options?: INativeHostOptions): Promise<boolean>;
	toggleWindowAlwaysOnTop(options?: INativeHostOptions): Promise<void>;
	setWindowAlwaysOnTop(alwaysOnTop: boolean, options?: INativeHostOptions): Promise<void>;

	/**
	 * Only supported on Windows and macOS. Updates the window controls to match the title bar size.
	 *
	 * @param options `backgroundColor` and `foregroundColor` are only supported on Windows
	 */
	updateWindowControls(options: INativeHostOptions & { height?: number; backgroundColor?: string; foregroundColor?: string }): Promise<void>;

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
	focusWindow(options?: INativeHostOptions & { force?: boolean }): Promise<void>;

	// Dialogs
	showMessageBox(options: MessageBoxOptions & INativeHostOptions): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions & INativeHostOptions): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions & INativeHostOptions): Promise<OpenDialogReturnValue>;

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;

	// OS
	showItemInFolder(path: string): Promise<void>;
	setRepresentedFilename(path: string, options?: INativeHostOptions): Promise<void>;
	setDocumentEdited(edited: boolean, options?: INativeHostOptions): Promise<void>;
	openExternal(url: string, defaultApplication?: string): Promise<boolean>;
	moveItemToTrash(fullPath: string): Promise<void>;

	isAdmin(): Promise<boolean>;
	writeElevated(source: URI, target: URI, options?: { unlock?: boolean }): Promise<void>;
	isRunningUnderARM64Translation(): Promise<boolean>;

	getOSProperties(): Promise<IOSProperties>;
	getOSStatistics(): Promise<IOSStatistics>;
	getOSVirtualMachineHint(): Promise<number>;

	getOSColorScheme(): Promise<IColorScheme>;

	hasWSLFeatureInstalled(): Promise<boolean>;

	// Screenshots
	getScreenshot(): Promise<VSBuffer | undefined>;

	// Process
	getProcessId(): Promise<number | undefined>;
	killProcess(pid: number, code: string): Promise<void>;

	// Clipboard
	triggerPaste(options?: INativeHostOptions): Promise<void>;
	readClipboardText(type?: 'selection' | 'clipboard'): Promise<string>;
	writeClipboardText(text: string, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardFindText(): Promise<string>;
	writeClipboardFindText(text: string): Promise<void>;
	writeClipboardBuffer(format: string, buffer: VSBuffer, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardBuffer(format: string): Promise<VSBuffer>;
	hasClipboard(format: string, type?: 'selection' | 'clipboard'): Promise<boolean>;
	readImage(): Promise<Uint8Array>;

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
	closeWindow(options?: INativeHostOptions): Promise<void>;
	quit(): Promise<void>;
	exit(code: number): Promise<void>;

	// Development
	openDevTools(options?: Partial<OpenDevToolsOptions> & INativeHostOptions): Promise<void>;
	toggleDevTools(options?: INativeHostOptions): Promise<void>;
	openGPUInfoWindow(): Promise<void>;

	// Perf Introspection
	profileRenderer(session: string, duration: number): Promise<IV8Profile>;

	// Connectivity
	resolveProxy(url: string): Promise<string | undefined>;
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
	lookupKerberosAuthorization(url: string): Promise<string | undefined>;
	loadCertificates(): Promise<string[]>;
	findFreePort(startPort: number, giveUpAfter: number, timeout: number, stride?: number): Promise<number>;

	// Registry (Windows only)
	windowsGetStringRegKey(hive: 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE' | 'HKEY_CLASSES_ROOT' | 'HKEY_USERS' | 'HKEY_CURRENT_CONFIG', path: string, name: string): Promise<string | undefined>;
}

export const INativeHostService = createDecorator<INativeHostService>('nativeHostService');

/**
 * A set of methods specific to a native host, i.e. unsupported in web
 * environments.
 *
 * @see {@link IHostService} for methods that can be used in native and web
 * hosts.
 */
export interface INativeHostService extends ICommonNativeHostService { }
