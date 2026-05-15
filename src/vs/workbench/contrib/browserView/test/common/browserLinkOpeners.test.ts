/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { BrowserLinkOpenerSettingKey, getIntegratedBrowserLinkOpenerSetting } from '../../common/browserLinkOpeners.js';

suite('BrowserLinkOpeners', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('returns localhost setting for localhost and all-interfaces links', () => {
		assert.strictEqual(
			getIntegratedBrowserLinkOpenerSetting('http://localhost:3000'),
			BrowserLinkOpenerSettingKey.OpenLocalhostLinks
		);
		assert.strictEqual(
			getIntegratedBrowserLinkOpenerSetting('https://0.0.0.0:8080'),
			BrowserLinkOpenerSettingKey.OpenLocalhostLinks
		);
	});

	test('returns external setting for non-localhost HTTP(S) links', () => {
		assert.strictEqual(
			getIntegratedBrowserLinkOpenerSetting('https://example.com/path'),
			BrowserLinkOpenerSettingKey.OpenExternalLinks
		);
	});

	test('ignores non-http(s) and invalid links', () => {
		assert.strictEqual(
			getIntegratedBrowserLinkOpenerSetting('mailto:test@example.com'),
			undefined
		);
		assert.strictEqual(
			getIntegratedBrowserLinkOpenerSetting('not-a-url'),
			undefined
		);
	});
});
