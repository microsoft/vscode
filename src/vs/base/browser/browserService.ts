/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {isInWebWorker} from 'vs/base/browser/browser';

export interface IBrowserServiceData {
	document: Document;
	window: Window;
	isHTMLElement: (o: any) => boolean;
}

export interface IBrowserService extends IBrowserServiceData {
	/**
	 * Mock the DOM with dummy objects
	 */
	mock(source: IBrowserServiceData): void;

	/**
	 * Restore the normal DOM
	 */
	restore(): void;
}

export function regularIsHTMLElement(o: any): boolean {
	if (typeof HTMLElement === 'object') {
		return o instanceof HTMLElement;
	}
	return o && typeof o === 'object' && o.nodeType === 1 && typeof o.nodeName === 'string';
}

class BrowserService implements IBrowserService {

	public document: Document;
	public window: Window;
	public isHTMLElement: (o: any) => boolean;

	constructor() {
		this.restore();
	}

	public mock(source: IBrowserServiceData): void {
		this.document = source.document;
		this.window = source.window;
		this.isHTMLElement = source.isHTMLElement;
	}

	public restore(): void {
		this.isHTMLElement = regularIsHTMLElement;
		if (isInWebWorker()) {
			this.document = null;
			this.window = null;
		} else {
			this.document = window.document;
			this.window = window;
		}
	}
}

const browserService = new BrowserService();

export function getService(): IBrowserService {
	return browserService;
}