/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, buffer } from 'vs/base/common/event';
import { IChannel } from 'vs/base/parts/ipc/node/ipc';
import { IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, CrashReporterStartOptions, IMessageBoxResult, MessageBoxOptions, SaveDialogOptions, OpenDialogOptions, IDevToolsOptions, INewWindowOptions } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { URI, UriComponents } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';

export interface IWindowsChannel extends IChannel {
	listen(event: 'onWindowOpen'): Event<number>;
	listen(event: 'onWindowFocus'): Event<number>;
	listen(event: 'onWindowBlur'): Event<number>;
	listen(event: 'onWindowMaximize'): Event<number>;
	listen(event: 'onWindowUnmaximize'): Event<number>;
	listen(event: 'onRecentlyOpenedChange'): Event<void>;
	listen<T>(event: string, arg?: any): Event<T>;

	call(command: 'pickFileFolderAndOpen', arg: INativeOpenDialogOptions): Thenable<void>;
	call(command: 'pickFileAndOpen', arg: INativeOpenDialogOptions): Thenable<void>;
	call(command: 'pickFolderAndOpen', arg: INativeOpenDialogOptions): Thenable<void>;
	call(command: 'pickWorkspaceAndOpen', arg: INativeOpenDialogOptions): Thenable<void>;
	call(command: 'showMessageBox', arg: [number, MessageBoxOptions]): Thenable<IMessageBoxResult>;
	call(command: 'showSaveDialog', arg: [number, SaveDialogOptions]): Thenable<string>;
	call(command: 'showOpenDialog', arg: [number, OpenDialogOptions]): Thenable<string[]>;
	call(command: 'reloadWindow', arg: [number, ParsedArgs]): Thenable<void>;
	call(command: 'openDevTools', arg: [number, IDevToolsOptions]): Thenable<void>;
	call(command: 'toggleDevTools', arg: number): Thenable<void>;
	call(command: 'closeWorkspace', arg: number): Thenable<void>;
	call(command: 'enterWorkspace', arg: [number, string]): Thenable<IEnterWorkspaceResult>;
	call(command: 'createAndEnterWorkspace', arg: [number, IWorkspaceFolderCreationData[], string]): Thenable<IEnterWorkspaceResult>;
	call(command: 'saveAndEnterWorkspace', arg: [number, string]): Thenable<IEnterWorkspaceResult>;
	call(command: 'toggleFullScreen', arg: number): Thenable<void>;
	call(command: 'setRepresentedFilename', arg: [number, string]): Thenable<void>;
	call(command: 'addRecentlyOpened', arg: UriComponents[]): Thenable<void>;
	call(command: 'removeFromRecentlyOpened', arg: (IWorkspaceIdentifier | UriComponents | string)[]): Thenable<void>;
	call(command: 'clearRecentlyOpened'): Thenable<void>;
	call(command: 'getRecentlyOpened', arg: number): Thenable<IRecentlyOpened>;
	call(command: 'newWindowTab'): Thenable<void>;
	call(command: 'showPreviousWindowTab'): Thenable<void>;
	call(command: 'showNextWindowTab'): Thenable<void>;
	call(command: 'moveWindowTabToNewWindow'): Thenable<void>;
	call(command: 'mergeAllWindowTabs'): Thenable<void>;
	call(command: 'toggleWindowTabsBar'): Thenable<void>;
	call(command: 'updateTouchBar', arg: [number, ISerializableCommandAction[][]]): Thenable<void>;
	call(command: 'focusWindow', arg: number): Thenable<void>;
	call(command: 'closeWindow', arg: number): Thenable<void>;
	call(command: 'isFocused', arg: number): Thenable<boolean>;
	call(command: 'isMaximized', arg: number): Thenable<boolean>;
	call(command: 'maximizeWindow', arg: number): Thenable<void>;
	call(command: 'unmaximizeWindow', arg: number): Thenable<void>;
	call(command: 'minimizeWindow', arg: number): Thenable<void>;
	call(command: 'onWindowTitleDoubleClick', arg: number): Thenable<void>;
	call(command: 'setDocumentEdited', arg: [number, boolean]): Thenable<void>;
	call(command: 'quit'): Thenable<void>;
	call(command: 'openWindow', arg: [number, URI[], { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }]): Thenable<void>;
	call(command: 'openNewWindow', arg: INewWindowOptions): Thenable<void>;
	call(command: 'showWindow', arg: number): Thenable<void>;
	call(command: 'getWindows'): Thenable<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>;
	call(command: 'getWindowCount'): Thenable<number>;
	call(command: 'relaunch', arg: [{ addArgs?: string[], removeArgs?: string[] }]): Thenable<void>;
	call(command: 'whenSharedProcessReady'): Thenable<void>;
	call(command: 'toggleSharedProcess'): Thenable<void>;
	call(command: 'log', arg: [string, string[]]): Thenable<void>;
	call(command: 'showItemInFolder', arg: string): Thenable<void>;
	call(command: 'getActiveWindowId'): Thenable<number>;
	call(command: 'openExternal', arg: string): Thenable<boolean>;
	call(command: 'startCrashReporter', arg: CrashReporterStartOptions): Thenable<void>;
	call(command: 'openAboutDialog'): Thenable<void>;
	call(command: 'resolveProxy', arg: [number, string]): Thenable<string | undefined>;
}

