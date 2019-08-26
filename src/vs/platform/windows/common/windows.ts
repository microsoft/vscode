/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { Event } from 'vs/base/common/event';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';
import { IProcessEnvironment, isMacintosh, isLinux, isWeb } from 'vs/base/common/platform';
import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { ExportData } from 'vs/base/common/performance';
import { LogLevel } from 'vs/platform/log/common/log';
import { DisposableStore, Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export interface INativeOpenDialogOptions {
	windowId?: number;
	forceNewWindow?: boolean;

	defaultPath?: string;

	telemetryEventName?: string;
	telemetryExtraData?: ITelemetryData;
}

export interface IEnterWorkspaceResult {
	workspace: IWorkspaceIdentifier;
	backupPath?: string;
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
	reuseWindow?: boolean;
}

export interface IDevToolsOptions {
	mode: 'right' | 'bottom' | 'undocked' | 'detach';
}

export interface IWindowsService {

	_serviceBrand: any;

	readonly onWindowOpen: Event<number>;
	readonly onWindowFocus: Event<number>;
	readonly onWindowBlur: Event<number>;
	readonly onWindowMaximize: Event<number>;
	readonly onWindowUnmaximize: Event<number>;
	readonly onRecentlyOpenedChange: Event<void>;

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
	enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult | undefined>;
	toggleFullScreen(windowId: number): Promise<void>;
	setRepresentedFilename(windowId: number, fileName: string): Promise<void>;
	addRecentlyOpened(recents: IRecent[]): Promise<void>;
	removeFromRecentlyOpened(paths: URI[]): Promise<void>;
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
	openWindow(windowId: number, uris: IURIToOpen[], options: IOpenSettings): Promise<void>;
	openNewWindow(options?: INewWindowOptions): Promise<void>;
	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void>;
	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>;
	getWindowCount(): Promise<number>;
	log(severity: string, args: string[]): Promise<void>;
	showItemInFolder(path: URI): Promise<void>;
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

export interface IOpenSettings {
	forceNewWindow?: boolean;
	forceReuseWindow?: boolean;
	diffMode?: boolean;
	addMode?: boolean;
	gotoLineMode?: boolean;
	noRecentEntry?: boolean;
	waitMarkerFileURI?: URI;
	args?: ParsedArgs;
}

export type IURIToOpen = IWorkspaceToOpen | IFolderToOpen | IFileToOpen;

export interface IWorkspaceToOpen {
	workspaceUri: URI;
	label?: string;
}

export interface IFolderToOpen {
	folderUri: URI;
	label?: string;
}

export interface IFileToOpen {
	fileUri: URI;
	label?: string;
}

export function isWorkspaceToOpen(uriToOpen: IURIToOpen): uriToOpen is IWorkspaceToOpen {
	return !!(uriToOpen as IWorkspaceToOpen)['workspaceUri'];
}

export function isFolderToOpen(uriToOpen: IURIToOpen): uriToOpen is IFolderToOpen {
	return !!(uriToOpen as IFolderToOpen)['folderUri'];
}

export function isFileToOpen(uriToOpen: IURIToOpen): uriToOpen is IFileToOpen {
	return !!(uriToOpen as IFileToOpen)['fileUri'];
}


export interface IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean>;
	readonly onDidChangeMaximize: Event<boolean>;

	readonly hasFocus: boolean;

	readonly windowId: number;

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	reloadWindow(args?: ParsedArgs): Promise<void>;
	openDevTools(options?: IDevToolsOptions): Promise<void>;
	toggleDevTools(): Promise<void>;
	closeWorkspace(): Promise<void>;
	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void>;
	enterWorkspace(path: URI): Promise<IEnterWorkspaceResult | undefined>;
	// rationale: will eventually move to electron-browser
	// tslint:disable-next-line: no-dom-globals
	toggleFullScreen(target?: HTMLElement): Promise<void>;
	setRepresentedFilename(fileName: string): Promise<void>;
	getRecentlyOpened(): Promise<IRecentlyOpened>;
	addRecentlyOpened(recents: IRecent[]): Promise<void>;
	removeFromRecentlyOpened(paths: URI[]): Promise<void>;
	focusWindow(): Promise<void>;
	closeWindow(): Promise<void>;
	openWindow(uris: IURIToOpen[], options?: IOpenSettings): Promise<void>;
	isFocused(): Promise<boolean>;
	setDocumentEdited(flag: boolean): Promise<void>;
	isMaximized(): Promise<boolean>;
	maximizeWindow(): Promise<void>;
	unmaximizeWindow(): Promise<void>;
	minimizeWindow(): Promise<void>;
	onWindowTitleDoubleClick(): Promise<void>;
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
	clickThroughInactive: boolean;
}

export function getTitleBarStyle(configurationService: IConfigurationService, environment: IEnvironmentService, isExtensionDevelopment = environment.isExtensionDevelopment): 'native' | 'custom' {
	if (isWeb) {
		return 'custom';
	}

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

		const style = configuration.titleBarStyle;
		if (style === 'native' || style === 'custom') {
			return style;
		}
	}

	return isLinux ? 'native' : 'custom'; // default to custom on all macOS and Windows
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

	// the file path to open within the instance
	fileUri?: URI;
}

