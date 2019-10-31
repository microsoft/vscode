// Type definitions for Electron 7.0.0
// Project: http://electronjs.org/
// Definitions by: The Electron Team <https://github.com/electron/electron>
// Definitions: https://github.com/electron/electron-typescript-definitions

/// <reference types="node" />

type GlobalEvent = Event;

declare namespace Electron {
	class Accelerator extends String {

	}

	interface CommonInterface {
		app: App;
		autoUpdater: AutoUpdater;
		BrowserView: typeof BrowserView;
		BrowserWindowProxy: typeof BrowserWindowProxy;
		BrowserWindow: typeof BrowserWindow;
		ClientRequest: typeof ClientRequest;
		clipboard: Clipboard;
		CommandLine: typeof CommandLine;
		contentTracing: ContentTracing;
		Cookies: typeof Cookies;
		crashReporter: CrashReporter;
		Debugger: typeof Debugger;
		desktopCapturer: DesktopCapturer;
		dialog: Dialog;
		Dock: typeof Dock;
		DownloadItem: typeof DownloadItem;
		globalShortcut: GlobalShortcut;
		inAppPurchase: InAppPurchase;
		IncomingMessage: typeof IncomingMessage;
		ipcMain: IpcMain;
		ipcRenderer: IpcRenderer;
		MenuItem: typeof MenuItem;
		Menu: typeof Menu;
		nativeImage: typeof NativeImage;
		nativeTheme: NativeTheme;
		netLog: NetLog;
		net: Net;
		Notification: typeof Notification;
		powerMonitor: PowerMonitor;
		powerSaveBlocker: PowerSaveBlocker;
		protocol: Protocol;
		remote: Remote;
		screen: Screen;
		session: typeof Session;
		shell: Shell;
		systemPreferences: SystemPreferences;
		TouchBarButton: typeof TouchBarButton;
		TouchBarColorPicker: typeof TouchBarColorPicker;
		TouchBarGroup: typeof TouchBarGroup;
		TouchBarLabel: typeof TouchBarLabel;
		TouchBarPopover: typeof TouchBarPopover;
		TouchBarScrubber: typeof TouchBarScrubber;
		TouchBarSegmentedControl: typeof TouchBarSegmentedControl;
		TouchBarSlider: typeof TouchBarSlider;
		TouchBarSpacer: typeof TouchBarSpacer;
		TouchBar: typeof TouchBar;
		Tray: typeof Tray;
		webContents: typeof WebContents;
		webFrame: WebFrame;
		WebRequest: typeof WebRequest;
		webviewTag: WebviewTag;
	}

	interface MainInterface extends CommonInterface {
	}

	interface RendererInterface extends CommonInterface {
	}

	interface AllElectron extends MainInterface, RendererInterface { }

	const app: App;
	const autoUpdater: AutoUpdater;
	const clipboard: Clipboard;
	const contentTracing: ContentTracing;
	const crashReporter: CrashReporter;
	const desktopCapturer: DesktopCapturer;
	const dialog: Dialog;
	const globalShortcut: GlobalShortcut;
	const inAppPurchase: InAppPurchase;
	const ipcMain: IpcMain;
	const ipcRenderer: IpcRenderer;
	type nativeImage = NativeImage;
	const nativeImage: typeof NativeImage;
	const nativeTheme: NativeTheme;
	const netLog: NetLog;
	const net: Net;
	const powerMonitor: PowerMonitor;
	const powerSaveBlocker: PowerSaveBlocker;
	const protocol: Protocol;
	// const remote: Remote; ### VSCODE CHANGE (we do not want to use remote)
	const screen: Screen;
	type session = Session;
	const session: typeof Session;
	const shell: Shell;
	const systemPreferences: SystemPreferences;
	type webContents = WebContents;
	const webContents: typeof WebContents;
	const webFrame: WebFrame;
	const webviewTag: WebviewTag;

	interface App extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/app

		/**
		 * Emitted when Chrome's accessibility support changes. This event fires when
		 * assistive technologies, such as screen readers, are enabled or disabled. See
		 * https://www.chromium.org/developers/design-documents/accessibility for more
		 * details.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'accessibility-support-changed', listener: (event: Event,
			/**
			 * `true` when Chrome's accessibility support is enabled, `false` otherwise.
			 */
			accessibilitySupportEnabled: boolean) => void): this;
		once(event: 'accessibility-support-changed', listener: (event: Event,
			/**
			 * `true` when Chrome's accessibility support is enabled, `false` otherwise.
			 */
			accessibilitySupportEnabled: boolean) => void): this;
		addListener(event: 'accessibility-support-changed', listener: (event: Event,
			/**
			 * `true` when Chrome's accessibility support is enabled, `false` otherwise.
			 */
			accessibilitySupportEnabled: boolean) => void): this;
		removeListener(event: 'accessibility-support-changed', listener: (event: Event,
			/**
			 * `true` when Chrome's accessibility support is enabled, `false` otherwise.
			 */
			accessibilitySupportEnabled: boolean) => void): this;
		/**
		 * Emitted when the application is activated. Various actions can trigger this
		 * event, such as launching the application for the first time, attempting to
		 * re-launch the application when it's already running, or clicking on the
		 * application's dock or taskbar icon.
		 *
		 * @platform darwin
		 */
		on(event: 'activate', listener: (event: Event,
			hasVisibleWindows: boolean) => void): this;
		once(event: 'activate', listener: (event: Event,
			hasVisibleWindows: boolean) => void): this;
		addListener(event: 'activate', listener: (event: Event,
			hasVisibleWindows: boolean) => void): this;
		removeListener(event: 'activate', listener: (event: Event,
			hasVisibleWindows: boolean) => void): this;
		/**
		 * Emitted during Handoff after an activity from this device was successfully
		 * resumed on another one.
		 *
		 * @platform darwin
		 */
		on(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		once(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		addListener(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		removeListener(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		/**
		 * Emitted before the application starts closing its windows. Calling
		 * `event.preventDefault()` will prevent the default behavior, which is terminating
		 * the application.
		 *
		 * **Note:** If application quit was initiated by `autoUpdater.quitAndInstall()`,
		 * then `before-quit` is emitted *after* emitting `close` event on all windows and
		 * closing them.
		 *
		 * **Note:** On Windows, this event will not be emitted if the app is closed due to
		 * a shutdown/restart of the system or a user logout.
		 */
		on(event: 'before-quit', listener: (event: Event) => void): this;
		once(event: 'before-quit', listener: (event: Event) => void): this;
		addListener(event: 'before-quit', listener: (event: Event) => void): this;
		removeListener(event: 'before-quit', listener: (event: Event) => void): this;
		/**
		 * Emitted when a browserWindow gets blurred.
		 */
		on(event: 'browser-window-blur', listener: (event: Event,
			window: BrowserWindow) => void): this;
		once(event: 'browser-window-blur', listener: (event: Event,
			window: BrowserWindow) => void): this;
		addListener(event: 'browser-window-blur', listener: (event: Event,
			window: BrowserWindow) => void): this;
		removeListener(event: 'browser-window-blur', listener: (event: Event,
			window: BrowserWindow) => void): this;
		/**
		 * Emitted when a new browserWindow is created.
		 */
		on(event: 'browser-window-created', listener: (event: Event,
			window: BrowserWindow) => void): this;
		once(event: 'browser-window-created', listener: (event: Event,
			window: BrowserWindow) => void): this;
		addListener(event: 'browser-window-created', listener: (event: Event,
			window: BrowserWindow) => void): this;
		removeListener(event: 'browser-window-created', listener: (event: Event,
			window: BrowserWindow) => void): this;
		/**
		 * Emitted when a browserWindow gets focused.
		 */
		on(event: 'browser-window-focus', listener: (event: Event,
			window: BrowserWindow) => void): this;
		once(event: 'browser-window-focus', listener: (event: Event,
			window: BrowserWindow) => void): this;
		addListener(event: 'browser-window-focus', listener: (event: Event,
			window: BrowserWindow) => void): this;
		removeListener(event: 'browser-window-focus', listener: (event: Event,
			window: BrowserWindow) => void): this;
		/**
		 * Emitted when failed to verify the `certificate` for `url`, to trust the
		 * certificate you should prevent the default behavior with
		 * `event.preventDefault()` and call `callback(true)`.
		 */
		on(event: 'certificate-error', listener: (event: Event,
			webContents: WebContents,
			url: string,
			/**
			 * The error code
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		once(event: 'certificate-error', listener: (event: Event,
			webContents: WebContents,
			url: string,
			/**
			 * The error code
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		addListener(event: 'certificate-error', listener: (event: Event,
			webContents: WebContents,
			url: string,
			/**
			 * The error code
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		removeListener(event: 'certificate-error', listener: (event: Event,
			webContents: WebContents,
			url: string,
			/**
			 * The error code
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		/**
		 * Emitted during Handoff when an activity from a different device wants to be
		 * resumed. You should call `event.preventDefault()` if you want to handle this
		 * event.
		 *
		 * A user activity can be continued only in an app that has the same developer Team
		 * ID as the activity's source app and that supports the activity's type. Supported
		 * activity types are specified in the app's `Info.plist` under the
		 * `NSUserActivityTypes` key.
		 *
		 * @platform darwin
		 */
		on(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: unknown) => void): this;
		once(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: unknown) => void): this;
		addListener(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: unknown) => void): this;
		removeListener(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: unknown) => void): this;
		/**
		 * Emitted during Handoff when an activity from a different device fails to be
		 * resumed.
		 *
		 * @platform darwin
		 */
		on(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		once(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		addListener(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		removeListener(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		/**
		 * Emitted when `desktopCapturer.getSources()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will make it return empty
		 * sources.
		 */
		on(event: 'desktop-capturer-get-sources', listener: (event: Event,
			webContents: WebContents) => void): this;
		once(event: 'desktop-capturer-get-sources', listener: (event: Event,
			webContents: WebContents) => void): this;
		addListener(event: 'desktop-capturer-get-sources', listener: (event: Event,
			webContents: WebContents) => void): this;
		removeListener(event: 'desktop-capturer-get-sources', listener: (event: Event,
			webContents: WebContents) => void): this;
		/**
		 * Emitted whenever there is a GPU info update.
		 */
		on(event: 'gpu-info-update', listener: Function): this;
		once(event: 'gpu-info-update', listener: Function): this;
		addListener(event: 'gpu-info-update', listener: Function): this;
		removeListener(event: 'gpu-info-update', listener: Function): this;
		/**
		 * Emitted when the GPU process crashes or is killed.
		 */
		on(event: 'gpu-process-crashed', listener: (event: Event,
			killed: boolean) => void): this;
		once(event: 'gpu-process-crashed', listener: (event: Event,
			killed: boolean) => void): this;
		addListener(event: 'gpu-process-crashed', listener: (event: Event,
			killed: boolean) => void): this;
		removeListener(event: 'gpu-process-crashed', listener: (event: Event,
			killed: boolean) => void): this;
		/**
		 * Emitted when `webContents` wants to do basic auth.
		 *
		 * The default behavior is to cancel all authentications. To override this you
		 * should prevent the default behavior with `event.preventDefault()` and call
		 * `callback(username, password)` with the credentials.
		 */
		on(event: 'login', listener: (event: Event,
			webContents: WebContents,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		once(event: 'login', listener: (event: Event,
			webContents: WebContents,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		addListener(event: 'login', listener: (event: Event,
			webContents: WebContents,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		removeListener(event: 'login', listener: (event: Event,
			webContents: WebContents,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		/**
		 * Emitted when the user clicks the native macOS new tab button. The new tab button
		 * is only visible if the current `BrowserWindow` has a `tabbingIdentifier`
		 *
		 * @platform darwin
		 */
		on(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		once(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		addListener(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		removeListener(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		/**
		 * Emitted when the user wants to open a file with the application. The `open-file`
		 * event is usually emitted when the application is already open and the OS wants
		 * to reuse the application to open the file. `open-file` is also emitted when a
		 * file is dropped onto the dock and the application is not yet running. Make sure
		 * to listen for the `open-file` event very early in your application startup to
		 * handle this case (even before the `ready` event is emitted).
		 *
		 * You should call `event.preventDefault()` if you want to handle this event.
		 *
		 * On Windows, you have to parse `process.argv` (in the main process) to get the
		 * filepath.
		 *
		 * @platform darwin
		 */
		on(event: 'open-file', listener: (event: Event,
			path: string) => void): this;
		once(event: 'open-file', listener: (event: Event,
			path: string) => void): this;
		addListener(event: 'open-file', listener: (event: Event,
			path: string) => void): this;
		removeListener(event: 'open-file', listener: (event: Event,
			path: string) => void): this;
		/**
		 * Emitted when the user wants to open a URL with the application. Your
		 * application's `Info.plist` file must define the URL scheme within the
		 * `CFBundleURLTypes` key, and set `NSPrincipalClass` to `AtomApplication`.
		 *
	You should call `event.preventDefault()` if you want to handle this event.
		 *
		 * @platform darwin
		 */
		on(event: 'open-url', listener: (event: Event,
			url: string) => void): this;
		once(event: 'open-url', listener: (event: Event,
			url: string) => void): this;
		addListener(event: 'open-url', listener: (event: Event,
			url: string) => void): this;
		removeListener(event: 'open-url', listener: (event: Event,
			url: string) => void): this;
		/**
		 * Emitted when the application is quitting.
		 *
		 * **Note:** On Windows, this event will not be emitted if the app is closed due to
		 * a shutdown/restart of the system or a user logout.
		 */
		on(event: 'quit', listener: (event: Event,
			exitCode: number) => void): this;
		once(event: 'quit', listener: (event: Event,
			exitCode: number) => void): this;
		addListener(event: 'quit', listener: (event: Event,
			exitCode: number) => void): this;
		removeListener(event: 'quit', listener: (event: Event,
			exitCode: number) => void): this;
		/**
		 * Emitted when Electron has finished initializing. On macOS, `launchInfo` holds
		 * the `userInfo` of the `NSUserNotification` that was used to open the
		 * application, if it was launched from Notification Center. You can call
		 * `app.isReady()` to check if this event has already fired.
		 */
		on(event: 'ready', listener: (launchInfo: unknown) => void): this;
		once(event: 'ready', listener: (launchInfo: unknown) => void): this;
		addListener(event: 'ready', listener: (launchInfo: unknown) => void): this;
		removeListener(event: 'ready', listener: (launchInfo: unknown) => void): this;
		/**
		 * Emitted when `remote.getBuiltin()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will prevent the module from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-builtin', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		once(event: 'remote-get-builtin', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		addListener(event: 'remote-get-builtin', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		removeListener(event: 'remote-get-builtin', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		/**
		 * Emitted when `remote.getCurrentWebContents()` is called in the renderer process
		 * of `webContents`. Calling `event.preventDefault()` will prevent the object from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-current-web-contents', listener: (event: Event,
			webContents: WebContents) => void): this;
		once(event: 'remote-get-current-web-contents', listener: (event: Event,
			webContents: WebContents) => void): this;
		addListener(event: 'remote-get-current-web-contents', listener: (event: Event,
			webContents: WebContents) => void): this;
		removeListener(event: 'remote-get-current-web-contents', listener: (event: Event,
			webContents: WebContents) => void): this;
		/**
		 * Emitted when `remote.getCurrentWindow()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will prevent the object from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-current-window', listener: (event: Event,
			webContents: WebContents) => void): this;
		once(event: 'remote-get-current-window', listener: (event: Event,
			webContents: WebContents) => void): this;
		addListener(event: 'remote-get-current-window', listener: (event: Event,
			webContents: WebContents) => void): this;
		removeListener(event: 'remote-get-current-window', listener: (event: Event,
			webContents: WebContents) => void): this;
		/**
		 * Emitted when `remote.getGlobal()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will prevent the global from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-global', listener: (event: Event,
			webContents: WebContents,
			globalName: string) => void): this;
		once(event: 'remote-get-global', listener: (event: Event,
			webContents: WebContents,
			globalName: string) => void): this;
		addListener(event: 'remote-get-global', listener: (event: Event,
			webContents: WebContents,
			globalName: string) => void): this;
		removeListener(event: 'remote-get-global', listener: (event: Event,
			webContents: WebContents,
			globalName: string) => void): this;
		/**
		 * Emitted when `<webview>.getWebContents()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will prevent the object from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-guest-web-contents', listener: (event: Event,
			webContents: WebContents,
			guestWebContents: WebContents) => void): this;
		once(event: 'remote-get-guest-web-contents', listener: (event: Event,
			webContents: WebContents,
			guestWebContents: WebContents) => void): this;
		addListener(event: 'remote-get-guest-web-contents', listener: (event: Event,
			webContents: WebContents,
			guestWebContents: WebContents) => void): this;
		removeListener(event: 'remote-get-guest-web-contents', listener: (event: Event,
			webContents: WebContents,
			guestWebContents: WebContents) => void): this;
		/**
		 * Emitted when `remote.require()` is called in the renderer process of
		 * `webContents`. Calling `event.preventDefault()` will prevent the module from
		 * being returned. Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-require', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		once(event: 'remote-require', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		addListener(event: 'remote-require', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		removeListener(event: 'remote-require', listener: (event: Event,
			webContents: WebContents,
			moduleName: string) => void): this;
		/**
		 * Emitted when the renderer process of `webContents` crashes or is killed.
		 */
		on(event: 'renderer-process-crashed', listener: (event: Event,
			webContents: WebContents,
			killed: boolean) => void): this;
		once(event: 'renderer-process-crashed', listener: (event: Event,
			webContents: WebContents,
			killed: boolean) => void): this;
		addListener(event: 'renderer-process-crashed', listener: (event: Event,
			webContents: WebContents,
			killed: boolean) => void): this;
		removeListener(event: 'renderer-process-crashed', listener: (event: Event,
			webContents: WebContents,
			killed: boolean) => void): this;
		/**
		 * This event will be emitted inside the primary instance of your application when
		 * a second instance has been executed and calls `app.requestSingleInstanceLock()`.
		 *
		 * `argv` is an Array of the second instance's command line arguments, and
		 * `workingDirectory` is its current working directory. Usually applications
		 * respond to this by making their primary window focused and non-minimized.
		 *
		 * This event is guaranteed to be emitted after the `ready` event of `app` gets
		 * emitted.
		 *
		 * **Note:** Extra command line arguments might be added by Chromium, such as
		 * `--original-process-start-time`.
		 */
		on(event: 'second-instance', listener: (event: Event,
			/**
			 * An array of the second instance's command line arguments
			 */
			argv: string[],
			/**
			 * The second instance's working directory
			 */
			workingDirectory: string) => void): this;
		once(event: 'second-instance', listener: (event: Event,
			/**
			 * An array of the second instance's command line arguments
			 */
			argv: string[],
			/**
			 * The second instance's working directory
			 */
			workingDirectory: string) => void): this;
		addListener(event: 'second-instance', listener: (event: Event,
			/**
			 * An array of the second instance's command line arguments
			 */
			argv: string[],
			/**
			 * The second instance's working directory
			 */
			workingDirectory: string) => void): this;
		removeListener(event: 'second-instance', listener: (event: Event,
			/**
			 * An array of the second instance's command line arguments
			 */
			argv: string[],
			/**
			 * The second instance's working directory
			 */
			workingDirectory: string) => void): this;
		/**
		 * Emitted when a client certificate is requested.
		 *
		 * The `url` corresponds to the navigation entry requesting the client certificate
		 * and `callback` can be called with an entry filtered from the list. Using
		 * `event.preventDefault()` prevents the application from using the first
		 * certificate from the store.
		 */
		on(event: 'select-client-certificate', listener: (event: Event,
			webContents: WebContents,
			url: string,
			certificateList: Certificate[],
			callback: (certificate?: Certificate) => void) => void): this;
		once(event: 'select-client-certificate', listener: (event: Event,
			webContents: WebContents,
			url: string,
			certificateList: Certificate[],
			callback: (certificate?: Certificate) => void) => void): this;
		addListener(event: 'select-client-certificate', listener: (event: Event,
			webContents: WebContents,
			url: string,
			certificateList: Certificate[],
			callback: (certificate?: Certificate) => void) => void): this;
		removeListener(event: 'select-client-certificate', listener: (event: Event,
			webContents: WebContents,
			url: string,
			certificateList: Certificate[],
			callback: (certificate?: Certificate) => void) => void): this;
		/**
		 * Emitted when Electron has created a new `session`.
		 */
		on(event: 'session-created', listener: (session: Session) => void): this;
		once(event: 'session-created', listener: (session: Session) => void): this;
		addListener(event: 'session-created', listener: (session: Session) => void): this;
		removeListener(event: 'session-created', listener: (session: Session) => void): this;
		/**
		 * Emitted when Handoff is about to be resumed on another device. If you need to
		 * update the state to be transferred, you should call `event.preventDefault()`
		 * immediately, construct a new `userInfo` dictionary and call
		 * `app.updateCurrentActiviy()` in a timely manner. Otherwise, the operation will
		 * fail and `continue-activity-error` will be called.
		 *
		 * @platform darwin
		 */
		on(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		once(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		addListener(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		removeListener(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: unknown) => void): this;
		/**
		 * Emitted when a new webContents is created.
		 */
		on(event: 'web-contents-created', listener: (event: Event,
			webContents: WebContents) => void): this;
		once(event: 'web-contents-created', listener: (event: Event,
			webContents: WebContents) => void): this;
		addListener(event: 'web-contents-created', listener: (event: Event,
			webContents: WebContents) => void): this;
		removeListener(event: 'web-contents-created', listener: (event: Event,
			webContents: WebContents) => void): this;
		/**
		 * Emitted during Handoff before an activity from a different device wants to be
		 * resumed. You should call `event.preventDefault()` if you want to handle this
		 * event.
		 *
		 * @platform darwin
		 */
		on(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string) => void): this;
		once(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string) => void): this;
		addListener(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string) => void): this;
		removeListener(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to `NSUserActivity.activityType`.
			 */
			type: string) => void): this;
		/**
		 * Emitted when the application has finished basic startup. On Windows and Linux,
		 * the `will-finish-launching` event is the same as the `ready` event; on macOS,
		 * this event represents the `applicationWillFinishLaunching` notification of
		 * `NSApplication`. You would usually set up listeners for the `open-file` and
		 * `open-url` events here, and start the crash reporter and auto updater.
		 *
	In most cases, you should do everything in the `ready` event handler.
		 */
		on(event: 'will-finish-launching', listener: Function): this;
		once(event: 'will-finish-launching', listener: Function): this;
		addListener(event: 'will-finish-launching', listener: Function): this;
		removeListener(event: 'will-finish-launching', listener: Function): this;
		/**
		 * Emitted when all windows have been closed and the application will quit. Calling
		 * `event.preventDefault()` will prevent the default behaviour, which is
		 * terminating the application.
		 *
		 * See the description of the `window-all-closed` event for the differences between
		 * the `will-quit` and `window-all-closed` events.
		 *
		 * **Note:** On Windows, this event will not be emitted if the app is closed due to
		 * a shutdown/restart of the system or a user logout.
		 */
		on(event: 'will-quit', listener: (event: Event) => void): this;
		once(event: 'will-quit', listener: (event: Event) => void): this;
		addListener(event: 'will-quit', listener: (event: Event) => void): this;
		removeListener(event: 'will-quit', listener: (event: Event) => void): this;
		/**
		 * Emitted when all windows have been closed.
		 *
		 * If you do not subscribe to this event and all windows are closed, the default
		 * behavior is to quit the app; however, if you subscribe, you control whether the
		 * app quits or not. If the user pressed `Cmd + Q`, or the developer called
		 * `app.quit()`, Electron will first try to close all the windows and then emit the
		 * `will-quit` event, and in this case the `window-all-closed` event would not be
		 * emitted.
		 */
		on(event: 'window-all-closed', listener: Function): this;
		once(event: 'window-all-closed', listener: Function): this;
		addListener(event: 'window-all-closed', listener: Function): this;
		removeListener(event: 'window-all-closed', listener: Function): this;
		/**
		 * Adds `path` to the recent documents list.
		 *
		 * This list is managed by the OS. On Windows, you can visit the list from the task
		 * bar, and on macOS, you can visit it from dock menu.
		 *
		 * @platform darwin,win32
		 */
		addRecentDocument(path: string): void;
		/**
		 * Clears the recent documents list.
		 *
		 * @platform darwin,win32
		 */
		clearRecentDocuments(): void;
		/**
		 * By default, Chromium disables 3D APIs (e.g. WebGL) until restart on a per domain
		 * basis if the GPU processes crashes too frequently. This function disables that
		 * behaviour.

	This method can only be called before app is ready.
		 */
		disableDomainBlockingFor3DAPIs(): void;
		/**
		 * Disables hardware acceleration for current app.
		 *
	This method can only be called before app is ready.
		 */
		disableHardwareAcceleration(): void;
		/**
		 * Enables full sandbox mode on the app.
		 *
	This method can only be called before app is ready.
		 *
		 * @experimental
		 */
		enableSandbox(): void;
		/**
		 * Exits immediately with `exitCode`. `exitCode` defaults to 0.
		 *
		 * All windows will be closed immediately without asking the user, and the
		 * `before-quit` and `will-quit` events will not be emitted.
		 */
		exit(exitCode?: number): void;
		/**
		 * On Linux, focuses on the first visible window. On macOS, makes the application
		 * the active app. On Windows, focuses on the application's first window.
		 */
		focus(): void;
		/**
		 * Array of `ProcessMetric` objects that correspond to memory and CPU usage
		 * statistics of all the processes associated with the app.
		 */
		getAppMetrics(): ProcessMetric[];
		/**
		 * The current application directory.
		 */
		getAppPath(): string;
		/**
		 * The current value displayed in the counter badge.

	**Deprecated**
		 *
		 * @platform linux,darwin
		 */
		getBadgeCount(): number;
		/**
		 * The type of the currently running activity.
		 *
		 * @platform darwin
		 */
		getCurrentActivityType(): string;
		/**
		 * fulfilled with the app's icon, which is a NativeImage.
		 *
		 * Fetches a path's associated icon.
		 *
		 * On _Windows_, there a 2 kinds of icons:
		 *
		 * * Icons associated with certain file extensions, like `.mp3`, `.png`, etc.
		 * * Icons inside the file itself, like `.exe`, `.dll`, `.ico`.
		 *
		 * On _Linux_ and _macOS_, icons depend on the application associated with file
		 * mime type.
		 */
		getFileIcon(path: string, options?: FileIconOptions): Promise<Electron.NativeImage>;
		/**
		 * The Graphics Feature Status from `chrome://gpu/`.
		 *
		 * **Note:** This information is only usable after the `gpu-info-update` event is
		 * emitted.
		 */
		getGPUFeatureStatus(): GPUFeatureStatus;
		/**
		 * For `infoType` equal to `complete`: Promise is fulfilled with `Object`
		 * containing all the GPU Information as in chromium's GPUInfo object. This
		 * includes the version and driver information that's shown on `chrome://gpu` page.
		 *
		 * For `infoType` equal to `basic`: Promise is fulfilled with `Object` containing
		 * fewer attributes than when requested with `complete`. Here's an example of basic
		 * response:
		 *
		 * Using `basic` should be preferred if only basic information like `vendorId` or
		 * `driverId` is needed.
		 */
		getGPUInfo(infoType: 'basic' | 'complete'): Promise<unknown>;
		/**
		 * * `minItems` Integer - The minimum number of items that will be shown in the
		 * Jump List (for a more detailed description of this value see the MSDN docs).
		 * * `removedItems` JumpListItem[] - Array of `JumpListItem` objects that
		 * correspond to items that the user has explicitly removed from custom categories
		 * in the Jump List. These items must not be re-added to the Jump List in the
		 * **next** call to `app.setJumpList()`, Windows will not display any custom
		 * category that contains any of the removed items.
		 *
		 * @platform win32
		 */
		getJumpListSettings(): JumpListSettings;
		/**
		 * The current application locale. Possible return values are documented here.
		 *
		 * To set the locale, you'll want to use a command line switch at app startup,
		 * which may be found here.
		 *
		 * **Note:** When distributing your packaged app, you have to also ship the
		 * `locales` folder.
		 *
		 * **Note:** On Windows, you have to call it after the `ready` events gets emitted.
		 */
		getLocale(): string;
		/**
		 * User operating system's locale two-letter ISO 3166 country code. The value is
		 * taken from native OS APIs.
		 *
	**Note:** When unable to detect locale country code, it returns empty string.
		 */
		getLocaleCountryCode(): string;
		/**
		 * If you provided `path` and `args` options to `app.setLoginItemSettings`, then
		 * you need to pass the same arguments here for `openAtLogin` to be set correctly.
		 *
		 *
		 * * `openAtLogin` Boolean - `true` if the app is set to open at login.
		 * * `openAsHidden` Boolean _macOS_ - `true` if the app is set to open as hidden at
		 * login. This setting is not available on MAS builds.
		 * * `wasOpenedAtLogin` Boolean _macOS_ - `true` if the app was opened at login
		 * automatically. This setting is not available on MAS builds.
		 * * `wasOpenedAsHidden` Boolean _macOS_ - `true` if the app was opened as a hidden
		 * login item. This indicates that the app should not open any windows at startup.
		 * This setting is not available on MAS builds.
		 * * `restoreState` Boolean _macOS_ - `true` if the app was opened as a login item
		 * that should restore the state from the previous session. This indicates that the
		 * app should restore the windows that were open the last time the app was closed.
		 * This setting is not available on MAS builds.
		 *
		 * @platform darwin,win32
		 */
		getLoginItemSettings(options?: LoginItemSettingsOptions): LoginItemSettings;
		/**
		 * The current application's name, which is the name in the application's
		 * `package.json` file.
		 *
		 * Usually the `name` field of `package.json` is a short lowercase name, according
		 * to the npm modules spec. You should usually also specify a `productName` field,
		 * which is your application's full capitalized name, and which will be preferred
		 * over `name` by Electron.

	**Deprecated**
		 */
		getName(): string;
		/**
		 * A path to a special directory or file associated with `name`. On failure, an
		 * `Error` is thrown.
		 *
		 * If `app.getPath('logs')` is called without called `app.setAppLogsPath()` being
		 * called first, a default log directory will be created equivalent to calling
		 * `app.setAppLogsPath()` without a `path` parameter.
		 */
		getPath(name: 'home' | 'appData' | 'userData' | 'cache' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'logs' | 'pepperFlashSystemPlugin'): string;
		/**
		 * The version of the loaded application. If no version is found in the
		 * application's `package.json` file, the version of the current bundle or
		 * executable is returned.
		 */
		getVersion(): string;
		/**
		 * This method returns whether or not this instance of your app is currently
		 * holding the single instance lock.  You can request the lock with
		 * `app.requestSingleInstanceLock()` and release with
		 * `app.releaseSingleInstanceLock()`
		 */
		hasSingleInstanceLock(): boolean;
		/**
		 * Hides all application windows without minimizing them.
		 *
		 * @platform darwin
		 */
		hide(): void;
		/**
		 * Imports the certificate in pkcs12 format into the platform certificate store.
		 * `callback` is called with the `result` of import operation, a value of `0`
		 * indicates success while any other value indicates failure according to Chromium
		 * net_error_list.
		 *
		 * @platform linux
		 */
		importCertificate(options: ImportCertificateOptions, callback: (result: number) => void): void;
		/**
		 * Invalidates the current Handoff user activity.
		 *
		 * @platform darwin
		 */
		invalidateCurrentActivity(): void;
		/**
		 * `true` if Chrome's accessibility support is enabled, `false` otherwise. This API
		 * will return `true` if the use of assistive technologies, such as screen readers,
		 * has been detected. See
		 * https://www.chromium.org/developers/design-documents/accessibility for more
		 * details.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		isAccessibilitySupportEnabled(): boolean;
		/**
		 * This method checks if the current executable is the default handler for a
		 * protocol (aka URI scheme). If so, it will return true. Otherwise, it will return
		 * false.
		 *
		 * **Note:** On macOS, you can use this method to check if the app has been
		 * registered as the default protocol handler for a protocol. You can also verify
		 * this by checking `~/Library/Preferences/com.apple.LaunchServices.plist` on the
		 * macOS machine. Please refer to Apple's documentation for details.
		 *
		 * The API uses the Windows Registry and LSCopyDefaultHandlerForURLScheme
		 * internally.
		 */
		isDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * whether or not the current OS version allows for native emoji pickers.
		 */
		isEmojiPanelSupported(): boolean;
		/**
		 * Whether the application is currently running from the systems Application
		 * folder. Use in combination with `app.moveToApplicationsFolder()`
		 *
		 * @platform darwin
		 */
		isInApplicationsFolder(): boolean;
		/**
		 * `true` if Electron has finished initializing, `false` otherwise.
		 */
		isReady(): boolean;
		/**
		 * Whether the current desktop environment is Unity launcher.
		 *
		 * @platform linux
		 */
		isUnityRunning(): boolean;
		/**
		 * Whether the move was successful. Please note that if the move is successful,
		 * your application will quit and relaunch.
		 *
		 * No confirmation dialog will be presented by default. If you wish to allow the
		 * user to confirm the operation, you may do so using the `dialog` API.
		 *
		 * **NOTE:** This method throws errors if anything other than the user causes the
		 * move to fail. For instance if the user cancels the authorization dialog, this
		 * method returns false. If we fail to perform the copy, then this method will
		 * throw an error. The message in the error should be informative and tell you
		 * exactly what went wrong.
		 *
		 * By default, if an app of the same name as the one being moved exists in the
		 * Applications directory and is _not_ running, the existing app will be trashed
		 * and the active app moved into its place. If it _is_ running, the pre-existing
		 * running app will assume focus and the the previously active app will quit
		 * itself. This behavior can be changed by providing the optional conflict handler,
		 * where the boolean returned by the handler determines whether or not the move
		 * conflict is resolved with default behavior.  i.e. returning `false` will ensure
		 * no further action is taken, returning `true` will result in the default behavior
		 * and the method continuing.
		 *
		 * For example:
		 *
		 * Would mean that if an app already exists in the user directory, if the user
		 * chooses to 'Continue Move' then the function would continue with its default
		 * behavior and the existing app will be trashed and the active app moved into its
		 * place.
		 *
		 * @platform darwin
		 */
		moveToApplicationsFolder(options?: MoveToApplicationsFolderOptions): boolean;
		/**
		 * Try to close all windows. The `before-quit` event will be emitted first. If all
		 * windows are successfully closed, the `will-quit` event will be emitted and by
		 * default the application will terminate.
		 *
		 * This method guarantees that all `beforeunload` and `unload` event handlers are
		 * correctly executed. It is possible that a window cancels the quitting by
		 * returning `false` in the `beforeunload` event handler.
		 */
		quit(): void;
		/**
		 * Relaunches the app when current instance exits.
		 *
		 * By default, the new instance will use the same working directory and command
		 * line arguments with current instance. When `args` is specified, the `args` will
		 * be passed as command line arguments instead. When `execPath` is specified, the
		 * `execPath` will be executed for relaunch instead of current app.
		 *
		 * Note that this method does not quit the app when executed, you have to call
		 * `app.quit` or `app.exit` after calling `app.relaunch` to make the app restart.
		 *
		 * When `app.relaunch` is called for multiple times, multiple instances will be
		 * started after current instance exited.
		 *
		 * An example of restarting current instance immediately and adding a new command
		 * line argument to the new instance:
		 */
		relaunch(options?: RelaunchOptions): void;
		/**
		 * Releases all locks that were created by `requestSingleInstanceLock`. This will
		 * allow multiple instances of the application to once again run side by side.
		 */
		releaseSingleInstanceLock(): void;
		/**
		 * Whether the call succeeded.
		 *
		 * This method checks if the current executable as the default handler for a
		 * protocol (aka URI scheme). If so, it will remove the app as the default handler.
		 *
		 * @platform darwin,win32
		 */
		removeAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * The return value of this method indicates whether or not this instance of your
		 * application successfully obtained the lock.  If it failed to obtain the lock,
		 * you can assume that another instance of your application is already running with
		 * the lock and exit immediately.
		 *
		 * I.e. This method returns `true` if your process is the primary instance of your
		 * application and your app should continue loading.  It returns `false` if your
		 * process should immediately quit as it has sent its parameters to another
		 * instance that has already acquired the lock.
		 *
		 * On macOS, the system enforces single instance automatically when users try to
		 * open a second instance of your app in Finder, and the `open-file` and `open-url`
		 * events will be emitted for that. However when users start your app in command
		 * line, the system's single instance mechanism will be bypassed, and you have to
		 * use this method to ensure single instance.
		 *
		 * An example of activating the window of primary instance when a second instance
		 * starts:
		 */
		requestSingleInstanceLock(): boolean;
		/**
		 * Marks the current Handoff user activity as inactive without invalidating it.
		 *
		 * @platform darwin
		 */
		resignCurrentActivity(): void;
		/**
		 * Set the about panel options. This will override the values defined in the app's
		 * `.plist` file on MacOS. See the Apple docs for more details. On Linux, values
		 * must be set in order to be shown; there are no defaults.
		 *
		 * @platform darwin,linux
		 */
		setAboutPanelOptions(options: AboutPanelOptionsOptions): void;
		/**
		 * Manually enables Chrome's accessibility support, allowing to expose
		 * accessibility switch to users in application settings. See Chromium's
		 * accessibility docs for more details. Disabled by default.
		 *
		 * This API must be called after the `ready` event is emitted.
		 *
		 * **Note:** Rendering accessibility tree can significantly affect the performance
		 * of your app. It should not be enabled by default.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		setAccessibilitySupportEnabled(enabled: boolean): void;
		/**
		 * Sets or creates a directory your app's logs which can then be manipulated with
		 * `app.getPath()` or `app.setPath(pathName, newPath)`.
		 *
		 * Calling `app.setAppLogsPath()` without a `path` parameter will result in this
		 * directory being set to `~/Library/Logs/YourAppName` on _macOS_, and inside the
		 * `userData` directory on _Linux_ and _Windows_.
		 */
		setAppLogsPath(path?: string): void;
		/**
		 * Changes the Application User Model ID to `id`.
		 *
		 * @platform win32
		 */
		setAppUserModelId(id: string): void;
		/**
		 * Whether the call succeeded.
		 *
		 * This method sets the current executable as the default handler for a protocol
		 * (aka URI scheme). It allows you to integrate your app deeper into the operating
		 * system. Once registered, all links with `your-protocol://` will be opened with
		 * the current executable. The whole link, including protocol, will be passed to
		 * your application as a parameter.
		 *
		 * On Windows, you can provide optional parameters path, the path to your
		 * executable, and args, an array of arguments to be passed to your executable when
		 * it launches.
		 *
		 * **Note:** On macOS, you can only register protocols that have been added to your
		 * app's `info.plist`, which can not be modified at runtime. You can however change
		 * the file with a simple text editor or script during build time. Please refer to
		 * Apple's documentation for details.
		 *
		 * **Note:** In a Windows Store environment (when packaged as an `appx`) this API
		 * will return `true` for all calls but the registry key it sets won't be
		 * accessible by other applications.  In order to register your Windows Store
		 * application as a default protocol handler you must declare the protocol in your
		 * manifest.
		 *
		 * The API uses the Windows Registry and LSSetDefaultHandlerForURLScheme
		 * internally.
		 */
		setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * Whether the call succeeded.
		 *
		 * Sets the counter badge for current app. Setting the count to `0` will hide the
		 * badge.
		 *
		 * On macOS, it shows on the dock icon. On Linux, it only works for Unity launcher.
		 *
		 * **Note:** Unity launcher requires the existence of a `.desktop` file to work,
		 * for more information please read Desktop Environment Integration.
		 *
	**Deprecated**
		 *
		 * @platform linux,darwin
		 */
		setBadgeCount(count: number): boolean;
		/**
		 * Sets or removes a custom Jump List for the application, and returns one of the
		 * following strings:
		 *
		 * * `ok` - Nothing went wrong.
		 * * `error` - One or more errors occurred, enable runtime logging to figure out
		 * the likely cause.
		 * * `invalidSeparatorError` - An attempt was made to add a separator to a custom
		 * category in the Jump List. Separators are only allowed in the standard `Tasks`
		 * category.
		 * * `fileTypeRegistrationError` - An attempt was made to add a file link to the
		 * Jump List for a file type the app isn't registered to handle.
		 * * `customCategoryAccessDeniedError` - Custom categories can't be added to the
		 * Jump List due to user privacy or group policy settings.
		 *
		 * If `categories` is `null` the previously set custom Jump List (if any) will be
		 * replaced by the standard Jump List for the app (managed by Windows).
		 *
		 * **Note:** If a `JumpListCategory` object has neither the `type` nor the `name`
		 * property set then its `type` is assumed to be `tasks`. If the `name` property is
		 * set but the `type` property is omitted then the `type` is assumed to be
		 * `custom`.
		 *
		 * **Note:** Users can remove items from custom categories, and Windows will not
		 * allow a removed item to be added back into a custom category until **after** the
		 * next successful call to `app.setJumpList(categories)`. Any attempt to re-add a
		 * removed item to a custom category earlier than that will result in the entire
		 * custom category being omitted from the Jump List. The list of removed items can
		 * be obtained using `app.getJumpListSettings()`.
		 *
	Here's a very simple example of creating a custom Jump List:
		 *
		 * @platform win32
		 */
		setJumpList(categories: (JumpListCategory[]) | (null)): void;
		/**
		 * Set the app's login item settings.
		 *
		 * To work with Electron's `autoUpdater` on Windows, which uses Squirrel, you'll
		 * want to set the launch path to Update.exe, and pass arguments that specify your
		 * application name. For example:
		 *
		 * @platform darwin,win32
		 */
		setLoginItemSettings(settings: Settings): void;
		/**
		 * Overrides the current application's name.

	**Deprecated**
		 */
		setName(name: string): void;
		/**
		 * Overrides the `path` to a special directory or file associated with `name`. If
		 * the path specifies a directory that does not exist, an `Error` is thrown. In
		 * that case, the directory should be created with `fs.mkdirSync` or similar.
		 *
		 * You can only override paths of a `name` defined in `app.getPath`.
		 *
		 * By default, web pages' cookies and caches will be stored under the `userData`
		 * directory. If you want to change this location, you have to override the
		 * `userData` path before the `ready` event of the `app` module is emitted.
		 */
		setPath(name: string, path: string): void;
		/**
		 * Creates an `NSUserActivity` and sets it as the current activity. The activity is
		 * eligible for Handoff to another device afterward.
		 *
		 * @platform darwin
		 */
		setUserActivity(type: string, userInfo: any, webpageURL?: string): void;
		/**
		 * Adds `tasks` to the Tasks category of the Jump List on Windows.
		 *
		 * `tasks` is an array of `Task` objects.
		 *
		 * Whether the call succeeded.
		 *
		 * **Note:** If you'd like to customize the Jump List even more use
		 * `app.setJumpList(categories)` instead.
		 *
		 * @platform win32
		 */
		setUserTasks(tasks: Task[]): boolean;
		/**
		 * Shows application windows after they were hidden. Does not automatically focus
		 * them.
		 *
		 * @platform darwin
		 */
		show(): void;
		/**
		 * Show the app's about panel options. These options can be overridden with
		 * `app.setAboutPanelOptions(options)`.
		 *
		 * @platform darwin,linux
		 */
		showAboutPanel(): void;
		/**
		 * Show the platform's native emoji picker.
		 *
		 * @platform darwin,win32
		 */
		showEmojiPanel(): void;
		/**
		 * This function **must** be called once you have finished accessing the security
		 * scoped file. If you do not remember to stop accessing the bookmark, kernel
		 * resources will be leaked and your app will lose its ability to reach outside the
		 * sandbox completely, until your app is restarted.
		 *
		 * Start accessing a security scoped resource. With this method Electron
		 * applications that are packaged for the Mac App Store may reach outside their
		 * sandbox to access files chosen by the user. See Apple's documentation for a
		 * description of how this system works.
		 *
		 * @platform mas
		 */
		startAccessingSecurityScopedResource(bookmarkData: string): Function;
		/**
		 * Updates the current activity if its type matches `type`, merging the entries
		 * from `userInfo` into its current `userInfo` dictionary.
		 *
		 * @platform darwin
		 */
		updateCurrentActivity(type: string, userInfo: any): void;
		/**
		 * fulfilled when Electron is initialized. May be used as a convenient alternative
		 * to checking `app.isReady()` and subscribing to the `ready` event if the app is
		 * not ready yet.
		 */
		whenReady(): Promise<void>;
		/**
		 * A `Boolean` property that's `true` if Chrome's accessibility support is enabled,
		 * `false` otherwise. This property will be `true` if the use of assistive
		 * technologies, such as screen readers, has been detected. Setting this property
		 * to `true` manually enables Chrome's accessibility support, allowing developers
		 * to expose accessibility switch to users in application settings.
		 *
		 * See Chromium's accessibility docs for more details. Disabled by default.
		 *
		 * This API must be called after the `ready` event is emitted.
		 *
		 * **Note:** Rendering accessibility tree can significantly affect the performance
		 * of your app. It should not be enabled by default.
		 *
		 * @platform darwin,win32
		 */
		accessibilitySupportEnabled: boolean;
		/**
		 * A `Boolean` which when `true` disables the overrides that Electron has in place
		 * to ensure renderer processes are restarted on every navigation.  The current
		 * default value for this property is `false`.
		 *
		 * The intention is for these overrides to become disabled by default and then at
		 * some point in the future this property will be removed.  This property impacts
		 * which native modules you can use in the renderer process.  For more information
		 * on the direction Electron is going with renderer process restarts and usage of
		 * native modules in the renderer process please check out this Tracking Issue.
		 */
		allowRendererProcessReuse: boolean;
		/**
		 * A `Menu | null` property that returns `Menu` if one has been set and `null`
		 * otherwise. Users can pass a Menu to set this property.
		 */
		applicationMenu: (Menu) | (null);
		/**
		 * An `Integer` property that returns the badge count for current app. Setting the
		 * count to `0` will hide the badge.
		 *
		 * On macOS, setting this with any nonzero integer shows on the dock icon. On
		 * Linux, this property only works for Unity launcher.
		 *
		 * **Note:** Unity launcher requires the existence of a `.desktop` file to work,
		 * for more information please read Desktop Environment Integration.
		 *
		 * @platform linux,darwin
		 */
		badgeCount: number;
		/**
		 * A `CommandLine` object that allows you to read and manipulate the command line
		 * arguments that Chromium uses.
		 *
		 */
		readonly commandLine: CommandLine;
		/**
		 * A `Dock` object that allows you to perform actions on your app icon in the
		 * user's dock on macOS.
		 *
		 * @platform darwin
		 */
		readonly dock: Dock;
		/**
		 * A `Boolean` property that returns  `true` if the app is packaged, `false`
		 * otherwise. For many apps, this property can be used to distinguish development
		 * and production environments.
		 *
		 */
		readonly isPackaged: boolean;
		/**
		 * A `String` property that indicates the current application's name, which is the
		 * name in the application's `package.json` file.
		 *
		 * Usually the `name` field of `package.json` is a short lowercase name, according
		 * to the npm modules spec. You should usually also specify a `productName` field,
		 * which is your application's full capitalized name, and which will be preferred
		 * over `name` by Electron.
		 */
		name: string;
		/**
		 * A `String` which is the user agent string Electron will use as a global
		 * fallback.
		 *
		 * This is the user agent that will be used when no user agent is set at the
		 * `webContents` or `session` level.  It is useful for ensuring that your entire
		 * app has the same user agent.  Set to a custom value as early as possible in your
		 * app's initialization to ensure that your overridden value is used.
		 */
		userAgentFallback: string;
	}

	interface AutoUpdater extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/auto-updater

		/**
		 * This event is emitted after a user calls `quitAndInstall()`.
		 *
		 * When this API is called, the `before-quit` event is not emitted before all
		 * windows are closed. As a result you should listen to this event if you wish to
		 * perform actions before the windows are closed while a process is quitting, as
		 * well as listening to `before-quit`.
		 */
		on(event: 'before-quit-for-update', listener: Function): this;
		once(event: 'before-quit-for-update', listener: Function): this;
		addListener(event: 'before-quit-for-update', listener: Function): this;
		removeListener(event: 'before-quit-for-update', listener: Function): this;
		/**
		 * Emitted when checking if an update has started.
		 */
		on(event: 'checking-for-update', listener: Function): this;
		once(event: 'checking-for-update', listener: Function): this;
		addListener(event: 'checking-for-update', listener: Function): this;
		removeListener(event: 'checking-for-update', listener: Function): this;
		/**
		 * Emitted when there is an error while updating.
		 */
		on(event: 'error', listener: (error: Error) => void): this;
		once(event: 'error', listener: (error: Error) => void): this;
		addListener(event: 'error', listener: (error: Error) => void): this;
		removeListener(event: 'error', listener: (error: Error) => void): this;
		/**
		 * Emitted when there is an available update. The update is downloaded
		 * automatically.
		 */
		on(event: 'update-available', listener: Function): this;
		once(event: 'update-available', listener: Function): this;
		addListener(event: 'update-available', listener: Function): this;
		removeListener(event: 'update-available', listener: Function): this;
		/**
		 * Emitted when an update has been downloaded.
		 *
		 * On Windows only `releaseName` is available.
		 *
		 * **Note:** It is not strictly necessary to handle this event. A successfully
		 * downloaded update will still be applied the next time the application starts.
		 */
		on(event: 'update-downloaded', listener: (event: Event,
			releaseNotes: string,
			releaseName: string,
			releaseDate: Date,
			updateURL: string) => void): this;
		once(event: 'update-downloaded', listener: (event: Event,
			releaseNotes: string,
			releaseName: string,
			releaseDate: Date,
			updateURL: string) => void): this;
		addListener(event: 'update-downloaded', listener: (event: Event,
			releaseNotes: string,
			releaseName: string,
			releaseDate: Date,
			updateURL: string) => void): this;
		removeListener(event: 'update-downloaded', listener: (event: Event,
			releaseNotes: string,
			releaseName: string,
			releaseDate: Date,
			updateURL: string) => void): this;
		/**
		 * Emitted when there is no available update.
		 */
		on(event: 'update-not-available', listener: Function): this;
		once(event: 'update-not-available', listener: Function): this;
		addListener(event: 'update-not-available', listener: Function): this;
		removeListener(event: 'update-not-available', listener: Function): this;
		/**
		 * Asks the server whether there is an update. You must call `setFeedURL` before
		 * using this API.
		 */
		checkForUpdates(): void;
		/**
		 * The current update feed URL.
		 */
		getFeedURL(): string;
		/**
		 * Restarts the app and installs the update after it has been downloaded. It should
		 * only be called after `update-downloaded` has been emitted.
		 *
		 * Under the hood calling `autoUpdater.quitAndInstall()` will close all application
		 * windows first, and automatically call `app.quit()` after all windows have been
		 * closed.
		 *
		 * **Note:** It is not strictly necessary to call this function to apply an update,
		 * as a successfully downloaded update will always be applied the next time the
		 * application starts.
		 */
		quitAndInstall(): void;
		/**
		 * Sets the `url` and initialize the auto updater.
		 */
		setFeedURL(options: FeedURLOptions): void;
	}

	interface BluetoothDevice {

		// Docs: http://electronjs.org/docs/api/structures/bluetooth-device

		deviceId: string;
		deviceName: string;
	}

	class BrowserView {

		// Docs: http://electronjs.org/docs/api/browser-view

		/**
		 * BrowserView
		 */
		constructor(options?: BrowserViewConstructorOptions);
		/**
		 * The view with the given `id`.
		 */
		static fromId(id: number): BrowserView;
		/**
		 * The BrowserView that owns the given `webContents` or `null` if the contents are
		 * not owned by a BrowserView.
		 */
		static fromWebContents(webContents: WebContents): (BrowserView) | (null);
		/**
		 * An array of all opened BrowserViews.
		 */
		static getAllViews(): BrowserView[];
		/**
		 * Force closing the view, the `unload` and `beforeunload` events won't be emitted
		 * for the web page. After you're done with a view, call this function in order to
		 * free memory and other resources as soon as possible.
		 */
		destroy(): void;
		/**
		 * The `bounds` of this BrowserView instance as `Object`.
		 *
		 * @experimental
		 */
		getBounds(): Rectangle;
		/**
		 * Whether the view is destroyed.
		 */
		isDestroyed(): boolean;
		setAutoResize(options: AutoResizeOptions): void;
		setBackgroundColor(color: string): void;
		/**
		 * Resizes and moves the view to the supplied bounds relative to the window.
		 *
		 * @experimental
		 */
		setBounds(bounds: Rectangle): void;
		id: number;
		webContents: WebContents;
	}

	class BrowserWindow extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/browser-window

		/**
		 * Emitted when the window is set or unset to show always on top of other windows.
		 */
		on(event: 'always-on-top-changed', listener: (event: Event,
			isAlwaysOnTop: boolean) => void): this;
		once(event: 'always-on-top-changed', listener: (event: Event,
			isAlwaysOnTop: boolean) => void): this;
		addListener(event: 'always-on-top-changed', listener: (event: Event,
			isAlwaysOnTop: boolean) => void): this;
		removeListener(event: 'always-on-top-changed', listener: (event: Event,
			isAlwaysOnTop: boolean) => void): this;
		/**
		 * Emitted when an App Command is invoked. These are typically related to keyboard
		 * media keys or browser commands, as well as the "Back" button built into some
		 * mice on Windows.
		 *
		 * Commands are lowercased, underscores are replaced with hyphens, and the
		 * `APPCOMMAND_` prefix is stripped off. e.g. `APPCOMMAND_BROWSER_BACKWARD` is
		 * emitted as `browser-backward`.
		 *
		 * The following app commands are explicitly supported on Linux:
		 *
	* `browser-backward`
	* `browser-forward`
		 *
		 * @platform win32,linux
		 */
		on(event: 'app-command', listener: (event: Event,
			command: string) => void): this;
		once(event: 'app-command', listener: (event: Event,
			command: string) => void): this;
		addListener(event: 'app-command', listener: (event: Event,
			command: string) => void): this;
		removeListener(event: 'app-command', listener: (event: Event,
			command: string) => void): this;
		/**
		 * Emitted when the window loses focus.
		 */
		on(event: 'blur', listener: Function): this;
		once(event: 'blur', listener: Function): this;
		addListener(event: 'blur', listener: Function): this;
		removeListener(event: 'blur', listener: Function): this;
		/**
		 * Emitted when the window is going to be closed. It's emitted before the
		 * `beforeunload` and `unload` event of the DOM. Calling `event.preventDefault()`
		 * will cancel the close.
		 *
		 * Usually you would want to use the `beforeunload` handler to decide whether the
		 * window should be closed, which will also be called when the window is reloaded.
		 * In Electron, returning any value other than `undefined` would cancel the close.
		 * For example:
		 *
		 * _**Note**: There is a subtle difference between the behaviors of
		 * `window.onbeforeunload = handler` and `window.addEventListener('beforeunload',
		 * handler)`. It is recommended to always set the `event.returnValue` explicitly,
		 * instead of only returning a value, as the former works more consistently within
		 * Electron._
		 */
		on(event: 'close', listener: (event: Event) => void): this;
		once(event: 'close', listener: (event: Event) => void): this;
		addListener(event: 'close', listener: (event: Event) => void): this;
		removeListener(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Emitted when the window is closed. After you have received this event you should
		 * remove the reference to the window and avoid using it any more.
		 */
		on(event: 'closed', listener: Function): this;
		once(event: 'closed', listener: Function): this;
		addListener(event: 'closed', listener: Function): this;
		removeListener(event: 'closed', listener: Function): this;
		/**
		 * Emitted when the window enters a full-screen state.
		 */
		on(event: 'enter-full-screen', listener: Function): this;
		once(event: 'enter-full-screen', listener: Function): this;
		addListener(event: 'enter-full-screen', listener: Function): this;
		removeListener(event: 'enter-full-screen', listener: Function): this;
		/**
		 * Emitted when the window enters a full-screen state triggered by HTML API.
		 */
		on(event: 'enter-html-full-screen', listener: Function): this;
		once(event: 'enter-html-full-screen', listener: Function): this;
		addListener(event: 'enter-html-full-screen', listener: Function): this;
		removeListener(event: 'enter-html-full-screen', listener: Function): this;
		/**
		 * Emitted when the window gains focus.
		 */
		on(event: 'focus', listener: Function): this;
		once(event: 'focus', listener: Function): this;
		addListener(event: 'focus', listener: Function): this;
		removeListener(event: 'focus', listener: Function): this;
		/**
		 * Emitted when the window is hidden.
		 */
		on(event: 'hide', listener: Function): this;
		once(event: 'hide', listener: Function): this;
		addListener(event: 'hide', listener: Function): this;
		removeListener(event: 'hide', listener: Function): this;
		/**
		 * Emitted when the window leaves a full-screen state.
		 */
		on(event: 'leave-full-screen', listener: Function): this;
		once(event: 'leave-full-screen', listener: Function): this;
		addListener(event: 'leave-full-screen', listener: Function): this;
		removeListener(event: 'leave-full-screen', listener: Function): this;
		/**
		 * Emitted when the window leaves a full-screen state triggered by HTML API.
		 */
		on(event: 'leave-html-full-screen', listener: Function): this;
		once(event: 'leave-html-full-screen', listener: Function): this;
		addListener(event: 'leave-html-full-screen', listener: Function): this;
		removeListener(event: 'leave-html-full-screen', listener: Function): this;
		/**
		 * Emitted when window is maximized.
		 */
		on(event: 'maximize', listener: Function): this;
		once(event: 'maximize', listener: Function): this;
		addListener(event: 'maximize', listener: Function): this;
		removeListener(event: 'maximize', listener: Function): this;
		/**
		 * Emitted when the window is minimized.
		 */
		on(event: 'minimize', listener: Function): this;
		once(event: 'minimize', listener: Function): this;
		addListener(event: 'minimize', listener: Function): this;
		removeListener(event: 'minimize', listener: Function): this;
		/**
		 * Emitted when the window is being moved to a new position.
		 *
	__Note__: On macOS this event is an alias of `moved`.
		 */
		on(event: 'move', listener: Function): this;
		once(event: 'move', listener: Function): this;
		addListener(event: 'move', listener: Function): this;
		removeListener(event: 'move', listener: Function): this;
		/**
		 * Emitted once when the window is moved to a new position.
		 *
		 * @platform darwin
		 */
		on(event: 'moved', listener: Function): this;
		once(event: 'moved', listener: Function): this;
		addListener(event: 'moved', listener: Function): this;
		removeListener(event: 'moved', listener: Function): this;
		/**
		 * Emitted when the native new tab button is clicked.
		 *
		 * @platform darwin
		 */
		on(event: 'new-window-for-tab', listener: Function): this;
		once(event: 'new-window-for-tab', listener: Function): this;
		addListener(event: 'new-window-for-tab', listener: Function): this;
		removeListener(event: 'new-window-for-tab', listener: Function): this;
		/**
		 * Emitted when the document changed its title, calling `event.preventDefault()`
		 * will prevent the native window's title from changing. `explicitSet` is false
		 * when title is synthesized from file URL.
		 */
		on(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		once(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		addListener(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		removeListener(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		/**
		 * Emitted when the web page has been rendered (while not being shown) and window
		 * can be displayed without a visual flash.
		 *
		 * Please note that using this event implies that the renderer will be considered
		 * "visible" and paint even though `show` is false.  This event will never fire if
		 * you use `paintWhenInitiallyHidden: false`
		 */
		on(event: 'ready-to-show', listener: Function): this;
		once(event: 'ready-to-show', listener: Function): this;
		addListener(event: 'ready-to-show', listener: Function): this;
		removeListener(event: 'ready-to-show', listener: Function): this;
		/**
		 * Emitted after the window has been resized.
		 */
		on(event: 'resize', listener: Function): this;
		once(event: 'resize', listener: Function): this;
		addListener(event: 'resize', listener: Function): this;
		removeListener(event: 'resize', listener: Function): this;
		/**
		 * Emitted when the unresponsive web page becomes responsive again.
		 */
		on(event: 'responsive', listener: Function): this;
		once(event: 'responsive', listener: Function): this;
		addListener(event: 'responsive', listener: Function): this;
		removeListener(event: 'responsive', listener: Function): this;
		/**
		 * Emitted when the window is restored from a minimized state.
		 */
		on(event: 'restore', listener: Function): this;
		once(event: 'restore', listener: Function): this;
		addListener(event: 'restore', listener: Function): this;
		removeListener(event: 'restore', listener: Function): this;
		/**
		 * Emitted on trackpad rotation gesture. Continually emitted until rotation gesture
		 * is ended. The `rotation` value on each emission is the angle in degrees rotated
		 * since the last emission. The last emitted event upon a rotation gesture will
		 * always be of value `0`. Counter-clockwise rotation values are positive, while
		 * clockwise ones are negative.
		 *
		 * @platform darwin
		 */
		on(event: 'rotate-gesture', listener: (event: Event,
			rotation: number) => void): this;
		once(event: 'rotate-gesture', listener: (event: Event,
			rotation: number) => void): this;
		addListener(event: 'rotate-gesture', listener: (event: Event,
			rotation: number) => void): this;
		removeListener(event: 'rotate-gesture', listener: (event: Event,
			rotation: number) => void): this;
		/**
		 * Emitted when scroll wheel event phase has begun.
		 *
		 * @platform darwin
		 */
		on(event: 'scroll-touch-begin', listener: Function): this;
		once(event: 'scroll-touch-begin', listener: Function): this;
		addListener(event: 'scroll-touch-begin', listener: Function): this;
		removeListener(event: 'scroll-touch-begin', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase filed upon reaching the edge of element.
		 *
		 * @platform darwin
		 */
		on(event: 'scroll-touch-edge', listener: Function): this;
		once(event: 'scroll-touch-edge', listener: Function): this;
		addListener(event: 'scroll-touch-edge', listener: Function): this;
		removeListener(event: 'scroll-touch-edge', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase has ended.
		 *
		 * @platform darwin
		 */
		on(event: 'scroll-touch-end', listener: Function): this;
		once(event: 'scroll-touch-end', listener: Function): this;
		addListener(event: 'scroll-touch-end', listener: Function): this;
		removeListener(event: 'scroll-touch-end', listener: Function): this;
		/**
		 * Emitted when window session is going to end due to force shutdown or machine
		 * restart or session log off.
		 *
		 * @platform win32
		 */
		on(event: 'session-end', listener: Function): this;
		once(event: 'session-end', listener: Function): this;
		addListener(event: 'session-end', listener: Function): this;
		removeListener(event: 'session-end', listener: Function): this;
		/**
		 * Emitted when the window opens a sheet.
		 *
		 * @platform darwin
		 */
		on(event: 'sheet-begin', listener: Function): this;
		once(event: 'sheet-begin', listener: Function): this;
		addListener(event: 'sheet-begin', listener: Function): this;
		removeListener(event: 'sheet-begin', listener: Function): this;
		/**
		 * Emitted when the window has closed a sheet.
		 *
		 * @platform darwin
		 */
		on(event: 'sheet-end', listener: Function): this;
		once(event: 'sheet-end', listener: Function): this;
		addListener(event: 'sheet-end', listener: Function): this;
		removeListener(event: 'sheet-end', listener: Function): this;
		/**
		 * Emitted when the window is shown.
		 */
		on(event: 'show', listener: Function): this;
		once(event: 'show', listener: Function): this;
		addListener(event: 'show', listener: Function): this;
		removeListener(event: 'show', listener: Function): this;
		/**
		 * Emitted on 3-finger swipe. Possible directions are `up`, `right`, `down`,
		 * `left`.
		 *
		 * @platform darwin
		 */
		on(event: 'swipe', listener: (event: Event,
			direction: string) => void): this;
		once(event: 'swipe', listener: (event: Event,
			direction: string) => void): this;
		addListener(event: 'swipe', listener: (event: Event,
			direction: string) => void): this;
		removeListener(event: 'swipe', listener: (event: Event,
			direction: string) => void): this;
		/**
		 * Emitted when the window exits from a maximized state.
		 */
		on(event: 'unmaximize', listener: Function): this;
		once(event: 'unmaximize', listener: Function): this;
		addListener(event: 'unmaximize', listener: Function): this;
		removeListener(event: 'unmaximize', listener: Function): this;
		/**
		 * Emitted when the web page becomes unresponsive.
		 */
		on(event: 'unresponsive', listener: Function): this;
		once(event: 'unresponsive', listener: Function): this;
		addListener(event: 'unresponsive', listener: Function): this;
		removeListener(event: 'unresponsive', listener: Function): this;
		/**
		 * Emitted before the window is moved. Calling `event.preventDefault()` will
		 * prevent the window from being moved.
		 *
		 * Note that this is only emitted when the window is being resized manually.
		 * Resizing the window with `setBounds`/`setSize` will not emit this event.
		 *
		 * @platform win32
		 */
		on(event: 'will-move', listener: (event: Event,
			/**
			 * Location the window is being moved to.
			 */
			newBounds: `Rectangle`) => void): this;
		once(event: 'will-move', listener: (event: Event,
			/**
			 * Location the window is being moved to.
			 */
			newBounds: `Rectangle`) => void): this;
		addListener(event: 'will-move', listener: (event: Event,
			/**
			 * Location the window is being moved to.
			 */
			newBounds: `Rectangle`) => void): this;
		removeListener(event: 'will-move', listener: (event: Event,
			/**
			 * Location the window is being moved to.
			 */
			newBounds: `Rectangle`) => void): this;
		/**
		 * Emitted before the window is resized. Calling `event.preventDefault()` will
		 * prevent the window from being resized.
		 *
		 * Note that this is only emitted when the window is being resized manually.
		 * Resizing the window with `setBounds`/`setSize` will not emit this event.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'will-resize', listener: (event: Event,
			/**
			 * Size the window is being resized to.
			 */
			newBounds: `Rectangle`) => void): this;
		once(event: 'will-resize', listener: (event: Event,
			/**
			 * Size the window is being resized to.
			 */
			newBounds: `Rectangle`) => void): this;
		addListener(event: 'will-resize', listener: (event: Event,
			/**
			 * Size the window is being resized to.
			 */
			newBounds: `Rectangle`) => void): this;
		removeListener(event: 'will-resize', listener: (event: Event,
			/**
			 * Size the window is being resized to.
			 */
			newBounds: `Rectangle`) => void): this;
		/**
		 * BrowserWindow
		 */
		constructor(options?: BrowserWindowConstructorOptions);
		/**
		 * Adds DevTools extension located at `path`, and returns extension's name.
		 *
		 * The extension will be remembered so you only need to call this API once, this
		 * API is not for programming use. If you try to add an extension that has already
		 * been loaded, this method will not return and instead log a warning to the
		 * console.
		 *
		 * The method will also not return if the extension's manifest is missing or
		 * incomplete.
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static addDevToolsExtension(path: string): void;
		/**
		 * Adds Chrome extension located at `path`, and returns extension's name.
		 *
		 * The method will also not return if the extension's manifest is missing or
		 * incomplete.
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static addExtension(path: string): void;
		/**
		 * The window that owns the given `browserView`. If the given view is not attached
		 * to any window, returns `null`.
		 */
		static fromBrowserView(browserView: BrowserView): (BrowserWindow) | (null);
		/**
		 * The window with the given `id`.
		 */
		static fromId(id: number): BrowserWindow;
		/**
		 * The window that owns the given `webContents`.
		 */
		static fromWebContents(webContents: WebContents): BrowserWindow;
		/**
		 * An array of all opened browser windows.
		 */
		static getAllWindows(): BrowserWindow[];
		/**
		 * The keys are the extension names and each value is an Object containing `name`
		 * and `version` properties.
		 *
		 * To check if a DevTools extension is installed you can run the following:
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static getDevToolsExtensions(): Record<string, ExtensionInfo>;
		/**
		 * The keys are the extension names and each value is an Object containing `name`
		 * and `version` properties.
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static getExtensions(): Record<string, ExtensionInfo>;
		/**
		 * The window that is focused in this application, otherwise returns `null`.
		 */
		static getFocusedWindow(): (BrowserWindow) | (null);
		/**
		 * Remove a DevTools extension by name.
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static removeDevToolsExtension(name: string): void;
		/**
		 * Remove a Chrome extension by name.
		 *
		 * **Note:** This API cannot be called before the `ready` event of the `app` module
		 * is emitted.
		 */
		static removeExtension(name: string): void;
		/**
		 * Replacement API for setBrowserView supporting work with multi browser views.
		 *
		 * @experimental
		 */
		addBrowserView(browserView: BrowserView): void;
		/**
		 * Adds a window as a tab on this window, after the tab for the window instance.
		 *
		 * @platform darwin
		 */
		addTabbedWindow(browserWindow: BrowserWindow): void;
		/**
		 * Removes focus from the window.
		 */
		blur(): void;
		blurWebView(): void;
		/**
		 * Resolves with a NativeImage
		 *
		 * Captures a snapshot of the page within `rect`. Omitting `rect` will capture the
		 * whole visible page.
		 */
		capturePage(rect?: Rectangle): Promise<Electron.NativeImage>;
		/**
		 * Moves window to the center of the screen.
		 */
		center(): void;
		/**
		 * Try to close the window. This has the same effect as a user manually clicking
		 * the close button of the window. The web page may cancel the close though. See
		 * the close event.
		 */
		close(): void;
		/**
		 * Closes the currently open Quick Look panel.
		 *
		 * @platform darwin
		 */
		closeFilePreview(): void;
		/**
		 * Force closing the window, the `unload` and `beforeunload` event won't be emitted
		 * for the web page, and `close` event will also not be emitted for this window,
		 * but it guarantees the `closed` event will be emitted.
		 */
		destroy(): void;
		/**
		 * Starts or stops flashing the window to attract user's attention.
		 */
		flashFrame(flag: boolean): void;
		/**
		 * Focuses on the window.
		 */
		focus(): void;
		focusOnWebView(): void;
		/**
		 * The `bounds` of the window as `Object`.
		 */
		getBounds(): Rectangle;
		/**
		 * an BrowserView what is attached. Returns `null` if none is attached. Throw error
		 * if multiple BrowserViews is attached.
		 *
		 * @experimental
		 */
		getBrowserView(): (BrowserView) | (null);
		/**
		 * an array of all BrowserViews that have been attached with `addBrowserView` or
		 * `setBrowserView`.
		 *
		 * **Note:** The BrowserView API is currently experimental and may change or be
		 * removed in future Electron releases.
		 *
		 * @experimental
		 */
		getBrowserViews(): BrowserView[];
		/**
		 * All child windows.
		 */
		getChildWindows(): BrowserWindow[];
		/**
		 * The `bounds` of the window's client area as `Object`.
		 */
		getContentBounds(): Rectangle;
		/**
		 * Contains the window's client area's width and height.
		 */
		getContentSize(): number[];
		/**
		 * Contains the window's maximum width and height.
		 */
		getMaximumSize(): number[];
		/**
		 * Contains the window's minimum width and height.
		 */
		getMinimumSize(): number[];
		/**
		 * The platform-specific handle of the window.
		 *
		 * The native type of the handle is `HWND` on Windows, `NSView*` on macOS, and
		 * `Window` (`unsigned long`) on Linux.
		 */
		getNativeWindowHandle(): Buffer;
		/**
		 * Contains the window bounds of the normal state
		 *
		 * **Note:** whatever the current state of the window : maximized, minimized or in
		 * fullscreen, this function always returns the position and size of the window in
		 * normal state. In normal state, getBounds and getNormalBounds returns the same
		 * `Rectangle`.
		 */
		getNormalBounds(): Rectangle;
		/**
		 * between 0.0 (fully transparent) and 1.0 (fully opaque). On Linux, always returns
		 * 1.
		 */
		getOpacity(): number;
		/**
		 * The parent window.
		 */
		getParentWindow(): BrowserWindow;
		/**
		 * Contains the window's current position.
		 */
		getPosition(): number[];
		/**
		 * The pathname of the file the window represents.
		 *
		 * @platform darwin
		 */
		getRepresentedFilename(): string;
		/**
		 * Contains the window's width and height.
		 */
		getSize(): number[];
		/**
		 * The title of the native window.
		 *
		 * **Note:** The title of the web page can be different from the title of the
		 * native window.
		 */
		getTitle(): string;
		/**
		 * Whether the window has a shadow.
		 */
		hasShadow(): boolean;
		/**
		 * Hides the window.
		 */
		hide(): void;
		/**
		 * Hooks a windows message. The `callback` is called when the message is received
		 * in the WndProc.
		 *
		 * @platform win32
		 */
		hookWindowMessage(message: number, callback: () => void): void;
		/**
		 * Whether the window is always on top of other windows.
		 */
		isAlwaysOnTop(): boolean;
		/**
		 * Whether the window can be manually closed by user.
		 *
	On Linux always returns `true`.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		isClosable(): boolean;
		/**
		 * Whether the window is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * Whether the window's document has been edited.
		 *
		 * @platform darwin
		 */
		isDocumentEdited(): boolean;
		/**
		 * Returns Boolean - whether the window is enabled.
		 */
		isEnabled(): void;
		/**
		 * Whether the window is focused.
		 */
		isFocused(): boolean;
		/**
		 * Whether the window is in fullscreen mode.
		 */
		isFullScreen(): boolean;
		/**
		 * Whether the maximize/zoom window button toggles fullscreen mode or maximizes the
		 * window.

	**Deprecated**
		 */
		isFullScreenable(): boolean;
		/**
		 * Whether the window is in kiosk mode.
		 */
		isKiosk(): boolean;
		/**
		 * Whether the window can be manually maximized by user.
		 *
	On Linux always returns `true`.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		isMaximizable(): boolean;
		/**
		 * Whether the window is maximized.
		 */
		isMaximized(): boolean;
		/**
		 * Whether menu bar automatically hides itself.

	**Deprecated**
		 */
		isMenuBarAutoHide(): boolean;
		/**
		 * Whether the menu bar is visible.
		 */
		isMenuBarVisible(): boolean;
		/**
		 * Whether the window can be manually minimized by user
		 *
	On Linux always returns `true`.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		isMinimizable(): boolean;
		/**
		 * Whether the window is minimized.
		 */
		isMinimized(): boolean;
		/**
		 * Whether current window is a modal window.
		 */
		isModal(): boolean;
		/**
		 * Whether the window can be moved by user.
		 *
	On Linux always returns `true`.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		isMovable(): boolean;
		/**
		 * Whether the window is in normal state (not maximized, not minimized, not in
		 * fullscreen mode).
		 */
		isNormal(): boolean;
		/**
		 * Whether the window can be manually resized by user.

	**Deprecated**
		 */
		isResizable(): boolean;
		/**
		 * Whether the window is in simple (pre-Lion) fullscreen mode.
		 *
		 * @platform darwin
		 */
		isSimpleFullScreen(): boolean;
		/**
		 * Whether the window is visible to the user.
		 */
		isVisible(): boolean;
		/**
		 * Whether the window is visible on all workspaces.
		 *
	**Note:** This API always returns false on Windows.
		 */
		isVisibleOnAllWorkspaces(): boolean;
		/**
		 * `true` or `false` depending on whether the message is hooked.
		 *
		 * @platform win32
		 */
		isWindowMessageHooked(message: number): boolean;
		/**
		 * the promise will resolve when the page has finished loading (see
		 * `did-finish-load`), and rejects if the page fails to load (see `did-fail-load`).
		 *
		 * Same as `webContents.loadFile`, `filePath` should be a path to an HTML file
		 * relative to the root of your application.  See the `webContents` docs for more
		 * information.
		 */
		loadFile(filePath: string, options?: LoadFileOptions): Promise<void>;
		/**
		 * the promise will resolve when the page has finished loading (see
		 * `did-finish-load`), and rejects if the page fails to load (see `did-fail-load`).
		 *
		 * Same as `webContents.loadURL(url[, options])`.
		 *
		 * The `url` can be a remote address (e.g. `http://`) or a path to a local HTML
		 * file using the `file://` protocol.
		 *
		 * To ensure that file URLs are properly formatted, it is recommended to use Node's
		 * `url.format` method:
		 *
		 * You can load a URL using a `POST` request with URL-encoded data by doing the
		 * following:
		 */
		loadURL(url: string, options?: LoadURLOptions): Promise<void>;
		/**
		 * Maximizes the window. This will also show (but not focus) the window if it isn't
		 * being displayed already.
		 */
		maximize(): void;
		/**
		 * Merges all windows into one window with multiple tabs when native tabs are
		 * enabled and there is more than one open window.
		 *
		 * @platform darwin
		 */
		mergeAllWindows(): void;
		/**
		 * Minimizes the window. On some platforms the minimized window will be shown in
		 * the Dock.
		 */
		minimize(): void;
		/**
		 * Moves the current tab into a new window if native tabs are enabled and there is
		 * more than one tab in the current window.
		 *
		 * @platform darwin
		 */
		moveTabToNewWindow(): void;
		/**
		 * Moves window to top(z-order) regardless of focus
		 */
		moveTop(): void;
		/**
		 * Uses Quick Look to preview a file at a given path.
		 *
		 * @platform darwin
		 */
		previewFile(path: string, displayName?: string): void;
		/**
		 * Same as `webContents.reload`.
		 */
		reload(): void;
		removeBrowserView(browserView: BrowserView): void;
		/**
		 * Remove the window's menu bar.
		 *
		 * @platform linux,win32
		 */
		removeMenu(): void;
		/**
		 * Restores the window from minimized state to its previous state.
		 */
		restore(): void;
		/**
		 * Selects the next tab when native tabs are enabled and there are other tabs in
		 * the window.
		 *
		 * @platform darwin
		 */
		selectNextTab(): void;
		/**
		 * Selects the previous tab when native tabs are enabled and there are other tabs
		 * in the window.
		 *
		 * @platform darwin
		 */
		selectPreviousTab(): void;
		/**
		 * Sets whether the window should show always on top of other windows. After
		 * setting this, the window is still a normal window, not a toolbox window which
		 * can not be focused on.
		 */
		setAlwaysOnTop(flag: boolean, level?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver', relativeLevel?: number): void;
		/**
		 * Sets the properties for the window's taskbar button.
		 *
		 * **Note:** `relaunchCommand` and `relaunchDisplayName` must always be set
		 * together. If one of those properties is not set, then neither will be used.
		 *
		 * @platform win32
		 */
		setAppDetails(options: AppDetailsOptions): void;
		/**
		 * This will make a window maintain an aspect ratio. The extra size allows a
		 * developer to have space, specified in pixels, not included within the aspect
		 * ratio calculations. This API already takes into account the difference between a
		 * window's size and its content size.
		 *
		 * Consider a normal window with an HD video player and associated controls.
		 * Perhaps there are 15 pixels of controls on the left edge, 25 pixels of controls
		 * on the right edge and 50 pixels of controls below the player. In order to
		 * maintain a 16:9 aspect ratio (standard aspect ratio for HD @1920x1080) within
		 * the player itself we would call this function with arguments of 16/9 and [ 40,
		 * 50 ]. The second argument doesn't care where the extra width and height are
		 * within the content view--only that they exist. Sum any extra width and height
		 * areas you have within the overall content view.
		 *
		 * Calling this function with a value of `0` will remove any previously set aspect
		 * ratios.
		 *
		 * @platform darwin
		 */
		setAspectRatio(aspectRatio: number, extraSize?: Size): void;
		/**
		 * Controls whether to hide cursor when typing.
		 *
		 * @platform darwin
		 */
		setAutoHideCursor(autoHide: boolean): void;
		/**
		 * Sets whether the window menu bar should hide itself automatically. Once set the
		 * menu bar will only show when users press the single `Alt` key.
		 *
		 * If the menu bar is already visible, calling `setAutoHideMenuBar(true)` won't
		 * hide it immediately.

	**Deprecated**
		 */
		setAutoHideMenuBar(hide: boolean): void;
		/**
		 * Sets the background color of the window. See Setting `backgroundColor`.
		 */
		setBackgroundColor(backgroundColor: string): void;
		/**
		 * Resizes and moves the window to the supplied bounds. Any properties that are not
		 * supplied will default to their current values.
		 */
		setBounds(bounds: Partial<Rectangle>, animate?: boolean): void;
		setBrowserView(browserView: (BrowserView) | (null)): void;
		/**
		 * Sets whether the window can be manually closed by user. On Linux does nothing.
		 *
	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		setClosable(closable: boolean): void;
		/**
		 * Resizes and moves the window's client area (e.g. the web page) to the supplied
		 * bounds.
		 */
		setContentBounds(bounds: Rectangle, animate?: boolean): void;
		/**
		 * Prevents the window contents from being captured by other apps.
		 *
		 * On macOS it sets the NSWindow's sharingType to NSWindowSharingNone. On Windows
		 * it calls SetWindowDisplayAffinity with `WDA_MONITOR`.
		 *
		 * @platform darwin,win32
		 */
		setContentProtection(enable: boolean): void;
		/**
		 * Resizes the window's client area (e.g. the web page) to `width` and `height`.
		 */
		setContentSize(width: number, height: number, animate?: boolean): void;
		/**
		 * Specifies whether the window’s document has been edited, and the icon in title
		 * bar will become gray when set to `true`.
		 *
		 * @platform darwin
		 */
		setDocumentEdited(edited: boolean): void;
		/**
		 * Disable or enable the window.
		 */
		setEnabled(enable: boolean): void;
		/**
		 * Changes whether the window can be focused.
		 *
	On macOS it does not remove the focus from the window.
		 *
		 * @platform darwin,win32
		 */
		setFocusable(focusable: boolean): void;
		/**
		 * Sets whether the window should be in fullscreen mode.
		 */
		setFullScreen(flag: boolean): void;
		/**
		 * Sets whether the maximize/zoom window button toggles fullscreen mode or
		 * maximizes the window.

	**Deprecated**
		 */
		setFullScreenable(fullscreenable: boolean): void;
		/**
		 * Sets whether the window should have a shadow.
		 */
		setHasShadow(hasShadow: boolean): void;
		/**
		 * Changes window icon.
		 *
		 * @platform win32,linux
		 */
		setIcon(icon: NativeImage): void;
		/**
		 * Makes the window ignore all mouse events.
		 *
		 * All mouse events happened in this window will be passed to the window below this
		 * window, but if this window has focus, it will still receive keyboard events.
		 */
		setIgnoreMouseEvents(ignore: boolean, options?: IgnoreMouseEventsOptions): void;
		/**
		 * Enters or leaves the kiosk mode.
		 */
		setKiosk(flag: boolean): void;
		/**
		 * Sets whether the window can be manually maximized by user. On Linux does
		 * nothing.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		setMaximizable(maximizable: boolean): void;
		/**
		 * Sets the maximum size of window to `width` and `height`.
		 */
		setMaximumSize(width: number, height: number): void;
		/**
		 * Sets the `menu` as the window's menu bar.
		 *
		 * @platform linux,win32
		 */
		setMenu(menu: (Menu) | (null)): void;
		/**
		 * Sets whether the menu bar should be visible. If the menu bar is auto-hide, users
		 * can still bring up the menu bar by pressing the single `Alt` key.
		 *
		 * @platform win32,linux
		 */
		setMenuBarVisibility(visible: boolean): void;
		/**
		 * Sets whether the window can be manually minimized by user. On Linux does
		 * nothing.

	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		setMinimizable(minimizable: boolean): void;
		/**
		 * Sets the minimum size of window to `width` and `height`.
		 */
		setMinimumSize(width: number, height: number): void;
		/**
		 * Sets whether the window can be moved by user. On Linux does nothing.
		 *
	**Deprecated**
		 *
		 * @platform darwin,win32
		 */
		setMovable(movable: boolean): void;
		/**
		 * Sets the opacity of the window. On Linux, does nothing. Out of bound number
		 * values are clamped to the [0, 1] range.
		 *
		 * @platform win32,darwin
		 */
		setOpacity(opacity: number): void;
		/**
		 * Sets a 16 x 16 pixel overlay onto the current taskbar icon, usually used to
		 * convey some sort of application status or to passively notify the user.
		 *
		 * @platform win32
		 */
		setOverlayIcon(overlay: (NativeImage) | (null), description: string): void;
		/**
		 * Sets `parent` as current window's parent window, passing `null` will turn
		 * current window into a top-level window.
		 */
		setParentWindow(parent: (BrowserWindow) | (null)): void;
		/**
		 * Moves window to `x` and `y`.
		 */
		setPosition(x: number, y: number, animate?: boolean): void;
		/**
		 * Sets progress value in progress bar. Valid range is [0, 1.0].
		 *
		 * Remove progress bar when progress < 0; Change to indeterminate mode when
		 * progress > 1.
		 *
		 * On Linux platform, only supports Unity desktop environment, you need to specify
		 * the `*.desktop` file name to `desktopName` field in `package.json`. By default,
		 * it will assume `{app.name}.desktop`.
		 *
		 * On Windows, a mode can be passed. Accepted values are `none`, `normal`,
		 * `indeterminate`, `error`, and `paused`. If you call `setProgressBar` without a
		 * mode set (but with a value within the valid range), `normal` will be assumed.
		 */
		setProgressBar(progress: number, options?: ProgressBarOptions): void;
		/**
		 * Sets the pathname of the file the window represents, and the icon of the file
		 * will show in window's title bar.
		 *
		 * @platform darwin
		 */
		setRepresentedFilename(filename: string): void;
		/**
		 * Sets whether the window can be manually resized by user.

	**Deprecated**
		 */
		setResizable(resizable: boolean): void;
		/**
		 * Setting a window shape determines the area within the window where the system
		 * permits drawing and user interaction. Outside of the given region, no pixels
		 * will be drawn and no mouse events will be registered. Mouse events outside of
		 * the region will not be received by that window, but will fall through to
		 * whatever is behind the window.
		 *
		 * @experimental
		 * @platform win32,linux
		 */
		setShape(rects: Rectangle[]): void;
		/**
		 * Changes the attachment point for sheets on macOS. By default, sheets are
		 * attached just below the window frame, but you may want to display them beneath a
		 * HTML-rendered toolbar. For example:
		 *
		 * @platform darwin
		 */
		setSheetOffset(offsetY: number, offsetX?: number): void;
		/**
		 * Enters or leaves simple fullscreen mode.
		 *
		 * Simple fullscreen mode emulates the native fullscreen behavior found in versions
		 * of Mac OS X prior to Lion (10.7).
		 *
		 * @platform darwin
		 */
		setSimpleFullScreen(flag: boolean): void;
		/**
		 * Resizes the window to `width` and `height`. If `width` or `height` are below any
		 * set minimum size constraints the window will snap to its minimum size.
		 */
		setSize(width: number, height: number, animate?: boolean): void;
		/**
		 * Makes the window not show in the taskbar.
		 */
		setSkipTaskbar(skip: boolean): void;
		/**
		 * Whether the buttons were added successfully
		 *
		 * Add a thumbnail toolbar with a specified set of buttons to the thumbnail image
		 * of a window in a taskbar button layout. Returns a `Boolean` object indicates
		 * whether the thumbnail has been added successfully.
		 *
		 * The number of buttons in thumbnail toolbar should be no greater than 7 due to
		 * the limited room. Once you setup the thumbnail toolbar, the toolbar cannot be
		 * removed due to the platform's limitation. But you can call the API with an empty
		 * array to clean the buttons.
		 *
		 * The `buttons` is an array of `Button` objects:
		 *
		 * * `Button` Object
		 *   * `icon` NativeImage - The icon showing in thumbnail toolbar.
		 *   * `click` Function
		 *   * `tooltip` String (optional) - The text of the button's tooltip.
		 *   * `flags` String[] (optional) - Control specific states and behaviors of the
		 * button. By default, it is `['enabled']`.
		 *
		 * The `flags` is an array that can include following `String`s:
		 *
		 * * `enabled` - The button is active and available to the user.
		 * * `disabled` - The button is disabled. It is present, but has a visual state
		 * indicating it will not respond to user action.
		 * * `dismissonclick` - When the button is clicked, the thumbnail window closes
		 * immediately.
		 * * `nobackground` - Do not draw a button border, use only the image.
		 * * `hidden` - The button is not shown to the user.
		 * * `noninteractive` - The button is enabled but not interactive; no pressed
		 * button state is drawn. This value is intended for instances where the button is
		 * used in a notification.
		 *
		 * @platform win32
		 */
		setThumbarButtons(buttons: ThumbarButton[]): boolean;
		/**
		 * Sets the region of the window to show as the thumbnail image displayed when
		 * hovering over the window in the taskbar. You can reset the thumbnail to be the
		 * entire window by specifying an empty region: `{ x: 0, y: 0, width: 0, height: 0
		 * }`.
		 *
		 * @platform win32
		 */
		setThumbnailClip(region: Rectangle): void;
		/**
		 * Sets the toolTip that is displayed when hovering over the window thumbnail in
		 * the taskbar.
		 *
		 * @platform win32
		 */
		setThumbnailToolTip(toolTip: string): void;
		/**
		 * Changes the title of native window to `title`.
		 */
		setTitle(title: string): void;
		/**
		 * Sets the touchBar layout for the current window. Specifying `null` or
		 * `undefined` clears the touch bar. This method only has an effect if the machine
		 * has a touch bar and is running on macOS 10.12.1+.
		 *
		 * **Note:** The TouchBar API is currently experimental and may change or be
		 * removed in future Electron releases.
		 *
		 * @experimental
		 * @platform darwin
		 */
		setTouchBar(touchBar: (TouchBar) | (null)): void;
		/**
		 * Adds a vibrancy effect to the browser window. Passing `null` or an empty string
		 * will remove the vibrancy effect on the window.
		 *
		 * Note that `appearance-based`, `light`, `dark`, `medium-light`, and `ultra-dark`
		 * have been deprecated and will be removed in an upcoming version of macOS.
		 *
		 * @platform darwin
		 */
		setVibrancy(type: (('appearance-based' | 'light' | 'dark' | 'titlebar' | 'selection' | 'menu' | 'popover' | 'sidebar' | 'medium-light' | 'ultra-dark' | 'header' | 'sheet' | 'window' | 'hud' | 'fullscreen-ui' | 'tooltip' | 'content' | 'under-window' | 'under-page')) | (null)): void;
		/**
		 * Sets whether the window should be visible on all workspaces.
		 *
	**Note:** This API does nothing on Windows.
		 */
		setVisibleOnAllWorkspaces(visible: boolean, options?: VisibleOnAllWorkspacesOptions): void;
		/**
		 * Sets whether the window traffic light buttons should be visible.
		 *
	This cannot be called when `titleBarStyle` is set to `customButtonsOnHover`.
		 *
		 * @platform darwin
		 */
		setWindowButtonVisibility(visible: boolean): void;
		/**
		 * Shows and gives focus to the window.
		 */
		show(): void;
		/**
		 * Same as `webContents.showDefinitionForSelection()`.
		 *
		 * @platform darwin
		 */
		showDefinitionForSelection(): void;
		/**
		 * Shows the window but doesn't focus on it.
		 */
		showInactive(): void;
		/**
		 * Toggles the visibility of the tab bar if native tabs are enabled and there is
		 * only one tab in the current window.
		 *
		 * @platform darwin
		 */
		toggleTabBar(): void;
		/**
		 * Unhooks all of the window messages.
		 *
		 * @platform win32
		 */
		unhookAllWindowMessages(): void;
		/**
		 * Unhook the window message.
		 *
		 * @platform win32
		 */
		unhookWindowMessage(message: number): void;
		/**
		 * Unmaximizes the window.
		 */
		unmaximize(): void;
		autoHideMenuBar: boolean;
		closable: boolean;
		excludedFromShownWindowsMenu: boolean;
		fullScreenable: boolean;
		readonly id: number;
		maximizable: boolean;
		minimizable: boolean;
		movable: boolean;
		resizable: boolean;
		readonly webContents: WebContents;
	}

	class BrowserWindowProxy {

		// Docs: http://electronjs.org/docs/api/browser-window-proxy

		/**
		 * Removes focus from the child window.
		 */
		blur(): void;
		/**
		 * Forcefully closes the child window without calling its unload event.
		 */
		close(): void;
		/**
		 * Evaluates the code in the child window.
		 */
		eval(code: string): void;
		/**
		 * Focuses the child window (brings the window to front).
		 */
		focus(): void;
		/**
		 * Sends a message to the child window with the specified origin or `*` for no
		 * origin preference.
		 *
		 * In addition to these methods, the child window implements `window.opener` object
		 * with no properties and a single method.
		 */
		postMessage(message: any, targetOrigin: string): void;
		/**
		 * Invokes the print dialog on the child window.
		 */
		print(): void;
		closed: boolean;
	}

	interface Certificate {

		// Docs: http://electronjs.org/docs/api/structures/certificate

		/**
		 * PEM encoded data
		 */
		data: string;
		/**
		 * Fingerprint of the certificate
		 */
		fingerprint: string;
		/**
		 * Issuer principal
		 */
		issuer: CertificatePrincipal;
		/**
		 * Issuer certificate (if not self-signed)
		 */
		issuerCert: Certificate;
		/**
		 * Issuer's Common Name
		 */
		issuerName: string;
		/**
		 * Hex value represented string
		 */
		serialNumber: string;
		/**
		 * Subject principal
		 */
		subject: CertificatePrincipal;
		/**
		 * Subject's Common Name
		 */
		subjectName: string;
		/**
		 * End date of the certificate being valid in seconds
		 */
		validExpiry: number;
		/**
		 * Start date of the certificate being valid in seconds
		 */
		validStart: number;
	}

	interface CertificatePrincipal {

		// Docs: http://electronjs.org/docs/api/structures/certificate-principal

		/**
		 * Common Name.
		 */
		commonName: string;
		/**
		 * Country or region.
		 */
		country: string;
		/**
		 * Locality.
		 */
		locality: string;
		/**
		 * Organization names.
		 */
		organizations: string[];
		/**
		 * Organization Unit names.
		 */
		organizationUnits: string[];
		/**
		 * State or province.
		 */
		state: string;
	}

	class ClientRequest extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/client-request

		/**
		 * Emitted when the `request` is aborted. The `abort` event will not be fired if
		 * the `request` is already closed.
		 */
		on(event: 'abort', listener: Function): this;
		once(event: 'abort', listener: Function): this;
		addListener(event: 'abort', listener: Function): this;
		removeListener(event: 'abort', listener: Function): this;
		/**
		 * Emitted as the last event in the HTTP request-response transaction. The `close`
		 * event indicates that no more events will be emitted on either the `request` or
		 * `response` objects.
		 */
		on(event: 'close', listener: Function): this;
		once(event: 'close', listener: Function): this;
		addListener(event: 'close', listener: Function): this;
		removeListener(event: 'close', listener: Function): this;
		/**
		 * Emitted when the `net` module fails to issue a network request. Typically when
		 * the `request` object emits an `error` event, a `close` event will subsequently
		 * follow and no response object will be provided.
		 */
		on(event: 'error', listener: (
			/**
			 * an error object providing some information about the failure.
			 */
			error: Error) => void): this;
		once(event: 'error', listener: (
			/**
			 * an error object providing some information about the failure.
			 */
			error: Error) => void): this;
		addListener(event: 'error', listener: (
			/**
			 * an error object providing some information about the failure.
			 */
			error: Error) => void): this;
		removeListener(event: 'error', listener: (
			/**
			 * an error object providing some information about the failure.
			 */
			error: Error) => void): this;
		/**
		 * Emitted just after the last chunk of the `request`'s data has been written into
		 * the `request` object.
		 */
		on(event: 'finish', listener: Function): this;
		once(event: 'finish', listener: Function): this;
		addListener(event: 'finish', listener: Function): this;
		removeListener(event: 'finish', listener: Function): this;
		/**
		 * Emitted when an authenticating proxy is asking for user credentials.
		 *
		 * The `callback` function is expected to be called back with user credentials:
		 *
		 * * `username` String
		 * * `password` String
		 *
		 * Providing empty credentials will cancel the request and report an authentication
		 * error on the response object:
		 */
		on(event: 'login', listener: (authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		once(event: 'login', listener: (authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		addListener(event: 'login', listener: (authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		removeListener(event: 'login', listener: (authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		/**
		 * Emitted when there is redirection and the mode is `manual`. Calling
		 * `request.followRedirect` will continue with the redirection.
		 */
		on(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: Record<string, string[]>) => void): this;
		once(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: Record<string, string[]>) => void): this;
		addListener(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: Record<string, string[]>) => void): this;
		removeListener(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: Record<string, string[]>) => void): this;
		on(event: 'response', listener: (
			/**
			 * An object representing the HTTP response message.
			 */
			response: IncomingMessage) => void): this;
		once(event: 'response', listener: (
			/**
			 * An object representing the HTTP response message.
			 */
			response: IncomingMessage) => void): this;
		addListener(event: 'response', listener: (
			/**
			 * An object representing the HTTP response message.
			 */
			response: IncomingMessage) => void): this;
		removeListener(event: 'response', listener: (
			/**
			 * An object representing the HTTP response message.
			 */
			response: IncomingMessage) => void): this;
		/**
		 * ClientRequest
		 */
		constructor(options: (ClientRequestConstructorOptions) | (string));
		/**
		 * Cancels an ongoing HTTP transaction. If the request has already emitted the
		 * `close` event, the abort operation will have no effect. Otherwise an ongoing
		 * event will emit `abort` and `close` events. Additionally, if there is an ongoing
		 * response object,it will emit the `aborted` event.
		 */
		abort(): void;
		/**
		 * Sends the last chunk of the request data. Subsequent write or end operations
		 * will not be allowed. The `finish` event is emitted just after the end operation.
		 */
		end(chunk?: (string) | (Buffer), encoding?: string, callback?: () => void): void;
		/**
		 * Continues any deferred redirection request when the redirection mode is
		 * `manual`.
		 */
		followRedirect(): void;
		/**
		 * The value of a previously set extra header name.
		 */
		getHeader(name: string): string;
		/**
		 * * `active` Boolean - Whether the request is currently active. If this is false
		 * no other properties will be set
		 * * `started` Boolean - Whether the upload has started. If this is false both
		 * `current` and `total` will be set to 0.
		 * * `current` Integer - The number of bytes that have been uploaded so far
		 * * `total` Integer - The number of bytes that will be uploaded this request
		 *
		 * You can use this method in conjunction with `POST` requests to get the progress
		 * of a file upload or other data transfer.
		 */
		getUploadProgress(): UploadProgress;
		/**
		 * Removes a previously set extra header name. This method can be called only
		 * before first write. Trying to call it after the first write will throw an error.
		 */
		removeHeader(name: string): void;
		/**
		 * Adds an extra HTTP header. The header name will be issued as-is without
		 * lowercasing. It can be called only before first write. Calling this method after
		 * the first write will throw an error. If the passed value is not a `String`, its
		 * `toString()` method will be called to obtain the final value.
		 */
		setHeader(name: string, value: string): void;
		/**
		 * `callback` is essentially a dummy function introduced in the purpose of keeping
		 * similarity with the Node.js API. It is called asynchronously in the next tick
		 * after `chunk` content have been delivered to the Chromium networking layer.
		 * Contrary to the Node.js implementation, it is not guaranteed that `chunk`
		 * content have been flushed on the wire before `callback` is called.
		 *
		 * Adds a chunk of data to the request body. The first write operation may cause
		 * the request headers to be issued on the wire. After the first write operation,
		 * it is not allowed to add or remove a custom header.
		 */
		write(chunk: (string) | (Buffer), encoding?: string, callback?: () => void): void;
		chunkedEncoding: boolean;
	}

	interface Clipboard {

		// Docs: http://electronjs.org/docs/api/clipboard

		/**
		 * An array of supported formats for the clipboard `type`.
		 */
		availableFormats(type?: 'selection' | 'clipboard'): string[];
		/**
		 * Clears the clipboard content.
		 */
		clear(type?: 'selection' | 'clipboard'): void;
		/**
		 * Whether the clipboard supports the specified `format`.
		 *
		 * @experimental
		 */
		has(format: string, type?: 'selection' | 'clipboard'): boolean;
		/**
		 * Reads `format` type from the clipboard.
		 *
		 * @experimental
		 */
		read(format: string): string;
		/**
		 * * `title` String
		 * * `url` String
		 *
		 * Returns an Object containing `title` and `url` keys representing the bookmark in
		 * the clipboard. The `title` and `url` values will be empty strings when the
		 * bookmark is unavailable.
		 *
		 * @platform darwin,win32
		 */
		readBookmark(): ReadBookmark;
		/**
		 * Reads `format` type from the clipboard.
		 *
		 * @experimental
		 */
		readBuffer(format: string): Buffer;
		/**
		 * The text on the find pasteboard, which is the pasteboard that holds information
		 * about the current state of the active application’s find panel.
		 *
		 * This method uses synchronous IPC when called from the renderer process. The
		 * cached value is reread from the find pasteboard whenever the application is
		 * activated.
		 *
		 * @platform darwin
		 */
		readFindText(): string;
		/**
		 * The content in the clipboard as markup.
		 */
		readHTML(type?: 'selection' | 'clipboard'): string;
		/**
		 * The image content in the clipboard.
		 */
		readImage(type?: 'selection' | 'clipboard'): NativeImage;
		/**
		 * The content in the clipboard as RTF.
		 */
		readRTF(type?: 'selection' | 'clipboard'): string;
		/**
		 * The content in the clipboard as plain text.
		 */
		readText(type?: 'selection' | 'clipboard'): string;
		/**
		 * Writes `data` to the clipboard.
		 */
		write(data: Data, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes the `title` and `url` into the clipboard as a bookmark.
		 *
		 * **Note:** Most apps on Windows don't support pasting bookmarks into them so you
		 * can use `clipboard.write` to write both a bookmark and fallback text to the
		 * clipboard.
		 *
		 * @platform darwin,win32
		 */
		writeBookmark(title: string, url: string, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes the `buffer` into the clipboard as `format`.
		 *
		 * @experimental
		 */
		writeBuffer(format: string, buffer: Buffer, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes the `text` into the find pasteboard (the pasteboard that holds
		 * information about the current state of the active application’s find panel) as
		 * plain text. This method uses synchronous IPC when called from the renderer
		 * process.
		 *
		 * @platform darwin
		 */
		writeFindText(text: string): void;
		/**
		 * Writes `markup` to the clipboard.
		 */
		writeHTML(markup: string, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes `image` to the clipboard.
		 */
		writeImage(image: NativeImage, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes the `text` into the clipboard in RTF.
		 */
		writeRTF(text: string, type?: 'selection' | 'clipboard'): void;
		/**
		 * Writes the `text` into the clipboard as plain text.
		 */
		writeText(text: string, type?: 'selection' | 'clipboard'): void;
	}

	class CommandLine {

		// Docs: http://electronjs.org/docs/api/command-line

		/**
		 * Append an argument to Chromium's command line. The argument will be quoted
		 * correctly. Switches will precede arguments regardless of appending order.
		 *
		 * If you're appending an argument like `--switch=value`, consider using
		 * `appendSwitch('switch', 'value')` instead.
		 *
		 * **Note:** This will not affect `process.argv`. The intended usage of this
		 * function is to control Chromium's behavior.
		 */
		appendArgument(value: string): void;
		/**
		 * Append a switch (with optional `value`) to Chromium's command line.
		 *
		 * **Note:** This will not affect `process.argv`. The intended usage of this
		 * function is to control Chromium's behavior.
		 */
		appendSwitch(the_switch: string, value?: string): void;
		/**
		 * The command-line switch value.
		 *
		 * **Note:** When the switch is not present or has no value, it returns empty
		 * string.
		 */
		getSwitchValue(the_switch: string): string;
		/**
		 * Whether the command-line switch is present.
		 */
		hasSwitch(the_switch: string): boolean;
	}

	interface ContentTracing {

		// Docs: http://electronjs.org/docs/api/content-tracing

		/**
		 * resolves with an array of category groups once all child processes have
		 * acknowledged the `getCategories` request
		 *
		 * Get a set of category groups. The category groups can change as new code paths
		 * are reached. See also the list of built-in tracing categories.
		 */
		getCategories(): Promise<string[]>;
		/**
		 * Resolves with an object containing the `value` and `percentage` of trace buffer
		 * maximum usage
		 *
		 * * `value` Number
		 * * `percentage` Number
		 *
		 * Get the maximum usage across processes of trace buffer as a percentage of the
		 * full state.
		 */
		getTraceBufferUsage(): Promise<Electron.TraceBufferUsageReturnValue>;
		/**
		 * resolved once all child processes have acknowledged the `startRecording`
		 * request.
		 *
		 * Start recording on all processes.
		 *
		 * Recording begins immediately locally and asynchronously on child processes as
		 * soon as they receive the EnableRecording request.
		 *
		 * If a recording is already running, the promise will be immediately resolved, as
		 * only one trace operation can be in progress at a time.
		 */
		startRecording(options: (TraceConfig) | (TraceCategoriesAndOptions)): Promise<void>;
		/**
		 * resolves with a path to a file that contains the traced data once all child
		 * processes have acknowledged the `stopRecording` request
		 *
		 * Stop recording on all processes.
		 *
		 * Child processes typically cache trace data and only rarely flush and send trace
		 * data back to the main process. This helps to minimize the runtime overhead of
		 * tracing since sending trace data over IPC can be an expensive operation. So, to
		 * end tracing, Chromium asynchronously asks all child processes to flush any
		 * pending trace data.
		 *
		 * Trace data will be written into `resultFilePath`. If `resultFilePath` is empty
		 * or not provided, trace data will be written to a temporary file, and the path
		 * will be returned in the promise.
		 */
		stopRecording(resultFilePath?: string): Promise<string>;
	}

	interface Cookie {

		// Docs: http://electronjs.org/docs/api/structures/cookie

		/**
		 * The domain of the cookie; this will be normalized with a preceding dot so that
		 * it's also valid for subdomains.
		 */
		domain?: string;
		/**
		 * The expiration date of the cookie as the number of seconds since the UNIX epoch.
		 * Not provided for session cookies.
		 */
		expirationDate?: number;
		/**
		 * Whether the cookie is a host-only cookie; this will only be `true` if no domain
		 * was passed.
		 */
		hostOnly?: boolean;
		/**
		 * Whether the cookie is marked as HTTP only.
		 */
		httpOnly?: boolean;
		/**
		 * The name of the cookie.
		 */
		name: string;
		/**
		 * The path of the cookie.
		 */
		path?: string;
		/**
		 * Whether the cookie is marked as secure.
		 */
		secure?: boolean;
		/**
		 * Whether the cookie is a session cookie or a persistent cookie with an expiration
		 * date.
		 */
		session?: boolean;
		/**
		 * The value of the cookie.
		 */
		value: string;
	}

	class Cookies extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/cookies

		/**
		 * Emitted when a cookie is changed because it was added, edited, removed, or
		 * expired.
		 */
		on(event: 'changed', listener: Function): this;
		once(event: 'changed', listener: Function): this;
		addListener(event: 'changed', listener: Function): this;
		removeListener(event: 'changed', listener: Function): this;
		/**
		 * A promise which resolves when the cookie store has been flushed
		 *
	Writes any unwritten cookies data to disk.
		 */
		flushStore(): Promise<void>;
		/**
		 * A promise which resolves an array of cookie objects.
		 *
		 * Sends a request to get all cookies matching `filter`, and resolves a promise
		 * with the response.
		 */
		get(filter: Filter): Promise<Electron.Cookie[]>;
		/**
		 * A promise which resolves when the cookie has been removed
		 *
	Removes the cookies matching `url` and `name`
		 */
		remove(url: string, name: string): Promise<void>;
		/**
		 * A promise which resolves when the cookie has been set
		 *
	Sets a cookie with `details`.
		 */
		set(details: Details): Promise<void>;
	}

	interface CPUUsage {

		// Docs: http://electronjs.org/docs/api/structures/cpu-usage

		/**
		 * The number of average idle CPU wakeups per second since the last call to
		 * getCPUUsage. First call returns 0. Will always return 0 on Windows.
		 */
		idleWakeupsPerSecond: number;
		/**
		 * Percentage of CPU used since the last call to getCPUUsage. First call returns 0.
		 */
		percentCPUUsage: number;
	}

	interface CrashReport {

		// Docs: http://electronjs.org/docs/api/structures/crash-report

		date: Date;
		id: string;
	}

	interface CrashReporter {

		// Docs: http://electronjs.org/docs/api/crash-reporter

		/**
		 * Set an extra parameter to be sent with the crash report. The values specified
		 * here will be sent in addition to any values set via the `extra` option when
		 * `start` was called. This API is only available on macOS and windows, if you need
		 * to add/update extra parameters on Linux after your first call to `start` you can
		 * call `start` again with the updated `extra` options.
		 *
		 * @platform darwin,win32
		 */
		addExtraParameter(key: string, value: string): void;
		/**
		 * Returns the date and ID of the last crash report. Only crash reports that have
		 * been uploaded will be returned; even if a crash report is present on disk it
		 * will not be returned until it is uploaded. In the case that there are no
		 * uploaded reports, `null` is returned.
		 */
		getLastCrashReport(): CrashReport;
		/**
		 * See all of the current parameters being passed to the crash reporter.
		 */
		getParameters(): void;
		/**
		 * Returns all uploaded crash reports. Each report contains the date and uploaded
		 * ID.
		 */
		getUploadedReports(): CrashReport[];
		/**
		 * Whether reports should be submitted to the server. Set through the `start`
		 * method or `setUploadToServer`.
		 *
	**Note:** This API can only be called from the main process.
		 */
		getUploadToServer(): boolean;
		/**
		 * Remove a extra parameter from the current set of parameters so that it will not
		 * be sent with the crash report.
		 *
		 * @platform darwin,win32
		 */
		removeExtraParameter(key: string): void;
		/**
		 * This would normally be controlled by user preferences. This has no effect if
		 * called before `start` is called.
		 *
	**Note:** This API can only be called from the main process.
		 */
		setUploadToServer(uploadToServer: boolean): void;
		/**
		 * You are required to call this method before using any other `crashReporter` APIs
		 * and in each process (main/renderer) from which you want to collect crash
		 * reports. You can pass different options to `crashReporter.start` when calling
		 * from different processes.
		 *
		 * **Note** Child processes created via the `child_process` module will not have
		 * access to the Electron modules. Therefore, to collect crash reports from them,
		 * use `process.crashReporter.start` instead. Pass the same options as above along
		 * with an additional one called `crashesDirectory` that should point to a
		 * directory to store the crash reports temporarily. You can test this out by
		 * calling `process.crash()` to crash the child process.
		 *
		 * **Note:** If you need send additional/updated `extra` parameters after your
		 * first call `start` you can call `addExtraParameter` on macOS or call `start`
		 * again with the new/updated `extra` parameters on Linux and Windows.
		 *
		 * **Note:** On macOS and windows, Electron uses a new `crashpad` client for crash
		 * collection and reporting. If you want to enable crash reporting, initializing
		 * `crashpad` from the main process using `crashReporter.start` is required
		 * regardless of which process you want to collect crashes from. Once initialized
		 * this way, the crashpad handler collects crashes from all processes. You still
		 * have to call `crashReporter.start` from the renderer or child process, otherwise
		 * crashes from them will get reported without `companyName`, `productName` or any
		 * of the `extra` information.
		 */
		start(options: CrashReporterStartOptions): void;
	}

	interface CustomScheme {

		// Docs: http://electronjs.org/docs/api/structures/custom-scheme

		privileges?: Privileges;
		/**
		 * Custom schemes to be registered with options.
		 */
		scheme: string;
	}

	class Debugger extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/debugger

		/**
		 * Emitted when the debugging session is terminated. This happens either when
		 * `webContents` is closed or devtools is invoked for the attached `webContents`.
		 */
		on(event: 'detach', listener: (event: Event,
			/**
			 * Reason for detaching debugger.
			 */
			reason: string) => void): this;
		once(event: 'detach', listener: (event: Event,
			/**
			 * Reason for detaching debugger.
			 */
			reason: string) => void): this;
		addListener(event: 'detach', listener: (event: Event,
			/**
			 * Reason for detaching debugger.
			 */
			reason: string) => void): this;
		removeListener(event: 'detach', listener: (event: Event,
			/**
			 * Reason for detaching debugger.
			 */
			reason: string) => void): this;
		/**
		 * Emitted whenever the debugging target issues an instrumentation event.
		 */
		on(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: unknown) => void): this;
		once(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: unknown) => void): this;
		addListener(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: unknown) => void): this;
		removeListener(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: unknown) => void): this;
		/**
		 * Attaches the debugger to the `webContents`.
		 */
		attach(protocolVersion?: string): void;
		/**
		 * Detaches the debugger from the `webContents`.
		 */
		detach(): void;
		/**
		 * Whether a debugger is attached to the `webContents`.
		 */
		isAttached(): boolean;
		/**
		 * A promise that resolves with the response defined by the 'returns' attribute of
		 * the command description in the remote debugging protocol or is rejected
		 * indicating the failure of the command.
		 *
	Send given command to the debugging target.
		 */
		sendCommand(method: string, commandParams?: any): Promise<any>;
	}

	interface DesktopCapturer {

		// Docs: http://electronjs.org/docs/api/desktop-capturer

		/**
		 * Resolves with an array of `DesktopCapturerSource` objects, each
		 * `DesktopCapturerSource` represents a screen or an individual window that can be
		 * captured.
		 */
		getSources(options: SourcesOptions): Promise<Electron.DesktopCapturerSource[]>;
	}

	interface DesktopCapturerSource {

		// Docs: http://electronjs.org/docs/api/structures/desktop-capturer-source

		/**
		 * An icon image of the application that owns the window or null if the source has
		 * a type screen. The size of the icon is not known in advance and depends on what
		 * the the application provides.
		 */
		appIcon: NativeImage;
		/**
		 * A unique identifier that will correspond to the `id` of the matching Display
		 * returned by the Screen API. On some platforms, this is equivalent to the `XX`
		 * portion of the `id` field above and on others it will differ. It will be an
		 * empty string if not available.
		 */
		display_id: string;
		/**
		 * The identifier of a window or screen that can be used as a `chromeMediaSourceId`
		 * constraint when calling [`navigator.webkitGetUserMedia`]. The format of the
		 * identifier will be `window:XX` or `screen:XX`, where `XX` is a random generated
		 * number.
		 */
		id: string;
		/**
		 * A screen source will be named either `Entire Screen` or `Screen <index>`, while
		 * the name of a window source will match the window title.
		 */
		name: string;
		/**
		 * A thumbnail image. **Note:** There is no guarantee that the size of the
		 * thumbnail is the same as the `thumbnailSize` specified in the `options` passed
		 * to `desktopCapturer.getSources`. The actual size depends on the scale of the
		 * screen or window.
		 */
		thumbnail: NativeImage;
	}

	interface Dialog {

		// Docs: http://electronjs.org/docs/api/dialog

		/**
		 * resolves when the certificate trust dialog is shown.
		 *
		 * On macOS, this displays a modal dialog that shows a message and certificate
		 * information, and gives the user the option of trusting/importing the
		 * certificate. If you provide a `browserWindow` argument the dialog will be
		 * attached to the parent window, making it modal.
		 *
		 * On Windows the options are more limited, due to the Win32 APIs used:
		 *
		 * * The `message` argument is not used, as the OS provides its own confirmation
		 * dialog.
		 * * The `browserWindow` argument is ignored since it is not possible to make this
		 * confirmation dialog modal.
		 *
		 * @platform darwin,win32
		 */
		showCertificateTrustDialog(browserWindow: BrowserWindow, options: CertificateTrustDialogOptions): Promise<void>;
		/**
		 * resolves when the certificate trust dialog is shown.
		 *
		 * On macOS, this displays a modal dialog that shows a message and certificate
		 * information, and gives the user the option of trusting/importing the
		 * certificate. If you provide a `browserWindow` argument the dialog will be
		 * attached to the parent window, making it modal.
		 *
		 * On Windows the options are more limited, due to the Win32 APIs used:
		 *
		 * * The `message` argument is not used, as the OS provides its own confirmation
		 * dialog.
		 * * The `browserWindow` argument is ignored since it is not possible to make this
		 * confirmation dialog modal.
		 *
		 * @platform darwin,win32
		 */
		showCertificateTrustDialog(options: CertificateTrustDialogOptions): Promise<void>;
		/**
		 * Displays a modal dialog that shows an error message.
		 *
		 * This API can be called safely before the `ready` event the `app` module emits,
		 * it is usually used to report errors in early stage of startup. If called before
		 * the app `ready`event on Linux, the message will be emitted to stderr, and no GUI
		 * dialog will appear.
		 */
		showErrorBox(title: string, content: string): void;
		/**
		 * resolves with a promise containing the following properties:
		 *
		 * * `response` Number - The index of the clicked button.
		 * * `checkboxChecked` Boolean - The checked state of the checkbox if
		 * `checkboxLabel` was set. Otherwise `false`.
		 *
		 * Shows a message box, it will block the process until the message box is closed.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 */
		showMessageBox(browserWindow: BrowserWindow, options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue>;
		/**
		 * resolves with a promise containing the following properties:
		 *
		 * * `response` Number - The index of the clicked button.
		 * * `checkboxChecked` Boolean - The checked state of the checkbox if
		 * `checkboxLabel` was set. Otherwise `false`.
		 *
		 * Shows a message box, it will block the process until the message box is closed.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 */
		showMessageBox(options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue>;
		/**
		 * the index of the clicked button.
		 *
		 * Shows a message box, it will block the process until the message box is closed.
		 * It returns the index of the clicked button.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 */
		showMessageBoxSync(browserWindow: BrowserWindow, options: MessageBoxSyncOptions): number;
		/**
		 * the index of the clicked button.
		 *
		 * Shows a message box, it will block the process until the message box is closed.
		 * It returns the index of the clicked button.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 */
		showMessageBoxSync(options: MessageBoxSyncOptions): number;
		/**
		 * Resolve with an object containing the following:
		 *
		 * * `canceled` Boolean - whether or not the dialog was canceled.
		 * * `filePaths` String[] - An array of file paths chosen by the user. If the
		 * dialog is cancelled this will be an empty array.
		 * * `bookmarks` String[] (optional) _macOS_ _mas_ - An array matching the
		 * `filePaths` array of base64 encoded strings which contains security scoped
		 * bookmark data. `securityScopedBookmarks` must be enabled for this to be
		 * populated.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed or selected
		 * when you want to limit the user to a specific type. For example:
		 *
		 * The `extensions` array should contain extensions without wildcards or dots (e.g.
		 * `'png'` is good but `'.png'` and `'*.png'` are bad). To show all files, use the
		 * `'*'` wildcard (no other wildcard is supported).
		 *
		 * **Note:** On Windows and Linux an open dialog can not be both a file selector
		 * and a directory selector, so if you set `properties` to `['openFile',
		 * 'openDirectory']` on these platforms, a directory selector will be shown.
		 */
		showOpenDialog(browserWindow: BrowserWindow, options: OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>;
		/**
		 * Resolve with an object containing the following:
		 *
		 * * `canceled` Boolean - whether or not the dialog was canceled.
		 * * `filePaths` String[] - An array of file paths chosen by the user. If the
		 * dialog is cancelled this will be an empty array.
		 * * `bookmarks` String[] (optional) _macOS_ _mas_ - An array matching the
		 * `filePaths` array of base64 encoded strings which contains security scoped
		 * bookmark data. `securityScopedBookmarks` must be enabled for this to be
		 * populated.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed or selected
		 * when you want to limit the user to a specific type. For example:
		 *
		 * The `extensions` array should contain extensions without wildcards or dots (e.g.
		 * `'png'` is good but `'.png'` and `'*.png'` are bad). To show all files, use the
		 * `'*'` wildcard (no other wildcard is supported).
		 *
		 * **Note:** On Windows and Linux an open dialog can not be both a file selector
		 * and a directory selector, so if you set `properties` to `['openFile',
		 * 'openDirectory']` on these platforms, a directory selector will be shown.
		 */
		showOpenDialog(options: OpenDialogOptions): Promise<Electron.OpenDialogReturnValue>;
		/**
		 * the file paths chosen by the user; if the dialog is cancelled it returns
		 * `undefined`.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed or selected
		 * when you want to limit the user to a specific type. For example:
		 *
		 * The `extensions` array should contain extensions without wildcards or dots (e.g.
		 * `'png'` is good but `'.png'` and `'*.png'` are bad). To show all files, use the
		 * `'*'` wildcard (no other wildcard is supported).
		 *
		 * **Note:** On Windows and Linux an open dialog can not be both a file selector
		 * and a directory selector, so if you set `properties` to `['openFile',
		 * 'openDirectory']` on these platforms, a directory selector will be shown.
		 */
		showOpenDialogSync(options: OpenDialogSyncOptions): (string[]) | (undefined);
		/**
		 * the file paths chosen by the user; if the dialog is cancelled it returns
		 * `undefined`.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed or selected
		 * when you want to limit the user to a specific type. For example:
		 *
		 * The `extensions` array should contain extensions without wildcards or dots (e.g.
		 * `'png'` is good but `'.png'` and `'*.png'` are bad). To show all files, use the
		 * `'*'` wildcard (no other wildcard is supported).
		 *
		 * **Note:** On Windows and Linux an open dialog can not be both a file selector
		 * and a directory selector, so if you set `properties` to `['openFile',
		 * 'openDirectory']` on these platforms, a directory selector will be shown.
		 */
		showOpenDialogSync(browserWindow: BrowserWindow, options: OpenDialogSyncOptions): (string[]) | (undefined);
		/**
		 * Resolve with an object containing the following:
		 *
		 * * `canceled` Boolean - whether or not the dialog was canceled.
		 * * `filePath` String (optional) - If the dialog is canceled, this will be
		 * `undefined`.
		 * * `bookmark` String (optional) _macOS_ _mas_ - Base64 encoded string which
		 * contains the security scoped bookmark data for the saved file.
		 * `securityScopedBookmarks` must be enabled for this to be present.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed, see
		 * `dialog.showOpenDialog` for an example.
		 *
		 * **Note:** On macOS, using the asynchronous version is recommended to avoid
		 * issues when expanding and collapsing the dialog.
		 */
		showSaveDialog(options: SaveDialogOptions): Promise<Electron.SaveDialogReturnValue>;
		/**
		 * Resolve with an object containing the following:
		 *
		 * * `canceled` Boolean - whether or not the dialog was canceled.
		 * * `filePath` String (optional) - If the dialog is canceled, this will be
		 * `undefined`.
		 * * `bookmark` String (optional) _macOS_ _mas_ - Base64 encoded string which
		 * contains the security scoped bookmark data for the saved file.
		 * `securityScopedBookmarks` must be enabled for this to be present.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed, see
		 * `dialog.showOpenDialog` for an example.
		 *
		 * **Note:** On macOS, using the asynchronous version is recommended to avoid
		 * issues when expanding and collapsing the dialog.
		 */
		showSaveDialog(browserWindow: BrowserWindow, options: SaveDialogOptions): Promise<Electron.SaveDialogReturnValue>;
		/**
		 * the path of the file chosen by the user; if the dialog is cancelled it returns
		 * `undefined`.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed, see
		 * `dialog.showOpenDialog` for an example.
		 */
		showSaveDialogSync(options: SaveDialogSyncOptions): (string) | (undefined);
		/**
		 * the path of the file chosen by the user; if the dialog is cancelled it returns
		 * `undefined`.
		 *
		 * The `browserWindow` argument allows the dialog to attach itself to a parent
		 * window, making it modal.
		 *
		 * The `filters` specifies an array of file types that can be displayed, see
		 * `dialog.showOpenDialog` for an example.
		 */
		showSaveDialogSync(browserWindow: BrowserWindow, options: SaveDialogSyncOptions): (string) | (undefined);
	}

	interface Display {

		// Docs: http://electronjs.org/docs/api/structures/display

		/**
		 * Can be `available`, `unavailable`, `unknown`.
		 */
		accelerometerSupport: ('available' | 'unavailable' | 'unknown');
		bounds: Rectangle;
		/**
		 * The number of bits per pixel.
		 */
		colorDepth: number;
		/**
		 * represent a color space (three-dimensional object which contains all realizable
		 * color combinations) for the purpose of color conversions
		 */
		colorSpace: string;
		/**
		 * The number of bits per color component.
		 */
		depthPerComponent: number;
		/**
		 * Unique identifier associated with the display.
		 */
		id: number;
		/**
		 * `true` for an internal display and `false` for an external display
		 */
		internal: boolean;
		/**
		 * Whether or not the display is a monochrome display.
		 */
		monochrome: boolean;
		/**
		 * Can be 0, 90, 180, 270, represents screen rotation in clock-wise degrees.
		 */
		rotation: number;
		/**
		 * Output device's pixel scale factor.
		 */
		scaleFactor: number;
		size: Size;
		/**
		 * Can be `available`, `unavailable`, `unknown`.
		 */
		touchSupport: ('available' | 'unavailable' | 'unknown');
		workArea: Rectangle;
		workAreaSize: Size;
	}

	class Dock {

		// Docs: http://electronjs.org/docs/api/dock

		/**
		 * an ID representing the request.
		 *
		 * When `critical` is passed, the dock icon will bounce until either the
		 * application becomes active or the request is canceled.
		 *
		 * When `informational` is passed, the dock icon will bounce for one second.
		 * However, the request remains active until either the application becomes active
		 * or the request is canceled.
		 *
		 * **Nota Bene:** This method can only be used while the app is not focused; when
		 * the app is focused it will return -1.
		 *
		 * @platform darwin
		 */
		bounce(type?: 'critical' | 'informational'): number;
		/**
		 * Cancel the bounce of `id`.
		 *
		 * @platform darwin
		 */
		cancelBounce(id: number): void;
		/**
		 * Bounces the Downloads stack if the filePath is inside the Downloads folder.
		 *
		 * @platform darwin
		 */
		downloadFinished(filePath: string): void;
		/**
		 * The badge string of the dock.
		 *
		 * @platform darwin
		 */
		getBadge(): string;
		/**
		 * The application's [dock menu][dock-menu].
		 *
		 * @platform darwin
		 */
		getMenu(): (Menu) | (null);
		/**
		 * Hides the dock icon.
		 *
		 * @platform darwin
		 */
		hide(): void;
		/**
		 * Whether the dock icon is visible.
		 *
		 * @platform darwin
		 */
		isVisible(): boolean;
		/**
		 * Sets the string to be displayed in the dock’s badging area.
		 *
		 * @platform darwin
		 */
		setBadge(text: string): void;
		/**
		 * Sets the `image` associated with this dock icon.
		 *
		 * @platform darwin
		 */
		setIcon(image: (NativeImage) | (string)): void;
		/**
		 * Sets the application's [dock menu][dock-menu].
		 *
		 * @platform darwin
		 */
		setMenu(menu: Menu): void;
		/**
		 * Resolves when the dock icon is shown.
		 *
		 * @platform darwin
		 */
		show(): Promise<void>;
	}

	class DownloadItem extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/download-item

		/**
		 * Emitted when the download is in a terminal state. This includes a completed
		 * download, a cancelled download (via `downloadItem.cancel()`), and interrupted
		 * download that can't be resumed.
		 *
		 * The `state` can be one of following:
		 *
		 * * `completed` - The download completed successfully.
		 * * `cancelled` - The download has been cancelled.
		 * * `interrupted` - The download has interrupted and can not resume.
		 */
		on(event: 'done', listener: (event: Event,
			/**
			 * Can be `completed`, `cancelled` or `interrupted`.
			 */
			state: ('completed' | 'cancelled' | 'interrupted')) => void): this;
		once(event: 'done', listener: (event: Event,
			/**
			 * Can be `completed`, `cancelled` or `interrupted`.
			 */
			state: ('completed' | 'cancelled' | 'interrupted')) => void): this;
		addListener(event: 'done', listener: (event: Event,
			/**
			 * Can be `completed`, `cancelled` or `interrupted`.
			 */
			state: ('completed' | 'cancelled' | 'interrupted')) => void): this;
		removeListener(event: 'done', listener: (event: Event,
			/**
			 * Can be `completed`, `cancelled` or `interrupted`.
			 */
			state: ('completed' | 'cancelled' | 'interrupted')) => void): this;
		/**
		 * Emitted when the download has been updated and is not done.
		 *
		 * The `state` can be one of following:
		 *
		 * * `progressing` - The download is in-progress.
		 * * `interrupted` - The download has interrupted and can be resumed.
		 */
		on(event: 'updated', listener: (event: Event,
			/**
			 * Can be `progressing` or `interrupted`.
			 */
			state: ('progressing' | 'interrupted')) => void): this;
		once(event: 'updated', listener: (event: Event,
			/**
			 * Can be `progressing` or `interrupted`.
			 */
			state: ('progressing' | 'interrupted')) => void): this;
		addListener(event: 'updated', listener: (event: Event,
			/**
			 * Can be `progressing` or `interrupted`.
			 */
			state: ('progressing' | 'interrupted')) => void): this;
		removeListener(event: 'updated', listener: (event: Event,
			/**
			 * Can be `progressing` or `interrupted`.
			 */
			state: ('progressing' | 'interrupted')) => void): this;
		/**
		 * Cancels the download operation.
		 */
		cancel(): void;
		/**
		 * Whether the download can resume.
		 */
		canResume(): boolean;
		/**
		 * The Content-Disposition field from the response header.
		 */
		getContentDisposition(): string;
		/**
		 * ETag header value.
		 */
		getETag(): string;
		/**
		 * The file name of the download item.
		 *
		 * **Note:** The file name is not always the same as the actual one saved in local
		 * disk. If user changes the file name in a prompted download saving dialog, the
		 * actual name of saved file will be different.
		 */
		getFilename(): string;
		/**
		 * Last-Modified header value.
		 */
		getLastModifiedTime(): string;
		/**
		 * The files mime type.
		 */
		getMimeType(): string;
		/**
		 * The received bytes of the download item.
		 */
		getReceivedBytes(): number;
		/**
		 * Returns the object previously set by
		 * `downloadItem.setSaveDialogOptions(options)`.
		 */
		getSaveDialogOptions(): SaveDialogOptions;
		/**
		 * The save path of the download item. This will be either the path set via
		 * `downloadItem.setSavePath(path)` or the path selected from the shown save
		 * dialog.

	**Deprecated: use the `savePath` property instead.**
		 */
		getSavePath(): string;
		/**
		 * Number of seconds since the UNIX epoch when the download was started.
		 */
		getStartTime(): number;
		/**
		 * The current state. Can be `progressing`, `completed`, `cancelled` or
		 * `interrupted`.
		 *
		 * **Note:** The following methods are useful specifically to resume a `cancelled`
		 * item when session is restarted.
		 */
		getState(): ('progressing' | 'completed' | 'cancelled' | 'interrupted');
		/**
		 * The total size in bytes of the download item.
		 *
	If the size is unknown, it returns 0.
		 */
		getTotalBytes(): number;
		/**
		 * The origin URL where the item is downloaded from.
		 */
		getURL(): string;
		/**
		 * The complete URL chain of the item including any redirects.
		 */
		getURLChain(): string[];
		/**
		 * Whether the download has user gesture.
		 */
		hasUserGesture(): boolean;
		/**
		 * Whether the download is paused.
		 */
		isPaused(): boolean;
		/**
		 * Pauses the download.
		 */
		pause(): void;
		/**
		 * Resumes the download that has been paused.
		 *
		 * **Note:** To enable resumable downloads the server you are downloading from must
		 * support range requests and provide both `Last-Modified` and `ETag` header
		 * values. Otherwise `resume()` will dismiss previously received bytes and restart
		 * the download from the beginning.
		 */
		resume(): void;
		/**
		 * This API allows the user to set custom options for the save dialog that opens
		 * for the download item by default. The API is only available in session's
		 * `will-download` callback function.
		 */
		setSaveDialogOptions(options: SaveDialogOptions): void;
		/**
		 * The API is only available in session's `will-download` callback function. If
		 * user doesn't set the save path via the API, Electron will use the original
		 * routine to determine the save path; this usually prompts a save dialog.
		 *
	**Deprecated: use the `savePath` property instead.**
		 */
		setSavePath(path: string): void;
		savePath: string;
	}

	interface Event extends GlobalEvent {

		// Docs: http://electronjs.org/docs/api/structures/event

		preventDefault: (() => void);
	}

	interface ExtensionInfo {

		// Docs: http://electronjs.org/docs/api/structures/extension-info

		name: string;
		version: string;
	}

	interface FileFilter {

		// Docs: http://electronjs.org/docs/api/structures/file-filter

		extensions: string[];
		name: string;
	}

	interface FilePathWithHeaders {

		// Docs: http://electronjs.org/docs/api/structures/file-path-with-headers

		/**
		 * Additional headers to be sent.
		 */
		headers?: Record<string, string>;
		/**
		 * The path to the file to send.
		 */
		path: string;
	}

	interface GlobalShortcut {

		// Docs: http://electronjs.org/docs/api/global-shortcut

		/**
		 * Whether this application has registered `accelerator`.
		 *
		 * When the accelerator is already taken by other applications, this call will
		 * still return `false`. This behavior is intended by operating systems, since they
		 * don't want applications to fight for global shortcuts.
		 */
		isRegistered(accelerator: Accelerator): boolean;
		/**
		 * Whether or not the shortcut was registered successfully.
		 *
		 * Registers a global shortcut of `accelerator`. The `callback` is called when the
		 * registered shortcut is pressed by the user.
		 *
		 * When the accelerator is already taken by other applications, this call will
		 * silently fail. This behavior is intended by operating systems, since they don't
		 * want applications to fight for global shortcuts.
		 *
		 * The following accelerators will not be registered successfully on macOS 10.14
		 * Mojave unless the app has been authorized as a trusted accessibility client:
		 *
		 * * "Media Play/Pause"
		 * * "Media Next Track"
	* "Media Previous Track"
	* "Media Stop"
		 */
		register(accelerator: Accelerator, callback: () => void): boolean;
		/**
		 * Registers a global shortcut of all `accelerator` items in `accelerators`. The
		 * `callback` is called when any of the registered shortcuts are pressed by the
		 * user.
		 *
		 * When a given accelerator is already taken by other applications, this call will
		 * silently fail. This behavior is intended by operating systems, since they don't
		 * want applications to fight for global shortcuts.
		 *
		 * The following accelerators will not be registered successfully on macOS 10.14
		 * Mojave unless the app has been authorized as a trusted accessibility client:
		 *
		 * * "Media Play/Pause"
		 * * "Media Next Track"
	* "Media Previous Track"
	* "Media Stop"
		 */
		registerAll(accelerators: string[], callback: () => void): void;
		/**
		 * Unregisters the global shortcut of `accelerator`.
		 */
		unregister(accelerator: Accelerator): void;
		/**
		 * Unregisters all of the global shortcuts.
		 */
		unregisterAll(): void;
	}

	interface GPUFeatureStatus {

		// Docs: http://electronjs.org/docs/api/structures/gpu-feature-status

		/**
		 * Canvas.
		 */
		'2d_canvas': string;
		/**
		 * Flash.
		 */
		flash_3d: string;
		/**
		 * Flash Stage3D.
		 */
		flash_stage3d: string;
		/**
		 * Flash Stage3D Baseline profile.
		 */
		flash_stage3d_baseline: string;
		/**
		 * Compositing.
		 */
		gpu_compositing: string;
		/**
		 * Multiple Raster Threads.
		 */
		multiple_raster_threads: string;
		/**
		 * Native GpuMemoryBuffers.
		 */
		native_gpu_memory_buffers: string;
		/**
		 * Rasterization.
		 */
		rasterization: string;
		/**
		 * Video Decode.
		 */
		video_decode: string;
		/**
		 * Video Encode.
		 */
		video_encode: string;
		/**
		 * VPx Video Decode.
		 */
		vpx_decode: string;
		/**
		 * WebGL.
		 */
		webgl: string;
		/**
		 * WebGL2.
		 */
		webgl2: string;
	}

	interface InAppPurchase extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/in-app-purchase

		on(event: 'transactions-updated', listener: Function): this;
		once(event: 'transactions-updated', listener: Function): this;
		addListener(event: 'transactions-updated', listener: Function): this;
		removeListener(event: 'transactions-updated', listener: Function): this;
		/**
		 * whether a user can make a payment.
		 */
		canMakePayments(): boolean;
		/**
		 * Completes all pending transactions.
		 */
		finishAllTransactions(): void;
		/**
		 * Completes the pending transactions corresponding to the date.
		 */
		finishTransactionByDate(date: string): void;
		/**
		 * Resolves with an array of `Product` objects.
		 *
	Retrieves the product descriptions.
		 */
		getProducts(productIDs: string[]): Promise<Electron.Product[]>;
		/**
		 * the path to the receipt.
		 */
		getReceiptURL(): string;
		/**
		 * Returns `true` if the product is valid and added to the payment queue.
		 *
		 * You should listen for the `transactions-updated` event as soon as possible and
		 * certainly before you call `purchaseProduct`.
		 */
		purchaseProduct(productID: string, quantity?: number): Promise<boolean>;
	}

	class IncomingMessage extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/incoming-message

		/**
		 * Emitted when a request has been canceled during an ongoing HTTP transaction.
		 */
		on(event: 'aborted', listener: Function): this;
		once(event: 'aborted', listener: Function): this;
		addListener(event: 'aborted', listener: Function): this;
		removeListener(event: 'aborted', listener: Function): this;
		/**
		 * The `data` event is the usual method of transferring response data into
		 * applicative code.
		 */
		on(event: 'data', listener: (
			/**
			 * A chunk of response body's data.
			 */
			chunk: Buffer) => void): this;
		once(event: 'data', listener: (
			/**
			 * A chunk of response body's data.
			 */
			chunk: Buffer) => void): this;
		addListener(event: 'data', listener: (
			/**
			 * A chunk of response body's data.
			 */
			chunk: Buffer) => void): this;
		removeListener(event: 'data', listener: (
			/**
			 * A chunk of response body's data.
			 */
			chunk: Buffer) => void): this;
		/**
		 * Indicates that response body has ended.
		 */
		on(event: 'end', listener: Function): this;
		once(event: 'end', listener: Function): this;
		addListener(event: 'end', listener: Function): this;
		removeListener(event: 'end', listener: Function): this;
		/**
		 * Returns:
		 *
		 * `error` Error - Typically holds an error string identifying failure root cause.
		 *
		 * Emitted when an error was encountered while streaming response data events. For
		 * instance, if the server closes the underlying while the response is still
		 * streaming, an `error` event will be emitted on the response object and a `close`
		 * event will subsequently follow on the request object.
		 */
		on(event: 'error', listener: Function): this;
		once(event: 'error', listener: Function): this;
		addListener(event: 'error', listener: Function): this;
		removeListener(event: 'error', listener: Function): this;
		headers: Record<string, string[]>;
		httpVersion: string;
		httpVersionMajor: number;
		httpVersionMinor: number;
		statusCode: number;
		statusMessage: string;
	}

	interface InputEvent {

		// Docs: http://electronjs.org/docs/api/structures/input-event

		/**
		 * An array of modifiers of the event, can be `shift`, `control`, `alt`, `meta`,
		 * `isKeypad`, `isAutoRepeat`, `leftButtonDown`, `middleButtonDown`,
		 * `rightButtonDown`, `capsLock`, `numLock`, `left`, `right`.
		 */
		modifiers: Array<'shift' | 'control' | 'alt' | 'meta' | 'isKeypad' | 'isAutoRepeat' | 'leftButtonDown' | 'middleButtonDown' | 'rightButtonDown' | 'capsLock' | 'numLock' | 'left' | 'right'>;
	}

	interface IOCounters {

		// Docs: http://electronjs.org/docs/api/structures/io-counters

		/**
		 * Then number of I/O other operations.
		 */
		otherOperationCount: number;
		/**
		 * Then number of I/O other transfers.
		 */
		otherTransferCount: number;
		/**
		 * The number of I/O read operations.
		 */
		readOperationCount: number;
		/**
		 * The number of I/O read transfers.
		 */
		readTransferCount: number;
		/**
		 * The number of I/O write operations.
		 */
		writeOperationCount: number;
		/**
		 * The number of I/O write transfers.
		 */
		writeTransferCount: number;
	}

	interface IpcMain extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/ipc-main

		/**
		 * Adds a handler for an `invoke`able IPC. This handler will be called whenever a
		 * renderer calls `ipcRenderer.invoke(channel, ...args)`.
		 *
		 * If `listener` returns a Promise, the eventual result of the promise will be
		 * returned as a reply to the remote caller. Otherwise, the return value of the
		 * listener will be used as the value of the reply.
		 *
		 * The `event` that is passed as the first argument to the handler is the same as
		 * that passed to a regular event listener. It includes information about which
		 * WebContents is the source of the invoke request.
		 */
		handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => (Promise<void>) | (any)): void;
		/**
		 * Handles a single `invoke`able IPC message, then removes the listener. See
		 * `ipcMain.handle(channel, listener)`.
		 */
		handleOnce(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => (Promise<void>) | (any)): void;
		/**
		 * Listens to `channel`, when a new message arrives `listener` would be called with
		 * `listener(event, args...)`.
		 */
		on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): this;
		/**
		 * Adds a one time `listener` function for the event. This `listener` is invoked
		 * only the next time a message is sent to `channel`, after which it is removed.
		 */
		once(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): this;
		/**
		 * Removes listeners of the specified `channel`.
		 */
		removeAllListeners(channel?: string): this;
		/**
		 * Removes any handler for `channel`, if present.
		 */
		removeHandler(channel: string): void;
		/**
		 * Removes the specified `listener` from the listener array for the specified
		 * `channel`.
		 */
		removeListener(channel: string, listener: () => void): this;
	}

	interface IpcMainEvent extends Event {

		// Docs: http://electronjs.org/docs/api/structures/ipc-main-event

		/**
		 * The ID of the renderer frame that sent this message
		 */
		frameId: number;
		/**
		 * A function that will send an IPC message to the renderer frame that sent the
		 * original message that you are currently handling.  You should use this method to
		 * "reply" to the sent message in order to guarantee the reply will go to the
		 * correct process and frame.
		 */
		reply: Function;
		/**
		 * Set this to the value to be returned in a synchronous message
		 */
		returnValue: any;
		/**
		 * Returns the `webContents` that sent the message
		 */
		sender: WebContents;
	}

	interface IpcMainInvokeEvent extends Event {

		// Docs: http://electronjs.org/docs/api/structures/ipc-main-invoke-event

		/**
		 * The ID of the renderer frame that sent this message
		 */
		frameId: number;
		/**
		 * Returns the `webContents` that sent the message
		 */
		sender: WebContents;
	}

	interface IpcRenderer extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/ipc-renderer

		/**
		 * Resolves with the response from the main process.
		 *
		 * Send a message to the main process asynchronously via `channel` and expect an
		 * asynchronous result. Arguments will be serialized as JSON internally and hence
		 * no functions or prototype chain will be included.
		 *
		 * The main process should listen for `channel` with `ipcMain.handle()`.
		 *
	For example:
		 */
		invoke(channel: string, ...args: any[]): Promise<any>;
		/**
		 * Listens to `channel`, when a new message arrives `listener` would be called with
		 * `listener(event, args...)`.
		 */
		on(channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void): this;
		/**
		 * Adds a one time `listener` function for the event. This `listener` is invoked
		 * only the next time a message is sent to `channel`, after which it is removed.
		 */
		once(channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void): this;
		/**
		 * Removes all listeners, or those of the specified `channel`.
		 */
		removeAllListeners(channel: string): this;
		/**
		 * Removes the specified `listener` from the listener array for the specified
		 * `channel`.
		 */
		removeListener(channel: string, listener: (...args: any[]) => void): this;
		/**
		 * Send a message to the main process asynchronously via `channel`, you can also
		 * send arbitrary arguments. Arguments will be serialized as JSON internally and
		 * hence no functions or prototype chain will be included.
		 *
		 * The main process handles it by listening for `channel` with the `ipcMain`
		 * module.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * The value sent back by the `ipcMain` handler.
		 *
		 * Send a message to the main process synchronously via `channel`, you can also
		 * send arbitrary arguments. Arguments will be serialized in JSON internally and
		 * hence no functions or prototype chain will be included.
		 *
		 * The main process handles it by listening for `channel` with `ipcMain` module,
		 * and replies by setting `event.returnValue`.
		 *
		 * **Note:** Sending a synchronous message will block the whole renderer process,
		 * unless you know what you are doing you should never use it.
		 */
		// sendSync(channel: string, ...args: any[]): any; ### VSCODE CHANGE (we do not want to use sendSync)
		/**
		 * Sends a message to a window with `webContentsId` via `channel`.
		 */
		sendTo(webContentsId: number, channel: string, ...args: any[]): void;
		/**
		 * Like `ipcRenderer.send` but the event will be sent to the `<webview>` element in
		 * the host page instead of the main process.
		 */
		sendToHost(channel: string, ...args: any[]): void;
	}

	interface IpcRendererEvent extends Event {

		// Docs: http://electronjs.org/docs/api/structures/ipc-renderer-event

		/**
		 * The `IpcRenderer` instance that emitted the event originally
		 */
		sender: IpcRenderer;
		/**
		 * The `webContents.id` that sent the message, you can call
		 * `event.sender.sendTo(event.senderId, ...)` to reply to the message, see
		 * ipcRenderer.sendTo for more information. This only applies to messages sent from
		 * a different renderer. Messages sent directly from the main process set
		 * `event.senderId` to `0`.
		 */
		senderId: number;
	}

	interface JumpListCategory {

		// Docs: http://electronjs.org/docs/api/structures/jump-list-category

		/**
		 * Array of `JumpListItem` objects if `type` is `tasks` or `custom`, otherwise it
		 * should be omitted.
		 */
		items?: JumpListItem[];
		/**
		 * Must be set if `type` is `custom`, otherwise it should be omitted.
		 */
		name?: string;
		/**
		 * One of the following:
		 */
		type?: ('tasks' | 'frequent' | 'recent' | 'custom');
	}

	interface JumpListItem {

		// Docs: http://electronjs.org/docs/api/structures/jump-list-item

		/**
		 * The command line arguments when `program` is executed. Should only be set if
		 * `type` is `task`.
		 */
		args?: string;
		/**
		 * Description of the task (displayed in a tooltip). Should only be set if `type`
		 * is `task`.
		 */
		description?: string;
		/**
		 * The index of the icon in the resource file. If a resource file contains multiple
		 * icons this value can be used to specify the zero-based index of the icon that
		 * should be displayed for this task. If a resource file contains only one icon,
		 * this property should be set to zero.
		 */
		iconIndex?: number;
		/**
		 * The absolute path to an icon to be displayed in a Jump List, which can be an
		 * arbitrary resource file that contains an icon (e.g. `.ico`, `.exe`, `.dll`). You
		 * can usually specify `process.execPath` to show the program icon.
		 */
		iconPath?: string;
		/**
		 * Path of the file to open, should only be set if `type` is `file`.
		 */
		path?: string;
		/**
		 * Path of the program to execute, usually you should specify `process.execPath`
		 * which opens the current program. Should only be set if `type` is `task`.
		 */
		program?: string;
		/**
		 * The text to be displayed for the item in the Jump List. Should only be set if
		 * `type` is `task`.
		 */
		title?: string;
		/**
		 * One of the following:
		 */
		type?: ('task' | 'separator' | 'file');
		/**
		 * The working directory. Default is empty.
		 */
		workingDirectory?: string;
	}

	interface KeyboardEvent extends Event {

		// Docs: http://electronjs.org/docs/api/structures/keyboard-event

		/**
		 * whether an Alt key was used in an accelerator to trigger the Event
		 */
		altKey?: boolean;
		/**
		 * whether the Control key was used in an accelerator to trigger the Event
		 */
		ctrlKey?: boolean;
		/**
		 * whether a meta key was used in an accelerator to trigger the Event
		 */
		metaKey?: boolean;
		/**
		 * whether a Shift key was used in an accelerator to trigger the Event
		 */
		shiftKey?: boolean;
		/**
		 * whether an accelerator was used to trigger the event as opposed to another user
		 * gesture like mouse click
		 */
		triggeredByAccelerator?: boolean;
	}

	interface KeyboardInputEvent extends InputEvent {

		// Docs: http://electronjs.org/docs/api/structures/keyboard-input-event

		/**
		 * The character that will be sent as the keyboard event. Should only use the valid
		 * key codes in Accelerator.
		 */
		keyCode: string;
		/**
		 * The type of the event, can be `keyDown`, `keyUp` or `char`.
		 */
		type: ('keyDown' | 'keyUp' | 'char');
	}

	interface MemoryInfo {

		// Docs: http://electronjs.org/docs/api/structures/memory-info

		/**
		 * The maximum amount of memory that has ever been pinned to actual physical RAM.
		 */
		peakWorkingSetSize: number;
		/**
		 * The amount of memory not shared by other processes, such as JS heap or HTML
		 * content.
		 *
		 * @platform win32
		 */
		privateBytes?: number;
		/**
		 * The amount of memory currently pinned to actual physical RAM.
		 */
		workingSetSize: number;
	}

	interface MemoryUsageDetails {

		// Docs: http://electronjs.org/docs/api/structures/memory-usage-details

		count: number;
		liveSize: number;
		size: number;
	}

	class Menu {

		// Docs: http://electronjs.org/docs/api/menu

		/**
		 * Emitted when a popup is closed either manually or with `menu.closePopup()`.
		 */
		on(event: 'menu-will-close', listener: (event: Event) => void): this;
		once(event: 'menu-will-close', listener: (event: Event) => void): this;
		addListener(event: 'menu-will-close', listener: (event: Event) => void): this;
		removeListener(event: 'menu-will-close', listener: (event: Event) => void): this;
		/**
		 * Emitted when `menu.popup()` is called.
		 */
		on(event: 'menu-will-show', listener: (event: Event) => void): this;
		once(event: 'menu-will-show', listener: (event: Event) => void): this;
		addListener(event: 'menu-will-show', listener: (event: Event) => void): this;
		removeListener(event: 'menu-will-show', listener: (event: Event) => void): this;
		/**
		 * Menu
		 */
		constructor();
		/**
		 * Generally, the `template` is an array of `options` for constructing a MenuItem.
		 * The usage can be referenced above.
		 *
		 * You can also attach other fields to the element of the `template` and they will
		 * become properties of the constructed menu items.
		 */
		static buildFromTemplate(template: Array<(MenuItemConstructorOptions) | (MenuItem)>): Menu;
		/**
		 * The application menu, if set, or `null`, if not set.
		 *
		 * **Note:** The returned `Menu` instance doesn't support dynamic addition or
		 * removal of menu items. Instance properties can still be dynamically modified.
		 */
		static getApplicationMenu(): (Menu) | (null);
		/**
		 * Sends the `action` to the first responder of application. This is used for
		 * emulating default macOS menu behaviors. Usually you would use the `role`
		 * property of a `MenuItem`.
		 *
		 * See the macOS Cocoa Event Handling Guide for more information on macOS' native
		 * actions.
		 *
		 * @platform darwin
		 */
		static sendActionToFirstResponder(action: string): void;
		/**
		 * Sets `menu` as the application menu on macOS. On Windows and Linux, the `menu`
		 * will be set as each window's top menu.
		 *
		 * Also on Windows and Linux, you can use a `&` in the top-level item name to
		 * indicate which letter should get a generated accelerator. For example, using
		 * `&File` for the file menu would result in a generated `Alt-F` accelerator that
		 * opens the associated menu. The indicated character in the button label gets an
		 * underline. The `&` character is not displayed on the button label.
		 *
		 * Passing `null` will suppress the default menu. On Windows and Linux, this has
		 * the additional effect of removing the menu bar from the window.
		 *
		 * **Note:** The default menu will be created automatically if the app does not set
		 * one. It contains standard items such as `File`, `Edit`, `View`, `Window` and
		 * `Help`.
		 */
		static setApplicationMenu(menu: (Menu) | (null)): void;
		/**
		 * Appends the `menuItem` to the menu.
		 */
		append(menuItem: MenuItem): void;
		/**
		 * Closes the context menu in the `browserWindow`.
		 */
		closePopup(browserWindow?: BrowserWindow): void;
		/**
		 * the item with the specified `id`
		 */
		getMenuItemById(id: string): MenuItem;
		/**
		 * Inserts the `menuItem` to the `pos` position of the menu.
		 */
		insert(pos: number, menuItem: MenuItem): void;
		/**
		 * Pops up this menu as a context menu in the `BrowserWindow`.
		 */
		popup(options?: PopupOptions): void;
		items: MenuItem[];
	}

	class MenuItem {

		// Docs: http://electronjs.org/docs/api/menu-item

		/**
		 * MenuItem
		 */
		constructor(options: MenuItemConstructorOptions);
		accelerator?: Accelerator;
		checked: boolean;
		click: Function;
		commandId: number;
		enabled: boolean;
		icon?: (NativeImage) | (string);
		id: string;
		label: string;
		menu: Menu;
		registerAccelerator: boolean;
		role?: ('undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'delete' | 'selectAll' | 'reload' | 'forceReload' | 'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen' | 'window' | 'minimize' | 'close' | 'help' | 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit' | 'startSpeaking' | 'stopSpeaking' | 'close' | 'minimize' | 'zoom' | 'front' | 'appMenu' | 'fileMenu' | 'editMenu' | 'viewMenu' | 'recentDocuments' | 'toggleTabBar' | 'selectNextTab' | 'selectPreviousTab' | 'mergeAllWindows' | 'clearRecentDocuments' | 'moveTabToNewWindow' | 'windowMenu');
		sublabel: string;
		submenu?: Menu;
		toolTip: string;
		type: ('normal' | 'separator' | 'submenu' | 'checkbox' | 'radio');
		visible: boolean;
	}

	interface MimeTypedBuffer {

		// Docs: http://electronjs.org/docs/api/structures/mime-typed-buffer

		/**
		 * The actual Buffer content.
		 */
		data: Buffer;
		/**
		 * The mimeType of the Buffer that you are sending.
		 */
		mimeType: string;
	}

	interface MouseInputEvent extends InputEvent {

		// Docs: http://electronjs.org/docs/api/structures/mouse-input-event

		/**
		 * The button pressed, can be `left`, `middle`, `right`.
		 */
		button?: ('left' | 'middle' | 'right');
		clickCount?: number;
		globalX?: number;
		globalY?: number;
		movementX?: number;
		movementY?: number;
		/**
		 * The type of the event, can be `mouseDown`, `mouseUp`, `mouseEnter`,
		 * `mouseLeave`, `contextMenu`, `mouseWheel` or `mouseMove`.
		 */
		type: ('mouseDown' | 'mouseUp' | 'mouseEnter' | 'mouseLeave' | 'contextMenu' | 'mouseWheel' | 'mouseMove');
		x: number;
		y: number;
	}

	interface MouseWheelInputEvent extends MouseInputEvent {

		// Docs: http://electronjs.org/docs/api/structures/mouse-wheel-input-event

		accelerationRatioX?: number;
		accelerationRatioY?: number;
		canScroll?: boolean;
		deltaX?: number;
		deltaY?: number;
		hasPreciseScrollingDeltas?: boolean;
		/**
		 * The type of the event, can be `mouseWheel`.
		 */
		type: ('mouseWheel');
		wheelTicksX?: number;
		wheelTicksY?: number;
	}

	class NativeImage {

		// Docs: http://electronjs.org/docs/api/native-image

		/**
		 * Creates an empty `NativeImage` instance.
		 */
		static createEmpty(): NativeImage;
		/**
		 * Creates a new `NativeImage` instance from `buffer` that contains the raw bitmap
		 * pixel data returned by `toBitmap()`. The specific format is platform-dependent.
		 */
		static createFromBitmap(buffer: Buffer, options: CreateFromBitmapOptions): NativeImage;
		/**
		 * Creates a new `NativeImage` instance from `buffer`. Tries to decode as PNG or
		 * JPEG first.
		 */
		static createFromBuffer(buffer: Buffer, options?: CreateFromBufferOptions): NativeImage;
		/**
		 * Creates a new `NativeImage` instance from `dataURL`.
		 */
		static createFromDataURL(dataURL: string): NativeImage;
		/**
		 * Creates a new `NativeImage` instance from the NSImage that maps to the given
		 * image name. See `System Icons` for a list of possible values.
		 *
		 * The `hslShift` is applied to the image with the following rules
		 *
		 * * `hsl_shift[0]` (hue): The absolute hue value for the image - 0 and 1 map to 0
		 * and 360 on the hue color wheel (red).
		 * * `hsl_shift[1]` (saturation): A saturation shift for the image, with the
		 * following key values: 0 = remove all color. 0.5 = leave unchanged. 1 = fully
		 * saturate the image.
		 * * `hsl_shift[2]` (lightness): A lightness shift for the image, with the
		 * following key values: 0 = remove all lightness (make all pixels black). 0.5 =
		 * leave unchanged. 1 = full lightness (make all pixels white).
		 *
		 * This means that `[-1, 0, 1]` will make the image completely white and `[-1, 1,
		 * 0]` will make the image completely black.
		 *
		 * In some cases, the `NSImageName` doesn't match its string representation; one
		 * example of this is `NSFolderImageName`, whose string representation would
		 * actually be `NSFolder`. Therefore, you'll need to determine the correct string
		 * representation for your image before passing it in. This can be done with the
		 * following:
		 *
		 * `echo -e '#import <Cocoa/Cocoa.h>\nint main() { NSLog(@"%@", SYSTEM_IMAGE_NAME);
		 * }' | clang -otest -x objective-c -framework Cocoa - && ./test`
		 *
	where `SYSTEM_IMAGE_NAME` should be replaced with any value from this list.
		 *
		 * @platform darwin
		 */
		static createFromNamedImage(imageName: string, hslShift?: number[]): NativeImage;
		/**
		 * Creates a new `NativeImage` instance from a file located at `path`. This method
		 * returns an empty image if the `path` does not exist, cannot be read, or is not a
		 * valid image.
		 */
		static createFromPath(path: string): NativeImage;
		/**
		 * A `Boolean` property that determines whether the image is considered a template
		 * image.

	Please note that this property only has an effect on macOS.
		 *
		 * @platform darwin
		 */
		static isMacTemplateImage: boolean;
		/**
		 * Add an image representation for a specific scale factor. This can be used to
		 * explicitly add different scale factor representations to an image. This can be
		 * called on empty images.
		 */
		addRepresentation(options: AddRepresentationOptions): void;
		/**
		 * The cropped image.
		 */
		crop(rect: Rectangle): NativeImage;
		/**
		 * The image's aspect ratio.
		 */
		getAspectRatio(): number;
		/**
		 * A Buffer that contains the image's raw bitmap pixel data.
		 *
		 * The difference between `getBitmap()` and `toBitmap()` is, `getBitmap()` does not
		 * copy the bitmap data, so you have to use the returned Buffer immediately in
		 * current event loop tick, otherwise the data might be changed or destroyed.
		 */
		getBitmap(options?: BitmapOptions): Buffer;
		/**
		 * A Buffer that stores C pointer to underlying native handle of the image. On
		 * macOS, a pointer to `NSImage` instance would be returned.
		 *
		 * Notice that the returned pointer is a weak pointer to the underlying native
		 * image instead of a copy, so you _must_ ensure that the associated `nativeImage`
		 * instance is kept around.
		 *
		 * @platform darwin
		 */
		getNativeHandle(): Buffer;
		getSize(): Size;
		/**
		 * Whether the image is empty.
		 */
		isEmpty(): boolean;
		/**
		 * Whether the image is a template image.

	**Deprecated**
		 */
		isTemplateImage(): boolean;
		/**
		 * The resized image.
		 *
		 * If only the `height` or the `width` are specified then the current aspect ratio
		 * will be preserved in the resized image.
		 */
		resize(options: ResizeOptions): NativeImage;
		/**
		 * Marks the image as a template image.

	**Deprecated**
		 */
		setTemplateImage(option: boolean): void;
		/**
		 * A Buffer that contains a copy of the image's raw bitmap pixel data.
		 */
		toBitmap(options?: ToBitmapOptions): Buffer;
		/**
		 * The data URL of the image.
		 */
		toDataURL(options?: ToDataURLOptions): string;
		/**
		 * A Buffer that contains the image's `JPEG` encoded data.
		 */
		toJPEG(quality: number): Buffer;
		/**
		 * A Buffer that contains the image's `PNG` encoded data.
		 */
		toPNG(options?: ToPNGOptions): Buffer;
	}

	interface NativeTheme extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/native-theme

		/**
		 * Emitted when something in the underlying NativeTheme has changed. This normally
		 * means that either the value of `shouldUseDarkColors`,
		 * `shouldUseHighContrastColors` or `shouldUseInvertedColorScheme` has changed. You
		 * will have to check them to determine which one has changed.
		 */
		on(event: 'updated', listener: Function): this;
		once(event: 'updated', listener: Function): this;
		addListener(event: 'updated', listener: Function): this;
		removeListener(event: 'updated', listener: Function): this;
		/**
		 * A `Boolean` for if the OS / Chromium currently has a dark mode enabled or is
		 * being instructed to show a dark-style UI.  If you want to modify this value you
		 * should use `themeSource` below.
		 *
		 */
		readonly shouldUseDarkColors: boolean;
		/**
		 * A `Boolean` for if the OS / Chromium currently has high-contrast mode enabled or
		 * is being instructed to show a high-constrast UI.
		 *
		 * @platform darwin,win32
		 */
		readonly shouldUseHighContrastColors: boolean;
		/**
		 * A `Boolean` for if the OS / Chromium currently has an inverted color scheme or
		 * is being instructed to use an inverted color scheme.
		 *
		 * @platform darwin,win32
		 */
		readonly shouldUseInvertedColorScheme: boolean;
		/**
		 * A `String` property that can be `system`, `light` or `dark`.  It is used to
		 * override and supercede the value that Chromium has chosen to use internally.
		 *
		 * Setting this property to `system` will remove the override and everything will
		 * be reset to the OS default.  By default `themeSource` is `system`.
		 *
		 * Settings this property to `dark` will have the following effects:
		 *
		 * * `nativeTheme.shouldUseDarkColors` will be `true` when accessed
		 * * Any UI Electron renders on Linux and Windows including context menus,
		 * devtools, etc. will use the dark UI.
		 * * Any UI the OS renders on macOS including menus, window frames, etc. will use
		 * the dark UI.
		 * * The `prefers-color-scheme` CSS query will match `dark` mode.
		 * * The `updated` event will be emitted
		 *
		 * Settings this property to `light` will have the following effects:
		 *
		 * * `nativeTheme.shouldUseDarkColors` will be `false` when accessed
		 * * Any UI Electron renders on Linux and Windows including context menus,
		 * devtools, etc. will use the light UI.
		 * * Any UI the OS renders on macOS including menus, window frames, etc. will use
		 * the light UI.
		 * * The `prefers-color-scheme` CSS query will match `light` mode.
		 * * The `updated` event will be emitted
		 *
		 * The usage of this property should align with a classic "dark mode" state machine
		 * in your application where the user has three options.
		 *
		 * * `Follow OS` --> `themeSource = 'system'`
		 * * `Dark Mode` --> `themeSource = 'dark'`
		 * * `Light Mode` --> `themeSource = 'light'`
		 *
		 * Your application should then always use `shouldUseDarkColors` to determine what
		 * CSS to apply.
		 */
		themeSource: ('system' | 'light' | 'dark');
	}

	interface Net {

		// Docs: http://electronjs.org/docs/api/net

		/**
		 * Creates a `ClientRequest` instance using the provided `options` which are
		 * directly forwarded to the `ClientRequest` constructor. The `net.request` method
		 * would be used to issue both secure and insecure HTTP requests according to the
		 * specified protocol scheme in the `options` object.
		 */
		request(options: (ClientRequestConstructorOptions) | (string)): ClientRequest;
	}

	interface NetLog {

		// Docs: http://electronjs.org/docs/api/net-log

		/**
		 * resolves when the net log has begun recording.
		 *
	Starts recording network events to `path`.
		 */
		startLogging(path: string, options?: StartLoggingOptions): Promise<void>;
		/**
		 * resolves with a file path to which network logs were recorded.
		 *
		 * Stops recording network events. If not called, net logging will automatically
		 * end when app quits.
		 */
		stopLogging(): Promise<string>;
		/**
		 * A `Boolean` property that indicates whether network logs are recorded.
		 *
		 */
		readonly currentlyLogging: boolean;
		/**
		 * A `String` property that returns the path to the current log file.
		 *
		 * @deprecated
		 */
		readonly currentlyLoggingPath: string;
	}

	class Notification extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/notification

		on(event: 'action', listener: (event: Event,
			/**
			 * The index of the action that was activated.
			 */
			index: number) => void): this;
		once(event: 'action', listener: (event: Event,
			/**
			 * The index of the action that was activated.
			 */
			index: number) => void): this;
		addListener(event: 'action', listener: (event: Event,
			/**
			 * The index of the action that was activated.
			 */
			index: number) => void): this;
		removeListener(event: 'action', listener: (event: Event,
			/**
			 * The index of the action that was activated.
			 */
			index: number) => void): this;
		/**
		 * Emitted when the notification is clicked by the user.
		 */
		on(event: 'click', listener: (event: Event) => void): this;
		once(event: 'click', listener: (event: Event) => void): this;
		addListener(event: 'click', listener: (event: Event) => void): this;
		removeListener(event: 'click', listener: (event: Event) => void): this;
		/**
		 * Emitted when the notification is closed by manual intervention from the user.
		 *
		 * This event is not guaranteed to be emitted in all cases where the notification
		 * is closed.
		 */
		on(event: 'close', listener: (event: Event) => void): this;
		once(event: 'close', listener: (event: Event) => void): this;
		addListener(event: 'close', listener: (event: Event) => void): this;
		removeListener(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Emitted when the user clicks the "Reply" button on a notification with
		 * `hasReply: true`.
		 *
		 * @platform darwin
		 */
		on(event: 'reply', listener: (event: Event,
			/**
			 * The string the user entered into the inline reply field.
			 */
			reply: string) => void): this;
		once(event: 'reply', listener: (event: Event,
			/**
			 * The string the user entered into the inline reply field.
			 */
			reply: string) => void): this;
		addListener(event: 'reply', listener: (event: Event,
			/**
			 * The string the user entered into the inline reply field.
			 */
			reply: string) => void): this;
		removeListener(event: 'reply', listener: (event: Event,
			/**
			 * The string the user entered into the inline reply field.
			 */
			reply: string) => void): this;
		/**
		 * Emitted when the notification is shown to the user, note this could be fired
		 * multiple times as a notification can be shown multiple times through the
		 * `show()` method.
		 */
		on(event: 'show', listener: (event: Event) => void): this;
		once(event: 'show', listener: (event: Event) => void): this;
		addListener(event: 'show', listener: (event: Event) => void): this;
		removeListener(event: 'show', listener: (event: Event) => void): this;
		/**
		 * Notification
		 */
		constructor(options?: NotificationConstructorOptions);
		/**
		 * Whether or not desktop notifications are supported on the current system
		 */
		static isSupported(): boolean;
		/**
		 * Dismisses the notification.
		 */
		close(): void;
		/**
		 * Immediately shows the notification to the user, please note this means unlike
		 * the HTML5 Notification implementation, instantiating a `new Notification` does
		 * not immediately show it to the user, you need to call this method before the OS
		 * will display it.
		 *
		 * If the notification has been shown before, this method will dismiss the
		 * previously shown notification and create a new one with identical properties.
		 */
		show(): void;
		actions: NotificationAction[];
		body: string;
		closeButtonText: string;
		hasReply: boolean;
		replyPlaceholder: string;
		silent: boolean;
		sound: string;
		subtitle: string;
		title: string;
	}

	interface NotificationAction {

		// Docs: http://electronjs.org/docs/api/structures/notification-action

		/**
		 * The label for the given action.
		 */
		text?: string;
		/**
		 * The type of action, can be `button`.
		 */
		type: ('button');
	}

	interface Point {

		// Docs: http://electronjs.org/docs/api/structures/point

		x: number;
		y: number;
	}

	interface PowerMonitor extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/power-monitor

		/**
		 * Emitted when the system is about to lock the screen.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'lock-screen', listener: Function): this;
		once(event: 'lock-screen', listener: Function): this;
		addListener(event: 'lock-screen', listener: Function): this;
		removeListener(event: 'lock-screen', listener: Function): this;
		/**
		 * Emitted when the system changes to AC power.
		 *
		 * @platform win32
		 */
		on(event: 'on-ac', listener: Function): this;
		once(event: 'on-ac', listener: Function): this;
		addListener(event: 'on-ac', listener: Function): this;
		removeListener(event: 'on-ac', listener: Function): this;
		/**
		 * Emitted when system changes to battery power.
		 *
		 * @platform win32
		 */
		on(event: 'on-battery', listener: Function): this;
		once(event: 'on-battery', listener: Function): this;
		addListener(event: 'on-battery', listener: Function): this;
		removeListener(event: 'on-battery', listener: Function): this;
		/**
		 * Emitted when system is resuming.
		 */
		on(event: 'resume', listener: Function): this;
		once(event: 'resume', listener: Function): this;
		addListener(event: 'resume', listener: Function): this;
		removeListener(event: 'resume', listener: Function): this;
		/**
		 * Emitted when the system is about to reboot or shut down. If the event handler
		 * invokes `e.preventDefault()`, Electron will attempt to delay system shutdown in
		 * order for the app to exit cleanly. If `e.preventDefault()` is called, the app
		 * should exit as soon as possible by calling something like `app.quit()`.
		 *
		 * @platform linux,darwin
		 */
		on(event: 'shutdown', listener: Function): this;
		once(event: 'shutdown', listener: Function): this;
		addListener(event: 'shutdown', listener: Function): this;
		removeListener(event: 'shutdown', listener: Function): this;
		/**
		 * Emitted when the system is suspending.
		 */
		on(event: 'suspend', listener: Function): this;
		once(event: 'suspend', listener: Function): this;
		addListener(event: 'suspend', listener: Function): this;
		removeListener(event: 'suspend', listener: Function): this;
		/**
		 * Emitted as soon as the systems screen is unlocked.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'unlock-screen', listener: Function): this;
		once(event: 'unlock-screen', listener: Function): this;
		addListener(event: 'unlock-screen', listener: Function): this;
		removeListener(event: 'unlock-screen', listener: Function): this;
		/**
		 * The system's current state. Can be `active`, `idle`, `locked` or `unknown`.
		 *
		 * Calculate the system idle state. `idleThreshold` is the amount of time (in
		 * seconds) before considered idle.  `locked` is available on supported systems
		 * only.
		 */
		getSystemIdleState(idleThreshold: number): ('active' | 'idle' | 'locked' | 'unknown');
		/**
		 * Idle time in seconds

	Calculate system idle time in seconds.
		 */
		getSystemIdleTime(): number;
	}

	interface PowerSaveBlocker {

		// Docs: http://electronjs.org/docs/api/power-save-blocker

		/**
		 * Whether the corresponding `powerSaveBlocker` has started.
		 */
		isStarted(id: number): boolean;
		/**
		 * The blocker ID that is assigned to this power blocker.
		 *
		 * Starts preventing the system from entering lower-power mode. Returns an integer
		 * identifying the power save blocker.
		 *
		 * **Note:** `prevent-display-sleep` has higher precedence over
		 * `prevent-app-suspension`. Only the highest precedence type takes effect. In
		 * other words, `prevent-display-sleep` always takes precedence over
		 * `prevent-app-suspension`.
		 *
		 * For example, an API calling A requests for `prevent-app-suspension`, and another
		 * calling B requests for `prevent-display-sleep`. `prevent-display-sleep` will be
		 * used until B stops its request. After that, `prevent-app-suspension` is used.
		 */
		start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
		/**
		 * Stops the specified power save blocker.
		 */
		stop(id: number): void;
	}

	interface PrinterInfo {

		// Docs: http://electronjs.org/docs/api/structures/printer-info

		description: string;
		isDefault: boolean;
		name: string;
		status: number;
	}

	interface ProcessMemoryInfo {

		// Docs: http://electronjs.org/docs/api/structures/process-memory-info

		/**
		 * The amount of memory not shared by other processes, such as JS heap or HTML
		 * content in Kilobytes.
		 */
		private: number;
		/**
		 * The amount of memory currently pinned to actual physical RAM in Kilobytes.
		 *
		 * @platform linux,win32
		 */
		residentSet: number;
		/**
		 * The amount of memory shared between processes, typically memory consumed by the
		 * Electron code itself in Kilobytes.
		 */
		shared: number;
	}

	interface ProcessMetric {

		// Docs: http://electronjs.org/docs/api/structures/process-metric

		/**
		 * CPU usage of the process.
		 */
		cpu: CPUUsage;
		/**
		 * Creation time for this process. The time is represented as number of
		 * milliseconds since epoch. Since the `pid` can be reused after a process dies, it
		 * is useful to use both the `pid` and the `creationTime` to uniquely identify a
		 * process.
		 */
		creationTime: number;
		/**
		 * One of the following values:
		 *
		 * @platform win32
		 */
		integrityLevel?: ('untrusted' | 'low' | 'medium' | 'high' | 'unknown');
		/**
		 * Memory information for the process.
		 */
		memory: MemoryInfo;
		/**
		 * Process id of the process.
		 */
		pid: number;
		/**
		 * Whether the process is sandboxed on OS level.
		 *
		 * @platform darwin,win32
		 */
		sandboxed?: boolean;
		/**
		 * Process type. One of the following values:
		 */
		type: ('Browser' | 'Tab' | 'Utility' | 'Zygote' | 'Sandbox helper' | 'GPU' | 'Pepper Plugin' | 'Pepper Plugin Broker' | 'Unknown');
	}

	interface Product {

		// Docs: http://electronjs.org/docs/api/structures/product

		/**
		 * The total size of the content, in bytes.
		 */
		contentLengths: number[];
		/**
		 * A string that identifies the version of the content.
		 */
		contentVersion: string;
		/**
		 * The locale formatted price of the product.
		 */
		formattedPrice: string;
		/**
		 * A Boolean value that indicates whether the App Store has downloadable content
		 * for this product. `true` if at least one file has been associated with the
		 * product.
		 */
		isDownloadable: boolean;
		/**
		 * A description of the product.
		 */
		localizedDescription: string;
		/**
		 * The name of the product.
		 */
		localizedTitle: string;
		/**
		 * The cost of the product in the local currency.
		 */
		price: number;
		/**
		 * The string that identifies the product to the Apple App Store.
		 */
		productIdentifier: string;
	}

	interface Protocol {

		// Docs: http://electronjs.org/docs/api/protocol

		/**
		 * Intercepts `scheme` protocol and uses `handler` as the protocol's new handler
		 * which sends a `Buffer` as a response.
		 */
		interceptBufferProtocol(scheme: string, handler: (request: HandlerRequest, callback: (buffer?: Buffer) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts `scheme` protocol and uses `handler` as the protocol's new handler
		 * which sends a file as a response.
		 */
		interceptFileProtocol(scheme: string, handler: (request: HandlerRequest, callback: (filePath: string) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts `scheme` protocol and uses `handler` as the protocol's new handler
		 * which sends a new HTTP request as a response.
		 */
		interceptHttpProtocol(scheme: string, handler: (request: HandlerRequest, callback: (redirectRequest: RedirectRequest) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Same as `protocol.registerStreamProtocol`, except that it replaces an existing
		 * protocol handler.
		 */
		interceptStreamProtocol(scheme: string, handler: (request: HandlerRequest, callback: (stream?: (NodeJS.ReadableStream) | (StreamProtocolResponse)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts `scheme` protocol and uses `handler` as the protocol's new handler
		 * which sends a `String` as a response.
		 */
		interceptStringProtocol(scheme: string, handler: (request: HandlerRequest, callback: (data?: (string) | (StringProtocolResponse)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * fulfilled with a boolean that indicates whether there is already a handler for
		 * `scheme`.
		 */
		isProtocolHandled(scheme: string): Promise<boolean>;
		/**
		 * Registers a protocol of `scheme` that will send a `Buffer` as a response.
		 *
		 * The usage is the same with `registerFileProtocol`, except that the `callback`
		 * should be called with either a `Buffer` object or an object that has the `data`,
		 * `mimeType`, and `charset` properties.

	Example:
		 */
		registerBufferProtocol(scheme: string, handler: (request: HandlerRequest, callback: (buffer?: (Buffer) | (MimeTypedBuffer)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of `scheme` that will send the file as a response. The
		 * `handler` will be called with `handler(request, callback)` when a `request` is
		 * going to be created with `scheme`. `completion` will be called with
		 * `completion(null)` when `scheme` is successfully registered or
		 * `completion(error)` when failed.
		 *
		 * To handle the `request`, the `callback` should be called with either the file's
		 * path or an object that has a `path` property, e.g. `callback(filePath)` or
		 * `callback({ path: filePath })`. The object may also have a `headers` property
		 * which gives a map of headers to values for the response headers, e.g.
		 * `callback({ path: filePath, headers: {"Content-Security-Policy": "default-src
		 * 'none'"]})`.
		 *
		 * When `callback` is called with nothing, a number, or an object that has an
		 * `error` property, the `request` will fail with the `error` number you specified.
		 * For the available error numbers you can use, please see the net error list.
		 *
		 * By default the `scheme` is treated like `http:`, which is parsed differently
		 * than protocols that follow the "generic URI syntax" like `file:`.
		 */
		registerFileProtocol(scheme: string, handler: (request: HandlerRequest, callback: (filePath?: (string) | (FilePathWithHeaders)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of `scheme` that will send an HTTP request as a response.
		 *
		 * The usage is the same with `registerFileProtocol`, except that the `callback`
		 * should be called with a `redirectRequest` object that has the `url`, `method`,
		 * `referrer`, `uploadData` and `session` properties.
		 *
		 * By default the HTTP request will reuse the current session. If you want the
		 * request to have a different session you should set `session` to `null`.
		 *
	For POST requests the `uploadData` object must be provided.
		 */
		registerHttpProtocol(scheme: string, handler: (request: HandlerRequest, callback: (redirectRequest: CallbackRedirectRequest) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * **Note:** This method can only be used before the `ready` event of the `app`
		 * module gets emitted and can be called only once.
		 *
		 * Registers the `scheme` as standard, secure, bypasses content security policy for
		 * resources, allows registering ServiceWorker and supports fetch API.
		 *
		 * Specify a privilege with the value of `true` to enable the capability. An
		 * example of registering a privileged scheme, with bypassing Content Security
		 * Policy:
		 *
		 * A standard scheme adheres to what RFC 3986 calls generic URI syntax. For example
		 * `http` and `https` are standard schemes, while `file` is not.
		 *
		 * Registering a scheme as standard, will allow relative and absolute resources to
		 * be resolved correctly when served. Otherwise the scheme will behave like the
		 * `file` protocol, but without the ability to resolve relative URLs.
		 *
		 * For example when you load following page with custom protocol without
		 * registering it as standard scheme, the image will not be loaded because
		 * non-standard schemes can not recognize relative URLs:
		 *
		 * Registering a scheme as standard will allow access to files through the
		 * FileSystem API. Otherwise the renderer will throw a security error for the
		 * scheme.
		 *
		 * By default web storage apis (localStorage, sessionStorage, webSQL, indexedDB,
		 * cookies) are disabled for non standard schemes. So in general if you want to
		 * register a custom protocol to replace the `http` protocol, you have to register
		 * it as a standard scheme.
		 *
		 * `protocol.registerSchemesAsPrivileged` can be used to replicate the
		 * functionality of the previous `protocol.registerStandardSchemes`,
		 * `webFrame.registerURLSchemeAs*` and `protocol.registerServiceWorkerSchemes`
		 * functions that existed prior to Electron 5.0.0, for example:
		 *
	**before (<= v4.x)**

	**after (>= v5.x)**
		 */
		registerSchemesAsPrivileged(customSchemes: CustomScheme[]): void;
		/**
		 * Registers a protocol of `scheme` that will send a `Readable` as a response.
		 *
		 * The usage is similar to the other `register{Any}Protocol`, except that the
		 * `callback` should be called with either a `Readable` object or an object that
		 * has the `data`, `statusCode`, and `headers` properties.
		 *
		 * Example:
		 *
		 * It is possible to pass any object that implements the readable stream API (emits
		 * `data`/`end`/`error` events). For example, here's how a file could be returned:
		 */
		registerStreamProtocol(scheme: string, handler: (request: HandlerRequest, callback: (stream?: (NodeJS.ReadableStream) | (StreamProtocolResponse)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of `scheme` that will send a `String` as a response.
		 *
		 * The usage is the same with `registerFileProtocol`, except that the `callback`
		 * should be called with either a `String` or an object that has the `data`,
		 * `mimeType`, and `charset` properties.
		 */
		registerStringProtocol(scheme: string, handler: (request: HandlerRequest, callback: (data?: (string) | (StringProtocolResponse)) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Remove the interceptor installed for `scheme` and restore its original handler.
		 */
		uninterceptProtocol(scheme: string, completion?: (error: Error) => void): void;
		/**
		 * Unregisters the custom protocol of `scheme`.
		 */
		unregisterProtocol(scheme: string, completion?: (error: Error) => void): void;
	}

	interface ProtocolRequest {

		// Docs: http://electronjs.org/docs/api/structures/protocol-request

		method: string;
		referrer: string;
		uploadData?: UploadData[];
		url: string;
	}

	interface ProtocolResponse {

		// Docs: http://electronjs.org/docs/api/structures/protocol-response

		/**
		 * The charset of response body, default is `"utf-8"`.
		 */
		charset?: string;
		/**
		 * The response body. When returning stream as response, this is a Node.js readable
		 * stream representing the response body. When returning `Buffer` as response, this
		 * is a `Buffer`. When returning `String` as response, this is a `String`. This is
		 * ignored for other types of responses.
		 */
		data?: (Buffer) | (string) | (NodeJS.ReadableStream);
		/**
		 * When assigned, the `request` will fail with the `error` number . For the
		 * available error numbers you can use, please see the net error list.
		 */
		error?: number;
		/**
		 * An object containing the response headers. The keys must be String, and values
		 * must be either String or Array of String.
		 */
		headers?: Record<string, (string) | (string[])>;
		/**
		 * The HTTP `method`. This is only used for file and URL responses.
		 */
		method?: string;
		/**
		 * The MIME type of response body, default is `"text/html"`. Setting `mimeType`
		 * would implicitly set the `content-type` header in response, but if
		 * `content-type` is already set in `headers`, the `mimeType` would be ignored.
		 */
		mimeType?: string;
		/**
		 * Path to the file which would be sent as response body. This is only used for
		 * file responses.
		 */
		path?: string;
		/**
		 * The `referrer` URL. This is only used for file and URL responses.
		 */
		referrer?: string;
		/**
		 * The session used for requesting URL, by default the HTTP request will reuse the
		 * current session. Setting `session` to `null` would use a random independent
		 * session. This is only used for URL responses.
		 */
		session?: Session;
		/**
		 * The HTTP response code, default is 200.
		 */
		statusCode?: number;
		/**
		 * The data used as upload data. This is only used for URL responses when `method`
		 * is `"POST"`.
		 */
		uploadData?: ProtocolResponseUploadData;
		/**
		 * Download the `url` and pipe the result as response body. This is only used for
		 * URL responses.
		 */
		url?: string;
	}

	interface ProtocolResponseUploadData {

		// Docs: http://electronjs.org/docs/api/structures/protocol-response-upload-data

		/**
		 * MIME type of the content.
		 */
		contentType: string;
		/**
		 * Content to be sent.
		 */
		data: string;
	}

	interface Rectangle {

		// Docs: http://electronjs.org/docs/api/structures/rectangle

		/**
		 * The height of the rectangle (must be an integer).
		 */
		height: number;
		/**
		 * The width of the rectangle (must be an integer).
		 */
		width: number;
		/**
		 * The x coordinate of the origin of the rectangle (must be an integer).
		 */
		x: number;
		/**
		 * The y coordinate of the origin of the rectangle (must be an integer).
		 */
		y: number;
	}

	interface Referrer {

		// Docs: http://electronjs.org/docs/api/structures/referrer

		/**
		 * Can be `default`, `unsafe-url`, `no-referrer-when-downgrade`, `no-referrer`,
		 * `origin`, `strict-origin-when-cross-origin`, `same-origin` or `strict-origin`.
		 * See the Referrer-Policy spec for more details on the meaning of these values.
		 */
		policy: ('default' | 'unsafe-url' | 'no-referrer-when-downgrade' | 'no-referrer' | 'origin' | 'strict-origin-when-cross-origin' | 'same-origin' | 'strict-origin');
		/**
		 * HTTP Referrer URL.
		 */
		url: string;
	}

	interface Remote extends MainInterface {

		// Docs: http://electronjs.org/docs/api/remote

		/**
		 * The web contents of this web page.
		 */
		getCurrentWebContents(): WebContents;
		/**
		 * The window to which this web page belongs.
		 *
		 * **Note:** Do not use `removeAllListeners` on `BrowserWindow`. Use of this can
		 * remove all `blur` listeners, disable click events on touch bar buttons, and
		 * other unintended consequences.
		 */
		getCurrentWindow(): BrowserWindow;
		/**
		 * The global variable of `name` (e.g. `global[name]`) in the main process.
		 */
		getGlobal(name: string): any;
		/**
		 * The object returned by `require(module)` in the main process. Modules specified
		 * by their relative path will resolve relative to the entrypoint of the main
		 * process.

	e.g.
		 */
		require(module: string): any;
		/**
		 * A `NodeJS.Process` object.  The `process` object in the main process. This is
		 * the same as `remote.getGlobal('process')` but is cached.
		 *
		 */
		readonly process: NodeJS.Process;
	}

	interface RemoveClientCertificate {

		// Docs: http://electronjs.org/docs/api/structures/remove-client-certificate

		/**
		 * Origin of the server whose associated client certificate must be removed from
		 * the cache.
		 */
		origin: string;
		/**
		 * `clientCertificate`.
		 */
		type: string;
	}

	interface RemovePassword {

		// Docs: http://electronjs.org/docs/api/structures/remove-password

		/**
		 * When provided, the authentication info related to the origin will only be
		 * removed otherwise the entire cache will be cleared.
		 */
		origin?: string;
		/**
		 * Credentials of the authentication. Must be provided if removing by `origin`.
		 */
		password?: string;
		/**
		 * Realm of the authentication. Must be provided if removing by `origin`.
		 */
		realm?: string;
		/**
		 * Scheme of the authentication. Can be `basic`, `digest`, `ntlm`, `negotiate`.
		 * Must be provided if removing by `origin`.
		 */
		scheme?: ('basic' | 'digest' | 'ntlm' | 'negotiate');
		/**
		 * `password`.
		 */
		type: string;
		/**
		 * Credentials of the authentication. Must be provided if removing by `origin`.
		 */
		username?: string;
	}

	interface Screen extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/screen

		/**
		 * Emitted when `newDisplay` has been added.
		 */
		on(event: 'display-added', listener: (event: Event,
			newDisplay: Display) => void): this;
		once(event: 'display-added', listener: (event: Event,
			newDisplay: Display) => void): this;
		addListener(event: 'display-added', listener: (event: Event,
			newDisplay: Display) => void): this;
		removeListener(event: 'display-added', listener: (event: Event,
			newDisplay: Display) => void): this;
		/**
		 * Emitted when one or more metrics change in a `display`. The `changedMetrics` is
		 * an array of strings that describe the changes. Possible changes are `bounds`,
		 * `workArea`, `scaleFactor` and `rotation`.
		 */
		on(event: 'display-metrics-changed', listener: (event: Event,
			display: Display,
			changedMetrics: string[]) => void): this;
		once(event: 'display-metrics-changed', listener: (event: Event,
			display: Display,
			changedMetrics: string[]) => void): this;
		addListener(event: 'display-metrics-changed', listener: (event: Event,
			display: Display,
			changedMetrics: string[]) => void): this;
		removeListener(event: 'display-metrics-changed', listener: (event: Event,
			display: Display,
			changedMetrics: string[]) => void): this;
		/**
		 * Emitted when `oldDisplay` has been removed.
		 */
		on(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		once(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		addListener(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		removeListener(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		/**
		 * Converts a screen DIP point to a screen physical point. The DPI scale is
		 * performed relative to the display containing the DIP point.
		 *
		 * @platform win32
		 */
		dipToScreenPoint(point: Point): Point;
		/**
		 * Converts a screen DIP rect to a screen physical rect. The DPI scale is performed
		 * relative to the display nearest to `window`. If `window` is null, scaling will
		 * be performed to the display nearest to `rect`.
		 *
		 * @platform win32
		 */
		dipToScreenRect(window: (BrowserWindow) | (null), rect: Rectangle): Rectangle;
		/**
		 * An array of displays that are currently available.
		 */
		getAllDisplays(): Display[];
		/**
		 * The current absolute position of the mouse pointer.
		 */
		getCursorScreenPoint(): Point;
		/**
		 * The display that most closely intersects the provided bounds.
		 */
		getDisplayMatching(rect: Rectangle): Display;
		/**
		 * The display nearest the specified point.
		 */
		getDisplayNearestPoint(point: Point): Display;
		/**
		 * The primary display.
		 */
		getPrimaryDisplay(): Display;
		/**
		 * Converts a screen physical point to a screen DIP point. The DPI scale is
		 * performed relative to the display containing the physical point.
		 *
		 * @platform win32
		 */
		screenToDipPoint(point: Point): Point;
		/**
		 * Converts a screen physical rect to a screen DIP rect. The DPI scale is performed
		 * relative to the display nearest to `window`. If `window` is null, scaling will
		 * be performed to the display nearest to `rect`.
		 *
		 * @platform win32
		 */
		screenToDipRect(window: (BrowserWindow) | (null), rect: Rectangle): Rectangle;
	}

	interface ScrubberItem {

		// Docs: http://electronjs.org/docs/api/structures/scrubber-item

		/**
		 * The image to appear in this item.
		 */
		icon?: NativeImage;
		/**
		 * The text to appear in this item.
		 */
		label?: string;
	}

	interface SegmentedControlSegment {

		// Docs: http://electronjs.org/docs/api/structures/segmented-control-segment

		/**
		 * Whether this segment is selectable. Default: true.
		 */
		enabled?: boolean;
		/**
		 * The image to appear in this segment.
		 */
		icon?: NativeImage;
		/**
		 * The text to appear in this segment.
		 */
		label?: string;
	}

	class Session extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/session

		/**
		 * A session instance from `partition` string. When there is an existing `Session`
		 * with the same `partition`, it will be returned; otherwise a new `Session`
		 * instance will be created with `options`.
		 *
		 * If `partition` starts with `persist:`, the page will use a persistent session
		 * available to all pages in the app with the same `partition`. if there is no
		 * `persist:` prefix, the page will use an in-memory session. If the `partition` is
		 * empty then default session of the app will be returned.
		 *
		 * To create a `Session` with `options`, you have to ensure the `Session` with the
		 * `partition` has never been used before. There is no way to change the `options`
		 * of an existing `Session` object.
		 */
		static fromPartition(partition: string, options?: FromPartitionOptions): Session;
		/**
		 * A `Session` object, the default session object of the app.
		 */
		static defaultSession: Session;
		/**
		 * Emitted when a render process requests preconnection to a URL, generally due to
		 * a resource hint.
		 *
		 * @experimental
		 */
		on(event: 'preconnect', listener: (event: Event,
			/**
			 * The URL being requested for preconnection by the renderer.
			 */
			preconnectUrl: string,
			/**
			 * True if the renderer is requesting that the connection include credentials (see
			 * the spec for more details.)
			 */
			allowCredentials: boolean) => void): this;
		once(event: 'preconnect', listener: (event: Event,
			/**
			 * The URL being requested for preconnection by the renderer.
			 */
			preconnectUrl: string,
			/**
			 * True if the renderer is requesting that the connection include credentials (see
			 * the spec for more details.)
			 */
			allowCredentials: boolean) => void): this;
		addListener(event: 'preconnect', listener: (event: Event,
			/**
			 * The URL being requested for preconnection by the renderer.
			 */
			preconnectUrl: string,
			/**
			 * True if the renderer is requesting that the connection include credentials (see
			 * the spec for more details.)
			 */
			allowCredentials: boolean) => void): this;
		removeListener(event: 'preconnect', listener: (event: Event,
			/**
			 * The URL being requested for preconnection by the renderer.
			 */
			preconnectUrl: string,
			/**
			 * True if the renderer is requesting that the connection include credentials (see
			 * the spec for more details.)
			 */
			allowCredentials: boolean) => void): this;
		/**
		 * Emitted when Electron is about to download `item` in `webContents`.
		 *
		 * Calling `event.preventDefault()` will cancel the download and `item` will not be
		 * available from next tick of the process.
		 */
		on(event: 'will-download', listener: (event: Event,
			item: DownloadItem,
			webContents: WebContents) => void): this;
		once(event: 'will-download', listener: (event: Event,
			item: DownloadItem,
			webContents: WebContents) => void): this;
		addListener(event: 'will-download', listener: (event: Event,
			item: DownloadItem,
			webContents: WebContents) => void): this;
		removeListener(event: 'will-download', listener: (event: Event,
			item: DownloadItem,
			webContents: WebContents) => void): this;
		/**
		 * Dynamically sets whether to always send credentials for HTTP NTLM or Negotiate
		 * authentication.
		 */
		allowNTLMCredentialsForDomains(domains: string): void;
		/**
		 * resolves when the session’s HTTP authentication cache has been cleared.
		 */
		clearAuthCache(options: (RemovePassword) | (RemoveClientCertificate)): Promise<void>;
		/**
		 * resolves when the cache clear operation is complete.
		 *
	Clears the session’s HTTP cache.
		 */
		clearCache(): Promise<void>;
		/**
		 * Resolves when the operation is complete.

	Clears the host resolver cache.
		 */
		clearHostResolverCache(): Promise<void>;
		/**
		 * resolves when the storage data has been cleared.
		 */
		clearStorageData(options?: ClearStorageDataOptions): Promise<void>;
		/**
		 * Allows resuming `cancelled` or `interrupted` downloads from previous `Session`.
		 * The API will generate a DownloadItem that can be accessed with the will-download
		 * event. The DownloadItem will not have any `WebContents` associated with it and
		 * the initial state will be `interrupted`. The download will start only when the
		 * `resume` API is called on the DownloadItem.
		 */
		createInterruptedDownload(options: CreateInterruptedDownloadOptions): void;
		/**
		 * Disables any network emulation already active for the `session`. Resets to the
		 * original network configuration.
		 */
		disableNetworkEmulation(): void;
		/**
		 * Emulates network with the given configuration for the `session`.
		 */
		enableNetworkEmulation(options: EnableNetworkEmulationOptions): void;
		/**
		 * Writes any unwritten DOMStorage data to disk.
		 */
		flushStorageData(): void;
		/**
		 * resolves with blob data.
		 */
		getBlobData(identifier: string): Promise<Buffer>;
		/**
		 * the session's current cache size, in bytes.
		 */
		getCacheSize(): Promise<number>;
		/**
		 * an array of paths to preload scripts that have been registered.
		 */
		getPreloads(): string[];
		/**
		 * The user agent for this session.
		 */
		getUserAgent(): string;
		/**
		 * Preconnects the given number of sockets to an origin.
		 *
		 * @experimental
		 */
		preconnect(options: PreconnectOptions): void;
		/**
		 * Resolves with the proxy information for `url`.
		 */
		resolveProxy(url: string): Promise<string>;
		/**
		 * Sets the certificate verify proc for `session`, the `proc` will be called with
		 * `proc(request, callback)` whenever a server certificate verification is
		 * requested. Calling `callback(0)` accepts the certificate, calling `callback(-2)`
		 * rejects it.
		 *
		 * Calling `setCertificateVerifyProc(null)` will revert back to default certificate
		 * verify proc.
		 */
		setCertificateVerifyProc(proc: (request: ProcRequest, callback: (verificationResult: number) => void) => void): void;
		/**
		 * Sets download saving directory. By default, the download directory will be the
		 * `Downloads` under the respective app folder.
		 */
		setDownloadPath(path: string): void;
		/**
		 * Sets the handler which can be used to respond to permission checks for the
		 * `session`. Returning `true` will allow the permission and `false` will reject
		 * it. To clear the handler, call `setPermissionCheckHandler(null)`.
		 */
		setPermissionCheckHandler(handler: ((webContents: WebContents, permission: string, requestingOrigin: string, details: PermissionCheckHandlerHandlerDetails) => boolean) | (null)): void;
		/**
		 * Sets the handler which can be used to respond to permission requests for the
		 * `session`. Calling `callback(true)` will allow the permission and
		 * `callback(false)` will reject it. To clear the handler, call
		 * `setPermissionRequestHandler(null)`.
		 */
		setPermissionRequestHandler(handler: ((webContents: WebContents, permission: string, callback: (permissionGranted: boolean) => void, details: PermissionRequestHandlerHandlerDetails) => void) | (null)): void;
		/**
		 * Adds scripts that will be executed on ALL web contents that are associated with
		 * this session just before normal `preload` scripts run.
		 */
		setPreloads(preloads: string[]): void;
		/**
		 * Resolves when the proxy setting process is complete.
		 *
		 * Sets the proxy settings.
		 *
		 * When `pacScript` and `proxyRules` are provided together, the `proxyRules` option
		 * is ignored and `pacScript` configuration is applied.
		 *
		 * The `proxyRules` has to follow the rules below:
		 *
		 * For example:
		 *
		 * * `http=foopy:80;ftp=foopy2` - Use HTTP proxy `foopy:80` for `http://` URLs, and
		 * HTTP proxy `foopy2:80` for `ftp://` URLs.
		 * * `foopy:80` - Use HTTP proxy `foopy:80` for all URLs.
		 * * `foopy:80,bar,direct://` - Use HTTP proxy `foopy:80` for all URLs, failing
		 * over to `bar` if `foopy:80` is unavailable, and after that using no proxy.
		 * * `socks4://foopy` - Use SOCKS v4 proxy `foopy:1080` for all URLs.
		 * * `http=foopy,socks5://bar.com` - Use HTTP proxy `foopy` for http URLs, and fail
		 * over to the SOCKS5 proxy `bar.com` if `foopy` is unavailable.
		 * * `http=foopy,direct://` - Use HTTP proxy `foopy` for http URLs, and use no
		 * proxy if `foopy` is unavailable.
		 * * `http=foopy;socks=foopy2` - Use HTTP proxy `foopy` for http URLs, and use
		 * `socks4://foopy2` for all other URLs.
		 *
		 * The `proxyBypassRules` is a comma separated list of rules described below:
		 *
		 * * `[ URL_SCHEME "://" ] HOSTNAME_PATTERN [ ":" <port> ]`
		 *
		 * Match all hostnames that match the pattern HOSTNAME_PATTERN.
		 *
		 * Examples: "foobar.com", "*foobar.com", "*.foobar.com", "*foobar.com:99",
		 * "https://x.*.y.com:99"
		 * * `"." HOSTNAME_SUFFIX_PATTERN [ ":" PORT ]`
		 *
		 * Match a particular domain suffix.
		 *
		 * Examples: ".google.com", ".com", "http://.google.com"
		 * * `[ SCHEME "://" ] IP_LITERAL [ ":" PORT ]`
		 *
		 * Match URLs which are IP address literals.
		 *
		 * Examples: "127.0.1", "[0:0::1]", "[::1]", "http://[::1]:99"
		 * * `IP_LITERAL "/" PREFIX_LENGTH_IN_BITS`
		 *
		 * Match any URL that is to an IP literal that falls between the given range. IP
		 * range is specified using CIDR notation.
		 *
		 * Examples: "192.168.1.1/16", "fefe:13::abc/33".
		 * * `<local>`
		 *
		 * Match local addresses. The meaning of `<local>` is whether the host matches one
		 * of: "127.0.0.1", "::1", "localhost".
		 */
		setProxy(config: Config): Promise<void>;
		/**
		 * Overrides the `userAgent` and `acceptLanguages` for this session.
		 *
		 * The `acceptLanguages` must a comma separated ordered list of language codes, for
		 * example `"en-US,fr,de,ko,zh-CN,ja"`.
		 *
		 * This doesn't affect existing `WebContents`, and each `WebContents` can use
		 * `webContents.setUserAgent` to override the session-wide user agent.
		 */
		setUserAgent(userAgent: string, acceptLanguages?: string): void;
		readonly cookies: Cookies;
		readonly netLog: NetLog;
		readonly protocol: Protocol;
		readonly webRequest: WebRequest;
	}

	interface Shell {

		// Docs: http://electronjs.org/docs/api/shell

		/**
		 * Play the beep sound.
		 */
		beep(): void;
		/**
		 * Whether the item was successfully moved to the trash.
		 *
	Move the given file to trash and returns a boolean status for the operation.
		 */
		moveItemToTrash(fullPath: string): boolean;
		/**
		 * Open the given external protocol URL in the desktop's default manner. (For
		 * example, mailto: URLs in the user's default mail agent).
		 */
		openExternal(url: string, options?: OpenExternalOptions): Promise<void>;
		/**
		 * Whether the item was successfully opened.
		 *
	Open the given file in the desktop's default manner.
		 */
		openItem(fullPath: string): boolean;
		/**
		 * Resolves the shortcut link at `shortcutPath`.
		 *
	An exception will be thrown when any error happens.
		 *
		 * @platform win32
		 */
		readShortcutLink(shortcutPath: string): ShortcutDetails;
		/**
		 * Show the given file in a file manager. If possible, select the file.
		 */
		showItemInFolder(fullPath: string): void;
		/**
		 * Whether the shortcut was created successfully.
		 *
	Creates or updates a shortcut link at `shortcutPath`.
		 *
		 * @platform win32
		 */
		writeShortcutLink(shortcutPath: string, operation: 'create' | 'update' | 'replace', options: ShortcutDetails): boolean;
		/**
		 * Whether the shortcut was created successfully.
		 *
	Creates or updates a shortcut link at `shortcutPath`.
		 *
		 * @platform win32
		 */
		writeShortcutLink(shortcutPath: string, options: ShortcutDetails): boolean;
	}

	interface ShortcutDetails {

		// Docs: http://electronjs.org/docs/api/structures/shortcut-details

		/**
		 * The Application User Model ID. Default is empty.
		 */
		appUserModelId?: string;
		/**
		 * The arguments to be applied to `target` when launching from this shortcut.
		 * Default is empty.
		 */
		args?: string;
		/**
		 * The working directory. Default is empty.
		 */
		cwd?: string;
		/**
		 * The description of the shortcut. Default is empty.
		 */
		description?: string;
		/**
		 * The path to the icon, can be a DLL or EXE. `icon` and `iconIndex` have to be set
		 * together. Default is empty, which uses the target's icon.
		 */
		icon?: string;
		/**
		 * The resource ID of icon when `icon` is a DLL or EXE. Default is 0.
		 */
		iconIndex?: number;
		/**
		 * The target to launch from this shortcut.
		 */
		target: string;
	}

	interface Size {

		// Docs: http://electronjs.org/docs/api/structures/size

		height: number;
		width: number;
	}

	interface StreamProtocolResponse {

		// Docs: http://electronjs.org/docs/api/structures/stream-protocol-response

		/**
		 * A Node.js readable stream representing the response body.
		 */
		data: (NodeJS.ReadableStream) | (null);
		/**
		 * An object containing the response headers.
		 */
		headers?: Record<string, (string) | (string[])>;
		/**
		 * The HTTP response code.
		 */
		statusCode?: number;
	}

	interface StringProtocolResponse {

		// Docs: http://electronjs.org/docs/api/structures/string-protocol-response

		/**
		 * Charset of the response.
		 */
		charset?: string;
		/**
		 * A string representing the response body.
		 */
		data: (string) | (null);
		/**
		 * MIME type of the response.
		 */
		mimeType?: string;
	}

	interface SystemPreferences extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/system-preferences

		on(event: 'accent-color-changed', listener: (event: Event,
			/**
			 * The new RGBA color the user assigned to be their system accent color.
			 */
			newColor: string) => void): this;
		once(event: 'accent-color-changed', listener: (event: Event,
			/**
			 * The new RGBA color the user assigned to be their system accent color.
			 */
			newColor: string) => void): this;
		addListener(event: 'accent-color-changed', listener: (event: Event,
			/**
			 * The new RGBA color the user assigned to be their system accent color.
			 */
			newColor: string) => void): this;
		removeListener(event: 'accent-color-changed', listener: (event: Event,
			/**
			 * The new RGBA color the user assigned to be their system accent color.
			 */
			newColor: string) => void): this;
		on(event: 'color-changed', listener: (event: Event) => void): this;
		once(event: 'color-changed', listener: (event: Event) => void): this;
		addListener(event: 'color-changed', listener: (event: Event) => void): this;
		removeListener(event: 'color-changed', listener: (event: Event) => void): this;
		/**
		 * **Deprecated:** Should use the new `updated` event on the `nativeTheme` module.
		 *
		 * @deprecated
		 * @platform win32
		 */
		on(event: 'high-contrast-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if a high contrast theme is being used, `false` otherwise.
			 */
			highContrastColorScheme: boolean) => void): this;
		once(event: 'high-contrast-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if a high contrast theme is being used, `false` otherwise.
			 */
			highContrastColorScheme: boolean) => void): this;
		addListener(event: 'high-contrast-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if a high contrast theme is being used, `false` otherwise.
			 */
			highContrastColorScheme: boolean) => void): this;
		removeListener(event: 'high-contrast-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if a high contrast theme is being used, `false` otherwise.
			 */
			highContrastColorScheme: boolean) => void): this;
		/**
		 * **Deprecated:** Should use the new `updated` event on the `nativeTheme` module.
		 *
		 * @deprecated
		 * @platform win32
		 */
		on(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme (a high contrast color scheme with light text
			 * and dark backgrounds) is being used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		once(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme (a high contrast color scheme with light text
			 * and dark backgrounds) is being used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		addListener(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme (a high contrast color scheme with light text
			 * and dark backgrounds) is being used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		removeListener(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme (a high contrast color scheme with light text
			 * and dark backgrounds) is being used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		/**
		 * A promise that resolves with `true` if consent was granted and `false` if it was
		 * denied. If an invalid `mediaType` is passed, the promise will be rejected. If an
		 * access request was denied and later is changed through the System Preferences
		 * pane, a restart of the app will be required for the new permissions to take
		 * effect. If access has already been requested and denied, it _must_ be changed
		 * through the preference pane; an alert will not pop up and the promise will
		 * resolve with the existing access status.
		 *
		 * **Important:** In order to properly leverage this API, you must set the
		 * `NSMicrophoneUsageDescription` and `NSCameraUsageDescription` strings in your
		 * app's `Info.plist` file. The values for these keys will be used to populate the
		 * permission dialogs so that the user will be properly informed as to the purpose
		 * of the permission request. See Electron Application Distribution for more
		 * information about how to set these in the context of Electron.
		 *
		 * This user consent was not required until macOS 10.14 Mojave, so this method will
		 * always return `true` if your system is running 10.13 High Sierra or lower.
		 *
		 * @platform darwin
		 */
		askForMediaAccess(mediaType: 'microphone' | 'camera'): Promise<boolean>;
		/**
		 * whether or not this device has the ability to use Touch ID.
		 *
		 * **NOTE:** This API will return `false` on macOS systems older than Sierra
		 * 10.12.2.

	**Deprecated**
		 *
		 * @platform darwin
		 */
		canPromptTouchID(): boolean;
		/**
		 * The users current system wide accent color preference in RGBA hexadecimal form.
		 *
	This API is only available on macOS 10.14 Mojave or newer.
		 *
		 * @platform win32,darwin
		 */
		getAccentColor(): string;
		/**
		 * * `shouldRenderRichAnimation` Boolean - Returns true if rich animations should
		 * be rendered. Looks at session type (e.g. remote desktop) and accessibility
		 * settings to give guidance for heavy animations.
		 * * `scrollAnimationsEnabledBySystem` Boolean - Determines on a per-platform basis
		 * whether scroll animations (e.g. produced by home/end key) should be enabled.
		 * * `prefersReducedMotion` Boolean - Determines whether the user desires reduced
		 * motion based on platform APIs.
		 *
	Returns an object with system animation settings.
		 */
		getAnimationSettings(): AnimationSettings;
		/**
		 * | `null` - Can be `dark`, `light` or `unknown`.
		 *
		 * Gets the macOS appearance setting that you have declared you want for your
		 * application, maps to NSApplication.appearance. You can use the
		 * `setAppLevelAppearance` API to set this value.

	**Deprecated**
		 *
		 * @deprecated
		 * @platform darwin
		 */
		getAppLevelAppearance(): ('dark' | 'light' | 'unknown');
		/**
		 * The system color setting in RGB hexadecimal form (`#ABCDEF`). See the Windows
		 * docs and the MacOS docs for more details.
		 *
		 * @platform win32,darwin
		 */
		getColor(color: '3d-dark-shadow' | '3d-face' | '3d-highlight' | '3d-light' | '3d-shadow' | 'active-border' | 'active-caption' | 'active-caption-gradient' | 'app-workspace' | 'button-text' | 'caption-text' | 'desktop' | 'disabled-text' | 'highlight' | 'highlight-text' | 'hotlight' | 'inactive-border' | 'inactive-caption' | 'inactive-caption-gradient' | 'inactive-caption-text' | 'info-background' | 'info-text' | 'menu' | 'menu-highlight' | 'menubar' | 'menu-text' | 'scrollbar' | 'window' | 'window-frame' | 'window-text' | 'alternate-selected-control-text' | 'control-background' | 'control' | 'control-text' | 'disabled-control-text' | 'find-highlight' | 'grid' | 'header-text' | 'highlight' | 'keyboard-focus-indicator' | 'label' | 'link' | 'placeholder-text' | 'quaternary-label' | 'scrubber-textured-background' | 'secondary-label' | 'selected-content-background' | 'selected-control' | 'selected-control-text' | 'selected-menu-item' | 'selected-text-background' | 'selected-text' | 'separator' | 'shadow' | 'tertiary-label' | 'text-background' | 'text' | 'under-page-background' | 'unemphasized-selected-content-background' | 'unemphasized-selected-text-background' | 'unemphasized-selected-text' | 'window-background' | 'window-frame-text'): string;
		/**
		 * Can be `dark`, `light` or `unknown`.
		 *
		 * Gets the macOS appearance setting that is currently applied to your application,
		 * maps to NSApplication.effectiveAppearance
		 *
		 * Please note that until Electron is built targeting the 10.14 SDK, your
		 * application's `effectiveAppearance` will default to 'light' and won't inherit
		 * the OS preference. In the interim in order for your application to inherit the
		 * OS preference you must set the `NSRequiresAquaSystemAppearance` key in your apps
		 * `Info.plist` to `false`.  If you are using `electron-packager` or
		 * `electron-forge` just set the `enableDarwinDarkMode` packager option to `true`.
		 * See the Electron Packager API for more details.

	**Deprecated**
		 *
		 * @platform darwin
		 */
		getEffectiveAppearance(): ('dark' | 'light' | 'unknown');
		/**
		 * Can be `not-determined`, `granted`, `denied`, `restricted` or `unknown`.
		 *
		 * This user consent was not required until macOS 10.14 Mojave, so this method will
		 * always return `granted` if your system is running 10.13 High Sierra or lower.
		 *
		 * @platform darwin
		 */
		getMediaAccessStatus(mediaType: string): ('not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown');
		/**
		 * The standard system color formatted as `#RRGGBBAA`.
		 *
		 * Returns one of several standard system colors that automatically adapt to
		 * vibrancy and changes in accessibility settings like 'Increase contrast' and
		 * 'Reduce transparency'. See Apple Documentation for  more details.
		 *
		 * @platform darwin
		 */
		getSystemColor(color: 'blue' | 'brown' | 'gray' | 'green' | 'orange' | 'pink' | 'purple' | 'red' | 'yellow'): string;
		/**
		 * The value of `key` in `NSUserDefaults`.
		 *
		 * Some popular `key` and `type`s are:
		 *
		 * * `AppleInterfaceStyle`: `string`
		 * * `AppleAquaColorVariant`: `integer`
		 * * `AppleHighlightColor`: `string`
		 * * `AppleShowScrollBars`: `string`
		 * * `NSNavRecentPlaces`: `array`
		 * * `NSPreferredWebServices`: `dictionary`
		 * * `NSUserDictionaryReplacementItems`: `array`
		 *
		 * @platform darwin
		 */
		getUserDefault(key: string, type: 'string' | 'boolean' | 'integer' | 'float' | 'double' | 'url' | 'array' | 'dictionary'): any;
		/**
		 * `true` if DWM composition (Aero Glass) is enabled, and `false` otherwise.
		 *
		 * An example of using it to determine if you should create a transparent window or
		 * not (transparent windows won't work correctly when DWM composition is disabled):
		 *
		 * @platform win32
		 */
		isAeroGlassEnabled(): boolean;
		/**
		 * Whether the system is in Dark Mode.
		 *
		 * **Note:** On macOS 10.15 Catalina in order for this API to return the correct
		 * value when in the "automatic" dark mode setting you must either have
		 * `NSRequiresAquaSystemAppearance=false` in your `Info.plist` or be on Electron
		 * `>=7.0.0`.  See the dark mode guide for more information.
		 *
	**Deprecated:** Should use the new `nativeTheme.shouldUseDarkColors` API.
		 *
		 * @deprecated
		 * @platform darwin,win32
		 */
		isDarkMode(): boolean;
		/**
		 * `true` if a high contrast theme is active, `false` otherwise.
		 *
		 * **Depreacted:** Should use the new `nativeTheme.shouldUseHighContrastColors`
		 * API.
		 *
		 * @deprecated
		 * @platform darwin,win32
		 */
		isHighContrastColorScheme(): boolean;
		/**
		 * `true` if an inverted color scheme (a high contrast color scheme with light text
		 * and dark backgrounds) is active, `false` otherwise.
		 *
		 * **Deprecated:** Should use the new `nativeTheme.shouldUseInvertedColorScheme`
		 * API.
		 *
		 * @deprecated
		 * @platform win32
		 */
		isInvertedColorScheme(): boolean;
		/**
		 * Whether the Swipe between pages setting is on.
		 *
		 * @platform darwin
		 */
		isSwipeTrackingFromScrollEventsEnabled(): boolean;
		/**
		 * `true` if the current process is a trusted accessibility client and `false` if
		 * it is not.
		 *
		 * @platform darwin
		 */
		isTrustedAccessibilityClient(prompt: boolean): boolean;
		/**
		 * Posts `event` as native notifications of macOS. The `userInfo` is an Object that
		 * contains the user information dictionary sent along with the notification.
		 *
		 * @platform darwin
		 */
		postLocalNotification(event: string, userInfo: Record<string, any>): void;
		/**
		 * Posts `event` as native notifications of macOS. The `userInfo` is an Object that
		 * contains the user information dictionary sent along with the notification.
		 *
		 * @platform darwin
		 */
		postNotification(event: string, userInfo: Record<string, any>, deliverImmediately?: boolean): void;
		/**
		 * Posts `event` as native notifications of macOS. The `userInfo` is an Object that
		 * contains the user information dictionary sent along with the notification.
		 *
		 * @platform darwin
		 */
		postWorkspaceNotification(event: string, userInfo: Record<string, any>): void;
		/**
		 * resolves if the user has successfully authenticated with Touch ID.
		 *
		 * This API itself will not protect your user data; rather, it is a mechanism to
		 * allow you to do so. Native apps will need to set Access Control Constants like
		 * `kSecAccessControlUserPresence` on the their keychain entry so that reading it
		 * would auto-prompt for Touch ID biometric consent. This could be done with
		 * `node-keytar`, such that one would store an encryption key with `node-keytar`
		 * and only fetch it if `promptTouchID()` resolves.
		 *
		 * **NOTE:** This API will return a rejected Promise on macOS systems older than
		 * Sierra 10.12.2.
		 *
		 * @platform darwin
		 */
		promptTouchID(reason: string): Promise<void>;
		/**
		 * Add the specified defaults to your application's `NSUserDefaults`.
		 *
		 * @platform darwin
		 */
		registerDefaults(defaults: Record<string, (string) | (boolean) | (number)>): void;
		/**
		 * Removes the `key` in `NSUserDefaults`. This can be used to restore the default
		 * or global value of a `key` previously set with `setUserDefault`.
		 *
		 * @platform darwin
		 */
		removeUserDefault(key: string): void;
		/**
		 * Sets the appearance setting for your application, this should override the
		 * system default and override the value of `getEffectiveAppearance`.
		 *
	**Deprecated**
		 *
		 * @deprecated
		 * @platform darwin
		 */
		setAppLevelAppearance(appearance: (('dark' | 'light')) | (null)): void;
		/**
		 * Set the value of `key` in `NSUserDefaults`.
		 *
		 * Note that `type` should match actual type of `value`. An exception is thrown if
		 * they don't.
		 *
	Some popular `key` and `type`s are:

	* `ApplePressAndHoldEnabled`: `boolean`
		 *
		 * @platform darwin
		 */
		setUserDefault(key: string, type: string, value: string): void;
		/**
		 * The ID of this subscription
		 *
		 * Same as `subscribeNotification`, but uses `NSNotificationCenter` for local
		 * defaults. This is necessary for events such as
		 * `NSUserDefaultsDidChangeNotification`.
		 *
		 * @platform darwin
		 */
		subscribeLocalNotification(event: string, callback: (event: string, userInfo: Record<string, unknown>, object: string) => void): number;
		/**
		 * The ID of this subscription
		 *
		 * Subscribes to native notifications of macOS, `callback` will be called with
		 * `callback(event, userInfo)` when the corresponding `event` happens. The
		 * `userInfo` is an Object that contains the user information dictionary sent along
		 * with the notification. The `object` is the sender of the notification, and only
		 * supports `NSString` values for now.
		 *
		 * The `id` of the subscriber is returned, which can be used to unsubscribe the
		 * `event`.
		 *
		 * Under the hood this API subscribes to `NSDistributedNotificationCenter`, example
		 * values of `event` are:
		 *
		 * * `AppleInterfaceThemeChangedNotification`
		 * * `AppleAquaColorVariantChanged`
		 * * `AppleColorPreferencesChangedNotification`
		 * * `AppleShowScrollBarsSettingChanged`
		 *
		 * @platform darwin
		 */
		subscribeNotification(event: string, callback: (event: string, userInfo: Record<string, unknown>, object: string) => void): number;
		/**
		 * Same as `subscribeNotification`, but uses
		 * `NSWorkspace.sharedWorkspace.notificationCenter`. This is necessary for events
		 * such as `NSWorkspaceDidActivateApplicationNotification`.
		 *
		 * @platform darwin
		 */
		subscribeWorkspaceNotification(event: string, callback: (event: string, userInfo: Record<string, unknown>, object: string) => void): void;
		/**
		 * Same as `unsubscribeNotification`, but removes the subscriber from
		 * `NSNotificationCenter`.
		 *
		 * @platform darwin
		 */
		unsubscribeLocalNotification(id: number): void;
		/**
		 * Removes the subscriber with `id`.
		 *
		 * @platform darwin
		 */
		unsubscribeNotification(id: number): void;
		/**
		 * Same as `unsubscribeNotification`, but removes the subscriber from
		 * `NSWorkspace.sharedWorkspace.notificationCenter`.
		 *
		 * @platform darwin
		 */
		unsubscribeWorkspaceNotification(id: number): void;
		/**
		 * A `String` property that can be `dark`, `light` or `unknown`. It determines the
		 * macOS appearance setting for your application. This maps to values in:
		 * NSApplication.appearance. Setting this will override the system default as well
		 * as the value of `getEffectiveAppearance`.
		 *
		 * Possible values that can be set are `dark` and `light`, and possible return
		 * values are `dark`, `light`, and `unknown`.
		 *
	This property is only available on macOS 10.14 Mojave or newer.
		 *
		 * @platform darwin
		 */
		appLevelAppearance: ('dark' | 'light' | 'unknown');
		/**
		 * A `String` property that can be `dark`, `light` or `unknown`.
		 *
		 * Returns the macOS appearance setting that is currently applied to your
		 * application, maps to NSApplication.effectiveAppearance
		 *
		 * Please note that until Electron is built targeting the 10.14 SDK, your
		 * application's `effectiveAppearance` will default to 'light' and won't inherit
		 * the OS preference. In the interim in order for your application to inherit the
		 * OS preference you must set the `NSRequiresAquaSystemAppearance` key in your apps
		 * `Info.plist` to `false`.  If you are using `electron-packager` or
		 * `electron-forge` just set the `enableDarwinDarkMode` packager option to `true`.
		 * See the Electron Packager API for more details.
		 *
		 * @platform darwin
		 */
		readonly effectiveAppearance: ('dark' | 'light' | 'unknown');
	}

	interface Task {

		// Docs: http://electronjs.org/docs/api/structures/task

		/**
		 * The command line arguments when `program` is executed.
		 */
		arguments: string;
		/**
		 * Description of this task.
		 */
		description: string;
		/**
		 * The icon index in the icon file. If an icon file consists of two or more icons,
		 * set this value to identify the icon. If an icon file consists of one icon, this
		 * value is 0.
		 */
		iconIndex: number;
		/**
		 * The absolute path to an icon to be displayed in a JumpList, which can be an
		 * arbitrary resource file that contains an icon. You can usually specify
		 * `process.execPath` to show the icon of the program.
		 */
		iconPath: string;
		/**
		 * Path of the program to execute, usually you should specify `process.execPath`
		 * which opens the current program.
		 */
		program: string;
		/**
		 * The string to be displayed in a JumpList.
		 */
		title: string;
		/**
		 * The working directory. Default is empty.
		 */
		workingDirectory?: string;
	}

	interface ThumbarButton {

		// Docs: http://electronjs.org/docs/api/structures/thumbar-button

		click: Function;
		/**
		 * Control specific states and behaviors of the button. By default, it is
		 * `['enabled']`.
		 */
		flags?: string[];
		/**
		 * The icon showing in thumbnail toolbar.
		 */
		icon: NativeImage;
		/**
		 * The text of the button's tooltip.
		 */
		tooltip?: string;
	}

	class TouchBar {

		// Docs: http://electronjs.org/docs/api/touch-bar

		/**
		 * TouchBar
		 */
		constructor(options: TouchBarConstructorOptions);
		escapeItem: (TouchBarButton | TouchBarColorPicker | TouchBarGroup | TouchBarLabel | TouchBarPopover | TouchBarScrubber | TouchBarSegmentedControl | TouchBarSlider | TouchBarSpacer | null);
		static TouchBarButton: typeof TouchBarButton;
		static TouchBarColorPicker: typeof TouchBarColorPicker;
		static TouchBarGroup: typeof TouchBarGroup;
		static TouchBarLabel: typeof TouchBarLabel;
		static TouchBarPopover: typeof TouchBarPopover;
		static TouchBarScrubber: typeof TouchBarScrubber;
		static TouchBarSegmentedControl: typeof TouchBarSegmentedControl;
		static TouchBarSlider: typeof TouchBarSlider;
		static TouchBarSpacer: typeof TouchBarSpacer;
	}

	class TouchBarButton {

		// Docs: http://electronjs.org/docs/api/touch-bar-button

		/**
		 * TouchBarButton
		 */
		constructor(options: TouchBarButtonConstructorOptions);
		backgroundColor: string;
		icon: NativeImage;
		label: string;
	}

	class TouchBarColorPicker extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-color-picker

		/**
		 * TouchBarColorPicker
		 */
		constructor(options: TouchBarColorPickerConstructorOptions);
		availableColors: string[];
		selectedColor: string;
	}

	class TouchBarGroup extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-group

		/**
		 * TouchBarGroup
		 */
		constructor(options: TouchBarGroupConstructorOptions);
	}

	class TouchBarLabel extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-label

		/**
		 * TouchBarLabel
		 */
		constructor(options: TouchBarLabelConstructorOptions);
		label: string;
		textColor: string;
	}

	class TouchBarPopover extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-popover

		/**
		 * TouchBarPopover
		 */
		constructor(options: TouchBarPopoverConstructorOptions);
		icon: NativeImage;
		label: string;
	}

	class TouchBarScrubber extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-scrubber

		/**
		 * TouchBarScrubber
		 */
		constructor(options: TouchBarScrubberConstructorOptions);
		continuous: boolean;
		items: ScrubberItem[];
		mode: ('fixed' | 'free');
		overlayStyle: ('background' | 'outline' | 'null');
		selectedStyle: ('background' | 'outline' | 'null');
		showArrowButtons: boolean;
	}

	class TouchBarSegmentedControl extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-segmented-control

		/**
		 * TouchBarSegmentedControl
		 */
		constructor(options: TouchBarSegmentedControlConstructorOptions);
		segments: SegmentedControlSegment[];
		segmentStyle: string;
		selectedIndex: number;
	}

	class TouchBarSlider extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-slider

		/**
		 * TouchBarSlider
		 */
		constructor(options: TouchBarSliderConstructorOptions);
		label: string;
		maxValue: number;
		minValue: number;
		value: number;
	}

	class TouchBarSpacer extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/touch-bar-spacer

		/**
		 * TouchBarSpacer
		 */
		constructor(options: TouchBarSpacerConstructorOptions);
	}

	interface TraceCategoriesAndOptions {

		// Docs: http://electronjs.org/docs/api/structures/trace-categories-and-options

		/**
		 * A filter to control what category groups should be traced. A filter can have an
		 * optional '-' prefix to exclude category groups that contain a matching category.
		 * Having both included and excluded category patterns in the same list is not
		 * supported. Examples: `test_MyTest*`, `test_MyTest*,test_OtherStuff`,
		 * `-excluded_category1,-excluded_category2`.
		 */
		categoryFilter: string;
		/**
		 * Controls what kind of tracing is enabled, it is a comma-delimited sequence of
		 * the following strings: `record-until-full`, `record-continuously`,
		 * `trace-to-console`, `enable-sampling`, `enable-systrace`, e.g.
		 * `'record-until-full,enable-sampling'`. The first 3 options are trace recording
		 * modes and hence mutually exclusive. If more than one trace recording modes
		 * appear in the `traceOptions` string, the last one takes precedence. If none of
		 * the trace recording modes are specified, recording mode is `record-until-full`.
		 * The trace option will first be reset to the default option (`record_mode` set to
		 * `record-until-full`, `enable_sampling` and `enable_systrace` set to `false`)
		 * before options parsed from `traceOptions` are applied on it.
		 */
		traceOptions: string;
	}

	interface TraceConfig {

		// Docs: http://electronjs.org/docs/api/structures/trace-config

		/**
		 * if true, filter event data according to a whitelist of events that have been
		 * manually vetted to not include any PII. See the implementation in Chromium for
		 * specifics.
		 */
		enable_argument_filter?: boolean;
		/**
		 * a list of tracing categories to exclude. Can include glob-like patterns using
		 * `*` at the end of the category name. See tracing categories for the list of
		 * categories.
		 */
		excluded_categories?: string[];
		/**
		 * a list of histogram names to report with the trace.
		 */
		histogram_names?: string[];
		/**
		 * a list of tracing categories to include. Can include glob-like patterns using
		 * `*` at the end of the category name. See tracing categories for the list of
		 * categories.
		 */
		included_categories?: string[];
		/**
		 * a list of process IDs to include in the trace. If not specified, trace all
		 * processes.
		 */
		included_process_ids?: number[];
		/**
		 * if the `disabled-by-default-memory-infra` category is enabled, this contains
		 * optional additional configuration for data collection. See the Chromium
		 * memory-infra docs for more information.
		 */
		memory_dump_config?: Record<string, any>;
		/**
		 * Can be `record-until-full`, `record-continuously`, `record-as-much-as-possible`
		 * or `trace-to-console`. Defaults to `record-until-full`.
		 */
		recording_mode?: ('record-until-full' | 'record-continuously' | 'record-as-much-as-possible' | 'trace-to-console');
		/**
		 * maximum size of the trace recording buffer in events.
		 */
		trace_buffer_size_in_events?: number;
		/**
		 * maximum size of the trace recording buffer in kilobytes. Defaults to 100MB.
		 */
		trace_buffer_size_in_kb?: number;
	}

	interface Transaction {

		// Docs: http://electronjs.org/docs/api/structures/transaction

		/**
		 * The error code if an error occurred while processing the transaction.
		 */
		errorCode: number;
		/**
		 * The error message if an error occurred while processing the transaction.
		 */
		errorMessage: string;
		/**
		 * The identifier of the restored transaction by the App Store.
		 */
		originalTransactionIdentifier: string;
		payment: Payment;
		/**
		 * The date the transaction was added to the App Store’s payment queue.
		 */
		transactionDate: string;
		/**
		 * A string that uniquely identifies a successful payment transaction.
		 */
		transactionIdentifier: string;
		/**
		 * The transaction state, can be `purchasing`, `purchased`, `failed`, `restored` or
		 * `deferred`.
		 */
		transactionState: ('purchasing' | 'purchased' | 'failed' | 'restored' | 'deferred');
	}

	class Tray extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/tray

		/**
		 * Emitted when the tray balloon is clicked.
		 *
		 * @platform win32
		 */
		on(event: 'balloon-click', listener: Function): this;
		once(event: 'balloon-click', listener: Function): this;
		addListener(event: 'balloon-click', listener: Function): this;
		removeListener(event: 'balloon-click', listener: Function): this;
		/**
		 * Emitted when the tray balloon is closed because of timeout or user manually
		 * closes it.
		 *
		 * @platform win32
		 */
		on(event: 'balloon-closed', listener: Function): this;
		once(event: 'balloon-closed', listener: Function): this;
		addListener(event: 'balloon-closed', listener: Function): this;
		removeListener(event: 'balloon-closed', listener: Function): this;
		/**
		 * Emitted when the tray balloon shows.
		 *
		 * @platform win32
		 */
		on(event: 'balloon-show', listener: Function): this;
		once(event: 'balloon-show', listener: Function): this;
		addListener(event: 'balloon-show', listener: Function): this;
		removeListener(event: 'balloon-show', listener: Function): this;
		/**
		 * Emitted when the tray icon is clicked.
		 */
		on(event: 'click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the tray icon is double clicked.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'double-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		once(event: 'double-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		addListener(event: 'double-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		removeListener(event: 'double-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		/**
		 * Emitted when a drag operation ends on the tray or ends at another location.
		 *
		 * @platform darwin
		 */
		on(event: 'drag-end', listener: Function): this;
		once(event: 'drag-end', listener: Function): this;
		addListener(event: 'drag-end', listener: Function): this;
		removeListener(event: 'drag-end', listener: Function): this;
		/**
		 * Emitted when a drag operation enters the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'drag-enter', listener: Function): this;
		once(event: 'drag-enter', listener: Function): this;
		addListener(event: 'drag-enter', listener: Function): this;
		removeListener(event: 'drag-enter', listener: Function): this;
		/**
		 * Emitted when a drag operation exits the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'drag-leave', listener: Function): this;
		once(event: 'drag-leave', listener: Function): this;
		addListener(event: 'drag-leave', listener: Function): this;
		removeListener(event: 'drag-leave', listener: Function): this;
		/**
		 * Emitted when any dragged items are dropped on the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'drop', listener: Function): this;
		once(event: 'drop', listener: Function): this;
		addListener(event: 'drop', listener: Function): this;
		removeListener(event: 'drop', listener: Function): this;
		/**
		 * Emitted when dragged files are dropped in the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'drop-files', listener: (event: Event,
			/**
			 * The paths of the dropped files.
			 */
			files: string[]) => void): this;
		once(event: 'drop-files', listener: (event: Event,
			/**
			 * The paths of the dropped files.
			 */
			files: string[]) => void): this;
		addListener(event: 'drop-files', listener: (event: Event,
			/**
			 * The paths of the dropped files.
			 */
			files: string[]) => void): this;
		removeListener(event: 'drop-files', listener: (event: Event,
			/**
			 * The paths of the dropped files.
			 */
			files: string[]) => void): this;
		/**
		 * Emitted when dragged text is dropped in the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'drop-text', listener: (event: Event,
			/**
			 * the dropped text string.
			 */
			text: string) => void): this;
		once(event: 'drop-text', listener: (event: Event,
			/**
			 * the dropped text string.
			 */
			text: string) => void): this;
		addListener(event: 'drop-text', listener: (event: Event,
			/**
			 * the dropped text string.
			 */
			text: string) => void): this;
		removeListener(event: 'drop-text', listener: (event: Event,
			/**
			 * the dropped text string.
			 */
			text: string) => void): this;
		/**
		 * Emitted when the mouse enters the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'mouse-enter', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-enter', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-enter', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-enter', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the mouse exits the tray icon.
		 *
		 * @platform darwin
		 */
		on(event: 'mouse-leave', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-leave', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-leave', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-leave', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the mouse moves in the tray icon.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'mouse-move', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-move', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-move', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-move', listener: (event: KeyboardEvent,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the tray icon is right clicked.
		 *
		 * @platform darwin,win32
		 */
		on(event: 'right-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		once(event: 'right-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		addListener(event: 'right-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		removeListener(event: 'right-click', listener: (event: KeyboardEvent,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		/**
		 * Tray
		 */
		constructor(image: (NativeImage) | (string));
		/**
		 * Destroys the tray icon immediately.
		 */
		destroy(): void;
		/**
		 * Displays a tray balloon.
		 *
		 * @platform win32
		 */
		displayBalloon(options: DisplayBalloonOptions): void;
		/**
		 * The `bounds` of this tray icon as `Object`.
		 *
		 * @platform darwin,win32
		 */
		getBounds(): Rectangle;
		/**
		 * Whether double click events will be ignored.
		 *
		 * @platform darwin
		 */
		getIgnoreDoubleClickEvents(): boolean;
		/**
		 * the title displayed next to the tray icon in the status bar
		 *
		 * @platform darwin
		 */
		getTitle(): string;
		/**
		 * Whether the tray icon is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * Pops up the context menu of the tray icon. When `menu` is passed, the `menu`
		 * will be shown instead of the tray icon's context menu.
		 *
	The `position` is only available on Windows, and it is (0, 0) by default.
		 *
		 * @platform darwin,win32
		 */
		popUpContextMenu(menu?: Menu, position?: Point): void;
		/**
		 * Sets the context menu for this icon.
		 */
		setContextMenu(menu: (Menu) | (null)): void;
		/**
		 * Sets the option to ignore double click events. Ignoring these events allows you
		 * to detect every individual click of the tray icon.
		 *
	This value is set to false by default.
		 *
		 * @platform darwin
		 */
		setIgnoreDoubleClickEvents(ignore: boolean): void;
		/**
		 * Sets the `image` associated with this tray icon.
		 */
		setImage(image: (NativeImage) | (string)): void;
		/**
		 * Sets the `image` associated with this tray icon when pressed on macOS.
		 *
		 * @platform darwin
		 */
		setPressedImage(image: (NativeImage) | (string)): void;
		/**
		 * Sets the title displayed next to the tray icon in the status bar (Support ANSI
		 * colors).
		 *
		 * @platform darwin
		 */
		setTitle(title: string): void;
		/**
		 * Sets the hover text for this tray icon.
		 */
		setToolTip(toolTip: string): void;
	}

	interface UploadBlob {

		// Docs: http://electronjs.org/docs/api/structures/upload-blob

		/**
		 * UUID of blob data to upload.
		 */
		blobUUID: string;
		/**
		 * `blob`.
		 */
		type: string;
	}

	interface UploadData {

		// Docs: http://electronjs.org/docs/api/structures/upload-data

		/**
		 * UUID of blob data. Use ses.getBlobData method to retrieve the data.
		 */
		blobUUID?: string;
		/**
		 * Content being sent.
		 */
		bytes: Buffer;
		/**
		 * Path of file being uploaded.
		 */
		file?: string;
	}

	interface UploadFile {

		// Docs: http://electronjs.org/docs/api/structures/upload-file

		/**
		 * Path of file to be uploaded.
		 */
		filePath: string;
		/**
		 * Number of bytes to read from `offset`. Defaults to `0`.
		 */
		length: number;
		/**
		 * Last Modification time in number of seconds since the UNIX epoch.
		 */
		modificationTime: number;
		/**
		 * Defaults to `0`.
		 */
		offset: number;
		/**
		 * `file`.
		 */
		type: string;
	}

	interface UploadRawData {

		// Docs: http://electronjs.org/docs/api/structures/upload-raw-data

		/**
		 * Data to be uploaded.
		 */
		bytes: Buffer;
		/**
		 * `rawData`.
		 */
		type: string;
	}

	class WebContents extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/web-contents

		/**
		 * A WebContents instance with the given ID.
		 */
		static fromId(id: number): WebContents;
		/**
		 * An array of all `WebContents` instances. This will contain web contents for all
		 * windows, webviews, opened devtools, and devtools extension background pages.
		 */
		static getAllWebContents(): WebContents[];
		/**
		 * The web contents that is focused in this application, otherwise returns `null`.
		 */
		static getFocusedWebContents(): WebContents;
		/**
		 * Emitted before dispatching the `keydown` and `keyup` events in the page. Calling
		 * `event.preventDefault` will prevent the page `keydown`/`keyup` events and the
		 * menu shortcuts.
		 *
	To only prevent the menu shortcuts, use `setIgnoreMenuShortcuts`:
		 */
		on(event: 'before-input-event', listener: (event: Event,
			/**
			 * Input properties.
			 */
			input: Input) => void): this;
		once(event: 'before-input-event', listener: (event: Event,
			/**
			 * Input properties.
			 */
			input: Input) => void): this;
		addListener(event: 'before-input-event', listener: (event: Event,
			/**
			 * Input properties.
			 */
			input: Input) => void): this;
		removeListener(event: 'before-input-event', listener: (event: Event,
			/**
			 * Input properties.
			 */
			input: Input) => void): this;
		/**
		 * Emitted when failed to verify the `certificate` for `url`.
		 *
	The usage is the same with the `certificate-error` event of `app`.
		 */
		on(event: 'certificate-error', listener: (event: Event,
			url: string,
			/**
			 * The error code.
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		once(event: 'certificate-error', listener: (event: Event,
			url: string,
			/**
			 * The error code.
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		addListener(event: 'certificate-error', listener: (event: Event,
			url: string,
			/**
			 * The error code.
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		removeListener(event: 'certificate-error', listener: (event: Event,
			url: string,
			/**
			 * The error code.
			 */
			error: string,
			certificate: Certificate,
			callback: (isTrusted: boolean) => void) => void): this;
		/**
		 * Emitted when the associated window logs a console message. Will not be emitted
		 * for windows with *offscreen rendering* enabled.
		 */
		on(event: 'console-message', listener: (event: Event,
			level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		once(event: 'console-message', listener: (event: Event,
			level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		addListener(event: 'console-message', listener: (event: Event,
			level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		removeListener(event: 'console-message', listener: (event: Event,
			level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		/**
		 * Emitted when there is a new context menu that needs to be handled.
		 */
		on(event: 'context-menu', listener: (event: Event,
			params: ContextMenuParams) => void): this;
		once(event: 'context-menu', listener: (event: Event,
			params: ContextMenuParams) => void): this;
		addListener(event: 'context-menu', listener: (event: Event,
			params: ContextMenuParams) => void): this;
		removeListener(event: 'context-menu', listener: (event: Event,
			params: ContextMenuParams) => void): this;
		/**
		 * Emitted when the renderer process crashes or is killed.
		 */
		on(event: 'crashed', listener: (event: Event,
			killed: boolean) => void): this;
		once(event: 'crashed', listener: (event: Event,
			killed: boolean) => void): this;
		addListener(event: 'crashed', listener: (event: Event,
			killed: boolean) => void): this;
		removeListener(event: 'crashed', listener: (event: Event,
			killed: boolean) => void): this;
		/**
		 * Emitted when the cursor's type changes. The `type` parameter can be `default`,
		 * `crosshair`, `pointer`, `text`, `wait`, `help`, `e-resize`, `n-resize`,
		 * `ne-resize`, `nw-resize`, `s-resize`, `se-resize`, `sw-resize`, `w-resize`,
		 * `ns-resize`, `ew-resize`, `nesw-resize`, `nwse-resize`, `col-resize`,
		 * `row-resize`, `m-panning`, `e-panning`, `n-panning`, `ne-panning`, `nw-panning`,
		 * `s-panning`, `se-panning`, `sw-panning`, `w-panning`, `move`, `vertical-text`,
		 * `cell`, `context-menu`, `alias`, `progress`, `nodrop`, `copy`, `none`,
		 * `not-allowed`, `zoom-in`, `zoom-out`, `grab`, `grabbing` or `custom`.
		 *
		 * If the `type` parameter is `custom`, the `image` parameter will hold the custom
		 * cursor image in a `NativeImage`, and `scale`, `size` and `hotspot` will hold
		 * additional information about the custom cursor.
		 */
		on(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale: number,
			/**
			 * the size of the `image`.
			 */
			size: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot: Point) => void): this;
		once(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale: number,
			/**
			 * the size of the `image`.
			 */
			size: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot: Point) => void): this;
		addListener(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale: number,
			/**
			 * the size of the `image`.
			 */
			size: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot: Point) => void): this;
		removeListener(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale: number,
			/**
			 * the size of the `image`.
			 */
			size: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot: Point) => void): this;
		/**
		 * Emitted when `desktopCapturer.getSources()` is called in the renderer process.
		 * Calling `event.preventDefault()` will make it return empty sources.
		 */
		on(event: 'desktop-capturer-get-sources', listener: (event: Event) => void): this;
		once(event: 'desktop-capturer-get-sources', listener: (event: Event) => void): this;
		addListener(event: 'desktop-capturer-get-sources', listener: (event: Event) => void): this;
		removeListener(event: 'desktop-capturer-get-sources', listener: (event: Event) => void): this;
		/**
		 * Emitted when `webContents` is destroyed.
		 */
		on(event: 'destroyed', listener: Function): this;
		once(event: 'destroyed', listener: Function): this;
		addListener(event: 'destroyed', listener: Function): this;
		removeListener(event: 'destroyed', listener: Function): this;
		/**
		 * Emitted when DevTools is closed.
		 */
		on(event: 'devtools-closed', listener: Function): this;
		once(event: 'devtools-closed', listener: Function): this;
		addListener(event: 'devtools-closed', listener: Function): this;
		removeListener(event: 'devtools-closed', listener: Function): this;
		/**
		 * Emitted when DevTools is focused / opened.
		 */
		on(event: 'devtools-focused', listener: Function): this;
		once(event: 'devtools-focused', listener: Function): this;
		addListener(event: 'devtools-focused', listener: Function): this;
		removeListener(event: 'devtools-focused', listener: Function): this;
		/**
		 * Emitted when DevTools is opened.
		 */
		on(event: 'devtools-opened', listener: Function): this;
		once(event: 'devtools-opened', listener: Function): this;
		addListener(event: 'devtools-opened', listener: Function): this;
		removeListener(event: 'devtools-opened', listener: Function): this;
		/**
		 * Emitted when the devtools window instructs the webContents to reload
		 */
		on(event: 'devtools-reload-page', listener: Function): this;
		once(event: 'devtools-reload-page', listener: Function): this;
		addListener(event: 'devtools-reload-page', listener: Function): this;
		removeListener(event: 'devtools-reload-page', listener: Function): this;
		/**
		 * Emitted when a `<webview>` has been attached to this web contents.
		 */
		on(event: 'did-attach-webview', listener: (event: Event,
			/**
			 * The guest web contents that is used by the `<webview>`.
			 */
			webContents: WebContents) => void): this;
		once(event: 'did-attach-webview', listener: (event: Event,
			/**
			 * The guest web contents that is used by the `<webview>`.
			 */
			webContents: WebContents) => void): this;
		addListener(event: 'did-attach-webview', listener: (event: Event,
			/**
			 * The guest web contents that is used by the `<webview>`.
			 */
			webContents: WebContents) => void): this;
		removeListener(event: 'did-attach-webview', listener: (event: Event,
			/**
			 * The guest web contents that is used by the `<webview>`.
			 */
			webContents: WebContents) => void): this;
		/**
		 * Emitted when a page's theme color changes. This is usually due to encountering a
		 * meta tag:
		 */
		on(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: (string) | (null)) => void): this;
		once(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: (string) | (null)) => void): this;
		addListener(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: (string) | (null)) => void): this;
		removeListener(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: (string) | (null)) => void): this;
		/**
		 * This event is like `did-finish-load` but emitted when the load failed. The full
		 * list of error codes and their meaning is available here.
		 */
		on(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * This event is like `did-fail-load` but emitted when the load was cancelled (e.g.
		 * `window.stop()` was invoked).
		 */
		on(event: 'did-fail-provisional-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-fail-provisional-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-fail-provisional-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-fail-provisional-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Emitted when the navigation is done, i.e. the spinner of the tab has stopped
		 * spinning, and the `onload` event was dispatched.
		 */
		on(event: 'did-finish-load', listener: Function): this;
		once(event: 'did-finish-load', listener: Function): this;
		addListener(event: 'did-finish-load', listener: Function): this;
		removeListener(event: 'did-finish-load', listener: Function): this;
		/**
		 * Emitted when a frame has done navigation.
		 */
		on(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Emitted when any frame navigation is done.
		 *
		 * This event is not emitted for in-page navigations, such as clicking anchor links
		 * or updating the `window.location.hash`. Use `did-navigate-in-page` event for
		 * this purpose.
		 */
		on(event: 'did-frame-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations,
			 */
			httpStatusText: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-frame-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations,
			 */
			httpStatusText: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-frame-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations,
			 */
			httpStatusText: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-frame-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations,
			 */
			httpStatusText: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Emitted when a main frame navigation is done.
		 *
		 * This event is not emitted for in-page navigations, such as clicking anchor links
		 * or updating the `window.location.hash`. Use `did-navigate-in-page` event for
		 * this purpose.
		 */
		on(event: 'did-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations
			 */
			httpStatusText: string) => void): this;
		once(event: 'did-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations
			 */
			httpStatusText: string) => void): this;
		addListener(event: 'did-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations
			 */
			httpStatusText: string) => void): this;
		removeListener(event: 'did-navigate', listener: (event: Event,
			url: string,
			/**
			 * -1 for non HTTP navigations
			 */
			httpResponseCode: number,
			/**
			 * empty for non HTTP navigations
			 */
			httpStatusText: string) => void): this;
		/**
		 * Emitted when an in-page navigation happened in any frame.
		 *
		 * When in-page navigation happens, the page URL changes but does not cause
		 * navigation outside of the page. Examples of this occurring are when anchor links
		 * are clicked or when the DOM `hashchange` event is triggered.
		 */
		on(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Emitted after a server side redirect occurs during navigation.  For example a
		 * 302 redirect.
		 *
		 * This event can not be prevented, if you want to prevent redirects you should
		 * checkout out the `will-redirect` event above.
		 */
		on(event: 'did-redirect-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-redirect-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-redirect-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-redirect-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab started spinning.
		 */
		on(event: 'did-start-loading', listener: Function): this;
		once(event: 'did-start-loading', listener: Function): this;
		addListener(event: 'did-start-loading', listener: Function): this;
		removeListener(event: 'did-start-loading', listener: Function): this;
		/**
		 * Emitted when any frame (including main) starts navigating. `isInplace` will be
		 * `true` for in-page navigations.
		 */
		on(event: 'did-start-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'did-start-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'did-start-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'did-start-navigation', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab stopped spinning.
		 */
		on(event: 'did-stop-loading', listener: Function): this;
		once(event: 'did-stop-loading', listener: Function): this;
		addListener(event: 'did-stop-loading', listener: Function): this;
		removeListener(event: 'did-stop-loading', listener: Function): this;
		/**
		 * Emitted when the document in the given frame is loaded.
		 */
		on(event: 'dom-ready', listener: (event: Event) => void): this;
		once(event: 'dom-ready', listener: (event: Event) => void): this;
		addListener(event: 'dom-ready', listener: (event: Event) => void): this;
		removeListener(event: 'dom-ready', listener: (event: Event) => void): this;
		/**
		 * Emitted when the window enters a full-screen state triggered by HTML API.
		 */
		on(event: 'enter-html-full-screen', listener: Function): this;
		once(event: 'enter-html-full-screen', listener: Function): this;
		addListener(event: 'enter-html-full-screen', listener: Function): this;
		removeListener(event: 'enter-html-full-screen', listener: Function): this;
		/**
		 * Emitted when a result is available for [`webContents.findInPage`] request.
		 */
		on(event: 'found-in-page', listener: (event: Event,
			result: Result) => void): this;
		once(event: 'found-in-page', listener: (event: Event,
			result: Result) => void): this;
		addListener(event: 'found-in-page', listener: (event: Event,
			result: Result) => void): this;
		removeListener(event: 'found-in-page', listener: (event: Event,
			result: Result) => void): this;
		/**
		 * Emitted when the renderer process sends an asynchronous message via
		 * `ipcRenderer.send()`.
		 */
		on(event: 'ipc-message', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		once(event: 'ipc-message', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		addListener(event: 'ipc-message', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		removeListener(event: 'ipc-message', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		/**
		 * Emitted when the renderer process sends a synchronous message via
		 * `ipcRenderer.sendSync()`.
		 */
		on(event: 'ipc-message-sync', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		once(event: 'ipc-message-sync', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		addListener(event: 'ipc-message-sync', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		removeListener(event: 'ipc-message-sync', listener: (event: Event,
			channel: string,
			...args: any[]) => void): this;
		/**
		 * Emitted when the window leaves a full-screen state triggered by HTML API.
		 */
		on(event: 'leave-html-full-screen', listener: Function): this;
		once(event: 'leave-html-full-screen', listener: Function): this;
		addListener(event: 'leave-html-full-screen', listener: Function): this;
		removeListener(event: 'leave-html-full-screen', listener: Function): this;
		/**
		 * Emitted when `webContents` wants to do basic auth.
		 *
	The usage is the same with the `login` event of `app`.
		 */
		on(event: 'login', listener: (event: Event,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		once(event: 'login', listener: (event: Event,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		addListener(event: 'login', listener: (event: Event,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		removeListener(event: 'login', listener: (event: Event,
			request: Request,
			authInfo: AuthInfo,
			callback: (username: string, password: string) => void) => void): this;
		/**
		 * Emitted when media is paused or done playing.
		 */
		on(event: 'media-paused', listener: Function): this;
		once(event: 'media-paused', listener: Function): this;
		addListener(event: 'media-paused', listener: Function): this;
		removeListener(event: 'media-paused', listener: Function): this;
		/**
		 * Emitted when media starts playing.
		 */
		on(event: 'media-started-playing', listener: Function): this;
		once(event: 'media-started-playing', listener: Function): this;
		addListener(event: 'media-started-playing', listener: Function): this;
		removeListener(event: 'media-started-playing', listener: Function): this;
		/**
		 * Emitted when the page requests to open a new window for a `url`. It could be
		 * requested by `window.open` or an external link like `<a target='_blank'>`.
		 *
		 * By default a new `BrowserWindow` will be created for the `url`.
		 *
		 * Calling `event.preventDefault()` will prevent Electron from automatically
		 * creating a new `BrowserWindow`. If you call `event.preventDefault()` and
		 * manually create a new `BrowserWindow` then you must set `event.newGuest` to
		 * reference the new `BrowserWindow` instance, failing to do so may result in
		 * unexpected behavior. For example:
		 */
		on(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new `BrowserWindow`.
			 */
			options: BrowserWindowConstructorOptions,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[],
			/**
			 * The referrer that will be passed to the new window. May or may not result in the
			 * `Referer` header being sent, depending on the referrer policy.
			 */
			referrer: Referrer) => void): this;
		once(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new `BrowserWindow`.
			 */
			options: BrowserWindowConstructorOptions,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[],
			/**
			 * The referrer that will be passed to the new window. May or may not result in the
			 * `Referer` header being sent, depending on the referrer policy.
			 */
			referrer: Referrer) => void): this;
		addListener(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new `BrowserWindow`.
			 */
			options: BrowserWindowConstructorOptions,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[],
			/**
			 * The referrer that will be passed to the new window. May or may not result in the
			 * `Referer` header being sent, depending on the referrer policy.
			 */
			referrer: Referrer) => void): this;
		removeListener(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new `BrowserWindow`.
			 */
			options: BrowserWindowConstructorOptions,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[],
			/**
			 * The referrer that will be passed to the new window. May or may not result in the
			 * `Referer` header being sent, depending on the referrer policy.
			 */
			referrer: Referrer) => void): this;
		/**
		 * Emitted when page receives favicon urls.
		 */
		on(event: 'page-favicon-updated', listener: (event: Event,
			/**
			 * Array of URLs.
			 */
			favicons: string[]) => void): this;
		once(event: 'page-favicon-updated', listener: (event: Event,
			/**
			 * Array of URLs.
			 */
			favicons: string[]) => void): this;
		addListener(event: 'page-favicon-updated', listener: (event: Event,
			/**
			 * Array of URLs.
			 */
			favicons: string[]) => void): this;
		removeListener(event: 'page-favicon-updated', listener: (event: Event,
			/**
			 * Array of URLs.
			 */
			favicons: string[]) => void): this;
		/**
		 * Fired when page title is set during navigation. `explicitSet` is false when
		 * title is synthesized from file url.
		 */
		on(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		once(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		addListener(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		removeListener(event: 'page-title-updated', listener: (event: Event,
			title: string,
			explicitSet: boolean) => void): this;
		/**
		 * Emitted when a new frame is generated. Only the dirty area is passed in the
		 * buffer.
		 */
		on(event: 'paint', listener: (event: Event,
			dirtyRect: Rectangle,
			/**
			 * The image data of the whole frame.
			 */
			image: NativeImage) => void): this;
		once(event: 'paint', listener: (event: Event,
			dirtyRect: Rectangle,
			/**
			 * The image data of the whole frame.
			 */
			image: NativeImage) => void): this;
		addListener(event: 'paint', listener: (event: Event,
			dirtyRect: Rectangle,
			/**
			 * The image data of the whole frame.
			 */
			image: NativeImage) => void): this;
		removeListener(event: 'paint', listener: (event: Event,
			dirtyRect: Rectangle,
			/**
			 * The image data of the whole frame.
			 */
			image: NativeImage) => void): this;
		/**
		 * Emitted when a plugin process has crashed.
		 */
		on(event: 'plugin-crashed', listener: (event: Event,
			name: string,
			version: string) => void): this;
		once(event: 'plugin-crashed', listener: (event: Event,
			name: string,
			version: string) => void): this;
		addListener(event: 'plugin-crashed', listener: (event: Event,
			name: string,
			version: string) => void): this;
		removeListener(event: 'plugin-crashed', listener: (event: Event,
			name: string,
			version: string) => void): this;
		/**
		 * Emitted when the preload script `preloadPath` throws an unhandled exception
		 * `error`.
		 */
		on(event: 'preload-error', listener: (event: Event,
			preloadPath: string,
			error: Error) => void): this;
		once(event: 'preload-error', listener: (event: Event,
			preloadPath: string,
			error: Error) => void): this;
		addListener(event: 'preload-error', listener: (event: Event,
			preloadPath: string,
			error: Error) => void): this;
		removeListener(event: 'preload-error', listener: (event: Event,
			preloadPath: string,
			error: Error) => void): this;
		/**
		 * Emitted when `remote.getBuiltin()` is called in the renderer process. Calling
		 * `event.preventDefault()` will prevent the module from being returned. Custom
		 * value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-builtin', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		once(event: 'remote-get-builtin', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		addListener(event: 'remote-get-builtin', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		removeListener(event: 'remote-get-builtin', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		/**
		 * Emitted when `remote.getCurrentWebContents()` is called in the renderer process.
		 * Calling `event.preventDefault()` will prevent the object from being returned.
		 * Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-current-web-contents', listener: (event: IpcMainEvent) => void): this;
		once(event: 'remote-get-current-web-contents', listener: (event: IpcMainEvent) => void): this;
		addListener(event: 'remote-get-current-web-contents', listener: (event: IpcMainEvent) => void): this;
		removeListener(event: 'remote-get-current-web-contents', listener: (event: IpcMainEvent) => void): this;
		/**
		 * Emitted when `remote.getCurrentWindow()` is called in the renderer process.
		 * Calling `event.preventDefault()` will prevent the object from being returned.
		 * Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-current-window', listener: (event: IpcMainEvent) => void): this;
		once(event: 'remote-get-current-window', listener: (event: IpcMainEvent) => void): this;
		addListener(event: 'remote-get-current-window', listener: (event: IpcMainEvent) => void): this;
		removeListener(event: 'remote-get-current-window', listener: (event: IpcMainEvent) => void): this;
		/**
		 * Emitted when `remote.getGlobal()` is called in the renderer process. Calling
		 * `event.preventDefault()` will prevent the global from being returned. Custom
		 * value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-global', listener: (event: IpcMainEvent,
			globalName: string) => void): this;
		once(event: 'remote-get-global', listener: (event: IpcMainEvent,
			globalName: string) => void): this;
		addListener(event: 'remote-get-global', listener: (event: IpcMainEvent,
			globalName: string) => void): this;
		removeListener(event: 'remote-get-global', listener: (event: IpcMainEvent,
			globalName: string) => void): this;
		/**
		 * Emitted when `<webview>.getWebContents()` is called in the renderer process.
		 * Calling `event.preventDefault()` will prevent the object from being returned.
		 * Custom value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-get-guest-web-contents', listener: (event: IpcMainEvent,
			guestWebContents: WebContents) => void): this;
		once(event: 'remote-get-guest-web-contents', listener: (event: IpcMainEvent,
			guestWebContents: WebContents) => void): this;
		addListener(event: 'remote-get-guest-web-contents', listener: (event: IpcMainEvent,
			guestWebContents: WebContents) => void): this;
		removeListener(event: 'remote-get-guest-web-contents', listener: (event: IpcMainEvent,
			guestWebContents: WebContents) => void): this;
		/**
		 * Emitted when `remote.require()` is called in the renderer process. Calling
		 * `event.preventDefault()` will prevent the module from being returned. Custom
		 * value can be returned by setting `event.returnValue`.
		 */
		on(event: 'remote-require', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		once(event: 'remote-require', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		addListener(event: 'remote-require', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		removeListener(event: 'remote-require', listener: (event: IpcMainEvent,
			moduleName: string) => void): this;
		/**
		 * Emitted when the unresponsive web page becomes responsive again.
		 */
		on(event: 'responsive', listener: Function): this;
		once(event: 'responsive', listener: Function): this;
		addListener(event: 'responsive', listener: Function): this;
		removeListener(event: 'responsive', listener: Function): this;
		/**
		 * Emitted when bluetooth device needs to be selected on call to
		 * `navigator.bluetooth.requestDevice`. To use `navigator.bluetooth` api
		 * `webBluetooth` should be enabled. If `event.preventDefault` is not called, first
		 * available device will be selected. `callback` should be called with `deviceId`
		 * to be selected, passing empty string to `callback` will cancel the request.
		 */
		on(event: 'select-bluetooth-device', listener: (event: Event,
			devices: BluetoothDevice[],
			callback: (deviceId: string) => void) => void): this;
		once(event: 'select-bluetooth-device', listener: (event: Event,
			devices: BluetoothDevice[],
			callback: (deviceId: string) => void) => void): this;
		addListener(event: 'select-bluetooth-device', listener: (event: Event,
			devices: BluetoothDevice[],
			callback: (deviceId: string) => void) => void): this;
		removeListener(event: 'select-bluetooth-device', listener: (event: Event,
			devices: BluetoothDevice[],
			callback: (deviceId: string) => void) => void): this;
		/**
		 * Emitted when a client certificate is requested.
		 *
	The usage is the same with the `select-client-certificate` event of `app`.
		 */
		on(event: 'select-client-certificate', listener: (event: Event,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void) => void): this;
		once(event: 'select-client-certificate', listener: (event: Event,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void) => void): this;
		addListener(event: 'select-client-certificate', listener: (event: Event,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void) => void): this;
		removeListener(event: 'select-client-certificate', listener: (event: Event,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void) => void): this;
		/**
		 * Emitted when the web page becomes unresponsive.
		 */
		on(event: 'unresponsive', listener: Function): this;
		once(event: 'unresponsive', listener: Function): this;
		addListener(event: 'unresponsive', listener: Function): this;
		removeListener(event: 'unresponsive', listener: Function): this;
		/**
		 * Emitted when mouse moves over a link or the keyboard moves the focus to a link.
		 */
		on(event: 'update-target-url', listener: (event: Event,
			url: string) => void): this;
		once(event: 'update-target-url', listener: (event: Event,
			url: string) => void): this;
		addListener(event: 'update-target-url', listener: (event: Event,
			url: string) => void): this;
		removeListener(event: 'update-target-url', listener: (event: Event,
			url: string) => void): this;
		/**
		 * Emitted when a `<webview>`'s web contents is being attached to this web
		 * contents. Calling `event.preventDefault()` will destroy the guest page.
		 *
		 * This event can be used to configure `webPreferences` for the `webContents` of a
		 * `<webview>` before it's loaded, and provides the ability to set settings that
		 * can't be set via `<webview>` attributes.
		 *
		 * **Note:** The specified `preload` script option will be appear as `preloadURL`
		 * (not `preload`) in the `webPreferences` object emitted with this event.
		 */
		on(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: any,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: Record<string, string>) => void): this;
		once(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: WebPreferences,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: Record<string, string>) => void): this;
		addListener(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: WebPreferences,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: Record<string, string>) => void): this;
		removeListener(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: WebPreferences,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: Record<string, string>) => void): this;
		/**
		 * Emitted when a user or the page wants to start navigation. It can happen when
		 * the `window.location` object is changed or a user clicks a link in the page.
		 *
		 * This event will not emit when the navigation is started programmatically with
		 * APIs like `webContents.loadURL` and `webContents.back`.
		 *
		 * It is also not emitted for in-page navigations, such as clicking anchor links or
		 * updating the `window.location.hash`. Use `did-navigate-in-page` event for this
		 * purpose.

	Calling `event.preventDefault()` will prevent the navigation.
		 */
		on(event: 'will-navigate', listener: (event: Event,
			url: string) => void): this;
		once(event: 'will-navigate', listener: (event: Event,
			url: string) => void): this;
		addListener(event: 'will-navigate', listener: (event: Event,
			url: string) => void): this;
		removeListener(event: 'will-navigate', listener: (event: Event,
			url: string) => void): this;
		/**
		 * Emitted when a `beforeunload` event handler is attempting to cancel a page
		 * unload.
		 *
		 * Calling `event.preventDefault()` will ignore the `beforeunload` event handler
		 * and allow the page to be unloaded.
		 */
		on(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		once(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		addListener(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		removeListener(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		/**
		 * Emitted as a server side redirect occurs during navigation.  For example a 302
		 * redirect.
		 *
		 * This event will be emitted after `did-start-navigation` and always before the
		 * `did-redirect-navigation` event for the same navigation.
		 *
		 * Calling `event.preventDefault()` will prevent the navigation (not just the
		 * redirect).
		 */
		on(event: 'will-redirect', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		once(event: 'will-redirect', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		addListener(event: 'will-redirect', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		removeListener(event: 'will-redirect', listener: (event: Event,
			url: string,
			isInPlace: boolean,
			isMainFrame: boolean,
			frameProcessId: number,
			frameRoutingId: number) => void): this;
		/**
		 * Emitted when the user is requesting to change the zoom level using the mouse
		 * wheel.
		 */
		on(event: 'zoom-changed', listener: (event: Event,
			/**
			 * Can be `in` or `out`.
			 */
			zoomDirection: ('in' | 'out')) => void): this;
		once(event: 'zoom-changed', listener: (event: Event,
			/**
			 * Can be `in` or `out`.
			 */
			zoomDirection: ('in' | 'out')) => void): this;
		addListener(event: 'zoom-changed', listener: (event: Event,
			/**
			 * Can be `in` or `out`.
			 */
			zoomDirection: ('in' | 'out')) => void): this;
		removeListener(event: 'zoom-changed', listener: (event: Event,
			/**
			 * Can be `in` or `out`.
			 */
			zoomDirection: ('in' | 'out')) => void): this;
		/**
		 * Adds the specified path to DevTools workspace. Must be used after DevTools
		 * creation:
		 */
		addWorkSpace(path: string): void;
		/**
		 * Begin subscribing for presentation events and captured frames, the `callback`
		 * will be called with `callback(image, dirtyRect)` when there is a presentation
		 * event.
		 *
		 * The `image` is an instance of NativeImage that stores the captured frame.
		 *
		 * The `dirtyRect` is an object with `x, y, width, height` properties that
		 * describes which part of the page was repainted. If `onlyDirty` is set to `true`,
		 * `image` will only contain the repainted area. `onlyDirty` defaults to `false`.
		 */
		beginFrameSubscription(callback: (image: NativeImage, dirtyRect: Rectangle) => void): void;
		/**
		 * Begin subscribing for presentation events and captured frames, the `callback`
		 * will be called with `callback(image, dirtyRect)` when there is a presentation
		 * event.
		 *
		 * The `image` is an instance of NativeImage that stores the captured frame.
		 *
		 * The `dirtyRect` is an object with `x, y, width, height` properties that
		 * describes which part of the page was repainted. If `onlyDirty` is set to `true`,
		 * `image` will only contain the repainted area. `onlyDirty` defaults to `false`.
		 */
		beginFrameSubscription(onlyDirty: boolean, callback: (image: NativeImage, dirtyRect: Rectangle) => void): void;
		/**
		 * Whether the browser can go back to previous web page.
		 */
		canGoBack(): boolean;
		/**
		 * Whether the browser can go forward to next web page.
		 */
		canGoForward(): boolean;
		/**
		 * Whether the web page can go to `offset`.
		 */
		canGoToOffset(offset: number): boolean;
		/**
		 * Resolves with a NativeImage
		 *
		 * Captures a snapshot of the page within `rect`. Omitting `rect` will capture the
		 * whole visible page.
		 */
		capturePage(rect?: Rectangle): Promise<Electron.NativeImage>;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
		/**
		 * Closes the devtools.
		 */
		closeDevTools(): void;
		/**
		 * Executes the editing command `copy` in web page.
		 */
		copy(): void;
		/**
		 * Copy the image at the given position to the clipboard.
		 */
		copyImageAt(x: number, y: number): void;
		/**
		 * Executes the editing command `cut` in web page.
		 */
		cut(): void;
		/**
		 * Executes the editing command `delete` in web page.
		 */
		delete(): void;
		/**
		 * Disable device emulation enabled by `webContents.enableDeviceEmulation`.
		 */
		disableDeviceEmulation(): void;
		/**
		 * Initiates a download of the resource at `url` without navigating. The
		 * `will-download` event of `session` will be triggered.
		 */
		downloadURL(url: string): void;
		/**
		 * Enable device emulation with the given parameters.
		 */
		enableDeviceEmulation(parameters: Parameters): void;
		/**
		 * End subscribing for frame presentation events.
		 */
		endFrameSubscription(): void;
		/**
		 * A promise that resolves with the result of the executed code or is rejected if
		 * the result of the code is a rejected promise.
		 *
		 * Evaluates `code` in page.
		 *
		 * In the browser window some HTML APIs like `requestFullScreen` can only be
		 * invoked by a gesture from the user. Setting `userGesture` to `true` will remove
		 * this limitation.

	Code execution will be suspended until web page stop loading.
		 */
		executeJavaScript(code: string, userGesture?: boolean): Promise<any>;
		/**
		 * The request id used for the request.
		 *
		 * Starts a request to find all matches for the `text` in the web page. The result
		 * of the request can be obtained by subscribing to `found-in-page` event.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		/**
		 * Focuses the web page.
		 */
		focus(): void;
		/**
		 * If *offscreen rendering* is enabled returns the current frame rate.
		 *
	**Deprecated**
		 */
		getFrameRate(): number;
		/**
		 * The operating system `pid` of the associated renderer process.
		 */
		getOSProcessId(): number;
		/**
		 * Get the system printer list.

	Returns `PrinterInfo[]`.
		 */
		getPrinters(): void;
		/**
		 * The Chromium internal `pid` of the associated renderer. Can be compared to the
		 * `frameProcessId` passed by frame specific navigation events (e.g.
		 * `did-frame-navigate`)
		 */
		getProcessId(): number;
		/**
		 * The title of the current web page.
		 */
		getTitle(): string;
		/**
		 * the type of the webContent. Can be `backgroundPage`, `window`, `browserView`,
		 * `remote`, `webview` or `offscreen`.
		 */
		getType(): ('backgroundPage' | 'window' | 'browserView' | 'remote' | 'webview' | 'offscreen');
		/**
		 * The URL of the current web page.
		 */
		getURL(): string;
		/**
		 * The user agent for this web page.

	**Deprecated**
		 */
		getUserAgent(): string;
		/**
		 * Returns the WebRTC IP Handling Policy.
		 */
		getWebRTCIPHandlingPolicy(): string;
		/**
		 * the current zoom factor.

	**Deprecated**
		 */
		getZoomFactor(): number;
		/**
		 * the current zoom level.

	**Deprecated**
		 */
		getZoomLevel(): number;
		/**
		 * Makes the browser go back a web page.
		 */
		goBack(): void;
		/**
		 * Makes the browser go forward a web page.
		 */
		goForward(): void;
		/**
		 * Navigates browser to the specified absolute web page index.
		 */
		goToIndex(index: number): void;
		/**
		 * Navigates to the specified offset from the "current entry".
		 */
		goToOffset(offset: number): void;
		/**
		 * A promise that resolves with a key for the inserted CSS that can later be used
		 * to remove the CSS via `contents.removeInsertedCSS(key)`.
		 *
		 * Injects CSS into the current web page and returns a unique key for the inserted
		 * stylesheet.
		 */
		insertCSS(css: string, options?: InsertCSSOptions): Promise<string>;
		/**
		 * Inserts `text` to the focused element.
		 */
		insertText(text: string): Promise<void>;
		/**
		 * Starts inspecting element at position (`x`, `y`).
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the developer tools for the service worker context.
		 */
		inspectServiceWorker(): void;
		/**
		 * Opens the developer tools for the shared worker context.
		 */
		inspectSharedWorker(): void;
		/**
		 * Schedules a full repaint of the window this web contents is in.
		 *
		 * If *offscreen rendering* is enabled invalidates the frame and generates a new
		 * one through the `'paint'` event.
		 */
		invalidate(): void;
		/**
		 * Whether this page has been muted.

	**Deprecated**
		 */
		isAudioMuted(): boolean;
		/**
		 * Whether the renderer process has crashed.
		 */
		isCrashed(): boolean;
		/**
		 * Whether audio is currently playing.
		 */
		isCurrentlyAudible(): boolean;
		/**
		 * Whether the web page is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * Whether the devtools view is focused .
		 */
		isDevToolsFocused(): boolean;
		/**
		 * Whether the devtools is opened.
		 */
		isDevToolsOpened(): boolean;
		/**
		 * Whether the web page is focused.
		 */
		isFocused(): boolean;
		/**
		 * Whether web page is still loading resources.
		 */
		isLoading(): boolean;
		/**
		 * Whether the main frame (and not just iframes or frames within it) is still
		 * loading.
		 */
		isLoadingMainFrame(): boolean;
		/**
		 * Indicates whether *offscreen rendering* is enabled.
		 */
		isOffscreen(): boolean;
		/**
		 * If *offscreen rendering* is enabled returns whether it is currently painting.
		 */
		isPainting(): boolean;
		/**
		 * Whether the web page is waiting for a first-response from the main resource of
		 * the page.
		 */
		isWaitingForResponse(): boolean;
		/**
		 * the promise will resolve when the page has finished loading (see
		 * `did-finish-load`), and rejects if the page fails to load (see `did-fail-load`).
		 *
		 * Loads the given file in the window, `filePath` should be a path to an HTML file
		 * relative to the root of your application.  For instance an app structure like
		 * this:

	Would require code like this
		 */
		loadFile(filePath: string, options?: LoadFileOptions): Promise<void>;
		/**
		 * the promise will resolve when the page has finished loading (see
		 * `did-finish-load`), and rejects if the page fails to load (see `did-fail-load`).
		 * A noop rejection handler is already attached, which avoids unhandled rejection
		 * errors.
		 *
		 * Loads the `url` in the window. The `url` must contain the protocol prefix, e.g.
		 * the `http://` or `file://`. If the load should bypass http cache then use the
		 * `pragma` header to achieve it.
		 */
		loadURL(url: string, options?: LoadURLOptions): Promise<void>;
		/**
		 * Opens the devtools.
		 *
		 * When `contents` is a `<webview>` tag, the `mode` would be `detach` by default,
		 * explicitly passing an empty `mode` can force using last used dock state.
		 */
		openDevTools(options?: OpenDevToolsOptions): void;
		/**
		 * Executes the editing command `paste` in web page.
		 */
		paste(): void;
		/**
		 * Executes the editing command `pasteAndMatchStyle` in web page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Prints window's web page. When `silent` is set to `true`, Electron will pick the
		 * system's default printer if `deviceName` is empty and the default settings for
		 * printing.
		 *
		 * Use `page-break-before: always;` CSS style to force to print to a new page.
		 *
	Example usage:
		 */
		print(options?: PrintOptions, callback?: (success: boolean, failureReason: 'cancelled' | 'failed') => void): void;
		/**
		 * Resolves with the generated PDF data.
		 *
		 * Prints window's web page as PDF with Chromium's preview printing custom
		 * settings.
		 *
		 * The `landscape` will be ignored if `@page` CSS at-rule is used in the web page.
		 *
		 * By default, an empty `options` will be regarded as:
		 *
		 * Use `page-break-before: always;` CSS style to force to print to a new page.
		 *
	An example of `webContents.printToPDF`:
		 */
		printToPDF(options: PrintToPDFOptions): Promise<Buffer>;
		/**
		 * Executes the editing command `redo` in web page.
		 */
		redo(): void;
		/**
		 * Reloads the current web page.
		 */
		reload(): void;
		/**
		 * Reloads current page and ignores cache.
		 */
		reloadIgnoringCache(): void;
		/**
		 * Resolves if the removal was successful.
		 *
		 * Removes the inserted CSS from the current web page. The stylesheet is identified
		 * by its key, which is returned from `contents.insertCSS(css)`.
		 */
		removeInsertedCSS(key: string): Promise<void>;
		/**
		 * Removes the specified path from DevTools workspace.
		 */
		removeWorkSpace(path: string): void;
		/**
		 * Executes the editing command `replace` in web page.
		 */
		replace(text: string): void;
		/**
		 * Executes the editing command `replaceMisspelling` in web page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * resolves if the page is saved.
		 */
		savePage(fullPath: string, saveType: 'HTMLOnly' | 'HTMLComplete' | 'MHTML'): Promise<void>;
		/**
		 * Executes the editing command `selectAll` in web page.
		 */
		selectAll(): void;
		/**
		 * Send an asynchronous message to renderer process via `channel`, you can also
		 * send arbitrary arguments. Arguments will be serialized in JSON internally and
		 * hence no functions or prototype chain will be included.
		 *
		 * The renderer process can handle the message by listening to `channel` with the
		 * `ipcRenderer` module.
		 *
	An example of sending messages from the main process to the renderer process:
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Sends an input `event` to the page. **Note:** The `BrowserWindow` containing the
		 * contents needs to be focused for `sendInputEvent()` to work.
		 */
		sendInputEvent(inputEvent: (MouseInputEvent) | (MouseWheelInputEvent) | (KeyboardInputEvent)): void;
		/**
		 * Send an asynchronous message to a specific frame in a renderer process via
		 * `channel`. Arguments will be serialized as JSON internally and as such no
		 * functions or prototype chains will be included.
		 *
		 * The renderer process can handle the message by listening to `channel` with the
		 * `ipcRenderer` module.
		 *
		 * If you want to get the `frameId` of a given renderer context you should use the
		 * `webFrame.routingId` value.  E.g.
		 *
	You can also read `frameId` from all incoming IPC messages in the main process.
		 */
		sendToFrame(frameId: number, channel: string, ...args: any[]): void;
		/**
		 * Mute the audio on the current web page.

	**Deprecated**
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * Controls whether or not this WebContents will throttle animations and timers
		 * when the page becomes backgrounded. This also affects the Page Visibility API.
		 */
		setBackgroundThrottling(allowed: boolean): void;
		/**
		 * Uses the `devToolsWebContents` as the target `WebContents` to show devtools.
		 *
		 * The `devToolsWebContents` must not have done any navigation, and it should not
		 * be used for other purposes after the call.
		 *
		 * By default Electron manages the devtools by creating an internal `WebContents`
		 * with native view, which developers have very limited control of. With the
		 * `setDevToolsWebContents` method, developers can use any `WebContents` to show
		 * the devtools in it, including `BrowserWindow`, `BrowserView` and `<webview>`
		 * tag.
		 *
		 * Note that closing the devtools does not destroy the `devToolsWebContents`, it is
		 * caller's responsibility to destroy `devToolsWebContents`.
		 *
		 * An example of showing devtools in a `<webview>` tag:
		 *
	An example of showing devtools in a `BrowserWindow`:
		 */
		setDevToolsWebContents(devToolsWebContents: WebContents): void;
		/**
		 * If *offscreen rendering* is enabled sets the frame rate to the specified number.
		 * Only values between 1 and 60 are accepted.

	**Deprecated**
		 */
		setFrameRate(fps: number): void;
		/**
		 * Ignore application menu shortcuts while this web contents is focused.
		 *
		 * @experimental
		 */
		setIgnoreMenuShortcuts(ignore: boolean): void;
		/**
		 * Sets the maximum and minimum layout-based (i.e. non-visual) zoom level.
		 */
		setLayoutZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
		/**
		 * Overrides the user agent for this web page.

	**Deprecated**
		 */
		setUserAgent(userAgent: string): void;
		/**
		 * Sets the maximum and minimum pinch-to-zoom level.
		 *
		 * > **NOTE**: Visual zoom is disabled by default in Electron. To re-enable it,
		 * call:
		 */
		setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
		/**
		 * Setting the WebRTC IP handling policy allows you to control which IPs are
		 * exposed via WebRTC. See BrowserLeaks for more details.
		 */
		setWebRTCIPHandlingPolicy(policy: 'default' | 'default_public_interface_only' | 'default_public_and_private_interfaces' | 'disable_non_proxied_udp'): void;
		/**
		 * Changes the zoom factor to the specified factor. Zoom factor is zoom percent
		 * divided by 100, so 300% = 3.0.

	**Deprecated**
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Changes the zoom level to the specified level. The original size is 0 and each
		 * increment above or below represents zooming 20% larger or smaller to default
		 * limits of 300% and 50% of original size, respectively. The formula for this is
		 * `scale := 1.2 ^ level`.

	**Deprecated**
		 */
		setZoomLevel(level: number): void;
		/**
		 * Shows pop-up dictionary that searches the selected word on the page.
		 *
		 * @platform darwin
		 */
		showDefinitionForSelection(): void;
		/**
		 * Sets the `item` as dragging item for current drag-drop operation, `file` is the
		 * absolute path of the file to be dragged, and `icon` is the image showing under
		 * the cursor when dragging.
		 */
		startDrag(item: Item): void;
		/**
		 * If *offscreen rendering* is enabled and not painting, start painting.
		 */
		startPainting(): void;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Stops any `findInPage` request for the `webContents` with the provided `action`.
		 */
		stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
		/**
		 * If *offscreen rendering* is enabled and painting, stop painting.
		 */
		stopPainting(): void;
		/**
		 * Indicates whether the snapshot has been created successfully.
		 *
	Takes a V8 heap snapshot and saves it to `filePath`.
		 */
		takeHeapSnapshot(filePath: string): Promise<void>;
		/**
		 * Toggles the developer tools.
		 */
		toggleDevTools(): void;
		/**
		 * Executes the editing command `undo` in web page.
		 */
		undo(): void;
		/**
		 * Executes the editing command `unselect` in web page.
		 */
		unselect(): void;
		audioMuted: boolean;
		readonly debugger: Debugger;
		readonly devToolsWebContents: WebContents;
		frameRate: number;
		readonly hostWebContents: WebContents;
		readonly id: number;
		readonly session: Session;
		userAgent: string;
		zoomFactor: number;
		zoomLevel: number;
	}

	interface WebFrame extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/web-frame

		/**
		 * Attempts to free memory that is no longer being used (like images from a
		 * previous navigation).
		 *
		 * Note that blindly calling this method probably makes Electron slower since it
		 * will have to refill these emptied caches, you should only call it if an event in
		 * your app has occurred that makes you think your page is actually using less
		 * memory (i.e. you have navigated from a super heavy page to a mostly empty one,
		 * and intend to stay there).
		 */
		clearCache(): void;
		/**
		 * A promise that resolves with the result of the executed code or is rejected if
		 * the result of the code is a rejected promise.
		 *
		 * Evaluates `code` in page.
		 *
		 * In the browser window some HTML APIs like `requestFullScreen` can only be
		 * invoked by a gesture from the user. Setting `userGesture` to `true` will remove
		 * this limitation.
		 */
		executeJavaScript(code: string, userGesture?: boolean): Promise<any>;
		/**
		 * A promise that resolves with the result of the executed code or is rejected if
		 * the result of the code is a rejected promise.
		 *
	Works like `executeJavaScript` but evaluates `scripts` in an isolated context.
		 */
		executeJavaScriptInIsolatedWorld(worldId: number, scripts: WebSource[], userGesture?: boolean): Promise<any>;
		/**
		 * A child of `webFrame` with the supplied `name`, `null` would be returned if
		 * there's no such frame or if the frame is not in the current renderer process.
		 */
		findFrameByName(name: string): WebFrame;
		/**
		 * that has the supplied `routingId`, `null` if not found.
		 */
		findFrameByRoutingId(routingId: number): WebFrame;
		/**
		 * The frame element in `webFrame's` document selected by `selector`, `null` would
		 * be returned if `selector` does not select a frame or if the frame is not in the
		 * current renderer process.
		 */
		getFrameForSelector(selector: string): WebFrame;
		/**
		 * * `images` MemoryUsageDetails
		 * * `scripts` MemoryUsageDetails
		 * * `cssStyleSheets` MemoryUsageDetails
		 * * `xslStyleSheets` MemoryUsageDetails
		 * * `fonts` MemoryUsageDetails
		 * * `other` MemoryUsageDetails
		 *
		 * Returns an object describing usage information of Blink's internal memory
		 * caches.

	This will generate:
		 */
		getResourceUsage(): ResourceUsage;
		/**
		 * The current zoom factor.
		 */
		getZoomFactor(): number;
		/**
		 * The current zoom level.
		 */
		getZoomLevel(): number;
		/**
		 * A key for the inserted CSS that can later be used to remove the CSS via
		 * `webFrame.removeInsertedCSS(key)`.
		 *
		 * Injects CSS into the current web page and returns a unique key for the inserted
		 * stylesheet.
		 */
		insertCSS(css: string): string;
		/**
		 * Inserts `text` to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Removes the inserted CSS from the current web page. The stylesheet is identified
		 * by its key, which is returned from `webFrame.insertCSS(css)`.
		 */
		removeInsertedCSS(key: string): void;
		/**
		 * Set the security origin, content security policy and name of the isolated world.
		 * Note: If the `csp` is specified, then the `securityOrigin` also has to be
		 * specified.
		 */
		setIsolatedWorldInfo(worldId: number, info: Info): void;
		/**
		 * Sets the maximum and minimum layout-based (i.e. non-visual) zoom level.
		 */
		setLayoutZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Sets a provider for spell checking in input fields and text areas.
		 *
		 * The `provider` must be an object that has a `spellCheck` method that accepts an
		 * array of individual words for spellchecking. The `spellCheck` function runs
		 * asynchronously and calls the `callback` function with an array of misspelt words
		 * when complete.

	An example of using node-spellchecker as provider:
		 */
		setSpellCheckProvider(language: string, provider: Provider): void;
		/**
		 * Sets the maximum and minimum pinch-to-zoom level.
		 *
		 * > **NOTE**: Visual zoom is disabled by default in Electron. To re-enable it,
		 * call:
		 */
		setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Changes the zoom factor to the specified factor. Zoom factor is zoom percent
		 * divided by 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Changes the zoom level to the specified level. The original size is 0 and each
		 * increment above or below represents zooming 20% larger or smaller to default
		 * limits of 300% and 50% of original size, respectively.
		 */
		setZoomLevel(level: number): void;
		/**
		 * A `WebFrame | null` representing the first child frame of `webFrame`, the
		 * property would be `null` if `webFrame` has no children or if first child is not
		 * in the current renderer process.
		 *
		 */
		readonly firstChild: (WebFrame) | (null);
		/**
		 * A `WebFrame | null` representing next sibling frame, the property would be
		 * `null` if `webFrame` is the last frame in its parent or if the next sibling is
		 * not in the current renderer process.
		 *
		 */
		readonly nextSibling: (WebFrame) | (null);
		/**
		 * A `WebFrame | null` representing the frame which opened `webFrame`, the property
		 * would be `null` if there's no opener or opener is not in the current renderer
		 * process.
		 *
		 */
		readonly opener: (WebFrame) | (null);
		/**
		 * A `WebFrame | null` representing parent frame of `webFrame`, the property would
		 * be `null` if `webFrame` is top or parent is not in the current renderer process.
		 *
		 */
		readonly parent: (WebFrame) | (null);
		/**
		 * An `Integer` representing the unique frame id in the current renderer process.
		 * Distinct WebFrame instances that refer to the same underlying frame will have
		 * the same `routingId`.
		 *
		 */
		readonly routingId: number;
		/**
		 * A `WebFrame | null` representing top frame in frame hierarchy to which
		 * `webFrame` belongs, the property would be `null` if top frame is not in the
		 * current renderer process.
		 *
		 */
		readonly top: (WebFrame) | (null);
	}

	class WebRequest {

		// Docs: http://electronjs.org/docs/api/web-request

		/**
		 * The `listener` will be called with `listener(details)` when a server initiated
		 * redirect is about to occur.
		 */
		onBeforeRedirect(listener: ((details: OnBeforeRedirectListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when a server initiated
		 * redirect is about to occur.
		 */
		onBeforeRedirect(filter: OnBeforeRedirectFilter, listener: ((details: OnBeforeRedirectListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` when a request
		 * is about to occur.
		 *
		 * The `uploadData` is an array of `UploadData` objects.
		 *
		 * The `callback` has to be called with an `response` object.
		 *
	Some examples of valid `urls`:
		 */
		onBeforeRequest(listener: ((details: OnBeforeRequestListenerDetails, callback: (response: Response) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` when a request
		 * is about to occur.
		 *
		 * The `uploadData` is an array of `UploadData` objects.
		 *
		 * The `callback` has to be called with an `response` object.
		 *
	Some examples of valid `urls`:
		 */
		onBeforeRequest(filter: OnBeforeRequestFilter, listener: ((details: OnBeforeRequestListenerDetails, callback: (response: Response) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` before sending
		 * an HTTP request, once the request headers are available. This may occur after a
		 * TCP connection is made to the server, but before any http data is sent.
		 *
	The `callback` has to be called with an `response` object.
		 */
		onBeforeSendHeaders(filter: OnBeforeSendHeadersFilter, listener: ((details: OnBeforeSendHeadersListenerDetails, callback: (beforeSendResponse: BeforeSendResponse) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` before sending
		 * an HTTP request, once the request headers are available. This may occur after a
		 * TCP connection is made to the server, but before any http data is sent.
		 *
	The `callback` has to be called with an `response` object.
		 */
		onBeforeSendHeaders(listener: ((details: OnBeforeSendHeadersListenerDetails, callback: (beforeSendResponse: BeforeSendResponse) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when a request is
		 * completed.
		 */
		onCompleted(filter: OnCompletedFilter, listener: ((details: OnCompletedListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when a request is
		 * completed.
		 */
		onCompleted(listener: ((details: OnCompletedListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when an error occurs.
		 */
		onErrorOccurred(listener: ((details: OnErrorOccurredListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when an error occurs.
		 */
		onErrorOccurred(filter: OnErrorOccurredFilter, listener: ((details: OnErrorOccurredListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` when HTTP
		 * response headers of a request have been received.
		 *
	The `callback` has to be called with an `response` object.
		 */
		onHeadersReceived(filter: OnHeadersReceivedFilter, listener: ((details: OnHeadersReceivedListenerDetails, callback: (headersReceivedResponse: HeadersReceivedResponse) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details, callback)` when HTTP
		 * response headers of a request have been received.
		 *
	The `callback` has to be called with an `response` object.
		 */
		onHeadersReceived(listener: ((details: OnHeadersReceivedListenerDetails, callback: (headersReceivedResponse: HeadersReceivedResponse) => void) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when first byte of the
		 * response body is received. For HTTP requests, this means that the status line
		 * and response headers are available.
		 */
		onResponseStarted(listener: ((details: OnResponseStartedListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` when first byte of the
		 * response body is received. For HTTP requests, this means that the status line
		 * and response headers are available.
		 */
		onResponseStarted(filter: OnResponseStartedFilter, listener: ((details: OnResponseStartedListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` just before a request is
		 * going to be sent to the server, modifications of previous `onBeforeSendHeaders`
		 * response are visible by the time this listener is fired.
		 */
		onSendHeaders(filter: OnSendHeadersFilter, listener: ((details: OnSendHeadersListenerDetails) => void) | (null)): void;
		/**
		 * The `listener` will be called with `listener(details)` just before a request is
		 * going to be sent to the server, modifications of previous `onBeforeSendHeaders`
		 * response are visible by the time this listener is fired.
		 */
		onSendHeaders(listener: ((details: OnSendHeadersListenerDetails) => void) | (null)): void;
	}

	interface WebSource {

		// Docs: http://electronjs.org/docs/api/structures/web-source

		code: string;
		/**
		 * Default is 1.
		 */
		startLine?: number;
		url?: string;
	}

	interface WebviewTag extends HTMLElement {

		// Docs: http://electronjs.org/docs/api/webview-tag

		/**
		 * Fired when a load has committed. This includes navigation within the current
		 * document as well as subframe document-level loads, but does not include
		 * asynchronous resource loads.
		 */
		addEventListener(event: 'load-commit', listener: (event: LoadCommitEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'load-commit', listener: (event: LoadCommitEvent) => void): this;
		/**
		 * Fired when the navigation is done, i.e. the spinner of the tab will stop
		 * spinning, and the `onload` event is dispatched.
		 */
		addEventListener(event: 'did-finish-load', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-finish-load', listener: (event: Event) => void): this;
		/**
		 * This event is like `did-finish-load`, but fired when the load failed or was
		 * cancelled, e.g. `window.stop()` is invoked.
		 */
		addEventListener(event: 'did-fail-load', listener: (event: DidFailLoadEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-fail-load', listener: (event: DidFailLoadEvent) => void): this;
		/**
		 * Fired when a frame has done navigation.
		 */
		addEventListener(event: 'did-frame-finish-load', listener: (event: DidFrameFinishLoadEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-frame-finish-load', listener: (event: DidFrameFinishLoadEvent) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab starts spinning.
		 */
		addEventListener(event: 'did-start-loading', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-start-loading', listener: (event: Event) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab stops spinning.
		 */
		addEventListener(event: 'did-stop-loading', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-stop-loading', listener: (event: Event) => void): this;
		/**
		 * Fired when document in the given frame is loaded.
		 */
		addEventListener(event: 'dom-ready', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'dom-ready', listener: (event: Event) => void): this;
		/**
		 * Fired when page title is set during navigation. `explicitSet` is false when
		 * title is synthesized from file url.
		 */
		addEventListener(event: 'page-title-updated', listener: (event: PageTitleUpdatedEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'page-title-updated', listener: (event: PageTitleUpdatedEvent) => void): this;
		/**
		 * Fired when page receives favicon urls.
		 */
		addEventListener(event: 'page-favicon-updated', listener: (event: PageFaviconUpdatedEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'page-favicon-updated', listener: (event: PageFaviconUpdatedEvent) => void): this;
		/**
		 * Fired when page enters fullscreen triggered by HTML API.
		 */
		addEventListener(event: 'enter-html-full-screen', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'enter-html-full-screen', listener: (event: Event) => void): this;
		/**
		 * Fired when page leaves fullscreen triggered by HTML API.
		 */
		addEventListener(event: 'leave-html-full-screen', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'leave-html-full-screen', listener: (event: Event) => void): this;
		/**
		 * Fired when the guest window logs a console message.
		 *
		 * The following example code forwards all log messages to the embedder's console
		 * without regard for log level or other properties.
		 */
		addEventListener(event: 'console-message', listener: (event: ConsoleMessageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'console-message', listener: (event: ConsoleMessageEvent) => void): this;
		/**
		 * Fired when a result is available for `webview.findInPage` request.
		 */
		addEventListener(event: 'found-in-page', listener: (event: FoundInPageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'found-in-page', listener: (event: FoundInPageEvent) => void): this;
		/**
		 * Fired when the guest page attempts to open a new browser window.
		 *
	The following example code opens the new url in system's default browser.
		 */
		addEventListener(event: 'new-window', listener: (event: NewWindowEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'new-window', listener: (event: NewWindowEvent) => void): this;
		/**
		 * Emitted when a user or the page wants to start navigation. It can happen when
		 * the `window.location` object is changed or a user clicks a link in the page.
		 *
		 * This event will not emit when the navigation is started programmatically with
		 * APIs like `<webview>.loadURL` and `<webview>.back`.
		 *
		 * It is also not emitted during in-page navigation, such as clicking anchor links
		 * or updating the `window.location.hash`. Use `did-navigate-in-page` event for
		 * this purpose.

	Calling `event.preventDefault()` does __NOT__ have any effect.
		 */
		addEventListener(event: 'will-navigate', listener: (event: WillNavigateEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'will-navigate', listener: (event: WillNavigateEvent) => void): this;
		/**
		 * Emitted when a navigation is done.
		 *
		 * This event is not emitted for in-page navigations, such as clicking anchor links
		 * or updating the `window.location.hash`. Use `did-navigate-in-page` event for
		 * this purpose.
		 */
		addEventListener(event: 'did-navigate', listener: (event: DidNavigateEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-navigate', listener: (event: DidNavigateEvent) => void): this;
		/**
		 * Emitted when an in-page navigation happened.
		 *
		 * When in-page navigation happens, the page URL changes but does not cause
		 * navigation outside of the page. Examples of this occurring are when anchor links
		 * are clicked or when the DOM `hashchange` event is triggered.
		 */
		addEventListener(event: 'did-navigate-in-page', listener: (event: DidNavigateInPageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-navigate-in-page', listener: (event: DidNavigateInPageEvent) => void): this;
		/**
		 * Fired when the guest page attempts to close itself.
		 *
		 * The following example code navigates the `webview` to `about:blank` when the
		 * guest attempts to close itself.
		 */
		addEventListener(event: 'close', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Fired when the guest page has sent an asynchronous message to embedder page.
		 *
		 * With `sendToHost` method and `ipc-message` event you can communicate between
		 * guest page and embedder page:
		 */
		addEventListener(event: 'ipc-message', listener: (event: IpcMessageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'ipc-message', listener: (event: IpcMessageEvent) => void): this;
		/**
		 * Fired when the renderer process is crashed.
		 */
		addEventListener(event: 'crashed', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'crashed', listener: (event: Event) => void): this;
		/**
		 * Fired when a plugin process is crashed.
		 */
		addEventListener(event: 'plugin-crashed', listener: (event: PluginCrashedEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'plugin-crashed', listener: (event: PluginCrashedEvent) => void): this;
		/**
		 * Fired when the WebContents is destroyed.
		 */
		addEventListener(event: 'destroyed', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'destroyed', listener: (event: Event) => void): this;
		/**
		 * Emitted when media starts playing.
		 */
		addEventListener(event: 'media-started-playing', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'media-started-playing', listener: (event: Event) => void): this;
		/**
		 * Emitted when media is paused or done playing.
		 */
		addEventListener(event: 'media-paused', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'media-paused', listener: (event: Event) => void): this;
		/**
		 * Emitted when a page's theme color changes. This is usually due to encountering a
		 * meta tag:
		 */
		addEventListener(event: 'did-change-theme-color', listener: (event: DidChangeThemeColorEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-change-theme-color', listener: (event: DidChangeThemeColorEvent) => void): this;
		/**
		 * Emitted when mouse moves over a link or the keyboard moves the focus to a link.
		 */
		addEventListener(event: 'update-target-url', listener: (event: UpdateTargetUrlEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'update-target-url', listener: (event: UpdateTargetUrlEvent) => void): this;
		/**
		 * Emitted when DevTools is opened.
		 */
		addEventListener(event: 'devtools-opened', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'devtools-opened', listener: (event: Event) => void): this;
		/**
		 * Emitted when DevTools is closed.
		 */
		addEventListener(event: 'devtools-closed', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'devtools-closed', listener: (event: Event) => void): this;
		/**
		 * Emitted when DevTools is focused / opened.
		 */
		addEventListener(event: 'devtools-focused', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'devtools-focused', listener: (event: Event) => void): this;
		addEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, useCapture?: boolean): void;
		addEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
		removeEventListener<K extends keyof HTMLElementEventMap>(type: K, listener: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any, useCapture?: boolean): void;
		removeEventListener(type: string, listener: EventListenerOrEventListenerObject, useCapture?: boolean): void;
		/**
		 * Whether the guest page can go back.
		 */
		canGoBack(): boolean;
		/**
		 * Whether the guest page can go forward.
		 */
		canGoForward(): boolean;
		/**
		 * Whether the guest page can go to `offset`.
		 */
		canGoToOffset(offset: number): boolean;
		/**
		 * Resolves with a NativeImage
		 *
		 * Captures a snapshot of the page within `rect`. Omitting `rect` will capture the
		 * whole visible page.
		 */
		capturePage(rect?: Rectangle): Promise<Electron.NativeImage>;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
		/**
		 * Closes the DevTools window of guest page.
		 */
		closeDevTools(): void;
		/**
		 * Executes editing command `copy` in page.
		 */
		copy(): void;
		/**
		 * Executes editing command `cut` in page.
		 */
		cut(): void;
		/**
		 * Executes editing command `delete` in page.
		 */
		delete(): void;
		/**
		 * Initiates a download of the resource at `url` without navigating.
		 */
		downloadURL(url: string): void;
		/**
		 * A promise that resolves with the result of the executed code or is rejected if
		 * the result of the code is a rejected promise.
		 *
		 * Evaluates `code` in page. If `userGesture` is set, it will create the user
		 * gesture context in the page. HTML APIs like `requestFullScreen`, which require
		 * user action, can take advantage of this option for automation.
		 */
		executeJavaScript(code: string, userGesture?: boolean): Promise<any>;
		/**
		 * The request id used for the request.
		 *
		 * Starts a request to find all matches for the `text` in the web page. The result
		 * of the request can be obtained by subscribing to `found-in-page` event.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		/**
		 * The title of guest page.
		 */
		getTitle(): string;
		/**
		 * The URL of guest page.
		 */
		getURL(): string;
		/**
		 * The user agent for guest page.
		 */
		getUserAgent(): string;
		/**
		 * The web contents associated with this `webview`.
		 *
		 * It depends on the `remote` module, it is therefore not available when this
		 * module is disabled.
		 */
		getWebContents(): WebContents;
		/**
		 * The WebContents ID of this `webview`.
		 */
		getWebContentsId(): number;
		/**
		 * the current zoom factor.
		 */
		getZoomFactor(): number;
		/**
		 * the current zoom level.
		 */
		getZoomLevel(): number;
		/**
		 * Makes the guest page go back.
		 */
		goBack(): void;
		/**
		 * Makes the guest page go forward.
		 */
		goForward(): void;
		/**
		 * Navigates to the specified absolute index.
		 */
		goToIndex(index: number): void;
		/**
		 * Navigates to the specified offset from the "current entry".
		 */
		goToOffset(offset: number): void;
		/**
		 * A promise that resolves with a key for the inserted CSS that can later be used
		 * to remove the CSS via `<webview>.removeInsertedCSS(key)`.
		 *
		 * Injects CSS into the current web page and returns a unique key for the inserted
		 * stylesheet.
		 */
		insertCSS(css: string): Promise<string>;
		/**
		 * Inserts `text` to the focused element.
		 */
		insertText(text: string): Promise<void>;
		/**
		 * Starts inspecting element at position (`x`, `y`) of guest page.
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the DevTools for the service worker context present in the guest page.
		 */
		inspectServiceWorker(): void;
		/**
		 * Opens the DevTools for the shared worker context present in the guest page.
		 */
		inspectSharedWorker(): void;
		/**
		 * Whether guest page has been muted.
		 */
		isAudioMuted(): boolean;
		/**
		 * Whether the renderer process has crashed.
		 */
		isCrashed(): boolean;
		/**
		 * Whether audio is currently playing.
		 */
		isCurrentlyAudible(): boolean;
		/**
		 * Whether DevTools window of guest page is focused.
		 */
		isDevToolsFocused(): boolean;
		/**
		 * Whether guest page has a DevTools window attached.
		 */
		isDevToolsOpened(): boolean;
		/**
		 * Whether guest page is still loading resources.
		 */
		isLoading(): boolean;
		/**
		 * Whether the main frame (and not just iframes or frames within it) is still
		 * loading.
		 */
		isLoadingMainFrame(): boolean;
		/**
		 * Whether the guest page is waiting for a first-response for the main resource of
		 * the page.
		 */
		isWaitingForResponse(): boolean;
		/**
		 * The promise will resolve when the page has finished loading (see
		 * `did-finish-load`), and rejects if the page fails to load (see `did-fail-load`).
		 *
		 * Loads the `url` in the webview, the `url` must contain the protocol prefix, e.g.
		 * the `http://` or `file://`.
		 */
		loadURL(url: string, options?: LoadURLOptions): Promise<void>;
		/**
		 * Opens a DevTools window for guest page.
		 */
		openDevTools(): void;
		/**
		 * Executes editing command `paste` in page.
		 */
		paste(): void;
		/**
		 * Executes editing command `pasteAndMatchStyle` in page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Prints `webview`'s web page. Same as `webContents.print([options])`.
		 */
		print(options?: PrintOptions): Promise<void>;
		/**
		 * Resolves with the generated PDF data.
		 *
	Prints `webview`'s web page as PDF, Same as `webContents.printToPDF(options)`.
		 */
		printToPDF(options: PrintToPDFOptions): Promise<Buffer>;
		/**
		 * Executes editing command `redo` in page.
		 */
		redo(): void;
		/**
		 * Reloads the guest page.
		 */
		reload(): void;
		/**
		 * Reloads the guest page and ignores cache.
		 */
		reloadIgnoringCache(): void;
		/**
		 * Resolves if the removal was successful.
		 *
		 * Removes the inserted CSS from the current web page. The stylesheet is identified
		 * by its key, which is returned from `<webview>.insertCSS(css)`.
		 */
		removeInsertedCSS(key: string): Promise<void>;
		/**
		 * Executes editing command `replace` in page.
		 */
		replace(text: string): void;
		/**
		 * Executes editing command `replaceMisspelling` in page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * Executes editing command `selectAll` in page.
		 */
		selectAll(): void;
		/**
		 * Send an asynchronous message to renderer process via `channel`, you can also
		 * send arbitrary arguments. The renderer process can handle the message by
		 * listening to the `channel` event with the `ipcRenderer` module.
		 *
	See webContents.send for examples.
		 */
		send(channel: string, ...args: any[]): Promise<void>;
		/**
		 * Sends an input `event` to the page.
		 *
	See webContents.sendInputEvent for detailed description of `event` object.
		 */
		sendInputEvent(event: (MouseInputEvent) | (MouseWheelInputEvent) | (KeyboardInputEvent)): Promise<void>;
		/**
		 * Set guest page muted.
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * Sets the maximum and minimum layout-based (i.e. non-visual) zoom level.
		 */
		setLayoutZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
		/**
		 * Overrides the user agent for the guest page.
		 */
		setUserAgent(userAgent: string): void;
		/**
		 * Sets the maximum and minimum pinch-to-zoom level.
		 */
		setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): Promise<void>;
		/**
		 * Changes the zoom factor to the specified factor. Zoom factor is zoom percent
		 * divided by 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Changes the zoom level to the specified level. The original size is 0 and each
		 * increment above or below represents zooming 20% larger or smaller to default
		 * limits of 300% and 50% of original size, respectively. The formula for this is
		 * `scale := 1.2 ^ level`.
		 */
		setZoomLevel(level: number): void;
		/**
		 * Shows pop-up dictionary that searches the selected word on the page.
		 *
		 * @platform darwin
		 */
		showDefinitionForSelection(): void;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Stops any `findInPage` request for the `webview` with the provided `action`.
		 */
		stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
		/**
		 * Executes editing command `undo` in page.
		 */
		undo(): void;
		/**
		 * Executes editing command `unselect` in page.
		 */
		unselect(): void;
		/**
		 * A `Boolean`. When this attribute is present the guest page will be allowed to
		 * open new windows. Popups are disabled by default.
		 */
		// allowpopups?: string; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * A `String` which is a list of strings which specifies the blink features to be
		 * disabled separated by `,`. The full list of supported feature strings can be
		 * found in the RuntimeEnabledFeatures.json5 file.
		 */
		disableblinkfeatures: string;
		/**
		 * A `Boolean`. When this attribute is present the guest page will have web
		 * security disabled. Web security is enabled by default.
		 */
		// disablewebsecurity?: string; ### VSCODE CHANGE(https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * A `String` which is a list of strings which specifies the blink features to be
		 * enabled separated by `,`. The full list of supported feature strings can be
		 * found in the RuntimeEnabledFeatures.json5 file.
		 */
		enableblinkfeatures: string;
		/**
		 * A `Boolean`. When this attribute is `false` the guest page in `webview` will not
		 * have access to the `remote` module. The remote module is available by default.
		 */
		enableremotemodule: boolean;
		/**
		 * A `String` that sets the referrer URL for the guest page.
		 */
		httpreferrer: string;
		/**
		 * A `Boolean`. When this attribute is present the guest page in `webview` will
		 * have node integration and can use node APIs like `require` and `process` to
		 * access low level system resources. Node integration is disabled by default in
		 * the guest page.
		 */
		nodeintegration: boolean;
		/**
		 * A `Boolean` for the experimental option for enabling NodeJS support in
		 * sub-frames such as iframes inside the `webview`. All your preloads will load for
		 * every iframe, you can use `process.isMainFrame` to determine if you are in the
		 * main frame or not. This option is disabled by default in the guest page.
		 */
		nodeintegrationinsubframes: boolean;
		/**
		 * A `String` that sets the session used by the page. If `partition` starts with
		 * `persist:`, the page will use a persistent session available to all pages in the
		 * app with the same `partition`. if there is no `persist:` prefix, the page will
		 * use an in-memory session. By assigning the same `partition`, multiple pages can
		 * share the same session. If the `partition` is unset then default session of the
		 * app will be used.
		 *
		 * This value can only be modified before the first navigation, since the session
		 * of an active renderer process cannot change. Subsequent attempts to modify the
		 * value will fail with a DOM exception.
		 */
		partition: string;
		/**
		 * A `Boolean`. When this attribute is present the guest page in `webview` will be
		 * able to use browser plugins. Plugins are disabled by default.
		 */
		plugins: boolean;
		/**
		 * A `String` that specifies a script that will be loaded before other scripts run
		 * in the guest page. The protocol of script's URL must be either `file:` or
		 * `asar:`, because it will be loaded by `require` in guest page under the hood.
		 *
		 * When the guest page doesn't have node integration this script will still have
		 * access to all Node APIs, but global objects injected by Node will be deleted
		 * after this script has finished executing.
		 *
		 * **Note:** This option will appear as `preloadURL` (not `preload`) in the
		 * `webPreferences` specified to the `will-attach-webview` event.
		 */
		preload: string;
		/**
		 * A `String` representing the visible URL. Writing to this attribute initiates
		 * top-level navigation.
		 *
		 * Assigning `src` its own value will reload the current page.
		 *
		 * The `src` attribute can also accept data URLs, such as `data:text/plain,Hello,
		 * world!`.
		 */
		src: string;
		/**
		 * A `String` that sets the user agent for the guest page before the page is
		 * navigated to. Once the page is loaded, use the `setUserAgent` method to change
		 * the user agent.
		 */
		useragent: string;
		/**
		 * A `String` which is a comma separated list of strings which specifies the web
		 * preferences to be set on the webview. The full list of supported preference
		 * strings can be found in BrowserWindow.
		 *
		 * The string follows the same format as the features string in `window.open`. A
		 * name by itself is given a `true` boolean value. A preference can be set to
		 * another value by including an `=`, followed by the value. Special values `yes`
		 * and `1` are interpreted as `true`, while `no` and `0` are interpreted as
		 * `false`.
		 */
		webpreferences: string;
	}

	interface AboutPanelOptionsOptions {
		/**
		 * The app's name.
		 */
		applicationName?: string;
		/**
		 * The app's version.
		 */
		applicationVersion?: string;
		/**
		 * Copyright information.
		 */
		copyright?: string;
		/**
		 * The app's build version number.
		 *
		 * @platform darwin
		 */
		version?: string;
		/**
		 * Credit information.
		 *
		 * @platform darwin
		 */
		credits?: string;
		/**
		 * List of app authors.
		 *
		 * @platform linux
		 */
		authors?: string[];
		/**
		 * The app's website.
		 *
		 * @platform linux
		 */
		website?: string;
		/**
		 * Path to the app's icon. Will be shown as 64x64 pixels while retaining aspect
		 * ratio.
		 *
		 * @platform linux
		 */
		iconPath?: string;
	}

	interface AddRepresentationOptions {
		/**
		 * The scale factor to add the image representation for.
		 */
		scaleFactor: number;
		/**
		 * Defaults to 0. Required if a bitmap buffer is specified as `buffer`.
		 */
		width?: number;
		/**
		 * Defaults to 0. Required if a bitmap buffer is specified as `buffer`.
		 */
		height?: number;
		/**
		 * The buffer containing the raw image data.
		 */
		buffer?: Buffer;
		/**
		 * The data URL containing either a base 64 encoded PNG or JPEG image.
		 */
		dataURL?: string;
	}

	interface AnimationSettings {
		/**
		 * Returns true if rich animations should be rendered. Looks at session type (e.g.
		 * remote desktop) and accessibility settings to give guidance for heavy
		 * animations.
		 */
		shouldRenderRichAnimation: boolean;
		/**
		 * Determines on a per-platform basis whether scroll animations (e.g. produced by
		 * home/end key) should be enabled.
		 */
		scrollAnimationsEnabledBySystem: boolean;
		/**
		 * Determines whether the user desires reduced motion based on platform APIs.
		 */
		prefersReducedMotion: boolean;
	}

	interface AppDetailsOptions {
		/**
		 * Window's App User Model ID. It has to be set, otherwise the other options will
		 * have no effect.
		 */
		appId?: string;
		/**
		 * Window's Relaunch Icon.
		 */
		appIconPath?: string;
		/**
		 * Index of the icon in `appIconPath`. Ignored when `appIconPath` is not set.
		 * Default is `0`.
		 */
		appIconIndex?: number;
		/**
		 * Window's Relaunch Command.
		 */
		relaunchCommand?: string;
		/**
		 * Window's Relaunch Display Name.
		 */
		relaunchDisplayName?: string;
	}

	interface AuthInfo {
		isProxy: boolean;
		scheme: string;
		host: string;
		port: number;
		realm: string;
	}

	interface AutoResizeOptions {
		/**
		 * If `true`, the view's width will grow and shrink together with the window.
		 * `false` by default.
		 */
		width?: boolean;
		/**
		 * If `true`, the view's height will grow and shrink together with the window.
		 * `false` by default.
		 */
		height?: boolean;
		/**
		 * If `true`, the view's x position and width will grow and shrink proportionally
		 * with the window. `false` by default.
		 */
		horizontal?: boolean;
		/**
		 * If `true`, the view's y position and height will grow and shrink proportionally
		 * with the window. `false` by default.
		 */
		vertical?: boolean;
	}

	interface BeforeSendResponse {
		cancel?: boolean;
		/**
		 * When provided, request will be made with these headers.
		 */
		requestHeaders?: Record<string, (string) | (string[])>;
	  }

	interface BitmapOptions {
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface BlinkMemoryInfo {
		/**
		 * Size of all allocated objects in Kilobytes.
		 */
		allocated: number;
		/**
		 * Size of all marked objects in Kilobytes.
		 */
		marked: number;
		/**
		 * Total allocated space in Kilobytes.
		 */
		total: number;
	}

	interface BrowserViewConstructorOptions {
		/**
		 * See BrowserWindow.
		 */
		webPreferences?: WebPreferences;
	}

	interface BrowserWindowConstructorOptions {
		/**
		 * Window's width in pixels. Default is `800`.
		 */
		width?: number;
		/**
		 * Window's height in pixels. Default is `600`.
		 */
		height?: number;
		/**
		 * (**required** if y is used) Window's left offset from screen. Default is to
		 * center the window.
		 */
		x?: number;
		/**
		 * (**required** if x is used) Window's top offset from screen. Default is to
		 * center the window.
		 */
		y?: number;
		/**
		 * The `width` and `height` would be used as web page's size, which means the
		 * actual window's size will include window frame's size and be slightly larger.
		 * Default is `false`.
		 */
		useContentSize?: boolean;
		/**
		 * Show window in the center of the screen.
		 */
		center?: boolean;
		/**
		 * Window's minimum width. Default is `0`.
		 */
		minWidth?: number;
		/**
		 * Window's minimum height. Default is `0`.
		 */
		minHeight?: number;
		/**
		 * Window's maximum width. Default is no limit.
		 */
		maxWidth?: number;
		/**
		 * Window's maximum height. Default is no limit.
		 */
		maxHeight?: number;
		/**
		 * Whether window is resizable. Default is `true`.
		 */
		resizable?: boolean;
		/**
		 * Whether window is movable. This is not implemented on Linux. Default is `true`.
		 */
		movable?: boolean;
		/**
		 * Whether window is minimizable. This is not implemented on Linux. Default is
		 * `true`.
		 */
		minimizable?: boolean;
		/**
		 * Whether window is maximizable. This is not implemented on Linux. Default is
		 * `true`.
		 */
		maximizable?: boolean;
		/**
		 * Whether window is closable. This is not implemented on Linux. Default is `true`.
		 */
		closable?: boolean;
		/**
		 * Whether the window can be focused. Default is `true`. On Windows setting
		 * `focusable: false` also implies setting `skipTaskbar: true`. On Linux setting
		 * `focusable: false` makes the window stop interacting with wm, so the window will
		 * always stay on top in all workspaces.
		 */
		focusable?: boolean;
		/**
		 * Whether the window should always stay on top of other windows. Default is
		 * `false`.
		 */
		alwaysOnTop?: boolean;
		/**
		 * Whether the window should show in fullscreen. When explicitly set to `false` the
		 * fullscreen button will be hidden or disabled on macOS. Default is `false`.
		 */
		fullscreen?: boolean;
		/**
		 * Whether the window can be put into fullscreen mode. On macOS, also whether the
		 * maximize/zoom button should toggle full screen mode or maximize window. Default
		 * is `true`.
		 */
		fullscreenable?: boolean;
		/**
		 * Use pre-Lion fullscreen on macOS. Default is `false`.
		 */
		simpleFullscreen?: boolean;
		/**
		 * Whether to show the window in taskbar. Default is `false`.
		 */
		skipTaskbar?: boolean;
		/**
		 * The kiosk mode. Default is `false`.
		 */
		kiosk?: boolean;
		/**
		 * Default window title. Default is `"Electron"`. If the HTML tag `<title>` is
		 * defined in the HTML file loaded by `loadURL()`, this property will be ignored.
		 */
		title?: string;
		/**
		 * The window icon. On Windows it is recommended to use `ICO` icons to get best
		 * visual effects, you can also leave it undefined so the executable's icon will be
		 * used.
		 */
		icon?: (NativeImage) | (string);
		/**
		 * Whether window should be shown when created. Default is `true`.
		 */
		show?: boolean;
		/**
		 * Whether the renderer should be active when `show` is `false` and it has just
		 * been created.  In order for `document.visibilityState` to work correctly on
		 * first load with `show: false` you should set this to `false`.  Setting this to
		 * `false` will cause the `ready-to-show` event to not fire.  Default is `true`.
		 */
		paintWhenInitiallyHidden?: boolean;
		/**
		 * Specify `false` to create a Frameless Window. Default is `true`.
		 */
		frame?: boolean;
		/**
		 * Specify parent window. Default is `null`.
		 */
		parent?: BrowserWindow;
		/**
		 * Whether this is a modal window. This only works when the window is a child
		 * window. Default is `false`.
		 */
		modal?: boolean;
		/**
		 * Whether the web view accepts a single mouse-down event that simultaneously
		 * activates the window. Default is `false`.
		 */
		acceptFirstMouse?: boolean;
		/**
		 * Whether to hide cursor when typing. Default is `false`.
		 */
		disableAutoHideCursor?: boolean;
		/**
		 * Auto hide the menu bar unless the `Alt` key is pressed. Default is `false`.
		 */
		autoHideMenuBar?: boolean;
		/**
		 * Enable the window to be resized larger than screen. Only relevant for macOS, as
		 * other OSes allow larger-than-screen windows by default. Default is `false`.
		 */
		enableLargerThanScreen?: boolean;
		/**
		 * Window's background color as a hexadecimal value, like `#66CD00` or `#FFF` or
		 * `#80FFFFFF` (alpha in #AARRGGBB format is supported if `transparent` is set to
		 * `true`). Default is `#FFF` (white).
		 */
		backgroundColor?: string;
		/**
		 * Whether window should have a shadow. This is only implemented on macOS. Default
		 * is `true`.
		 */
		hasShadow?: boolean;
		/**
		 * Set the initial opacity of the window, between 0.0 (fully transparent) and 1.0
		 * (fully opaque). This is only implemented on Windows and macOS.
		 */
		opacity?: number;
		/**
		 * Forces using dark theme for the window, only works on some GTK+3 desktop
		 * environments. Default is `false`.
		 */
		darkTheme?: boolean;
		/**
		 * Makes the window transparent. Default is `false`. On Windows, does not work
		 * unless the window is frameless.
		 */
		transparent?: boolean;
		/**
		 * The type of window, default is normal window. See more about this below.
		 */
		type?: string;
		/**
		 * The style of window title bar. Default is `default`. Possible values are:
		 */
		titleBarStyle?: ('default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover');
		/**
		 * Shows the title in the title bar in full screen mode on macOS for all
		 * `titleBarStyle` options. Default is `false`.
		 */
		fullscreenWindowTitle?: boolean;
		/**
		 * Use `WS_THICKFRAME` style for frameless windows on Windows, which adds standard
		 * window frame. Setting it to `false` will remove window shadow and window
		 * animations. Default is `true`.
		 */
		thickFrame?: boolean;
		/**
		 * Add a type of vibrancy effect to the window, only on macOS. Can be
		 * `appearance-based`, `light`, `dark`, `titlebar`, `selection`, `menu`, `popover`,
		 * `sidebar`, `medium-light`, `ultra-dark`, `header`, `sheet`, `window`, `hud`,
		 * `fullscreen-ui`, `tooltip`, `content`, `under-window`, or `under-page`.  Please
		 * note that using `frame: false` in combination with a vibrancy value requires
		 * that you use a non-default `titleBarStyle` as well. Also note that
		 * `appearance-based`, `light`, `dark`, `medium-light`, and `ultra-dark` have been
		 * deprecated and will be removed in an upcoming version of macOS.
		 */
		vibrancy?: ('appearance-based' | 'light' | 'dark' | 'titlebar' | 'selection' | 'menu' | 'popover' | 'sidebar' | 'medium-light' | 'ultra-dark' | 'header' | 'sheet' | 'window' | 'hud' | 'fullscreen-ui' | 'tooltip' | 'content' | 'under-window' | 'under-page');
		/**
		 * Controls the behavior on macOS when option-clicking the green stoplight button
		 * on the toolbar or by clicking the Window > Zoom menu item. If `true`, the window
		 * will grow to the preferred width of the web page when zoomed, `false` will cause
		 * it to zoom to the width of the screen. This will also affect the behavior when
		 * calling `maximize()` directly. Default is `false`.
		 */
		zoomToPageWidth?: boolean;
		/**
		 * Tab group name, allows opening the window as a native tab on macOS 10.12+.
		 * Windows with the same tabbing identifier will be grouped together. This also
		 * adds a native new tab button to your window's tab bar and allows your `app` and
		 * window to receive the `new-window-for-tab` event.
		 */
		tabbingIdentifier?: string;
		/**
		 * Settings of web page's features.
		 */
		webPreferences?: WebPreferences;
	}

	interface CallbackRedirectRequest {
		url: string;
		method?: string;
		session?: (Session) | (null);
		uploadData?: ProtocolResponseUploadData;
	}

	interface CertificateTrustDialogOptions {
		/**
		 * The certificate to trust/import.
		 */
		certificate: Certificate;
		/**
		 * The message to display to the user.
		 */
		message: string;
	}

	interface ClearStorageDataOptions {
		/**
		 * Should follow `window.location.origin`’s representation `scheme://host:port`.
		 */
		origin?: string;
		/**
		 * The types of storages to clear, can contain: `appcache`, `cookies`,
		 * `filesystem`, `indexdb`, `localstorage`, `shadercache`, `websql`,
		 * `serviceworkers`, `cachestorage`.
		 */
		storages?: string[];
		/**
		 * The types of quotas to clear, can contain: `temporary`, `persistent`,
		 * `syncable`.
		 */
		quotas?: string[];
	}

	interface ClientRequestConstructorOptions {
		/**
		 * The HTTP request method. Defaults to the GET method.
		 */
		method?: string;
		/**
		 * The request URL. Must be provided in the absolute form with the protocol scheme
		 * specified as http or https.
		 */
		url?: string;
		/**
		 * The `Session` instance with which the request is associated.
		 */
		session?: Session;
		/**
		 * The name of the `partition` with which the request is associated. Defaults to
		 * the empty string. The `session` option prevails on `partition`. Thus if a
		 * `session` is explicitly specified, `partition` is ignored.
		 */
		partition?: string;
		/**
		 * The protocol scheme in the form 'scheme:'. Currently supported values are
		 * 'http:' or 'https:'. Defaults to 'http:'.
		 */
		protocol?: string;
		/**
		 * The server host provided as a concatenation of the hostname and the port number
		 * 'hostname:port'.
		 */
		host?: string;
		/**
		 * The server host name.
		 */
		hostname?: string;
		/**
		 * The server's listening port number.
		 */
		port?: number;
		/**
		 * The path part of the request URL.
		 */
		path?: string;
		/**
		 * The redirect mode for this request. Should be one of `follow`, `error` or
		 * `manual`. Defaults to `follow`. When mode is `error`, any redirection will be
		 * aborted. When mode is `manual` the redirection will be deferred until
		 * `request.followRedirect` is invoked. Listen for the `redirect` event in this
		 * mode to get more details about the redirect request.
		 */
		redirect?: string;
	}

	interface Config {
		/**
		 * The URL associated with the PAC file.
		 */
		pacScript: string;
		/**
		 * Rules indicating which proxies to use.
		 */
		proxyRules: string;
		/**
		 * Rules indicating which URLs should bypass the proxy settings.
		 */
		proxyBypassRules: string;
	}

	interface ConsoleMessageEvent extends Event {
		level: number;
		message: string;
		line: number;
		sourceId: string;
	}

	interface ContextMenuParams {
		/**
		 * x coordinate.
		 */
		x: number;
		/**
		 * y coordinate.
		 */
		y: number;
		/**
		 * URL of the link that encloses the node the context menu was invoked on.
		 */
		linkURL: string;
		/**
		 * Text associated with the link. May be an empty string if the contents of the
		 * link are an image.
		 */
		linkText: string;
		/**
		 * URL of the top level page that the context menu was invoked on.
		 */
		pageURL: string;
		/**
		 * URL of the subframe that the context menu was invoked on.
		 */
		frameURL: string;
		/**
		 * Source URL for the element that the context menu was invoked on. Elements with
		 * source URLs are images, audio and video.
		 */
		srcURL: string;
		/**
		 * Type of the node the context menu was invoked on. Can be `none`, `image`,
		 * `audio`, `video`, `canvas`, `file` or `plugin`.
		 */
		mediaType: ('none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin');
		/**
		 * Whether the context menu was invoked on an image which has non-empty contents.
		 */
		hasImageContents: boolean;
		/**
		 * Whether the context is editable.
		 */
		isEditable: boolean;
		/**
		 * Text of the selection that the context menu was invoked on.
		 */
		selectionText: string;
		/**
		 * Title or alt text of the selection that the context was invoked on.
		 */
		titleText: string;
		/**
		 * The misspelled word under the cursor, if any.
		 */
		misspelledWord: string;
		/**
		 * The character encoding of the frame on which the menu was invoked.
		 */
		frameCharset: string;
		/**
		 * If the context menu was invoked on an input field, the type of that field.
		 * Possible values are `none`, `plainText`, `password`, `other`.
		 */
		inputFieldType: string;
		/**
		 * Input source that invoked the context menu. Can be `none`, `mouse`, `keyboard`,
		 * `touch` or `touchMenu`.
		 */
		menuSourceType: ('none' | 'mouse' | 'keyboard' | 'touch' | 'touchMenu');
		/**
		 * The flags for the media element the context menu was invoked on.
		 */
		mediaFlags: MediaFlags;
		/**
		 * These flags indicate whether the renderer believes it is able to perform the
		 * corresponding action.
		 */
		editFlags: EditFlags;
	}

	interface CrashReporterStartOptions {
		companyName: string;
		/**
		 * URL that crash reports will be sent to as POST.
		 */
		submitURL: string;
		/**
		 * Defaults to `app.name`.
		 */
		productName?: string;
		/**
		 * Whether crash reports should be sent to the server. Default is `true`.
		 */
		uploadToServer?: boolean;
		/**
		 * Default is `false`.
		 */
		ignoreSystemCrashHandler?: boolean;
		/**
		 * An object you can define that will be sent along with the report. Only string
		 * properties are sent correctly. Nested objects are not supported. When using
		 * Windows, the property names and values must be fewer than 64 characters.
		 */
		extra?: Record<string, string>;
		/**
		 * Directory to store the crash reports temporarily (only used when the crash
		 * reporter is started via `process.crashReporter.start`).
		 */
		crashesDirectory?: string;
	}

	interface CreateFromBitmapOptions {
		width: number;
		height: number;
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface CreateFromBufferOptions {
		/**
		 * Required for bitmap buffers.
		 */
		width?: number;
		/**
		 * Required for bitmap buffers.
		 */
		height?: number;
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface CreateInterruptedDownloadOptions {
		/**
		 * Absolute path of the download.
		 */
		path: string;
		/**
		 * Complete URL chain for the download.
		 */
		urlChain: string[];
		mimeType?: string;
		/**
		 * Start range for the download.
		 */
		offset: number;
		/**
		 * Total length of the download.
		 */
		length: number;
		/**
		 * Last-Modified header value.
		 */
		lastModified: string;
		/**
		 * ETag header value.
		 */
		eTag: string;
		/**
		 * Time when download was started in number of seconds since UNIX epoch.
		 */
		startTime?: number;
	}

	interface Data {
		text?: string;
		html?: string;
		image?: NativeImage;
		rtf?: string;
		/**
		 * The title of the URL at `text`.
		 */
		bookmark?: string;
	}

	interface Details {
		/**
		 * The URL to associate the cookie with. The promise will be rejected if the URL is
		 * invalid.
		 */
		url: string;
		/**
		 * The name of the cookie. Empty by default if omitted.
		 */
		name?: string;
		/**
		 * The value of the cookie. Empty by default if omitted.
		 */
		value?: string;
		/**
		 * The domain of the cookie; this will be normalized with a preceding dot so that
		 * it's also valid for subdomains. Empty by default if omitted.
		 */
		domain?: string;
		/**
		 * The path of the cookie. Empty by default if omitted.
		 */
		path?: string;
		/**
		 * Whether the cookie should be marked as Secure. Defaults to false.
		 */
		secure?: boolean;
		/**
		 * Whether the cookie should be marked as HTTP only. Defaults to false.
		 */
		httpOnly?: boolean;
		/**
		 * The expiration date of the cookie as the number of seconds since the UNIX epoch.
		 * If omitted then the cookie becomes a session cookie and will not be retained
		 * between sessions.
		 */
		expirationDate?: number;
	}

	interface DidChangeThemeColorEvent extends Event {
		themeColor: string;
	}

	interface DidFailLoadEvent extends Event {
		errorCode: number;
		errorDescription: string;
		validatedURL: string;
		isMainFrame: boolean;
	}

	interface DidFrameFinishLoadEvent extends Event {
		isMainFrame: boolean;
	}

	interface DidNavigateEvent extends Event {
		url: string;
	}

	interface DidNavigateInPageEvent extends Event {
		isMainFrame: boolean;
		url: string;
	}

	interface DisplayBalloonOptions {
		icon?: (NativeImage) | (string);
		title: string;
		content: string;
	}

	interface EnableNetworkEmulationOptions {
		/**
		 * Whether to emulate network outage. Defaults to false.
		 */
		offline?: boolean;
		/**
		 * RTT in ms. Defaults to 0 which will disable latency throttling.
		 */
		latency?: number;
		/**
		 * Download rate in Bps. Defaults to 0 which will disable download throttling.
		 */
		downloadThroughput?: number;
		/**
		 * Upload rate in Bps. Defaults to 0 which will disable upload throttling.
		 */
		uploadThroughput?: number;
	}

	interface FeedURLOptions {
		url: string;
		/**
		 * HTTP request headers.
		 *
		 * @platform darwin
		 */
		headers?: Record<string, string>;
		/**
		 * Either `json` or `default`, see the Squirrel.Mac README for more information.
		 *
		 * @platform darwin
		 */
		serverType?: string;
	}

	interface FileIconOptions {
		size: ('small' | 'normal' | 'large');
	}

	interface Filter {
		/**
		 * Retrieves cookies which are associated with `url`. Empty implies retrieving
		 * cookies of all URLs.
		 */
		url?: string;
		/**
		 * Filters cookies by name.
		 */
		name?: string;
		/**
		 * Retrieves cookies whose domains match or are subdomains of `domains`.
		 */
		domain?: string;
		/**
		 * Retrieves cookies whose path matches `path`.
		 */
		path?: string;
		/**
		 * Filters cookies by their Secure property.
		 */
		secure?: boolean;
		/**
		 * Filters out session or persistent cookies.
		 */
		session?: boolean;
	}

	interface FindInPageOptions {
		/**
		 * Whether to search forward or backward, defaults to `true`.
		 */
		forward?: boolean;
		/**
		 * Whether the operation is first request or a follow up, defaults to `false`.
		 */
		findNext?: boolean;
		/**
		 * Whether search should be case-sensitive, defaults to `false`.
		 */
		matchCase?: boolean;
		/**
		 * Whether to look only at the start of words. defaults to `false`.
		 */
		wordStart?: boolean;
		/**
		 * When combined with `wordStart`, accepts a match in the middle of a word if the
		 * match begins with an uppercase letter followed by a lowercase or non-letter.
		 * Accepts several other intra-word matches, defaults to `false`.
		 */
		medialCapitalAsWordStart?: boolean;
	}

	interface FoundInPageEvent extends Event {
		result: FoundInPageResult;
	}

	interface FromPartitionOptions {
		/**
		 * Whether to enable cache.
		 */
		cache: boolean;
	}

	interface HandlerRequest {
		url: string;
		headers: Record<string, string>;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface HeadersReceivedResponse {
		cancel?: boolean;
		/**
		 * When provided, the server is assumed to have responded with these headers.
		 */
		responseHeaders?: Record<string, (string) | (string[])>;
		/**
		 * Should be provided when overriding `responseHeaders` to change header status
		 * otherwise original response header's status will be used.
		 */
		statusLine?: string;
	  }

	interface HeapStatistics {
		totalHeapSize: number;
		totalHeapSizeExecutable: number;
		totalPhysicalSize: number;
		totalAvailableSize: number;
		usedHeapSize: number;
		heapSizeLimit: number;
		mallocedMemory: number;
		peakMallocedMemory: number;
		doesZapGarbage: boolean;
	}

	interface IgnoreMouseEventsOptions {
		/**
		 * If true, forwards mouse move messages to Chromium, enabling mouse related events
		 * such as `mouseleave`. Only used when `ignore` is true. If `ignore` is false,
		 * forwarding is always disabled regardless of this value.
		 *
		 * @platform darwin,win32
		 */
		forward?: boolean;
	}

	interface ImportCertificateOptions {
		/**
		 * Path for the pkcs12 file.
		 */
		certificate: string;
		/**
		 * Passphrase for the certificate.
		 */
		password: string;
	}

	interface Info {
		/**
		 * Security origin for the isolated world.
		 */
		securityOrigin?: string;
		/**
		 * Content Security Policy for the isolated world.
		 */
		csp?: string;
		/**
		 * Name for isolated world. Useful in devtools.
		 */
		name?: string;
	}

	interface Input {
		/**
		 * Either `keyUp` or `keyDown`.
		 */
		type: string;
		/**
		 * Equivalent to KeyboardEvent.key.
		 */
		key: string;
		/**
		 * Equivalent to KeyboardEvent.code.
		 */
		code: string;
		/**
		 * Equivalent to KeyboardEvent.repeat.
		 */
		isAutoRepeat: boolean;
		/**
		 * Equivalent to KeyboardEvent.shiftKey.
		 */
		shift: boolean;
		/**
		 * Equivalent to KeyboardEvent.controlKey.
		 */
		control: boolean;
		/**
		 * Equivalent to KeyboardEvent.altKey.
		 */
		alt: boolean;
		/**
		 * Equivalent to KeyboardEvent.metaKey.
		 */
		meta: boolean;
	}

	interface InsertCSSOptions {
		/**
		 * Can be either 'user' or 'author'; Specifying 'user' enables you to prevent
		 * websites from overriding the CSS you insert. Default is 'author'.
		 */
		cssOrigin?: string;
	}

	interface IpcMessageEvent extends Event {
		channel: string;
		args: any[];
	}

	interface Item {
		/**
		 * The path(s) to the file(s) being dragged.
		 */
		file: (string[]) | (string);
		/**
		 * The image must be non-empty on macOS.
		 */
		icon: NativeImage;
	}

	interface JumpListSettings {
		/**
		 * The minimum number of items that will be shown in the Jump List (for a more
		 * detailed description of this value see the MSDN docs).
		 */
		minItems: number;
		/**
		 * Array of `JumpListItem` objects that correspond to items that the user has
		 * explicitly removed from custom categories in the Jump List. These items must not
		 * be re-added to the Jump List in the **next** call to `app.setJumpList()`,
		 * Windows will not display any custom category that contains any of the removed
		 * items.
		 */
		removedItems: JumpListItem[];
	}

	interface LoadCommitEvent extends Event {
		url: string;
		isMainFrame: boolean;
	}

	interface LoadFileOptions {
		/**
		 * Passed to `url.format()`.
		 */
		query?: Record<string, string>;
		/**
		 * Passed to `url.format()`.
		 */
		search?: string;
		/**
		 * Passed to `url.format()`.
		 */
		hash?: string;
	}

	interface LoadURLOptions {
		/**
		 * An HTTP Referrer url.
		 */
		httpReferrer?: (string) | (Referrer);
		/**
		 * A user agent originating the request.
		 */
		userAgent?: string;
		/**
		 * Extra headers separated by "\n"
		 */
		extraHeaders?: string;
		postData?: (UploadRawData[]) | (UploadFile[]) | (UploadBlob[]);
		/**
		 * Base url (with trailing path separator) for files to be loaded by the data url.
		 * This is needed only if the specified `url` is a data url and needs to load other
		 * files.
		 */
		baseURLForDataURL?: string;
	}

	interface LoginItemSettings {
		/**
		 * `true` if the app is set to open at login.
		 */
		openAtLogin: boolean;
		/**
		 * `true` if the app is set to open as hidden at login. This setting is not
		 * available on MAS builds.
		 *
		 * @platform darwin
		 */
		openAsHidden: boolean;
		/**
		 * `true` if the app was opened at login automatically. This setting is not
		 * available on MAS builds.
		 *
		 * @platform darwin
		 */
		wasOpenedAtLogin: boolean;
		/**
		 * `true` if the app was opened as a hidden login item. This indicates that the app
		 * should not open any windows at startup. This setting is not available on MAS
		 * builds.
		 *
		 * @platform darwin
		 */
		wasOpenedAsHidden: boolean;
		/**
		 * `true` if the app was opened as a login item that should restore the state from
		 * the previous session. This indicates that the app should restore the windows
		 * that were open the last time the app was closed. This setting is not available
		 * on MAS builds.
		 *
		 * @platform darwin
		 */
		restoreState: boolean;
	}

	interface LoginItemSettingsOptions {
		/**
		 * The executable path to compare against. Defaults to `process.execPath`.
		 *
		 * @platform win32
		 */
		path?: string;
		/**
		 * The command-line arguments to compare against. Defaults to an empty array.
		 *
		 * @platform win32
		 */
		args?: string[];
	}

	interface MenuItemConstructorOptions {
		/**
		 * Will be called with `click(menuItem, browserWindow, event)` when the menu item
		 * is clicked.
		 */
		click?: (menuItem: MenuItem, browserWindow: BrowserWindow, event: KeyboardEvent) => void;
		/**
		 * Can be `undo`, `redo`, `cut`, `copy`, `paste`, `pasteAndMatchStyle`, `delete`,
		 * `selectAll`, `reload`, `forceReload`, `toggleDevTools`, `resetZoom`, `zoomIn`,
		 * `zoomOut`, `togglefullscreen`, `window`, `minimize`, `close`, `help`, `about`,
		 * `services`, `hide`, `hideOthers`, `unhide`, `quit`, `startSpeaking`,
		 * `stopSpeaking`, `close`, `minimize`, `zoom`, `front`, `appMenu`, `fileMenu`,
		 * `editMenu`, `viewMenu`, `recentDocuments`, `toggleTabBar`, `selectNextTab`,
		 * `selectPreviousTab`, `mergeAllWindows`, `clearRecentDocuments`,
		 * `moveTabToNewWindow` or `windowMenu` - Define the action of the menu item, when
		 * specified the `click` property will be ignored. See roles.
		 */
		role?: ('undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteAndMatchStyle' | 'delete' | 'selectAll' | 'reload' | 'forceReload' | 'toggleDevTools' | 'resetZoom' | 'zoomIn' | 'zoomOut' | 'togglefullscreen' | 'window' | 'minimize' | 'close' | 'help' | 'about' | 'services' | 'hide' | 'hideOthers' | 'unhide' | 'quit' | 'startSpeaking' | 'stopSpeaking' | 'close' | 'minimize' | 'zoom' | 'front' | 'appMenu' | 'fileMenu' | 'editMenu' | 'viewMenu' | 'recentDocuments' | 'toggleTabBar' | 'selectNextTab' | 'selectPreviousTab' | 'mergeAllWindows' | 'clearRecentDocuments' | 'moveTabToNewWindow' | 'windowMenu');
		/**
		 * Can be `normal`, `separator`, `submenu`, `checkbox` or `radio`.
		 */
		type?: ('normal' | 'separator' | 'submenu' | 'checkbox' | 'radio');
		label?: string;
		sublabel?: string;
		/**
		 * Hover text for this menu item.
		 *
		 * @platform darwin
		 */
		toolTip?: string;
		accelerator?: Accelerator;
		icon?: (NativeImage) | (string);
		/**
		 * If false, the menu item will be greyed out and unclickable.
		 */
		enabled?: boolean;
		/**
		 * default is `true`, and when `false` will prevent the accelerator from triggering
		 * the item if the item is not visible`.
		 *
		 * @platform darwin
		 */
		acceleratorWorksWhenHidden?: boolean;
		/**
		 * If false, the menu item will be entirely hidden.
		 */
		visible?: boolean;
		/**
		 * Should only be specified for `checkbox` or `radio` type menu items.
		 */
		checked?: boolean;
		/**
		 * If false, the accelerator won't be registered with the system, but it will still
		 * be displayed. Defaults to true.
		 *
		 * @platform linux,win32
		 */
		registerAccelerator?: boolean;
		/**
		 * Should be specified for `submenu` type menu items. If `submenu` is specified,
		 * the `type: 'submenu'` can be omitted. If the value is not a `Menu` then it will
		 * be automatically converted to one using `Menu.buildFromTemplate`.
		 */
		submenu?: (MenuItemConstructorOptions[]) | (Menu);
		/**
		 * Unique within a single menu. If defined then it can be used as a reference to
		 * this item by the position attribute.
		 */
		id?: string;
		/**
		 * Inserts this item before the item with the specified label. If the referenced
		 * item doesn't exist the item will be inserted at the end of  the menu. Also
		 * implies that the menu item in question should be placed in the same “group” as
		 * the item.
		 */
		before?: string[];
		/**
		 * Inserts this item after the item with the specified label. If the referenced
		 * item doesn't exist the item will be inserted at the end of the menu.
		 */
		after?: string[];
		/**
		 * Provides a means for a single context menu to declare the placement of their
		 * containing group before the containing group of the item with the specified
		 * label.
		 */
		beforeGroupContaining?: string[];
		/**
		 * Provides a means for a single context menu to declare the placement of their
		 * containing group after the containing group of the item with the specified
		 * label.
		 */
		afterGroupContaining?: string[];
	}

	interface MessageBoxOptions {
		/**
		 * Can be `"none"`, `"info"`, `"error"`, `"question"` or `"warning"`. On Windows,
		 * `"question"` displays the same icon as `"info"`, unless you set an icon using
		 * the `"icon"` option. On macOS, both `"warning"` and `"error"` display the same
		 * warning icon.
		 */
		type?: string;
		/**
		 * Array of texts for buttons. On Windows, an empty array will result in one button
		 * labeled "OK".
		 */
		buttons?: string[];
		/**
		 * Index of the button in the buttons array which will be selected by default when
		 * the message box opens.
		 */
		defaultId?: number;
		/**
		 * Title of the message box, some platforms will not show it.
		 */
		title?: string;
		/**
		 * Content of the message box.
		 */
		message: string;
		/**
		 * Extra information of the message.
		 */
		detail?: string;
		/**
		 * If provided, the message box will include a checkbox with the given label.
		 */
		checkboxLabel?: string;
		/**
		 * Initial checked state of the checkbox. `false` by default.
		 */
		checkboxChecked?: boolean;
		icon?: NativeImage;
		/**
		 * The index of the button to be used to cancel the dialog, via the `Esc` key. By
		 * default this is assigned to the first button with "cancel" or "no" as the label.
		 * If no such labeled buttons exist and this option is not set, `0` will be used as
		 * the return value.
		 */
		cancelId?: number;
		/**
		 * On Windows Electron will try to figure out which one of the `buttons` are common
		 * buttons (like "Cancel" or "Yes"), and show the others as command links in the
		 * dialog. This can make the dialog appear in the style of modern Windows apps. If
		 * you don't like this behavior, you can set `noLink` to `true`.
		 */
		noLink?: boolean;
		/**
		 * Normalize the keyboard access keys across platforms. Default is `false`.
		 * Enabling this assumes `&` is used in the button labels for the placement of the
		 * keyboard shortcut access key and labels will be converted so they work correctly
		 * on each platform, `&` characters are removed on macOS, converted to `_` on
		 * Linux, and left untouched on Windows. For example, a button label of `Vie&w`
		 * will be converted to `Vie_w` on Linux and `View` on macOS and can be selected
		 * via `Alt-W` on Windows and Linux.
		 */
		normalizeAccessKeys?: boolean;
	}

	interface MessageBoxReturnValue {
		/**
		 * The index of the clicked button.
		 */
		response: number;
		/**
		 * The checked state of the checkbox if `checkboxLabel` was set. Otherwise `false`.
		 */
		checkboxChecked: boolean;
	}

	interface MessageBoxSyncOptions {
		/**
		 * Can be `"none"`, `"info"`, `"error"`, `"question"` or `"warning"`. On Windows,
		 * `"question"` displays the same icon as `"info"`, unless you set an icon using
		 * the `"icon"` option. On macOS, both `"warning"` and `"error"` display the same
		 * warning icon.
		 */
		type?: string;
		/**
		 * Array of texts for buttons. On Windows, an empty array will result in one button
		 * labeled "OK".
		 */
		buttons?: string[];
		/**
		 * Index of the button in the buttons array which will be selected by default when
		 * the message box opens.
		 */
		defaultId?: number;
		/**
		 * Title of the message box, some platforms will not show it.
		 */
		title?: string;
		/**
		 * Content of the message box.
		 */
		message: string;
		/**
		 * Extra information of the message.
		 */
		detail?: string;
		/**
		 * If provided, the message box will include a checkbox with the given label.
		 */
		checkboxLabel?: string;
		/**
		 * Initial checked state of the checkbox. `false` by default.
		 */
		checkboxChecked?: boolean;
		icon?: (NativeImage) | (string);
		/**
		 * The index of the button to be used to cancel the dialog, via the `Esc` key. By
		 * default this is assigned to the first button with "cancel" or "no" as the label.
		 * If no such labeled buttons exist and this option is not set, `0` will be used as
		 * the return value.
		 */
		cancelId?: number;
		/**
		 * On Windows Electron will try to figure out which one of the `buttons` are common
		 * buttons (like "Cancel" or "Yes"), and show the others as command links in the
		 * dialog. This can make the dialog appear in the style of modern Windows apps. If
		 * you don't like this behavior, you can set `noLink` to `true`.
		 */
		noLink?: boolean;
		/**
		 * Normalize the keyboard access keys across platforms. Default is `false`.
		 * Enabling this assumes `&` is used in the button labels for the placement of the
		 * keyboard shortcut access key and labels will be converted so they work correctly
		 * on each platform, `&` characters are removed on macOS, converted to `_` on
		 * Linux, and left untouched on Windows. For example, a button label of `Vie&w`
		 * will be converted to `Vie_w` on Linux and `View` on macOS and can be selected
		 * via `Alt-W` on Windows and Linux.
		 */
		normalizeAccessKeys?: boolean;
	}

	interface MoveToApplicationsFolderOptions {
		/**
		 * A handler for potential conflict in move failure.
		 */
		conflictHandler?: (conflictType: 'exists' | 'existsAndRunning') => boolean;
	}

	interface NewWindowEvent extends Event {
		url: string;
		frameName: string;
		/**
		 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
		 * `save-to-disk` and `other`.
		 */
		disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other');
		/**
		 * The options which should be used for creating the new `BrowserWindow`.
		 */
		options: BrowserWindowConstructorOptions;
	}

	interface NotificationConstructorOptions {
		/**
		 * A title for the notification, which will be shown at the top of the notification
		 * window when it is shown.
		 */
		title: string;
		/**
		 * A subtitle for the notification, which will be displayed below the title.
		 *
		 * @platform darwin
		 */
		subtitle?: string;
		/**
		 * The body text of the notification, which will be displayed below the title or
		 * subtitle.
		 */
		body: string;
		/**
		 * Whether or not to emit an OS notification noise when showing the notification.
		 */
		silent?: boolean;
		/**
		 * An icon to use in the notification.
		 */
		icon?: (string) | (NativeImage);
		/**
		 * Whether or not to add an inline reply option to the notification.
		 *
		 * @platform darwin
		 */
		hasReply?: boolean;
		/**
		 * The placeholder to write in the inline reply input field.
		 *
		 * @platform darwin
		 */
		replyPlaceholder?: string;
		/**
		 * The name of the sound file to play when the notification is shown.
		 *
		 * @platform darwin
		 */
		sound?: string;
		/**
		 * Actions to add to the notification. Please read the available actions and
		 * limitations in the `NotificationAction` documentation.
		 *
		 * @platform darwin
		 */
		actions?: NotificationAction[];
		/**
		 * A custom title for the close button of an alert. An empty string will cause the
		 * default localized text to be used.
		 *
		 * @platform darwin
		 */
		closeButtonText?: string;
	}

	interface OnBeforeRedirectFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnBeforeRedirectListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		redirectURL: string;
		statusCode: number;
		/**
		 * The server IP address that the request was actually sent to.
		 */
		ip?: string;
		fromCache: boolean;
		responseHeaders?: Record<string, string>;
	}

	interface OnBeforeRequestFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnBeforeRequestListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		uploadData: UploadData[];
	}

	interface OnBeforeSendHeadersFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnBeforeSendHeadersListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		requestHeaders: Record<string, string>;
	}

	interface OnCompletedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnCompletedListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		responseHeaders?: Record<string, string>;
		fromCache: boolean;
		statusCode: number;
		statusLine: string;
	}

	interface OnErrorOccurredFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnErrorOccurredListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		fromCache: boolean;
		/**
		 * The error description.
		 */
		error: string;
	}

	interface OnHeadersReceivedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnHeadersReceivedListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		statusLine: string;
		statusCode: number;
		responseHeaders?: Record<string, string>;
	}

	interface OnResponseStartedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnResponseStartedListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		responseHeaders?: Record<string, string>;
		/**
		 * Indicates whether the response was fetched from disk cache.
		 */
		fromCache: boolean;
		statusCode: number;
		statusLine: string;
	}

	interface OnSendHeadersFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnSendHeadersListenerDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		referrer: string;
		timestamp: number;
		requestHeaders: Record<string, string>;
	}

	interface OpenDevToolsOptions {
		/**
		 * Opens the devtools with specified dock state, can be `right`, `bottom`,
		 * `undocked`, `detach`. Defaults to last used dock state. In `undocked` mode it's
		 * possible to dock back. In `detach` mode it's not.
		 */
		mode: ('right' | 'bottom' | 'undocked' | 'detach');
		/**
		 * Whether to bring the opened devtools window to the foreground. The default is
		 * `true`.
		 */
		activate?: boolean;
	}

	interface OpenDialogOptions {
		title?: string;
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will
		 * be used.
		 */
		buttonLabel?: string;
		filters?: FileFilter[];
		/**
		 * Contains which features the dialog should use. The following values are
		 * supported:
		 */
		properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory'>;
		/**
		 * Message to display above input boxes.
		 *
		 * @platform darwin
		 */
		message?: string;
		/**
		 * Create security scoped bookmarks when packaged for the Mac App Store.
		 *
		 * @platform darwin,mas
		 */
		securityScopedBookmarks?: boolean;
	}

	interface OpenDialogReturnValue {
		/**
		 * whether or not the dialog was canceled.
		 */
		canceled: boolean;
		/**
		 * An array of file paths chosen by the user. If the dialog is cancelled this will
		 * be an empty array.
		 */
		filePaths: string[];
		/**
		 * An array matching the `filePaths` array of base64 encoded strings which contains
		 * security scoped bookmark data. `securityScopedBookmarks` must be enabled for
		 * this to be populated.
		 *
		 * @platform darwin,mas
		 */
		bookmarks?: string[];
	}

	interface OpenDialogSyncOptions {
		title?: string;
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will
		 * be used.
		 */
		buttonLabel?: string;
		filters?: FileFilter[];
		/**
		 * Contains which features the dialog should use. The following values are
		 * supported:
		 */
		properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles' | 'createDirectory' | 'promptToCreate' | 'noResolveAliases' | 'treatPackageAsDirectory'>;
		/**
		 * Message to display above input boxes.
		 *
		 * @platform darwin
		 */
		message?: string;
		/**
		 * Create security scoped bookmarks when packaged for the Mac App Store.
		 *
		 * @platform darwin,mas
		 */
		securityScopedBookmarks?: boolean;
	}

	interface OpenExternalOptions {
		/**
		 * `true` to bring the opened application to the foreground. The default is `true`.
		 *
		 * @platform darwin
		 */
		activate?: boolean;
		/**
		 * The working directory.
		 *
		 * @platform win32
		 */
		workingDirectory?: string;
	}

	interface PageFaviconUpdatedEvent extends Event {
		/**
		 * Array of URLs.
		 */
		favicons: string[];
	}

	interface PageTitleUpdatedEvent extends Event {
		title: string;
		explicitSet: boolean;
	}

	interface Parameters {
		/**
		 * Specify the screen type to emulate (default: `desktop`):
		 */
		screenPosition: ('desktop' | 'mobile');
		/**
		 * Set the emulated screen size (screenPosition == mobile).
		 */
		screenSize: Size;
		/**
		 * Position the view on the screen (screenPosition == mobile) (default: `{ x: 0, y:
		 * 0 }`).
		 */
		viewPosition: Point;
		/**
		 * Set the device scale factor (if zero defaults to original device scale factor)
		 * (default: `0`).
		 */
		deviceScaleFactor: number;
		/**
		 * Set the emulated view size (empty means no override)
		 */
		viewSize: Size;
		/**
		 * Scale of emulated view inside available space (not in fit to view mode)
		 * (default: `1`).
		 */
		scale: number;
	}

	interface Payment {
		/**
		 * The identifier of the purchased product.
		 */
		productIdentifier: string;
		/**
		 * The quantity purchased.
		 */
		quantity: number;
	}

	interface PermissionCheckHandlerHandlerDetails {
		/**
		 * The security orign of the `media` check.
		 */
		securityOrigin: string;
		/**
		 * The type of media access being requested, can be `video`, `audio` or `unknown`
		 */
		mediaType: ('video' | 'audio' | 'unknown');
		/**
		 * The last URL the requesting frame loaded
		 */
		requestingUrl: string;
		/**
		 * Whether the frame making the request is the main frame
		 */
		isMainFrame: boolean;
	}

	interface PermissionRequestHandlerHandlerDetails {
		/**
		 * The url of the `openExternal` request.
		 */
		externalURL?: string;
		/**
		 * The types of media access being requested, elements can be `video` or `audio`
		 */
		mediaTypes?: Array<'video' | 'audio'>;
		/**
		 * The last URL the requesting frame loaded
		 */
		requestingUrl: string;
		/**
		 * Whether the frame making the request is the main frame
		 */
		isMainFrame: boolean;
	}

	interface PluginCrashedEvent extends Event {
		name: string;
		version: string;
	}

	interface PopupOptions {
		/**
		 * Default is the focused window.
		 */
		window?: BrowserWindow;
		/**
		 * Default is the current mouse cursor position. Must be declared if `y` is
		 * declared.
		 */
		x?: number;
		/**
		 * Default is the current mouse cursor position. Must be declared if `x` is
		 * declared.
		 */
		y?: number;
		/**
		 * The index of the menu item to be positioned under the mouse cursor at the
		 * specified coordinates. Default is -1.
		 *
		 * @platform darwin
		 */
		positioningItem?: number;
		/**
		 * Called when menu is closed.
		 */
		callback?: () => void;
	}

	interface PreconnectOptions {
		/**
		 * URL for preconnect. Only the origin is relevant for opening the socket.
		 */
		url: string;
		/**
		 * number of sockets to preconnect. Must be between 1 and 6. Defaults to 1.
		 */
		numSockets?: number;
	}

	interface PrintOptions {
		/**
		 * Don't ask user for print settings. Default is `false`.
		 */
		silent?: boolean;
		/**
		 * Prints the background color and image of the web page. Default is `false`.
		 */
		printBackground?: boolean;
		/**
		 * Set the printer device name to use. Default is `''`.
		 */
		deviceName?: string;
		/**
		 * Set whether the printed web page will be in color or grayscale. Default is
		 * `true`.
		 */
		color?: boolean;
		margins?: Margins;
		/**
		 * Whether the web page should be printed in landscape mode. Default is `false`.
		 */
		landscape?: boolean;
		/**
		 * The scale factor of the web page.
		 */
		scaleFactor?: number;
		/**
		 * The number of pages to print per page sheet.
		 */
		pagesPerSheet?: number;
		/**
		 * Whether the web page should be collated.
		 */
		collate?: boolean;
		/**
		 * The number of copies of the web page to print.
		 */
		copies?: number;
		/**
		 * The page range to print. Should have two keys: `from` and `to`.
		 */
		pageRanges?: Record<string, number>;
		/**
		 * Set the duplex mode of the printed web page. Can be `simplex`, `shortEdge`, or
		 * `longEdge`.
		 */
		duplexMode?: ('simplex' | 'shortEdge' | 'longEdge');
		dpi?: Dpi;
	}

	interface PrintToPDFOptions {
		/**
		 * Specifies the type of margins to use. Uses 0 for default margin, 1 for no
		 * margin, and 2 for minimum margin.
		 */
		marginsType?: number;
		/**
		 * Specify page size of the generated PDF. Can be `A3`, `A4`, `A5`, `Legal`,
		 * `Letter`, `Tabloid` or an Object containing `height` and `width` in microns.
		 */
		pageSize?: (string) | (Size);
		/**
		 * Whether to print CSS backgrounds.
		 */
		printBackground?: boolean;
		/**
		 * Whether to print selection only.
		 */
		printSelectionOnly?: boolean;
		/**
		 * `true` for landscape, `false` for portrait.
		 */
		landscape?: boolean;
	}

	interface Privileges {
		/**
		 * Default false.
		 */
		standard?: boolean;
		/**
		 * Default false.
		 */
		secure?: boolean;
		/**
		 * Default false.
		 */
		bypassCSP?: boolean;
		/**
		 * Default false.
		 */
		allowServiceWorkers?: boolean;
		/**
		 * Default false.
		 */
		supportFetchAPI?: boolean;
		/**
		 * Default false.
		 */
		corsEnabled?: boolean;
	}

	interface ProcRequest {
		hostname: string;
		certificate: Certificate;
		/**
		 * Verification result from chromium.
		 */
		verificationResult: string;
		/**
		 * Error code.
		 */
		errorCode: number;
	}

	interface ProgressBarOptions {
		/**
		 * Mode for the progress bar. Can be `none`, `normal`, `indeterminate`, `error` or
		 * `paused`.
		 *
		 * @platform win32
		 */
		mode: ('none' | 'normal' | 'indeterminate' | 'error' | 'paused');
	}

	interface Provider {
		spellCheck: (words: string[], callback: (misspeltWords: string[]) => void) => void;
	}

	interface ReadBookmark {
		title: string;
		url: string;
	}

	interface RedirectRequest {
		url: string;
		method?: string;
		session?: (Session) | (null);
		uploadData?: UploadData;
	}

	interface RelaunchOptions {
		args?: string[];
		execPath?: string;
	}

	interface Request {
		method: string;
		url: string;
		referrer: string;
	}

	interface ResizeOptions {
		/**
		 * Defaults to the image's width.
		 */
		width?: number;
		/**
		 * Defaults to the image's height.
		 */
		height?: number;
		/**
		 * The desired quality of the resize image. Possible values are `good`, `better` or
		 * `best`. The default is `best`. These values express a desired quality/speed
		 * tradeoff. They are translated into an algorithm-specific method that depends on
		 * the capabilities (CPU, GPU) of the underlying platform. It is possible for all
		 * three methods to be mapped to the same algorithm on a given platform.
		 */
		quality?: string;
	}

	interface ResourceUsage {
		images: MemoryUsageDetails;
		scripts: MemoryUsageDetails;
		cssStyleSheets: MemoryUsageDetails;
		xslStyleSheets: MemoryUsageDetails;
		fonts: MemoryUsageDetails;
		other: MemoryUsageDetails;
	}

	interface Response {
		cancel?: boolean;
		/**
		 * The original request is prevented from being sent or completed and is instead
		 * redirected to the given URL.
		 */
		redirectURL?: string;
	}

	interface Result {
		requestId: number;
		/**
		 * Position of the active match.
		 */
		activeMatchOrdinal: number;
		/**
		 * Number of Matches.
		 */
		matches: number;
		/**
		 * Coordinates of first match region.
		 */
		selectionArea: Rectangle;
		finalUpdate: boolean;
	}

	interface SaveDialogOptions {
		title?: string;
		/**
		 * Absolute directory path, absolute file path, or file name to use by default.
		 */
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will
		 * be used.
		 */
		buttonLabel?: string;
		filters?: FileFilter[];
		/**
		 * Message to display above text fields.
		 *
		 * @platform darwin
		 */
		message?: string;
		/**
		 * Custom label for the text displayed in front of the filename text field.
		 *
		 * @platform darwin
		 */
		nameFieldLabel?: string;
		/**
		 * Show the tags input box, defaults to `true`.
		 *
		 * @platform darwin
		 */
		showsTagField?: boolean;
		/**
		 * Create a security scoped bookmark when packaged for the Mac App Store. If this
		 * option is enabled and the file doesn't already exist a blank file will be
		 * created at the chosen path.
		 *
		 * @platform darwin,mas
		 */
		securityScopedBookmarks?: boolean;
	}

	interface SaveDialogReturnValue {
		/**
		 * whether or not the dialog was canceled.
		 */
		canceled: boolean;
		/**
		 * If the dialog is canceled, this will be `undefined`.
		 */
		filePath?: string;
		/**
		 * Base64 encoded string which contains the security scoped bookmark data for the
		 * saved file. `securityScopedBookmarks` must be enabled for this to be present.
		 *
		 * @platform darwin,mas
		 */
		bookmark?: string;
	}

	interface SaveDialogSyncOptions {
		title?: string;
		/**
		 * Absolute directory path, absolute file path, or file name to use by default.
		 */
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will
		 * be used.
		 */
		buttonLabel?: string;
		filters?: FileFilter[];
		/**
		 * Message to display above text fields.
		 *
		 * @platform darwin
		 */
		message?: string;
		/**
		 * Custom label for the text displayed in front of the filename text field.
		 *
		 * @platform darwin
		 */
		nameFieldLabel?: string;
		/**
		 * Show the tags input box, defaults to `true`.
		 *
		 * @platform darwin
		 */
		showsTagField?: boolean;
		/**
		 * Create a security scoped bookmark when packaged for the Mac App Store. If this
		 * option is enabled and the file doesn't already exist a blank file will be
		 * created at the chosen path.
		 *
		 * @platform darwin,mas
		 */
		securityScopedBookmarks?: boolean;
	}

	interface Settings {
		/**
		 * `true` to open the app at login, `false` to remove the app as a login item.
		 * Defaults to `false`.
		 */
		openAtLogin?: boolean;
		/**
		 * `true` to open the app as hidden. Defaults to `false`. The user can edit this
		 * setting from the System Preferences so
		 * `app.getLoginItemSettings().wasOpenedAsHidden` should be checked when the app is
		 * opened to know the current value. This setting is not available on MAS builds.
		 *
		 * @platform darwin
		 */
		openAsHidden?: boolean;
		/**
		 * The executable to launch at login. Defaults to `process.execPath`.
		 *
		 * @platform win32
		 */
		path?: string;
		/**
		 * The command-line arguments to pass to the executable. Defaults to an empty
		 * array. Take care to wrap paths in quotes.
		 *
		 * @platform win32
		 */
		args?: string[];
	}

	interface SourcesOptions {
		/**
		 * An array of Strings that lists the types of desktop sources to be captured,
		 * available types are `screen` and `window`.
		 */
		types: string[];
		/**
		 * The size that the media source thumbnail should be scaled to. Default is `150` x
		 * `150`. Set width or height to 0 when you do not need the thumbnails. This will
		 * save the processing time required for capturing the content of each window and
		 * screen.
		 */
		thumbnailSize?: Size;
		/**
		 * Set to true to enable fetching window icons. The default value is false. When
		 * false the appIcon property of the sources return null. Same if a source has the
		 * type screen.
		 */
		fetchWindowIcons?: boolean;
	}

	interface StartLoggingOptions {
		/**
		 * What kinds of data should be captured. By default, only metadata about requests
		 * will be captured. Setting this to `includeSensitive` will include cookies and
		 * authentication data. Setting it to `everything` will include all bytes
		 * transferred on sockets. Can be `default`, `includeSensitive` or `everything`.
		 */
		captureMode?: ('default' | 'includeSensitive' | 'everything');
		/**
		 * When the log grows beyond this size, logging will automatically stop. Defaults
		 * to unlimited.
		 */
		maxFileSize?: number;
	}

	interface SystemMemoryInfo {
		/**
		 * The total amount of physical memory in Kilobytes available to the system.
		 */
		total: number;
		/**
		 * The total amount of memory not being used by applications or disk cache.
		 */
		free: number;
		/**
		 * The total amount of swap memory in Kilobytes available to the system.
		 *
		 * @platform win32,linux
		 */
		swapTotal: number;
		/**
		 * The free amount of swap memory in Kilobytes available to the system.
		 *
		 * @platform win32,linux
		 */
		swapFree: number;
	}

	interface ToBitmapOptions {
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface ToDataURLOptions {
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface ToPNGOptions {
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface TouchBarButtonConstructorOptions {
		/**
		 * Button text.
		 */
		label?: string;
		/**
		 * Button background color in hex format, i.e `#ABCDEF`.
		 */
		backgroundColor?: string;
		/**
		 * Button icon.
		 */
		icon?: (NativeImage) | (string);
		/**
		 * Can be `left`, `right` or `overlay`.
		 */
		iconPosition?: ('left' | 'right' | 'overlay');
		/**
		 * Function to call when the button is clicked.
		 */
		click?: () => void;
	}

	interface TouchBarColorPickerConstructorOptions {
		/**
		 * Array of hex color strings to appear as possible colors to select.
		 */
		availableColors?: string[];
		/**
		 * The selected hex color in the picker, i.e `#ABCDEF`.
		 */
		selectedColor?: string;
		/**
		 * Function to call when a color is selected.
		 */
		change?: (color: string) => void;
	}

	interface TouchBarConstructorOptions {
		items?: Array<(TouchBarButton) | (TouchBarColorPicker) | (TouchBarGroup) | (TouchBarLabel) | (TouchBarPopover) | (TouchBarScrubber) | (TouchBarSegmentedControl) | (TouchBarSlider) | (TouchBarSpacer)>;
		escapeItem?: (TouchBarButton) | (TouchBarColorPicker) | (TouchBarGroup) | (TouchBarLabel) | (TouchBarPopover) | (TouchBarScrubber) | (TouchBarSegmentedControl) | (TouchBarSlider) | (TouchBarSpacer) | (null);
	}

	interface TouchBarGroupConstructorOptions {
		/**
		 * Items to display as a group.
		 */
		items: TouchBar;
	}

	interface TouchBarLabelConstructorOptions {
		/**
		 * Text to display.
		 */
		label?: string;
		/**
		 * Hex color of text, i.e `#ABCDEF`.
		 */
		textColor?: string;
	}

	interface TouchBarPopoverConstructorOptions {
		/**
		 * Popover button text.
		 */
		label?: string;
		/**
		 * Popover button icon.
		 */
		icon?: NativeImage;
		/**
		 * Items to display in the popover.
		 */
		items?: TouchBar;
		/**
		 * `true` to display a close button on the left of the popover, `false` to not show
		 * it. Default is `true`.
		 */
		showCloseButton?: boolean;
	}

	interface TouchBarScrubberConstructorOptions {
		/**
		 * An array of items to place in this scrubber.
		 */
		items: ScrubberItem[];
		/**
		 * Called when the user taps an item that was not the last tapped item.
		 */
		select?: (selectedIndex: number) => void;
		/**
		 * Called when the user taps any item.
		 */
		highlight?: (highlightedIndex: number) => void;
		/**
		 * Selected item style. Defaults to `null`.
		 */
		selectedStyle?: string;
		/**
		 * Selected overlay item style. Defaults to `null`.
		 */
		overlayStyle?: string;
		/**
		 * Defaults to `false`.
		 */
		showArrowButtons?: boolean;
		/**
		 * Defaults to `free`.
		 */
		mode?: string;
		/**
		 * Defaults to `true`.
		 */
		continuous?: boolean;
	}

	interface TouchBarSegmentedControlConstructorOptions {
		/**
		 * Style of the segments:
		 */
		segmentStyle?: ('automatic' | 'rounded' | 'textured-rounded' | 'round-rect' | 'textured-square' | 'capsule' | 'small-square' | 'separated');
		/**
		 * The selection mode of the control:
		 */
		mode?: ('single' | 'multiple' | 'buttons');
		/**
		 * An array of segments to place in this control.
		 */
		segments: SegmentedControlSegment[];
		/**
		 * The index of the currently selected segment, will update automatically with user
		 * interaction. When the mode is multiple it will be the last selected item.
		 */
		selectedIndex?: number;
		/**
		 * Called when the user selects a new segment.
		 */
		change?: (selectedIndex: number, isSelected: boolean) => void;
	}

	interface TouchBarSliderConstructorOptions {
		/**
		 * Label text.
		 */
		label?: string;
		/**
		 * Selected value.
		 */
		value?: number;
		/**
		 * Minimum value.
		 */
		minValue?: number;
		/**
		 * Maximum value.
		 */
		maxValue?: number;
		/**
		 * Function to call when the slider is changed.
		 */
		change?: (newValue: number) => void;
	}

	interface TouchBarSpacerConstructorOptions {
		/**
		 * Size of spacer, possible values are:
		 */
		size?: ('small' | 'large' | 'flexible');
	}

	interface TraceBufferUsageReturnValue {
		value: number;
		percentage: number;
	}

	interface UpdateTargetUrlEvent extends Event {
		url: string;
	}

	interface UploadProgress {
		/**
		 * Whether the request is currently active. If this is false no other properties
		 * will be set
		 */
		active: boolean;
		/**
		 * Whether the upload has started. If this is false both `current` and `total` will
		 * be set to 0.
		 */
		started: boolean;
		/**
		 * The number of bytes that have been uploaded so far
		 */
		current: number;
		/**
		 * The number of bytes that will be uploaded this request
		 */
		total: number;
	}

	interface VisibleOnAllWorkspacesOptions {
		/**
		 * Sets whether the window should be visible above fullscreen windows
		 *
		 * @platform darwin
		 */
		visibleOnFullScreen?: boolean;
	}

	interface WillNavigateEvent extends Event {
		url: string;
	}

	interface Dpi {
		/**
		 * The horizontal dpi.
		 */
		horizontal?: number;
		/**
		 * The vertical dpi.
		 */
		vertical?: number;
	}

	interface EditFlags {
		/**
		 * Whether the renderer believes it can undo.
		 */
		canUndo: boolean;
		/**
		 * Whether the renderer believes it can redo.
		 */
		canRedo: boolean;
		/**
		 * Whether the renderer believes it can cut.
		 */
		canCut: boolean;
		/**
		 * Whether the renderer believes it can copy
		 */
		canCopy: boolean;
		/**
		 * Whether the renderer believes it can paste.
		 */
		canPaste: boolean;
		/**
		 * Whether the renderer believes it can delete.
		 */
		canDelete: boolean;
		/**
		 * Whether the renderer believes it can select all.
		 */
		canSelectAll: boolean;
	}

	interface FoundInPageResult {
		requestId: number;
		/**
		 * Position of the active match.
		 */
		activeMatchOrdinal: number;
		/**
		 * Number of Matches.
		 */
		matches: number;
		/**
		 * Coordinates of first match region.
		 */
		selectionArea: Rectangle;
		finalUpdate: boolean;
	}

	interface Margins {
		/**
		 * Can be `default`, `none`, `printableArea`, or `custom`. If `custom` is chosen,
		 * you will also need to specify `top`, `bottom`, `left`, and `right`.
		 */
		marginType?: ('default' | 'none' | 'printableArea' | 'custom');
		/**
		 * The top margin of the printed web page, in pixels.
		 */
		top?: number;
		/**
		 * The bottom margin of the printed web page, in pixels.
		 */
		bottom?: number;
		/**
		 * The left margin of the printed web page, in pixels.
		 */
		left?: number;
		/**
		 * The right margin of the printed web page, in pixels.
		 */
		right?: number;
	}

	interface MediaFlags {
		/**
		 * Whether the media element has crashed.
		 */
		inError: boolean;
		/**
		 * Whether the media element is paused.
		 */
		isPaused: boolean;
		/**
		 * Whether the media element is muted.
		 */
		isMuted: boolean;
		/**
		 * Whether the media element has audio.
		 */
		hasAudio: boolean;
		/**
		 * Whether the media element is looping.
		 */
		isLooping: boolean;
		/**
		 * Whether the media element's controls are visible.
		 */
		isControlsVisible: boolean;
		/**
		 * Whether the media element's controls are toggleable.
		 */
		canToggleControls: boolean;
		/**
		 * Whether the media element can be rotated.
		 */
		canRotate: boolean;
	}

	interface WebPreferences {
		/**
		 * Whether to enable DevTools. If it is set to `false`, can not use
		 * `BrowserWindow.webContents.openDevTools()` to open DevTools. Default is `true`.
		 */
		devTools?: boolean;
		/**
		 * Whether node integration is enabled. Default is `false`.
		 */
		nodeIntegration?: boolean;
		/**
		 * Whether node integration is enabled in web workers. Default is `false`. More
		 * about this can be found in Multithreading.
		 */
		nodeIntegrationInWorker?: boolean;
		/**
		 * Experimental option for enabling Node.js support in sub-frames such as iframes
		 * and child windows. All your preloads will load for every iframe, you can use
		 * `process.isMainFrame` to determine if you are in the main frame or not.
		 */
		nodeIntegrationInSubFrames?: boolean;
		/**
		 * Specifies a script that will be loaded before other scripts run in the page.
		 * This script will always have access to node APIs no matter whether node
		 * integration is turned on or off. The value should be the absolute file path to
		 * the script. When node integration is turned off, the preload script can
		 * reintroduce Node global symbols back to the global scope. See example here.
		 */
		preload?: string;
		/**
		 * If set, this will sandbox the renderer associated with the window, making it
		 * compatible with the Chromium OS-level sandbox and disabling the Node.js engine.
		 * This is not the same as the `nodeIntegration` option and the APIs available to
		 * the preload script are more limited. Read more about the option here. **Note:**
		 * This option is currently experimental and may change or be removed in future
		 * Electron releases.
		 */
		sandbox?: boolean;
		/**
		 * Whether to enable the `remote` module. Default is `true`.
		 */
		enableRemoteModule?: boolean;
		/**
		 * Sets the session used by the page. Instead of passing the Session object
		 * directly, you can also choose to use the `partition` option instead, which
		 * accepts a partition string. When both `session` and `partition` are provided,
		 * `session` will be preferred. Default is the default session.
		 */
		session?: Session;
		/**
		 * Sets the session used by the page according to the session's partition string.
		 * If `partition` starts with `persist:`, the page will use a persistent session
		 * available to all pages in the app with the same `partition`. If there is no
		 * `persist:` prefix, the page will use an in-memory session. By assigning the same
		 * `partition`, multiple pages can share the same session. Default is the default
		 * session.
		 */
		partition?: string;
		/**
		 * When specified, web pages with the same `affinity` will run in the same renderer
		 * process. Note that due to reusing the renderer process, certain `webPreferences`
		 * options will also be shared between the web pages even when you specified
		 * different values for them, including but not limited to `preload`, `sandbox` and
		 * `nodeIntegration`. So it is suggested to use exact same `webPreferences` for web
		 * pages with the same `affinity`. _This property is experimental_
		 */
		affinity?: string;
		/**
		 * The default zoom factor of the page, `3.0` represents `300%`. Default is `1.0`.
		 */
		zoomFactor?: number;
		/**
		 * Enables JavaScript support. Default is `true`.
		 */
		javascript?: boolean;
		/**
		 * When `false`, it will disable the same-origin policy (usually using testing
		 * websites by people), and set `allowRunningInsecureContent` to `true` if this
		 * options has not been set by user. Default is `true`.
		 */
		// webSecurity?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Allow an https page to run JavaScript, CSS or plugins from http URLs. Default is
		 * `false`.
		 */
		// allowRunningInsecureContent?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Enables image support. Default is `true`.
		 */
		images?: boolean;
		/**
		 * Make TextArea elements resizable. Default is `true`.
		 */
		textAreasAreResizable?: boolean;
		/**
		 * Enables WebGL support. Default is `true`.
		 */
		webgl?: boolean;
		/**
		 * Whether plugins should be enabled. Default is `false`.
		 */
		plugins?: boolean;
		/**
		 * Enables Chromium's experimental features. Default is `false`.
		 */
		// experimentalFeatures?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Enables scroll bounce (rubber banding) effect on macOS. Default is `false`.
		 */
		scrollBounce?: boolean;
		/**
		 * A list of feature strings separated by `,`, like `CSSVariables,KeyboardEventKey`
		 * to enable. The full list of supported feature strings can be found in the
		 * RuntimeEnabledFeatures.json5 file.
		 */
		enableBlinkFeatures?: string;
		/**
		 * A list of feature strings separated by `,`, like `CSSVariables,KeyboardEventKey`
		 * to disable. The full list of supported feature strings can be found in the
		 * RuntimeEnabledFeatures.json5 file.
		 */
		disableBlinkFeatures?: string;
		/**
		 * Sets the default font for the font-family.
		 */
		defaultFontFamily?: DefaultFontFamily;
		/**
		 * Defaults to `16`.
		 */
		defaultFontSize?: number;
		/**
		 * Defaults to `13`.
		 */
		defaultMonospaceFontSize?: number;
		/**
		 * Defaults to `0`.
		 */
		minimumFontSize?: number;
		/**
		 * Defaults to `ISO-8859-1`.
		 */
		defaultEncoding?: string;
		/**
		 * Whether to throttle animations and timers when the page becomes background. This
		 * also affects the Page Visibility API. Defaults to `true`.
		 */
		backgroundThrottling?: boolean;
		/**
		 * Whether to enable offscreen rendering for the browser window. Defaults to
		 * `false`. See the offscreen rendering tutorial for more details.
		 */
		offscreen?: boolean;
		/**
		 * Whether to run Electron APIs and the specified `preload` script in a separate
		 * JavaScript context. Defaults to `false`. The context that the `preload` script
		 * runs in will still have full access to the `document` and `window` globals but
		 * it will use its own set of JavaScript builtins (`Array`, `Object`, `JSON`, etc.)
		 * and will be isolated from any changes made to the global environment by the
		 * loaded page. The Electron API will only be available in the `preload` script and
		 * not the loaded page. This option should be used when loading potentially
		 * untrusted remote content to ensure the loaded content cannot tamper with the
		 * `preload` script and any Electron APIs being used. This option uses the same
		 * technique used by Chrome Content Scripts. You can access this context in the dev
		 * tools by selecting the 'Electron Isolated Context' entry in the combo box at the
		 * top of the Console tab.
		 */
		contextIsolation?: boolean;
		/**
		 * Whether to use native `window.open()`. Defaults to `false`. Child windows will
		 * always have node integration disabled unless `nodeIntegrationInSubFrames` is
		 * true. **Note:** This option is currently experimental.
		 */
		nativeWindowOpen?: boolean;
		/**
		 * Whether to enable the `<webview>` tag. Defaults to `false`. **Note:** The
		 * `preload` script configured for the `<webview>` will have node integration
		 * enabled when it is executed so you should ensure remote/untrusted content is not
		 * able to create a `<webview>` tag with a possibly malicious `preload` script. You
		 * can use the `will-attach-webview` event on webContents to strip away the
		 * `preload` script and to validate or alter the `<webview>`'s initial settings.
		 */
		webviewTag?: boolean;
		/**
		 * A list of strings that will be appended to `process.argv` in the renderer
		 * process of this app.  Useful for passing small bits of data down to renderer
		 * process preload scripts.
		 */
		additionalArguments?: string[];
		/**
		 * Whether to enable browser style consecutive dialog protection. Default is
		 * `false`.
		 */
		safeDialogs?: boolean;
		/**
		 * The message to display when consecutive dialog protection is triggered. If not
		 * defined the default message would be used, note that currently the default
		 * message is in English and not localized.
		 */
		safeDialogsMessage?: string;
		/**
		 * Whether dragging and dropping a file or link onto the page causes a navigation.
		 * Default is `false`.
		 */
		navigateOnDragDrop?: boolean;
		/**
		 * Autoplay policy to apply to content in the window, can be
		 * `no-user-gesture-required`, `user-gesture-required`,
		 * `document-user-activation-required`. Defaults to `no-user-gesture-required`.
		 */
		autoplayPolicy?: ('no-user-gesture-required' | 'user-gesture-required' | 'document-user-activation-required');
		/**
		 * Whether to prevent the window from resizing when entering HTML Fullscreen.
		 * Default is `false`.
		 */
		disableHtmlFullscreenWindowResize?: boolean;
	}

	interface DefaultFontFamily {
		/**
		 * Defaults to `Times New Roman`.
		 */
		standard?: string;
		/**
		 * Defaults to `Times New Roman`.
		 */
		serif?: string;
		/**
		 * Defaults to `Arial`.
		 */
		sansSerif?: string;
		/**
		 * Defaults to `Courier New`.
		 */
		monospace?: string;
		/**
		 * Defaults to `Script`.
		 */
		cursive?: string;
		/**
		 * Defaults to `Impact`.
		 */
		fantasy?: string;
	}

}

declare module 'electron' {
	export = Electron;
}

interface NodeRequireFunction {
	(moduleName: 'electron'): typeof Electron;
}

interface File {
	/**
	 * The real path to the file on the users filesystem
	 */
	path: string;
}

declare module 'original-fs' {
	import * as fs from 'fs';
	export = fs;
}

interface Document {
	createElement(tagName: 'webview'): Electron.WebviewTag;
}

declare namespace NodeJS {
	interface Process extends NodeJS.EventEmitter {

		// Docs: http://electronjs.org/docs/api/process

		// ### BEGIN VSCODE MODIFICATION ###
		// /**
		//  * Emitted when Electron has loaded its internal initialization script and is
		//  * beginning to load the web page or the main script. It can be used by the preload
		//  * script to add removed Node global symbols back to the global scope when node
		//  * integration is turned off:
		//  */
		// on(event: 'loaded', listener: Function): this;
		// once(event: 'loaded', listener: Function): this;
		// addListener(event: 'loaded', listener: Function): this;
		// removeListener(event: 'loaded', listener: Function): this;
		// ### END VSCODE MODIFICATION ###
		/**
		 * Causes the main thread of the current process crash.
		 */
		crash(): void;
		/**
		 * * `allocated` Integer - Size of all allocated objects in Kilobytes.
		 * * `marked` Integer - Size of all marked objects in Kilobytes.
		 * * `total` Integer - Total allocated space in Kilobytes.
		 *
		 * Returns an object with Blink memory information. It can be useful for debugging
		 * rendering / DOM related memory issues. Note that all values are reported in
		 * Kilobytes.
		 */
		getBlinkMemoryInfo(): Electron.BlinkMemoryInfo;
		getCPUUsage(): Electron.CPUUsage;
		/**
		 * The number of milliseconds since epoch, or `null` if the information is
		 * unavailable
		 *
		 * Indicates the creation time of the application. The time is represented as
		 * number of milliseconds since epoch. It returns null if it is unable to get the
		 * process creation time.
		 */
		getCreationTime(): (number) | (null);
		/**
		 * * `totalHeapSize` Integer
		 * * `totalHeapSizeExecutable` Integer
		 * * `totalPhysicalSize` Integer
		 * * `totalAvailableSize` Integer
		 * * `usedHeapSize` Integer
		 * * `heapSizeLimit` Integer
		 * * `mallocedMemory` Integer
		 * * `peakMallocedMemory` Integer
		 * * `doesZapGarbage` Boolean
		 *
		 * Returns an object with V8 heap statistics. Note that all statistics are reported
		 * in Kilobytes.
		 */
		getHeapStatistics(): Electron.HeapStatistics;
		getIOCounters(): Electron.IOCounters;
		/**
		 * Resolves with a ProcessMemoryInfo
		 *
		 * Returns an object giving memory usage statistics about the current process. Note
		 * that all statistics are reported in Kilobytes. This api should be called after
		 * app ready.
		 *
		 * Chromium does not provide `residentSet` value for macOS. This is because macOS
		 * performs in-memory compression of pages that haven't been recently used. As a
		 * result the resident set size value is not what one would expect. `private`
		 * memory is more representative of the actual pre-compression memory usage of the
		 * process on macOS.
		 */
		getProcessMemoryInfo(): Promise<Electron.ProcessMemoryInfo>;
		/**
		 * * `total` Integer - The total amount of physical memory in Kilobytes available
		 * to the system.
		 * * `free` Integer - The total amount of memory not being used by applications or
		 * disk cache.
		 * * `swapTotal` Integer _Windows_ _Linux_ - The total amount of swap memory in
		 * Kilobytes available to the system.
		 * * `swapFree` Integer _Windows_ _Linux_ - The free amount of swap memory in
		 * Kilobytes available to the system.
		 *
		 * Returns an object giving memory usage statistics about the entire system. Note
		 * that all statistics are reported in Kilobytes.
		 */
		getSystemMemoryInfo(): Electron.SystemMemoryInfo;
		/**
		 * The version of the host operating system.
		 *
		 * Examples:
		 *
		 * * `macOS` -> `10.13.6`
		 * * `Windows` -> `10.0.17763`
		 * * `Linux` -> `4.15.0-45-generic`
		 *
		 * **Note:** It returns the actual operating system version instead of kernel
		 * version on macOS unlike `os.release()`.
		 */
		getSystemVersion(): ('macOS' | 'Windows' | 'Linux');
		/**
		 * Causes the main thread of the current process hang.
		 */
		hang(): void;
		/**
		 * Sets the file descriptor soft limit to `maxDescriptors` or the OS hard limit,
		 * whichever is lower for the current process.
		 *
		 * @platform darwin,linux
		 */
		setFdLimit(maxDescriptors: number): void;
		/**
		 * Indicates whether the snapshot has been created successfully.
		 *
	Takes a V8 heap snapshot and saves it to `filePath`.
		 */
		takeHeapSnapshot(filePath: string): boolean;
		/**
		 * A `String` representing Chrome's version string.
		 *
		 */
		readonly chrome: string;
		/**
		 * A `Boolean`. When app is started by being passed as parameter to the default
		 * app, this property is `true` in the main process, otherwise it is `undefined`.
		 *
		 */
		readonly defaultApp: boolean;
		/**
		 * A `String` representing Electron's version string.
		 *
		 */
		readonly electron: string;
		/**
		 * A `Boolean` that controls whether or not deprecation warnings are printed to
		 * `stderr` when formerly callback-based APIs converted to Promises are invoked
		 * using callbacks. Setting this to `true` will enable deprecation warnings.
		 */
		enablePromiseAPIs: boolean;
		/**
		 * A `Boolean`, `true` when the current renderer context is the "main" renderer
		 * frame. If you want the ID of the current frame you should use
		 * `webFrame.routingId`.
		 *
		 */
		readonly isMainFrame: boolean;
		/**
		 * A `Boolean`. For Mac App Store build, this property is `true`, for other builds
		 * it is `undefined`.
		 *
		 */
		readonly mas: boolean;
		/**
		 * A `Boolean` that controls ASAR support inside your application. Setting this to
		 * `true` will disable the support for `asar` archives in Node's built-in modules.
		 */
		noAsar: boolean;
		/**
		 * A `Boolean` that controls whether or not deprecation warnings are printed to
		 * `stderr`. Setting this to `true` will silence deprecation warnings. This
		 * property is used instead of the `--no-deprecation` command line flag.
		 */
		noDeprecation: boolean;
		/**
		 * A `String` representing the path to the resources directory.
		 *
		 */
		readonly resourcesPath: string;
		/**
		 * A `Boolean`. When the renderer process is sandboxed, this property is `true`,
		 * otherwise it is `undefined`.
		 *
		 */
		readonly sandboxed: boolean;
		/**
		 * A `Boolean` that controls whether or not deprecation warnings will be thrown as
		 * exceptions. Setting this to `true` will throw errors for deprecations. This
		 * property is used instead of the `--throw-deprecation` command line flag.
		 */
		throwDeprecation: boolean;
		/**
		 * A `Boolean` that controls whether or not deprecations printed to `stderr`
		 * include their stack trace. Setting this to `true` will print stack traces for
		 * deprecations. This property is instead of the `--trace-deprecation` command line
		 * flag.
		 */
		traceDeprecation: boolean;
		/**
		 * A `Boolean` that controls whether or not process warnings printed to `stderr`
		 * include their stack trace. Setting this to `true` will print stack traces for
		 * process warnings (including deprecations). This property is instead of the
		 * `--trace-warnings` command line flag.
		 */
		traceProcessWarnings: boolean;
		/**
		 * A `String` representing the current process's type, can be `"browser"` (i.e.
		 * main process), `"renderer"`, or `"worker"` (i.e. web worker).
		 *
		 */
		readonly type: string;
		/**
		 * A `Boolean`. If the app is running as a Windows Store app (appx), this property
		 * is `true`, for otherwise it is `undefined`.
		 *
		 */
		readonly windowsStore: boolean;
	}
	interface ProcessVersions {
		readonly electron: string;
		readonly chrome: string;
	}
}
