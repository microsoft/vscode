/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OpenContext, IWindowConfiguration, IWindowOpenable, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { INativeOpenDialogOptions } from 'vs/platform/dialogs/node/dialogs';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { IWorkspaceIdentifier, IEnterWorkspaceResult } from 'vs/platform/workspaces/common/workspaces';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { MessageBoxReturnValue, SaveDialogReturnValue, OpenDialogReturnValue, Rectangle, BrowserWindow, MessageBoxOptions, SaveDialogOptions, OpenDialogOptions } from 'electron';

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
	readonly win: BrowserWindow;
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

	load(config: IWindowConfiguration, isReload?: boolean): void;
	reload(configuration?: IWindowConfiguration, cli?: ParsedArgs): void;

	focus(): void;
	close(): void;

	getBounds(): Rectangle;

	send(channel: string, ...args: any[]): void;
	sendWhenReady(channel: string, ...args: any[]): void;

	toggleFullScreen(): void;
	isFullScreen(): boolean;
	isMinimized(): boolean;
	hasHiddenTitleBarStyle(): boolean;
	setRepresentedFilename(name: string): void;
	getRepresentedFilename(): string;
	handleTitleDoubleClick(): void;

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
	_serviceBrand: undefined;

	// events
	readonly onWindowReady: Event<ICodeWindow>;
	readonly onWindowsCountChanged: Event<IWindowsCountChangedEvent>;
	readonly onWindowClose: Event<number>;

	// methods
	reload(win: ICodeWindow, cli?: ParsedArgs): void;
	enterWorkspace(win: ICodeWindow, path: URI): Promise<IEnterWorkspaceResult | undefined>;
	closeWorkspace(win: ICodeWindow): void;
	open(openConfig: IOpenConfiguration): ICodeWindow[];
	openExtensionDevelopmentHostWindow(extensionDevelopmentPath: string[], openConfig: IOpenConfiguration): void;
	pickFileFolderAndOpen(options: INativeOpenDialogOptions, win?: ICodeWindow): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions, win?: ICodeWindow): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions, win?: ICodeWindow): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions, win?: ICodeWindow): Promise<void>;
	showMessageBox(options: MessageBoxOptions, win?: ICodeWindow): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions, win?: ICodeWindow): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions, win?: ICodeWindow): Promise<OpenDialogReturnValue>;
	focusLastActive(cli: ParsedArgs, context: OpenContext): ICodeWindow;
	getLastActiveWindow(): ICodeWindow | undefined;
	waitForWindowCloseOrLoad(windowId: number): Promise<void>;
	openEmptyWindow(context: OpenContext, options?: IOpenEmptyWindowOptions): ICodeWindow[];
	openNewTabbedWindow(context: OpenContext): ICodeWindow[];
	openExternal(url: string): Promise<boolean>;
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
	readonly urisToOpen?: IWindowOpenable[];
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