export interface IPathsToWaitFor extends IPathsToWaitForData {
	paths: IPath[];
	waitMarkerFileUri: URI;
}

export interface IPathsToWaitForData {
	paths: IPathData[];
	waitMarkerFileUri: UriComponents;
}

export interface IPathData {

	// the file path to open within the instance
	fileUri?: UriComponents;

	// the line number in the file path to open
	lineNumber?: number;

	// the column number in the file path to open
	columnNumber?: number;

	// a hint that the file exists. if true, the
	// file exists, if false it does not. with
	// undefined the state is unknown.
	exists?: boolean;
}

export interface IOpenFileRequest {
	filesToOpenOrCreate?: IPathData[];
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
	nodeCachedDataDir?: string;

	backupPath?: string;
	backupWorkspaceResource?: URI;

	workspace?: IWorkspaceIdentifier;
	folderUri?: ISingleFolderWorkspaceIdentifier;

	remoteAuthority?: string;
	connectionToken?: string;

	zoomLevel?: number;
	fullscreen?: boolean;
	maximized?: boolean;
	highContrast?: boolean;
	frameless?: boolean;
	accessibilitySupport?: boolean;
	partsSplashPath?: string;

	perfStartTime?: number;
	perfAppReady?: number;
	perfWindowLoadTime?: number;
	perfEntries: ExportData;

	filesToOpenOrCreate?: IPath[];
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

export class ActiveWindowManager extends Disposable {

	private readonly disposables = this._register(new DisposableStore());
	private firstActiveWindowIdPromise: CancelablePromise<number | undefined> | undefined;
	private activeWindowId: number | undefined;

	constructor(@IWindowsService windowsService: IWindowsService) {
		super();

		const onActiveWindowChange = Event.latch(Event.any(windowsService.onWindowOpen, windowsService.onWindowFocus));
		onActiveWindowChange(this.setActiveWindow, this, this.disposables);

		this.firstActiveWindowIdPromise = createCancelablePromise(_ => windowsService.getActiveWindowId());
		this.firstActiveWindowIdPromise
			.then(id => this.activeWindowId = typeof this.activeWindowId === 'number' ? this.activeWindowId : id)
			.finally(this.firstActiveWindowIdPromise = undefined);
	}

	private setActiveWindow(windowId: number | undefined) {
		if (this.firstActiveWindowIdPromise) {
			this.firstActiveWindowIdPromise.cancel();
			this.firstActiveWindowIdPromise = undefined;
		}

		this.activeWindowId = windowId;
	}

	async getActiveClientId(): Promise<string | undefined> {
		const id = this.firstActiveWindowIdPromise ? (await this.firstActiveWindowIdPromise) : this.activeWindowId;

		return `window:${id}`;
	}
}
