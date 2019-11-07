/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as browser from 'vs/base/browser/browser';

/**
 * Browser feature we can support in current platform, browser and environment.
 */
export const BrowserFeatures = {
	clipboard: {
		access: !!(navigator
			&& navigator.clipboard
			&& navigator.clipboard.readText
			&& navigator.clipboard.writeText),
		richText: (() => {
			if (browser.isIE) {
				return false;
			}

			if (browser.isEdge) {
				let index = navigator.userAgent.indexOf('Edge/');
				let version = parseInt(navigator.userAgent.substring(index + 5, navigator.userAgent.indexOf('.', index)), 10);

				if (!version || (version >= 12 && version <= 16)) {
					return false;
				}
			}

			return true;
		})()
	},
	/*
	 * Full Keyboard Support in Full Screen Mode or Standablone
	 */
	fullKeyboard: !!(<any>navigator).keyboard || browser.isSafari,
	touch: 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.navigator.msMaxTouchPoints > 0
};
