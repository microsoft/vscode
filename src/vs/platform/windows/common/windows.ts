/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ICommandAction } from 'vs/platform/actions/common/actions';
import { PerformanceEntry } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';

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

export interface OpenDialogOptions {
	title?: string;
	defaultPath?: string;
	buttonLabel?: string;
	filters?: FileFilter[];
	properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory'>;
	message?: string;
}

export interface IWindowsService {

	_serviceBrand: any;

	onWindowOpen: Event<number>;
	onWindowFocus: Event<number>;
	onWindowBlur: Event<number>;

	// Dialogs
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	showMessageBox(windowId: number, options: MessageBoxOptions): TPromise<IMessageBoxResult>;
	showSaveDialog(windowId: number, options: SaveDialogOptions): TPromise<string>;
	showOpenDialog(windowId: number, options: OpenDialogOptions): TPromise<string[]>;

	reloadWindow(windowId: number, args?: ParsedArgs): TPromise<void>;
	openDevTools(windowId: number): TPromise<void>;
	toggleDevTools(windowId: number): TPromise<void>;
	closeWorkspace(windowId: number): TPromise<void>;
	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult>;
	toggleFullScreen(windowId: number): TPromise<void>;
	setRepresentedFilename(windowId: number, fileName: string): TPromise<void>;
	addRecentlyOpened(files: string[]): TPromise<void>;
	removeFromRecentlyOpened(paths: string[]): TPromise<void>;
	clearRecentlyOpened(): TPromise<void>;
	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened>;
	focusWindow(windowId: number): TPromise<void>;
	closeWindow(windowId: number): TPromise<void>;
	isFocused(windowId: number): TPromise<boolean>;
	isMaximized(windowId: number): TPromise<boolean>;
	maximizeWindow(windowId: number): TPromise<void>;
	unmaximizeWindow(windowId: number): TPromise<void>;
	onWindowTitleDoubleClick(windowId: number): TPromise<void>;
	setDocumentEdited(windowId: number, flag: boolean): TPromise<void>;
	quit(): TPromise<void>;
	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void>;

	// macOS Native Tabs
	showPreviousWindowTab(): TPromise<void>;
	showNextWindowTab(): TPromise<void>;
	moveWindowTabToNewWindow(): TPromise<void>;
	mergeAllWindowTabs(): TPromise<void>;
	toggleWindowTabsBar(): TPromise<void>;

	// macOS TouchBar
	updateTouchBar(windowId: number, items: ICommandAction[][]): TPromise<void>;

	// Shared process
	whenSharedProcessReady(): TPromise<void>;
	toggleSharedProcess(): TPromise<void>;

	// Global methods
	openWindow(paths: string[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean; }): TPromise<void>;
	openNewWindow(): TPromise<void>;
	showWindow(windowId: number): TPromise<void>;
	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderPath?: string; title: string; filename?: string; }[]>;
	getWindowCount(): TPromise<number>;
	log(severity: string, ...messages: string[]): TPromise<void>;
	showItemInFolder(path: string): TPromise<void>;

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(url: string): TPromise<boolean>;

	// TODO: this is a bit backwards
	startCrashReporter(config: CrashReporterStartOptions): TPromise<void>;

	openAboutDialog(): TPromise<void>;
}

export const IWindowService = createDecorator<IWindowService>('windowService');

export interface IMessageBoxResult {
	button: number;
	checkboxChecked?: boolean;
}

export interface IWindowService {

	_serviceBrand: any;

	onDidChangeFocus: Event<boolean>;

	getConfiguration(): IWindowConfiguration;
	getCurrentWindowId(): number;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void>;
	reloadWindow(args?: ParsedArgs): TPromise<void>;
	openDevTools(): TPromise<void>;
	toggleDevTools(): TPromise<void>;
	closeWorkspace(): TPromise<void>;
	updateTouchBar(items: ICommandAction[][]): TPromise<void>;
	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(path: string): TPromise<IEnterWorkspaceResult>;
	toggleFullScreen(): TPromise<void>;
	setRepresentedFilename(fileName: string): TPromise<void>;
	getRecentlyOpened(): TPromise<IRecentlyOpened>;
	focusWindow(): TPromise<void>;
	closeWindow(): TPromise<void>;
	isFocused(): TPromise<boolean>;
	setDocumentEdited(flag: boolean): TPromise<void>;
	onWindowTitleDoubleClick(): TPromise<void>;
	show(): TPromise<void>;
	showMessageBox(options: MessageBoxOptions): TPromise<IMessageBoxResult>;
	showSaveDialog(options: SaveDialogOptions): TPromise<string>;
	showOpenDialog(options: OpenDialogOptions): TPromise<string[]>;
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
	enableMenuBarMnemonics: boolean;
	closeWhenEmpty: boolean;
}

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

export enum ReadyState {

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

export interface IPath {

	// the file path to open within a Code instance
	filePath?: string;

	// the line number in the file path to open
	lineNumber?: number;

	// the column number in the file path to open
	columnNumber?: number;
}

export interface IPathsToWaitFor {
	paths: IPath[];
	waitMarkerFilePath: string;
}

export interface IOpenFileRequest {
	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	filesToDiff?: IPath[];
	filesToWait?: IPathsToWaitFor;
	termProgram?: string;
}

export interface IAddFoldersRequest {
	foldersToAdd: IPath[];
}

export interface IWindowConfiguration extends ParsedArgs, IOpenFileRequest {
	machineId: string;
	windowId: number;
	logLevel: LogLevel;

	appRoot: string;
	execPath: string;
	isInitialStartup?: boolean;

	userEnv: IProcessEnvironment;
	nodeCachedDataDir: string;

	backupPath?: string;

	workspace?: IWorkspaceIdentifier;
	folderPath?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	highContrast?: boolean;
	baseTheme?: string;
	backgroundColor?: string;
	accessibilitySupport?: boolean;

	perfEntries: PerformanceEntry[];
	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
}

export interface IRunActionInWindowRequest {
	id: string;
	from: 'menu' | 'touchbar' | 'mouse';
}
