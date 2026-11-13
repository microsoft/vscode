/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../base/common/buffer.js';
import { Event } from '../../../base/common/event.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { MessageBoxOptions, MessageBoxReturnValue, OpenDevToolsOptions, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from '../../../base/parts/sandbox/common/electronTypes.js';
import { ISerializableCommandAction } from '../../action/common/action.js';
import { AgentHostEditorUpdate, IAgentHostEditorState, IAgentsWindowInvitation } from '../../chat/common/agentsWindowInvitation.js';
import { INativeOpenDialogOptions } from '../../dialogs/common/dialogs.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { IV8Profile } from '../../profiling/common/profiling.js';
import { AuthInfo, Credentials } from '../../request/common/request.js';
import { IPartsSplash } from '../../theme/common/themeService.js';
import { AgentsWindowOpenSource, IAgentsWindowDraft, IColorScheme, IOpenedAuxiliaryWindow, IOpenedMainWindow, IOpenEmptyWindowOptions, IOpenWindowOptions, IPoint, IRectangle, IWindowFolderLocation, IWindowOpenable } from '../../window/common/window.js';

export interface IToastOptions {
	readonly id: string;
	/**
	 * Prevents another live toast with the same key from being shown.
	 */
	readonly dedupeKey?: string;

	readonly title: string;
	readonly body?: string;

	readonly actions?: readonly string[];

	readonly silent?: boolean;
}

export interface IToastResult {
	readonly supported: boolean;
	/**
	 * True when a live toast with the requested dedupe key is already visible.
	 */
	readonly suppressed?: boolean;

	readonly clicked: boolean;
	readonly actionIndex?: number;
}

/**
 * A count badge to render on the application icon in the dock (macOS), the
 * launcher (Linux) or over the taskbar icon of a window (Windows).
 */
export interface IApplicationBadge {

	/** The number to show. A count of `0` clears the badge. */
	readonly count: number;

	/** Accessible description of the badge, used for the Windows taskbar overlay. */
	readonly description: string;

	/**
	 * PNG image data as a `data:` URL for the Windows taskbar overlay icon,
	 * which has no built-in count rendering. Ignored on other platforms,
	 * where the OS renders {@link count} itself.
	 */
	readonly iconDataURL?: string;
}

/**
 * A ZIP entry whose contents are inline or streamed from a local file.
 */
export type INativeZipFile =
	| { readonly path: string; readonly contents: string }
	| {
		readonly path: string;
		readonly source: URI;
		readonly size: number;
		readonly compress?: boolean;
		/** Skip this entry when its source cannot be opened or inspected. */
		readonly skipSourceErrors?: boolean;
	}
	| { readonly sourceArchive: URI };

export interface INativeZipOptions {
	readonly maxSize?: number;
	readonly maxEntries: number;
	readonly operationId?: string;
}

export interface INativeZipProgress {
	readonly operationId: string;
	readonly bytes: number;
	readonly total: number;
	readonly path: string;
}

export interface INativeZipResult {
	readonly skippedFiles: readonly { readonly path: string; readonly error: string }[];
}

export interface IOpenAgentsWindowOptions {
	readonly folderUri?: UriComponents;
	/** Use the invoking editor's folder only for a fresh composer, without replacing an existing session or user choice. */
	readonly folderUriIsDefault?: boolean;
	/** Reveal a session or the new-session composer; otherwise preserve the view of an already-open window. */
	readonly reveal?: UriComponents | 'new';
	/** The remote authority of the editor window whose own agent host, on that remote machine, owns the revealed session. */
	readonly revealRemoteAuthority?: string;
	/** Session to spotlight after a contextual invitation, even when it is not opened. */
	readonly onboardingSessionResource?: UriComponents;
	readonly source?: AgentsWindowOpenSource;
	/** Copy a draft only when explicitly revealing the new-session composer. */
	readonly draft?: IAgentsWindowDraft;
}

export interface ICPUProperties {
	model: string;
	speed: number;
}

export interface IOSProperties {
	type: string;
	release: string;
	arch: string;
	platform: string;
	cpus: ICPUProperties[];
}

export interface IOSStatistics {
	totalmem: number;
	freemem: number;
	loadavg: number[];
}

export interface IOSProxy {
	readonly kind: 'direct' | 'http' | 'socks';
	readonly host?: string;
}