export class WindowsChannel implements IWindowsChannel {

	private onWindowOpen: Event<number>;
	private onWindowFocus: Event<number>;
	private onWindowBlur: Event<number>;
	private onWindowMaximize: Event<number>;
	private onWindowUnmaximize: Event<number>;
	private onRecentlyOpenedChange: Event<void>;

	constructor(private service: IWindowsService) {
		this.onWindowOpen = buffer(service.onWindowOpen, true);
		this.onWindowFocus = buffer(service.onWindowFocus, true);
		this.onWindowBlur = buffer(service.onWindowBlur, true);
		this.onWindowMaximize = buffer(service.onWindowMaximize, true);
		this.onWindowUnmaximize = buffer(service.onWindowUnmaximize, true);
		this.onRecentlyOpenedChange = buffer(service.onRecentlyOpenedChange, true);
	}

	listen<T>(event: string, arg?: any): Event<any> {
		switch (event) {
			case 'onWindowOpen': return this.onWindowOpen;
			case 'onWindowFocus': return this.onWindowFocus;
			case 'onWindowBlur': return this.onWindowBlur;
			case 'onWindowMaximize': return this.onWindowMaximize;
			case 'onWindowUnmaximize': return this.onWindowUnmaximize;
			case 'onRecentlyOpenedChange': return this.onRecentlyOpenedChange;
		}

		throw new Error('No event found');
	}

	call(command: string, arg?: any): Thenable<any> {
		switch (command) {
			case 'pickFileFolderAndOpen': return this.service.pickFileFolderAndOpen(arg);
			case 'pickFileAndOpen': return this.service.pickFileAndOpen(arg);
			case 'pickFolderAndOpen': return this.service.pickFolderAndOpen(arg);
			case 'pickWorkspaceAndOpen': return this.service.pickWorkspaceAndOpen(arg);
			case 'showMessageBox': return this.service.showMessageBox(arg[0], arg[1]);
			case 'showSaveDialog': return this.service.showSaveDialog(arg[0], arg[1]);
			case 'showOpenDialog': return this.service.showOpenDialog(arg[0], arg[1]);
			case 'reloadWindow': return this.service.reloadWindow(arg[0], arg[1]);
			case 'openDevTools': return this.service.openDevTools(arg[0], arg[1]);
			case 'toggleDevTools': return this.service.toggleDevTools(arg);
			case 'closeWorkspace': return this.service.closeWorkspace(arg);
			case 'enterWorkspace': return this.service.enterWorkspace(arg[0], arg[1]);
			case 'createAndEnterWorkspace': {
				const rawFolders: IWorkspaceFolderCreationData[] = arg[1];
				let folders: IWorkspaceFolderCreationData[];
				if (Array.isArray(rawFolders)) {
					folders = rawFolders.map(rawFolder => {
						return {
							uri: URI.revive(rawFolder.uri), // convert raw URI back to real URI
							name: rawFolder.name
						} as IWorkspaceFolderCreationData;
					});
				}

				return this.service.createAndEnterWorkspace(arg[0], folders, arg[2]);
			}
			case 'saveAndEnterWorkspace': return this.service.saveAndEnterWorkspace(arg[0], arg[1]);
			case 'toggleFullScreen': return this.service.toggleFullScreen(arg);
			case 'setRepresentedFilename': return this.service.setRepresentedFilename(arg[0], arg[1]);
			case 'addRecentlyOpened': return this.service.addRecentlyOpened(arg.map(URI.revive));
			case 'removeFromRecentlyOpened': {
				let paths: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string)[] = arg;
				if (Array.isArray(paths)) {
					paths = paths.map(path => isWorkspaceIdentifier(path) || typeof path === 'string' ? path : URI.revive(path));
				}
				return this.service.removeFromRecentlyOpened(paths);
			}
			case 'clearRecentlyOpened': return this.service.clearRecentlyOpened();
			case 'newWindowTab': return this.service.newWindowTab();
			case 'showPreviousWindowTab': return this.service.showPreviousWindowTab();
			case 'showNextWindowTab': return this.service.showNextWindowTab();
			case 'moveWindowTabToNewWindow': return this.service.moveWindowTabToNewWindow();
			case 'mergeAllWindowTabs': return this.service.mergeAllWindowTabs();
			case 'toggleWindowTabsBar': return this.service.toggleWindowTabsBar();
			case 'updateTouchBar': return this.service.updateTouchBar(arg[0], arg[1]);
			case 'getRecentlyOpened': return this.service.getRecentlyOpened(arg);
			case 'focusWindow': return this.service.focusWindow(arg);
			case 'closeWindow': return this.service.closeWindow(arg);
			case 'isFocused': return this.service.isFocused(arg);
			case 'isMaximized': return this.service.isMaximized(arg);
			case 'maximizeWindow': return this.service.maximizeWindow(arg);
			case 'unmaximizeWindow': return this.service.unmaximizeWindow(arg);
			case 'minimizeWindow': return this.service.minimizeWindow(arg);
			case 'onWindowTitleDoubleClick': return this.service.onWindowTitleDoubleClick(arg);
			case 'setDocumentEdited': return this.service.setDocumentEdited(arg[0], arg[1]);
			case 'openWindow': return this.service.openWindow(arg[0], arg[1] ? (<URI[]>arg[1]).map(r => URI.revive(r)) : arg[1], arg[2]);
			case 'openNewWindow': return this.service.openNewWindow(arg);
			case 'showWindow': return this.service.showWindow(arg);
			case 'getWindows': return this.service.getWindows();
			case 'getWindowCount': return this.service.getWindowCount();
			case 'relaunch': return this.service.relaunch(arg[0]);
			case 'whenSharedProcessReady': return this.service.whenSharedProcessReady();
			case 'toggleSharedProcess': return this.service.toggleSharedProcess();
			case 'quit': return this.service.quit();
			case 'log': return this.service.log(arg[0], arg[1]);
			case 'showItemInFolder': return this.service.showItemInFolder(arg);
			case 'getActiveWindowId': return this.service.getActiveWindowId();
			case 'openExternal': return this.service.openExternal(arg);
			case 'startCrashReporter': return this.service.startCrashReporter(arg);
			case 'openAboutDialog': return this.service.openAboutDialog();
			case 'resolveProxy': return this.service.resolveProxy(arg[0], arg[1]);
		}
		return undefined;
	}
}

