/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, buffer } from 'vs/base/common/event';
import { IChannel, IServerChannel } from 'vs/base/parts/ipc/node/ipc';
import { IWindowsService, INativeOpenDialogOptions, IEnterWorkspaceResult, CrashReporterStartOptions, IMessageBoxResult, MessageBoxOptions, SaveDialogOptions, OpenDialogOptions, IDevToolsOptions, INewWindowOptions } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { URI } from 'vs/base/common/uri';
import { ParsedArgs } from 'vs/platform/environment/common/environment';

export class WindowsChannel implements IServerChannel {

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

	listen(_, event: string): Event<any> {
		switch (event) {
			case 'onWindowOpen': return this.onWindowOpen;
			case 'onWindowFocus': return this.onWindowFocus;
			case 'onWindowBlur': return this.onWindowBlur;
			case 'onWindowMaximize': return this.onWindowMaximize;
			case 'onWindowUnmaximize': return this.onWindowUnmaximize;
			case 'onRecentlyOpenedChange': return this.onRecentlyOpenedChange;
		}

		throw new Error(`Event not found: ${event}`);
	}

	call(_, command: string, arg?: any): Thenable<any> {
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
				let folders: IWorkspaceFolderCreationData[] | undefined = undefined;
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

		throw new Error(`Call not found: ${command}`);
	}
}

export class WindowsChannelClient implements IWindowsService {

	_serviceBrand: any;

	constructor(private channel: IChannel) { }

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
		return TPromise.wrap<IRecentlyOpened>(this.channel.call('getRecentlyOpened', windowId))
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
		return TPromise.wrap(this.channel.call<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>('getWindows').then(result => { result.forEach(win => win.folderUri = win.folderUri ? URI.revive(win.folderUri) : win.folderUri); return result; }));
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
