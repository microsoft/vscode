/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import Event, { buffer } from 'vs/base/common/event';
import { IChannel, eventToCall, eventFromCall } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService, INativeOpenDialogOptions } from './windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';

export interface IWindowsChannel extends IChannel {
	call(command: 'event:onWindowOpen'): TPromise<number>;
	call(command: 'event:onWindowFocus'): TPromise<number>;
	call(command: 'event:onWindowBlur'): TPromise<number>;
	call(command: 'pickFileFolderAndOpen', arg: INativeOpenDialogOptions): TPromise<void>;
	call(command: 'pickFileAndOpen', arg: INativeOpenDialogOptions): TPromise<void>;
	call(command: 'pickFolderAndOpen', arg: INativeOpenDialogOptions): TPromise<void>;
	call(command: 'reloadWindow', arg: number): TPromise<void>;
	call(command: 'toggleDevTools', arg: number): TPromise<void>;
	call(command: 'closeWorkspace', arg: number): TPromise<void>;
	call(command: 'openWorkspace', arg: number): TPromise<void>;
	call(command: 'createAndOpenWorkspace', arg: [number, string[], string]): TPromise<void>;
	call(command: 'saveAndOpenWorkspace', arg: [number, string]): TPromise<void>;
	call(command: 'toggleFullScreen', arg: number): TPromise<void>;
	call(command: 'setRepresentedFilename', arg: [number, string]): TPromise<void>;
	call(command: 'addRecentlyOpened', arg: string[]): TPromise<void>;
	call(command: 'removeFromRecentlyOpened', arg: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]): TPromise<void>;
	call(command: 'clearRecentlyOpened'): TPromise<void>;
	call(command: 'getRecentlyOpened', arg: number): TPromise<IRecentlyOpened>;
	call(command: 'focusWindow', arg: number): TPromise<void>;
	call(command: 'closeWindow', arg: number): TPromise<void>;
	call(command: 'isFocused', arg: number): TPromise<boolean>;
	call(command: 'isMaximized', arg: number): TPromise<boolean>;
	call(command: 'maximizeWindow', arg: number): TPromise<void>;
	call(command: 'unmaximizeWindow', arg: number): TPromise<void>;
	call(command: 'onWindowTitleDoubleClick', arg: number): TPromise<void>;
	call(command: 'setDocumentEdited', arg: [number, boolean]): TPromise<void>;
	call(command: 'quit'): TPromise<void>;
	call(command: 'openWindow', arg: [string[], { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }]): TPromise<void>;
	call(command: 'openNewWindow'): TPromise<void>;
	call(command: 'showWindow', arg: number): TPromise<void>;
	call(command: 'getWindows'): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderPath?: string; title: string; filename?: string; }[]>;
	call(command: 'getWindowCount'): TPromise<number>;
	call(command: 'relaunch', arg: { addArgs?: string[], removeArgs?: string[] }): TPromise<number>;
	call(command: 'whenSharedProcessReady'): TPromise<void>;
	call(command: 'toggleSharedProcess'): TPromise<void>;
	call(command: 'log', arg: [string, string[]]): TPromise<void>;
	call(command: 'showItemInFolder', arg: string): TPromise<void>;
	call(command: 'openExternal', arg: string): TPromise<boolean>;
	call(command: 'startCrashReporter', arg: Electron.CrashReporterStartOptions): TPromise<void>;
	call(command: string, arg?: any): TPromise<any>;
}

export class WindowsChannel implements IWindowsChannel {

	private onWindowOpen: Event<number>;
	private onWindowFocus: Event<number>;
	private onWindowBlur: Event<number>;

	constructor(private service: IWindowsService) {
		this.onWindowOpen = buffer(service.onWindowOpen, true);
		this.onWindowFocus = buffer(service.onWindowFocus, true);
		this.onWindowBlur = buffer(service.onWindowBlur, true);
	}

