/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as browser from 'vs/base/browser/browser';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { Event } from 'vs/base/common/event';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionTipsService, ExtensionRecommendationReason, IExtensionRecommendation } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IURLHandler, IURLService } from 'vs/platform/url/common/url';
import { ConsoleLogService, ILogService } from 'vs/platform/log/common/log';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUpdateService, State } from 'vs/platform/update/common/update';
import { IWindowService, INativeOpenDialogOptions, IEnterWorkspaceResult, IURIToOpen, IMessageBoxResult, IWindowsService, IOpenSettings, IWindowSettings } from 'vs/platform/windows/common/windows';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspaceFolderCreationData, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { IRecentlyOpened, IRecent, isRecentFile, isRecentFolder } from 'vs/platform/history/common/history';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import { IWorkspaceEditingService } from 'vs/workbench/services/workspace/common/workspaceEditing';
import { ITunnelService } from 'vs/platform/remote/common/tunnel';
// tslint:disable-next-line: import-patterns
import { IWorkspaceContextService, WorkbenchState, IWorkspace } from 'vs/platform/workspace/common/workspace';
import { addDisposableListener, EventType, windowOpenNoOpener } from 'vs/base/browser/dom';
import { IEditorService, IResourceEditor } from 'vs/workbench/services/editor/common/editorService';
import { pathsToEditors } from 'vs/workbench/common/editor';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { toStoreData, restoreRecentlyOpened } from 'vs/platform/history/common/historyStorage';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IProductService } from 'vs/platform/product/common/product';
import Severity from 'vs/base/common/severity';
import { localize } from 'vs/nls';
import { IClipboardService } from 'vs/platform/clipboard/common/clipboardService';
// tslint:disable-next-line: import-patterns
import { IWorkspaceStatsService, Tags } from 'vs/workbench/contrib/stats/common/workspaceStats';

//#region Extension Tips

export class SimpleExtensionTipsService implements IExtensionTipsService {
	_serviceBrand: any;

	onRecommendationChange = Event.None;

	getAllRecommendationsWithReason(): { [id: string]: { reasonId: ExtensionRecommendationReason; reasonText: string; }; } {
		return Object.create(null);
	}

	getFileBasedRecommendations(): IExtensionRecommendation[] {
		return [];
	}

	getOtherRecommendations(): Promise<IExtensionRecommendation[]> {
		return Promise.resolve([]);
	}

	getWorkspaceRecommendations(): Promise<IExtensionRecommendation[]> {
		return Promise.resolve([]);
	}

	getKeymapRecommendations(): IExtensionRecommendation[] {
		return [];
	}

	toggleIgnoredRecommendation(extensionId: string, shouldIgnore: boolean): void {
	}

	getAllIgnoredRecommendations(): { global: string[]; workspace: string[]; } {
		return { global: [], workspace: [] };
	}
}

registerSingleton(IExtensionTipsService, SimpleExtensionTipsService, true);

//#endregion

//#region Extension URL Handler

export const IExtensionUrlHandler = createDecorator<IExtensionUrlHandler>('inactiveExtensionUrlHandler');

export interface IExtensionUrlHandler {
	readonly _serviceBrand: any;
	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void;
	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void;
}

export class SimpleExtensionURLHandler implements IExtensionUrlHandler {

	_serviceBrand: any;

	registerExtensionHandler(extensionId: ExtensionIdentifier, handler: IURLHandler): void { }

	unregisterExtensionHandler(extensionId: ExtensionIdentifier): void { }
}

registerSingleton(IExtensionUrlHandler, SimpleExtensionURLHandler, true);

//#endregion

//#region Log

export class SimpleLogService extends ConsoleLogService { }

//#endregion

//#region Update

export class SimpleUpdateService implements IUpdateService {

	_serviceBrand: any;

	onStateChange = Event.None;
	state: State;

	checkForUpdates(context: any): Promise<void> {
		return Promise.resolve(undefined);
	}

	downloadUpdate(): Promise<void> {
		return Promise.resolve(undefined);
	}

	applyUpdate(): Promise<void> {
		return Promise.resolve(undefined);
	}

	quitAndInstall(): Promise<void> {
		return Promise.resolve(undefined);
	}

	isLatestVersion(): Promise<boolean> {
		return Promise.resolve(true);
	}
}

