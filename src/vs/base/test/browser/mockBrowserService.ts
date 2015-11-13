/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { MockDocument, MockWindow, MockElement } from 'vs/base/test/browser/mockDom';
import browserService = require('vs/base/browser/browserService');

function mockedIsHTMLElement(o:any): boolean {
	if (typeof HTMLElement === 'object') {
		return o instanceof HTMLElement || o instanceof MockElement;
	}
	return o && typeof o === 'object' && o.nodeType === 1 && typeof o.nodeName === 'string';
}

export class MockBrowserServiceData implements browserService.IBrowserServiceData {

	public document:Document;
	public window:Window;
	public isHTMLElement: (o:any)=>boolean;

	constructor() {
		this.document = <any> new MockDocument();
		this.window = <any> new MockWindow();
		this.isHTMLElement = mockedIsHTMLElement;
	}
}