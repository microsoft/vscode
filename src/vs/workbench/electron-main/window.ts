/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import path = require('path');

import Shell = require('shell');
import screen = require('screen');
import BrowserWindow = require('browser-window');

import {TPromise, TValueCallback} from 'vs/base/common/winjs.base';
import platform = require('vs/base/common/platform');
import objects = require('vs/base/common/objects');
import env = require('vs/workbench/electron-main/env');
import storage = require('vs/workbench/electron-main/storage');
import {IEnv} from 'vs/base/node/env';

export interface IWindowState {
	width?: number;
	height?: number;
	x?: number;
	y?: number;
	mode?: WindowMode;
}

export enum WindowMode {
	Maximized,
	Normal,
	Minimized
}

export const defaultWindowState = function(mode = WindowMode.Normal): IWindowState {
	return {
		width: 1024,
		height: 768,
		mode: mode
	};
};

export enum ReadyState {

	/**
	 * This window has not loaded any HTML yet
	 */
	NONE,

	/**
	 * This window is loading HTML
	 */
	LOADING,

	/**
	 * This window is navigating to another HTML
	 */
	NAVIGATING,

	/**
	 * This window is done loading HTML
	 */
	READY
}

export interface IPath {

	// the workspace spath for a VSCode instance which can be null
	workspacePath?: string;

	// the file path to open within a VSCode instance
	filePath?: string;

	// the line number in the file path to open
	lineNumber?: number;

	// the column number in the file path to open
	columnNumber?: number;

	// indicator to create the file path in the VSCode instance
	createFilePath?: boolean;

	// indicator to install the extension (path to .vsix) in the VSCode instance
	installExtensionPath?: boolean;
}

export interface IWindowConfiguration extends env.ICommandLineArguments {
	execPath: string;
	version: string;
	appName: string;
	appSettingsHome: string;
	appSettingsPath: string;
	appKeybindingsPath: string;
	userPluginsHome: string;
	sharedIPCHandle: string;
	appRoot: string;
	isBuilt: boolean;
	commitHash: string;
	updateFeedUrl: string;
	updateChannel: string;
	recentPaths: string[];
	workspacePath?: string;
	filesToOpen?: IPath[];
	filesToCreate?: IPath[];
	extensionsToInstall: string[];
	autoSaveDelay?: number;
	crashReporter: ICrashReporterConfigBrowser;
	extensionsGallery: {
		serviceUrl: string;
		itemUrl: string;
	};
	welcomePage: string;
	releaseNotesUrl: string;
	productDownloadUrl: string;
	enableTelemetry: boolean;
	userEnv: IEnv,
	aiConfig: {
		key: string;
		asimovKey: string;
	},
	sendASmile: {
		submitUrl: string,
		reportIssueUrl: string,
		requestFeatureUrl: string
	}
}

const enableDebugLogging = false;

export class VSCodeWindow {

	private static MIN_WIDTH = 200;
	private static MIN_HEIGHT = 120;

	private showTimeoutHandle: any;
	private _win: BrowserWindow;
	private _lastFocusTime: number;
	private _readyState: ReadyState;
	private _isPluginDevelopmentHost: boolean;
	private windowState: IWindowState;
	private currentWindowMode: WindowMode;

	private whenReadyCallbacks: TValueCallback<VSCodeWindow>[];

	private currentConfig: IWindowConfiguration;
	private pendingLoadConfig: IWindowConfiguration;

	constructor(state?: IWindowState, isPluginDevelopmentHost?: boolean, usesLightTheme?: boolean) {
		this._lastFocusTime = -1;
		this._readyState = ReadyState.NONE;
		this._isPluginDevelopmentHost = isPluginDevelopmentHost;
		this.whenReadyCallbacks = [];

		// Load window state
		this.restoreWindowState(state);

		// For VS theme we can show directly because background is white
		let showDirectly = usesLightTheme;
		if (showDirectly && !global.windowShow) {
			global.windowShow = new Date().getTime();
		}

		let options: IBrowserWindowOptions = {
			width: this.windowState.width,
			height: this.windowState.height,
			x: this.windowState.x,
			y: this.windowState.y,
			'background-color': usesLightTheme ? '#FFFFFF' : '#1E1E1E',
			'min-width': VSCodeWindow.MIN_WIDTH,
			'min-height': VSCodeWindow.MIN_HEIGHT,
			show: showDirectly && this.currentWindowMode !== WindowMode.Maximized, // in case we are maximized, only show later after the call to maximize (see below)
			title: env.product.nameLong
		};

		if (platform.isLinux && env.product.icons && env.product.icons.application && env.product.icons.application.png) {
			options.icon = path.join(env.appRoot, env.product.icons.application.png); // Windows and Mac are better off using the embedded icon(s)
		}

		// Create the browser window.
		this._win = new BrowserWindow(options);

		if (showDirectly && this.currentWindowMode === WindowMode.Maximized) {
			this.win.maximize();

			if (!this.win.isVisible()) {
				this.win.show(); // to reduce flicker from the default window size to maximize, we only show after maximize
			}
		}

		if (showDirectly) {
			this._lastFocusTime = new Date().getTime(); // since we show directly, we need to set the last focus time too
		}

		this.registerListeners();
	}

