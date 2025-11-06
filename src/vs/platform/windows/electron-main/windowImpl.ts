/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import electron, { BrowserWindowConstructorOptions, Display, screen } from 'electron';
import { DeferredPromise, RunOnceScheduler, timeout, Delayer } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { FileAccess, Schemas } from '../../../base/common/network.js';
import { getMarks, mark } from '../../../base/common/performance.js';
import { isBigSurOrNewer, isLinux, isMacintosh, isWindows } from '../../../base/common/platform.js';
import { URI } from '../../../base/common/uri.js';
import { localize } from '../../../nls.js';
import { release } from 'os';
import { ISerializableCommandAction } from '../../action/common/action.js';
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IConfigurationChangeEvent, IConfigurationService } from '../../configuration/common/configuration.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { NativeParsedArgs } from '../../environment/common/argv.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { isLaunchedFromCli } from '../../environment/node/argvHelper.js';
import { IFileService } from '../../files/common/files.js';
import { ILifecycleMainService } from '../../lifecycle/electron-main/lifecycleMainService.js';
import { ILogService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IIPCObjectUrl, IProtocolMainService } from '../../protocol/electron-main/protocol.js';
import { resolveMarketplaceHeaders } from '../../externalServices/common/marketplace.js';
import { IApplicationStorageMainService, IStorageMainService } from '../../storage/electron-main/storageMainService.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { ThemeIcon } from '../../../base/common/themables.js';
import { IThemeMainService } from '../../theme/electron-main/themeMainService.js';
import { getMenuBarVisibility, IFolderToOpen, INativeWindowConfiguration, IWindowSettings, IWorkspaceToOpen, MenuBarVisibility, hasNativeTitlebar, useNativeFullScreen, useWindowControlsOverlay, DEFAULT_CUSTOM_TITLEBAR_HEIGHT, TitlebarStyle, MenuSettings } from '../../window/common/window.js';
import { defaultBrowserWindowOptions, getAllWindowsExcludingOffscreen, IWindowsMainService, OpenContext, WindowStateValidator } from './windows.js';
import { ISingleFolderWorkspaceIdentifier, IWorkspaceIdentifier, isSingleFolderWorkspaceIdentifier, isWorkspaceIdentifier, toWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { IWorkspacesManagementMainService } from '../../workspaces/electron-main/workspacesManagementMainService.js';
import { IWindowState, ICodeWindow, ILoadEvent, WindowMode, WindowError, LoadReason, defaultWindowState, IBaseWindow } from '../../window/electron-main/window.js';
import { IPolicyService } from '../../policy/common/policy.js';
import { IUserDataProfile } from '../../userDataProfile/common/userDataProfile.js';
import { IStateService } from '../../state/node/state.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { ILoggerMainService } from '../../log/electron-main/loggerService.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { errorHandler } from '../../../base/common/errors.js';
import { FocusMode } from '../../native/common/native.js';

export interface IWindowCreationOptions {
	readonly state: IWindowState;
	readonly extensionDevelopmentPath?: string[];
	readonly isExtensionTestHost?: boolean;
}

interface ITouchBarSegment extends electron.SegmentedControlSegment {
	readonly id: string;
}

interface ILoadOptions {
	readonly isReload?: boolean;
	readonly disableExtensions?: boolean;
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

class DockBadgeManager {

	static readonly INSTANCE = new DockBadgeManager();

	private readonly windows = new Set<number>();

	acquireBadge(window: IBaseWindow): IDisposable {
		this.windows.add(window.id);

		electron.app.setBadgeCount(isLinux ? 1 /* only numbers supported */ : undefined /* generic dot */);

		return {
			dispose: () => {
				this.windows.delete(window.id);

				if (this.windows.size === 0) {
					electron.app.setBadgeCount(0);
				}
			}
		};
	}
}

export abstract class BaseWindow extends Disposable implements IBaseWindow {

	//#region Events

	private readonly _onDidClose = this._register(new Emitter<void>());
	readonly onDidClose = this._onDidClose.event;

	private readonly _onDidMaximize = this._register(new Emitter<void>());
	readonly onDidMaximize = this._onDidMaximize.event;

	private readonly _onDidUnmaximize = this._register(new Emitter<void>());
	readonly onDidUnmaximize = this._onDidUnmaximize.event;

	private readonly _onDidTriggerSystemContextMenu = this._register(new Emitter<{ x: number; y: number }>());
	readonly onDidTriggerSystemContextMenu = this._onDidTriggerSystemContextMenu.event;

	private readonly _onDidEnterFullScreen = this._register(new Emitter<void>());
	readonly onDidEnterFullScreen = this._onDidEnterFullScreen.event;

	private readonly _onDidLeaveFullScreen = this._register(new Emitter<void>());
	readonly onDidLeaveFullScreen = this._onDidLeaveFullScreen.event;

	private readonly _onDidChangeAlwaysOnTop = this._register(new Emitter<boolean>());
	readonly onDidChangeAlwaysOnTop = this._onDidChangeAlwaysOnTop.event;

	//#endregion

	abstract readonly id: number;

	protected _lastFocusTime = Date.now(); // window is shown on creation so take current time
	get lastFocusTime(): number { return this._lastFocusTime; }

	private maximizedWindowState: IWindowState | undefined;

	protected _win: electron.BrowserWindow | null = null;
	get win() { return this._win; }
	protected setWin(win: electron.BrowserWindow, options?: BrowserWindowConstructorOptions): void {
		this._win = win;

		// Window Events
		this._register(Event.fromNodeEventEmitter(win, 'maximize')(() => {
			if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this._win) {
				const [x, y] = this._win.getPosition();
				const [width, height] = this._win.getSize();

				this.maximizedWindowState = { mode: WindowMode.Maximized, width, height, x, y };
				this.logService.debug(`Saved maximized window ${this.id} display state:`, this.maximizedWindowState);
			}

			this._onDidMaximize.fire();
		}));
		this._register(Event.fromNodeEventEmitter(win, 'unmaximize')(() => {
			if (isWindows && this.environmentMainService.enableRDPDisplayTracking && this.maximizedWindowState) {
				this.maximizedWindowState = undefined;

				this.logService.debug(`Cleared maximized window ${this.id} state`);
			}

			this._onDidUnmaximize.fire();
		}));
		this._register(Event.fromNodeEventEmitter(win, 'closed')(() => {
			this._onDidClose.fire();

			this.dispose();
		}));
		this._register(Event.fromNodeEventEmitter(win, 'focus')(() => {
			this.clearNotifyFocus();

			this._lastFocusTime = Date.now();
		}));
		this._register(Event.fromNodeEventEmitter(this._win, 'enter-full-screen')(() => this._onDidEnterFullScreen.fire()));
		this._register(Event.fromNodeEventEmitter(this._win, 'leave-full-screen')(() => this._onDidLeaveFullScreen.fire()));
		this._register(Event.fromNodeEventEmitter(this._win, 'always-on-top-changed', (_, alwaysOnTop) => alwaysOnTop)(alwaysOnTop => this._onDidChangeAlwaysOnTop.fire(alwaysOnTop)));

		// Sheet Offsets
		const useCustomTitleStyle = !hasNativeTitlebar(this.configurationService, options?.titleBarStyle === 'hidden' ? TitlebarStyle.CUSTOM : undefined /* unknown */);
		if (isMacintosh && useCustomTitleStyle) {
			win.setSheetOffset(isBigSurOrNewer(release()) ? 28 : 22); // offset dialogs by the height of the custom title bar if we have any
		}

		// Update the window controls immediately based on cached or default values
		if (useCustomTitleStyle && useWindowControlsOverlay(this.configurationService)) {
			const cachedWindowControlHeight = this.stateService.getItem<number>((BaseWindow.windowControlHeightStateStorageKey));
			if (cachedWindowControlHeight) {
				this.updateWindowControls({ height: cachedWindowControlHeight });
			} else {
				this.updateWindowControls({ height: DEFAULT_CUSTOM_TITLEBAR_HEIGHT });
			}
		}

		// Setup windows/linux system context menu so it only is allowed over the app icon
		if ((isWindows || isLinux) && useCustomTitleStyle) {
			this._register(Event.fromNodeEventEmitter(win, 'system-context-menu', (event: Electron.Event, point: Electron.Point) => ({ event, point }))(e => {
				const [x, y] = win.getPosition();
				const cursorPos = electron.screen.screenToDipPoint(e.point);
				const cx = Math.floor(cursorPos.x) - x;
				const cy = Math.floor(cursorPos.y) - y;

				// TODO@bpasero TODO@deepak1556 workaround for https://github.com/microsoft/vscode/issues/250626
				// where showing the custom menu seems broken on Windows
				if (isLinux) {
					if (cx > 35 /* Cursor is beyond app icon in title bar */) {
						e.event.preventDefault();

						this._onDidTriggerSystemContextMenu.fire({ x: cx, y: cy });
					}
				}
			}));
		}

		// Open devtools if instructed from command line args
		if (this.environmentMainService.args['open-devtools'] === true) {
			win.webContents.openDevTools();
		}

		// macOS: Window Fullscreen Transitions
		if (isMacintosh) {
			this._register(this.onDidEnterFullScreen(() => {
				this.joinNativeFullScreenTransition?.complete(true);
			}));

			this._register(this.onDidLeaveFullScreen(() => {
				this.joinNativeFullScreenTransition?.complete(true);
			}));
		}

		if (isWindows && this.environmentMainService.enableRDPDisplayTracking) {
			// Handles the display-added event on Windows RDP multi-monitor scenarios.
			// This helps restore maximized windows to their correct monitor after RDP reconnection.
			// Refs https://github.com/electron/electron/issues/47016
			this._register(Event.fromNodeEventEmitter(screen, 'display-added', (event: Electron.Event, display: Display) => ({ event, display }))((e) => {
				this.onDisplayAdded(e.display);
			}));
		}
	}

	private onDisplayAdded(display: Display): void {
		const state = this.maximizedWindowState;
		if (state && this._win && WindowStateValidator.validateWindowStateOnDisplay(state, display)) {
			this.logService.debug(`Setting maximized window ${this.id} bounds to match newly added display`, state);

			this._win.setBounds(state);
		}
	}

	constructor(
		protected readonly configurationService: IConfigurationService,
		protected readonly stateService: IStateService,
		protected readonly environmentMainService: IEnvironmentMainService,
		protected readonly logService: ILogService
	) {
		super();
	}

	protected applyState(state: IWindowState, hasMultipleDisplays = electron.screen.getAllDisplays().length > 0): void {

		// TODO@electron (Electron 4 regression): when running on multiple displays where the target display
		// to open the window has a larger resolution than the primary display, the window will not size
		// correctly unless we set the bounds again (https://github.com/microsoft/vscode/issues/74872)
		//
		// Extended to cover Windows as well as Mac (https://github.com/microsoft/vscode/issues/146499)
		//
		// However, when running with native tabs with multiple windows we cannot use this workaround
		// because there is a potential that the new window will be added as native tab instead of being
		// a window on its own. In that case calling setBounds() would cause https://github.com/microsoft/vscode/issues/75830

		const windowSettings = this.configurationService.getValue<IWindowSettings | undefined>('window');
		const useNativeTabs = isMacintosh && windowSettings?.nativeTabs === true;
		if ((isMacintosh || isWindows) && hasMultipleDisplays && (!useNativeTabs || getAllWindowsExcludingOffscreen().length === 1)) {
			if ([state.width, state.height, state.x, state.y].every(value => typeof value === 'number')) {
				this._win?.setBounds({
					width: state.width,
					height: state.height,
					x: state.x,
					y: state.y
				});
			}
		}

		if (state.mode === WindowMode.Maximized || state.mode === WindowMode.Fullscreen) {

			// this call may or may not show the window, depends
			// on the platform: currently on Windows and Linux will
			// show the window as active. To be on the safe side,
			// we show the window at the end of this block.
			this._win?.maximize();

			if (state.mode === WindowMode.Fullscreen) {
				this.setFullScreen(true, true);
			}

			// to reduce flicker from the default window size
			// to maximize or fullscreen, we only show after
			this._win?.show();
		}
	}

	private representedFilename: string | undefined;

	setRepresentedFilename(filename: string): void {
		if (isMacintosh) {
			this.win?.setRepresentedFilename(filename);
		} else {
			this.representedFilename = filename;
		}
	}

	getRepresentedFilename(): string | undefined {
		if (isMacintosh) {
			return this.win?.getRepresentedFilename();
		}

		return this.representedFilename;
	}

	private documentEdited: boolean | undefined;

	setDocumentEdited(edited: boolean): void {
		if (isMacintosh) {
			this.win?.setDocumentEdited(edited);
		}

		this.documentEdited = edited;
	}

	isDocumentEdited(): boolean {
		if (isMacintosh) {
			return Boolean(this.win?.isDocumentEdited());
		}

		return !!this.documentEdited;
	}

	focus(options?: { mode: FocusMode }): void {
		switch (options?.mode ?? FocusMode.Transfer) {
			case FocusMode.Transfer:
				this.doFocusWindow();
				break;

			case FocusMode.Notify:
				this.showNotifyFocus();
				break;

			case FocusMode.Force:
				if (isMacintosh) {
					electron.app.focus({ steal: true });
				}
				this.doFocusWindow();
				break;
		}
	}

	private readonly notifyFocusDisposable = this._register(new MutableDisposable());

	private showNotifyFocus(): void {
		const disposables = new DisposableStore();
		this.notifyFocusDisposable.value = disposables;

		// Badge
		disposables.add(DockBadgeManager.INSTANCE.acquireBadge(this));

		// Flash/Bounce
		if (isWindows || isLinux) {
			this.win?.flashFrame(true);
			disposables.add(toDisposable(() => this.win?.flashFrame(false)));
		} else if (isMacintosh) {
			electron.app.dock?.bounce('informational');
		}
	}

	private clearNotifyFocus(): void {
		this.notifyFocusDisposable.clear();
	}

	private doFocusWindow() {
		const win = this.win;
		if (!win) {
			return;
		}

		if (win.isMinimized()) {
			win.restore();
		}

		win.focus();
	}

	//#region Window Control Overlays

	private static readonly windowControlHeightStateStorageKey = 'windowControlHeight';

	updateWindowControls(options: { height?: number; backgroundColor?: string; foregroundColor?: string }): void {
		const win = this.win;
		if (!win) {
			return;
		}

		// Cache the height for speeds lookups on startup
		if (options.height) {
			this.stateService.setItem((CodeWindow.windowControlHeightStateStorageKey), options.height);
		}

		// Windows/Linux: update window controls via setTitleBarOverlay()
		if (!isMacintosh && useWindowControlsOverlay(this.configurationService)) {
			win.setTitleBarOverlay({
				color: options.backgroundColor?.trim() === '' ? undefined : options.backgroundColor,
				symbolColor: options.foregroundColor?.trim() === '' ? undefined : options.foregroundColor,
				height: options.height ? options.height - 1 : undefined // account for window border
			});
		}

		// macOS: update window controls via setWindowButtonPosition()
		else if (isMacintosh && options.height !== undefined) {
			// The traffic lights have a height of 12px. There's an invisible margin
			// of 2px at the top and bottom, and 1px on the left and right. Therefore,
			// the height for centering is 12px + 2 * 2px = 16px. When the position
			// is set, the horizontal margin is offset to ensure the distance between
			// the traffic lights and the window frame is equal in both directions.
			const offset = Math.floor((options.height - 16) / 2);
			if (!offset) {
				win.setWindowButtonPosition(null);
			} else {
				win.setWindowButtonPosition({ x: offset + 1, y: offset });
			}
		}
	}

	//#endregion

	//#region Fullscreen

	private transientIsNativeFullScreen: boolean | undefined = undefined;
	private joinNativeFullScreenTransition: DeferredPromise<boolean> | undefined = undefined;

	toggleFullScreen(): void {
		this.setFullScreen(!this.isFullScreen, false);
	}

	protected setFullScreen(fullscreen: boolean, fromRestore: boolean): void {

		// Set fullscreen state
		if (useNativeFullScreen(this.configurationService)) {
			this.setNativeFullScreen(fullscreen, fromRestore);
		} else {
			this.setSimpleFullScreen(fullscreen);
		}
	}

	get isFullScreen(): boolean {
		if (isMacintosh && typeof this.transientIsNativeFullScreen === 'boolean') {
			return this.transientIsNativeFullScreen;
		}

		const win = this.win;
		const isFullScreen = win?.isFullScreen();
		const isSimpleFullScreen = win?.isSimpleFullScreen();

		return Boolean(isFullScreen || isSimpleFullScreen);
	}

	private setNativeFullScreen(fullscreen: boolean, fromRestore: boolean): void {
		const win = this.win;
		if (win?.isSimpleFullScreen()) {
			win?.setSimpleFullScreen(false);
		}

		this.doSetNativeFullScreen(fullscreen, fromRestore);
	}

	private doSetNativeFullScreen(fullscreen: boolean, fromRestore: boolean): void {
		if (isMacintosh) {

			// macOS: Electron windows report `false` for `isFullScreen()` for as long
			// as the fullscreen transition animation takes place. As such, we need to
			// listen to the transition events and carry around an intermediate state
			// for knowing if we are in fullscreen or not
			// Refs: https://github.com/electron/electron/issues/35360

			this.transientIsNativeFullScreen = fullscreen;

			const joinNativeFullScreenTransition = this.joinNativeFullScreenTransition = new DeferredPromise<boolean>();
			(async () => {
				const transitioned = await Promise.race([
					joinNativeFullScreenTransition.p,
					timeout(10000).then(() => false)
				]);

				if (this.joinNativeFullScreenTransition !== joinNativeFullScreenTransition) {
					return; // another transition was requested later
				}

				this.transientIsNativeFullScreen = undefined;
				this.joinNativeFullScreenTransition = undefined;

				// There is one interesting gotcha on macOS: when you are opening a new
				// window from a fullscreen window, that new window will immediately
				// open fullscreen and emit the `enter-full-screen` event even before we
				// reach this method. In that case, we actually will timeout after 10s
				// for detecting the transition and as such it is important that we only
				// signal to leave fullscreen if the window reports as not being in fullscreen.

				if (!transitioned && fullscreen && fromRestore && this.win && !this.win.isFullScreen()) {

					// We have seen requests for fullscreen failing eventually after some
					// time, for example when an OS update was performed and windows restore.
					// In those cases a user would find a window that is not in fullscreen
					// but also does not show any custom titlebar (and thus window controls)
					// because we think the window is in fullscreen.
					//
					// As a workaround in that case we emit a warning and leave fullscreen
					// so that at least the window controls are back.

					this.logService.warn('window: native macOS fullscreen transition did not happen within 10s from restoring');

					this._onDidLeaveFullScreen.fire();
				}
			})();
		}

		const win = this.win;
		win?.setFullScreen(fullscreen);
	}

	private setSimpleFullScreen(fullscreen: boolean): void {
		const win = this.win;
		if (win?.isFullScreen()) {
			this.doSetNativeFullScreen(false, false);
		}

		win?.setSimpleFullScreen(fullscreen);
		win?.webContents.focus(); // workaround issue where focus is not going into window
	}

	//#endregion

	abstract matches(webContents: electron.WebContents): boolean;

	override dispose(): void {
		super.dispose();

		this._win = null!; // Important to dereference the window object to allow for GC
	}
}

export class CodeWindow extends BaseWindow implements ICodeWindow {

	//#region Events

	private readonly _onWillLoad = this._register(new Emitter<ILoadEvent>());
	readonly onWillLoad = this._onWillLoad.event;

	private readonly _onDidSignalReady = this._register(new Emitter<void>());
	readonly onDidSignalReady = this._onDidSignalReady.event;

	private readonly _onDidDestroy = this._register(new Emitter<void>());
	readonly onDidDestroy = this._onDidDestroy.event;

	//#endregion


	//#region Properties

	private _id: number;
	get id(): number { return this._id; }

	protected override _win: electron.BrowserWindow;

	get backupPath(): string | undefined { return this._config?.backupPath; }

	get openedWorkspace(): IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined { return this._config?.workspace; }

	get profile(): IUserDataProfile | undefined {
		if (!this.config) {
			return undefined;
		}

		const profile = this.userDataProfilesService.profiles.find(profile => profile.id === this.config?.profiles.profile.id);
		if (this.isExtensionDevelopmentHost && profile) {
			return profile;
		}

		return this.userDataProfilesService.getProfileForWorkspace(this.config.workspace ?? toWorkspaceIdentifier(this.backupPath, this.isExtensionDevelopmentHost)) ?? this.userDataProfilesService.defaultProfile;
	}

	get remoteAuthority(): string | undefined { return this._config?.remoteAuthority; }

	private _config: INativeWindowConfiguration | undefined;
	get config(): INativeWindowConfiguration | undefined { return this._config; }

	get isExtensionDevelopmentHost(): boolean { return !!(this._config?.extensionDevelopmentPath); }

	get isExtensionTestHost(): boolean { return !!(this._config?.extensionTestsPath); }

	get isExtensionDevelopmentTestFromCli(): boolean { return this.isExtensionDevelopmentHost && this.isExtensionTestHost && !this._config?.debugId; }

	//#endregion

	private readonly windowState: IWindowState;
	private currentMenuBarVisibility: MenuBarVisibility | undefined;

	private readonly whenReadyCallbacks: { (window: ICodeWindow): void }[] = [];

	private readonly touchBarGroups: electron.TouchBarSegmentedControl[] = [];

	private currentHttpProxy: string | undefined = undefined;
	private currentNoProxy: string | undefined = undefined;

	private customZoomLevel: number | undefined = undefined;

	private readonly configObjectUrl: IIPCObjectUrl<INativeWindowConfiguration>;
	private pendingLoadConfig: INativeWindowConfiguration | undefined;
	private wasLoaded = false;

	private readonly jsCallStackMap: Map<string, number>;
	private readonly jsCallStackEffectiveSampleCount: number;
	private readonly jsCallStackCollector: Delayer<void>;
	private readonly jsCallStackCollectorStopScheduler: RunOnceScheduler;

	constructor(
		config: IWindowCreationOptions,
		@ILogService logService: ILogService,
		@ILoggerMainService private readonly loggerMainService: ILoggerMainService,
		@IEnvironmentMainService environmentMainService: IEnvironmentMainService,
		@IPolicyService private readonly policyService: IPolicyService,
		@IUserDataProfilesMainService private readonly userDataProfilesService: IUserDataProfilesMainService,
		@IFileService private readonly fileService: IFileService,
		@IApplicationStorageMainService private readonly applicationStorageMainService: IApplicationStorageMainService,
		@IStorageMainService private readonly storageMainService: IStorageMainService,
		@IConfigurationService configurationService: IConfigurationService,
		@IThemeMainService private readonly themeMainService: IThemeMainService,
		@IWorkspacesManagementMainService private readonly workspacesManagementMainService: IWorkspacesManagementMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService,
		@IProductService private readonly productService: IProductService,
		@IProtocolMainService protocolMainService: IProtocolMainService,
		@IWindowsMainService private readonly windowsMainService: IWindowsMainService,
		@IStateService stateService: IStateService,
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super(configurationService, stateService, environmentMainService, logService);

		//#region create browser window
		{
			this.configObjectUrl = this._register(protocolMainService.createIPCObjectUrl<INativeWindowConfiguration>());

			// Load window state
			const [state, hasMultipleDisplays] = this.restoreWindowState(config.state);
			this.windowState = state;
			this.logService.trace('window#ctor: using window state', state);

			const options = instantiationService.invokeFunction(defaultBrowserWindowOptions, this.windowState, undefined, {
				preload: FileAccess.asFileUri('vs/base/parts/sandbox/electron-browser/preload.js').fsPath,
				additionalArguments: [`--vscode-window-config=${this.configObjectUrl.resource.toString()}`],
				v8CacheOptions: this.environmentMainService.useCodeCache ? 'bypassHeatCheck' : 'none',
			});

			// Create the browser window
			mark('code/willCreateCodeBrowserWindow');
			this._win = new electron.BrowserWindow(options);
			mark('code/didCreateCodeBrowserWindow');

			this._id = this._win.id;
			this.setWin(this._win, options);

			// Apply some state after window creation
			this.applyState(this.windowState, hasMultipleDisplays);

			this._lastFocusTime = Date.now(); // since we show directly, we need to set the last focus time too
		}
		//#endregion

		//#region JS Callstack Collector

		let sampleInterval = parseInt(this.environmentMainService.args['unresponsive-sample-interval'] || '1000');
		let samplePeriod = parseInt(this.environmentMainService.args['unresponsive-sample-period'] || '15000');
		if (sampleInterval <= 0 || samplePeriod <= 0 || sampleInterval > samplePeriod) {
			this.logService.warn(`Invalid unresponsive sample interval (${sampleInterval}ms) or period (${samplePeriod}ms), using defaults.`);
			sampleInterval = 1000;
			samplePeriod = 15000;
		}

		this.jsCallStackMap = new Map<string, number>();
		this.jsCallStackEffectiveSampleCount = Math.round(samplePeriod / sampleInterval);
		this.jsCallStackCollector = this._register(new Delayer<void>(sampleInterval));
		this.jsCallStackCollectorStopScheduler = this._register(new RunOnceScheduler(() => {
			this.stopCollectingJScallStacks(); // Stop collecting after 15s max
		}, samplePeriod));

		//#endregion

		// respect configured menu bar visibility
		this.onConfigurationUpdated();

		// macOS: touch bar support
		this.createTouchBar();

		// Eventing
		this.registerListeners();
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
		this._register(Event.fromNodeEventEmitter(this._win, 'unresponsive')(() => this.onWindowError(WindowError.UNRESPONSIVE)));
		this._register(Event.fromNodeEventEmitter(this._win, 'responsive')(() => this.onWindowError(WindowError.RESPONSIVE)));
		this._register(Event.fromNodeEventEmitter(this._win.webContents, 'render-process-gone', (event, details) => details)(details => this.onWindowError(WindowError.PROCESS_GONE, { ...details })));
		this._register(Event.fromNodeEventEmitter(this._win.webContents, 'did-fail-load', (event, exitCode, reason) => ({ exitCode, reason }))(({ exitCode, reason }) => this.onWindowError(WindowError.LOAD, { reason, exitCode })));

		// Prevent windows/iframes from blocking the unload
		// through DOM events. We have our own logic for
		// unloading a window that should not be confused
		// with the DOM way.
		// (https://github.com/microsoft/vscode/issues/122736)
		this._register(Event.fromNodeEventEmitter<electron.Event>(this._win.webContents, 'will-prevent-unload')(event => event.preventDefault()));

		// Remember that we loaded
		this._register(Event.fromNodeEventEmitter(this._win.webContents, 'did-finish-load')(() => {

			// Associate properties from the load request if provided
			if (this.pendingLoadConfig) {
				this._config = this.pendingLoadConfig;

				this.pendingLoadConfig = undefined;
			}
		}));

		// Window (Un)Maximize
		this._register(this.onDidMaximize(() => {
			if (this._config) {
				this._config.maximized = true;
			}
		}));

		this._register(this.onDidUnmaximize(() => {
			if (this._config) {
				this._config.maximized = false;
			}
		}));

		// Window Fullscreen
		this._register(this.onDidEnterFullScreen(() => {
			this.sendWhenReady('vscode:enterFullScreen', CancellationToken.None);
		}));

		this._register(this.onDidLeaveFullScreen(() => {
			this.sendWhenReady('vscode:leaveFullScreen', CancellationToken.None);
		}));

		// Handle configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => this.onConfigurationUpdated(e)));

		// Handle Workspace events
		this._register(this.workspacesManagementMainService.onDidDeleteUntitledWorkspace(e => this.onDidDeleteUntitledWorkspace(e)));

		// Inject headers when requests are incoming
		const urls = ['https://*.vsassets.io/*'];
		if (this.productService.extensionsGallery?.serviceUrl) {
			const serviceUrl = URI.parse(this.productService.extensionsGallery.serviceUrl);
			urls.push(`${serviceUrl.scheme}://${serviceUrl.authority}/*`);
		}
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
	private async onWindowError(error: WindowError.RESPONSIVE): Promise<void>;
	private async onWindowError(error: WindowError.PROCESS_GONE, details: { reason: string; exitCode: number }): Promise<void>;
	private async onWindowError(error: WindowError.LOAD, details: { reason: string; exitCode: number }): Promise<void>;
	private async onWindowError(type: WindowError, details?: { reason?: string; exitCode?: number }): Promise<void> {

		switch (type) {
			case WindowError.PROCESS_GONE:
				this.logService.error(`CodeWindow: renderer process gone (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
				break;
			case WindowError.UNRESPONSIVE:
				this.logService.error('CodeWindow: detected unresponsive');
				break;
			case WindowError.RESPONSIVE:
				this.logService.error('CodeWindow: recovered from unresponsive');
				break;
			case WindowError.LOAD:
				this.logService.error(`CodeWindow: failed to load (reason: ${details?.reason || '<unknown>'}, code: ${details?.exitCode || '<unknown>'})`);
				break;
		}

		// Telemetry
		type WindowErrorClassification = {
			type: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The type of window error to understand the nature of the error better.' };
			reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The reason of the window error to understand the nature of the error better.' };
			code: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The exit code of the window process to understand the nature of the error better' };
			owner: 'bpasero';
			comment: 'Provides insight into reasons the vscode window had an error.';
		};
		type WindowErrorEvent = {
			type: WindowError;
			reason: string | undefined;
			code: number | undefined;
		};
		this.telemetryService.publicLog2<WindowErrorEvent, WindowErrorClassification>('windowerror', {
			type,
			reason: details?.reason,
			code: details?.exitCode
		});

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
					if (this.isExtensionDevelopmentHost || this.isExtensionTestHost || this._win?.webContents?.isDevToolsOpened()) {
						// TODO@electron Workaround for https://github.com/microsoft/vscode/issues/56994
						// In certain cases the window can report unresponsiveness because a breakpoint was hit
						// and the process is stopped executing. The most typical cases are:
						// - devtools are opened and debugging happens
						// - window is an extensions development host that is being debugged
						// - window is an extension test development host that is being debugged
						return;
					}

					// Interrupt V8 and collect JavaScript stack
					this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
					// Stack collection will stop under any of the following conditions:
					// - The window becomes responsive again
					// - The window is destroyed i-e reopen or closed
					// - sampling period is complete, default is 15s
					this.jsCallStackCollectorStopScheduler.schedule();

					// Show Dialog
					const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
						type: 'warning',
						buttons: [
							localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen"),
							localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"),
							localize({ key: 'wait', comment: ['&& denotes a mnemonic'] }, "&&Keep Waiting")
						],
						message: localize('appStalled', "The window is not responding"),
						detail: localize('appStalledDetail', "You can reopen or close the window or keep waiting."),
						checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
					}, this._win);

					// Handle choice
					if (response !== 2 /* keep waiting */) {
						const reopen = response === 0;
						this.stopCollectingJScallStacks();
						await this.destroyWindow(reopen, checkboxChecked);
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
					const { response, checkboxChecked } = await this.dialogMainService.showMessageBox({
						type: 'warning',
						buttons: [
							this._config?.workspace ? localize({ key: 'reopen', comment: ['&& denotes a mnemonic'] }, "&&Reopen") : localize({ key: 'newWindow', comment: ['&& denotes a mnemonic'] }, "&&New Window"),
							localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close")
						],
						message,
						detail: this._config?.workspace ?
							localize('appGoneDetailWorkspace', "We are sorry for the inconvenience. You can reopen the window to continue where you left off.") :
							localize('appGoneDetailEmptyWindow', "We are sorry for the inconvenience. You can open a new empty window to start again."),
						checkboxLabel: this._config?.workspace ? localize('doNotRestoreEditors', "Don't restore editors") : undefined
					}, this._win);

					// Handle choice
					const reopen = response === 0;
					await this.destroyWindow(reopen, checkboxChecked);
				}
				break;
			case WindowError.RESPONSIVE:
				this.stopCollectingJScallStacks();
				break;
		}
	}

	private async destroyWindow(reopen: boolean, skipRestoreEditors: boolean): Promise<void> {
		const workspace = this._config?.workspace;

		// check to discard editor state first
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

		try {
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
				const window = (await this.windowsMainService.open({
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
				})).at(0);
				window?.focus();
			}
		} finally {
			// make sure to destroy the window as its renderer process is gone. do this
			// after the code for reopening the window, to prevent the entire application
			// from quitting when the last window closes as a result.
			this._win?.destroy();
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
		if (!e || e.affectsConfiguration(MenuSettings.MenuBarVisibility)) {
			const newMenuBarVisibility = this.getMenuBarVisibility();
			if (newMenuBarVisibility !== this.currentMenuBarVisibility) {
				this.currentMenuBarVisibility = newMenuBarVisibility;
				this.setMenuBarVisibility(newMenuBarVisibility);
			}
		}

		// Proxy
		if (!e || e.affectsConfiguration('http.proxy') || e.affectsConfiguration('http.noProxy')) {
			const inspect = this.configurationService.inspect<string>('http.proxy');
			let newHttpProxy = (inspect.userLocalValue || '').trim()
				|| (process.env['https_proxy'] || process.env['HTTPS_PROXY'] || process.env['http_proxy'] || process.env['HTTP_PROXY'] || '').trim() // Not standardized.
				|| undefined;

			if (newHttpProxy?.indexOf('@') !== -1) {
				const uri = URI.parse(newHttpProxy!);
				const i = uri.authority.indexOf('@');
				if (i !== -1) {
					newHttpProxy = uri.with({ authority: uri.authority.substring(i + 1) })
						.toString();
				}
			}
			if (newHttpProxy?.endsWith('/')) {
				newHttpProxy = newHttpProxy.substr(0, newHttpProxy.length - 1);
			}

			const newNoProxy = (this.configurationService.getValue<string[]>('http.noProxy') || []).map((item) => item.trim()).join(',')
				|| (process.env['no_proxy'] || process.env['NO_PROXY'] || '').trim() || undefined; // Not standardized.
			if ((newHttpProxy || '').indexOf('@') === -1 && (newHttpProxy !== this.currentHttpProxy || newNoProxy !== this.currentNoProxy)) {
				this.currentHttpProxy = newHttpProxy;
				this.currentNoProxy = newNoProxy;

				const proxyRules = newHttpProxy || '';
				const proxyBypassRules = newNoProxy ? `${newNoProxy},<local>` : '<local>';
				this.logService.trace(`Setting proxy to '${proxyRules}', bypassing '${proxyBypassRules}'`);
				this._win.webContents.session.setProxy({ proxyRules, proxyBypassRules, pacScript: '' });
				electron.app.setProxy({ proxyRules, proxyBypassRules, pacScript: '' });
			}
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
		this._win.loadURL(FileAccess.asBrowserUri(`vs/code/electron-browser/workbench/workbench${this.environmentMainService.isBuilt ? '' : '-dev'}.html`).toString(true));

		// Remember that we did load
		const wasLoaded = this.wasLoaded;
		this.wasLoaded = true;

		// Make window visible if it did not open in N seconds because this indicates an error
		// Only do this when running out of sources and not when running tests
		if (!this.environmentMainService.isBuilt && !this.environmentMainService.extensionTestsLocationURI) {
			this._register(new RunOnceScheduler(() => {
				if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
					this._win.show();
					this.focus({ mode: FocusMode.Force });
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
		try {
			configuration.handle = VSBuffer.wrap(this._win.getNativeWindowHandle());
		} catch (error) {
			this.logService.error(`Error getting native window handle: ${error}`);
		}
		configuration.fullscreen = this.isFullScreen;
		configuration.maximized = this._win.isMaximized();
		configuration.partsSplash = this.themeMainService.getWindowSplash(configuration.workspace);
		configuration.zoomLevel = this.getZoomLevel();
		configuration.isCustomZoomLevel = typeof this.customZoomLevel === 'number';
		if (configuration.isCustomZoomLevel && configuration.partsSplash) {
			configuration.partsSplash.zoomLevel = configuration.zoomLevel;
		}

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

		configuration.accessibilitySupport = electron.app.isAccessibilitySupportEnabled();
		configuration.isInitialStartup = false; // since this is a reload
		configuration.policiesData = this.policyService.serialize(); // set policies data again
		configuration.continueOn = this.environmentMainService.continueOn;
		configuration.profiles = {
			all: this.userDataProfilesService.profiles,
			profile: this.profile || this.userDataProfilesService.defaultProfile,
			home: this.userDataProfilesService.profilesHome
		};
		configuration.logLevel = this.loggerMainService.getLogLevel();
		configuration.loggers = this.loggerMainService.getGlobalLoggers();

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
			let display: electron.Display | undefined;
			try {
				display = electron.screen.getDisplayMatching(this.getBounds());
			} catch (error) {
				// Electron has weird conditions under which it throws errors
				// e.g. https://github.com/microsoft/vscode/issues/100334 when
				// large numbers are passed in
			}

			const defaultState = defaultWindowState();

			return {
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
				y: this.windowState.y || 0,
				zoomLevel: this.customZoomLevel
			};
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
			let bounds: electron.Rectangle;
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

		state.zoomLevel = this.customZoomLevel;

		return state;
	}

	private restoreWindowState(state?: IWindowState): [IWindowState, boolean? /* has multiple displays */] {
		mark('code/willRestoreCodeWindowState');

		let hasMultipleDisplays = false;
		if (state) {

			// Window zoom
			this.customZoomLevel = state.zoomLevel;

			// Window dimensions
			try {
				const displays = electron.screen.getAllDisplays();
				hasMultipleDisplays = displays.length > 1;

				state = WindowStateValidator.validateWindowState(this.logService, state, displays);
			} catch (err) {
				this.logService.warn(`Unexpected error validating window state: ${err}\n${err.stack}`); // somehow display API can be picky about the state to validate
			}
		}

		mark('code/didRestoreCodeWindowState');

		return [state || defaultWindowState(), hasMultipleDisplays];
	}

	getBounds(): electron.Rectangle {
		const [x, y] = this._win.getPosition();
		const [width, height] = this._win.getSize();

		return { x, y, width, height };
	}

	protected override setFullScreen(fullscreen: boolean, fromRestore: boolean): void {
		super.setFullScreen(fullscreen, fromRestore);

		// Events
		this.sendWhenReady(fullscreen ? 'vscode:enterFullScreen' : 'vscode:leaveFullScreen', CancellationToken.None);

		// Respect configured menu bar visibility or default to toggle if not set
		if (this.currentMenuBarVisibility) {
			this.setMenuBarVisibility(this.currentMenuBarVisibility, false);
		}
	}

	private getMenuBarVisibility(): MenuBarVisibility {
		let menuBarVisibility = getMenuBarVisibility(this.configurationService);
		if (['visible', 'toggle', 'hidden'].indexOf(menuBarVisibility) < 0) {
			menuBarVisibility = 'classic';
		}

		return menuBarVisibility;
	}

	private setMenuBarVisibility(visibility: MenuBarVisibility, notify = true): void {
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

	notifyZoomLevel(zoomLevel: number | undefined): void {
		this.customZoomLevel = zoomLevel;
	}

	private getZoomLevel(): number | undefined {
		if (typeof this.customZoomLevel === 'number') {
			return this.customZoomLevel;
		}

		const windowSettings = this.configurationService.getValue<IWindowSettings | undefined>('window');
		return windowSettings?.zoomLevel;
	}

	close(): void {
		this._win?.close();
	}

	sendWhenReady(channel: string, token: CancellationToken, ...args: unknown[]): void {
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

	send(channel: string, ...args: unknown[]): void {
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

		this._win.setTouchBar(new electron.TouchBar({ items: this.touchBarGroups }));
	}

	private createTouchBarGroup(items: ISerializableCommandAction[] = []): electron.TouchBarSegmentedControl {

		// Group Segments
		const segments = this.createTouchBarGroupSegments(items);

		// Group Control
		const control = new electron.TouchBar.TouchBarSegmentedControl({
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
			let icon: electron.NativeImage | undefined;
			if (item.icon && !ThemeIcon.isThemeIcon(item.icon) && item.icon?.dark?.scheme === Schemas.file) {
				icon = electron.nativeImage.createFromPath(URI.revive(item.icon.dark).fsPath);
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

	private async startCollectingJScallStacks(): Promise<void> {
		if (!this.jsCallStackCollector.isTriggered()) {
			const stack = await this._win?.webContents.mainFrame.collectJavaScriptCallStack();

			// Increment the count for this stack trace
			if (stack) {
				const count = this.jsCallStackMap.get(stack) || 0;
				this.jsCallStackMap.set(stack, count + 1);
			}

			this.jsCallStackCollector.trigger(() => this.startCollectingJScallStacks());
		}
	}

	private stopCollectingJScallStacks(): void {
		this.jsCallStackCollectorStopScheduler.cancel();
		this.jsCallStackCollector.cancel();

		if (this.jsCallStackMap.size) {
			let logMessage = `CodeWindow unresponsive samples:\n`;
			let samples = 0;

			const sortedEntries = Array.from(this.jsCallStackMap.entries())
				.sort((a, b) => b[1] - a[1]);

			for (const [stack, count] of sortedEntries) {
				samples += count;
				// If the stack appears more than 20 percent of the time, log it
				// to the error telemetry as UnresponsiveSampleError.
				if (Math.round((count * 100) / this.jsCallStackEffectiveSampleCount) > 20) {
					const fakeError = new UnresponsiveError(stack, this.id, this._win?.webContents.getOSProcessId());
					errorHandler.onUnexpectedError(fakeError);
				}
				logMessage += `<${count}> ${stack}\n`;
			}

			logMessage += `Total Samples: ${samples}\n`;
			logMessage += 'For full overview of the unresponsive period, capture cpu profile via https://aka.ms/vscode-tracing-cpu-profile';
			this.logService.error(logMessage);
		}

		this.jsCallStackMap.clear();
	}

	matches(webContents: electron.WebContents): boolean {
		return this._win?.webContents.id === webContents.id;
	}

	override dispose(): void {
		super.dispose();

		// Deregister the loggers for this window
		this.loggerMainService.deregisterLoggers(this.id);
	}
}

class UnresponsiveError extends Error {

	constructor(sample: string, windowId: number, pid = 0) {
		// Since the stacks are available via the sample
		// we can avoid collecting them when constructing the error.
		const stackTraceLimit = Error.stackTraceLimit;
		Error.stackTraceLimit = 0;
		super(`UnresponsiveSampleError: from window with ID ${windowId} belonging to process with pid ${pid}`);
		Error.stackTraceLimit = stackTraceLimit;
		this.name = 'UnresponsiveSampleError';
		this.stack = sample;
	}
}
