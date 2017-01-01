/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { shell, crashReporter, app } from 'electron';
import Event, { chain } from 'vs/base/common/event';
import { fromEventEmitter } from 'vs/base/node/event';
import { IURLService } from 'vs/platform/url/common/url';

// TODO@Joao: remove this dependency, move all implementation to this class
import { IWindowsMainService } from 'vs/code/electron-main/windows';

export class WindowsService implements IWindowsService, IDisposable {

	_serviceBrand: any;

	private disposables: IDisposable[] = [];

	onWindowOpen: Event<number> = fromEventEmitter(app, 'browser-window-created', (_, w: Electron.BrowserWindow) => w.id);
	onWindowFocus: Event<number> = fromEventEmitter(app, 'browser-window-focus', (_, w: Electron.BrowserWindow) => w.id);

	constructor(
		@IWindowsMainService private windowsMainService: IWindowsMainService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IURLService urlService: IURLService
	) {
		chain(urlService.onOpenURL)
			.filter(uri => uri.authority === 'file' && !!uri.path)
			.map(uri => uri.path)
			.on(this.openFileForURI, this, this.disposables);
	}

	openFileFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		this.windowsMainService.openFileFolderPicker(forceNewWindow);
		return TPromise.as(null);
	}

	openFilePicker(windowId: number, forceNewWindow?: boolean, path?: string): TPromise<void> {
		this.windowsMainService.openFilePicker(forceNewWindow, path);
		return TPromise.as(null);
	}

	openFolderPicker(windowId: number, forceNewWindow?: boolean): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);
		this.windowsMainService.openFolderPicker(forceNewWindow, vscodeWindow);

		return TPromise.as(null);
	}

	reloadWindow(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			this.windowsMainService.reload(vscodeWindow);
		}

		return TPromise.as(null);
	}

	openDevTools(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.webContents.openDevTools();
		}

		return TPromise.as(null);
	}

	toggleDevTools(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			const contents = vscodeWindow.win.webContents;
			if (vscodeWindow.hasHiddenTitleBarStyle() && !vscodeWindow.win.isFullScreen() && !contents.isDevToolsOpened()) {
				contents.openDevTools({ mode: 'undocked' }); // due to https://github.com/electron/electron/issues/3647
			} else {
				contents.toggleDevTools();
			}
		}

		return TPromise.as(null);
	}

	closeFolder(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			this.windowsMainService.open({ cli: this.environmentService.args, forceEmpty: true, windowToUse: vscodeWindow });
		}

		return TPromise.as(null);
	}

	toggleFullScreen(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.toggleFullScreen();
		}

		return TPromise.as(null);
	}

	setRepresentedFilename(windowId: number, fileName: string): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.setRepresentedFilename(fileName);
		}

		return TPromise.as(null);
	}

	addToRecentlyOpen(paths: { path: string, isFile?: boolean }[]): TPromise<void> {
		this.windowsMainService.addToRecentPathsList(paths);

		return TPromise.as(null);
	}

	removeFromRecentlyOpen(paths: string[]): TPromise<void> {
		this.windowsMainService.removeFromRecentPathsList(paths);

		return TPromise.as(null);
	}

	getRecentlyOpen(windowId: number): TPromise<{ files: string[]; folders: string[]; }> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			const { files, folders } = this.windowsMainService.getRecentPathsList(vscodeWindow.config.workspacePath, vscodeWindow.config.filesToOpen);
			return TPromise.as({ files, folders });
		}

		return TPromise.as({ files: [], folders: [] });
	}

	focusWindow(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.focus();
		}

		return TPromise.as(null);
	}

	isMaximized(windowId: number): TPromise<boolean> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			return TPromise.as(vscodeWindow.win.isMaximized());
		}

		return TPromise.as(null);
	}

	maximizeWindow(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.maximize();
		}

		return TPromise.as(null);
	}

	unmaximizeWindow(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.unmaximize();
		}

		return TPromise.as(null);
	}

	setDocumentEdited(windowId: number, flag: boolean): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow && vscodeWindow.win.isDocumentEdited() !== flag) {
			vscodeWindow.win.setDocumentEdited(flag);
		}

		return TPromise.as(null);
	}

	toggleMenuBar(windowId: number): TPromise<void> {
		this.windowsMainService.toggleMenuBar(windowId);
		return TPromise.as(null);
	}

	windowOpen(paths: string[], forceNewWindow?: boolean): TPromise<void> {
		if (!paths || !paths.length) {
			return TPromise.as(null);
		}

		this.windowsMainService.open({ cli: this.environmentService.args, pathsToOpen: paths, forceNewWindow: forceNewWindow });
		return TPromise.as(null);
	}

	openNewWindow(): TPromise<void> {
		this.windowsMainService.openNewWindow();
		return TPromise.as(null);
	}

	showWindow(windowId: number): TPromise<void> {
		const vscodeWindow = this.windowsMainService.getWindowById(windowId);

		if (vscodeWindow) {
			vscodeWindow.win.show();
		}

		return TPromise.as(null);
	}

	getWindows(): TPromise<{ id: number; path: string; title: string; }[]> {
		const windows = this.windowsMainService.getWindows();
		const result = windows.map(w => ({ path: w.openedWorkspacePath, title: w.win.getTitle(), id: w.id }));
		return TPromise.as(result);
	}

	getWindowCount(): TPromise<number> {
		return TPromise.as(this.windowsMainService.getWindows().length);
	}

	log(severity: string, ...messages: string[]): TPromise<void> {
		console[severity].apply(console, ...messages);
		return TPromise.as(null);
	}

	closeExtensionHostWindow(extensionDevelopmentPath: string): TPromise<void> {
		const windowOnExtension = this.windowsMainService.findWindow(null, null, extensionDevelopmentPath);

		if (windowOnExtension) {
			windowOnExtension.win.close();
		}

		return TPromise.as(null);
	}

	showItemInFolder(path: string): TPromise<void> {
		shell.showItemInFolder(path);
		return TPromise.as(null);
	}

	openExternal(url: string): TPromise<void> {
		shell.openExternal(url);
		return TPromise.as(null);
	}

	startCrashReporter(config: Electron.CrashReporterStartOptions): TPromise<void> {
		crashReporter.start(config);
		return TPromise.as(null);
	}

	quit(): TPromise<void> {
		this.windowsMainService.quit();
		return TPromise.as(null);
	}

	private openFileForURI(filePath: string): TPromise<void> {
		const cli = assign(Object.create(null), this.environmentService.args, { goto: true });
		const pathsToOpen = [filePath];

		this.windowsMainService.open({ cli, pathsToOpen });
		return TPromise.as(null);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}