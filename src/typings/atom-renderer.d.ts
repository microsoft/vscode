/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/// <reference path="./node.d.ts" />

declare module 'web-frame' {
	export function getZoomLevel(): number;
	export function setZoomLevel(zoomLevel: number): void;
}

declare module 'clipboard' {
	export function readText(type?:string): string;
	export function writeText(text:string, type?:string): void;
	export function clear(type?:string): void;
}

declare module 'ipc' {
	export function on(what: string, callback: Function): void;
	export function once(what: string, callback: Function): void;
	export function removeListener(what: string, callback: (something: any) => void): void;
	export function removeAllListeners(what: string): void;
	export function send(channel: string, ...args:any[]): void;
	export function sendSync(channel: string, ...args:any[]): void;
}

declare module 'remote' {

	interface IProcess extends IEventEmitter {
		argv:string[];
		platform:string;
		execPath:string;
	}

	export var process:IProcess;

	export interface IEventEmitter {
		addListener(event: string, listener: Function): EventEmitter;
		on(event: string, listener: Function): EventEmitter;
		once(event: string, listener: Function): EventEmitter;
		removeListener(event: string, listener: Function): EventEmitter;
		removeAllListeners(event?: string): EventEmitter;
		setMaxListeners(n: number): void;
		listeners(event: string): Function[];
		emit(event: string, ...args: any[]): boolean;
	}

	export class EventEmitter implements IEventEmitter {
		addListener(event: string, listener: Function): EventEmitter;
		on(event: string, listener: Function): EventEmitter;
		once(event: string, listener: Function): EventEmitter;
		removeListener(event: string, listener: Function): EventEmitter;
		removeAllListeners(event?: string): EventEmitter;
		setMaxListeners(n: number): void;
		listeners(event: string): Function[];
		emit(event: string, ...args: any[]): boolean;
	}

	export interface HTMLIWebView extends HTMLObjectElement {

	    /**
	      * Sets or retrieves a URL to be loaded by the object.
	      */
		src: string;

		send(channel: string, ...args: any[]): void;
		executeJavaScript(code: string): void;

		stop(): void;

		openDevTools(): void;
		closeDevTools(): void;
		isDevToolsOpened(): boolean;
	}

	export class Event {
		returnValue: any;
		sender: WebContents;
	}

	export interface IIPC extends IEventEmitter {
	}

	// https://github.com/atom/electron/blob/master/docs/api/app.md
	export interface IApp extends IEventEmitter {
		quit(): void;
		getVersion(): string;
		getPath(name:string): string;
		getName(): string;
		addRecentDocument(path:string): void;
		clearRecentDocuments(): void;
	}

	export interface IOpenDialogOptions {
		title?: string;
		defaultPath?: string;
		filters?: { name:string; extensions:string[] }[];
		properties?: string[];
	}

	export interface ISaveDialogOptions extends IOpenDialogOptions {
	}

	export interface IMessageBoxOptions {

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

	// https://github.com/atom/electron/blob/master/docs/api/dialog.md
	export interface IDialog {
		showOpenDialog(options: IOpenDialogOptions, callback?:(paths:string[]) => void): string[];
		showOpenDialog(win: BrowserWindow, options: IOpenDialogOptions, callback?:(paths:string[]) => void): string[];

		showSaveDialog(options: ISaveDialogOptions, callback?:(path:string) => void): string;
		showSaveDialog(win: BrowserWindow, options: ISaveDialogOptions, callback?:(path:string) => void): string;

		showMessageBox(options: ISaveDialogOptions, callback?:(index:number) => void): number;
		showMessageBox(win: BrowserWindow, options: IMessageBoxOptions, callback?:(index:number) => void): number;
	}

	// https://github.com/atom/electron/blob/master/docs/api/shell.md
	export interface IShell {
		showItemInFolder(path: string): void;
		openItem(path: string): void;
		openExternal(url: string): boolean;
		moveItemToTrash(path: string): boolean;
		beep(): void;
	}

	export interface IWebContents {
		new (): WebContents;
	}

	export class WebContents extends EventEmitter {
		selectAll(): void;
		undo(): void;
		redo(): void;
		send(channel: string, ...args: any[]): void;
	}

