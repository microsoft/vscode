/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as browser from 'vs/base/browser/browser';
import * as platform from 'vs/base/common/platform';
import { BareFontInfo } from 'vs/editor/common/config/fontInfo';

export const enum CharWidthRequestType {
	Regular = 0,
	Italic = 1,
	Bold = 2
}

export class CharWidthRequest {

	public readonly chr: string;
	public readonly type: CharWidthRequestType;
	public width: number;

	constructor(chr: string, type: CharWidthRequestType) {
		this.chr = chr;
		this.type = type;
		this.width = 0;
	}

	public fulfill(width: number) {
		this.width = width;
	}
}

interface ICharWidthReader {
	read(): void;
}

class DomCharWidthReader implements ICharWidthReader {

	private readonly _bareFontInfo: BareFontInfo;
	private readonly _requests: CharWidthRequest[];

	private _container: HTMLElement;
	private _testElements: HTMLSpanElement[];

	constructor(bareFontInfo: BareFontInfo, requests: CharWidthRequest[]) {
		this._bareFontInfo = bareFontInfo;
		this._requests = requests;

		this._container = null;
		this._testElements = null;
	}

	public read(): void {
		// Create a test container with all these test elements
		this._createDomElements();

		// Add the container to the DOM
		document.body.appendChild(this._container);

		// Read character widths
		this._readFromDomElements();

		// Remove the container from the DOM
		document.body.removeChild(this._container);

		this._container = null;
		this._testElements = null;
	}

	private _createDomElements(): void {
		let container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.top = '-50000px';
		container.style.width = '50000px';

		let regularDomNode = document.createElement('div');
		regularDomNode.style.fontFamily = this._bareFontInfo.fontFamily;
		regularDomNode.style.fontWeight = this._bareFontInfo.fontWeight;
		regularDomNode.style.fontSize = this._bareFontInfo.fontSize + 'px';
		regularDomNode.style.lineHeight = this._bareFontInfo.lineHeight + 'px';
		container.appendChild(regularDomNode);

		let boldDomNode = document.createElement('div');
		boldDomNode.style.fontFamily = this._bareFontInfo.fontFamily;
		boldDomNode.style.fontWeight = 'bold';
		boldDomNode.style.fontSize = this._bareFontInfo.fontSize + 'px';
		boldDomNode.style.lineHeight = this._bareFontInfo.lineHeight + 'px';
		container.appendChild(boldDomNode);

		let italicDomNode = document.createElement('div');
		italicDomNode.style.fontFamily = this._bareFontInfo.fontFamily;
		italicDomNode.style.fontWeight = this._bareFontInfo.fontWeight;
		italicDomNode.style.fontSize = this._bareFontInfo.fontSize + 'px';
		italicDomNode.style.lineHeight = this._bareFontInfo.lineHeight + 'px';
		italicDomNode.style.fontStyle = 'italic';
		container.appendChild(italicDomNode);

		let testElements: HTMLSpanElement[] = [];
		for (let i = 0, len = this._requests.length; i < len; i++) {
			const request = this._requests[i];

			let parent: HTMLElement;
			if (request.type === CharWidthRequestType.Regular) {
				parent = regularDomNode;
			}
			if (request.type === CharWidthRequestType.Bold) {
				parent = boldDomNode;
			}
			if (request.type === CharWidthRequestType.Italic) {
				parent = italicDomNode;
			}

			parent.appendChild(document.createElement('br'));

			let testElement = document.createElement('span');
			DomCharWidthReader._render(testElement, request);
			parent.appendChild(testElement);

			testElements[i] = testElement;
		}

		this._container = container;
		this._testElements = testElements;
	}

	private static _render(testElement: HTMLElement, request: CharWidthRequest): void {
		if (request.chr === ' ') {
			let htmlString = '&nbsp;';
			// Repeat character 256 (2^8) times
			for (let i = 0; i < 8; i++) {
				htmlString += htmlString;
			}
			testElement.innerHTML = htmlString;
		} else {
			let testString = request.chr;
			// Repeat character 256 (2^8) times
			for (let i = 0; i < 8; i++) {
				testString += testString;
			}
			testElement.textContent = testString;
		}
	}

	private _readFromDomElements(): void {
		for (let i = 0, len = this._requests.length; i < len; i++) {
			const request = this._requests[i];
			const testElement = this._testElements[i];

			request.fulfill(testElement.offsetWidth / 256);
		}
	}
}

class CanvasCharWidthReader implements ICharWidthReader {

	private readonly _bareFontInfo: BareFontInfo;
	private readonly _requests: CharWidthRequest[];

	constructor(bareFontInfo: BareFontInfo, requests: CharWidthRequest[]) {
		this._bareFontInfo = bareFontInfo;
		this._requests = requests;
	}

	public read(): void {
		let canvasElement = <HTMLCanvasElement>document.createElement('canvas');
		let context = canvasElement.getContext('2d');

		context.font = CanvasCharWidthReader._createFontString(this._bareFontInfo);
		for (let i = 0, len = this._requests.length; i < len; i++) {
			const request = this._requests[i];
			if (request.type === CharWidthRequestType.Regular) {
				request.fulfill(context.measureText(request.chr).width);
			}
		}

		context.font = CanvasCharWidthReader._createFontString(this._bareFontInfo, undefined, 'bold');
		for (let i = 0, len = this._requests.length; i < len; i++) {
			const request = this._requests[i];
			if (request.type === CharWidthRequestType.Bold) {
				request.fulfill(context.measureText(request.chr).width);
			}
		}

		context.font = CanvasCharWidthReader._createFontString(this._bareFontInfo, 'italic');
		for (let i = 0, len = this._requests.length; i < len; i++) {
			const request = this._requests[i];
			if (request.type === CharWidthRequestType.Italic) {
				request.fulfill(context.measureText(request.chr).width);
			}
		}
	}

	private static _createFontString(bareFontInfo: BareFontInfo, overwriteFontStyle: string = 'normal', overwriteFontWeight: string = bareFontInfo.fontWeight): string {
		return this._doCreateFontString(overwriteFontStyle, overwriteFontWeight, bareFontInfo.fontSize, bareFontInfo.lineHeight, bareFontInfo.fontFamily);
	}

	private static _doCreateFontString(fontStyle: string, fontWeight: string, fontSize: number, lineHeight: number, fontFamily: string): string {
		// The full font syntax is:
		// style | variant | weight | stretch | size/line-height | fontFamily
		// (https://developer.mozilla.org/en-US/docs/Web/CSS/font)
		// But it appears Edge and IE11 cannot properly parse `stretch`.
		return `${fontStyle} normal ${fontWeight} ${fontSize}px / ${lineHeight}px ${fontFamily}`;
	}
}

export function readCharWidths(bareFontInfo: BareFontInfo, requests: CharWidthRequest[]): void {
	// In IE11, it appears that ctx.measureText() always returns integer results.
	if (browser.isIE) {
		let reader = new DomCharWidthReader(bareFontInfo, requests);
		reader.read();
		return;
	}

	// On Linux, it appears that ctx.measureText() is unaffected by the browser zoom (which is correct),
	// but the char widths at rendering time are affected by the browser zoom (which is unexpected)
	if (platform.isLinux) {
		let reader = new DomCharWidthReader(bareFontInfo, requests);
		reader.read();
		return;
	}

	let reader = new CanvasCharWidthReader(bareFontInfo, requests);
	reader.read();
}
