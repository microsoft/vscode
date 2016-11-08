/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
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

// DOCUMENTED FOR FUTURE REFERENCE:
// When running IE11 in IE10 document mode, the code below will identify the browser as being IE10,
// which is correct because IE11 in IE10 document mode will reimplement all the bugs of IE10
export const isIE11 = (userAgent.indexOf('Trident') >= 0 && userAgent.indexOf('MSIE') < 0);
export const isIE10 = (userAgent.indexOf('MSIE 10') >= 0);
export const isIE9 = (userAgent.indexOf('MSIE 9') >= 0);
export const isIE11orEarlier = isIE11 || isIE10 || isIE9;
export const isIE10orEarlier = isIE10 || isIE9;
export const isIE10orLater = isIE11 || isIE10;
export const isEdge = (userAgent.indexOf('Edge/') >= 0);
export const isEdgeOrIE = isEdge || isIE11 || isIE10 || isIE9;

export const isOpera = (userAgent.indexOf('Opera') >= 0);
export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (userAgent.indexOf('Chrome') === -1) && (userAgent.indexOf('Safari') >= 0);
export const isIPad = (userAgent.indexOf('iPad') >= 0);

export const canUseTranslate3d = !isIE9 && !isFirefox;

export const enableEmptySelectionClipboard = isWebKit;

/**
 * Returns if the browser supports CSS 3 animations.
 */
export function hasCSSAnimationSupport() {
	if (this._hasCSSAnimationSupport === true || this._hasCSSAnimationSupport === false) {
		return this._hasCSSAnimationSupport;
	}

	let supported = false;
	let element = document.createElement('div');
	let properties = ['animationName', 'webkitAnimationName', 'msAnimationName', 'MozAnimationName', 'OAnimationName'];
	for (let i = 0; i < properties.length; i++) {
		let property = properties[i];
		if (!types.isUndefinedOrNull(element.style[property]) || element.style.hasOwnProperty(property)) {
			supported = true;
			break;
		}
	}

	if (supported) {
		this._hasCSSAnimationSupport = true;
	} else {
		this._hasCSSAnimationSupport = false;
	}

	return this._hasCSSAnimationSupport;
}

export function supportsExecCommand(command: string): boolean {
	return (
		(isIE11orEarlier || Platform.isNative)
		&& document.queryCommandSupported(command)
	);
}