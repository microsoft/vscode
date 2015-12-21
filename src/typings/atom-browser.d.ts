/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="./node.d.ts" />

declare module 'ipc' {

	export interface IIPCEvent {
		sender: BrowserWindow;
	}

	export function on(what: string, callback: (event: IIPCEvent, something: any) => void): void;
	export function removeAllListeners(what: string): void;
	export function send(channel: string, data: any): void;
}

declare module 'app' {
	interface IApp extends IEventEmitter {
		quit(): void;
		getVersion(): string;
		getPath(name:string): string;
		getName(): string;
		addRecentDocument(path:string): void;
		clearRecentDocuments(): void;
		getPath(name: string): string;
		setPath(name: string, path: string): void;
		setUserTasks(tasks:ITask[]): void;
		setAppUserModelId(id:string): void;
		dock: IDock;
	}

	var app:IApp;
	export = app;
}

declare module 'ipc' {
	export function on(what: string, callback: Function): void;
	export function once(what: string, callback: Function): void;
	export function removeAllListeners(what: string): void;
}

declare module 'shell' {
	interface IShell {
		showItemInFolder(path: string): void;
		openItem(path: string): void;
		openExternal(url: string): boolean;
		moveItemToTrash(path: string): boolean;
		beep(): void;
	}

	var shell:IShell;
	export = shell;
}

declare module 'screen' {
	var screen:IScreen;
	export = screen;
}

declare module 'browser-window' {
	var IBrowserWindow:{
		new (options: IBrowserWindowOptions): BrowserWindow;
		getFocusedWindow(): BrowserWindow;
		getAllWindows(): BrowserWindow[];
		fromId(id: number): BrowserWindow;
	};

	export = IBrowserWindow;
}

declare module 'dialog' {
	interface IOpenDialogOptions {
		title?: string;
		defaultPath?: string;
		filters?: string[];
		properties?: string[];
	}

	interface ISaveDialogOptions {
	}

	interface IMessageBoxOptions {

		/**
		 * Can be "none", "info" or "warning"
		 */
		type?: string;

		/**
		 * Array of texts for buttons
		 */
		buttons?: string[];

		title?: string;
		message?: string;
		detail?: string;

		cancelId?: number;
		noLink?: boolean;
	}

	interface IDialog {
		showOpenDialog(options: IOpenDialogOptions, callback?:(paths:string[]) => void): string[];
		showOpenDialog(win: BrowserWindow, options: IOpenDialogOptions, callback?:(paths:string[]) => void): string[];

		showSaveDialog(options: ISaveDialogOptions, callback?:(path:string) => void): string;
		showSaveDialog(win: BrowserWindow, options: ISaveDialogOptions, callback?:(path:string) => void): string;

		showMessageBox(options: IMessageBoxOptions, callback?:(index:number) => void): number;
		showMessageBox(win: BrowserWindow, options: IMessageBoxOptions, callback?:(index:number) => void): number;
	}

	var dialog:IDialog;
	export = dialog;
}

declare module 'menu' {

	interface IMenu {
		new (): Menu;
		setApplicationMenu(menu: Menu): void;
		buildFromTemplate(template: string): void;
	}

	var menu:IMenu;
	export = menu;
}

declare module 'menu-item' {

	interface IMenuItem {
		new (options: IMenuItemConfig): MenuItem;
	}

	var menuItem:IMenuItem;
	export = menuItem;
}

interface IEventEmitter {
	addListener(event: string, listener: Function): EventEmitter;
	on(event: string, listener: Function): EventEmitter;
	once(event: string, listener: Function): EventEmitter;
	removeListener(event: string, listener: Function): EventEmitter;
	removeAllListeners(event?: string): EventEmitter;
	setMaxListeners(n: number): void;
	listeners(event: string): Function[];
	emit(event: string, ...args: any[]): boolean;
}

declare class EventEmitter implements IEventEmitter {
	addListener(event: string, listener: Function): EventEmitter;
	on(event: string, listener: Function): EventEmitter;
	once(event: string, listener: Function): EventEmitter;
	removeListener(event: string, listener: Function): EventEmitter;
	removeAllListeners(event?: string): EventEmitter;
	setMaxListeners(n: number): void;
	listeners(event: string): Function[];
	emit(event: string, ...args: any[]): boolean;
}

declare class WebContents extends EventEmitter {
	send(channel: string, ...args: any[]): void;
	executeJavaScript(code: string): void;
	selectAll(): void;
	undo(): void;
	redo(): void;
}

declare class BrowserWindow extends EventEmitter {
	id: number;
	webContents: WebContents;

