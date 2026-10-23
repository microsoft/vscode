/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isURLDomainTrusted, normalizeURL } from '../../common/trustedDomains.js';
import { normalizeURLPathSeparators, testUrlMatchesGlob } from '../../common/urlGlob.js';

suite('URL effective path normalization', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const wiki = 'https://github.com/microsoft/vscode/wiki';
	const traversalCases = [
		{ name: 'raw dots', url: `${wiki}/../../../attacker/repo/wiki/Home` },
		{ name: 'encoded dots', url: `${wiki}/%2e%2e/%2E%2E/.%2e/attacker/repo/wiki/Home` },
		{ name: 'encoded slashes', url: `${wiki}/..%2f..%2F..%2fattacker/repo/wiki/Home` },
		{ name: 'encoded backslashes', url: `${wiki}/..%5c..%5C..%5cattacker/repo/wiki/Home` },
		{ name: 'literal backslashes', url: String.raw`${wiki}\..\..\..\attacker\repo\wiki\Home` },
		{ name: 'browser-encoded dots', url: `${wiki}/%252e%252e/%252e%252e/%252e%252e/attacker/repo/wiki/Home` },
	];

	test('review authority controls preserve the original destination before path resolution', () => {
		const controls = ['%09', '%0D', '%0A', '\t', '\r', '\n'];
		assert.deepStrictEqual(controls.map(control => {
			const uri = URI.parse(`https://${control}\\trusted.example/../evil.example/private?token=fixture`);
			const normalized = normalizeURLPathSeparators(uri);
			return {
				original: new URL(uri.toString(true)).href,
				normalized: new URL(normalized.toString(true)).href,
				repeated: new URL(normalizeURLPathSeparators(normalized).toString(true)).href,
			};
		}), controls.map(() => ({
			original: 'https://trusted.example/evil.example/private?token=fixture',
			normalized: 'https://trusted.example/evil.example/private?token=fixture',
			repeated: 'https://trusted.example/evil.example/private?token=fixture',
		})));
	});

	test('review HTTP drive-like paths retain case through normalization and serialization', () => {
		const uri = URI.parse('https://example.test/public/../C:/Secret');
		const normalized = normalizeURLPathSeparators(uri);
		assert.deepStrictEqual({
			original: new URL(uri.toString(true)).href,
			normalized: new URL(normalized.toString(true)).href,
			repeated: new URL(normalizeURLPathSeparators(normalized).toString(true)).href,
			upperTrust: isURLDomainTrusted(uri, ['https://example.test/C:/*']),
			lowerTrust: isURLDomainTrusted(uri, ['https://example.test/c:/*']),
		}, {
			original: 'https://example.test/C:/Secret',
			normalized: 'https://example.test/C:/Secret',
			repeated: 'https://example.test/C:/Secret',
			upperTrust: true,
			lowerTrust: false,
		});
	});

	test('review trusted patterns preserve literal escaped data across normalization', () => {
		const cases = [
			['https://example.test/percent%2525value/page', 'https://example.test/percent%2525value/page', true],
			['https://example.test/allowed/private%252fsecret/file', 'https://example.test/allowed/private%252fsecret/*', true],
			['https://example.test/allowed/private/secret/file', 'https://example.test/allowed/private%252fsecret/*', false],
			['https://api.example.test:8443/allowed/private%252fsecret/file', 'https://*.example.test:*/allowed/private%252fsecret/*', true],
		] as const;
		assert.deepStrictEqual(
			cases.map(([url, pattern]) => isURLDomainTrusted(URI.parse(url), [pattern])),
			cases.map(([, , expected]) => expected),
		);
	});

	test('review GitHub Unicode trust folds characters without decoding escaped separators', () => {
		assert.deepStrictEqual([
			isURLDomainTrusted(URI.parse('https://github.com/owner/repo/wiki/%C3%84'), ['https://github.com/owner/repo/wiki/%C3%A4']),
			isURLDomainTrusted(URI.parse('https://example.test/wiki/%C3%84'), ['https://example.test/wiki/%C3%A4']),
			isURLDomainTrusted(URI.parse('https://github.com/owner/repo/wiki/private%252fsecret'), ['https://github.com/owner/repo/wiki/private/secret']),
			isURLDomainTrusted(URI.parse('https://github.com/owner/repo/wiki/private%252fsecret'), ['https://github.com/owner/repo/wiki/private%252fsecret']),
			isURLDomainTrusted(URI.parse('https://github.com/owner/repo/wiki/%25C3%2584'), ['https://github.com/owner/repo/wiki/%C3%A4']),
			isURLDomainTrusted(URI.parse('https://github.com/owner/repo/wiki/%2525C3%252584'), ['https://github.com/owner/repo/wiki/%C3%A4']),
		], [true, false, false, true, true, false]);
	});

	test('review effective user information requires explicit trust-all', () => {
		const urls = [
			'https://%5C/user@api.github.com/private',
			'https://%5C/user@sub.localhost/private',
			'https://user@api.github.com/private',
		];
		assert.deepStrictEqual(urls.map(url => {
			const uri = URI.parse(url);
			return [isURLDomainTrusted(uri, []), isURLDomainTrusted(uri, ['https://*.github.com']), isURLDomainTrusted(uri, ['*'])];
		}), urls.map(() => [false, false, true]));
	});

	test('review regression: decoded authority slashes cannot grant localhost or domain trust', () => {
		assert.deepStrictEqual(['%2F', '%2f'].map(separator => ({
			localhost: isURLDomainTrusted(URI.parse(`https://evil.example${separator}.localhost/collect`), []),
			domain: isURLDomainTrusted(URI.parse(`https://evil.example${separator}.github.com/collect`), ['https://*.github.com']),
		})), [
			{ localhost: false, domain: false },
			{ localhost: false, domain: false },
		]);
	});

	const authorityCases = [
		String.raw`https://\trusted.example/../evil.example/private`,
		String.raw`https://\\trusted.example/../evil.example/private`,
		'https://%2Ftrusted.example/../evil.example/private',
		'https://%5C%5Ctrusted.example/../evil.example/private',
		String.raw`https://EXAMPLE.test\CaseSensitive/Resource?query=\Value#\Fragment`,
		String.raw`https://example.test\path`,
	];
	for (const url of authorityCases) {
		test(`review regression: preserves the serialized destination of ${url}`, () => {
			const uri = URI.parse(url);
			const normalized = normalizeURLPathSeparators(uri);
			const destination = new URL(uri.toString(true));
			assert.deepStrictEqual({
				authority: normalized.authority,
				destination: new URL(normalized.toString(true)).href,
				repeated: normalizeURLPathSeparators(normalized).toString(true),
			}, {
				authority: destination.host,
				destination: destination.href,
				repeated: normalized.toString(true),
			});
		});
	}

	test('review regression: preserves case-insensitive host and GitHub path trust', () => {
		assert.deepStrictEqual([
			isURLDomainTrusted(URI.parse('https://GitHub.com/Microsoft/vscode'), ['https://github.com/microsoft/vscode']),
			isURLDomainTrusted(URI.parse('https://WWW.Microsoft.COM/en-us'), ['https://*.microsoft.com']),
			isURLDomainTrusted(URI.parse('https://Docs.Example.com/a'), ['https://Docs.Example.com']),
		], [true, true, true]);
	});

	test('review regression: canonical encoded paths match equivalent glob paths', () => {
		const paths = ['private%20docs', '%E6%97%A5%E6%9C%AC%E8%AA%9E', 'report%7B2024%7D', 'file%3Fpart%23part'];
		assert.deepStrictEqual(paths.map(path => testUrlMatchesGlob(
			normalizeURLPathSeparators(URI.parse(`https://example.test/${path}/secret`)),
			`https://example.test/${path}/*`,
		)), paths.map(() => true));
	});

	for (const { name, url } of traversalCases) {
		test(`rejects ${name} leaving the trusted path`, () => {
			const uri = URI.parse(url);
			const destination = new URL(uri.toString(true));
			const normalized = normalizeURLPathSeparators(uri);
			assert.deepStrictEqual({
				host: destination.hostname,
				path: destination.pathname,
				stringMatch: testUrlMatchesGlob(normalized.toString(true), `${wiki}/*`),
				uriMatch: testUrlMatchesGlob(normalized, `${wiki}/*`),
				trusted: isURLDomainTrusted(uri, [`${wiki}/*`]),
			}, {
				host: 'github.com',
				path: '/attacker/repo/wiki/Home',
				stringMatch: false,
				uriMatch: false,
				trusted: false,
			});
		});
	}

	test('matches a normalized allowed path reached through dot segments', () => {
		const url = `${wiki}/topics/../home`;
		assert.deepStrictEqual({
			match: testUrlMatchesGlob(normalizeURLPathSeparators(URI.parse(url)), `${wiki}/home`),
			trusted: isURLDomainTrusted(URI.parse(url), [`${wiki}/home`]),
		}, { match: true, trusted: true });
	});

	test('normalizes trusted-domain paths without changing raw glob syntax or wildcard ports', () => {
		const url = 'http://api.example.test:8123/reports/latest';
		const pattern = 'http://*.example.test:*/docs/../reports/*';
		assert.deepStrictEqual({
			rawMatch: testUrlMatchesGlob(url, pattern),
			match: testUrlMatchesGlob(url, normalizeURL(pattern)),
			trusted: isURLDomainTrusted(URI.parse(url), [pattern]),
		}, { rawMatch: false, match: true, trusted: true });
	});

	test('normalizes a terminal dot before matching a required path suffix', () => {
		assert.strictEqual(testUrlMatchesGlob(`${wiki}/topics/../.`, `${wiki}/*`), false);
	});

	test('preserves empty segments and treats drive-like segments as URL paths', () => {
		assert.strictEqual(
			normalizeURL('http://example.test/a//topic/../C:/../home'),
			'http://example.test/a//home'
		);
	});

	test('preserves query and fragment values while normalizing the path', () => {
		const url = URI.from({
			scheme: 'https',
			authority: 'example.test',
			path: '/allowed/topic/../home',
			query: String.raw`next=\folder\..\child&value=%2e%2e`,
			fragment: String.raw`/..\part%2f`,
		});
		assert.strictEqual(normalizeURL(url), url.with({ path: '/allowed/home' }).toString(true));
	});

	test('preserves escaped path data when normalizing backslash separators', () => {
		const urls = [
			URI.parse(String.raw`https://example.test/allowed/%252e%252e%252fprivate\file`),
			URI.parse(String.raw`https://example.test\allowed/%252e%252e%252fprivate\file`),
		];
		assert.deepStrictEqual(
			urls.map(url => normalizeURLPathSeparators(url).path),
			urls.map(url => new URL(url.toString(true)).pathname)
		);
	});

	test('preserves ordinary in-scope and out-of-scope wildcard controls', () => {
		const cases = [
			{ url: `${wiki}/Home`, pattern: `${wiki}/*`, matches: true },
			{ url: 'https://github.com/attacker/repo/wiki/Home', pattern: `${wiki}/*`, matches: false },
			{ url: `${wiki}Extra/Home`, pattern: `${wiki}/*`, matches: false },
			{ url: `${wiki}/Home?next=/../../../outside#../outside`, pattern: `${wiki}/*`, matches: true },
			{ url: 'https://api.example.test:8443/docs/v1/index.html', pattern: 'https://*.example.test:*/docs/*/index*', matches: true },
			{ url: 'http://example.test/docs/v1/index.html', pattern: '*.example.test:*/docs/*/index*', matches: true },
			{ url: 'https://api.example.test/docs/v1/index.html', pattern: '*.example.test:*/docs/*/index*', matches: true },
			{ url: 'https://example.test/outside', pattern: 'https://example.test:*/docs/*', matches: false },
		];
		assert.deepStrictEqual(
			cases.map(({ url, pattern }) => testUrlMatchesGlob(url, pattern)),
			cases.map(({ matches }) => matches)
		);
	});

	test('preserves rejection of wildcard scheme patterns', () => {
		assert.throws(() => testUrlMatchesGlob('https://example.test/docs/home', '*://example.test/docs/*'), /Scheme contains illegal characters/);
	});

	test('does not reinterpret non-HTTP paths or escaped separator data', () => {
		const urls = [
			URI.parse(String.raw`file:///c:/allowed/../private\resource?query=\value#..\part`),
			URI.parse(String.raw`custom://example.test/allowed/../private\resource?query=\value#..\part`),
			URI.parse('https://example.test/allowed/%252e%252e%252fprivate'),
		];
		assert.deepStrictEqual(
			urls.map(url => normalizeURLPathSeparators(normalizeURLPathSeparators(url)).toString(true)),
			urls.map(url => url.toString(true))
		);
	});

	test('preserves userinfo and authorityless trust restrictions and explicit trust-all', () => {
		const urls = [
			URI.parse(`${wiki.replace('github.com', 'user@github.com')}/../private`),
			URI.parse(String.raw`https:\github.com\microsoft\vscode\wiki\..\private`),
		];
		assert.deepStrictEqual(
			urls.map(url => [
				isURLDomainTrusted(url, [`${wiki}/*`]),
				isURLDomainTrusted(url, ['*']),
			]),
			[[false, true], [false, true]]
		);
	});
});