	call(command: string, arg?: any): TPromise<any> {
		switch (command) {
			case 'event:onWindowOpen': return eventToCall(this.onWindowOpen);
			case 'event:onWindowFocus': return eventToCall(this.onWindowFocus);
			case 'event:onWindowBlur': return eventToCall(this.onWindowBlur);
			case 'pickFileFolderAndOpen': return this.service.pickFileFolderAndOpen(arg);
			case 'pickFileAndOpen': return this.service.pickFileAndOpen(arg);
			case 'pickFolderAndOpen': return this.service.pickFolderAndOpen(arg);
			case 'reloadWindow': return this.service.reloadWindow(arg);
			case 'openDevTools': return this.service.openDevTools(arg);
			case 'toggleDevTools': return this.service.toggleDevTools(arg);
			case 'closeWorkspace': return this.service.closeWorkspace(arg);
			case 'openWorkspace': return this.service.openWorkspace(arg);
			case 'createAndOpenWorkspace': return this.service.createAndOpenWorkspace(arg[0], arg[1], arg[2]);
			case 'saveAndOpenWorkspace': return this.service.saveAndOpenWorkspace(arg[0], arg[1]);
			case 'toggleFullScreen': return this.service.toggleFullScreen(arg);
			case 'setRepresentedFilename': return this.service.setRepresentedFilename(arg[0], arg[1]);
			case 'addRecentlyOpened': return this.service.addRecentlyOpened(arg);
			case 'removeFromRecentlyOpened': return this.service.removeFromRecentlyOpened(arg);
			case 'clearRecentlyOpened': return this.service.clearRecentlyOpened();
			case 'getRecentlyOpened': return this.service.getRecentlyOpened(arg);
			case 'focusWindow': return this.service.focusWindow(arg);
			case 'closeWindow': return this.service.closeWindow(arg);
			case 'isFocused': return this.service.isFocused(arg);
			case 'isMaximized': return this.service.isMaximized(arg);
			case 'maximizeWindow': return this.service.maximizeWindow(arg);
			case 'unmaximizeWindow': return this.service.unmaximizeWindow(arg);
			case 'onWindowTitleDoubleClick': return this.service.onWindowTitleDoubleClick(arg);
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

	private _onWindowBlur: Event<number> = eventFromCall<number>(this.channel, 'event:onWindowBlur');
	get onWindowBlur(): Event<number> { return this._onWindowBlur; }

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return this.channel.call('pickFileFolderAndOpen', options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return this.channel.call('pickFileAndOpen', options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return this.channel.call('pickFolderAndOpen', options);
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

	closeWorkspace(windowId: number): TPromise<void> {
		return this.channel.call('closeWorkspace', windowId);
	}

	openWorkspace(windowId: number): TPromise<void> {
		return this.channel.call('openWorkspace', windowId);
	}

	createAndOpenWorkspace(windowId: number, folders?: string[], path?: string): TPromise<void> {
		return this.channel.call('createAndOpenWorkspace', [windowId, folders, path]);
	}

	saveAndOpenWorkspace(windowId: number, path: string): TPromise<void> {
		return this.channel.call('saveAndOpenWorkspace', [windowId, path]);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		return this.channel.call('toggleFullScreen', windowId);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		return this.channel.call('setRepresentedFilename', [windowId, fileName]);
	}

	addRecentlyOpened(files: string[]): TPromise<void> {
		return this.channel.call('addRecentlyOpened', files);
	}

	removeFromRecentlyOpened(paths: string[]): TPromise<void> {
		return this.channel.call('removeFromRecentlyOpened', paths);
	}

	clearRecentlyOpened(): TPromise<void> {
		return this.channel.call('clearRecentlyOpened');
	}

	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened> {
		return this.channel.call('getRecentlyOpened', windowId);
	}

	focusWindow(windowId: number): TPromise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	closeWindow(windowId: number): TPromise<void> {
		return this.channel.call('closeWindow', windowId);
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

	onWindowTitleDoubleClick(windowId: number): TPromise<void> {
		return this.channel.call('onWindowTitleDoubleClick', windowId);
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

	openWindow(paths: string[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean }): TPromise<void> {
		return this.channel.call('openWindow', [paths, options]);
	}

	openNewWindow(): TPromise<void> {
		return this.channel.call('openNewWindow');
	}

	showWindow(windowId: number): TPromise<void> {
		return this.channel.call('showWindow', windowId);
	}

	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderPath?: string; title: string; filename?: string; }[]> {
		return this.channel.call('getWindows');
	}

	getWindowCount(): TPromise<number> {
		return this.channel.call('getWindowCount');
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		return this.channel.call('log', [severity, messages]);
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