	show(): void;
	hide(): void;
	focus(): void;
	loadUrl(url: string): void;
	getUrl(): string;
	close(): void;
	destroy(): void;
	setFullScreen(fullscreen: boolean): void;
	isFullScreen(): boolean;
	isMaximized(): boolean;
	minimize(): void;
	isFocused(): boolean;
	isMinimized(): boolean;
	isVisible(): boolean;
	restore(): boolean;
	getSize(): number[];
	setSize(width: number, height: number): void;
	getPosition(): number[];
	setPosition(x: number, y: number): void;
	setMenuBarVisibility(visible: boolean): void;
	setAutoHideMenuBar(autoHide: boolean): void;
	maximize(): void;
	setRepresentedFilename(path: string): void;
	setTitle(title: string): void;
	getTitle():string;

	toggleDevTools(): void;
	openDevTools(): void;
	closeDevTools(): void;
	isDevToolsFocused(): boolean;
	devToolsWebContents: WebContents;

	send(channel: string, msg: any): void;
}

interface IMenuItemConfig {
	label?: string;
	role?: string;
	click?: () => void;
	type?: string;
	selector?: string;
	accelerator?: string;
	enabled?: boolean;
	visible?: boolean;
	checked?: boolean;
	submenu?: Menu;
}

declare class MenuItem implements IMenuItemConfig {
	label: string;
	click: () => void;
	type: string;
	selector: string;
	accelerator: string;
	enabled: boolean;
	visible: boolean;
	checked: boolean;
	submenu: Menu;
}

declare class Menu {
	items: MenuItem[];

	append(menuItem: MenuItem): void;
	insert(pos: number, menuItem: MenuItem): void;
	popup(win: BrowserWindow, x?: number, y?: number): void;
}

interface IScreen extends IEventEmitter {
	getCursorScreenPoint():IPoint;
	getPrimaryDisplay():IDisplay;
	getAllDisplays():IDisplay[];
	getDisplayNearestPoint(point:IPoint):IDisplay;
	getDisplayMatching(rect:IBounds):IDisplay;
}

interface IDisplay {
	id:number;
	bounds:IBounds;
	workArea:IBounds;
	size:IDimension;
	workAreaSize:IDimension;
	scaleFactor:number;
	rotation:number;
	touchSupport:string;
}

interface IBounds {
	x:number;
	y:number;
	width:number;
	height:number;
}

interface IDimension {
	width:number;
	height:number;
}

interface IPoint {
	x:number;
	y:number;
}

interface IBrowserWindowOptions {
	x?: number;
	y?: number;
	width?: number;
	height?: number;
	show?: boolean;
	frame?: boolean;
	kiosk?: boolean;
	'web-preferences'?: IWebPreferences;
	icon?: string;
	'min-width'?: number;
	'min-height'?: number;
	'always-on-top'?: boolean;
	'skip-taskbar'?: boolean;
	'background-color'?: string;
	resizable?: boolean;
	title?: string;
}

interface IWebPreferences {
	javascript?: boolean;
	'web-security'?: boolean;
	images?: boolean;
	java?: boolean;
	'text-areas-are-resizable'?: boolean;
	webgl?: boolean;
	webaudio?: boolean;
	plugins?: boolean;
	'extra-plugin-dirs'?: string[];
	'experimental-features'?: boolean;
	'experimental-canvas-features'?: boolean;
	'subpixel-font-scaling'?: boolean;
	'overlay-scrollbars'?: boolean;
	'overlay-fullscreen-video'?: boolean;
	'shared-worker'?: boolean;
	'direct-write'?: boolean;
}

interface ITask {
	program: string;
	arguments?: string;
	title: string;
	description?: string;
	iconPath?: string;
	iconIndex?: number;
}

interface IDock {
	setMenu(menu:Menu): void;
	show(): void;
	hide(): void;
}

// https://github.com/atom/electron/blob/master/docs/api/auto-updater.md
declare module 'auto-updater' {
	export interface IAutoUpdater extends IEventEmitter {
		setFeedUrl(url: string): void;
		checkForUpdates(): void;
	}

	export interface IUpdate {
		url: string;
		name: string;
		releaseNotes?: string;
		version?: string;
	}

	export function setFeedUrl(url: string): void;
	export function checkForUpdates(): void;
	export function addListener(event: string, listener: Function): EventEmitter;
	export function on(event: string, listener: Function): EventEmitter;
	export function once(event: string, listener: Function): EventEmitter;
	export function removeListener(event: string, listener: Function): EventEmitter;
	export function removeAllListeners(event?: string): EventEmitter;
	export function setMaxListeners(n: number): void;
	export function listeners(event: string): Function[];
	export function emit(event: string, ...args: any[]): boolean;
}

declare module 'crash-reporter' {
	export function start(config?: ICrashReporterConfigBrowser): void;
}

interface ICrashReporterConfigBrowser {
	productName?: string,
	companyName: string,
	submitUrl?: string,
	autoSubmit?: boolean,
	ignoreSystemCrashHandler?: boolean,
	extra?: any
}