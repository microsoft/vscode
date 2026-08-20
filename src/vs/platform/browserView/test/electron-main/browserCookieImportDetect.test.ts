/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	isSafeBrowserProfileDirectory,
	resolveChromiumCookiesPath,
	getChromiumKeychainIdentifiers
} from '../../electron-main/browserCookieImportDetect.js';

suite('BrowserCookieImportDetect', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	// ---------------------------------------------------------------------------
	// isSafeBrowserProfileDirectory — pure function, no I/O
	// ---------------------------------------------------------------------------

	suite('isSafeBrowserProfileDirectory', () => {
		test('accepts safe profile directory names', () => {
			assert.deepStrictEqual({
				default: isSafeBrowserProfileDirectory('Default'),
				profile1: isSafeBrowserProfileDirectory('Profile 1'),
				guest: isSafeBrowserProfileDirectory('Guest Profile'),
				unicode: isSafeBrowserProfileDirectory('Профиль'),
				dotted: isSafeBrowserProfileDirectory('my.profile'),
			}, {
				default: true,
				profile1: true,
				guest: true,
				unicode: true,
				dotted: true,
			});
		});

		test('rejects unsafe profile directory names', () => {
			assert.deepStrictEqual({
				empty: isSafeBrowserProfileDirectory(''),
				dot: isSafeBrowserProfileDirectory('.'),
				dotdot: isSafeBrowserProfileDirectory('..'),
				pathTraversal: isSafeBrowserProfileDirectory('../etc'),
				forwardSlash: isSafeBrowserProfileDirectory('foo/bar'),
				backslash: isSafeBrowserProfileDirectory('foo\\bar'),
				nullByte: isSafeBrowserProfileDirectory('foo\0bar'),
				dotdotMiddle: isSafeBrowserProfileDirectory('foo..bar'),
			}, {
				empty: false,
				dot: false,
				dotdot: false,
				pathTraversal: false,
				forwardSlash: false,
				backslash: false,
				nullByte: false,
				dotdotMiddle: false,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// getChromiumKeychainIdentifiers — pure lookup, no I/O
	// ---------------------------------------------------------------------------

	suite('getChromiumKeychainIdentifiers', () => {
		test('returns correct keychain identifiers for known browsers', () => {
			assert.deepStrictEqual({
				chrome: getChromiumKeychainIdentifiers('chrome'),
				edge: getChromiumKeychainIdentifiers('edge'),
				arc: getChromiumKeychainIdentifiers('arc'),
				chromium: getChromiumKeychainIdentifiers('chromium'),
			}, {
				chrome: { service: 'Chrome Safe Storage', account: 'Chrome' },
				edge: { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
				arc: { service: 'Arc Safe Storage', account: 'Arc' },
				chromium: { service: 'Brave Safe Storage', account: 'Brave' },
			});
		});

		test('returns null for non-Chromium browsers', () => {
			assert.deepStrictEqual({
				firefox: getChromiumKeychainIdentifiers('firefox'),
				safari: getChromiumKeychainIdentifiers('safari'),
				manual: getChromiumKeychainIdentifiers('manual'),
			}, {
				firefox: null,
				safari: null,
				manual: null,
			});
		});
	});

	// ---------------------------------------------------------------------------
	// resolveChromiumCookiesPath — requires filesystem, test with temp dirs
	// ---------------------------------------------------------------------------

	suite('resolveChromiumCookiesPath', () => {
		test('returns null for non-existent directory', () => {
			const result = resolveChromiumCookiesPath('/nonexistent/path/that/does/not/exist');
			assert.strictEqual(result, null);
		});
	});
});