export class WindowsChannelClient implements IWindowsService {

	_serviceBrand: any;

	constructor(private channel: IWindowsChannel) { }

	get onWindowOpen(): Event<number> { return this.channel.listen('onWindowOpen'); }
	get onWindowFocus(): Event<number> { return this.channel.listen('onWindowFocus'); }
	get onWindowBlur(): Event<number> { return this.channel.listen('onWindowBlur'); }
	get onWindowMaximize(): Event<number> { return this.channel.listen('onWindowMaximize'); }
	get onWindowUnmaximize(): Event<number> { return this.channel.listen('onWindowUnmaximize'); }
	get onRecentlyOpenedChange(): Event<void> { return this.channel.listen('onRecentlyOpenedChange'); }

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('pickFileFolderAndOpen', options));
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('pickFileAndOpen', options));
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('pickFolderAndOpen', options));
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('pickWorkspaceAndOpen', options));
	}

	showMessageBox(windowId: number, options: MessageBoxOptions): TPromise<IMessageBoxResult> {
		return TPromise.wrap(this.channel.call('showMessageBox', [windowId, options]));
	}

	showSaveDialog(windowId: number, options: SaveDialogOptions): TPromise<string> {
		return TPromise.wrap(this.channel.call('showSaveDialog', [windowId, options]));
	}

	showOpenDialog(windowId: number, options: OpenDialogOptions): TPromise<string[]> {
		return TPromise.wrap(this.channel.call('showOpenDialog', [windowId, options]));
	}

	reloadWindow(windowId: number, args?: ParsedArgs): TPromise<void> {
		return TPromise.wrap(this.channel.call('reloadWindow', [windowId, args]));
	}

	openDevTools(windowId: number, options?: IDevToolsOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('openDevTools', [windowId, options]));
	}

	toggleDevTools(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('toggleDevTools', windowId));
	}

	closeWorkspace(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('closeWorkspace', windowId));
	}

	enterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.wrap(this.channel.call('enterWorkspace', [windowId, path]));
	}

	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.wrap(this.channel.call('createAndEnterWorkspace', [windowId, folders, path]));
	}

	saveAndEnterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		return TPromise.wrap(this.channel.call('saveAndEnterWorkspace', [windowId, path]));
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('toggleFullScreen', windowId));
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('setRepresentedFilename', [windowId, fileName]));
	}

	addRecentlyOpened(files: URI[]): TPromise<void> {
		return TPromise.wrap(this.channel.call('addRecentlyOpened', files));
	}

	removeFromRecentlyOpened(paths: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI)[]): TPromise<void> {
		return TPromise.wrap(this.channel.call('removeFromRecentlyOpened', paths));
	}

	clearRecentlyOpened(): TPromise<void> {
		return TPromise.wrap(this.channel.call('clearRecentlyOpened'));
	}

	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened> {
		return TPromise.wrap(this.channel.call('getRecentlyOpened', windowId))
			.then(recentlyOpened => {
				recentlyOpened.workspaces = recentlyOpened.workspaces.map(workspace => isWorkspaceIdentifier(workspace) ? workspace : URI.revive(workspace));
				recentlyOpened.files = recentlyOpened.files.map(URI.revive);
				return recentlyOpened;
			});
	}

	newWindowTab(): TPromise<void> {
		return TPromise.wrap(this.channel.call('newWindowTab'));
	}

	showPreviousWindowTab(): TPromise<void> {
		return TPromise.wrap(this.channel.call('showPreviousWindowTab'));
	}

	showNextWindowTab(): TPromise<void> {
		return TPromise.wrap(this.channel.call('showNextWindowTab'));
	}

	moveWindowTabToNewWindow(): TPromise<void> {
		return TPromise.wrap(this.channel.call('moveWindowTabToNewWindow'));
	}

	mergeAllWindowTabs(): TPromise<void> {
		return TPromise.wrap(this.channel.call('mergeAllWindowTabs'));
	}

	toggleWindowTabsBar(): TPromise<void> {
		return TPromise.wrap(this.channel.call('toggleWindowTabsBar'));
	}

	focusWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('focusWindow', windowId));
	}

	closeWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('closeWindow', windowId));
	}

	isFocused(windowId: number): TPromise<boolean> {
		return TPromise.wrap(this.channel.call('isFocused', windowId));
	}

	isMaximized(windowId: number): TPromise<boolean> {
		return TPromise.wrap(this.channel.call('isMaximized', windowId));
	}

	maximizeWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('maximizeWindow', windowId));
	}

	unmaximizeWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('unmaximizeWindow', windowId));
	}

	minimizeWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('minimizeWindow', windowId));
	}

	onWindowTitleDoubleClick(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('onWindowTitleDoubleClick', windowId));
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		return TPromise.wrap(this.channel.call('setDocumentEdited', [windowId, flag]));
	}

	quit(): TPromise<void> {
		return TPromise.wrap(this.channel.call('quit'));
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void> {
		return TPromise.wrap(this.channel.call('relaunch', [options]));
	}

	whenSharedProcessReady(): TPromise<void> {
		return TPromise.wrap(this.channel.call('whenSharedProcessReady'));
	}

	toggleSharedProcess(): TPromise<void> {
		return TPromise.wrap(this.channel.call('toggleSharedProcess'));
	}

	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): TPromise<void> {
		return TPromise.wrap(this.channel.call('openWindow', [windowId, paths, options]));
	}

	openNewWindow(options?: INewWindowOptions): TPromise<void> {
		return this.channel.call('openNewWindow', options);
	}

	showWindow(windowId: number): TPromise<void> {
		return TPromise.wrap(this.channel.call('showWindow', windowId));
	}

	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return TPromise.wrap(this.channel.call('getWindows').then(result => { result.forEach(win => win.folderUri = win.folderUri ? URI.revive(win.folderUri) : win.folderUri); return result; }));
	}

	getWindowCount(): TPromise<number> {
		return TPromise.wrap(this.channel.call('getWindowCount'));
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		return TPromise.wrap(this.channel.call('log', [severity, messages]));
	}

	showItemInFolder(path: string): TPromise<void> {
		return TPromise.wrap(this.channel.call('showItemInFolder', path));
	}

	getActiveWindowId(): TPromise<number | undefined> {
		return TPromise.wrap(this.channel.call('getActiveWindowId'));
	}

	openExternal(url: string): TPromise<boolean> {
		return TPromise.wrap(this.channel.call('openExternal', url));
	}

	startCrashReporter(config: CrashReporterStartOptions): TPromise<void> {
		return TPromise.wrap(this.channel.call('startCrashReporter', config));
	}

	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): TPromise<void> {
		return TPromise.wrap(this.channel.call('updateTouchBar', [windowId, items]));
	}

	openAboutDialog(): TPromise<void> {
		return TPromise.wrap(this.channel.call('openAboutDialog'));
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(this.channel.call('resolveProxy', [windowId, url]));
	}
}
