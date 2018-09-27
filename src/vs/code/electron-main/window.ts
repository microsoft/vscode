/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as path from 'path';
import * as objects from 'vs/base/common/objects';
import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { IStateService } from 'vs/platform/state/common/state';
import { screen, BrowserWindow, systemPreferences, app, TouchBar, nativeImage } from 'electron';
import { TPromise, TValueCallback } from 'vs/base/common/winjs.base';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { parseArgs } from 'vs/platform/environment/node/argv';
import product from 'vs/platform/node/product';
import { IWindowSettings, MenuBarVisibility, IWindowConfiguration, ReadyState, IRunActionInWindowRequest } from 'vs/platform/windows/common/windows';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { ICodeWindow, IWindowState, WindowMode } from 'vs/platform/windows/electron-main/windows';
import { IWorkspaceIdentifier, IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import * as perf from 'vs/base/common/performance';
import { resolveMarketplaceHeaders } from 'vs/platform/extensionManagement/node/extensionGalleryService';
import { getBackgroundColor } from 'vs/code/electron-main/theme';

export interface IWindowCreationOptions {
	state: IWindowState;
	extensionDevelopmentPath?: string;
	isExtensionTestHost?: boolean;
}

export const defaultWindowState = function (mode = WindowMode.Normal): IWindowState {
	return {
		width: 1024,
		height: 768,
		mode
	};
};

interface IWorkbenchEditorConfiguration {
	workbench: {
		editor: {
			swipeToNavigate: boolean
		}
	};
}

interface ITouchBarSegment extends Electron.SegmentedControlSegment {
	id: string;
}

export class CodeWindow implements ICodeWindow {

	private static readonly MIN_WIDTH = 200;
	private static readonly MIN_HEIGHT = 120;

	private hiddenTitleBarStyle: boolean;
	private showTimeoutHandle: any;
	private _id: number;
	private _win: Electron.BrowserWindow;
	private _lastFocusTime: number;
	private _readyState: ReadyState;
	private windowState: IWindowState;
	private currentMenuBarVisibility: MenuBarVisibility;
	private toDispose: IDisposable[];
	private representedFilename: string;

	private whenReadyCallbacks: TValueCallback<ICodeWindow>[];

	private currentConfig: IWindowConfiguration;
	private pendingLoadConfig: IWindowConfiguration;

	private marketplaceHeadersPromise: TPromise<object>;

	private touchBarGroups: Electron.TouchBarSegmentedControl[];

	constructor(
		config: IWindowCreationOptions,
		@ILogService private logService: ILogService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStateService private stateService: IStateService,
		@IWorkspacesMainService private workspacesMainService: IWorkspacesMainService,
		@IBackupMainService private backupMainService: IBackupMainService
	) {
		this.touchBarGroups = [];
		this._lastFocusTime = -1;
		this._readyState = ReadyState.NONE;
		this.whenReadyCallbacks = [];
		this.toDispose = [];

		// create browser window
		this.createBrowserWindow(config);

		// respect configured menu bar visibility
		this.onConfigurationUpdated();

		// macOS: touch bar support
		this.createTouchBar();

		// Request handling
		this.handleMarketplaceRequests();

		// Eventing
		this.registerListeners();
	}

	private createBrowserWindow(config: IWindowCreationOptions): void {

		// Load window state
		this.windowState = this.restoreWindowState(config.state);

		// in case we are maximized or fullscreen, only show later after the call to maximize/fullscreen (see below)
		const isFullscreenOrMaximized = (this.windowState.mode === WindowMode.Maximized || this.windowState.mode === WindowMode.Fullscreen);

		const options: Electron.BrowserWindowConstructorOptions = {
			width: this.windowState.width,
			height: this.windowState.height,
			x: this.windowState.x,
			y: this.windowState.y,
			backgroundColor: getBackgroundColor(this.stateService),
			minWidth: CodeWindow.MIN_WIDTH,
			minHeight: CodeWindow.MIN_HEIGHT,
			show: !isFullscreenOrMaximized,
			title: product.nameLong,
			webPreferences: {
				// By default if Code is in the background, intervals and timeouts get throttled, so we
				// want to enforce that Code stays in the foreground. This triggers a disable_hidden_
				// flag that Electron provides via patch:
				// https://github.com/electron/libchromiumcontent/blob/master/patches/common/chromium/disable_hidden.patch
				'backgroundThrottling': false
			}
		};

		if (isLinux) {
			options.icon = path.join(this.environmentService.appRoot, 'resources/linux/code.png'); // Windows and Mac are better off using the embedded icon(s)
		}

		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');

		if (isMacintosh) {
			options.acceptFirstMouse = true; // enabled by default

			if (windowConfig && windowConfig.clickThroughInactive === false) {
				options.acceptFirstMouse = false;
			}
		}

		let useNativeTabs = false;
		if (isMacintosh && windowConfig && windowConfig.nativeTabs === true) {
			options.tabbingIdentifier = product.nameShort; // this opts in to sierra tabs
			useNativeTabs = true;
		}

		let useCustomTitleStyle = false;
		if (isMacintosh) {
			useCustomTitleStyle = !windowConfig || !windowConfig.titleBarStyle || windowConfig.titleBarStyle === 'custom'; // Default to custom on macOS

			const isDev = !this.environmentService.isBuilt || !!config.extensionDevelopmentPath;
			if (isDev) {
				useCustomTitleStyle = false; // not enabled when developing due to https://github.com/electron/electron/issues/3647
			}
		} else {
			if (isLinux) {
				useCustomTitleStyle = windowConfig && windowConfig.titleBarStyle === 'custom';
			} else {
				useCustomTitleStyle = !windowConfig || !windowConfig.titleBarStyle || windowConfig.titleBarStyle === 'custom'; // Default to custom on Windows
			}
		}

		if (useNativeTabs) {
			useCustomTitleStyle = false; // native tabs on sierra do not work with custom title style
		}

		if (useCustomTitleStyle) {
			options.titleBarStyle = 'hidden';
			this.hiddenTitleBarStyle = true;
			if (!isMacintosh) {
				options.frame = false;
			}
		}

		// Create the browser window.
		this._win = new BrowserWindow(options);
		this._id = this._win.id;

		if (useCustomTitleStyle) {
			this._win.setSheetOffset(22); // offset dialogs by the height of the custom title bar if we have any
		}

		if (isFullscreenOrMaximized) {
			this._win.maximize();

			if (this.windowState.mode === WindowMode.Fullscreen) {
				this._win.setFullScreen(true);
			}

			if (!this._win.isVisible()) {
				this._win.show(); // to reduce flicker from the default window size to maximize, we only show after maximize
			}
		}

		this._lastFocusTime = Date.now(); // since we show directly, we need to set the last focus time too
	}

	hasHiddenTitleBarStyle(): boolean {
		return this.hiddenTitleBarStyle;
	}

	get isExtensionDevelopmentHost(): boolean {
		return !!this.config.extensionDevelopmentPath;
	}

	get isExtensionTestHost(): boolean {
		return !!this.config.extensionTestsPath;
	}

	get extensionDevelopmentPath(): string {
		return this.config.extensionDevelopmentPath;
	}

	get config(): IWindowConfiguration {
		return this.currentConfig;
	}

	get id(): number {
		return this._id;
	}

	get win(): Electron.BrowserWindow {
		return this._win;
	}

	setRepresentedFilename(filename: string): void {
		if (isMacintosh) {
			this.win.setRepresentedFilename(filename);
		} else {
			this.representedFilename = filename;
		}
	}

	getRepresentedFilename(): string {
		if (isMacintosh) {
			return this.win.getRepresentedFilename();
		}

		return this.representedFilename;
	}

	focus(): void {
		if (!this._win) {
			return;
		}

		if (this._win.isMinimized()) {
			this._win.restore();
		}

		this._win.focus();
	}

	get lastFocusTime(): number {
		return this._lastFocusTime;
	}

	get backupPath(): string {
		return this.currentConfig ? this.currentConfig.backupPath : void 0;
	}

	get openedWorkspace(): IWorkspaceIdentifier {
		return this.currentConfig ? this.currentConfig.workspace : void 0;
	}

	get openedFolderUri(): URI {
		return this.currentConfig ? this.currentConfig.folderUri : void 0;
	}

	setReady(): void {
		this._readyState = ReadyState.READY;

		// inform all waiting promises that we are ready now
		while (this.whenReadyCallbacks.length) {
			this.whenReadyCallbacks.pop()(this);
		}
	}

	ready(): TPromise<ICodeWindow> {
		return new TPromise<ICodeWindow>((c) => {
			if (this._readyState === ReadyState.READY) {
				return c(this);
			}

			// otherwise keep and call later when we are ready
			this.whenReadyCallbacks.push(c);
		});
	}

	get readyState(): ReadyState {
		return this._readyState;
	}

	private handleMarketplaceRequests(): void {

		// Resolve marketplace headers
		this.marketplaceHeadersPromise = resolveMarketplaceHeaders(this.environmentService);

		// Inject headers when requests are incoming
		const urls = ['https://marketplace.visualstudio.com/*', 'https://*.vsassets.io/*'];
		this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, (details: any, cb: any) => {
			this.marketplaceHeadersPromise.then(headers => {
				cb({ cancel: false, requestHeaders: objects.assign(details.requestHeaders, headers) });
			});
		});
	}

	private registerListeners(): void {

		// Prevent loading of svgs
		this._win.webContents.session.webRequest.onBeforeRequest(null, (details, callback) => {
			if (details.url.indexOf('.svg') > 0) {
				const uri = URI.parse(details.url);
				if (uri && !uri.scheme.match(/file/i) && (uri.path as any).endsWith('.svg')) {
					return callback({ cancel: true });
				}
			}

			return callback({});
		});

		this._win.webContents.session.webRequest.onHeadersReceived(null, (details: any, callback: any) => {
			const contentType: string[] = (details.responseHeaders['content-type'] || details.responseHeaders['Content-Type']) as any;
			if (contentType && Array.isArray(contentType) && contentType.some(x => x.toLowerCase().indexOf('image/svg') >= 0)) {
				return callback({ cancel: true });
			}

			return callback({ cancel: false, responseHeaders: details.responseHeaders });
		});

		// Remember that we loaded
		this._win.webContents.on('did-finish-load', () => {
			this._readyState = ReadyState.LOADING;

			// Associate properties from the load request if provided
			if (this.pendingLoadConfig) {
				this.currentConfig = this.pendingLoadConfig;

				this.pendingLoadConfig = null;
			}

			// To prevent flashing, we set the window visible after the page has finished to load but before Code is loaded
			if (this._win && !this._win.isVisible()) {
				if (this.windowState.mode === WindowMode.Maximized) {
					this._win.maximize();
				}

				if (!this._win.isVisible()) { // maximize also makes visible
					this._win.show();
				}
			}
		});

		// App commands support
		this.registerNavigationListenerOn('app-command', 'browser-backward', 'browser-forward', false);

		// Window Focus
		this._win.on('focus', () => {
			this._lastFocusTime = Date.now();
		});

		// Window (Un)Maximize
		this._win.on('maximize', (e) => {
			if (this.currentConfig) {
				this.currentConfig.maximized = true;
			}

			app.emit('browser-window-maximize', e, this._win);
		});

		this._win.on('unmaximize', (e) => {
			if (this.currentConfig) {
				this.currentConfig.maximized = false;
			}

			app.emit('browser-window-unmaximize', e, this._win);
		});

		// Window Fullscreen
		this._win.on('enter-full-screen', () => {
			this.sendWhenReady('vscode:enterFullScreen');
		});

		this._win.on('leave-full-screen', () => {
			this.sendWhenReady('vscode:leaveFullScreen');
		});

		// Window Failed to load
		this._win.webContents.on('did-fail-load', (event: Electron.Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
			this.logService.warn('[electron event]: fail to load, ', errorDescription);
		});

		// Handle configuration changes
		this.toDispose.push(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated()));

		// Handle Workspace events
		this.toDispose.push(this.workspacesMainService.onUntitledWorkspaceDeleted(e => this.onUntitledWorkspaceDeleted(e)));

		// TODO@Ben workaround for https://github.com/Microsoft/vscode/issues/13612
		// It looks like smooth scrolling disappears as soon as the window is minimized
		// and maximized again. Touching some window properties "fixes" it, like toggling
		// the visibility of the menu.
		if (isWindows) {
			const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
			if (windowConfig && windowConfig.smoothScrollingWorkaround === true) {
				let minimized = false;

				const restoreSmoothScrolling = () => {
					if (minimized) {
						const visibility = this.getMenuBarVisibility();
						const temporaryVisibility: MenuBarVisibility = (visibility === 'hidden' || visibility === 'toggle') ? 'default' : 'hidden';
						setTimeout(() => {
							this.doSetMenuBarVisibility(temporaryVisibility);
							this.doSetMenuBarVisibility(visibility);
						}, 0);
					}

					minimized = false;
				};

				this._win.on('minimize', () => minimized = true);
				this._win.on('restore', () => restoreSmoothScrolling());
				this._win.on('maximize', () => restoreSmoothScrolling());
			}
		}
	}

	private onUntitledWorkspaceDeleted(workspace: IWorkspaceIdentifier): void {

		// Make sure to update our workspace config if we detect that it
		// was deleted
		if (this.openedWorkspace && this.openedWorkspace.id === workspace.id) {
			this.currentConfig.workspace = void 0;
		}
	}

	private onConfigurationUpdated(): void {
		const newMenuBarVisibility = this.getMenuBarVisibility();
		if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
			this.currentMenuBarVisibility = newMenuBarVisibility;
			this.setMenuBarVisibility(newMenuBarVisibility);
		}

		// Swipe command support (macOS)
		if (isMacintosh) {
			const config = this.configurationService.getValue<IWorkbenchEditorConfiguration>();
			if (config && config.workbench && config.workbench.editor && config.workbench.editor.swipeToNavigate) {
				this.registerNavigationListenerOn('swipe', 'left', 'right', true);
			} else {
				this._win.removeAllListeners('swipe');
			}
		}
	}

	private registerNavigationListenerOn(command: 'swipe' | 'app-command', back: 'left' | 'browser-backward', forward: 'right' | 'browser-forward', acrossEditors: boolean) {
		this._win.on(command as 'swipe' /* | 'app-command' */, (e: Electron.Event, cmd: string) => {
			if (this.readyState !== ReadyState.READY) {
				return; // window must be ready
			}

			if (cmd === back) {
				this.send('vscode:runAction', { id: acrossEditors ? 'workbench.action.openPreviousRecentlyUsedEditor' : 'workbench.action.navigateBack', from: 'mouse' } as IRunActionInWindowRequest);
			} else if (cmd === forward) {
				this.send('vscode:runAction', { id: acrossEditors ? 'workbench.action.openNextRecentlyUsedEditor' : 'workbench.action.navigateForward', from: 'mouse' } as IRunActionInWindowRequest);
			}
		});
	}

	addTabbedWindow(window: ICodeWindow): void {
		if (isMacintosh) {
			this._win.addTabbedWindow(window.win);
		}
	}

	load(config: IWindowConfiguration, isReload?: boolean, disableExtensions?: boolean): void {

		// If this is the first time the window is loaded, we associate the paths
		// directly with the window because we assume the loading will just work
		if (this.readyState === ReadyState.NONE) {
			this.currentConfig = config;
		}

		// Otherwise, the window is currently showing a folder and if there is an
		// unload handler preventing the load, we cannot just associate the paths
		// because the loading might be vetoed. Instead we associate it later when
		// the window load event has fired.
		else {
			this.pendingLoadConfig = config;
			this._readyState = ReadyState.NAVIGATING;
		}

		// Add disable-extensions to the config, but do not preserve it on currentConfig or
		// pendingLoadConfig so that it is applied only on this load
		const configuration = objects.assign({}, config);
		if (disableExtensions !== undefined) {
			configuration['disable-extensions'] = disableExtensions;
		}

		// Clear Document Edited if needed
		if (isMacintosh && this._win.isDocumentEdited()) {
			if (!isReload || !this.backupMainService.isHotExitEnabled()) {
				this._win.setDocumentEdited(false);
			}
		}

		// Clear Title and Filename if needed
		if (!isReload) {
			if (this.getRepresentedFilename()) {
				this.setRepresentedFilename('');
			}

			this._win.setTitle(product.nameLong);
		}

		// Load URL
		perf.mark('main:loadWindow');
		this._win.loadURL(this.getUrl(configuration));

		// Make window visible if it did not open in N seconds because this indicates an error
		// Only do this when running out of sources and not when running tests
		if (!this.environmentService.isBuilt && !this.environmentService.extensionTestsPath) {
			this.showTimeoutHandle = setTimeout(() => {
				if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
					this._win.show();
					this._win.focus();
					this._win.webContents.openDevTools();
				}
			}, 10000);
		}
	}

	reload(configuration?: IWindowConfiguration, cli?: ParsedArgs): void {

		// If config is not provided, copy our current one
		if (!configuration) {
			configuration = objects.mixin({}, this.currentConfig);
		}

		// Delete some properties we do not want during reload
		delete configuration.filesToOpen;
		delete configuration.filesToCreate;
		delete configuration.filesToDiff;
		delete configuration.filesToWait;

		// Some configuration things get inherited if the window is being reloaded and we are
		// in extension development mode. These options are all development related.
		if (this.isExtensionDevelopmentHost && cli) {
			configuration.verbose = cli.verbose;
			configuration.debugPluginHost = cli.debugPluginHost;
			configuration.debugBrkPluginHost = cli.debugBrkPluginHost;
			configuration.debugId = cli.debugId;
			configuration['extensions-dir'] = cli['extensions-dir'];
		}

		configuration.isInitialStartup = false; // since this is a reload

		// Load config
		const disableExtensions = cli ? cli['disable-extensions'] : undefined;
		this.load(configuration, true, disableExtensions);
	}

	private getUrl(windowConfiguration: IWindowConfiguration): string {

		// Set window ID
		windowConfiguration.windowId = this._win.id;
		windowConfiguration.logLevel = this.logService.getLevel();

		// Set zoomlevel
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
		const zoomLevel = windowConfig && windowConfig.zoomLevel;
		if (typeof zoomLevel === 'number') {
			windowConfiguration.zoomLevel = zoomLevel;
		}

		// Set fullscreen state
		windowConfiguration.fullscreen = this._win.isFullScreen();

		// Set Accessibility Config
		let autoDetectHighContrast = true;
		if (windowConfig && windowConfig.autoDetectHighContrast === false) {
			autoDetectHighContrast = false;
		}
		windowConfiguration.highContrast = isWindows && autoDetectHighContrast && systemPreferences.isInvertedColorScheme();
		windowConfiguration.accessibilitySupport = app.isAccessibilitySupportEnabled();

		// Title style related
		windowConfiguration.maximized = this._win.isMaximized();
		windowConfiguration.frameless = this.hasHiddenTitleBarStyle() && !isMacintosh;

		// Dump Perf Counters
		windowConfiguration.perfEntries = perf.exportEntries();

		// Config (combination of process.argv and window configuration)
		const environment = parseArgs(process.argv);
		const config = objects.assign(environment, windowConfiguration);
		for (let key in config) {
			if (config[key] === void 0 || config[key] === null || config[key] === '') {
				delete config[key]; // only send over properties that have a true value
			}
		}

		return `${require.toUrl('vs/code/electron-browser/workbench/workbench.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	}

	serializeWindowState(): IWindowState {
		if (!this._win) {
			return defaultWindowState();
		}

		// fullscreen gets special treatment
		if (this._win.isFullScreen()) {
			const display = screen.getDisplayMatching(this.getBounds());

			const defaultState = defaultWindowState();

			const res = {
				mode: WindowMode.Fullscreen,
				display: display ? display.id : void 0,

				// Still carry over window dimensions from previous sessions
				// if we can compute it in fullscreen state.
				// does not seem possible in all cases on Linux for example
				// (https://github.com/Microsoft/vscode/issues/58218) so we
				// fallback to the defaults in that case.
				width: this.windowState.width || defaultState.width,
				height: this.windowState.height || defaultState.height,
				x: this.windowState.x || 0,
				y: this.windowState.y || 0
			};

			return res;
		}

		const state: IWindowState = Object.create(null);
		let mode: WindowMode;

		// get window mode
		if (!isMacintosh && this._win.isMaximized()) {
			mode = WindowMode.Maximized;
		} else {
			mode = WindowMode.Normal;
		}

		// we don't want to save minimized state, only maximized or normal
		if (mode === WindowMode.Maximized) {
			state.mode = WindowMode.Maximized;
		} else {
			state.mode = WindowMode.Normal;
		}

		// only consider non-minimized window states
		if (mode === WindowMode.Normal || mode === WindowMode.Maximized) {
			const bounds = this.getBounds();

			state.x = bounds.x;
			state.y = bounds.y;
			state.width = bounds.width;
			state.height = bounds.height;
		}

		return state;
	}

	private restoreWindowState(state?: IWindowState): IWindowState {
		if (state) {
			try {
				state = this.validateWindowState(state);
			} catch (err) {
				this.logService.warn(`Unexpected error validating window state: ${err}\n${err.stack}`); // somehow display API can be picky about the state to validate
			}
		}

		if (!state) {
			state = defaultWindowState();
		}

		return state;
	}

	private validateWindowState(state: IWindowState): IWindowState {
		if (!state) {
			return null;
		}

		if ([state.x, state.y, state.width, state.height].some(n => typeof n !== 'number')) {
			return null;
		}

		if (state.width <= 0 || state.height <= 0) {
			return null;
		}

		const displays = screen.getAllDisplays();

		// Single Monitor: be strict about x/y positioning
		if (displays.length === 1) {
			const displayBounds = displays[0].bounds;

			// Careful with maximized: in that mode x/y can well be negative!
			if (state.mode !== WindowMode.Maximized && displayBounds.width > 0 && displayBounds.height > 0 /* Linux X11 sessions sometimes report wrong display bounds */) {
				if (state.x < displayBounds.x) {
					state.x = displayBounds.x; // prevent window from falling out of the screen to the left
				}

				if (state.y < displayBounds.y) {
					state.y = displayBounds.y; // prevent window from falling out of the screen to the top
				}

				if (state.x > (displayBounds.x + displayBounds.width)) {
					state.x = displayBounds.x; // prevent window from falling out of the screen to the right
				}

				if (state.y > (displayBounds.y + displayBounds.height)) {
					state.y = displayBounds.y; // prevent window from falling out of the screen to the bottom
				}

				if (state.width > displayBounds.width) {
					state.width = displayBounds.width; // prevent window from exceeding display bounds width
				}

				if (state.height > displayBounds.height) {
					state.height = displayBounds.height; // prevent window from exceeding display bounds height
				}
			}

			if (state.mode === WindowMode.Maximized) {
				return defaultWindowState(WindowMode.Maximized); // when maximized, make sure we have good values when the user restores the window
			}

			return state;
		}

		// Multi Montior (fullscreen): try to find the previously used display
		if (state.display && state.mode === WindowMode.Fullscreen) {
			const display = displays.filter(d => d.id === state.display)[0];
			if (display && display.bounds && typeof display.bounds.x === 'number' && typeof display.bounds.y === 'number') {
				const defaults = defaultWindowState(WindowMode.Fullscreen); // make sure we have good values when the user restores the window
				defaults.x = display.bounds.x; // carefull to use displays x/y position so that the window ends up on the correct monitor
				defaults.y = display.bounds.y;

				return defaults;
			}
		}

		// Multi Monitor (non-fullscreen): be less strict because metrics can be crazy
		const bounds = { x: state.x, y: state.y, width: state.width, height: state.height };
		const display = screen.getDisplayMatching(bounds);
		if (
			display &&												// we have a display matching the desired bounds
			bounds.x < display.bounds.x + display.bounds.width &&	// prevent window from falling out of the screen to the right
			bounds.y < display.bounds.y + display.bounds.height &&	// prevent window from falling out of the screen to the bottom
			bounds.x + bounds.width > display.bounds.x &&			// prevent window from falling out of the screen to the left
			bounds.y + bounds.height > display.bounds.y				// prevent window from falling out of the scree nto the top
		) {
			if (state.mode === WindowMode.Maximized) {
				const defaults = defaultWindowState(WindowMode.Maximized); // when maximized, make sure we have good values when the user restores the window
				defaults.x = state.x; // carefull to keep x/y position so that the window ends up on the correct monitor
				defaults.y = state.y;

				return defaults;
			}

			return state;
		}

		return null;
	}

	getBounds(): Electron.Rectangle {
		const pos = this._win.getPosition();
		const dimension = this._win.getSize();

		return { x: pos[0], y: pos[1], width: dimension[0], height: dimension[1] };
	}

	toggleFullScreen(): void {
		const willBeFullScreen = !this._win.isFullScreen();

		// set fullscreen flag on window
		this._win.setFullScreen(willBeFullScreen);

		// respect configured menu bar visibility or default to toggle if not set
		this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
	}

	private getMenuBarVisibility(): MenuBarVisibility {
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
		if (!windowConfig || !windowConfig.menuBarVisibility) {
			return 'default';
		}

		let menuBarVisibility = windowConfig.menuBarVisibility;
		if (['visible', 'toggle', 'hidden'].indexOf(menuBarVisibility) < 0) {
			menuBarVisibility = 'default';
		}

		return menuBarVisibility;
	}

	private setMenuBarVisibility(visibility: MenuBarVisibility, notify: boolean = true): void {
		if (isMacintosh) {
			return; // ignore for macOS platform
		}

		if (visibility === 'toggle') {
			if (notify) {
				this.send('vscode:showInfoMessage', nls.localize('hiddenMenuBar', "You can still access the menu bar by pressing the Alt-key."));
			}
		}

		if (visibility === 'hidden') {
			// for some weird reason that I have no explanation for, the menu bar is not hiding when calling
			// this without timeout (see https://github.com/Microsoft/vscode/issues/19777). there seems to be
			// a timing issue with us opening the first window and the menu bar getting created. somehow the
			// fact that we want to hide the menu without being able to bring it back via Alt key makes Electron
			// still show the menu. Unable to reproduce from a simple Hello World application though...
			setTimeout(() => {
				this.doSetMenuBarVisibility(visibility);
			});
		} else {
			this.doSetMenuBarVisibility(visibility);
		}
	}

	private doSetMenuBarVisibility(visibility: MenuBarVisibility): void {
		const isFullscreen = this._win.isFullScreen();

		switch (visibility) {
			case ('default'):
				this._win.setMenuBarVisibility(!isFullscreen);
				this._win.setAutoHideMenuBar(isFullscreen);
				break;

			case ('visible'):
				this._win.setMenuBarVisibility(true);
				this._win.setAutoHideMenuBar(false);
				break;

			case ('toggle'):
				this._win.setMenuBarVisibility(false);
				this._win.setAutoHideMenuBar(true);
				break;

			case ('hidden'):
				this._win.setMenuBarVisibility(false);
				this._win.setAutoHideMenuBar(false);
				break;
		}
	}

	onWindowTitleDoubleClick(): void {

		// Respect system settings on mac with regards to title click on windows title
		if (isMacintosh) {
			const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');
			switch (action) {
				case 'Minimize':
					this.win.minimize();
					break;
				case 'None':
					break;
				case 'Maximize':
				default:
					if (this.win.isMaximized()) {
						this.win.unmaximize();
					} else {
						this.win.maximize();
					}
			}
		}

		// Linux/Windows: just toggle maximize/minimized state
		else {
			if (this.win.isMaximized()) {
				this.win.unmaximize();
			} else {
				this.win.maximize();
			}
		}
	}

	close(): void {
		if (this._win) {
			this._win.close();
		}
	}

	sendWhenReady(channel: string, ...args: any[]): void {
		this.ready().then(() => {
			this.send(channel, ...args);
		});
	}

	send(channel: string, ...args: any[]): void {
		if (this._win) {
			this._win.webContents.send(channel, ...args);
		}
	}

	updateTouchBar(groups: ISerializableCommandAction[][]): void {
		if (!isMacintosh) {
			return; // only supported on macOS
		}

		// Update segments for all groups. Setting the segments property
		// of the group directly prevents ugly flickering from happening
		this.touchBarGroups.forEach((touchBarGroup, index) => {
			const commands = groups[index];
			touchBarGroup.segments = this.createTouchBarGroupSegments(commands);
		});
	}

	private createTouchBar(): void {
		if (!isMacintosh) {
			return; // only supported on macOS
		}

		// To avoid flickering, we try to reuse the touch bar group
		// as much as possible by creating a large number of groups
		// for reusing later.
		for (let i = 0; i < 10; i++) {
			const groupTouchBar = this.createTouchBarGroup();
			this.touchBarGroups.push(groupTouchBar);
		}

		this._win.setTouchBar(new TouchBar({ items: this.touchBarGroups }));
	}

	private createTouchBarGroup(items: ISerializableCommandAction[] = []): Electron.TouchBarSegmentedControl {

		// Group Segments
		const segments = this.createTouchBarGroupSegments(items);

		// Group Control
		const control = new TouchBar.TouchBarSegmentedControl({
			segments,
			mode: 'buttons',
			segmentStyle: 'automatic',
			change: (selectedIndex) => {
				this.sendWhenReady('vscode:runAction', { id: (control.segments[selectedIndex] as ITouchBarSegment).id, from: 'touchbar' });
			}
		});

		return control;
	}

	private createTouchBarGroupSegments(items: ISerializableCommandAction[] = []): ITouchBarSegment[] {
		const segments: ITouchBarSegment[] = items.map(item => {
			let icon: Electron.NativeImage;
			if (item.iconLocation && item.iconLocation.dark.scheme === 'file') {
				icon = nativeImage.createFromPath(URI.revive(item.iconLocation.dark).fsPath);
				if (icon.isEmpty()) {
					icon = void 0;
				}
			}

			return {
				id: item.id,
				label: !icon ? item.title as string : void 0,
				icon
			};
		});

		return segments;
	}

	dispose(): void {
		if (this.showTimeoutHandle) {
			clearTimeout(this.showTimeoutHandle);
		}

		this.toDispose = dispose(this.toDispose);

		this._win = null; // Important to dereference the window object to allow for GC
	}
}
