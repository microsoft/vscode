/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IProcessEnvironment, isMacintosh, isWindows } from 'vs/base/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

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
	remoteAuthority?: string;
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
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	showMessageBox(windowId: number, options: MessageBoxOptions): Promise<IMessageBoxResult>;
	showSaveDialog(windowId: number, options: SaveDialogOptions): Promise<string>;
	showOpenDialog(windowId: number, options: OpenDialogOptions): Promise<string[]>;

	reloadWindow(windowId: number, args?: ParsedArgs): Promise<void>;
	openDevTools(windowId: number, options?: IDevToolsOptions): Promise<void>;
	toggleDevTools(windowId: number): Promise<void>;
	closeWorkspace(windowId: number): Promise<void>;
	enterWorkspace(windowId: number, path: string): Promise<IEnterWorkspaceResult | undefined>;
	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): Promise<IEnterWorkspaceResult | undefined>;
	saveAndEnterWorkspace(windowId: number, path: string): Promise<IEnterWorkspaceResult | undefined>;
	toggleFullScreen(windowId: number): Promise<void>;
	setRepresentedFilename(windowId: number, fileName: string): Promise<void>;
	addRecentlyOpened(files: URI[]): Promise<void>;
	removeFromRecentlyOpened(paths: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string>): Promise<void>;
	clearRecentlyOpened(): Promise<void>;
	getRecentlyOpened(windowId: number): Promise<IRecentlyOpened>;
	focusWindow(windowId: number): Promise<void>;
	closeWindow(windowId: number): Promise<void>;
	isFocused(windowId: number): Promise<boolean>;
	isMaximized(windowId: number): Promise<boolean>;
	maximizeWindow(windowId: number): Promise<void>;
	unmaximizeWindow(windowId: number): Promise<void>;
	minimizeWindow(windowId: number): Promise<void>;
	onWindowTitleDoubleClick(windowId: number): Promise<void>;
	setDocumentEdited(windowId: number, flag: boolean): Promise<void>;
	quit(): Promise<void>;
	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): Promise<void>;

	// macOS Native Tabs
	newWindowTab(): Promise<void>;
	showPreviousWindowTab(): Promise<void>;
	showNextWindowTab(): Promise<void>;
	moveWindowTabToNewWindow(): Promise<void>;
	mergeAllWindowTabs(): Promise<void>;
	toggleWindowTabsBar(): Promise<void>;

	// macOS TouchBar
	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): Promise<void>;

	// Shared process
	whenSharedProcessReady(): Promise<void>;
	toggleSharedProcess(): Promise<void>;

	// Global methods
	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): Promise<void>;
	openNewWindow(options?: INewWindowOptions): Promise<void>;
	showWindow(windowId: number): Promise<void>;
	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>;
	getWindowCount(): Promise<number>;
	log(severity: string, ...messages: string[]): Promise<void>;
	showItemInFolder(path: string): Promise<void>;
	getActiveWindowId(): Promise<number | undefined>;

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(url: string): Promise<boolean>;

	// TODO: this is a bit backwards
	startCrashReporter(config: CrashReporterStartOptions): Promise<void>;

	openAboutDialog(): Promise<void>;
	resolveProxy(windowId: number, url: string): Promise<string | undefined>;
}

export const IWindowService = createDecorator<IWindowService>('windowService');

export interface IMessageBoxResult {
	button: number;
	checkboxChecked?: boolean;
}

export interface IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean>;
	readonly onDidChangeMaximize: Event<boolean>;

	readonly hasFocus: boolean;

	getConfiguration(): IWindowConfiguration;
	getCurrentWindowId(): number;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	reloadWindow(args?: ParsedArgs): Promise<void>;
	openDevTools(options?: IDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;
	closeWorkspace(): Promise<void>;
	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void>;
	enterWorkspace(path: string): Promise<IEnterWorkspaceResult | undefined>;
	createAndEnterWorkspace(folders?: IWorkspaceFolderCreationData[], path?: string): Promise<IEnterWorkspaceResult | undefined>;
	saveAndEnterWorkspace(path: string): Promise<IEnterWorkspaceResult | undefined>;
	toggleFullScreen(): Promise<void>;
	setRepresentedFilename(fileName: string): Promise<void>;
	getRecentlyOpened(): Promise<IRecentlyOpened>;
	focusWindow(): Promise<void>;
	closeWindow(): Promise<void>;
	openWindow(paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): Promise<void>;
	isFocused(): Promise<boolean>;
	setDocumentEdited(flag: boolean): Promise<void>;
	isMaximized(): Promise<boolean>;
	maximizeWindow(): Promise<void>;
	unmaximizeWindow(): Promise<void>;
	minimizeWindow(): Promise<void>;
	onWindowTitleDoubleClick(): Promise<void>;
	show(): Promise<void>;
	showMessageBox(options: MessageBoxOptions): Promise<IMessageBoxResult>;
	showSaveDialog(options: SaveDialogOptions): Promise<string>;
	showOpenDialog(options: OpenDialogOptions): Promise<string[]>;
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
	smoothScrollingWorkaround: boolean;
	clickThroughInactive: boolean;
}

export function getTitleBarStyle(configurationService: IConfigurationService, environment: IEnvironmentService, isExtensionDevelopment = environment.isExtensionDevelopment): 'native' | 'custom' {
	const configuration = configurationService.getValue<IWindowSettings>('window');

	const isDev = !environment.isBuilt || isExtensionDevelopment;
	if (isMacintosh && isDev) {
		return 'native'; // not enabled when developing due to https://github.com/electron/electron/issues/3647
	}

	if (configuration) {
		const useNativeTabs = isMacintosh && configuration.nativeTabs === true;
		if (useNativeTabs) {
			return 'native'; // native tabs on sierra do not work with custom title style
		}

		const useSimpleFullScreen = isMacintosh && configuration.nativeFullScreen === false;
		if (useSimpleFullScreen) {
			return 'native'; // simple fullscreen does not work well with custom title style (https://github.com/Microsoft/vscode/issues/63291)
		}

		const smoothScrollingWorkaround = isWindows && configuration.smoothScrollingWorkaround === true;
		if (smoothScrollingWorkaround) {
			return 'native'; // smooth scrolling workaround does not work with custom title style
		}

		const style = configuration.titleBarStyle;
		if (style === 'native') {
			return 'native';
		}
	}

	return 'custom'; // default to custom on all OS
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

	remoteAuthority?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashData?: string;

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
	args?: any[];
}

export interface IRunKeybindingInWindowRequest {
	userSettingsLabel: string;
}

export class ActiveWindowManager implements IDisposable {

	private disposables: IDisposable[] = [];
	private firstActiveWindowIdPromise: Promise<any> | null;
	private _activeWindowId: number | undefined;

	constructor(@IWindowsService windowsService: IWindowsService) {
		const onActiveWindowChange = Event.latch(Event.any(windowsService.onWindowOpen, windowsService.onWindowFocus));
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

	getActiveClientId(): Promise<string> {
		if (this.firstActiveWindowIdPromise) {
			return this.firstActiveWindowIdPromise;
		}

		return Promise.resolve(`window:${this._activeWindowId}`);
	}

	dispose() {
		this.disposables = dispose(this.disposables);
	}
}
