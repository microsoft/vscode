/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService, IURIToOpen, IOpenSettings, isWorkspaceToOpen, isFolderToOpen } from 'vs/platform/windows/common/windows';
import { reviveWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IRecent, isRecentFile, isRecentFolder } from 'vs/platform/history/common/history';

export class WindowsChannel implements IServerChannel {

	private readonly onWindowOpen: Event<number>;
	private readonly onWindowFocus: Event<number>;
	private readonly onWindowBlur: Event<number>;
	private readonly onWindowMaximize: Event<number>;
	private readonly onWindowUnmaximize: Event<number>;
	private readonly onRecentlyOpenedChange: Event<void>;

	constructor(private readonly service: IWindowsService) {
		this.onWindowOpen = Event.buffer(service.onWindowOpen, true);
		this.onWindowFocus = Event.buffer(service.onWindowFocus, true);
		this.onWindowBlur = Event.buffer(service.onWindowBlur, true);
		this.onWindowMaximize = Event.buffer(service.onWindowMaximize, true);
		this.onWindowUnmaximize = Event.buffer(service.onWindowUnmaximize, true);
		this.onRecentlyOpenedChange = Event.buffer(service.onRecentlyOpenedChange, true);
	}

	listen(_: unknown, event: string): Event<any> {
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

	call(_: unknown, command: string, arg?: any): Promise<any> {
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
			case 'enterWorkspace': return this.service.enterWorkspace(arg[0], URI.revive(arg[1]));
			case 'toggleFullScreen': return this.service.toggleFullScreen(arg);
			case 'setRepresentedFilename': return this.service.setRepresentedFilename(arg[0], arg[1]);
			case 'addRecentlyOpened': return this.service.addRecentlyOpened(arg.map((recent: IRecent) => {
				if (isRecentFile(recent)) {
					recent.fileUri = URI.revive(recent.fileUri);
				} else if (isRecentFolder(recent)) {
					recent.folderUri = URI.revive(recent.folderUri);
				} else {
					recent.workspace = reviveWorkspaceIdentifier(recent.workspace);
				}
				return recent;
			}));
			case 'removeFromRecentlyOpened': return this.service.removeFromRecentlyOpened(arg.map(URI.revive));
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
			case 'openWindow': {
				const urisToOpen: IURIToOpen[] = arg[1];
				const options: IOpenSettings = arg[2];
				urisToOpen.forEach(r => {
					if (isWorkspaceToOpen(r)) {
						r.workspaceUri = URI.revive(r.workspaceUri);
					} else if (isFolderToOpen(r)) {
						r.folderUri = URI.revive(r.folderUri);
					} else {
						r.fileUri = URI.revive(r.fileUri);
					}
				});
				options.waitMarkerFileURI = options.waitMarkerFileURI && URI.revive(options.waitMarkerFileURI);
				return this.service.openWindow(arg[0], urisToOpen, options);
			}
			case 'openNewWindow': return this.service.openNewWindow(arg);
			case 'openExtensionDevelopmentHostWindow': return this.service.openExtensionDevelopmentHostWindow(arg[0], arg[1]);
			case 'getWindows': return this.service.getWindows();
			case 'getWindowCount': return this.service.getWindowCount();
			case 'relaunch': return this.service.relaunch(arg[0]);
			case 'whenSharedProcessReady': return this.service.whenSharedProcessReady();
			case 'toggleSharedProcess': return this.service.toggleSharedProcess();
			case 'quit': return this.service.quit();
			case 'log': return this.service.log(arg[0], arg[1]);
			case 'showItemInFolder': return this.service.showItemInFolder(URI.revive(arg));
			case 'getActiveWindowId': return this.service.getActiveWindowId();
			case 'openExternal': return this.service.openExternal(arg);
			case 'startCrashReporter': return this.service.startCrashReporter(arg);
			case 'openAboutDialog': return this.service.openAboutDialog();
			case 'resolveProxy': return this.service.resolveProxy(arg[0], arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}
