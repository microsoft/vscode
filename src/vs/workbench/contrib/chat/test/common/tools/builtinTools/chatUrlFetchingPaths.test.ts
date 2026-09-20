/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
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
