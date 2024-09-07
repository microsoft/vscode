/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron from 'electron';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Event } from '../../../base/common/event.js';
import { IDisposable } from '../../../base/common/lifecycle.js';
import { ISerializableCommandAction } from '../../action/common/action.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { INativeWindowConfiguration } from '../common/window.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier } from '../../workspace/common/workspace.js';

export interface IBaseWindow extends IDisposable {

	readonly onDidMaximize: Event<void>;
	readonly onDidUnmaximize: Event<void>;
	readonly onDidTriggerSystemContextMenu: Event<{ readonly x: number; readonly y: number }>;
	readonly onDidEnterFullScreen: Event<void>;
	readonly onDidLeaveFullScreen: Event<void>;
	readonly onDidClose: Event<void>;

	readonly id: number;
	readonly win: electron.BrowserWindow | null;

	readonly lastFocusTime: number;
	focus(options?: { force: boolean }): void;

	setRepresentedFilename(name: string): void;
	getRepresentedFilename(): string | undefined;

	setDocumentEdited(edited: boolean): void;
	isDocumentEdited(): boolean;

	handleTitleDoubleClick(): void;

	readonly isFullScreen: boolean;
	toggleFullScreen(): void;

	updateWindowControls(options: { height?: number; backgroundColor?: string; foregroundColor?: string }): void;

	matches(webContents: electron.WebContents): boolean;
}

export interface ICodeWindow extends IBaseWindow {

	readonly onWillLoad: Event<ILoadEvent>;
	readonly onDidSignalReady: Event<void>;
	readonly onDidDestroy: Event<void>;

	readonly whenClosedOrLoaded: Promise<void>;

	readonly config: INativeWindowConfiguration | undefined;

	readonly openedWorkspace?: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier;

	readonly profile?: IUserDataProfile;

	readonly backupPath?: string;

	readonly remoteAuthority?: string;

	readonly isExtensionDevelopmentHost: boolean;
	readonly isExtensionTestHost: boolean;

	readonly isReady: boolean;
	ready(): Promise<ICodeWindow>;
	setReady(): void;

	addTabbedWindow(window: ICodeWindow): void;

	load(config: INativeWindowConfiguration, options?: { isReload?: boolean }): void;
	reload(cli?: NativeParsedArgs): void;

	close(): void;

	getBounds(): electron.Rectangle;

	send(channel: string, ...args: any[]): void;
	sendWhenReady(channel: string, token: CancellationToken, ...args: any[]): void;

	updateTouchBar(items: ISerializableCommandAction[][]): void;

	notifyZoomLevel(zoomLevel: number | undefined): void;

	serializeWindowState(): IWindowState;
}

export const enum LoadReason {

	/**
	 * The window is loaded for the first time.
	 */
	INITIAL = 1,

	/**
	 * The window is loaded into a different workspace context.
	 */
	LOAD,

	/**
	 * The window is reloaded.
	 */
	RELOAD
}

export const enum UnloadReason {

	/**
	 * The window is closed.
	 */
	CLOSE = 1,

	/**
	 * All windows unload because the application quits.
	 */
	QUIT,

	/**
	 * The window is reloaded.
	 */
	RELOAD,

	/**
	 * The window is loaded into a different workspace context.
	 */
	LOAD
}

export interface IWindowState {
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	mode?: WindowMode;
	zoomLevel?: number;
	readonly display?: number;
}

export const defaultWindowState = function (mode = WindowMode.Normal): IWindowState {
	return {
		width: 1024,
		height: 768,
		mode
	};
};

export const defaultAuxWindowState = function (): IWindowState {

	// Auxiliary windows are being created from a `window.open` call
	// that sets `windowFeatures` that encode the desired size and
	// position of the new window (`top`, `left`).
	// In order to truly override this to a good default window state
	// we need to set not only width and height but also x and y to
	// a good location on the primary display.

	const width = 800;
	const height = 600;
	const workArea = electron.screen.getPrimaryDisplay().workArea;
	const x = Math.max(workArea.x + (workArea.width / 2) - (width / 2), 0);
	const y = Math.max(workArea.y + (workArea.height / 2) - (height / 2), 0);

	return {
		x,
		y,
		width,
		height,
		mode: WindowMode.Normal
	};
};

export const enum WindowMode {
	Maximized,
	Normal,
	Minimized, // not used anymore, but also cannot remove due to existing stored UI state (needs migration)
	Fullscreen
}

export interface ILoadEvent {
	readonly workspace: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined;
	readonly reason: LoadReason;
}

export const enum WindowError {

	/**
	 * Maps to the `unresponsive` event on a `BrowserWindow`.
	 */
	UNRESPONSIVE = 1,

	/**
	 * Maps to the `render-process-gone` event on a `WebContents`.
	 */
	PROCESS_GONE = 2,

	/**
	 * Maps to the `did-fail-load` event on a `WebContents`.
	 */
	LOAD = 3
}