	public get isPluginDevelopmentHost(): boolean {
		return this._isPluginDevelopmentHost;
	}

	public get config(): IWindowConfiguration {
		return this.currentConfig;
	}

	public get win(): BrowserWindow {
		return this._win;
	}

	public restore(): void {
		if (!this._win) {
			return;
		}

		if (this._win.isMinimized()) {
			this._win.restore();
		}

		this._win.focus();
	}

	public get lastFocusTime(): number {
		return this._lastFocusTime;
	}

	public get openedWorkspacePath(): string {
		return this.currentConfig.workspacePath;
	}

	public get openedFilePath(): string {
		return this.currentConfig.filesToOpen && this.currentConfig.filesToOpen[0] && this.currentConfig.filesToOpen[0].filePath;
	}

	public setReady(): void {
		this._readyState = ReadyState.READY;

		// inform all waiting promises that we are ready now
		while (this.whenReadyCallbacks.length) {
			this.whenReadyCallbacks.pop()(this);
		}
	}

	public ready(): TPromise<VSCodeWindow> {
		return new TPromise<VSCodeWindow>((c) => {
			if (this._readyState === ReadyState.READY) {
				return c(this);
			}

			// otherwise keep and call later when we are ready
			this.whenReadyCallbacks.push(c);
		});
	}

	public get readyState(): ReadyState {
		return this._readyState;
	}

	private registerListeners(): void {

		// Remember that we loaded
		this._win.webContents.on('did-finish-load', () => {
			this._readyState = ReadyState.LOADING;

			// Associate properties from the load request if provided
			if (this.pendingLoadConfig) {
				this.currentConfig = this.pendingLoadConfig;

				delete this.pendingLoadConfig;
			}

			// To prevent flashing, we set the window visible after the page has finished to load but before VSCode is loaded
			if (!this.win.isVisible()) {
				if (!global.windowShow) {
					global.windowShow = new Date().getTime();
				}

				if (this.currentWindowMode === WindowMode.Maximized) {
					this.win.maximize();
				}

				if (!this.win.isVisible()) { // maximize also makes visible
					this.win.show();
				}
			}
		});

		// App commands support
		this._win.on('app-command', (e, cmd) => {
			if (this.readyState !== ReadyState.READY) {
				return; // window must be ready
			}

			// Support navigation via mouse buttons 4/5
			if (cmd === 'browser-backward') {
				this._win.webContents.send('vscode:runAction', 'workbench.action.navigateBack');
			} else if (cmd === 'browser-forward') {
				this._win.webContents.send('vscode:runAction', 'workbench.action.navigateForward');
			}
		});

		// Handle code that wants to open links
		this._win.webContents.on('new-window', (event: Event, url: string) => {
			event.preventDefault();

			Shell.openExternal(url);
		});

		// Window Focus
		this._win.on('focus', () => {
			this._lastFocusTime = new Date().getTime();
		});

		// Window Failed to load
		this._win.webContents.on('did-fail-load', (event: Event, errorCode: string, errorDescription: string) => {
			console.warn('[electron event]: fail to load, ', errorDescription);
		});

		// Prevent any kind of navigation triggered by the user!
		// But do not touch this in dev version because it will prevent "Reload" from dev tools
		if (env.isBuilt) {
			this._win.webContents.on('will-navigate', (event: Event) => {
				if (event) {
					event.preventDefault();
				}
			});
		}
	}

