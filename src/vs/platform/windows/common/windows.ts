/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event, latch, anyEvent } from 'vs/base/common/event';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export interface INativeOpenDialogOptions {
	windowId?: number;
	forceNewWindow?: boolean;

	dialogOptions?: OpenDialogOptions;

	telemetryEventName?: string;
	telemetryExtraData?: ITelemetryData;
}

export interface IEnterWorkspaceResult {
	workspace: IWorkspaceIdentifier;
	backupPath: string;
}

export interface CrashReporterStartOptions {
	companyName?: string;
	submitURL: string;
	productName?: string;
	uploadToServer?: boolean;
	ignoreSystemCrashHandler?: boolean;
	extra?: any;
	crashesDirectory?: string;
}

export interface OpenDialogOptions {
	title?: string;
	defaultPath?: string;
	buttonLabel?: string;
	filters?: FileFilter[];
	properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory'>;
	message?: string;
}

export interface FileFilter {
	extensions: string[];
	name: string;
}

export interface MessageBoxOptions {
	type?: string;
	buttons?: string[];
	defaultId?: number;
	title?: string;
	message: string;
	detail?: string;
	checkboxLabel?: string;
	checkboxChecked?: boolean;
	cancelId?: number;
	noLink?: boolean;
	normalizeAccessKeys?: boolean;
}

export interface SaveDialogOptions {
	title?: string;
	defaultPath?: string;
	buttonLabel?: string;
	filters?: FileFilter[];
	message?: string;
	nameFieldLabel?: string;
	showsTagField?: boolean;
}

export interface INewWindowOptions {
}

export interface IDevToolsOptions {
	mode: 'right' | 'bottom' | 'undocked' | 'detach';
}

export interface IWindowsService {

	_serviceBrand: any;

	onWindowOpen: Event<number>;
	onWindowFocus: Event<number>;
	onWindowBlur: Event<number>;
	onWindowMaximize: Event<number>;
	onWindowUnmaximize: Event<number>;
	onRecentlyOpenedChange: Event<void>;

	// Dialogs
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	showMessageBox(windowId: number, options: MessageBoxOptions): TPromise<IMessageBoxResult>;
	showSaveDialog(windowId: number, options: SaveDialogOptions): TPromise<string>;
	showOpenDialog(windowId: number, options: OpenDialogOptions): TPromise<string[]>;

	reloadWindow(windowId: number, args?: ParsedArgs): TPromise<void>;
	openDevTools(windowId: number, options?: IDevToolsOptions): TPromise<void>;
	toggleDevTools(windowId: number): TPromise<void>;
	closeWorkspace(windowId: number): TPromise<void>;
	enterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult>;
	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult>;
	toggleFullScreen(windowId: number): TPromise<void>;
	setRepresentedFilename(windowId: number, fileName: string): TPromise<void>;
	addRecentlyOpened(files: URI[]): TPromise<void>;
	removeFromRecentlyOpened(paths: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string)[]): TPromise<void>;
	clearRecentlyOpened(): TPromise<void>;
	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened>;
	focusWindow(windowId: number): TPromise<void>;
	closeWindow(windowId: number): TPromise<void>;
	isFocused(windowId: number): TPromise<boolean>;
	isMaximized(windowId: number): TPromise<boolean>;
	maximizeWindow(windowId: number): TPromise<void>;
	unmaximizeWindow(windowId: number): TPromise<void>;
	minimizeWindow(windowId: number): TPromise<void>;
	onWindowTitleDoubleClick(windowId: number): TPromise<void>;
	setDocumentEdited(windowId: number, flag: boolean): TPromise<void>;
	quit(): TPromise<void>;
	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void>;

	// macOS Native Tabs
	newWindowTab(): TPromise<void>;
	showPreviousWindowTab(): TPromise<void>;
	showNextWindowTab(): TPromise<void>;
	moveWindowTabToNewWindow(): TPromise<void>;
	mergeAllWindowTabs(): TPromise<void>;
	toggleWindowTabsBar(): TPromise<void>;

	// macOS TouchBar
	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): TPromise<void>;

	// Shared process
	whenSharedProcessReady(): TPromise<void>;
	toggleSharedProcess(): TPromise<void>;

	// Global methods
	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): TPromise<void>;
	openNewWindow(options?: INewWindowOptions): TPromise<void>;
	showWindow(windowId: number): TPromise<void>;
	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>;
	getWindowCount(): TPromise<number>;
	log(severity: string, ...messages: string[]): TPromise<void>;
	showItemInFolder(path: string): TPromise<void>;
	getActiveWindowId(): TPromise<number | undefined>;

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(url: string): TPromise<boolean>;

	// TODO: this is a bit backwards
	startCrashReporter(config: CrashReporterStartOptions): TPromise<void>;

	openAboutDialog(): TPromise<void>;
	resolveProxy(windowId: number, url: string): Promise<string | undefined>;
}

export const IWindowService = createDecorator<IWindowService>('windowService');

export interface IMessageBoxResult {
	button: number;
	checkboxChecked?: boolean;
}

export interface IWindowService {

	_serviceBrand: any;

	onDidChangeFocus: Event<boolean>;
	onDidChangeMaximize: Event<boolean>;

