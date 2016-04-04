// Type definitions for Electron v0.35.0
// Project: http://electron.atom.io/
// Definitions by: jedmao <https://github.com/jedmao/>, rhysd <https://rhysd.github.io>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped

// Copied from https://github.com/DefinitelyTyped/DefinitelyTyped/commit/eddede55bd6b42c154eb8e44336d0fa44ca79965

/// <reference path="./node.d.ts" />

declare module Electron {
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
		 * @returns Buffer Contains the image's PNG encoded data.
		 */
		toPng(): Buffer;
		/**
		 * @returns Buffer Contains the image's JPEG encoded data.
		 */
		toJpeg(quality: number): Buffer;
		/**
		 * @returns string The data URL of the image.
		 */
		toDataURL(): string;
		/**
		 * @returns boolean Whether the image is empty.
		 */
		isEmpty(): boolean;
		/**
		 * @returns {} The size of the image.
		 */
		getSize(): any;
		/**
		 * Marks the image as template image.
		 */
		setTemplateImage(option: boolean): void;
	}

	module Clipboard {
		/**
		 * @returns The contents of the clipboard as a NativeImage.
		 */
		function readImage(type?: string): NativeImage;
		/**
		 * Writes the image into the clipboard.
		 */
		function writeImage(image: NativeImage, type?: string): void;
	}

	interface Display {
		id:number;
		bounds:Bounds;
		workArea:Bounds;
		size:Dimension;
		workAreaSize:Dimension;
		scaleFactor:number;
		rotation:number;
		touchSupport:string;
	}

	interface Bounds {
		x:number;
		y:number;
		width:number;
		height:number;
	}

	interface Dimension {
		width:number;
		height:number;
	}

	interface Point {
		x:number;
		y:number;
	}

	class Screen implements NodeJS.EventEmitter {
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

	/**
	 * The BrowserWindow class gives you ability to create a browser window.
	 * You can also create a window without chrome by using Frameless Window API.
	 */
	class BrowserWindow implements NodeJS.EventEmitter {
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
		 */
		static addDevToolsExtension(path: string): string;
		/**
		 * Remove a devtools extension.
		 * @param name The name of the devtools extension to remove.
		 */
		static removeDevToolsExtension(name: string): void;
		/**
		 * The WebContents object this window owns, all web page related events and
		 * operations would be done via it.
		 * Note: Users should never store this object because it may become null when
		 * the renderer process (web page) has crashed.
		 */
		webContents: WebContents;
		/**
		 * Get the WebContents of devtools of this window.
		 * Note: Users should never store this object because it may become null when
		 * the devtools has been closed.
		 */
		devToolsWebContents: WebContents;
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
		 * @returns Whether the window is focused.
		 */
		isFocused(): boolean;
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
		 * Resizes and moves the window to width, height, x, y.
		 */
		setBounds(options: Rectangle): void;
		/**
		 * @returns The window's width, height, x and y values.
		 */
		getBounds(): Rectangle;
		/**
		 * Resizes the window to width and height.
		 */
		setSize(width: number, height: number): void;
		/**
		 * @returns The window's width and height.
		 */
		getSize(): number[];
		/**
		 * Resizes the window's client area (e.g. the web page) to width and height.
		 */
		setContentSize(width: number, height: number): void;
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
		 * Sets whether the window should show always on top of other windows. After
		 * setting this, the window is still a normal window, not a toolbox window
		 * which can not be focused on.
		 */
		setAlwaysOnTop(flag: boolean): void;
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
		setPosition(x: number, y: number): void;
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
		 * Sets the pathname of the file the window represents, and the icon of the
		 * file will show in window's title bar.
		 * Note: This API is available only on OS X.
		 */
		setRepresentedFilename(filename: string): void;
		/**
		 * Note: This API is available only on OS X.
		 * @returns The pathname of the file the window represents.
		 */
		getRepresentedFilename(): string;
		/**
		 * Specifies whether the window’s document has been edited, and the icon in
		 * title bar will become grey when set to true.
		 * Note: This API is available only on OS X.
		 */
		setDocumentEdited(edited: boolean): void;
		/**
		 * Note: This API is available only on OS X.
		 * @returns Whether the window's document has been edited.
		 */
		isDocumentEdited(): boolean;
		reloadIgnoringCache(): void;
		/**
		 * Starts inspecting element at position (x, y).
		 */
		inspectElement(x: number, y: number): void;
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
		capturePage(callback: (image: NativeImage) => void): void;
		/**
		 * Same with webContents.print([options])
		 */
		print(options?: {
			silent?: boolean;
			printBackground?: boolean;
		}): void;
		/**
		 * Same with webContents.printToPDF([options])
		 */
		printToPDF(options: {
			marginsType?: number;
			pageSize?: string;
			printBackground?: boolean;
			printSelectionOnly?: boolean;
			landscape?: boolean;
		}, callback: (error: Error, data: Buffer) => void): void;
		/**
		 * Same with webContents.loadURL(url).
		 */
		loadURL(url: string, options?: {
			httpReferrer?: string;
			userAgent?: string;
		}): void;
		/**
		 * Same with webContents.reload.
		 */
		reload(): void;
		/**
		 * Sets the menu as the window top menu.
		 * Note: This API is not available on OS X.
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
		setProgressBar(progress: number): void;
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
		 * Shows pop-up dictionary that searches the selected word on the page.
		 * Note: This API is available only on OS X.
		 */
		showDefinitionForSelection(): void;
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
		 * @returns Whether dev tools are focused or not.
		 */
		isDevToolsFocused(): boolean;
	}

	interface WebPreferences {
		nodeIntegration?: boolean;
		preload?: string;
		partition?: string;
		zoomFactor?: number;
		javascript?: boolean;
		webSecurity?: boolean;
		allowDisplayingInsecureContent?: boolean;
		allowRunningInsecureContent?: boolean;
		images?: boolean;
		textAreasAreResizable?: boolean;
		webgl?: boolean;
		webaudio?: boolean;
		plugins?: boolean;
		experimentalFeatures?: boolean;
		experimentalCanvasFeatures?: boolean;
		overlayScrollbars?: boolean;
		sharedWorker?: boolean;
		directWrite?: boolean;
		pageVisibility?: boolean;
	}

	// Includes all options BrowserWindow can take as of this writing
	// http://electron.atom.io/docs/v0.29.0/api/browser-window/
	interface BrowserWindowOptions extends Rectangle {
		show?: boolean;
		useContentSize?: boolean;
		center?: boolean;
		minWidth?: number;
		minHeight?: number;
		maxWidth?: number;
		maxHeight?: number;
		resizable?: boolean;
		alwaysOnTop?: boolean;
		fullscreen?: boolean;
		skipTaskbar?: boolean;
		zoomFactor?: number;
		kiosk?: boolean;
		title?: string;
		icon?: NativeImage|string;
		frame?: boolean;
		acceptFirstMouse?: boolean;
		disableAutoHideCursor?: boolean;
		autoHideMenuBar?: boolean;
		enableLargerThanScreen?: boolean;
		darkTheme?: boolean;
		preload?: string;
		transparent?: boolean;
		type?: string;
		standardWindow?: boolean;
		webPreferences?: WebPreferences;
		java?: boolean;
		textAreasAreResizable?: boolean;
		extraPluginDirs?: string[];
		subpixelFontScaling?: boolean;
		overlayFullscreenVideo?: boolean;
		titleBarStyle?: string;
		backgroundColor?: string;
	}

	interface Rectangle {
		x?: number;
		y?: number;
		width?: number;
		height?: number;
	}

	/**
	 * A WebContents is responsible for rendering and controlling a web page.
	 */
	class WebContents implements NodeJS.EventEmitter {
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
		/**
		 * Loads the url in the window.
		 * @param url Must contain the protocol prefix (e.g., the http:// or file://).
		 */
		loadURL(url: string, options?: {
			httpReferrer?: string;
			userAgent?: string;
		}): void;
		/**
		 * @returns The URL of current web page.
		 */
		getURL(): string;
		/**
		 * @returns The title of web page.
		 */
		getTitle(): string;
		/**
		 * @returns The favicon of the web page.
		 */
		getFavicon(): NativeImage;
		/**
		 * @returns Whether web page is still loading resources.
		 */
		isLoading(): boolean;
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
		 * Injects CSS into this page.
		 */
		insertCSS(css: string): void;
		/**
		 * Evaluates code in page.
		 * @param code Code to evaluate.
		 */
		executeJavaScript(code: string): void;
		/**
		 * Executes Edit -> Undo command in page.
		 */
		undo(): void;
		/**
		 * Executes Edit -> Redo command in page.
		 */
		redo(): void;
		/**
		 * Executes Edit -> Cut command in page.
		 */
		cut(): void;
		/**
		 * Executes Edit -> Copy command in page.
		 */
		copy(): void;
		/**
		 * Executes Edit -> Paste command in page.
		 */
		paste(): void;
		/**
		 * Executes Edit -> Delete command in page.
		 */
		delete(): void;
		/**
		 * Executes Edit -> Select All command in page.
		 */
		selectAll(): void;
		/**
		 * Executes Edit -> Unselect command in page.
		 */
		unselect(): void;
		/**
		 * Executes Edit -> Replace command in page.
		 */
		replace(text: string): void;
		/**
		 * Executes Edit -> Replace Misspelling command in page.
		 */
		replaceMisspelling(text: string): void;
		/**
		 * Checks if any serviceworker is registered.
		 */
		hasServiceWorker(callback: (hasServiceWorker: boolean) => void): void;
		/**
		 * Unregisters any serviceworker if present.
		 */
		unregisterServiceWorker(callback:
			/**
			 * @param isFulfilled Whether the JS promise is fulfilled.
			 */
			(isFulfilled: boolean) => void): void;
		/**
		 *
		 * Prints window's web page. When silent is set to false, Electron will pick up system's default printer and default settings for printing.
		 * Calling window.print() in web page is equivalent to call WebContents.print({silent: false, printBackground: false}).
		 * Note:
		 *   On Windows, the print API relies on pdf.dll. If your application doesn't need print feature, you can safely remove pdf.dll in saving binary size.
		 */
		print(options?: {
			/**
			 *  Don't ask user for print settings, defaults to false
			 */
			silent?: boolean;
			/**
			 * Also prints the background color and image of the web page, defaults to false.
			 */
			printBackground: boolean;
		}): void;
		/**
		 * Prints windows' web page as PDF with Chromium's preview printing custom settings.
		 */
		printToPDF(options: {
			/**
			 * Specify the type of margins to use. Default is 0.
			 *   0 - default
			 *   1 - none
			 *   2 - minimum
			 */
			marginsType?: number;
			/**
			 * String - Specify page size of the generated PDF. Default is A4.
			 *   A4
			 *   A3
			 *   Legal
			 *   Letter
			 *   Tabloid
			 */
			pageSize?: string;
			/**
			 * Whether to print CSS backgrounds. Default is false.
			 */
			printBackground?: boolean;
			/**
			 * Whether to print selection only. Default is false.
			 */
			printSelectionOnly?: boolean;
			/**
			 * true for landscape, false for portrait.  Default is false.
			 */
			landscape?: boolean;
		},
		/**
		 * Callback function on completed converting to PDF.
		 *   error Error
		 *   data Buffer - PDF file content
		 */
		callback: (error: Error, data: Buffer) => void): void;
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
			 * Opens devtools in a new window.
			 */
			detach?: boolean;
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
		 * Send args.. to the web page via channel in asynchronous message, the web page
		 * can handle it by listening to the channel event of ipc module.
		 * Note:
		 *   1. The IPC message handler in web pages do not have a event parameter,
		 *      which is different from the handlers on the main process.
		 *   2. There is no way to send synchronous messages from the main process
		 *      to a renderer process, because it would be very easy to cause dead locks.
		 */
		send(channel: string, ...args: any[]): void;
	}

	/**
	 * The Menu class is used to create native menus that can be used as application
	 * menus and context menus. Each menu consists of multiple menu items, and each
	 * menu item can have a submenu.
	 */
	class Menu {
		/**
		 * Creates a new menu.
		 */
		constructor();
		/**
		 * Sets menu as the application menu on OS X. On Windows and Linux, the menu
		 * will be set as each window's top menu.
		 */
		static setApplicationMenu(menu: Menu): void;
		/**
		 * Sends the action to the first responder of application, this is used for
		 * emulating default Cocoa menu behaviors, usually you would just use the
		 * selector property of MenuItem.
		 *
		 * Note: This method is OS X only.
		 */
		static sendActionToFirstResponder(action: string): void;
		/**
		 * @param template Generally, just an array of options for constructing MenuItem.
		 * You can also attach other fields to element of the template, and they will
		 * become properties of the constructed menu items.
		 */
		static buildFromTemplate(template: MenuItemOptions[]): Menu;
		/**
		 * Popups this menu as a context menu in the browserWindow. You can optionally
		 * provide a (x,y) coordinate to place the menu at, otherwise it will be placed
		 * at the current mouse cursor position.
		 * @param x Horizontal coordinate where the menu will be placed.
		 * @param y Vertical coordinate where the menu will be placed.
		 */
		popup(browserWindow: BrowserWindow, x?: number, y?: number): void;
		/**
		 * Appends the menuItem to the menu.
		 */
		append(menuItem: MenuItem): void;
		/**
		 * Inserts the menuItem to the pos position of the menu.
		 */
		insert(position: number, menuItem: MenuItem): void;
		items: MenuItem[];
	}

	class MenuItem {
		constructor(options?: MenuItemOptions);
		options: MenuItemOptions;
	}

	interface MenuItemOptions {
		/**
		 * Callback when the menu item is clicked.
		 */
		click?: Function;
		/**
		 * Call the selector of first responder when clicked (OS X only).
		 */
		selector?: string;
		/**
		 * Can be normal, separator, submenu, checkbox or radio.
		 */
		type?: string;
		label?: string;
		sublabel?: string;
		/**
		 * An accelerator is string that represents a keyboard shortcut, it can contain
		 * multiple modifiers and key codes, combined by the + character.
		 *
		 * Examples:
		 *   Command+A
		 *   Ctrl+Shift+Z
		 *
		 * Platform notice: On Linux and Windows, the Command key would not have any effect,
		 * you can use CommandOrControl which represents Command on OS X and Control on
		 * Linux and Windows to define some accelerators.
		 *
		 * Available modifiers:
		 *   Command (or Cmd for short)
		 *   Control (or Ctrl for short)
		 *   CommandOrControl (or CmdOrCtrl for short)
		 *   Alt
		 *   Shift
		 *
		 * Available key codes:
		 *   0 to 9
		 *   A to Z
		 *   F1 to F24
		 *   Punctuations like ~, !, @, #, $, etc.
		 *   Plus
		 *   Space
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
		 */
		accelerator?: string;
		/**
		 * In Electron for the APIs that take images, you can pass either file paths
		 * or NativeImage instances. When passing null, an empty image will be used.
		 */
		icon?: NativeImage|string;
		enabled?: boolean;
		visible?: boolean;
		checked?: boolean;
		/**
		 * Should be specified for submenu type menu item, when it's specified the
		 * type: 'submenu' can be omitted for the menu item
		 */
		submenu?: Menu;
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
		role?: string;
	}

	class BrowserWindowProxy {
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
	}

	class App implements NodeJS.EventEmitter {
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
		 * Quit the application directly, it will not try to close all windows so
		 * cleanup code will not run.
		 */
		terminate(): void;
		/**
		 * Returns the current application directory.
		 */
		getAppPath(): string;
		/**
		 * @param name One of: home, appData, userData, cache, userCache, temp, userDesktop, exe, module
		 * @returns The path to a special directory or file associated with name.
		 * On failure an Error would throw.
		 */
		getPath(name: string): string;
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
		setPath(name: string, path: string): void;
		/**
		 * @returns The version of loaded application, if no version is found in
		 * application's package.json, the version of current bundle or executable.
		 */
		getVersion(): string;
		/**
		 *
		 * @returns The current application's name, the name in package.json would be used.
		 * Usually the name field of package.json is a short lowercased name, according to
		 * the spec of npm modules. So usually you should also specify a productName field,
		 * which is your application's full capitalized name, and it will be preferred over
		 * name by Electron.
		 */
		getName(): string;
		/**
		 * Resolves the proxy information for url, the callback would be called with
		 * callback(proxy) when the request is done.
		 */
		resolveProxy(url: string, callback: Function): void;
		/**
		 * Adds path to recent documents list.
		 *
		 * This list is managed by the system, on Windows you can visit the list from
		 * task bar, and on Mac you can visit it from dock menu.
		 */
		addRecentDocument(path: string): void;
		/**
		 * Clears the recent documents list.
		 */
		clearRecentDocuments(): void;
		/**
		 * Adds tasks to the Tasks category of JumpList on Windows.
		 *
		 * Note: This API is only available on Windows.
		 */
		setUserTasks(tasks: Task[]): void;
		dock: BrowserWindow;
		commandLine: CommandLine;
		/**
		 * This method makes your application a Single Instance Application instead of allowing
		 * multiple instances of your app to run, this will ensure that only a single instance
		 * of your app is running, and other instances signal this instance and exit.
		 */
		makeSingleInstance(callback: (args: string[], workingDirectory: string) => boolean): boolean;
		setAppUserModelId(id: string): void;
	}

	interface CommandLine {
		/**
		 * Append a switch [with optional value] to Chromium's command line.
		 *
		 * Note: This will not affect process.argv, and is mainly used by developers
		 * to control some low-level Chromium behaviors.
		 */
		appendSwitch(_switch: string, value?: string|number): void;
		/**
		 * Append an argument to Chromium's command line. The argument will quoted properly.
		 *
		 * Note: This will not affect process.argv.
		 */
		appendArgument(value: any): void;
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
		commandLine?: CommandLine;
		dock?: {
			/**
			 * When critical is passed, the dock icon will bounce until either the
			 * application becomes active or the request is canceled.
			 *
			 * When informational is passed, the dock icon will bounce for one second.
			 * The request, though, remains active until either the application becomes
			 * active or the request is canceled.
			 *
			 * Note: This API is only available on Mac.
			 * @param type Can be critical or informational, the default is informational.
			 * @returns An ID representing the request
			 */
			bounce(type?: string): any;
			/**
			 * Cancel the bounce of id.
			 *
			 * Note: This API is only available on Mac.
			 */
			cancelBounce(id: number): void;
			/**
			 * Sets the string to be displayed in the dock’s badging area.
			 *
			 * Note: This API is only available on Mac.
			 */
			setBadge(text: string): void;
			/**
			 * Returns the badge string of the dock.
			 *
			 * Note: This API is only available on Mac.
			 */
			getBadge(): string;
			/**
			 * Hides the dock icon.
			 *
			 * Note: This API is only available on Mac.
			 */
			hide(): void;
			/**
			 * Shows the dock icon.
			 *
			 * Note: This API is only available on Mac.
			 */
			show(): void;
			/**
			 * Sets the application dock menu.
			 *
			 * Note: This API is only available on Mac.
			 */
			setMenu(menu: Menu): void;
		};
	}

	class AutoUpdater implements NodeJS.EventEmitter {
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
		/**
		 * Set the url and initialize the auto updater.
		 * The url cannot be changed once it is set.
		 */
		setFeedURL(url: string): void;
		/**
		 * Ask the server whether there is an update, you have to call setFeedURL
		 * before using this API
		 */
		checkForUpdates(): any;
	}

	module Dialog {
		/**
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns an array of file paths chosen by the user,
		 * otherwise returns undefined.
		 */
		export function showOpenDialog(
			browserWindow?: BrowserWindow,
			options?: OpenDialogOptions,
			callback?: (fileNames: string[]) => void
			): void;
		export function showOpenDialog(
			options?: OpenDialogOptions,
			callback?: (fileNames: string[]) => void
			): void;

		interface OpenDialogOptions {
			title?: string;
			defaultPath?: string;
			/**
			 * File types that can be displayed or selected.
			 */
			filters?: {
				name: string;
				extensions: string[];
			}[];
			/**
			 * Contains which features the dialog should use, can contain openFile,
			 * openDirectory, multiSelections and createDirectory
			 */
			properties?: string|string[];
		}

		interface SaveDialogOptions {
			title?: string;
			defaultPath?: string;
			/**
			 * File types that can be displayed, see dialog.showOpenDialog for an example.
			 */

			filters?: {
				name: string;
				extensions: string[];
			}[]
		}

		/**
		 * @param browserWindow
		 * @param options
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns the path of file chosen by the user, otherwise
		 * returns undefined.
		 */
		export function showSaveDialog(browserWindow?: BrowserWindow, options?: SaveDialogOptions, callback?: (fileName: string) => void): string;

		/**
		 * Shows a message box. It will block until the message box is closed. It returns .
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns The index of the clicked button.
		 */
		export function showMessageBox(
			browserWindow?: BrowserWindow,
			options?: ShowMessageBoxOptions,
			callback?: (response: any) => void
			): number;
		export function showMessageBox(
			options: ShowMessageBoxOptions,
			callback?: (response: any) => void
			): number;

		export interface ShowMessageBoxOptions {
			/**
			 * Can be "none", "info" or "warning".
			 */
			type?: string;
			/**
			 * Texts for buttons.
			 */
			buttons?: string[];
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
			noLink?: boolean;
			cancelId?: number;
		}
	}

	class Tray implements NodeJS.EventEmitter {
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
		/**
		 * Creates a new tray icon associated with the image.
		 */
		constructor(image: NativeImage|string);
		/**
		 * Destroys the tray icon immediately.
		 */
		destroy(): void;
		/**
		 * Sets the image associated with this tray icon.
		 */
		setImage(image: NativeImage|string): void;
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
		 * Note: This is only implemented on OS X.
		 */
		setTitle(title: string): void;
		/**
		 * Sets whether the tray icon is highlighted when it is clicked.
		 * Note: This is only implemented on OS X.
		 */
		setHighlightMode(highlight: boolean): void;
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
		 * Sets the context menu for this icon.
		 */
		setContextMenu(menu: Menu): void;
	}

	interface Clipboard {
		/**
		 * @returns The contents of the clipboard as plain text.
		 */
		readText(type?: string): string;
		/**
		 * Writes the text into the clipboard as plain text.
		 */
		writeText(text: string, type?: string): void;
		/**
		 * @returns The contents of the clipboard as a NativeImage.
		 */
		readImage: typeof Electron.Clipboard.readImage;
		/**
		 * Writes the image into the clipboard.
		 */
		writeImage: typeof Electron.Clipboard.writeImage;
		/**
		 * Clears everything in clipboard.
		 */
		clear(type?: string): void;
		/**
		 * Note: This API is experimental and could be removed in future.
		 * @returns Whether the clipboard has data in the specified format.
		 */
		has(format: string, type?: string): boolean;
		/**
		 * Reads the data in the clipboard of the specified format.
		 * Note: This API is experimental and could be removed in future.
		 */
		read(format: string, type?: string): any;
	}

	interface CrashReporterStartOptions {
		/**
		* Default: Electron
		*/
		productName?: string;
		/**
		* Default: GitHub, Inc.
		*/
		companyName?: string;
		/**
		* URL that crash reports would be sent to as POST.
		* Default: http://54.249.141.255:1127/post
		*/
		submitURL?: string;
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
		* An object you can define which content will be send along with the report.
		* Only string properties are send correctly.
		* Nested objects are not supported.
		*/
		extra?: {};
	}

	interface CrashReporterPayload extends Object {
		/**
		* E.g., "electron-crash-service".
		*/
		rept: string;
		/**
		* The version of Electron.
		*/
		ver: string;
		/**
		* E.g., "win32".
		*/
		platform: string;
		/**
		* E.g., "renderer".
		*/
		process_type: string;
		ptime: number;
		/**
		* The version in package.json.
		*/
		_version: string;
		/**
		* The product name in the crashReporter options object.
		*/
		_productName: string;
		/**
		* Name of the underlying product. In this case, Electron.
		*/
		prod: string;
		/**
		* The company name in the crashReporter options object.
		*/
		_companyName: string;
		/**
		* The crashreporter as a file.
		*/
		upload_file_minidump: File;
	}

	interface CrashReporter {
		start(options?: CrashReporterStartOptions): void;

		/**
		 * @returns The date and ID of the last crash report. When there was no crash report
		 * sent or the crash reporter is not started, null will be returned.
		 */
		getLastCrashReport(): CrashReporterPayload;
	}

	interface Shell {
		/**
		 * Show the given file in a file manager. If possible, select the file.
		 */
		showItemInFolder(fullPath: string): void;
		/**
		 * Open the given file in the desktop's default manner.
		 */
		openItem(fullPath: string): void;
		/**
		 * Open the given external protocol URL in the desktop's default manner
		 * (e.g., mailto: URLs in the default mail user agent).
		 */
		openExternal(url: string): void;
		/**
		 * Move the given file to trash and returns boolean status for the operation.
		 */
		moveItemToTrash(fullPath: string): void;
		/**
		 * Play the beep sound.
		 */
		beep(): void;
	}

	// Type definitions for renderer process

	export class IpcRenderer implements NodeJS.EventEmitter {
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
		sendSync(channel: string, ...args: any[]): string;
		/**
		 * Like ipc.send but the message will be sent to the host page instead of the main process.
		 * This is mainly used by the page in <webview> to communicate with host page.
		 */
		sendToHost(channel: string, ...args: any[]): void;
	}

	class IPCMain implements NodeJS.EventEmitter {
		addListener(event: string, listener: Function): this;
		once(event: string, listener: Function): this;
		removeListener(event: string, listener: Function): this;
		removeAllListeners(event?: string): this;
		setMaxListeners(n: number): this;
		getMaxListeners(): number;
		listeners(event: string): Function[];
		emit(event: string, ...args: any[]): boolean;
		listenerCount(type: string): number;
		on(event: string, listener: (event: IPCMainEvent, ...args: any[]) => any): this;
	}

	interface IPCMainEvent {
		returnValue?: any;
		sender: WebContents;
	}

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
		 * @returns The global variable of name (e.g. global[name]) in the main process.
		 */
		getGlobal(name: string): any;
		/**
		 * Returns the process object in the main process. This is the same as
		 * remote.getGlobal('process'), but gets cached.
		 */
		process: NodeJS.Process;
	}

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
	}

	// Type definitions for main process

	interface ContentTracing {
		/**
		 * Get a set of category groups. The category groups can change as new code paths are reached.
		 * @param callback Called once all child processes have acked to the getCategories request.
		 */
		getCategories(callback: (categoryGroups: any[]) => void): void;
		/**
		 * Start recording on all processes. Recording begins immediately locally, and asynchronously
		 * on child processes as soon as they receive the EnableRecording request.
		 * @param categoryFilter A filter to control what category groups should be traced.
		 * A filter can have an optional "-" prefix to exclude category groups that contain
		 * a matching category. Having both included and excluded category patterns in the
		 * same list would not be supported.
		 * @param options controls what kind of tracing is enabled, it could be a OR-ed
		 * combination of tracing.DEFAULT_OPTIONS, tracing.ENABLE_SYSTRACE, tracing.ENABLE_SAMPLING
		 * and tracing.RECORD_CONTINUOUSLY.
		 * @param callback Called once all child processes have acked to the startRecording request.
		 */
		startRecording(categoryFilter: string, options: number, callback: Function): void;
		/**
		 * Stop recording on all processes. Child processes typically are caching trace data and
		 * only rarely flush and send trace data back to the main process. That is because it may
		 * be an expensive operation to send the trace data over IPC, and we would like to avoid
		 * much runtime overhead of tracing. So, to end tracing, we must asynchronously ask all
		 * child processes to flush any pending trace data.
		 * @param resultFilePath Trace data will be written into this file if it is not empty,
		 * or into a temporary file.
		 * @param callback Called once all child processes have acked to the stopRecording request.
		 */
		stopRecording(resultFilePath: string, callback:
			/**
			 * @param filePath A file that contains the traced data.
			 */
			(filePath: string) => void
			): void;
		/**
		 * Start monitoring on all processes. Monitoring begins immediately locally, and asynchronously
		 * on child processes as soon as they receive the startMonitoring request.
		 * @param callback Called once all child processes have acked to the startMonitoring request.
		 */
		startMonitoring(categoryFilter: string, options: number, callback: Function): void;
		/**
		 * Stop monitoring on all processes.
		 * @param callback Called once all child processes have acked to the stopMonitoring request.
		 */
		stopMonitoring(callback: Function): void;
		/**
		 * Get the current monitoring traced data. Child processes typically are caching trace data
		 * and only rarely flush and send trace data back to the main process. That is because it may
		 * be an expensive operation to send the trace data over IPC, and we would like to avoid much
		 * runtime overhead of tracing. So, to end tracing, we must asynchronously ask all child
		 * processes to flush any pending trace data.
		 * @param callback Called once all child processes have acked to the captureMonitoringSnapshot request.
		 */
		captureMonitoringSnapshot(resultFilePath: string, callback:
			/**
			 * @param filePath A file that contains the traced data
			 * @returns {}
			 */
			(filePath: string) => void
			): void;
		/**
		 * Get the maximum across processes of trace buffer percent full state.
		 * @param callback Called when the TraceBufferUsage value is determined.
		 */
		getTraceBufferUsage(callback: Function): void;
		/**
		 * @param callback Called every time the given event occurs on any process.
		 */
		setWatchEvent(categoryName: string, eventName: string, callback: Function): void;
		/**
		 * Cancel the watch event. If tracing is enabled, this may race with the watch event callback.
		 */
		cancelWatchEvent(): void;
		DEFAULT_OPTIONS: number;
		ENABLE_SYSTRACE: number;
		ENABLE_SAMPLING: number;
		RECORD_CONTINUOUSLY: number;
	}

	interface Dialog {
		/**
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns an array of file paths chosen by the user,
		 * otherwise returns undefined.
		 */
		showOpenDialog: typeof Electron.Dialog.showOpenDialog;
		/**
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns On success, returns the path of file chosen by the user, otherwise
		 * returns undefined.
		 */
		showSaveDialog: typeof Electron.Dialog.showSaveDialog;
		/**
		 * Shows a message box. It will block until the message box is closed. It returns .
		 * @param callback If supplied, the API call will be asynchronous.
		 * @returns The index of the clicked button.
		 */
		showMessageBox: typeof Electron.Dialog.showMessageBox;

		/**
		 * Runs a modal dialog that shows an error message. This API can be called safely
		 * before the ready event of app module emits, it is usually used to report errors
		 * in early stage of startup.
		 */
		showErrorBox(title: string, content: string): void;
	}

	interface GlobalShortcut {
		/**
		 * Registers a global shortcut of accelerator.
		 * @param accelerator Represents a keyboard shortcut. It can contain modifiers
		 * and key codes, combined by the "+" character.
		 * @param callback Called when the registered shortcut is pressed by the user.
		 * @returns {}
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

	class RequestFileJob {
		/**
		* Create a request job which would query a file of path and set corresponding mime types.
		*/
		constructor(path: string);
	}

	class RequestStringJob {
		/**
		* Create a request job which sends a string as response.
		*/
		constructor(options?: {
			/**
			* Default is "text/plain".
			*/
			mimeType?: string;
			/**
			* Default is "UTF-8".
			*/
			charset?: string;
			data?: string;
		});
	}

	class RequestBufferJob {
		/**
		* Create a request job which accepts a buffer and sends a string as response.
		*/
		constructor(options?: {
			/**
				* Default is "application/octet-stream".
				*/
			mimeType?: string;
			/**
				* Default is "UTF-8".
				*/
			encoding?: string;
			data?: Buffer;
		});
	}

	interface Protocol {
		registerProtocol(scheme: string, handler: (request: any) => void): void;
		unregisterProtocol(scheme: string): void;
		isHandledProtocol(scheme: string): boolean;
		interceptProtocol(scheme: string, handler: (request: any) => void): void;
		uninterceptProtocol(scheme: string): void;
		RequestFileJob: typeof RequestFileJob;
		RequestStringJob: typeof RequestStringJob;
		RequestBufferJob: typeof RequestBufferJob;
	}

	interface PowerSaveBlocker {
		start(type: string): number;
		stop(id: number): void;
		isStarted(id: number): boolean;
	}

	interface ClearStorageDataOptions {
		origin?: string;
		storages?: string[];
		quotas?: string[];
	}

	interface NetworkEmulationOptions {
		offline?: boolean;
		latency?: number;
		downloadThroughput?: number;
		uploadThroughput?: number;
	}

	interface CertificateVerifyProc {
		(hostname: string, cert: any, callback: (accepted: boolean) => any): any;
	}

	class Session {
		static fromPartition(partition: string): Session;
		static defaultSession: Session;

		cookies: any;
		clearCache(callback: Function): void;
		clearStorageData(callback: Function): void;
		clearStorageData(options: ClearStorageDataOptions, callback: Function): void;
		setProxy(config: string, callback: Function): void;
		resolveProxy(url: URL, callback: (proxy: any) => any): void;
		setDownloadPath(path: string): void;
		enableNetworkEmulation(options: NetworkEmulationOptions): void;
		disableNetworkEmulation(): void;
		setCertificateVerifyProc(proc: CertificateVerifyProc): void;
		webRequest: any;
	}

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
		ipcMain: Electron.IPCMain;
		globalShortcut: Electron.GlobalShortcut;
		Menu: typeof Electron.Menu;
		MenuItem: typeof Electron.MenuItem;
		powerMonitor: NodeJS.EventEmitter;
		powerSaveBlocker: Electron.PowerSaveBlocker;
		protocol: Electron.Protocol;
		screen: Electron.Screen;
		session: Electron.Session;
		Tray: typeof Electron.Tray;
		hideInternalModules(): void;
	}

	interface DesktopCapturerOptions {
		types?: string[];
		thumbnailSize?: {
			width: number;
			height: number;
		};
	}

	interface DesktopCapturerSource {
		id: string;
		name: string;
		thumbnail: NativeImage;
	}

	interface DesktopCapturer {
		getSources(options: any, callback: (error: Error, sources: DesktopCapturerSource[]) => any): void;
	}

	interface ElectronMainAndRenderer extends CommonElectron {
		desktopCapturer: Electron.DesktopCapturer;
		ipcRenderer: Electron.IpcRenderer;
		remote: Electron.Remote;
		webFrame: Electron.WebFrame;
	}
}

interface Window {
	/**
	 * Creates a new window.
	 * @returns An instance of BrowserWindowProxy class.
	 */
	open(url: string, frameName?: string, features?: string): Electron.BrowserWindowProxy;
}

interface File {
	/**
	 * Exposes the real path of the filesystem.
	 */
	path: string;
}

declare module 'electron' {
	var electron: Electron.ElectronMainAndRenderer;
	export = electron;
}

// interface NodeRequireFunction {
// 	(moduleName: 'electron'): Electron.Electron;
// }