	public load(config: IWindowConfiguration): void {

		// If this is the first time the window is loaded, we associate the paths
		// directly with the window because we assume the loading will just work
		if (this.readyState === ReadyState.NONE) {
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

		// Load URL
		this._win.loadUrl(this.getUrl(config));

		// Make window visible if it did not open in N seconds because this indicates an error
		if (!config.isBuilt) {
			this.showTimeoutHandle = setTimeout(() => {
				if (this._win && !this._win.isVisible() && !this._win.isMinimized()) {
					this._win.show();
					this._win.focus();
					this._win.openDevTools();
				}
			}, 10000);
		}
	}

	public reload(cli?: env.ICommandLineArguments): void {

		// Inherit current properties but overwrite some
		let configuration: IWindowConfiguration = objects.mixin({}, this.currentConfig);
		delete configuration.filesToOpen;
		delete configuration.filesToCreate;
		delete configuration.extensionsToInstall;
		configuration.autoSaveDelay = storage.getItem<number>('autoSaveDelay') || -1 /* Disabled by default */;

		// Some configuration things get inherited if the window is being reloaded and we are
		// in plugin development mode. These options are all development related.
		if (this.isPluginDevelopmentHost && cli) {
			configuration.verboseLogging = cli.verboseLogging;
			configuration.logPluginHostCommunication = cli.logPluginHostCommunication;
			configuration.debugPluginHostPort = cli.debugPluginHostPort;
			configuration.debugBrkPluginHost = cli.debugBrkPluginHost;
		}

		// Load config
		this.load(configuration);
	}

	private getUrl(config: IWindowConfiguration): string {
		let url = require.toUrl('vs/workbench/electron-browser/index.html');

		// Config
		url += '?config=' + encodeURIComponent(JSON.stringify(config));

		return url;
	}

	public serializeWindowState(): IWindowState {
		if (this.win.isFullScreen()) {
			return defaultWindowState(); // ignore state when in fullscreen mode and return defaults
		}

		let state: IWindowState = Object.create(null);
		let mode: WindowMode;

		// get window mode
		if (!platform.isMacintosh && this.win.isMaximized()) {
			mode = WindowMode.Maximized;
		} else if (this.win.isMinimized()) {
			mode = WindowMode.Minimized;
		} else {
			mode = WindowMode.Normal;
		}

		// we don't want to save minimized state, only maximized or normal
		if (mode === WindowMode.Maximized) {
			state.mode = WindowMode.Maximized;
		} else if (mode !== WindowMode.Minimized) {
			state.mode = WindowMode.Normal;
		}

		// only consider non-minimized window states
		if (mode === WindowMode.Normal || mode === WindowMode.Maximized) {
			let pos = this.win.getPosition();
			let size = this.win.getSize();

			state.x = pos[0];
			state.y = pos[1];
			state.width = size[0];
			state.height = size[1];
		}

		return state;
	}

	private restoreWindowState(state?: IWindowState): void {
		if (state) {
			try {
				state = this.validateWindowState(state);
			} catch (err) {
				env.log(`Unexpected error validating window state: ${err}\n${err.stack}`); // somehow display API can be picky about the state to validate
			}
		}

		if (!state) {
			state = defaultWindowState();
		}

		this.windowState = state;
		this.currentWindowMode = this.windowState.mode;
	}

	private validateWindowState(state: IWindowState): IWindowState {
		if (!state) {
			return null;
		}

		if ([state.x, state.y, state.width, state.height].some(n => typeof n !== 'number')) {
			return null;
		}

		if (state.width <= 0 || state.height <= 0) {
			return null;
		}

		let displays = screen.getAllDisplays();

		// Single Monitor: be strict about x/y positioning
		if (displays.length === 1) {
			let displayBounds = displays[0].bounds;

			// Careful with maximized: in that mode x/y can well be negative!
			if (state.mode !== WindowMode.Maximized && displayBounds.width > 0 && displayBounds.height > 0 /* Linux X11 sessions sometimes report wrong display bounds */) {
				if (state.x < displayBounds.x) {
					state.x = displayBounds.x; // prevent window from falling out of the screen to the left
				}

				if (state.y < displayBounds.y) {
					state.y = displayBounds.y; // prevent window from falling out of the screen to the top
				}

				if (state.x > (displayBounds.x + displayBounds.width)) {
					state.x = displayBounds.x; // prevent window from falling out of the screen to the right
				}

				if (state.y > (displayBounds.y + displayBounds.height)) {
					state.y = displayBounds.y; // prevent window from falling out of the screen to the bottom
				}

				if (state.width > displayBounds.width) {
					state.width = displayBounds.width; // prevent window from exceeding display bounds width
				}

				if (state.height > displayBounds.height) {
					state.height = displayBounds.height; // prevent window from exceeding display bounds height
				}
			}

			if (state.mode === WindowMode.Maximized) {
				return defaultWindowState(WindowMode.Maximized); // when maximized, make sure we have good values when the user restores the window
			}

			return state;
		}

		// Multi Monitor: be less strict because metrics can be crazy
		let bounds = { x: state.x, y: state.y, width: state.width, height: state.height };
		let display = screen.getDisplayMatching(bounds);
		if (display && display.bounds.x + display.bounds.width > bounds.x && display.bounds.y + display.bounds.height > bounds.y) {
			if (state.mode === WindowMode.Maximized) {
				let defaults = defaultWindowState(WindowMode.Maximized); // when maximized, make sure we have good values when the user restores the window
				defaults.x = state.x; // carefull to keep x/y position so that the window ends up on the correct monitor
				defaults.y = state.y;

				return defaults;
			}

			return state;
		}

		return null;
	}

	public getBounds(): IBounds {
		let pos = this.win.getPosition();
		let dimension = this.win.getSize();

		return { x: pos[0], y: pos[1], width: dimension[0], height: dimension[1] };
	}

	public toggleFullScreen(): void {
		let isFullScreen = this.win.isFullScreen();

		this.win.setFullScreen(!isFullScreen);
		this.win.setMenuBarVisibility(isFullScreen);
	}

	public dispose(): void {
		if (this.showTimeoutHandle) {
			clearTimeout(this.showTimeoutHandle);
		}

		this._win = null; // Important to dereference the window object to allow for GC
	}
}