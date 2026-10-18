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

		test('preserves nonempty trailing wildcard and path-prefix semantics', () => {
			assert.deepStrictEqual([
				testUrlMatchesGlob('https://example.test/a', 'https://example.test/a*'),
				testUrlMatchesGlob('https://example.test/ab', 'https://example.test/a*'),
				testUrlMatchesGlob('https://example.test/ab', 'https://example.test/*b'),
				testUrlMatchesGlob('https://example.test/ab', 'https://example.test/*b*'),
				testUrlMatchesGlob('https://example.test/a/b', 'https://example.test/a'),
				testUrlMatchesGlob('https://example.test/', 'https://example.test:*'),
			], [false, true, true, false, true, true]);
		});

		test('matches long paths without recursive stack growth', () => {
			const segment = 'x'.repeat(8192);
			assert.deepStrictEqual([
				testUrlMatchesGlob(`https://example.test/docs/${segment}/match`, 'https://example.test/docs/*/match'),
				testUrlMatchesGlob(`https://example.test/docs/${segment}/miss`, 'https://example.test/docs/*/match'),
			], [true, false]);
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

		test('backslash URL authorities match only the browser destination', () => {
			const cases = [
				{ url: String.raw`https://evil.example\.github.com/collect?leak=<data>`, pattern: 'https://*.github.com', matches: false },
				{ url: String.raw`https://evil.example\\.github.com/collect?leak=<data>`, pattern: 'https://*.github.com', matches: false },
				{ url: String.raw`https://169.254.169.254\.github.com/latest/meta-data/`, pattern: '*.github.com', matches: false },
				{ url: String.raw`https://169.254.169.254\\.github.com/latest/meta-data/`, pattern: '*.github.com', matches: false },
				{ url: String.raw`http://127.0.0.2:38651\.github.com/exfil?data=fixture`, pattern: 'http://*.github.com:*', matches: false },
				{ url: String.raw`https://github.com\.evil.example/resource`, pattern: 'https://*.github.com', matches: true },
				{ url: 'https://api.github.com/resource', pattern: 'https://*.github.com', matches: true },
				{ url: 'https://evil.example/resource', pattern: 'https://*.github.com', matches: false },
				{ url: String.raw`custom://example.com\segment/resource`, pattern: String.raw`custom://example.com\segment`, matches: true },
				{ url: String.raw`custom://example.com\segment/resource`, pattern: 'custom://example.com/segment', matches: false },
			];

			assert.deepStrictEqual(
				cases.map(({ url, pattern }) => ({
					url,
					string: testUrlMatchesGlob(url, pattern),
					uri: testUrlMatchesGlob(URI.parse(url), pattern),
				})),
				cases.map(({ url, matches }) => ({ url, string: matches, uri: matches }))
			);
		});

		test('backslash URL patterns use browser path separators', () => {
			const cases = [
				{ url: 'https://example.com/.github.com/resource', pattern: String.raw`https://example.com\.github.com`, matches: true },
				{ url: 'https://example.com/.github.com/resource', pattern: String.raw`example.com\.github.com`, matches: true },
				{ url: 'https://example.com/path/resource', pattern: String.raw`https://example.com\path\*`, matches: true },
				{ url: 'https://api.github.com/resource', pattern: String.raw`https://example.com\.github.com`, matches: false },
			];

			assert.deepStrictEqual(
				cases.map(({ url, pattern }) => testUrlMatchesGlob(url, pattern)),
				cases.map(({ matches }) => matches)
			);
		});

		test('IDN literal hostname components match Unicode and Punycode spellings', () => {
			const hosts = ['bücher.example.test', 'xn--bcher-kva.example.test', 'b%C3%BCcher.example.test', 'BÜCHER.EXAMPLE.TEST', 'XN--BCHER-KVA.EXAMPLE.TEST'];
			const patterns = ['bücher.example.test', 'xn--bcher-kva.example.test'];

			assert.deepStrictEqual(
				hosts.map(host => patterns.map(pattern => ({
					exact: testUrlMatchesGlob(`https://${host}`, `https://${pattern}`),
					wildcard: testUrlMatchesGlob(`https://x.${host}`, `https://*.${pattern}`),
					bare: testUrlMatchesGlob(`https://${host}`, `https://*.${pattern}`),
					uri: testUrlMatchesGlob(URI.parse(`https://x.${host}`), `https://*.${pattern}`),
				}))),
				hosts.map(() => patterns.map(() => ({ exact: true, wildcard: true, bare: true, uri: true })))
			);
		});

		test('IDN normalization preserves wildcard, scheme, port and path semantics', () => {
			const cases = [
				['https://api1.xn--bcher-kva.example.test', 'https://api*.bücher.example.test', true],
				['https://xn--bcher-kva.a.example.test', 'https://bücher.*.example.test', true],
				['https://x.xn--bcher-kva.example.test', '*.bücher.example.test', true],
				['http://x.xn--bcher-kva.example.test', '*.bücher.example.test', true],
				['https://x.xn--bcher-kva.example.test:8443/allowed/page', 'https://*.bücher.example.test:*/allowed/*', true],
				['https://xn--bcher-kva.example.test/allowed/page', 'https://bücher.example.test:*/allowed', true],
				['https://xn--bcher-kva.example.test:443', 'https://bücher.example.test:443', true],
				['https://xn--bcher-kva.example.test:443', 'https://bücher.example.test', false],
				['https://xn--bcher-kva.example.test', 'https://bücher.example.test:443', false],
				['https://xn--bcher-kva.example.test:8443', 'https://bücher.example.test:8080', false],
				['http://xn--bcher-kva.example.test', 'https://bücher.example.test', false],
				['custom://xn--bcher-kva.example.test', '*.bücher.example.test', false],
				['https://xn--bcher-kva.example.test/Allowed/page', 'https://bücher.example.test/allowed', false],
				['https://xn--bcher-kva.example.test/allowed/../outside', 'https://bücher.example.test/allowed', false],
				['https://xn--bcher-kva.example.test/allowed/child/../page', 'https://bücher.example.test/allowed', true],
				['https://evilxn--bcher-kva.example.test', 'https://*.bücher.example.test', false],
				['https://x.xn--bcher-kva.example.test.evil.test', 'https://*.bücher.example.test', false],
				['https://x.other.example.test', 'https://*.bücher.example.test', false],
				['https://bücher.example.test', 'https://bü*.example.test', true],
				['https://x.bücher.example.test', 'https://＊.bücher.example.test', false],
				['https://127.0.0.1', 'https://127.1', false],
				['https://[::1]:8443', 'https://[::1]:*', true],
			] as const;

			assert.deepStrictEqual(
				cases.map(([url, pattern]) => ({
					string: testUrlMatchesGlob(url, pattern),
					uri: testUrlMatchesGlob(URI.parse(url), pattern),
				})),
				cases.map(([, , expected]) => ({ string: expected, uri: expected }))
			);
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
