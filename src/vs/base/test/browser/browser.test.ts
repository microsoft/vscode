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

		var isOpera = browser.isOpera || navigator.userAgent.indexOf('OPR') >= 0;
		var isIE11orEarlier = browser.isIE11orEarlier;
		var isFirefox = browser.isFirefox;
		var isWebKit = browser.isWebKit;
		var isChrome = browser.isChrome;
		var isSafari = browser.isSafari;

		var hasCSSAnimations = browser.hasCSSAnimationSupport();

		var browserCount = 0;
		if (isOpera) {
			browserCount++;
		}
		if (isIE11orEarlier) {
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