export interface IOSProxyEnvironmentVariableStatus {
	readonly variable: string;
	readonly value: string;
	readonly error?: string;
}

export interface IOSProxyPacSourceStatus {
	readonly state: 'disabled' | 'unsupported' | 'unconfigured' | 'not-found' | 'available' | 'error-discovery' | 'error-download' | 'unknown';
	readonly url?: string;
	readonly error?: string;
}

export interface IOSProxyConfig {
	readonly environment: {
		readonly httpProxy?: IOSProxyEnvironmentVariableStatus;
		readonly httpsProxy?: IOSProxyEnvironmentVariableStatus;
		readonly allProxy?: IOSProxyEnvironmentVariableStatus;
		readonly noProxy?: IOSProxyEnvironmentVariableStatus;
	};
	readonly autoDetect: boolean;
	readonly pacUrl?: string;
	readonly pac?: {
		readonly url: string;
		readonly content: string;
		readonly source: 'wpad-dns' | 'wpad-dhcp' | 'configured' | 'unknown';
	};
	readonly wpadDhcp: IOSProxyPacSourceStatus;
	readonly wpadDns: IOSProxyPacSourceStatus;
	readonly configuredPac: IOSProxyPacSourceStatus;
	readonly staticRules?: {
		readonly http?: IOSProxy;
		readonly https?: IOSProxy;
		readonly socks?: IOSProxy;
	};
	readonly platform?:
	| { readonly kind: 'windows'; readonly proxy?: string; readonly proxyBypass?: string }
	| { readonly kind: 'macos'; readonly exceptions: readonly string[]; readonly excludeSimpleHostnames: boolean }
	| { readonly kind: 'linux'; readonly mode?: string; readonly ignoreHosts: readonly string[] }
	| { readonly kind: 'unknown' };
}

export interface INativeHostOptions {
	readonly targetWindowId?: number;
}

export interface IStartTracingOptions {

	/**
	 * Whether to enable heap profiling for MemoryInfra traces. Only takes effect
	 * if the `disabled-by-default-memory-infra` category is included in the trace
	 * and requires the recording to also collect periodic memory dumps.
	 */
	readonly enableHeapProfiling?: boolean;
}

export const enum FocusMode {

	/**
	 * (Default) Transfer focus to the target window
	 * when the editor is focused.
	 */
	Transfer,

	/**
	 * Transfer focus to the target window when the
	 * editor is focused, otherwise notify the user that
	 * the app has activity (macOS/Windows only).
	 */
	Notify,

	/**
	 * Force the window to be focused, even if the editor
	 * is not currently focused.
	 */
	Force,
}

/**
 * A window of another application, which VS Code can capture.
 */
export interface INativeAppWindow {

	/**
	 * The id of the window as a desktop media source, which `getUserMedia` captures with the `desktop` media source.
	 */
	readonly sourceId: string;

	/**
	 * The title of the window, which can be empty.
	 */
	readonly title: string;

	/**
	 * The icon of the window's application as a PNG `data:` URL, where the platform provides it.
	 */
	readonly iconDataUrl?: string;

	/**
	 * Where the window shows on screen, in the coordinates of Electron's `screen`, where the platform tells: macOS does.
	 */
	readonly bounds?: IRectangle;
}

/**
 * The windows of other applications, see {@link ICommonNativeHostService.getAppWindows}.
 */
export type INativeAppWindows =
	/** The windows, front to back. */
	| { readonly kind: 'windows'; readonly windows: readonly INativeAppWindow[] }
	/** macOS only lists the windows of other applications with the Screen Recording permission, which is missing. */
	| { readonly kind: 'permissionRequired' }
	/** Only the system can list the windows, in a picker that it shows when the user asks to capture a window. */
	| { readonly kind: 'systemPicker' };

export interface INativeSystemWideKeybinding {

	/**
	 * The keybinding in Electron accelerator format (e.g. `Control+Cmd+A`).
	 * See https://www.electronjs.org/docs/latest/api/accelerator.
	 */
	readonly accelerator: string;

	/**
	 * The command to execute when the global shortcut is triggered.
	 */
	readonly commandId: string;

	/**
	 * Optional command arguments as configured in `keybindings.json`. Must be JSON-serializable.
	 */
	readonly args?: unknown;

	/**
	 * The user settings label (e.g. `ctrl+cmd+a`) for diagnostics/notifications.
	 */
	readonly userSettingsLabel?: string;
}

