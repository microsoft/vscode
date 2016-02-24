/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'assert';
import BrowserService = require('vs/base/browser/browserService');
import { MockBrowserServiceData } from 'vs/base/test/browser/mockBrowserService';

suite('BrowserService', () => {
	test('Mocking of Window', () => {
		try {
			var service = BrowserService.getService();
			service.mock(new MockBrowserServiceData());
			var w = <any> service.window;
			w.testValue = 42;
			service.restore();
			w = <any> service.window;
			assert.strictEqual(w.testValue, undefined);
		}
		finally {
			if(service) {
				service.restore();
			}
		}
	});
});