registerSingleton(IUpdateService, SimpleUpdateService);

//#endregion

//#region URL

export class SimpleURLService implements IURLService {
	_serviceBrand: any;

	open(url: URI): Promise<boolean> {
		return Promise.resolve(false);
	}

	registerHandler(handler: IURLHandler): IDisposable {
		return Disposable.None;
	}
}

registerSingleton(IURLService, SimpleURLService);

//#endregion

//#region Window

export class SimpleWindowService extends Disposable implements IWindowService {

	_serviceBrand: any;

	readonly onDidChangeFocus: Event<boolean> = Event.None;
	readonly onDidChangeMaximize: Event<boolean> = Event.None;

	readonly hasFocus = true;

	readonly windowId = 0;

	static readonly RECENTLY_OPENED_KEY = 'recently.opened';

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@ILogService private readonly logService: ILogService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService
	) {
		super();

		this.addWorkspaceToRecentlyOpened();
		this.registerListeners();
	}

	private addWorkspaceToRecentlyOpened(): void {
		const workspace = this.workspaceService.getWorkspace();
		switch (this.workspaceService.getWorkbenchState()) {
			case WorkbenchState.FOLDER:
				this.addRecentlyOpened([{ folderUri: workspace.folders[0].uri }]);
				break;
			case WorkbenchState.WORKSPACE:
				this.addRecentlyOpened([{ workspace: { id: workspace.id, configPath: workspace.configuration! } }]);
				break;
		}
	}

	private registerListeners(): void {
		this._register(addDisposableListener(document, EventType.FULLSCREEN_CHANGE, () => {
			if (document.fullscreenElement || (<any>document).webkitFullscreenElement) {
				browser.setFullscreen(true);
			} else {
				browser.setFullscreen(false);
			}
		}));

		this._register(addDisposableListener(document, EventType.WK_FULLSCREEN_CHANGE, () => {
			if (document.fullscreenElement || (<any>document).webkitFullscreenElement || (<any>document).webkitIsFullScreen) {
				browser.setFullscreen(true);
			} else {
				browser.setFullscreen(false);
			}
		}));
	}

	isFocused(): Promise<boolean> {
		return Promise.resolve(this.hasFocus);
	}

	isMaximized(): Promise<boolean> {
		return Promise.resolve(false);
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(): Promise<void> {
		window.location.reload();

		return Promise.resolve();
	}

	openDevTools(): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(target?: HTMLElement): Promise<void> {
		if (!target) {
			return Promise.resolve();
		}

		// Chromium
		if ((<any>document).fullscreen !== undefined) {
			if (!(<any>document).fullscreen) {

				return (<any>target).requestFullscreen().catch(() => {
					// if it fails, chromium throws an exception with error undefined.
					// re https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen
					console.warn('Toggle Full Screen failed');
				});
			} else {
				return document.exitFullscreen().catch(() => {
					console.warn('Exit Full Screen failed');
				});
			}
		}

		// Safari and Edge 14 are all using webkit prefix
		if ((<any>document).webkitIsFullScreen !== undefined) {
			try {
				if (!(<any>document).webkitIsFullScreen) {
					(<any>target).webkitRequestFullscreen(); // it's async, but doesn't return a real promise.
				} else {
					(<any>document).webkitExitFullscreen(); // it's async, but doesn't return a real promise.
				}
			} catch {
				console.warn('Enter/Exit Full Screen failed');
			}
		}

		return Promise.resolve();
	}

	setRepresentedFilename(_fileName: string): Promise<void> {
		return Promise.resolve();
	}

	async getRecentlyOpened(): Promise<IRecentlyOpened> {
		const recentlyOpenedRaw = this.storageService.get(SimpleWindowService.RECENTLY_OPENED_KEY, StorageScope.GLOBAL);
		if (recentlyOpenedRaw) {
			return restoreRecentlyOpened(JSON.parse(recentlyOpenedRaw), this.logService);
		}

		return { workspaces: [], files: [] };
	}

	async addRecentlyOpened(recents: IRecent[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		recents.forEach(recent => {
			if (isRecentFile(recent)) {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.fileUri]);
				recentlyOpened.files.unshift(recent);
			} else if (isRecentFolder(recent)) {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.folderUri]);
				recentlyOpened.workspaces.unshift(recent);
			} else {
				this.doRemoveFromRecentlyOpened(recentlyOpened, [recent.workspace.configPath]);
				recentlyOpened.workspaces.unshift(recent);
			}
		});

		return this.saveRecentlyOpened(recentlyOpened);
	}

	async removeFromRecentlyOpened(paths: URI[]): Promise<void> {
		const recentlyOpened = await this.getRecentlyOpened();

		this.doRemoveFromRecentlyOpened(recentlyOpened, paths);

		return this.saveRecentlyOpened(recentlyOpened);
	}

	private doRemoveFromRecentlyOpened(recentlyOpened: IRecentlyOpened, paths: URI[]): void {
		recentlyOpened.files = recentlyOpened.files.filter(file => {
			return !paths.some(path => path.toString() === file.fileUri.toString());
		});

		recentlyOpened.workspaces = recentlyOpened.workspaces.filter(workspace => {
			return !paths.some(path => path.toString() === (isRecentFolder(workspace) ? workspace.folderUri.toString() : workspace.workspace.configPath.toString()));
		});
	}

	private async saveRecentlyOpened(data: IRecentlyOpened): Promise<void> {
		return this.storageService.store(SimpleWindowService.RECENTLY_OPENED_KEY, JSON.stringify(toStoreData(data)), StorageScope.GLOBAL);
	}

	focusWindow(): Promise<void> {
		return Promise.resolve();
	}

	maximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(): Promise<void> {
		return Promise.resolve();
	}

	async openWindow(_uris: IURIToOpen[], _options?: IOpenSettings): Promise<void> {
		const { openFolderInNewWindow } = this.shouldOpenNewWindow(_options);
		for (let i = 0; i < _uris.length; i++) {
			const uri = _uris[i];
			if ('folderUri' in uri) {
				const newAddress = `${document.location.origin}/?folder=${uri.folderUri.path}${this.workbenchEnvironmentService.configuration.connectionToken ? `&tkn=${this.workbenchEnvironmentService.configuration.connectionToken}` : ''}`;
				if (openFolderInNewWindow) {
					window.open(newAddress);
				} else {
					window.location.href = newAddress;
				}
			}
			if ('workspaceUri' in uri) {
				const newAddress = `${document.location.origin}/?workspace=${uri.workspaceUri.path}`;
				if (openFolderInNewWindow) {
					window.open(newAddress);
				} else {
					window.location.href = newAddress;
				}
			}
			if ('fileUri' in uri) {
				const inputs: IResourceEditor[] = await pathsToEditors([uri], this.fileService);
				this.editorService.openEditors(inputs);
			}
		}
		return Promise.resolve();
	}

	private shouldOpenNewWindow(_options: IOpenSettings = {}): { openFolderInNewWindow: boolean } {
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
		const openFolderInNewWindowConfig = (windowConfig && windowConfig.openFoldersInNewWindow) || 'default' /* default */;
		let openFolderInNewWindow = !!_options.forceNewWindow && !_options.forceReuseWindow;
		if (!_options.forceNewWindow && !_options.forceReuseWindow && (openFolderInNewWindowConfig === 'on' || openFolderInNewWindowConfig === 'off')) {
			openFolderInNewWindow = (openFolderInNewWindowConfig === 'on');
		}
		return { openFolderInNewWindow };
	}

	closeWindow(): Promise<void> {
		window.close();

		return Promise.resolve();
	}

	setDocumentEdited(_flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		return Promise.resolve({ button: 0 });
	}

	showSaveDialog(_options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	updateTouchBar(_items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	resolveProxy(url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWindowService, SimpleWindowService);

//#endregion

//#region Window

export class SimpleWindowsService implements IWindowsService {
	_serviceBrand: any;

	windowCount = 1;

	readonly onWindowOpen: Event<number> = Event.None;
	readonly onWindowFocus: Event<number> = Event.None;
	readonly onWindowBlur: Event<number> = Event.None;
	readonly onWindowMaximize: Event<number> = Event.None;
	readonly onWindowUnmaximize: Event<number> = Event.None;
	readonly onRecentlyOpenedChange: Event<void> = Event.None;

	constructor(
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IDialogService private readonly dialogService: IDialogService,
		@IProductService private readonly productService: IProductService,
		@IClipboardService private readonly clipboardService: IClipboardService
	) {
	}
	isFocused(_windowId: number): Promise<boolean> {
		return Promise.resolve(true);
	}

	pickFileFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFileAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickFolderAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	pickWorkspaceAndOpen(_options: INativeOpenDialogOptions): Promise<void> {
		return Promise.resolve();
	}

	reloadWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	openDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	toggleDevTools(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWorkspace(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	enterWorkspace(_windowId: number, _path: URI): Promise<IEnterWorkspaceResult | undefined> {
		return Promise.resolve(undefined);
	}

	toggleFullScreen(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setRepresentedFilename(_windowId: number, _fileName: string): Promise<void> {
		return Promise.resolve();
	}

	addRecentlyOpened(recents: IRecent[]): Promise<void> {
		return Promise.resolve();
	}

	removeFromRecentlyOpened(_paths: URI[]): Promise<void> {
		return Promise.resolve();
	}

	clearRecentlyOpened(): Promise<void> {
		return Promise.resolve();
	}

	getRecentlyOpened(_windowId: number): Promise<IRecentlyOpened> {
		return Promise.resolve({
			workspaces: [],
			files: []
		});
	}

	focusWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	closeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	isMaximized(_windowId: number): Promise<boolean> {
		return Promise.resolve(false);
	}

	maximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	minimizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	unmaximizeWindow(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	onWindowTitleDoubleClick(_windowId: number): Promise<void> {
		return Promise.resolve();
	}

	setDocumentEdited(_windowId: number, _flag: boolean): Promise<void> {
		return Promise.resolve();
	}

	quit(): Promise<void> {
		return Promise.resolve();
	}

	relaunch(_options: { addArgs?: string[], removeArgs?: string[] }): Promise<void> {
		window.location.reload();

		return Promise.resolve();
	}

	whenSharedProcessReady(): Promise<void> {
		return Promise.resolve();
	}

	toggleSharedProcess(): Promise<void> {
		return Promise.resolve();
	}

	// Global methods
	openWindow(_windowId: number, _uris: IURIToOpen[], _options: IOpenSettings): Promise<void> {
		return Promise.resolve();
	}

	openNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {

		// we pass the "ParsedArgs" as query parameters of the URL

		let newAddress = `${document.location.origin}/?`;
		let gotFolder = false;

		const addQueryParameter = (key: string, value: string) => {
			const lastChar = newAddress.charAt(newAddress.length - 1);
			if (lastChar !== '?' && lastChar !== '&') {
				newAddress += '&';
			}
			newAddress += `${key}=${encodeURIComponent(value)}`;
		};

		const f = args['folder-uri'];
		if (f) {
			let u: URI | undefined;
			if (Array.isArray(f)) {
				if (f.length > 0) {
					u = URI.parse(f[0]);
				}
			} else {
				u = URI.parse(f);
			}
			if (u) {
				gotFolder = true;
				addQueryParameter('folder', u.path);
			}
		}
		if (!gotFolder) {
			// request empty window
			addQueryParameter('ew', 'true');
		}

		const ep = args['extensionDevelopmentPath'];
		if (ep) {
			let u: string | undefined;
			if (Array.isArray(ep)) {
				if (ep.length > 0) {
					u = ep[0];
				}
			} else {
				u = ep;
			}
			if (u) {
				addQueryParameter('edp', u);
			}
		}

		const di = args['debugId'];
		if (di) {
			addQueryParameter('di', di);
		}

		const ibe = args['inspect-brk-extensions'];
		if (ibe) {
			addQueryParameter('ibe', ibe);
		}

		// add connection token
		if (this.workbenchEnvironmentService.configuration.connectionToken) {
			addQueryParameter('tkn', this.workbenchEnvironmentService.configuration.connectionToken);
		}

		window.open(newAddress);

		return Promise.resolve();
	}

	getWindows(): Promise<{ id: number; workspace?: IWorkspaceIdentifier; folderUri?: ISingleFolderWorkspaceIdentifier; title: string; filename?: string; }[]> {
		return Promise.resolve([]);
	}

	getWindowCount(): Promise<number> {
		return Promise.resolve(this.windowCount);
	}

	log(_severity: string, _args: string[]): Promise<void> {
		return Promise.resolve();
	}

	showItemInFolder(_path: URI): Promise<void> {
		return Promise.resolve();
	}

	newWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showPreviousWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	showNextWindowTab(): Promise<void> {
		return Promise.resolve();
	}

	moveWindowTabToNewWindow(): Promise<void> {
		return Promise.resolve();
	}

	mergeAllWindowTabs(): Promise<void> {
		return Promise.resolve();
	}

	toggleWindowTabsBar(): Promise<void> {
		return Promise.resolve();
	}

	updateTouchBar(_windowId: number, _items: ISerializableCommandAction[][]): Promise<void> {
		return Promise.resolve();
	}

	getActiveWindowId(): Promise<number | undefined> {
		return Promise.resolve(undefined);
	}

	// This needs to be handled from browser process to prevent
	// foreground ordering issues on Windows
	openExternal(_url: string): Promise<boolean> {
		windowOpenNoOpener(_url);

		return Promise.resolve(true);
	}

	// TODO: this is a bit backwards
	startCrashReporter(_config: Electron.CrashReporterStartOptions): Promise<void> {
		return Promise.resolve();
	}

	showMessageBox(_windowId: number, _options: Electron.MessageBoxOptions): Promise<IMessageBoxResult> {
		throw new Error('not implemented');
	}

	showSaveDialog(_windowId: number, _options: Electron.SaveDialogOptions): Promise<string> {
		throw new Error('not implemented');
	}

	showOpenDialog(_windowId: number, _options: Electron.OpenDialogOptions): Promise<string[]> {
		throw new Error('not implemented');
	}

	async openAboutDialog(): Promise<void> {
		const detail = localize('aboutDetail',
			"Version: {0}\nCommit: {1}\nDate: {2}\nBrowser: {3}",
			this.productService.version || 'Unknown',
			this.productService.commit || 'Unknown',
			this.productService.date || 'Unknown',
			navigator.userAgent
		);

		const result = await this.dialogService.show(Severity.Info, this.productService.nameLong, [localize('copy', "Copy"), localize('ok', "OK")], { detail });

		if (result === 0) {
			this.clipboardService.writeText(detail);
		}
	}

	resolveProxy(windowId: number, url: string): Promise<string | undefined> {
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWindowsService, SimpleWindowsService);

//#endregion

//#region Workspace Editing

export class SimpleWorkspaceEditingService implements IWorkspaceEditingService {

	_serviceBrand: any;

	addFolders(folders: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	removeFolders(folders: URI[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	updateFolders(index: number, deleteCount?: number, foldersToAdd?: IWorkspaceFolderCreationData[], donotNotifyError?: boolean): Promise<void> {
		return Promise.resolve(undefined);
	}

	enterWorkspace(path: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	createAndEnterWorkspace(folders: IWorkspaceFolderCreationData[], path?: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	saveAndEnterWorkspace(path: URI): Promise<void> {
		return Promise.resolve(undefined);
	}

	copyWorkspaceSettings(toWorkspace: IWorkspaceIdentifier): Promise<void> {
		return Promise.resolve(undefined);
	}

	pickNewWorkspacePath(): Promise<URI> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWorkspaceEditingService, SimpleWorkspaceEditingService, true);

//#endregion

//#region Workspaces

export class SimpleWorkspacesService implements IWorkspacesService {

	_serviceBrand: any;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}

	deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		return Promise.resolve(undefined);
	}

	getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier> {
		// @ts-ignore
		return Promise.resolve(undefined);
	}
}

registerSingleton(IWorkspacesService, SimpleWorkspacesService);

//#endregion

//#region remote

class SimpleTunnelService implements ITunnelService {
	_serviceBrand: any;
	openTunnel(remotePort: number) {
		return undefined;
	}
}

registerSingleton(ITunnelService, SimpleTunnelService);

//#endregion

//#region workspace stats

class SimpleWorkspaceStatsService implements IWorkspaceStatsService {

	_serviceBrand: any;

	getTags(): Promise<Tags> {
		return Promise.resolve({});
	}

	getTelemetryWorkspaceId(workspace: IWorkspace, state: WorkbenchState): string | undefined {
		return undefined;
	}

	getHashedRemotesFromUri(workspaceUri: URI, stripEndingDotGit?: boolean): Promise<string[]> {
		return Promise.resolve([]);
	}

}

registerSingleton(IWorkspaceStatsService, SimpleWorkspaceStatsService);

//#endregion
