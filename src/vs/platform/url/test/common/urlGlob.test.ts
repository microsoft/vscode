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

		test('dot segments cannot escape a path-scoped glob', () => {
			const paths = [
				'/allowed/../outside',
				'/allowed/child/../../outside',
				'/allowed/./../outside',
				'/allowed/%2e%2e/outside',
				'/allowed/.%2E/outside',
				'/allowed/%2E./outside',
				'/allowed/..',
			];
			const globs = ['https://example.com/allowed', 'example.com/allowed', 'https://*.example.com:*/allowed/*'];

			assert.deepStrictEqual(
				paths.map(path => {
					const url = `https://example.com${path}`;
					return globs.map(glob => ({
						string: testUrlMatchesGlob(url, glob),
						uri: testUrlMatchesGlob(URI.parse(url), glob),
					}));
				}),
				paths.map(() => globs.map(() => ({ string: false, uri: false })))
			);
		});

		test('HTTP paths remove ASCII tabs and newlines before resolving dot segments', () => {
			const whitespace = ['\t', '\n', '\r'];

			assert.deepStrictEqual(
				whitespace.map(character => ['http', 'https'].map(scheme => {
					const url = `${scheme}://example.com/allowed/.${character}./outside`;
					const glob = `${scheme}://example.com/allowed`;
					return {
						browserPath: new URL(url).pathname,
						string: testUrlMatchesGlob(url, glob),
						uri: testUrlMatchesGlob(URI.parse(url), glob),
						wildcard: testUrlMatchesGlob(url, `${glob}/*`),
						withinScope: testUrlMatchesGlob(`${scheme}://example.com/allowed/in${character}side`, glob),
					};
				})),
				whitespace.map(() => ['http', 'https'].map(() => ({
					browserPath: '/outside',
					string: false,
					uri: false,
					wildcard: false,
					withinScope: true,
				})))
			);
		});

		test('dot segments that stay within allowed paths still match', () => {
			const paths = ['/allowed/./page', '/allowed/child/../page', '/allowed/child/..'];

			assert.deepStrictEqual(
				paths.map(path => testUrlMatchesGlob(`https://example.com${path}`, 'https://example.com/allowed')),
				paths.map(() => true)
			);
		});

		test('HTTP paths resolve backslash separators', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('http://example.com/allowed/../outside', 'http://example.com/allowed'),
				testUrlMatchesGlob(String.raw`https://example.com/allowed/..\outside`, 'https://example.com/allowed'),
				testUrlMatchesGlob(String.raw`http://example.com/allowed/..\outside`, 'http://example.com/allowed'),
				testUrlMatchesGlob(String.raw`https://example.com/allowed/child\..\page`, 'https://example.com/allowed'),
			], [
				false,
				false,
				false,
				true,
			]);
		});

		test('resolving dot segments preserves empty path segments', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('https://example.com/allowed//../page', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/other//../allowed/page', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/allowed//../../outside', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/allowed//page', 'https://example.com/allowed/page'),
			], [
				true,
				false,
				false,
				false,
			]);
		});

		test('resolving dot segments preserves encoded path characters', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('https://example.com/allowed/child/../file%3Fpart%23part', 'https://example.com/allowed/*file%3Fpart%23part'),
				testUrlMatchesGlob('https://example.com/allowed/child/../space%20name', 'https://example.com/allowed/*space%20name'),
				testUrlMatchesGlob('https://example.com/allowed/%252e%252e/page', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/allowed/child/../%F0%9F%9A%80', 'https://example.com/allowed/*%F0%9F%9A%80'),
			], [
				true,
				true,
				true,
				true,
			]);
		});

		test('unpaired surrogates do not throw or bypass path-scoped globs', () => {
			const surrogates = ['\uD800', '\uDC00'];
			const glob = 'https://example.com/allowed';

			assert.deepStrictEqual(
				surrogates.map(surrogate => {
					const url = `https://example.com/allowed/${surrogate}/page`;
					return {
						string: testUrlMatchesGlob(url, glob),
						uri: testUrlMatchesGlob(URI.parse(url), glob),
						outside: testUrlMatchesGlob(`https://example.com/allowed/${surrogate}/../../outside`, glob),
					};
				}),
				surrogates.map(() => ({ string: true, uri: true, outside: false }))
			);
		});

		test('resolving dot segments does not broaden the supplied path match', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('https://example.com/other/../allowed/page', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/other%2F..%2Fallowed/page', 'https://example.com/allowed'),
				testUrlMatchesGlob('https://example.com/allowed/page/../outside', 'https://example.com/allowed/page'),
			], [
				false,
				false,
				false,
			]);
		});

		test('glob paths and non-HTTP paths are not resolved', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('https://example.com/outside', 'https://example.com/allowed/../outside'),
				testUrlMatchesGlob('https://example.com/outside', 'https://example.com/allowed/*/../../outside'),
				testUrlMatchesGlob('custom://example.com/allowed/../outside', 'custom://example.com/allowed'),
			], [
				false,
				false,
				true,
			]);
		});

		test('subdomain wildcard matching', () => {
			assert.strictEqual(testUrlMatchesGlob('https://sub.example.com', 'https://*.example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://sub.domain.example.com', 'https://*.example.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://example.com', 'https://*.example.com'), true);
		});

		test('subdomain wildcard must match on dot boundary', () => {
			// Should NOT match: no dot boundary before the domain
			assert.strictEqual(testUrlMatchesGlob('https://notexample.com', 'https://*.example.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://evil-microsoft.com', 'https://*.microsoft.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://evilmicrosoft.com', 'https://*.microsoft.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://evil-example.com', 'https://*.example.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://myexample.com', 'https://*.example.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://notexample.com/path', 'https://*.example.com/path'), false);

			// Should match: proper subdomain with dot boundary
			assert.strictEqual(testUrlMatchesGlob('https://sub.microsoft.com', 'https://*.microsoft.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://a.b.c.microsoft.com', 'https://*.microsoft.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://microsoft.com', 'https://*.microsoft.com'), true);
			assert.strictEqual(testUrlMatchesGlob('https://sub.example.com/path', 'https://*.example.com/path'), true);
		});

		test('subdomain wildcard without scheme must match on dot boundary', () => {
			assert.strictEqual(testUrlMatchesGlob('https://evil-microsoft.com', '*.microsoft.com'), false);
			assert.strictEqual(testUrlMatchesGlob('http://evil-microsoft.com', '*.microsoft.com'), false);
			assert.strictEqual(testUrlMatchesGlob('https://sub.microsoft.com', '*.microsoft.com'), true);
			assert.strictEqual(testUrlMatchesGlob('http://sub.microsoft.com', '*.microsoft.com'), true);
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
