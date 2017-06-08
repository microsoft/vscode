/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import Event from 'vs/base/common/event';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export const IWindowsService = createDecorator<IWindowsService>('windowsService');

export interface IWindowsService {

	_serviceBrand: any;

	onWindowOpen: Event<number>;
	onWindowFocus: Event<number>;

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void>;
	openFilePicker(windowId: number, forceNewWindow?: boolean, path?: string, data?: ITelemetryData): TPromise<void>;
	openFolderPicker(windowId: number, forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void>;
	reloadWindow(windowId: number): TPromise<void>;
	openDevTools(windowId: number): TPromise<void>;
	toggleDevTools(windowId: number): TPromise<void>;
	closeFolder(windowId: number): TPromise<void>;
	toggleFullScreen(windowId: number): TPromise<void>;
	setRepresentedFilename(windowId: number, fileName: string): TPromise<void>;
	addToRecentlyOpen(paths: { path: string, isFile?: boolean }[]): TPromise<void>;
	removeFromRecentlyOpen(paths: string[]): TPromise<void>;
	clearRecentPathsList(): TPromise<void>;
	getRecentlyOpen(windowId: number): TPromise<{ files: string[]; folders: string[]; }>;
	focusWindow(windowId: number): TPromise<void>;
	isFocused(windowId: number): TPromise<boolean>;
	isMaximized(windowId: number): TPromise<boolean>;
	maximizeWindow(windowId: number): TPromise<void>;
	unmaximizeWindow(windowId: number): TPromise<void>;
	onWindowTitleDoubleClick(windowId: number): TPromise<void>;
	setDocumentEdited(windowId: number, flag: boolean): TPromise<void>;
	quit(): TPromise<void>;
	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void>;

	// Shared process
	whenSharedProcessReady(): TPromise<void>;
	toggleSharedProcess(): TPromise<void>;

	// Global methods
	openWindow(paths: string[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean }): TPromise<void>;
	openNewWindow(): TPromise<void>;
	showWindow(windowId: number): TPromise<void>;
	getWindows(): TPromise<{ id: number; path: string; title: string; filename?: string; }[]>;
	getWindowCount(): TPromise<number>;
	log(severity: string, ...messages: string[]): TPromise<void>;
	// TODO@joao: what?
	closeExtensionHostWindow(extensionDevelopmentPath: string): TPromise<void>;
	showItemInFolder(path: string): TPromise<void>;

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(url: string): TPromise<boolean>;

	// TODO: this is a bit backwards
	startCrashReporter(config: Electron.CrashReporterStartOptions): TPromise<void>;
}

export const IWindowService = createDecorator<IWindowService>('windowService');

export interface IWindowService {

	_serviceBrand: any;

	getCurrentWindowId(): number;
	openFileFolderPicker(forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void>;
	openFilePicker(forceNewWindow?: boolean, path?: string, data?: ITelemetryData): TPromise<void>;
	openFolderPicker(forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void>;
	reloadWindow(): TPromise<void>;
	openDevTools(): TPromise<void>;
	toggleDevTools(): TPromise<void>;
	closeFolder(): TPromise<void>;
	toggleFullScreen(): TPromise<void>;
	setRepresentedFilename(fileName: string): TPromise<void>;
	addToRecentlyOpen(paths: { path: string, isFile?: boolean }[]): TPromise<void>;
	removeFromRecentlyOpen(paths: string[]): TPromise<void>;
	getRecentlyOpen(): TPromise<{ files: string[]; folders: string[]; }>;
	focusWindow(): TPromise<void>;
	isFocused(): TPromise<boolean>;
	setDocumentEdited(flag: boolean): TPromise<void>;
	isMaximized(): TPromise<boolean>;
	maximizeWindow(): TPromise<void>;
	unmaximizeWindow(): TPromise<void>;
	onWindowTitleDoubleClick(): TPromise<void>;
}

export type MenuBarVisibility = 'default' | 'visible' | 'toggle' | 'hidden';

export interface IWindowSettings {
	openFilesInNewWindow: 'on' | 'off' | 'default';
	openFoldersInNewWindow: 'on' | 'off' | 'default';
	reopenFolders: 'all' | 'one' | 'none';
	restoreFullscreen: boolean;
	zoomLevel: number;
	titleBarStyle: 'native' | 'custom';
	autoDetectHighContrast: boolean;
	menuBarVisibility: MenuBarVisibility;
	newWindowDimensions: 'default' | 'inherit' | 'maximized' | 'fullscreen';
	nativeTabs: boolean;
	enableMenuBarMnemonics: boolean;
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