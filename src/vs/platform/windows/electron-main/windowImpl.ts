/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { app, BrowserWindow, BrowserWindowConstructorOptions, Display, Event as ElectronEvent, nativeImage, NativeImage, Rectangle, screen, SegmentedControlSegment, systemPreferences, TouchBar, TouchBarSegmentedControl } from 'electron';
import { DeferredPromise, RunOnceScheduler, timeout } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { Emitter } from 'vs/base/common/event';
import { mnemonicButtonLabel } from 'vs/base/common/labels';
import { Disposable } from 'vs/base/common/lifecycle';
import { FileAccess, Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { getMarks, mark } from 'vs/base/common/performance';
import { isLinux, isMacintosh, isWindows } from 'vs/base/common/platform';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { ISerializableCommandAction } from 'vs/platform/action/common/action';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { IConfigurationChangeEvent, IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IDialogMainService } from 'vs/platform/dialogs/electron-main/dialogMainService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { isLaunchedFromCli } from 'vs/platform/environment/node/argvHelper';
import { IFileService } from 'vs/platform/files/common/files';
import { ILifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { ILogService } from 'vs/platform/log/common/log';
import { IProductService } from 'vs/platform/product/common/productService';
import { IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { resolveMarketplaceHeaders } from 'vs/platform/externalServices/common/marketplace';
import { IApplicationStorageMainService, IStorageMainService } from 'vs/platform/storage/electron-main/storageMainService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { ThemeIcon } from 'vs/platform/theme/common/themeService';
import { IThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { getMenuBarVisibility, getTitleBarStyle, IFolderToOpen, INativeWindowConfiguration, IWindowSettings, IWorkspaceToOpen, MenuBarVisibility, useWindowControlsOverlay, WindowMinimumSize, zoomLevelToZoomFactor } from 'vs/platform/window/common/window';
import { IWindowsMainService, OpenContext } from 'vs/platform/windows/electron-main/windows';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';
import { IWorkspacesManagementMainService } from 'vs/platform/workspaces/electron-main/workspacesManagementMainService';
import { IWindowState, ICodeWindow, ILoadEvent, WindowMode, WindowError, LoadReason, defaultWindowState } from 'vs/platform/window/electron-main/window';
import { Color } from 'vs/base/common/color';
import { IPolicyService } from 'vs/platform/policy/common/policy';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import product from 'vs/platform/product/common/product';
import { IUserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';

export interface IWindowCreationOptions {
	state: IWindowState;
	extensionDevelopmentPath?: string[];
	isExtensionTestHost?: boolean;
}

interface ITouchBarSegment extends SegmentedControlSegment {
	id: string;
}

interface ILoadOptions {
	isReload?: boolean;
	disableExtensions?: boolean;
}

const enum ReadyState {

	/**
	 * This window has not loaded anything yet
	 * and this is the initial state of every
	 * window.
	 */
	NONE,

	/**
	 * This window is navigating, either for the
	 * first time or subsequent times.
	 */
	NAVIGATING,

	/**
	 * This window has finished loading and is ready
	 * to forward IPC requests to the web contents.
	 */
	READY
}

export class CodeWindow extends Disposable implements ICodeWindow {

	private static readonly windowControlHeightStateStorageKey = 'windowControlHeight';

	//#region Events

	private readonly _onWillLoad = this._register(new Emitter<ILoadEvent>());
	readonly onWillLoad = this._onWillLoad.event;

	private readonly _onDidSignalReady = this._register(new Emitter<void>());
	readonly onDidSignalReady = this._onDidSignalReady.event;

	private readonly _onDidTriggerSystemContextMenu = this._register(new Emitter<{ x: number; y: number }>());
	readonly onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidDestroy = this._register(new Emitter<void>());
	readonly onDidDestroy = this._onDidDestroy.event;

	//#endregion


	//#region Properties

	private _id: number;
	get id(): number { return this._id; }

	private _win: BrowserWindow;
	get win(): BrowserWindow | null { return this._win; }

	private _lastFocusTime = -1;
	get lastFocusTime(): number { return this._lastFocusTime; }

	get backupPath(): string | undefined { return this._config?.backupPath; }

	get openedWorkspace(): IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined { return this._config?.workspace; }

	get profile(): IUserDataProfile | undefined { return this.config ? this.userDataProfilesService.getOrSetProfileForWorkspace(this.config.workspace ?? 'empty-window', this.userDataProfilesService.profiles.find(profile => profile.id === this.config?.profiles.profile.id) ?? this.userDataProfilesService.defaultProfile) : undefined; }

	get remoteAuthority(): string | undefined { return this._config?.remoteAuthority; }

	private _config: INativeWindowConfiguration | undefined;
	get config(): INativeWindowConfiguration | undefined { return this._config; }

	get isExtensionDevelopmentHost(): boolean { return !!(this._config?.extensionDevelopmentPath); }

	get isExtensionTestHost(): boolean { return !!(this._config?.extensionTestsPath); }

	get isExtensionDevelopmentTestFromCli(): boolean { return this.isExtensionDevelopmentHost && this.isExtensionTestHost && !this._config?.debugId; }

	//#endregion

	private readonly windowState: IWindowState;
	private currentMenuBarVisibility: MenuBarVisibility | undefined;

	// TODO@electron workaround for https://github.com/electron/electron/issues/35360
	// where on macOS the window will report a wrong state for `isFullScreen()` while
	// transitioning into and out of native full screen.
	private transientIsNativeFullScreen: boolean | undefined = undefined;
	private joinNativeFullScreenTransition: DeferredPromise<void> | undefined = undefined;

	private representedFilename: string | undefined;
	private documentEdited: boolean | undefined;

	private readonly hasWindowControlOverlay: boolean = false;

	private readonly whenReadyCallbacks: { (window: ICodeWindow): void }[] = [];

	private readonly touchBarGroups: TouchBarSegmentedControl[] = [];

	private currentHttpProxy: string | undefined = undefined;
	private currentNoProxy: string | undefined = undefined;

	private readonly configObjectUrl = this._register(this.protocolMainService.createIPCObjectUrl<INativeWindowConfiguration>());
	private pendingLoadConfig: INativeWindowConfiguration | undefined;
	private wasLoaded = false;

	constructor(
		config: IWindowCreationOptions,
		@ILogService private readonly logService: ILogService,
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IPolicyService private readonly policyService: IPolicyService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@IFileService private readonly fileService: IFileService,
		@IApplicationStorageMainService private readonly applicationStorageMainService: IApplicationStorageMainService,
		@IStorageMainService private readonly storageMainService: IStorageMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IProductService private readonly productService: IProductService,
		@IProtocolMainService private readonly protocolMainService: IProtocolMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IStateMainService private readonly stateMainService: IStateMainService
	) {
		super();

		//#region create browser window
		{
			// Load window state
			const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
			this.windowState = state;
			this.logService.trace('window#ctor: using window state', state);

			// In case we are maximized or fullscreen, only show later
			// after the call to maximize/fullscreen (see below)
			const isFullscreenOrMaximized = (this.windowState.mode === WindowMode.Maximized || this.windowState.mode === WindowMode.Fullscreen);

			const windowSettings = this.configurationService.getValue<IWindowSettings | undefined>('window');

			let useSandbox = false;
			if (typeof windowSettings?.experimental?.useSandbox === 'boolean') {
				useSandbox = windowSettings.experimental.useSandbox;
			} else {
				useSandbox = typeof product.quality === 'string' && product.quality !== 'stable';
			}

			const options: BrowserWindowConstructorOptions & { experimentalDarkMode: boolean } = {
				width: this.windowState.width,
				height: this.windowState.height,
				x: this.windowState.x,
				y: this.windowState.y,
				backgroundColor: this.themeMainService.getBackgroundColor(),
				minWidth: WindowMinimumSize.WIDTH,
				minHeight: WindowMinimumSize.HEIGHT,
				show: !isFullscreenOrMaximized, // reduce flicker by showing later
				title: this.productService.nameLong,
				webPreferences: {
					preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js', require).fsPath,
					additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
					v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
					enableWebSQL: false,
					spellcheck: false,
					zoomFactor: zoomLevelToZoomFactor(windowSettings?.zoomLevel),
					// Enable experimental css highlight api https://chromestatus.com/feature/5436441440026624
					// Refs https://github.com/microsoft/vscode/issues/140098
					enableBlinkFeatures: 'HighlightAPI',
					...useSandbox ?

						// Sandbox
						{
							sandbox: true
						} :

						// No Sandbox
						{
							nodeIntegration: true,
							contextIsolation: false
						}
				},
				experimentalDarkMode: true
			};

			// Apply icon to window
			// Linux: always
			// Windows: only when running out of sources, otherwise an icon is set by us on the executable
			if (isLinux) {
				options.icon = join(this.environmentMainService.appRoot, 'resources/linux/code.png');
			} else if (isWindows && !this.environmentMainService.isBuilt) {
				options.icon = join(this.environmentMainService.appRoot, 'resources/win32/code_150x150.png');
			}

			if (isMacintosh && !this.useNativeFullScreen()) {
				options.fullscreenable = false; // enables simple fullscreen mode
			}

			if (isMacintosh) {
				options.acceptFirstMouse = true; // enabled by default

				if (windowSettings?.clickThroughInactive === false) {
					options.acceptFirstMouse = false;
				}
			}

			const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
			if (useNativeTabs) {
				options.tabbingIdentifier = this.productService.nameShort; // this opts in to sierra tabs
			}

			const useCustomTitleStyle = getTitleBarStyle(this.configurationService) === 'custom';
			if (useCustomTitleStyle) {
				options.titleBarStyle = 'hidden';
				if (!isMacintosh) {
					options.frame = false;
				}

				if (useWindowControlsOverlay(this.configurationService, this.environmentMainService)) {

					// This logic will not perfectly guess the right colors
					// to use on initialization, but prefer to keep things
					// simple as it is temporary and not noticeable

					const titleBarColor = this.themeMainService.getWindowSplash()?.colorInfo.titleBarBackground ?? this.themeMainService.getBackgroundColor();
					const symbolColor = Color.fromHex(titleBarColor).isDarker() ? '#FFFFFF' : '#000000';

					options.titleBarOverlay = {
						height: 29, // the smallest size of the title bar on windows accounting for the border on windows 11
						color: titleBarColor,
						symbolColor
					};

					this.hasWindowControlOverlay = true;
				}
			}

			// Create the browser window
			mark('code/willCreateCodeBrowserWindow');
			this._win = new BrowserWindow(options);
			mark('code/didCreateCodeBrowserWindow');

			this._id = this._win.id;

			if (isMacintosh && useCustomTitleStyle) {
				this._win.setSheetOffset(22); // offset dialogs by the height of the custom title bar if we have any
			}

			// Update the window controls immediately based on cached values
			if (useCustomTitleStyle && ((isWindows && useWindowControlsOverlay(this.configurationService, this.environmentMainService)) || isMacintosh)) {
				const cachedWindowControlHeight = this.stateMainService.getItem<number>((CodeWindow.windowControlHeightStateStorageKey));
				if (cachedWindowControlHeight) {
					this.updateWindowControls({ height: cachedWindowControlHeight });
				}
			}

			// Windows Custom System Context Menu
			// See https://github.com/electron/electron/issues/24893
			//
			// The purpose of this is to allow for the context menu in the Windows Title Bar
			//
			// Currently, all mouse events in the title bar are captured by the OS
			// thus we need to capture them here with a window hook specific to Windows
			// and then forward them to the correct window.
			if (isWindows && useCustomTitleStyle) {
				const WM_INITMENU = 0x0116; // https://docs.microsoft.com/en-us/windows/win32/menurc/wm-initmenu

				// This sets up a listener for the window hook. This is a Windows-only API provided by electron.
				this._win.hookWindowMessage(WM_INITMENU, () => {
					const [x, y] = this._win.getPosition();
					const cursorPos = screen.getCursorScreenPoint();
					const cx = cursorPos.x - x;
					const cy = cursorPos.y - y;

					// In some cases, show the default system context menu
					// 1) The mouse position is not within the title bar
					// 2) The mouse position is within the title bar, but over the app icon
					// We do not know the exact title bar height but we make an estimate based on window height
					const shouldTriggerDefaultSystemContextMenu = () => {
						// Use the custom context menu when over the title bar, but not over the app icon
						// The app icon is estimated to be 30px wide
						// The title bar is estimated to be the max of 35px and 15% of the window height
						if (cx > 30 && cy >= 0 && cy <= Math.max(this._win.getBounds().height * 0.15, 35)) {
							return false;
						}

						return true;
					};

					if (!shouldTriggerDefaultSystemContextMenu()) {
						// This is necessary to make sure the native system context menu does not show up.
						this._win.setEnabled(false);
						this._win.setEnabled(true);

						this._onDidTriggerSystemContextMenu.fire({ x: cx, y: cy });
					}

					return 0;
				});
			}

			// TODO@electron (Electron 4 regression): when running on multiple displays where the target display
			// to open the window has a larger resolution than the primary display, the window will not size
			// correctly unless we set the bounds again (https://github.com/microsoft/vscode/issues/74872)
			//
			// Extended to cover Windows as well as Mac (https://github.com/microsoft/vscode/issues/146499)
			//
			// However, when running with native tabs with multiple windows we cannot use this workaround
			// because there is a potential that the new window will be added as native tab instead of being
			// a window on its own. In that case calling setBounds() would cause https://github.com/microsoft/vscode/issues/75830
			if ((isMacintosh || isWindows) && hasMultipleDisplays && (!useNativeTabs || BrowserWindow.getAllWindows().length === 1)) {
				if ([this.windowState.width, this.windowState.height, this.windowState.x, this.windowState.y].every(value => typeof value === 'number')) {
					this._win.setBounds({
						width: this.windowState.width,
						height: this.windowState.height,
						x: this.windowState.x,
						y: this.windowState.y
					});
				}
			}

			if (isFullscreenOrMaximized) {
				mark('code/willMaximizeCodeWindow');

				// this call may or may not show the window, depends
				// on the platform: currently on Windows and Linux will
				// show the window as active. To be on the safe side,
				// we show the window at the end of this block.
				this._win.maximize();

				if (this.windowState.mode === WindowMode.Fullscreen) {
					this.setFullScreen(true);
				}

				// to reduce flicker from the default window size
				// to maximize or fullscreen, we only show after
				this._win.show();
				mark('code/didMaximizeCodeWindow');
			}

			this._lastFocusTime = Date.now(); // since we show directly, we need to set the last focus time too
		}
		//#endregion

		// Open devtools if instructed from command line args
		if (this.environmentMainService.args['open-devtools'] === true) {
			this._win.webContents.openDevTools();
		}

		// respect configured menu bar visibility
		this.onConfigurationUpdated();

		// macOS: touch bar support
		this.createTouchBar();

		// Eventing
		this.registerListeners();
	}

	setRepresentedFilename(filename: string): void {
		if (isMacintosh) {
			this._win.setRepresentedFilename(filename);
		} else {
			this.representedFilename = filename;
		}
	}

	getRepresentedFilename(): string | undefined {
		if (isMacintosh) {
			return this._win.getRepresentedFilename();
		}

		return this.representedFilename;
	}

	setDocumentEdited(edited: boolean): void {
		if (isMacintosh) {
			this._win.setDocumentEdited(edited);
		}

		this.documentEdited = edited;
	}

	isDocumentEdited(): boolean {
		if (isMacintosh) {
			return this._win.isDocumentEdited();
		}

		return !!this.documentEdited;
	}

	focus(options?: { force: boolean }): void {
		// macOS: Electron > 7.x changed its behaviour to not
		// bring the application to the foreground when a window
		// is focused programmatically. Only via `app.focus` and
		// the option `steal: true` can you get the previous
		// behaviour back. The only reason to use this option is
		// when a window is getting focused while the application
		// is not in the foreground.
		if (isMacintosh && options?.force) {
			app.focus({ steal: true });
		}

		if (!this._win) {
			return;
		}

		if (this._win.isMinimized()) {
			this._win.restore();
		}

		this._win.focus();
	}

	private readyState = ReadyState.NONE;

	setReady(): void {
		this.logService.trace(`window#load: window reported ready (id: ${this._id})`);

		this.readyState = ReadyState.READY;

		// inform all waiting promises that we are ready now
		while (this.whenReadyCallbacks.length) {
			this.whenReadyCallbacks.pop()!(this);
		}

		// Events
		this._onDidSignalReady.fire();
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
		return this.readyState === ReadyState.READY;
	}

	get whenClosedOrLoaded(): Promise<void> {
		return new Promise<void>(resolve => {

			function handle() {
				closeListener.dispose();
				loadListener.dispose();

				resolve();
			}

			const closeListener = this.onDidClose(() => handle());
			const loadListener = this.onWillLoad(() => handle());
		});
	}

	private registerListeners(): void {

		// Window error conditions to handle
		this._win.on('unresponsive', () => this.onWindowError(WindowError.UNRESPONSIVE));
		this._win.webContents.on('render-process-gone', (event, details) => this.onWindowError(WindowError.PROCESS_GONE, details));
		this._win.webContents.on('did-fail-load', (event, exitCode, reason) => this.onWindowError(WindowError.LOAD, { reason, exitCode }));

		// Prevent windows/iframes from blocking the unload
		// through DOM events. We have our own logic for
		// unloading a window that should not be confused
		// with the DOM way.
		// (https://github.com/microsoft/vscode/issues/122736)
		this._win.webContents.on('will-prevent-unload', event => {
			event.preventDefault();
		});

		// Window close
		this._win.on('closed', () => {
			this._onDidClose.fire();

			this.dispose();
		});

		// Remember that we loaded
		this._win.webContents.on('did-finish-load', () => {

			// Associate properties from the load request if provided
			if (this.pendingLoadConfig) {
				this._config = this.pendingLoadConfig;

				this.pendingLoadConfig = undefined;
			}
		});

		// Window Focus
		this._win.on('focus', () => {
			this._lastFocusTime = Date.now();
		});

		// Window (Un)Maximize
		this._win.on('maximize', (e: ElectronEvent) => {
			if (this._config) {
				this._config.maximized = true;
			}

			app.emit('browser-window-maximize', e, this._win);
		});

		this._win.on('unmaximize', (e: ElectronEvent) => {
			if (this._config) {
				this._config.maximized = false;
			}

			app.emit('browser-window-unmaximize', e, this._win);
		});

		// Window Fullscreen
		this._win.on('enter-full-screen', () => {
			this.sendWhenReady('vscode:enterFullScreen', CancellationToken.None);

			this.joinNativeFullScreenTransition?.complete();
			this.joinNativeFullScreenTransition = undefined;
		});

		this._win.on('leave-full-screen', () => {
			this.sendWhenReady('vscode:leaveFullScreen', CancellationToken.None);

			this.joinNativeFullScreenTransition?.complete();
			this.joinNativeFullScreenTransition = undefined;
		});

		// Handle configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		// Handle Workspace events
		this._register(this.workspacesManagementMainService.onDidDeleteUntitledWorkspace(e => this.onDidDeleteUntitledWorkspace(e)));

		// Inject headers when requests are incoming
		const urls = ['https://marketplace.visualstudio.com/*', 'https://*.vsassets.io/*'];
		this._win.webContents.session.webRequest.onBeforeSendHeaders({ urls }, async (details, cb) => {
			const headers = await this.getMarketplaceHeaders();

			cb({ cancel: false, requestHeaders: Object.assign(details.requestHeaders, headers) });
		});
	}

	private marketplaceHeadersPromise: Promise<object> | undefined;
	private getMarketplaceHeaders(): Promise<object> {
		if (!this.marketplaceHeadersPromise) {
			this.marketplaceHeadersPromise = resolveMarketplaceHeaders(
				this.productService.version,
				this.productService,
				this.environmentMainService,
				this.configurationService,
				this.fileService,
				this.applicationStorageMainService,
				this.telemetryService);
		}

		return this.marketplaceHeadersPromise;
	}

	private async onWindowError(error: WindowError.UNRESPONSIVE): Promise<void>;
	private async onWindowError(error: WindowError.PROCESS_GONE, details: { reason: string; exitCode: number }): Promise<void>;
	private async onWindowError(error: WindowError.LOAD, details: { reason: string; exitCode: number }): Promise<void>;
	private async onWindowError(type: WindowError, details?: { reason: string; exitCode: number }): Promise<void> {

		switch (type) {
			case WindowError.PROCESS_GONE:
				this.logService.error(`CodeWindow: renderer process gone (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
				break;
			case WindowError.UNRESPONSIVE:
				this.logService.error('CodeWindow: detected unresponsive');
				break;
			case WindowError.LOAD:
				this.logService.error(`CodeWindow: failed to load (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
				break;
		}

		// Telemetry
		type WindowErrorClassification = {
			type: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The type of window error to understand the nature of the error better.' };
			reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The reason of the window error to understand the nature of the error better.' };
			code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'The exit code of the window process to understand the nature of the error better' };
			owner: 'bpasero';
			comment: 'Provides insight into reasons the vscode window had an error.';
		};
		type WindowErrorEvent = {
			type: WindowError;
			reason: string | undefined;
			code: number | undefined;
		};
		this.telemetryService.publicLog2<WindowErrorEvent, WindowErrorClassification>('windowerror', { type, reason: details?.reason, code: details?.exitCode });

		// Inform User if non-recoverable
		switch (type) {
			case WindowError.UNRESPONSIVE:
			case WindowError.PROCESS_GONE:

				// If we run extension tests from CLI, we want to signal
				// back this state to the test runner by exiting with a
				// non-zero exit code.
				if (this.isExtensionDevelopmentTestFromCli) {
					this.lifecycleMainService.kill(1);
					return;
				}

				// If we run smoke tests, want to proceed with an orderly
				// shutdown as much as possible by destroying the window
				// and then calling the normal `quit` routine.
				if (this.environmentMainService.args['enable-smoke-test-driver']) {
					await this.destroyWindow(false, false);
					this.lifecycleMainService.quit(); // still allow for an orderly shutdown
					return;
				}

				// Unresponsive
				if (type === WindowError.UNRESPONSIVE) {
					if (this.isExtensionDevelopmentHost || this.isExtensionTestHost || (this._win && this._win.webContents && this._win.webContents.isDevToolsOpened())) {
						// TODO@electron Workaround for https://github.com/microsoft/vscode/issues/56994
						// In certain cases the window can report unresponsiveness because a breakpoint was hit
						// and the process is stopped executing. The most typical cases are:
						// - devtools are opened and debugging happens
						// - window is an extensions development host that is being debugged
						// - window is an extension test development host that is being debugged
						return;
					}

					// Show Dialog
					const result = await this.dialogMainService.showMessageBox({
						title: this.productService.nameLong,
						type: 'warning',
						buttons: [
							mnemonicButtonLabel(localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen")),
							mnemonicButtonLabel(localize({ key: 'wait', comment: ['&& denotes a mnemonic'] }, "&&Keep Waiting")),
							mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))
						],
						message: localize('appStalled', "The window is not responding"),
						detail: localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
						noLink: true,
						defaultId: 0,
						cancelId: 1,
						checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
					}, this._win);

					// Handle choice
					if (result.response !== 1 /* keep waiting */) {
						const reopen = result.response === 0;
						await this.destroyWindow(reopen, result.checkboxChecked);
					}
				}

				// Process gone
				else if (type === WindowError.PROCESS_GONE) {
					let message: string;
					if (!details) {
						message = localize('appGone', "The window terminated unexpectedly");
					} else {
						message = localize('appGoneDetails', "The window terminated unexpectedly (reason: '{0}', code: '{1}')", details.reason, details.exitCode ?? '<unknown>');
					}

					// Show Dialog
					const result = await this.dialogMainService.showMessageBox({
						title: this.productService.nameLong,
						type: 'warning',
						buttons: [
							mnemonicButtonLabel(localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen")),
							mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))
						],
						message,
						detail: localize('appGoneDetail', "We are sorry for the inconvenience. You can reopen the window to continue where you left off."),
						noLink: true,
						defaultId: 0,
						checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
					}, this._win);

					// Handle choice
					const reopen = result.response === 0;
					await this.destroyWindow(reopen, result.checkboxChecked);
				}
				break;
		}
	}

	private async destroyWindow(reopen: boolean, skipRestoreEditors: boolean): Promise<void> {
		const workspace = this._config?.workspace;

		//  check to discard editor state first
		if (skipRestoreEditors && workspace) {
			try {
				const workspaceStorage = this.storageMainService.workspaceStorage(workspace);
				await workspaceStorage.init();
				workspaceStorage.delete('memento/workbench.parts.editor');
				await workspaceStorage.close();
			} catch (error) {
				this.logService.error(error);
			}
		}

		// 'close' event will not be fired on destroy(), so signal crash via explicit event
		this._onDidDestroy.fire();

		// make sure to destroy the window as its renderer process is gone
		this._win?.destroy();

		// ask the windows service to open a new fresh window if specified
		if (reopen && this._config) {

			// We have to reconstruct a openable from the current workspace
			let uriToOpen: IWorkspaceToOpen | IFolderToOpen | undefined = undefined;
			let forceEmpty = undefined;
			if (isSingleFolderWorkspaceIdentifier(workspace)) {
				uriToOpen = { folderUri: workspace.uri };
			} else if (isWorkspaceIdentifier(workspace)) {
				uriToOpen = { workspaceUri: workspace.configPath };
			} else {
				forceEmpty = true;
			}

			// Delegate to windows service
			const [window] = await this.windowsMainService.open({
				context: OpenContext.API,
				userEnv: this._config.userEnv,
				cli: {
					...this.environmentMainService.args,
					_: [] // we pass in the workspace to open explicitly via `urisToOpen`
				},
				urisToOpen: uriToOpen ? [uriToOpen] : undefined,
				forceEmpty,
				forceNewWindow: true,
				remoteAuthority: this.remoteAuthority
			});
			window.focus();
		}
	}

	private onDidDeleteUntitledWorkspace(workspace: IWorkspaceIdentifier): void {

		// Make sure to update our workspace config if we detect that it
		// was deleted
		if (this._config?.workspace?.id === workspace.id) {
			this._config.workspace = undefined;
		}
	}

	private onConfigurationUpdated(e?: IConfigurationChangeEvent): void {

		// Menubar
		const newMenuBarVisibility = this.getMenuBarVisibility();
		if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
			this.currentMenuBarVisibility = newMenuBarVisibility;
			this.setMenuBarVisibility(newMenuBarVisibility);
		}

		// Proxy
		let newHttpProxy = (this.configurationService.getValue<string>('http.proxy') || '').trim()
			|| (process.env['https_proxy'] || process.env['HTTPS_PROXY'] || process.env['http_proxy'] || process.env['HTTP_PROXY'] || '').trim() // Not standardized.
			|| undefined;

		if (newHttpProxy?.endsWith('/')) {
			newHttpProxy = newHttpProxy.substr(0, newHttpProxy.length - 1);
		}

		const newNoProxy = (process.env['no_proxy'] || process.env['NO_PROXY'] || '').trim() || undefined; // Not standardized.
		if ((newHttpProxy || '').indexOf('@') === -1 && (newHttpProxy !== this.currentHttpProxy || newNoProxy !== this.currentNoProxy)) {
			this.currentHttpProxy = newHttpProxy;
			this.currentNoProxy = newNoProxy;

			const proxyRules = newHttpProxy || '';
			const proxyBypassRules = newNoProxy ? `${newNoProxy},<local>` : '<local>';
			this.logService.trace(`Setting proxy to '${proxyRules}', bypassing '${proxyBypassRules}'`);
			this._win.webContents.session.setProxy({ proxyRules, proxyBypassRules, pacScript: '' });
		}
	}

	addTabbedWindow(window: ICodeWindow): void {
		if (isMacintosh && window.win) {
			this._win.addTabbedWindow(window.win);
		}
	}

	load(configuration: INativeWindowConfiguration, options: ILoadOptions = Object.create(null)): void {
		this.logService.trace(`window#load: attempt to load window (id: ${this._id})`);

		// Clear Document Edited if needed
		if (this.isDocumentEdited()) {
			if (!options.isReload || !this.backupMainService.isHotExitEnabled()) {
				this.setDocumentEdited(false);
			}
		}

		// Clear Title and Filename if needed
		if (!options.isReload) {
			if (this.getRepresentedFilename()) {
				this.setRepresentedFilename('');
			}

			this._win.setTitle(this.productService.nameLong);
		}

		// Update configuration values based on our window context
		// and set it into the config object URL for usage.
		this.updateConfiguration(configuration, options);

		// If this is the first time the window is loaded, we associate the paths
		// directly with the window because we assume the loading will just work
		if (this.readyState === ReadyState.NONE) {
			this._config = configuration;
		}

		// Otherwise, the window is currently showing a folder and if there is an
		// unload handler preventing the load, we cannot just associate the paths
		// because the loading might be vetoed. Instead we associate it later when
		// the window load event has fired.
		else {
			this.pendingLoadConfig = configuration;
		}

		// Indicate we are navigting now
		this.readyState = ReadyState.NAVIGATING;

		// Load URL
		this._win.loadURL(FileAccess.asBrowserUri('vs/code/electron-sandbox/workbench/workbench.html', require).toString(true));

		// Remember that we did load
		const wasLoaded = this.wasLoaded;
		this.wasLoaded = true;

		// Make window visible if it did not open in N seconds because this indicates an error
		// Only do this when running out of sources and not when running tests
		if (!this.environmentMainService.isBuilt && !this.environmentMainService.extensionTestsLocationURI) {
			this._register(new RunOnceScheduler(() => {
				if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
					this._win.show();
					this.focus({ force: true });
					this._win.webContents.openDevTools();
				}
			}, 10000)).schedule();
		}

		// Event
		this._onWillLoad.fire({ workspace: configuration.workspace, reason: options.isReload ? LoadReason.RELOAD : wasLoaded ? LoadReason.LOAD : LoadReason.INITIAL });
	}

	private updateConfiguration(configuration: INativeWindowConfiguration, options: ILoadOptions): void {

		// If this window was loaded before from the command line
		// (as indicated by VSCODE_CLI environment), make sure to
		// preserve that user environment in subsequent loads,
		// unless the new configuration context was also a CLI
		// (for https://github.com/microsoft/vscode/issues/108571)
		// Also, preserve the environment if we're loading from an
		// extension development host that had its environment set
		// (for https://github.com/microsoft/vscode/issues/123508)
		const currentUserEnv = (this._config ?? this.pendingLoadConfig)?.userEnv;
		if (currentUserEnv) {
			const shouldPreserveLaunchCliEnvironment = isLaunchedFromCli(currentUserEnv) && !isLaunchedFromCli(configuration.userEnv);
			const shouldPreserveDebugEnvironmnet = this.isExtensionDevelopmentHost;
			if (shouldPreserveLaunchCliEnvironment || shouldPreserveDebugEnvironmnet) {
				configuration.userEnv = { ...currentUserEnv, ...configuration.userEnv }; // still allow to override certain environment as passed in
			}
		}

		// If named pipe was instantiated for the crashpad_handler process, reuse the same
		// pipe for new app instances connecting to the original app instance.
		// Ref: https://github.com/microsoft/vscode/issues/115874
		if (process.env['CHROME_CRASHPAD_PIPE_NAME']) {
			Object.assign(configuration.userEnv, {
				CHROME_CRASHPAD_PIPE_NAME: process.env['CHROME_CRASHPAD_PIPE_NAME']
			});
		}

		// Add disable-extensions to the config, but do not preserve it on currentConfig or
		// pendingLoadConfig so that it is applied only on this load
		if (options.disableExtensions !== undefined) {
			configuration['disable-extensions'] = options.disableExtensions;
		}

		// Update window related properties
		configuration.fullscreen = this.isFullScreen;
		configuration.maximized = this._win.isMaximized();
		configuration.partsSplash = this.themeMainService.getWindowSplash();

		// Update with latest perf marks
		mark('code/willOpenNewWindow');
		configuration.perfMarks = getMarks();

		// Update in config object URL for usage in renderer
		this.configObjectUrl.update(configuration);
	}

	async reload(cli?: NativeParsedArgs): Promise<void> {

		// Copy our current config for reuse
		const configuration = Object.assign({}, this._config);

		// Validate workspace
		configuration.workspace = await this.validateWorkspaceBeforeReload(configuration);

		// Delete some properties we do not want during reload
		delete configuration.filesToOpenOrCreate;
		delete configuration.filesToDiff;
		delete configuration.filesToMerge;
		delete configuration.filesToWait;

		// Some configuration things get inherited if the window is being reloaded and we are
		// in extension development mode. These options are all development related.
		if (this.isExtensionDevelopmentHost && cli) {
			configuration.verbose = cli.verbose;
			configuration.debugId = cli.debugId;
			configuration.extensionEnvironment = cli.extensionEnvironment;
			configuration['inspect-extensions'] = cli['inspect-extensions'];
			configuration['inspect-brk-extensions'] = cli['inspect-brk-extensions'];
			configuration['extensions-dir'] = cli['extensions-dir'];
		}

		configuration.isInitialStartup = false; // since this is a reload
		configuration.policiesData = this.policyService.serialize(); // set policies data again
		configuration.profiles = {
			all: this.userDataProfilesService.profiles,
			profile: this.profile || this.userDataProfilesService.defaultProfile
		};

		// Load config
		this.load(configuration, { isReload: true, disableExtensions: cli?.['disable-extensions'] });
	}

	private async validateWorkspaceBeforeReload(configuration: INativeWindowConfiguration): Promise<IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined> {

		// Multi folder
		if (isWorkspaceIdentifier(configuration.workspace)) {
			const configPath = configuration.workspace.configPath;
			if (configPath.scheme === Schemas.file) {
				const workspaceExists = await this.fileService.exists(configPath);
				if (!workspaceExists) {
					return undefined;
				}
			}
		}

		// Single folder
		else if (isSingleFolderWorkspaceIdentifier(configuration.workspace)) {
			const uri = configuration.workspace.uri;
			if (uri.scheme === Schemas.file) {
				const folderExists = await this.fileService.exists(uri);
				if (!folderExists) {
					return undefined;
				}
			}
		}

		// Workspace is valid
		return configuration.workspace;
	}

	serializeWindowState(): IWindowState {
		if (!this._win) {
			return defaultWindowState();
		}

		// fullscreen gets special treatment
		if (this.isFullScreen) {
			let display: Display | undefined;
			try {
				display = screen.getDisplayMatching(this.getBounds());
			} catch (error) {
				// Electron has weird conditions under which it throws errors
				// e.g. https://github.com/microsoft/vscode/issues/100334 when
				// large numbers are passed in
			}

			const defaultState = defaultWindowState();

			const res = {
				mode: WindowMode.Fullscreen,
				display: display ? display.id : undefined,

				// Still carry over window dimensions from previous sessions
				// if we can compute it in fullscreen state.
				// does not seem possible in all cases on Linux for example
				// (https://github.com/microsoft/vscode/issues/58218) so we
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
			let bounds: Rectangle;
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

	updateWindowControls(options: { height?: number; backgroundColor?: string; foregroundColor?: string }): void {

		// Cache the height for speeds lookups on startup
		if (options.height) {
			this.stateMainService.setItem((CodeWindow.windowControlHeightStateStorageKey), options.height);
		}

		// Windows: window control overlay (WCO)
		if (isWindows && this.hasWindowControlOverlay) {
			this._win.setTitleBarOverlay({
				color: options.backgroundColor?.trim() === '' ? undefined : options.backgroundColor,
				symbolColor: options.foregroundColor?.trim() === '' ? undefined : options.foregroundColor,
				height: options.height ? options.height - 1 : undefined // account for window border
			});
		}

		// macOS: traffic lights
		else if (isMacintosh && options.height !== undefined) {
			this._win.setTrafficLightPosition({ x: 7, y: (options.height - 15) / 2 }); // 15px is the height of the traffic lights
		}
	}

	private restoreWindowState(state?: IWindowState): [IWindowState, boolean? /* has multiple displays */] {
		mark('code/willRestoreCodeWindowState');

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

		mark('code/didRestoreCodeWindowState');

		return [state || defaultWindowState(), hasMultipleDisplays];
	}

	private validateWindowState(state: IWindowState, displays: Display[]): IWindowState | undefined {
		this.logService.trace(`window#validateWindowState: validating window state on ${displays.length} display(s)`, state);

		if (
			typeof state.x !== 'number' ||
			typeof state.y !== 'number' ||
			typeof state.width !== 'number' ||
			typeof state.height !== 'number'
		) {
			this.logService.trace('window#validateWindowState: unexpected type of state values');

			return undefined;
		}

		if (state.width <= 0 || state.height <= 0) {
			this.logService.trace('window#validateWindowState: unexpected negative values');

			return undefined;
		}

		// Single Monitor: be strict about x/y positioning
		// macOS & Linux: these OS seem to be pretty good in ensuring that a window is never outside of it's bounds.
		// Windows: it is possible to have a window with a size that makes it fall out of the window. our strategy
		//          is to try as much as possible to keep the window in the monitor bounds. we are not as strict as
		//          macOS and Linux and allow the window to exceed the monitor bounds as long as the window is still
		//          some pixels (128) visible on the screen for the user to drag it back.
		if (displays.length === 1) {
			const displayWorkingArea = this.getWorkingArea(displays[0]);
			if (displayWorkingArea) {
				this.logService.trace('window#validateWindowState: 1 monitor working area', displayWorkingArea);

				function ensureStateInDisplayWorkingArea(): void {
					if (!state || typeof state.x !== 'number' || typeof state.y !== 'number' || !displayWorkingArea) {
						return;
					}

					if (state.x < displayWorkingArea.x) {
						// prevent window from falling out of the screen to the left
						state.x = displayWorkingArea.x;
					}

					if (state.y < displayWorkingArea.y) {
						// prevent window from falling out of the screen to the top
						state.y = displayWorkingArea.y;
					}
				}

				// ensure state is not outside display working area (top, left)
				ensureStateInDisplayWorkingArea();

				if (state.width > displayWorkingArea.width) {
					// prevent window from exceeding display bounds width
					state.width = displayWorkingArea.width;
				}

				if (state.height > displayWorkingArea.height) {
					// prevent window from exceeding display bounds height
					state.height = displayWorkingArea.height;
				}

				if (state.x > (displayWorkingArea.x + displayWorkingArea.width - 128)) {
					// prevent window from falling out of the screen to the right with
					// 128px margin by positioning the window to the far right edge of
					// the screen
					state.x = displayWorkingArea.x + displayWorkingArea.width - state.width;
				}

				if (state.y > (displayWorkingArea.y + displayWorkingArea.height - 128)) {
					// prevent window from falling out of the screen to the bottom with
					// 128px margin by positioning the window to the far bottom edge of
					// the screen
					state.y = displayWorkingArea.y + displayWorkingArea.height - state.height;
				}

				// again ensure state is not outside display working area
				// (it may have changed from the previous validation step)
				ensureStateInDisplayWorkingArea();
			}

			return state;
		}

		// Multi Montior (fullscreen): try to find the previously used display
		if (state.display && state.mode === WindowMode.Fullscreen) {
			const display = displays.find(d => d.id === state.display);
			if (display && typeof display.bounds?.x === 'number' && typeof display.bounds?.y === 'number') {
				this.logService.trace('window#validateWindowState: restoring fullscreen to previous display');

				const defaults = defaultWindowState(WindowMode.Fullscreen); // make sure we have good values when the user restores the window
				defaults.x = display.bounds.x; // carefull to use displays x/y position so that the window ends up on the correct monitor
				defaults.y = display.bounds.y;

				return defaults;
			}
		}

		// Multi Monitor (non-fullscreen): ensure window is within display bounds
		let display: Display | undefined;
		let displayWorkingArea: Rectangle | undefined;
		try {
			display = screen.getDisplayMatching({ x: state.x, y: state.y, width: state.width, height: state.height });
			displayWorkingArea = this.getWorkingArea(display);
		} catch (error) {
			// Electron has weird conditions under which it throws errors
			// e.g. https://github.com/microsoft/vscode/issues/100334 when
			// large numbers are passed in
		}

		if (
			display &&														// we have a display matching the desired bounds
			displayWorkingArea &&											// we have valid working area bounds
			state.x + state.width > displayWorkingArea.x &&					// prevent window from falling out of the screen to the left
			state.y + state.height > displayWorkingArea.y &&				// prevent window from falling out of the screen to the top
			state.x < displayWorkingArea.x + displayWorkingArea.width &&	// prevent window from falling out of the screen to the right
			state.y < displayWorkingArea.y + displayWorkingArea.height		// prevent window from falling out of the screen to the bottom
		) {
			this.logService.trace('window#validateWindowState: multi-monitor working area', displayWorkingArea);

			return state;
		}

		return undefined;
	}

	private getWorkingArea(display: Display): Rectangle | undefined {

		// Prefer the working area of the display to account for taskbars on the
		// desktop being positioned somewhere (https://github.com/microsoft/vscode/issues/50830).
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

	getBounds(): Rectangle {
		const [x, y] = this._win.getPosition();
		const [width, height] = this._win.getSize();

		return { x, y, width, height };
	}

	toggleFullScreen(): void {
		this.setFullScreen(!this.isFullScreen);
	}

	private setFullScreen(fullscreen: boolean): void {

		// Set fullscreen state
		if (this.useNativeFullScreen()) {
			this.setNativeFullScreen(fullscreen);
		} else {
			this.setSimpleFullScreen(fullscreen);
		}

		// Events
		this.sendWhenReady(fullscreen ? 'vscode:enterFullScreen' : 'vscode:leaveFullScreen', CancellationToken.None);

		// Respect configured menu bar visibility or default to toggle if not set
		if (this.currentMenuBarVisibility) {
			this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
		}
	}

	get isFullScreen(): boolean {
		if (isMacintosh && typeof this.transientIsNativeFullScreen === 'boolean') {
			return this.transientIsNativeFullScreen;
		}

		return this._win.isFullScreen() || this._win.isSimpleFullScreen();
	}

	private setNativeFullScreen(fullscreen: boolean): void {
		if (this._win.isSimpleFullScreen()) {
			this._win.setSimpleFullScreen(false);
		}

		this.doSetNativeFullScreen(fullscreen);
	}

	private doSetNativeFullScreen(fullscreen: boolean): void {
		if (isMacintosh) {
			this.transientIsNativeFullScreen = fullscreen;
			this.joinNativeFullScreenTransition = new DeferredPromise<void>();
			Promise.race([
				this.joinNativeFullScreenTransition.p,
				timeout(1000) // still timeout after some time in case we miss the event
			]).finally(() => this.transientIsNativeFullScreen = undefined);
		}

		this._win.setFullScreen(fullscreen);
	}

	private setSimpleFullScreen(fullscreen: boolean): void {
		if (this._win.isFullScreen()) {
			this.doSetNativeFullScreen(false);
		}

		this._win.setSimpleFullScreen(fullscreen);
		this._win.webContents.focus(); // workaround issue where focus is not going into window
	}

	private useNativeFullScreen(): boolean {
		const windowConfig = this.configurationService.getValue<IWindowSettings | undefined>('window');
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
		let menuBarVisibility = getMenuBarVisibility(this.configurationService);
		if (['visible', 'toggle', 'hidden'].indexOf(menuBarVisibility) < 0) {
			menuBarVisibility = 'classic';
		}

		return menuBarVisibility;
	}

	private setMenuBarVisibility(visibility: MenuBarVisibility, notify: boolean = true): void {
		if (isMacintosh) {
			return; // ignore for macOS platform
		}

		if (visibility === 'toggle') {
			if (notify) {
				this.send('vscode:showInfoMessage', localize('hiddenMenuBar', "You can still access the menu bar by pressing the Alt-key."));
			}
		}

		if (visibility === 'hidden') {
			// for some weird reason that I have no explanation for, the menu bar is not hiding when calling
			// this without timeout (see https://github.com/microsoft/vscode/issues/19777). there seems to be
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
		const isFullscreen = this.isFullScreen;

		switch (visibility) {
			case ('classic'):
				this._win.setMenuBarVisibility(!isFullscreen);
				this._win.autoHideMenuBar = isFullscreen;
				break;

			case ('visible'):
				this._win.setMenuBarVisibility(true);
				this._win.autoHideMenuBar = false;
				break;

			case ('toggle'):
				this._win.setMenuBarVisibility(false);
				this._win.autoHideMenuBar = true;
				break;

			case ('hidden'):
				this._win.setMenuBarVisibility(false);
				this._win.autoHideMenuBar = false;
				break;
		}
	}

	handleTitleDoubleClick(): void {

		// Respect system settings on mac with regards to title click on windows title
		if (isMacintosh) {
			const action = systemPreferences.getUserDefault('AppleActionOnDoubleClick', 'string');
			switch (action) {
				case 'Minimize':
					this._win.minimize();
					break;
				case 'None':
					break;
				case 'Maximize':
				default:
					if (this._win.isMaximized()) {
						this._win.unmaximize();
					} else {
						this._win.maximize();
					}
			}
		}

		// Linux/Windows: just toggle maximize/minimized state
		else {
			if (this._win.isMaximized()) {
				this._win.unmaximize();
			} else {
				this._win.maximize();
			}
		}
	}

	close(): void {
		this._win?.close();
	}

	sendWhenReady(channel: string, token: CancellationToken, ...args: any[]): void {
		if (this.isReady) {
			this.send(channel, ...args);
		} else {
			this.ready().then(() => {
				if (!token.isCancellationRequested) {
					this.send(channel, ...args);
				}
			});
		}
	}

	send(channel: string, ...args: any[]): void {
		if (this._win) {
			if (this._win.isDestroyed() || this._win.webContents.isDestroyed()) {
				this.logService.warn(`Sending IPC message to channel '${channel}' for window that is destroyed`);
				return;
			}

			try {
				this._win.webContents.send(channel, ...args);
			} catch (error) {
				this.logService.warn(`Error sending IPC message to channel '${channel}' of window ${this._id}: ${toErrorMessage(error)}`);
			}
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

	private createTouchBarGroup(items: ISerializableCommandAction[] = []): TouchBarSegmentedControl {

		// Group Segments
		const segments = this.createTouchBarGroupSegments(items);

		// Group Control
		const control = new TouchBar.TouchBarSegmentedControl({
			segments,
			mode: 'buttons',
			segmentStyle: 'automatic',
			change: (selectedIndex) => {
				this.sendWhenReady('vscode:runAction', CancellationToken.None, { id: (control.segments[selectedIndex] as ITouchBarSegment).id, from: 'touchbar' });
			}
		});

		return control;
	}

	private createTouchBarGroupSegments(items: ISerializableCommandAction[] = []): ITouchBarSegment[] {
		const segments: ITouchBarSegment[] = items.map(item => {
			let icon: NativeImage | undefined;
			if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dark?.scheme === Schemas.file) {
				icon = nativeImage.createFromPath(URI.revive(item.icon.dark).fsPath);
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

	override dispose(): void {
		super.dispose();

		this._win = null!; // Important to dereference the window object to allow for GC
	}
}
