/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import { isWindows, isMacintosh } from 'vs/base/common/platform';
import * as browser from 'vs/base/browser/browser';

suite('Browsers', () => {
	test('all', function () {
		assert(!(isWindows && isMacintosh));

		let isOpera = browser.isOpera || navigator.userAgent.indexOf('OPR') >= 0;
		let isIE = browser.isIE;
		let isFirefox = browser.isFirefox;
		let isWebKit = browser.isWebKit;
		let isChrome = browser.isChrome;
		let isSafari = browser.isSafari;

		let hasCSSAnimations = browser.hasCSSAnimationSupport();

		let browserCount = 0;
		if (isOpera) {
			browserCount++;
		}
		if (isIE) {
			browserCount++;
		}
		if (isFirefox) {
			browserCount++;
			assert(hasCSSAnimations);
		}
		if (isWebKit) {
			browserCount++;
			assert(hasCSSAnimations);
		}
		if (isChrome) {
			browserCount++;
			assert(hasCSSAnimations);
		}
		if (isSafari) {
			browserCount++;
			assert(hasCSSAnimations);
		}
	});
});