export interface INativeSystemWideKeybindingResult {

	/**
	 * The user settings labels (or accelerators) that could not be registered, e.g. because the
	 * accelerator is already taken by the OS or another application.
	 */
	readonly failed: string[];
}

export interface ICommonNativeHostService {

	readonly _serviceBrand: undefined;

	// Properties
	readonly windowId: number;

	// Events
	readonly onDidOpenMainWindow: Event<number>;

	readonly onDidMaximizeWindow: Event<number>;
	readonly onDidUnmaximizeWindow: Event<number>;

	readonly onDidFocusMainWindow: Event<number>;
	readonly onDidBlurMainWindow: Event<number>;

	readonly onDidChangeWindowFullScreen: Event<{ windowId: number; fullscreen: boolean }>;
	readonly onDidChangeWindowAlwaysOnTop: Event<{ windowId: number; alwaysOnTop: boolean }>;

	readonly onDidFocusMainOrAuxiliaryWindow: Event<number>;
	readonly onDidBlurMainOrAuxiliaryWindow: Event<number>;

	readonly onDidChangeDisplay: Event<void>;
	readonly onDidChangeGPUCompositing: Event<boolean>;
	readonly onDidChangeAgentHostEditorState: Event<IAgentHostEditorState>;

	readonly onDidSuspendOS: Event<void>;
	readonly onDidResumeOS: Event<unknown>;

	readonly onDidChangeOnBatteryPower: Event<boolean>;
	readonly onDidChangeThermalState: Event<ThermalState>;
	readonly onDidChangeSpeedLimit: Event<number>;
	readonly onWillShutdownOS: Event<void>;
	readonly onDidLockScreen: Event<void>;
	readonly onDidUnlockScreen: Event<void>;

	readonly onDidChangeColorScheme: Event<IColorScheme>;

	readonly onDidChangePassword: Event<{ readonly service: string; readonly account: string }>;

	readonly onDidTriggerWindowSystemContextMenu: Event<{ readonly windowId: number; readonly x: number; readonly y: number }>;

	// Window
	getWindows(options: { includeAuxiliaryWindows: true }): Promise<Array<IOpenedMainWindow | IOpenedAuxiliaryWindow>>;
	getWindows(options: { includeAuxiliaryWindows: false }): Promise<Array<IOpenedMainWindow>>;
	getWindowCount(): Promise<number>;
	getActiveWindowId(): Promise<number | undefined>;
	getActiveWindowPosition(): Promise<IRectangle | undefined>;
	getNativeWindowHandle(windowId: number): Promise<VSBuffer | undefined>;

	openWindow(options?: IOpenEmptyWindowOptions): Promise<void>;
	openWindow(toOpen: IWindowOpenable[], options?: IOpenWindowOptions): Promise<void>;

	openAgentsWindow(options?: IOpenAgentsWindowOptions): Promise<void>;

	/**
	 * Asks the Agents window to show the Agents Launcher, opening the Agents window first when none is open. An open Agents
	 * window is not brought to the front: the Agents Launcher shows and focuses its own window.
	 */
	showAgentsLauncher(): Promise<void>;

	getAgentHostEditorState(legacyEditorSessionCount: number): Promise<IAgentHostEditorState>;
	updateAgentHostEditorState(update: AgentHostEditorUpdate): Promise<void>;
	claimAgentsWindowInvitation(resource: UriComponents, developerMode: boolean): Promise<IAgentsWindowInvitation | undefined>;
	markAgentsWindowInvitationShown(id: string): Promise<void>;
	releaseAgentsWindowInvitation(id: string): Promise<void>;

	/**
	 * Registers this window's set of system-wide (OS global) keybindings with the main process,
	 * replacing any previously registered by this window. The shortcuts fire even when the
	 * application is not focused. Returns the set that could not be registered.
	 */
	syncSystemWideKeybindings(keybindings: INativeSystemWideKeybinding[]): Promise<INativeSystemWideKeybindingResult>;

	isFullScreen(options?: INativeHostOptions): Promise<boolean>;
	toggleFullScreen(options?: INativeHostOptions): Promise<void>;

	/**
	 * Does what a double-click on the title bar of the window does: on macOS as the system settings say, such as to zoom
	 * or minimize the window, else maximizes or restores it. For a title area the window does not drag itself.
	 */
	handleTitleDoubleClick(options?: INativeHostOptions): Promise<void>;

