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
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/x/test.html', true), 'file:///c:/Users/x/test.html');
		assert.strictEqual(toShellExternalUrl('file:///D%3A/Git/repo/page.html', true), 'file:///D:/Git/repo/page.html');
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

	test('re-encodes nothing else: other percent escapes stay untouched', () => {
		// Only the drive-letter colon is rewritten; decoding anything else could
		// change the target file (e.g. a raw '#' would become a URL fragment).
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/a%20b/test.html', true), 'file:///c:/Users/a%20b/test.html');
		assert.strictEqual(toShellExternalUrl('file:///c%3A/Users/file%231.html', true), 'file:///c:/Users/file%231.html');
	});

	test('returns unparseable or differently-shaped URLs unchanged', () => {
		assert.strictEqual(toShellExternalUrl('file:///%%%', true), 'file:///%%%');
		// No drive letter: nothing to rewrite
		assert.strictEqual(toShellExternalUrl('file:///home/user/test.html', true), 'file:///home/user/test.html');
	});

	test('defaults to the current platform', () => {
		assert.strictEqual(typeof toShellExternalUrl('file:///c%3A/x.html'), 'string');
	});
});
