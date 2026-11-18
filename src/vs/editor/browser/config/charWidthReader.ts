/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { applyFontInfo } from './domFontInfo.js';
import { BareFontInfo } from '../../common/config/fontInfo.js';

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

class DomCharWidthReader {

	private readonly _bareFontInfo: BareFontInfo;
	private readonly _requests: CharWidthRequest[];

	private _container: HTMLElement | null;
	private _testElements: HTMLSpanElement[] | null;

	constructor(bareFontInfo: BareFontInfo, requests: CharWidthRequest[]) {
		this._bareFontInfo = bareFontInfo;
		this._requests = requests;

		this._container = null;
		this._testElements = null;
	}

	public read(targetWindow: Window): void {
		// Create a test container with all these test elements
		this._createDomElements();

		// Add the container to the DOM
		targetWindow.document.body.appendChild(this._container!);

		// Read character widths
		this._readFromDomElements();

		// Remove the container from the DOM
		this._container?.remove();

		this._container = null;
		this._testElements = null;
	}

	private _createDomElements(): void {
		const container = document.createElement('div');
		container.style.position = 'absolute';
		container.style.top = '-50000px';
		container.style.width = '50000px';

		const regularDomNode = document.createElement('div');
		applyFontInfo(regularDomNode, this._bareFontInfo);
		container.appendChild(regularDomNode);

		const boldDomNode = document.createElement('div');
		applyFontInfo(boldDomNode, this._bareFontInfo);
		boldDomNode.style.fontWeight = 'bold';
		container.appendChild(boldDomNode);

		const italicDomNode = document.createElement('div');
		applyFontInfo(italicDomNode, this._bareFontInfo);
		italicDomNode.style.fontStyle = 'italic';
		container.appendChild(italicDomNode);

		const testElements: HTMLSpanElement[] = [];
		for (const request of this._requests) {

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

			parent!.appendChild(document.createElement('br'));

			const testElement = document.createElement('span');
			DomCharWidthReader._render(testElement, request);
			parent!.appendChild(testElement);

			testElements.push(testElement);
		}

		this._container = container;
		this._testElements = testElements;
	}

	private static _render(testElement: HTMLElement, request: CharWidthRequest): void {
		if (request.chr === ' ') {
			let htmlString = '\u00a0';
			// Repeat character 256 (2^8) times
			for (let i = 0; i < 8; i++) {
				htmlString += htmlString;
			}
			testElement.innerText = htmlString;
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
			const testElement = this._testElements![i];

			request.fulfill(testElement.offsetWidth / 256);
		}
	}
}

export function readCharWidths(targetWindow: Window, bareFontInfo: BareFontInfo, requests: CharWidthRequest[]): void {
	const reader = new DomCharWidthReader(bareFontInfo, requests);
	reader.read(targetWindow);
}