	export interface IBrowserWindow {
		new (options: IBrowserWindowOptions): BrowserWindow;
		getFocusedWindow(): BrowserWindow;
	}

	export interface IBrowserWindowOptions {
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		show?: boolean;
		frame?: boolean;
		kiosk?: boolean;
		'web-preferences'?: IWebPreferences;
		'min-width'?: number;
		'min-height'?: number;
		'always-on-top'?: boolean;
		'skip-taskbar'?: boolean;
		'background-color'?: string;
		resizable?: boolean;
		title?: string;
	}

	export interface IWebPreferences {
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

	// https://github.com/atom/electron/blob/master/docs/api/browser-window.md
	export class BrowserWindow extends EventEmitter {
		id: number;
		webContents: WebContents;

		show(): void;
		hide() : void;
		focus(): void;
		isFocused(): boolean;
		reload(): void;
		loadUrl(url: string): void;
		close(): void;
		destroy(): void;
		setFullScreen(fullscreen: boolean): void;
		isFullScreen(): boolean;
		isMaximized(): boolean;
		isMinimized(): boolean;
		isVisible(): boolean;
		getSize(): number[];
		setSize(width: number, height: number): void;
		getPosition(): number[];
		setPosition(x: number, y: number): void;
		setMenuBarVisibility(visible: boolean): void;
		setAutoHideMenuBar(autoHide: boolean): void;
		maximize(): void;
		setRepresentedFilename(path: string): void;
		setDocumentEdited(edited: boolean): void;
		isDocumentEdited(): boolean;
		setTitle(title: string): void;
		getTitle(): string;
		flashFrame(flag: boolean): void;

		openDevTools(): void;
		closeDevTools(): void;
		toggleDevTools(): void;
		isDevToolsOpened(): boolean;
		isDevToolsFocused(): boolean;
		devToolsWebContents: WebContents;
	}

	export interface IMenu {
		new (): Menu;
		setApplicationMenu(menu: Menu): void;
		buildFromTemplate(template: string): void;
	}

	// https://github.com/atom/electron/blob/master/docs/api/menu.md
	export class Menu {
		items: MenuItem[];

		append(menuItem: MenuItem): void;
		insert(pos: number, menuItem: MenuItem): void;
		popup(win: BrowserWindow, x?: number, y?: number): void;
	}

	export interface IMenuItem {
		new (options: IMenuItemConfig): MenuItem;
	}

	// https://github.com/atom/electron/blob/master/docs/api/menu-item.md
	export class MenuItem implements IMenuItemConfig {
		label: string;
		role: string;
		click: () => void;
		type: string;
		selector: string;
		accelerator: string;
		enabled: boolean;
		visible: boolean;
		checked: boolean;
		submenu: Menu;
	}

	export interface IMenuItemConfig {
		label?: string;
		click?: () => void;
		type?: string;
		selector?: string;
		accelerator?: string;
		enabled?: boolean;
		visible?: boolean;
		checked?: boolean;
		submenu?: Menu;
	}

	export interface IClipboard {
		readText(type?:string): string;
		writeText(text:string, type?:string): void;
		clear(type?:string): void;
	}

	export interface IUnknown {

	}

	export function require(moduleName: 'shell'): IShell;
	export function require(moduleName: 'menu'): IMenu;
	export function require(moduleName: 'menu-item'): IMenuItem;
	export function require(moduleName: 'app'): IApp;
	export function require(moduleName: 'dialog'): IDialog;
	export function require(moduleName: 'ipc'): IIPC;
	export function require(moduleName: 'clipboard'): IClipboard;
	export function require(moduleName: 'browser-window'): IBrowserWindow;
	export function require(moduleName: string): IUnknown;

	export function getCurrentWindow(): BrowserWindow;
	export function getGlobal(name: string): any;

}

declare module 'crash-reporter' {
	export function start(config?: ICrashReporterConfigRenderer): void;
}

interface ICrashReporterConfigRenderer {
	productName?: string,
	companyName: string,
	submitUrl?: string,
	autoSubmit?: boolean,
	ignoreSystemCrashHandler?: boolean,
	extra?: any
}