	getCursorScreenPoint(): Promise<{ readonly point: IPoint; readonly display: IRectangle }>;

	isMaximized(options?: INativeHostOptions): Promise<boolean>;
	maximizeWindow(options?: INativeHostOptions): Promise<void>;
	unmaximizeWindow(options?: INativeHostOptions): Promise<void>;
	minimizeWindow(options?: INativeHostOptions): Promise<void>;
	moveWindowTop(options?: INativeHostOptions): Promise<void>;
	positionWindow(position: IRectangle, options?: INativeHostOptions): Promise<void>;

	/** Shows a window hidden with {@link hideWindow} and focuses it. */
	showWindow(options?: INativeHostOptions): Promise<void>;
	/** Hides a window without closing it, such as a floating window that shows again later. */
	hideWindow(options?: INativeHostOptions): Promise<void>;
	/** Sets the opacity of a window, from 0 (transparent) to 1 (opaque). Unsupported on Linux. */
	setWindowOpacity(opacity: number, options?: INativeHostOptions): Promise<void>;

	isWindowAlwaysOnTop(options?: INativeHostOptions): Promise<boolean>;
	toggleWindowAlwaysOnTop(options?: INativeHostOptions): Promise<void>;
	setWindowAlwaysOnTop(alwaysOnTop: boolean, options?: INativeHostOptions): Promise<void>;

	updateWindowControls(options: INativeHostOptions & { height?: number; horizontalInset?: number; backgroundColor?: string; foregroundColor?: string; dimmed?: boolean }): Promise<void>;

	/**
	 * Remembers the alternate location the folder of the window is at, so that
	 * the window starts at it again after a reload or restart.
	 */
	setWindowFolderLocation(location: IWindowFolderLocation | undefined, options?: INativeHostOptions): Promise<void>;

	updateWindowAccentColor(color: 'default' | 'off' | string, inactiveColor: string | undefined): Promise<void>;

	setMinimumSize(width: number | undefined, height: number | undefined): Promise<void>;

	saveWindowSplash(splash: IPartsSplash): Promise<void>;

	setBackgroundThrottling(allowed: boolean): Promise<void>;

	/**
	 * Make the window focused.
	 * @param options specify the specific window to focus and the focus mode.
	 * Defaults to {@link FocusMode.Transfer}.
	 */
	focusWindow(options?: INativeHostOptions & { mode?: FocusMode }): Promise<void>;

	// Dialogs
	showMessageBox(options: MessageBoxOptions & INativeHostOptions): Promise<MessageBoxReturnValue>;
	showSaveDialog(options: SaveDialogOptions & INativeHostOptions): Promise<SaveDialogReturnValue>;
	showOpenDialog(options: OpenDialogOptions & INativeHostOptions): Promise<OpenDialogReturnValue>;

	pickFileFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFileAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickFolderAndOpen(options: INativeOpenDialogOptions): Promise<void>;
	pickWorkspaceAndOpen(options: INativeOpenDialogOptions): Promise<void>;

	// OS
	showItemInFolder(path: string): Promise<void>;
	/**
	 * Drags the file or folder at absolute `path` out of the window, as if the user dragged it from the file manager, so
	 * other apps can take it. Call it from a `dragstart` handler that cancels the HTML drag, while the mouse button is
	 * still down. Does nothing for a path that doesn't exist.
	 */
	startFileDrag(path: string, options?: INativeHostOptions): Promise<void>;
	setRepresentedFilename(path: string, options?: INativeHostOptions): Promise<void>;
	setDocumentEdited(edited: boolean, options?: INativeHostOptions): Promise<void>;
	/**
	 * Renders a count badge on the application icon. Passing `undefined` or a
	 * badge with a count of `0` clears it again.
	 */
	setApplicationBadge(badge: IApplicationBadge | undefined, options?: INativeHostOptions): Promise<void>;
	openExternal(url: string, defaultApplication?: string): Promise<boolean>;
	moveItemToTrash(fullPath: string): Promise<void>;

	getMediaAccessStatus(mediaType: 'microphone' | 'camera' | 'screen'): Promise<'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown'>;

	/** Requests screen-capture permission without starting a recording. */
	requestScreenCaptureAccess(): Promise<boolean>;

