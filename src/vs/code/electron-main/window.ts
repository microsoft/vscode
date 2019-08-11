/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'vs/base/common/path';
import * as objects from 'vs/base/common/objects';
import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { screen, BrowserWindow, systemPreferences, app, TouchBar, nativeImage, Rectangle, Display } from 'electron';
import { IEnvironmentService, ParsedArgs } from 'vs/platform/environment/common/environment';
import { ILogService } from 'vs/platform/log/common/log';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { parseArgs } from 'vs/platform/environment/node/argv';
import product from 'vs/platform/product/node/product';
import { IWindowSettings, MenuBarVisibility, IWindowConfiguration, ReadyState, getTitleBarStyle } from 'vs/platform/windows/common/windows';
import { Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { ICodeWindow, IWindowState, WindowMode } from 'vs/platform/windows/electron-main/windows';
import { IWorkspaceIdentifier, IWorkspacesMainService } from 'vs/platform/workspaces/common/workspaces';
import { IBackupMainService } from 'vs/platform/backup/common/backup';
import { ISerializableCommandAction } from 'vs/platform/actions/common/actions';
import * as perf from 'vs/base/common/performance';
import { resolveMarketplaceHeaders } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { IThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { endsWith } from 'vs/base/common/strings';
import { RunOnceScheduler } from 'vs/base/common/async';
import { IFileService } from 'vs/platform/files/common/files';
import pkg from 'vs/platform/product/node/package';

const RUN_TEXTMATE_IN_WORKER = false;

export interface IWindowCreationOptions {
	state: IWindowState;
	extensionDevelopmentPath?: string | string[];
	isExtensionTestHost?: boolean;
}

export const defaultWindowState = function (mode = WindowMode.Normal): IWindowState {
	return {
		width: 1024,
		height: 768,
		mode
	};
};

interface ITouchBarSegment extends Electron.SegmentedControlSegment {
	id: string;
}

export class CodeWindow extends Disposable implements ICodeWindow {

	private static readonly MIN_WIDTH = 200;
	private static readonly MIN_HEIGHT = 120;

	private static readonly MAX_URL_LENGTH = 2 * 1024 * 1024; // https://cs.chromium.org/chromium/src/url/url_constants.cc?l=32

	private hiddenTitleBarStyle: boolean;
	private showTimeoutHandle: NodeJS.Timeout;
	private _id: number;
	private _win: Electron.BrowserWindow;
	private _lastFocusTime: number;
	private _readyState: ReadyState;
	private windowState: IWindowState;
	private currentMenuBarVisibility: MenuBarVisibility;
	private representedFilename: string;

	private readonly whenReadyCallbacks: { (window: ICodeWindow): void }[];

	private currentConfig: IWindowConfiguration;
	private pendingLoadConfig?: IWindowConfiguration;

	private marketplaceHeadersPromise: Promise<object>;

	private readonly touchBarGroups: Electron.TouchBarSegmentedControl[];

	constructor(
		config: IWindowCreationOptions,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IFileService private readonly fileService: IFileService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWorkspacesMainService private readonly workspacesMainService: IWorkspacesMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
	) {
		super();

		this.touchBarGroups = [];
		this._lastFocusTime = -1;
		this._readyState = ReadyState.NONE;
		this.whenReadyCallbacks = [];

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
		const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
		this.windowState = state;

		// in case we are maximized or fullscreen, only show later after the call to maximize/fullscreen (see below)
		const isFullscreenOrMaximized = (this.windowState.mode === WindowMode.Maximized || this.windowState.mode === WindowMode.Fullscreen);

		const options: Electron.BrowserWindowConstructorOptions = {
			width: this.windowState.width,
			height: this.windowState.height,
			x: this.windowState.x,
			y: this.windowState.y,
			backgroundColor: this.themeMainService.getBackgroundColor(),
			minWidth: CodeWindow.MIN_WIDTH,
			minHeight: CodeWindow.MIN_HEIGHT,
			show: !isFullscreenOrMaximized,
			title: product.nameLong,
			webPreferences: {
				// By default if Code is in the background, intervals and timeouts get throttled, so we
				// want to enforce that Code stays in the foreground. This triggers a disable_hidden_
				// flag that Electron provides via patch:
				// https://github.com/electron/libchromiumcontent/blob/master/patches/common/chromium/disable_hidden.patch
				backgroundThrottling: false,
				nodeIntegration: true,
				nodeIntegrationInWorker: RUN_TEXTMATE_IN_WORKER,
				webviewTag: true
			}
		};

		if (isLinux) {
			options.icon = path.join(this.environmentService.appRoot, 'resources/linux/code.png'); // Windows and Mac are better off using the embedded icon(s)
		}

		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');

		if (isMacintosh && !this.useNativeFullScreen()) {
			options.fullscreenable = false; // enables simple fullscreen mode
		}

		if (isMacintosh) {
			options.acceptFirstMouse = true; // enabled by default

			if (windowConfig && windowConfig.clickThroughInactive === false) {
				options.acceptFirstMouse = false;
			}
		}

		const useNativeTabs = isMacintosh && windowConfig && windowConfig.nativeTabs === true;
		if (useNativeTabs) {
			options.tabbingIdentifier = product.nameShort; // this opts in to sierra tabs
		}

		const useCustomTitleStyle = getTitleBarStyle(this.configurationService, this.environmentService, !!config.extensionDevelopmentPath) === 'custom';
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

		if (isMacintosh && useCustomTitleStyle) {
			this._win.setSheetOffset(22); // offset dialogs by the height of the custom title bar if we have any
		}

		// TODO@Ben (Electron 4 regression): when running on multiple displays where the target display
		// to open the window has a larger resolution than the primary display, the window will not size
		// correctly unless we set the bounds again (https://github.com/microsoft/vscode/issues/74872)
		//
		// However, when running with native tabs with multiple windows we cannot use this workaround
		// because there is a potential that the new window will be added as native tab instead of being
		// a window on its own. In that case calling setBounds() would cause https://github.com/microsoft/vscode/issues/75830
		if (isMacintosh && hasMultipleDisplays && (!useNativeTabs || BrowserWindow.getAllWindows().length === 1)) {
			if ([this.windowState.width, this.windowState.height, this.windowState.x, this.windowState.y].every(value => typeof value === 'number')) {
				this._win.setBounds({
					width: this.windowState.width!,
					height: this.windowState.height!,
					x: this.windowState.x!,
					y: this.windowState.y!
				});
			}
		}

		if (isFullscreenOrMaximized) {
			this._win.maximize();

			if (this.windowState.mode === WindowMode.Fullscreen) {
				this.setFullScreen(true);
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

	get backupPath(): string | undefined {
		return this.currentConfig ? this.currentConfig.backupPath : undefined;
	}

	get openedWorkspace(): IWorkspaceIdentifier | undefined {
		return this.currentConfig ? this.currentConfig.workspace : undefined;
	}

	get openedFolderUri(): URI | undefined {
		return this.currentConfig ? this.currentConfig.folderUri : undefined;
	}

	get remoteAuthority(): string | undefined {
		return this.currentConfig ? this.currentConfig.remoteAuthority : undefined;
	}

	setReady(): void {
		this._readyState = ReadyState.READY;

		// inform all waiting promises that we are ready now
		while (this.whenReadyCallbacks.length) {
			this.whenReadyCallbacks.pop()!(this);
		}
	}

	ready(): Promise<ICodeWindow> {
		return new Promise<ICodeWindow>(resolve => {
			if (this.isReady) {
				return resolve(this);
			}

			// otherwise keep and call later when we are ready
			this.whenReadyCallbacks.push(resolve);
		});
	}

	get isReady(): boolean {
		return this._readyState === ReadyState.READY;
	}

	private handleMarketplaceRequests(): void {

		// Resolve marketplace headers
		this.marketplaceHeadersPromise = resolveMarketplaceHeaders(pkg.version, this.environmentService, this.fileService);

		// Inject headers when requests are incoming
		const urls = ['https://marketplace.visualstudio.com/*', 'https://*.vsassets.io/*'];
		this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, (details, cb) => {
			this.marketplaceHeadersPromise.then(headers => {
				const requestHeaders = objects.assign(details.requestHeaders, headers) as { [key: string]: string | undefined };
				if (!this.configurationService.getValue('extensions.disableExperimentalAzureSearch')) {
					requestHeaders['Cookie'] = `${requestHeaders['Cookie'] ? requestHeaders['Cookie'] + ';' : ''}EnableExternalSearchForVSCode=true`;
				}
				cb({ cancel: false, requestHeaders });
			});
		});
	}

	private registerListeners(): void {

		// Prevent loading of svgs
		this._win.webContents.session.webRequest.onBeforeRequest(null!, (details, callback) => {
			if (details.url.indexOf('.svg') > 0) {
				const uri = URI.parse(details.url);
				if (uri && !uri.scheme.match(/file/i) && endsWith(uri.path, '.svg')) {
					return callback({ cancel: true });
				}
			}

			return callback({});
		});

		this._win.webContents.session.webRequest.onHeadersReceived(null!, (details, callback) => {
			const responseHeaders = details.responseHeaders as { [key: string]: string[] };

			const contentType: string[] = (responseHeaders['content-type'] || responseHeaders['Content-Type']);
			if (contentType && Array.isArray(contentType) && contentType.some(x => x.toLowerCase().indexOf('image/svg') >= 0)) {
				return callback({ cancel: true });
			}

			return callback({ cancel: false, responseHeaders });
		});

		// Remember that we loaded
		this._win.webContents.on('did-finish-load', () => {
			this._readyState = ReadyState.LOADING;

			// Associate properties from the load request if provided
			if (this.pendingLoadConfig) {
				this.currentConfig = this.pendingLoadConfig;

				this.pendingLoadConfig = undefined;
			}
		});

		// Window Focus
		this._win.on('focus', () => {
			this._lastFocusTime = Date.now();
		});

		// Simple fullscreen doesn't resize automatically when the resolution changes so as a workaround
		// we need to detect when display metrics change or displays are added/removed and toggle the
		// fullscreen manually.
		if (isMacintosh) {
			const simpleFullScreenScheduler = this._register(new RunOnceScheduler(() => {
				if (!this._win) {
					return; // disposed
				}

				if (!this.useNativeFullScreen() && this.isFullScreen()) {
					this.setFullScreen(false);
					this.setFullScreen(true);
				}
			}, 100));

			const displayChangedListener = () => simpleFullScreenScheduler.schedule();

			screen.on('display-metrics-changed', displayChangedListener);
			this._register(toDisposable(() => screen.removeListener('display-metrics-changed', displayChangedListener)));

			screen.on('display-added', displayChangedListener);
			this._register(toDisposable(() => screen.removeListener('display-added', displayChangedListener)));

			screen.on('display-removed', displayChangedListener);
			this._register(toDisposable(() => screen.removeListener('display-removed', displayChangedListener)));
		}

		// Window (Un)Maximize
		this._win.on('maximize', (e: Event) => {
			if (this.currentConfig) {
				this.currentConfig.maximized = true;
			}

			app.emit('browser-window-maximize', e, this._win);
		});

		this._win.on('unmaximize', (e: Event) => {
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
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated()));

		// Handle Workspace events
		this._register(this.workspacesMainService.onUntitledWorkspaceDeleted(e => this.onUntitledWorkspaceDeleted(e)));
	}

	private onUntitledWorkspaceDeleted(workspace: IWorkspaceIdentifier): void {

		// Make sure to update our workspace config if we detect that it
		// was deleted
		if (this.openedWorkspace && this.openedWorkspace.id === workspace.id) {
			this.currentConfig.workspace = undefined;
		}
	}

	private onConfigurationUpdated(): void {
		const newMenuBarVisibility = this.getMenuBarVisibility();
		if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
			this.currentMenuBarVisibility = newMenuBarVisibility;
			this.setMenuBarVisibility(newMenuBarVisibility);
		}
	}

	addTabbedWindow(window: ICodeWindow): void {
		if (isMacintosh) {
			this._win.addTabbedWindow(window.win);
		}
	}

	load(config: IWindowConfiguration, isReload?: boolean, disableExtensions?: boolean): void {

		// If this is the first time the window is loaded, we associate the paths
		// directly with the window because we assume the loading will just work
		if (this._readyState === ReadyState.NONE) {
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
		if (!this.environmentService.isBuilt && !this.environmentService.extensionTestsLocationURI) {
			this.showTimeoutHandle = setTimeout(() => {
				if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
					this._win.show();
					this._win.focus();
					this._win.webContents.openDevTools();
				}
			}, 10000);
		}
	}

	reload(configurationIn?: IWindowConfiguration, cli?: ParsedArgs): void {

		// If config is not provided, copy our current one
		const configuration = configurationIn ? configurationIn : objects.mixin({}, this.currentConfig);

		// Delete some properties we do not want during reload
		delete configuration.filesToOpenOrCreate;
		delete configuration.filesToDiff;
		delete configuration.filesToWait;

		// Some configuration things get inherited if the window is being reloaded and we are
		// in extension development mode. These options are all development related.
		if (this.isExtensionDevelopmentHost && cli) {
			configuration.verbose = cli.verbose;
			configuration['inspect-extensions'] = cli['inspect-extensions'];
			configuration['inspect-brk-extensions'] = cli['inspect-brk-extensions'];
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
		windowConfiguration.fullscreen = this.isFullScreen();

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

		// Parts splash
		windowConfiguration.partsSplashPath = path.join(this.environmentService.userDataPath, 'rapid_render.json');

		// Config (combination of process.argv and window configuration)
		const environment = parseArgs(process.argv);
		const config = objects.assign(environment, windowConfiguration);
		for (const key in config) {
			const configValue = (config as any)[key];
			if (configValue === undefined || configValue === null || configValue === '' || configValue === false) {
				delete (config as any)[key]; // only send over properties that have a true value
			}
		}

		// In the unlikely event of the URL becoming larger than 2MB, remove parts of
		// it that are not under our control. Mainly, the user environment can be very
		// large depending on user configuration, so we can only remove it in that case.
		let configUrl = this.doGetUrl(config);
		if (configUrl.length > CodeWindow.MAX_URL_LENGTH) {
			delete config.userEnv;
			this.logService.warn('Application URL exceeds maximum of 2MB and was shortened.');

			configUrl = this.doGetUrl(config);

			if (configUrl.length > CodeWindow.MAX_URL_LENGTH) {
				this.logService.error('Application URL exceeds maximum of 2MB and cannot be loaded.');
			}
		}

		return configUrl;
	}

	private doGetUrl(config: object): string {
		return `${require.toUrl('vs/code/electron-browser/workbench/workbench.html')}?config=${encodeURIComponent(JSON.stringify(config))}`;
	}

	serializeWindowState(): IWindowState {
		if (!this._win) {
			return defaultWindowState();
		}

		// fullscreen gets special treatment
		if (this.isFullScreen()) {
			const display = screen.getDisplayMatching(this.getBounds());

			const defaultState = defaultWindowState();

			const res = {
				mode: WindowMode.Fullscreen,
				display: display ? display.id : undefined,

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
			let bounds: Electron.Rectangle;
			if (mode === WindowMode.Normal) {
				bounds = this.getBounds();
			} else {
				bounds = this._win.getNormalBounds(); // make sure to persist the normal bounds when maximized to be able to restore them
			}

			state.x = bounds.x;
			state.y = bounds.y;
			state.width = bounds.width;
			state.height = bounds.height;
		}

		return state;
	}

	private restoreWindowState(state?: IWindowState): [IWindowState, boolean? /* has multiple displays */] {
		let hasMultipleDisplays = false;
		if (state) {
			try {
				const displays = screen.getAllDisplays();
				hasMultipleDisplays = displays.length > 1;

				state = this.validateWindowState(state, displays);
			} catch (err) {
				this.logService.warn(`Unexpected error validating window state: ${err}\n${err.stack}`); // somehow display API can be picky about the state to validate
			}
		}

		return [state || defaultWindowState(), hasMultipleDisplays];
	}

	private validateWindowState(state: IWindowState, displays: Display[]): IWindowState | undefined {
		if (typeof state.x !== 'number'
			|| typeof state.y !== 'number'
			|| typeof state.width !== 'number'
			|| typeof state.height !== 'number'
		) {
			return undefined;
		}

		if (state.width <= 0 || state.height <= 0) {
			return undefined;
		}

		// Single Monitor: be strict about x/y positioning
		if (displays.length === 1) {
			const displayWorkingArea = this.getWorkingArea(displays[0]);
			if (displayWorkingArea) {
				if (state.x < displayWorkingArea.x) {
					state.x = displayWorkingArea.x; // prevent window from falling out of the screen to the left
				}

				if (state.y < displayWorkingArea.y) {
					state.y = displayWorkingArea.y; // prevent window from falling out of the screen to the top
				}

				if (state.x > (displayWorkingArea.x + displayWorkingArea.width)) {
					state.x = displayWorkingArea.x; // prevent window from falling out of the screen to the right
				}

				if (state.y > (displayWorkingArea.y + displayWorkingArea.height)) {
					state.y = displayWorkingArea.y; // prevent window from falling out of the screen to the bottom
				}

				if (state.width > displayWorkingArea.width) {
					state.width = displayWorkingArea.width; // prevent window from exceeding display bounds width
				}

				if (state.height > displayWorkingArea.height) {
					state.height = displayWorkingArea.height; // prevent window from exceeding display bounds height
				}
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
		const displayWorkingArea = this.getWorkingArea(display);
		if (
			display &&														// we have a display matching the desired bounds
			displayWorkingArea &&											// we have valid working area bounds
			bounds.x < displayWorkingArea.x + displayWorkingArea.width &&	// prevent window from falling out of the screen to the right
			bounds.y < displayWorkingArea.y + displayWorkingArea.height &&	// prevent window from falling out of the screen to the bottom
			bounds.x + bounds.width > displayWorkingArea.x &&				// prevent window from falling out of the screen to the left
			bounds.y + bounds.height > displayWorkingArea.y					// prevent window from falling out of the scree nto the top
		) {
			return state;
		}

		return undefined;
	}

	private getWorkingArea(display: Display): Rectangle | undefined {

		// Prefer the working area of the display to account for taskbars on the
		// desktop being positioned somewhere (https://github.com/Microsoft/vscode/issues/50830).
		//
		// Linux X11 sessions sometimes report wrong display bounds, so we validate
		// the reported sizes are positive.
		if (display.workArea.width > 0 && display.workArea.height > 0) {
			return display.workArea;
		}

		if (display.bounds.width > 0 && display.bounds.height > 0) {
			return display.bounds;
		}

		return undefined;
	}

	getBounds(): Electron.Rectangle {
		const pos = this._win.getPosition();
		const dimension = this._win.getSize();

		return { x: pos[0], y: pos[1], width: dimension[0], height: dimension[1] };
	}

	toggleFullScreen(): void {
		this.setFullScreen(!this.isFullScreen());
	}

	private setFullScreen(fullscreen: boolean): void {

		// Set fullscreen state
		if (this.useNativeFullScreen()) {
			this.setNativeFullScreen(fullscreen);
		} else {
			this.setSimpleFullScreen(fullscreen);
		}

		// Events
		this.sendWhenReady(fullscreen ? 'vscode:enterFullScreen' : 'vscode:leaveFullScreen');

		// Respect configured menu bar visibility or default to toggle if not set
		this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
	}

	isFullScreen(): boolean {
		return this._win.isFullScreen() || this._win.isSimpleFullScreen();
	}

	private setNativeFullScreen(fullscreen: boolean): void {
		if (this._win.isSimpleFullScreen()) {
			this._win.setSimpleFullScreen(false);
		}

		this._win.setFullScreen(fullscreen);
	}

	private setSimpleFullScreen(fullscreen: boolean): void {
		if (this._win.isFullScreen()) {
			this._win.setFullScreen(false);
		}

		this._win.setSimpleFullScreen(fullscreen);
		this._win.webContents.focus(); // workaround issue where focus is not going into window
	}

	private useNativeFullScreen(): boolean {
		const windowConfig = this.configurationService.getValue<IWindowSettings>('window');
		if (!windowConfig || typeof windowConfig.nativeFullScreen !== 'boolean') {
			return true; // default
		}

		if (windowConfig.nativeTabs) {
			return true; // https://github.com/electron/electron/issues/16142
		}

		return windowConfig.nativeFullScreen !== false;
	}

	isMinimized(): boolean {
		return this._win.isMinimized();
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
		const isFullscreen = this.isFullScreen();

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
		if (this.isReady) {
			this.send(channel, ...args);
		} else {
			this.ready().then(() => this.send(channel, ...args));
		}
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
			let icon: Electron.NativeImage | undefined;
			if (item.iconLocation && item.iconLocation.dark.scheme === 'file') {
				icon = nativeImage.createFromPath(URI.revive(item.iconLocation.dark).fsPath);
				if (icon.isEmpty()) {
					icon = undefined;
				}
			}

			let title: string;
			if (typeof item.title === 'string') {
				title = item.title;
			} else {
				title = item.title.value;
			}

			return {
				id: item.id,
				label: !icon ? title : undefined,
				icon
			};
		});

		return segments;
	}

	dispose(): void {
		super.dispose();

		if (this.showTimeoutHandle) {
			clearTimeout(this.showTimeoutHandle);
		}

		this._win = null!; // Important to dereference the window object to allow for GC
	}
}
