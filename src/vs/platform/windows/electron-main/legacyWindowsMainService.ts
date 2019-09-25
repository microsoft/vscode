/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { URI } from 'vs/base/common/uri';
import { IWindowsService, OpenContext } from 'vs/platform/windows/common/windows';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { app, BrowserWindow } from 'electron';
import { Event } from 'vs/base/common/event';
import { IURLService, IURLHandler } from 'vs/platform/url/common/url';
import { IWindowsMainService, ICodeWindow } from 'vs/platform/windows/electron-main/windows';
import { IRecentlyOpened, IRecent } from 'vs/platform/history/common/history';
import { IHistoryMainService } from 'vs/platform/history/electron-main/historyMainService';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { Schemas } from 'vs/base/common/network';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ILogService } from 'vs/platform/log/common/log';

// @deprecated this should eventually go away and be implemented by host & electron service
export class LegacyWindowsMainService extends Disposable implements IWindowsService, IURLHandler {

	_serviceBrand: undefined;

	private readonly disposables = this._register(new DisposableStore());

	private _activeWindowId: number | undefined;

	readonly onWindowOpen: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-created', (_, w: BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowBlur: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-blur', (_, w: BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowMaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-maximize', (_, w: BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowUnmaximize: Event<number> = Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-unmaximize', (_, w: BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id));
	readonly onWindowFocus: Event<number> = Event.any(
		Event.map(Event.filter(Event.map(this.windowsMainService.onWindowsCountChanged, () => this.windowsMainService.getLastActiveWindow()), w => !!w), w => w!.id),
		Event.filter(Event.fromNodeEventEmitter(app, 'browser-window-focus', (_, w: BrowserWindow) => w.id), id => !!this.windowsMainService.getWindowById(id))
	);

	readonly onRecentlyOpenedChange: Event<void> = this.historyMainService.onRecentlyOpenedChange;

	constructor(
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IURLService urlService: IURLService,
		@IHistoryMainService private readonly historyMainService: IHistoryMainService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		urlService.registerHandler(this);

		// remember last active window id
		Event.latch(Event.any(this.onWindowOpen, this.onWindowFocus))
			(id => this._activeWindowId = id, null, this.disposables);
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		this.logService.trace('windowsService#addRecentlyOpened');
		this.historyMainService.addRecentlyOpened(recents);
	}

	async removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		this.logService.trace('windowsService#removeFromRecentlyOpened');

		this.historyMainService.removeFromRecentlyOpened(paths);
	}

	async clearRecentlyOpened(): Promise<void> {
		this.logService.trace('windowsService#clearRecentlyOpened');

		this.historyMainService.clearRecentlyOpened();
	}

	async getRecentlyOpened(windowId: number): Promise<IRecentlyOpened> {
		this.logService.trace('windowsService#getRecentlyOpened', windowId);

		return this.withWindow(windowId, codeWindow => this.historyMainService.getRecentlyOpened(codeWindow.config.workspace, codeWindow.config.folderUri, codeWindow.config.filesToOpenOrCreate), () => this.historyMainService.getRecentlyOpened())!;
	}

	async isFocused(windowId: number): Promise<boolean> {
		this.logService.trace('windowsService#isFocused', windowId);

		return this.withWindow(windowId, codeWindow => codeWindow.win.isFocused(), () => false)!;
	}

	async openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		this.logService.trace('windowsService#openExtensionDevelopmentHostWindow ' + JSON.stringify(args));

		const extDevPaths = args.extensionDevelopmentPath;
		if (extDevPaths) {
			this.windowsMainService.openExtensionDevelopmentHostWindow(extDevPaths, {
				context: OpenContext.API,
				cli: args,
				userEnv: Object.keys(env).length > 0 ? env : undefined
			});
		}
	}

	async getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		this.logService.trace('windowsService#getWindows');

		const windows = this.windowsMainService.getWindows();

		return windows.map(window => ({
			id: window.id,
			workspace: window.openedWorkspace,
			folderUri: window.openedFolderUri,
			title: window.win.getTitle(),
			filename: window.getRepresentedFilename()
		}));
	}

	async getActiveWindowId(): Promise<number | undefined> {
		return this._activeWindowId;
	}

	async handleURL(uri: URI): Promise<boolean> {

		// Catch file URLs
		if (uri.authority === Schemas.file && !!uri.path) {
			this.openFileForURI(URI.file(uri.fsPath)); // using fsPath on a non-file URI...
			return true;
		}

		return false;
	}

	private openFileForURI(uri: URI): void {
		const cli = assign(Object.create(null), this.environmentService.args);
		const urisToOpen = [{ fileUri: uri }];

		this.windowsMainService.open({ context: OpenContext.API, cli, urisToOpen, gotoLineMode: true });
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
