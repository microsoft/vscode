/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { $window, CodeWindow, mainWindow } from 'vs/base/browser/window';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, markAsSingleton } from 'vs/base/common/lifecycle';

class WindowManager {

	static readonly INSTANCE = new WindowManager();

	// --- Zoom Level

	private readonly mapWindowIdToZoomLevel = new Map<number, number>();

	private readonly _onDidChangeZoomLevel = new Emitter<number>();
	readonly onDidChangeZoomLevel = this._onDidChangeZoomLevel.event;

	getZoomLevel(targetWindow: Window): number {
		return this.mapWindowIdToZoomLevel.get(this.getWindowId(targetWindow)) ?? 0;
	}
	setZoomLevel(zoomLevel: number, targetWindow: Window): void {
		if (this.getZoomLevel(targetWindow) === zoomLevel) {
			return;
		}

		const targetWindowId = this.getWindowId(targetWindow);
		this.mapWindowIdToZoomLevel.set(targetWindowId, zoomLevel);
		this._onDidChangeZoomLevel.fire(targetWindowId);
	}

	// --- Zoom Factor

	private readonly mapWindowIdToZoomFactor = new Map<number, number>();

	getZoomFactor(targetWindow: Window): number {
		return this.mapWindowIdToZoomFactor.get(this.getWindowId(targetWindow)) ?? 1;
	}
	setZoomFactor(zoomFactor: number, targetWindow: Window): void {
		this.mapWindowIdToZoomFactor.set(this.getWindowId(targetWindow), zoomFactor);
	}

	// --- Fullscreen

	private readonly _onDidChangeFullscreen = new Emitter<number>();
	readonly onDidChangeFullscreen = this._onDidChangeFullscreen.event;

	private readonly mapWindowIdToFullScreen = new Map<number, boolean>();

	setFullscreen(fullscreen: boolean, targetWindow: Window): void {
		if (this.isFullscreen(targetWindow) === fullscreen) {
			return;
		}

		const windowId = this.getWindowId(targetWindow);
		this.mapWindowIdToFullScreen.set(windowId, fullscreen);
		this._onDidChangeFullscreen.fire(windowId);
	}
	isFullscreen(targetWindow: Window): boolean {
		return !!this.mapWindowIdToFullScreen.get(this.getWindowId(targetWindow));
	}

	private getWindowId(targetWindow: Window): number {
		return (targetWindow as CodeWindow).vscodeWindowId;
	}
}

/**
 * See https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes
 */
class DevicePixelRatioMonitor extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private readonly _listener: () => void;
	private _mediaQueryList: MediaQueryList | null;

	constructor() {
		super();

		this._listener = () => this._handleChange(true);
		this._mediaQueryList = null;
		this._handleChange(false);
	}

	private _handleChange(fireEvent: boolean): void {
		this._mediaQueryList?.removeEventListener('change', this._listener);

		this._mediaQueryList = $window.matchMedia(`(resolution: ${$window.devicePixelRatio}dppx)`);
		this._mediaQueryList.addEventListener('change', this._listener);

		if (fireEvent) {
			this._onDidChange.fire();
		}
	}
}

class PixelRatioImpl extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<number>());
	readonly onDidChange = this._onDidChange.event;

	private _value: number;

	get value(): number {
		return this._value;
	}

	constructor() {
		super();

		this._value = this._getPixelRatio();

		const dprMonitor = this._register(new DevicePixelRatioMonitor());
		this._register(dprMonitor.onDidChange(() => {
			this._value = this._getPixelRatio();
			this._onDidChange.fire(this._value);
		}));
	}

	private _getPixelRatio(): number {
		const ctx: any = document.createElement('canvas').getContext('2d');
		const dpr = $window.devicePixelRatio || 1;
		const bsr = ctx.webkitBackingStorePixelRatio ||
			ctx.mozBackingStorePixelRatio ||
			ctx.msBackingStorePixelRatio ||
			ctx.oBackingStorePixelRatio ||
			ctx.backingStorePixelRatio || 1;
		return dpr / bsr;
	}
}

class PixelRatioFacade {