	/**
	 * Lists the windows of other applications, front to back, so that the first one is the window that the user is
	 * looking at, or the one that they left for VS Code. The windows of VS Code are left out, except from the window
	 * picker of Wayland sessions, which lists every window and identifies none of them.
	 *
	 * Without `interactive`, this never shows system UI: it reports `permissionRequired` instead of asking for the Screen
	 * Recording permission on macOS, and `systemPicker` instead of showing the window picker of Wayland sessions. Only set
	 * `interactive` when the user asked to capture a window: then macOS asks for the permission the first time, and
	 * Wayland sessions list the one window that the user picks, or none when the user cancels.
	 */
	getAppWindows(options?: { readonly interactive?: boolean }): Promise<INativeAppWindows>;

	/**
	 * Captures a window of another application in a single screenshot, where the platform can: macOS can. Returns the
	 * screenshot as a PNG, or `undefined` when the platform can't, so that the caller captures a frame of the window as a
	 * desktop media source instead.
	 *
	 * With `feedback`, where the platform tells where the window is (see {@link INativeAppWindow.bounds}), the window
	 * flashes, then turns into its screenshot, which stays above it until {@link endAppWindowCaptureFeedback}, or for a
	 * while at most. The feedback draws above every window, ignores the mouse, and never takes focus. This resolves once
	 * the screenshot shows above the window, so that another window can then come to the front without covering it.
	 */
	captureAppWindow(window: INativeAppWindow, options?: { readonly feedback?: { readonly reduceMotion: boolean } }): Promise<VSBuffer | undefined>;

	/**
	 * Ends the feedback of {@link captureAppWindow}. Given a destination, a rectangle of the target window in
	 * device-independent pixels from the top left of its content, the screenshot flies into it and takes its corner
	 * radius, then fades as the destination shows. Without a screenshot from the capture, it needs the screenshot as a
	 * `data:` URL. Without a destination on the same display, the screenshot shrinks where the window is; without either,
	 * the flash fades. Resolves once the screenshot covers the destination, or once the feedback is gone.
	 */
	endAppWindowCaptureFeedback(screenshot?: { readonly image?: string; readonly destination?: IRectangle; readonly radius?: number }, options?: INativeHostOptions): Promise<void>;

	isAdmin(): Promise<boolean>;
	writeElevated(source: URI, target: URI, options?: { unlock?: boolean }): Promise<void>;
	isRunningUnderARM64Translation(): Promise<boolean>;

	getOSProperties(): Promise<IOSProperties>;
	getOSStatistics(): Promise<IOSStatistics>;
	/** Returns the bytes available to the user on the filesystem containing the path or its nearest existing ancestor. */
	getFreeDiskSpace(path: string): Promise<number>;
	getOSVirtualMachineHint(): Promise<number>;

	isGPUCompositingEnabled(): Promise<boolean>;

	getOSColorScheme(): Promise<IColorScheme>;

	hasWSLFeatureInstalled(): Promise<boolean>;

	// Screenshots
	getScreenshot(rect?: IRectangle, options?: INativeHostOptions): Promise<VSBuffer | undefined>;

	// GitHub mobile upload API (runs in main process to avoid CORS)
	uploadFileViaMobileApi(token: string, repoId: string, fileName: string, fileBytes: VSBuffer, contentType: string): Promise<{ fileName: string; assetUrl: string; contentType: string }>;

	// Process
	getProcessId(): Promise<number | undefined>;
	killProcess(pid: number, code: string): Promise<void>;

