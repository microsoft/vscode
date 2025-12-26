/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { testUrlMatchesGlob } from '../../common/urlGlob.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('urlGlob', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('testUrlMatchesGlob', () => {

		test('exact match', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('http://example.com', 'http://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/path'), true);
		});

		test('trailing slashes are ignored', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com/', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com/'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com//', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path/', 'https://example.com/path'), true);
		});

		test('query and fragment are ignored', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com?query=value', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com#fragment', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com?query=value#fragment', 'https://example.com'), true);
		});

		test('scheme matching', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('http://example.com', 'https://example.com'), false);
			assert.strictEqual(testUrlMatchesGlob('ftp://example.com', 'https://example.com'), false);
		});

		test('glob without scheme assumes http/https', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('http://example.com', 'example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('ftp://example.com', 'example.com'), false);
		});

		test('wildcard matching in path', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com/anything', 'https://example.com/*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/path/*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path/to/resource', 'https://example.com/path/*/resource'), true);
		});

		test('subdomain wildcard matching', () => {
			assert.strictEqual(testUrlMatchesGlob('https://sub.example.com', 'https://*.example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://sub.domain.example.com', 'https://*.example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://*.example.com'), true);
			// *. matches any number of characters before the domain, including other domains
			assert.strictEqual(testUrlMatchesGlob('https://notexample.com', 'https://*.example.com'), true);
		});

		test('port matching', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:8080'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:9090'), false);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com:8080'), false);
		});

		test('wildcard port matching', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com:8080', 'https://example.com:*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com:9090', 'https://example.com:*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com:*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com:8080/path', 'https://example.com:*/path'), true);
		});

		test('root path glob', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com/'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/', 'https://example.com/'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/'), true);
		});

		test('mismatch cases', () => {
			assert.strictEqual(testUrlMatchesGlob('https://example.com/path', 'https://example.com/other'), false);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://other.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://sub.example.com', 'https://example.com'), false);
		});

		test('URI object input', () => {
			const uri = URI.parse('https://example.com/path');
			assert.strictEqual(testUrlMatchesGlob(uri, 'https://example.com/path'), true);
			assert.strictEqual(testUrlMatchesGlob(uri, 'https://example.com/*'), true);
		});

		test('complex patterns', () => {
			assert.strictEqual(testUrlMatchesGlob('https://api.github.com/repos/microsoft/vscode', 'https://*.github.com/repos/*/*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://github.com/microsoft/vscode', 'https://*.github.com/repos/*/*'), false);
			assert.strictEqual(testUrlMatchesGlob('https://api.github.com:443/repos/microsoft/vscode', 'https://*.github.com:*/repos/*/*'), true);
		});

		test('edge cases', () => {
			// Wildcard after authority doesn't match without additional path
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://example.com*'), false);
			assert.strictEqual(testUrlMatchesGlob('https://example.com.extra', 'https://example.com*'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', '*'), true);
		});
	});
});
