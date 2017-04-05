/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { buffer } from 'vs/base/common/event';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from './windows';
import { ITelemetryData } from 'vs/platform/telemetry/common/telemetry';

export interface IWindowsChannel extends IChannel {
	call(command: 'event:onWindowOpen'): TPromise<number>;
	call(command: 'event:onWindowFocus'): TPromise<number>;
	call(command: 'openFileFolderPicker', arg: [number, boolean, ITelemetryData]): TPromise<void>;
	call(command: 'openFilePicker', arg: [number, boolean, string, ITelemetryData]): TPromise<void>;
	call(command: 'openFolderPicker', arg: [number, boolean, ITelemetryData]): TPromise<void>;
	call(command: 'reloadWindow', arg: number): TPromise<void>;
	call(command: 'toggleDevTools', arg: number): TPromise<void>;
	call(command: 'closeFolder', arg: number): TPromise<void>;
	call(command: 'toggleFullScreen', arg: number): TPromise<void>;
	call(command: 'setRepresentedFilename', arg: [number, string]): TPromise<void>;
	call(command: 'addToRecentlyOpen', arg: { path: string, isFile?: boolean }[]): TPromise<void>;
	call(command: 'removeFromRecentlyOpen', arg: string[]): TPromise<void>;
	call(command: 'clearRecentPathsList'): TPromise<void>;
	call(command: 'getRecentlyOpen', arg: number): TPromise<{ files: string[]; folders: string[]; }>;
	call(command: 'focusWindow', arg: number): TPromise<void>;
	call(command: 'isFocused', arg: number): TPromise<boolean>;
	call(command: 'isMaximized', arg: number): TPromise<boolean>;
	call(command: 'maximizeWindow', arg: number): TPromise<void>;
	call(command: 'unmaximizeWindow', arg: number): TPromise<void>;
	call(command: 'setDocumentEdited', arg: [number, boolean]): TPromise<void>;
	call(command: 'quit'): TPromise<void>;
	call(command: 'openWindow', arg: [string[], { forceNewWindow?: boolean, forceReuseWindow?: boolean }]): TPromise<void>;
	call(command: 'openNewWindow'): TPromise<void>;
	call(command: 'showWindow', arg: number): TPromise<void>;
	call(command: 'getWindows'): TPromise<{ id: number; path: string; title: string; }[]>;
	call(command: 'getWindowCount'): TPromise<number>;
	call(command: 'relaunch', arg: { addArgs?: string[], removeArgs?: string[] }): TPromise<number>;
	call(command: 'whenSharedProcessReady'): TPromise<void>;
	call(command: 'toggleSharedProcess'): TPromise<void>;
	call(command: 'log', arg: [string, string[]]): TPromise<void>;
	call(command: 'closeExtensionHostWindow', arg: string): TPromise<void>;
	call(command: 'showItemInFolder', arg: string): TPromise<void>;
	call(command: 'openExternal', arg: string): TPromise<boolean>;
	call(command: 'startCrashReporter', arg: Electron.CrashReporterStartOptions): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WindowsChannel implements IWindowsChannel {

	private onWindowOpen: Event<number>;
	private onWindowFocus: Event<number>;

	constructor(private service: IWindowsService) {
		this.onWindowOpen = buffer(service.onWindowOpen, true);
		this.onWindowFocus = buffer(service.onWindowFocus, true);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onWindowOpen': return eventToCall(this.onWindowOpen);
			case 'event:onWindowFocus': return eventToCall(this.onWindowFocus);
			case 'openFileFolderPicker': return this.service.openFileFolderPicker(arg[0], arg[1], arg[2]);
			case 'openFilePicker': return this.service.openFilePicker(arg[0], arg[1], arg[2], arg[3]);
			case 'openFolderPicker': return this.service.openFolderPicker(arg[0], arg[1], arg[2]);
			case 'reloadWindow': return this.service.reloadWindow(arg);
			case 'openDevTools': return this.service.openDevTools(arg);
			case 'toggleDevTools': return this.service.toggleDevTools(arg);
			case 'closeFolder': return this.service.closeFolder(arg);
			case 'toggleFullScreen': return this.service.toggleFullScreen(arg);
			case 'setRepresentedFilename': return this.service.setRepresentedFilename(arg[0], arg[1]);
			case 'addToRecentlyOpen': return this.service.addToRecentlyOpen(arg);
			case 'removeFromRecentlyOpen': return this.service.removeFromRecentlyOpen(arg);
			case 'clearRecentPathsList': return this.service.clearRecentPathsList();
			case 'getRecentlyOpen': return this.service.getRecentlyOpen(arg);
			case 'focusWindow': return this.service.focusWindow(arg);
			case 'isFocused': return this.service.isFocused(arg);
			case 'isMaximized': return this.service.isMaximized(arg);
			case 'maximizeWindow': return this.service.maximizeWindow(arg);
			case 'unmaximizeWindow': return this.service.unmaximizeWindow(arg);
			case 'setDocumentEdited': return this.service.setDocumentEdited(arg[0], arg[1]);
			case 'openWindow': return this.service.openWindow(arg[0], arg[1]);
			case 'openNewWindow': return this.service.openNewWindow();
			case 'showWindow': return this.service.showWindow(arg);
			case 'getWindows': return this.service.getWindows();
			case 'getWindowCount': return this.service.getWindowCount();
			case 'relaunch': return this.service.relaunch(arg[0]);
			case 'whenSharedProcessReady': return this.service.whenSharedProcessReady();
			case 'toggleSharedProcess': return this.service.toggleSharedProcess();
			case 'quit': return this.service.quit();
			case 'log': return this.service.log(arg[0], arg[1]);
			case 'closeExtensionHostWindow': return this.service.closeExtensionHostWindow(arg);
			case 'showItemInFolder': return this.service.showItemInFolder(arg);
			case 'openExternal': return this.service.openExternal(arg);
			case 'startCrashReporter': return this.service.startCrashReporter(arg);
		}
		return undefined;
	}
}