	private _pixelRatioMonitor: PixelRatioImpl | null = null;
	private _getOrCreatePixelRatioMonitor(): PixelRatioImpl {
		if (!this._pixelRatioMonitor) {
			this._pixelRatioMonitor = markAsSingleton(new PixelRatioImpl());
		}
		return this._pixelRatioMonitor;
	}

	/**
	 * Get the current value.
	 */
	get value(): number {
		return this._getOrCreatePixelRatioMonitor().value;
	}

	/**
	 * Listen for changes.
	 */
	get onDidChange(): Event<number> {
		return this._getOrCreatePixelRatioMonitor().onDidChange;
	}
}

export function addMatchMediaChangeListener(targetWindow: Window, query: string | MediaQueryList, callback: (this: MediaQueryList, ev: MediaQueryListEvent) => any): void {
	if (typeof query === 'string') {
		query = targetWindow.matchMedia(query);
	}
	query.addEventListener('change', callback);
}

/**
 * Returns the pixel ratio.
 *
 * This is useful for rendering <canvas> elements at native screen resolution or for being used as
 * a cache key when storing font measurements. Fonts might render differently depending on resolution
 * and any measurements need to be discarded for example when a window is moved from a monitor to another.
 */
export const PixelRatio = new PixelRatioFacade();

/** A zoom index, e.g. 1, 2, 3 */
export function setZoomLevel(zoomLevel: number, targetWindow: Window): void {
	WindowManager.INSTANCE.setZoomLevel(zoomLevel, targetWindow);
}
export function getZoomLevel(targetWindow: Window): number {
	return WindowManager.INSTANCE.getZoomLevel(targetWindow);
}
export const onDidChangeZoomLevel = WindowManager.INSTANCE.onDidChangeZoomLevel;

/** The zoom scale for an index, e.g. 1, 1.2, 1.4 */
export function getZoomFactor(targetWindow: Window): number {
	return WindowManager.INSTANCE.getZoomFactor(targetWindow);
}
export function setZoomFactor(zoomFactor: number, targetWindow: Window): void {
	WindowManager.INSTANCE.setZoomFactor(zoomFactor, targetWindow);
}

export function setFullscreen(fullscreen: boolean, targetWindow: Window): void {
	WindowManager.INSTANCE.setFullscreen(fullscreen, targetWindow);
}
export function isFullscreen(targetWindow: Window): boolean {
	return WindowManager.INSTANCE.isFullscreen(targetWindow);
}
export const onDidChangeFullscreen = WindowManager.INSTANCE.onDidChangeFullscreen;

const userAgent = navigator.userAgent;

export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (!isChrome && (userAgent.indexOf('Safari') >= 0));
export const isWebkitWebView = (!isChrome && !isSafari && isWebKit);
export const isElectron = (userAgent.indexOf('Electron/') >= 0);
export const isAndroid = (userAgent.indexOf('Android') >= 0);

let standalone = false;
if (typeof mainWindow.matchMedia === 'function') {
	const standaloneMatchMedia = mainWindow.matchMedia('(display-mode: standalone) or (display-mode: window-controls-overlay)');
	const fullScreenMatchMedia = mainWindow.matchMedia('(display-mode: fullscreen)');
	standalone = standaloneMatchMedia.matches;
	addMatchMediaChangeListener(mainWindow, standaloneMatchMedia, ({ matches }) => {
		// entering fullscreen would change standaloneMatchMedia.matches to false
		// if standalone is true (running as PWA) and entering fullscreen, skip this change
		if (standalone && fullScreenMatchMedia.matches) {
			return;
		}
		// otherwise update standalone (browser to PWA or PWA to browser)
		standalone = matches;
	});
}
export function isStandalone(): boolean {
	return standalone;
}

// Visible means that the feature is enabled, not necessarily being rendered
// e.g. visible is true even in fullscreen mode where the controls are hidden
// See docs at https://developer.mozilla.org/en-US/docs/Web/API/WindowControlsOverlay/visible
export function isWCOEnabled(): boolean {
	return (navigator as any)?.windowControlsOverlay?.visible;
}
