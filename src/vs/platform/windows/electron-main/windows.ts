/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenContext, IWindowConfiguration, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, INewWindowOptions } from 'vs/platform/windows/common/windows';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';

export interface IWindowState {
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	mode?: WindowMode;
	display?: number;
}

export const enum WindowMode {
	Maximized,
	Normal,
	Minimized, // not used anymore, but also cannot remove due to existing stored UI state (needs migration)
	Fullscreen
}

export interface ICodeWindow {
	readonly id: number;
	readonly win: Electron.BrowserWindow;
	readonly config: IWindowConfiguration;

	readonly openedFolderUri: URI;
	readonly openedWorkspace: IWorkspaceIdentifier;
	readonly backupPath: string;

	readonly remoteAuthority: string;

	readonly isExtensionDevelopmentHost: boolean;
	readonly isExtensionTestHost: boolean;

	readonly lastFocusTime: number;

	readonly isReady: boolean;
	ready(): Promise<ICodeWindow>;

	addTabbedWindow(window: ICodeWindow): void;

	load(config: IWindowConfiguration, isReload?: boolean, disableExtensions?: boolean): void;
	reload(configuration?: IWindowConfiguration, cli?: ParsedArgs): void;

	focus(): void;
	close(): void;

	getBounds(): Electron.Rectangle;

	send(channel: string, ...args: any[]): void;
	sendWhenReady(channel: string, ...args: any[]): void;

	toggleFullScreen(): void;
	isFullScreen(): boolean;
	isMinimized(): boolean;
	hasHiddenTitleBarStyle(): boolean;
	setRepresentedFilename(name: string): void;
	getRepresentedFilename(): string;
	onWindowTitleDoubleClick(): void;

	updateTouchBar(items: ISerializableCommandAction[][]): void;

	setReady(): void;
	serializeWindowState(): IWindowState;

	dispose(): void;
}

export const IWindowsMainService = createDecorator<IWindowsMainService>('windowsMainService');

export interface IWindowsCountChangedEvent {
	readonly oldCount: number;
	readonly newCount: number;
}

export interface IWindowsMainService {
	_serviceBrand: any;

	// events
	readonly onWindowReady: Event<ICodeWindow>;
	readonly onActiveWindowChanged: Event<ICodeWindow>;
	readonly onWindowsCountChanged: Event<IWindowsCountChangedEvent>;
	readonly onWindowClose: Event<number>;
	readonly onWindowReload: Event<number>;

	// methods
	ready(initialUserEnv: IProcessEnvironment): void;
	reload(win: ICodeWindow, cli?: ParsedArgs): void;
	enterWorkspace(win: ICodeWindow, path: string): Promise<IEnterWorkspaceResult>;
	createAndEnterWorkspace(win: ICodeWindow, folders?: IWorkspaceFolderCreationData[], path?: string): Promise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(win: ICodeWindow, path: string): Promise<IEnterWorkspaceResult>;
	closeWorkspace(win: ICodeWindow): void;
	open(openConfig: IOpenConfiguration): ICodeWindow[];
	openExtensionDevelopmentHostWindow(openConfig: IOpenConfiguration): void;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): void;
	pickFolderAndOpen(options: INativeOpenDialogOptions): void;
	pickFileAndOpen(options: INativeOpenDialogOptions): void;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): void;
	showMessageBox(options: Electron.MessageBoxOptions, win?: ICodeWindow): Promise<IMessageBoxResult>;
	showSaveDialog(options: Electron.SaveDialogOptions, win?: ICodeWindow): Promise<string>;
	showOpenDialog(options: Electron.OpenDialogOptions, win?: ICodeWindow): Promise<string[]>;
	focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow;
	getLastActiveWindow(): ICodeWindow;
	waitForWindowCloseOrLoad(windowId: number): Promise<void>;
	openNewWindow(context: OpenContext, options?: INewWindowOptions): ICodeWindow[];
	openNewTabbedWindow(context: OpenContext): ICodeWindow[];
	sendToFocused(channel: string, ...args: any[]): void;
	sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void;
	getFocusedWindow(): ICodeWindow;
	getWindowById(windowId: number): ICodeWindow;
	getWindows(): ICodeWindow[];
	getWindowCount(): number;
	quit(): void;
}

export interface IOpenConfiguration {
	readonly context: OpenContext;
	readonly contextWindowId?: number;
	readonly cli: ParsedArgs;
	readonly userEnv?: IProcessEnvironment;
	readonly urisToOpen?: URI[];
	readonly preferNewWindow?: boolean;
	readonly forceNewWindow?: boolean;
	readonly forceNewTabbedWindow?: boolean;
	readonly forceReuseWindow?: boolean;
	readonly forceEmpty?: boolean;
	readonly diffMode?: boolean;
	addMode?: boolean;
	readonly forceOpenWorkspaceAsFile?: boolean;
	readonly initialStartup?: boolean;
}

export interface ISharedProcess {
	whenReady(): Promise<void>;
	toggle(): void;
}