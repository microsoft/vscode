/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import types = require('vs/base/common/types');
import * as Platform from 'vs/base/common/platform';

interface ISafeWindow {
	Worker: any;
}

interface ISafeDocument {
	URL: string;
	createElement(tagName: 'div'): HTMLDivElement;
	createElement(tagName: string): HTMLElement;
}

interface INavigator {
	userAgent: string;
}

interface IGlobalScope {
	navigator: INavigator;
	document: ISafeDocument;
	history: {
		pushState: any
	};
}

const globals = <IGlobalScope><any>(typeof self === 'object' ? self : global);

// MAC:
// chrome: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.874.100 Safari/535.2"
// safari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_2) AppleWebKit/534.51.22 (KHTML, like Gecko) Version/5.1.1 Safari/534.51.22"
//
// WINDOWS:
// chrome: "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.2 (KHTML, like Gecko) Chrome/15.0.874.102 Safari/535.2"
// IE: "Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.1; WOW64; Trident/5.0; SLCC2; .NET CLR 2.0.50727; .NET CLR 3.5.30729; .NET CLR 3.0.30729; Media Center PC 6.0; .NET4.0C; .NET4.0E; MS-RTC LM 8; InfoPath.3; Zune 4.7)"
// Opera:	"Opera/9.80 (Windows NT 6.1; U; en) Presto/2.9.168 Version/11.52"
// FF: "Mozilla/5.0 (Windows NT 6.1; WOW64; rv:8.0) Gecko/20100101 Firefox/8.0"

// LINUX:
// chrome: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.71 Safari/537.36"
// firefox: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:34.0) Gecko/20100101 Firefox/34.0"

const userAgent = globals.navigator ? globals.navigator.userAgent : '';

// DOCUMENTED FOR FUTURE REFERENCE:
// When running IE11 in IE10 document mode, the code below will identify the browser as being IE10,
// which is correct because IE11 in IE10 document mode will reimplement all the bugs of IE10
export const isIE11 = (userAgent.indexOf('Trident') >= 0 && userAgent.indexOf('MSIE') < 0);
export const isIE10 = (userAgent.indexOf('MSIE 10') >= 0);
export const isIE9 = (userAgent.indexOf('MSIE 9') >= 0);
export const isIE11orEarlier = isIE11 || isIE10 || isIE9;
export const isIE10orEarlier = isIE10 || isIE9;
export const isIE10orLater = isIE11 || isIE10;

export const isOpera = (userAgent.indexOf('Opera') >= 0);
export const isFirefox = (userAgent.indexOf('Firefox') >= 0);
export const isWebKit = (userAgent.indexOf('AppleWebKit') >= 0);
export const isChrome = (userAgent.indexOf('Chrome') >= 0);
export const isSafari = (userAgent.indexOf('Chrome') === -1) && (userAgent.indexOf('Safari') >= 0);
export const isIPad = (userAgent.indexOf('iPad') >= 0);

export const canUseTranslate3d = !isIE9 && !isFirefox;

export const enableEmptySelectionClipboard = isWebKit;

let _disablePushState = false;

/**
 * Returns if the browser supports the history.pushState function or not.
 */
export function canPushState() {
	return (!_disablePushState && globals.history && globals.history.pushState);
}

/**
 * Helpful when we detect that pushing state does not work for some reason (e.g. FF prevents pushState for security reasons in some cases)
 */
export function disablePushState() {
	_disablePushState = true;
}

/**
 * Returns if the browser supports CSS 3 animations.
 */
export function hasCSSAnimationSupport() {
	if (this._hasCSSAnimationSupport === true || this._hasCSSAnimationSupport === false) {
		return this._hasCSSAnimationSupport;
	}

	if (!globals.document) {
		return false;
	}

	let supported = false;
	let element = globals.document.createElement('div');
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

/**
 * Returns if the browser supports the provided video mime type or not.
 */
export function canPlayVideo(type: string) {
	if (!globals.document) {
		return false;
	}

	let video: HTMLVideoElement = <HTMLVideoElement>globals.document.createElement('video');
	if (video.canPlayType) {
		let canPlay = video.canPlayType(type);

		return canPlay === 'maybe' || canPlay === 'probably';
	}

	return false;
}

/**
 * Returns if the browser supports the provided audio mime type or not.
 */
export function canPlayAudio(type: string) {
	if (!globals.document) {
		return false;
	}

	let audio: HTMLAudioElement = <HTMLAudioElement>globals.document.createElement('audio');
	if (audio.canPlayType) {
		let canPlay = audio.canPlayType(type);

		return canPlay === 'maybe' || canPlay === 'probably';
	}

	return false;
}

export function isInWebWorker(): boolean {
	return !globals.document && typeof ((<any>globals).importScripts) !== 'undefined';
}

export function supportsExecCommand(command: string): boolean {
	return (
		(isIE11orEarlier || Platform.isNative)
		&& document.queryCommandSupported(command)
	);
}