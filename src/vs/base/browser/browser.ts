/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Platform from 'vs/base/common/platform';
import Event, { Emitter } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';

class WindowManager {

	public static INSTANCE = new WindowManager();

	private _fullscreen: boolean;

	private _zoomLevel: number = 0;
	private _zoomFactor: number = 0;

	private _pixelRatioCache: number = 0;
	private _pixelRatioComputed: boolean = false;

	private _onDidChangeZoomLevel: Emitter<number> = new Emitter<number>();
	public onDidChangeZoomLevel: Event<number> = this._onDidChangeZoomLevel.event;

	private _onDidChangeFullscreen: Emitter<void> = new Emitter<void>();
	public onDidChangeFullscreen: Event<void> = this._onDidChangeFullscreen.event;

	public getZoomLevel(): number {
		return this._zoomLevel;
	}

	public setZoomLevel(zoomLevel: number): void {
		if (this._zoomLevel === zoomLevel) {
			return;
		}

		this._zoomLevel = zoomLevel;
		this._pixelRatioComputed = false;
		this._onDidChangeZoomLevel.fire(this._zoomLevel);
	}

	public getZoomFactor(): number {
		return this._zoomFactor;
	}

	public setZoomFactor(zoomFactor: number): void {
		this._zoomFactor = zoomFactor;
	}

	public getPixelRatio(): number {
		if (!this._pixelRatioComputed) {
			this._pixelRatioCache = this._computePixelRatio();
			this._pixelRatioComputed = true;
		}
		return this._pixelRatioCache;
	}

	private _computePixelRatio(): number {
		let ctx = document.createElement('canvas').getContext('2d');
		let dpr = window.devicePixelRatio || 1;
		let bsr = (<any>ctx).webkitBackingStorePixelRatio ||
			(<any>ctx).mozBackingStorePixelRatio ||
			(<any>ctx).msBackingStorePixelRatio ||
			(<any>ctx).oBackingStorePixelRatio ||
			(<any>ctx).backingStorePixelRatio || 1;
		return dpr / bsr;
	}

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

/** A zoom index, e.g. 1, 2, 3 */
export function getZoomLevel(): number {
	return WindowManager.INSTANCE.getZoomLevel();
}
/** The zoom scale for an index, e.g. 1, 1.2, 1.4 */
export function getZoomFactor(): number {
	return WindowManager.INSTANCE.getZoomFactor();
}
export function getPixelRatio(): number {
	return WindowManager.INSTANCE.getPixelRatio();
}
export function setZoomLevel(zoomLevel: number): void {
	WindowManager.INSTANCE.setZoomLevel(zoomLevel);
}
export function setZoomFactor(zoomFactor: number): void {
	WindowManager.INSTANCE.setZoomFactor(zoomFactor);
}
export function onDidChangeZoomLevel(callback: (zoomLevel: number) => void): IDisposable {
	return WindowManager.INSTANCE.onDidChangeZoomLevel(callback);
}
export function setFullscreen(fullscreen: boolean): void {
	WindowManager.INSTANCE.setFullscreen(fullscreen);
}
export function isFullscreen(): boolean {
	return WindowManager.INSTANCE.isFullscreen();
}
export function onDidChangeFullscreen(callback: () => void): IDisposable {
	return WindowManager.INSTANCE.onDidChangeFullscreen(callback);
}

const userAgent = navigator.userAgent;

export const isIE = (userAgent.indexOf('Trident') >= 0);
export const isEdge = (userAgent.indexOf('Edge/') >= 0);
export const isEdgeOrIE = isIE || isEdge;

export const isOpera = (userAgent.indexOf('Opera') >= 0);
export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (userAgent.indexOf('Chrome') === -1) && (userAgent.indexOf('Safari') >= 0);
export const isIPad = (userAgent.indexOf('iPad') >= 0);

export const canUseTranslate3d = !isFirefox;

export const enableEmptySelectionClipboard = isWebKit;

export function supportsExecCommand(command: string): boolean {
	return (
		(isIE || Platform.isNative)
		&& document.queryCommandSupported(command)
	);
}
