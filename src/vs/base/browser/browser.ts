/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';

class WindowManager {

	public static readonly INSTANCE = new WindowManager();

	// --- Zoom Level
	private _zoomLevel: number = 0;

	public getZoomLevel(): number {
		return this._zoomLevel;
	}
	public setZoomLevel(zoomLevel: number, isTrusted: boolean): void {
		if (this._zoomLevel === zoomLevel) {
			return;
		}
		this._zoomLevel = zoomLevel;
	}

	// --- Zoom Factor
	private _zoomFactor: number = 1;

	public getZoomFactor(): number {
		return this._zoomFactor;
	}
	public setZoomFactor(zoomFactor: number): void {
		this._zoomFactor = zoomFactor;
	}

	// --- Fullscreen
	private _fullscreen: boolean = false;
	private readonly _onDidChangeFullscreen = new Emitter<void>();

	public readonly onDidChangeFullscreen: Event<void> = this._onDidChangeFullscreen.event;
	public setFullscreen(fullscreen: boolean): void {
		if (this._fullscreen === fullscreen) {
			return;
		}

		this._fullscreen = fullscreen;
		this._onDidChangeFullscreen.fire();
	}
	public isFullscreen(): boolean {
		return this._fullscreen;
	}
}

class PixelRatioImpl extends Disposable {

	private readonly _onDidChange = this._register(new Emitter<number>());
	public readonly onDidChange = this._onDidChange.event;

	private _value: number;
	private _removeListener: () => void;

	public get value(): number {
		return this._value;
	}

	constructor() {
		super();

		this._value = this._getPixelRatio();
		this._removeListener = this._installResolutionListener();
	}

	public override dispose() {
		this._removeListener();
		super.dispose();
	}

	private _installResolutionListener(): () => void {
		// See https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes
		const mediaQueryList = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
		const listener = () => this._updateValue();
		mediaQueryList.addEventListener('change', listener);
		return () => {
			mediaQueryList.removeEventListener('change', listener);
		};
	}

	private _updateValue(): void {
		this._value = this._getPixelRatio();
		this._onDidChange.fire(this._value);
		this._removeListener = this._installResolutionListener();
	}

	private _getPixelRatio(): number {
		const ctx: any = document.createElement('canvas').getContext('2d');
		const dpr = window.devicePixelRatio || 1;
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
			this._pixelRatioMonitor = new PixelRatioImpl();
		}
		return this._pixelRatioMonitor;
	}

	/**
	 * Get the current value.
	 */
	public get value(): number {
		return this._getOrCreatePixelRatioMonitor().value;
	}

	/**
	 * Listen for changes.
	 */
	public get onDidChange(): Event<number> {
		return this._getOrCreatePixelRatioMonitor().onDidChange;
	}
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
export function setZoomLevel(zoomLevel: number, isTrusted: boolean): void {
	WindowManager.INSTANCE.setZoomLevel(zoomLevel, isTrusted);
}
export function getZoomLevel(): number {
	return WindowManager.INSTANCE.getZoomLevel();
}

/** The zoom scale for an index, e.g. 1, 1.2, 1.4 */
export function getZoomFactor(): number {
	return WindowManager.INSTANCE.getZoomFactor();
}
export function setZoomFactor(zoomFactor: number): void {
	WindowManager.INSTANCE.setZoomFactor(zoomFactor);
}

export function setFullscreen(fullscreen: boolean): void {
	WindowManager.INSTANCE.setFullscreen(fullscreen);
}
export function isFullscreen(): boolean {
	return WindowManager.INSTANCE.isFullscreen();
}
export const onDidChangeFullscreen = WindowManager.INSTANCE.onDidChangeFullscreen;

const userAgent = navigator.userAgent;

export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (!isChrome && (userAgent.indexOf('Safari') >= 0));
export const isWebkitWebView = (!isChrome && !isSafari && isWebKit);
export const isEdgeLegacyWebView = (userAgent.indexOf('Edge/') >= 0) && (userAgent.indexOf('WebView/') >= 0);
export const isElectron = (userAgent.indexOf('Electron/') >= 0);
export const isAndroid = (userAgent.indexOf('Android') >= 0);
export const isStandalone = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
