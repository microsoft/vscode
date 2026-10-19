/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toShellExternalUrl } from '../../common/externalUrl.js';

suite('toShellExternalUrl', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('rewrites the percent-encoded drive letter of Windows file URLs', () => {
		// Browser-serialized file URLs (WHATWG URL) percent-encode the drive-letter colon.
		// Note: `URI.parse` normalizes the drive letter to lowercase, which is
		// case-insensitively identical on Windows.
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/x/test.html', true), 'file:///c:/Users/x/test.html');
		assert.strictEqual(toShellExternalUrl('file:///D%3A/Git/repo/page.html', true), 'file:///d:/Git/repo/page.html');
	});

	test('leaves already-unencoded file URLs unchanged', () => {
		assert.strictEqual(toShellExternalUrl('file:///c:/Users/x/test.html', true), 'file:///c:/Users/x/test.html');
	});

	test('leaves non-file URLs unchanged on Windows', () => {
		assert.strictEqual(toShellExternalUrl('https://example.com/?a=b&c=d', true), 'https://example.com/?a=b&c=d');
		assert.strictEqual(toShellExternalUrl('vscode://foo/bar', true), 'vscode://foo/bar');
	});

	test('leaves file URLs unchanged off Windows', () => {
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/x/test.html', false), 'file:///c%3A/Users/x/test.html');
		assert.strictEqual(toShellExternalUrl('file:///home/user/test.html', false), 'file:///home/user/test.html');
	});

	test('re-serializes the file path without encoding', () => {
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/a%20b/test.html', true), 'file:///c:/Users/a b/test.html');
	});

	test('returns unparseable URLs unchanged', () => {
		assert.strictEqual(toShellExternalUrl('file:///%%%', true), 'file:///%%%');
	});

	test('defaults to the current platform', () => {
		assert.strictEqual(typeof toShellExternalUrl('file:///c%3A/x.html'), 'string');
	});
});
