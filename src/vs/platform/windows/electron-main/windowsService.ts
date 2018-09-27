/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as nls from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import product from 'vs/platform/node/product';
import { IWindowsService, OpenContext, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IDevToolsOptions } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { shell, crashReporter, app, Menu, clipboard } from 'electron';
import { Event, fromNodeEventEmitter, mapEvent, filterEvent, anyEvent, latch } from 'vs/base/common/event';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IWindowsMainService, ISharedProcess } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService, IRecentlyOpened } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, IWorkspaceFolderCreationData, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { Schemas } from 'vs/base/common/network';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isMacintosh, isLinux } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';

export class WindowsService implements IWindowsService, IURLHandler, IDisposable {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	private _activeWindowId: number | undefined;

	readonly onWindowOpen: Event<number> = filterEvent(fromNodeEventEmitter(app, 'browser-window-created', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowBlur: Event<number> = filterEvent(fromNodeEventEmitter(app, 'browser-window-blur', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowMaximize: Event<number> = filterEvent(fromNodeEventEmitter(app, 'browser-window-maximize', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowUnmaximize: Event<number> = filterEvent(fromNodeEventEmitter(app, 'browser-window-unmaximize', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowFocus: Event<number> = anyEvent(
		mapEvent(filterEvent(mapEvent(this.windowsMainService.onWindowsCountChanged, () => this.windowsMainService.getLastActiveWindow()), w => !!w), w => w.id),
		filterEvent(fromNodeEventEmitter(app, 'browser-window-focus', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id))
	);

	readonly onRecentlyOpenedChange: Event<void> = this.historyService.onRecentlyOpenedChange;

	constructor(
		private sharedProcess: ISharedProcess,
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IURLService urlService: IURLService,
		@ILifecycleService private lifecycleService: ILifecycleService,
		@IHistoryMainService private historyService: IHistoryMainService,
		@ILogService private logService: ILogService
	) {
		urlService.registerHandler(this);

		// remember last active window id
		latch(anyEvent(this.onWindowOpen, this.onWindowFocus))
			(id => this._activeWindowId = id, null, this.disposables);
	}

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		this.logService.trace('windowsService#pickFileFolderAndOpen');
		this.windowsMainService.pickFileFolderAndOpen(options);

		return TPromise.as(null);
	}

	pickFileAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		this.logService.trace('windowsService#pickFileAndOpen');
		this.windowsMainService.pickFileAndOpen(options);

		return TPromise.as(null);
	}

	pickFolderAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		this.logService.trace('windowsService#pickFolderAndOpen');
		this.windowsMainService.pickFolderAndOpen(options);

		return TPromise.as(null);
	}

	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): TPromise<void> {
		this.logService.trace('windowsService#pickWorkspaceAndOpen');
		this.windowsMainService.pickWorkspaceAndOpen(options);

		return TPromise.as(null);
	}

	showMessageBox(windowId: number, options: Electron.MessageBoxOptions): TPromise<IMessageBoxResult> {
		this.logService.trace('windowsService#showMessageBox', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		return this.windowsMainService.showMessageBox(options, codeWindow);
	}

	showSaveDialog(windowId: number, options: Electron.SaveDialogOptions): TPromise<string> {
		this.logService.trace('windowsService#showSaveDialog', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		return this.windowsMainService.showSaveDialog(options, codeWindow);
	}

	showOpenDialog(windowId: number, options: Electron.OpenDialogOptions): TPromise<string[]> {
		this.logService.trace('windowsService#showOpenDialog', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		return this.windowsMainService.showOpenDialog(options, codeWindow);
	}

	reloadWindow(windowId: number, args: ParsedArgs): TPromise<void> {
		this.logService.trace('windowsService#reloadWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			this.windowsMainService.reload(codeWindow, args);
		}

		return TPromise.as(null);
	}

	openDevTools(windowId: number, options?: IDevToolsOptions): TPromise<void> {
		this.logService.trace('windowsService#openDevTools', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.webContents.openDevTools(options);
		}

		return TPromise.as(null);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#toggleDevTools', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			const contents = codeWindow.win.webContents;
			if (isMacintosh && codeWindow.hasHiddenTitleBarStyle() && !codeWindow.win.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		}

		return TPromise.as(null);
	}

	updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): TPromise<void> {
		this.logService.trace('windowsService#updateTouchBar', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.updateTouchBar(items);
		}

		return TPromise.as(null);
	}

	closeWorkspace(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#closeWorkspace', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			this.windowsMainService.closeWorkspace(codeWindow);
		}

		return TPromise.as(null);
	}

	enterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		this.logService.trace('windowsService#enterWorkspace', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return this.windowsMainService.enterWorkspace(codeWindow, path);
		}

		return TPromise.as(null);
	}

	createAndEnterWorkspace(windowId: number, folders?: IWorkspaceFolderCreationData[], path?: string): TPromise<IEnterWorkspaceResult> {
		this.logService.trace('windowsService#createAndEnterWorkspace', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return this.windowsMainService.createAndEnterWorkspace(codeWindow, folders, path);
		}

		return TPromise.as(null);
	}

	saveAndEnterWorkspace(windowId: number, path: string): TPromise<IEnterWorkspaceResult> {
		this.logService.trace('windowsService#saveAndEnterWorkspace', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return this.windowsMainService.saveAndEnterWorkspace(codeWindow, path);
		}

		return TPromise.as(null);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#toggleFullScreen', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.toggleFullScreen();
		}

		return TPromise.as(null);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		this.logService.trace('windowsService#setRepresentedFilename', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.setRepresentedFilename(fileName);
		}

		return TPromise.as(null);
	}

	addRecentlyOpened(files: URI[]): TPromise<void> {
		this.logService.trace('windowsService#addRecentlyOpened');
		this.historyService.addRecentlyOpened(void 0, files);

		return TPromise.as(null);
	}

	removeFromRecentlyOpened(paths: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string)[]): TPromise<void> {
		this.logService.trace('windowsService#removeFromRecentlyOpened');
		this.historyService.removeFromRecentlyOpened(paths);

		return TPromise.as(null);
	}

	clearRecentlyOpened(): TPromise<void> {
		this.logService.trace('windowsService#clearRecentlyOpened');
		this.historyService.clearRecentlyOpened();

		return TPromise.as(null);
	}

	getRecentlyOpened(windowId: number): TPromise<IRecentlyOpened> {
		this.logService.trace('windowsService#getRecentlyOpened', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return TPromise.as(this.historyService.getRecentlyOpened(codeWindow.config.workspace || codeWindow.config.folderUri, codeWindow.config.filesToOpen));
		}

		return TPromise.as(this.historyService.getRecentlyOpened());
	}

	newWindowTab(): TPromise<void> {
		this.logService.trace('windowsService#newWindowTab');

		this.windowsMainService.openNewTabbedWindow(OpenContext.API);

		return TPromise.as(void 0);
	}

	showPreviousWindowTab(): TPromise<void> {
		this.logService.trace('windowsService#showPreviousWindowTab');
		Menu.sendActionToFirstResponder('selectPreviousTab:');

		return TPromise.as(void 0);
	}

	showNextWindowTab(): TPromise<void> {
		this.logService.trace('windowsService#showNextWindowTab');
		Menu.sendActionToFirstResponder('selectNextTab:');

		return TPromise.as(void 0);
	}

	moveWindowTabToNewWindow(): TPromise<void> {
		this.logService.trace('windowsService#moveWindowTabToNewWindow');
		Menu.sendActionToFirstResponder('moveTabToNewWindow:');

		return TPromise.as(void 0);
	}

	mergeAllWindowTabs(): TPromise<void> {
		this.logService.trace('windowsService#mergeAllWindowTabs');
		Menu.sendActionToFirstResponder('mergeAllWindows:');

		return TPromise.as(void 0);
	}

	toggleWindowTabsBar(): TPromise<void> {
		this.logService.trace('windowsService#toggleWindowTabsBar');
		Menu.sendActionToFirstResponder('toggleTabBar:');

		return TPromise.as(void 0);
	}

	focusWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#focusWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.focus();
		}

		return TPromise.as(null);
	}

	closeWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#closeWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.close();
		}

		return TPromise.as(null);
	}

	isFocused(windowId: number): TPromise<boolean> {
		this.logService.trace('windowsService#isFocused', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return TPromise.as(codeWindow.win.isFocused());
		}

		return TPromise.as(null);
	}

	isMaximized(windowId: number): TPromise<boolean> {
		this.logService.trace('windowsService#isMaximized', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			return TPromise.as(codeWindow.win.isMaximized());
		}

		return TPromise.as(null);
	}

	maximizeWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#maximizeWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.maximize();
		}

		return TPromise.as(null);
	}

	unmaximizeWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#unmaximizeWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.unmaximize();
		}

		return TPromise.as(null);
	}

	minimizeWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#minimizeWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.minimize();
		}

		return TPromise.as(null);
	}

	onWindowTitleDoubleClick(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#onWindowTitleDoubleClick', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.onWindowTitleDoubleClick();
		}

		return TPromise.as(null);
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		this.logService.trace('windowsService#setDocumentEdited', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow && codeWindow.win.isDocumentEdited() !== flag) {
			codeWindow.win.setDocumentEdited(flag);
		}

		return TPromise.as(null);
	}

	openWindow(windowId: number, paths: URI[], options?: { forceNewWindow?: boolean, forceReuseWindow?: boolean, forceOpenWorkspaceAsFile?: boolean, args?: ParsedArgs }): TPromise<void> {
		this.logService.trace('windowsService#openWindow');
		if (!paths || !paths.length) {
			return TPromise.as(null);
		}

		this.windowsMainService.open({
			context: OpenContext.API,
			contextWindowId: windowId,
			urisToOpen: paths,
			cli: options && options.args ? { ...this.environmentService.args, ...options.args } : this.environmentService.args,
			forceNewWindow: options && options.forceNewWindow,
			forceReuseWindow: options && options.forceReuseWindow,
			forceOpenWorkspaceAsFile: options && options.forceOpenWorkspaceAsFile
		});

		return TPromise.as(null);
	}

	openNewWindow(): TPromise<void> {
		this.logService.trace('windowsService#openNewWindow');

		this.windowsMainService.openNewWindow(OpenContext.API);

		return TPromise.as(null);
	}

	showWindow(windowId: number): TPromise<void> {
		this.logService.trace('windowsService#showWindow', windowId);
		const codeWindow = this.windowsMainService.getWindowById(windowId);

		if (codeWindow) {
			codeWindow.win.show();
		}

		return TPromise.as(null);
	}

	getWindows(): TPromise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		this.logService.trace('windowsService#getWindows');
		const windows = this.windowsMainService.getWindows();
		const result = windows.map(w => ({ id: w.id, workspace: w.openedWorkspace, folderUri: w.openedFolderUri, title: w.win.getTitle(), filename: w.getRepresentedFilename() }));

		return TPromise.as(result);
	}

	getWindowCount(): TPromise<number> {
		this.logService.trace('windowsService#getWindowCount');
		return TPromise.as(this.windowsMainService.getWindows().length);
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		console[severity].apply(console, ...messages);
		return TPromise.as(null);
	}

	showItemInFolder(path: string): TPromise<void> {
		this.logService.trace('windowsService#showItemInFolder');
		shell.showItemInFolder(path);
		return TPromise.as(null);
	}

	getActiveWindowId(): TPromise<number | undefined> {
		return TPromise.as(this._activeWindowId);
	}

	openExternal(url: string): TPromise<boolean> {
		this.logService.trace('windowsService#openExternal');
		return TPromise.as(shell.openExternal(url));
	}

	startCrashReporter(config: Electron.CrashReporterStartOptions): TPromise<void> {
		this.logService.trace('windowsService#startCrashReporter');
		crashReporter.start(config);
		return TPromise.as(null);
	}

	quit(): TPromise<void> {
		this.logService.trace('windowsService#quit');
		this.windowsMainService.quit();
		return TPromise.as(null);
	}

	relaunch(options: { addArgs?: string[], removeArgs?: string[] }): TPromise<void> {
		this.logService.trace('windowsService#relaunch');
		this.lifecycleService.relaunch(options);

		return TPromise.as(null);
	}

	whenSharedProcessReady(): TPromise<void> {
		this.logService.trace('windowsService#whenSharedProcessReady');
		return this.sharedProcess.whenReady();
	}

	toggleSharedProcess(): TPromise<void> {
		this.logService.trace('windowsService#toggleSharedProcess');
		this.sharedProcess.toggle();
		return TPromise.as(null);
	}

	openAboutDialog(): TPromise<void> {
		this.logService.trace('windowsService#openAboutDialog');
		const lastActiveWindow = this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow();

		let version = app.getVersion();

		if (product.target) {
			version = `${version} (${product.target} setup)`;
		}

		const detail = nls.localize('aboutDetail',
			"Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nChrome: {4}\nNode.js: {5}\nV8: {6}\nArchitecture: {7}",
			version,
			product.commit || 'Unknown',
			product.date || 'Unknown',
			process.versions['electron'],
			process.versions['chrome'],
			process.versions['node'],
			process.versions['v8'],
			process.arch
		);

		const ok = nls.localize('okButton', "OK");
		const copy = mnemonicButtonLabel(nls.localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"));
		let buttons: string[];
		if (isLinux) {
			buttons = [copy, ok];
		} else {
			buttons = [ok, copy];
		}

		this.windowsMainService.showMessageBox({
			title: product.nameLong,
			type: 'info',
			message: product.nameLong,
			detail: `\n${detail}`,
			buttons,
			noLink: true,
			defaultId: buttons.indexOf(ok)
		}, lastActiveWindow).then(result => {
			if (buttons[result.button] === copy) {
				clipboard.writeText(detail);
			}
		});

		return TPromise.as(null);
	}

	handleURL(uri: URI): TPromise<boolean> {
		// Catch file URLs
		if (uri.authority === Schemas.file && !!uri.path) {
			this.openFileForURI(URI.file(uri.fsPath));
			return TPromise.as(true);
		}

		return TPromise.wrap(false);
	}

	private openFileForURI(uri: URI): TPromise<boolean> {
		const cli = assign(Object.create(null), this.environmentService.args, { goto: true });
		const urisToOpen = [uri];

		this.windowsMainService.open({ context: OpenContext.API, cli, urisToOpen });
		return TPromise.wrap(true);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