	getConfiguration(): IWindowConfiguration;
	getCurrentWindowId(): number;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	reloadWindow(args?: ParsedArgs): TPromise<void>;
	openDevTools(options?: IDevToolsOptions): TPromise<void>;
	toggleDevTools(): TPromise<void>;
	closeWorkspace(): TPromise<void>;
	updateTouchBar(items: ISerializableCommandAction[][]): TPromise<void>;
	enterWorkspace(path: string): TPromise<IEnterWorkspaceResult>;
	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(path: string): TPromise<IEnterWorkspaceResult>;
	toggleFullScreen(): TPromise<void>;
	setRepresentedFilename(fileName: string): TPromise<void>;
	getRecentlyOpened(): TPromise<IRecentlyOpened>;
	focusWindow(): TPromise<void>;
	closeWindow(): TPromise<void>;
	openWindow(paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): TPromise<void>;
	isFocused(): TPromise<boolean>;
	setDocumentEdited(flag: boolean): TPromise<void>;
	isMaximized(): TPromise<boolean>;
	maximizeWindow(): TPromise<void>;
	unmaximizeWindow(): TPromise<void>;
	minimizeWindow(): TPromise<void>;
	onWindowTitleDoubleClick(): TPromise<void>;
	show(): TPromise<void>;
	showMessageBox(options: MessageBoxOptions): TPromise<IMessageBoxResult>;
	showSaveDialog(options: SaveDialogOptions): TPromise<string>;
	showOpenDialog(options: OpenDialogOptions): TPromise<string[]>;
	resolveProxy(url: string): Promise<string | undefined>;
}

export type MenuBarVisibility = 'default' | 'visible' | 'toggle' | 'hidden';

export interface IWindowsConfiguration {
	window: IWindowSettings;
}

export interface IWindowSettings {
	openFilesInNewWindow: 'on' | 'off' | 'default';
	openFoldersInNewWindow: 'on' | 'off' | 'default';
	openWithoutArgumentsInNewWindow: 'on' | 'off';
	restoreWindows: 'all' | 'folders' | 'one' | 'none';
	restoreFullscreen: boolean;
	zoomLevel: number;
	titleBarStyle: 'native' | 'custom';
	autoDetectHighContrast: boolean;
	menuBarVisibility: MenuBarVisibility;
	newWindowDimensions: 'default' | 'inherit' | 'maximized' | 'fullscreen';
	nativeTabs: boolean;
	nativeFullScreen: boolean;
	enableMenuBarMnemonics: boolean;
	closeWhenEmpty: boolean;
	clickThroughInactive: boolean;
}

export const enum OpenContext {

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

export const enum ReadyState {

	/**
	 * This window has not loaded any HTML yet
	 */
	NONE,

	/**
	 * This window is loading HTML
	 */
	LOADING,

	/**
	 * This window is navigating to another HTML
	 */
	NAVIGATING,

	/**
	 * This window is done loading HTML
	 */
	READY
}

export interface IPath extends IPathData {

	// the file path to open within a Code instance
	fileUri?: URI;
}

export interface IPathsToWaitFor extends IPathsToWaitForData {
	paths: IPath[];
}

export interface IPathsToWaitForData {
	paths: IPathData[];
	waitMarkerFilePath: string;
}

export interface IPathData {

	// the file path to open within a Code instance
	fileUri?: UriComponents;

	// the line number in the file path to open
	lineNumber?: number;

	// the column number in the file path to open
	columnNumber?: number;
}

export interface IOpenFileRequest {
	filesToOpen?: IPathData[];
	filesToCreate?: IPathData[];
	filesToDiff?: IPathData[];
	filesToWait?: IPathsToWaitForData;
	termProgram?: string;
}

export interface IAddFoldersRequest {
	foldersToAdd: UriComponents[];
}

export interface IWindowConfiguration extends ParsedArgs {
	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	mainPid: number;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir: string;

	backupPath?: string;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export interface IRunActionInWindowRequest {
	id: string;
	from: 'menu' | 'touchbar' | 'mouse';
}

export class ActiveWindowManager implements IDisposable {

	private disposables: IDisposable[] = [];
	private firstActiveWindowIdPromise: TPromise<any> | null;
	private _activeWindowId: number | undefined;

	constructor(@IWindowsService windowsService: IWindowsService) {
		const onActiveWindowChange = latch(anyEvent(windowsService.onWindowOpen, windowsService.onWindowFocus));
		onActiveWindowChange(this.setActiveWindow, this, this.disposables);

		this.firstActiveWindowIdPromise = windowsService.getActiveWindowId()
			.then(id => (typeof this._activeWindowId === 'undefined') && this.setActiveWindow(id));
	}

	private setActiveWindow(windowId: number | undefined) {
		if (this.firstActiveWindowIdPromise) {
			this.firstActiveWindowIdPromise = null;
		}

		this._activeWindowId = windowId;
	}

	getActiveClientId(): TPromise<string> {
		if (this.firstActiveWindowIdPromise) {
			return this.firstActiveWindowIdPromise;
		}

		return TPromise.as(`window:${this._activeWindowId}`);
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}
