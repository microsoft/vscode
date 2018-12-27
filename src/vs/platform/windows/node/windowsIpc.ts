/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
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
		this.onWindowOpen = Event.buffer(service.onWindowOpen, true);
		this.onWindowFocus = Event.buffer(service.onWindowFocus, true);
		this.onWindowBlur = Event.buffer(service.onWindowBlur, true);
		this.onWindowMaximize = Event.buffer(service.onWindowMaximize, true);
		this.onWindowUnmaximize = Event.buffer(service.onWindowUnmaximize, true);
		this.onRecentlyOpenedChange = Event.buffer(service.onRecentlyOpenedChange, true);
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

	call(_, command: string, arg?: any): Promise<any> {
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
				let paths: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string> = arg;
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

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFileFolderAndOpen', options);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFileAndOpen', options);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickFolderAndOpen', options);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		return this.channel.call('pickWorkspaceAndOpen', options);
	}

	showMessageBox(windowId: number, options: MessageBoxOptions): Promise<IMessageBoxResult> {
		return this.channel.call('showMessageBox', [windowId, options]);
	}

	showSaveDialog(windowId: number, options: SaveDialogOptions): Promise<string> {
		return this.channel.call('showSaveDialog', [windowId, options]);
	}

	showOpenDialog(windowId: number, options: OpenDialogOptions): Promise<string[]> {
		return this.channel.call('showOpenDialog', [windowId, options]);
	}

	reloadWindow(windowId: number, args?: ParsedArgs): Promise<void> {
		return this.channel.call('reloadWindow', [windowId, args]);
	}

	openDevTools(windowId: number, options?: IDevToolsOptions): Promise<void> {
		return this.channel.call('openDevTools', [windowId, options]);
	}

	toggleDevTools(windowId: number): Promise<void> {
		return this.channel.call('toggleDevTools', windowId);
	}

	closeWorkspace(windowId: number): Promise<void> {
		return this.channel.call('closeWorkspace', windowId);
	}

	enterWorkspace(windowId: number, path: string): Promise<IEnterWorkspaceResult> {
		return this.channel.call('enterWorkspace', [windowId, path]);
	}

	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): Promise<IEnterWorkspaceResult> {
		return this.channel.call('createAndEnterWorkspace', [windowId, folders, path]);
	}

	saveAndEnterWorkspace(windowId: number, path: string): Promise<IEnterWorkspaceResult> {
		return this.channel.call('saveAndEnterWorkspace', [windowId, path]);
	}

	toggleFullScreen(windowId: number): Promise<void> {
		return this.channel.call('toggleFullScreen', windowId);
	}

	setRepresentedFilename(windowId: number, fileName: string): Promise<void> {
		return this.channel.call('setRepresentedFilename', [windowId, fileName]);
	}

	addRecentlyOpened(files: URI[]): Promise<void> {
		return this.channel.call('addRecentlyOpened', files);
	}

	removeFromRecentlyOpened(paths: Array<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI>): Promise<void> {
		return this.channel.call('removeFromRecentlyOpened', paths);
	}

	clearRecentlyOpened(): Promise<void> {
		return this.channel.call('clearRecentlyOpened');
	}

	getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		return this.channel.call('getRecentlyOpened', windowId)
			.then((recentlyOpened: IRecentlyOpened) => {
				recentlyOpened.workspaces = recentlyOpened.workspaces.map(workspace => isWorkspaceIdentifier(workspace) ? workspace : URI.revive(workspace));
				recentlyOpened.files = recentlyOpened.files.map(URI.revive);
				return recentlyOpened;
			});
	}

	newWindowTab(): Promise<void> {
		return this.channel.call('newWindowTab');
	}

	showPreviousWindowTab(): Promise<void> {
		return this.channel.call('showPreviousWindowTab');
	}

	showNextWindowTab(): Promise<void> {
		return this.channel.call('showNextWindowTab');
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return this.channel.call('moveWindowTabToNewWindow');
	}

	mergeAllWindowTabs(): Promise<void> {
		return this.channel.call('mergeAllWindowTabs');
	}

	toggleWindowTabsBar(): Promise<void> {
		return this.channel.call('toggleWindowTabsBar');
	}

	focusWindow(windowId: number): Promise<void> {
		return this.channel.call('focusWindow', windowId);
	}

	closeWindow(windowId: number): Promise<void> {
		return this.channel.call('closeWindow', windowId);
	}

	isFocused(windowId: number): Promise<boolean> {
		return this.channel.call('isFocused', windowId);
	}

	isMaximized(windowId: number): Promise<boolean> {
		return this.channel.call('isMaximized', windowId);
	}

	maximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('maximizeWindow', windowId);
	}

	unmaximizeWindow(windowId: number): Promise<void> {
		return this.channel.call('unmaximizeWindow', windowId);
	}

	minimizeWindow(windowId: number): Promise<void> {
		return this.channel.call('minimizeWindow', windowId);
	}

	onWindowTitleDoubleClick(windowId: number): Promise<void> {
		return this.channel.call('onWindowTitleDoubleClick', windowId);
	}

	setDocumentEdited(windowId: number, flag: boolean): Promise<void> {
		return this.channel.call('setDocumentEdited', [windowId, flag]);
	}

	quit(): Promise<void> {
		return this.channel.call('quit');
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return this.channel.call('relaunch', [options]);
	}

	whenSharedProcessReady(): Promise<void> {
		return this.channel.call('whenSharedProcessReady');
	}

	toggleSharedProcess(): Promise<void> {
		return this.channel.call('toggleSharedProcess');
	}

	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): Promise<void> {
		return this.channel.call('openWindow', [windowId, paths, options]);
	}

	openNewWindow(options?: INewWindowOptions): Promise<void> {
		return this.channel.call('openNewWindow', options);
	}

	showWindow(windowId: number): Promise<void> {
		return this.channel.call('showWindow', windowId);
	}

	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return this.channel.call<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]>('getWindows').then(result => { result.forEach(win => win.folderUri = win.folderUri ? URI.revive(win.folderUri) : win.folderUri); return result; });
	}

	getWindowCount(): Promise<number> {
		return this.channel.call('getWindowCount');
	}

	log(severity: string, ...messages: string[]): Promise<void> {
		return this.channel.call('log', [severity, messages]);
	}

	showItemInFolder(path: string): Promise<void> {
		return this.channel.call('showItemInFolder', path);
	}

	getActiveWindowId(): Promise<number | undefined> {
		return this.channel.call('getActiveWindowId');
	}

	openExternal(url: string): Promise<boolean> {
		return this.channel.call('openExternal', url);
	}

	startCrashReporter(config: CrashReporterStartOptions): Promise<void> {
		return this.channel.call('startCrashReporter', config);
	}

	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): Promise<void> {
		return this.channel.call('updateTouchBar', [windowId, items]);
	}

	openAboutDialog(): Promise<void> {
		return this.channel.call('openAboutDialog');
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(this.channel.call('resolveProxy', [windowId, url]));
	}
}
