/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { StopWatch } from '../../../../../../../base/common/stopwatch.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { extractUrlPatterns, getMatchingPattern, getPatternLabel, isUrlApproved, IUrlApprovalSettings } from '../../../../common/tools/builtinTools/chatUrlFetchingPatterns.js';

suite('Chat URL effective path approval', () => {
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

	test('review encoded HTTP hostname exclusions match the effective hostname', () => {
		const cases = [
			['https://%2570rivate.example.test/secret', 'https://private.example.test'],
			['https://x.b%25C3%25BCcher.example.test/private', 'https://*.xn--bcher-kva.example.test'],
		];
		assert.deepStrictEqual(cases.map(([url, pattern]) => {
			const uri = URI.parse(url);
			const rules = { [pattern]: false, 'https://*.example.test': true };
			return [isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false), getMatchingPattern(uri, rules)];
		}), cases.map(([, pattern]) => [false, false, pattern]));
	});

	test('review encoded hostname normalization preserves custom schemes and wildcard syntax', () => {
		assert.deepStrictEqual([
			isUrlApproved(URI.parse('custom://%2570rivate.example.test/resource'), { 'custom://private.example.test': true }, true),
			isUrlApproved(URI.parse('https://unrelated.example.test/resource'), { 'https://%252a.example.test': true }, true),
		], [false, false]);
	});

	test('review effective user information cannot grant hostname-based approvals or patterns', () => {
		const urls = ['https://%5C/user@api.github.com/private', 'https://user@api.github.com/private'];
		const rules = { 'https://*.github.com': true };
		assert.deepStrictEqual(urls.map(url => {
			const uri = URI.parse(url);
			return {
				request: isUrlApproved(uri, rules, true),
				response: isUrlApproved(uri, rules, false),
				matching: getMatchingPattern(uri, rules),
				patterns: extractUrlPatterns(uri),
				all: [isUrlApproved(uri, { '*': true }, true), isUrlApproved(uri, { '*': true }, false), getMatchingPattern(uri, { '*': true })],
			};
		}), urls.map(() => ({ request: false, response: false, matching: undefined, patterns: [], all: [true, true, '*'] })));
	});

	test('review unreserved path equivalence preserves reserved and deeper escapes', () => {
		const rules = { 'https://example.test/private/*': false, 'https://example.test': true };
		const cases = [
			['https://example.test/%2570rivate/secret', false],
			['https://example.test/%2570%2572ivate/secret', false],
			['https://example.test/private%252fsecret', true],
			['https://example.test/private%255csecret', true],
			['https://example.test/%252570rivate/secret', true],
			['https://example.test/allowed/%252e%252e/private/secret', false],
			['https://example.test/allowed/%25252e%25252e/private/secret', true],
		] as const;
		assert.deepStrictEqual(cases.map(([url]) => {
			const uri = URI.parse(url);
			return [isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)];
		}), cases.map(([, approved]) => [approved, approved]));
	});

	test('review GitHub Unicode exclusions and positive approvals preserve case folding', () => {
		const urls = [
			'https://github.com/owner/repo/wiki/%C3%84',
			'https://github.com/owner/repo/wiki/\u00c4',
			'https://GitHub.com/OWNER/REPO/wiki/%C3%84',
		];
		const pattern = 'https://github.com/owner/repo/wiki/%C3%A4';
		assert.deepStrictEqual(urls.map(url => {
			const uri = URI.parse(url);
			return [
				isUrlApproved(uri, { [pattern]: false, 'https://github.com': true }, true),
				isUrlApproved(uri, { [pattern]: false, 'https://github.com': true }, false),
				isUrlApproved(uri, { [pattern]: true }, true),
			];
		}), urls.map(() => [false, false, true]));
	});

	test('review drive-like HTTP path exclusions agree with the fetched case', () => {
		const upper = URI.parse('https://example.test/public/../C:/Secret');
		const direct = URI.parse('https://example.test/C:/Secret');
		const lower = URI.parse('https://example.test/c:/Secret');
		const rules = { 'https://example.test/c:': false, 'https://example.test': true };
		assert.deepStrictEqual([upper, direct, lower].map(uri => [
			isUrlApproved(uri, rules, true),
			isUrlApproved(uri, rules, false),
		]), [[true, true], [true, true], [false, false]]);
	});

	test('keeps long Unicode scoped approvals within a bounded interactive budget', () => {
		const segment = '\u65e5'.repeat(128);
		const uri = URI.parse(`https://example.test/docs/${segment}/page`);
		const rules: Record<string, boolean> = Object.fromEntries(
			Array.from({ length: 9 }, (_, index) => [`https://example.test/other-${index}/${segment}/*`, true]),
		);
		rules[`https://example.test/docs/${segment}/*`] = true;
		const stopwatch = StopWatch.create();
		const approved = Array.from({ length: 3 }, () => isUrlApproved(uri, rules, true));
		const elapsed = stopwatch.elapsed();
		assert.deepStrictEqual(approved, [true, true, true]);
		assert.ok(elapsed < 500, `Three Unicode-path approval checks took ${elapsed}ms (500ms budget)`);
	});

	for (const pattern of [
		'https://example.test/public/../private/*',
		'https://example.test/public/%2e%2e/private/*',
		'https://example.test/public/%252e%252e/private/*',
		String.raw`https://example.test/public\..\private\*`,
		'example.test/public/../private/*',
		'https://*.test:*/public/../private/*',
	]) {
		test(`configured effective-path exclusion is honored for ${pattern}`, () => {
			const uri = URI.parse('https://example.test/private/secret');
			const rules = { [pattern]: false, 'https://example.test': true };
			assert.deepStrictEqual({
				request: isUrlApproved(uri, rules, true),
				response: isUrlApproved(uri, rules, false),
				pattern: getMatchingPattern(uri, rules),
			}, { request: false, response: false, pattern });
		});
	}

	test('configured effective-path patterns preserve granular fallthrough and positive controls', () => {
		const uri = URI.parse('http://example.test/private%20docs/secret');
		const pattern = 'example.test/public/../private%20docs/*';
		const rules: Record<string, boolean | IUrlApprovalSettings>[] = [
			{ [pattern]: { approveRequest: false }, 'http://example.test': true },
			{ [pattern]: { approveResponse: false }, 'http://example.test': true },
			{ [pattern]: true },
		];
		assert.deepStrictEqual(
			rules.map(approved => [isUrlApproved(uri, approved, true), isUrlApproved(uri, approved, false)]),
			[[false, true], [true, false], [true, true]],
		);
	});

	test('configured effective-path patterns preserve escaped data and non-HTTP controls', () => {
		const pattern = 'https://example.test/public/../private%252f*';
		const rules = { [pattern]: false, 'https://example.test': true };
		assert.deepStrictEqual({
			escaped: isUrlApproved(URI.parse('https://example.test/private%252fsecret'), rules, true),
			separator: isUrlApproved(URI.parse('https://example.test/private/secret'), rules, true),
			schemelessCustom: isUrlApproved(URI.parse('custom://example.test/private/secret'), { 'example.test/public/../private/*': true }, true),
			customPath: isUrlApproved(URI.parse('custom://example.test/public/../private/secret'), { 'custom://example.test/public/*': true }, true),
		}, {
			escaped: false,
			separator: true,
			schemelessCustom: false,
			customPath: true,
		});
	});

	test('combined IDN and effective path matching honors encoded path exclusions', () => {
		const hosts = ['x.xn--bcher-kva.example.test', 'x.b\u00fccher.example.test'];
		const rules = {
			'https://*.b\u00fccher.example.test/private%20docs/*': false,
			'https://*.example.test': true,
		};
		assert.deepStrictEqual(hosts.map(host => {
			const uri = URI.parse(`https://${host}/public/../private%20docs/secret`);
			return [isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)];
		}), hosts.map(() => [false, false]));
	});

	test('combined IDN and effective path matching preserves scoped approvals', () => {
		const hosts = ['x.xn--bcher-kva.example.test', 'x.b\u00fccher.example.test'];
		const rules = { 'https://*.b\u00fccher.example.test/allowed%20docs/*': true };
		assert.deepStrictEqual(hosts.map(host => {
			const uri = URI.parse(`https://${host}/public/../allowed%20docs/page`);
			return [isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)];
		}), hosts.map(() => [true, true]));
	});

	for (const path of ['private%20docs', '%E6%97%A5%E6%9C%AC%E8%AA%9E', 'report%7B2024%7D', 'file%3Fpart%23part']) {
		test(`review regression: preserves encoded path exclusion ${path}`, () => {
			const uri = URI.parse(`https://example.test/${path}/secret`);
			const rules = { [`https://example.test/${path}/*`]: false, 'https://example.test': true };
			assert.deepStrictEqual([isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)], [false, false]);
		});

		test(`review regression: generated encoded path approval sticks for ${path}`, () => {
			const uri = URI.parse(`https://example.test/${path}/page`);
			const pattern = extractUrlPatterns(uri)[0];
			const rules = { [pattern]: true };
			assert.deepStrictEqual({
				request: isUrlApproved(uri, rules, true),
				response: isUrlApproved(uri, rules, false),
				match: getMatchingPattern(uri, rules),
			}, { request: true, response: true, match: pattern });
		});
	}

	test('review regression: preserves exact hostname exclusions before wildcard approvals', () => {
		const uri = URI.parse('https://PRIVATE.example.test/secret');
		const rules = { 'https://private.example.test': false, 'https://*.example.test': true };
		assert.deepStrictEqual([isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)], [false, false]);
	});

	test('review regression: GitHub path case folding preserves encoded path rules', () => {
		const uri = URI.parse('https://GitHub.com/Microsoft/%E6%97%A5%E6%9C%AC%E8%AA%9E/page');
		const pattern = 'https://github.com/microsoft/%E6%97%A5%E6%9C%AC%E8%AA%9E/*';
		assert.deepStrictEqual([
			isUrlApproved(uri, { [pattern]: true }, true),
			isUrlApproved(uri, { [pattern]: true }, false),
			isUrlApproved(uri, { [pattern]: false, 'https://github.com': true }, true),
			isUrlApproved(uri, { [pattern]: false, 'https://github.com': true }, false),
		], [true, true, false, false]);
	});

	test('review regression: does not decode escaped data into a path boundary', () => {
		const uri = URI.parse('https://example.test/allowed/private%252fsecret');
		const rules = { 'https://example.test/allowed/private/*': false, 'https://example.test/allowed/*': true };
		assert.deepStrictEqual([isUrlApproved(uri, rules, true), isUrlApproved(uri, rules, false)], [true, true]);
	});

	for (const path of ['private%252fsecret', 'percent%2525value', 'value%2541', 'dots%252evalue', 'private%255csecret', 'private%20docs', '%E6%97%A5%E6%9C%AC%E8%AA%9E']) {
		test(`review regression: generated pattern preserves the URI round trip for ${path}`, () => {
			const uri = URI.parse(`https://example.test/allowed/${path}`);
			const pattern = extractUrlPatterns(uri)[0];
			const rules = { [pattern]: true };
			const destination = new URL(uri.toString(true)).href;
			assert.deepStrictEqual({
				request: isUrlApproved(uri, rules, true),
				response: isUrlApproved(uri, rules, false),
				patternDestination: new URL(URI.parse(pattern).toString(true)).href,
				label: getPatternLabel(uri, pattern),
			}, {
				request: true,
				response: true,
				patternDestination: destination,
				label: destination.slice('https://'.length),
			});
		});
	}

	for (const { name, url } of traversalCases) {
		test(`does not approve requests or responses escaping via ${name}`, () => {
			const rules: Record<string, boolean | IUrlApprovalSettings>[] = [
				{ [`${wiki}/*`]: true },
				{ [`${wiki}/*`]: { approveRequest: true, approveResponse: true } },
			];
			const uri = URI.parse(url);
			assert.deepStrictEqual(
				rules.map(approved => ({
					request: isUrlApproved(uri, approved, true),
					response: isUrlApproved(uri, approved, false),
					pattern: getMatchingPattern(uri, approved),
				})),
				rules.map(() => ({ request: false, response: false, pattern: undefined }))
			);
		});
	}

	test('honors path denials after normalization without losing granular fallthrough', () => {
		const uri = URI.parse(`${wiki}/topics/../private/secret`);
		const rules: Record<string, boolean | IUrlApprovalSettings>[] = [
			{ [`${wiki}/private/*`]: false, [`${wiki}/*`]: true },
			{ [`${wiki}/private/*`]: { approveRequest: false }, [`${wiki}/*`]: true },
			{ [`${wiki}/private/*`]: { approveResponse: false }, [`${wiki}/*`]: true },
		];
		assert.deepStrictEqual(
			rules.map(approved => [isUrlApproved(uri, approved, true), isUrlApproved(uri, approved, false)]),
			[[false, false], [false, true], [true, false]]
		);
	});

	test('does not approve paths escaping through browser-trimmed trailing whitespace', () => {
		const urls = [
			'https://example.test/allowed/.. ',
			'https://example.test/allowed/..%20',
			'https://example.test/allowed/..\u0000',
			'https://example.test/allowed/..%00',
		];
		const approved = { 'https://example.test/allowed/*': true };
		assert.deepStrictEqual(
			urls.map(url => {
				const uri = URI.parse(url);
				return {
					destination: new URL(uri.toString(true)).pathname,
					request: isUrlApproved(uri, approved, true),
					response: isUrlApproved(uri, approved, false),
				};
			}),
			urls.map(() => ({ destination: '/', request: false, response: false }))
		);
	});

	test('preserves path whitespace before a query or fragment', () => {
		const urls = [
			'https://example.test/allowed/..%20?keep=true',
			'https://example.test/allowed/..%20#fragment',
		];
		const approved = { 'https://example.test/allowed/*': true };
		assert.deepStrictEqual(
			urls.map(url => {
				const uri = URI.parse(url);
				return {
					destination: new URL(uri.toString(true)).pathname,
					request: isUrlApproved(uri, approved, true),
					response: isUrlApproved(uri, approved, false),
				};
			}),
			urls.map(() => ({ destination: '/allowed/..%20', request: true, response: true }))
		);
	});

	test('approves a canonical allowed path reached through in-scope dots', () => {
		const uri = URI.parse(`${wiki}/topics/../home`);
		const approved = { [`${wiki}/home`]: true };
		assert.deepStrictEqual({
			request: isUrlApproved(uri, approved, true),
			response: isUrlApproved(uri, approved, false),
			pattern: getMatchingPattern(uri, approved),
		}, { request: true, response: true, pattern: `${wiki}/home` });
	});

	test('offers approval patterns for the effective path with query and fragment intact', () => {
		const uri = URI.parse(String.raw`${wiki}/../../../attacker/repo/wiki/Home?next=\folder\..\child#..\part`);
		assert.deepStrictEqual(extractUrlPatterns(uri), [
			String.raw`https://github.com/attacker/repo/wiki/home?next=\folder\..\child#..\part`,
			'https://github.com',
			'https://github.com/attacker/repo/wiki',
			'https://github.com/attacker/repo',
			'https://github.com/attacker',
		]);
	});

	test('preserves ordinary controls and the first defined matching rule', () => {
		const cases: { url: string; rules: Record<string, boolean | IUrlApprovalSettings>; approved: boolean }[] = [
			{ url: `${wiki}/Home`, rules: { [`${wiki}/*`]: true }, approved: true },
			{ url: 'https://github.com/attacker/repo/wiki/Home', rules: { [`${wiki}/*`]: true }, approved: false },
			{ url: `${wiki}/Home?next=../../../outside#../outside`, rules: { [`${wiki}/*`]: true }, approved: true },
			{ url: `${wiki}/private/secret`, rules: { [`${wiki}/*`]: true, [`${wiki}/private/*`]: false }, approved: true },
			{ url: `${wiki}/private/secret`, rules: { [`${wiki}/*`]: false, [`${wiki}/private/*`]: true }, approved: false },
			{ url: 'http://api.example.test:8123/docs/home', rules: { 'http://*.example.test:*/docs/*': true }, approved: true },
			{ url: 'custom://example.test/allowed/../private', rules: { 'custom://example.test/allowed/*': true }, approved: true },
		];
		assert.deepStrictEqual(
			cases.map(({ url, rules }) => [isUrlApproved(URI.parse(url), rules, true), isUrlApproved(URI.parse(url), rules, false)]),
			cases.map(({ approved }) => [approved, approved])
		);
	});
});
