/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { normalizeDomain, extractDomainPattern, matchesDomainPattern, extractDomainFromUri, isDomainAllowed } from '../../common/domainMatcher.js';

suite('domainMatcher', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('normalizeDomain', () => {

		test('returns undefined for empty/falsy input', () => {
			assert.deepStrictEqual(
				[normalizeDomain(undefined), normalizeDomain(''), normalizeDomain('  ')],
				[undefined, undefined, undefined]
			);
		});

		test('lowercases and trims', () => {
			assert.strictEqual(normalizeDomain('  Example.COM  '), 'example.com');
		});

		test('strips user info', () => {
			assert.strictEqual(normalizeDomain('user@example.com'), 'example.com');
		});

		test('strips port', () => {
			assert.strictEqual(normalizeDomain('example.com:8080'), 'example.com');
		});

		test('strips trailing dots', () => {
			assert.strictEqual(normalizeDomain('example.com..'), 'example.com');
		});

		test('rejects paths', () => {
			assert.strictEqual(normalizeDomain('example.com/path'), undefined);
		});

		test('rejects . and ..', () => {
			assert.deepStrictEqual(
				[normalizeDomain('.'), normalizeDomain('..')],
				[undefined, undefined]
			);
		});

		test('accepts bare wildcard', () => {
			assert.strictEqual(normalizeDomain('*'), '*');
		});

		test('accepts wildcard prefix', () => {
			assert.strictEqual(normalizeDomain('*.example.com'), '*.example.com');
		});

		test('strips trailing punctuation', () => {
			assert.strictEqual(normalizeDomain('example.com,'), 'example.com');
			assert.strictEqual(normalizeDomain('example.com;'), 'example.com');
			assert.strictEqual(normalizeDomain('example.com)'), 'example.com');
		});

		test('rejects file-extension-like TLDs when not from URL', () => {
			assert.strictEqual(normalizeDomain('foo.js'), undefined);
			assert.strictEqual(normalizeDomain('foo.json'), undefined);
			assert.strictEqual(normalizeDomain('foo.ts'), undefined);
		});

		test('allows file-extension-like TLDs when fromUrl is true', () => {
			assert.strictEqual(normalizeDomain('foo.js', true), 'foo.js');
		});

		test('rejects invalid characters', () => {
			assert.strictEqual(normalizeDomain('exam ple.com'), undefined);
			assert.strictEqual(normalizeDomain('example!.com'), undefined);
		});

		test('handles complex valid domains', () => {
			assert.strictEqual(normalizeDomain('sub.domain.example.com'), 'sub.domain.example.com');
		});
	});

	suite('extractDomainPattern', () => {

		test('returns trimmed input when no scheme', () => {
			assert.strictEqual(extractDomainPattern('  example.com  '), 'example.com');
		});

		test('returns bare wildcard as-is', () => {
			assert.strictEqual(extractDomainPattern('*'), '*');
		});

		test('extracts authority from URL', () => {
			assert.strictEqual(extractDomainPattern('https://example.com/path'), 'example.com');
		});

		test('extracts authority with port from URL', () => {
			assert.strictEqual(extractDomainPattern('http://example.com:8080/path'), 'example.com:8080');
		});
	});

	suite('matchesDomainPattern', () => {

		test('exact match', () => {
			assert.strictEqual(matchesDomainPattern('example.com', 'example.com'), true);
			assert.strictEqual(matchesDomainPattern('example.com', 'other.com'), false);
		});

		test('case insensitive', () => {
			assert.strictEqual(matchesDomainPattern('example.com', 'Example.COM'), true);
		});

		test('bare wildcard matches anything', () => {
			assert.strictEqual(matchesDomainPattern('example.com', '*'), true);
			assert.strictEqual(matchesDomainPattern('anything.test', '*'), true);
		});

		test('wildcard prefix matches subdomains', () => {
			assert.strictEqual(matchesDomainPattern('sub.example.com', '*.example.com'), true);
			assert.strictEqual(matchesDomainPattern('deep.sub.example.com', '*.example.com'), true);
			assert.strictEqual(matchesDomainPattern('example.com', '*.example.com'), true);
		});

		test('wildcard prefix does not match unrelated domains', () => {
			assert.strictEqual(matchesDomainPattern('notexample.com', '*.example.com'), false);
		});

		test('matches domain from URL pattern', () => {
			assert.strictEqual(matchesDomainPattern('example.com', 'https://example.com/page'), true);
		});

		test('returns false for invalid pattern', () => {
			assert.strictEqual(matchesDomainPattern('example.com', ''), false);
		});
	});

	suite('extractDomainFromUri', () => {

		test('extracts domain from https URI', () => {
			assert.strictEqual(extractDomainFromUri(URI.parse('https://example.com/path')), 'example.com');
		});

		test('strips port', () => {
			assert.strictEqual(extractDomainFromUri(URI.parse('https://example.com:443/path')), 'example.com');
		});

		test('returns undefined for empty authority', () => {
			assert.strictEqual(extractDomainFromUri(URI.from({ scheme: 'file', path: '/tmp/test' })), undefined);
		});
	});

	suite('isDomainAllowed', () => {

		test('denies everything when both lists empty', () => {
			assert.strictEqual(isDomainAllowed('example.com', [], []), false);
		});

		test('denied takes precedence over allowed', () => {
			assert.strictEqual(isDomainAllowed('evil.com', ['*.com'], ['evil.com']), false);
		});

		test('allowed list restricts to matching domains', () => {
			assert.strictEqual(isDomainAllowed('example.com', ['example.com'], []), true);
			assert.strictEqual(isDomainAllowed('other.com', ['example.com'], []), false);
		});

		test('deny-only config allows non-denied domains', () => {
			assert.strictEqual(isDomainAllowed('good.com', [], ['evil.com']), true);
			assert.strictEqual(isDomainAllowed('evil.com', [], ['evil.com']), false);
		});

		test('wildcard allowed with specific deny', () => {
			assert.strictEqual(isDomainAllowed('safe.com', ['*'], ['evil.com']), true);
			assert.strictEqual(isDomainAllowed('evil.com', ['*'], ['evil.com']), false);
		});

		test('wildcard deny blocks everything', () => {
			assert.strictEqual(isDomainAllowed('example.com', ['example.com'], ['*']), false);
		});

		test('subdomain matching in allow/deny', () => {
			assert.strictEqual(isDomainAllowed('api.example.com', ['*.example.com'], []), true);
			assert.strictEqual(isDomainAllowed('api.example.com', [], ['*.example.com']), false);
		});
	});
});
