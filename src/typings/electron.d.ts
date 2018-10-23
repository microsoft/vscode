// Type definitions for Electron 2.0.5
// Project: http://electron.atom.io/
// Definitions by: The Electron Team <https://github.com/electron/electron>
// Definitions: https://github.com/electron/electron-typescript-definitions

/// <reference types="node" />

type GlobalEvent = Event;

declare namespace Electron {
	class EventEmitter {
		addListener(event: string, listener: Function): this;
		on(event: string, listener: Function): this;
		once(event: string, listener: Function): this;
		removeListener(event: string, listener: Function): this;
		removeAllListeners(event?: string): this;
		setMaxListeners(n: number): this;
		getMaxListeners(): number;
		listeners(event: string): Function[];
		emit(event: string, ...args: any[]): boolean;
		listenerCount(type: string): number;
		prependListener(event: string, listener: Function): this;
		prependOnceListener(event: string, listener: Function): this;
		eventNames(): string[];
	}

	class Accelerator extends String {

	}

	interface Event extends GlobalEvent {
		preventDefault: () => void;
		sender: WebContents;
		returnValue: any;
		ctrlKey?: boolean;
		metaKey?: boolean;
		shiftKey?: boolean;
		altKey?: boolean;
	}

	interface CommonInterface {
		clipboard: Clipboard;
		crashReporter: CrashReporter;
		nativeImage: typeof NativeImage;
		screen: Screen;
		shell: Shell;
	}

	interface MainInterface extends CommonInterface {
		app: App;
		autoUpdater: AutoUpdater;
		BrowserView: typeof BrowserView;
		BrowserWindow: typeof BrowserWindow;
		ClientRequest: typeof ClientRequest;
		contentTracing: ContentTracing;
		Cookies: typeof Cookies;
		Debugger: typeof Debugger;
		dialog: Dialog;
		DownloadItem: typeof DownloadItem;
		globalShortcut: GlobalShortcut;
		inAppPurchase: InAppPurchase;
		IncomingMessage: typeof IncomingMessage;
		ipcMain: IpcMain;
		Menu: typeof Menu;
		MenuItem: typeof MenuItem;
		net: Net;
		Notification: typeof Notification;
		powerMonitor: PowerMonitor;
		powerSaveBlocker: PowerSaveBlocker;
		protocol: Protocol;
		session: typeof Session;
		systemPreferences: SystemPreferences;
		TouchBar: typeof TouchBar;
		Tray: typeof Tray;
		webContents: typeof WebContents;
		WebRequest: typeof WebRequest;
	}

	interface RendererInterface extends CommonInterface {
		BrowserWindowProxy: typeof BrowserWindowProxy;
		desktopCapturer: DesktopCapturer;
		ipcRenderer: IpcRenderer;
		remote: Remote;
		webFrame: WebFrame;
		webviewTag: WebviewTag;
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

	interface App extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/app

