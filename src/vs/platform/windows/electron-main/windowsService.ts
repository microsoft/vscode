/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as os from 'os';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import product from 'vs/platform/product/node/product';
import { IWindowsService, OpenContext, INativeOpenDialogOptions, IEnterWorkspaceResult, IMessageBoxResult, IDevToolsOptions, INewWindowOptions, IOpenSettings, IURIToOpen } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { shell, crashReporter, app, Menu, clipboard } from 'electron';
import { Event } from 'vs/base/common/event';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { ILifecycleService } from 'vs/platform/lifecycle/electron-main/lifecycleMain';
import { IWindowsMainService, ISharedProcess, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { IHistoryMainService, IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { Schemas } from 'vs/base/common/network';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { isMacintosh, isLinux, IProcessEnvironment } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';
import { ServiceIdentifier } from 'vs/platform/instantiation/common/instantiation';

export class WindowsService extends Disposable implements IWindowsService, IURLHandler {

	_serviceBrand!: ServiceIdentifier<any>;

	private readonly disposables = this._register(new DisposableStore());

	private _activeWindowId: number | undefined;

	readonly onWindowOpen: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-created', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowBlur: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowMaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-maximize', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowUnmaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-unmaximize', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowFocus: Event<number> = Event.any(
		Event.map(Event.filter(Event.map(this.windowsMainService.onWindowsCountChanged, () => this.windowsMainService.getLastActiveWindow()), w => !!w), w => w!.id),
		Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (_, w: Electron.BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id))
	);

	readonly onRecentlyOpenedChange: Event<void> = this.historyService.onRecentlyOpenedChange;

	constructor(
		private sharedProcess: ISharedProcess,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IURLService urlService: IURLService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
		@IHistoryMainService private readonly historyService: IHistoryMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		urlService.registerHandler(this);

		// remember last active window id
		Event.latch(Event.any(this.onWindowOpen, this.onWindowFocus))
			(id => this._activeWindowId = id, null, this.disposables);
	}

	async pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		this.logService.trace('windowsService#pickFileFolderAndOpen');

		this.windowsMainService.pickFileFolderAndOpen(options);
	}

	async pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		this.logService.trace('windowsService#pickFileAndOpen');

		this.windowsMainService.pickFileAndOpen(options);
	}

	async pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		this.logService.trace('windowsService#pickFolderAndOpen');

		this.windowsMainService.pickFolderAndOpen(options);
	}

	async pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void> {
		this.logService.trace('windowsService#pickWorkspaceAndOpen');

		this.windowsMainService.pickWorkspaceAndOpen(options);
	}

	async showMessageBox(windowId: number, options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		this.logService.trace('windowsService#showMessageBox', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.showMessageBox(options, codeWindow), () => this.windowsMainService.showMessageBox(options))!;
	}

	async showSaveDialog(windowId: number, options: Electron.SaveDialogOptions): Promise<string> {
		this.logService.trace('windowsService#showSaveDialog', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.showSaveDialog(options, codeWindow), () => this.windowsMainService.showSaveDialog(options))!;
	}

	async showOpenDialog(windowId: number, options: Electron.OpenDialogOptions): Promise<string[]> {
		this.logService.trace('windowsService#showOpenDialog', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.showOpenDialog(options, codeWindow), () => this.windowsMainService.showOpenDialog(options))!;
	}

	async reloadWindow(windowId: number, args: ParsedArgs): Promise<void> {
		this.logService.trace('windowsService#reloadWindow', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.reload(codeWindow, args));
	}

	async openDevTools(windowId: number, options?: IDevToolsOptions): Promise<void> {
		this.logService.trace('windowsService#openDevTools', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.webContents.openDevTools(options));
	}

	async toggleDevTools(windowId: number): Promise<void> {
		this.logService.trace('windowsService#toggleDevTools', windowId);

		return this.withWindow(windowId, codeWindow => {
			const contents = codeWindow.win.webContents;
			if (isMacintosh && codeWindow.hasHiddenTitleBarStyle() && !codeWindow.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		});
	}

	async updateTouchBar(windowId: number, items: ISerializableCommandAction[][]): Promise<void> {
		this.logService.trace('windowsService#updateTouchBar', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.updateTouchBar(items));
	}

	async closeWorkspace(windowId: number): Promise<void> {
		this.logService.trace('windowsService#closeWorkspace', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.closeWorkspace(codeWindow));
	}

	async enterWorkspace(windowId: number, path: URI): Promise<IEnterWorkspaceResult | undefined> {
		this.logService.trace('windowsService#enterWorkspace', windowId);

		return this.withWindow(windowId, codeWindow => this.windowsMainService.enterWorkspace(codeWindow, path));
	}

	async toggleFullScreen(windowId: number): Promise<void> {
		this.logService.trace('windowsService#toggleFullScreen', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.toggleFullScreen());
	}

	async setRepresentedFilename(windowId: number, fileName: string): Promise<void> {
		this.logService.trace('windowsService#setRepresentedFilename', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.setRepresentedFilename(fileName));
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		this.logService.trace('windowsService#addRecentlyOpened');
		this.historyService.addRecentlyOpened(recents);
	}

	async removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		this.logService.trace('windowsService#removeFromRecentlyOpened');

		this.historyService.removeFromRecentlyOpened(paths);
	}

	async clearRecentlyOpened(): Promise<void> {
		this.logService.trace('windowsService#clearRecentlyOpened');

		this.historyService.clearRecentlyOpened();
	}

	async getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		this.logService.trace('windowsService#getRecentlyOpened', windowId);

		return this.withWindow(windowId, codeWindow => this.historyService.getRecentlyOpened(codeWindow.config.workspace, codeWindow.config.folderUri, codeWindow.config.filesToOpenOrCreate), () => this.historyService.getRecentlyOpened())!;
	}

	async newWindowTab(): Promise<void> {
		this.logService.trace('windowsService#newWindowTab');

		this.windowsMainService.openNewTabbedWindow(OpenContext.API);
	}

	async showPreviousWindowTab(): Promise<void> {
		this.logService.trace('windowsService#showPreviousWindowTab');

		Menu.sendActionToFirstResponder('selectPreviousTab:');
	}

	async showNextWindowTab(): Promise<void> {
		this.logService.trace('windowsService#showNextWindowTab');

		Menu.sendActionToFirstResponder('selectNextTab:');
	}

	async moveWindowTabToNewWindow(): Promise<void> {
		this.logService.trace('windowsService#moveWindowTabToNewWindow');

		Menu.sendActionToFirstResponder('moveTabToNewWindow:');
	}

	async mergeAllWindowTabs(): Promise<void> {
		this.logService.trace('windowsService#mergeAllWindowTabs');

		Menu.sendActionToFirstResponder('mergeAllWindows:');
	}

	async toggleWindowTabsBar(): Promise<void> {
		this.logService.trace('windowsService#toggleWindowTabsBar');

		Menu.sendActionToFirstResponder('toggleTabBar:');
	}

	async focusWindow(windowId: number): Promise<void> {
		this.logService.trace('windowsService#focusWindow', windowId);

		if (isMacintosh) {
			return this.withWindow(windowId, codeWindow => codeWindow.win.show());
		} else {
			return this.withWindow(windowId, codeWindow => codeWindow.win.focus());
		}
	}

	async closeWindow(windowId: number): Promise<void> {
		this.logService.trace('windowsService#closeWindow', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.close());
	}

	async isFocused(windowId: number): Promise<boolean> {
		this.logService.trace('windowsService#isFocused', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.isFocused(), () => false)!;
	}

	async isMaximized(windowId: number): Promise<boolean> {
		this.logService.trace('windowsService#isMaximized', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.isMaximized(), () => false)!;
	}

	async maximizeWindow(windowId: number): Promise<void> {
		this.logService.trace('windowsService#maximizeWindow', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.maximize());
	}

	async unmaximizeWindow(windowId: number): Promise<void> {
		this.logService.trace('windowsService#unmaximizeWindow', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.unmaximize());
	}

	async minimizeWindow(windowId: number): Promise<void> {
		this.logService.trace('windowsService#minimizeWindow', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.minimize());
	}

	async onWindowTitleDoubleClick(windowId: number): Promise<void> {
		this.logService.trace('windowsService#onWindowTitleDoubleClick', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.onWindowTitleDoubleClick());
	}

	async setDocumentEdited(windowId: number, flag: boolean): Promise<void> {
		this.logService.trace('windowsService#setDocumentEdited', windowId);

		return this.withWindow(windowId, codeWindow => {
			if (codeWindow.win.isDocumentEdited() !== flag) {
				codeWindow.win.setDocumentEdited(flag);
			}
		});
	}

	async openWindow(windowId: number, urisToOpen: IURIToOpen[], options: IOpenSettings): Promise<void> {
		this.logService.trace('windowsService#openWindow');
		if (!urisToOpen || !urisToOpen.length) {
			return undefined;
		}

		this.windowsMainService.open({
			context: OpenContext.API,
			contextWindowId: windowId,
			urisToOpen: urisToOpen,
			cli: options.args ? { ...this.environmentService.args, ...options.args } : this.environmentService.args,
			forceNewWindow: options.forceNewWindow,
			forceReuseWindow: options.forceReuseWindow,
			diffMode: options.diffMode,
			addMode: options.addMode,
			gotoLineMode: options.gotoLineMode,
			noRecentEntry: options.noRecentEntry,
			waitMarkerFileURI: options.waitMarkerFileURI
		});
	}

	async openNewWindow(options?: INewWindowOptions): Promise<void> {
		this.logService.trace('windowsService#openNewWindow ' + JSON.stringify(options));

		this.windowsMainService.openNewWindow(OpenContext.API, options);
	}

	async openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		this.logService.trace('windowsService#openExtensionDevelopmentHostWindow ' + JSON.stringify(args));

		if (args.extensionDevelopmentPath) {
			this.windowsMainService.openExtensionDevelopmentHostWindow(args.extensionDevelopmentPath, {
				context: OpenContext.API,
				cli: args,
				userEnv: Object.keys(env).length > 0 ? env : undefined
			});
		}
	}

	async getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		this.logService.trace('windowsService#getWindows');

		const windows = this.windowsMainService.getWindows();
		const result = windows.map(w => ({ id: w.id, workspace: w.openedWorkspace, folderUri: w.openedFolderUri, title: w.win.getTitle(), filename: w.getRepresentedFilename() }));

		return result;
	}

	async getWindowCount(): Promise<number> {
		this.logService.trace('windowsService#getWindowCount');

		return this.windowsMainService.getWindows().length;
	}

	async log(severity: string, args: string[]): Promise<void> {
		let consoleFn = console.log;

		switch (severity) {
			case 'error':
				consoleFn = console.error;
				break;
			case 'warn':
				consoleFn = console.warn;
				break;
			case 'info':
				consoleFn = console.info;
				break;
		}

		consoleFn.call(console, ...args);
	}

	async showItemInFolder(resource: URI): Promise<void> {
		this.logService.trace('windowsService#showItemInFolder');

		if (resource.scheme === Schemas.file) {
			shell.showItemInFolder(resource.fsPath);
		}
	}

	async getActiveWindowId(): Promise<number | undefined> {
		return this._activeWindowId;
	}

	async openExternal(url: string): Promise<boolean> {
		this.logService.trace('windowsService#openExternal');

		shell.openExternal(url);
		return true;
	}

	async startCrashReporter(config: Electron.CrashReporterStartOptions): Promise<void> {
		this.logService.trace('windowsService#startCrashReporter');

		crashReporter.start(config);
	}

	async quit(): Promise<void> {
		this.logService.trace('windowsService#quit');

		this.windowsMainService.quit();
	}

	async relaunch(options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		this.logService.trace('windowsService#relaunch');

		this.lifecycleService.relaunch(options);
	}

	async whenSharedProcessReady(): Promise<void> {
		this.logService.trace('windowsService#whenSharedProcessReady');

		return this.sharedProcess.whenReady();
	}

	async toggleSharedProcess(): Promise<void> {
		this.logService.trace('windowsService#toggleSharedProcess');

		this.sharedProcess.toggle();

	}

	async openAboutDialog(): Promise<void> {
		this.logService.trace('windowsService#openAboutDialog');

		let version = app.getVersion();
		if (product.target) {
			version = `${version} (${product.target} setup)`;
		}

		const isSnap = process.platform === 'linux' && process.env.SNAP && process.env.SNAP_REVISION;
		const detail = nls.localize('aboutDetail',
			"Version: {0}\nCommit: {1}\nDate: {2}\nElectron: {3}\nChrome: {4}\nNode.js: {5}\nV8: {6}\nOS: {7}",
			version,
			product.commit || 'Unknown',
			product.date || 'Unknown',
			process.versions['electron'],
			process.versions['chrome'],
			process.versions['node'],
			process.versions['v8'],
			`${os.type()} ${os.arch()} ${os.release()}${isSnap ? ' snap' : ''}`
		);

		const ok = nls.localize('okButton', "OK");
		const copy = mnemonicButtonLabel(nls.localize({ key: 'copy', comment: ['&& denotes a mnemonic'] }, "&&Copy"));
		let buttons: string[];
		if (isLinux) {
			buttons = [copy, ok];
		} else {
			buttons = [ok, copy];
		}

		const result = await this.windowsMainService.showMessageBox({
			title: product.nameLong,
			type: 'info',
			message: product.nameLong,
			detail: `\n${detail}`,
			buttons,
			noLink: true,
			defaultId: buttons.indexOf(ok),
			cancelId: buttons.indexOf(ok)
		}, this.windowsMainService.getFocusedWindow() || this.windowsMainService.getLastActiveWindow());

		if (buttons[result.button] === copy) {
			clipboard.writeText(detail);
		}
	}

	async handleURL(uri: URI): Promise<boolean> {

		// Catch file URLs
		if (uri.authority === Schemas.file && !!uri.path) {
			this.openFileForURI({ fileUri: URI.file(uri.fsPath) }); // using fsPath on a non-file URI...
			return true;
		}

		return false;
	}

	private openFileForURI(uri: IURIToOpen): void {
		const cli = assign(Object.create(null), this.environmentService.args);
		const urisToOpen = [uri];

		this.windowsMainService.open({ context: OpenContext.API, cli, urisToOpen, gotoLineMode: true });
	}

	async resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return new Promise(resolve => {
			const codeWindow = this.windowsMainService.getWindowById(windowId);
			if (codeWindow) {
				codeWindow.win.webContents.session.resolveProxy(url, proxy => {
					resolve(proxy);
				});
			} else {
				resolve();
			}
		});
	}

	private withWindow<T>(windowId: number, fn: (window: ICodeWindow) => T, fallback?: () => T): T | undefined {
		const codeWindow = this.windowsMainService.getWindowById(windowId);
		if (codeWindow) {
			return fn(codeWindow);
		}

		if (fallback) {
			return fallback();
		}

		return undefined;
	}
}
