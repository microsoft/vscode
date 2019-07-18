/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenContext, IWindowConfiguration, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, INewWindowOptions, IURIToOpen } from 'vs/platform/windows/common/windows';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
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

	readonly openedFolderUri?: URI;
	readonly openedWorkspace?: IWorkspaceIdentifier;
	readonly backupPath?: string;

	readonly remoteAuthority?: string;

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
	readonly onWindowsCountChanged: Event<IWindowsCountChangedEvent>;
	readonly onWindowClose: Event<number>;

	// methods
	reload(win: ICodeWindow, cli?: ParsedArgs): void;
	enterWorkspace(win: ICodeWindow, path: URI): Promise<IEnterWorkspaceResult | undefined>;
	closeWorkspace(win: ICodeWindow): void;
	open(openConfig: IOpenConfiguration): ICodeWindow[];
	openExtensionDevelopmentHostWindow(extensionDevelopmentPath: string | string[], openConfig: IOpenConfiguration): void;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	showMessageBox(options: Electron.MessageBoxOptions, win?: ICodeWindow): Promise<IMessageBoxResult>;
	showSaveDialog(options: Electron.SaveDialogOptions, win?: ICodeWindow): Promise<string>;
	showOpenDialog(options: Electron.OpenDialogOptions, win?: ICodeWindow): Promise<string[]>;
	focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow;
	getLastActiveWindow(): ICodeWindow | undefined;
	waitForWindowCloseOrLoad(windowId: number): Promise<void>;
	openNewWindow(context: OpenContext, options?: INewWindowOptions): ICodeWindow[];
	openNewTabbedWindow(context: OpenContext): ICodeWindow[];
	sendToFocused(channel: string, ...args: any[]): void;
	sendToAll(channel: string, payload: any, windowIdsToIgnore?: number[]): void;
	getFocusedWindow(): ICodeWindow | undefined;
	getWindowById(windowId: number): ICodeWindow | undefined;
	getWindows(): ICodeWindow[];
	getWindowCount(): number;
	quit(): void;
}

export interface IOpenConfiguration {
	readonly context: OpenContext;
	readonly contextWindowId?: number;
	readonly cli: ParsedArgs;
	readonly userEnv?: IProcessEnvironment;
	readonly urisToOpen?: IURIToOpen[];
	readonly waitMarkerFileURI?: URI;
	readonly preferNewWindow?: boolean;
	readonly forceNewWindow?: boolean;
	readonly forceNewTabbedWindow?: boolean;
	readonly forceReuseWindow?: boolean;
	readonly forceEmpty?: boolean;
	readonly diffMode?: boolean;
	addMode?: boolean;
	readonly gotoLineMode?: boolean;
	readonly initialStartup?: boolean;
	readonly noRecentEntry?: boolean;
}

export interface ISharedProcess {
	whenReady(): Promise<void>;
	toggle(): void;
}