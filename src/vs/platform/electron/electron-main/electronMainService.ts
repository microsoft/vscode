/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { MessageBoxOptions, MessageBoxReturnValue, shell, OpenDevToolsOptions, SaveDialogOptions, SaveDialogReturnValue, OpenDialogOptions, OpenDialogReturnValue, CrashReporterStartOptions, crashReporter, Menu } from 'electron';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { OpenContext, INativeOpenDialogOptions } from 'vs/platform/windows/common/windows';
import { isMacintosh } from 'vs/base/common/platform';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { AddContextToFunctions } from 'vs/platform/ipc/node/simpleIpcProxy';

export class ElectronMainService implements AddContextToFunctions<IElectronService, number> {

	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
	}

	//#region Window

	async windowCount(windowId: number): Promise<number> {
		return this.windowsMainService.getWindowCount();
	}

	async openEmptyWindow(windowId: number, options?: { reuse?: boolean, remoteAuthority?: string }): Promise<void> {
		this.windowsMainService.openEmptyWindow(OpenContext.API, options);
	}

	async toggleFullScreen(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.toggleFullScreen();
		}
	}

	async handleTitleDoubleClick(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.handleTitleDoubleClick();
		}
	}

	async isMaximized(windowId: number): Promise<boolean> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return window.win.isMaximized();
		}

		return false;
	}

	async maximizeWindow(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.win.maximize();
		}
	}

	async unmaximizeWindow(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.win.unmaximize();
		}
	}

	async minimizeWindow(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.win.minimize();
		}
	}

	async focusWindow(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			if (isMacintosh) {
				window.win.show();
			} else {
				window.win.focus();
			}
		}
	}

	//#endregion

	//#region Dialog

	async showMessageBox(windowId: number, options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
		return this.windowsMainService.showMessageBox(options, this.windowsMainService.getWindowById(windowId));
	}

	async showSaveDialog(windowId: number, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
		return this.windowsMainService.showSaveDialog(options, this.windowsMainService.getWindowById(windowId));
	}

	async showOpenDialog(windowId: number, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
		return this.windowsMainService.showOpenDialog(options, this.windowsMainService.getWindowById(windowId));
	}

	async pickFileFolderAndOpen(windowId: number, options: INativeOpenDialogOptions): Promise<void> {
		return this.windowsMainService.pickFileFolderAndOpen(options, this.windowsMainService.getWindowById(windowId));
	}

	async pickFileAndOpen(windowId: number, options: INativeOpenDialogOptions): Promise<void> {
		return this.windowsMainService.pickFileAndOpen(options, this.windowsMainService.getWindowById(windowId));
	}

	async pickFolderAndOpen(windowId: number, options: INativeOpenDialogOptions): Promise<void> {
		return this.windowsMainService.pickFolderAndOpen(options, this.windowsMainService.getWindowById(windowId));
	}

	async pickWorkspaceAndOpen(windowId: number, options: INativeOpenDialogOptions): Promise<void> {
		return this.windowsMainService.pickWorkspaceAndOpen(options, this.windowsMainService.getWindowById(windowId));
	}

	//#endregion

	//#region OS

	async showItemInFolder(windowId: number, path: string): Promise<void> {
		shell.showItemInFolder(path);
	}

	async setRepresentedFilename(windowId: number, path: string): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.setRepresentedFilename(path);
		}
	}

	async setDocumentEdited(windowId: number, edited: boolean): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.win.setDocumentEdited(edited);
		}
	}

	async openExternal(windowId: number, url: string): Promise<boolean> {
		return this.windowsMainService.openExternal(url);
	}

	async updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.updateTouchBar(items);
		}
	}

	//#endregion

	//#region macOS Touchbar

	async newWindowTab(): Promise<void> {
		this.windowsMainService.openNewTabbedWindow(OpenContext.API);
	}

	async showPreviousWindowTab(): Promise<void> {
		Menu.sendActionToFirstResponder('selectPreviousTab:');
	}

	async showNextWindowTab(): Promise<void> {
		Menu.sendActionToFirstResponder('selectNextTab:');
	}

	async moveWindowTabToNewWindow(): Promise<void> {
		Menu.sendActionToFirstResponder('moveTabToNewWindow:');
	}

	async mergeAllWindowTabs(): Promise<void> {
		Menu.sendActionToFirstResponder('mergeAllWindows:');
	}

	async toggleWindowTabsBar(): Promise<void> {
		Menu.sendActionToFirstResponder('toggleTabBar:');
	}

	//#endregion

	//#region Lifecycle

	async relaunch(windowId: number, options?: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		return this.lifecycleMainService.relaunch(options);
	}

	async reload(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return this.windowsMainService.reload(window);
		}
	}

	async closeWorkpsace(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return this.windowsMainService.closeWorkspace(window);
		}
	}

	async closeWindow(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return window.win.close();
		}
	}

	async quit(windowId: number): Promise<void> {
		return this.windowsMainService.quit();
	}

	//#endregion

	//#region Connectivity

	async resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return new Promise(resolve => {
			const window = this.windowsMainService.getWindowById(windowId);
			if (window && window.win && window.win.webContents && window.win.webContents.session) {
				window.win.webContents.session.resolveProxy(url, proxy => resolve(proxy));
			} else {
				resolve();
			}
		});
	}

	//#endregion

	//#region Development

	async openDevTools(windowId: number, options?: OpenDevToolsOptions): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			window.win.webContents.openDevTools(options);
		}
	}

	async toggleDevTools(windowId: number): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			const contents = window.win.webContents;
			if (isMacintosh && window.hasHiddenTitleBarStyle() && !window.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		}
	}

	async startCrashReporter(windowId: number, options: CrashReporterStartOptions): Promise<void> {
		crashReporter.start(options);
	}

	//#endregion
}