		/**
		 * Emitted when Chrome's accessibility support changes. This event fires when
		 * assistive technologies, such as screen readers, are enabled or disabled. See
		 * https://www.chromium.org/developers/design-documents/accessibility for more
		 * details.
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
		 */
		on(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		once(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		addListener(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		removeListener(event: 'activity-was-continued', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		/**
		 * Emitted before the application starts closing its windows. Calling
		 * event.preventDefault() will prevent the default behaviour, which is terminating
		 * the application. Note: If application quit was initiated by
		 * autoUpdater.quitAndInstall() then before-quit is emitted after emitting close
		 * event on all windows and closing them. Note: On Windows, this event will not be
		 * emitted if the app is closed due to a shutdown/restart of the system or a user
		 * logout.
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
		 * Emitted when failed to verify the certificate for url, to trust the certificate
		 * you should prevent the default behavior with event.preventDefault() and call
		 * callback(true).
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
		 * resumed. You should call event.preventDefault() if you want to handle this
		 * event. A user activity can be continued only in an app that has the same
		 * developer Team ID as the activity's source app and that supports the activity's
		 * type. Supported activity types are specified in the app's Info.plist under the
		 * NSUserActivityTypes key.
		 */
		on(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: any) => void): this;
		once(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: any) => void): this;
		addListener(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: any) => void): this;
		removeListener(event: 'continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity on another device.
			 */
			userInfo: any) => void): this;
		/**
		 * Emitted during Handoff when an activity from a different device fails to be
		 * resumed.
		 */
		on(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		once(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		addListener(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		removeListener(event: 'continue-activity-error', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * A string with the error's localized description.
			 */
			error: string) => void): this;
		/**
		 * Emitted when the gpu process crashes or is killed.
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
		 * Emitted when webContents wants to do basic auth. The default behavior is to
		 * cancel all authentications, to override this you should prevent the default
		 * behavior with event.preventDefault() and call callback(username, password) with
		 * the credentials.
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
		 * is only visible if the current BrowserWindow has a tabbingIdentifier
		 */
		on(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		once(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		addListener(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		removeListener(event: 'new-window-for-tab', listener: (event: Event) => void): this;
		/**
		 * Emitted when the user wants to open a file with the application. The open-file
		 * event is usually emitted when the application is already open and the OS wants
		 * to reuse the application to open the file. open-file is also emitted when a file
		 * is dropped onto the dock and the application is not yet running. Make sure to
		 * listen for the open-file event very early in your application startup to handle
		 * this case (even before the ready event is emitted). You should call
		 * event.preventDefault() if you want to handle this event. On Windows, you have to
		 * parse process.argv (in the main process) to get the filepath.
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
		 * application's Info.plist file must define the url scheme within the
		 * CFBundleURLTypes key, and set NSPrincipalClass to AtomApplication. You should
		 * call event.preventDefault() if you want to handle this event.
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
		 * Emitted when the application is quitting. Note: On Windows, this event will not
		 * be emitted if the app is closed due to a shutdown/restart of the system or a
		 * user logout.
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
		 * Emitted when Electron has finished initializing. On macOS, launchInfo holds the
		 * userInfo of the NSUserNotification that was used to open the application, if it
		 * was launched from Notification Center. You can call app.isReady() to check if
		 * this event has already fired.
		 */
		on(event: 'ready', listener: (launchInfo: any) => void): this;
		once(event: 'ready', listener: (launchInfo: any) => void): this;
		addListener(event: 'ready', listener: (launchInfo: any) => void): this;
		removeListener(event: 'ready', listener: (launchInfo: any) => void): this;
		/**
		 * Emitted when a client certificate is requested. The url corresponds to the
		 * navigation entry requesting the client certificate and callback can be called
		 * with an entry filtered from the list. Using event.preventDefault() prevents the
		 * application from using the first certificate from the store.
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
		 * Emitted when Handoff is about to be resumed on another device. If you need to
		 * update the state to be transferred, you should call event.preventDefault()
		 * immediately, construct a new userInfo dictionary and call
		 * app.updateCurrentActiviy() in a timely manner. Otherwise the operation will fail
		 * and continue-activity-error will be called.
		 */
		on(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		once(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		addListener(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
		removeListener(event: 'update-activity-state', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string,
			/**
			 * Contains app-specific state stored by the activity.
			 */
			userInfo: any) => void): this;
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
		 * resumed. You should call event.preventDefault() if you want to handle this
		 * event.
		 */
		on(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string) => void): this;
		once(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string) => void): this;
		addListener(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string) => void): this;
		removeListener(event: 'will-continue-activity', listener: (event: Event,
			/**
			 * A string identifying the activity. Maps to .
			 */
			type: string) => void): this;
		/**
		 * Emitted when the application has finished basic startup. On Windows and Linux,
		 * the will-finish-launching event is the same as the ready event; on macOS, this
		 * event represents the applicationWillFinishLaunching notification of
		 * NSApplication. You would usually set up listeners for the open-file and open-url
		 * events here, and start the crash reporter and auto updater. In most cases, you
		 * should just do everything in the ready event handler.
		 */
		on(event: 'will-finish-launching', listener: Function): this;
		once(event: 'will-finish-launching', listener: Function): this;
		addListener(event: 'will-finish-launching', listener: Function): this;
		removeListener(event: 'will-finish-launching', listener: Function): this;
		/**
		 * Emitted when all windows have been closed and the application will quit. Calling
		 * event.preventDefault() will prevent the default behaviour, which is terminating
		 * the application. See the description of the window-all-closed event for the
		 * differences between the will-quit and window-all-closed events. Note: On
		 * Windows, this event will not be emitted if the app is closed due to a
		 * shutdown/restart of the system or a user logout.
		 */
		on(event: 'will-quit', listener: (event: Event) => void): this;
		once(event: 'will-quit', listener: (event: Event) => void): this;
		addListener(event: 'will-quit', listener: (event: Event) => void): this;
		removeListener(event: 'will-quit', listener: (event: Event) => void): this;
		/**
		 * Emitted when all windows have been closed. If you do not subscribe to this event
		 * and all windows are closed, the default behavior is to quit the app; however, if
		 * you subscribe, you control whether the app quits or not. If the user pressed Cmd
		 * + Q, or the developer called app.quit(), Electron will first try to close all
		 * the windows and then emit the will-quit event, and in this case the
		 * window-all-closed event would not be emitted.
		 */
		on(event: 'window-all-closed', listener: Function): this;
		once(event: 'window-all-closed', listener: Function): this;
		addListener(event: 'window-all-closed', listener: Function): this;
		removeListener(event: 'window-all-closed', listener: Function): this;
		/**
		 * Adds path to the recent documents list. This list is managed by the OS. On
		 * Windows you can visit the list from the task bar, and on macOS you can visit it
		 * from dock menu.
		 */
		addRecentDocument(path: string): void;
		/**
		 * Clears the recent documents list.
		 */
		clearRecentDocuments(): void;
		/**
		 * By default, Chromium disables 3D APIs (e.g. WebGL) until restart on a per domain
		 * basis if the GPU processes crashes too frequently. This function disables that
		 * behaviour. This method can only be called before app is ready.
		 */
		disableDomainBlockingFor3DAPIs(): void;
		/**
		 * Disables hardware acceleration for current app. This method can only be called
		 * before app is ready.
		 */
		disableHardwareAcceleration(): void;
		/**
		 * Enables mixed sandbox mode on the app. This method can only be called before app
		 * is ready.
		 */
		enableMixedSandbox(): void;
		/**
		 * Exits immediately with exitCode. exitCode defaults to 0. All windows will be
		 * closed immediately without asking user and the before-quit and will-quit events
		 * will not be emitted.
		 */
		exit(exitCode?: number): void;
		/**
		 * On Linux, focuses on the first visible window. On macOS, makes the application
		 * the active app. On Windows, focuses on the application's first window.
		 */
		focus(): void;
		getAppMetrics(): ProcessMetric[];
		getAppPath(): string;
		getBadgeCount(): number;
		getCurrentActivityType(): string;
		/**
		 * Fetches a path's associated icon. On Windows, there a 2 kinds of icons: On Linux
		 * and macOS, icons depend on the application associated with file mime type.
		 */
		getFileIcon(path: string, callback: (error: Error, icon: NativeImage) => void): void;
		/**
		 * Fetches a path's associated icon. On Windows, there a 2 kinds of icons: On Linux
		 * and macOS, icons depend on the application associated with file mime type.
		 */
		getFileIcon(path: string, options: FileIconOptions, callback: (error: Error, icon: NativeImage) => void): void;
		getGPUFeatureStatus(): GPUFeatureStatus;
		getJumpListSettings(): JumpListSettings;
		/**
		 * To set the locale, you'll want to use a command line switch at app startup,
		 * which may be found here. Note: When distributing your packaged app, you have to
		 * also ship the locales folder. Note: On Windows you have to call it after the
		 * ready events gets emitted.
		 */
		getLocale(): string;
		/**
		 * If you provided path and args options to app.setLoginItemSettings then you need
		 * to pass the same arguments here for openAtLogin to be set correctly.
		 */
		getLoginItemSettings(options?: LoginItemSettingsOptions): LoginItemSettings;
		/**
		 * Usually the name field of package.json is a short lowercased name, according to
		 * the npm modules spec. You should usually also specify a productName field, which
		 * is your application's full capitalized name, and which will be preferred over
		 * name by Electron.
		 */
		getName(): string;
		/**
		 * You can request the following paths by the name:
		 */
		getPath(name: string): string;
		getVersion(): string;
		/**
		 * Hides all application windows without minimizing them.
		 */
		hide(): void;
		/**
		 * Imports the certificate in pkcs12 format into the platform certificate store.
		 * callback is called with the result of import operation, a value of 0 indicates
		 * success while any other value indicates failure according to chromium
		 * net_error_list.
		 */
		importCertificate(options: ImportCertificateOptions, callback: (result: number) => void): void;
		/**
		 * Invalidates the current Handoff user activity.
		 */
		invalidateCurrentActivity(type: string): void;
		isAccessibilitySupportEnabled(): boolean;
		/**
		 * This method checks if the current executable is the default handler for a
		 * protocol (aka URI scheme). If so, it will return true. Otherwise, it will return
		 * false. Note: On macOS, you can use this method to check if the app has been
		 * registered as the default protocol handler for a protocol. You can also verify
		 * this by checking ~/Library/Preferences/com.apple.LaunchServices.plist on the
		 * macOS machine. Please refer to Apple's documentation for details. The API uses
		 * the Windows Registry and LSCopyDefaultHandlerForURLScheme internally.
		 */
		isDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		isInApplicationsFolder(): boolean;
		isReady(): boolean;
		isUnityRunning(): boolean;
		/**
		 * This method makes your application a Single Instance Application - instead of
		 * allowing multiple instances of your app to run, this will ensure that only a
		 * single instance of your app is running, and other instances signal this instance
		 * and exit. callback will be called by the first instance with callback(argv,
		 * workingDirectory) when a second instance has been executed. argv is an Array of
		 * the second instance's command line arguments, and workingDirectory is its
		 * current working directory. Usually applications respond to this by making their
		 * primary window focused and non-minimized. The callback is guaranteed to be
		 * executed after the ready event of app gets emitted. This method returns false if
		 * your process is the primary instance of the application and your app should
		 * continue loading. And returns true if your process has sent its parameters to
		 * another instance, and you should immediately quit. On macOS the system enforces
		 * single instance automatically when users try to open a second instance of your
		 * app in Finder, and the open-file and open-url events will be emitted for that.
		 * However when users start your app in command line the system's single instance
		 * mechanism will be bypassed and you have to use this method to ensure single
		 * instance. An example of activating the window of primary instance when a second
		 * instance starts:
		 */
		makeSingleInstance(callback: (argv: string[], workingDirectory: string) => void): boolean;
		/**
		 * No confirmation dialog will be presented by default, if you wish to allow the
		 * user to confirm the operation you may do so using the dialog API. NOTE: This
		 * method throws errors if anything other than the user causes the move to fail.
		 * For instance if the user cancels the authorization dialog this method returns
		 * false. If we fail to perform the copy then this method will throw an error. The
		 * message in the error should be informative and tell you exactly what went wrong
		 */
		moveToApplicationsFolder(): boolean;
		/**
		 * Try to close all windows. The before-quit event will be emitted first. If all
		 * windows are successfully closed, the will-quit event will be emitted and by
		 * default the application will terminate. This method guarantees that all
		 * beforeunload and unload event handlers are correctly executed. It is possible
		 * that a window cancels the quitting by returning false in the beforeunload event
		 * handler.
		 */
		quit(): void;
		/**
		 * Relaunches the app when current instance exits. By default the new instance will
		 * use the same working directory and command line arguments with current instance.
		 * When args is specified, the args will be passed as command line arguments
		 * instead. When execPath is specified, the execPath will be executed for relaunch
		 * instead of current app. Note that this method does not quit the app when
		 * executed, you have to call app.quit or app.exit after calling app.relaunch to
		 * make the app restart. When app.relaunch is called for multiple times, multiple
		 * instances will be started after current instance exited. An example of
		 * restarting current instance immediately and adding a new command line argument
		 * to the new instance:
		 */
		relaunch(options?: RelaunchOptions): void;
		/**
		 * Releases all locks that were created by makeSingleInstance. This will allow
		 * multiple instances of the application to once again run side by side.
		 */
		releaseSingleInstance(): void;
		/**
		 * This method checks if the current executable as the default handler for a
		 * protocol (aka URI scheme). If so, it will remove the app as the default handler.
		 */
		removeAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * Set the about panel options. This will override the values defined in the app's
		 * .plist file. See the Apple docs for more details.
		 */
		setAboutPanelOptions(options: AboutPanelOptionsOptions): void;
		/**
		 * Manually enables Chrome's accessibility support, allowing to expose
		 * accessibility switch to users in application settings.
		 * https://www.chromium.org/developers/design-documents/accessibility for more
		 * details. Disabled by default. Note: Rendering accessibility tree can
		 * significantly affect the performance of your app. It should not be enabled by
		 * default.
		 */
		setAccessibilitySupportEnabled(enabled: boolean): void;
		/**
		 * Changes the Application User Model ID to id.
		 */
		setAppUserModelId(id: string): void;
		/**
		 * This method sets the current executable as the default handler for a protocol
		 * (aka URI scheme). It allows you to integrate your app deeper into the operating
		 * system. Once registered, all links with your-protocol:// will be opened with the
		 * current executable. The whole link, including protocol, will be passed to your
		 * application as a parameter. On Windows you can provide optional parameters path,
		 * the path to your executable, and args, an array of arguments to be passed to
		 * your executable when it launches. Note: On macOS, you can only register
		 * protocols that have been added to your app's info.plist, which can not be
		 * modified at runtime. You can however change the file with a simple text editor
		 * or script during build time. Please refer to Apple's documentation for details.
		 * The API uses the Windows Registry and LSSetDefaultHandlerForURLScheme
		 * internally.
		 */
		setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * Sets the counter badge for current app. Setting the count to 0 will hide the
		 * badge. On macOS it shows on the dock icon. On Linux it only works for Unity
		 * launcher, Note: Unity launcher requires the existence of a .desktop file to
		 * work, for more information please read Desktop Environment Integration.
		 */
		setBadgeCount(count: number): boolean;
		/**
		 * Sets or removes a custom Jump List for the application, and returns one of the
		 * following strings: If categories is null the previously set custom Jump List (if
		 * any) will be replaced by the standard Jump List for the app (managed by
		 * Windows). Note: If a JumpListCategory object has neither the type nor the name
		 * property set then its type is assumed to be tasks. If the name property is set
		 * but the type property is omitted then the type is assumed to be custom. Note:
		 * Users can remove items from custom categories, and Windows will not allow a
		 * removed item to be added back into a custom category until after the next
		 * successful call to app.setJumpList(categories). Any attempt to re-add a removed
		 * item to a custom category earlier than that will result in the entire custom
		 * category being omitted from the Jump List. The list of removed items can be
		 * obtained using app.getJumpListSettings(). Here's a very simple example of
		 * creating a custom Jump List:
		 */
		setJumpList(categories: JumpListCategory[]): void;
		/**
		 * Set the app's login item settings. To work with Electron's autoUpdater on
		 * Windows, which uses Squirrel, you'll want to set the launch path to Update.exe,
		 * and pass arguments that specify your application name. For example:
		 */
		setLoginItemSettings(settings: Settings): void;
		/**
		 * Overrides the current application's name.
		 */
		setName(name: string): void;
		/**
		 * Overrides the path to a special directory or file associated with name. If the
		 * path specifies a directory that does not exist, the directory will be created by
		 * this method. On failure an Error is thrown. You can only override paths of a
		 * name defined in app.getPath. By default, web pages' cookies and caches will be
		 * stored under the userData directory. If you want to change this location, you
		 * have to override the userData path before the ready event of the app module is
		 * emitted.
		 */
		setPath(name: string, path: string): void;
		/**
		 * Creates an NSUserActivity and sets it as the current activity. The activity is
		 * eligible for Handoff to another device afterward.
		 */
		setUserActivity(type: string, userInfo: any, webpageURL?: string): void;
		/**
		 * Adds tasks to the Tasks category of the JumpList on Windows. tasks is an array
		 * of Task objects. Note: If you'd like to customize the Jump List even more use
		 * app.setJumpList(categories) instead.
		 */
		setUserTasks(tasks: Task[]): boolean;
		/**
		 * Shows application windows after they were hidden. Does not automatically focus
		 * them.
		 */
		show(): void;
		/**
		 * Start accessing a security scoped resource. With this method electron
		 * applications that are packaged for the Mac App Store may reach outside their
		 * sandbox to access files chosen by the user. See Apple's documentation for a
		 * description of how this system works.
		 */
		startAccessingSecurityScopedResource(bookmarkData: string): Function;
		/**
		 * Updates the current activity if its type matches type, merging the entries from
		 * userInfo into its current userInfo dictionary.
		 */
		updateCurrentActivity(type: string, userInfo: any): void;
		commandLine: CommandLine;
		dock: Dock;
	}

	interface AutoUpdater extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/auto-updater

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
		 * Emitted when an update has been downloaded. On Windows only releaseName is
		 * available.
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
		 * Asks the server whether there is an update. You must call setFeedURL before
		 * using this API.
		 */
		checkForUpdates(): void;
		getFeedURL(): string;
		/**
		 * Restarts the app and installs the update after it has been downloaded. It should
		 * only be called after update-downloaded has been emitted. Under the hood calling
		 * autoUpdater.quitAndInstall() will close all application windows first, and
		 * automatically call app.quit() after all windows have been closed. Note: If the
		 * application is quit without calling this API after the update-downloaded event
		 * has been emitted, the application will still be replaced by the updated one on
		 * the next run.
		 */
		quitAndInstall(): void;
		/**
		 * Sets the url and initialize the auto updater.
		 */
		setFeedURL(options: FeedURLOptions): void;
	}

	interface BluetoothDevice {

		// Docs: http://electron.atom.io/docs/api/structures/bluetooth-device

		deviceId: string;
		deviceName: string;
	}

	class BrowserView extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/browser-view

		constructor(options?: BrowserViewConstructorOptions);
		static fromId(id: number): BrowserView;
		static fromWebContents(webContents: WebContents): BrowserView | null;
		static getAllViews(): BrowserView[];
		/**
		 * Force closing the view, the unload and beforeunload events won't be emitted for
		 * the web page. After you're done with a view, call this function in order to free
		 * memory and other resources as soon as possible.
		 */
		destroy(): void;
		isDestroyed(): boolean;
		setAutoResize(options: AutoResizeOptions): void;
		setBackgroundColor(color: string): void;
		/**
		 * Resizes and moves the view to the supplied bounds relative to the window.
		 */
		setBounds(bounds: Rectangle): void;
		id: number;
		webContents: WebContents;
	}

	class BrowserWindow extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/browser-window

		/**
		 * Emitted when an App Command is invoked. These are typically related to keyboard
		 * media keys or browser commands, as well as the "Back" button built into some
		 * mice on Windows. Commands are lowercased, underscores are replaced with hyphens,
		 * and the APPCOMMAND_ prefix is stripped off. e.g. APPCOMMAND_BROWSER_BACKWARD is
		 * emitted as browser-backward.
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
		 * beforeunload and unload event of the DOM. Calling event.preventDefault() will
		 * cancel the close. Usually you would want to use the beforeunload handler to
		 * decide whether the window should be closed, which will also be called when the
		 * window is reloaded. In Electron, returning any value other than undefined would
		 * cancel the close. For example: Note: There is a subtle difference between the
		 * behaviors of window.onbeforeunload = handler and
		 * window.addEventListener('beforeunload', handler). It is recommended to always
		 * set the event.returnValue explicitly, instead of just returning a value, as the
		 * former works more consistently within Electron.
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
		 * Emitted when the window is being moved to a new position. Note: On macOS this
		 * event is just an alias of moved.
		 */
		on(event: 'move', listener: Function): this;
		once(event: 'move', listener: Function): this;
		addListener(event: 'move', listener: Function): this;
		removeListener(event: 'move', listener: Function): this;
		/**
		 * Emitted once when the window is moved to a new position.
		 */
		on(event: 'moved', listener: Function): this;
		once(event: 'moved', listener: Function): this;
		addListener(event: 'moved', listener: Function): this;
		removeListener(event: 'moved', listener: Function): this;
		/**
		 * Emitted when the native new tab button is clicked.
		 */
		on(event: 'new-window-for-tab', listener: Function): this;
		once(event: 'new-window-for-tab', listener: Function): this;
		addListener(event: 'new-window-for-tab', listener: Function): this;
		removeListener(event: 'new-window-for-tab', listener: Function): this;
		/**
		 * Emitted when the document changed its title, calling event.preventDefault() will
		 * prevent the native window's title from changing.
		 */
		on(event: 'page-title-updated', listener: (event: Event,
			title: string) => void): this;
		once(event: 'page-title-updated', listener: (event: Event,
			title: string) => void): this;
		addListener(event: 'page-title-updated', listener: (event: Event,
			title: string) => void): this;
		removeListener(event: 'page-title-updated', listener: (event: Event,
			title: string) => void): this;
		/**
		 * Emitted when the web page has been rendered (while not being shown) and window
		 * can be displayed without a visual flash.
		 */
		on(event: 'ready-to-show', listener: Function): this;
		once(event: 'ready-to-show', listener: Function): this;
		addListener(event: 'ready-to-show', listener: Function): this;
		removeListener(event: 'ready-to-show', listener: Function): this;
		/**
		 * Emitted when the window is being resized.
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
		 * Emitted when scroll wheel event phase has begun.
		 */
		on(event: 'scroll-touch-begin', listener: Function): this;
		once(event: 'scroll-touch-begin', listener: Function): this;
		addListener(event: 'scroll-touch-begin', listener: Function): this;
		removeListener(event: 'scroll-touch-begin', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase filed upon reaching the edge of element.
		 */
		on(event: 'scroll-touch-edge', listener: Function): this;
		once(event: 'scroll-touch-edge', listener: Function): this;
		addListener(event: 'scroll-touch-edge', listener: Function): this;
		removeListener(event: 'scroll-touch-edge', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase has ended.
		 */
		on(event: 'scroll-touch-end', listener: Function): this;
		once(event: 'scroll-touch-end', listener: Function): this;
		addListener(event: 'scroll-touch-end', listener: Function): this;
		removeListener(event: 'scroll-touch-end', listener: Function): this;
		/**
		 * Emitted when window session is going to end due to force shutdown or machine
		 * restart or session log off.
		 */
		on(event: 'session-end', listener: Function): this;
		once(event: 'session-end', listener: Function): this;
		addListener(event: 'session-end', listener: Function): this;
		removeListener(event: 'session-end', listener: Function): this;
		/**
		 * Emitted when the window opens a sheet.
		 */
		on(event: 'sheet-begin', listener: Function): this;
		once(event: 'sheet-begin', listener: Function): this;
		addListener(event: 'sheet-begin', listener: Function): this;
		removeListener(event: 'sheet-begin', listener: Function): this;
		/**
		 * Emitted when the window has closed a sheet.
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
		 * Emitted on 3-finger swipe. Possible directions are up, right, down, left.
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
		constructor(options?: BrowserWindowConstructorOptions);
		/**
		 * Adds DevTools extension located at path, and returns extension's name. The
		 * extension will be remembered so you only need to call this API once, this API is
		 * not for programming use. If you try to add an extension that has already been
		 * loaded, this method will not return and instead log a warning to the console.
		 * The method will also not return if the extension's manifest is missing or
		 * incomplete. Note: This API cannot be called before the ready event of the app
		 * module is emitted.
		 */
		static addDevToolsExtension(path: string): void;
		/**
		 * Adds Chrome extension located at path, and returns extension's name. The method
		 * will also not return if the extension's manifest is missing or incomplete. Note:
		 * This API cannot be called before the ready event of the app module is emitted.
		 */
		static addExtension(path: string): void;
		static fromBrowserView(browserView: BrowserView): BrowserWindow | null;
		static fromId(id: number): BrowserWindow;
		static fromWebContents(webContents: WebContents): BrowserWindow;
		static getAllWindows(): BrowserWindow[];
		/**
		 * To check if a DevTools extension is installed you can run the following: Note:
		 * This API cannot be called before the ready event of the app module is emitted.
		 */
		static getDevToolsExtensions(): DevToolsExtensions;
		/**
		 * Note: This API cannot be called before the ready event of the app module is
		 * emitted.
		 */
		static getExtensions(): Extensions;
		static getFocusedWindow(): BrowserWindow;
		/**
		 * Remove a DevTools extension by name. Note: This API cannot be called before the
		 * ready event of the app module is emitted.
		 */
		static removeDevToolsExtension(name: string): void;
		/**
		 * Remove a Chrome extension by name. Note: This API cannot be called before the
		 * ready event of the app module is emitted.
		 */
		static removeExtension(name: string): void;
		/**
		 * Adds a window as a tab on this window, after the tab for the window instance.
		 */
		addTabbedWindow(browserWindow: BrowserWindow): void;
		/**
		 * Removes focus from the window.
		 */
		blur(): void;
		blurWebView(): void;
		/**
		 * Same as webContents.capturePage([rect, ]callback).
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Same as webContents.capturePage([rect, ]callback).
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
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
		 */
		closeFilePreview(): void;
		/**
		 * Force closing the window, the unload and beforeunload event won't be emitted for
		 * the web page, and close event will also not be emitted for this window, but it
		 * guarantees the closed event will be emitted.
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
		getBounds(): Rectangle;
		/**
		 * Note: The BrowserView API is currently experimental and may change or be removed
		 * in future Electron releases.
		 */
		getBrowserView(): BrowserView | null;
		getChildWindows(): BrowserWindow[];
		getContentBounds(): Rectangle;
		getContentSize(): number[];
		getMaximumSize(): number[];
		getMinimumSize(): number[];
		/**
		 * The native type of the handle is HWND on Windows, NSView* on macOS, and Window
		 * (unsigned long) on Linux.
		 */
		getNativeWindowHandle(): Buffer;
		getOpacity(): number;
		getParentWindow(): BrowserWindow;
		getPosition(): number[];
		getRepresentedFilename(): string;
		getSize(): number[];
		/**
		 * Note: The title of web page can be different from the title of the native
		 * window.
		 */
		getTitle(): string;
		/**
		 * On Windows and Linux always returns true.
		 */
		hasShadow(): boolean;
		/**
		 * Hides the window.
		 */
		hide(): void;
		/**
		 * Hooks a windows message. The callback is called when the message is received in
		 * the WndProc.
		 */
		hookWindowMessage(message: number, callback: Function): void;
		isAlwaysOnTop(): boolean;
		/**
		 * On Linux always returns true.
		 */
		isClosable(): boolean;
		isDestroyed(): boolean;
		isDocumentEdited(): boolean;
		isFocused(): boolean;
		isFullScreen(): boolean;
		isFullScreenable(): boolean;
		isKiosk(): boolean;
		/**
		 * On Linux always returns true.
		 */
		isMaximizable(): boolean;
		isMaximized(): boolean;
		isMenuBarAutoHide(): boolean;
		isMenuBarVisible(): boolean;
		/**
		 * On Linux always returns true.
		 */
		isMinimizable(): boolean;
		isMinimized(): boolean;
		isModal(): boolean;
		/**
		 * On Linux always returns true.
		 */
		isMovable(): boolean;
		isResizable(): boolean;
		isSimpleFullScreen(): boolean;
		isVisible(): boolean;
		/**
		 * Note: This API always returns false on Windows.
		 */
		isVisibleOnAllWorkspaces(): boolean;
		isWindowMessageHooked(message: number): boolean;
		/**
		 * Same as webContents.loadFile, filePath should be a path to an HTML file relative
		 * to the root of your application.  See the webContents docs for more information.
		 */
		loadFile(filePath: string): void;
		/**
		 * Same as webContents.loadURL(url[, options]). The url can be a remote address
		 * (e.g. http://) or a path to a local HTML file using the file:// protocol. To
		 * ensure that file URLs are properly formatted, it is recommended to use Node's
		 * url.format method: You can load a URL using a POST request with URL-encoded data
		 * by doing the following:
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * Maximizes the window. This will also show (but not focus) the window if it isn't
		 * being displayed already.
		 */
		maximize(): void;
		/**
		 * Merges all windows into one window with multiple tabs when native tabs are
		 * enabled and there is more than one open window.
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
		 */
		moveTabToNewWindow(): void;
		/**
		 * Uses Quick Look to preview a file at a given path.
		 */
		previewFile(path: string, displayName?: string): void;
		/**
		 * Same as webContents.reload.
		 */
		reload(): void;
		/**
		 * Restores the window from minimized state to its previous state.
		 */
		restore(): void;
		/**
		 * Selects the next tab when native tabs are enabled and there are other tabs in
		 * the window.
		 */
		selectNextTab(): void;
		/**
		 * Selects the previous tab when native tabs are enabled and there are other tabs
		 * in the window.
		 */
		selectPreviousTab(): void;
		/**
		 * Sets whether the window should show always on top of other windows. After
		 * setting this, the window is still a normal window, not a toolbox window which
		 * can not be focused on.
		 */
		setAlwaysOnTop(flag: boolean, level?: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver', relativeLevel?: number): void;
		/**
		 * Sets the properties for the window's taskbar button. Note: relaunchCommand and
		 * relaunchDisplayName must always be set together. If one of those properties is
		 * not set, then neither will be used.
		 */
		setAppDetails(options: AppDetailsOptions): void;
		/**
		 * This will make a window maintain an aspect ratio. The extra size allows a
		 * developer to have space, specified in pixels, not included within the aspect
		 * ratio calculations. This API already takes into account the difference between a
		 * window's size and its content size. Consider a normal window with an HD video
		 * player and associated controls. Perhaps there are 15 pixels of controls on the
		 * left edge, 25 pixels of controls on the right edge and 50 pixels of controls
		 * below the player. In order to maintain a 16:9 aspect ratio (standard aspect
		 * ratio for HD @1920x1080) within the player itself we would call this function
		 * with arguments of 16/9 and [ 40, 50 ]. The second argument doesn't care where
		 * the extra width and height are within the content view--only that they exist.
		 * Just sum any extra width and height areas you have within the overall content
		 * view.
		 */
		setAspectRatio(aspectRatio: number, extraSize: Size): void;
		/**
		 * Controls whether to hide cursor when typing.
		 */
		setAutoHideCursor(autoHide: boolean): void;
		/**
		 * Sets whether the window menu bar should hide itself automatically. Once set the
		 * menu bar will only show when users press the single Alt key. If the menu bar is
		 * already visible, calling setAutoHideMenuBar(true) won't hide it immediately.
		 */
		setAutoHideMenuBar(hide: boolean): void;
		/**
		 * Resizes and moves the window to the supplied bounds
		 */
		setBounds(bounds: Rectangle, animate?: boolean): void;
		setBrowserView(browserView: BrowserView): void;
		/**
		 * Sets whether the window can be manually closed by user. On Linux does nothing.
		 */
		setClosable(closable: boolean): void;
		/**
		 * Resizes and moves the window's client area (e.g. the web page) to the supplied
		 * bounds.
		 */
		setContentBounds(bounds: Rectangle, animate?: boolean): void;
		/**
		 * Prevents the window contents from being captured by other apps. On macOS it sets
		 * the NSWindow's sharingType to NSWindowSharingNone. On Windows it calls
		 * SetWindowDisplayAffinity with WDA_MONITOR.
		 */
		setContentProtection(enable: boolean): void;
		/**
		 * Resizes the window's client area (e.g. the web page) to width and height.
		 */
		setContentSize(width: number, height: number, animate?: boolean): void;
		/**
		 * Specifies whether the window’s document has been edited, and the icon in title
		 * bar will become gray when set to true.
		 */
		setDocumentEdited(edited: boolean): void;
		/**
		 * Disable or enable the window.
		 */
		setEnabled(enable: boolean): void;
		/**
		 * Changes whether the window can be focused.
		 */
		setFocusable(focusable: boolean): void;
		/**
		 * Sets whether the window should be in fullscreen mode.
		 */
		setFullScreen(flag: boolean): void;
		/**
		 * Sets whether the maximize/zoom window button toggles fullscreen mode or
		 * maximizes the window.
		 */
		setFullScreenable(fullscreenable: boolean): void;
		/**
		 * Sets whether the window should have a shadow. On Windows and Linux does nothing.
		 */
		setHasShadow(hasShadow: boolean): void;
		/**
		 * Changes window icon.
		 */
		setIcon(icon: NativeImage): void;
		/**
		 * Makes the window ignore all mouse events. All mouse events happened in this
		 * window will be passed to the window below this window, but if this window has
		 * focus, it will still receive keyboard events.
		 */
		setIgnoreMouseEvents(ignore: boolean, options?: IgnoreMouseEventsOptions): void;
		/**
		 * Enters or leaves the kiosk mode.
		 */
		setKiosk(flag: boolean): void;
		/**
		 * Sets whether the window can be manually maximized by user. On Linux does
		 * nothing.
		 */
		setMaximizable(maximizable: boolean): void;
		/**
		 * Sets the maximum size of window to width and height.
		 */
		setMaximumSize(width: number, height: number): void;
		/**
		 * Sets the menu as the window's menu bar, setting it to null will remove the menu
		 * bar.
		 */
		setMenu(menu: Menu | null): void;
		/**
		 * Sets whether the menu bar should be visible. If the menu bar is auto-hide, users
		 * can still bring up the menu bar by pressing the single Alt key.
		 */
		setMenuBarVisibility(visible: boolean): void;
		/**
		 * Sets whether the window can be manually minimized by user. On Linux does
		 * nothing.
		 */
		setMinimizable(minimizable: boolean): void;
		/**
		 * Sets the minimum size of window to width and height.
		 */
		setMinimumSize(width: number, height: number): void;
		/**
		 * Sets whether the window can be moved by user. On Linux does nothing.
		 */
		setMovable(movable: boolean): void;
		/**
		 * Sets the opacity of the window. On Linux does nothing.
		 */
		setOpacity(opacity: number): void;
		/**
		 * Sets a 16 x 16 pixel overlay onto the current taskbar icon, usually used to
		 * convey some sort of application status or to passively notify the user.
		 */
		setOverlayIcon(overlay: NativeImage, description: string): void;
		/**
		 * Sets parent as current window's parent window, passing null will turn current
		 * window into a top-level window.
		 */
		setParentWindow(parent: BrowserWindow): void;
		/**
		 * Moves window to x and y.
		 */
		setPosition(x: number, y: number, animate?: boolean): void;
		/**
		 * Sets progress value in progress bar. Valid range is [0, 1.0]. Remove progress
		 * bar when progress < 0; Change to indeterminate mode when progress > 1. On Linux
		 * platform, only supports Unity desktop environment, you need to specify the
		 * *.desktop file name to desktopName field in package.json. By default, it will
		 * assume app.getName().desktop. On Windows, a mode can be passed. Accepted values
		 * are none, normal, indeterminate, error, and paused. If you call setProgressBar
		 * without a mode set (but with a value within the valid range), normal will be
		 * assumed.
		 */
		setProgressBar(progress: number, options?: ProgressBarOptions): void;
		/**
		 * Sets the pathname of the file the window represents, and the icon of the file
		 * will show in window's title bar.
		 */
		setRepresentedFilename(filename: string): void;
		/**
		 * Sets whether the window can be manually resized by user.
		 */
		setResizable(resizable: boolean): void;
		/**
		 * Changes the attachment point for sheets on macOS. By default, sheets are
		 * attached just below the window frame, but you may want to display them beneath a
		 * HTML-rendered toolbar. For example:
		 */
		setSheetOffset(offsetY: number, offsetX?: number): void;
		/**
		 * Enters or leaves simple fullscreen mode. Simple fullscreen mode emulates the
		 * native fullscreen behavior found in versions of Mac OS X prior to Lion (10.7).
		 */
		setSimpleFullScreen(flag: boolean): void;
		/**
		 * Resizes the window to width and height.
		 */
		setSize(width: number, height: number, animate?: boolean): void;
		/**
		 * Makes the window not show in the taskbar.
		 */
		setSkipTaskbar(skip: boolean): void;
		/**
		 * Add a thumbnail toolbar with a specified set of buttons to the thumbnail image
		 * of a window in a taskbar button layout. Returns a Boolean object indicates
		 * whether the thumbnail has been added successfully. The number of buttons in
		 * thumbnail toolbar should be no greater than 7 due to the limited room. Once you
		 * setup the thumbnail toolbar, the toolbar cannot be removed due to the platform's
		 * limitation. But you can call the API with an empty array to clean the buttons.
		 * The buttons is an array of Button objects: The flags is an array that can
		 * include following Strings:
		 */
		setThumbarButtons(buttons: ThumbarButton[]): boolean;
		/**
		 * Sets the region of the window to show as the thumbnail image displayed when
		 * hovering over the window in the taskbar. You can reset the thumbnail to be the
		 * entire window by specifying an empty region: {x: 0, y: 0, width: 0, height: 0}.
		 */
		setThumbnailClip(region: Rectangle): void;
		/**
		 * Sets the toolTip that is displayed when hovering over the window thumbnail in
		 * the taskbar.
		 */
		setThumbnailToolTip(toolTip: string): void;
		/**
		 * Changes the title of native window to title.
		 */
		setTitle(title: string): void;
		/**
		 * Sets the touchBar layout for the current window. Specifying null or undefined
		 * clears the touch bar. This method only has an effect if the machine has a touch
		 * bar and is running on macOS 10.12.1+. Note: The TouchBar API is currently
		 * experimental and may change or be removed in future Electron releases.
		 */
		setTouchBar(touchBar: TouchBar): void;
		/**
		 * Adds a vibrancy effect to the browser window. Passing null or an empty string
		 * will remove the vibrancy effect on the window.
		 */
		setVibrancy(type: 'appearance-based' | 'light' | 'dark' | 'titlebar' | 'selection' | 'menu' | 'popover' | 'sidebar' | 'medium-light' | 'ultra-dark'): void;
		/**
		 * Sets whether the window should be visible on all workspaces. Note: This API does
		 * nothing on Windows.
		 */
		setVisibleOnAllWorkspaces(visible: boolean): void;
		/**
		 * Shows and gives focus to the window.
		 */
		show(): void;
		/**
		 * Same as webContents.showDefinitionForSelection().
		 */
		showDefinitionForSelection(): void;
		/**
		 * Shows the window but doesn't focus on it.
		 */
		showInactive(): void;
		/**
		 * Toggles the visibility of the tab bar if native tabs are enabled and there is
		 * only one tab in the current window.
		 */
		toggleTabBar(): void;
		/**
		 * Unhooks all of the window messages.
		 */
		unhookAllWindowMessages(): void;
		/**
		 * Unhook the window message.
		 */
		unhookWindowMessage(message: number): void;
		/**
		 * Unmaximizes the window.
		 */
		unmaximize(): void;
		id: number;
		webContents: WebContents;
	}

	class BrowserWindowProxy extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/browser-window-proxy

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
		 * Sends a message to the child window with the specified origin or * for no origin
		 * preference. In addition to these methods, the child window implements
		 * window.opener object with no properties and a single method.
		 */
		postMessage(message: string, targetOrigin: string): void;
		/**
		 * Invokes the print dialog on the child window.
		 */
		print(): void;
		closed: boolean;
	}

	interface Certificate {

		// Docs: http://electron.atom.io/docs/api/structures/certificate

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

		// Docs: http://electron.atom.io/docs/api/structures/certificate-principal

		/**
		 * Common Name
		 */
		commonName: string;
		/**
		 * Country or region
		 */
		country: string;
		/**
		 * Locality
		 */
		locality: string;
		/**
		 * Organization names
		 */
		organizations: string[];
		/**
		 * Organization Unit names
		 */
		organizationUnits: string[];
		/**
		 * State or province
		 */
		state: string;
	}

	class ClientRequest extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/client-request

		/**
		 * Emitted when the request is aborted. The abort event will not be fired if the
		 * request is already closed.
		 */
		on(event: 'abort', listener: Function): this;
		once(event: 'abort', listener: Function): this;
		addListener(event: 'abort', listener: Function): this;
		removeListener(event: 'abort', listener: Function): this;
		/**
		 * Emitted as the last event in the HTTP request-response transaction. The close
		 * event indicates that no more events will be emitted on either the request or
		 * response objects.
		 */
		on(event: 'close', listener: Function): this;
		once(event: 'close', listener: Function): this;
		addListener(event: 'close', listener: Function): this;
		removeListener(event: 'close', listener: Function): this;
		/**
		 * Emitted when the net module fails to issue a network request. Typically when the
		 * request object emits an error event, a close event will subsequently follow and
		 * no response object will be provided.
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
		 * Emitted just after the last chunk of the request's data has been written into
		 * the request object.
		 */
		on(event: 'finish', listener: Function): this;
		once(event: 'finish', listener: Function): this;
		addListener(event: 'finish', listener: Function): this;
		removeListener(event: 'finish', listener: Function): this;
		/**
		 * Emitted when an authenticating proxy is asking for user credentials. The
		 * callback function is expected to be called back with user credentials: Providing
		 * empty credentials will cancel the request and report an authentication error on
		 * the response object:
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
		 * Emitted when there is redirection and the mode is manual. Calling
		 * request.followRedirect will continue with the redirection.
		 */
		on(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: any) => void): this;
		once(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: any) => void): this;
		addListener(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: any) => void): this;
		removeListener(event: 'redirect', listener: (statusCode: number,
			method: string,
			redirectUrl: string,
			responseHeaders: any) => void): this;
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
		constructor(options: 'method' | 'url' | 'session' | 'partition' | 'protocol' | 'host' | 'hostname' | 'port' | 'path' | 'redirect');
		/**
		 * Cancels an ongoing HTTP transaction. If the request has already emitted the
		 * close event, the abort operation will have no effect. Otherwise an ongoing event
		 * will emit abort and close events. Additionally, if there is an ongoing response
		 * object,it will emit the aborted event.
		 */
		abort(): void;
		/**
		 * Sends the last chunk of the request data. Subsequent write or end operations
		 * will not be allowed. The finish event is emitted just after the end operation.
		 */
		end(chunk?: string | Buffer, encoding?: string, callback?: Function): void;
		/**
		 * Continues any deferred redirection request when the redirection mode is manual.
		 */
		followRedirect(): void;
		getHeader(name: string): Header;
		/**
		 * Removes a previously set extra header name. This method can be called only
		 * before first write. Trying to call it after the first write will throw an error.
		 */
		removeHeader(name: string): void;
		/**
		 * Adds an extra HTTP header. The header name will issued as it is without
		 * lowercasing. It can be called only before first write. Calling this method after
		 * the first write will throw an error. If the passed value is not a String, its
		 * toString() method will be called to obtain the final value.
		 */
		setHeader(name: string, value: any): void;
		/**
		 * callback is essentially a dummy function introduced in the purpose of keeping
		 * similarity with the Node.js API. It is called asynchronously in the next tick
		 * after chunk content have been delivered to the Chromium networking layer.
		 * Contrary to the Node.js implementation, it is not guaranteed that chunk content
		 * have been flushed on the wire before callback is called. Adds a chunk of data to
		 * the request body. The first write operation may cause the request headers to be
		 * issued on the wire. After the first write operation, it is not allowed to add or
		 * remove a custom header.
		 */
		write(chunk: string | Buffer, encoding?: string, callback?: Function): void;
		chunkedEncoding: boolean;
	}

	interface Clipboard extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/clipboard

		availableFormats(type?: string): string[];
		/**
		 * Clears the clipboard content.
		 */
		clear(type?: string): void;
		has(format: string, type?: string): boolean;
		read(format: string): string;
		/**
		 * Returns an Object containing title and url keys representing the bookmark in the
		 * clipboard. The title and url values will be empty strings when the bookmark is
		 * unavailable.
		 */
		readBookmark(): ReadBookmark;
		readBuffer(format: string): Buffer;
		readFindText(): string;
		readHTML(type?: string): string;
		readImage(type?: string): NativeImage;
		readRTF(type?: string): string;
		readText(type?: string): string;
		/**
		 * Writes data to the clipboard.
		 */
		write(data: Data, type?: string): void;
		/**
		 * Writes the title and url into the clipboard as a bookmark. Note: Most apps on
		 * Windows don't support pasting bookmarks into them so you can use clipboard.write
		 * to write both a bookmark and fallback text to the clipboard.
		 */
		writeBookmark(title: string, url: string, type?: string): void;
		/**
		 * Writes the buffer into the clipboard as format.
		 */
		writeBuffer(format: string, buffer: Buffer, type?: string): void;
		/**
		 * Writes the text into the find pasteboard as plain text. This method uses
		 * synchronous IPC when called from the renderer process.
		 */
		writeFindText(text: string): void;
		/**
		 * Writes markup to the clipboard.
		 */
		writeHTML(markup: string, type?: string): void;
		/**
		 * Writes image to the clipboard.
		 */
		writeImage(image: NativeImage, type?: string): void;
		/**
		 * Writes the text into the clipboard in RTF.
		 */
		writeRTF(text: string, type?: string): void;
		/**
		 * Writes the text into the clipboard as plain text.
		 */
		writeText(text: string, type?: string): void;
	}

	interface ContentTracing extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/content-tracing

		/**
		 * Get the current monitoring traced data. Child processes typically cache trace
		 * data and only rarely flush and send trace data back to the main process. This is
		 * because it may be an expensive operation to send the trace data over IPC and we
		 * would like to avoid unneeded runtime overhead from tracing. So, to end tracing,
		 * we must asynchronously ask all child processes to flush any pending trace data.
		 * Once all child processes have acknowledged the captureMonitoringSnapshot request
		 * the callback will be called with a file that contains the traced data.
		 */
		captureMonitoringSnapshot(resultFilePath: string, callback: (resultFilePath: string) => void): void;
		/**
		 * Get a set of category groups. The category groups can change as new code paths
		 * are reached. Once all child processes have acknowledged the getCategories
		 * request the callback is invoked with an array of category groups.
		 */
		getCategories(callback: (categories: string[]) => void): void;
		/**
		 * Get the maximum usage across processes of trace buffer as a percentage of the
		 * full state. When the TraceBufferUsage value is determined the callback is
		 * called.
		 */
		getTraceBufferUsage(callback: (value: number, percentage: number) => void): void;
		/**
		 * Start monitoring on all processes. Monitoring begins immediately locally and
		 * asynchronously on child processes as soon as they receive the startMonitoring
		 * request. Once all child processes have acknowledged the startMonitoring request
		 * the callback will be called.
		 */
		startMonitoring(options: StartMonitoringOptions, callback: Function): void;
		/**
		 * Start recording on all processes. Recording begins immediately locally and
		 * asynchronously on child processes as soon as they receive the EnableRecording
		 * request. The callback will be called once all child processes have acknowledged
		 * the startRecording request. categoryFilter is a filter to control what category
		 * groups should be traced. A filter can have an optional - prefix to exclude
		 * category groups that contain a matching category. Having both included and
		 * excluded category patterns in the same list is not supported. Examples:
		 * traceOptions controls what kind of tracing is enabled, it is a comma-delimited
		 * list. Possible options are: The first 3 options are trace recording modes and
		 * hence mutually exclusive. If more than one trace recording modes appear in the
		 * traceOptions string, the last one takes precedence. If none of the trace
		 * recording modes are specified, recording mode is record-until-full. The trace
		 * option will first be reset to the default option (record_mode set to
		 * record-until-full, enable_sampling and enable_systrace set to false) before
		 * options parsed from traceOptions are applied on it.
		 */
		startRecording(options: StartRecordingOptions, callback: Function): void;
		/**
		 * Stop monitoring on all processes. Once all child processes have acknowledged the
		 * stopMonitoring request the callback is called.
		 */
		stopMonitoring(callback: Function): void;
		/**
		 * Stop recording on all processes. Child processes typically cache trace data and
		 * only rarely flush and send trace data back to the main process. This helps to
		 * minimize the runtime overhead of tracing since sending trace data over IPC can
		 * be an expensive operation. So, to end tracing, we must asynchronously ask all
		 * child processes to flush any pending trace data. Once all child processes have
		 * acknowledged the stopRecording request, callback will be called with a file that
		 * contains the traced data. Trace data will be written into resultFilePath if it
		 * is not empty or into a temporary file. The actual file path will be passed to
		 * callback if it's not null.
		 */
		stopRecording(resultFilePath: string, callback: (resultFilePath: string) => void): void;
	}

	interface Cookie {

		// Docs: http://electron.atom.io/docs/api/structures/cookie

		/**
		 * The domain of the cookie.
		 */
		domain?: string;
		/**
		 * The expiration date of the cookie as the number of seconds since the UNIX epoch.
		 * Not provided for session cookies.
		 */
		expirationDate?: number;
		/**
		 * Whether the cookie is a host-only cookie.
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

	class Cookies extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/cookies

		/**
		 * Emitted when a cookie is changed because it was added, edited, removed, or
		 * expired.
		 */
		on(event: 'changed', listener: (event: Event,
			/**
			 * The cookie that was changed.
			 */
			cookie: Cookie,
			/**
			 * The cause of the change with one of the following values:
			 */
			cause: ('explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite'),
			/**
			 * `true` if the cookie was removed, `false` otherwise.
			 */
			removed: boolean) => void): this;
		once(event: 'changed', listener: (event: Event,
			/**
			 * The cookie that was changed.
			 */
			cookie: Cookie,
			/**
			 * The cause of the change with one of the following values:
			 */
			cause: ('explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite'),
			/**
			 * `true` if the cookie was removed, `false` otherwise.
			 */
			removed: boolean) => void): this;
		addListener(event: 'changed', listener: (event: Event,
			/**
			 * The cookie that was changed.
			 */
			cookie: Cookie,
			/**
			 * The cause of the change with one of the following values:
			 */
			cause: ('explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite'),
			/**
			 * `true` if the cookie was removed, `false` otherwise.
			 */
			removed: boolean) => void): this;
		removeListener(event: 'changed', listener: (event: Event,
			/**
			 * The cookie that was changed.
			 */
			cookie: Cookie,
			/**
			 * The cause of the change with one of the following values:
			 */
			cause: ('explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite'),
			/**
			 * `true` if the cookie was removed, `false` otherwise.
			 */
			removed: boolean) => void): this;
		/**
		 * Writes any unwritten cookies data to disk.
		 */
		flushStore(callback: Function): void;
		/**
		 * Sends a request to get all cookies matching filter, callback will be called with
		 * callback(error, cookies) on complete.
		 */
		get(filter: Filter, callback: (error: Error, cookies: Cookie[]) => void): void;
		/**
		 * Removes the cookies matching url and name, callback will called with callback()
		 * on complete.
		 */
		remove(url: string, name: string, callback: Function): void;
		/**
		 * Sets a cookie with details, callback will be called with callback(error) on
		 * complete.
		 */
		set(details: Details, callback: (error: Error) => void): void;
	}

	interface CPUUsage {

		// Docs: http://electron.atom.io/docs/api/structures/cpu-usage

		/**
		 * The number of average idle cpu wakeups per second since the last call to
		 * getCPUUsage. First call returns 0. Will always return 0 on Windows.
		 */
		idleWakeupsPerSecond: number;
		/**
		 * Percentage of CPU used since the last call to getCPUUsage. First call returns 0.
		 */
		percentCPUUsage: number;
	}

	interface CrashReport {

		// Docs: http://electron.atom.io/docs/api/structures/crash-report

		date: Date;
		id: string;
	}

	interface CrashReporter extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/crash-reporter

		/**
		 * Set an extra parameter to be sent with the crash report. The values specified
		 * here will be sent in addition to any values set via the extra option when start
		 * was called. This API is only available on macOS, if you need to add/update extra
		 * parameters on Linux and Windows after your first call to start you can call
		 * start again with the updated extra options.
		 */
		addExtraParameter(key: string, value: string): void;
		/**
		 * Returns the date and ID of the last crash report. If no crash reports have been
		 * sent or the crash reporter has not been started, null is returned.
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
		 * Note: This API can only be called from the main process.
		 */
		getUploadToServer(): boolean;
		/**
		 * Remove a extra parameter from the current set of parameters so that it will not
		 * be sent with the crash report.
		 */
		removeExtraParameter(key: string): void;
		/**
		 * This would normally be controlled by user preferences. This has no effect if
		 * called before start is called. Note: This API can only be called from the main
		 * process.
		 */
		setUploadToServer(uploadToServer: boolean): void;
		/**
		 * You are required to call this method before using any other crashReporter APIs
		 * and in each process (main/renderer) from which you want to collect crash
		 * reports. You can pass different options to crashReporter.start when calling from
		 * different processes. Note Child processes created via the child_process module
		 * will not have access to the Electron modules. Therefore, to collect crash
		 * reports from them, use process.crashReporter.start instead. Pass the same
		 * options as above along with an additional one called crashesDirectory that
		 * should point to a directory to store the crash reports temporarily. You can test
		 * this out by calling process.crash() to crash the child process. Note: To collect
		 * crash reports from child process in Windows, you need to add this extra code as
		 * well. This will start the process that will monitor and send the crash reports.
		 * Replace submitURL, productName and crashesDirectory with appropriate values.
		 * Note: If you need send additional/updated extra parameters after your first call
		 * start you can call addExtraParameter on macOS or call start again with the
		 * new/updated extra parameters on Linux and Windows. Note: On macOS, Electron uses
		 * a new crashpad client for crash collection and reporting. If you want to enable
		 * crash reporting, initializing crashpad from the main process using
		 * crashReporter.start is required regardless of which process you want to collect
		 * crashes from. Once initialized this way, the crashpad handler collects crashes
		 * from all processes. You still have to call crashReporter.start from the renderer
		 * or child process, otherwise crashes from them will get reported without
		 * companyName, productName or any of the extra information.
		 */
		start(options: CrashReporterStartOptions): void;
	}

	class Debugger extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/debugger

		/**
		 * Emitted when debugging session is terminated. This happens either when
		 * webContents is closed or devtools is invoked for the attached webContents.
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
		 * Emitted whenever debugging target issues instrumentation event.
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
			params: any) => void): this;
		once(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: any) => void): this;
		addListener(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: any) => void): this;
		removeListener(event: 'message', listener: (event: Event,
			/**
			 * Method name.
			 */
			method: string,
			/**
			 * Event parameters defined by the 'parameters' attribute in the remote debugging
			 * protocol.
			 */
			params: any) => void): this;
		/**
		 * Attaches the debugger to the webContents.
		 */
		attach(protocolVersion?: string): void;
		/**
		 * Detaches the debugger from the webContents.
		 */
		detach(): void;
		isAttached(): boolean;
		/**
		 * Send given command to the debugging target.
		 */
		sendCommand(method: string, commandParams?: any, callback?: (error: any, result: any) => void): void;
	}

	interface DesktopCapturer extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/desktop-capturer

		/**
		 * Starts gathering information about all available desktop media sources, and
		 * calls callback(error, sources) when finished. sources is an array of
		 * DesktopCapturerSource objects, each DesktopCapturerSource represents a screen or
		 * an individual window that can be captured.
		 */
		getSources(options: SourcesOptions, callback: (error: Error, sources: DesktopCapturerSource[]) => void): void;
	}

	interface DesktopCapturerSource {

		// Docs: http://electron.atom.io/docs/api/structures/desktop-capturer-source

		/**
		 * The identifier of a window or screen that can be used as a chromeMediaSourceId
		 * constraint when calling [navigator.webkitGetUserMedia]. The format of the
		 * identifier will be window:XX or screen:XX, where XX is a random generated
		 * number.
		 */
		id: string;
		/**
		 * A screen source will be named either Entire Screen or Screen <index>, while the
		 * name of a window source will match the window title.
		 */
		name: string;
		/**
		 * A thumbnail image. There is no guarantee that the size of the thumbnail is the
		 * same as the thumbnailSize specified in the options passed to
		 * desktopCapturer.getSources. The actual size depends on the scale of the screen
		 * or window.
		 */
		thumbnail: NativeImage;
	}

	interface Dialog extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/dialog

		/**
		 * On macOS, this displays a modal dialog that shows a message and certificate
		 * information, and gives the user the option of trusting/importing the
		 * certificate. If you provide a browserWindow argument the dialog will be attached
		 * to the parent window, making it modal. On Windows the options are more limited,
		 * due to the Win32 APIs used:
		 */
		showCertificateTrustDialog(browserWindow: BrowserWindow, options: CertificateTrustDialogOptions, callback: Function): void;
		/**
		 * On macOS, this displays a modal dialog that shows a message and certificate
		 * information, and gives the user the option of trusting/importing the
		 * certificate. If you provide a browserWindow argument the dialog will be attached
		 * to the parent window, making it modal. On Windows the options are more limited,
		 * due to the Win32 APIs used:
		 */
		showCertificateTrustDialog(options: CertificateTrustDialogOptions, callback: Function): void;
		/**
		 * On macOS, this displays a modal dialog that shows a message and certificate
		 * information, and gives the user the option of trusting/importing the
		 * certificate. If you provide a browserWindow argument the dialog will be attached
		 * to the parent window, making it modal. On Windows the options are more limited,
		 * due to the Win32 APIs used:
		 */
		showCertificateTrustDialog(browserWindow: BrowserWindow, options: CertificateTrustDialogOptions, callback: Function): void;
		/**
		 * Displays a modal dialog that shows an error message. This API can be called
		 * safely before the ready event the app module emits, it is usually used to report
		 * errors in early stage of startup. If called before the app readyevent on Linux,
		 * the message will be emitted to stderr, and no GUI dialog will appear.
		 */
		showErrorBox(title: string, content: string): void;
		/**
		 * Shows a message box, it will block the process until the message box is closed.
		 * It returns the index of the clicked button. The browserWindow argument allows
		 * the dialog to attach itself to a parent window, making it modal. If a callback
		 * is passed, the dialog will not block the process. The API call will be
		 * asynchronous and the result will be passed via callback(response).
		 */
		showMessageBox(browserWindow: BrowserWindow, options: MessageBoxOptions, callback?: (response: number, checkboxChecked: boolean) => void): number;
		/**
		 * Shows a message box, it will block the process until the message box is closed.
		 * It returns the index of the clicked button. The browserWindow argument allows
		 * the dialog to attach itself to a parent window, making it modal. If a callback
		 * is passed, the dialog will not block the process. The API call will be
		 * asynchronous and the result will be passed via callback(response).
		 */
		showMessageBox(options: MessageBoxOptions, callback?: (response: number, checkboxChecked: boolean) => void): number;
		/**
		 * The browserWindow argument allows the dialog to attach itself to a parent
		 * window, making it modal. The filters specifies an array of file types that can
		 * be displayed or selected when you want to limit the user to a specific type. For
		 * example: The extensions array should contain extensions without wildcards or
		 * dots (e.g. 'png' is good but '.png' and '*.png' are bad). To show all files, use
		 * the '*' wildcard (no other wildcard is supported). If a callback is passed, the
		 * API call will be asynchronous and the result will be passed via
		 * callback(filenames). Note: On Windows and Linux an open dialog can not be both a
		 * file selector and a directory selector, so if you set properties to ['openFile',
		 * 'openDirectory'] on these platforms, a directory selector will be shown.
		 */
		showOpenDialog(browserWindow: BrowserWindow, options: OpenDialogOptions, callback?: (filePaths: string[], bookmarks: string[]) => void): string[];
		/**
		 * The browserWindow argument allows the dialog to attach itself to a parent
		 * window, making it modal. The filters specifies an array of file types that can
		 * be displayed or selected when you want to limit the user to a specific type. For
		 * example: The extensions array should contain extensions without wildcards or
		 * dots (e.g. 'png' is good but '.png' and '*.png' are bad). To show all files, use
		 * the '*' wildcard (no other wildcard is supported). If a callback is passed, the
		 * API call will be asynchronous and the result will be passed via
		 * callback(filenames). Note: On Windows and Linux an open dialog can not be both a
		 * file selector and a directory selector, so if you set properties to ['openFile',
		 * 'openDirectory'] on these platforms, a directory selector will be shown.
		 */
		showOpenDialog(options: OpenDialogOptions, callback?: (filePaths: string[], bookmarks: string[]) => void): string[];
		/**
		 * The browserWindow argument allows the dialog to attach itself to a parent
		 * window, making it modal. The filters specifies an array of file types that can
		 * be displayed, see dialog.showOpenDialog for an example. If a callback is passed,
		 * the API call will be asynchronous and the result will be passed via
		 * callback(filename).
		 */
		showSaveDialog(browserWindow: BrowserWindow, options: SaveDialogOptions, callback?: (filename: string, bookmark: string) => void): string;
		/**
		 * The browserWindow argument allows the dialog to attach itself to a parent
		 * window, making it modal. The filters specifies an array of file types that can
		 * be displayed, see dialog.showOpenDialog for an example. If a callback is passed,
		 * the API call will be asynchronous and the result will be passed via
		 * callback(filename).
		 */
		showSaveDialog(options: SaveDialogOptions, callback?: (filename: string, bookmark: string) => void): string;
	}

	interface Display {

		// Docs: http://electron.atom.io/docs/api/structures/display

		bounds: Rectangle;
		/**
		 * Unique identifier associated with the display.
		 */
		id: number;
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
		 * Can be available, unavailable, unknown.
		 */
		touchSupport: ('available' | 'unavailable' | 'unknown');
		workArea: Rectangle;
		workAreaSize: Size;
	}

	class DownloadItem extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/download-item

		/**
		 * Emitted when the download is in a terminal state. This includes a completed
		 * download, a cancelled download (via downloadItem.cancel()), and interrupted
		 * download that can't be resumed. The state can be one of following:
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
		 * Emitted when the download has been updated and is not done. The state can be one
		 * of following:
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
		canResume(): boolean;
		getContentDisposition(): string;
		getETag(): string;
		/**
		 * Note: The file name is not always the same as the actual one saved in local
		 * disk. If user changes the file name in a prompted download saving dialog, the
		 * actual name of saved file will be different.
		 */
		getFilename(): string;
		getLastModifiedTime(): string;
		getMimeType(): string;
		getReceivedBytes(): number;
		getSavePath(): string;
		getStartTime(): number;
		/**
		 * Note: The following methods are useful specifically to resume a cancelled item
		 * when session is restarted.
		 */
		getState(): ('progressing' | 'completed' | 'cancelled' | 'interrupted');
		/**
		 * If the size is unknown, it returns 0.
		 */
		getTotalBytes(): number;
		getURL(): string;
		getURLChain(): string[];
		hasUserGesture(): boolean;
		isPaused(): boolean;
		/**
		 * Pauses the download.
		 */
		pause(): void;
		/**
		 * Resumes the download that has been paused. Note: To enable resumable downloads
		 * the server you are downloading from must support range requests and provide both
		 * Last-Modified and ETag header values. Otherwise resume() will dismiss previously
		 * received bytes and restart the download from the beginning.
		 */
		resume(): void;
		/**
		 * The API is only available in session's will-download callback function. If user
		 * doesn't set the save path via the API, Electron will use the original routine to
		 * determine the save path(Usually prompts a save dialog).
		 */
		setSavePath(path: string): void;
	}

	interface FileFilter {

		// Docs: http://electron.atom.io/docs/api/structures/file-filter

		extensions: string[];
		name: string;
	}

	interface GlobalShortcut extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/global-shortcut

		/**
		 * When the accelerator is already taken by other applications, this call will
		 * still return false. This behavior is intended by operating systems, since they
		 * don't want applications to fight for global shortcuts.
		 */
		isRegistered(accelerator: Accelerator): boolean;
		/**
		 * Registers a global shortcut of accelerator. The callback is called when the
		 * registered shortcut is pressed by the user. When the accelerator is already
		 * taken by other applications, this call will silently fail. This behavior is
		 * intended by operating systems, since they don't want applications to fight for
		 * global shortcuts.
		 */
		register(accelerator: Accelerator, callback: Function): void;
		/**
		 * Unregisters the global shortcut of accelerator.
		 */
		unregister(accelerator: Accelerator): void;
		/**
		 * Unregisters all of the global shortcuts.
		 */
		unregisterAll(): void;
	}

	interface GPUFeatureStatus {

		// Docs: http://electron.atom.io/docs/api/structures/gpu-feature-status

		/**
		 * Canvas
		 */
		'2d_canvas': string;
		/**
		 * Flash
		 */
		flash_3d: string;
		/**
		 * Flash Stage3D
		 */
		flash_stage3d: string;
		/**
		 * Flash Stage3D Baseline profile
		 */
		flash_stage3d_baseline: string;
		/**
		 * Compositing
		 */
		gpu_compositing: string;
		/**
		 * Multiple Raster Threads
		 */
		multiple_raster_threads: string;
		/**
		 * Native GpuMemoryBuffers
		 */
		native_gpu_memory_buffers: string;
		/**
		 * Rasterization
		 */
		rasterization: string;
		/**
		 * Video Decode
		 */
		video_decode: string;
		/**
		 * Video Encode
		 */
		video_encode: string;
		/**
		 * VPx Video Decode
		 */
		vpx_decode: string;
		/**
		 * WebGL
		 */
		webgl: string;
		/**
		 * WebGL2
		 */
		webgl2: string;
	}

	interface InAppPurchase extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/in-app-purchase

		/**
		 * Emitted when one or more transactions have been updated.
		 */
		on(event: 'transactions-updated', listener: (event: Event,
			/**
			 * Array of transactions.
			 */
			transactions: Transaction[]) => void): this;
		once(event: 'transactions-updated', listener: (event: Event,
			/**
			 * Array of transactions.
			 */
			transactions: Transaction[]) => void): this;
		addListener(event: 'transactions-updated', listener: (event: Event,
			/**
			 * Array of transactions.
			 */
			transactions: Transaction[]) => void): this;
		removeListener(event: 'transactions-updated', listener: (event: Event,
			/**
			 * Array of transactions.
			 */
			transactions: Transaction[]) => void): this;
		canMakePayments(): boolean;
		getReceiptURL(): string;
		purchaseProduct(productID: string, quantity?: number, callback?: (isProductValid: boolean) => void): void;
	}

	class IncomingMessage extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/incoming-message

		/**
		 * Emitted when a request has been canceled during an ongoing HTTP transaction.
		 */
		on(event: 'aborted', listener: Function): this;
		once(event: 'aborted', listener: Function): this;
		addListener(event: 'aborted', listener: Function): this;
		removeListener(event: 'aborted', listener: Function): this;
		/**
		 * The data event is the usual method of transferring response data into
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
		 * error Error - Typically holds an error string identifying failure root cause.
		 * Emitted when an error was encountered while streaming response data events. For
		 * instance, if the server closes the underlying while the response is still
		 * streaming, an error event will be emitted on the response object and a close
		 * event will subsequently follow on the request object.
		 */
		on(event: 'error', listener: Function): this;
		once(event: 'error', listener: Function): this;
		addListener(event: 'error', listener: Function): this;
		removeListener(event: 'error', listener: Function): this;
		headers: any;
		httpVersion: string;
		httpVersionMajor: number;
		httpVersionMinor: number;
		statusCode: number;
		statusMessage: string;
	}

	interface IOCounters {

		// Docs: http://electron.atom.io/docs/api/structures/io-counters

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

	interface IpcMain extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/ipc-main

		/**
		 * Listens to channel, when a new message arrives listener would be called with
		 * listener(event, args...).
		 */
		on(channel: string, listener: Function): this;
		/**
		 * Adds a one time listener function for the event. This listener is invoked only
		 * the next time a message is sent to channel, after which it is removed.
		 */
		once(channel: string, listener: Function): this;
		/**
		 * Removes listeners of the specified channel.
		 */
		removeAllListeners(channel: string): this;
		/**
		 * Removes the specified listener from the listener array for the specified
		 * channel.
		 */
		removeListener(channel: string, listener: Function): this;
	}

	interface IpcRenderer extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/ipc-renderer

		/**
		 * Listens to channel, when a new message arrives listener would be called with
		 * listener(event, args...).
		 */
		on(channel: string, listener: Function): this;
		/**
		 * Adds a one time listener function for the event. This listener is invoked only
		 * the next time a message is sent to channel, after which it is removed.
		 */
		once(channel: string, listener: Function): this;
		/**
		 * Removes all listeners, or those of the specified channel.
		 */
		removeAllListeners(channel: string): this;
		/**
		 * Removes the specified listener from the listener array for the specified
		 * channel.
		 */
		removeListener(channel: string, listener: Function): this;
		/**
		 * Send a message to the main process asynchronously via channel, you can also send
		 * arbitrary arguments. Arguments will be serialized in JSON internally and hence
		 * no functions or prototype chain will be included. The main process handles it by
		 * listening for channel with ipcMain module.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Send a message to the main process synchronously via channel, you can also send
		 * arbitrary arguments. Arguments will be serialized in JSON internally and hence
		 * no functions or prototype chain will be included. The main process handles it by
		 * listening for channel with ipcMain module, and replies by setting
		 * event.returnValue. Note: Sending a synchronous message will block the whole
		 * renderer process, unless you know what you are doing you should never use it.
		 */
		// sendSync(channel: string, ...args: any[]): any; ### VSCODE CHANGE (we do not want to use sendSync)
		/**
		 * Sends a message to a window with windowid via channel.
		 */
		sendTo(windowId: number, channel: string, ...args: any[]): void;
		/**
		 * Like ipcRenderer.send but the event will be sent to the <webview> element in the
		 * host page instead of the main process.
		 */
		sendToHost(channel: string, ...args: any[]): void;
	}

	interface JumpListCategory {

		// Docs: http://electron.atom.io/docs/api/structures/jump-list-category

		/**
		 * Array of objects if type is tasks or custom, otherwise it should be omitted.
		 */
		items?: JumpListItem[];
		/**
		 * Must be set if type is custom, otherwise it should be omitted.
		 */
		name?: string;
		/**
		 * One of the following:
		 */
		type?: ('tasks' | 'frequent' | 'recent' | 'custom');
	}

	interface JumpListItem {

		// Docs: http://electron.atom.io/docs/api/structures/jump-list-item

		/**
		 * The command line arguments when program is executed. Should only be set if type
		 * is task.
		 */
		args?: string;
		/**
		 * Description of the task (displayed in a tooltip). Should only be set if type is
		 * task.
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
		 * arbitrary resource file that contains an icon (e.g. .ico, .exe, .dll). You can
		 * usually specify process.execPath to show the program icon.
		 */
		iconPath?: string;
		/**
		 * Path of the file to open, should only be set if type is file.
		 */
		path?: string;
		/**
		 * Path of the program to execute, usually you should specify process.execPath
		 * which opens the current program. Should only be set if type is task.
		 */
		program?: string;
		/**
		 * The text to be displayed for the item in the Jump List. Should only be set if
		 * type is task.
		 */
		title?: string;
		/**
		 * One of the following:
		 */
		type?: ('task' | 'separator' | 'file');
	}

	interface MemoryInfo {

		// Docs: http://electron.atom.io/docs/api/structures/memory-info

		/**
		 * The maximum amount of memory that has ever been pinned to actual physical RAM.
		 * On macOS its value will always be 0.
		 */
		peakWorkingSetSize: number;
		/**
		 * Process id of the process.
		 */
		pid: number;
		/**
		 * The amount of memory not shared by other processes, such as JS heap or HTML
		 * content.
		 */
		privateBytes: number;
		/**
		 * The amount of memory shared between processes, typically memory consumed by the
		 * Electron code itself
		 */
		sharedBytes: number;
		/**
		 * The amount of memory currently pinned to actual physical RAM.
		 */
		workingSetSize: number;
	}

	interface MemoryUsageDetails {

		// Docs: http://electron.atom.io/docs/api/structures/memory-usage-details

		count: number;
		liveSize: number;
		size: number;
	}

	class Menu {

		// Docs: http://electron.atom.io/docs/api/menu

		/**
		 * Emitted when a popup is closed either manually or with menu.closePopup().
		 */
		on(event: 'menu-will-close', listener: (event: Event) => void): this;
		once(event: 'menu-will-close', listener: (event: Event) => void): this;
		addListener(event: 'menu-will-close', listener: (event: Event) => void): this;
		removeListener(event: 'menu-will-close', listener: (event: Event) => void): this;
		/**
		 * Emitted when menu.popup() is called.
		 */
		on(event: 'menu-will-show', listener: (event: Event) => void): this;
		once(event: 'menu-will-show', listener: (event: Event) => void): this;
		addListener(event: 'menu-will-show', listener: (event: Event) => void): this;
		removeListener(event: 'menu-will-show', listener: (event: Event) => void): this;
		constructor();
		/**
		 * Generally, the template is just an array of options for constructing a MenuItem.
		 * The usage can be referenced above. You can also attach other fields to the
		 * element of the template and they will become properties of the constructed menu
		 * items.
		 */
		static buildFromTemplate(template: MenuItemConstructorOptions[]): Menu;
		/**
		 * Note: The returned Menu instance doesn't support dynamic addition or removal of
		 * menu items. Instance properties can still be dynamically modified.
		 */
		static getApplicationMenu(): Menu | null;
		/**
		 * Sends the action to the first responder of application. This is used for
		 * emulating default macOS menu behaviors. Usually you would just use the role
		 * property of a MenuItem. See the macOS Cocoa Event Handling Guide for more
		 * information on macOS' native actions.
		 */
		static sendActionToFirstResponder(action: string): void;
		/**
		 * Sets menu as the application menu on macOS. On Windows and Linux, the menu will
		 * be set as each window's top menu. Passing null will remove the menu bar on
		 * Windows and Linux but has no effect on macOS. Note: This API has to be called
		 * after the ready event of app module.
		 */
		static setApplicationMenu(menu: Menu | null): void;
		/**
		 * Appends the menuItem to the menu.
		 */
		append(menuItem: MenuItem): void;
		/**
		 * Closes the context menu in the browserWindow.
		 */
		closePopup(browserWindow?: BrowserWindow): void;
		getMenuItemById(id: string): MenuItem;
		/**
		 * Inserts the menuItem to the pos position of the menu.
		 */
		insert(pos: number, menuItem: MenuItem): void;
		/**
		 * Pops up this menu as a context menu in the BrowserWindow.
		 */
		popup(options: PopupOptions): void;
		items: MenuItem[];
	}

	class MenuItem {

		// Docs: http://electron.atom.io/docs/api/menu-item

		constructor(options: MenuItemConstructorOptions);
		checked: boolean;
		click: Function;
		enabled: boolean;
		label: string;
		visible: boolean;
	}

	interface MimeTypedBuffer {

		// Docs: http://electron.atom.io/docs/api/structures/mime-typed-buffer

		/**
		 * The actual Buffer content
		 */
		data: Buffer;
		/**
		 * The mimeType of the Buffer that you are sending
		 */
		mimeType: string;
	}

	class NativeImage {

		// Docs: http://electron.atom.io/docs/api/native-image

		/**
		 * Creates an empty NativeImage instance.
		 */
		static createEmpty(): NativeImage;
		/**
		 * Creates a new NativeImage instance from buffer.
		 */
		static createFromBuffer(buffer: Buffer, options?: CreateFromBufferOptions): NativeImage;
		/**
		 * Creates a new NativeImage instance from dataURL.
		 */
		static createFromDataURL(dataURL: string): NativeImage;
		/**
		 * Creates a new NativeImage instance from the NSImage that maps to the given image
		 * name. See NSImageName for a list of possible values. The hslShift is applied to
		 * the image with the following rules This means that [-1, 0, 1] will make the
		 * image completely white and [-1, 1, 0] will make the image completely black.
		 */
		static createFromNamedImage(imageName: string, hslShift: number[]): NativeImage;
		/**
		 * Creates a new NativeImage instance from a file located at path. This method
		 * returns an empty image if the path does not exist, cannot be read, or is not a
		 * valid image.
		 */
		static createFromPath(path: string): NativeImage;
		/**
		 * Add an image representation for a specific scale factor. This can be used to
		 * explicitly add different scale factor representations to an image. This can be
		 * called on empty images.
		 */
		addRepresentation(options: AddRepresentationOptions): void;
		crop(rect: Rectangle): NativeImage;
		getAspectRatio(): number;
		/**
		 * The difference between getBitmap() and toBitmap() is, getBitmap() does not copy
		 * the bitmap data, so you have to use the returned Buffer immediately in current
		 * event loop tick, otherwise the data might be changed or destroyed.
		 */
		getBitmap(options?: BitmapOptions): Buffer;
		/**
		 * Notice that the returned pointer is a weak pointer to the underlying native
		 * image instead of a copy, so you must ensure that the associated nativeImage
		 * instance is kept around.
		 */
		getNativeHandle(): Buffer;
		getSize(): Size;
		isEmpty(): boolean;
		isTemplateImage(): boolean;
		/**
		 * If only the height or the width are specified then the current aspect ratio will
		 * be preserved in the resized image.
		 */
		resize(options: ResizeOptions): NativeImage;
		/**
		 * Marks the image as a template image.
		 */
		setTemplateImage(option: boolean): void;
		toBitmap(options?: ToBitmapOptions): Buffer;
		toDataURL(options?: ToDataURLOptions): string;
		toJPEG(quality: number): Buffer;
		toPNG(options?: ToPNGOptions): Buffer;
	}

	interface Net extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/net

		/**
		 * Creates a ClientRequest instance using the provided options which are directly
		 * forwarded to the ClientRequest constructor. The net.request method would be used
		 * to issue both secure and insecure HTTP requests according to the specified
		 * protocol scheme in the options object.
		 */
		request(options: any | string): ClientRequest;
	}

	class Notification extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/notification

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
		 * This event is not guaranteed to be emitted in all cases where the notification
		 * is closed.
		 */
		on(event: 'close', listener: (event: Event) => void): this;
		once(event: 'close', listener: (event: Event) => void): this;
		addListener(event: 'close', listener: (event: Event) => void): this;
		removeListener(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Emitted when the user clicks the "Reply" button on a notification with hasReply:
		 * true.
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
		 * multiple times as a notification can be shown multiple times through the show()
		 * method.
		 */
		on(event: 'show', listener: (event: Event) => void): this;
		once(event: 'show', listener: (event: Event) => void): this;
		addListener(event: 'show', listener: (event: Event) => void): this;
		removeListener(event: 'show', listener: (event: Event) => void): this;
		constructor(options: NotificationConstructorOptions);
		static isSupported(): boolean;
		/**
		 * Dismisses the notification.
		 */
		close(): void;
		/**
		 * Immediately shows the notification to the user, please note this means unlike
		 * the HTML5 Notification implementation, simply instantiating a new Notification
		 * does not immediately show it to the user, you need to call this method before
		 * the OS will display it. If the notification has been shown before, this method
		 * will dismiss the previously shown notification and create a new one with
		 * identical properties.
		 */
		show(): void;
	}

	interface NotificationAction {

		// Docs: http://electron.atom.io/docs/api/structures/notification-action

		/**
		 * The label for the given action.
		 */
		text?: string;
		/**
		 * The type of action, can be button.
		 */
		type: ('button');
	}

	interface Point {

		// Docs: http://electron.atom.io/docs/api/structures/point

		x: number;
		y: number;
	}

	interface PowerMonitor extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/power-monitor

		/**
		 * Emitted when the system changes to AC power.
		 */
		on(event: 'on-ac', listener: Function): this;
		once(event: 'on-ac', listener: Function): this;
		addListener(event: 'on-ac', listener: Function): this;
		removeListener(event: 'on-ac', listener: Function): this;
		/**
		 * Emitted when system changes to battery power.
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
		 * invokes e.preventDefault(), Electron will attempt to delay system shutdown in
		 * order for the app to exit cleanly. If e.preventDefault() is called, the app
		 * should exit as soon as possible by calling something like app.quit().
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
	}

	interface PowerSaveBlocker extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/power-save-blocker

		isStarted(id: number): boolean;
		/**
		 * Starts preventing the system from entering lower-power mode. Returns an integer
		 * identifying the power save blocker. Note: prevent-display-sleep has higher
		 * precedence over prevent-app-suspension. Only the highest precedence type takes
		 * effect. In other words, prevent-display-sleep always takes precedence over
		 * prevent-app-suspension. For example, an API calling A requests for
		 * prevent-app-suspension, and another calling B requests for
		 * prevent-display-sleep. prevent-display-sleep will be used until B stops its
		 * request. After that, prevent-app-suspension is used.
		 */
		start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
		/**
		 * Stops the specified power save blocker.
		 */
		stop(id: number): void;
	}

	interface PrinterInfo {

		// Docs: http://electron.atom.io/docs/api/structures/printer-info

		description: string;
		isDefault: boolean;
		name: string;
		status: number;
	}

	interface ProcessMetric {

		// Docs: http://electron.atom.io/docs/api/structures/process-metric

		/**
		 * CPU usage of the process.
		 */
		cpu: CPUUsage;
		/**
		 * Memory information for the process.
		 */
		memory: MemoryInfo;
		/**
		 * Process id of the process.
		 */
		pid: number;
		/**
		 * Process type (Browser or Tab or GPU etc).
		 */
		type: string;
	}

	interface Protocol extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/protocol

		/**
		 * Intercepts scheme protocol and uses handler as the protocol's new handler which
		 * sends a Buffer as a response.
		 */
		interceptBufferProtocol(scheme: string, handler: (request: InterceptBufferProtocolRequest, callback: (buffer?: Buffer) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol's new handler which
		 * sends a file as a response.
		 */
		interceptFileProtocol(scheme: string, handler: (request: InterceptFileProtocolRequest, callback: (filePath: string) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol's new handler which
		 * sends a new HTTP request as a response.
		 */
		interceptHttpProtocol(scheme: string, handler: (request: InterceptHttpProtocolRequest, callback: (redirectRequest: RedirectRequest) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Same as protocol.registerStreamProtocol, except that it replaces an existing
		 * protocol handler.
		 */
		interceptStreamProtocol(scheme: string, handler: (request: InterceptStreamProtocolRequest, callback: (stream?: ReadableStream | StreamProtocolResponse) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol's new handler which
		 * sends a String as a response.
		 */
		interceptStringProtocol(scheme: string, handler: (request: InterceptStringProtocolRequest, callback: (data?: string) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * The callback will be called with a boolean that indicates whether there is
		 * already a handler for scheme.
		 */
		isProtocolHandled(scheme: string, callback: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send a Buffer as a response. The usage
		 * is the same with registerFileProtocol, except that the callback should be called
		 * with either a Buffer object or an object that has the data, mimeType, and
		 * charset properties. Example:
		 */
		registerBufferProtocol(scheme: string, handler: (request: RegisterBufferProtocolRequest, callback: (buffer?: Buffer | MimeTypedBuffer) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send the file as a response. The
		 * handler will be called with handler(request, callback) when a request is going
		 * to be created with scheme. completion will be called with completion(null) when
		 * scheme is successfully registered or completion(error) when failed. To handle
		 * the request, the callback should be called with either the file's path or an
		 * object that has a path property, e.g. callback(filePath) or callback({path:
		 * filePath}). When callback is called with nothing, a number, or an object that
		 * has an error property, the request will fail with the error number you
		 * specified. For the available error numbers you can use, please see the net error
		 * list. By default the scheme is treated like http:, which is parsed differently
		 * than protocols that follow the "generic URI syntax" like file:, so you probably
		 * want to call protocol.registerStandardSchemes to have your scheme treated as a
		 * standard scheme.
		 */
		registerFileProtocol(scheme: string, handler: (request: RegisterFileProtocolRequest, callback: (filePath?: string) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send an HTTP request as a response. The
		 * usage is the same with registerFileProtocol, except that the callback should be
		 * called with a redirectRequest object that has the url, method, referrer,
		 * uploadData and session properties. By default the HTTP request will reuse the
		 * current session. If you want the request to have a different session you should
		 * set session to null. For POST requests the uploadData object must be provided.
		 */
		registerHttpProtocol(scheme: string, handler: (request: RegisterHttpProtocolRequest, callback: (redirectRequest: RedirectRequest) => void) => void, completion?: (error: Error) => void): void;
		registerServiceWorkerSchemes(schemes: string[]): void;
		/**
		 * A standard scheme adheres to what RFC 3986 calls generic URI syntax. For example
		 * http and https are standard schemes, while file is not. Registering a scheme as
		 * standard, will allow relative and absolute resources to be resolved correctly
		 * when served. Otherwise the scheme will behave like the file protocol, but
		 * without the ability to resolve relative URLs. For example when you load
		 * following page with custom protocol without registering it as standard scheme,
		 * the image will not be loaded because non-standard schemes can not recognize
		 * relative URLs: Registering a scheme as standard will allow access to files
		 * through the FileSystem API. Otherwise the renderer will throw a security error
		 * for the scheme. By default web storage apis (localStorage, sessionStorage,
		 * webSQL, indexedDB, cookies) are disabled for non standard schemes. So in general
		 * if you want to register a custom protocol to replace the http protocol, you have
		 * to register it as a standard scheme: Note: This method can only be used before
		 * the ready event of the app module gets emitted.
		 */
		registerStandardSchemes(schemes: string[], options?: RegisterStandardSchemesOptions): void;
		/**
		 * Registers a protocol of scheme that will send a Readable as a response. The
		 * usage is similar to the other register{Any}Protocol, except that the callback
		 * should be called with either a Readable object or an object that has the data,
		 * statusCode, and headers properties. Example: It is possible to pass any object
		 * that implements the readable stream API (emits data/end/error events). For
		 * example, here's how a file could be returned:
		 */
		registerStreamProtocol(scheme: string, handler: (request: RegisterStreamProtocolRequest, callback: (stream?: ReadableStream | StreamProtocolResponse) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send a String as a response. The usage
		 * is the same with registerFileProtocol, except that the callback should be called
		 * with either a String or an object that has the data, mimeType, and charset
		 * properties.
		 */
		registerStringProtocol(scheme: string, handler: (request: RegisterStringProtocolRequest, callback: (data?: string) => void) => void, completion?: (error: Error) => void): void;
		/**
		 * Remove the interceptor installed for scheme and restore its original handler.
		 */
		uninterceptProtocol(scheme: string, completion?: (error: Error) => void): void;
		/**
		 * Unregisters the custom protocol of scheme.
		 */
		unregisterProtocol(scheme: string, completion?: (error: Error) => void): void;
	}

	interface Rectangle {

		// Docs: http://electron.atom.io/docs/api/structures/rectangle

		/**
		 * The height of the rectangle (must be an integer)
		 */
		height: number;
		/**
		 * The width of the rectangle (must be an integer)
		 */
		width: number;
		/**
		 * The x coordinate of the origin of the rectangle (must be an integer)
		 */
		x: number;
		/**
		 * The y coordinate of the origin of the rectangle (must be an integer)
		 */
		y: number;
	}

	interface Remote extends MainInterface {

		// Docs: http://electron.atom.io/docs/api/remote

		getCurrentWebContents(): WebContents;
		getCurrentWindow(): BrowserWindow;
		getGlobal(name: string): any;
		/**
		 * e.g.
		 */
		require(module: string): any;
		/**
		 * The process object in the main process. This is the same as
		 * remote.getGlobal('process') but is cached.
		 */
		process?: any;
	}

	interface RemoveClientCertificate {

		// Docs: http://electron.atom.io/docs/api/structures/remove-client-certificate

		/**
		 * Origin of the server whose associated client certificate must be removed from
		 * the cache.
		 */
		origin: string;
		/**
		 * clientCertificate.
		 */
		type: string;
	}

	interface RemovePassword {

		// Docs: http://electron.atom.io/docs/api/structures/remove-password

		/**
		 * When provided, the authentication info related to the origin will only be
		 * removed otherwise the entire cache will be cleared.
		 */
		origin?: string;
		/**
		 * Credentials of the authentication. Must be provided if removing by origin.
		 */
		password?: string;
		/**
		 * Realm of the authentication. Must be provided if removing by origin.
		 */
		realm?: string;
		/**
		 * Scheme of the authentication. Can be basic, digest, ntlm, negotiate. Must be
		 * provided if removing by origin.
		 */
		scheme?: ('basic' | 'digest' | 'ntlm' | 'negotiate');
		/**
		 * password.
		 */
		type: string;
		/**
		 * Credentials of the authentication. Must be provided if removing by origin.
		 */
		username?: string;
	}

	interface Screen extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/screen

		/**
		 * Emitted when newDisplay has been added.
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
		 * Emitted when one or more metrics change in a display. The changedMetrics is an
		 * array of strings that describe the changes. Possible changes are bounds,
		 * workArea, scaleFactor and rotation.
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
		 * Emitted when oldDisplay has been removed.
		 */
		on(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		once(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		addListener(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		removeListener(event: 'display-removed', listener: (event: Event,
			oldDisplay: Display) => void): this;
		getAllDisplays(): Display[];
		/**
		 * The current absolute position of the mouse pointer.
		 */
		getCursorScreenPoint(): Point;
		getDisplayMatching(rect: Rectangle): Display;
		getDisplayNearestPoint(point: Point): Display;
		getMenuBarHeight(): number;
		getPrimaryDisplay(): Display;
	}

	interface ScrubberItem {

		// Docs: http://electron.atom.io/docs/api/structures/scrubber-item

		/**
		 * The image to appear in this item
		 */
		icon?: NativeImage;
		/**
		 * The text to appear in this item
		 */
		label?: string;
	}

	interface SegmentedControlSegment {

		// Docs: http://electron.atom.io/docs/api/structures/segmented-control-segment

		/**
		 * Whether this segment is selectable. Default: true
		 */
		enabled?: boolean;
		/**
		 * The image to appear in this segment
		 */
		icon?: NativeImage;
		/**
		 * The text to appear in this segment
		 */
		label?: string;
	}

	class Session extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/session

		/**
		 * If partition starts with persist:, the page will use a persistent session
		 * available to all pages in the app with the same partition. if there is no
		 * persist: prefix, the page will use an in-memory session. If the partition is
		 * empty then default session of the app will be returned. To create a Session with
		 * options, you have to ensure the Session with the partition has never been used
		 * before. There is no way to change the options of an existing Session object.
		 */
		static fromPartition(partition: string, options?: FromPartitionOptions): Session;
		/**
		 * A Session object, the default session object of the app.
		 */
		static defaultSession?: Session;
		/**
		 * Emitted when Electron is about to download item in webContents. Calling
		 * event.preventDefault() will cancel the download and item will not be available
		 * from next tick of the process.
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
		 * Clears the session’s HTTP authentication cache.
		 */
		clearAuthCache(options: RemovePassword | RemoveClientCertificate, callback?: Function): void;
		/**
		 * Clears the session’s HTTP cache.
		 */
		clearCache(callback: Function): void;
		/**
		 * Clears the host resolver cache.
		 */
		clearHostResolverCache(callback?: Function): void;
		/**
		 * Clears the data of web storages.
		 */
		clearStorageData(options?: ClearStorageDataOptions, callback?: Function): void;
		/**
		 * Allows resuming cancelled or interrupted downloads from previous Session. The
		 * API will generate a DownloadItem that can be accessed with the will-download
		 * event. The DownloadItem will not have any WebContents associated with it and the
		 * initial state will be interrupted. The download will start only when the resume
		 * API is called on the DownloadItem.
		 */
		createInterruptedDownload(options: CreateInterruptedDownloadOptions): void;
		/**
		 * Disables any network emulation already active for the session. Resets to the
		 * original network configuration.
		 */
		disableNetworkEmulation(): void;
		/**
		 * Emulates network with the given configuration for the session.
		 */
		enableNetworkEmulation(options: EnableNetworkEmulationOptions): void;
		/**
		 * Writes any unwritten DOMStorage data to disk.
		 */
		flushStorageData(): void;
		getBlobData(identifier: string, callback: (result: Buffer) => void): void;
		/**
		 * Callback is invoked with the session's current cache size.
		 */
		getCacheSize(callback: (size: number) => void): void;
		getPreloads(): string[];
		getUserAgent(): string;
		/**
		 * Resolves the proxy information for url. The callback will be called with
		 * callback(proxy) when the request is performed.
		 */
		resolveProxy(url: string, callback: (proxy: string) => void): void;
		/**
		 * Sets the certificate verify proc for session, the proc will be called with
		 * proc(request, callback) whenever a server certificate verification is requested.
		 * Calling callback(0) accepts the certificate, calling callback(-2) rejects it.
		 * Calling setCertificateVerifyProc(null) will revert back to default certificate
		 * verify proc.
		 */
		setCertificateVerifyProc(proc: (request: CertificateVerifyProcRequest, callback: (verificationResult: number) => void) => void): void;
		/**
		 * Sets download saving directory. By default, the download directory will be the
		 * Downloads under the respective app folder.
		 */
		setDownloadPath(path: string): void;
		/**
		 * Sets the handler which can be used to respond to permission requests for the
		 * session. Calling callback(true) will allow the permission and callback(false)
		 * will reject it. To clear the handler, call setPermissionRequestHandler(null).
		 */
		setPermissionRequestHandler(handler: (webContents: WebContents, permission: string, callback: (permissionGranted: boolean) => void, details: PermissionRequestHandlerDetails) => void | null): void;
		/**
		 * Adds scripts that will be executed on ALL web contents that are associated with
		 * this session just before normal preload scripts run.
		 */
		setPreloads(preloads: string[]): void;
		/**
		 * Sets the proxy settings. When pacScript and proxyRules are provided together,
		 * the proxyRules option is ignored and pacScript configuration is applied. The
		 * proxyRules has to follow the rules below: For example: The proxyBypassRules is a
		 * comma separated list of rules described below:
		 */
		setProxy(config: Config, callback: Function): void;
		/**
		 * Overrides the userAgent and acceptLanguages for this session. The
		 * acceptLanguages must a comma separated ordered list of language codes, for
		 * example "en-US,fr,de,ko,zh-CN,ja". This doesn't affect existing WebContents, and
		 * each WebContents can use webContents.setUserAgent to override the session-wide
		 * user agent.
		 */
		setUserAgent(userAgent: string, acceptLanguages?: string): void;
		cookies: Cookies;
		protocol: Protocol;
		webRequest: WebRequest;
	}

	interface Shell {

		// Docs: http://electron.atom.io/docs/api/shell

		/**
		 * Play the beep sound.
		 */
		beep(): void;
		/**
		 * Move the given file to trash and returns a boolean status for the operation.
		 */
		moveItemToTrash(fullPath: string): boolean;
		/**
		 * Open the given external protocol URL in the desktop's default manner. (For
		 * example, mailto: URLs in the user's default mail agent).
		 */
		openExternal(url: string, options?: OpenExternalOptions, callback?: (error: Error) => void): boolean;
		/**
		 * Open the given file in the desktop's default manner.
		 */
		openItem(fullPath: string): boolean;
		/**
		 * Resolves the shortcut link at shortcutPath. An exception will be thrown when any
		 * error happens.
		 */
		readShortcutLink(shortcutPath: string): ShortcutDetails;
		/**
		 * Show the given file in a file manager. If possible, select the file.
		 */
		showItemInFolder(fullPath: string): boolean;
		/**
		 * Creates or updates a shortcut link at shortcutPath.
		 */
		writeShortcutLink(shortcutPath: string, operation: 'create' | 'update' | 'replace', options: ShortcutDetails): boolean;
		/**
		 * Creates or updates a shortcut link at shortcutPath.
		 */
		writeShortcutLink(shortcutPath: string, options: ShortcutDetails): boolean;
	}

	interface ShortcutDetails {

		// Docs: http://electron.atom.io/docs/api/structures/shortcut-details

		/**
		 * The Application User Model ID. Default is empty.
		 */
		appUserModelId?: string;
		/**
		 * The arguments to be applied to target when launching from this shortcut. Default
		 * is empty.
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
		 * The path to the icon, can be a DLL or EXE. icon and iconIndex have to be set
		 * together. Default is empty, which uses the target's icon.
		 */
		icon?: string;
		/**
		 * The resource ID of icon when icon is a DLL or EXE. Default is 0.
		 */
		iconIndex?: number;
		/**
		 * The target to launch from this shortcut.
		 */
		target: string;
	}

	interface Size {

		// Docs: http://electron.atom.io/docs/api/structures/size

		height: number;
		width: number;
	}

	interface StreamProtocolResponse {

		// Docs: http://electron.atom.io/docs/api/structures/stream-protocol-response

		/**
		 * A Node.js readable stream representing the response body
		 */
		data: ReadableStream;
		/**
		 * An object containing the response headers
		 */
		headers: Headers;
		/**
		 * The HTTP response code
		 */
		statusCode: number;
	}

	interface SystemPreferences extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/system-preferences

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
		on(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme, such as a high contrast theme, is being
			 * used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		once(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme, such as a high contrast theme, is being
			 * used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		addListener(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme, such as a high contrast theme, is being
			 * used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		removeListener(event: 'inverted-color-scheme-changed', listener: (event: Event,
			/**
			 * `true` if an inverted color scheme, such as a high contrast theme, is being
			 * used, `false` otherwise.
			 */
			invertedColorScheme: boolean) => void): this;
		getAccentColor(): string;
		getColor(color: '3d-dark-shadow' | '3d-face' | '3d-highlight' | '3d-light' | '3d-shadow' | 'active-border' | 'active-caption' | 'active-caption-gradient' | 'app-workspace' | 'button-text' | 'caption-text' | 'desktop' | 'disabled-text' | 'highlight' | 'highlight-text' | 'hotlight' | 'inactive-border' | 'inactive-caption' | 'inactive-caption-gradient' | 'inactive-caption-text' | 'info-background' | 'info-text' | 'menu' | 'menu-highlight' | 'menubar' | 'menu-text' | 'scrollbar' | 'window' | 'window-frame' | 'window-text'): string;
		/**
		 * Some popular key and types are:
		 */
		getUserDefault(key: string, type: 'string' | 'boolean' | 'integer' | 'float' | 'double' | 'url' | 'array' | 'dictionary'): any;
		/**
		 * An example of using it to determine if you should create a transparent window or
		 * not (transparent windows won't work correctly when DWM composition is disabled):
		 */
		isAeroGlassEnabled(): boolean;
		isDarkMode(): boolean;
		isInvertedColorScheme(): boolean;
		isSwipeTrackingFromScrollEventsEnabled(): boolean;
		/**
		 * Posts event as native notifications of macOS. The userInfo is an Object that
		 * contains the user information dictionary sent along with the notification.
		 */
		postLocalNotification(event: string, userInfo: any): void;
		/**
		 * Posts event as native notifications of macOS. The userInfo is an Object that
		 * contains the user information dictionary sent along with the notification.
		 */
		postNotification(event: string, userInfo: any): void;
		/**
		 * Add the specified defaults to your application's NSUserDefaults.
		 */
		registerDefaults(defaults: any): void;
		/**
		 * Removes the key in NSUserDefaults. This can be used to restore the default or
		 * global value of a key previously set with setUserDefault.
		 */
		removeUserDefault(key: string): void;
		/**
		 * Set the value of key in NSUserDefaults. Note that type should match actual type
		 * of value. An exception is thrown if they don't. Some popular key and types are:
		 */
		setUserDefault(key: string, type: string, value: string): void;
		/**
		 * Same as subscribeNotification, but uses NSNotificationCenter for local defaults.
		 * This is necessary for events such as NSUserDefaultsDidChangeNotification.
		 */
		subscribeLocalNotification(event: string, callback: (event: string, userInfo: any) => void): void;
		/**
		 * Subscribes to native notifications of macOS, callback will be called with
		 * callback(event, userInfo) when the corresponding event happens. The userInfo is
		 * an Object that contains the user information dictionary sent along with the
		 * notification. The id of the subscriber is returned, which can be used to
		 * unsubscribe the event. Under the hood this API subscribes to
		 * NSDistributedNotificationCenter, example values of event are:
		 */
		subscribeNotification(event: string, callback: (event: string, userInfo: any) => void): void;
		/**
		 * Same as unsubscribeNotification, but removes the subscriber from
		 * NSNotificationCenter.
		 */
		unsubscribeLocalNotification(id: number): void;
		/**
		 * Removes the subscriber with id.
		 */
		unsubscribeNotification(id: number): void;
	}

	interface Task {

		// Docs: http://electron.atom.io/docs/api/structures/task

		/**
		 * The command line arguments when program is executed.
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
		 * process.execPath to show the icon of the program.
		 */
		iconPath: string;
		/**
		 * Path of the program to execute, usually you should specify process.execPath
		 * which opens the current program.
		 */
		program: string;
		/**
		 * The string to be displayed in a JumpList.
		 */
		title: string;
	}

	interface ThumbarButton {

		// Docs: http://electron.atom.io/docs/api/structures/thumbar-button

		click: Function;
		/**
		 * Control specific states and behaviors of the button. By default, it is
		 * ['enabled'].
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

	class TouchBarButton extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-button

		constructor(options: TouchBarButtonConstructorOptions);
		backgroundColor: string;
		icon: NativeImage;
		label: string;
	}

	class TouchBarColorPicker extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-color-picker

		constructor(options: TouchBarColorPickerConstructorOptions);
		availableColors: string[];
		selectedColor: string;
	}

	class TouchBarGroup extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-group

		constructor(options: TouchBarGroupConstructorOptions);
	}

	class TouchBarLabel extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-label

		constructor(options: TouchBarLabelConstructorOptions);
		label: string;
		textColor: string;
	}

	class TouchBarPopover extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-popover

		constructor(options: TouchBarPopoverConstructorOptions);
		icon: NativeImage;
		label: string;
	}

	class TouchBarScrubber extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-scrubber

		constructor(options: TouchBarScrubberConstructorOptions);
		continuous: boolean;
		items: ScrubberItem[];
		mode: string;
		overlayStyle: string;
		selectedStyle: string;
		showArrowButtons: boolean;
	}

	class TouchBarSegmentedControl extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-segmented-control

		constructor(options: TouchBarSegmentedControlConstructorOptions);
		segments: SegmentedControlSegment[];
		segmentStyle: string;
		selectedIndex: number;
	}

	class TouchBarSlider extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-slider

		constructor(options: TouchBarSliderConstructorOptions);
		label: string;
		maxValue: number;
		minValue: number;
		value: number;
	}

	class TouchBarSpacer extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar-spacer

		constructor(options: TouchBarSpacerConstructorOptions);
	}

	class TouchBar extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/touch-bar

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

	interface Transaction {

		// Docs: http://electron.atom.io/docs/api/structures/transaction

		errorCode: number;
		errorMessage: string;
		originalTransactionIdentifier: string;
		payment: Payment;
		transactionDate: string;
		transactionIdentifier: string;
		/**
		 * The transaction sate ("purchasing", "purchased", "failed", "restored", or
		 * "deferred")
		 */
		transactionState: string;
	}

	class Tray extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/tray

		/**
		 * Emitted when the tray balloon is clicked.
		 */
		on(event: 'balloon-click', listener: Function): this;
		once(event: 'balloon-click', listener: Function): this;
		addListener(event: 'balloon-click', listener: Function): this;
		removeListener(event: 'balloon-click', listener: Function): this;
		/**
		 * Emitted when the tray balloon is closed because of timeout or user manually
		 * closes it.
		 */
		on(event: 'balloon-closed', listener: Function): this;
		once(event: 'balloon-closed', listener: Function): this;
		addListener(event: 'balloon-closed', listener: Function): this;
		removeListener(event: 'balloon-closed', listener: Function): this;
		/**
		 * Emitted when the tray balloon shows.
		 */
		on(event: 'balloon-show', listener: Function): this;
		once(event: 'balloon-show', listener: Function): this;
		addListener(event: 'balloon-show', listener: Function): this;
		removeListener(event: 'balloon-show', listener: Function): this;
		/**
		 * Emitted when the tray icon is clicked.
		 */
		on(event: 'click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'click', listener: (event: Event,
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
		 */
		on(event: 'double-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		once(event: 'double-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		addListener(event: 'double-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		removeListener(event: 'double-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		/**
		 * Emitted when a drag operation ends on the tray or ends at another location.
		 */
		on(event: 'drag-end', listener: Function): this;
		once(event: 'drag-end', listener: Function): this;
		addListener(event: 'drag-end', listener: Function): this;
		removeListener(event: 'drag-end', listener: Function): this;
		/**
		 * Emitted when a drag operation enters the tray icon.
		 */
		on(event: 'drag-enter', listener: Function): this;
		once(event: 'drag-enter', listener: Function): this;
		addListener(event: 'drag-enter', listener: Function): this;
		removeListener(event: 'drag-enter', listener: Function): this;
		/**
		 * Emitted when a drag operation exits the tray icon.
		 */
		on(event: 'drag-leave', listener: Function): this;
		once(event: 'drag-leave', listener: Function): this;
		addListener(event: 'drag-leave', listener: Function): this;
		removeListener(event: 'drag-leave', listener: Function): this;
		/**
		 * Emitted when any dragged items are dropped on the tray icon.
		 */
		on(event: 'drop', listener: Function): this;
		once(event: 'drop', listener: Function): this;
		addListener(event: 'drop', listener: Function): this;
		removeListener(event: 'drop', listener: Function): this;
		/**
		 * Emitted when dragged files are dropped in the tray icon.
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
		 */
		on(event: 'mouse-enter', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-enter', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-enter', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-enter', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the mouse exits the tray icon.
		 */
		on(event: 'mouse-leave', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-leave', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-leave', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-leave', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the mouse moves in the tray icon.
		 */
		on(event: 'mouse-move', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		once(event: 'mouse-move', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		addListener(event: 'mouse-move', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		removeListener(event: 'mouse-move', listener: (event: Event,
			/**
			 * The position of the event.
			 */
			position: Point) => void): this;
		/**
		 * Emitted when the tray icon is right clicked.
		 */
		on(event: 'right-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		once(event: 'right-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		addListener(event: 'right-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		removeListener(event: 'right-click', listener: (event: Event,
			/**
			 * The bounds of tray icon.
			 */
			bounds: Rectangle) => void): this;
		constructor(image: NativeImage | string);
		/**
		 * Destroys the tray icon immediately.
		 */
		destroy(): void;
		/**
		 * Displays a tray balloon.
		 */
		displayBalloon(options: DisplayBalloonOptions): void;
		/**
		 * The bounds of this tray icon as Object.
		 */
		getBounds(): Rectangle;
		isDestroyed(): boolean;
		/**
		 * Pops up the context menu of the tray icon. When menu is passed, the menu will be
		 * shown instead of the tray icon's context menu. The position is only available on
		 * Windows, and it is (0, 0) by default.
		 */
		popUpContextMenu(menu?: Menu, position?: Point): void;
		/**
		 * Sets the context menu for this icon.
		 */
		setContextMenu(menu: Menu): void;
		/**
		 * Sets when the tray's icon background becomes highlighted (in blue). Note: You
		 * can use highlightMode with a BrowserWindow by toggling between 'never' and
		 * 'always' modes when the window visibility changes.
		 */
		setHighlightMode(mode: 'selection' | 'always' | 'never'): void;
		/**
		 * Sets the image associated with this tray icon.
		 */
		setImage(image: NativeImage | string): void;
		/**
		 * Sets the image associated with this tray icon when pressed on macOS.
		 */
		setPressedImage(image: NativeImage): void;
		/**
		 * Sets the title displayed aside of the tray icon in the status bar (Support ANSI
		 * colors).
		 */
		setTitle(title: string): void;
		/**
		 * Sets the hover text for this tray icon.
		 */
		setToolTip(toolTip: string): void;
	}

	interface UploadBlob {

		// Docs: http://electron.atom.io/docs/api/structures/upload-blob

		/**
		 * UUID of blob data to upload.
		 */
		blobUUID: string;
		/**
		 * blob.
		 */
		type: string;
	}

	interface UploadData {

		// Docs: http://electron.atom.io/docs/api/structures/upload-data

		/**
		 * UUID of blob data. Use method to retrieve the data.
		 */
		blobUUID: string;
		/**
		 * Content being sent.
		 */
		bytes: Buffer;
		/**
		 * Path of file being uploaded.
		 */
		file: string;
	}

	interface UploadFile {

		// Docs: http://electron.atom.io/docs/api/structures/upload-file

		/**
		 * Path of file to be uploaded.
		 */
		filePath: string;
		/**
		 * Number of bytes to read from offset. Defaults to 0.
		 */
		length: number;
		/**
		 * Last Modification time in number of seconds since the UNIX epoch.
		 */
		modificationTime: number;
		/**
		 * Defaults to 0.
		 */
		offset: number;
		/**
		 * file.
		 */
		type: string;
	}

	interface UploadFileSystem {

		// Docs: http://electron.atom.io/docs/api/structures/upload-file-system

		/**
		 * FileSystem url to read data for upload.
		 */
		filsSystemURL: string;
		/**
		 * Number of bytes to read from offset. Defaults to 0.
		 */
		length: number;
		/**
		 * Last Modification time in number of seconds since the UNIX epoch.
		 */
		modificationTime: number;
		/**
		 * Defaults to 0.
		 */
		offset: number;
		/**
		 * fileSystem.
		 */
		type: string;
	}

	interface UploadRawData {

		// Docs: http://electron.atom.io/docs/api/structures/upload-raw-data

		/**
		 * Data to be uploaded.
		 */
		bytes: Buffer;
		/**
		 * rawData.
		 */
		type: string;
	}

	class WebContents extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/web-contents

		static fromId(id: number): WebContents;
		static getAllWebContents(): WebContents[];
		static getFocusedWebContents(): WebContents;
		/**
		 * Emitted before dispatching the keydown and keyup events in the page. Calling
		 * event.preventDefault will prevent the page keydown/keyup events and the menu
		 * shortcuts. To only prevent the menu shortcuts, use setIgnoreMenuShortcuts:
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
		 * Emitted when failed to verify the certificate for url. The usage is the same
		 * with the certificate-error event of app.
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
		 * for windows with offscreen rendering enabled.
		 */
		on(event: 'console-message', listener: (level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		once(event: 'console-message', listener: (level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		addListener(event: 'console-message', listener: (level: number,
			message: string,
			line: number,
			sourceId: string) => void): this;
		removeListener(event: 'console-message', listener: (level: number,
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
		 * Emitted when the cursor's type changes. The type parameter can be default,
		 * crosshair, pointer, text, wait, help, e-resize, n-resize, ne-resize, nw-resize,
		 * s-resize, se-resize, sw-resize, w-resize, ns-resize, ew-resize, nesw-resize,
		 * nwse-resize, col-resize, row-resize, m-panning, e-panning, n-panning,
		 * ne-panning, nw-panning, s-panning, se-panning, sw-panning, w-panning, move,
		 * vertical-text, cell, context-menu, alias, progress, nodrop, copy, none,
		 * not-allowed, zoom-in, zoom-out, grab, grabbing or custom. If the type parameter
		 * is custom, the image parameter will hold the custom cursor image in a
		 * NativeImage, and scale, size and hotspot will hold additional information about
		 * the custom cursor.
		 */
		on(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image?: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale?: number,
			/**
			 * the size of the `image`.
			 */
			size?: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot?: Point) => void): this;
		once(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image?: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale?: number,
			/**
			 * the size of the `image`.
			 */
			size?: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot?: Point) => void): this;
		addListener(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image?: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale?: number,
			/**
			 * the size of the `image`.
			 */
			size?: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot?: Point) => void): this;
		removeListener(event: 'cursor-changed', listener: (event: Event,
			type: string,
			image?: NativeImage,
			/**
			 * scaling factor for the custom cursor.
			 */
			scale?: number,
			/**
			 * the size of the `image`.
			 */
			size?: Size,
			/**
			 * coordinates of the custom cursor's hotspot.
			 */
			hotspot?: Point) => void): this;
		/**
		 * Emitted when webContents is destroyed.
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
		 * Emitted when a <webview> has been attached to this web contents.
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
			color: string | null) => void): this;
		once(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: string | null) => void): this;
		addListener(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: string | null) => void): this;
		removeListener(event: 'did-change-theme-color', listener: (event: Event,
			/**
			 * Theme color is in format of '#rrggbb'. It is `null` when no theme color is set.
			 */
			color: string | null) => void): this;
		/**
		 * This event is like did-finish-load but emitted when the load failed or was
		 * cancelled, e.g. window.stop() is invoked. The full list of error codes and their
		 * meaning is available here.
		 */
		on(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean) => void): this;
		once(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean) => void): this;
		addListener(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean) => void): this;
		removeListener(event: 'did-fail-load', listener: (event: Event,
			errorCode: number,
			errorDescription: string,
			validatedURL: string,
			isMainFrame: boolean) => void): this;
		/**
		 * Emitted when the navigation is done, i.e. the spinner of the tab has stopped
		 * spinning, and the onload event was dispatched.
		 */
		on(event: 'did-finish-load', listener: Function): this;
		once(event: 'did-finish-load', listener: Function): this;
		addListener(event: 'did-finish-load', listener: Function): this;
		removeListener(event: 'did-finish-load', listener: Function): this;
		/**
		 * Emitted when a frame has done navigation.
		 */
		on(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean) => void): this;
		once(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean) => void): this;
		addListener(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean) => void): this;
		removeListener(event: 'did-frame-finish-load', listener: (event: Event,
			isMainFrame: boolean) => void): this;
		/**
		 * Emitted when a redirect is received while requesting a resource.
		 */
		on(event: 'did-get-redirect-request', listener: (event: Event,
			oldURL: string,
			newURL: string,
			isMainFrame: boolean,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any) => void): this;
		once(event: 'did-get-redirect-request', listener: (event: Event,
			oldURL: string,
			newURL: string,
			isMainFrame: boolean,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any) => void): this;
		addListener(event: 'did-get-redirect-request', listener: (event: Event,
			oldURL: string,
			newURL: string,
			isMainFrame: boolean,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any) => void): this;
		removeListener(event: 'did-get-redirect-request', listener: (event: Event,
			oldURL: string,
			newURL: string,
			isMainFrame: boolean,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any) => void): this;
		/**
		 * Emitted when details regarding a requested resource are available. status
		 * indicates the socket connection to download the resource.
		 */
		on(event: 'did-get-response-details', listener: (event: Event,
			status: boolean,
			newURL: string,
			originalURL: string,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any,
			resourceType: string) => void): this;
		once(event: 'did-get-response-details', listener: (event: Event,
			status: boolean,
			newURL: string,
			originalURL: string,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any,
			resourceType: string) => void): this;
		addListener(event: 'did-get-response-details', listener: (event: Event,
			status: boolean,
			newURL: string,
			originalURL: string,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any,
			resourceType: string) => void): this;
		removeListener(event: 'did-get-response-details', listener: (event: Event,
			status: boolean,
			newURL: string,
			originalURL: string,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: any,
			resourceType: string) => void): this;
		/**
		 * Emitted when a navigation is done. This event is not emitted for in-page
		 * navigations, such as clicking anchor links or updating the window.location.hash.
		 * Use did-navigate-in-page event for this purpose.
		 */
		on(event: 'did-navigate', listener: (event: Event,
			url: string) => void): this;
		once(event: 'did-navigate', listener: (event: Event,
			url: string) => void): this;
		addListener(event: 'did-navigate', listener: (event: Event,
			url: string) => void): this;
		removeListener(event: 'did-navigate', listener: (event: Event,
			url: string) => void): this;
		/**
		 * Emitted when an in-page navigation happened. When in-page navigation happens,
		 * the page URL changes but does not cause navigation outside of the page. Examples
		 * of this occurring are when anchor links are clicked or when the DOM hashchange
		 * event is triggered.
		 */
		on(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean) => void): this;
		once(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean) => void): this;
		addListener(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean) => void): this;
		removeListener(event: 'did-navigate-in-page', listener: (event: Event,
			url: string,
			isMainFrame: boolean) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab started spinning.
		 */
		on(event: 'did-start-loading', listener: Function): this;
		once(event: 'did-start-loading', listener: Function): this;
		addListener(event: 'did-start-loading', listener: Function): this;
		removeListener(event: 'did-start-loading', listener: Function): this;
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
		 * Emitted when a result is available for [webContents.findInPage] request.
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
		 * Emitted when webContents wants to do basic auth. The usage is the same with the
		 * login event of app.
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
		 * Emitted when the page requests to open a new window for a url. It could be
		 * requested by window.open or an external link like <a target='_blank'>. By
		 * default a new BrowserWindow will be created for the url. Calling
		 * event.preventDefault() will prevent Electron from automatically creating a new
		 * BrowserWindow. If you call event.preventDefault() and manually create a new
		 * BrowserWindow then you must set event.newGuest to reference the new
		 * BrowserWindow instance, failing to do so may result in unexpected behavior. For
		 * example:
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
			 * The options which will be used for creating the new .
			 */
			options: any,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[]) => void): this;
		once(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new .
			 */
			options: any,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[]) => void): this;
		addListener(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new .
			 */
			options: any,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[]) => void): this;
		removeListener(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			/**
			 * Can be `default`, `foreground-tab`, `background-tab`, `new-window`,
			 * `save-to-disk` and `other`.
			 */
			disposition: ('default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other'),
			/**
			 * The options which will be used for creating the new .
			 */
			options: any,
			/**
			 * The non-standard features (features not handled by Chromium or Electron) given
			 * to `window.open()`.
			 */
			additionalFeatures: string[]) => void): this;
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
		 * Emitted when bluetooth device needs to be selected on call to
		 * navigator.bluetooth.requestDevice. To use navigator.bluetooth api webBluetooth
		 * should be enabled. If event.preventDefault is not called, first available device
		 * will be selected. callback should be called with deviceId to be selected,
		 * passing empty string to callback will cancel the request.
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
		 * Emitted when a client certificate is requested. The usage is the same with the
		 * select-client-certificate event of app.
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
		 * Emitted when a <webview>'s web contents is being attached to this web contents.
		 * Calling event.preventDefault() will destroy the guest page. This event can be
		 * used to configure webPreferences for the webContents of a <webview> before it's
		 * loaded, and provides the ability to set settings that can't be set via <webview>
		 * attributes. Note: The specified preload script option will be appear as
		 * preloadURL (not preload) in the webPreferences object emitted with this event.
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
			params: any) => void): this;
		once(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: any,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: any) => void): this;
		addListener(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: any,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: any) => void): this;
		removeListener(event: 'will-attach-webview', listener: (event: Event,
			/**
			 * The web preferences that will be used by the guest page. This object can be
			 * modified to adjust the preferences for the guest page.
			 */
			webPreferences: any,
			/**
			 * The other `<webview>` parameters such as the `src` URL. This object can be
			 * modified to adjust the parameters of the guest page.
			 */
			params: any) => void): this;
		/**
		 * Emitted when a user or the page wants to start navigation. It can happen when
		 * the window.location object is changed or a user clicks a link in the page. This
		 * event will not emit when the navigation is started programmatically with APIs
		 * like webContents.loadURL and webContents.back. It is also not emitted for
		 * in-page navigations, such as clicking anchor links or updating the
		 * window.location.hash. Use did-navigate-in-page event for this purpose. Calling
		 * event.preventDefault() will prevent the navigation.
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
		 * Emitted when a beforeunload event handler is attempting to cancel a page unload.
		 * Calling event.preventDefault() will ignore the beforeunload event handler and
		 * allow the page to be unloaded.
		 */
		on(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		once(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		addListener(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		removeListener(event: 'will-prevent-unload', listener: (event: Event) => void): this;
		/**
		 * Adds the specified path to DevTools workspace. Must be used after DevTools
		 * creation:
		 */
		addWorkSpace(path: string): void;
		/**
		 * Begin subscribing for presentation events and captured frames, the callback will
		 * be called with callback(frameBuffer, dirtyRect) when there is a presentation
		 * event. The frameBuffer is a Buffer that contains raw pixel data. On most
		 * machines, the pixel data is effectively stored in 32bit BGRA format, but the
		 * actual representation depends on the endianness of the processor (most modern
		 * processors are little-endian, on machines with big-endian processors the data is
		 * in 32bit ARGB format). The dirtyRect is an object with x, y, width, height
		 * properties that describes which part of the page was repainted. If onlyDirty is
		 * set to true, frameBuffer will only contain the repainted area. onlyDirty
		 * defaults to false.
		 */
		beginFrameSubscription(callback: (frameBuffer: Buffer, dirtyRect: Rectangle) => void): void;
		/**
		 * Begin subscribing for presentation events and captured frames, the callback will
		 * be called with callback(frameBuffer, dirtyRect) when there is a presentation
		 * event. The frameBuffer is a Buffer that contains raw pixel data. On most
		 * machines, the pixel data is effectively stored in 32bit BGRA format, but the
		 * actual representation depends on the endianness of the processor (most modern
		 * processors are little-endian, on machines with big-endian processors the data is
		 * in 32bit ARGB format). The dirtyRect is an object with x, y, width, height
		 * properties that describes which part of the page was repainted. If onlyDirty is
		 * set to true, frameBuffer will only contain the repainted area. onlyDirty
		 * defaults to false.
		 */
		beginFrameSubscription(onlyDirty: boolean, callback: (frameBuffer: Buffer, dirtyRect: Rectangle) => void): void;
		canGoBack(): boolean;
		canGoForward(): boolean;
		canGoToOffset(offset: number): boolean;
		/**
		 * Captures a snapshot of the page within rect. Upon completion callback will be
		 * called with callback(image). The image is an instance of NativeImage that stores
		 * data of the snapshot. Omitting rect will capture the whole visible page.
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Captures a snapshot of the page within rect. Upon completion callback will be
		 * called with callback(image). The image is an instance of NativeImage that stores
		 * data of the snapshot. Omitting rect will capture the whole visible page.
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
		/**
		 * Closes the devtools.
		 */
		closeDevTools(): void;
		/**
		 * Executes the editing command copy in web page.
		 */
		copy(): void;
		/**
		 * Copy the image at the given position to the clipboard.
		 */
		copyImageAt(x: number, y: number): void;
		/**
		 * Executes the editing command cut in web page.
		 */
		cut(): void;
		/**
		 * Executes the editing command delete in web page.
		 */
		delete(): void;
		/**
		 * Disable device emulation enabled by webContents.enableDeviceEmulation.
		 */
		disableDeviceEmulation(): void;
		/**
		 * Initiates a download of the resource at url without navigating. The
		 * will-download event of session will be triggered.
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
		 * Evaluates code in page. In the browser window some HTML APIs like
		 * requestFullScreen can only be invoked by a gesture from the user. Setting
		 * userGesture to true will remove this limitation. If the result of the executed
		 * code is a promise the callback result will be the resolved value of the promise.
		 * We recommend that you use the returned Promise to handle code that results in a
		 * Promise.
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
		/**
		 * Starts a request to find all matches for the text in the web page. The result of
		 * the request can be obtained by subscribing to found-in-page event.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		/**
		 * Focuses the web page.
		 */
		focus(): void;
		getFrameRate(): number;
		getOSProcessId(): number;
		/**
		 * Get the system printer list.
		 */
		getPrinters(): PrinterInfo[];
		getTitle(): string;
		getURL(): string;
		getUserAgent(): string;
		getWebRTCIPHandlingPolicy(): string;
		/**
		 * Sends a request to get current zoom factor, the callback will be called with
		 * callback(zoomFactor).
		 */
		getZoomFactor(callback: (zoomFactor: number) => void): void;
		/**
		 * Sends a request to get current zoom level, the callback will be called with
		 * callback(zoomLevel).
		 */
		getZoomLevel(callback: (zoomLevel: number) => void): void;
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
		 * Checks if any ServiceWorker is registered and returns a boolean as response to
		 * callback.
		 */
		hasServiceWorker(callback: (hasWorker: boolean) => void): void;
		/**
		 * Injects CSS into the current web page.
		 */
		insertCSS(css: string): void;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Starts inspecting element at position (x, y).
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the developer tools for the service worker context.
		 */
		inspectServiceWorker(): void;
		/**
		 * Schedules a full repaint of the window this web contents is in. If offscreen
		 * rendering is enabled invalidates the frame and generates a new one through the
		 * 'paint' event.
		 */
		invalidate(): void;
		isAudioMuted(): boolean;
		isCrashed(): boolean;
		isDestroyed(): boolean;
		isDevToolsFocused(): boolean;
		isDevToolsOpened(): boolean;
		isFocused(): boolean;
		isLoading(): boolean;
		isLoadingMainFrame(): boolean;
		isOffscreen(): boolean;
		isPainting(): boolean;
		isWaitingForResponse(): boolean;
		/**
		 * Loads the given file in the window, filePath should be a path to an HTML file
		 * relative to the root of your application.  For instance an app structure like
		 * this: Would require code like this
		 */
		loadFile(filePath: string): void;
		/**
		 * Loads the url in the window. The url must contain the protocol prefix, e.g. the
		 * http:// or file://. If the load should bypass http cache then use the pragma
		 * header to achieve it.
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * Opens the devtools. When contents is a <webview> tag, the mode would be detach
		 * by default, explicitly passing an empty mode can force using last used dock
		 * state.
		 */
		openDevTools(options?: OpenDevToolsOptions): void;
		/**
		 * Executes the editing command paste in web page.
		 */
		paste(): void;
		/**
		 * Executes the editing command pasteAndMatchStyle in web page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Prints window's web page. When silent is set to true, Electron will pick the
		 * system's default printer if deviceName is empty and the default settings for
		 * printing. Calling window.print() in web page is equivalent to calling
		 * webContents.print({silent: false, printBackground: false, deviceName: ''}). Use
		 * page-break-before: always; CSS style to force to print to a new page.
		 */
		print(options?: PrintOptions, callback?: (success: boolean) => void): void;
		/**
		 * Prints window's web page as PDF with Chromium's preview printing custom
		 * settings. The callback will be called with callback(error, data) on completion.
		 * The data is a Buffer that contains the generated PDF data. The landscape will be
		 * ignored if @page CSS at-rule is used in the web page. By default, an empty
		 * options will be regarded as: Use page-break-before: always; CSS style to force
		 * to print to a new page. An example of webContents.printToPDF:
		 */
		printToPDF(options: PrintToPDFOptions, callback: (error: Error, data: Buffer) => void): void;
		/**
		 * Executes the editing command redo in web page.
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
		 * Removes the specified path from DevTools workspace.
		 */
		removeWorkSpace(path: string): void;
		/**
		 * Executes the editing command replace in web page.
		 */
		replace(text: string): void;
		/**
		 * Executes the editing command replaceMisspelling in web page.
		 */
		replaceMisspelling(text: string): void;
		savePage(fullPath: string, saveType: 'HTMLOnly' | 'HTMLComplete' | 'MHTML', callback: (error: Error) => void): boolean;
		/**
		 * Executes the editing command selectAll in web page.
		 */
		selectAll(): void;
		/**
		 * Send an asynchronous message to renderer process via channel, you can also send
		 * arbitrary arguments. Arguments will be serialized in JSON internally and hence
		 * no functions or prototype chain will be included. The renderer process can
		 * handle the message by listening to channel with the ipcRenderer module. An
		 * example of sending messages from the main process to the renderer process:
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Sends an input event to the page. Note: The BrowserWindow containing the
		 * contents needs to be focused for sendInputEvent() to work. For keyboard events,
		 * the event object also have following properties: For mouse events, the event
		 * object also have following properties: For the mouseWheel event, the event
		 * object also have following properties:
		 */
		sendInputEvent(event: Event): void;
		/**
		 * Mute the audio on the current web page.
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * Uses the devToolsWebContents as the target WebContents to show devtools. The
		 * devToolsWebContents must not have done any navigation, and it should not be used
		 * for other purposes after the call. By default Electron manages the devtools by
		 * creating an internal WebContents with native view, which developers have very
		 * limited control of. With the setDevToolsWebContents method, developers can use
		 * any WebContents to show the devtools in it, including BrowserWindow, BrowserView
		 * and <webview> tag. Note that closing the devtools does not destroy the
		 * devToolsWebContents, it is caller's responsibility to destroy
		 * devToolsWebContents. An example of showing devtools in a <webview> tag: An
		 * example of showing devtools in a BrowserWindow:
		 */
		setDevToolsWebContents(devToolsWebContents: WebContents): void;
		/**
		 * If offscreen rendering is enabled sets the frame rate to the specified number.
		 * Only values between 1 and 60 are accepted.
		 */
		setFrameRate(fps: number): void;
		/**
		 * Ignore application menu shortcuts while this web contents is focused.
		 */
		setIgnoreMenuShortcuts(ignore: boolean): void;
		/**
		 * Sets the maximum and minimum layout-based (i.e. non-visual) zoom level.
		 */
		setLayoutZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Set the size of the page. This is only supported for <webview> guest contents.
		 */
		setSize(options: SizeOptions): void;
		/**
		 * Overrides the user agent for this web page.
		 */
		setUserAgent(userAgent: string): void;
		/**
		 * Sets the maximum and minimum pinch-to-zoom level.
		 */
		setVisualZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Setting the WebRTC IP handling policy allows you to control which IPs are
		 * exposed via WebRTC. See BrowserLeaks for more details.
		 */
		setWebRTCIPHandlingPolicy(policy: 'default' | 'default_public_interface_only' | 'default_public_and_private_interfaces' | 'disable_non_proxied_udp'): void;
		/**
		 * Changes the zoom factor to the specified factor. Zoom factor is zoom percent
		 * divided by 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Changes the zoom level to the specified level. The original size is 0 and each
		 * increment above or below represents zooming 20% larger or smaller to default
		 * limits of 300% and 50% of original size, respectively. The formula for this is
		 * scale := 1.2 ^ level.
		 */
		setZoomLevel(level: number): void;
		/**
		 * Shows pop-up dictionary that searches the selected word on the page.
		 */
		showDefinitionForSelection(): void;
		/**
		 * Sets the item as dragging item for current drag-drop operation, file is the
		 * absolute path of the file to be dragged, and icon is the image showing under the
		 * cursor when dragging.
		 */
		startDrag(item: Item): void;
		/**
		 * If offscreen rendering is enabled and not painting, start painting.
		 */
		startPainting(): void;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Stops any findInPage request for the webContents with the provided action.
		 */
		stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
		/**
		 * If offscreen rendering is enabled and painting, stop painting.
		 */
		stopPainting(): void;
		/**
		 * Toggles the developer tools.
		 */
		toggleDevTools(): void;
		/**
		 * Executes the editing command undo in web page.
		 */
		undo(): void;
		/**
		 * Unregisters any ServiceWorker if present and returns a boolean as response to
		 * callback when the JS promise is fulfilled or false when the JS promise is
		 * rejected.
		 */
		unregisterServiceWorker(callback: (success: boolean) => void): void;
		/**
		 * Executes the editing command unselect in web page.
		 */
		unselect(): void;
		debugger: Debugger;
		devToolsWebContents: WebContents;
		hostWebContents: WebContents;
		id: number;
		session: Session;
	}

	interface WebFrame extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/web-frame

		/**
		 * Attempts to free memory that is no longer being used (like images from a
		 * previous navigation). Note that blindly calling this method probably makes
		 * Electron slower since it will have to refill these emptied caches, you should
		 * only call it if an event in your app has occurred that makes you think your page
		 * is actually using less memory (i.e. you have navigated from a super heavy page
		 * to a mostly empty one, and intend to stay there).
		 */
		clearCache(): void;
		/**
		 * Evaluates code in page. In the browser window some HTML APIs like
		 * requestFullScreen can only be invoked by a gesture from the user. Setting
		 * userGesture to true will remove this limitation.
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
		/**
		 * Work like executeJavaScript but evaluates scripts in isolated context.
		 */
		executeJavaScriptInIsolatedWorld(worldId: number, scripts: WebSource[], userGesture?: boolean, callback?: (result: any) => void): void;
		/**
		 * Returns an object describing usage information of Blink's internal memory
		 * caches. This will generate:
		 */
		getResourceUsage(): ResourceUsage;
		getZoomFactor(): number;
		getZoomLevel(): number;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Resources will be loaded from this scheme regardless of the current page's
		 * Content Security Policy.
		 */
		registerURLSchemeAsBypassingCSP(scheme: string): void;
		/**
		 * Registers the scheme as secure, bypasses content security policy for resources,
		 * allows registering ServiceWorker and supports fetch API. Specify an option with
		 * the value of false to omit it from the registration. An example of registering a
		 * privileged scheme, without bypassing Content Security Policy:
		 */
		registerURLSchemeAsPrivileged(scheme: string, options?: RegisterURLSchemeAsPrivilegedOptions): void;
		/**
		 * Registers the scheme as secure scheme. Secure schemes do not trigger mixed
		 * content warnings. For example, https and data are secure schemes because they
		 * cannot be corrupted by active network attackers.
		 */
		registerURLSchemeAsSecure(scheme: string): void;
		/**
		 * Set the content security policy of the isolated world.
		 */
		setIsolatedWorldContentSecurityPolicy(worldId: number, csp: string): void;
		/**
		 * Set the name of the isolated world. Useful in devtools.
		 */
		setIsolatedWorldHumanReadableName(worldId: number, name: string): void;
		/**
		 * Set the security origin of the isolated world.
		 */
		setIsolatedWorldSecurityOrigin(worldId: number, securityOrigin: string): void;
		/**
		 * Sets the maximum and minimum layout-based (i.e. non-visual) zoom level.
		 */
		setLayoutZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Sets a provider for spell checking in input fields and text areas. The provider
		 * must be an object that has a spellCheck method that returns whether the word
		 * passed is correctly spelled. An example of using node-spellchecker as provider:
		 */
		setSpellCheckProvider(language: string, autoCorrectWord: boolean, provider: Provider): void;
		/**
		 * Sets the maximum and minimum pinch-to-zoom level.
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
	}

	class WebRequest extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/web-request

		/**
		 * The listener will be called with listener(details) when a server initiated
		 * redirect is about to occur.
		 */
		onBeforeRedirect(listener: (details: OnBeforeRedirectDetails) => void): void;
		/**
		 * The listener will be called with listener(details) when a server initiated
		 * redirect is about to occur.
		 */
		onBeforeRedirect(filter: OnBeforeRedirectFilter, listener: (details: OnBeforeRedirectDetails) => void): void;
		/**
		 * The listener will be called with listener(details, callback) when a request is
		 * about to occur. The uploadData is an array of UploadData objects. The callback
		 * has to be called with an response object.
		 */
		onBeforeRequest(listener: (details: OnBeforeRequestDetails, callback: (response: Response) => void) => void): void;
		/**
		 * The listener will be called with listener(details, callback) when a request is
		 * about to occur. The uploadData is an array of UploadData objects. The callback
		 * has to be called with an response object.
		 */
		onBeforeRequest(filter: OnBeforeRequestFilter, listener: (details: OnBeforeRequestDetails, callback: (response: Response) => void) => void): void;
		/**
		 * The listener will be called with listener(details, callback) before sending an
		 * HTTP request, once the request headers are available. This may occur after a TCP
		 * connection is made to the server, but before any http data is sent. The callback
		 * has to be called with an response object.
		 */
		onBeforeSendHeaders(filter: OnBeforeSendHeadersFilter, listener: Function): void;
		/**
		 * The listener will be called with listener(details, callback) before sending an
		 * HTTP request, once the request headers are available. This may occur after a TCP
		 * connection is made to the server, but before any http data is sent. The callback
		 * has to be called with an response object.
		 */
		onBeforeSendHeaders(listener: Function): void;
		/**
		 * The listener will be called with listener(details) when a request is completed.
		 */
		onCompleted(filter: OnCompletedFilter, listener: (details: OnCompletedDetails) => void): void;
		/**
		 * The listener will be called with listener(details) when a request is completed.
		 */
		onCompleted(listener: (details: OnCompletedDetails) => void): void;
		/**
		 * The listener will be called with listener(details) when an error occurs.
		 */
		onErrorOccurred(listener: (details: OnErrorOccurredDetails) => void): void;
		/**
		 * The listener will be called with listener(details) when an error occurs.
		 */
		onErrorOccurred(filter: OnErrorOccurredFilter, listener: (details: OnErrorOccurredDetails) => void): void;
		/**
		 * The listener will be called with listener(details, callback) when HTTP response
		 * headers of a request have been received. The callback has to be called with an
		 * response object.
		 */
		onHeadersReceived(filter: OnHeadersReceivedFilter, listener: Function): void;
		/**
		 * The listener will be called with listener(details, callback) when HTTP response
		 * headers of a request have been received. The callback has to be called with an
		 * response object.
		 */
		onHeadersReceived(listener: Function): void;
		/**
		 * The listener will be called with listener(details) when first byte of the
		 * response body is received. For HTTP requests, this means that the status line
		 * and response headers are available.
		 */
		onResponseStarted(listener: (details: OnResponseStartedDetails) => void): void;
		/**
		 * The listener will be called with listener(details) when first byte of the
		 * response body is received. For HTTP requests, this means that the status line
		 * and response headers are available.
		 */
		onResponseStarted(filter: OnResponseStartedFilter, listener: (details: OnResponseStartedDetails) => void): void;
		/**
		 * The listener will be called with listener(details) just before a request is
		 * going to be sent to the server, modifications of previous onBeforeSendHeaders
		 * response are visible by the time this listener is fired.
		 */
		onSendHeaders(filter: OnSendHeadersFilter, listener: (details: OnSendHeadersDetails) => void): void;
		/**
		 * The listener will be called with listener(details) just before a request is
		 * going to be sent to the server, modifications of previous onBeforeSendHeaders
		 * response are visible by the time this listener is fired.
		 */
		onSendHeaders(listener: (details: OnSendHeadersDetails) => void): void;
	}

	interface WebSource {

		// Docs: http://electron.atom.io/docs/api/structures/web-source

		code: string;
		/**
		 * Default is 1.
		 */
		startLine?: number;
		url?: string;
	}

	interface WebviewTag extends HTMLElement {

		// Docs: http://electron.atom.io/docs/api/webview-tag

		/**
		 * Fired when a load has committed. This includes navigation within the current
		 * document as well as subframe document-level loads, but does not include
		 * asynchronous resource loads.
		 */
		addEventListener(event: 'load-commit', listener: (event: LoadCommitEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'load-commit', listener: (event: LoadCommitEvent) => void): this;
		/**
		 * Fired when the navigation is done, i.e. the spinner of the tab will stop
		 * spinning, and the onload event is dispatched.
		 */
		addEventListener(event: 'did-finish-load', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-finish-load', listener: (event: Event) => void): this;
		/**
		 * This event is like did-finish-load, but fired when the load failed or was
		 * cancelled, e.g. window.stop() is invoked.
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
		 * Fired when details regarding a requested resource is available. status indicates
		 * socket connection to download the resource.
		 */
		addEventListener(event: 'did-get-response-details', listener: (event: DidGetResponseDetailsEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-get-response-details', listener: (event: DidGetResponseDetailsEvent) => void): this;
		/**
		 * Fired when a redirect was received while requesting a resource.
		 */
		addEventListener(event: 'did-get-redirect-request', listener: (event: DidGetRedirectRequestEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-get-redirect-request', listener: (event: DidGetRedirectRequestEvent) => void): this;
		/**
		 * Fired when document in the given frame is loaded.
		 */
		addEventListener(event: 'dom-ready', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'dom-ready', listener: (event: Event) => void): this;
		/**
		 * Fired when page title is set during navigation. explicitSet is false when title
		 * is synthesized from file url.
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
		 * Fired when the guest window logs a console message. The following example code
		 * forwards all log messages to the embedder's console without regard for log level
		 * or other properties.
		 */
		addEventListener(event: 'console-message', listener: (event: ConsoleMessageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'console-message', listener: (event: ConsoleMessageEvent) => void): this;
		/**
		 * Fired when a result is available for webview.findInPage request.
		 */
		addEventListener(event: 'found-in-page', listener: (event: FoundInPageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'found-in-page', listener: (event: FoundInPageEvent) => void): this;
		/**
		 * Fired when the guest page attempts to open a new browser window. The following
		 * example code opens the new url in system's default browser.
		 */
		addEventListener(event: 'new-window', listener: (event: NewWindowEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'new-window', listener: (event: NewWindowEvent) => void): this;
		/**
		 * Emitted when a user or the page wants to start navigation. It can happen when
		 * the window.location object is changed or a user clicks a link in the page. This
		 * event will not emit when the navigation is started programmatically with APIs
		 * like <webview>.loadURL and <webview>.back. It is also not emitted during in-page
		 * navigation, such as clicking anchor links or updating the window.location.hash.
		 * Use did-navigate-in-page event for this purpose. Calling event.preventDefault()
		 * does NOT have any effect.
		 */
		addEventListener(event: 'will-navigate', listener: (event: WillNavigateEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'will-navigate', listener: (event: WillNavigateEvent) => void): this;
		/**
		 * Emitted when a navigation is done. This event is not emitted for in-page
		 * navigations, such as clicking anchor links or updating the window.location.hash.
		 * Use did-navigate-in-page event for this purpose.
		 */
		addEventListener(event: 'did-navigate', listener: (event: DidNavigateEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-navigate', listener: (event: DidNavigateEvent) => void): this;
		/**
		 * Emitted when an in-page navigation happened. When in-page navigation happens,
		 * the page URL changes but does not cause navigation outside of the page. Examples
		 * of this occurring are when anchor links are clicked or when the DOM hashchange
		 * event is triggered.
		 */
		addEventListener(event: 'did-navigate-in-page', listener: (event: DidNavigateInPageEvent) => void, useCapture?: boolean): this;
		removeEventListener(event: 'did-navigate-in-page', listener: (event: DidNavigateInPageEvent) => void): this;
		/**
		 * Fired when the guest page attempts to close itself. The following example code
		 * navigates the webview to about:blank when the guest attempts to close itself.
		 */
		addEventListener(event: 'close', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Fired when the guest page has sent an asynchronous message to embedder page.
		 * With sendToHost method and ipc-message event you can easily communicate between
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
		 * Fired when the gpu process is crashed.
		 */
		addEventListener(event: 'gpu-crashed', listener: (event: Event) => void, useCapture?: boolean): this;
		removeEventListener(event: 'gpu-crashed', listener: (event: Event) => void): this;
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
		canGoBack(): boolean;
		canGoForward(): boolean;
		canGoToOffset(offset: number): boolean;
		/**
		 * Captures a snapshot of the webview's page. Same as
		 * webContents.capturePage([rect, ]callback).
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Captures a snapshot of the webview's page. Same as
		 * webContents.capturePage([rect, ]callback).
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
		/**
		 * Closes the DevTools window of guest page.
		 */
		closeDevTools(): void;
		/**
		 * Executes editing command copy in page.
		 */
		copy(): void;
		/**
		 * Executes editing command cut in page.
		 */
		cut(): void;
		/**
		 * Executes editing command delete in page.
		 */
		delete(): void;
		/**
		 * Evaluates code in page. If userGesture is set, it will create the user gesture
		 * context in the page. HTML APIs like requestFullScreen, which require user
		 * action, can take advantage of this option for automation.
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): void;
		/**
		 * Starts a request to find all matches for the text in the web page. The result of
		 * the request can be obtained by subscribing to found-in-page event.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		getTitle(): string;
		getURL(): string;
		getUserAgent(): string;
		getWebContents(): WebContents;
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
		 * Injects CSS into the guest page.
		 */
		insertCSS(css: string): void;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Starts inspecting element at position (x, y) of guest page.
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the DevTools for the service worker context present in the guest page.
		 */
		inspectServiceWorker(): void;
		isAudioMuted(): boolean;
		isCrashed(): boolean;
		isDevToolsFocused(): boolean;
		isDevToolsOpened(): boolean;
		isLoading(): boolean;
		isWaitingForResponse(): boolean;
		/**
		 * Loads the url in the webview, the url must contain the protocol prefix, e.g. the
		 * http:// or file://.
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * Opens a DevTools window for guest page.
		 */
		openDevTools(): void;
		/**
		 * Executes editing command paste in page.
		 */
		paste(): void;
		/**
		 * Executes editing command pasteAndMatchStyle in page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Prints webview's web page. Same as webContents.print([options]).
		 */
		print(options?: PrintOptions): void;
		/**
		 * Prints webview's web page as PDF, Same as webContents.printToPDF(options,
		 * callback).
		 */
		printToPDF(options: PrintToPDFOptions, callback: (error: Error, data: Buffer) => void): void;
		/**
		 * Executes editing command redo in page.
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
		 * Executes editing command replace in page.
		 */
		replace(text: string): void;
		/**
		 * Executes editing command replaceMisspelling in page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * Executes editing command selectAll in page.
		 */
		selectAll(): void;
		/**
		 * Send an asynchronous message to renderer process via channel, you can also send
		 * arbitrary arguments. The renderer process can handle the message by listening to
		 * the channel event with the ipcRenderer module. See webContents.send for
		 * examples.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Sends an input event to the page. See webContents.sendInputEvent for detailed
		 * description of event object.
		 */
		sendInputEvent(event: any): void;
		/**
		 * Set guest page muted.
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * Overrides the user agent for the guest page.
		 */
		setUserAgent(userAgent: string): void;
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
		 * Shows pop-up dictionary that searches the selected word on the page.
		 */
		showDefinitionForSelection(): void;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Stops any findInPage request for the webview with the provided action.
		 */
		stopFindInPage(action: 'clearSelection' | 'keepSelection' | 'activateSelection'): void;
		/**
		 * Executes editing command undo in page.
		 */
		undo(): void;
		/**
		 * Executes editing command unselect in page.
		 */
		unselect(): void;
		/**
		 * When this attribute is present the guest page will be allowed to open new
		 * windows. Popups are disabled by default.
		 */
		// allowpopups?: string; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * When this attribute is present the webview container will automatically resize
		 * within the bounds specified by the attributes minwidth, minheight, maxwidth, and
		 * maxheight. These constraints do not impact the webview unless autosize is
		 * enabled. When autosize is enabled, the webview container size cannot be less
		 * than the minimum values or greater than the maximum.
		 */
		autosize?: string;
		/**
		 * A list of strings which specifies the blink features to be enabled separated by
		 * ,. The full list of supported feature strings can be found in the
		 * RuntimeEnabledFeatures.json5 file.
		 */
		blinkfeatures?: string;
		/**
		 * A list of strings which specifies the blink features to be disabled separated by
		 * ,. The full list of supported feature strings can be found in the
		 * RuntimeEnabledFeatures.json5 file.
		 */
		disableblinkfeatures?: string;
		/**
		 * When this attribute is present the webview contents will be prevented from
		 * resizing when the webview element itself is resized. This can be used in
		 * combination with webContents.setSize to manually resize the webview contents in
		 * reaction to a window size change. This can make resizing faster compared to
		 * relying on the webview element bounds to automatically resize the contents.
		 */
		disableguestresize?: string;
		/**
		 * When this attribute is present the guest page will have web security disabled.
		 * Web security is enabled by default.
		 */
		// disablewebsecurity?: string; ### VSCODE CHANGE(https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * A value that links the webview to a specific webContents. When a webview first
		 * loads a new webContents is created and this attribute is set to its instance
		 * identifier. Setting this attribute on a new or existing webview connects it to
		 * the existing webContents that currently renders in a different webview. The
		 * existing webview will see the destroy event and will then create a new
		 * webContents when a new url is loaded.
		 */
		guestinstance?: string;
		/**
		 * Sets the referrer URL for the guest page.
		 */
		httpreferrer?: string;
		/**
		 * When this attribute is present the guest page in webview will have node
		 * integration and can use node APIs like require and process to access low level
		 * system resources. Node integration is disabled by default in the guest page.
		 */
		nodeintegration?: string;
		/**
		 * Sets the session used by the page. If partition starts with persist:, the page
		 * will use a persistent session available to all pages in the app with the same
		 * partition. if there is no persist: prefix, the page will use an in-memory
		 * session. By assigning the same partition, multiple pages can share the same
		 * session. If the partition is unset then default session of the app will be used.
		 * This value can only be modified before the first navigation, since the session
		 * of an active renderer process cannot change. Subsequent attempts to modify the
		 * value will fail with a DOM exception.
		 */
		partition?: string;
		/**
		 * When this attribute is present the guest page in webview will be able to use
		 * browser plugins. Plugins are disabled by default.
		 */
		plugins?: string;
		/**
		 * Specifies a script that will be loaded before other scripts run in the guest
		 * page. The protocol of script's URL must be either file: or asar:, because it
		 * will be loaded by require in guest page under the hood. When the guest page
		 * doesn't have node integration this script will still have access to all Node
		 * APIs, but global objects injected by Node will be deleted after this script has
		 * finished executing. Note: This option will be appear as preloadURL (not preload)
		 * in the webPreferences specified to the will-attach-webview event.
		 */
		preload?: string;
		/**
		 * Returns the visible URL. Writing to this attribute initiates top-level
		 * navigation. Assigning src its own value will reload the current page. The src
		 * attribute can also accept data URLs, such as data:text/plain,Hello, world!.
		 */
		src?: string;
		/**
		 * Sets the user agent for the guest page before the page is navigated to. Once the
		 * page is loaded, use the setUserAgent method to change the user agent.
		 */
		useragent?: string;
		/**
		 * A list of strings which specifies the web preferences to be set on the webview,
		 * separated by ,. The full list of supported preference strings can be found in
		 * BrowserWindow. The string follows the same format as the features string in
		 * window.open. A name by itself is given a true boolean value. A preference can be
		 * set to another value by including an =, followed by the value. Special values
		 * yes and 1 are interpreted as true, while no and 0 are interpreted as false.
		 */
		webpreferences?: string;
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
		 * Credit information.
		 */
		credits?: string;
		/**
		 * The app's build version number.
		 */
		version?: string;
	}

	interface AddRepresentationOptions {
		/**
		 * The scale factor to add the image representation for.
		 */
		scaleFactor: number;
		/**
		 * Defaults to 0. Required if a bitmap buffer is specified as buffer.
		 */
		width?: number;
		/**
		 * Defaults to 0. Required if a bitmap buffer is specified as buffer.
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

	interface AppDetailsOptions {
		/**
		 * Window's . It has to be set, otherwise the other options will have no effect.
		 */
		appId?: string;
		/**
		 * Window's .
		 */
		appIconPath?: string;
		/**
		 * Index of the icon in appIconPath. Ignored when appIconPath is not set. Default
		 * is 0.
		 */
		appIconIndex?: number;
		/**
		 * Window's .
		 */
		relaunchCommand?: string;
		/**
		 * Window's .
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
		 * If true, the view's width will grow and shrink together with the window. false
		 * by default.
		 */
		width: boolean;
		/**
		 * If true, the view's height will grow and shrink together with the window. false
		 * by default.
		 */
		height: boolean;
	}

	interface BitmapOptions {
		/**
		 * Defaults to 1.0.
		 */
		scaleFactor?: number;
	}

	interface BrowserViewConstructorOptions {
		/**
		 * See .
		 */
		webPreferences?: WebPreferences;
	}

	interface BrowserWindowConstructorOptions {
		/**
		 * Window's width in pixels. Default is 800.
		 */
		width?: number;
		/**
		 * Window's height in pixels. Default is 600.
		 */
		height?: number;
		/**
		 * ( if y is used) Window's left offset from screen. Default is to center the
		 * window.
		 */
		x?: number;
		/**
		 * ( if x is used) Window's top offset from screen. Default is to center the
		 * window.
		 */
		y?: number;
		/**
		 * The width and height would be used as web page's size, which means the actual
		 * window's size will include window frame's size and be slightly larger. Default
		 * is false.
		 */
		useContentSize?: boolean;
		/**
		 * Show window in the center of the screen.
		 */
		center?: boolean;
		/**
		 * Window's minimum width. Default is 0.
		 */
		minWidth?: number;
		/**
		 * Window's minimum height. Default is 0.
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
		 * Whether window is resizable. Default is true.
		 */
		resizable?: boolean;
		/**
		 * Whether window is movable. This is not implemented on Linux. Default is true.
		 */
		movable?: boolean;
		/**
		 * Whether window is minimizable. This is not implemented on Linux. Default is
		 * true.
		 */
		minimizable?: boolean;
		/**
		 * Whether window is maximizable. This is not implemented on Linux. Default is
		 * true.
		 */
		maximizable?: boolean;
		/**
		 * Whether window is closable. This is not implemented on Linux. Default is true.
		 */
		closable?: boolean;
		/**
		 * Whether the window can be focused. Default is true. On Windows setting
		 * focusable: false also implies setting skipTaskbar: true. On Linux setting
		 * focusable: false makes the window stop interacting with wm, so the window will
		 * always stay on top in all workspaces.
		 */
		focusable?: boolean;
		/**
		 * Whether the window should always stay on top of other windows. Default is false.
		 */
		alwaysOnTop?: boolean;
		/**
		 * Whether the window should show in fullscreen. When explicitly set to false the
		 * fullscreen button will be hidden or disabled on macOS. Default is false.
		 */
		fullscreen?: boolean;
		/**
		 * Whether the window can be put into fullscreen mode. On macOS, also whether the
		 * maximize/zoom button should toggle full screen mode or maximize window. Default
		 * is true.
		 */
		fullscreenable?: boolean;
		/**
		 * Use pre-Lion fullscreen on macOS. Default is false.
		 */
		simpleFullscreen?: boolean;
		/**
		 * Whether to show the window in taskbar. Default is false.
		 */
		skipTaskbar?: boolean;
		/**
		 * The kiosk mode. Default is false.
		 */
		kiosk?: boolean;
		/**
		 * Default window title. Default is "Electron".
		 */
		title?: string;
		/**
		 * The window icon. On Windows it is recommended to use ICO icons to get best
		 * visual effects, you can also leave it undefined so the executable's icon will be
		 * used.
		 */
		icon?: NativeImage | string;
		/**
		 * Whether window should be shown when created. Default is true.
		 */
		show?: boolean;
		/**
		 * Specify false to create a . Default is true.
		 */
		frame?: boolean;
		/**
		 * Specify parent window. Default is null.
		 */
		parent?: BrowserWindow;
		/**
		 * Whether this is a modal window. This only works when the window is a child
		 * window. Default is false.
		 */
		modal?: boolean;
		/**
		 * Whether the web view accepts a single mouse-down event that simultaneously
		 * activates the window. Default is false.
		 */
		acceptFirstMouse?: boolean;
		/**
		 * Whether to hide cursor when typing. Default is false.
		 */
		disableAutoHideCursor?: boolean;
		/**
		 * Auto hide the menu bar unless the Alt key is pressed. Default is false.
		 */
		autoHideMenuBar?: boolean;
		/**
		 * Enable the window to be resized larger than screen. Default is false.
		 */
		enableLargerThanScreen?: boolean;
		/**
		 * Window's background color as a hexadecimal value, like #66CD00 or #FFF or
		 * #80FFFFFF (alpha is supported). Default is #FFF (white).
		 */
		backgroundColor?: string;
		/**
		 * Whether window should have a shadow. This is only implemented on macOS. Default
		 * is true.
		 */
		hasShadow?: boolean;
		/**
		 * Set the initial opacity of the window, between 0.0 (fully transparent) and 1.0
		 * (fully opaque). This is only implemented on Windows and macOS.
		 */
		opacity?: number;
		/**
		 * Forces using dark theme for the window, only works on some GTK+3 desktop
		 * environments. Default is false.
		 */
		darkTheme?: boolean;
		/**
		 * Makes the window . Default is false.
		 */
		transparent?: boolean;
		/**
		 * The type of window, default is normal window. See more about this below.
		 */
		type?: string;
		/**
		 * The style of window title bar. Default is default. Possible values are:
		 */
		titleBarStyle?: ('default' | 'hidden' | 'hiddenInset' | 'customButtonsOnHover');
		/**
		 * Shows the title in the title bar in full screen mode on macOS for all
		 * titleBarStyle options. Default is false.
		 */
		fullscreenWindowTitle?: boolean;
		/**
		 * Use WS_THICKFRAME style for frameless windows on Windows, which adds standard
		 * window frame. Setting it to false will remove window shadow and window
		 * animations. Default is true.
		 */
		thickFrame?: boolean;
		/**
		 * Add a type of vibrancy effect to the window, only on macOS. Can be
		 * appearance-based, light, dark, titlebar, selection, menu, popover, sidebar,
		 * medium-light or ultra-dark. Please note that using frame: false in combination
		 * with a vibrancy value requires that you use a non-default titleBarStyle as well.
		 */
		vibrancy?: ('appearance-based' | 'light' | 'dark' | 'titlebar' | 'selection' | 'menu' | 'popover' | 'sidebar' | 'medium-light' | 'ultra-dark');
		/**
		 * Controls the behavior on macOS when option-clicking the green stoplight button
		 * on the toolbar or by clicking the Window > Zoom menu item. If true, the window
		 * will grow to the preferred width of the web page when zoomed, false will cause
		 * it to zoom to the width of the screen. This will also affect the behavior when
		 * calling maximize() directly. Default is false.
		 */
		zoomToPageWidth?: boolean;
		/**
		 * Tab group name, allows opening the window as a native tab on macOS 10.12+.
		 * Windows with the same tabbing identifier will be grouped together. This also
		 * adds a native new tab button to your window's tab bar and allows your app and
		 * window to receive the new-window-for-tab event.
		 */
		tabbingIdentifier?: string;
		/**
		 * Settings of web page's features.
		 */
		webPreferences?: WebPreferences;
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

	interface CertificateVerifyProcRequest {
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

	interface ClearStorageDataOptions {
		/**
		 * Should follow window.location.origin’s representation scheme://host:port.
		 */
		origin?: string;
		/**
		 * The types of storages to clear, can contain: appcache, cookies, filesystem,
		 * indexdb, localstorage, shadercache, websql, serviceworkers.
		 */
		storages?: string[];
		/**
		 * The types of quotas to clear, can contain: temporary, persistent, syncable.
		 */
		quotas?: string[];
	}

	interface CommandLine {
		/**
		 * Append a switch (with optional value) to Chromium's command line. Note: This
		 * will not affect process.argv, and is mainly used by developers to control some
		 * low-level Chromium behaviors.
		 */
		appendSwitch: (the_switch: string, value?: string) => void;
		/**
		 * Append an argument to Chromium's command line. The argument will be quoted
		 * correctly. Note: This will not affect process.argv.
		 */
		appendArgument: (value: string) => void;
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
		 * Type of the node the context menu was invoked on. Can be none, image, audio,
		 * video, canvas, file or plugin.
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
		 * Possible values are none, plainText, password, other.
		 */
		inputFieldType: string;
		/**
		 * Input source that invoked the context menu. Can be none, mouse, keyboard, touch
		 * or touchMenu.
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
		companyName?: string;
		/**
		 * URL that crash reports will be sent to as POST.
		 */
		submitURL: string;
		/**
		 * Defaults to app.getName().
		 */
		productName?: string;
		/**
		 * Whether crash reports should be sent to the server Default is true.
		 */
		uploadToServer?: boolean;
		/**
		 * Default is false.
		 */
		ignoreSystemCrashHandler?: boolean;
		/**
		 * An object you can define that will be sent along with the report. Only string
		 * properties are sent correctly. Nested objects are not supported and the property
		 * names and values must be less than 64 characters long.
		 */
		extra?: Extra;
		/**
		 * Directory to store the crashreports temporarily (only used when the crash
		 * reporter is started via process.crashReporter.start).
		 */
		crashesDirectory?: string;
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
		 * The title of the url at text.
		 */
		bookmark?: string;
	}

	interface Details {
		/**
		 * The url to associate the cookie with.
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
		 * The domain of the cookie. Empty by default if omitted.
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

	interface DevToolsExtensions {
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

	interface DidGetRedirectRequestEvent extends Event {
		oldURL: string;
		newURL: string;
		isMainFrame: boolean;
	}

	interface DidGetResponseDetailsEvent extends Event {
		status: boolean;
		newURL: string;
		originalURL: string;
		httpResponseCode: number;
		requestMethod: string;
		referrer: string;
		headers: Headers;
		resourceType: string;
	}

	interface DidNavigateEvent extends Event {
		url: string;
	}

	interface DidNavigateInPageEvent extends Event {
		isMainFrame: boolean;
		url: string;
	}

	interface DisplayBalloonOptions {
		/**
		 * -
		 */
		icon?: NativeImage | string;
		title: string;
		content: string;
	}

	interface Dock {
		/**
		 * When critical is passed, the dock icon will bounce until either the application
		 * becomes active or the request is canceled. When informational is passed, the
		 * dock icon will bounce for one second. However, the request remains active until
		 * either the application becomes active or the request is canceled.
		 */
		bounce: (type?: 'critical' | 'informational') => number;
		/**
		 * Cancel the bounce of id.
		 */
		cancelBounce: (id: number) => void;
		/**
		 * Bounces the Downloads stack if the filePath is inside the Downloads folder.
		 */
		downloadFinished: (filePath: string) => void;
		/**
		 * Sets the string to be displayed in the dock’s badging area.
		 */
		setBadge: (text: string) => void;
		getBadge: () => string;
		/**
		 * Hides the dock icon.
		 */
		hide: () => void;
		/**
		 * Shows the dock icon.
		 */
		show: () => void;
		isVisible: () => boolean;
		/**
		 * Sets the application's dock menu.
		 */
		setMenu: (menu: Menu) => void;
		/**
		 * Sets the image associated with this dock icon.
		 */
		setIcon: (image: NativeImage | string) => void;
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

	interface Extensions {
	}

	interface FeedURLOptions {
		url: string;
		/**
		 * HTTP request headers.
		 */
		headers?: Headers;
		/**
		 * Either json or default, see the README for more information.
		 */
		serverType?: string;
	}

	interface FileIconOptions {
		size: ('small' | 'normal' | 'large');
	}

	interface Filter {
		/**
		 * Retrieves cookies which are associated with url. Empty implies retrieving
		 * cookies of all urls.
		 */
		url?: string;
		/**
		 * Filters cookies by name.
		 */
		name?: string;
		/**
		 * Retrieves cookies whose domains match or are subdomains of domains.
		 */
		domain?: string;
		/**
		 * Retrieves cookies whose path matches path.
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
		 * Whether to search forward or backward, defaults to true.
		 */
		forward?: boolean;
		/**
		 * Whether the operation is first request or a follow up, defaults to false.
		 */
		findNext?: boolean;
		/**
		 * Whether search should be case-sensitive, defaults to false.
		 */
		matchCase?: boolean;
		/**
		 * Whether to look only at the start of words. defaults to false.
		 */
		wordStart?: boolean;
		/**
		 * When combined with wordStart, accepts a match in the middle of a word if the
		 * match begins with an uppercase letter followed by a lowercase or non-letter.
		 * Accepts several other intra-word matches, defaults to false.
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

	interface Header {
		/**
		 * Specify an extra header name.
		 */
		name: string;
	}

	interface Headers {
	}

	interface IgnoreMouseEventsOptions {
		/**
		 * If true, forwards mouse move messages to Chromium, enabling mouse related events
		 * such as mouseleave. Only used when ignore is true. If ignore is false,
		 * forwarding is always disabled regardless of this value.
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

	interface Input {
		/**
		 * Either keyUp or keyDown.
		 */
		type: string;
		/**
		 * Equivalent to .
		 */
		key: string;
		/**
		 * Equivalent to .
		 */
		code: string;
		/**
		 * Equivalent to .
		 */
		isAutoRepeat: boolean;
		/**
		 * Equivalent to .
		 */
		shift: boolean;
		/**
		 * Equivalent to .
		 */
		control: boolean;
		/**
		 * Equivalent to .
		 */
		alt: boolean;
		/**
		 * Equivalent to .
		 */
		meta: boolean;
	}

	interface InterceptBufferProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface InterceptFileProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface InterceptHttpProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface InterceptStreamProtocolRequest {
		url: string;
		headers: Headers;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface InterceptStringProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface IpcMessageEvent extends Event {
		channel: string;
		args: any[];
	}

	interface Item {
		/**
		 * or files Array The path(s) to the file(s) being dragged.
		 */
		file: string;
		/**
		 * The image must be non-empty on macOS.
		 */
		icon: NativeImage;
	}

	interface JumpListSettings {
		/**
		 * The minimum number of items that will be shown in the Jump List (for a more
		 * detailed description of this value see the ).
		 */
		minItems: number;
		/**
		 * Array of JumpListItem objects that correspond to items that the user has
		 * explicitly removed from custom categories in the Jump List. These items must not
		 * be re-added to the Jump List in the call to app.setJumpList(), Windows will not
		 * display any custom category that contains any of the removed items.
		 */
		removedItems: JumpListItem[];
	}

	interface LoadCommitEvent extends Event {
		url: string;
		isMainFrame: boolean;
	}

	interface LoadURLOptions {
		/**
		 * A HTTP Referrer url.
		 */
		httpReferrer?: string;
		/**
		 * A user agent originating the request.
		 */
		userAgent?: string;
		/**
		 * Extra headers separated by "\n"
		 */
		extraHeaders?: string;
		/**
		 * -
		 */
		postData?: UploadRawData[] | UploadFile[] | UploadFileSystem[] | UploadBlob[];
		/**
		 * Base url (with trailing path separator) for files to be loaded by the data url.
		 * This is needed only if the specified url is a data url and needs to load other
		 * files.
		 */
		baseURLForDataURL?: string;
	}

	interface LoginItemSettings {
		options?: Options;
		/**
		 * true if the app is set to open at login.
		 */
		openAtLogin: boolean;
		/**
		 * true if the app is set to open as hidden at login. This setting is not available
		 * on .
		 */
		openAsHidden: boolean;
		/**
		 * true if the app was opened at login automatically. This setting is not available
		 * on .
		 */
		wasOpenedAtLogin: boolean;
		/**
		 * true if the app was opened as a hidden login item. This indicates that the app
		 * should not open any windows at startup. This setting is not available on .
		 */
		wasOpenedAsHidden: boolean;
		/**
		 * true if the app was opened as a login item that should restore the state from
		 * the previous session. This indicates that the app should restore the windows
		 * that were open the last time the app was closed. This setting is not available
		 * on .
		 */
		restoreState: boolean;
	}

	interface LoginItemSettingsOptions {
		/**
		 * The executable path to compare against. Defaults to process.execPath.
		 */
		path?: string;
		/**
		 * The command-line arguments to compare against. Defaults to an empty array.
		 */
		args?: string[];
	}

	interface MenuItemConstructorOptions {
		/**
		 * Will be called with click(menuItem, browserWindow, event) when the menu item is
		 * clicked.
		 */
		click?: (menuItem: MenuItem, browserWindow: BrowserWindow, event: Event) => void;
		/**
		 * Define the action of the menu item, when specified the click property will be
		 * ignored. See .
		 */
		role?: string;
		/**
		 * Can be normal, separator, submenu, checkbox or radio.
		 */
		type?: ('normal' | 'separator' | 'submenu' | 'checkbox' | 'radio');
		label?: string;
		sublabel?: string;
		accelerator?: Accelerator;
		icon?: NativeImage | string;
		/**
		 * If false, the menu item will be greyed out and unclickable.
		 */
		enabled?: boolean;
		/**
		 * If false, the menu item will be entirely hidden.
		 */
		visible?: boolean;
		/**
		 * Should only be specified for checkbox or radio type menu items.
		 */
		checked?: boolean;
		/**
		 * Should be specified for submenu type menu items. If submenu is specified, the
		 * type: 'submenu' can be omitted. If the value is not a then it will be
		 * automatically converted to one using Menu.buildFromTemplate.
		 */
		submenu?: MenuItemConstructorOptions[] | Menu;
		/**
		 * Unique within a single menu. If defined then it can be used as a reference to
		 * this item by the position attribute.
		 */
		id?: string;
		/**
		 * This field allows fine-grained definition of the specific location within a
		 * given menu.
		 */
		position?: string;
	}

	interface MessageBoxOptions {
		/**
		 * Can be "none", "info", "error", "question" or "warning". On Windows, "question"
		 * displays the same icon as "info", unless you set an icon using the "icon"
		 * option. On macOS, both "warning" and "error" display the same warning icon.
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
		 * If provided, the message box will include a checkbox with the given label. The
		 * checkbox state can be inspected only when using callback.
		 */
		checkboxLabel?: string;
		/**
		 * Initial checked state of the checkbox. false by default.
		 */
		checkboxChecked?: boolean;
		icon?: NativeImage;
		/**
		 * The index of the button to be used to cancel the dialog, via the Esc key. By
		 * default this is assigned to the first button with "cancel" or "no" as the label.
		 * If no such labeled buttons exist and this option is not set, 0 will be used as
		 * the return value or callback response. This option is ignored on Windows.
		 */
		cancelId?: number;
		/**
		 * On Windows Electron will try to figure out which one of the buttons are common
		 * buttons (like "Cancel" or "Yes"), and show the others as command links in the
		 * dialog. This can make the dialog appear in the style of modern Windows apps. If
		 * you don't like this behavior, you can set noLink to true.
		 */
		noLink?: boolean;
		/**
		 * Normalize the keyboard access keys across platforms. Default is false. Enabling
		 * this assumes & is used in the button labels for the placement of the keyboard
		 * shortcut access key and labels will be converted so they work correctly on each
		 * platform, & characters are removed on macOS, converted to _ on Linux, and left
		 * untouched on Windows. For example, a button label of Vie&w will be converted to
		 * Vie_w on Linux and View on macOS and can be selected via Alt-W on Windows and
		 * Linux.
		 */
		normalizeAccessKeys?: boolean;
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
		 * The options which should be used for creating the new .
		 */
		options: Options;
	}

	interface NotificationConstructorOptions {
		/**
		 * A title for the notification, which will be shown at the top of the notification
		 * window when it is shown.
		 */
		title: string;
		/**
		 * A subtitle for the notification, which will be displayed below the title.
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
		icon?: string | NativeImage;
		/**
		 * Whether or not to add an inline reply option to the notification.
		 */
		hasReply?: boolean;
		/**
		 * The placeholder to write in the inline reply input field.
		 */
		replyPlaceholder?: string;
		/**
		 * The name of the sound file to play when the notification is shown.
		 */
		sound?: string;
		/**
		 * Actions to add to the notification. Please read the available actions and
		 * limitations in the NotificationAction documentation.
		 */
		actions?: NotificationAction[];
		/**
		 * A custom title for the close button of an alert. An empty string will cause the
		 * default localized text to be used.
		 */
		closeButtonText?: string;
	}

	interface OnBeforeRedirectDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		redirectURL: string;
		statusCode: number;
		/**
		 * The server IP address that the request was actually sent to.
		 */
		ip?: string;
		fromCache: boolean;
		responseHeaders: ResponseHeaders;
	}

	interface OnBeforeRedirectFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnBeforeRequestDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		uploadData: UploadData[];
	}

	interface OnBeforeRequestFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnBeforeSendHeadersFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnCompletedDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		responseHeaders: ResponseHeaders;
		fromCache: boolean;
		statusCode: number;
		statusLine: string;
	}

	interface OnCompletedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnErrorOccurredDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		fromCache: boolean;
		/**
		 * The error description.
		 */
		error: string;
	}

	interface OnErrorOccurredFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnHeadersReceivedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnResponseStartedDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		responseHeaders: ResponseHeaders;
		/**
		 * Indicates whether the response was fetched from disk cache.
		 */
		fromCache: boolean;
		statusCode: number;
		statusLine: string;
	}

	interface OnResponseStartedFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OnSendHeadersDetails {
		id: number;
		url: string;
		method: string;
		webContentsId?: number;
		resourceType: string;
		timestamp: number;
		requestHeaders: RequestHeaders;
	}

	interface OnSendHeadersFilter {
		/**
		 * Array of URL patterns that will be used to filter out the requests that do not
		 * match the URL patterns.
		 */
		urls: string[];
	}

	interface OpenDevToolsOptions {
		/**
		 * Opens the devtools with specified dock state, can be right, bottom, undocked,
		 * detach. Defaults to last used dock state. In undocked mode it's possible to dock
		 * back. In detach mode it's not.
		 */
		mode: ('right' | 'bottom' | 'undocked' | 'detach');
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
		 */
		message?: string;
		/**
		 * Create when packaged for the Mac App Store.
		 */
		securityScopedBookmarks?: boolean;
	}

	interface OpenExternalOptions {
		/**
		 * true to bring the opened application to the foreground. The default is true.
		 */
		activate: boolean;
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
		 * Specify the screen type to emulate (default: desktop):
		 */
		screenPosition: ('desktop' | 'mobile');
		/**
		 * Set the emulated screen size (screenPosition == mobile).
		 */
		screenSize: Size;
		/**
		 * Position the view on the screen (screenPosition == mobile) (default: {x: 0, y:
		 * 0}).
		 */
		viewPosition: Point;
		/**
		 * Set the device scale factor (if zero defaults to original device scale factor)
		 * (default: 0).
		 */
		deviceScaleFactor: number;
		/**
		 * Set the emulated view size (empty means no override)
		 */
		viewSize: Size;
		/**
		 * Scale of emulated view inside available space (not in fit to view mode)
		 * (default: 1).
		 */
		scale: number;
	}

	interface Payment {
		productIdentifier: string;
		quantity: number;
	}

	interface PermissionRequestHandlerDetails {
		/**
		 * The url of the openExternal request.
		 */
		externalURL: string;
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
		 * Default is the current mouse cursor position. Must be declared if y is declared.
		 */
		x?: number;
		/**
		 * Default is the current mouse cursor position. Must be declared if x is declared.
		 */
		y?: number;
		/**
		 * The index of the menu item to be positioned under the mouse cursor at the
		 * specified coordinates. Default is -1.
		 */
		positioningItem?: number;
		/**
		 * Called when menu is closed.
		 */
		callback?: () => void;
	}

	interface PrintOptions {
		/**
		 * Don't ask user for print settings. Default is false.
		 */
		silent?: boolean;
		/**
		 * Also prints the background color and image of the web page. Default is false.
		 */
		printBackground?: boolean;
		/**
		 * Set the printer device name to use. Default is ''.
		 */
		deviceName?: string;
	}

	interface PrintToPDFOptions {
		/**
		 * Specifies the type of margins to use. Uses 0 for default margin, 1 for no
		 * margin, and 2 for minimum margin.
		 */
		marginsType?: number;
		/**
		 * Specify page size of the generated PDF. Can be A3, A4, A5, Legal, Letter,
		 * Tabloid or an Object containing height and width in microns.
		 */
		pageSize?: string;
		/**
		 * Whether to print CSS backgrounds.
		 */
		printBackground?: boolean;
		/**
		 * Whether to print selection only.
		 */
		printSelectionOnly?: boolean;
		/**
		 * true for landscape, false for portrait.
		 */
		landscape?: boolean;
	}

	interface ProcessMemoryInfo {
		/**
		 * The amount of memory currently pinned to actual physical RAM.
		 */
		workingSetSize: number;
		/**
		 * The maximum amount of memory that has ever been pinned to actual physical RAM.
		 */
		peakWorkingSetSize: number;
		/**
		 * The amount of memory not shared by other processes, such as JS heap or HTML
		 * content.
		 */
		privateBytes: number;
		/**
		 * The amount of memory shared between processes, typically memory consumed by the
		 * Electron code itself.
		 */
		sharedBytes: number;
	}

	interface ProgressBarOptions {
		/**
		 * Mode for the progress bar. Can be none, normal, indeterminate, error or paused.
		 */
		mode: ('none' | 'normal' | 'indeterminate' | 'error' | 'paused');
	}

	interface Provider {
		/**
		 * Returns Boolean.
		 */
		spellCheck: (text: string) => void;
	}

	interface ReadBookmark {
		title: string;
		url: string;
	}

	interface RedirectRequest {
		url: string;
		method: string;
		session?: Session;
		uploadData?: UploadData;
	}

	interface RegisterBufferProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface RegisterFileProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface RegisterHttpProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface RegisterStandardSchemesOptions {
		/**
		 * true to register the scheme as secure. Default false.
		 */
		secure?: boolean;
	}

	interface RegisterStreamProtocolRequest {
		url: string;
		headers: Headers;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface RegisterStringProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData: UploadData[];
	}

	interface RegisterURLSchemeAsPrivilegedOptions {
		/**
		 * Default true.
		 */
		secure?: boolean;
		/**
		 * Default true.
		 */
		bypassCSP?: boolean;
		/**
		 * Default true.
		 */
		allowServiceWorkers?: boolean;
		/**
		 * Default true.
		 */
		supportFetchAPI?: boolean;
		/**
		 * Default true.
		 */
		corsEnabled?: boolean;
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
		 * The desired quality of the resize image. Possible values are good, better or
		 * best. The default is best. These values express a desired quality/speed
		 * tradeoff. They are translated into an algorithm-specific method that depends on
		 * the capabilities (CPU, GPU) of the underlying platform. It is possible for all
		 * three methods to be mapped to the same algorithm on a given platform.
		 */
		quality?: string;
	}

	interface ResourceUsage {
		images: MemoryUsageDetails;
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
		selectionArea: SelectionArea;
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
		 */
		message?: string;
		/**
		 * Custom label for the text displayed in front of the filename text field.
		 */
		nameFieldLabel?: string;
		/**
		 * Show the tags input box, defaults to true.
		 */
		showsTagField?: boolean;
		/**
		 * Create a when packaged for the Mac App Store. If this option is enabled and the
		 * file doesn't already exist a blank file will be created at the chosen path.
		 */
		securityScopedBookmarks?: boolean;
	}

	interface Settings {
		/**
		 * true to open the app at login, false to remove the app as a login item. Defaults
		 * to false.
		 */
		openAtLogin?: boolean;
		/**
		 * true to open the app as hidden. Defaults to false. The user can edit this
		 * setting from the System Preferences so
		 * app.getLoginItemStatus().wasOpenedAsHidden should be checked when the app is
		 * opened to know the current value. This setting is not available on .
		 */
		openAsHidden?: boolean;
		/**
		 * The executable to launch at login. Defaults to process.execPath.
		 */
		path?: string;
		/**
		 * The command-line arguments to pass to the executable. Defaults to an empty
		 * array. Take care to wrap paths in quotes.
		 */
		args?: string[];
	}

	interface SizeOptions {
		/**
		 * true to make the webview container automatically resize within the bounds
		 * specified by the attributes normal, min and max.
		 */
		enableAutoSize?: boolean;
		/**
		 * Normal size of the page. This can be used in combination with the attribute to
		 * manually resize the webview guest contents.
		 */
		normal?: Size;
		/**
		 * Minimum size of the page. This can be used in combination with the attribute to
		 * manually resize the webview guest contents.
		 */
		min?: Size;
		/**
		 * Maximium size of the page. This can be used in combination with the attribute to
		 * manually resize the webview guest contents.
		 */
		max?: Size;
	}

	interface SourcesOptions {
		/**
		 * An array of Strings that lists the types of desktop sources to be captured,
		 * available types are screen and window.
		 */
		types: string[];
		/**
		 * The size that the media source thumbnail should be scaled to. Default is 150 x
		 * 150.
		 */
		thumbnailSize?: Size;
	}

	interface StartMonitoringOptions {
		categoryFilter: string;
		traceOptions: string;
	}

	interface StartRecordingOptions {
		categoryFilter: string;
		traceOptions: string;
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
		 */
		swapTotal: number;
		/**
		 * The free amount of swap memory in Kilobytes available to the system.
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
		 * Button background color in hex format, i.e #ABCDEF.
		 */
		backgroundColor?: string;
		/**
		 * Button icon.
		 */
		icon?: NativeImage;
		/**
		 * Can be left, right or overlay.
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
		 * The selected hex color in the picker, i.e #ABCDEF.
		 */
		selectedColor?: string;
		/**
		 * Function to call when a color is selected.
		 */
		change?: (color: string) => void;
	}

	interface TouchBarConstructorOptions {
		items: Array<TouchBarButton | TouchBarColorPicker | TouchBarGroup | TouchBarLabel | TouchBarPopover | TouchBarScrubber | TouchBarSegmentedControl | TouchBarSlider | TouchBarSpacer>;
		escapeItem?: TouchBarButton | TouchBarColorPicker | TouchBarGroup | TouchBarLabel | TouchBarPopover | TouchBarScrubber | TouchBarSegmentedControl | TouchBarSlider | TouchBarSpacer | null;
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
		 * Hex color of text, i.e #ABCDEF.
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
		 * true to display a close button on the left of the popover, false to not show it.
		 * Default is true.
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
		select: (selectedIndex: number) => void;
		/**
		 * Called when the user taps any item.
		 */
		highlight: (highlightedIndex: number) => void;
		/**
		 * Selected item style. Defaults to null.
		 */
		selectedStyle: string;
		/**
		 * Selected overlay item style. Defaults to null.
		 */
		overlayStyle: string;
		/**
		 * Defaults to false.
		 */
		showArrowButtons: boolean;
		/**
		 * Defaults to free.
		 */
		mode: string;
		/**
		 * Defaults to true.
		 */
		continuous: boolean;
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
		change: (selectedIndex: number, isSelected: boolean) => void;
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

	interface UpdateTargetUrlEvent extends Event {
		url: string;
	}

	interface Versions {
		/**
		 * A String representing Chrome's version string.
		 */
		chrome?: string;
		/**
		 * A String representing Electron's version string.
		 */
		electron?: string;
	}

	interface WillNavigateEvent extends Event {
		url: string;
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

	interface Extra {
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
		selectionArea: SelectionArea;
		finalUpdate: boolean;
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

	interface Options {
	}

	interface RequestHeaders {
	}

	interface ResponseHeaders {
	}

	interface SelectionArea {
	}

	interface WebPreferences {
		/**
		 * Whether to enable DevTools. If it is set to false, can not use
		 * BrowserWindow.webContents.openDevTools() to open DevTools. Default is true.
		 */
		devTools?: boolean;
		/**
		 * Whether node integration is enabled. Default is true.
		 */
		nodeIntegration?: boolean;
		/**
		 * Whether node integration is enabled in web workers. Default is false. More about
		 * this can be found in .
		 */
		nodeIntegrationInWorker?: boolean;
		/**
		 * Specifies a script that will be loaded before other scripts run in the page.
		 * This script will always have access to node APIs no matter whether node
		 * integration is turned on or off. The value should be the absolute file path to
		 * the script. When node integration is turned off, the preload script can
		 * reintroduce Node global symbols back to the global scope. See example .
		 */
		preload?: string;
		/**
		 * If set, this will sandbox the renderer associated with the window, making it
		 * compatible with the Chromium OS-level sandbox and disabling the Node.js engine.
		 * This is not the same as the nodeIntegration option and the APIs available to the
		 * preload script are more limited. Read more about the option . This option is
		 * currently experimental and may change or be removed in future Electron releases.
		 */
		sandbox?: boolean;
		/**
		 * Sets the session used by the page. Instead of passing the Session object
		 * directly, you can also choose to use the partition option instead, which accepts
		 * a partition string. When both session and partition are provided, session will
		 * be preferred. Default is the default session.
		 */
		session?: Session;
		/**
		 * Sets the session used by the page according to the session's partition string.
		 * If partition starts with persist:, the page will use a persistent session
		 * available to all pages in the app with the same partition. If there is no
		 * persist: prefix, the page will use an in-memory session. By assigning the same
		 * partition, multiple pages can share the same session. Default is the default
		 * session.
		 */
		partition?: string;
		/**
		 * When specified, web pages with the same affinity will run in the same renderer
		 * process. Note that due to reusing the renderer process, certain webPreferences
		 * options will also be shared between the web pages even when you specified
		 * different values for them, including but not limited to preload, sandbox and
		 * nodeIntegration. So it is suggested to use exact same webPreferences for web
		 * pages with the same affinity.
		 */
		affinity?: string;
		/**
		 * The default zoom factor of the page, 3.0 represents 300%. Default is 1.0.
		 */
		zoomFactor?: number;
		/**
		 * Enables JavaScript support. Default is true.
		 */
		javascript?: boolean;
		/**
		 * When false, it will disable the same-origin policy (usually using testing
		 * websites by people), and set allowRunningInsecureContent to true if this options
		 * has not been set by user. Default is true.
		 */
		// webSecurity?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Allow an https page to run JavaScript, CSS or plugins from http URLs. Default is
		 * false.
		 */
		// allowRunningInsecureContent?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Enables image support. Default is true.
		 */
		images?: boolean;
		/**
		 * Make TextArea elements resizable. Default is true.
		 */
		textAreasAreResizable?: boolean;
		/**
		 * Enables WebGL support. Default is true.
		 */
		webgl?: boolean;
		/**
		 * Enables WebAudio support. Default is true.
		 */
		webaudio?: boolean;
		/**
		 * Whether plugins should be enabled. Default is false.
		 */
		plugins?: boolean;
		/**
		 * Enables Chromium's experimental features. Default is false.
		 */
		// experimentalFeatures?: boolean; ### VSCODE CHANGE (https://github.com/electron/electron/blob/master/docs/tutorial/security.md) ###
		/**
		 * Enables Chromium's experimental canvas features. Default is false.
		 */
		experimentalCanvasFeatures?: boolean;
		/**
		 * Enables scroll bounce (rubber banding) effect on macOS. Default is false.
		 */
		scrollBounce?: boolean;
		/**
		 * A list of feature strings separated by ,, like CSSVariables,KeyboardEventKey to
		 * enable. The full list of supported feature strings can be found in the file.
		 */
		blinkFeatures?: string;
		/**
		 * A list of feature strings separated by ,, like CSSVariables,KeyboardEventKey to
		 * disable. The full list of supported feature strings can be found in the file.
		 */
		disableBlinkFeatures?: string;
		/**
		 * Sets the default font for the font-family.
		 */
		defaultFontFamily?: DefaultFontFamily;
		/**
		 * Defaults to 16.
		 */
		defaultFontSize?: number;
		/**
		 * Defaults to 13.
		 */
		defaultMonospaceFontSize?: number;
		/**
		 * Defaults to 0.
		 */
		minimumFontSize?: number;
		/**
		 * Defaults to ISO-8859-1.
		 */
		defaultEncoding?: string;
		/**
		 * Whether to throttle animations and timers when the page becomes background. This
		 * also affects the . Defaults to true.
		 */
		backgroundThrottling?: boolean;
		/**
		 * Whether to enable offscreen rendering for the browser window. Defaults to false.
		 * See the for more details.
		 */
		offscreen?: boolean;
		/**
		 * Whether to run Electron APIs and the specified preload script in a separate
		 * JavaScript context. Defaults to false. The context that the preload script runs
		 * in will still have full access to the document and window globals but it will
		 * use its own set of JavaScript builtins (Array, Object, JSON, etc.) and will be
		 * isolated from any changes made to the global environment by the loaded page. The
		 * Electron API will only be available in the preload script and not the loaded
		 * page. This option should be used when loading potentially untrusted remote
		 * content to ensure the loaded content cannot tamper with the preload script and
		 * any Electron APIs being used. This option uses the same technique used by . You
		 * can access this context in the dev tools by selecting the 'Electron Isolated
		 * Context' entry in the combo box at the top of the Console tab. This option is
		 * currently experimental and may change or be removed in future Electron releases.
		 */
		contextIsolation?: boolean;
		/**
		 * Whether to use native window.open(). Defaults to false. This option is currently
		 * experimental.
		 */
		nativeWindowOpen?: boolean;
		/**
		 * Whether to enable the . Defaults to the value of the nodeIntegration option. The
		 * preload script configured for the <webview> will have node integration enabled
		 * when it is executed so you should ensure remote/untrusted content is not able to
		 * create a <webview> tag with a possibly malicious preload script. You can use the
		 * will-attach-webview event on to strip away the preload script and to validate or
		 * alter the <webview>'s initial settings.
		 */
		webviewTag?: boolean;
		/**
		 * A list of strings that will be appended to process.argv in the renderer process
		 * of this app. Useful for passing small bits of data down to renderer process
		 * preload scripts.
		 */
		additionArguments?: string[];
	}

	interface DefaultFontFamily {
		/**
		 * Defaults to Times New Roman.
		 */
		standard?: string;
		/**
		 * Defaults to Times New Roman.
		 */
		serif?: string;
		/**
		 * Defaults to Arial.
		 */
		sansSerif?: string;
		/**
		 * Defaults to Courier New.
		 */
		monospace?: string;
		/**
		 * Defaults to Script.
		 */
		cursive?: string;
		/**
		 * Defaults to Impact.
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
	interface Process extends EventEmitter {

		// Docs: http://electron.atom.io/docs/api/process

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
		getCPUUsage(): Electron.CPUUsage;
		getIOCounters(): Electron.IOCounters;
		/**
		 * Returns an object giving memory usage statistics about the current process. Note
		 * that all statistics are reported in Kilobytes.
		 */
		getProcessMemoryInfo(): Electron.ProcessMemoryInfo;
		/**
		 * Returns an object giving memory usage statistics about the entire system. Note
		 * that all statistics are reported in Kilobytes.
		 */
		getSystemMemoryInfo(): Electron.SystemMemoryInfo;
		/**
		 * Causes the main thread of the current process hang.
		 */
		hang(): void;
		/**
		 * Sets the file descriptor soft limit to maxDescriptors or the OS hard limit,
		 * whichever is lower for the current process.
		 */
		setFdLimit(maxDescriptors: number): void;
		/**
		 * A Boolean. When app is started by being passed as parameter to the default app,
		 * this property is true in the main process, otherwise it is undefined.
		 */
		defaultApp?: boolean;
		/**
		 * A Boolean. For Mac App Store build, this property is true, for other builds it
		 * is undefined.
		 */
		mas?: boolean;
		/**
		 * A Boolean that controls ASAR support inside your application. Setting this to
		 * true will disable the support for asar archives in Node's built-in modules.
		 */
		noAsar?: boolean;
		/**
		 * A Boolean that controls whether or not deprecation warnings are printed to
		 * stderr. Setting this to true will silence deprecation warnings. This property is
		 * used instead of the --no-deprecation command line flag.
		 */
		noDeprecation?: boolean;
		/**
		 * A String representing the path to the resources directory.
		 */
		resourcesPath?: string;
		/**
		 * A Boolean that controls whether or not deprecation warnings will be thrown as
		 * exceptions. Setting this to true will throw errors for deprecations. This
		 * property is used instead of the --throw-deprecation command line flag.
		 */
		throwDeprecation?: boolean;
		/**
		 * A Boolean that controls whether or not deprecations printed to stderr include
		 * their stack trace. Setting this to true will print stack traces for
		 * deprecations. This property is instead of the --trace-deprecation command line
		 * flag.
		 */
		traceDeprecation?: boolean;
		/**
		 * A Boolean that controls whether or not process warnings printed to stderr
		 * include their stack trace. Setting this to true will print stack traces for
		 * process warnings (including deprecations). This property is instead of the
		 * --trace-warnings command line flag.
		 */
		traceProcessWarnings?: boolean;
		/**
		 * A String representing the current process's type, can be "browser" (i.e. main
		 * process) or "renderer".
		 */
		type?: string;
		/**
		 * A Boolean. If the app is running as a Windows Store app (appx), this property is
		 * true, for otherwise it is undefined.
		 */
		windowsStore?: boolean;
	}
	interface ProcessVersions {
		electron: string;
		chrome: string;
	}
}