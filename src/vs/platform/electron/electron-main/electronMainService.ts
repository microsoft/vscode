/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IWindowsMainService } from 'vs/platform/windows/electron-main/windows';
import { MessageBoxOptions, shell, OpenDevToolsOptions, SaveDialogOptions, OpenDialogOptions, CrashReporterStartOptions, crashReporter, Menu, BrowserWindow, app } from 'electron';
import { INativeOpenWindowOptions } from 'vs/platform/windows/node/window';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { IOpenedWindow, OpenContext, IWindowOpenable, IOpenEmptyWindowOptions } from 'vs/platform/windows/common/windows';
import { INativeOpenDialogOptions, MessageBoxReturnValue, SaveDialogReturnValue, OpenDialogReturnValue } from 'vs/platform/dialogs/node/dialogs';
import { isMacintosh, IProcessEnvironment } from 'vs/base/common/platform';
import { IElectronService } from 'vs/platform/electron/node/electron';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { AddFirstParameterToFunctions } from 'vs/base/common/types';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogs';

export class ElectronMainService implements AddFirstParameterToFunctions<IElectronService, Promise<any> /* only methods, not events */, number /* window ID */> {

	_serviceBrand: undefined;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
	) {
	}

	//#region Events

	readonly onWindowOpen: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-created', (_, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));

	readonly onWindowMaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-maximize', (_, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));
	readonly onWindowUnmaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-unmaximize', (_, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));

	readonly onWindowBlur: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (_, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId));
	readonly onWindowFocus: Event<number> = Event.any(
		Event.map(Event.filter(Event.map(this.windowsMainService.onWindowsCountChanged, () => this.windowsMainService.getLastActiveWindow()), window => !!window), window => window!.id),
		Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (_, window: BrowserWindow) => window.id), windowId => !!this.windowsMainService.getWindowById(windowId))
	);

	//#endregion

	//#region Window

	async getWindows(): Promise<IOpenedWindow[]> {
		const windows = this.windowsMainService.getWindows();

		return windows.map(window => ({
			id: window.id,
			workspace: window.openedWorkspace,
			folderUri: window.openedFolderUri,
			title: window.win.getTitle(),
			filename: window.getRepresentedFilename()
		}));
	}

	async getWindowCount(windowId: number): Promise<number> {
		return this.windowsMainService.getWindowCount();
	}

	async getActiveWindowId(windowId: number): Promise<number | undefined> {
		const activeWindow = BrowserWindow.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();
		if (activeWindow) {
			return activeWindow.id;
		}

		return undefined;
	}

	openWindow(windowId: number, options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(windowId: number, toOpen: IWindowOpenable[], options?: INativeOpenWindowOptions): Promise<void>;
	openWindow(windowId: number, arg1?: IOpenEmptyWindowOptions | IWindowOpenable[], arg2?: INativeOpenWindowOptions): Promise<void> {
		if (Array.isArray(arg1)) {
			return this.doOpenWindow(windowId, arg1, arg2);
		}

		return this.doOpenEmptyWindow(windowId, arg1);
	}

	private async doOpenWindow(windowId: number, toOpen: IWindowOpenable[], options: INativeOpenWindowOptions = Object.create(null)): Promise<void> {
		if (toOpen.length > 0) {
			this.windowsMainService.open({
				context: OpenContext.API,
				contextWindowId: windowId,
				urisToOpen: toOpen,
				cli: this.environmentService.args,
				forceNewWindow: options.forceNewWindow,
				forceReuseWindow: options.forceReuseWindow,
				diffMode: options.diffMode,
				addMode: options.addMode,
				gotoLineMode: options.gotoLineMode,
				noRecentEntry: options.noRecentEntry,
				waitMarkerFileURI: options.waitMarkerFileURI
			});
		}
	}

	private async doOpenEmptyWindow(windowId: number, options?: IOpenEmptyWindowOptions): Promise<void> {
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

	async isWindowFocused(windowId: number): Promise<boolean> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return window.win.isFocused();
		}

		return false;
	}

	async focusWindow(windowId: number, options?: { windowId?: number; }): Promise<void> {
		if (options && typeof options.windowId === 'number') {
			windowId = options.windowId;
		}

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
		return this.dialogMainService.showMessageBox(options, this.toBrowserWindow(windowId));
	}

	async showSaveDialog(windowId: number, options: SaveDialogOptions): Promise<SaveDialogReturnValue> {
		return this.dialogMainService.showSaveDialog(options, this.toBrowserWindow(windowId));
	}

	async showOpenDialog(windowId: number, options: OpenDialogOptions): Promise<OpenDialogReturnValue> {
		return this.dialogMainService.showOpenDialog(options, this.toBrowserWindow(windowId));
	}

	private toBrowserWindow(windowId: number): BrowserWindow | undefined {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return window.win;
		}

		return undefined;
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
		shell.openExternal(url);

		return true;
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
		this.windowsMainService.open({ context: OpenContext.API, cli: this.environmentService.args, forceNewTabbedWindow: true, forceEmpty: true });
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

	async reload(windowId: number, options?: { disableExtensions?: boolean }): Promise<void> {
		const window = this.windowsMainService.getWindowById(windowId);
		if (window) {
			return this.windowsMainService.reload(window, options && options.disableExtensions ? { _: [], 'disable-extensions': true } : undefined);
		}
	}

	async closeWorkspace(windowId: number): Promise<void> {
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

	//#region Debug

	// TODO@Isidor move into debug IPC channel (https://github.com/microsoft/vscode/issues/81060)

	async openExtensionDevelopmentHostWindow(windowId: number, args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		const extDevPaths = args.extensionDevelopmentPath;
		if (extDevPaths) {
			this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
				context: OpenContext.API,
				cli: args,
				userEnv: Object.keys(env).length > 0 ? env : undefined
			});
		}
	}

	//#endregion
}