export class WindowsChannelClient implements IWindowsService {

	_serviceBrand: any;

	constructor(private channel: IWindowsChannel) { }

	private _onWindowOpen: Event<number> = eventFromCall<number>(this.channel, 'event:onWindowOpen');
	get onWindowOpen(): Event<number> { return this._onWindowOpen; }

	private _onWindowFocus: Event<number> = eventFromCall<number>(this.channel, 'event:onWindowFocus');
	get onWindowFocus(): Event<number> { return this._onWindowFocus; }

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void> {
		return this.channel.call('openFileFolderPicker', [windowId, forceNewWindow, data]);
	}

	openFilePicker(windowId: number, forceNewWindow?: boolean, path?: string, data?: ITelemetryData): TPromise<void> {
		return this.channel.call('openFilePicker', [windowId, forceNewWindow, path, data]);
	}

	openFolderPicker(windowId: number, forceNewWindow?: boolean, data?: ITelemetryData): TPromise<void> {
		return this.channel.call('openFolderPicker', [windowId, forceNewWindow, data]);
	}

	reloadWindow(windowId: number): TPromise<void> {
		return this.channel.call('reloadWindow', windowId);
	}

	openDevTools(windowId: number): TPromise<void> {
		return this.channel.call('openDevTools', windowId);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		return this.channel.call('toggleDevTools', windowId);
	}

	closeFolder(windowId: number): TPromise<void> {
		return this.channel.call('closeFolder', windowId);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		return this.channel.call('toggleFullScreen', windowId);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		return this.channel.call('setRepresentedFilename', [windowId, fileName]);
	}

	addToRecentlyOpen(paths: { path: string, isFile?: boolean }[]): TPromise<void> {
		return this.channel.call('addToRecentlyOpen', paths);
	}

	removeFromRecentlyOpen(paths: string[]): TPromise<void> {
		return this.channel.call('removeFromRecentlyOpen', paths);
	}

	clearRecentPathsList(): TPromise<void> {
		return this.channel.call('clearRecentPathsList');
	}

	getRecentlyOpen(windowId: number): TPromise<{ files: string[]; folders: string[]; }> {
		return this.channel.call('getRecentlyOpen', windowId);
	}

	focusWindow(windowId: number): TPromise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	isFocused(windowId: number): TPromise<boolean> {
		return this.channel.call('isFocused', windowId);
	}

	isMaximized(windowId: number): TPromise<boolean> {
		return this.channel.call('isMaximized', windowId);
	}

	maximizeWindow(windowId: number): TPromise<void> {
		return this.channel.call('maximizeWindow', windowId);
	}

	unmaximizeWindow(windowId: number): TPromise<void> {
		return this.channel.call('unmaximizeWindow', windowId);
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		return this.channel.call('setDocumentEdited', [windowId, flag]);
	}

	quit(): TPromise<void> {
		return this.channel.call('quit');
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void> {
		return this.channel.call('relaunch', [options]);
	}

	whenSharedProcessReady(): TPromise<void> {
		return this.channel.call('whenSharedProcessReady');
	}

	toggleSharedProcess(): TPromise<void> {
		return this.channel.call('toggleSharedProcess');
	}

	openWindow(paths: string[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean }): TPromise<void> {
		return this.channel.call('openWindow', [paths, options]);
	}

	openNewWindow(): TPromise<void> {
		return this.channel.call('openNewWindow');
	}

	showWindow(windowId: number): TPromise<void> {
		return this.channel.call('showWindow', windowId);
	}

	getWindows(): TPromise<{ id: number; path: string; title: string; }[]> {
		return this.channel.call('getWindows');
	}

	getWindowCount(): TPromise<number> {
		return this.channel.call('getWindowCount');
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		return this.channel.call('log', [severity, messages]);
	}

	closeExtensionHostWindow(extensionDevelopmentPath: string): TPromise<void> {
		return this.channel.call('closeExtensionHostWindow', extensionDevelopmentPath);
	}

	showItemInFolder(path: string): TPromise<void> {
		return this.channel.call('showItemInFolder', path);
	}

	openExternal(url: string): TPromise<boolean> {
		return this.channel.call('openExternal', url);
	}

	startCrashReporter(config: Electron.CrashReporterStartOptions): TPromise<void> {
		return this.channel.call('startCrashReporter', config);
	}
}
