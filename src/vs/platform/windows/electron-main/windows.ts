/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { OpenContext, IWindowConfiguration, ReadyState, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, INewWindowOptions } from 'vs/platform/windows/common/windows';
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
	id: number;
	win: Electron.BrowserWindow;
	config: IWindowConfiguration;

	openedFolderUri: URI;
	openedWorkspace: IWorkspaceIdentifier;
	backupPath: string;

	isExtensionDevelopmentHost: boolean;
	isExtensionTestHost: boolean;

	lastFocusTime: number;

	readyState: ReadyState;
	ready(): TPromise<ICodeWindow>;

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
	oldCount: number;
	newCount: number;
}

export interface IWindowsMainService {
	_serviceBrand: any;

	// events
	onWindowReady: Event<ICodeWindow>;
	onActiveWindowChanged: Event<ICodeWindow>;
	onWindowsCountChanged: Event<IWindowsCountChangedEvent>;
	onWindowClose: Event<number>;
	onWindowReload: Event<number>;

	// methods
	ready(initialUserEnv: IProcessEnvironment): void;
	reload(win: ICodeWindow, cli?: ParsedArgs): void;
	enterWorkspace(win: ICodeWindow, path: string): TPromise<IEnterWorkspaceResult>;
	createAndEnterWorkspace(win: ICodeWindow, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult>;
	saveAndEnterWorkspace(win: ICodeWindow, path: string): TPromise<IEnterWorkspaceResult>;
	closeWorkspace(win: ICodeWindow): void;
	open(openConfig: IOpenConfiguration): ICodeWindow[];
	openExtensionDevelopmentHostWindow(openConfig: IOpenConfiguration): void;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): void;
	pickFolderAndOpen(options: INativeOpenDialogOptions): void;
	pickFileAndOpen(options: INativeOpenDialogOptions): void;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): void;
	showMessageBox(options: Electron.MessageBoxOptions, win?: ICodeWindow): TPromise<IMessageBoxResult>;
	showSaveDialog(options: Electron.SaveDialogOptions, win?: ICodeWindow): TPromise<string>;
	showOpenDialog(options: Electron.OpenDialogOptions, win?: ICodeWindow): TPromise<string[]>;
	focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow;
	getLastActiveWindow(): ICodeWindow;
	waitForWindowCloseOrLoad(windowId: number): TPromise<void>;
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
	context: OpenContext;
	contextWindowId?: number;
	cli: ParsedArgs;
	userEnv?: IProcessEnvironment;
	urisToOpen?: URI[];
	preferNewWindow?: boolean;
	forceNewWindow?: boolean;
	forceNewTabbedWindow?: boolean;
	forceReuseWindow?: boolean;
	forceEmpty?: boolean;
	diffMode?: boolean;
	addMode?: boolean;
	forceOpenWorkspaceAsFile?: boolean;
	initialStartup?: boolean;
}

export interface ISharedProcess {
	whenReady(): TPromise<void>;
	toggle(): void;
}