	// Clipboard
	triggerPaste(options?: INativeHostOptions): Promise<void>;
	readClipboardText(type?: 'selection' | 'clipboard'): Promise<string>;
	writeClipboardText(text: string, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardFindText(): Promise<string>;
	writeClipboardFindText(text: string): Promise<void>;
	writeClipboardBuffer(format: string, buffer: VSBuffer, type?: 'selection' | 'clipboard'): Promise<void>;
	readClipboardBuffer(format: string): Promise<VSBuffer>;
	hasClipboard(format: string, type?: 'selection' | 'clipboard'): Promise<boolean>;
	readImage(): Promise<Uint8Array>;
	writeImage(data: VSBuffer): Promise<void>;

	// macOS Touchbar
	newWindowTab(): Promise<void>;
	showPreviousWindowTab(): Promise<void>;
	showNextWindowTab(): Promise<void>;
	moveWindowTabToNewWindow(): Promise<void>;
	mergeAllWindowTabs(): Promise<void>;
	toggleWindowTabsBar(): Promise<void>;
	updateTouchBar(items: ISerializableCommandAction[][]): Promise<void>;

	// macOS Shell command
	installShellCommand(): Promise<void>;
	uninstallShellCommand(): Promise<void>;

	// Lifecycle
	notifyReady(): Promise<void>;
	relaunch(options?: { addArgs?: string[]; removeArgs?: string[] }): Promise<void>;
	reload(options?: { disableExtensions?: boolean }): Promise<void>;
	closeWindow(options?: INativeHostOptions): Promise<void>;
	quit(): Promise<void>;
	exit(code: number): Promise<void>;

	// Development
	openDevTools(options?: Partial<OpenDevToolsOptions> & INativeHostOptions): Promise<void>;
	toggleDevTools(options?: INativeHostOptions): Promise<void>;
	openGPUInfoWindow(): Promise<void>;
	openDevToolsWindow(url: string): Promise<void>;
	openContentTracingWindow(): Promise<void>;
	stopTracing(): Promise<void>;

	// Perf Introspection
	profileRenderer(session: string, duration: number): Promise<IV8Profile>;
	startTracing(categories: string, options?: IStartTracingOptions): Promise<void>;

	// Connectivity
	resolveProxy(url: string): Promise<string | undefined>;
	resolveProxyWithPackage(url: string): Promise<IOSProxy[]>;
	readProxyConfigWithPackage(): Promise<IOSProxyConfig>;
	lookupAuthorization(authInfo: AuthInfo): Promise<Credentials | undefined>;
	lookupKerberosAuthorization(url: string): Promise<string | undefined>;
	loadCertificates(): Promise<string[]>;
	isPortFree(port: number): Promise<boolean>;
	findFreePort(startPort: number, giveUpAfter: number, timeout: number, stride?: number): Promise<number>;

	// Registry (Windows only)
	windowsGetStringRegKey(hive: 'HKEY_CURRENT_USER' | 'HKEY_LOCAL_MACHINE' | 'HKEY_CLASSES_ROOT' | 'HKEY_USERS' | 'HKEY_CURRENT_CONFIG', path: string, name: string): Promise<string | undefined>;

	// Toast Notifications
	showToast(options: IToastOptions): Promise<IToastResult>;
	clearToast(id: string): Promise<void>;
	clearToasts(): Promise<void>;

	// Zip
	/**
	 * Creates a zip file at the specified path containing the provided files.
	 *
	 * @param zipPath The URI where the zip file should be created.
	 * @param files An array of file entries to include in the zip. Each entry has
	 * a relative path and is either given inline string `contents`, or a local
	 * file `source` URI together with the number of leading bytes (`size`) to
	 * stream from it.
	 */
	createZipFile(zipPath: URI, files: INativeZipFile[], options?: INativeZipOptions): Promise<INativeZipResult>;
	readonly onDidProgressZipFile: Event<INativeZipProgress>;
	cancelZipFile(operationId: string): Promise<void>;

	// Power
	getSystemIdleState(idleThreshold: number): Promise<SystemIdleState>;
	getSystemIdleTime(): Promise<number>;
	getCurrentThermalState(): Promise<ThermalState>;
	isOnBatteryPower(): Promise<boolean>;
	startPowerSaveBlocker(type: PowerSaveBlockerType): Promise<number>;
	stopPowerSaveBlocker(id: number): Promise<boolean>;
	isPowerSaveBlockerStarted(id: number): Promise<boolean>;
}

/**
 * Represents the system's idle state.
 */
export type SystemIdleState = 'active' | 'idle' | 'locked' | 'unknown';

/**
 * Represents the system's thermal state.
 */
export type ThermalState = 'unknown' | 'nominal' | 'fair' | 'serious' | 'critical';

/**
 * The type of power save blocker.
 */
export type PowerSaveBlockerType = 'prevent-app-suspension' | 'prevent-display-sleep';

export const INativeHostService = createDecorator<INativeHostService>('nativeHostService');

/**
 * A set of methods specific to a native host, i.e. unsupported in web
 * environments.
 *
 * @see {@link IHostService} for methods that can be used in native and web
 * hosts.
 */
export interface INativeHostService extends ICommonNativeHostService { }
