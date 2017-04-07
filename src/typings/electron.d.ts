// Type definitions for Electron v1.4.6
// Project: http://electron.atom.io/
// Definitions by: jedmao <https://github.com/jedmao/>, rhysd <https://rhysd.github.io>, Milan Burda <https://github.com/miniak/>, aliib <https://github.com/aliib>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

/// <reference path="./node.d.ts" />

declare namespace Electron {

	interface Event {
		preventDefault: Function;
		sender: NodeJS.EventEmitter;
	}

	type Point = {
		x: number;
		y: number;
	}

	type Size = {
		width: number;
		height: number;
	}

	type Rectangle = {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface Destroyable {
		/**
		 * Destroys the object.
		 */
		destroy(): void;
		/**
		 * @returns Whether the object is destroyed.
		 */
		isDestroyed(): boolean;
	}

	// https://github.com/electron/electron/blob/master/docs/api/app.md

	/**
	 * The app module is responsible for controlling the application's lifecycle.
	 */
	interface App extends NodeJS.EventEmitter {
		/**
		 * Emitted when the application has finished basic startup.
		 * On Windows and Linux, the will-finish-launching event
		 * is the same as the ready event; on macOS, this event represents
		 * the applicationWillFinishLaunching notification of NSApplication.
		 * You would usually set up listeners for the open-file and open-url events here,
		 * and start the crash reporter and auto updater.
		 *
		 * In most cases, you should just do everything in the ready event handler.
		 */
		on(event: 'will-finish-launching', listener: Function): this;
		/**
		 * Emitted when Electron has finished initialization.
		 */
		on(event: 'ready', listener: (event: Event, launchInfo: Object) => void): this;
		/**
		 * Emitted when all windows have been closed.
		 *
		 * If you do not subscribe to this event and all windows are closed,
		 * the default behavior is to quit the app; however, if you subscribe,
		 * you control whether the app quits or not.
		 * If the user pressed Cmd + Q, or the developer called app.quit(),
		 * Electron will first try to close all the windows and then emit the will-quit event,
		 * and in this case the window-all-closed event would not be emitted.
		 */
		on(event: 'window-all-closed', listener: Function): this;
		/**
		 * Emitted before the application starts closing its windows.
		 * Calling event.preventDefault() will prevent the default behaviour, which is terminating the application.
		 */
		on(event: 'before-quit', listener: (event: Event) => void): this;
		/**
		 * Emitted when all windows have been closed and the application will quit.
		 * Calling event.preventDefault() will prevent the default behaviour, which is terminating the application.
		 */
		on(event: 'will-quit', listener: (event: Event) => void): this;
		/**
		 * Emitted when the application is quitting.
		 */
		on(event: 'quit', listener: (event: Event, exitCode: number) => void): this;
		/**
		 * Emitted when the user wants to open a file with the application.
		 * The open-file event is usually emitted when the application is already open
		 * and the OS wants to reuse the application to open the file.
		 * open-file is also emitted when a file is dropped onto the dock and the application
		 * is not yet running. Make sure to listen for the open-file event very early
		 * in your application startup to handle this case (even before the ready event is emitted).
		 *
		 * You should call event.preventDefault() if you want to handle this event.
		 *
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'open-file', listener: (event: Event, url: string) => void): this;
		/**
		 * Emitted when the user wants to open a URL with the application.
		 * The URL scheme must be registered to be opened by your application.
		 *
		 * You should call event.preventDefault() if you want to handle this event.
		 *
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'open-url', listener: (event: Event, url: string) => void): this;
		/**
		 * Emitted when the application is activated, which usually happens when clicks on the applications’s dock icon.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'activate', listener: Function): this;
		/**
		 * Emitted during Handoff when an activity from a different device wants to be resumed.
		 * You should call event.preventDefault() if you want to handle this event.
		 */
		on(event: 'continue-activity', listener: (event: Event, type: string, userInfo: Object) => void): this;
		/**
		 * Emitted when a browserWindow gets blurred.
		 */
		on(event: 'browser-window-blur', listener: (event: Event, browserWindow: BrowserWindow) => void): this;
		/**
		 * Emitted when a browserWindow gets focused.
		 */
		on(event: 'browser-window-focus', listener: (event: Event, browserWindow: BrowserWindow) => void): this;
		/**
		 * Emitted when a new browserWindow is created.
		 */
		on(event: 'browser-window-created', listener: (event: Event, browserWindow: BrowserWindow) => void): this;
		/**
		 * Emitted when a new webContents is created.
		 */
		on(event: 'web-contents-created', listener: (event: Event, webContents: WebContents) => void): this;
		/**
		 * Emitted when failed to verify the certificate for url, to trust the certificate
		 * you should prevent the default behavior with event.preventDefault() and call callback(true).
		 */
		on(event: 'certificate-error', listener: (event: Event,
			webContents: WebContents,
			url: string,
			error: string,
			certificate: Certificate,
			callback: (trust: boolean) => void
		) => void): this;
		/**
		 * Emitted when a client certificate is requested.
		 *
		 * The url corresponds to the navigation entry requesting the client certificate
		 * and callback needs to be called with an entry filtered from the list.
		 * Using event.preventDefault() prevents the application from using the first certificate from the store.
		 */
		on(event: 'select-client-certificate', listener: (event: Event,
			webContents: WebContents,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void
		) => void): this;
		/**
		 * Emitted when webContents wants to do basic auth.
		 *
		 * The default behavior is to cancel all authentications, to override this
		 * you should prevent the default behavior with event.preventDefault()
		 * and call callback(username, password) with the credentials.
		 */
		on(event: 'login', listener: (event: Event,
			webContents: WebContents,
			request: LoginRequest,
			authInfo: LoginAuthInfo,
			callback: (username: string, password: string) => void
		) => void): this;
		/**
		 * Emitted when the gpu process crashes.
		 */
		on(event: 'gpu-process-crashed', listener: (event: Event, killed: boolean) => void): this;
		/**
		 * Emitted when Chrome's accessibility support changes.
		 *
		 * Note: This API is only available on macOS and Windows.
		 */
		on(event: 'accessibility-support-changed', listener: (event: Event, accessibilitySupportEnabled: boolean) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * Try to close all windows. The before-quit event will first be emitted.
		 * If all windows are successfully closed, the will-quit event will be emitted
		 * and by default the application would be terminated.
		 *
		 * This method guarantees all beforeunload and unload handlers are correctly
		 * executed. It is possible that a window cancels the quitting by returning
		 * false in beforeunload handler.
		 */
		quit(): void;
		/**
		 * Exits immediately with exitCode.
		 * All windows will be closed immediately without asking user
		 * and the before-quit and will-quit events will not be emitted.
		 */
		exit(exitCode?: number): void;
		/**
		 * Relaunches the app when current instance exits.
		 *
		 * By default the new instance will use the same working directory
		 * and command line arguments with current instance.
		 * When args is specified, the args will be passed as command line arguments instead.
		 * When execPath is specified, the execPath will be executed for relaunch instead of current app.
		 *
		 * Note that this method does not quit the app when executed, you have to call app.quit
		 * or app.exit after calling app.relaunch to make the app restart.
		 *
		 * When app.relaunch is called for multiple times, multiple instances
		 * will be started after current instance exited.
		 */
		relaunch(options?: {
			args?: string[],
			execPath?: string
		}): void;
		/**
		 * @returns Whether Electron has finished initializing.
		 */
		isReady(): boolean;
		/**
		 * On Linux, focuses on the first visible window.
		 * On macOS, makes the application the active app.
		 * On Windows, focuses on the application’s first window.
		 */
		focus(): void;
		/**
		 * Hides all application windows without minimizing them.
		 * Note: This is only implemented on macOS.
		 */
		hide(): void;
		/**
		 * Shows application windows after they were hidden. Does not automatically focus them.
		 * Note: This is only implemented on macOS.
		 */
		show(): void;
		/**
		 * Returns the current application directory.
		 */
		getAppPath(): string;
		/**
		 * @returns The path to a special directory or file associated with name.
		 * On failure an Error would throw.
		 */
		getPath(name: AppPathName): string;
		/**
		 * Overrides the path to a special directory or file associated with name.
		 * If the path specifies a directory that does not exist, the directory will
		 * be created by this method. On failure an Error would throw.
		 *
		 * You can only override paths of names defined in app.getPath.
		 *
		 * By default web pages' cookies and caches will be stored under userData
		 * directory, if you want to change this location, you have to override the
		 * userData path before the ready event of app module gets emitted.
		 */
		setPath(name: AppPathName, path: string): void;
		/**
		 * @returns The version of loaded application, if no version is found in
		 * application's package.json, the version of current bundle or executable.
		 */
		getVersion(): string;
		/**
		 * @returns The current application's name, the name in package.json would be used.
		 * Usually the name field of package.json is a short lowercased name, according to
		 * the spec of npm modules. So usually you should also specify a productName field,
		 * which is your application's full capitalized name, and it will be preferred over
		 * name by Electron.
		 */
		getName(): string;
		/**
		 * Overrides the current application's name.
		 */
		setName(name: string): void;
		/**
		  * @returns The current application locale.
		  */
		getLocale(): string;
		/**
		 * Adds path to recent documents list.
		 *
		 * This list is managed by the system, on Windows you can visit the list from
		 * task bar, and on macOS you can visit it from dock menu.
		 *
		 * Note: This is only implemented on macOS and Windows.
		 */
		addRecentDocument(path: string): void;
		/**
		 * Clears the recent documents list.
		 *
		 * Note: This is only implemented on macOS and Windows.
		 */
		clearRecentDocuments(): void;
		/**
		 * Sets the current executable as the default handler for a protocol (aka URI scheme).
		 * Once registered, all links with your-protocol:// will be opened with the current executable.
		 * The whole link, including protocol, will be passed to your application as a parameter.
		 *
		 * On Windows you can provide optional parameters path, the path to your executable,
		 * and args, an array of arguments to be passed to your executable when it launches.
		 *
		 * @param protocol The name of your protocol, without ://.
		 * @param path Defaults to process.execPath.
		 * @param args Defaults to an empty array.
		 *
		 * Note: This is only implemented on macOS and Windows.
		 *       On macOS, you can only register protocols that have been added to your app's info.plist.
		 */
		setAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * Removes the current executable as the default handler for a protocol (aka URI scheme).
		 *
		 * @param protocol The name of your protocol, without ://.
		 * @param path Defaults to process.execPath.
		 * @param args Defaults to an empty array.
		 *
		 * Note: This is only implemented on macOS and Windows.
		 */
		removeAsDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * @param protocol The name of your protocol, without ://.
		 * @param path Defaults to process.execPath.
		 * @param args Defaults to an empty array.
		 *
		 * @returns Whether the current executable is the default handler for a protocol (aka URI scheme).
		 *
		 * Note: This is only implemented on macOS and Windows.
		 */
		isDefaultProtocolClient(protocol: string, path?: string, args?: string[]): boolean;
		/**
		 * Adds tasks to the Tasks category of JumpList on Windows.
		 *
		 * Note: This API is only available on Windows.
		 */
		setUserTasks(tasks: Task[]): boolean;
		/**
		 * Note: This API is only available on Windows.
		 */
		getJumpListSettings(): JumpListSettings;
		/**
		 * Sets or removes a custom Jump List for the application.
		 *
		 * If categories is null the previously set custom Jump List (if any) will be replaced
		 * by the standard Jump List for the app (managed by Windows).
		 *
		 * Note: This API is only available on Windows.
		 */
		setJumpList(categories: JumpListCategory[]): SetJumpListResult;
		/**
		 * This method makes your application a Single Instance Application instead of allowing
		 * multiple instances of your app to run, this will ensure that only a single instance
		 * of your app is running, and other instances signal this instance and exit.
		 */
		makeSingleInstance(callback: (args: string[], workingDirectory: string) => void): boolean;
		/**
		 * Releases all locks that were created by makeSingleInstance. This will allow
		 * multiple instances of the application to once again run side by side.
		 */
		releaseSingleInstance(): void;
		/**
		 * Creates an NSUserActivity and sets it as the current activity.
		 * The activity is eligible for Handoff to another device afterward.
		 *
		 * @param type Uniquely identifies the activity. Maps to NSUserActivity.activityType.
		 * @param userInfo App-specific state to store for use by another device.
		 * @param webpageURL The webpage to load in a browser if no suitable app is
		 * 					 installed on the resuming device. The scheme must be http or https.
		 *
		 * Note: This API is only available on macOS.
		 */
		setUserActivity(type: string, userInfo: Object, webpageURL?: string): void;
		/**
		 * @returns The type of the currently running activity.
		 *
		 * Note: This API is only available on macOS.
		 */
		getCurrentActivityType(): string;
		/**
		 * Changes the Application User Model ID to id.
		 *
		 * Note: This is only implemented on Windows.
		 */
		setAppUserModelId(id: string): void;
		/**
		 * Imports the certificate in pkcs12 format into the platform certificate store.
		 * @param callback Called with the result of import operation, a value of 0 indicates success
		 * while any other value indicates failure according to chromium net_error_list.
		 *
		 * Note: This API is only available on Linux.
		 */
		importCertificate(options: ImportCertificateOptions, callback: (result: number) => void): void;
		/**
		 * Disables hardware acceleration for current app.
		 * This method can only be called before app is ready.
		 */
		disableHardwareAcceleration(): void;
		/**
		 * @returns whether current desktop environment is Unity launcher. (Linux)
		 *
		 * Note: This API is only available on Linux.
		 */
		isUnityRunning(): boolean;
		/**
		 * Returns a Boolean, true if Chrome's accessibility support is enabled, false otherwise.
		 * This API will return true if the use of assistive technologies, such as screen readers,
		 * has been detected.
		 * See https://www.chromium.org/developers/design-documents/accessibility for more details.
		 *
		 * Note: This API is only available on macOS and Windows.
		 */
		isAccessibilitySupportEnabled(): boolean;
		/**
		 * @returns an Object with the login item settings of the app.
		 *
		 * Note: This API is only available on macOS and Windows.
		 */
		getLoginItemSettings(): LoginItemSettings;
		/**
		 * Set the app's login item settings.
		 *
		 * Note: This API is only available on macOS and Windows.
		 */
		setLoginItemSettings(settings: LoginItemSettings): void;
		/**
		 * Set the about panel options. This will override the values defined in the app's .plist file.
		 * See the Apple docs for more details.
		 *
		 * Note: This API is only available on macOS.
		 */
		setAboutPanelOptions(options: AboutPanelOptions): void;
		commandLine: CommandLine;
		/**
		 * Note: This API is only available on macOS.
		 */
		dock: Dock;
	}

	type AppPathName = 'home' | 'appData' | 'userData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'pepperFlashSystemPlugin';

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

	interface CommandLine {
		/**
		 * Append a switch [with optional value] to Chromium's command line.
		 *
		 * Note: This will not affect process.argv, and is mainly used by developers
		 * to control some low-level Chromium behaviors.
		 */
		appendSwitch(_switch: string, value?: string): void;
		/**
		 * Append an argument to Chromium's command line. The argument will quoted properly.
		 *
		 * Note: This will not affect process.argv.
		 */
		appendArgument(value: string): void;
	}

	interface Dock {
		/**
		 * When critical is passed, the dock icon will bounce until either the
		 * application becomes active or the request is canceled.
		 *
		 * When informational is passed, the dock icon will bounce for one second.
		 * However, the request remains active until either the application becomes
		 * active or the request is canceled.
		 *
		 * @param type The default is informational.
		 * @returns An ID representing the request.
		 */
		bounce(type?: 'critical' | 'informational'): number;
		/**
		 * Cancel the bounce of id.
		 *
		 * Note: This API is only available on macOS.
		 */
		cancelBounce(id: number): void;
		/**
		 * Bounces the Downloads stack if the filePath is inside the Downloads folder.
		 *
		 * Note: This API is only available on macOS.
		 */
		downloadFinished(filePath: string): void;
		/**
		 * Sets the string to be displayed in the dock’s badging area.
		 *
		 * Note: This API is only available on macOS.
		 */
		setBadge(text: string): void;
		/**
		 * Returns the badge string of the dock.
		 *
		 * Note: This API is only available on macOS.
		 */
		getBadge(): string;
		/**
		 * Sets the counter badge for current app. Setting the count to 0 will hide the badge.
		 *
		 * @returns True when the call succeeded, otherwise returns false.
		 *
		 * Note: This API is only available on macOS and Linux.
		 */
		setBadgeCount(count: number): boolean;
		/**
		 * @returns The current value displayed in the counter badge.
		 *
		 * Note: This API is only available on macOS and Linux.
		 */
		getBadgeCount(): number;
		/**
		 * Hides the dock icon.
		 *
		 * Note: This API is only available on macOS.
		 */
		hide(): void;
		/**
		 * Shows the dock icon.
		 *
		 * Note: This API is only available on macOS.
		 */
		show(): void;
		/**
		 * @returns Whether the dock icon is visible.
		 * The app.dock.show() call is asynchronous so this method might not return true immediately after that call.
		 *
		 * Note: This API is only available on macOS.
		 */
		isVisible(): boolean;
		/**
		 * Sets the application dock menu.
		 *
		 * Note: This API is only available on macOS.
		 */
		setMenu(menu: Menu): void;
		/**
		 * Sets the image associated with this dock icon.
		 *
		 * Note: This API is only available on macOS.
		 */
		setIcon(icon: NativeImage | string): void;
	}

	interface Task {
		/**
		 * Path of the program to execute, usually you should specify process.execPath
		 * which opens current program.
		 */
		program: string;
		/**
		 * The arguments of command line when program is executed.
		 */
		arguments: string;
		/**
		 * The string to be displayed in a JumpList.
		 */
		title: string;
		/**
		 * Description of this task.
		 */
		description?: string;
		/**
		 * The absolute path to an icon to be displayed in a JumpList, it can be
		 * arbitrary resource file that contains an icon, usually you can specify
		 * process.execPath to show the icon of the program.
		 */
		iconPath: string;
		/**
		 * The icon index in the icon file. If an icon file consists of two or more
		 * icons, set this value to identify the icon. If an icon file consists of
		 * one icon, this value is 0.
		 */
		iconIndex?: number;
	}

	/**
	 * ok - Nothing went wrong.
	 * error - One or more errors occured, enable runtime logging to figure out the likely cause.
	 * invalidSeparatorError - An attempt was made to add a separator to a custom category in the Jump List.
	 *                         Separators are only allowed in the standard Tasks category.
	 * fileTypeRegistrationError - An attempt was made to add a file link to the Jump List
	 *                             for a file type the app isn't registered to handle.
	 * customCategoryAccessDeniedError - Custom categories can't be added to the Jump List
	 *                                   due to user privacy or group policy settings.
	 */
	type SetJumpListResult = 'ok' | 'error' | 'invalidSeparatorError' | 'fileTypeRegistrationError' | 'customCategoryAccessDeniedError';

	interface JumpListSettings {
		/**
		 * The minimum number of items that will be shown in the Jump List.
		 */
		minItems: number;
		/**
		 * Items that the user has explicitly removed from custom categories in the Jump List.
		 */
		removedItems: JumpListItem[];
	}

	interface JumpListCategory {
		/**
		 * tasks - Items in this category will be placed into the standard Tasks category.
		 * frequent - Displays a list of files frequently opened by the app, the name of the category and its items are set by Windows.
		 * recent - Displays a list of files recently opened by the app, the name of the category and its items are set by Windows.
		 * custom - Displays tasks or file links, name must be set by the app.
		 */
		type?: 'tasks' | 'frequent' | 'recent' | 'custom';
		/**
		 * Must be set if type is custom, otherwise it should be omitted.
		 */
		name?: string;
		/**
		 * Array of JumpListItem objects if type is tasks or custom, otherwise it should be omitted.
		 */
		items?: JumpListItem[];
	}

	interface JumpListItem {
		/**
		 * task - A task will launch an app with specific arguments.
		 * separator - Can be used to separate items in the standard Tasks category.
		 * file - A file link will open a file using the app that created the Jump List.
		 */
		type: 'task' | 'separator' | 'file';
		/**
		 * Path of the file to open, should only be set if type is file.
		 */
		path?: string;
		/**
		 * Path of the program to execute, usually you should specify process.execPath which opens the current program.
		 * Should only be set if type is task.
		 */
		program?: string;
		/**
		 * The command line arguments when program is executed. Should only be set if type is task.
		 */
		args?: string;
		/**
		 * The text to be displayed for the item in the Jump List. Should only be set if type is task.
		 */
		title?: string;
		/**
		 * Description of the task (displayed in a tooltip). Should only be set if type is task.
		 */
		description?: string;
		/**
		 * The absolute path to an icon to be displayed in a Jump List, which can be an arbitrary
		 * resource file that contains an icon (e.g. .ico, .exe, .dll).
		 * You can usually specify process.execPath to show the program icon.
		 */
		iconPath?: string;
		/**
		 * The index of the icon in the resource file. If a resource file contains multiple icons
		 * this value can be used to specify the zero-based index of the icon that should be displayed
		 * for this task. If a resource file contains only one icon, this property should be set to zero.
		 */
		iconIndex?: number;
	}

	interface LoginItemSettings {
		/**
		 * True if the app is set to open at login.
		 */
		openAtLogin: boolean;
		/**
		 * True if the app is set to open as hidden at login. This setting is only supported on macOS.
		 */
		openAsHidden: boolean;
		/**
		 * True if the app was opened at login automatically. This setting is only supported on macOS.
		 */
		wasOpenedAtLogin?: boolean;
		/**
		 * True if the app was opened as a hidden login item. This indicates that the app should not
		 * open any windows at startup. This setting is only supported on macOS.
		 */
		wasOpenedAsHidden?: boolean;
		/**
		 * True if the app was opened as a login item that should restore the state from the previous session.
		 * This indicates that the app should restore the windows that were open the last time the app was closed.
		 * This setting is only supported on macOS.
		 */
		restoreState?: boolean;
	}

	interface AboutPanelOptions {
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

	// https://github.com/electron/electron/blob/master/docs/api/auto-updater.md

	/**
	 * This module provides an interface for the Squirrel auto-updater framework.
	 */
	interface AutoUpdater extends NodeJS.EventEmitter {
		/**
		 * Emitted when there is an error while updating.
		 */
		on(event: 'error', listener: (error: Error) => void): this;
		/**
		 * Emitted when checking if an update has started.
		 */
		on(event: 'checking-for-update', listener: Function): this;
		/**
		 * Emitted when there is an available update. The update is downloaded automatically.
		 */
		on(event: 'update-available', listener: Function): this;
		/**
		 * Emitted when there is no available update.
		 */
		on(event: 'update-not-available', listener: Function): this;
		/**
		 * Emitted when an update has been downloaded.
		 * Note: On Windows only releaseName is available.
		 */
		on(event: 'update-downloaded', listener: (event: Event, releaseNotes: string, releaseName: string, releaseDate: Date, updateURL: string) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * Set the url and initialize the auto updater.
		 */
		setFeedURL(url: string, requestHeaders?: Headers): void;
		/**
		 * @returns The current update feed URL.
		 */
		getFeedURL(): string;
		/**
		 * Ask the server whether there is an update, you have to call setFeedURL
		 * before using this API
		 */
		checkForUpdates(): void;
		/**
		 * Restarts the app and installs the update after it has been downloaded.
		 * It should only be called after update-downloaded has been emitted.
		 */
		quitAndInstall(): void;
	}

	// https://github.com/electron/electron/blob/master/docs/api/browser-window.md

	/**
	 * The BrowserWindow class gives you ability to create a browser window.
	 * You can also create a window without chrome by using Frameless Window API.
	 */
	class BrowserWindow extends NodeJS.EventEmitter implements Destroyable {
		/**
		 * Emitted when the document changed its title,
		 * calling event.preventDefault() would prevent the native window’s title to change.
		 */
		on(event: 'page-title-updated', listener: (event: Event, title: string) => void): this;
		/**
		 * Emitted when the window is going to be closed. It’s emitted before the beforeunload
		 * and unload event of the DOM. Calling event.preventDefault() will cancel the close.
		 */
		on(event: 'close', listener: (event: Event) => void): this;
		/**
		 * Emitted when the window is closed. After you have received this event
		 * you should remove the reference to the window and avoid using it anymore.
		 */
		on(event: 'closed', listener: Function): this;
		/**
		 * Emitted when the web page becomes unresponsive.
		 */
		on(event: 'unresponsive', listener: Function): this;
		/**
		 * Emitted when the unresponsive web page becomes responsive again.
		 */
		on(event: 'responsive', listener: Function): this;
		/**
		 * Emitted when the window loses focus.
		 */
		on(event: 'blur', listener: Function): this;
		/**
		 * Emitted when the window gains focus.
		 */
		on(event: 'focus', listener: Function): this;
		/**
		 * Emitted when the window is shown.
		 */
		on(event: 'show', listener: Function): this;
		/**
		 * Emitted when the window is hidden.
		 */
		on(event: 'hide', listener: Function): this;
		/**
		 * Emitted when the web page has been rendered and window can be displayed without visual flash.
		 */
		on(event: 'ready-to-show', listener: Function): this;
		/**
		 * Emitted when window is maximized.
		 */
		on(event: 'maximize', listener: Function): this;
		/**
		 * Emitted when the window exits from maximized state.
		 */
		on(event: 'unmaximize', listener: Function): this;
		/**
		 * Emitted when the window is minimized.
		 */
		on(event: 'minimize', listener: Function): this;
		/**
		 * Emitted when the window is restored from minimized state.
		 */
		on(event: 'restore', listener: Function): this;
		/**
		 * Emitted when the window is getting resized.
		 */
		on(event: 'resize', listener: Function): this;
		/**
		 * Emitted when the window is getting moved to a new position.
		 */
		on(event: 'move', listener: Function): this;
		/**
		 * Emitted when the window enters full screen state.
		 */
		on(event: 'enter-full-screen', listener: Function): this;
		/**
		 * Emitted when the window leaves full screen state.
		 */
		on(event: 'leave-full-screen', listener: Function): this;
		/**
		 * Emitted when the window enters full screen state triggered by HTML API.
		 */
		on(event: 'enter-html-full-screen', listener: Function): this;
		/**
		 * Emitted when the window leaves full screen state triggered by HTML API.
		 */
		on(event: 'leave-html-full-screen', listener: Function): this;
		/**
		 * Emitted when an App Command is invoked. These are typically related
		 * to keyboard media keys or browser commands, as well as the "Back" /
		 * "Forward" buttons built into some mice on Windows.
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'app-command', listener: (event: Event, command: string) => void): this;
		/**
		 * Emitted when scroll wheel event phase has begun.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'scroll-touch-begin', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase has ended.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'scroll-touch-end', listener: Function): this;
		/**
		 * Emitted when scroll wheel event phase filed upon reaching the edge of element.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'scroll-touch-edge', listener: Function): this;
		/**
		 * Emitted on 3-finger swipe.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'swipe', listener: (event: Event, direction: SwipeDirection) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * Creates a new BrowserWindow with native properties as set by the options.
		 */
		constructor(options?: BrowserWindowOptions);
		/**
		 * @returns All opened browser windows.
		 */
		static getAllWindows(): BrowserWindow[];
		/**
		 * @returns The window that is focused in this application.
		 */
		static getFocusedWindow(): BrowserWindow;
		/**
		 * Find a window according to the webContents it owns.
		 */
		static fromWebContents(webContents: WebContents): BrowserWindow;
		/**
		 * Find a window according to its ID.
		 */
		static fromId(id: number): BrowserWindow;
		/**
		 * Adds devtools extension located at path. The extension will be remembered
		 * so you only need to call this API once, this API is not for programming use.
		 * @returns The extension's name.
		 *
		 * Note: This API cannot be called before the ready event of the app module is emitted.
		 */
		static addDevToolsExtension(path: string): string;
		/**
		 * Remove a devtools extension.
		 * @param name The name of the devtools extension to remove.
		 *
		 * Note: This API cannot be called before the ready event of the app module is emitted.
		 */
		static removeDevToolsExtension(name: string): void;
		/**
		 * @returns devtools extensions.
		 *
		 * Note: This API cannot be called before the ready event of the app module is emitted.
		 */
		static getDevToolsExtensions(): DevToolsExtensions;
		/**
		 * The WebContents object this window owns, all web page related events and
		 * operations would be done via it.
		 * Note: Users should never store this object because it may become null when
		 * the renderer process (web page) has crashed.
		 */
		webContents: WebContents;
		/**
		 * Get the unique ID of this window.
		 */
		id: number;
		/**
		 * Force closing the window, the unload and beforeunload event won't be emitted
		 * for the web page, and close event would also not be emitted for this window,
		 * but it would guarantee the closed event to be emitted.
		 * You should only use this method when the renderer process (web page) has crashed.
		 */
		destroy(): void;
		/**
		 * Try to close the window, this has the same effect with user manually clicking
		 * the close button of the window. The web page may cancel the close though,
		 * see the close event.
		 */
		close(): void;
		/**
		 * Focus on the window.
		 */
		focus(): void;
		/**
		 * Remove focus on the window.
		 */
		blur(): void;
		/**
		 * @returns Whether the window is focused.
		 */
		isFocused(): boolean;
		/**
		 * @returns Whether the window is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * Shows and gives focus to the window.
		 */
		show(): void;
		/**
		 * Shows the window but doesn't focus on it.
		 */
		showInactive(): void;
		/**
		 * Hides the window.
		 */
		hide(): void;
		/**
		 * @returns Whether the window is visible to the user.
		 */
		isVisible(): boolean;
		/**
		 * @returns Whether the window is a modal window.
		 */
		isModal(): boolean;
		/**
		 * Maximizes the window.
		 */
		maximize(): void;
		/**
		 * Unmaximizes the window.
		 */
		unmaximize(): void;
		/**
		 * @returns Whether the window is maximized.
		 */
		isMaximized(): boolean;
		/**
		 * Minimizes the window. On some platforms the minimized window will be
		 * shown in the Dock.
		 */
		minimize(): void;
		/**
		 * Restores the window from minimized state to its previous state.
		 */
		restore(): void;
		/**
		 * @returns Whether the window is minimized.
		 */
		isMinimized(): boolean;
		/**
		 * Sets whether the window should be in fullscreen mode.
		 */
		setFullScreen(flag: boolean): void;
		/**
		 * @returns Whether the window is in fullscreen mode.
		 */
		isFullScreen(): boolean;
		/**
		 * This will have a window maintain an aspect ratio.
		 * The extra size allows a developer to have space, specified in pixels,
		 * not included within the aspect ratio calculations.
		 * This API already takes into account the difference between a window’s size and its content size.
		 *
		 * Note: This API is available only on macOS.
		 */
		setAspectRatio(aspectRatio: number, extraSize?: Size): void;
		/**
		 * Uses Quick Look to preview a file at a given path.
		 *
		 * @param path The absolute path to the file to preview with QuickLook.
		 * @param displayName The name of the file to display on the Quick Look modal view.
		 * Note: This API is available only on macOS.
		 */
		previewFile(path: string, displayName?: string): void;
		/**
		 * Resizes and moves the window to width, height, x, y.
		 */
		setBounds(options: Rectangle, animate?: boolean): void;
		/**
		 * @returns The window's width, height, x and y values.
		 */
		getBounds(): Rectangle;
		/**
		 * Resizes and moves the window's client area (e.g. the web page) to width, height, x, y.
		 */
		setContentBounds(options: Rectangle, animate?: boolean): void;
		/**
		 * @returns The window's client area (e.g. the web page) width, height, x and y values.
		 */
		getContentBounds(): Rectangle;
		/**
		 * Resizes the window to width and height.
		 */
		setSize(width: number, height: number, animate?: boolean): void;
		/**
		 * @returns The window's width and height.
		 */
		getSize(): number[];
		/**
		 * Resizes the window's client area (e.g. the web page) to width and height.
		 */
		setContentSize(width: number, height: number, animate?: boolean): void;
		/**
		 * @returns The window's client area's width and height.
		 */
		getContentSize(): number[];
		/**
		 * Sets the minimum size of window to width and height.
		 */
		setMinimumSize(width: number, height: number): void;
		/**
		 * @returns The window's minimum width and height.
		 */
		getMinimumSize(): number[];
		/**
		 * Sets the maximum size of window to width and height.
		 */
		setMaximumSize(width: number, height: number): void;
		/**
		 * @returns The window's maximum width and height.
		 */
		getMaximumSize(): number[];
		/**
		 * Sets whether the window can be manually resized by user.
		 */
		setResizable(resizable: boolean): void;
		/**
		 * @returns Whether the window can be manually resized by user.
		 */
		isResizable(): boolean;
		/**
		 * Sets whether the window can be moved by user. On Linux does nothing.
		 * Note: This API is available only on macOS and Windows.
		 */
		setMovable(movable: boolean): void;
		/**
		 * Note: This API is available only on macOS and Windows.
		 * @returns Whether the window can be moved by user. On Linux always returns true.
		 */
		isMovable(): boolean;
		/**
		 * Sets whether the window can be manually minimized by user. On Linux does nothing.
		 * Note: This API is available only on macOS and Windows.
		 */
		setMinimizable(minimizable: boolean): void;
		/**
		 * Note: This API is available only on macOS and Windows.
		 * @returns Whether the window can be manually minimized by user. On Linux always returns true.
		 */
		isMinimizable(): boolean;
		/**
		 * Sets whether the window can be manually maximized by user. On Linux does nothing.
		 * Note: This API is available only on macOS and Windows.
		 */
		setMaximizable(maximizable: boolean): void;
		/**
		 * Note: This API is available only on macOS and Windows.
		 * @returns Whether the window can be manually maximized by user. On Linux always returns true.
		 */
		isMaximizable(): boolean;
		/**
		 * Sets whether the maximize/zoom window button toggles fullscreen mode or maximizes the window.
		 */
		setFullScreenable(fullscreenable: boolean): void;
		/**
		 * @returns Whether the maximize/zoom window button toggles fullscreen mode or maximizes the window.
		 */
		isFullScreenable(): boolean;
		/**
		 * Sets whether the window can be manually closed by user. On Linux does nothing.
		 * Note: This API is available only on macOS and Windows.
		 */
		setClosable(closable: boolean): void;
		/**
		 * Note: This API is available only on macOS and Windows.
		 * @returns Whether the window can be manually closed by user. On Linux always returns true.
		 */
		isClosable(): boolean;
		/**
		 * Sets whether the window should show always on top of other windows. After
		 * setting this, the window is still a normal window, not a toolbox window
		 * which can not be focused on.
		 */
		setAlwaysOnTop(flag: boolean, level?: WindowLevel): void;
		/**
		 * @returns Whether the window is always on top of other windows.
		 */
		isAlwaysOnTop(): boolean;
		/**
		 * Moves window to the center of the screen.
		 */
		center(): void;
		/**
		 * Moves window to x and y.
		 */
		setPosition(x: number, y: number, animate?: boolean): void;
		/**
		 * @returns The window's current position.
		 */
		getPosition(): number[];
		/**
		 * Changes the title of native window to title.
		 */
		setTitle(title: string): void;
		/**
		 * Note: The title of web page can be different from the title of the native window.
		 * @returns The title of the native window.
		 */
		getTitle(): string;
		/**
		 * Changes the attachment point for sheets on macOS.
		 * Note: This API is available only on macOS.
		 */
		setSheetOffset(offsetY: number, offsetX?: number): void;
		/**
		 * Starts or stops flashing the window to attract user's attention.
		 */
		flashFrame(flag: boolean): void;
		/**
		 * Makes the window do not show in Taskbar.
		 */
		setSkipTaskbar(skip: boolean): void;
		/**
		 * Enters or leaves the kiosk mode.
		 */
		setKiosk(flag: boolean): void;
		/**
		 * @returns Whether the window is in kiosk mode.
		 */
		isKiosk(): boolean;
		/**
		 * The native type of the handle is HWND on Windows, NSView* on macOS,
		 * and Window (unsigned long) on Linux.
		 * @returns The platform-specific handle of the window as Buffer.
		 */
		getNativeWindowHandle(): Buffer;
		/**
		 * Hooks a windows message. The callback is called when the message is received in the WndProc.
		 * Note: This API is available only on Windows.
		 */
		hookWindowMessage(message: number, callback: Function): void;
		/**
		 * @returns Whether the message is hooked.
		 */
		isWindowMessageHooked(message: number): boolean;
		/**
		 * Unhook the window message.
		 */
		unhookWindowMessage(message: number): void;
		/**
		 * Unhooks all of the window messages.
		 */
		unhookAllWindowMessages(): void;
		/**
		 * Sets the pathname of the file the window represents, and the icon of the
		 * file will show in window's title bar.
		 * Note: This API is available only on macOS.
		 */
		setRepresentedFilename(filename: string): void;
		/**
		 * Note: This API is available only on macOS.
		 * @returns The pathname of the file the window represents.
		 */
		getRepresentedFilename(): string;
		/**
		 * Specifies whether the window’s document has been edited, and the icon in
		 * title bar will become grey when set to true.
		 * Note: This API is available only on macOS.
		 */
		setDocumentEdited(edited: boolean): void;
		/**
		 * Note: This API is available only on macOS.
		 * @returns Whether the window's document has been edited.
		 */
		isDocumentEdited(): boolean;
		focusOnWebView(): void;
		blurWebView(): void;
		/**
		 * Captures the snapshot of page within rect, upon completion the callback
		 * will be called. Omitting the rect would capture the whole visible page.
		 * Note: Be sure to read documents on remote buffer in remote if you are going
		 * to use this API in renderer process.
		 * @param callback Supplies the image that stores data of the snapshot.
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
		/**
		 * Captures the snapshot of page within rect, upon completion the callback
		 * will be called. Omitting the rect would capture the whole visible page.
		 * Note: Be sure to read documents on remote buffer in remote if you are going
		 * to use this API in renderer process.
		 * @param callback Supplies the image that stores data of the snapshot.
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Same as webContents.loadURL(url).
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * Same as webContents.reload.
		 */
		reload(): void;
		/**
		 * Sets the menu as the window top menu.
		 * Note: This API is not available on macOS.
		 */
		setMenu(menu: Menu): void;
		/**
		 * Sets the progress value in the progress bar.
		 * On Linux platform, only supports Unity desktop environment, you need to
		 * specify the *.desktop file name to desktopName field in package.json.
		 * By default, it will assume app.getName().desktop.
		 * @param progress Valid range is [0, 1.0]. If < 0, the progress bar is removed.
		 * If greater than 0, it becomes indeterminate.
		 */
		setProgressBar(progress: number, options?: {
			/**
			 * Mode for the progress bar.
			 * Note: This is only implemented on Windows.
			 */
			mode: 'none' | 'normal' | 'indeterminate' | 'error' | 'paused'
		}): void;
		/**
		 * Sets a 16px overlay onto the current Taskbar icon, usually used to convey
		 * some sort of application status or to passively notify the user.
		 * Note: This API is only available on Windows 7 or above.
		 * @param overlay The icon to display on the bottom right corner of the Taskbar
		 * icon. If this parameter is null, the overlay is cleared
		 * @param description Provided to Accessibility screen readers.
		 */
		setOverlayIcon(overlay: NativeImage, description: string): void;
		/**
		 * Sets whether the window should have a shadow. On Windows and Linux does nothing.
		 * Note: This API is available only on macOS.
		 */
		setHasShadow(hasShadow: boolean): void;
		/**
		 * Note: This API is available only on macOS.
		 * @returns whether the window has a shadow. On Windows and Linux always returns true.
		 */
		hasShadow(): boolean;
		/**
		 * Add a thumbnail toolbar with a specified set of buttons to the thumbnail image
		 * of a window in a taskbar button layout.
		 * @returns Whether the thumbnail has been added successfully.
		 *
		 * Note: This API is available only on Windows.
		 */
		setThumbarButtons(buttons: ThumbarButton[]): boolean;
		/**
		 * Sets the region of the window to show as the thumbnail image displayed when hovering
		 * over the window in the taskbar. You can reset the thumbnail to be the entire window
		 * by specifying an empty region: {x: 0, y: 0, width: 0, height: 0}.
		 *
		 * Note: This API is available only on Windows.
		 */
		setThumbnailClip(region: Rectangle): boolean;
		/**
		 * Sets the toolTip that is displayed when hovering over the window thumbnail in the taskbar.
		 * Note: This API is available only on Windows.
		 */
		setThumbnailToolTip(toolTip: string): boolean;
		/**
		 * Sets the application id, app icon, relaunch command and relaunch display name
		 * for the given window. appIconIndex should be set to 0 if the app icon
		 * file only has a single icon.
		 */
		setAppDetails(options: {
			appId?: string;
			appIconPath?: string;
			appIconIndex?: number;
			relaunchCommand?: string;
			relaunchDisplayName?: string;
		}): void;
		/**
		 * Same as webContents.showDefinitionForSelection().
		 * Note: This API is available only on macOS.
		 */
		showDefinitionForSelection(): void;
		/**
		 * Changes window icon.
		 * Note: This API is not available on macOS.
		 */
		setIcon(icon: NativeImage): void;
		/**
		 * Sets whether the window menu bar should hide itself automatically. Once set
		 * the menu bar will only show when users press the single Alt key.
		 * If the menu bar is already visible, calling setAutoHideMenuBar(true) won't
		 * hide it immediately.
		 */
		setAutoHideMenuBar(hide: boolean): void;
		/**
		 * @returns Whether menu bar automatically hides itself.
		 */
		isMenuBarAutoHide(): boolean;
		/**
		 * Sets whether the menu bar should be visible. If the menu bar is auto-hide,
		 * users can still bring up the menu bar by pressing the single Alt key.
		 */
		setMenuBarVisibility(visibile: boolean): void;
		/**
		 * @returns Whether the menu bar is visible.
		 */
		isMenuBarVisible(): boolean;
		/**
		 * Sets whether the window should be visible on all workspaces.
		 * Note: This API does nothing on Windows.
		 */
		setVisibleOnAllWorkspaces(visible: boolean): void;
		/**
		 * Note: This API always returns false on Windows.
		 * @returns Whether the window is visible on all workspaces.
		 */
		isVisibleOnAllWorkspaces(): boolean;
		/**
		 * Makes the window ignore all mouse events.
		 *
		 * All mouse events happened in this window will be passed to the window below this window,
		 * but if this window has focus, it will still receive keyboard events.
		 */
		setIgnoreMouseEvents(ignore: boolean): void;
		/**
		 * Prevents the window contents from being captured by other apps.
		 *
		 * On macOS it sets the NSWindow's sharingType to NSWindowSharingNone.
		 * On Windows it calls SetWindowDisplayAffinity with WDA_MONITOR.
		 */
		setContentProtection(enable: boolean): void;
		/**
		 * Changes whether the window can be focused.
		 * Note: This API is available only on Windows.
		 */
		setFocusable(focusable: boolean): void;
		/**
		 * Sets parent as current window's parent window,
		 * passing null will turn current window into a top-level window.
		 * Note: This API is not available on Windows.
		 */
		setParentWindow(parent: BrowserWindow): void;
		/**
		 * @returns The parent window.
		 */
		getParentWindow(): BrowserWindow;
		/**
		 * @returns All child windows.
		 */
		getChildWindows(): BrowserWindow[];
	}

	type WindowLevel = 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' | 'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver' | 'dock';
	type SwipeDirection = 'up' | 'right' | 'down' | 'left';
	type ThumbarButtonFlags = 'enabled' | 'disabled' | 'dismissonclick' | 'nobackground' | 'hidden' | 'noninteractive';

	interface ThumbarButton {
		icon: NativeImage | string;
		click: Function;
		tooltip?: string;
		flags?: ThumbarButtonFlags[];
	}

	interface DevToolsExtensions {
		[name: string]: {
			name: string;
			value: string;
		}
	}

	interface WebPreferences {
		/**
		 * Whether to enable DevTools.
		 * If it is set to false, can not use BrowserWindow.webContents.openDevTools() to open DevTools.
		 * Default: true.
		 */
		devTools?: boolean;
		/**
		 * Whether node integration is enabled.
		 * Default: true.
		 */
		nodeIntegration?: boolean;
		/**
		 * Specifies a script that will be loaded before other scripts run in the page.
		 * This script will always have access to node APIs no matter whether node integration is turned on or off.
		 * The value should be the absolute file path to the script.
		 * When node integration is turned off, the preload script can reintroduce
		 * Node global symbols back to the global scope.
		 */
		preload?: string;
		/**
		 * Sets the session used by the page. Instead of passing the Session object directly,
		 * you can also choose to use the partition option instead, which accepts a partition string.
		 * When both session and partition are provided, session would be preferred.
		 * Default: the default session.
		 */
		session?: Session;
		/**
		 * Sets the session used by the page according to the session’s partition string.
		 * If partition starts with persist:, the page will use a persistent session available
		 * to all pages in the app with the same partition. if there is no persist: prefix,
		 * the page will use an in-memory session. By assigning the same partition,
		 * multiple pages can share the same session.
		 * Default: the default session.
		 */
		partition?: string;
		/**
		 * The default zoom factor of the page, 3.0 represents 300%.
		 * Default: 1.0.
		 */
		zoomFactor?: number;
		/**
		 * Enables JavaScript support.
		 * Default: true.
		 */
		javascript?: boolean;
		/**
		 * When setting false, it will disable the same-origin policy (Usually using testing
		 * websites by people), and set allowDisplayingInsecureContent and allowRunningInsecureContent
		 * to true if these two options are not set by user.
		 * Default: true.
		 */
		webSecurity?: boolean;
		/**
		 * Allow an https page to display content like images from http URLs.
		 * Default: false.
		 */
		allowDisplayingInsecureContent?: boolean;
		/**
		 * Allow a https page to run JavaScript, CSS or plugins from http URLs.
		 * Default: false.
		 */
		allowRunningInsecureContent?: boolean;
		/**
		 * Enables image support.
		 * Default: true.
		 */
		images?: boolean;
		/**
		 * Make TextArea elements resizable.
		 * Default: true.
		 */
		textAreasAreResizable?: boolean;
		/**
		 * Enables WebGL support.
		 * Default: true.
		 */
		webgl?: boolean;
		/**
		 * Enables WebAudio support.
		 * Default: true.
		 */
		webaudio?: boolean;
		/**
		 * Whether plugins should be enabled.
		 * Default: false.
		 */
		plugins?: boolean;
		/**
		 * Enables Chromium’s experimental features.
		 * Default: false.
		 */
		experimentalFeatures?: boolean;
		/**
		 * Enables Chromium’s experimental canvas features.
		 * Default: false.
		 */
		experimentalCanvasFeatures?: boolean;
		/**
		 * Enables DirectWrite font rendering system on Windows.
		 * Default: true.
		 */
		directWrite?: boolean;
		/**
		 * Enables scroll bounce (rubber banding) effect on macOS.
		 * Default: false.
		 */
		scrollBounce?: boolean;
		/**
		 * A list of feature strings separated by ",", like CSSVariables,KeyboardEventKey to enable.
		 */
		blinkFeatures?: string;
		/**
		 * A list of feature strings separated by ",", like CSSVariables,KeyboardEventKey to disable.
		 */
		disableBlinkFeatures?: string;
		/**
		 * Sets the default font for the font-family.
		 */
		defaultFontFamily?: {
			/**
			 * Default: Times New Roman.
			 */
			standard?: string;
			/**
			 * Default: Times New Roman.
			 */
			serif?: string;
			/**
			 * Default: Arial.
			 */
			sansSerif?: string;
			/**
			 * Default: Courier New.
			 */
			monospace?: string;
		};
		/**
		 * Default: 16.
		 */
		defaultFontSize?: number;
		/**
		 * Default: 13.
		 */
		defaultMonospaceFontSize?: number;
		/**
		 * Default: 0.
		 */
		minimumFontSize?: number;
		/**
		 * Default: ISO-8859-1.
		 */
		defaultEncoding?: string;
		/**
		 * Whether to throttle animations and timers when the page becomes background.
		 * Default: true.
		 */
		backgroundThrottling?: boolean;
		/**
		 * Whether to enable offscreen rendering for the browser window.
		 * Default: false.
		 */
		offscreen?: boolean;
		/**
		 * Whether to enable Chromium OS-level sandbox.
		 * Default: false.
		 */
		sandbox?: boolean;
	}

	interface BrowserWindowOptions {
		/**
		 * Window’s width in pixels.
		 * Default: 800.
		 */
		width?: number;
		/**
		 * Window’s height in pixels.
		 * Default: 600.
		 */
		height?: number;
		/**
		 * Window’s left offset from screen.
		 * Default: center the window.
		 */
		x?: number;
		/**
		 * Window’s top offset from screen.
		 * Default: center the window.
		 */
		y?: number;
		/**
		 * The width and height would be used as web page’s size, which means
		 * the actual window’s size will include window frame’s size and be slightly larger.
		 * Default: false.
		 */
		useContentSize?: boolean;
		/**
		 * Show window in the center of the screen.
		 * Default: true
		 */
		center?: boolean;
		/**
		 * Window’s minimum width.
		 * Default: 0.
		 */
		minWidth?: number;
		/**
		 * Window’s minimum height.
		 * Default: 0.
		 */
		minHeight?: number;
		/**
		 * Window’s maximum width.
		 * Default: no limit.
		 */
		maxWidth?: number;
		/**
		 * Window’s maximum height.
		 * Default: no limit.
		 */
		maxHeight?: number;
		/**
		 * Whether window is resizable.
		 * Default: true.
		 */
		resizable?: boolean;
		/**
		 * Whether window is movable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		movable?: boolean;
		/**
		 * Whether window is minimizable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		minimizable?: boolean;
		/**
		 * Whether window is maximizable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		maximizable?: boolean;
		/**
		 * Whether window is closable.
		 * Note: This is not implemented on Linux.
		 * Default: true.
		 */
		closable?: boolean;
		/**
		 * Whether the window can be focused.
		 * On Windows setting focusable: false also implies setting skipTaskbar: true.
		 * On Linux setting focusable: false makes the window stop interacting with wm,
		 * so the window will always stay on top in all workspaces.
		 * Default: true.
		 */
		focusable?: boolean;
		/**
		 * Whether the window should always stay on top of other windows.
		 * Default: false.
		 */
		alwaysOnTop?: boolean;
		/**
		 * Whether the window should show in fullscreen.
		 * When explicitly set to false the fullscreen button will be hidden or disabled on macOS.
		 * Default: false.
		 */
		fullscreen?: boolean;
		/**
		 * Whether the window can be put into fullscreen mode.
		 * On macOS, also whether the maximize/zoom button should toggle full screen mode or maximize window.
		 * Default: true.
		 */
		fullscreenable?: boolean;
		/**
		 * Whether to show the window in taskbar.
		 * Default: false.
		 */
		skipTaskbar?: boolean;
		/**
		 * The kiosk mode.
		 * Default: false.
		 */
		kiosk?: boolean;
		/**
		 * Default window title.
		 * Default: "Electron".
		 */
		title?: string;
		/**
		 * The window icon, when omitted on Windows the executable’s icon would be used as window icon.
		 */
		icon?: NativeImage | string;
		/**
		 * Whether window should be shown when created.
		 * Default: true.
		 */
		show?: boolean;
		/**
		 * Specify false to create a Frameless Window.
		 * Default: true.
		 */
		frame?: boolean;
		/**
		 * Specify parent window.
		 * Default: null.
		 */
		parent?: BrowserWindow;
		/**
		 * Whether this is a modal window. This only works when the window is a child window.
		 * Default: false.
		 */
		modal?: boolean;
		/**
		 * Whether the web view accepts a single mouse-down event that simultaneously activates the window.
		 * Default: false.
		 */
		acceptFirstMouse?: boolean;
		/**
		 * Whether to hide cursor when typing.
		 * Default: false.
		 */
		disableAutoHideCursor?: boolean;
		/**
		 * Auto hide the menu bar unless the Alt key is pressed.
		 * Default: true.
		 */
		autoHideMenuBar?: boolean;
		/**
		 * Enable the window to be resized larger than screen.
		 * Default: false.
		 */
		enableLargerThanScreen?: boolean;
		/**
		 * Window’s background color as Hexadecimal value, like #66CD00 or #FFF or #80FFFFFF (alpha is supported).
		 * Default: #FFF (white).
		 */
		backgroundColor?: string;
		/**
		 * Whether window should have a shadow.
		 * Note: This is only implemented on macOS.
		 * Default: true.
		 */
		hasShadow?: boolean;
		/**
		 * Forces using dark theme for the window.
		 * Note: Only works on some GTK+3 desktop environments.
		 * Default: false.
		 */
		darkTheme?: boolean;
		/**
		 * Makes the window transparent.
		 * Default: false.
		 */
		transparent?: boolean;
		/**
		 * The type of window, default is normal window.
		 */
		type?: BrowserWindowType;
		/**
		 * The style of window title bar.
		 */
		titleBarStyle?: 'default' | 'hidden' | 'hidden-inset';
		/**
		 * Use WS_THICKFRAME style for frameless windows on Windows
		 */
		thickFrame?: boolean;
		/**
		 * Settings of web page’s features.
		 */
		webPreferences?: WebPreferences;
	}

	type BrowserWindowType = BrowserWindowTypeLinux | BrowserWindowTypeMac | BrowserWindowTypeWindows;
	type BrowserWindowTypeLinux = 'desktop' | 'dock' | 'toolbar' | 'splash' | 'notification';
	type BrowserWindowTypeMac = 'desktop' | 'textured';
	type BrowserWindowTypeWindows = 'toolbar';

	// https://github.com/electron/electron/blob/master/docs/api/clipboard.md

	/**
	 * The clipboard module provides methods to perform copy and paste operations.
	 */
	interface Clipboard {
		/**
		 * @returns The contents of the clipboard as plain text.
		 */
		readText(type?: ClipboardType): string;
		/**
		 * Writes the text into the clipboard as plain text.
		 */
		writeText(text: string, type?: ClipboardType): void;
		/**
		 * @returns The contents of the clipboard as markup.
		 */
		readHTML(type?: ClipboardType): string;
		/**
		 * Writes markup to the clipboard.
		 */
		writeHTML(markup: string, type?: ClipboardType): void;
		/**
		 * @returns The contents of the clipboard as a NativeImage.
		 */
		readImage(type?: ClipboardType): NativeImage;
		/**
		 * Writes the image into the clipboard.
		 */
		writeImage(image: NativeImage, type?: ClipboardType): void;
		/**
		 * @returns The contents of the clipboard as RTF.
		 */
		readRTF(type?: ClipboardType): string;
		/**
		 * Writes the text into the clipboard in RTF.
		 */
		writeRTF(text: string, type?: ClipboardType): void;
		/**
		 * Clears everything in clipboard.
		 */
		clear(type?: ClipboardType): void;
		/**
		 * @returns Array available formats for the clipboard type.
		 */
		availableFormats(type?: ClipboardType): string[];
		/**
		 * Returns whether the clipboard supports the format of specified data.
		 * Note: This API is experimental and could be removed in future.
		 * @returns Whether the clipboard has data in the specified format.
		 */
		has(format: string, type?: ClipboardType): boolean;
		/**
		 * Reads the data in the clipboard of the specified format.
		 * Note: This API is experimental and could be removed in future.
		 */
		read(format: string, type?: ClipboardType): string | NativeImage;
		/**
		 * Writes data to the clipboard.
		 */
		write(data: {
			text?: string;
			rtf?: string;
			html?: string;
			image?: NativeImage;
		}, type?: ClipboardType): void;
		/**
		 * @returns An Object containing title and url keys representing the bookmark in the clipboard.
		 *
		 * Note: This API is available on macOS and Windows.
		 */
		readBookmark(): Bookmark;
		/**
		 * Writes the title and url into the clipboard as a bookmark.
		 *
		 * Note: This API is available on macOS and Windows.
		 */
		writeBookmark(title: string, url: string, type?: ClipboardType): void;
		/**
		 * The text on the find pasteboard. This method uses synchronous IPC when called from the renderer process.
		 * The cached value is reread from the find pasteboard whenever the application is activated.
		 *
		 * Note: This API is available on macOS.
		 */
		readFindText(): string;
		/**
		 * Writes the text into the find pasteboard as plain text.
		 * This method uses synchronous IPC when called from the renderer process.
		 *
		 * Note: This API is available on macOS.
		 */
		writeFindText(text: string): void;
	}

	type ClipboardType = '' | 'selection';

	interface Bookmark {
		title: string;
		url: string;
	}

	// https://github.com/electron/electron/blob/master/docs/api/content-tracing.md

	/**
	 * The content-tracing module is used to collect tracing data generated by the underlying Chromium content module.
	 * This module does not include a web interface so you need to open chrome://tracing/
	 * in a Chrome browser and load the generated file to view the result.
	 */
	interface ContentTracing {
		/**
		 * Get a set of category groups. The category groups can change as new code paths are reached.
		 *
		 * @param callback Called once all child processes have acknowledged the getCategories request.
		 */
		getCategories(callback: (categoryGroups: string[]) => void): void;
		/**
		 * Start recording on all processes. Recording begins immediately locally and asynchronously
		 * on child processes as soon as they receive the EnableRecording request.
		 *
		 * @param callback Called once all child processes have acknowledged the startRecording request.
		 */
		startRecording(options: ContentTracingOptions, callback: Function): void;
		/**
		 * Stop recording on all processes. Child processes typically are caching trace data and
		 * only rarely flush and send trace data back to the main process. That is because it may
		 * be an expensive operation to send the trace data over IPC, and we would like to avoid
		 * much runtime overhead of tracing. So, to end tracing, we must asynchronously ask all
		 * child processes to flush any pending trace data.
		 *
		 * @param resultFilePath Trace data will be written into this file if it is not empty,
		 * or into a temporary file.
		 * @param callback Called once all child processes have acknowledged the stopRecording request.
		 */
		stopRecording(resultFilePath: string, callback: (filePath: string) => void): void;
		/**
		 * Start monitoring on all processes. Monitoring begins immediately locally and asynchronously
		 * on child processes as soon as they receive the startMonitoring request.
		 *
		 * @param callback Called once all child processes have acked to the startMonitoring request.
		 */
		startMonitoring(options: ContentTracingOptions, callback: Function): void;
		/**
		 * Stop monitoring on all processes.
		 *
		 * @param callback Called once all child processes have acknowledged the stopMonitoring request.
		 */
		stopMonitoring(callback: Function): void;
		/**
		 * Get the current monitoring traced data. Child processes typically are caching trace data
		 * and only rarely flush and send trace data back to the main process. That is because it may
		 * be an expensive operation to send the trace data over IPC, and we would like to avoid much
		 * runtime overhead of tracing. So, to end tracing, we must asynchronously ask all child
		 * processes to flush any pending trace data.
		 *
		 * @param callback Called once all child processes have acknowledged the captureMonitoringSnapshot request.
		 */
		captureMonitoringSnapshot(resultFilePath: string, callback: (filePath: string) => void): void;
		/**
		 * Get the maximum usage across processes of trace buffer as a percentage of the full state.
		 *
		 * @param callback Called when the TraceBufferUsage value is determined.
		 */
		getTraceBufferUsage(callback: Function): void;
		/**
		 * @param callback Called every time the given event occurs on any process.
		 */
		setWatchEvent(categoryName: string, eventName: string, callback: Function): void;
		/**
		 * Cancel the watch event. This may lead to a race condition with the watch event callback if tracing is enabled.
		 */
		cancelWatchEvent(): void;
	}

	interface ContentTracingOptions {
		/**
		 * Filter to control what category groups should be traced.
		 * A filter can have an optional - prefix to exclude category groups
		 * that contain a matching category. Having both included and excluded
		 * category patterns in the same list is not supported.
		 *
		 * Examples:
		 *   test_MyTest*
		 *   test_MyTest*,test_OtherStuff
		 *   -excluded_category1,-excluded_category2
		 */
		categoryFilter: string;
		/**
		 * Controls what kind of tracing is enabled, it is a comma-delimited list.
		 *
		 * Possible options are:
		 *   record-until-full
		 *   record-continuously
		 *   trace-to-console
		 *   enable-sampling
		 *   enable-systrace
		 *
		 * The first 3 options are trace recoding modes and hence mutually exclusive.
		 * If more than one trace recording modes appear in the traceOptions string,
		 * the last one takes precedence. If none of the trace recording modes are specified,
		 * recording mode is record-until-full.
		 *
		 * The trace option will first be reset to the default option (record_mode set
		 * to record-until-full, enable_sampling and enable_systrace set to false)
		 * before options parsed from traceOptions are applied on it.
		 */
		traceOptions: string;
	}

	// https://github.com/electron/electron/blob/master/docs/api/crash-reporter.md

	/**
	 * The crash-reporter module enables sending your app's crash reports.
	 */
	interface CrashReporter {
		/**
		 * You are required to call this method before using other crashReporter APIs.
		 *
		 * Note: On macOS, Electron uses a new crashpad client, which is different from breakpad
		 * on Windows and Linux. To enable the crash collection feature, you are required to call
		 * the crashReporter.start API to initialize crashpad in the main process and in each
		 * renderer process from which you wish to collect crash reports.
		 */
		start(options: CrashReporterStartOptions): void;
		/**
		 * @returns The crash report. When there was no crash report
		 * sent or the crash reporter is not started, null will be returned.
		 */
		getLastCrashReport(): CrashReport;
		/**
		 * @returns All uploaded crash reports.
		 */
		getUploadedReports(): CrashReport[];
	}

	interface CrashReporterStartOptions {
		/**
		 * Default: app.getName()
		 */
		productName?: string;
		companyName: string;
		/**
		 * URL that crash reports would be sent to as POST.
		 */
		submitURL: string;
		/**
		 * Send the crash report without user interaction.
		 * Default: true.
		 */
		autoSubmit?: boolean;
		/**
		 * Default: false.
		 */
		ignoreSystemCrashHandler?: boolean;
		/**
		 * An object you can define that will be sent along with the report.
		 * Only string properties are sent correctly, nested objects are not supported.
		 */
		extra?: { [prop: string]: string };
	}

	interface CrashReport {
		id: string;
		date: Date;
	}

	// https://github.com/electron/electron/blob/master/docs/api/desktop-capturer.md

	/**
	 * The desktopCapturer module can be used to get available sources
	 * that can be used to be captured with getUserMedia.
	 */
	interface DesktopCapturer {
		/**
		 * Starts a request to get all desktop sources.
		 *
		 * Note: There is no guarantee that the size of source.thumbnail is always
		 * the same as the thumnbailSize in options. It also depends on the scale of the screen or window.
		 */
		getSources(options: DesktopCapturerOptions, callback: (error: Error, sources: DesktopCapturerSource[]) => any): void;
	}

	interface DesktopCapturerOptions {
		/**
		 * The types of desktop sources to be captured.
		 */
		types?: ('screen' | 'window')[];
		/**
		 * The suggested size that thumbnail should be scaled.
		 * Default: {width: 150, height: 150}
		 */
		thumbnailSize?: Size;
	}

	interface DesktopCapturerSource {
		/**
		 * The id of the captured window or screen used in navigator.webkitGetUserMedia.
		 * The format looks like window:XX or screen:XX where XX is a random generated number.
		 */
		id: string;
		/**
		 * The described name of the capturing screen or window.
		 * If the source is a screen, the name will be Entire Screen or Screen <index>;
		 * if it is a window, the name will be the window’s title.
		 */
		name: string;
		/**
		 * A thumbnail image.
		 */
		thumbnail: NativeImage;
	}

	// https://github.com/electron/electron/blob/master/docs/api/dialog.md

	/**
	 * The dialog module provides APIs to show native system dialogs, such as opening files or alerting,
	 * so web applications can deliver the same user experience as native applications.
	 */
	interface Dialog {
		/**
		 * Note: On Windows and Linux an open dialog can not be both a file selector and a directory selector,
		 * so if you set properties to ['openFile', 'openDirectory'] on these platforms, a directory selector will be shown.
		 *
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns an array of file paths chosen by the user,
		 * otherwise returns undefined.
		 */
		showOpenDialog(browserWindow: BrowserWindow, options: OpenDialogOptions, callback?: (fileNames: string[]) => void): string[];
		/**
		 * Note: On Windows and Linux an open dialog can not be both a file selector and a directory selector,
		 * so if you set properties to ['openFile', 'openDirectory'] on these platforms, a directory selector will be shown.
		 *
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns an array of file paths chosen by the user,
		 * otherwise returns undefined.
		 */
		showOpenDialog(options: OpenDialogOptions, callback?: (fileNames: string[]) => void): string[];
		/**
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns the path of file chosen by the user, otherwise
		 * returns undefined.
		 */
		showSaveDialog(browserWindow: BrowserWindow, options: SaveDialogOptions, callback?: (fileName: string) => void): string;
		/**
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns the path of file chosen by the user, otherwise
		 * returns undefined.
		 */
		showSaveDialog(options: SaveDialogOptions, callback?: (fileName: string) => void): string;
		/**
		 * Shows a message box. It will block until the message box is closed.
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns The index of the clicked button.
		 */
		showMessageBox(browserWindow: BrowserWindow, options: ShowMessageBoxOptions, callback?: (response: number) => void): number;
		/**
		 * Shows a message box. It will block until the message box is closed.
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns The index of the clicked button.
		 */
		showMessageBox(options: ShowMessageBoxOptions, callback?: (response: number) => void): number;
		/**
		 * Displays a modal dialog that shows an error message.
		 *
		 * This API can be called safely before the ready event the app module emits,
		 * it is usually used to report errors in early stage of startup.
		 * If called before the app readyevent on Linux, the message will be emitted to stderr,
		 * and no GUI dialog will appear.
		 */
		showErrorBox(title: string, content: string): void;
	}

	interface OpenDialogOptions {
		title?: string;
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will be used.
		 */
		buttonLabel?: string;
		/**
		 * File types that can be displayed or selected.
		 */
		filters?: {
			name: string;
			/**
			 * Extensions without wildcards or dots (e.g. 'png' is good but '.png' and '*.png' are bad).
			 * To show all files, use the '*' wildcard (no other wildcard is supported).
			 */
			extensions: string[];
		}[];
		/**
		 * Contains which features the dialog should use.
		 */
		properties?: ('openFile' | 'openDirectory' | 'multiSelections' | 'createDirectory' | 'showHiddenFiles')[];
	}

	interface SaveDialogOptions {
		title?: string;
		defaultPath?: string;
		/**
		 * Custom label for the confirmation button, when left empty the default label will be used.
		 */
		buttonLabel?: string;
		/**
		 * File types that can be displayed, see dialog.showOpenDialog for an example.
		 */
		filters?: {
			name: string;
			extensions: string[];
		}[];
	}

	interface ShowMessageBoxOptions {
		/**
		 * On Windows, "question" displays the same icon as "info", unless you set an icon using the "icon" option.
		 */
		type?: 'none' | 'info' | 'error' | 'question' | 'warning';
		/**
		 * Texts for buttons. On Windows, an empty array will result in one button labeled "OK".
		 */
		buttons?: string[];
		/**
		 * Index of the button in the buttons array which will be selected by default when the message box opens.
		 */
		defaultId?: number;
		/**
		 * Title of the message box (some platforms will not show it).
		 */
		title?: string;
		/**
		 * Contents of the message box.
		 */
		message?: string;
		/**
		 * Extra information of the message.
		 */
		detail?: string;
		icon?: NativeImage;
		/**
		 * The value will be returned when user cancels the dialog instead of clicking the buttons of the dialog.
		 * By default it is the index of the buttons that have "cancel" or "no" as label,
		 * or 0 if there is no such buttons. On macOS and Windows the index of "Cancel" button
		 * will always be used as cancelId, not matter whether it is already specified.
		 */
		cancelId?: number;
		/**
		 * On Windows Electron will try to figure out which one of the buttons are common buttons
		 * (like "Cancel" or "Yes"), and show the others as command links in the dialog.
		 * This can make the dialog appear in the style of modern Windows apps.
		 * If you don’t like this behavior, you can set noLink to true.
		 */
		noLink?: boolean;
	}

	// https://github.com/electron/electron/blob/master/docs/api/download-item.md

	/**
	 * DownloadItem represents a download item in Electron.
	 */
	interface DownloadItem extends NodeJS.EventEmitter {
		/**
		 * Emitted when the download has been updated and is not done.
		 */
		on(event: 'updated', listener: (event: Event, state: 'progressing' | 'interrupted') => void): this;
		/**
		 * Emits when the download is in a terminal state. This includes a completed download,
		 * a cancelled download (via downloadItem.cancel()), and interrupted download that can’t be resumed.
		 */
		on(event: 'done', listener: (event: Event, state: 'completed' | 'cancelled' | 'interrupted') => void): this;
		on(event: string, listener: Function): this;
		/**
		 * Set the save file path of the download item.
		 * Note: The API is only available in session’s will-download callback function.
		 * If user doesn’t set the save path via the API, Electron will use the original
		 * routine to determine the save path (Usually prompts a save dialog).
		 */
		setSavePath(path: string): void;
		/**
		 * @returns The save path of the download item.
		 * This will be either the path set via downloadItem.setSavePath(path) or the path selected from the shown save dialog.
		 */
		getSavePath(): string;
		/**
		 * Pauses the download.
		 */
		pause(): void;
		/**
		 * @returns Whether the download is paused.
		 */
		isPaused(): boolean;
		/**
		 * Resumes the download that has been paused.
		 */
		resume(): void;
		/**
		 * @returns Whether the download can resume.
		 */
		canResume(): boolean;
		/**
		 * Cancels the download operation.
		 */
		cancel(): void;
		/**
		 * @returns The origin url where the item is downloaded from.
		 */
		getURL(): string;
		/**
		 * @returns The mime type.
		 */
		getMimeType(): string;
		/**
		 * @returns Whether the download has user gesture.
		 */
		hasUserGesture(): boolean;
		/**
		 * @returns The file name of the download item.
		 * Note: The file name is not always the same as the actual one saved in local disk.
		 * If user changes the file name in a prompted download saving dialog,
		 * the actual name of saved file will be different.
		 */
		getFilename(): string;
		/**
		 * @returns The total size in bytes of the download item. If the size is unknown, it returns 0.
		 */
		getTotalBytes(): number;
		/**
		 * @returns The received bytes of the download item.
		 */
		getReceivedBytes(): number;
		/**
		 * @returns The Content-Disposition field from the response header.
		 */
		getContentDisposition(): string;
		/**
		 * @returns The current state.
		 */
		getState(): 'progressing' | 'completed' | 'cancelled' | 'interrupted';
	}

	// https://github.com/electron/electron/blob/master/docs/api/global-shortcut.md

	/**
	 * The globalShortcut module can register/unregister a global keyboard shortcut
	 * with the operating system so that you can customize the operations for various shortcuts.
	 * Note: The shortcut is global; it will work even if the app does not have the keyboard focus.
	 * You should not use this module until the ready event of the app module is emitted.
	 */
	interface GlobalShortcut {
		/**
		 * Registers a global shortcut of accelerator.
		 * @param accelerator Represents a keyboard shortcut. It can contain modifiers
		 * and key codes, combined by the "+" character.
		 * @param callback Called when the registered shortcut is pressed by the user.
		 */
		register(accelerator: string, callback: Function): void;
		/**
		 * @param accelerator Represents a keyboard shortcut. It can contain modifiers
		 * and key codes, combined by the "+" character.
		 * @returns Whether the accelerator is registered.
		 */
		isRegistered(accelerator: string): boolean;
		/**
		 * Unregisters the global shortcut of keycode.
		 * @param accelerator Represents a keyboard shortcut. It can contain modifiers
		 * and key codes, combined by the "+" character.
		 */
		unregister(accelerator: string): void;
		/**
		 * Unregisters all the global shortcuts.
		 */
		unregisterAll(): void;
	}

	// https://github.com/electron/electron/blob/master/docs/api/ipc-main.md

	/**
	 * The ipcMain module handles asynchronous and synchronous messages
	 * sent from a renderer process (web page).
	 * Messages sent from a renderer will be emitted to this module.
	 */
	interface IpcMain extends NodeJS.EventEmitter {
		addListener(channel: string, listener: IpcMainEventListener): this;
		on(channel: string, listener: IpcMainEventListener): this;
		once(channel: string, listener: IpcMainEventListener): this;
		removeListener(channel: string, listener: IpcMainEventListener): this;
		removeAllListeners(channel?: string): this;
	}

	type IpcMainEventListener = (event: IpcMainEvent, ...args: any[]) => void;

	interface IpcMainEvent {
		/**
		 * Set this to the value to be returned in a synchronous message.
		 */
		returnValue?: any;
		/**
		 * Returns the webContents that sent the message, you can call sender.send
		 * to reply to the asynchronous message.
		 */
		sender: WebContents;
	}

	// https://github.com/electron/electron/blob/master/docs/api/ipc-renderer.md

	/**
	 * The ipcRenderer module provides a few methods so you can send synchronous
	 * and asynchronous messages from the render process (web page) to the main process.
	 * You can also receive replies from the main process.
	 */
	interface IpcRenderer extends NodeJS.EventEmitter {
		addListener(channel: string, listener: IpcRendererEventListener): this;
		on(channel: string, listener: IpcRendererEventListener): this;
		once(channel: string, listener: IpcRendererEventListener): this;
		removeListener(channel: string, listener: IpcRendererEventListener): this;
		removeAllListeners(channel?: string): this;
		/**
		 * Send ...args to the renderer via channel in asynchronous message, the main
		 * process can handle it by listening to the channel event of ipc module.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Send ...args to the renderer via channel in synchronous message, and returns
		 * the result sent from main process. The main process can handle it by listening
		 * to the channel event of ipc module, and returns by setting event.returnValue.
		 * Note: Usually developers should never use this API, since sending synchronous
		 * message would block the whole renderer process.
		 * @returns The result sent from the main process.
		 */
		sendSync(channel: string, ...args: any[]): any;
		/**
		 * Like ipc.send but the message will be sent to the host page instead of the main process.
		 * This is mainly used by the page in <webview> to communicate with host page.
		 */
		sendToHost(channel: string, ...args: any[]): void;
	}

	type IpcRendererEventListener = (event: IpcRendererEvent, ...args: any[]) => void;

	interface IpcRendererEvent {
		/**
		 * You can call sender.send to reply to the asynchronous message.
		 */
		sender: IpcRenderer;
	}

	// https://github.com/electron/electron/blob/master/docs/api/menu-item.md
	// https://github.com/electron/electron/blob/master/docs/api/accelerator.md

	/**
	 * The MenuItem allows you to add items to an application or context menu.
	 */
	class MenuItem {
		/**
		 * Create a new menu item.
		 */
		constructor(options: MenuItemOptions);

		click: (menuItem: MenuItem, browserWindow: BrowserWindow, event: Event & Modifiers) => void;
		/**
		 * Read-only property.
		 */
		type: MenuItemType;
		/**
		 * Read-only property.
		 */
		role: MenuItemRole | MenuItemRoleMac;
		/**
		 * Read-only property.
		 */
		accelerator: string;
		/**
		 * Read-only property.
		 */
		icon: NativeImage | string;
		/**
		 * Read-only property.
		 */
		submenu: Menu | MenuItemOptions[];

		label: string;
		sublabel: string;
		enabled: boolean;
		visible: boolean;
		checked: boolean;
	}

	type MenuItemType = 'normal' | 'separator' | 'submenu' | 'checkbox' | 'radio';
	type MenuItemRole = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'pasteandmatchstyle' | 'selectall' | 'delete' | 'minimize' | 'close' | 'quit' | 'togglefullscreen' | 'resetzoom' | 'zoomin' | 'zoomout';
	type MenuItemRoleMac = 'about' | 'hide' | 'hideothers' | 'unhide' | 'startspeaking' | 'stopspeaking' | 'front' | 'zoom' | 'window' | 'help' | 'services';

	interface MenuItemOptions {
		/**
		 * Callback when the menu item is clicked.
		 */
		click?: (menuItem: MenuItem, browserWindow: BrowserWindow, event: Event & Modifiers) => void;
		/**
		 * Can be normal, separator, submenu, checkbox or radio.
		 */
		type?: MenuItemType;
		label?: string;
		sublabel?: string;
		/**
		 * An accelerator is string that represents a keyboard shortcut, it can contain
		 * multiple modifiers and key codes, combined by the + character.
		 *
		 * Examples:
		 *   CommandOrControl+A
		 *   CommandOrControl+Shift+Z
		 *
		 * Platform notice:
		 *   On Linux and Windows, the Command key would not have any effect,
		 *   you can use CommandOrControl which represents Command on macOS and Control on
		 *   Linux and Windows to define some accelerators.
		 *
		 *   Use Alt instead of Option. The Option key only exists on macOS, whereas
		 *   the Alt key is available on all platforms.
		 *
		 *   The Super key is mapped to the Windows key on Windows and Linux and Cmd on macOS.
		 *
		 * Available modifiers:
		 *   Command (or Cmd for short)
		 *   Control (or Ctrl for short)
		 *   CommandOrControl (or CmdOrCtrl for short)
		 *   Alt
		 *   Option
		 *   AltGr
		 *   Shift
		 *   Super
		 *
		 * Available key codes:
		 *   0 to 9
		 *   A to Z
		 *   F1 to F24
		 *   Punctuations like ~, !, @, #, $, etc.
		 *   Plus
		 *   Space
		 *   Tab
		 *   Backspace
		 *   Delete
		 *   Insert
		 *   Return (or Enter as alias)
		 *   Up, Down, Left and Right
		 *   Home and End
		 *   PageUp and PageDown
		 *   Escape (or Esc for short)
		 *   VolumeUp, VolumeDown and VolumeMute
		 *   MediaNextTrack, MediaPreviousTrack, MediaStop and MediaPlayPause
		 *   PrintScreen
		 */
		accelerator?: string;
		/**
		 * In Electron for the APIs that take images, you can pass either file paths
		 * or NativeImage instances. When passing null, an empty image will be used.
		 */
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
		 * Should only be specified for 'checkbox' or 'radio' type menu items.
		 */
		checked?: boolean;
		/**
		 * Should be specified for submenu type menu item, when it's specified the
		 * type: 'submenu' can be omitted for the menu item
		 */
		submenu?: Menu | MenuItemOptions[];
		/**
		 * Unique within a single menu. If defined then it can be used as a reference
		 * to this item by the position attribute.
		 */
		id?: string;
		/**
		 * This field allows fine-grained definition of the specific location within
		 * a given menu.
		 */
		position?: string;
		/**
		 * Define the action of the menu item, when specified the click property will be ignored
		 */
		role?: MenuItemRole | MenuItemRoleMac;
	}

	// https://github.com/electron/electron/blob/master/docs/api/menu.md

	/**
	 * The Menu class is used to create native menus that can be used as application
	 * menus and context menus. This module is a main process module which can be used
	 * in a render process via the remote module.
	 *
	 * Each menu consists of multiple menu items, and each menu item can have a submenu.
	 */
	class Menu extends NodeJS.EventEmitter {
		/**
		 * Creates a new menu.
		 */
		constructor();
		/**
		 * Sets menu as the application menu on macOS. On Windows and Linux, the menu
		 * will be set as each window's top menu.
		 */
		static setApplicationMenu(menu: Menu): void;
		/**
		 * @returns The application menu if set, or null if not set.
		 */
		static getApplicationMenu(): Menu;
		/**
		 * Sends the action to the first responder of application.
		 * This is used for emulating default Cocoa menu behaviors,
		 * usually you would just use the role property of MenuItem.
		 *
		 * Note: This method is macOS only.
		 */
		static sendActionToFirstResponder(action: string): void;
		/**
		 * @param template Generally, just an array of options for constructing MenuItem.
		 * You can also attach other fields to element of the template, and they will
		 * become properties of the constructed menu items.
		 */
		static buildFromTemplate(template: MenuItemOptions[]): Menu;
		/**
		 * Pops up this menu as a context menu in the browserWindow. You can optionally
		 * provide a (x,y) coordinate to place the menu at, otherwise it will be placed
		 * at the current mouse cursor position.
		 * @param x Horizontal coordinate where the menu will be placed.
		 * @param y Vertical coordinate where the menu will be placed.
		 */
		popup(browserWindow?: BrowserWindow, x?: number, y?: number): void;
		/**
		 * Appends the menuItem to the menu.
		 */
		append(menuItem: MenuItem): void;
		/**
		 * Inserts the menuItem to the pos position of the menu.
		 */
		insert(position: number, menuItem: MenuItem): void;
		/**
		 * @returns an array containing the menu’s items.
		 */
		items: MenuItem[];
	}

	// https://github.com/electron/electron/blob/master/docs/api/native-image.md

	/**
	 * This class is used to represent an image.
	 */
	class NativeImage {
		/**
		 * Creates an empty NativeImage instance.
		 */
		static createEmpty(): NativeImage;
		/**
		 * Creates a new NativeImage instance from file located at path.
		 * This method returns an empty image if the path does not exist, cannot be read, or is not a valid image.
		 */
		static createFromPath(path: string): NativeImage;
		/**
		 * Creates a new NativeImage instance from buffer.
		 * @param scaleFactor 1.0 by default.
		 */
		static createFromBuffer(buffer: Buffer, scaleFactor?: number): NativeImage;
		/**
		 * Creates a new NativeImage instance from dataURL
		 */
		static createFromDataURL(dataURL: string): NativeImage;
		/**
		 * @returns Buffer that contains the image's PNG encoded data.
		 */
		toPNG(): Buffer;
		/**
		 * @returns Buffer that contains the image's JPEG encoded data.
		 */
		toJPEG(quality: number): Buffer;
		/**
		 * @returns Buffer that contains a copy of the image's raw bitmap pixel data.
		 */
		toBitmap(): Buffer;
		/**
		 * @returns Buffer that contains the image's raw bitmap pixel data.
		 *
		 * The difference between getBitmap() and toBitmap() is, getBitmap() does not copy the bitmap data,
		 * so you have to use the returned Buffer immediately in current event loop tick,
		 * otherwise the data might be changed or destroyed.
		 */
		getBitmap(): Buffer;
		/**
		 * @returns The data URL of the image.
		 */
		toDataURL(): string;
		/**
		 * The native type of the handle is NSImage* on macOS.
		 * Note: This is only implemented on macOS.
		 * @returns The platform-specific handle of the image as Buffer.
		 */
		getNativeHandle(): Buffer;
		/**
		 * @returns Whether the image is empty.
		 */
		isEmpty(): boolean;
		/**
		 * @returns The size of the image.
		 */
		getSize(): Size;
		/**
		 * Marks the image as template image.
		 */
		setTemplateImage(option: boolean): void;
		/**
		 * Returns a boolean whether the image is a template image.
		 */
		isTemplateImage(): boolean;
	}

	// https://github.com/electron/electron/blob/master/docs/api/net.md

	/**
	 * The net module is a client-side API for issuing HTTP(S) requests.
	 * It is similar to the HTTP and HTTPS modules of Node.js but uses Chromium’s native
	 * networking library instead of the Node.js implementation, offering better support
	 * for web proxies.
	 * The following is a non-exhaustive list of why you may consider using the net module
	 * instead of the native Node.js modules:
	 * - Automatic management of system proxy configuration, support of the wpad protocol
	 * and proxy pac configuration files.
	 * - Automatic tunneling of HTTPS requests.
	 * - Support for authenticating proxies using basic, digest, NTLM, Kerberos or negotiate
	 * authentication schemes.
	 * - Support for traffic monitoring proxies: Fiddler-like proxies used for access control
	 * and monitoring.
	 *
	 * The net module API has been specifically designed to mimic, as closely as possible,
	 * the familiar Node.js API. The API components including classes, methods,
	 * properties and event names are similar to those commonly used in Node.js.
	 *
	 * The net API can be used only after the application emits the ready event.
	 * Trying to use the module before the ready event will throw an error.
	 */
	interface Net extends NodeJS.EventEmitter {
		/**
		 * @param options The ClientRequest constructor options.
		 * @param callback A one time listener for the response event.
		 *
		 * @returns a ClientRequest instance using the provided options which are directly
		 * forwarded to the ClientRequest constructor.
		 */
		request(options: string | RequestOptions, callback?: (response: IncomingMessage) => void): ClientRequest;
	}

	/**
	 * The RequestOptions interface allows to define various options for an HTTP request.
	 */
	interface RequestOptions {
		/**
		 * The HTTP request method. Defaults to the GET method.
		 */
		method?: string;
		/**
		 * The request URL. Must be provided in the absolute form with the protocol
		 * scheme specified as http or https.
		 */
		url?: string;
		/**
		 * The Session instance with which the request is associated.
		 */
		session?: Session;
		/**
		 * The name of the partition with which the request is associated.
		 * Defaults to the empty string. The session option prevails on partition.
		 * Thus if a session is explicitly specified, partition is ignored.
		 */
		partition?: string;
		/**
		 * The protocol scheme in the form ‘scheme:’. Currently supported values are ‘http:’ or ‘https:’.
		 * Defaults to ‘http:’.
		 */
		Protocol?: 'http:' | 'https:';
		/**
		 * The server host provided as a concatenation of the hostname and the port number ‘hostname:port’.
		 */
		host?: string;
		/**
		 * The server host name.
		 */
		hostname?: string;
		/**
		 * The server’s listening port number.
		 */
		port?: number;
		/**
		 * The path part of the request URL.
		 */
		path?: string;
		/**
		 * A map specifying extra HTTP header name/value.
		 */
		headers?: { [key: string]: any };
	}

	/**
	 * The ClientRequest class represents an HTTP request.
	 */
	class ClientRequest extends NodeJS.EventEmitter {
		/**
		 * Emitted when an HTTP response is received for the request.
		 */
		on(event: 'response', listener: (response: IncomingMessage) => void): this;
		/**
		 * Emitted when an authenticating proxy is asking for user credentials.
		 * The callback function is expected to be called back with user credentials.
		 * Providing empty credentials will cancel the request and report an authentication
		 * error on the response object.
		 */
		on(event: 'login', listener: (authInfo: LoginAuthInfo, callback: (username?: string, password?: string) => void) => void): this;
		/**
		 * Emitted just after the last chunk of the request’s data has been written into
		 * the request object.
		 */
		on(event: 'finish', listener: () => void): this;
		/**
		 * Emitted when the request is aborted. The abort event will not be fired if the
		 * request is already closed.
		 */
		on(event: 'abort', listener: () => void): this;
		/**
		 * Emitted when the net module fails to issue a network request.
		 * Typically when the request object emits an error event, a close event will
		 * subsequently follow and no response object will be provided.
		 */
		on(event: 'error', listener: (error: Error) => void): this;
		/**
		 * Emitted as the last event in the HTTP request-response transaction.
		 * The close event indicates that no more events will be emitted on either the
		 * request or response objects.
		 */
		on(event: 'close', listener: () => void): this;
		on(event: string, listener: Function): this;
		/**
		 * A Boolean specifying whether the request will use HTTP chunked transfer encoding or not.
		 * Defaults to false. The property is readable and writable, however it can be set only before
		 * the first write operation as the HTTP headers are not yet put on the wire.
		 * Trying to set the chunkedEncoding property after the first write will throw an error.
		 *
		 * Using chunked encoding is strongly recommended if you need to send a large request
		 * body as data will be streamed in small chunks instead of being internally buffered
		 * inside Electron process memory.
		 */
		chunkedEncoding: boolean;
		/**
		 * @param options If options is a String, it is interpreted as the request URL.
		 * If it is an object, it is expected to be a RequestOptions.
		 * @param callback A one time listener for the response event.
		 */
		constructor(options: string | RequestOptions, callback?: (response: IncomingMessage) => void);
		/**
		 * Adds an extra HTTP header. The header name will issued as it is without lowercasing.
		 * It can be called only before first write. Calling this method after the first write
		 * will throw an error.
		 * @param name An extra HTTP header name.
		 * @param value An extra HTTP header value.
		 */
		setHeader(name: string, value: string): void;
		/**
		 * @param name Specify an extra header name.
		 * @returns The value of a previously set extra header name.
		 */
		getHeader(name: string): string;
		/**
		 * Removes a previously set extra header name. This method can be called only before first write.
		 * Trying to call it after the first write will throw an error.
		 * @param name Specify an extra header name.
		 */
		removeHeader(name: string): void;
		/**
		 * Adds a chunk of data to the request body. The first write operation may cause the
		 * request headers to be issued on the wire.
		 * After the first write operation, it is not allowed to add or remove a custom header.
		 * @param chunk A chunk of the request body’s data. If it is a string, it is converted
		 * into a Buffer using the specified encoding.
		 * @param encoding Used to convert string chunks into Buffer objects. Defaults to ‘utf-8’.
		 * @param callback Called after the write operation ends.
		 */
		write(chunk: string | Buffer, encoding?: string, callback?: Function): boolean;
		/**
		 * Sends the last chunk of the request data. Subsequent write or end operations will not be allowed.
		 * The finish event is emitted just after the end operation.
		 * @param chunk A chunk of the request body’s data. If it is a string, it is converted into
		 * a Buffer using the specified encoding.
		 * @param encoding Used to convert string chunks into Buffer objects. Defaults to ‘utf-8’.
		 * @param callback Called after the write operation ends.
		 *
		 */
		end(chunk?: string | Buffer, encoding?: string, callback?: Function): boolean;
		/**
		 * Cancels an ongoing HTTP transaction. If the request has already emitted the close event,
		 * the abort operation will have no effect.
		 * Otherwise an ongoing event will emit abort and close events.
		 * Additionally, if there is an ongoing response object,it will emit the aborted event.
		 */
		abort(): void
	}

	/**
	 * An IncomingMessage represents an HTTP response.
	 */
	interface IncomingMessage extends NodeJS.ReadableStream {
		/**
		 * The data event is the usual method of transferring response data into applicative code.
		 */
		on(event: 'data', listener: (chunk: Buffer) => void): this;
		/**
		 * Indicates that response body has ended.
		 */
		on(event: 'end', listener: () => void): this;
		/**
		 * Emitted when a request has been canceled during an ongoing HTTP transaction.
		 */
		on(event: 'aborted', listener: () => void): this;
		/**
		 * Emitted when an error was encountered while streaming response data events.
		 * For instance, if the server closes the underlying while the response is still
		 * streaming, an error event will be emitted on the response object and a close
		 * event will subsequently follow on the request object.
		 */
		on(event: 'error', listener: (error: Error) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * An Integer indicating the HTTP response status code.
		 */
		statusCode: number;
		/**
		 * A String representing the HTTP status message.
		 */
		statusMessage: string;
		/**
		 * An object representing the response HTTP headers. The headers object is formatted as follows:
		 * - All header names are lowercased.
		 * - Each header name produces an array-valued property on the headers object.
		 * - Each header value is pushed into the array associated with its header name.
		 */
		headers: Headers;
		/**
		 * A string indicating the HTTP protocol version number. Typical values are ‘1.0’ or ‘1.1’.
		 */
		httpVersion: string;
		/**
		 * An integer-valued read-only property that returns the HTTP major version number.
		 */
		httpVersionMajor: number;
		/**
		 * An integer-valued read-only property that returns the HTTP minor version number.
		 */
		httpVersionMinor: number;
	}

	// https://github.com/electron/electron/blob/master/docs/api/power-monitor.md

	/**
	 * The power-monitor module is used to monitor power state changes.
	 * You should not use this module until the ready event of the app module is emitted.
	 */
	interface PowerMonitor extends NodeJS.EventEmitter {
		/**
		 * Emitted when the system is suspending.
		 */
		on(event: 'suspend', listener: Function): this;
		/**
		 * Emitted when system is resuming.
		 */
		on(event: 'resume', listener: Function): this;
		/**
		 * Emitted when the system changes to AC power.
		 */
		on(event: 'on-ac', listener: Function): this;
		/**
		 * Emitted when system changes to battery power.
		 */
		on(event: 'on-battery', listener: Function): this;
		on(event: string, listener: Function): this;
	}

	// https://github.com/electron/electron/blob/master/docs/api/power-save-blocker.md

	/**
	 * The powerSaveBlocker module is used to block the system from entering
	 * low-power (sleep) mode and thus allowing the app to keep the system and screen active.
	 */
	interface PowerSaveBlocker {
		/**
		 * Starts preventing the system from entering lower-power mode.
		 * @returns The blocker ID that is assigned to this power blocker.
		 * Note: prevent-display-sleep has higher has precedence over prevent-app-suspension.
		 */
		start(type: 'prevent-app-suspension' | 'prevent-display-sleep'): number;
		/**
		 * @param id The power save blocker id returned by powerSaveBlocker.start.
		 * Stops the specified power save blocker.
		 */
		stop(id: number): void;
		/**
		 * @param id The power save blocker id returned by powerSaveBlocker.start.
		 * @returns Whether the corresponding powerSaveBlocker has started.
		 */
		isStarted(id: number): boolean;
	}

	// https://github.com/electron/electron/blob/master/docs/api/protocol.md

	/**
	 * The protocol module can register a custom protocol or intercept an existing protocol.
	 */
	interface Protocol {
		/**
		 * Registers custom schemes as standard schemes.
		 */
		registerStandardSchemes(schemes: string[]): void;
		/**
		 * Registers custom schemes to handle service workers.
		 */
		registerServiceWorkerSchemes(schemes: string[]): void;
		/**
		 * Registers a protocol of scheme that will send the file as a response.
		 */
		registerFileProtocol(scheme: string, handler: FileProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send a Buffer as a response.
		 */
		registerBufferProtocol(scheme: string, handler: BufferProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send a String as a response.
		 */
		registerStringProtocol(scheme: string, handler: StringProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Registers a protocol of scheme that will send an HTTP request as a response.
		 */
		registerHttpProtocol(scheme: string, handler: HttpProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Unregisters the custom protocol of scheme.
		 */
		unregisterProtocol(scheme: string, completion?: (error: Error) => void): void;
		/**
		 * The callback will be called with a boolean that indicates whether there is already a handler for scheme.
		 */
		isProtocolHandled(scheme: string, callback: (handled: boolean) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol’s new handler which sends a file as a response.
		 */
		interceptFileProtocol(scheme: string, handler: FileProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol’s new handler which sends a Buffer as a response.
		 */
		interceptBufferProtocol(scheme: string, handler: BufferProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol’s new handler which sends a String as a response.
		 */
		interceptStringProtocol(scheme: string, handler: StringProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Intercepts scheme protocol and uses handler as the protocol’s new handler which sends a new HTTP request as a response.
		 */
		interceptHttpProtocol(scheme: string, handler: HttpProtocolHandler, completion?: (error: Error) => void): void;
		/**
		 * Remove the interceptor installed for scheme and restore its original handler.
		 */
		uninterceptProtocol(scheme: string, completion?: (error: Error) => void): void;
	}

	type FileProtocolHandler = (request: ProtocolRequest, callback: FileProtocolCallback) => void;
	type BufferProtocolHandler = (request: ProtocolRequest, callback: BufferProtocolCallback) => void;
	type StringProtocolHandler = (request: ProtocolRequest, callback: StringProtocolCallback) => void;
	type HttpProtocolHandler = (request: ProtocolRequest, callback: HttpProtocolCallback) => void;

	interface ProtocolRequest {
		url: string;
		referrer: string;
		method: string;
		uploadData?: {
			/**
			 * Content being sent.
			 */
			bytes: Buffer,
			/**
			 * Path of file being uploaded.
			 */
			file: string,
			/**
			 * UUID of blob data. Use session.getBlobData method to retrieve the data.
			 */
			blobUUID: string;
		}[];
	}

	interface ProtocolCallback {
		(error: number): void;
		(obj: {
			error: number
		}): void;
		(): void;
	}

	interface FileProtocolCallback extends ProtocolCallback {
		(filePath: string): void;
		(obj: {
			path: string
		}): void;
	}

	interface BufferProtocolCallback extends ProtocolCallback {
		(buffer: Buffer): void;
		(obj: {
			data: Buffer,
			mimeType: string,
			charset?: string
		}): void;
	}

	interface StringProtocolCallback extends ProtocolCallback {
		(str: string): void;
		(obj: {
			data: string,
			mimeType: string,
			charset?: string
		}): void;
	}

	interface HttpProtocolCallback extends ProtocolCallback {
		(redirectRequest: {
			url: string;
			method: string;
			session?: Object;
			uploadData?: {
				contentType: string;
				data: string;
			};
		}): void;
	}

	// https://github.com/electron/electron/blob/master/docs/api/remote.md

	/**
	 * The remote module provides a simple way to do inter-process communication (IPC)
	 * between the renderer process (web page) and the main process.
	 */
	interface Remote extends CommonElectron {
		/**
		 * @returns The object returned by require(module) in the main process.
		 */
		require(module: string): any;
		/**
		 * @returns The BrowserWindow object which this web page belongs to.
		 */
		getCurrentWindow(): BrowserWindow;
		/**
		 * @returns The WebContents object of this web page.
		 */
		getCurrentWebContents(): WebContents;
		/**
		 * @returns The global variable of name (e.g. global[name]) in the main process.
		 */
		getGlobal(name: string): any;
		/**
		 * Returns the process object in the main process. This is the same as
		 * remote.getGlobal('process'), but gets cached.
		 */
		process: NodeJS.Process;
	}

	// https://github.com/electron/electron/blob/master/docs/api/screen.md

	/**
	 * The Display object represents a physical display connected to the system.
	 * A fake Display may exist on a headless system, or a Display may correspond to a remote, virtual display.
	 */
	interface Display {
		/**
		 * Unique identifier associated with the display.
		 */
		id: number;
		bounds: Rectangle;
		workArea: Rectangle;
		size: Size;
		workAreaSize: Size;
		/**
		 * Output device’s pixel scale factor.
		 */
		scaleFactor: number;
		/**
		 * Can be 0, 90, 180, 270, represents screen rotation in clock-wise degrees.
		 */
		rotation: number;
		touchSupport: 'available' | 'unavailable' | 'unknown';
	}

	type DisplayMetrics = 'bounds' | 'workArea' | 'scaleFactor' | 'rotation';

	/**
	 * The screen module retrieves information about screen size, displays, cursor position, etc.
	 * You can not use this module until the ready event of the app module is emitted.
	 */
	interface Screen extends NodeJS.EventEmitter {
		/**
		 * Emitted when newDisplay has been added.
		 */
		on(event: 'display-added', listener: (event: Event, newDisplay: Display) => void): this;
		/**
		 * Emitted when oldDisplay has been removed.
		 */
		on(event: 'display-removed', listener: (event: Event, oldDisplay: Display) => void): this;
		/**
		 * Emitted when one or more metrics change in a display.
		 */
		on(event: 'display-metrics-changed', listener: (event: Event, display: Display, changedMetrics: DisplayMetrics[]) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * @returns The current absolute position of the mouse pointer.
		 */
		getCursorScreenPoint(): Point;
		/**
		 * @returns The primary display.
		 */
		getPrimaryDisplay(): Display;
		/**
		 * @returns An array of displays that are currently available.
		 */
		getAllDisplays(): Display[];
		/**
		 * @returns The display nearest the specified point.
		 */
		getDisplayNearestPoint(point: Point): Display;
		/**
		 * @returns The display that most closely intersects the provided bounds.
		 */
		getDisplayMatching(rect: Rectangle): Display;
	}

	// https://github.com/electron/electron/blob/master/docs/api/session.md

	/**
	 * The session module can be used to create new Session objects.
	 * You can also access the session of existing pages by using
	 * the session property of webContents which is a property of BrowserWindow.
	 */
	class Session extends NodeJS.EventEmitter {
		/**
		 * @returns a new Session instance from partition string.
		 */
		static fromPartition(partition: string, options?: FromPartitionOptions): Session;
		/**
		 * @returns the default session object of the app.
		 */
		static defaultSession: Session;
		/**
		 * Emitted when Electron is about to download item in webContents.
		 * Calling event.preventDefault() will cancel the download
		 * and item will not be available from next tick of the process.
		 */
		on(event: 'will-download', listener: (event: Event, item: DownloadItem, webContents: WebContents) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * The cookies gives you ability to query and modify cookies.
		 */
		cookies: SessionCookies;
		/**
		 * @returns the session’s current cache size.
		 */
		getCacheSize(callback: (size: number) => void): void;
		/**
		 * Clears the session’s HTTP cache.
		 */
		clearCache(callback: Function): void;
		/**
		 * Clears the data of web storages.
		 */
		clearStorageData(callback: Function): void;
		/**
		 * Clears the data of web storages.
		 */
		clearStorageData(options: ClearStorageDataOptions, callback: Function): void;
		/**
		 * Writes any unwritten DOMStorage data to disk.
		 */
		flushStorageData(): void;
		/**
		 * Sets the proxy settings.
		 */
		setProxy(config: ProxyConfig, callback: Function): void;
		/**
		 * Resolves the proxy information for url.
		 */
		resolveProxy(url: URL, callback: (proxy: string) => void): void;
		/**
		 * Sets download saving directory.
		 * By default, the download directory will be the Downloads under the respective app folder.
		 */
		setDownloadPath(path: string): void;
		/**
		 * Emulates network with the given configuration for the session.
		 */
		enableNetworkEmulation(options: NetworkEmulationOptions): void;
		/**
		 * Disables any network emulation already active for the session.
		 * Resets to the original network configuration.
		 */
		disableNetworkEmulation(): void;
		/**
		 * Sets the certificate verify proc for session, the proc will be called
		 * whenever a server certificate verification is requested.
		 *
		 * Calling setCertificateVerifyProc(null) will revert back to default certificate verify proc.
		 */
		setCertificateVerifyProc(proc: (hostname: string, cert: Certificate, callback: (accepted: boolean) => void) => void): void;
		/**
		 * Sets the handler which can be used to respond to permission requests for the session.
		 */
		setPermissionRequestHandler(handler: (webContents: WebContents, permission: Permission, callback: (allow: boolean) => void) => void): void;
		/**
		 * Clears the host resolver cache.
		 */
		clearHostResolverCache(callback: Function): void;
		/**
		 * Dynamically sets whether to always send credentials for HTTP NTLM or Negotiate authentication.
		 * @param domains Comma-seperated list of servers for which integrated authentication is enabled.
		 */
		allowNTLMCredentialsForDomains(domains: string): void;
		/**
		 * Overrides the userAgent and acceptLanguages for this session.
		 * The acceptLanguages must a comma separated ordered list of language codes, for example "en-US,fr,de,ko,zh-CN,ja".
		 * This doesn't affect existing WebContents, and each WebContents can use webContents.setUserAgent to override the session-wide user agent.
		 */
		setUserAgent(userAgent: string, acceptLanguages?: string): void;
		/**
		 * @returns The user agent for this session.
		 */
		getUserAgent(): string;
		/**
		 * Returns the blob data associated with the identifier.
		 */
		getBlobData(identifier: string, callback: (result: Buffer) => void): void;
		/**
		 * The webRequest API set allows to intercept and modify contents of a request at various stages of its lifetime.
		 */
		webRequest: WebRequest;
		/**
		 * @returns An instance of protocol module for this session.
		 */
		protocol: Protocol;
	}

	type Permission = 'media' | 'geolocation' | 'notifications' | 'midiSysex' | 'pointerLock' | 'fullscreen' | 'openExternal';

	interface FromPartitionOptions {
		/**
		 * Whether to enable cache.
		 */
		cache?: boolean;
	}

	interface ClearStorageDataOptions {
		/**
		 * Should follow window.location.origin’s representation scheme://host:port.
		 */
		origin?: string;
		/**
		 *  The types of storages to clear.
		 */
		storages?: ('appcache' | 'cookies' | 'filesystem' | 'indexdb' | 'localstorage' | 'shadercache' | 'websql' | 'serviceworkers')[];
		/**
		 * The types of quotas to clear.
		 */
		quotas?: ('temporary' | 'persistent' | 'syncable')[];
	}

	interface ProxyConfig {
		/**
		 * The URL associated with the PAC file.
		 */
		pacScript?: string;
		/**
		 * Rules indicating which proxies to use.
		 */
		proxyRules?: string;
		/**
		 * Rules indicating which URLs should bypass the proxy settings.
		 */
		proxyBypassRules?: string;
	}

	interface NetworkEmulationOptions {
		/**
		 * Whether to emulate network outage.
		 * Default: false.
		 */
		offline?: boolean;
		/**
		 * RTT in ms.
		 * Default: 0, which will disable latency throttling.
		 */
		latency?: number;
		/**
		 * Download rate in Bps.
		 * Default: 0, which will disable download throttling.
		 */
		downloadThroughput?: number;
		/**
		 * Upload rate in Bps.
		 * Default: 0, which will disable upload throttling.
		 */
		uploadThroughput?: number;
	}

	interface CookieFilter {
		/**
		 * Retrieves cookies which are associated with url. Empty implies retrieving cookies of all urls.
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

	interface Cookie {
		/**
		 * Emitted when a cookie is changed because it was added, edited, removed, or expired.
		 */
		on(event: 'changed', listener: (event: Event, cookie: Cookie, cause: CookieChangedCause) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * The name of the cookie.
		 */
		name: string;
		/**
		 * The value of the cookie.
		 */
		value: string;
		/**
		 * The domain of the cookie.
		 */
		domain: string;
		/**
		 * Whether the cookie is a host-only cookie.
		 */
		hostOnly: string;
		/**
		 * The path of the cookie.
		 */
		path: string;
		/**
		 * Whether the cookie is marked as secure.
		 */
		secure: boolean;
		/**
		 * Whether the cookie is marked as HTTP only.
		 */
		httpOnly: boolean;
		/**
		 * Whether the cookie is a session cookie or a persistent cookie with an expiration date.
		 */
		session: boolean;
		/**
		 * The expiration date of the cookie as the number of seconds since the UNIX epoch.
		 * Not provided for session cookies.
		 */
		expirationDate?: number;
	}

	type CookieChangedCause = 'explicit' | 'overwrite' | 'expired' | 'evicted' | 'expired-overwrite';

	interface CookieDetails {
		/**
		 * The URL associated with the cookie.
		 */
		url: string;
		/**
		 * The name of the cookie.
		 * Default: empty.
		 */
		name?: string;
		/**
		 * The value of the cookie.
		 * Default: empty.
		 */
		value?: string;
		/**
		 * The domain of the cookie.
		 * Default: empty.
		 */
		domain?: string;
		/**
		 * The path of the cookie.
		 * Default: empty.
		 */
		path?: string;
		/**
		 * Whether the cookie should be marked as secure.
		 * Default: false.
		 */
		secure?: boolean;
		/**
		 * Whether the cookie should be marked as HTTP only.
		 * Default: false.
		 */
		httpOnly?: boolean;
		/**
		 * The expiration date of the cookie as the number of seconds since the UNIX epoch.
		 * If omitted, the cookie becomes a session cookie.
		 */
		expirationDate?: number;
	}

	interface SessionCookies {
		/**
		 * Sends a request to get all cookies matching filter.
		 */
		get(filter: CookieFilter, callback: (error: Error, cookies: Cookie[]) => void): void;
		/**
		 * Sets the cookie with details.
		 */
		set(details: CookieDetails, callback: (error: Error) => void): void;
		/**
		 * Removes the cookies matching url and name.
		 */
		remove(url: string, name: string, callback: (error: Error) => void): void;
	}

	/**
	 * Each API accepts an optional filter and a listener, the listener will be called when the API's event has happened.
	 * Passing null as listener will unsubscribe from the event.
	 *
	 * The filter will be used to filter out the requests that do not match the URL patterns.
	 * If the filter is omitted then all requests will be matched.
	 *
	 * For certain events the listener is passed with a callback,
	 * which should be called with an response object when listener has done its work.
	 */
	interface WebRequest {
		/**
		 * The listener will be called when a request is about to occur.
		 */
		onBeforeRequest(listener: (details: WebRequest.BeforeRequestDetails, callback: WebRequest.BeforeRequestCallback) => void): void;
		/**
		 * The listener will be called when a request is about to occur.
		 */
		onBeforeRequest(filter: WebRequest.Filter, listener: (details: WebRequest.BeforeRequestDetails, callback: WebRequest.BeforeRequestCallback) => void): void;
		/**
		 * The listener will be called before sending an HTTP request, once the request headers are available.
		 * This may occur after a TCP connection is made to the server, but before any http data is sent.
		 */
		onBeforeSendHeaders(listener: (details: WebRequest.BeforeSendHeadersDetails, callback: WebRequest.BeforeSendHeadersCallback) => void): void;
		/**
		 * The listener will be called before sending an HTTP request, once the request headers are available.
		 * This may occur after a TCP connection is made to the server, but before any http data is sent.
		 */
		onBeforeSendHeaders(filter: WebRequest.Filter, listener: (details: WebRequest.BeforeSendHeadersDetails, callback: WebRequest.BeforeSendHeadersCallback) => void): void;
		/**
		 * The listener will be called just before a request is going to be sent to the server,
		 * modifications of previous onBeforeSendHeaders response are visible by the time this listener is fired.
		 */
		onSendHeaders(listener: (details: WebRequest.SendHeadersDetails) => void): void;
		/**
		 * The listener will be called just before a request is going to be sent to the server,
		 * modifications of previous onBeforeSendHeaders response are visible by the time this listener is fired.
		 */
		onSendHeaders(filter: WebRequest.Filter, listener: (details: WebRequest.SendHeadersDetails) => void): void;
		/**
		 * The listener will be called when HTTP response headers of a request have been received.
		 */
		onHeadersReceived(listener: (details: WebRequest.HeadersReceivedDetails, callback: WebRequest.HeadersReceivedCallback) => void): void;
		/**
		 * The listener will be called when HTTP response headers of a request have been received.
		 */
		onHeadersReceived(filter: WebRequest.Filter, listener: (details: WebRequest.HeadersReceivedDetails, callback: WebRequest.HeadersReceivedCallback) => void): void;
		/**
		 * The listener will be called when first byte of the response body is received.
		 * For HTTP requests, this means that the status line and response headers are available.
		 */
		onResponseStarted(listener: (details: WebRequest.ResponseStartedDetails) => void): void;
		/**
		 * The listener will be called when first byte of the response body is received.
		 * For HTTP requests, this means that the status line and response headers are available.
		 */
		onResponseStarted(filter: WebRequest.Filter, listener: (details: WebRequest.ResponseStartedDetails) => void): void;
		/**
		 * The listener will be called when a server initiated redirect is about to occur.
		 */
		onBeforeRedirect(listener: (details: WebRequest.BeforeRedirectDetails) => void): void;
		/**
		 * The listener will be called when a server initiated redirect is about to occur.
		 */
		onBeforeRedirect(filter: WebRequest.Filter, listener: (details: WebRequest.BeforeRedirectDetails) => void): void;
		/**
		 * The listener will be called when a request is completed.
		 */
		onCompleted(listener: (details: WebRequest.CompletedDetails) => void): void;
		/**
		 * The listener will be called when a request is completed.
		 */
		onCompleted(filter: WebRequest.Filter, listener: (details: WebRequest.CompletedDetails) => void): void;
		/**
		 * The listener will be called when an error occurs.
		 */
		onErrorOccurred(listener: (details: WebRequest.ErrorOccurredDetails) => void): void;
		/**
		 * The listener will be called when an error occurs.
		 */
		onErrorOccurred(filter: WebRequest.Filter, listener: (details: WebRequest.ErrorOccurredDetails) => void): void;
	}

	namespace WebRequest {
		interface Filter {
			urls: string[];
		}

		interface Details {
			id: number;
			url: string;
			method: string;
			resourceType: string;
			timestamp: number;
		}

		interface UploadData {
			/**
			 * Content being sent.
			 */
			bytes: Buffer;
			/**
			 * Path of file being uploaded.
			 */
			file: string;
			/**
			 * UUID of blob data. Use session.getBlobData method to retrieve the data.
			 */
			blobUUID: string;
		}

		interface BeforeRequestDetails extends Details {
			uploadData?: UploadData[];
		}

		type BeforeRequestCallback = (response: {
			cancel?: boolean;
			/**
			 * The original request is prevented from being sent or completed, and is instead redirected to the given URL.
			 */
			redirectURL?: string;
		}) => void;

		interface BeforeSendHeadersDetails extends Details {
			requestHeaders: Headers;
		}

		type BeforeSendHeadersCallback = (response: {
			cancel?: boolean;
			/**
			 * When provided, request will be made with these headers.
			 */
			requestHeaders?: Headers;
		}) => void;

		interface SendHeadersDetails extends Details {
			requestHeaders: Headers;
		}

		interface HeadersReceivedDetails extends Details {
			statusLine: string;
			statusCode: number;
			responseHeaders: Headers;
		}

		type HeadersReceivedCallback = (response: {
			cancel?: boolean;
			/**
			 * When provided, the server is assumed to have responded with these headers.
			 */
			responseHeaders?: Headers;
			/**
			 * Should be provided when overriding responseHeaders to change header status
			 * otherwise original response header's status will be used.
			 */
			statusLine?: string;
		}) => void;

		interface ResponseStartedDetails extends Details {
			responseHeaders: Headers;
			fromCache: boolean;
			statusCode: number;
			statusLine: string;
		}

		interface BeforeRedirectDetails extends Details {
			redirectURL: string;
			statusCode: number;
			ip?: string;
			fromCache: boolean;
			responseHeaders: Headers;
		}

		interface CompletedDetails extends Details {
			responseHeaders: Headers;
			fromCache: boolean;
			statusCode: number;
			statusLine: string;
		}

		interface ErrorOccurredDetails extends Details {
			fromCache: boolean;
			error: string;
		}
	}

	// https://github.com/electron/electron/blob/master/docs/api/shell.md

	/**
	 * The shell module provides functions related to desktop integration.
	 */
	interface Shell {
		/**
		 * Show the given file in a file manager. If possible, select the file.
		 * @returns Whether the item was successfully shown.
		 */
		showItemInFolder(fullPath: string): boolean;
		/**
		 * Open the given file in the desktop's default manner.
		 * @returns Whether the item was successfully shown.
		 */
		openItem(fullPath: string): boolean;
		/**
		 * Open the given external protocol URL in the desktop's default manner
		 * (e.g., mailto: URLs in the default mail user agent).
		 * @returns Whether an application was available to open the URL.
		 */
		openExternal(url: string, options?: {
			/**
			 * Bring the opened application to the foreground.
			 * Default: true.
			 */
			activate: boolean;
		}): boolean;
		/**
		 * Move the given file to trash.
		 * @returns Whether the item was successfully moved to the trash.
		 */
		moveItemToTrash(fullPath: string): boolean;
		/**
		 * Play the beep sound.
		 */
		beep(): void;
		/**
		 * Creates or updates a shortcut link at shortcutPath.
		 *
		 * Note: This API is available only on Windows.
		 */
		writeShortcutLink(shortcutPath: string, options: ShortcutLinkOptions): boolean;
		/**
		 * Creates or updates a shortcut link at shortcutPath.
		 *
		 * Note: This API is available only on Windows.
		 */
		writeShortcutLink(shortcutPath: string, operation: 'create' | 'update' | 'replace', options: ShortcutLinkOptions): boolean;
		/**
		 * Resolves the shortcut link at shortcutPath.
		 * An exception will be thrown when any error happens.
		 *
		 * Note: This API is available only on Windows.
		 */
		readShortcutLink(shortcutPath: string): ShortcutLinkOptions;
	}

	interface ShortcutLinkOptions {
		/**
		 * The target to launch from this shortcut.
		 */
		target: string;
		/**
		 * The working directory.
		 * Default: empty.
		 */
		cwd?: string;
		/**
		 * The arguments to be applied to target when launching from this shortcut.
		 * Default: empty.
		 */
		args?: string;
		/**
		 * The description of the shortcut.
		 * Default: empty.
		 */
		description?: string;
		/**
		 * The path to the icon, can be a DLL or EXE. icon and iconIndex have to be set together.
		 * Default: empty, which uses the target's icon.
		 */
		icon?: string;
		/**
		 * The resource ID of icon when icon is a DLL or EXE.
		 * Default: 0.
		 */
		iconIndex?: number;
		/**
		 * The Application User Model ID.
		 * Default: empty.
		 */
		appUserModelId?: string;
	}

	// https://github.com/electron/electron/blob/master/docs/api/system-preferences.md

	type SystemColor =
		'3d-dark-shadow' |            // Dark shadow for three-dimensional display elements.
		'3d-face' |                   // Face color for three-dimensional display elements and for dialog box backgrounds.
		'3d-highlight' |              // Highlight color for three-dimensional display elements.
		'3d-light' |                  // Light color for three-dimensional display elements.
		'3d-shadow' |                 // Shadow color for three-dimensional display elements.
		'active-border' |             // Active window border.
		'active-caption' |            // Active window title bar. Specifies the left side color in the color gradient of an active window's title bar if the gradient effect is enabled.
		'active-caption-gradient' |   // Right side color in the color gradient of an active window's title bar.
		'app-workspace' |             // Background color of multiple document interface (MDI) applications.
		'button-text' |               // Text on push buttons.
		'caption-text' |              // Text in caption, size box, and scroll bar arrow box.
		'desktop' |                   // Desktop background color.
		'disabled-text' |             // Grayed (disabled) text.
		'highlight' |                 // Item(s) selected in a control.
		'highlight-text' |            // Text of item(s) selected in a control.
		'hotlight' |                  // Color for a hyperlink or hot-tracked item.
		'inactive-border' |           // Inactive window border.
		'inactive-caption' |          // Inactive window caption. Specifies the left side color in the color gradient of an inactive window's title bar if the gradient effect is enabled.
		'inactive-caption-gradient' | // Right side color in the color gradient of an inactive window's title bar.
		'inactive-caption-text' |     // Color of text in an inactive caption.
		'info-background' |           // Background color for tooltip controls.
		'info-text' |                 // Text color for tooltip controls.
		'menu' |                      // Menu background.
		'menu-highlight' |            // The color used to highlight menu items when the menu appears as a flat menu.
		'menubar' |                   // The background color for the menu bar when menus appear as flat menus.
		'menu-text' |                 // Text in menus.
		'scrollbar' |                 // Scroll bar gray area.
		'window' |                    // Window background.
		'window-frame' |              // Window frame.
		'window-text'; // Text in windows.

	/**
	 * Get system preferences.
	 */
	interface SystemPreferences {
		/**
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'accent-color-changed', listener: (event: Event, newColor: string) => void): this;
		/**
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'color-changed', listener: (event: Event) => void): this;
		/**
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'inverted-color-scheme-changed', listener: (
			event: Event,
			/**
			 * @param invertedColorScheme true if an inverted color scheme, such as a high contrast theme, is being used, false otherwise.
			 */
			invertedColorScheme: boolean
		) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * @returns Whether the system is in Dark Mode.
		 *
		 * Note: This is only implemented on macOS.
		 */
		isDarkMode(): boolean;
		/**
		 * @returns Whether the Swipe between pages setting is on.
		 *
		 * Note: This is only implemented on macOS.
		 */
		isSwipeTrackingFromScrollEventsEnabled(): boolean;
		/**
		 * Posts event as native notifications of macOS.
		 * The userInfo contains the user information dictionary sent along with the notification.
		 *
		 * Note: This is only implemented on macOS.
		 */
		postNotification(event: string, userInfo: Object): void;
		/**
		 * Posts event as native notifications of macOS.
		 * The userInfo contains the user information dictionary sent along with the notification.
		 *
		 * Note: This is only implemented on macOS.
		 */
		postLocalNotification(event: string, userInfo: Object): void;
		/**
		 * Subscribes to native notifications of macOS, callback will be called when the corresponding event happens.
		 * The id of the subscriber is returned, which can be used to unsubscribe the event.
		 *
		 * Note: This is only implemented on macOS.
		 */
		subscribeNotification(event: string, callback: (event: Event, userInfo: Object) => void): number;
		/**
		 * Removes the subscriber with id.
		 *
		 * Note: This is only implemented on macOS.
		 */
		unsubscribeNotification(id: number): void;
		/**
		 * Same as subscribeNotification, but uses NSNotificationCenter for local defaults.
		 */
		subscribeLocalNotification(event: string, callback: (event: Event, userInfo: Object) => void): number;
		/**
		 * Same as unsubscribeNotification, but removes the subscriber from NSNotificationCenter.
		 */
		unsubscribeLocalNotification(id: number): void;
		/**
		 * Get the value of key in system preferences.
		 *
		 * Note: This is only implemented on macOS.
		 */
		getUserDefault(key: string, type: 'string' | 'boolean' | 'integer' | 'float' | 'double' | 'url' | 'array' | 'dictionary'): any;
		/**
		 * @returns Whether DWM composition (Aero Glass) is enabled.
		 *
		 * Note: This is only implemented on Windows.
		 */
		isAeroGlassEnabled(): boolean;
		/**
		 * @returns The users current system wide color preference in the form of an RGBA hexadecimal string.
		 *
		 * Note: This is only implemented on Windows.
		 */
		getAccentColor(): string;
		/**
		 * @returns true if an inverted color scheme, such as a high contrast theme, is active, false otherwise.
		 *
		 * Note: This is only implemented on Windows.
		 */
		isInvertedColorScheme(): boolean;
		/**
		 * @returns The system color setting in RGB hexadecimal form (#ABCDEF). See the Windows docs for more details.
		 *
		 * Note: This is only implemented on Windows.
		 */
		getColor(color: SystemColor): string;
	}

	// https://github.com/electron/electron/blob/master/docs/api/tray.md

	/**
	 * A Tray represents an icon in an operating system's notification area.
	 */
	class Tray extends NodeJS.EventEmitter implements Destroyable {
		/**
		 * Emitted when the tray icon is clicked.
		 * Note: The bounds payload is only implemented on macOS and Windows.
		 */
		on(event: 'click', listener: (modifiers: Modifiers, bounds: Rectangle) => void): this;
		/**
		 * Emitted when the tray icon is right clicked.
		 * Note: This is only implemented on macOS and Windows.
		 */
		on(event: 'right-click', listener: (modifiers: Modifiers, bounds: Rectangle) => void): this;
		/**
		 * Emitted when the tray icon is double clicked.
		 * Note: This is only implemented on macOS and Windows.
		 */
		on(event: 'double-click', listener: (modifiers: Modifiers, bounds: Rectangle) => void): this;
		/**
		 * Emitted when the tray balloon shows.
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'balloon-show', listener: Function): this;
		/**
		 * Emitted when the tray balloon is clicked.
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'balloon-click', listener: Function): this;
		/**
		 * Emitted when the tray balloon is closed because of timeout or user manually closes it.
		 * Note: This is only implemented on Windows.
		 */
		on(event: 'balloon-closed', listener: Function): this;
		/**
		 * Emitted when any dragged items are dropped on the tray icon.
		 * Note: This is only implemented on macOS.
		 */
		on(event: 'drop', listener: Function): this;
		/**
		 * Emitted when dragged files are dropped in the tray icon.
		 * Note: This is only implemented on macOS
		 */
		on(event: 'drop-files', listener: (event: Event, files: string[]) => void): this;
		/**
		 * Emitted when dragged text is dropped in the tray icon.
		 * Note: This is only implemented on macOS
		 */
		on(event: 'drop-text', listener: (event: Event, text: string) => void): this;
		/**
		 * Emitted when a drag operation enters the tray icon.
		 * Note: This is only implemented on macOS
		 */
		on(event: 'drag-enter', listener: Function): this;
		/**
		 * Emitted when a drag operation exits the tray icon.
		 * Note: This is only implemented on macOS
		 */
		on(event: 'drag-leave', listener: Function): this;
		/**
		 * Emitted when a drag operation ends on the tray or ends at another location.
		 * Note: This is only implemented on macOS
		 */
		on(event: 'drag-end', listener: Function): this;
		on(event: string, listener: Function): this;
		/**
		 * Creates a new tray icon associated with the image.
		 */
		constructor(image: NativeImage | string);
		/**
		 * Destroys the tray icon immediately.
		 */
		destroy(): void;
		/**
		 * Sets the image associated with this tray icon.
		 */
		setImage(image: NativeImage | string): void;
		/**
		 * Sets the image associated with this tray icon when pressed.
		 */
		setPressedImage(image: NativeImage): void;
		/**
		 * Sets the hover text for this tray icon.
		 */
		setToolTip(toolTip: string): void;
		/**
		 * Sets the title displayed aside of the tray icon in the status bar.
		 * Note: This is only implemented on macOS.
		 */
		setTitle(title: string): void;
		/**
		 * Sets when the tray's icon background becomes highlighted.
		 * Note: This is only implemented on macOS.
		 */
		setHighlightMode(mode: 'selection' | 'always' | 'never'): void;
		/**
		 * Displays a tray balloon.
		 * Note: This is only implemented on Windows.
		 */
		displayBalloon(options?: {
			icon?: NativeImage;
			title?: string;
			content?: string;
		}): void;
		/**
		 * Pops up the context menu of tray icon. When menu is passed,
		 * the menu will showed instead of the tray's context menu.
		 * The position is only available on Windows, and it is (0, 0) by default.
		 * Note: This is only implemented on macOS and Windows.
		 */
		popUpContextMenu(menu?: Menu, position?: Point): void;
		/**
		 * Sets the context menu for this icon.
		 */
		setContextMenu(menu: Menu): void;
		/**
		 * @returns The bounds of this tray icon.
		 */
		getBounds(): Rectangle;
		/**
		 * @returns Whether the tray icon is destroyed.
		 */
		isDestroyed(): boolean;
	}

	interface Modifiers {
		altKey: boolean;
		shiftKey: boolean;
		ctrlKey: boolean;
		metaKey: boolean;
	}

	interface DragItem {
		/**
		* The absolute path of the file to be dragged
		*/
		file: string;
		/**
		* The image showing under the cursor when dragging.
		*/
		icon: NativeImage;
	}

	// https://github.com/electron/electron/blob/master/docs/api/web-contents.md

	interface WebContentsStatic {
		/**
		 * @returns An array of all WebContents instances. This will contain web contents for all windows,
		 * webviews, opened devtools, and devtools extension background pages.
		 */
		getAllWebContents(): WebContents[];
		/**
		 * @returns The web contents that is focused in this application, otherwise returns null.
		 */
		getFocusedWebContents(): WebContents;
		/**
		 * Find a WebContents instance according to its ID.
		 */
		fromId(id: number): WebContents;
	}

	/**
	 * A WebContents is responsible for rendering and controlling a web page.
	 */
	interface WebContents extends NodeJS.EventEmitter {
		/**
		 * Emitted when the navigation is done, i.e. the spinner of the tab has stopped spinning,
		 * and the onload event was dispatched.
		 */
		on(event: 'did-finish-load', listener: Function): this;
		/**
		 * This event is like did-finish-load but emitted when the load failed or was cancelled,
		 * e.g. window.stop() is invoked.
		 */
		on(event: 'did-fail-load', listener: (event: Event, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => void): this;
		/**
		 * Emitted when a frame has done navigation.
		 */
		on(event: 'did-frame-finish-load', listener: (event: Event, isMainFrame: boolean) => void): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab started spinning.
		 */
		on(event: 'did-start-loading', listener: Function): this;
		/**
		 * Corresponds to the points in time when the spinner of the tab stopped spinning.
		 */
		on(event: 'did-stop-loading', listener: Function): this;
		/**
		 * Emitted when details regarding a requested resource are available.
		 * status indicates the socket connection to download the resource.
		 */
		on(event: 'did-get-response-details', listener: (event: Event,
			status: boolean,
			newURL: string,
			originalURL: string,
			httpResponseCode: number,
			requestMethod: string,
			referrer: string,
			headers: Headers,
			resourceType: string
		) => void): this;
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
			headers: Headers
		) => void): this;
		/**
		 * Emitted when the document in the given frame is loaded.
		 */
		on(event: 'dom-ready', listener: (event: Event) => void): this;
		/**
		 * Emitted when page receives favicon URLs.
		 */
		on(event: 'page-favicon-updated', listener: (event: Event, favicons: string[]) => void): this;
		/**
		 * Emitted when the page requests to open a new window for a url.
		 * It could be requested by window.open or an external link like <a target='_blank'>.
		 *
		 * By default a new BrowserWindow will be created for the url.
		 *
		 * Calling event.preventDefault() will prevent creating new windows.
		 */
		on(event: 'new-window', listener: (event: Event,
			url: string,
			frameName: string,
			disposition: NewWindowDisposition,
			options: BrowserWindowOptions
		) => void): this;
		/**
		 * Emitted when a user or the page wants to start navigation.
		 * It can happen when the window.location object is changed or a user clicks a link in the page.
		 *
		 * This event will not emit when the navigation is started programmatically with APIs like
		 * webContents.loadURL and webContents.back.
		 *
		 * It is also not emitted for in-page navigations, such as clicking anchor links
		 * or updating the window.location.hash. Use did-navigate-in-page event for this purpose.
		 *
		 * Calling event.preventDefault() will prevent the navigation.
		 */
		on(event: 'will-navigate', listener: (event: Event, url: string) => void): this;
		/**
		 * Emitted when a navigation is done.
		 *
		 * This event is not emitted for in-page navigations, such as clicking anchor links
		 * or updating the window.location.hash. Use did-navigate-in-page event for this purpose.
		 */
		on(event: 'did-navigate', listener: (event: Event, url: string) => void): this;
		/**
		 * Emitted when an in-page navigation happened.
		 *
		 * When in-page navigation happens, the page URL changes but does not cause
		 * navigation outside of the page. Examples of this occurring are when anchor links
		 * are clicked or when the DOM hashchange event is triggered.
		 */
		on(event: 'did-navigate-in-page', listener: (event: Event, url: string, isMainFrame: boolean) => void): this;
		/**
		 * Emitted when the renderer process has crashed.
		 */
		on(event: 'crashed', listener: (event: Event, killed: boolean) => void): this;
		/**
		 * Emitted when a plugin process has crashed.
		 */
		on(event: 'plugin-crashed', listener: (event: Event, name: string, version: string) => void): this;
		/**
		 * Emitted when webContents is destroyed.
		 */
		on(event: 'destroyed', listener: Function): this;
		/**
		 * Emitted when DevTools is opened.
		 */
		on(event: 'devtools-opened', listener: Function): this;
		/**
		 * Emitted when DevTools is closed.
		 */
		on(event: 'devtools-closed', listener: Function): this;
		/**
		 * Emitted when DevTools is focused / opened.
		 */
		on(event: 'devtools-focused', listener: Function): this;
		/**
		 * Emitted when failed to verify the certificate for url.
		 * The usage is the same with the "certificate-error" event of app.
		 */
		on(event: 'certificate-error', listener: (event: Event,
			url: string,
			error: string,
			certificate: Certificate,
			callback: (trust: boolean) => void
		) => void): this;
		/**
		 * Emitted when a client certificate is requested.
		 * The usage is the same with the "select-client-certificate" event of app.
		 */
		on(event: 'select-client-certificate', listener: (event: Event,
			url: string,
			certificateList: Certificate[],
			callback: (certificate: Certificate) => void
		) => void): this;
		/**
		 * Emitted when webContents wants to do basic auth.
		 * The usage is the same with the "login" event of app.
		 */
		on(event: 'login', listener: (event: Event,
			request: LoginRequest,
			authInfo: LoginAuthInfo,
			callback: (username: string, password: string) => void
		) => void): this;
		/**
		 * Emitted when a result is available for webContents.findInPage request.
		 */
		on(event: 'found-in-page', listener: (event: Event, result: FoundInPageResult) => void): this;
		/**
		 * Emitted when media starts playing.
		 */
		on(event: 'media-started-playing', listener: Function): this;
		/**
		 * Emitted when media is paused or done playing.
		 */
		on(event: 'media-paused', listener: Function): this;
		/**
		 * Emitted when a page’s theme color changes. This is usually due to encountering a meta tag:
		 * <meta name='theme-color' content='#ff0000'>
		 */
		on(event: 'did-change-theme-color', listener: Function): this;
		/**
		 * Emitted when mouse moves over a link or the keyboard moves the focus to a link.
		 */
		on(event: 'update-target-url', listener: (event: Event, url: string) => void): this;
		/**
		 * Emitted when the cursor’s type changes.
		 * If the type parameter is custom, the image parameter will hold the custom cursor image
		 * in a NativeImage, and scale, size and hotspot will hold additional information about the custom cursor.
		 */
		on(event: 'cursor-changed', listener: (event: Event, type: CursorType, image?: NativeImage, scale?: number, size?: Size, hotspot?: Point) => void): this;
		/**
		 * Emitted when there is a new context menu that needs to be handled.
		 */
		on(event: 'context-menu', listener: (event: Event, params: ContextMenuParams) => void): this;
		/**
		 * Emitted when bluetooth device needs to be selected on call to navigator.bluetooth.requestDevice.
		 * To use navigator.bluetooth api webBluetooth should be enabled.
		 * If event.preventDefault is not called, first available device will be selected.
		 * callback should be called with deviceId to be selected,
		 * passing empty string to callback will cancel the request.
		 */
		on(event: 'select-bluetooth-device', listener: (event: Event, deviceList: BluetoothDevice[], callback: (deviceId: string) => void) => void): this;
		/**
		 * Emitted when a new frame is generated. Only the dirty area is passed in the buffer.
		 */
		on(event: 'paint', listener: (event: Event, dirtyRect: Rectangle, image: NativeImage) => void): this;
		on(event: string, listener: Function): this;
		/**
		 * Loads the url in the window.
		 * @param url Must contain the protocol prefix (e.g., the http:// or file://).
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * Initiates a download of the resource at url without navigating.
		 * The will-download event of session will be triggered.
		 */
		downloadURL(url: string): void;
		/**
		 * @returns The URL of current web page.
		 */
		getURL(): string;
		/**
		 * @returns The title of web page.
		 */
		getTitle(): string;
		/**
		 * @returns Whether the web page is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * @returns Whether the web page is focused.
		 */
		isFocused(): boolean;
		/**
		 * @returns Whether web page is still loading resources.
		 */
		isLoading(): boolean;
		/**
		 * @returns Whether the main frame (and not just iframes or frames within it) is still loading.
		 */
		isLoadingMainFrame(): boolean;
		/**
		 * @returns Whether web page is waiting for a first-response for the main
		 * resource of the page.
		 */
		isWaitingForResponse(): boolean;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Reloads current page.
		 */
		reload(): void;
		/**
		 * Reloads current page and ignores cache.
		 */
		reloadIgnoringCache(): void;
		/**
		 * @returns Whether the web page can go back.
		 */
		canGoBack(): boolean;
		/**
		 * @returns Whether the web page can go forward.
		 */
		canGoForward(): boolean;
		/**
		 * @returns Whether the web page can go to offset.
		 */
		canGoToOffset(offset: number): boolean;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
		/**
		 * Makes the web page go back.
		 */
		goBack(): void;
		/**
		 * Makes the web page go forward.
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
		 * @returns Whether the renderer process has crashed.
		 */
		isCrashed(): boolean;
		/**
		 * Overrides the user agent for this page.
		 */
		setUserAgent(userAgent: string): void;
		/**
		 * @returns The user agent for this web page.
		 */
		getUserAgent(): string;
		/**
		 * Injects CSS into this page.
		 */
		insertCSS(css: string): void;
		/**
		 * Evaluates code in page.
		 * @param code Code to evaluate.
		 *
		 * @returns Promise
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
		/**
		 * Mute the audio on the current web page.
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * @returns Whether this page has been muted.
		 */
		isAudioMuted(): boolean;
		/**
		 * Changes the zoom factor to the specified factor.
		 * Zoom factor is zoom percent divided by 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Sends a request to get current zoom factor.
		 */
		getZoomFactor(callback: (zoomFactor: number) => void): void;
		/**
		 * Changes the zoom level to the specified level.
		 * The original size is 0 and each increment above or below represents
		 * zooming 20% larger or smaller to default limits of 300% and 50% of original size, respectively.
		 */
		setZoomLevel(level: number): void;
		/**
		 * Sends a request to get current zoom level.
		 */
		getZoomLevel(callback: (zoomLevel: number) => void): void;
		/**
		 * Sets the maximum and minimum zoom level.
		 */
		setZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Executes the editing command undo in web page.
		 */
		undo(): void;
		/**
		 * Executes the editing command redo in web page.
		 */
		redo(): void;
		/**
		 * Executes the editing command cut in web page.
		 */
		cut(): void;
		/**
		 * Executes the editing command copy in web page.
		 */
		copy(): void;
		/**
		 * Copy the image at the given position to the clipboard.
		 */
		copyImageAt(x: number, y: number): void;
		/**
		 * Executes the editing command paste in web page.
		 */
		paste(): void;
		/**
		 * Executes the editing command pasteAndMatchStyle in web page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Executes the editing command delete in web page.
		 */
		delete(): void;
		/**
		 * Executes the editing command selectAll in web page.
		 */
		selectAll(): void;
		/**
		 * Executes the editing command unselect in web page.
		 */
		unselect(): void;
		/**
		 * Executes the editing command replace in web page.
		 */
		replace(text: string): void;
		/**
		 * Executes the editing command replaceMisspelling in web page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Starts a request to find all matches for the text in the web page.
		 * The result of the request can be obtained by subscribing to found-in-page event.
		 * @returns The request id used for the request.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		/**
		 * Stops any findInPage request for the webContents with the provided action.
		 */
		stopFindInPage(action: StopFindInPageAtion): void;
		/**
		 * Checks if any serviceworker is registered.
		 */
		hasServiceWorker(callback: (hasServiceWorker: boolean) => void): void;
		/**
		 * Unregisters any serviceworker if present.
		 */
		unregisterServiceWorker(callback: (isFulfilled: boolean) => void): void;
		/**
		 * Prints window's web page. When silent is set to false, Electron will pick up system's default printer and default settings for printing.
		 * Calling window.print() in web page is equivalent to call WebContents.print({silent: false, printBackground: false}).
		 * Note: On Windows, the print API relies on pdf.dll. If your application doesn't need print feature, you can safely remove pdf.dll in saving binary size.
		 */
		print(options?: PrintOptions): void;
		/**
		 * Prints windows' web page as PDF with Chromium's preview printing custom settings.
		 */
		printToPDF(options: PrintToPDFOptions, callback: (error: Error, data: Buffer) => void): void;
		/**
		 * Adds the specified path to DevTools workspace.
		 */
		addWorkSpace(path: string): void;
		/**
		 * Removes the specified path from DevTools workspace.
		 */
		removeWorkSpace(path: string): void;
		/**
		 * Opens the developer tools.
		 */
		openDevTools(options?: {
			/**
			 * Opens the devtools with specified dock state. Defaults to last used dock state.
			 */
			mode?: 'right' | 'bottom' | 'undocked' | 'detach'
		}): void;
		/**
		 * Closes the developer tools.
		 */
		closeDevTools(): void;
		/**
		 * Returns whether the developer tools are opened.
		 */
		isDevToolsOpened(): boolean;
		/**
		 * Returns whether the developer tools are focussed.
		 */
		isDevToolsFocused(): boolean;
		/**
		 * Toggle the developer tools.
		 */
		toggleDevTools(): void;
		/**
		 * Starts inspecting element at position (x, y).
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the developer tools for the service worker context.
		 */
		inspectServiceWorker(): void;
		/**
		 * Send args.. to the web page via channel in asynchronous message, the web page
		 * can handle it by listening to the channel event of ipc module.
		 * Note:
		 *   1. The IPC message handler in web pages do not have a event parameter,
		 *      which is different from the handlers on the main process.
		 *   2. There is no way to send synchronous messages from the main process
		 *      to a renderer process, because it would be very easy to cause dead locks.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Enable device emulation with the given parameters.
		 */
		enableDeviceEmulation(parameters: DeviceEmulationParameters): void;
		/**
		 * Disable device emulation.
		 */
		disableDeviceEmulation(): void;
		/**
		 * Sends an input event to the page.
		 */
		sendInputEvent(event: SendInputEvent): void;
		/**
		 * Begin subscribing for presentation events and captured frames,
		 * The callback will be called when there is a presentation event.
		 */
		beginFrameSubscription(onlyDirty: boolean, callback: BeginFrameSubscriptionCallback): void;
		/**
		 * Begin subscribing for presentation events and captured frames,
		 * The callback will be called when there is a presentation event.
		 */
		beginFrameSubscription(callback: BeginFrameSubscriptionCallback): void;
		/**
		 * End subscribing for frame presentation events.
		 */
		endFrameSubscription(): void;
		/**
		 * @returns If the process of saving page has been initiated successfully.
		 */
		savePage(fullPath: string, saveType: 'HTMLOnly' | 'HTMLComplete' | 'MHTML', callback?: (eror: Error) => void): boolean;
		/**
		 * Shows pop-up dictionary that searches the selected word on the page.
		 * Note: This API is available only on macOS.
		 */
		showDefinitionForSelection(): void;
		/**
		 * @returns Whether offscreen rendering is enabled.
		 */
		isOffscreen(): boolean;
		/**
		 * If offscreen rendering is enabled and not painting, start painting.
		 */
		startPainting(): void;
		/**
		 * If offscreen rendering is enabled and painting, stop painting.
		 */
		stopPainting(): void;
		/**
		 * If offscreen rendering is enabled returns whether it is currently painting.
		 */
		isPainting(): boolean;
		/**
		 * If offscreen rendering is enabled sets the frame rate to the specified number.
		 * Only values between 1 and 60 are accepted.
		 */
		setFrameRate(fps: number): void;
		/**
		 * If offscreen rendering is enabled returns the current frame rate.
		 */
		getFrameRate(): number;
		/**
		 * If offscreen rendering is enabled invalidates the frame and generates a new one through the 'paint' event.
		 */
		invalidate(): void;
		/**
		 * Sets the item as dragging item for current drag-drop operation.
		 */
		startDrag(item: DragItem): void;
		/**
		 * Captures a snapshot of the page within rect.
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Captures a snapshot of the page within rect.
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
		/**
		 * @returns The unique ID of this WebContents.
		 */
		id: number;
		/**
		 * @returns The session object used by this webContents.
		 */
		session: Session;
		/**
		 * @returns The WebContents that might own this WebContents.
		 */
		hostWebContents: WebContents;
		/**
		 * @returns The WebContents of DevTools for this WebContents.
		 * Note: Users should never store this object because it may become null
		 * when the DevTools has been closed.
		 */
		devToolsWebContents: WebContents;
		/**
		 * @returns Debugger API
		 */
		debugger: Debugger;
	}

	interface BeginFrameSubscriptionCallback {
		(
			/**
			 * The frameBuffer is a Buffer that contains raw pixel data.
			 * On most machines, the pixel data is effectively stored in 32bit BGRA format,
			 * but the actual representation depends on the endianness of the processor
			 * (most modern processors are little-endian, on machines with big-endian
			 * processors the data is in 32bit ARGB format).
			 */
			frameBuffer: Buffer,
			/**
			 * The dirtyRect is an object with x, y, width, height properties that describes which part of the page was repainted.
			 * If onlyDirty is set to true, frameBuffer will only contain the repainted area. onlyDirty defaults to false.
			 */
			dirtyRect?: Rectangle
		): void
	}

	interface ContextMenuParams {
		/**
		 * x coordinate
		 */
		x: number;
		/**
		 * y coordinate
		 */
		y: number;
		/**
		 * URL of the link that encloses the node the context menu was invoked on.
		 */
		linkURL: string;
		/**
		 * Text associated with the link. May be an empty string if the contents of the link are an image.
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
		 * Source URL for the element that the context menu was invoked on.
		 * Elements with source URLs are images, audio and video.
		 */
		srcURL: string;
		/**
		 * Type of the node the context menu was invoked on.
		 */
		mediaType: 'none' | 'image' | 'audio' | 'video' | 'canvas' | 'file' | 'plugin';
		/**
		 * Parameters for the media element the context menu was invoked on.
		 */
		mediaFlags: {
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
		/**
		 * Whether the context menu was invoked on an image which has non-empty contents.
		 */
		hasImageContents: boolean;
		/**
		 * Whether the context is editable.
		 */
		isEditable: boolean;
		/**
		 * These flags indicate whether the renderer believes it is able to perform the corresponding action.
		 */
		editFlags: {
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
		 */
		inputFieldType: 'none' | 'plainText' | 'password' | 'other';
		/**
		 * Input source that invoked the context menu.
		 */
		menuSourceType: 'none' | 'mouse' | 'keyboard' | 'touch' | 'touchMenu';
	}

	interface BluetoothDevice {
		deviceName: string;
		deviceId: string;
	}

	interface Headers {
		[key: string]: string;
	}

	type NewWindowDisposition = 'default' | 'foreground-tab' | 'background-tab' | 'new-window' | 'save-to-disk' | 'other';

	/**
	 * Specifies the action to take place when ending webContents.findInPage request.
	 * 'clearSelection' - Clear the selection.
	 * 'keepSelection' - Translate the selection into a normal selection.
	 * 'activateSelection' - Focus and click the selection node.
	 */
	type StopFindInPageAtion = 'clearSelection' | 'keepSelection' | 'activateSelection';

	type CursorType = 'default' | 'crosshair' | 'pointer' | 'text' | 'wait' | 'help' | 'e-resize' | 'n-resize' | 'ne-resize' | 'nw-resize' | 's-resize' | 'se-resize' | 'sw-resize' | 'w-resize' | 'ns-resize' | 'ew-resize' | 'nesw-resize' | 'nwse-resize' | 'col-resize' | 'row-resize' | 'm-panning' | 'e-panning' | 'n-panning' | 'ne-panning' | 'nw-panning' | 's-panning' | 'se-panning' | 'sw-panning' | 'w-panning' | 'move' | 'vertical-text' | 'cell' | 'context-menu' | 'alias' | 'progress' | 'nodrop' | 'copy' | 'none' | 'not-allowed' | 'zoom-in' | 'zoom-out' | 'grab' | 'grabbing' | 'custom';

	interface LoadURLOptions {
		/**
		 * HTTP Referrer URL.
		 */
		httpReferrer?: string;
		/**
		 * User agent originating the request.
		 */
		userAgent?: string;
		/**
		 * Extra headers separated by "\n"
		 */
		extraHeaders?: string;
	}

	interface PrintOptions {
		/**
		 * Don't ask user for print settings.
		 * Defaults: false.
		 */
		silent?: boolean;
		/**
		 * Also prints the background color and image of the web page.
		 * Defaults: false.
		 */
		printBackground?: boolean;
	}

	interface PrintToPDFOptions {
		/**
		 * Specify the type of margins to use.
		 *   0 - default
		 *   1 - none
		 *   2 - minimum
		 * Default: 0
		 */
		marginsType?: number;
		/**
		 * Specify page size of the generated PDF.
		 * Default: A4.
		 */
		pageSize?: 'A3' | 'A4' | 'A5' | 'Legal' | 'Letter' | 'Tabloid' | Size;
		/**
		 * Whether to print CSS backgrounds.
		 * Default: false.
		 */
		printBackground?: boolean;
		/**
		 * Whether to print selection only.
		 * Default: false.
		 */
		printSelectionOnly?: boolean;
		/**
		 * true for landscape, false for portrait.
		 * Default: false.
		 */
		landscape?: boolean;
	}

	interface Certificate {
		/**
		 * PEM encoded data.
		 */
		data: string;
		/**
		 * Issuer's Common Name.
		 */
		issuerName: string;
		/**
		 * Subject's Common Name.
		 */
		subjectName: string;
		/**
		 * Hex value represented string.
		 */
		serialNumber: string;
		/**
		 * Start date of the certificate being valid in seconds.
		 */
		validStart: number;
		/**
		 * End date of the certificate being valid in seconds.
		 */
		validExpiry: number;
		/**
		 * Fingerprint of the certificate.
		 */
		fingerprint: string;
	}

	interface LoginRequest {
		method: string;
		url: string;
		referrer: string;
	}

	interface LoginAuthInfo {
		isProxy: boolean;
		scheme: string;
		host: string;
		port: number;
		realm: string;
	}

	interface FindInPageOptions {
		/**
		 * Whether to search forward or backward, defaults to true
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
		 * When combined with wordStart, accepts a match in the middle of a word
		 * if the match begins with an uppercase letter followed by a lowercase
		 * or non-letter. Accepts several other intra-word matches, defaults to false.
		 */
		medialCapitalAsWordStart?: boolean;
	}

	interface FoundInPageResult {
		requestId: number;
		/**
		 * Indicates if more responses are to follow.
		 */
		finalUpdate: boolean;
		/**
		 * Position of the active match.
		 */
		activeMatchOrdinal?: number;
		/**
		 * Number of Matches.
		 */
		matches?: number;
		/**
		 * Coordinates of first match region.
		 */
		selectionArea?: Rectangle;
	}

	interface DeviceEmulationParameters {
		/**
		 * Specify the screen type to emulated
		 * Default: desktop
		 */
		screenPosition?: 'desktop' | 'mobile';
		/**
		 * Set the emulated screen size (screenPosition == mobile)
		 */
		screenSize?: Size;
		/**
		 * Position the view on the screen (screenPosition == mobile)
		 * Default: {x: 0, y: 0}
		 */
		viewPosition?: Point;
		/**
		 * Set the device scale factor (if zero defaults to original device scale factor)
		 * Default: 0
		 */
		deviceScaleFactor: number;
		/**
		 * Set the emulated view size (empty means no override).
		 */
		viewSize?: Size;
		/**
		 * Whether emulated view should be scaled down if necessary to fit into available space
		 * Default: false
		 */
		fitToView?: boolean;
		/**
		 * Offset of the emulated view inside available space (not in fit to view mode)
		 * Default: {x: 0, y: 0}
		 */
		offset?: Point;
		/**
		 * Scale of emulated view inside available space (not in fit to view mode)
		 * Default: 1
		 */
		scale: number;
	}

	interface SendInputEvent {
		type: 'mouseDown' | 'mouseUp' | 'mouseEnter' | 'mouseLeave' | 'contextMenu' | 'mouseWheel' | 'mouseMove' | 'keyDown' | 'keyUp' | 'char';
		modifiers: ('shift' | 'control' | 'alt' | 'meta' | 'isKeypad' | 'isAutoRepeat' | 'leftButtonDown' | 'middleButtonDown' | 'rightButtonDown' | 'capsLock' | 'numLock' | 'left' | 'right')[];
	}

	interface SendInputKeyboardEvent extends SendInputEvent {
		keyCode: string;
	}

	interface SendInputMouseEvent extends SendInputEvent {
		x: number;
		y: number;
		button?: 'left' | 'middle' | 'right';
		globalX?: number;
		globalY?: number;
		movementX?: number;
		movementY?: number;
		clickCount?: number;
	}

	interface SendInputMouseWheelEvent extends SendInputEvent {
		deltaX?: number;
		deltaY?: number;
		wheelTicksX?: number;
		wheelTicksY?: number;
		accelerationRatioX?: number;
		accelerationRatioY?: number;
		hasPreciseScrollingDeltas?: boolean;
		canScroll?: boolean;
	}

	/**
	 * Debugger API serves as an alternate transport for remote debugging protocol.
	 */
	interface Debugger extends NodeJS.EventEmitter {
		/**
		 * Attaches the debugger to the webContents.
		 * @param protocolVersion Requested debugging protocol version.
		 */
		attach(protocolVersion?: string): void;
		/**
		 * @returns Whether a debugger is attached to the webContents.
		 */
		isAttached(): boolean;
		/**
		 * Detaches the debugger from the webContents.
		 */
		detach(): void;
		/**
		 * Send given command to the debugging target.
		 * @param method Method name, should be one of the methods defined by the remote debugging protocol.
		 * @param commandParams JSON object with request parameters.
		 * @param callback Response defined by the ‘returns’ attribute of the command description in the remote debugging protocol.
		 */
		sendCommand(method: string, commandParams?: any, callback?: (error: Error, result: any) => void): void;
		/**
		 * Emitted when debugging session is terminated. This happens either when
		 * webContents is closed or devtools is invoked for the attached webContents.
		 */
		on(event: 'detach', listener: (event: Event, reason: string) => void): this;
		/**
		 * Emitted whenever debugging target issues instrumentation event.
		 * Event parameters defined by the ‘parameters’ attribute in the remote debugging protocol.
		 */
		on(event: 'message', listener: (event: Event, method: string, params: any) => void): this;
		on(event: string, listener: Function): this;
	}

	// https://github.com/electron/electron/blob/master/docs/api/web-frame.md

	/**
	 * The web-frame module allows you to customize the rendering of the current web page.
	 */
	interface WebFrame {
		/**
		 * Changes the zoom factor to the specified factor, zoom factor is
		 * zoom percent / 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * @returns The current zoom factor.
		 */
		getZoomFactor(): number;
		/**
		 * Changes the zoom level to the specified level, 0 is "original size", and each
		 * increment above or below represents zooming 20% larger or smaller to default
		 * limits of 300% and 50% of original size, respectively.
		 */
		setZoomLevel(level: number): void;
		/**
		 * @returns The current zoom level.
		 */
		getZoomLevel(): number;
		/**
		 * Sets the maximum and minimum zoom level.
		 */
		setZoomLevelLimits(minimumLevel: number, maximumLevel: number): void;
		/**
		 * Sets a provider for spell checking in input fields and text areas.
		 */
		setSpellCheckProvider(language: string, autoCorrectWord: boolean, provider: {
			/**
			 * @returns Whether the word passed is correctly spelled.
			 */
			spellCheck: (text: string) => boolean;
		}): void;
		/**
		 * Sets the scheme as secure scheme. Secure schemes do not trigger mixed content
		 * warnings. For example, https and data are secure schemes because they cannot be
		 * corrupted by active network attackers.
		 */
		registerURLSchemeAsSecure(scheme: string): void;
		/**
		 * Resources will be loaded from this scheme regardless of the current page’s Content Security Policy.
		 */
		registerURLSchemeAsBypassingCSP(scheme: string): void;
		/**
		 * Registers the scheme as secure, bypasses content security policy for resources,
		 * allows registering ServiceWorker and supports fetch API.
		 */
		registerURLSchemeAsPrivileged(scheme: string, options?: RegisterURLSchemeOptions): void;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Evaluates `code` in page.
		 * In the browser window some HTML APIs like `requestFullScreen` can only be
		 * invoked by a gesture from the user. Setting `userGesture` to `true` will remove
		 * this limitation.
		 *
		 * @returns Promise
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
		/**
		 * @returns Object describing usage information of Blink’s internal memory caches.
		 */
		getResourceUsage(): ResourceUsages;
		/**
		 * Attempts to free memory that is no longer being used (like images from a previous navigation).
		 */
		clearCache(): void;
	}

	interface ResourceUsages {
		fonts: ResourceUsage;
		images: ResourceUsage;
		cssStyleSheets: ResourceUsage;
		xslStyleSheets: ResourceUsage;
		scripts: ResourceUsage;
		other: ResourceUsage;
	}

	interface ResourceUsage {
		count: number;
		decodedSize: number;
		liveSize: number;
		purgeableSize: number;
		purgedSize: number;
		size: number;
	}

	interface RegisterURLSchemeOptions {
		secure?: boolean;
		bypassCSP?: boolean;
		allowServiceWorkers?: boolean;
		supportFetchAPI?: boolean;
		corsEnabled?: boolean;
	}

	// https://github.com/electron/electron/blob/master/docs/api/web-view-tag.md

	/**
	 * Use the webview tag to embed 'guest' content (such as web pages) in your Electron app.
	 * The guest content is contained within the webview container.
	 * An embedded page within your app controls how the guest content is laid out and rendered.
	 *
	 * Unlike an iframe, the webview runs in a separate process than your app.
	 * It doesn't have the same permissions as your web page and all interactions between your app
	 * and embedded content will be asynchronous. This keeps your app safe from the embedded content.
	 */
	interface WebViewElement extends HTMLElement {
		/**
		 * Returns the visible URL. Writing to this attribute initiates top-level navigation.
		 * Assigning src its own value will reload the current page.
		 * The src attribute can also accept data URLs, such as data:text/plain,Hello, world!.
		 */
		src: string;
		/**
		 * If "on", the webview container will automatically resize within the bounds specified
		 * by the attributes minwidth, minheight, maxwidth, and maxheight.
		 * These constraints do not impact the webview unless autosize is enabled.
		 * When autosize is enabled, the webview container size cannot be less than
		 * the minimum values or greater than the maximum.
		 */
		autosize: string;
		/**
		 * If "on", the guest page in webview will have node integration and can use node APIs
		 * like require and process to access low level system resources.
		 */
		nodeintegration: string;
		/**
		 * If "on", the guest page in webview will be able to use browser plugins.
		 */
		plugins: string;
		/**
		 * Specifies a script that will be loaded before other scripts run in the guest page.
		 * The protocol of script's URL must be either file: or asar:,
		 * because it will be loaded by require in guest page under the hood.
		 *
		 * When the guest page doesn't have node integration this script will still have access to all Node APIs,
		 * but global objects injected by Node will be deleted after this script has finished executing.
		 */
		preload: string;
		/**
		 * Sets the referrer URL for the guest page.
		 */
		httpreferrer: string;
		/**
		 * Sets the user agent for the guest page before the page is navigated to.
		 * Once the page is loaded, use the setUserAgent method to change the user agent.
		 */
		useragent: string;
		/**
		 * If "on", the guest page will have web security disabled.
		 */
		disablewebsecurity: string;
		/**
		 * Sets the session used by the page. If partition starts with persist:,
		 * the page will use a persistent session available to all pages in the app with the same partition.
		 * If there is no persist: prefix, the page will use an in-memory session.
		 * By assigning the same partition, multiple pages can share the same session.
		 * If the partition is unset then default session of the app will be used.
		 *
		 * This value can only be modified before the first navigation,
		 * since the session of an active renderer process cannot change.
		 * Subsequent attempts to modify the value will fail with a DOM exception.
		 */
		partition: string;
		/**
		 * If "on", the guest page will be allowed to open new windows.
		 */
		allowpopups: string;
		/**
		 * A list of strings which specifies the web preferences to be set on the webview, separated by ,.
		 */
		webpreferences: string;
		/**
		 * A list of strings which specifies the blink features to be enabled separated by ,.
		 */
		blinkfeatures: string;
		/**
		 * A list of strings which specifies the blink features to be disabled separated by ,.
		 */
		disableblinkfeatures: string;
		/**
		 * A value that links the webview to a specific webContents.
		 * When a webview first loads a new webContents is created and this attribute is set
		 * to its instance identifier. Setting this attribute on a new or existing webview connects
		 * it to the existing webContents that currently renders in a different webview.
		 *
		 * The existing webview will see the destroy event and will then create a new webContents when a new url is loaded.
		 */
		guestinstance: string;
		/**
		 * Loads the url in the webview, the url must contain the protocol prefix, e.g. the http:// or file://.
		 */
		loadURL(url: string, options?: LoadURLOptions): void;
		/**
		 * @returns URL of guest page.
		 */
		getURL(): string;
		/**
		 * @returns The title of guest page.
		 */
		getTitle(): string;
		/**
		 * @returns Whether the web page is destroyed.
		 */
		isDestroyed(): boolean;
		/**
		 * @returns Whether the web page is focused.
		 */
		isFocused(): boolean;
		/**
		 * @returns Whether guest page is still loading resources.
		 */
		isLoading(): boolean;
		/**
		 * Returns a boolean whether the guest page is waiting for a first-response for the main resource of the page.
		 */
		isWaitingForResponse(): boolean;
		/**
		 * Stops any pending navigation.
		 */
		stop(): void;
		/**
		 * Reloads the guest page.
		 */
		reload(): void;
		/**
		 * Reloads the guest page and ignores cache.
		 */
		reloadIgnoringCache(): void;
		/**
		 * @returns Whether the guest page can go back.
		 */
		canGoBack(): boolean;
		/**
		 * @returns Whether the guest page can go forward.
		 */
		canGoForward(): boolean;
		/**
		 * @returns Whether the guest page can go to offset.
		 */
		canGoToOffset(offset: number): boolean;
		/**
		 * Clears the navigation history.
		 */
		clearHistory(): void;
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
		 * @returns Whether the renderer process has crashed.
		 */
		isCrashed(): boolean;
		/**
		 * Overrides the user agent for the guest page.
		 */
		setUserAgent(userAgent: string): void;
		/**
		 * @returns The user agent for guest page.
		 */
		getUserAgent(): string;
		/**
		 * Injects CSS into the guest page.
		 */
		insertCSS(css: string): void;
		/**
		 * Evaluates code in page. If userGesture is set, it will create the user gesture context in the page.
		 * HTML APIs like requestFullScreen, which require user action, can take advantage of this option for automation.
		 *
		 * @returns Promise
		 */
		executeJavaScript(code: string, userGesture?: boolean, callback?: (result: any) => void): Promise<any>;
		/**
		 * Opens a DevTools window for guest page.
		 */
		openDevTools(): void;
		/**
		 * Closes the DevTools window of guest page.
		 */
		closeDevTools(): void;
		/**
		 * @returns Whether guest page has a DevTools window attached.

		isDevToolsOpened(): boolean;
		/**
		 * @returns Whether DevTools window of guest page is focused.
		 */
		isDevToolsFocused(): boolean;
		/**
		 * Starts inspecting element at position (x, y) of guest page.
		 */
		inspectElement(x: number, y: number): void;
		/**
		 * Opens the DevTools for the service worker context present in the guest page.
		 */
		inspectServiceWorker(): void;
		/**
		 * Set guest page muted.
		 */
		setAudioMuted(muted: boolean): void;
		/**
		 * @returns Whether guest page has been muted.
		 */
		isAudioMuted(): boolean;
		/**
		 * Executes editing command undo in page.
		 */
		undo(): void;
		/**
		 * Executes editing command redo in page.
		 */
		redo(): void;
		/**
		 * Executes editing command cut in page.
		 */
		cut(): void;
		/**
		 * Executes editing command copy in page.
		 */
		copy(): void;
		/**
		 * Executes editing command paste in page.
		 */
		paste(): void;
		/**
		 * Executes editing command pasteAndMatchStyle in page.
		 */
		pasteAndMatchStyle(): void;
		/**
		 * Executes editing command delete in page.
		 */
		delete(): void;
		/**
		 * Executes editing command selectAll in page.
		 */
		selectAll(): void;
		/**
		 * Executes editing command unselect in page.
		 */
		unselect(): void;
		/**
		 * Executes editing command replace in page.
		 */
		replace(text: string): void;
		/**
		 * Executes editing command replaceMisspelling in page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * Inserts text to the focused element.
		 */
		insertText(text: string): void;
		/**
		 * Starts a request to find all matches for the text in the web page.
		 * The result of the request can be obtained by subscribing to found-in-page event.
		 * @returns The request id used for the request.
		 */
		findInPage(text: string, options?: FindInPageOptions): number;
		/**
		 * Stops any findInPage request for the webview with the provided action.
		 */
		stopFindInPage(action: StopFindInPageAtion): void;
		/**
		 * Prints webview's web page. Same with webContents.print([options]).
		 */
		print(options?: PrintOptions): void;
		/**
		 * Prints webview's web page as PDF, Same with webContents.printToPDF(options, callback)
		 */
		printToPDF(options: PrintToPDFOptions, callback: (error: Error, data: Buffer) => void): void;
		/**
		 * Send an asynchronous message to renderer process via channel, you can also send arbitrary arguments.
		 * The renderer process can handle the message by listening to the channel event with the ipcRenderer module.
		 * See webContents.send for examples.
		 */
		send(channel: string, ...args: any[]): void;
		/**
		 * Sends an input event to the page.
		 * See webContents.sendInputEvent for detailed description of event object.
		 */
		sendInputEvent(event: SendInputEvent): void
		/**
		 * Changes the zoom factor to the specified factor.
		 * Zoom factor is zoom percent divided by 100, so 300% = 3.0.
		 */
		setZoomFactor(factor: number): void;
		/**
		 * Changes the zoom level to the specified level.
		 * The original size is 0 and each increment above or below represents
		 * zooming 20% larger or smaller to default limits of 300% and 50% of original size, respectively.
		 */
		setZoomLevel(level: number): void;
		/**
		 * Shows pop-up dictionary that searches the selected word on the page.
		 * Note: This API is available only on macOS.
		 */
		showDefinitionForSelection(): void;
		/**
		 * @returns The WebContents associated with this webview.
		 */
		getWebContents(): WebContents;
		/**
		 * Captures a snapshot of the webview's page. Same as webContents.capturePage([rect, ]callback).
		 */
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Captures a snapshot of the webview's page. Same as webContents.capturePage([rect, ]callback).
		 */
		capturePage(rect: Rectangle, callback: (image: NativeImage) => void): void;
		/**
		 * Fired when a load has committed. This includes navigation within the current document
		 * as well as subframe document-level loads, but does not include asynchronous resource loads.
		 */
		addEventListener(type: 'load-commit', listener: (event: WebViewElement.LoadCommitEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when the navigation is done, i.e. the spinner of the tab will stop spinning, and the onload event is dispatched.
		 */
		addEventListener(type: 'did-finish-load', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * This event is like did-finish-load, but fired when the load failed or was cancelled, e.g. window.stop() is invoked.
		 */
		addEventListener(type: 'did-fail-load', listener: (event: WebViewElement.DidFailLoadEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when a frame has done navigation.
		 */
		addEventListener(type: 'did-frame-finish-load', listener: (event: WebViewElement.DidFrameFinishLoadEvent) => void, useCapture?: boolean): void;
		/**
		 * Corresponds to the points in time when the spinner of the tab starts spinning.
		 */
		addEventListener(type: 'did-start-loading', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Corresponds to the points in time when the spinner of the tab stops spinning.
		 */
		addEventListener(type: 'did-stop-loading', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when details regarding a requested resource is available.
		 * status indicates socket connection to download the resource.
		 */
		addEventListener(type: 'did-get-response-details', listener: (event: WebViewElement.DidGetResponseDetails) => void, useCapture?: boolean): void;
		/**
		 * Fired when a redirect was received while requesting a resource.
		 */
		addEventListener(type: 'did-get-redirect-request', listener: (event: WebViewElement.DidGetRedirectRequestEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when document in the given frame is loaded.
		 */
		addEventListener(type: 'dom-ready', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when page title is set during navigation. explicitSet is false when title is synthesized from file URL.
		 */
		addEventListener(type: 'page-title-updated', listener: (event: WebViewElement.PageTitleUpdatedEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when page receives favicon URLs.
		 */
		addEventListener(type: 'page-favicon-updated', listener: (event: WebViewElement.PageFaviconUpdatedEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when page enters fullscreen triggered by HTML API.
		 */
		addEventListener(type: 'enter-html-full-screen', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when page leaves fullscreen triggered by HTML API.
		 */
		addEventListener(type: 'leave-html-full-screen', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when the guest window logs a console message.
		 */
		addEventListener(type: 'console-message', listener: (event: WebViewElement.ConsoleMessageEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when a result is available for webview.findInPage request.
		 */
		addEventListener(type: 'found-in-page', listener: (event: WebViewElement.FoundInPageEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when the guest page attempts to open a new browser window.
		 */
		addEventListener(type: 'new-window', listener: (event: WebViewElement.NewWindowEvent) => void, useCapture?: boolean): void;
		/**
		 * Emitted when a user or the page wants to start navigation.
		 * It can happen when the window.location object is changed or a user clicks a link in the page.
		 *
		 * This event will not emit when the navigation is started programmatically with APIs
		 * like <webview>.loadURL and <webview>.back.
		 *
		 * It is also not emitted during in-page navigation, such as clicking anchor links
		 * or updating the window.location.hash. Use did-navigate-in-page event for this purpose.
		 *
		 * Calling event.preventDefault() does NOT have any effect.
		 */
		addEventListener(type: 'will-navigate', listener: (event: WebViewElement.WillNavigateEvent) => void, useCapture?: boolean): void;
		/**
		 * Emitted when a navigation is done.
		 *
		 * This event is not emitted for in-page navigations, such as clicking anchor links
		 * or updating the window.location.hash. Use did-navigate-in-page event for this purpose.
		 */
		addEventListener(type: 'did-navigate', listener: (event: WebViewElement.DidNavigateEvent) => void, useCapture?: boolean): void;
		/**
		 * Emitted when an in-page navigation happened.
		 *
		 * When in-page navigation happens, the page URL changes but does not cause
		 * navigation outside of the page. Examples of this occurring are when anchor links
		 * are clicked or when the DOM hashchange event is triggered.
		 */
		addEventListener(type: 'did-navigate-in-page', listener: (event: WebViewElement.DidNavigateInPageEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when the guest page attempts to close itself.
		 */
		addEventListener(type: 'close', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when the guest page has sent an asynchronous message to embedder page.
		 */
		addEventListener(type: 'ipc-message', listener: (event: WebViewElement.IpcMessageEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when the renderer process is crashed.
		 */
		addEventListener(type: 'crashed', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when the gpu process is crashed.
		 */
		addEventListener(type: 'gpu-crashed', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Fired when a plugin process is crashed.
		 */
		addEventListener(type: 'plugin-crashed', listener: (event: WebViewElement.PluginCrashedEvent) => void, useCapture?: boolean): void;
		/**
		 * Fired when the WebContents is destroyed.
		 */
		addEventListener(type: 'destroyed', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Emitted when media starts playing.
		 */
		addEventListener(type: 'media-started-playing', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Emitted when media is paused or done playing.
		 */
		addEventListener(type: 'media-paused', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Emitted when a page's theme color changes. This is usually due to encountering a meta tag:
		 * <meta name='theme-color' content='#ff0000'>
		 */
		addEventListener(type: 'did-change-theme-color', listener: (event: WebViewElement.DidChangeThemeColorEvent) => void, useCapture?: boolean): void;
		/**
		 * Emitted when mouse moves over a link or the keyboard moves the focus to a link.
		 */
		addEventListener(type: 'update-target-url', listener: (event: WebViewElement.UpdateTargetUrlEvent) => void, useCapture?: boolean): void;
		/**
		 * Emitted when DevTools is opened.
		 */
		addEventListener(type: 'devtools-opened', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Emitted when DevTools is closed.
		 */
		addEventListener(type: 'devtools-closed', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		/**
		 * Emitted when DevTools is focused / opened.
		 */
		addEventListener(type: 'devtools-focused', listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
		addEventListener(type: string, listener: (event: WebViewElement.Event) => void, useCapture?: boolean): void;
	}

	namespace WebViewElement {
		type Event = ElectronPrivate.GlobalEvent;

		interface LoadCommitEvent extends Event {
			url: string;
			isMainFrame: boolean;
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

		interface DidGetResponseDetails extends Event {
			status: boolean;
			newURL: string;
			originalURL: string;
			httpResponseCode: number;
			requestMethod: string;
			referrer: string;
			headers: Headers;
			resourceType: string;
		}

		interface DidGetRedirectRequestEvent extends Event {
			oldURL: string;
			newURL: string;
			isMainFrame: boolean;
			httpResponseCode: number;
			requestMethod: string;
			referrer: string;
			headers: Headers;
		}

		interface PageTitleUpdatedEvent extends Event {
			title: string;
			explicitSet: string;
		}

		interface PageFaviconUpdatedEvent extends Event {
			favicons: string[];
		}

		interface ConsoleMessageEvent extends Event {
			level: number;
			message: string;
			line: number;
			sourceId: string;
		}

		interface FoundInPageEvent extends Event {
			result: FoundInPageResult;
		}

		interface NewWindowEvent extends Event {
			url: string;
			frameName: string;
			disposition: NewWindowDisposition;
			options: BrowserWindowOptions;
		}

		interface WillNavigateEvent extends Event {
			url: string;
		}

		interface DidNavigateEvent extends Event {
			url: string;
		}

		interface DidNavigateInPageEvent extends Event {
			url: string;
			isMainFrame: boolean;
		}

		interface IpcMessageEvent extends Event {
			channel: string;
			args: any[];
		}

		interface PluginCrashedEvent extends Event {
			name: string;
			version: string;
		}

		interface DidChangeThemeColorEvent extends Event {
			themeColor: string;
		}

		interface UpdateTargetUrlEvent extends Event {
			url: string;
		}
	}

	/**
	 * The BrowserWindowProxy object is returned from window.open and provides limited functionality with the child window.
	 */
	interface BrowserWindowProxy {
		/**
		 * Removes focus from the child window.
		 */
		blur(): void;
		/**
		 * Forcefully closes the child window without calling its unload event.
		 */
		close(): void;
		/**
		 * Set to true after the child window gets closed.
		 */
		closed: boolean;
		/**
		 * Evaluates the code in the child window.
		 */
		eval(code: string): void;
		/**
		 * Focuses the child window (brings the window to front).
		 */
		focus(): void;
		/**
		 * Sends a message to the child window with the specified origin or * for no origin preference.
		 * In addition to these methods, the child window implements window.opener object with no
		 * properties and a single method.
		 */
		postMessage(message: string, targetOrigin: string): void;
		/**
		 * Invokes the print dialog on the child window.
		 */
		print(): void;
	}

	// https://github.com/electron/electron/blob/master/docs/api/synopsis.md

	interface CommonElectron {
		clipboard: Electron.Clipboard;
		crashReporter: Electron.CrashReporter;
		nativeImage: typeof Electron.NativeImage;
		shell: Electron.Shell;

		app: Electron.App;
		autoUpdater: Electron.AutoUpdater;
		BrowserWindow: typeof Electron.BrowserWindow;
		contentTracing: Electron.ContentTracing;
		dialog: Electron.Dialog;
		ipcMain: Electron.IpcMain;
		globalShortcut: Electron.GlobalShortcut;
		Menu: typeof Electron.Menu;
		MenuItem: typeof Electron.MenuItem;
		net: Electron.Net;
		powerMonitor: Electron.PowerMonitor;
		powerSaveBlocker: Electron.PowerSaveBlocker;
		protocol: Electron.Protocol;
		screen: Electron.Screen;
		session: typeof Electron.Session;
		systemPreferences: Electron.SystemPreferences;
		Tray: typeof Electron.Tray;
		webContents: Electron.WebContentsStatic;
	}

	interface ElectronMainAndRenderer extends CommonElectron {
		desktopCapturer: Electron.DesktopCapturer;
		ipcRenderer: Electron.IpcRenderer;
		remote: Electron.Remote;
		webFrame: Electron.WebFrame;
	}
}

declare namespace ElectronPrivate {
	type GlobalEvent = Event;
}

interface Document {
	createElement(tagName: 'webview'): Electron.WebViewElement;
}

// https://github.com/electron/electron/blob/master/docs/api/window-open.md

interface Window {
	/**
	 * Creates a new window.
	 */
	open(url: string, frameName?: string, features?: string): Electron.BrowserWindowProxy;
}

// https://github.com/electron/electron/blob/master/docs/api/file-object.md

interface File {
	/**
	 * Exposes the real path of the filesystem.
	 */
	path: string;
}

// https://github.com/electron/electron/blob/master/docs/api/process.md

declare namespace NodeJS {

	interface ProcessVersions {
		/**
		 * Electron's version string.
		 */
		electron: string;
		/**
		 * Chrome's version string.
		 */
		chrome: string;
	}

	interface Process {
		/**
		 * Setting this to true can disable the support for asar archives in Node's built-in modules.
		 */
		noAsar?: boolean;
		/**
		 * Process's type
		 */
		type: 'browser' | 'renderer';
		/**
		 * Path to JavaScript source code.
		 */
		resourcesPath: string;
		/**
		 * For Mac App Store build, this value is true, for other builds it is undefined.
		 */
		mas?: boolean;
		/**
		 * If the app is running as a Windows Store app (appx), this value is true, for other builds it is undefined.
		 */
		windowsStore?: boolean;
		/**
		 * When app is started by being passed as parameter to the default app,
		 * this value is true in the main process, otherwise it is undefined.
		 */
		defaultApp?: boolean;
		/**
		 * Emitted when Electron has loaded its internal initialization script
		 * and is beginning to load the web page or the main script.
		 */
		on(event: 'loaded', listener: Function): this;
		on(event: string, listener: Function): this;
		/**
		 * Causes the main thread of the current process crash;
		 */
		crash(): void;
		/**
		 * Causes the main thread of the current process hang.
		 */
		hang(): void;
		/**
		 * Sets the file descriptor soft limit to maxDescriptors or the OS hard limit,
		 * whichever is lower for the current process.
		 *
		 * Note: This API is only available on macOS and Linux.
		 */
		setFdLimit(maxDescriptors: number): void;
		/**
		 * @returns Object giving memory usage statistics about the current process.
		 * Note: All statistics are reported in Kilobytes.
		 */
		getProcessMemoryInfo(): ProcessMemoryInfo;
		/**
		 * @returns Object giving memory usage statistics about the entire system.
		 * Note: All statistics are reported in Kilobytes.
		 */
		getSystemMemoryInfo(): SystemMemoryInfo;
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
		 * The amount of memory not shared by other processes, such as JS heap or HTML content.
		 */
		privateBytes: number;
		/**
		 * The amount of memory shared between processes, typically memory consumed by the Electron code itself.
		 */
		sharedBytes: number;
	}

	interface SystemMemoryInfo {
		/**
		 * The total amount of physical memory available to the system.
		 */
		total: number;
		/**
		 * The total amount of memory not being used by applications or disk cache.
		 */
		free: number;
		/**
		 * The total amount of swap memory available to the system.
		 */
		swapTotal: number;
		/**
		 * The free amount of swap memory available to the system.
		 */
		swapFree: number;
	}
}

declare module 'electron' {
	var electron: Electron.ElectronMainAndRenderer;
	export = electron;
}

// interface NodeRequireFunction {
// 	(moduleName: 'electron'): Electron.ElectronMainAndRenderer;
// }